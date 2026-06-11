// ====================================================================
// VERIFICACIÓN DE SEGURIDAD EN WEBHOOKS EN n8n (DENTALA)
// ====================================================================
// Colocar este código en un nodo "Code" (JavaScript) inmediatamente
// después del webhook de entrada de n8n para validar el origen.
// Asegura que no haya suplantación de eventos en producción.

/* --------------------------------------------------------------------
   1. CAL.COM - VERIFICACIÓN DE FIRMA HMAC-SHA256
   --------------------------------------------------------------------
   Requisitos en Cal.com:
   - Configurar un "Secret" al crear el webhook.
   - Guardar ese secreto como variable de entorno en n8n: CALCOM_WEBHOOK_SECRET
   
   Configuración del nodo Code de n8n:
   - Mode: Run Once for Each Item
*/

const crypto = require('crypto');

function verifyCalcomWebhook(event) {
  const signature = event.headers['x-cal-signature-256'];
  const rawBody = event.rawBody; // Requiere "raw body" habilitado en el Webhook de n8n
  const secret = process.env.CALCOM_WEBHOOK_SECRET;

  if (!signature) {
    throw new Error("Falta la firma digital X-Cal-Signature-256 en la cabecera.");
  }

  if (!secret) {
    throw new Error("La variable de entorno CALCOM_WEBHOOK_SECRET no está configurada.");
  }

  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const isSignatureValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(computedSignature, 'hex')
  );

  if (!isSignatureValid) {
    throw new Error("Firma de Webhook de Cal.com inválida. Acceso denegado.");
  }

  return true;
}

/* --------------------------------------------------------------------
   2. CHATWOOT - VALIDACIÓN DE CABECERA DE SEGURIDAD (BEARER TOKEN)
   --------------------------------------------------------------------
   Requisitos en Chatwoot:
   - Al crear el webhook en la consola, añadir cabecera:
     Authorization: Bearer TuTokenSecretoDeChatwootSaaS123
*/

function verifyChatwootWebhook(event) {
  const authHeader = event.headers['authorization'];
  // Reemplazar con la clave cargada dinámicamente desde el entorno o DB para la clínica
  const expectedSecret = process.env.DENTALA_CHATWOOT_WEBHOOK_SECRET || "TuTokenSecretoDeChatwootSaaS123";

  if (!authHeader) {
    throw new Error("Acceso denegado. Cabecera Authorization ausente.");
  }

  const token = authHeader.replace(/^Bearer\s+/, '').trim();
  if (token !== expectedSecret) {
    throw new Error("Acceso denegado. Token de autorización de Chatwoot inválido.");
  }

  return true;
}

/* --------------------------------------------------------------------
   3. EASY!APPOINTMENTS - VALIDACIÓN DE CABECERA DE SEGURIDAD (TOKEN DE WEBHOOK)
   --------------------------------------------------------------------
   Requisitos en Easy!Appointments:
   - Configurar la cabecera del webhook para inyectar:
     X-EA-Webhook-Token: ea_webhook_secret_key_here
*/

function verifyEasyAppointmentsWebhook(event) {
  const tokenHeader = event.headers['x-ea-webhook-token'];
  const expectedSecret = process.env.DENTALA_EASYAPPOINTMENTS_WEBHOOK_SECRET || "ea_webhook_secret_key_here";

  if (!tokenHeader) {
    throw new Error("Acceso denegado. Cabecera X-EA-Webhook-Token ausente.");
  }

  if (tokenHeader !== expectedSecret) {
    throw new Error("Acceso denegado. Token de Easy!Appointments inválido.");
  }

  return true;
}

// Ejemplo de retorno del nodo de n8n según el evento
const eventData = $input.item.json;
const path = eventData.path || "";

// Enrutador de validación lógico en n8n
if (path.includes("chatwoot")) {
  verifyChatwootWebhook(eventData);
} else if (path.includes("easyappointments") || path.includes("agenda")) {
  verifyEasyAppointmentsWebhook(eventData);
} else if (eventData.headers['x-cal-signature-256']) {
  verifyCalcomWebhook(eventData);
}

return {
  json: {
    verified: true,
    data: eventData.body
  }
};
