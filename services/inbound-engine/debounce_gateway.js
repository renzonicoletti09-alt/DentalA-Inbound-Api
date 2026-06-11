/**
 * DentalA - Debounce Ingestion Gateway (Non-blocking, Asynchronous sliding window)
 */

const http = require('http');
const redisClient = require('../../.agents/scripts/api_clients/redis_client.js');
const { 
  cleanPhoneNumber, 
  extractPhoneNumber, 
  extractMessageText,
  isUnsupportedCall,
  extractName
} = require('./inbound_engine.js');

const DENTALA_N8N_WEBHOOK_URL = process.env.DENTALA_N8N_WEBHOOK_URL || 'https://n8n.dental-a.com/webhook/incoming';

/**
 * Normaliza cualquier payload de entrada (Meta Graph API, Chatwoot webhook, etc.)
 * a una estructura común e invariable (DentalA Webhook Schema).
 * Esto nos protege ante futuros cambios de versiones en la API de Meta Graph.
 */
function normalizeWebhookPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  // Detección de origen
  const isMeta = !!(payload.entry && Array.isArray(payload.entry));
  const isChatwoot = !!(payload.event && (payload.message || payload.conversation || payload.content !== undefined));

  const normalized = {
    source: isMeta ? 'WhatsApp/Meta' : isChatwoot ? 'Chatwoot' : 'Unknown',
    dentist_id: null,
    patient_id: null,
    patient_name: null,
    message_text: '',
    message_id: null,
    timestamp: new Date().toISOString(),
    is_incoming: false,
    media: null
  };

  if (isMeta) {
    const entry = payload.entry[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    
    if (value) {
      const msg = value.messages?.[0];
      if (msg) {
        normalized.is_incoming = true;
        normalized.patient_id = cleanPhoneNumber(msg.from);
        normalized.message_id = msg.id;
        
        if (msg.timestamp) {
          normalized.timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();
        }

        // Extraer texto según el tipo
        if (msg.text?.body) {
          normalized.message_text = msg.text.body;
        } else if (msg.button?.text) {
          normalized.message_text = msg.button.text;
        } else if (msg.interactive) {
          const btnReply = msg.interactive.button_reply;
          if (btnReply?.title) {
            normalized.message_text = btnReply.title;
          }
          const listReply = msg.interactive.list_reply;
          if (listReply?.title) {
            normalized.message_text = listReply.title;
          }
        }

        // Extraer media adjunta si existe
        if (msg.audio) {
          normalized.media = { mime_type: msg.audio.mime_type, media_id: msg.audio.id, type: 'audio' };
        } else if (msg.document) {
          normalized.media = { mime_type: msg.document.mime_type, media_id: msg.document.id, type: 'document' };
        } else if (msg.image) {
          normalized.media = { mime_type: msg.image.mime_type, media_id: msg.image.id, type: 'image' };
        } else if (msg.type === 'unsupported') {
          normalized.media = { type: 'unsupported' };
        }
      }

      const contact = value.contacts?.[0];
      if (contact) {
        normalized.patient_name = contact.profile?.name || null;
        if (!normalized.patient_id) {
          normalized.patient_id = cleanPhoneNumber(contact.wa_id);
        }
      }
    }
  } else if (isChatwoot) {
    const msg = payload.message || {};
    normalized.is_incoming = (payload.message_type === 'incoming' || msg.message_type === 'incoming') && 
                            !(payload.private || msg.private);
    
    normalized.patient_id = extractPhoneNumber(payload);
    normalized.patient_name = extractName(payload);
    normalized.message_id = msg.id || payload.id;
    normalized.timestamp = msg.created_at || payload.created_at || new Date().toISOString();
    normalized.message_text = msg.content || payload.content || '';

    const attachment = msg.attachments?.[0] || payload.attachments?.[0];
    if (attachment) {
      normalized.media = {
        mime_type: 'application/octet-stream',
        media_id: attachment.id,
        url: attachment.data_url,
        type: attachment.file_type || 'document'
      };
    }
  } else {
    // Fallback o pre-normalizado
    normalized.patient_id = extractPhoneNumber(payload);
    normalized.patient_name = extractName(payload);
    normalized.message_text = extractMessageText(payload) || '';
    normalized.is_incoming = true;
  }

  return normalized;
}

/**
 * Extracts dentist_id and patient_id from payload
 */
function parseIdentifiers(normalized, rawPayload, config = {}) {
  let inbox_id = null;
  if (rawPayload) {
    if (rawPayload.inbox && rawPayload.inbox.id !== undefined && rawPayload.inbox.id !== null) {
      inbox_id = rawPayload.inbox.id;
    } else if (rawPayload.conversation && rawPayload.conversation.inbox_id !== undefined && rawPayload.conversation.inbox_id !== null) {
      inbox_id = rawPayload.conversation.inbox_id;
    } else if (rawPayload.inbox_id !== undefined && rawPayload.inbox_id !== null) {
      inbox_id = rawPayload.inbox_id;
    }
  }

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

  const patient_id = normalized.patient_id;
  return { dentist_id, patient_id };
}

