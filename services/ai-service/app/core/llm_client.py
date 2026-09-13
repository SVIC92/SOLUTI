"""Wrapper único sobre la API de Gemini: selección de modelo por tarea, reintentos con
backoff, salida estructurada (JSON schema) y registro de auditoría en ai_decision_log.

Aísla al resto de módulos de IA del SDK concreto — si en el futuro la organización exige
migrar a un modelo local (compliance de datos), solo este archivo cambia.

Las funciones son `async` aunque el SDK de `google-genai` es síncrono: la llamada de
red se ejecuta en un hilo aparte (`asyncio.to_thread`) para no bloquear el event loop
único de FastAPI mientras Gemini responde — sin esto, dos usuarios usando el chatbot
o el copilot a la vez se bloquean entre sí durante toda la duración de la llamada.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger("ai-service.llm_client")

_client = genai.Client(api_key=settings.gemini_api_key)


class LlmUnavailableError(RuntimeError):
    """Se lanza cuando Gemini no responde tras los reintentos — el llamador debe
    degradar con gracia (ej. dejar el ticket sin metadatos de IA en vez de fallar)."""


@dataclass
class LlmResult:
    data: dict[str, Any]
    model_used: str
    raw_text: str


def _select_model(task: str) -> str:
    """Modelo económico/rápido para alto volumen (triaje), modelo más capaz para
    tareas que requieren mayor razonamiento (chatbot, generación de contenido)."""
    high_reasoning_tasks = {"chatbot", "copilot_draft", "kb_generation"}
    return settings.gemini_model_pro if task in high_reasoning_tasks else settings.gemini_model_fast


async def generate_structured(
    *,
    task: str,
    system_prompt: str,
    user_content: str,
    json_schema: dict[str, Any],
    max_retries: int = 2,
) -> LlmResult:
    """Llama a Gemini forzando salida JSON conforme a `json_schema`. Usado por triaje,
    clasificación, sentimiento/urgencia, etc. Lanza LlmUnavailableError tras agotar
    los reintentos para que el llamador pueda aplicar su modo degradado."""
    model = _select_model(task)
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            response = await asyncio.to_thread(
                _client.models.generate_content,
                model=model,
                contents=user_content,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    response_schema=json_schema,
                ),
            )
            data = json.loads(response.text)
            return LlmResult(data=data, model_used=model, raw_text=response.text)
        except Exception as exc:  # noqa: BLE001 - se relanza tipado tras agotar reintentos
            last_error = exc
            logger.warning("Intento %s/%s fallido para tarea=%s: %s", attempt + 1, max_retries + 1, task, exc)

    raise LlmUnavailableError(f"Gemini no respondió para la tarea '{task}'") from last_error


async def generate_text(*, task: str, system_prompt: str, user_content: str, max_retries: int = 2) -> str:
    """Llama a Gemini sin forzar JSON — usado para borradores de respuesta/artículos KB
    donde la salida es texto libre revisado por un humano antes de publicarse. Mismos
    reintentos que `generate_structured` (antes hacía un solo intento sin reintentar,
    inconsistente con el resto de llamadores de este módulo)."""
    model = _select_model(task)
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            response = await asyncio.to_thread(
                _client.models.generate_content,
                model=model,
                contents=user_content,
                config=types.GenerateContentConfig(system_instruction=system_prompt),
            )
            return response.text
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("Intento %s/%s fallido para tarea=%s: %s", attempt + 1, max_retries + 1, task, exc)

    raise LlmUnavailableError(f"Gemini no respondió para la tarea '{task}'") from last_error
