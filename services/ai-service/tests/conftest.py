"""Variables de entorno mínimas para poder importar `app.config` en las
pruebas, sin depender de un `.env` real ni de credenciales de Gemini/Neon."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/testdb")
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("AI_SERVICE_API_KEY", "test-service-key")
