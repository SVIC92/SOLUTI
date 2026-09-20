# Despliegue en producción

Estado: **frontend (Vercel)**, **backend (Render)** y **ai-service (Oracle Cloud Always
Free)** documentados y con la config lista.

---

## 1. Frontend — Vercel

Cambios ya aplicados en el repo:
- `frontend/vercel.json` — rewrites de SPA (Angular Router) + build/output config.
- `frontend/src/environments/environment.prod.ts` — URLs completas al backend (Vercel y
  Render son dominios distintos, a diferencia del despliegue on-premise donde ambos
  quedaban detrás del mismo reverse proxy).

Pasos:
1. Push del repo a GitHub (ver sección 0).
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importar el repo.
3. **Root Directory**: `frontend`. Framework Angular se autodetecta.
4. Antes del build, `environment.prod.ts` debe tener la URL real del backend en Render
   (ver sección 2) — si Render aún no existe, desplegar el backend primero.

## 2. Backend — Render

Cambios ya aplicados en el repo:
- `backend/package.json` → `"postinstall": "prisma generate"` (el cliente Prisma vive en
  `.gitignore`, se regenera en cada install; sin esto el build falla).
- `backend/package.json` → `"engines": {"node": ">=22.0.0"}`.

Config del servicio (Web Service, conectado al repo):

| Campo | Valor |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start:prod` |

Variables de entorno (basadas en `backend/.env` local — ver ese archivo para los valores
reales, no se repiten aquí por ser secretos):
- `NODE_ENV=production`
- `DATABASE_URL` — misma Neon DB que en local.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `SMTP_HOST` (**requerido** por `validation.schema.ts` aunque no envíes correos reales
  todavía — sin este valor el boot falla)
- `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`
- `REDIS_URL` — **Upstash** (`rediss://...` con TLS), no el WSL local usado en dev.
- `AI_SERVICE_URL` / `AI_SERVICE_API_KEY` — ver sección 3; mientras no haya ai-service
  público, las llamadas devuelven 503 "no disponible" sin romper el resto (ver
  `ai-client.ts`, catch genérico).
- `FRONTEND_URL` — URL de Vercel, para CORS (`main.ts` línea `app.enableCors(...)`).
- `STORAGE_DRIVER=local`
- `LDAP_*`, `WHATSAPP_*`, `SLACK_*`, `TEAMS_*` — vacíos/opcionales, ya permitido por el
  fix de `Joi.string().allow('')` en `validation.schema.ts`.

**Orden recomendado** (por las URLs cruzadas): Render primero → anotar su URL → actualizar
`environment.prod.ts` → push → Vercel → anotar su URL → volver a Render y setear
`FRONTEND_URL`.

## 3. ai-service — Oracle Cloud "Always Free" (VM propia, Docker Compose)

### Intento previo: Hugging Face Spaces (descartado)

Se intentó Hugging Face Spaces (gratis, sin administrar servidor) y se chocó con tres
restricciones seguidas, la última a nivel de cuenta (no de código):
1. SDK **Docker** — bloqueado con candado "Paid", requiere plan de pago.
2. SDK **Gradio** — build resuelto (ver `app/core/llm_client.py`, que ya no depende de
   `google-genai` por el conflicto de `websockets` que esto causó — cambio que se
   mantiene, es una mejora real), pero el hardware por defecto es **ZeroGPU**, que
   exige una función `@spaces.GPU` inexistente en este código.
3. Bajar el hardware de ese Space a **CPU basic** pedía plan PRO, y al crear un Space
   nuevo, **CPU basic aparecía deshabilitado incluso con la cuenta verificada** (email y
   teléfono) — restricción de la cuenta, no de la plantilla.

Los archivos que se llegaron a preparar (`services/ai-service/hf_space_entrypoint.py`,
`README.huggingface.md`, `Dockerfile.huggingface`, `entrypoint.huggingface.sh`) quedan
en el repo sin usarse, por si esta restricción de cuenta se levanta más adelante.

### Por qué Oracle Cloud Always Free

En producción el `ai-service` son **5 procesos**, no uno: la API FastAPI (`app.main:app`)
más 4 *workers* en loop infinito consumiendo Redis Streams (`triage_worker`,
`embedding_worker`, `anomaly_scheduler`, `kb_generator_worker`). Cada uno carga su propia
copia del modelo `BAAI/bge-m3` (~1-2GB en RAM vía `@lru_cache` en
`app/core/embeddings.py`, caché *por proceso*), así que sin fusionarlos el requerimiento
real es de ~6-8GB de RAM repartidos en 5 servicios.

