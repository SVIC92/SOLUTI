"""Generación de embeddings 100% local (no sale de la red interna) para búsqueda
semántica (Copilot) y clustering (Detección de anomalías). Usa un modelo
open-source multilingüe vía sentence-transformers.

`embed_text`/`embed_batch` son `async` porque `SentenceTransformer.encode` es
CPU-bound y bloqueante; se ejecuta en un hilo aparte (`asyncio.to_thread`) para
no congelar el event loop único de FastAPI durante el cómputo.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache

from sentence_transformers import SentenceTransformer

from app.config import settings


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    # Cargado una sola vez por proceso worker (modelo pesado).
    return SentenceTransformer(settings.embedding_model_name)


async def embed_text(text: str) -> list[float]:
    """Devuelve el vector de embedding (dimensión settings.embedding_dim) para un texto."""
    model = _get_model()
    vector = await asyncio.to_thread(model.encode, text, normalize_embeddings=True)
    return vector.tolist()


async def embed_batch(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    vectors = await asyncio.to_thread(model.encode, texts, normalize_embeddings=True, batch_size=16)
    return [v.tolist() for v in vectors]
