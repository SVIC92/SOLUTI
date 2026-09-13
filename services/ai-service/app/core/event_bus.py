"""Bus de eventos asíncrono (Redis Streams) entre el backend Node (productor) y los
workers de ai-service (consumidores). Complementa la vía síncrona REST usada por
el chatbot y el copilot bajo demanda.

Eventos publicados por el core (ver plan, sección 3): ticket.created,
ticket.comment.created, ticket.updated, ticket.assigned, ticket.resolved,
ticket.closed, technician.workload.changed, technician.skills.updated,
cmdb.asset.linked_to_ticket, csat.survey.submitted.
"""
from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import redis.asyncio as redis

from app.config import settings

logger = logging.getLogger("ai-service.event_bus")

STREAM_NAME = "core-events"


def get_redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


async def publish_event(event_type: str, payload: dict[str, Any]) -> None:
    """Usado por tests/herramientas internas; en producción el productor real es el
    backend Node (event-publisher.ts)."""
    client = get_redis()
    await client.xadd(STREAM_NAME, {"type": event_type, "payload": json.dumps(payload)})


async def consume_events(group: str, consumer_name: str) -> AsyncIterator[tuple[str, str, dict[str, Any]]]:
    """Generador que entrega (message_id, event_type, payload) usando un consumer group
    de Redis Streams — permite múltiples workers (triage, embeddings, anomaly) leer el
    mismo stream de forma independiente y con reintentos ante fallos."""
    client = get_redis()
    try:
        await client.xgroup_create(STREAM_NAME, group, id="0", mkstream=True)
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise

    while True:
        response = await client.xreadgroup(group, consumer_name, {STREAM_NAME: ">"}, count=10, block=5000)
        if not response:
            continue
        for _stream, messages in response:
            for message_id, fields in messages:
                event_type = fields.get("type", "")
                payload = json.loads(fields.get("payload", "{}"))
                yield message_id, event_type, payload
                await client.xack(STREAM_NAME, group, message_id)
