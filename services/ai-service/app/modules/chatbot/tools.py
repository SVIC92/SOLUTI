"""Whitelist de acciones que el Chatbot Nivel 1 puede ejecutar (plan `2.txt`,
módulo 2). Solo `check_ticket_status` y `search_kb` consultan datos reales del
core; `reset_password`/`unlock_account`/`restart_service` NO tienen una
integración externa real (Azure AD / Okta / Cisco) en este despliegue on-premise,
así que en vez de simular una ejecución que no ocurre, escalan de forma
transparente creando un ticket real para que un técnico lo resuelva — mismo
principio de "nunca inventar una resolución fuera de las herramientas permitidas"
del plan de riesgos/mitigaciones.
"""
from __future__ import annotations

from sqlalchemy import text

from app.core.backend_client import create_ticket_via_service
from app.core.db import get_session

# Mapea cada acción solicitada a la categoría del core más adecuada (por nombre,
# ver seed.ts) y a un título/descr. legible para el ticket de escalamiento.
_ACTION_TO_CATEGORY_NAME = {
    "reset_password": "Cuentas y Accesos",
    "unlock_account": "Cuentas y Accesos",
    "restart_service": "Software",
}

_ACTION_LABELS = {
    "reset_password": "Restablecimiento de contraseña",
    "unlock_account": "Desbloqueo de cuenta",
    "restart_service": "Reinicio de servicio",
}


async def check_ticket_status(ticket_code: str, user_id: str) -> str:
    """Consulta el estado de un ticket del propio usuario (por su código, ej. TCK-000123)."""
    async with get_session() as session:
        result = await session.execute(
            text(
                """
                SELECT code, status, priority, assigned_to_id
                FROM tickets
                WHERE code = :code AND created_by_id = :user_id
                """
            ),
            {"code": ticket_code, "user_id": user_id},
        )
        row = result.mappings().first()

    if not row:
        return f"No encontré ningún ticket con el código {ticket_code} asociado a tu cuenta."

    status_labels = {
        "NEW": "Nuevo",
        "IN_PROGRESS": "En Proceso",
        "ON_HOLD": "En Espera",
        "RESOLVED": "Resuelto",
        "CLOSED": "Cerrado",
    }
    status_label = status_labels.get(row["status"], row["status"])
    assignment = "aún sin asignar a un técnico" if not row["assigned_to_id"] else "ya asignado a un técnico"
    return f"Tu ticket {row['code']} está en estado **{status_label}** ({assignment})."


async def search_kb(query: str) -> str:
    """Busca artículos publicados de la Base de Conocimiento que coincidan con la consulta."""
    async with get_session() as session:
        result = await session.execute(
            text(
                """
                SELECT title
                FROM knowledge_articles
                WHERE is_published = true
                  AND (title ILIKE :pattern OR content ILIKE :pattern)
                ORDER BY updated_at DESC
                LIMIT 3
                """
            ),
            {"pattern": f"%{query}%"},
        )
        rows = result.mappings().all()

    if not rows:
        return "No encontré artículos de la Base de Conocimiento relacionados con tu consulta."

    titles = "\n".join(f"- {row['title']}" for row in rows)
    return f"Encontré estos artículos que podrían ayudarte:\n{titles}"


async def escalate_action(action_type: str, user_id: str, original_message: str) -> str:
    """Acciones sin integración externa real: en vez de simular su ejecución,
    crea un ticket real y transparente sobre lo que sí y no se hizo."""
    category_name = _ACTION_TO_CATEGORY_NAME.get(action_type, "Software")
    label = _ACTION_LABELS.get(action_type, action_type)

    async with get_session() as session:
        result = await session.execute(
            text("SELECT id FROM categories WHERE name = :name LIMIT 1"), {"name": category_name}
        )
        category_row = result.mappings().first()

    if not category_row:
        return (
            "No pude crear automáticamente tu solicitud porque no encontré la categoría "
            "correspondiente. Por favor abre un ticket manualmente desde el Portal."
        )

    ticket = await create_ticket_via_service(
        created_by_id=user_id,
        title=f"{label} solicitado vía Chatbot IA",
        description=f"Solicitud recibida por NovaBot: \"{original_message}\"",
        category_id=str(category_row["id"]),
        priority="MEDIUM",
    )

    if not ticket:
        return "No pude crear el ticket automáticamente; por favor intenta abrirlo desde el Portal de Solicitudes."

    return (
        f"Esta acción ({label.lower()}) requiere validación de un técnico en este entorno. "
        f"Ya creé el ticket {ticket.get('code', '')} y un especialista te contactará en breve."
    )
