"""Worker periódico (no consume eventos, a diferencia de los otros workers): cada
`RUN_EVERY_SECONDS` revisa los tickets abiertos recientes en busca de clústeres de
incidentes similares (plan `2.txt`, módulo 4). Se ejecuta como proceso separado:
`python -m app.workers.anomaly_scheduler`.
"""
from __future__ import annotations

import asyncio
import logging

from app.modules.anomaly.detector import detect_anomalies

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service.anomaly_scheduler")

RUN_EVERY_SECONDS = 600  # 10 minutos — suficiente para detectar un pico sin saturar la BD


async def main() -> None:
    logger.info("Anomaly scheduler iniciado (revisa cada %s s)", RUN_EVERY_SECONDS)
    while True:
        try:
            created = await detect_anomalies()
            if created:
                logger.info("%s clúster(es) de anomalía nuevo(s) detectado(s)", created)
        except Exception:  # noqa: BLE001 - una pasada fallida no debe tumbar el worker
            logger.exception("Fallo ejecutando la detección de anomalías")

        await asyncio.sleep(RUN_EVERY_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
