import { getZoomAccessToken } from "./zoomAuth.js";

export type ChatMessage = {
  id?: string;
  message?: string;
  file?: {
    id: string;
    name: string;
    size: number;
    type: string;
  };
  files?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
  }>;
  to_channel?: string;
  to_contact?: string;
  to_jid?: string;
};

export async function getChatMessage(messageId: string, toJid: string): Promise<ChatMessage | null> {
  const token = await getZoomAccessToken();
  
  // Zoom Team Chat API: Use chat history/search to find message
  // Try searching for messages in the chat (DM or channel)
  // The toJid should be the contact_member_id for DMs or channel_id for channels
  
  // Use chat messages list/search API
  // Note: This might require pagination or filtering by message ID
  const url = `https://api.zoom.us/v2/team-chat/chat/messages/search`;
  
  try {
    // Search for the specific message by ID
    // Note: Zoom's search API might work differently - this is a placeholder
    // We might need to use chat history with date range instead
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to_jid: toJid,
        search_key: messageId,
        search_type: 1 // Search by message ID if supported
      })
    });
    
    if (!resp.ok) {
      // If search doesn't work, try chat history API
      console.log("Search API failed, trying chat history...");
      return await getMessageFromHistory(messageId, toJid, token);
    }
    
    const data = (await resp.json()) as { messages?: ChatMessage[] };
    const message = data.messages?.find(m => m.id === messageId);
    return message || null;
  } catch (err) {
    console.error("Error fetching message via search:", err);
    // Fallback to history API
    return await getMessageFromHistory(messageId, toJid, token);
  }
}

async function getMessageFromHistory(messageId: string, toJid: string, token: string): Promise<ChatMessage | null> {
  // Use chat history API to get recent messages and find the one with matching ID
  // This is a workaround since direct message fetch might not be available
  const url = `https://api.zoom.us/v2/team-chat/chat/users/me/chat/messages`;
  
  try {
    const resp = await fetch(`${url}?to_jid=${encodeURIComponent(toJid)}&page_size=50`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Chat history API failed: ${resp.status} ${text}`);
      return null;
    }
    
    const data = (await resp.json()) as { messages?: ChatMessage[] };
    const message = data.messages?.find(m => m.id === messageId);
    return message || null;
  } catch (err) {
    console.error("Error fetching from chat history:", err);
    return null;
  }
}

