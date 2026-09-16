---
title: SoluTI AI Service
emoji: 🧠
colorFrom: indigo
colorTo: blue
sdk: gradio
sdk_version: "4.44.0"
app_file: hf_space_entrypoint.py
app_port: 7860
pinned: false
---

Microservicio de IA (FastAPI + workers de Redis Streams) de SoluTI_AI — triaje,
chatbot, copilot y detección de anomalías para el backend NestJS. Ver `DEPLOYMENT.md`
en el repo principal para el detalle de despliegue.

Nota: el SDK es "Gradio" (no Docker) porque Hugging Face solo habilita Docker con un
plan de pago. `hf_space_entrypoint.py` no usa la librería gradio — solo aprovecha que
este SDK no requiere tarjeta y ejecuta un script Python arbitrario.
