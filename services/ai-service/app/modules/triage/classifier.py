"""Triaje y Clasificación Automática de Tickets + Sentimiento/Urgencia
(plan `2.txt`, módulos 1 y 5 — fusionados en una sola llamada LLM para ahorrar costo).

Consumido por app/workers/triage_worker.py al recibir el evento `ticket.created`.
Si la confianza de la clasificación cae por debajo del umbral configurado, el
ticket se marca para revisión manual en vez de auto-enrutarse (ver plan, riesgos).
"""
from __future__ import annotations

import json

from sqlalchemy import text

from app.config import settings
from app.core.db import get_session
from app.core.llm_client import LlmUnavailableError, generate_structured
from app.core.security import redact_pii

CLASSIFICATION_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string"},
        "department": {"type": "string"},
        "priority": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
        "confidence_category": {"type": "number"},
        "confidence_priority": {"type": "number"},
        "sentiment_score": {"type": "number", "description": "-1 (muy negativo) a 1 (muy positivo)"},
        "urgency_score": {"type": "number", "description": "0 (nada urgente) a 1 (crítico)"},
    },
    "required": [
        "category",
        "department",
        "priority",
        "confidence_category",
        "confidence_priority",
        "sentiment_score",
        "urgency_score",
    ],
}

SYSTEM_PROMPT = (
    "Eres un clasificador de tickets de soporte TI. A partir del título y la "
    "descripción, determina la categoría, el departamento responsable, la "
    "prioridad, el sentimiento del usuario y la urgencia percibida. Responde "
    "únicamente conforme al schema JSON solicitado."
)


async def classify_ticket(ticket_id: str, title: str, description: str) -> dict | None:
    """Devuelve el resultado de clasificación y lo persiste en ai_ticket_analysis.
    Devuelve None (modo degradado) si Gemini no responde — el ticket sigue su curso
    normal sin metadatos de IA, tal como especifica el plan."""
    safe_text = redact_pii(f"Título: {title}\nDescripción: {description}")

    try:
        result = await generate_structured(
            task="triage",
            system_prompt=SYSTEM_PROMPT,
            user_content=safe_text,
            json_schema=CLASSIFICATION_SCHEMA,
        )
    except LlmUnavailableError:
        return None

    data = result.data
    low_confidence = (
        data["confidence_category"] < settings.triage_confidence_threshold
        or data["confidence_priority"] < settings.triage_confidence_threshold
    )

    # `ticket_id`/`entity_id` son TEXT (Prisma mapea `String @id @default(uuid())`
    # a TEXT, no al tipo nativo `uuid`) — nunca `CAST(... AS uuid)` aquí, ver
    # migrations/001_pgvector_and_ai_tables.sql.
    async with get_session() as session:
        await session.execute(
            text(
                """
                INSERT INTO ai_ticket_analysis
                    (ticket_id, suggested_category, suggested_department, suggested_priority,
                     confidence_category, confidence_priority, sentiment_score, urgency_score,
                     model_used, prompt_version)
                VALUES
                    (:ticket_id, :category, :department, :priority,
                     :confidence_category, :confidence_priority, :sentiment_score, :urgency_score,
                     :model_used, 'v1')
                ON CONFLICT (ticket_id) DO UPDATE SET
                    suggested_category = EXCLUDED.suggested_category,
                    suggested_department = EXCLUDED.suggested_department,
                    suggested_priority = EXCLUDED.suggested_priority,
                    confidence_category = EXCLUDED.confidence_category,
                    confidence_priority = EXCLUDED.confidence_priority,
                    sentiment_score = EXCLUDED.sentiment_score,
                    urgency_score = EXCLUDED.urgency_score,
                    model_used = EXCLUDED.model_used,
                    processed_at = now()
                """
            ),
            {
                "ticket_id": ticket_id,
                "category": data["category"],
                "department": data["department"],
                "priority": data["priority"],
                "confidence_category": data["confidence_category"],
                "confidence_priority": data["confidence_priority"],
                "sentiment_score": data["sentiment_score"],
                "urgency_score": data["urgency_score"],
                "model_used": result.model_used,
            },
        )
        await session.execute(
            text(
                """
                INSERT INTO ai_decision_log (module, entity_type, entity_id, output, model_used, confidence)
                VALUES ('triage', 'ticket', :ticket_id, CAST(:output AS jsonb), :model_used, :confidence)
                """
            ),
            {
                "ticket_id": ticket_id,
                # Antes: str(data).replace("'", '"') — se rompía en cuanto cualquier
                # valor generado por el LLM (ej. `department`) contuviera un
                # apóstrofe, produciendo JSON inválido y perdiendo (por el rollback
                # automático de la sesión) también el INSERT en ai_ticket_analysis.
                "output": json.dumps(data),
                "model_used": result.model_used,
                "confidence": min(data["confidence_category"], data["confidence_priority"]),
            },
        )
        await session.commit()

    return {**data, "auto_apply": not low_confidence}
