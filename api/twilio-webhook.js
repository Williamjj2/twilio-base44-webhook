const axios = require('axios');

// Função para encontrar ou criar um contato
async function findOrCreateContact(apiConfig, fromNumber) {
    const { apiUrl, apiKey } = apiConfig;
    
    // 1. Tenta encontrar o contato pelo número de telefone
    const searchUrl = `${apiUrl}/Contact?phone=eq.${fromNumber}`;
    const searchResponse = await axios.get(searchUrl, { headers: { 'api_key': apiKey } });

    if (searchResponse.data && searchResponse.data.length > 0) {
        return searchResponse.data[0]; // Contato encontrado
    }

    // 2. Se não encontrou, cria um novo contato
    const createUrl = `${apiUrl}/Contact`;
    const newContactData = {
        name: fromNumber, // Usa o número como nome padrão
        phone: fromNumber,
    };
    const createResponse = await axios.post(createUrl, newContactData, { headers: { 'api_key': apiKey, 'Content-Type': 'application/json' } });
    
    return createResponse.data[0]; // Retorna o contato recém-criado
}

// Função para encontrar ou criar uma conversa
async function findOrCreateConversation(apiConfig, contactId) {
    const { apiUrl, apiKey } = apiConfig;
    
    // 1. Tenta encontrar a conversa pelo ID do contato
    const searchUrl = `${apiUrl}/Conversation?contact_id=eq.${contactId}`;
    const searchResponse = await axios.get(searchUrl, { headers: { 'api_key': apiKey } });

    if (searchResponse.data && searchResponse.data.length > 0) {
        return searchResponse.data[0]; // Conversa encontrada
    }

    // 2. Se não encontrou, cria uma nova conversa
    const createUrl = `${apiUrl}/Conversation`;
    const newConversationData = {
        contact_id: contactId,
        last_message: "Nova conversa iniciada",
        last_message_time: new Date().toISOString()
    };
    const createResponse = await axios.post(createUrl, newConversationData, { headers: { 'api_key': apiKey, 'Content-Type': 'application/json' } });
    
    return createResponse.data[0];
}

// Função principal do webhook
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { From, Body, MediaUrl0, To } = req.body;
        const apiConfig = {
            apiUrl: `https://app.base44.com/api/apps/${process.env.BASE44_APP_ID}/entities`,
            apiKey: process.env.BASE44_API_KEY
        };

        // Encontra ou cria o contato e a conversa
        const contact = await findOrCreateContact(apiConfig, From);
        const conversation = await findOrCreateConversation(apiConfig, contact.id);

        // Cria a mensagem no banco de dados da Base44
        const messageData = {
            conversation_id: conversation.id,
            sender_phone: From,
            receiver_phone: To,
            content: Body || "",
            message_type: MediaUrl0 ? 'image' : 'text', // Simples verificação de mídia
            media_url: MediaUrl0 || null,
            is_outgoing: false, // Mensagem recebida
            status: 'delivered', // Status para mensagens recebidas
            twilio_sid: req.body.MessageSid
        };

        await axios.post(`${apiConfig.apiUrl}/Message`, messageData, { headers: { 'api_key': apiConfig.apiKey, 'Content-Type': 'application/json' } });

        // Atualiza a última mensagem na conversa
        await axios.patch(`${apiConfig.apiUrl}/Conversation?id=eq.${conversation.id}`, {
            last_message: Body || "Mídia recebida",
            last_message_time: new Date().toISOString(),
            unread_count: (conversation.unread_count || 0) + 1
        }, { headers: { 'api_key': apiConfig.apiKey, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } });

        // Responde ao Twilio para confirmar o recebimento
        res.status(200).send('<Response/>');

    } catch (error) {
        console.error('Erro no webhook do Twilio:', error.response ? error.response.data : error.message);
        res.status(500).send('Erro interno do servidor');
    }
}
