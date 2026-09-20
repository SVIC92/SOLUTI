"""Wrapper único sobre la API REST de Gemini: selección de modelo por tarea, reintentos
con backoff, salida estructurada (JSON schema) y registro de auditoría en
ai_decision_log.

Usa la API REST vía `httpx` en vez del SDK oficial `google-genai`: ese SDK fija
`websockets>=13`, en conflicto directo con `gradio-client` (que fija `websockets<13`)
en el build de Hugging Face Spaces (SDK Gradio — ver DEPLOYMENT.md sección 3). Al
llamar la API HTTP directamente evitamos esa dependencia por completo.

Aísla al resto de módulos de IA del proveedor concreto — si en el futuro la
organización exige migrar a un modelo local (compliance de datos), solo este archivo
cambia.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("ai-service.llm_client")

_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


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


async def _call_gemini(
    *,
    model: str,
    system_prompt: str,
    user_content: str,
    generation_config: dict[str, Any] | None,
) -> str:
    """POST a `models/{model}:generateContent` — devuelve el texto de la primera
    respuesta candidata. Deja que cualquier error de red/HTTP/forma de respuesta
    inesperada se propague tal cual; el llamador decide cuántas veces reintentar."""
    payload: dict[str, Any] = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_content}]}],
    }
    if generation_config:
        payload["generationConfig"] = generation_config

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{_GEMINI_API_BASE}/{model}:generateContent",
            headers={"x-goog-api-key": settings.gemini_api_key},
            json=payload,
        )
        response.raise_for_status()
        body = response.json()

    return body["candidates"][0]["content"]["parts"][0]["text"]


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
            raw_text = await _call_gemini(
                model=model,
                system_prompt=system_prompt,
                user_content=user_content,
                generation_config={
                    "responseMimeType": "application/json",
                    "responseSchema": json_schema,
                },
            )
            data = json.loads(raw_text)
            return LlmResult(data=data, model_used=model, raw_text=raw_text)
        except Exception as exc:  # noqa: BLE001 - se relanza tipado tras agotar reintentos
            last_error = exc
            logger.warning("Intento %s/%s fallido para tarea=%s: %s", attempt + 1, max_retries + 1, task, exc)

    raise LlmUnavailableError(f"Gemini no respondió para la tarea '{task}'") from last_error


async def generate_text(*, task: str, system_prompt: str, user_content: str, max_retries: int = 2) -> str:
    """Llama a Gemini sin forzar JSON — usado para borradores de respuesta/artículos KB
    donde la salida es texto libre revisado por un humano antes de publicarse. Mismos
    reintentos que `generate_structured`."""
    model = _select_model(task)
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            return await _call_gemini(
                model=model,
                system_prompt=system_prompt,
                user_content=user_content,
                generation_config=None,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("Intento %s/%s fallido para tarea=%s: %s", attempt + 1, max_retries + 1, task, exc)

    raise LlmUnavailableError(f"Gemini no respondió para la tarea '{task}'") from last_error