Oracle Cloud "Always Free" da una VM ARM (Ampere A1, hasta 4 OCPU / 24GB RAM) gratis de
por vida — sin fecha de expiración ni upgrade forzado, de sobra para los 5 procesos sin
fusionarlos. La tarjeta que pide al crear la cuenta es solo verificación de identidad
(igual que Google Cloud/AWS free tier), no una función paga como el bloqueo de Docker en
Hugging Face. La diferencia real frente a un PaaS: administras tú la VM (Docker,
firewall, TLS) — no hay un dashboard que lo resuelva por ti.

### Archivos de este repo para este despliegue

- `docker-compose.oracle.yml` — **solo** el ai-service y sus 4 workers (a diferencia de
  `docker-compose.yml`, que además levanta backend/frontend/redis para el despliegue
  on-premise todo-en-uno). No incluye un contenedor Redis propio: usa el mismo Upstash
  que ya configuraste en el backend (Render), para que ambos consuman el mismo stream
  `core-events`. Incluye Caddy para TLS automático (Let's Encrypt).
- `Caddyfile.example` — copiar a `Caddyfile` y poner tu dominio real.

### Pasos para desplegar

1. **Crear cuenta** en [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) —
   pide tarjeta solo para verificación de identidad.
2. **Crear la VM** (Compute → Instances → Create Instance):
   - Imagen: **Ubuntu 22.04 (aarch64/ARM)**, marcada "Always Free eligible".
   - Shape: **VM.Standard.A1.Flex** — usa 2 OCPU / 12GB (deja margen del cupo total de
     4 OCPU/24GB por si más adelante quieres otra instancia).
   - Asigna una **IP pública**.
   - Sube o genera tu clave SSH ahí mismo.
3. **Abrir puertos** en la VCN (Networking → Virtual Cloud Networks → tu VCN →
   Security Lists → Default Security List → Add Ingress Rules): permitir TCP **80** y
   **443** desde `0.0.0.0/0` (el 22 para SSH ya viene abierto por defecto).
4. **Conectarte e instalar Docker**:
   ```bash
   ssh ubuntu@<ip-publica>
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   # cerrar sesión y volver a entrar para que el grupo tome efecto
   sudo apt-get install -y docker-compose-plugin
   ```
   Nota: como la VM es ARM64, algunas dependencias de Python (ej. `torch`, usado por
   `sentence-transformers` para los embeddings) deben tener wheel para `aarch64` o el
   build compila desde fuente (lento, y puede fallar en una VM chica) — si el build
   tarda demasiado o falla en ese paquete, es lo primero a revisar.
5. **Clonar el repo** en la VM:
   ```bash
   git clone <url-de-tu-repo>
   cd <tu-repo>
   ```
6. **Crear `services/ai-service/.env`** (no se commitea) con los valores reales, mismos
   nombres que `services/ai-service/.env.example`:
   - `DATABASE_URL` — la misma Neon Postgres, con `postgresql+asyncpg://` y `?ssl=require`.
   - `REDIS_URL` — el mismo Upstash (`rediss://...`) que usa el backend en Render.
   - `BACKEND_URL` — URL pública del backend en Render + `/api/v1`.
   - `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_PRO`.
   - `EMBEDDING_MODEL_NAME=BAAI/bge-m3`, `EMBEDDING_DIM=1024`.
   - `AI_SERVICE_API_KEY` — el mismo valor configurado en el backend.
   - `TRIAGE_CONFIDENCE_THRESHOLD=0.7`, `LOG_LEVEL=info`.
7. **Dominio + TLS**: si no tienes dominio propio, crea uno gratis en
   [duckdns.org](https://www.duckdns.org) apuntando a la IP pública de la VM. Copia
   `Caddyfile.example` a `Caddyfile` en la raíz del repo y reemplaza el dominio de
   ejemplo por el tuyo.
8. **Levantar todo**:
   ```bash
   docker compose -f docker-compose.oracle.yml up -d --build
   ```
9. **Verificar**: `https://tu-dominio.duckdns.org/health` debería responder
   `{"status": "ok"}`. Logs con `docker compose -f docker-compose.oracle.yml logs -f`.
10. **Backend (Render)**: actualizar `AI_SERVICE_URL` a `https://tu-dominio.duckdns.org`
    y `AI_SERVICE_API_KEY` al mismo valor del paso 6 — mientras esto no esté seteado,
    `ai-client.ts` devuelve 503 sin romper el resto del backend ("modo degradado").
