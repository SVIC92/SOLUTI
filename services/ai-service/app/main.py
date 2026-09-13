"""Punto de entrada del ai-service (FastAPI).

Expone los endpoints síncronos (chatbot, copilot) consumidos por el backend Node vía
REST interno. Los flujos asíncronos (triaje, embeddings, anomalías, KB drafts) corren
como workers separados (ver app/workers/) que consumen el stream de eventos de Redis.
"""
from fastapi import FastAPI

from app.modules.chatbot.router import router as chatbot_router
from app.modules.copilot.router import router as copilot_router

app = FastAPI(title="AI Service — Help Desk", version="0.1.0")

app.include_router(chatbot_router, prefix="/api/ai/chatbot", tags=["chatbot"])
app.include_router(copilot_router, prefix="/api/ai/copilot", tags=["copilot"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
