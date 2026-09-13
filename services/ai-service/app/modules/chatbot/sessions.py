"""Persistencia de sesiones y mensajes del Chatbot Nivel 1 en `ai_chatbot_sessions`
/ `ai_chatbot_messages` (ver plan `2.txt`, esquema de datos adicional) — permite
auditar la conversación completa y contar turnos para decidir cuándo escalar.
"""
from __future__ import annotations

import uuid

from sqlalchemy import text

from app.core.db import get_session


async def get_or_create_session(session_id: str | None, user_id: str, ticket_id: str | None, channel: str) -> str:
    if session_id:
        async with get_session() as db:
            existing = await db.execute(
                text("SELECT id FROM ai_chatbot_sessions WHERE id = CAST(:id AS uuid)"), {"id": session_id}
            )
            if existing.first():
                return session_id

    new_id = str(uuid.uuid4())
    async with get_session() as db:
        await db.execute(
            text(
                """
                INSERT INTO ai_chatbot_sessions (id, user_id, ticket_id, channel)
                -- `id` es un uuid propio de esta tabla (generado arriba con
                -- uuid.uuid4()); `user_id`/`ticket_id` son TEXT (ids de Prisma:
                -- `users.id`/`tickets.id`), nunca se castean a uuid.
                VALUES (CAST(:id AS uuid), :user_id, :ticket_id, :channel)
                """
            ),
            {"id": new_id, "user_id": user_id, "ticket_id": ticket_id, "channel": channel},
        )
        await db.commit()
    return new_id


async def append_message(session_id: str, role: str, content: str) -> None:
    async with get_session() as db:
        await db.execute(
            text(
                "INSERT INTO ai_chatbot_messages (session_id, role, content) "
                "VALUES (CAST(:session_id AS uuid), :role, :content)"
            ),
            {"session_id": session_id, "role": role, "content": content},
        )
        await db.commit()


async def count_user_turns(session_id: str) -> int:
    async with get_session() as db:
        result = await db.execute(
            text(
                "SELECT COUNT(*) FROM ai_chatbot_messages WHERE session_id = CAST(:session_id AS uuid) AND role = 'user'"
            ),
            {"session_id": session_id},
        )
        return result.scalar_one()


async def mark_session_outcome(session_id: str, *, resolved_autonomously: bool, escalated_to_human: bool) -> None:
    async with get_session() as db:
        await db.execute(
            text(
                """
                UPDATE ai_chatbot_sessions
                SET resolved_autonomously = :resolved, escalated_to_human = :escalated, ended_at = now()
                WHERE id = CAST(:session_id AS uuid)
                """
            ),
            {"resolved": resolved_autonomously, "escalated": escalated_to_human, "session_id": session_id},
        )
        await db.commit()
