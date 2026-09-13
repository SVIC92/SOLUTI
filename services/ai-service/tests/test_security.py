"""Pruebas de `redact_pii` (core/security.py): es la barrera de privacidad antes
de enviar cualquier texto de ticket a la API externa de Gemini (plan `2.txt`,
riesgos/mitigaciones) — debe redactar correos, teléfonos y credenciales
explícitas sin alterar el resto del texto.
"""
from app.core.security import redact_pii


def test_redacts_email_address():
    result = redact_pii("Mi correo es juan.perez@empresa.com, contáctenme ahí")
    assert "juan.perez@empresa.com" not in result
    assert "[EMAIL_REDACTADO]" in result


def test_redacts_phone_number():
    result = redact_pii("Llámame al 987654321 por favor")
    assert "987654321" not in result
    assert "[TELEFONO_REDACTADO]" in result


def test_redacts_password_pattern_case_insensitive():
    result = redact_pii("Mi PASSWORD: Sup3rSecreto123 no lo compartas")
    assert "Sup3rSecreto123" not in result
    assert "[CREDENCIAL_REDACTADA]" in result


def test_redacts_spanish_password_variant_with_enye():
    result = redact_pii("La contraseña: MiClave2024 es temporal")
    assert "MiClave2024" not in result
    assert "[CREDENCIAL_REDACTADA]" in result


def test_leaves_normal_text_unchanged():
    text = "El ticket describe un problema con la impresora de la oficina 4"
    assert redact_pii(text) == text


def test_redacts_multiple_occurrences_in_same_text():
    text = "Contacto 1: ana@empresa.com. Contacto 2: luis@empresa.com."
    result = redact_pii(text)
    assert "ana@empresa.com" not in result
    assert "luis@empresa.com" not in result
    assert result.count("[EMAIL_REDACTADO]") == 2
