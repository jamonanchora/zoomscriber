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

  // Get account_id from user info if not provided
  let accountId = payload.account_id;
  if (!accountId) {
    try {
      // Fetch user info to get account_id
      const userResp = await fetch("https://api.zoom.us/v2/users/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (userResp.ok) {
        const userData = (await userResp.json()) as { account_id?: string };
        accountId = userData.account_id;
      }
    } catch (err) {
      console.warn("Could not fetch account_id from user info:", err);
    }
  }

  const finalPayload: ChatbotMessage = {
    ...payload,
    account_id: accountId
  };

  console.log("Sending chatbot message:", {
    account_id: accountId,
    to_jid: payload.to_jid,
    visible_to_user: payload.visible_to_user,
    has_thread_ts: !!payload.thread_ts
  });
  
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
    console.error("Payload sent:", JSON.stringify(finalPayload, null, 2));
    
    // If 401, suggest checking scopes
    if (resp.status === 401) {
      console.error("NOTE: 401 error usually means:");
      console.error("1. Token missing 'imchat:bot' scope");
      console.error("2. Need to re-authorize with chatbot scopes");
      console.error("3. Check Zoom app scopes include: imchat:bot, chat_message:write");
    }
    
    throw new Error(`Chatbot send failed: ${resp.status} ${text}`);
  }
  
  console.log("Chatbot message sent successfully");
}


