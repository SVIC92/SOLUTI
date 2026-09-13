"""Endpoint síncrono del Agente Virtual / Chatbot de Soporte (Nivel 1).

Invocado por el backend Node (que a su vez recibe el mensaje desde el widget web
o desde los conectores multicanal — WhatsApp/Slack/Teams — del núcleo).
"""
from fastapi import APIRouter, Depends

from app.core.schemas import CamelModel
from app.core.security import verify_service_api_key
from app.modules.chatbot.agent import handle_message

router = APIRouter(dependencies=[Depends(verify_service_api_key)])


class ChatbotMessageRequest(CamelModel):
    session_id: str | None = None
    user_id: str
    ticket_id: str | None = None
    channel: str = "web"
    message: str


class ChatbotMessageResponse(CamelModel):
    session_id: str
    reply: str
    resolved_autonomously: bool = False
    escalated_to_human: bool = False


@router.post("/message", response_model=ChatbotMessageResponse)
async def post_message(request: ChatbotMessageRequest) -> ChatbotMessageResponse:
    return await handle_message(request)
