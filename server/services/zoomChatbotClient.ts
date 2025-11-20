import { getZoomAccessToken } from "./zoomAuth.js";

export type ChatbotMessage = {
  to_jid: string; // channel or user JID
  account_id?: string;
  visible_to_user?: string; // userId to make the message ephemeral
  thread_ts?: string; // thread timestamp/id if applicable
  content: {
    head?: { text?: string };
    body: Array<{ type: string; text?: string }>;
  };
};

const CHATBOT_SEND_URL = "https://api.zoom.us/v2/im/chat/messages";

export async function sendChatbotMessage(payload: ChatbotMessage): Promise<void> {
  let token: string;
  try {
    token = await getZoomAccessToken();
  } catch (err) {
    throw new Error(`Failed to get access token: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Ensure account_id is included if not provided
  const finalPayload = { ...payload };
  if (!finalPayload.account_id) {
    // Try to get account_id from config or token
    const { loadConfig } = await import("../config.js");
    const config = loadConfig();
    // For OAuth apps, account_id might be needed - but we don't have it in config
    // Zoom might extract it from the token, so we'll try without it first
  }

  console.log("Sending chatbot message:", JSON.stringify(finalPayload, null, 2));
  
  const resp = await fetch(CHATBOT_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(finalPayload)
  });
  
  if (!resp.ok) {
    const text = await resp.text();
    console.error("Chatbot API error:", resp.status, text);
    throw new Error(`Chatbot send failed: ${resp.status} ${text}`);
  }
}


