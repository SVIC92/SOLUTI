"""Cliente hacia el backend Node — usado para escribir de vuelta en el ticket los
metadatos calculados por IA (categoría/prioridad sugerida, sentimiento, técnico
auto-asignado). Ver plan `2.txt`, puntos de extensión: `internal/ai/tickets/:id/classification`.

Si el backend no responde, se registra el error y se continúa: el ticket sigue su
curso normal sin metadatos de IA (modo degradado, ver plan de riesgos/mitigaciones).
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger("ai-service.backend_client")


async def push_ticket_classification(ticket_id: str, payload: dict) -> None:
    url = f"{settings.backend_url}/internal/ai/tickets/{ticket_id}/classification"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.patch(url, json=payload, headers={"X-Api-Key": settings.ai_service_api_key})
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("No se pudo escribir la clasificación de IA en el ticket %s: %s", ticket_id, exc)


async def create_ticket_via_service(
    *, created_by_id: str, title: str, description: str, category_id: str, priority: str = "MEDIUM"
) -> dict | None:
    """Usado por el Chatbot Nivel 1 (plan `2.txt`, módulo 2) para escalar una
    solicitud creando un ticket real en nombre del usuario, reutilizando toda la
    lógica de negocio del core (SLA, enrutamiento, notificaciones)."""
    url = f"{settings.backend_url}/internal/ai/tickets"
    payload = {
        "createdById": created_by_id,
        "title": title,
        "description": description,
        "categoryId": category_id,
        "priority": priority,
        "origin": "chatbot",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, json=payload, headers={"X-Api-Key": settings.ai_service_api_key})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        logger.warning("No se pudo crear el ticket de escalamiento para %s: %s", created_by_id, exc)
        return None


async def send_anomaly_alert(*, cluster_label: str, ticket_codes: list[str], severity: str) -> None:
    """Detección de Anomalías (plan `2.txt`, módulo 4): notifica al equipo ADMIN
    cuando se detecta un clúster de tickets similares en poco tiempo."""
    url = f"{settings.backend_url}/internal/ai/anomaly-alert"
    payload = {"clusterLabel": cluster_label, "ticketCodes": ticket_codes, "severity": severity}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, json=payload, headers={"X-Api-Key": settings.ai_service_api_key})
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("No se pudo enviar la alerta de anomalía '%s': %s", cluster_label, exc)


async def create_kb_draft_article(
    *, source_ticket_id: str, title: str, content: str, category_id: str | None
) -> dict | None:
    """Generación Automática de Documentación (plan `2.txt`, módulo 6): crea el
    artículo-borrador en la Base de Conocimiento (nunca publicado automáticamente)."""
    url = f"{settings.backend_url}/internal/ai/knowledge-articles"
    payload = {
        "sourceTicketId": source_ticket_id,
        "title": title,
        "content": content,
        "categoryId": category_id,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers={"X-Api-Key": settings.ai_service_api_key})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        logger.warning("No se pudo crear el borrador de KB para el ticket %s: %s", source_ticket_id, exc)
        return None
