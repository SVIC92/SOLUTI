"""Punto de entrada para el Space de Hugging Face con SDK **Gradio** (no Docker).

Hugging Face solo habilita el SDK Docker con un plan de pago — con Gradio/Static no
hace falta tarjeta. El runtime "Gradio" de Spaces simplemente prepara un venv desde
`requirements.txt` y ejecuta el archivo indicado en `app_file` (ver
`README.huggingface.md`) con `python`; no exige que el proceso use la librería gradio
en sí, solo que algo quede escuchando en el puerto expuesto.

A diferencia de `Dockerfile.huggingface`/`entrypoint.huggingface.sh` (pensados para si
el SDK Docker llega a habilitarse más adelante), aquí no hay contenedor propio ni shell
script: los 4 workers (que en on-premise/docker-compose corren como contenedores
separados — ver `docker-compose.yml` en la raíz del repo) se lanzan como subprocesos de
este mismo proceso Python, con reintento si alguno muere.
"""
import os
import subprocess
import sys
import threading
import time

import uvicorn

from app.main import app as fastapi_app

WORKER_MODULES = [
    "app.workers.triage_worker",
    "app.workers.embedding_worker",
    "app.workers.anomaly_scheduler",
    "app.workers.kb_generator_worker",
]


def _run_worker_with_restart(module: str) -> None:
    while True:
        process = subprocess.Popen([sys.executable, "-m", module])
        exit_code = process.wait()
        print(
            f"[hf_space_entrypoint] {module} terminó (code={exit_code}), reintentando en 5s...",
            file=sys.stderr,
        )
        time.sleep(5)


def _start_workers() -> None:
    for module in WORKER_MODULES:
        threading.Thread(target=_run_worker_with_restart, args=(module,), daemon=True).start()


if __name__ == "__main__":
    _start_workers()
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(fastapi_app, host="0.0.0.0", port=port)
