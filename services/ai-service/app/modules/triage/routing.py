"""Enrutamiento Inteligente (plan `2.txt`, módulo 1): asigna el ticket al técnico
con menor carga actual, priorizando quienes tienen la habilidad registrada para
la categoría del ticket. No usa LLM — es una consulta determinista sobre la misma
base Postgres que comparte el core (lectura directa, sin pasar por el backend Node).

`technician_skills.category` almacena el `categoryId` (UUID) de la tabla `categories`
del core, para poder cruzarla directamente contra `tickets.category_id`.
"""
from __future__ import annotations

from sqlalchemy import text

from app.core.db import get_session

_OPEN_STATUSES = ("NEW", "IN_PROGRESS", "ON_HOLD")


async def find_best_technician(category_id: str) -> str | None:
    async with get_session() as session:
        # 1) Técnicos con habilidad registrada para esta categoría, por menor carga.
        skilled = await session.execute(
            text(
                """
                SELECT ts.technician_id,
                       COUNT(t.id) FILTER (WHERE t.status = ANY(:open_statuses)) AS open_count
                FROM technician_skills ts
                LEFT JOIN tickets t ON t.assigned_to_id = ts.technician_id
                WHERE ts.category = :category_id
                GROUP BY ts.technician_id
                ORDER BY open_count ASC
                LIMIT 1
                """
            ),
            {"category_id": category_id, "open_statuses": list(_OPEN_STATUSES)},
        )
        row = skilled.first()
        if row:
            return str(row[0])

        # 2) Sin habilidad registrada: cualquier técnico activo, por menor carga.
        fallback = await session.execute(
            text(
                """
                SELECT u.id,
                       COUNT(t.id) FILTER (WHERE t.status = ANY(:open_statuses)) AS open_count
                FROM users u
                JOIN roles r ON r.id = u.role_id
                LEFT JOIN tickets t ON t.assigned_to_id = u.id
                WHERE r.name = 'TECHNICIAN' AND u.is_active = true
                GROUP BY u.id
                ORDER BY open_count ASC
                LIMIT 1
                """
            ),
            {"open_statuses": list(_OPEN_STATUSES)},
        )
        row = fallback.first()
        return str(row[0]) if row else None
