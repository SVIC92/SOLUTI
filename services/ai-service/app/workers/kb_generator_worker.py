"""Worker asíncrono: consume `ticket.resolved` / `ticket.closed` desde Redis
Streams y genera un borrador de artículo para la Base de Conocimiento cuando el
ticket resuelto es lo bastante "complejo" (plan `2.txt`, módulo 6). Se ejecuta
como proceso separado: `python -m app.workers.kb_generator_worker`.
"""
from __future__ import annotations

import asyncio
import logging

from app.core.event_bus import consume_events
from app.modules.kb_generator.generator import generate_kb_draft

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service.kb_generator_worker")

CONSUMER_GROUP = "kb-generator-workers"
_RELEVANT_EVENTS = {"ticket.resolved", "ticket.closed"}


async def main() -> None:
    logger.info("KB generator worker escuchando el stream 'core-events'...")
    async for message_id, event_type, payload in consume_events(CONSUMER_GROUP, "kb-generator-worker-1"):
        if event_type not in _RELEVANT_EVENTS:
            continue

        ticket_id = payload["ticketId"]
        logger.info("Evaluando ticket %s para borrador de KB (mensaje %s)", ticket_id, message_id)

        try:
            article = await generate_kb_draft(ticket_id)
            if article:
                logger.info("Borrador de KB creado para el ticket %s: %s", ticket_id, article.get("id"))
        except Exception:  # noqa: BLE001 - un ticket fallido no debe tumbar el worker
            logger.exception("Fallo generando el borrador de KB para el ticket %s", ticket_id)


if __name__ == "__main__":
    asyncio.run(main())
