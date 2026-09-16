# Despliegue en producción

Estado: **frontend (Vercel)**, **backend (Render)** y **ai-service (Hugging Face
Spaces)** documentados y con la config lista.

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

## 3. ai-service — Hugging Face Spaces (SDK Gradio, free tier)

### Por qué esta plataforma, y por qué SDK Gradio y no Docker

En producción el `ai-service` son **5 procesos**, no uno: la API FastAPI (`app.main:app`)
más 4 *workers* en loop infinito consumiendo Redis Streams (`triage_worker`,
`embedding_worker`, `anomaly_scheduler`, `kb_generator_worker` — ver `docker-compose.yml`
en la raíz, que los modela como 5 contenedores separados para on-premise). Cada uno carga
su propia copia del modelo `BAAI/bge-m3` (~1-2GB en RAM vía `@lru_cache` en
`app/core/embeddings.py`, caché *por proceso*), así que sin fusionarlos el requerimiento
real es de ~6-8GB de RAM repartidos en 5 servicios.

Se evaluó Oracle Cloud "Always Free" (gratis de por vida pero requiere administrar una
VM propia: Docker, firewall, TLS) y Fly.io (ya no tiene tier gratuito real, ~$12/mes).
**Se eligió Hugging Face Spaces**: gratis de por vida en el tier de CPU, con ~16GB de RAM
— de sobra para los 5 procesos sin necesidad de fusionarlos en uno solo — y sin que haya
que administrar servidor, firewall ni certificados TLS.

**El SDK es Gradio, no Docker:** el selector de SDK al crear un Space (`huggingface.co/
new-space`) muestra el SDK **Docker con candado "Paid"** — a diferencia de lo que se
pensó en un primer momento, no es solo una verificación de tarjeta, Hugging Face
directamente lo restringe a planes de pago. **Gradio y Static sí son gratis sin
tarjeta.** El runtime "Gradio" de Spaces simplemente prepara un venv desde
`requirements.txt` y ejecuta el archivo indicado en `app_file` — no exige que el
proceso use la librería `gradio` en sí, solo que algo quede escuchando en el puerto
expuesto. Por eso `hf_space_entrypoint.py` (ver más abajo) es Python puro sin ninguna
llamada a `gradio`: solo aprovecha que este SDK no pide tarjeta.

**Limitación conocida:** un Space gratuito "duerme" tras un período sin tráfico HTTP, y
con él mueren los 4 workers en segundo plano. Se resuelve con un *keep-alive* externo
gratuito (paso 4 más abajo) que llama a `/health` cada pocos minutos.

### Archivos de este repo para el Space

- `services/ai-service/hf_space_entrypoint.py` — arranca los 4 workers como subprocesos
  Python (con reintento si alguno muere) y sirve la API FastAPI existente vía `uvicorn`.
- `services/ai-service/README.huggingface.md` — metadata YAML que Hugging Face requiere
  en la raíz del Space (`sdk: gradio`, `app_file`, puerto, etc.).
- `services/ai-service/Dockerfile.huggingface` y `entrypoint.huggingface.sh` — **no se
  usan por ahora** (quedan listos por si el SDK Docker se habilita más adelante, ej. con
  un plan de pago futuro).

### Pasos para desplegar

1. **Crear el Space**: [huggingface.co/new-space](https://huggingface.co/new-space) →
   SDK **Gradio** → visibilidad Private o Public según prefieras. Esto crea un repo git
   propio del Space (separado de este monorepo).
2. **Copiar el contenido** de `services/ai-service/` (carpeta `app/`, `migrations/`,
   `hf_space_entrypoint.py`) al repo del Space, y además:
   - `requirements.txt` — copiar tal cual y agregar una línea al final: `gradio>=4.0,<5`
     (Hugging Face ya preinstala gradio por el SDK, pero así queda explícito y fijado).
   - `README.huggingface.md` → renombrar a `README.md` en la raíz del Space (Hugging
     Face lee el front matter YAML de ahí para configurar el Space).
   - `Dockerfile.huggingface`/`entrypoint.huggingface.sh` **no** se copian (no se usan
     con SDK Gradio).
3. **Variables de entorno** en Settings → Repository secrets del Space (mismos nombres
   que `services/ai-service/.env.example`):
   - `DATABASE_URL` — la misma Neon Postgres que usa el backend.
   - `REDIS_URL` — el mismo Upstash (`rediss://...`) configurado en el backend (Render).
   - `BACKEND_URL` — URL pública del backend en Render + `/api/v1` (no `localhost`).
   - `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_PRO`.
   - `EMBEDDING_MODEL_NAME=BAAI/bge-m3`, `EMBEDDING_DIM=1024`.
   - `AI_SERVICE_API_KEY` — el mismo valor que `AI_SERVICE_API_KEY` en el backend.
   - `TRIAGE_CONFIDENCE_THRESHOLD=0.7`, `LOG_LEVEL=info`.
4. **Keep-alive**: en [cron-job.org](https://cron-job.org) (gratis) crear un job que
   haga `GET` a `https://<tu-space>.hf.space/health` cada 5-10 minutos, para que el
   Space nunca llegue a dormirse y los workers de Redis Streams sigan consumiendo.
5. **Backend (Render)**: actualizar `AI_SERVICE_URL` a `https://<tu-space>.hf.space` y
   `AI_SERVICE_API_KEY` al mismo valor del paso 3 — mientras esto no esté seteado,
   `ai-client.ts` devuelve 503 sin romper el resto del backend (comportamiento normal en
   "modo degradado").