/**
 * Helper to recursively poll the Redis lock key.
 * When the lock disappears (silence window has ended), it consumes the queue and forwards.
 */
function scheduleCheck(dentist_id, patient_id, queueKey, lockKey, normalized, forwardCallback) {
  setTimeout(async () => {
    try {
      const lockVal = await redisClient.executeRedisCommand(['GET', lockKey]);
      if (lockVal) {
        // Lock still exists, reschedule check
        scheduleCheck(dentist_id, patient_id, queueKey, lockKey, normalized, forwardCallback);
      } else {
        // Lock has expired! Consume queue
        const messages = await redisClient.executeRedisCommand(['LRANGE', queueKey, '0', '-1']) || [];
        await redisClient.executeRedisCommand(['DEL', queueKey]);

        const combinedText = messages.filter(Boolean).join('\n');
        
        // Modificar el mensaje normalizado con el texto acumulado
        normalized.message_text = combinedText;

        console.log(`[Gateway] Debounce finished for ${patient_id}. Forwarding combined normalized message.`);
        await forwardCallback(normalized);
      }
    } catch (err) {
      console.error(`[Gateway] Error in async debounce check for ${patient_id}:`, err.message);
    }
  }, 500); // Check every 500ms for responsiveness
}

/**
 * Handles the webhook ingestion with non-blocking Redis debouncing
 */
async function handleIngest(payload, forwardCallback, config = {}) {
  const normalized = normalizeWebhookPayload(payload);
  if (!normalized || !normalized.is_incoming) {
    return { action: 'skipped', reason: 'not_incoming_message' };
  }

  const { dentist_id, patient_id } = parseIdentifiers(normalized, payload, config);
  if (!dentist_id || !patient_id) {
    return { action: 'skipped', reason: 'missing_identifiers' };
  }

  normalized.dentist_id = dentist_id;

  const isUnsupported = normalized.media?.type === 'unsupported' || isUnsupportedCall(payload);
  const messageText = normalized.message_text || '';
  
  const emergencyKeywords = ['urgencia', 'urgente', 'dolor', 'accidente', 'sangrado'];
  const isEmergency = emergencyKeywords.some(kw => messageText.toLowerCase().includes(kw));

  if (isUnsupported || isEmergency) {
    console.log(`[Gateway] Bypassing debounce for patient ${patient_id} (Emergency or Unsupported)`);
    if (isEmergency) {
      const queueKey = `triage:queue:${dentist_id}:${patient_id}`;
      const lockKey = `lock:triage:${dentist_id}:${patient_id}`;
      const rateKey = `rate:triage:${dentist_id}:${patient_id}`;
      await redisClient.executeRedisCommand(['DEL', queueKey]);
      await redisClient.executeRedisCommand(['DEL', lockKey]);
      await redisClient.executeRedisCommand(['DEL', rateKey]);
    }
    await forwardCallback(normalized);
    return { action: 'forwarded', reason: isEmergency ? 'emergency' : 'unsupported', patient_id, dentist_id };
  }

  const queueKey = `triage:queue:${dentist_id}:${patient_id}`;
  const lockKey = `lock:triage:${dentist_id}:${patient_id}`;

  // 1. Push current message text to the Redis queue
  await redisClient.executeRedisCommand(['RPUSH', queueKey, messageText]);
  await redisClient.executeRedisCommand(['EXPIRE', queueKey, '86400']);

  // 2. Try to acquire the debounce lock
  const lockAcquired = await redisClient.acquireLock(lockKey, 'locked', 3);

  if (!lockAcquired) {
    // Lock already exists, extend it (refreshing the 3s window)
    await redisClient.extendLock(lockKey, 'locked', 3);
    console.log(`[Gateway] Debounced message for patient ${patient_id}. Lock extended.`);
    return { action: 'debounced', patient_id, dentist_id };
  }

  // Lock acquired! Start background poller. HTTP request returns immediately.
  console.log(`[Gateway] Lock acquired for patient ${patient_id}. Starting debounce check.`);
  scheduleCheck(dentist_id, patient_id, queueKey, lockKey, normalized, forwardCallback);

  return { action: 'timer_started', patient_id, dentist_id };
}

module.exports = {
  handleIngest,
  parseIdentifiers,
  normalizeWebhookPayload
};

// If run directly: node debounce_gateway.js
if (require.main === module) {
  const PORT = process.env.DENTALA_DEBOUNCE_PORT || 8085;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const result = await handleIngest(payload, async (forwardedPayload) => {
            const n8nUrl = DENTALA_N8N_WEBHOOK_URL;
            const resN8n = await fetch(n8nUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(forwardedPayload)
            });
            if (!resN8n.ok) {
              console.error(`[Gateway] Failed to forward to n8n: ${resN8n.status}`);
            }
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...result }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(PORT, () => {
    console.log(`🚀 Debounce Ingestion Gateway running on port ${PORT}`);
  });
}
