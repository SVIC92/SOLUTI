"""Generación Automática de Documentación (plan `2.txt`, módulo 6): convierte la
resolución de un ticket complejo en un borrador de artículo para la Base de
Conocimiento. SIEMPRE nace como borrador (`isPublished: false` en el core,
`ai_kb_drafts.status = 'pending_review'` aquí) — un ADMIN/TECHNICIAN debe
revisarlo y publicarlo manualmente, nunca se autopublica.

Solo se genera para tickets "complejos" (con una resolución de cierta extensión
y al menos una interacción real) para no llenar la Base de Conocimiento de
borradores triviales; y solo si no existe ya un artículo publicado casi idéntico
(chequeo de duplicados vía similitud de embedding).
"""
from __future__ import annotations

import logging

from sqlalchemy import text

from app.core.backend_client import create_kb_draft_article
from app.core.db import get_session
from app.core.embeddings import embed_text
from app.core.llm_client import LlmUnavailableError, generate_structured
from app.core.security import redact_pii

logger = logging.getLogger("ai-service.kb_generator")

MIN_RESOLUTION_LENGTH = 80  # caracteres del último comentario, para considerar la resolución "sustancial"
MIN_COMMENT_COUNT = 2  # al menos algo de interacción, no un ticket resuelto sin explicación
DUPLICATE_DISTANCE_THRESHOLD = 0.15  # distancia coseno — por debajo, se considera ya documentado

KB_ARTICLE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Título breve, genérico y reutilizable (sin nombres de usuarios)"},
        "body": {
            "type": "string",
            "description": (
                "Guía paso a paso para resolver este tipo de problema, redactada de forma "
                "general (no ligada a este ticket ni a la persona que lo reportó)"
            ),
        },
    },
    "required": ["title", "body"],
}

SYSTEM_PROMPT = (
    "Eres un redactor técnico que convierte resoluciones de tickets de soporte TI en "
    "artículos reutilizables para una Base de Conocimiento. Generaliza el problema y la "
    "solución: elimina nombres de personas, tickets o detalles específicos de un caso "
    "puntual. Responde en español, en tono claro y profesional, conforme al schema pedido."
)


async def _fetch_ticket_context(ticket_id: str) -> dict | None:
    # ids de Prisma (`tickets.id`, `comments.ticket_id`, `categories.id`) son
    # TEXT, no uuid nativo — sin CAST, ver migrations/001_pgvector_and_ai_tables.sql.
    async with get_session() as session:
        ticket_row = await session.execute(
            text(
                """
                SELECT t.title, t.description, t.category_id, c.name AS category_name
                FROM tickets t
                JOIN categories c ON c.id = t.category_id
                WHERE t.id = :id
                """
            ),
            {"id": ticket_id},
        )
        ticket = ticket_row.mappings().first()
        if not ticket:
            return None

        comments_row = await session.execute(
            text("SELECT body FROM comments WHERE ticket_id = :id ORDER BY created_at ASC"),
            {"id": ticket_id},
        )
        comments = [row[0] for row in comments_row.all()]

    return {**ticket, "comments": comments}


async def _has_similar_published_article(vector: list[float]) -> bool:
    async with get_session() as session:
        result = await session.execute(
            text(
                """
                SELECT 1
                FROM kb_article_embeddings e
                JOIN knowledge_articles a ON a.id = e.article_id
                WHERE a.is_published = true
                  AND (e.embedding <=> CAST(:vector AS vector)) < :threshold
                LIMIT 1
                """
            ),
            {"vector": vector, "threshold": DUPLICATE_DISTANCE_THRESHOLD},
        )
        return result.first() is not None


async def _store_article_embedding(article_id: str, vector: list[float], model_name: str) -> None:
    async with get_session() as session:
        await session.execute(
            text(
                """
                INSERT INTO kb_article_embeddings (article_id, embedding, embedding_model)
                VALUES (:article_id, CAST(:embedding AS vector), :model)
                ON CONFLICT (article_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding, embedding_model = EXCLUDED.embedding_model
                """
            ),
            {"article_id": article_id, "embedding": vector, "model": model_name},
        )
        await session.commit()


async def generate_kb_draft(ticket_id: str) -> dict | None:
    context = await _fetch_ticket_context(ticket_id)
    if not context:
        return None

    comments = context["comments"]
    resolution_note = comments[-1] if comments else ""
    is_complex = len(comments) >= MIN_COMMENT_COUNT and len(resolution_note) >= MIN_RESOLUTION_LENGTH
    if not is_complex:
        logger.info("Ticket %s no cumple el umbral de complejidad; se omite el borrador de KB", ticket_id)
        return None

    full_text = redact_pii(
        f"Título: {context['title']}\nDescripción: {context['description']}\n\n"
        f"Resolución:\n" + "\n".join(comments)
    )

    vector = await embed_text(full_text)
    if await _has_similar_published_article(vector):
        logger.info("Ya existe un artículo publicado similar; se omite el ticket %s", ticket_id)
        return None

    try:
        result = await generate_structured(
            task="kb_generation",
            system_prompt=SYSTEM_PROMPT,
            user_content=full_text,
            json_schema=KB_ARTICLE_SCHEMA,
        )
    except LlmUnavailableError:
        logger.warning("Gemini no disponible; no se generó borrador de KB para el ticket %s", ticket_id)
        return None

    article = await create_kb_draft_article(
        source_ticket_id=ticket_id,
        title=result.data["title"],
        content=result.data["body"],
        category_id=str(context["category_id"]),
    )
    if article and article.get("id"):
        await _store_article_embedding(article["id"], vector, result.model_used)

    return article
