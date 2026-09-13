"""Lógica del Copilot: búsqueda semántica (pgvector) sobre tickets ya resueltos +
generación de borrador de respuesta a partir de notas breves del técnico.

El técnico SIEMPRE revisa/edita el borrador antes de enviarlo — nunca se
autoenvía (ver plan de IA, sección 6, módulo 3).
"""
from __future__ import annotations

from sqlalchemy import text

from app.core.db import get_session
from app.core.embeddings import embed_text
from app.core.llm_client import LlmUnavailableError, generate_text
from app.core.security import redact_pii

DRAFT_SYSTEM_PROMPT = (
    "Eres un asistente que ayuda a técnicos de soporte TI a redactar una respuesta "
    "clara y cordial para el usuario final, a partir de notas breves del técnico y, "
    "si existen, de tickets similares ya resueltos. Responde en español, en un tono "
    "profesional y conciso. El técnico revisará y editará tu borrador antes de enviarlo."
)


async def search_similar_tickets(query: str, category_id: str | None = None) -> list[dict]:
    vector = await embed_text(redact_pii(query))
    # `t.id`/`e.ticket_id`/`t.category_id` son todos TEXT (ids de Prisma) — el
    # join y el filtro por categoría nunca deben castear a uuid, ver
    # migrations/001_pgvector_and_ai_tables.sql.
    sql = """
        SELECT t.id, t.code, t.title, e.embedding <=> CAST(:vector AS vector) AS distance
        FROM ai_ticket_embeddings e
        JOIN tickets t ON t.id = e.ticket_id
        WHERE t.status IN ('RESOLVED', 'CLOSED')
          AND (:category_id IS NULL OR t.category_id = :category_id)
        ORDER BY distance ASC
        LIMIT 5
    """
    async with get_session() as session:
        result = await session.execute(text(sql), {"vector": vector, "category_id": category_id})
        rows = result.mappings().all()
        return [dict(row) for row in rows]


async def draft_response(ticket_id: str, technician_notes: str) -> str:
    similar = await search_similar_tickets(technician_notes)
    # Los títulos de tickets similares vienen de datos reales de otros usuarios
    # (pueden contener correos/teléfonos/nombres) — antes solo se redactaban las
    # notas del técnico y estos títulos se enviaban a Gemini tal cual.
    context_lines = "\n".join(f"- {redact_pii(row['title'])}" for row in similar) or "(sin tickets similares aún)"
    user_content = (
        f"Notas del técnico: {redact_pii(technician_notes)}\n\n"
        f"Tickets resueltos similares:\n{context_lines}"
    )
    try:
        return await generate_text(task="copilot_draft", system_prompt=DRAFT_SYSTEM_PROMPT, user_content=user_content)
    except LlmUnavailableError:
        # Antes esta excepción subía sin capturar hasta el router y FastAPI la
        # convertía en un 500 genérico — el resto de módulos (triaje, chatbot,
        # kb_generator) sí degradan con gracia ante este mismo error.
        return (
            "No pude generar un borrador automático en este momento (el asistente de IA "
            "no está disponible). Redacta tu respuesta manualmente."
        )
