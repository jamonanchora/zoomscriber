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
  const token = await getZoomAccessToken();
  const resp = await fetch(CHATBOT_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Chatbot send failed: ${resp.status} ${text}`);
  }
}


