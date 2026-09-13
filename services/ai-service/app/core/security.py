"""Autenticación interna (backend <-> ai-service) y redacción de PII/credenciales
antes de enviar cualquier texto de ticket a la API externa de Gemini.
"""
import re

from fastapi import Header, HTTPException, status

from app.config import settings

# Patrones básicos de datos sensibles a redactar. Ampliar con NER si se requiere
# mayor cobertura (nombres propios, direcciones, DNI/RUC, etc.).
_PII_PATTERNS = [
    (re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"), "[EMAIL_REDACTADO]"),
    (re.compile(r"\b(?:\+?\d{1,3}[ -]?)?\d{9}\b"), "[TELEFONO_REDACTADO]"),
    (
        re.compile(r"(?i)\b(contrase[nñ]a|password|pass|clave)\s*[:=]\s*\S+"),
        r"\1: [CREDENCIAL_REDACTADA]",
    ),
]


def redact_pii(text: str) -> str:
    """Reemplaza correos, teléfonos y credenciales explícitas antes de llamar al LLM externo."""
    redacted = text
    for pattern, replacement in _PII_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


async def verify_service_api_key(x_api_key: str = Header(...)) -> None:
    """Dependencia FastAPI: exige el API key interno compartido con el backend Node."""
    if x_api_key != settings.ai_service_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key inválida")
