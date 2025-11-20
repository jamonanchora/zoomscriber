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

// Try both endpoints - chatbot API and team chat API
const CHATBOT_SEND_URL = "https://api.zoom.us/v2/im/chat/messages";
const TEAM_CHAT_SEND_URL = "https://api.zoom.us/v2/team-chat/chat/messages";

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
  
  // Try chatbot API first
  let resp = await fetch(CHATBOT_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(finalPayload)
  });
  
  // If chatbot API fails with 401, try team chat API as fallback
  if (!resp.ok && resp.status === 401) {
    console.log("Chatbot API returned 401, trying Team Chat API instead...");
    
    // Team Chat API might use slightly different payload format
    const teamChatPayload = {
      to_jid: finalPayload.to_jid,
      message: finalPayload.content.body[0]?.text || "",
      visible_to_user: finalPayload.visible_to_user,
      thread_ts: finalPayload.thread_ts
    };
    
    resp = await fetch(TEAM_CHAT_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(teamChatPayload)
    });
  }
  
  if (!resp.ok) {
    const text = await resp.text();
    console.error("Chat API error:", resp.status, text);
    console.error("Payload sent:", JSON.stringify(finalPayload, null, 2));
    
    // If 401, suggest checking scopes
    if (resp.status === 401) {
      console.error("NOTE: 401 error usually means:");
      console.error("1. Token missing 'imchat:bot' scope (for chatbot API)");
      console.error("2. Token missing 'chat_message:write' scope (for team chat API)");
      console.error("3. Need to re-authorize with correct scopes");
      console.error("4. For admin OAuth, chatbot feature may need special configuration");
    }
    
    throw new Error(`Chat send failed: ${resp.status} ${text}`);
  }
  
  console.log("Message sent successfully");
}


