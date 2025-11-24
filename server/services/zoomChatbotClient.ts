import { getZoomAccessToken } from "./zoomAuth.js";
import { loadConfig } from "../config.js";

export type ChatbotMessage = {
  to_jid: string; // channel or user JID
  account_id?: string;
  robot_jid?: string; // Bot JID for chatbot messages
  visible_to_user?: string; // User JID (not user ID) for ephemeral messages (admin-managed only)
  user_jid?: string; // User JID (user-managed only, required for user-managed apps)
  reply_to?: string; // Parent message ID to thread the reply
  content: {
    head: {
      text: string;
    };
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
      // For admin-managed OAuth, try to get account_id from token or user info
      // First try decoding token to see if account_id is in there
      let tokenAccountId: string | undefined;
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const tokenPayload = JSON.parse(Buffer.from(parts[1], "base64").toString());
          // Check for account_id or aid (account ID) in token
          tokenAccountId = tokenPayload.account_id || tokenPayload.aid;
          if (tokenAccountId) {
            console.log("Got account_id from token payload:", tokenAccountId, "(from field:", tokenPayload.account_id ? "account_id" : "aid", ")");
          }
          // Also check for other account-related fields
          console.log("Token payload keys:", Object.keys(tokenPayload));
          console.log("Token payload (sanitized):", {
            account_id: tokenPayload.account_id,
            aid: tokenPayload.aid,
            uid: tokenPayload.uid,
            auid: tokenPayload.auid,
            type: tokenPayload.type,
            code: tokenPayload.code,
            aud: tokenPayload.aud,
            iss: tokenPayload.iss,
            exp: tokenPayload.exp,
            iat: tokenPayload.iat
          });
        }
      } catch (err) {
        console.warn("Could not decode token:", err);
      }
      
      // Prefer account_id from token if available (for admin-managed OAuth)
      if (tokenAccountId) {
        accountId = tokenAccountId;
        console.log("Using account_id from token:", accountId);
      } else {
        // If not in token, fetch from user info
        const userResp = await fetch("https://api.zoom.us/v2/users/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (userResp.ok) {
          const userData = (await userResp.json()) as { account_id?: string };
          accountId = userData.account_id;
          console.log("Got account_id from user info:", accountId);
        }
      }
    } catch (err) {
      console.warn("Could not fetch account_id:", err);
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
    has_reply_to: !!payload.reply_to
  });
  
  // Bot JID is required for chatbot messages
  if (!robotJid) {
    throw new Error("Bot JID (robot_jid) is required. Set ZOOM_BOT_JID in environment or ensure bot is configured.");
  }

  // Validate all required fields are present
  // Note: account_id might be optional for admin-managed if inferred from token
  if (!finalPayload.to_jid) {
    throw new Error("to_jid is required but missing.");
  }
  if (!finalPayload.content?.head?.text) {
    throw new Error("content.head.text is required but missing.");
  }

  // Build the correct payload format per Zoom API documentation
  // https://developers.zoom.us/docs/api/chatbot/#tag/chatbot-messages/post/im/chat/messages
  // For admin-managed OAuth, try with and without account_id to see which works
  const chatbotPayload: any = {
    robot_jid: robotJid, // Required: Bot JID
    to_jid: finalPayload.to_jid, // Required: User or channel JID
    content: finalPayload.content // Required: Content with head.text
  };
  
  // Add account_id if we have it (required per API docs, but maybe inferred from token for admin-managed?)
  if (accountId) {
    chatbotPayload.account_id = accountId;
    console.log("Including account_id in payload:", accountId);
  } else {
    console.warn("WARNING: account_id not found, trying without it (may fail for admin-managed)");
  }
  
  // Optional fields per API docs
  // Note: visible_to_user should be a JID (member_id), not a user ID
  if (finalPayload.visible_to_user) {
    // Admin-managed only: User JID for ephemeral messages
    chatbotPayload.visible_to_user = finalPayload.visible_to_user;
  }
  if (finalPayload.reply_to) {
    // Optional: Parent message ID to thread the reply
    chatbotPayload.reply_to = finalPayload.reply_to;
  }
  
  console.log("Chatbot payload:", JSON.stringify(chatbotPayload, null, 2));
  
  // Build headers exactly as shown in API docs
  // https://developers.zoom.us/docs/api/chatbot/#tag/chatbot-messages/post/im/chat/messages
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
  
  console.log("Request URL:", CHATBOT_SEND_URL);
  console.log("Request method: POST");
  console.log("Request headers:", {
    "Content-Type": headers["Content-Type"],
    "Authorization": `Bearer ${token.substring(0, 30)}...`
  });
  
  // Send to chatbot API
  // For admin-managed OAuth, ensure we're using the token correctly
  const resp = await fetch(CHATBOT_SEND_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(chatbotPayload)
  });
  
  // Log full response for debugging
  const responseText = await resp.text();
  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }
  
  console.log("Chatbot API response status:", resp.status);
  console.log("Chatbot API response headers:", Object.fromEntries(resp.headers.entries()));
  console.log("Chatbot API response body:", JSON.stringify(responseData, null, 2));
  
  if (!resp.ok) {
    console.error("Chatbot API error:", resp.status, JSON.stringify(responseData, null, 2));
    console.error("Payload sent:", JSON.stringify(chatbotPayload, null, 2));
    
    // Provide specific error guidance
    if (resp.status === 401) {
      console.error("NOTE: 401 Invalid authorization token error:");
      console.error("1. Verify token has 'imchat:bot' scope (token appears valid for other APIs)");
      console.error("2. Check Bot JID is correct:", robotJid);
      console.error("3. Verify account_id is correct:", accountId);
      console.error("4. For admin-managed OAuth, ensure chatbot feature is fully enabled");
      console.error("5. Try re-authorizing the app to refresh token with all scopes");
      console.error("6. Check if token needs to be a 'chatbot bearer token' vs regular OAuth token");
    } else if (resp.status === 404) {
      console.error("NOTE: 404 error means endpoint not recognized");
      console.error("1. Verify chatbot feature is enabled in Zoom app");
      console.error("2. Check that bot JID is correct:", robotJid);
      console.error("3. Ensure app is published/activated");
    }
    
    throw new Error(`Chatbot send failed: ${resp.status} ${JSON.stringify(responseData)}`);
  }
  
  console.log("Message sent successfully");
}


