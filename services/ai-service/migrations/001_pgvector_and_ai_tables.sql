-- Migración inicial del ai-service (Alembic la envuelve; ver alembic/env.py).
-- Habilita pgvector (soportado nativamente por Neon) y crea las tablas ai_*.
-- Todas son propiedad exclusiva de ai-service: el backend Node solo las LEE
-- (nunca escribe en ellas) vía joins/vistas. Ver plan, secciones 2 y 4.

CREATE EXTENSION IF NOT EXISTS vector;

-- Los `id` de las tablas del núcleo (tickets, knowledge_articles, assets, users)
-- son `String @id @default(uuid())` en Prisma, que en Postgres se mapea a TEXT
-- (no al tipo nativo `uuid`) salvo que el schema use `@db.Uuid` explícitamente
-- — no es el caso aquí. Cualquier FK hacia esas tablas debe usar TEXT, o la
-- restricción falla con "datatype mismatch" (SQLSTATE 42804) al crearse.

-- Embeddings para búsqueda semántica (Copilot) sobre tickets resueltos/cerrados.
CREATE TABLE IF NOT EXISTS ai_ticket_embeddings (
    ticket_id       TEXT PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    embedding       vector(1024),
    embedding_model TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_ticket_embeddings_hnsw_idx
    ON ai_ticket_embeddings USING hnsw (embedding vector_cosine_ops);

-- Embeddings de artículos de la Base de Conocimiento (dedup en el generador de KB).
CREATE TABLE IF NOT EXISTS kb_article_embeddings (
    article_id      TEXT PRIMARY KEY REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    embedding       vector(1024),
    embedding_model TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kb_article_embeddings_hnsw_idx
    ON kb_article_embeddings USING hnsw (embedding vector_cosine_ops);

-- Resultado de triaje/clasificación + sentimiento/urgencia (una sola llamada LLM).
CREATE TABLE IF NOT EXISTS ai_ticket_analysis (
    ticket_id            TEXT PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    suggested_category   TEXT,
    suggested_department TEXT,
    suggested_priority   TEXT,
    confidence_category  NUMERIC,
    confidence_priority  NUMERIC,
    sentiment_score      NUMERIC, -- -1..1
    urgency_score        NUMERIC, -- 0..1
    detected_language    TEXT,
    pii_redacted         BOOLEAN NOT NULL DEFAULT false,
    model_used           TEXT,
    prompt_version       TEXT,
    processed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auditoría/explicabilidad de TODA decisión de IA (requisito transversal).
-- `entity_id` es polimórfico (según `entity_type` puede ser un id de `tickets`
-- —TEXT en Prisma— o de `ai_chatbot_sessions` —UUID nativo propio del
-- ai-service—), por eso es TEXT: puede guardar cualquiera de los dos formatos.
CREATE TABLE IF NOT EXISTS ai_decision_log (
    id             BIGSERIAL PRIMARY KEY,
    module         TEXT NOT NULL, -- 'triage' | 'chatbot' | 'copilot' | 'anomaly' | 'sla' | 'kb_generator'
    entity_type    TEXT NOT NULL, -- 'ticket' | 'chatbot_session' | ...
    entity_id      TEXT NOT NULL,
    input_hash     TEXT,
    output         JSONB,
    model_used     TEXT,
    prompt_version TEXT,
    confidence     NUMERIC,
    human_override BOOLEAN NOT NULL DEFAULT false,
    overridden_by  TEXT, -- id de `users` (TEXT en Prisma) cuando un técnico corrige la decisión de la IA
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_chatbot_sessions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               TEXT NOT NULL, -- id de `users` (TEXT en Prisma); sin FK declarada aquí (aplicación la garantiza)
    ticket_id             TEXT REFERENCES tickets(id),
    channel               TEXT, -- 'web' | 'whatsapp' | 'slack' | 'teams'
    resolved_autonomously BOOLEAN NOT NULL DEFAULT false,
    escalated_to_human    BOOLEAN NOT NULL DEFAULT false,
    started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at               TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_chatbot_messages (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES ai_chatbot_sessions(id) ON DELETE CASCADE,
    role       TEXT, -- 'user' | 'assistant' | 'tool'
    content    TEXT,
    tool_calls JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_suggested_responses (
    id               BIGSERIAL PRIMARY KEY,
    ticket_id        TEXT REFERENCES tickets(id) ON DELETE CASCADE,
    technician_id    TEXT, -- id de `users` (TEXT en Prisma)
    draft_text       TEXT,
    source_ticket_ids TEXT[],
    accepted         BOOLEAN,
    edited_text      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_anomaly_clusters (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_label    TEXT,
    ticket_ids       TEXT[],
    affected_asset_id TEXT REFERENCES assets(id),
    severity         TEXT,
    status           TEXT NOT NULL DEFAULT 'open',
    detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_sla_predictions (
    ticket_id               TEXT PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    predicted_eta_hours     NUMERIC,
    model_version           TEXT,
    actual_resolution_hours NUMERIC, -- se rellena al cerrar, para reentrenamiento
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_kb_drafts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ticket_id TEXT REFERENCES tickets(id),
    draft_title      TEXT,
    draft_body       TEXT,
    status           TEXT NOT NULL DEFAULT 'pending_review', -- pending_review | approved | rejected
    reviewed_by      TEXT, -- id de `users` (TEXT en Prisma)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coordinar con el core: habilidades/carga por técnico, usadas por el enrutamiento inteligente.
CREATE TABLE IF NOT EXISTS technician_skills (
    technician_id TEXT NOT NULL, -- id de `users` (TEXT en Prisma)
    category      TEXT NOT NULL,
    skill_level   INT NOT NULL CHECK (skill_level BETWEEN 1 AND 5),
    PRIMARY KEY (technician_id, category)
);
