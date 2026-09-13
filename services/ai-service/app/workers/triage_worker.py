"""Worker asíncrono: consume `ticket.created` desde Redis Streams (publicado por
el backend Node vía ai-gateway/event-publisher.ts), clasifica el ticket, decide el
enrutamiento inteligente y escribe el resultado de vuelta en el core.
Se ejecuta como proceso separado: `python -m app.workers.triage_worker`.
"""
from __future__ import annotations

import asyncio
import logging

from app.core.backend_client import push_ticket_classification
from app.core.event_bus import consume_events
from app.modules.triage.classifier import classify_ticket
from app.modules.triage.routing import find_best_technician

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service.triage_worker")

CONSUMER_GROUP = "triage-workers"


async def main() -> None:
    logger.info("Triage worker escuchando el stream 'core-events'...")
    async for message_id, event_type, payload in consume_events(CONSUMER_GROUP, "triage-worker-1"):
        if event_type != "ticket.created":
            continue

        ticket_id = payload["ticketId"]
        logger.info("Clasificando ticket %s (mensaje %s)", ticket_id, message_id)

        try:
            result = await classify_ticket(
                ticket_id=ticket_id,
                title=payload["title"],
                description=payload["description"],
            )
            if result is None:
                # Gemini no respondió (modo degradado): el ticket sigue su curso normal.
                continue

            push_payload: dict = {"aiSentimentScore": result["sentiment_score"]}

            if result["auto_apply"]:
                # Solo se auto-aplica categoría/prioridad/enrutamiento si la confianza
                # supera el umbral configurado (ver classifier.py) — de lo contrario,
                # queda como sugerencia para revisión manual (no se auto-asigna).
                push_payload["aiSuggestedCategory"] = result["category"]
                push_payload["aiSuggestedPriority"] = result["priority"]

                technician_id = await find_best_technician(payload["categoryId"])
                if technician_id:
                    push_payload["autoAssignToId"] = technician_id
            else:
                push_payload["aiSuggestedCategory"] = result["category"]

            await push_ticket_classification(ticket_id, push_payload)
        except Exception:  # noqa: BLE001 - un ticket fallido no debe tumbar el worker
            logger.exception("Fallo procesando el ticket %s", ticket_id)


if __name__ == "__main__":
    asyncio.run(main())
