"""Conexión async a la misma base Neon Postgres que usa el backend Node.

Las tablas `ai_*` son propiedad exclusiva de este servicio (solo ai-service escribe
en ellas); el backend Node únicamente las lee vía join/vista para mostrarlas en la UI.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, pool_pre_ping=True, pool_size=5, max_overflow=5)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session
