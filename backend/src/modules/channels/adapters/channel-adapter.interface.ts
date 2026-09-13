export type ChannelName = 'WHATSAPP' | 'SLACK' | 'TEAMS';

/** Mensaje entrante ya normalizado, sin importar de qué canal vino — es lo
 * único que `ChannelsService` conoce; cada adaptador traduce el formato
 * específico del proveedor a esto. */
export interface InboundChannelMessage {
  channel: ChannelName;
  /** Identificador estable del remitente en ese canal (teléfono de WhatsApp,
   * user ID de Slack, `aadObjectId`/`id` de Teams) — se persiste como
   * `User.externalId` para no duplicar la cuenta "sombra" en cada mensaje. */
  externalUserId: string;
  /** A dónde responder (ver `ChannelAdapter.sendReply`): número de teléfono
   * (WhatsApp), ID de canal (Slack) o `serviceUrl::conversationId` (Teams). */
  externalConversationId: string;
  senderDisplayName: string;
  senderEmail?: string;
  text: string;
}

/** Petición webhook cruda, tal como llega del proveedor — cada adaptador
 * necesita el body ya parseado a JSON para leer sus campos Y el buffer crudo
 * sin parsear para verificar la firma (HMAC/JWT se calculan sobre los bytes
 * exactos recibidos, no sobre una re-serialización). */
export interface RawWebhookRequest {
  rawBody: Buffer;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | undefined>;
}

export interface ChannelAdapter {
  readonly channel: ChannelName;
  /** Si falta alguna variable de entorno del canal, se responde 503 antes de
   * intentar verificar/parsear nada. */
  readonly isConfigured: boolean;

  /** Reto de verificación del webhook (GET con querystring, ej. WhatsApp/Meta).
   * Devuelve el string a responder, o `null` si esta request no es un reto
   * (para que el controller siga con el flujo normal de POST). */
  handleVerificationChallenge?(query: Record<string, string | undefined>): string | null;

  /** Verifica la autenticidad de la request (firma HMAC o JWT según el
   * proveedor). Debe fallar CERRADO: si el canal no está configurado, o si la
   * firma no calza, se rechaza — nunca se asume válido por defecto. */
  verifyRequest(req: RawWebhookRequest): Promise<boolean>;

  /** Algunos proveedores agrupan varios eventos en un solo POST (WhatsApp,
   * Slack); otros mandan uno por request (Teams) — por eso devuelve una lista,
   * que puede venir vacía (ej. eventos que no son mensajes de texto). */
  parseInbound(body: unknown): InboundChannelMessage[];

  /** Envía la confirmación (código del ticket creado) de vuelta al usuario.
   * Nunca lanza: si el canal no está configurado para responder (falta un
   * token de acceso) o la llamada falla, solo se registra en el log — el
   * ticket ya fue creado y no debe perderse por un fallo de la respuesta. */
  sendReply(externalConversationId: string, text: string): Promise<void>;
}
