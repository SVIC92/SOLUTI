"""Detección de Anomalías y Prevención de Incidencias (plan `2.txt`, módulo 4):
agrupa tickets recientes por similitud semántica para detectar cuando varios
usuarios reportan la misma falla en poco tiempo (posible caída general de un
servicio/red). El Análisis Predictivo de fallas (a partir de historial CMDB) se
difiere — el propio plan indica que requiere meses de datos que este despliegue
recién empezado todavía no tiene.

No usa `ai_ticket_embeddings` (esa tabla es solo para tickets YA resueltos, ver
Copilot) — los tickets nuevos aún no tienen embedding, así que se calculan aquí
mismo, en memoria, para la ventana de tiempo analizada.
"""
from __future__ import annotations

import logging
import uuid

import numpy as np
from sklearn.cluster import DBSCAN
from sqlalchemy import text

from app.core.backend_client import send_anomaly_alert
from app.core.db import get_session
from app.core.embeddings import embed_batch
from app.core.security import redact_pii

logger = logging.getLogger("ai-service.anomaly_detector")

WINDOW_MINUTES = 60
MIN_CLUSTER_SIZE = 3
DBSCAN_EPS = 0.35  # distancia coseno máxima entre tickets del mismo clúster


async def _fetch_recent_open_tickets(window_minutes: int) -> list[dict]:
    async with get_session() as session:
        result = await session.execute(
            text(
                """
                SELECT t.id, t.code, t.title, t.description, c.name AS category_name
                FROM tickets t
                JOIN categories c ON c.id = t.category_id
                WHERE t.status IN ('NEW', 'IN_PROGRESS')
                  AND t.created_at >= now() - make_interval(mins => :window_minutes)
                """
            ),
            {"window_minutes": window_minutes},
        )
        return [dict(row) for row in result.mappings().all()]


async def _existing_open_cluster_ticket_ids() -> list[tuple[str, list[str]]]:
    async with get_session() as session:
        result = await session.execute(
            text("SELECT id, ticket_ids FROM ai_anomaly_clusters WHERE status = 'open'")
        )
        return [(str(row["id"]), [str(t) for t in (row["ticket_ids"] or [])]) for row in result.mappings().all()]


async def _grow_existing_cluster(cluster_id: str, ticket_ids: list[str]) -> None:
    # `ai_anomaly_clusters.id` es un uuid propio de esta tabla (generado con
    # uuid.uuid4() en `_create_cluster`); `ticket_ids` es TEXT[] porque guarda
    # ids de `tickets` (TEXT en Prisma) — ver migrations/001_pgvector_and_ai_tables.sql.
    async with get_session() as session:
        await session.execute(
            text(
                """
                UPDATE ai_anomaly_clusters
                SET ticket_ids = (
                    SELECT ARRAY(SELECT DISTINCT unnest(ticket_ids || CAST(:new_ids AS text[])))
                )
                WHERE id = CAST(:cluster_id AS uuid)
                """
            ),
            {"cluster_id": cluster_id, "new_ids": ticket_ids},
        )
        await session.commit()


async def _create_cluster(label: str, ticket_ids: list[str], severity: str) -> str:
    cluster_id = str(uuid.uuid4())
    async with get_session() as session:
        await session.execute(
            text(
                """
                INSERT INTO ai_anomaly_clusters (id, cluster_label, ticket_ids, severity, status)
                VALUES (CAST(:id AS uuid), :label, CAST(:ticket_ids AS text[]), :severity, 'open')
                """
            ),
            {"id": cluster_id, "label": label, "ticket_ids": ticket_ids, "severity": severity},
        )
        await session.commit()
    return cluster_id


async def detect_anomalies(window_minutes: int = WINDOW_MINUTES, min_cluster_size: int = MIN_CLUSTER_SIZE) -> int:
    """Ejecuta una pasada de detección. Devuelve cuántos clústeres nuevos se crearon."""
    tickets = await _fetch_recent_open_tickets(window_minutes)
    if len(tickets) < min_cluster_size:
        return 0

    texts = [redact_pii(f"{t['title']} {t['description']}") for t in tickets]
    vectors = np.array(await embed_batch(texts))

    labels = DBSCAN(eps=DBSCAN_EPS, min_samples=min_cluster_size, metric="cosine").fit_predict(vectors)

    clusters: dict[int, list[dict]] = {}
    for ticket, label in zip(tickets, labels):
        if label == -1:  # ruido: no forma parte de ningún grupo similar
            continue
        clusters.setdefault(label, []).append(ticket)

    # Copia mutable: se actualiza en memoria tras cada grow/create dentro del
    # mismo loop (antes se leía una sola vez al inicio, así que si dos clústeres
    # de esta misma pasada solapaban con el mismo clúster existente, el segundo
    # evaluaba contra datos obsoletos y podía generar una alerta duplicada).
    existing: list[list] = [[cluster_id, list(ids)] for cluster_id, ids in await _existing_open_cluster_ticket_ids()]
    created = 0

    for cluster_tickets in clusters.values():
        ticket_ids = [str(t["id"]) for t in cluster_tickets]

        overlapping_entry = next((entry for entry in existing if set(entry[1]) & set(ticket_ids)), None)
        if overlapping_entry:
            # Ya se había alertado sobre un subconjunto de este grupo: lo ampliamos
            # en silencio en vez de generar una alerta duplicada.
            await _grow_existing_cluster(overlapping_entry[0], ticket_ids)
            overlapping_entry[1] = list(set(overlapping_entry[1]) | set(ticket_ids))
            continue

        category_name = cluster_tickets[0]["category_name"]
        label_text = f"Posible incidencia masiva: {category_name} ({len(cluster_tickets)} tickets)"
        severity = "critical" if len(cluster_tickets) >= 5 else "warning"

        new_cluster_id = await _create_cluster(label_text, ticket_ids, severity)
        existing.append([new_cluster_id, ticket_ids])
        await send_anomaly_alert(
            cluster_label=label_text,
            ticket_codes=[t["code"] for t in cluster_tickets],
            severity=severity,
        )
        created += 1
        logger.info("Nuevo clúster de anomalía: %s", label_text)

    return created
