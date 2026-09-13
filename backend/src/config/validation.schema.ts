import Joi from 'joi';

/** Falla rápido al boot si falta una variable de entorno crítica, en vez de fallar
 * en producción a mitad de una petición. */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().default('helpdesk@empresa.local'),

  REDIS_URL: Joi.string().uri().default('redis://redis:6379'),

  AI_SERVICE_URL: Joi.string().uri().default('http://ai-service:8000'),
  AI_SERVICE_API_KEY: Joi.string().required(),

  FRONTEND_URL: Joi.string().uri().default('http://localhost:4200'),
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),

  // SSO por AD/LDAP (plan `1.txt`, Portal Multi-canal/Integraciones) — todos
  // opcionales: si `LDAP_URL` falta, `POST /auth/login/ldap` responde 503 en vez
  // de fallar al arrancar (no todo despliegue on-premise tiene un directorio).
  LDAP_URL: Joi.string().uri().allow('').optional(),
  LDAP_BIND_DN: Joi.string().allow('').optional(),
  LDAP_BIND_PASSWORD: Joi.string().allow('').optional(),
  LDAP_SEARCH_BASE: Joi.string().allow('').optional(),
  LDAP_SEARCH_FILTER: Joi.string().default('(sAMAccountName={{username}})'),
  LDAP_TLS_REJECT_UNAUTHORIZED: Joi.string().valid('true', 'false').default('true'),

  // Portal Multi-canal (WhatsApp/Slack/Teams) — igualmente opcionales por canal;
  // `ChannelsService` degrada con un 503 propio del canal si falta su config.
  WHATSAPP_VERIFY_TOKEN: Joi.string().allow('').optional(),
  WHATSAPP_APP_SECRET: Joi.string().allow('').optional(),
  WHATSAPP_ACCESS_TOKEN: Joi.string().allow('').optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').optional(),

  SLACK_SIGNING_SECRET: Joi.string().allow('').optional(),
  SLACK_BOT_TOKEN: Joi.string().allow('').optional(),

  TEAMS_APP_ID: Joi.string().allow('').optional(),
  TEAMS_APP_PASSWORD: Joi.string().allow('').optional(),
});
