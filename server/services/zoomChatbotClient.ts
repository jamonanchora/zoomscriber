import { getZoomAccessToken, getChatbotToken } from "./zoomAuth.js";
import { loadConfig } from "../config.js";
import { getAccountId, getRobotJid } from "../db/accountStore.js";

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
    // Try Client Credentials Flow token first (required for chatbot API)
    console.log("Attempting to get chatbot token via Client Credentials Flow...");
    token = await getChatbotToken();
    console.log("Using Client Credentials token for chatbot API");
  } catch (chatbotTokenErr) {
    console.warn("Failed to get Client Credentials token, falling back to OAuth token:", chatbotTokenErr);
    // Fallback to OAuth token (may not work, but worth trying)
    try {
      token = await getZoomAccessToken();
      console.warn("Using OAuth token for chatbot API (may not work)");
    } catch (err) {
      throw new Error(`Failed to get access token: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Get account_id in priority order:
  // 1. From payload (if explicitly provided)
  // 2. From database (from bot_installed webhook - most reliable source)
  // 3. From config/environment (fallback)
  const config = loadConfig();
  let accountId = payload.account_id;
  
  // Try to get from database (from bot_installed webhook) - this is the most reliable source
  const storedAccountId = getAccountId();
  if (!accountId && storedAccountId) {
    accountId = storedAccountId;
    console.log("Using account_id from database (from bot_installed webhook):", accountId);
  }
  
  // Fallback to environment variable if not in database
  if (!accountId) {
    accountId = config.zoomAccountId;
    if (accountId) {
      console.log("Using account_id from environment variable:", accountId);
    }
  }
  
  // Warn if there's a mismatch between stored and env account_id
  if (storedAccountId && config.zoomAccountId && storedAccountId !== config.zoomAccountId) {
    console.warn("⚠️  WARNING: account_id mismatch detected!");
    console.warn("  Database (from bot_installed):", storedAccountId);
    console.warn("  Environment variable:", config.zoomAccountId);
    console.warn("  Using:", accountId);
    console.warn("  The account_id from bot_installed webhook is the correct one to use.");
    console.warn("  If you continue getting 401 errors, verify the environment variable matches the installed account.");
  }
  
  // Fallback: Try to get from OAuth token if not found elsewhere
  if (!accountId) {
    console.warn("account_id not found in payload, config, or database. Attempting to fetch from OAuth token...");
    try {
      const oauthToken = await getZoomAccessToken();
      
      // Try to get account_id from OAuth token payload
      const oauthParts = oauthToken.split(".");
      if (oauthParts.length === 3) {
        const oauthPayload = JSON.parse(Buffer.from(oauthParts[1], "base64").toString());
        const oauthAccountId = oauthPayload.account_id || oauthPayload.aid;
        if (oauthAccountId) {
          accountId = oauthAccountId;
          console.log("Got account_id from OAuth token:", accountId);
        }
      }
      
      // If still no account_id, try fetching from user info with OAuth token
      if (!accountId) {
        const userResp = await fetch("https://api.zoom.us/v2/users/me", {
          headers: { Authorization: `Bearer ${oauthToken}` }
        });
        if (userResp.ok) {
          const userData = (await userResp.json()) as { account_id?: string };
          accountId = userData.account_id;
          console.log("Got account_id from user info:", accountId);
        }
      }
    } catch (err) {
      console.warn("Could not fetch account_id from OAuth token:", err);
    }
  } else if (payload.account_id) {
    console.log("Using account_id from payload:", accountId);
  } else if (config.zoomAccountId) {
    console.log("Using account_id from environment variable:", accountId);
  }

  // Get bot JID from payload, config, or database (in order of preference)
  let robotJid = payload.robot_jid || config.zoomBotJid;
  
  // Try to get from database (from bot_installed webhook)
  if (!robotJid) {
    const storedRobotJid = getRobotJid();
    if (storedRobotJid) {
      robotJid = storedRobotJid;
      console.log("Using robot_jid from database (from bot_installed webhook):", robotJid);
    }
  }
  
  // If not in config or database, try to fetch from API
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
        if (robotJid) {
          console.log("Got robot_jid from API:", robotJid);
        }
      }
    } catch (err) {
      console.warn("Could not fetch bot JID from API:", err);
    }
  }

  const finalPayload: ChatbotMessage = {
    ...payload,
    account_id: accountId,
    robot_jid: robotJid
  };

  // Log detailed information before sending
  console.log("=== Preparing to send chatbot message ===");
  console.log("Account ID:", accountId);
  console.log("  - From payload:", payload.account_id || "not provided");
  console.log("  - From database (bot_installed):", storedAccountId || "not available");
  console.log("  - From environment:", config.zoomAccountId || "not set");
  console.log("  - Final value being used:", accountId);
  console.log("Robot JID:", robotJid);
  console.log("To JID:", payload.to_jid);
  console.log("Visible to user:", payload.visible_to_user || "none (regular message)");
  console.log("Reply to:", payload.reply_to || "none (new message)");
  console.log("Message text:", payload.content.head.text.substring(0, 50) + (payload.content.head.text.length > 50 ? "..." : ""));
  
  // Decode token to log type and scope for debugging
  try {
    const tokenParts = token.split(".");
    if (tokenParts.length === 3) {
      const tokenPayload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());
      console.log("Token type:", tokenPayload.type, "(2 = Client Credentials, 0 = OAuth)");
      // Note: Scope may not be in token payload, it's usually in the response when requesting the token
    }
  } catch {
    // Not a JWT or can't decode, that's fine
  }
  console.log("==========================================");
  
  // Validate all required fields are present
  // According to Zoom API docs, account_id is REQUIRED for all chatbot message requests
  if (!accountId) {
    const errorMsg = [
      "account_id is REQUIRED for chatbot messages but is missing.",
      "",
      "To fix this:",
      "1. Re-install the bot to trigger the 'bot_installed' webhook, which will capture account_id",
      "2. Or set ZOOM_ACCOUNT_ID environment variable",
      "3. Or include account_id in the message payload",
      "",
      "The bot_installed webhook provides accountId in payload.accountId and should be automatically stored."
    ].join("\n");
    throw new Error(errorMsg);
  }

  // Bot JID is required for chatbot messages
  if (!robotJid) {
    throw new Error(
      "Bot JID (robot_jid) is required. " +
      "Set ZOOM_BOT_JID in environment, ensure bot_installed webhook captured it, " +
      "or include robot_jid in the message payload."
    );
  }

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
  
  // account_id is REQUIRED per Zoom API docs - we've already validated it exists above
  chatbotPayload.account_id = accountId;
  console.log("Including account_id in payload:", accountId);
  
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
      console.error("1. Verify Client Credentials token has 'imchat:bot' scope");
      console.error("   - Token type should be 2 (Client Credentials)");
      console.error("   - Scope should include 'imchat:bot' automatically based on app config");
      console.error("2. Check Bot JID is correct:", robotJid);
      console.error("3. Verify account_id is correct:", accountId);
      console.error("   - Should come from bot_installed webhook (payload.accountId)");
      console.error("   - Or set ZOOM_ACCOUNT_ID environment variable");
      console.error("4. Ensure chatbot feature is fully enabled in Zoom app configuration");
      console.error("5. Verify app is properly installed and bot_installed webhook was received");
      console.error("6. Try requesting a new Client Credentials token (they expire after 1 hour)");
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


