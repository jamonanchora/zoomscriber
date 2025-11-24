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
    // Force refresh token if previous attempt failed (for 401 errors)
    const forceRefresh = process.env.FORCE_REFRESH_CHATBOT_TOKEN === "true";
    if (forceRefresh) {
      process.env.FORCE_REFRESH_CHATBOT_TOKEN = "false"; // Reset after one use
    }
    token = await getChatbotToken();
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
  let accountIdSource = "payload";
  
  if (!accountId && storedAccountId) {
    accountId = storedAccountId;
    accountIdSource = "database (bot_installed/OAuth)";
  }
  
  // Fallback to environment variable if not in database
  if (!accountId) {
    accountId = config.zoomAccountId;
    if (accountId) {
      accountIdSource = "environment variable";
    }
  }
  
  // Warn if there's a mismatch between stored and env account_id
  if (storedAccountId && config.zoomAccountId && storedAccountId !== config.zoomAccountId && accountId === storedAccountId) {
    console.warn(`⚠️  account_id mismatch: database (${storedAccountId}) differs from env (${config.zoomAccountId}). Using database value.`);
  }
  
  // Fallback: Try to get from OAuth token if not found elsewhere
  if (!accountId) {
    try {
      const oauthToken = await getZoomAccessToken();
      
      // Try to get account_id from OAuth token payload
      const oauthParts = oauthToken.split(".");
      if (oauthParts.length === 3) {
        const oauthPayload = JSON.parse(Buffer.from(oauthParts[1], "base64").toString());
        const oauthAccountId = oauthPayload.account_id || oauthPayload.aid;
        if (oauthAccountId) {
          accountId = oauthAccountId;
          accountIdSource = "OAuth token";
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
          if (accountId) {
            accountIdSource = "user info API";
          }
        }
      }
    } catch (err) {
      // Silent fallback - error will be thrown later if account_id is still missing
    }
  }
  
  // Single consolidated log message
  if (accountId) {
    console.log(`account_id: ${accountId} (from ${accountIdSource})`);
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

  // Log essential information before sending (concise)
  console.log(`Sending chatbot message: to=${payload.to_jid.substring(0, 20)}..., account_id=${accountId}, robot_jid=${robotJid}`);
  
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
  
  
  // Build headers exactly as shown in API docs
  // https://developers.zoom.us/docs/api/chatbot/#tag/chatbot-messages/post/im/chat/messages
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
  
  
  // Send to chatbot API
  // For admin-managed OAuth, ensure we're using the token correctly
  const resp = await fetch(CHATBOT_SEND_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(chatbotPayload)
  });
  
  // Parse response
  const responseText = await resp.text();
  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }
  
  if (!resp.ok) {
    console.log(`Chatbot API error ${resp.status}:`, responseData.message || responseData.code || "Unknown error");
  }
  
  if (!resp.ok) {
    if (resp.status === 401) {
      console.error(`❌ Chatbot API returned 401. Check: token has 'imchat:bot' scope, account_id=${accountId}, robot_jid=${robotJid}`);
    }
    throw new Error(`Chatbot send failed: ${resp.status} ${responseData.message || responseData.code || "Unknown error"}`);
  }
}



