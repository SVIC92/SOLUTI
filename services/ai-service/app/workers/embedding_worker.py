"""Worker asíncrono: consume `ticket.resolved` / `ticket.closed` desde Redis
Streams y genera el embedding del ticket para que el Copilot (plan `2.txt`,
módulo 3) pueda encontrarlo en búsquedas semánticas futuras. Sin este worker,
`ai_ticket_embeddings` queda vacía y `search_similar_tickets` nunca devuelve
resultados. Se ejecuta como proceso separado:
`python -m app.workers.embedding_worker`.

El texto embebido combina título + descripción + el último comentario del
ticket (normalmente la explicación de la solución que dejó el técnico), para
que la búsqueda capture no solo el síntoma sino también cómo se resolvió.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text

from app.config import settings
from app.core.db import get_session
from app.core.embeddings import embed_text
from app.core.event_bus import consume_events
from app.core.security import redact_pii

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service.embedding_worker")

CONSUMER_GROUP = "embedding-workers"
_RELEVANT_EVENTS = {"ticket.resolved", "ticket.closed"}


async def _fetch_ticket_context(ticket_id: str) -> str | None:
    # `tickets.id`/`comments.ticket_id` son TEXT en Postgres (Prisma mapea
    # `String @id @default(uuid())` a TEXT, no al tipo nativo `uuid`) — nunca
    # hay que envolver estos parámetros en `CAST(... AS uuid)`, o la comparación
    # falla con "operator does not exist: text = uuid".
    async with get_session() as session:
        ticket_row = await session.execute(
            text("SELECT title, description FROM tickets WHERE id = :id"),
            {"id": ticket_id},
        )
        ticket = ticket_row.mappings().first()
        if not ticket:
            return None

        comment_row = await session.execute(
            text(
                """
                SELECT body FROM comments
                WHERE ticket_id = :id
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {"id": ticket_id},
        )
        last_comment = comment_row.scalar_one_or_none()

    parts = [ticket["title"], ticket["description"]]
    if last_comment:
        parts.append(last_comment)
    return redact_pii("\n".join(parts))


async def _store_embedding(ticket_id: str, vector: list[float]) -> None:
    async with get_session() as session:
        await session.execute(
            text(
                """
                INSERT INTO ai_ticket_embeddings (ticket_id, embedding, embedding_model)
                VALUES (:ticket_id, CAST(:embedding AS vector), :model)
                ON CONFLICT (ticket_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    embedding_model = EXCLUDED.embedding_model,
                    created_at = now()
                """
            ),
            {"ticket_id": ticket_id, "embedding": vector, "model": settings.embedding_model_name},
        )
        await session.commit()


async def main() -> None:
    logger.info("Embedding worker escuchando el stream 'core-events'...")
    async for message_id, event_type, payload in consume_events(CONSUMER_GROUP, "embedding-worker-1"):
        if event_type not in _RELEVANT_EVENTS:
            continue

        ticket_id = payload["ticketId"]
        logger.info("Generando embedding para ticket %s (mensaje %s)", ticket_id, message_id)

        try:
            context_text = await _fetch_ticket_context(ticket_id)
            if not context_text:
                continue

            vector = await embed_text(context_text)
            await _store_embedding(ticket_id, vector)
        except Exception:  # noqa: BLE001 - un ticket fallido no debe tumbar el worker
            logger.exception("Fallo generando el embedding del ticket %s", ticket_id)


if __name__ == "__main__":
    asyncio.run(main())
