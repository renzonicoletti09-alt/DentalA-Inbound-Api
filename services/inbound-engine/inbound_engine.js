/**
 * DentalA - Módulo 3 Parte 1: Inbound Engine (Webhook Ingestion & Onboarding)
 */

const supabaseClient = require('../../.agents/scripts/api_clients/supabase_client.js');
const chatwootClient = require('../../.agents/scripts/api_clients/chatwoot_client.js');
const redisClient = require('../../.agents/scripts/api_clients/redis_client.js');

/**
 * Extracts and cleans the patient's phone number to E.164 format.
 * Preserves leading '+' if present. Ensure it has at least 8 digits.
 */
function cleanPhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null;
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)]/g, '');
  cleaned = cleaned.replace(/[^\+\d]/g, '');
  if (cleaned && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  const digitCount = (cleaned.match(/\d/g) || []).length;
  if (!cleaned.startsWith('+') || digitCount < 8) {
    return null;
  }
  return cleaned;
}

/**
 * Extracts raw phone number from various potential webhook paths (Meta & Chatwoot).
 */
function extractRawPhoneNumber(payload) {
  if (!payload) return null;
  if (payload.patient_id !== undefined) return payload.patient_id;
  if (payload.sender_id !== undefined) return payload.sender_id;

  // 1. Meta Webhook Paths
  if (payload.entry && Array.isArray(payload.entry) && payload.entry[0]) {
    const entry = payload.entry[0];
    if (entry.changes && Array.isArray(entry.changes) && entry.changes[0]) {
      const change = entry.changes[0];
      const val = change.value;
      if (val) {
        if (val.messages && Array.isArray(val.messages) && val.messages[0]) {
          const msg = val.messages[0];
          if (msg.from) {
            return msg.from;
          }
        }
        if (val.contacts && Array.isArray(val.contacts) && val.contacts[0]) {
          const contact = val.contacts[0];
          if (contact.wa_id) {
            return contact.wa_id;
          }
        }
      }
    }
  }

  // 2. Chatwoot Webhook Paths
  const paths = [
    payload.sender?.phone_number,
    payload.contact?.phone_number,
    payload.meta?.sender?.phone_number,
    payload.conversation?.meta?.sender?.phone_number,
    payload.message?.sender?.phone_number,
    payload.event_info?.sender?.phone_number,
    payload.phone_number
  ];

  for (const p of paths) {
    if (p && typeof p === 'string' && p.trim().length > 0) {
      return p;
    }
  }

  return null;
}

/**
 * Extracts phone number from various potential webhook paths (Meta & Chatwoot) and cleans it.
 */
function extractPhoneNumber(payload) {
  const raw = extractRawPhoneNumber(payload);
  return cleanPhoneNumber(raw);
}

/**
 * Extracts the contact's name from Chatwoot or Meta webhooks.
 */
function extractName(payload) {
  if (!payload) return null;
  if (payload.patient_name !== undefined) return payload.patient_name;

  // 1. Meta Webhook Paths
  if (payload.entry && Array.isArray(payload.entry) && payload.entry[0]) {
    const entry = payload.entry[0];
    if (entry.changes && Array.isArray(entry.changes) && entry.changes[0]) {
      const change = entry.changes[0];
      const val = change.value;
      if (val && val.contacts && Array.isArray(val.contacts) && val.contacts[0]) {
        const contact = val.contacts[0];
        if (contact.profile && contact.profile.name) {
          return contact.profile.name;
        }
      }
    }
  }

  // 2. Chatwoot Webhook Paths
  const paths = [
    payload.sender?.name,
    payload.contact?.name,
    payload.meta?.sender?.name,
    payload.conversation?.meta?.sender?.name,
    payload.message?.sender?.name,
    payload.name
  ];

  for (const name of paths) {
    if (name && typeof name === 'string' && name.trim().length > 0) {
      return name.trim();
    }
  }

  return null;
}

/**
 * Extracts the message text from Meta or Chatwoot webhooks.
 */
function extractMessageText(payload) {
  if (!payload) return '';
  if (payload.message_text !== undefined) return payload.message_text;

  // 1. Meta Webhook Paths
  if (payload.entry && Array.isArray(payload.entry) && payload.entry[0]) {
    const entry = payload.entry[0];
    if (entry.changes && Array.isArray(entry.changes) && entry.changes[0]) {
      const change = entry.changes[0];
      const val = change.value;
      if (val && val.messages && Array.isArray(val.messages) && val.messages[0]) {
        const msg = val.messages[0];
        if (msg.text && typeof msg.text.body === 'string') {
          return msg.text.body;
        }
        if (msg.button && typeof msg.button.text === 'string') {
          return msg.button.text;
        }
        if (msg.interactive) {
          const btnReply = msg.interactive.button_reply;
          if (btnReply && typeof btnReply.title === 'string') {
            return btnReply.title;
          }
          const listReply = msg.interactive.list_reply;
          if (listReply && typeof listReply.title === 'string') {
            return listReply.title;
          }
        }
      }
    }
  }

  // 2. Chatwoot Webhook Paths
  if (payload.message && typeof payload.message.content === 'string') {
    return payload.message.content;
  }
  if (typeof payload.content === 'string') {
    return payload.content;
  }

  return '';
}

