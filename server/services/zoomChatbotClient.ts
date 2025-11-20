import { getZoomAccessToken } from "./zoomAuth.js";
import { loadConfig } from "../config.js";

export type ChatbotMessage = {
  to_jid: string; // channel or user JID
  account_id?: string;
  robot_jid?: string; // Bot JID for chatbot messages
  visible_to_user?: string; // userId to make the message ephemeral
  thread_ts?: string; // thread timestamp/id if applicable
  content: {
    head?: { text?: string };
    body: Array<{ type: string; text?: string }>;
  };
};

// Chatbot API endpoint
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

  // Get bot JID from config or app info if not provided
  let robotJid = payload.robot_jid;
  if (!robotJid) {
    // First try config
    const config = loadConfig();
    robotJid = config.zoomBotJid;
    
    // If not in config, try to fetch from API
    if (!robotJid) {
      try {
        // Fetch app info to get bot JID
        // Note: This endpoint might vary - trying common patterns
        const appResp = await fetch("https://api.zoom.us/v2/chatbots/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (appResp.ok) {
          const appData = (await appResp.json()) as { robot_jid?: string; jid?: string };
          robotJid = appData.robot_jid || appData.jid;
        }
      } catch (err) {
        console.warn("Could not fetch bot JID from API:", err);
      }
    }
  }

  const finalPayload: ChatbotMessage = {
    ...payload,
    account_id: accountId,
    robot_jid: robotJid
  };

  console.log("Sending chatbot message:", {
    account_id: accountId,
    robot_jid: robotJid,
    to_jid: payload.to_jid,
    visible_to_user: payload.visible_to_user,
    has_thread_ts: !!payload.thread_ts
  });
  
  // Bot JID is required for chatbot messages
  if (!robotJid) {
    throw new Error("Bot JID (robot_jid) is required. Set ZOOM_BOT_JID in environment or ensure bot is configured.");
  }

  // Build the correct payload format for chatbot API
  // Based on Zoom's chatbot API documentation
  const chatbotPayload: any = {
    robot_jid: robotJid, // Bot JID is required
    to_jid: finalPayload.to_jid,
    account_id: accountId,
    content: finalPayload.content
  };
  
  // Add optional fields
  if (finalPayload.visible_to_user) {
    chatbotPayload.visible_to_user = finalPayload.visible_to_user;
  }
  if (finalPayload.thread_ts) {
    chatbotPayload.thread_ts = finalPayload.thread_ts;
  }
  
  console.log("Chatbot payload:", JSON.stringify(chatbotPayload, null, 2));
  
  // Send to chatbot API
  const resp = await fetch(CHATBOT_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(chatbotPayload)
  });
  
  if (!resp.ok) {
    const text = await resp.text();
    console.error("Chatbot API error:", resp.status, text);
    console.error("Payload sent:", JSON.stringify(chatbotPayload, null, 2));
    
    // Provide specific error guidance
    if (resp.status === 401) {
      console.error("NOTE: 401 error usually means:");
      console.error("1. Token missing 'imchat:bot' scope");
      console.error("2. Bot JID incorrect:", robotJid);
      console.error("3. Need to re-authorize with chatbot scopes");
      console.error("4. Check that chatbot feature is enabled in Zoom app");
    } else if (resp.status === 404) {
      console.error("NOTE: 404 error means endpoint not recognized");
      console.error("1. Verify chatbot feature is enabled in Zoom app");
      console.error("2. Check that bot JID is correct:", robotJid);
      console.error("3. Ensure app is published/activated");
    }
    
    throw new Error(`Chatbot send failed: ${resp.status} ${text}`);
  }
  
  console.log("Message sent successfully");
}


