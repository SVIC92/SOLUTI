# Sistema de Gestión de Solicitudes de Soporte TI (Help Desk + IA)

Implementación basada en el plan `crea-un-plan-para-sparkling-thompson.md` a partir de
las especificaciones funcionales originales (`1.txt`, `2.txt`).

## Estructura

```
backend/            Núcleo (NestJS + Prisma) — auth, tickets, notificaciones, reportes,
                     y Fase 2: SLA, CMDB, KB, automatización, CSAT
frontend/            Angular (SPA)
services/ai-service/ Microservicio Python/FastAPI — triaje, chatbot, copilot,
                     detección de anomalías, SLA/sentimiento, generación de KB
docker-compose.yml   Orquestación local/on-premise (backend + ai-service + redis + frontend)
```

Neon Postgres (PostgreSQL gestionado) es la base de datos compartida por `backend` y
`ai-service`, pero vive fuera de `docker-compose.yml` — es un servicio cloud externo.

## Primer arranque (desarrollo local)

1. **Base de datos**: crear un proyecto en [Neon](https://neon.tech) y copiar el
   connection string del endpoint *pooler*.

2. **Backend**:
   ```bash
   cd backend
   cp .env.example .env   # completar DATABASE_URL, JWT secrets, SMTP, AI_SERVICE_API_KEY
   npm install
   npx prisma migrate dev --name init   # crea las tablas del núcleo en Neon
   npm run db:seed                      # siembra roles, categorías y un usuario admin
   npm run start:dev
   ```
   API disponible en `http://localhost:3000/api/v1`, Swagger en `/api/docs`.

3. **ai-service**:
   ```bash
   cd services/ai-service
   cp .env.example .env   # completar DATABASE_URL (misma Neon), GEMINI_API_KEY, AI_SERVICE_API_KEY
   python -m venv .venv && .venv/Scripts/activate  # o source .venv/bin/activate en Linux/Mac
   pip install -r requirements.txt
   # aplicar la migración de pgvector + tablas ai_* (una sola vez):
   psql "$DATABASE_URL" -f migrations/001_pgvector_and_ai_tables.sql
   uvicorn app.main:app --reload --port 8000
   # en otra terminal, el worker de triaje asíncrono:
   python -m app.workers.triage_worker
   ```

4. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm start   # http://localhost:4200
   ```

5. **Redis** (requerido por BullMQ y el bus de eventos hacia ai-service):
   ```bash
   docker run -p 6379:6379 redis:7-alpine
   ```

## Despliegue on-premise

```bash
docker compose up --build
```
Ver `docker-compose.yml` y la sección 8 del plan para detalles de reverse proxy,
backups y variables de entorno en producción.

## Estado actual

Fase 0 (fundaciones) y Fase 1 (MVP) están implementadas: auth JWT + RBAC, CRUD de
tickets con historial/comentarios/asignación, notificaciones email + WebSocket,
reporte de dashboard básico, y el puente hacia `ai-service` (eventos de dominio vía
Redis Streams + endpoints síncronos para chatbot/copilot). El frontend replica el
sistema de diseño "SoluTI_AI" (Tailwind) exportado desde Stitch.

De Fase 2 ya están implementados:
- **SLA** (`backend/src/modules/sla`): políticas de primera respuesta/resolución por
  prioridad, asignación automática al crear/re-priorizar un ticket, cron de alerta
  (`jobs/sla-checker.job.ts`) y endpoint de estado (`GET /tickets/:id/sla-status`).
  Frontend: `/sla` (admin) y contador de SLA en el detalle de ticket.
- **CMDB / Inventario de Activos** (`backend/src/modules/assets`): CRUD de activos y
  vínculo ticket↔activo (`POST /tickets/:id/link-asset`, evento de dominio
  `cmdb.asset.linked_to_ticket`). Frontend: `/assets` y panel de vinculación en el
  detalle de ticket.
- **Base de Conocimiento / Self-Service** (`backend/src/modules/knowledge-base`):
  CRUD de artículos con borrador/publicado (`articleDraftGeneratedByAi` reservado
  para cuando el generador de IA cree borradores). Cualquier usuario autenticado
  busca y lee artículos publicados; ADMIN/TECHNICIAN además ven y editan borradores.
  Frontend: `/knowledge-base` (buscador + listado) y `/knowledge-base/:id` (vista/edición).

- **Automatización y Enrutamiento** (`backend/src/modules/automation` +
  `support-groups`): reglas por categoría (asigna a un técnico o grupo de soporte),
  solo una regla activa por categoría a la vez. `TicketsService.create()` consulta
  la regla vigente y asigna el ticket automáticamente desde su creación (emite
  `ticket.assigned` para que el técnico reciba la notificación). Frontend: `/automation`
  (ADMIN, enlazado desde "Configuración").

- **CSAT / Encuestas de Satisfacción** (`backend/src/modules/surveys`): al cerrar
  un ticket (`SurveyEventsListener` escucha `ticket.closed`), se crea una encuesta
  pendiente y se notifica al solicitante. Solo quien abrió el ticket puede
  responderla (1-5 estrellas + comentario opcional); emite `csat.survey.submitted`
  (ya consumido por `ai-gateway` hacia Redis Streams). Frontend: widget de
  calificación en el detalle de ticket (visible tras el cierre, solo al
  solicitante) y `/surveys` (ADMIN/TECHNICIAN: promedio, tasa de respuesta,
  distribución y listado de respuestas).

Con esto, el plan de `1.txt` queda completo salvo **multicanal/SSO** (Fase 2, la más
compleja, se deja al final).

## Módulos de IA (`2.txt`)

- **Triaje/Clasificación + Sentimiento + Enrutamiento Inteligente** (módulos 1 y 5,
  fusionados): `services/ai-service/app/workers/triage_worker.py` consume
  `ticket.created`, clasifica con Gemini (`modules/triage/classifier.py`, con
  redacción de PII y umbral de confianza — ver `ai_ticket_analysis`/`ai_decision_log`
  para auditoría) y decide el técnico óptimo por carga/habilidad
  (`modules/triage/routing.py`, consulta directa a Postgres — sin LLM). El resultado
  se escribe de vuelta en el core vía `PATCH /internal/ai/tickets/:id/classification`
  (`backend/src/modules/ai-gateway/ai-internal.controller.ts`, autenticado con API
  key de servicio, no JWT de usuario) — solo auto-asigna si el ticket no tiene ya un
  técnico asignado a mano. Frontend: panel "Análisis de Triaje IA" en el detalle de
  ticket (categoría/prioridad sugerida, sentimiento, ETA) cuando ai-service ya
  procesó el ticket.
- **Chatbot Nivel 1** (módulo 2): `ai-service/app/modules/chatbot` — clasifica la
  intención del mensaje (Gemini + salida estructurada) y solo ejecuta de forma
  *realmente* autónoma lo que puede resolver con datos reales del core:
  `check_ticket_status` (consulta el ticket del propio usuario) y `search_kb`
  (busca en artículos publicados). Como este despliegue on-premise no tiene
  integraciones externas reales (Azure AD/Okta/Cisco), las acciones
  `reset_password` / `unlock_account` / `restart_service` no se simulan — en su
  lugar escalan de forma transparente creando un ticket real vía
  `POST /internal/ai/tickets` (mismo patrón de API key de servicio que el
  triaje). Toda la conversación se audita en `ai_chatbot_sessions` /
  `ai_chatbot_messages`, y tras 2 turnos sin resolución concreta también escala.
  Frontend: `/chatbot` (chat en tiempo real, badges de "Resuelto
  automáticamente" / "Derivado a un técnico").
- **Copilot para Técnicos** (módulo 3): `ai-service/app/workers/embedding_worker.py`
  (nuevo) escucha `ticket.resolved`/`ticket.closed` y genera el embedding
  (título + descripción + último comentario) hacia `ai_ticket_embeddings` —
  pieza que faltaba para que la búsqueda semántica devolviera resultados.
  `modules/copilot/service.py` ya tenía la búsqueda por similitud (pgvector,
  ahora también filtrable por categoría) y el generador de borradores con
  Gemini. Frontend: panel "Copilot para Técnicos" en el detalle de ticket
  (solo TECHNICIAN/ADMIN) — notas breves → busca tickets similares ya resueltos
  y/o genera un borrador de respuesta con un botón para insertarlo directo en
  el compositor de comentarios.
- **Detección de Anomalías / Clusterización** (módulo 4): nuevo
  `ai-service/app/workers/anomaly_scheduler.py` — cada 10 min agrupa (DBSCAN
  sobre embeddings calculados al vuelo, sin depender de `ai_ticket_embeddings`
  que solo cubre tickets ya resueltos) los tickets abiertos de la última hora;
  si ≥3 son semánticamente similares, crea un clúster en `ai_anomaly_clusters`
  y notifica a todo el equipo ADMIN (`POST /internal/ai/anomaly-alert`, mismo
  patrón de API key de servicio). Los clústeres ya reportados se amplían en
  silencio en vez de reenviar alertas duplicadas. El Análisis Predictivo de
  fallas de componentes (a partir de historial CMDB) queda diferido, tal como
  indica el propio plan — requiere meses de datos que este despliegue recién
  empezado aún no tiene. Frontend: `/anomalies` (ADMIN/TECHNICIAN).
- **Generación Automática de Documentación** (módulo 6): nuevo
  `ai-service/app/workers/kb_generator_worker.py` — al resolver/cerrar un
  ticket "complejo" (con interacción real y una resolución de cierta extensión;
  los triviales se descartan) genera un borrador de artículo con Gemini,
  generalizado y sin datos del caso puntual. Antes de crearlo, comprueba por
  similitud de embedding que no exista ya un artículo publicado casi idéntico
  (`kb_article_embeddings`). El borrador se crea vía
  `POST /internal/ai/knowledge-articles` como un `KnowledgeArticle` normal con
  `isPublished: false` y `articleDraftGeneratedByAi: true` — **la UI de
  revisión/publicación ya existente de la Base de Conocimiento** (`/knowledge-base`)
  lo maneja sin cambios, ya que se diseñó desde el principio para soportar
  borradores generados por IA.
- **SLA automático / ETA por ML**: el esqueleto ya existe (`ai_sla_predictions`)
  pero falta completarlo — el propio plan indica que requiere 500-1000+ tickets
  cerrados para entrenar una estimación razonable, algo que este despliegue
  recién empezado todavía no tiene.
