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

export async function getChatMessage(messageId: string, toJid: string, contactEmail?: string): Promise<ChatMessage | null> {
  const token = await getZoomAccessToken();
  
  // Zoom Team Chat API: Get a message by ID
  // Endpoint: GET /v2/chat/users/me/messages/{messageId}
  // For DMs: use to_contact parameter with email
  // For channels: use to_channel parameter with channel ID
  
  const url = `https://api.zoom.us/v2/chat/users/me/messages/${encodeURIComponent(messageId)}`;
  
  try {
    // Build query params - prefer contact email for DMs
    const params = new URLSearchParams();
    if (contactEmail) {
      params.append("to_contact", contactEmail);
    } else {
      // If no email, try using toJid as channel ID
      params.append("to_channel", toJid);
    }
    
    const fullUrl = `${url}?${params.toString()}`;
    console.log("Fetching message from:", fullUrl);
    
    const resp = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Failed to fetch message: ${resp.status} ${text}`);
      
      // If to_contact failed and we have toJid, try as channel
      if (contactEmail && resp.status === 404) {
        console.log("Trying as channel instead...");
        const channelUrl = `${url}?to_channel=${encodeURIComponent(toJid)}`;
        const channelResp = await fetch(channelUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (channelResp.ok) {
          return (await channelResp.json()) as ChatMessage;
        }
      }
      return null;
    }
    
    const data = (await resp.json()) as ChatMessage;
    return data;
  } catch (err) {
    console.error("Error fetching message:", err);
    return null;
  }
}

