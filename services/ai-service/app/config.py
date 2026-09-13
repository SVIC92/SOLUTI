from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración tipada del ai-service, cargada desde variables de entorno (.env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    redis_url: str = "redis://redis:6379"

    # Backend Node — para escribir de vuelta los metadatos de IA en el ticket
    # (ver internal/ai/tickets/:id/classification, protegido con el mismo API key).
    backend_url: str = "http://backend:3000/api/v1"

    gemini_api_key: str
    gemini_model_fast: str = "gemini-flash-latest"
    gemini_model_pro: str = "gemini-pro-latest"

    embedding_model_name: str = "BAAI/bge-m3"
    embedding_dim: int = 1024

    ai_service_api_key: str

    triage_confidence_threshold: float = 0.7

    log_level: str = "info"


settings = Settings()
