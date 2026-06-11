const axios = require('axios');

const CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://chatwood.dental-a.com';
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_KEY;

const api = axios.create({
    baseURL: `${CHATWOOT_URL}/api/v1`,
    headers: { 'api_access_token': CHATWOOT_API_KEY }
});

async function sendWhatsAppMessage(dentist_id, account_id, inbox_id, phone_number, content) {
    if (!dentist_id) throw new Error("dentist_id obligatorio para registro de logs.");
    
    // Nota: El envío de Plantillas Meta se delega a n8n de forma nativa vía el Sub-workflow
    const response = await api.post(`/accounts/${account_id}/conversations/messages`, {
        inbox_id: inbox_id,
        source_id: phone_number,
        content: content,
        message_type: 'outgoing'
    });
    return response.data;
}

async function createPrivateNote(dentist_id, account_id, conversation_id, content) {
    if (!dentist_id) throw new Error("dentist_id obligatorio.");
    
    const response = await api.post(`/accounts/${account_id}/conversations/${conversation_id}/messages`, {
        content: content,
        message_type: 'outgoing',
        private: true
    });
    return response.data;
}

async function assignConversation(dentist_id, account_id, conversation_id, agent_id) {
    if (!dentist_id) throw new Error("dentist_id obligatorio.");
    
    const response = await api.post(`/accounts/${account_id}/conversations/${conversation_id}/assignments`, {
        assignee_id: agent_id
    });
    return response.data;
}

module.exports = {
    sendWhatsAppMessage,
    createPrivateNote,
    assignConversation
};
