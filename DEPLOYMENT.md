# Despliegue en producción

Estado: **frontend (Vercel)** y **backend (Render)** documentados y con la config lista.
**ai-service** — análisis de costo/arquitectura hecho, plataforma aún **sin decidir**.

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

## 3. ai-service — hallazgos de arquitectura y costo (pendiente de decidir plataforma)

### El problema no es la plataforma, es cómo se empaquetan los procesos

En producción el `ai-service` son **5 procesos**, no uno:
- La API FastAPI (`app.main:app` — chatbot, copilot, anomaly-clusters bajo demanda).
- 4 *workers* en loop infinito consumiendo Redis Streams: `triage_worker`,
  `embedding_worker`, `anomaly_scheduler`, `kb_generator_worker`
  (ver `docker-compose.yml` raíz — así están modelados hoy, como servicios separados).

Cada proceso que llama a `embed_text`/`embed_batch` (`app/core/embeddings.py`) carga su
**propia copia** del modelo `BAAI/bge-m3` (~1-2GB en RAM) vía `@lru_cache` — el caché es
*por proceso*, no compartido. Si se despliegan los 5 como servicios/contenedores
independientes (tal como sugiere el `docker-compose.yml`), varios de ellos duplican esa
carga de memoria, multiplicando el RAM necesario y, en plataformas tipo Render, el número
de servicios pagos (Render no tiene *Background Workers* gratis).

### El hallazgo: los 4 workers son fusionables en un solo proceso

Revisé los 4 archivos en `app/workers/`: son corutinas `asyncio` pequeñas (33-104 líneas),
sin hilos ni bloqueos, cada una con su propio `async def main()`. Son perfectamente aptas
para correr como *background tasks* (`asyncio.create_task(...)`) dentro del **mismo
proceso** que sirve la API FastAPI, compartiendo el mismo event loop.

**Por qué importa:** al compartir proceso, `_get_model()` (el `@lru_cache` de
`embeddings.py`) se resuelve una sola vez para *todos* los consumidores — el modelo de
embeddings se carga **una vez**, no 2-3 veces. Esto baja el requerimiento de memoria de
"~6-8GB repartidos en 5 servicios" a "~2GB en un solo proceso/servicio".

**Qué falta para esto:** un pequeño entrypoint nuevo (p. ej. `app/combined_runner.py`) que
levante uvicorn y las 4 corutinas `main()` de los workers como tareas de fondo del mismo
proceso — no existe todavía, es la primera tarea de implementación cuando se retome esto.

### Comparativa de plataformas (asumiendo el proceso ya fusionado, ~2GB RAM)

| Opción | Costo aprox. | Esfuerzo | Notas |
|---|---|---|---|
| **Oracle Cloud "Always Free"** | $0/mes de por vida | Alto | VM ARM propia (4 OCPU/24GB) — administra tú Docker, firewall, TLS (Caddy/nginx), updates. El `docker-compose.yml` del repo casi sirve tal cual si no se fusionan los procesos; con fusión, solo correría un contenedor ahí. |
| **Fly.io** | ~$12/mes (shared-cpu-1x/2GB, pago por segundo) | Medio | Reutiliza el `Dockerfile` existente casi sin cambios. Requiere `flyctl` + `fly.toml`. |
| **Render** | Sin confirmar — la tabla de precios no se pudo extraer vía fetch automático; verificar en render.com/pricing antes de decidir | Bajo | Mismo dashboard que el backend; un solo Web Service en vez de 5. |

### Pendiente / próxima decisión

1. Elegir plataforma (Oracle / Fly.io / Render) — **no decidido todavía**.
2. Escribir `app/combined_runner.py` (fusión de los 4 workers + API en un proceso).
3. Adaptar `Dockerfile` para usar ese entrypoint fusionado en vez de solo `uvicorn`.
4. Variables de entorno del ai-service en la plataforma elegida — mismas que
   `services/ai-service/.env` local, cambiando `BACKEND_URL` a la URL pública de Render
   (no `localhost`) y `REDIS_URL` al mismo Upstash usado por el backend.
5. Actualizar `AI_SERVICE_URL`/`AI_SERVICE_API_KEY` en el backend (Render) para apuntar al
   ai-service ya desplegado, reemplazando el valor local/placeholder.
