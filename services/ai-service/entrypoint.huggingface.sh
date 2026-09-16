#!/bin/sh
# Entrypoint SOLO para el Space de Hugging Face (Docker SDK admite un único
# contenedor por Space) — en on-premise/docker-compose, la API y los 4 workers corren
# como 5 contenedores separados (ver `docker-compose.yml` en la raíz del repo); aquí
# los workers se lanzan como procesos de fondo dentro del mismo contenedor.
#
# Cada worker sigue cargando su propia copia del modelo de embeddings en RAM (no
# comparten proceso con la API) — con los ~16GB del tier gratuito de CPU de HF Spaces
# sobra margen de sobra, así que no hace falta fusionarlos en un solo proceso asyncio
# para que esto funcione.
set -e

# Reintenta un worker si termina inesperadamente (equivalente al `restart:
# unless-stopped` de docker-compose, que aquí no existe al ser un solo contenedor).
run_worker() {
  until python -m "$1"; do
    echo "[entrypoint] $1 terminó inesperadamente, reintentando en 5s..." >&2
    sleep 5
  done
}

run_worker app.workers.triage_worker &
run_worker app.workers.embedding_worker &
run_worker app.workers.anomaly_scheduler &
run_worker app.workers.kb_generator_worker &

# Hugging Face Spaces espera el proceso principal escuchando en $PORT (7860 por
# defecto) — `exec` para que uvicorn reciba señales de apagado directamente.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}"
