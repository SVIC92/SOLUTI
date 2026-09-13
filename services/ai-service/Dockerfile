FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# En producción, ejecutar aparte los workers (triage_worker, embedding_worker,
# anomaly_scheduler, kb_worker) como procesos/contenedores independientes del API.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
