"""Agente Virtual / Chatbot de Soporte (Nivel 1) — plan `2.txt`, módulo 2.

Responde dudas frecuentes 24/7 y ejecuta acciones simples mediante una whitelist
CERRADA de herramientas. Solo `check_ticket_status` y `search_kb` consultan datos
reales del core; el resto de acciones (reset_password, unlock_account,
restart_service) no tienen integración externa real en este despliegue on-premise
y por eso escalan de forma transparente creando un ticket (ver `tools.py`).
Cualquier mensaje ambiguo, o sin resolución tras 2 turnos, también escala —
nunca se inventa una solución fuera de las herramientas permitidas.
"""
from __future__ import annotations

from app.core.llm_client import LlmUnavailableError, generate_structured
from app.core.security import redact_pii
from app.modules.chatbot.sessions import (
    append_message,
    count_user_turns,
    get_or_create_session,
    mark_session_outcome,
)
from app.modules.chatbot.tools import check_ticket_status, escalate_action, search_kb

MAX_TURNS_BEFORE_ESCALATION = 2

INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": ["check_ticket_status", "search_kb", "request_action", "general_question"],
        },
        "ticket_code": {"type": "string", "description": "Código de ticket mencionado, ej. TCK-000123"},
        "search_query": {"type": "string", "description": "Términos de búsqueda para la Base de Conocimiento"},
        "action_type": {
            "type": "string",
            "enum": ["reset_password", "unlock_account", "restart_service"],
        },
        "reply": {
            "type": "string",
            "description": "Respuesta breve y cordial en español para el usuario, acorde a la intención detectada",
        },
    },
    "required": ["intent", "reply"],
}

SYSTEM_PROMPT = (
    "Eres NovaBot, el asistente de soporte TI de Nivel 1. Responde en español, de forma breve y "
    "clara. Clasifica cada mensaje en una de estas intenciones: "
    "'check_ticket_status' (el usuario pregunta por el estado de un ticket suyo — extrae el código "
    "si lo menciona), 'search_kb' (busca una solución/guía — extrae los términos clave), "
    "'request_action' (pide restablecer contraseña, desbloquear cuenta, o reiniciar un servicio), "
    "o 'general_question' (cualquier otra consulta). Responde SIEMPRE conforme al schema solicitado."
)


async def handle_message(request) -> dict:
    user_id = request.user_id
    ticket_id = request.ticket_id
    channel = request.channel or "web"

    session_id = await get_or_create_session(request.session_id, user_id, ticket_id, channel)
    await append_message(session_id, "user", request.message)

    safe_message = redact_pii(request.message)
    resolved_autonomously = False
    escalated_to_human = False

    try:
        result = await generate_structured(
            task="chatbot",
            system_prompt=SYSTEM_PROMPT,
            user_content=safe_message,
            json_schema=INTENT_SCHEMA,
        )
        data = result.data
        intent = data.get("intent", "general_question")
        reply = data.get("reply", "")

        if intent == "check_ticket_status" and data.get("ticket_code"):
            reply = await check_ticket_status(data["ticket_code"], user_id)
            resolved_autonomously = True
        elif intent == "search_kb":
            query = data.get("search_query") or safe_message
            reply = await search_kb(query)
            resolved_autonomously = True
        elif intent == "request_action" and data.get("action_type"):
            reply = await escalate_action(data["action_type"], user_id, safe_message)
            escalated_to_human = True
        else:
            # 'general_question' o intención ambigua: si ya llevamos varios turnos
            # sin resolución concreta, escala en vez de seguir conversando en bucle.
            turns = await count_user_turns(session_id)
            if turns > MAX_TURNS_BEFORE_ESCALATION:
                reply = (
                    "No logré resolver tu consulta por este medio. Voy a derivarla a un técnico humano "
                    "para que te dé seguimiento personalizado."
                )
                escalated_to_human = True

        await append_message(session_id, "assistant", reply)
        await mark_session_outcome(
            session_id, resolved_autonomously=resolved_autonomously, escalated_to_human=escalated_to_human
        )

        return {
            "sessionId": session_id,
            "reply": reply,
            "resolvedAutonomously": resolved_autonomously,
            "escalatedToHuman": escalated_to_human,
        }
    except LlmUnavailableError:
        # Modo degradado: el chatbot no debe fallar silenciosamente — siempre escala.
        fallback_reply = "No puedo responder en este momento; derivé tu consulta a un técnico."
        await append_message(session_id, "assistant", fallback_reply)
        await mark_session_outcome(session_id, resolved_autonomously=False, escalated_to_human=True)
        return {
            "sessionId": session_id,
            "reply": fallback_reply,
            "resolvedAutonomously": False,
            "escalatedToHuman": True,
        }