/**
 * Checks if the webhook payload represents an unsupported voice or video call.
 */
function isUnsupportedCall(payload) {
  if (!payload) return false;
  if (payload.is_unsupported !== undefined) return payload.is_unsupported;
  if (payload.media && payload.media.type === 'unsupported') return true;

  // 1. Direct messages structure or Meta entry structure
  if (payload.messages && Array.isArray(payload.messages) && payload.messages[0]) {
    const msg = payload.messages[0];
    if (msg.type === 'unsupported' && msg.errors && Array.isArray(msg.errors) && msg.errors[0]) {
      if (msg.errors[0].code === 131050) {
        return true;
      }
    }
  }

  if (payload.entry && Array.isArray(payload.entry) && payload.entry[0]) {
    const entry = payload.entry[0];
    if (entry.changes && Array.isArray(entry.changes) && entry.changes[0]) {
      const change = entry.changes[0];
      const value = change.value;
      if (value && value.messages && Array.isArray(value.messages) && value.messages[0]) {
        const msg = value.messages[0];
        if (msg.type === 'unsupported' && msg.errors && Array.isArray(msg.errors) && msg.errors[0]) {
          if (msg.errors[0].code === 131050) {
            return true;
          }
        }
      }
    }
  }

  // 2. Chatwoot structure representing unsupported calls
  if (payload.content === 'unsupported' || payload.message?.content === 'unsupported') {
    return true;
  }

  const chatwootMsg = payload.message || payload;
  if (chatwootMsg) {
    const attrs = chatwootMsg.additional_attributes || chatwootMsg.meta || {};
    if (attrs.type === 'unsupported' || attrs.errors?.[0]?.code === 131050) {
      return true;
    }
  }

  return false;
}

/**
 * Processes an inbound webhook payload (Meta or Chatwoot).
 * Performs onboarding if patient doesn't exist, and call rescue if it's an unsupported call.
 *
 * @param {Object} payload Webhook payload
 * @param {Object} config Override configurations (e.g. url, key)
 * @returns {Promise<Object>} Process result { success, action, patient_id, dentist_id }
 */
async function processInboundWebhook(payload, config = {}) {
  // 0. Validate webhook direction & event filtering
  if (!payload || typeof payload !== 'object') {
    return { success: true, action: 'skipped', reason: 'not_incoming_message' };
  }

  // Support for pre-normalized webhook payloads
  if (payload.patient_id !== undefined && payload.is_incoming !== undefined) {
    if (!payload.is_incoming) {
      return { success: true, action: 'skipped', reason: 'not_incoming_message' };
    }
  } else {
    // Legacy raw webhook format checks
    const isMeta = !!(payload.entry && Array.isArray(payload.entry));

    if (isMeta) {
      const entry = payload.entry[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      if (!value || !value.messages || !Array.isArray(value.messages) || value.messages.length === 0) {
        return { success: true, action: 'skipped', reason: 'not_incoming_message' };
      }
    } else {
      // Chatwoot Check
      const event = payload.event;
      const messageType = payload.message_type || payload.message?.message_type;
      const isPrivate = payload.private !== undefined ? payload.private : payload.message?.private;

      if (event !== 'message_created' || messageType !== 'incoming' || isPrivate !== false) {
        return { success: true, action: 'skipped', reason: 'not_incoming_message' };
      }
    }
  }

  // 1. Extract inbox_id
  let inbox_id = null;
  if (payload) {
    if (payload.inbox && payload.inbox.id !== undefined && payload.inbox.id !== null) {
      inbox_id = payload.inbox.id;
    } else if (payload.conversation && payload.conversation.inbox_id !== undefined && payload.conversation.inbox_id !== null) {
      inbox_id = payload.conversation.inbox_id;
    } else if (payload.inbox_id !== undefined && payload.inbox_id !== null) {
      inbox_id = payload.inbox_id;
    }
  }

  // 2. Map inbox_id to dentist_id
  let dentist_id = null;
  const mapStr = config.inboxDentistMap || process.env.DENTALA_INBOX_DENTIST_MAP;
  if (inbox_id !== null && inbox_id !== undefined && mapStr) {
    try {
      const map = typeof mapStr === 'string' ? JSON.parse(mapStr) : mapStr;
      dentist_id = map[inbox_id] || map[String(inbox_id)];
    } catch (e) {
      console.error("Error parsing DENTALA_INBOX_DENTIST_MAP:", e.message);
    }
  }

  if (!dentist_id) {
    return { success: false, error: 'unmapped_inbox' };
  }

  // 3. Extract patient's phone number
  const rawPhone = extractRawPhoneNumber(payload);
  if (!rawPhone) {
    throw new Error("Patient phone number could not be extracted from the webhook payload.");
  }

  const patient_id = cleanPhoneNumber(rawPhone);
  if (!patient_id) {
    return { success: false, error: 'invalid_phone_number' };
  }

  // 4. Dentist Phone Bypass
  const dentists = await supabaseClient.apiRequest(`/dentists?dentist_id=eq.${dentist_id}`, { method: 'GET' }, config);
  if (dentists && dentists.length > 0) {
    const dentist = dentists[0];
    const dentistPhone = cleanPhoneNumber(dentist.phone);
    if (dentistPhone && dentistPhone === patient_id) {
      return {
        success: true,
        action: 'skipped',
        reason: 'sender_is_dentist',
        patient_id,
        dentist_id
      };
    }
  }

  // 5. Check if patient exists in Supabase (Lightweight metadata query)
  let patient = await supabaseClient.getPatientStatus(dentist_id, patient_id, config);
  let action = 'existing';

  if (!patient) {
    // Onboarding
    const name = extractName(payload) || "Paciente Nuevo WhatsApp";
    const body = JSON.stringify({
      dentist_id,
      patient_id,
      name,
      origin_channel: "WhatsApp",
      session_status: "bot_active"
    });
    await supabaseClient.apiRequest('/patients', { method: 'POST', body }, config);
    action = 'onboarded';
    patient = {
      dentist_id,
      patient_id,
      name,
      origin_channel: "WhatsApp",
      session_status: "bot_active"
    };
  }

  const messageText = extractMessageText(payload);
  const emergencyKeywords = ['urgencia', 'urgente', 'dolor', 'accidente', 'sangrado'];
  const hasEmergencyKeyword = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return emergencyKeywords.some(kw => lower.includes(kw));
  };
  const isEmergency = hasEmergencyKeyword(messageText);

  // Check rate limiting & blocking bypass for human chat (non bot_active status)
  const isBotActive = patient.session_status === 'bot_active';

  // Check unsupported call (Call Rescue)
  const isUnsupported = isUnsupportedCall(payload);
  if (isUnsupported) {
    const templateName = process.env.DENTALA_CALL_RESCUE_TEMPLATE_NAME || "call_rescue";
    const fallbackContent = `¡Hola! Veo que intentaste llamarnos por aquí. Esta línea no recibe llamadas de voz tradicionales, pero estamos activos para chatear. Si es una urgencia, responde con la palabra 'URGENCIA'. Si deseas agendar, responde con 'AGENDAR'.`;
    
    // Fallback inbox_id if it's undefined
    const finalInboxId = inbox_id || process.env.DENTALA_CHATWOOT_INBOX_ID || 3;

    await chatwootClient.sendWhatsAppMessage(
      finalInboxId,
      patient_id,
      fallbackContent,
      templateName,
      [],
      config
    );

    return {
      success: true,
      action: 'call_rescue',
      patient_id,
      dentist_id
    };
  }

  // Emergency bypass
  if (isEmergency) {
    await supabaseClient.updatePatient(dentist_id, patient_id, {
      session_status: 'human_escalated'
    }, config);

    // Delete Redis keys on emergency bypass
    try {
      const queueKey = `triage:queue:${dentist_id}:${patient_id}`;
      const lockKey = `lock:triage:${dentist_id}:${patient_id}`;
      await redisClient.executeRedisCommand(['DEL', queueKey]);
      await redisClient.executeRedisCommand(['DEL', lockKey]);
    } catch (redisErr) {
      console.error("⚠️ Error deleting Redis keys for emergency:", redisErr.message);
    }

    try {
      const chatwootName = extractName(payload) || "Paciente Emergencia";
      const contact = await chatwootClient.getOrCreateContact(patient_id, chatwootName, config);
      const finalInboxId = inbox_id || process.env.DENTALA_CHATWOOT_INBOX_ID || 3;
      const conversation = await chatwootClient.getOrCreateConversation(finalInboxId, contact, config);
      const conversationId = conversation.id;
      const noteContent = `⚠️ ALERTA DE URGENCIA: El paciente ha enviado un mensaje de emergencia. Detalle del mensaje: "${messageText}". Canal de triage desactivado. Estado cambiado a human_escalated.`;
      await chatwootClient.createPrivateNote(conversationId, noteContent, config);
    } catch (cwErr) {
      console.error("⚠️ Error creating Chatwoot private note for emergency:", cwErr.message);
    }

    return {
      success: true,
      action: 'processed',
      patient_id,
      dentist_id,
      text: messageText,
      emergency: true
    };
  }

  return {
    success: true,
    action: action,
    patient_id,
    dentist_id,
    text: messageText
  };
}

module.exports = {
  processInboundWebhook,
  cleanPhoneNumber,
  extractPhoneNumber,
  extractName,
  isUnsupportedCall,
  extractMessageText
};
