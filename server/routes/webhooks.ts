import { Router, type Request, type Response } from "express";
import { verifyZoomRequest } from "../lib/verifyZoom.js";
import { seenRecently, markSeen } from "../lib/idempotencyStore.js";
import { runTranscriptionFlow } from "../services/transcribeFlow.js";
import { getChatMessage } from "../services/zoomMessagesClient.js";
import { saveAccountConfig } from "../db/accountStore.js";
import { sendChatbotMessage } from "../services/zoomChatbotClient.js";

export const zoomWebhookRouter = Router();

// Test endpoint (no verification) to check if webhook is reachable
zoomWebhookRouter.get("/test", (_req: Request, res: Response) => {
  res.status(200).json({ message: "Webhook endpoint is reachable", timestamp: new Date().toISOString() });
});

// Verify signatures and tokens
zoomWebhookRouter.use(verifyZoomRequest);

// Main webhook endpoint
zoomWebhookRouter.post("/", async (req: Request, res: Response) => {
  // Log incoming webhook for debugging
  console.log("Webhook received:", {
    event: req.body?.event,
    hasPayload: !!req.body?.payload,
    headers: {
      signature: req.get("x-zm-signature"),
      timestamp: req.get("x-zm-request-timestamp")
    }
  });

  // Acknowledge immediately (Zoom expects 200 quickly)
  res.status(200).send();

  try {
    // Better deduplication: use message ID + user ID + timestamp for reaction events
    const eventId: string | undefined = req.body?.event_id ?? req.body?.eventId;
    const messageId = req.body?.payload?.object?.msg_id || req.body?.payload?.msg_id;
    const userId = req.body?.payload?.operator_id || req.body?.payload?.operator?.user_id;
    const dedupeKey = eventId || (messageId && userId ? `${messageId}-${userId}` : undefined);
    
    if (dedupeKey) {
      if (seenRecently(dedupeKey)) {
        console.log("Duplicate event ignored:", dedupeKey);
        return; // dedupe
      }
      markSeen(dedupeKey);
    }

    const event: string | undefined = req.body?.event;
    console.log("Processing event:", event);

    // Bot installed event - capture account_id and robot_jid
    if (event === "bot_installed") {
      const payload = req.body?.payload ?? {};
      const accountId = payload.accountId || payload.account_id;
      const robotJid = payload.robotJid || payload.robot_jid;
      
      console.log("Bot installed webhook received:", {
        accountId,
        robotJid,
        userId: payload.userId,
        userName: payload.userName
      });
      
      if (accountId) {
        // Save account_id and robot_jid to database
        saveAccountConfig(accountId, robotJid);
        console.log("✓ Account config saved:", { account_id: accountId, robot_jid: robotJid });
        
        // Optionally send a welcome message
        // Note: According to Zoom docs, we can respond to the bot_installed webhook
        // with a Chatbot Message Object, but we need account_id which we just saved
        // For now, we'll just log that we received it
        // The welcome message could be sent here if desired
      } else {
        console.error("bot_installed webhook missing accountId");
      }
      return; // Don't process further for bot_installed events
    }

    // Slash command delivery (shape may vary; handle commonly seen fields)
    if (event === "bot_notification" && req.body?.payload?.cmd) {
      const cmd = String(req.body.payload.cmd);
      if (cmd === "/zoomscribe") {
        const toJid = req.body.payload?.toJid || req.body.payload?.to_jid || req.body.payload?.toJID;
        const userId = req.body.payload?.userId || req.body.payload?.user_id || req.body.payload?.userID;
        const referencedMessageId = req.body.payload?.messageId || req.body.payload?.message_id || req.body.payload?.msg_id;
        const referencedFileId = req.body.payload?.fileId || req.body.payload?.file_id;
        if (toJid && userId && referencedFileId) {
          await runTranscriptionFlow({ 
            toJid, 
            visibleToUserId: String(userId), 
            fileId: String(referencedFileId), 
            messageId: referencedMessageId 
          });
        }
        return;
      }
    }

    // Reaction events: team_chat.channel_reaction_added / team_chat.dm_reaction_added
    if (event === "team_chat.channel_reaction_added" || event === "team_chat.dm_reaction_added") {
      const payload = req.body?.payload ?? {};
      console.log("Reaction event payload:", JSON.stringify(payload, null, 2));
      
      // Emoji is in payload.object.emoji_alias for reaction events
      const emoji = payload?.object?.emoji_alias || payload?.reaction?.emoji || payload?.reaction_emoji || payload?.emoji;
      console.log("Detected emoji:", emoji);
      
      // Normalize pencil matching
      const isPencil = emoji === ":pencil:" || emoji === "pencil" || emoji === "✏️" || emoji?.includes("pencil");
      console.log("Is pencil reaction?", isPencil);
      
      if (!isPencil) {
        console.log("Not a pencil reaction, ignoring");
        return;
      }

      // Extract user and message info from payload
      // For visible_to_user, we need the member_id (JID), not the user_id
      const operatorMemberId = payload?.operator_member_id || payload?.operator?.member_id;
      const userId = payload?.operator_id || payload?.operator?.user_id || payload?.reactor?.user_id || payload?.user_id;
      const messageId = payload?.object?.msg_id || payload?.msg_id;
      const contactId = payload?.object?.contact_id || payload?.contact_id;
      const contactMemberId = payload?.object?.contact_member_id;
      const contactEmail = payload?.object?.contact_email;
      
      if (!userId || !messageId) {
        console.error("Missing required fields - userId:", userId, "messageId:", messageId);
        return;
      }

      // For DMs, toJid is the contact_member_id (JID format)
      // For channels, we'd need channel_id from payload
      const toJid = contactMemberId || contactId;
      
      if (!toJid) {
        console.error("Could not determine toJid from payload");
        return;
      }

      // We need to fetch the message to get the file attachment
      // Zoom's reaction event doesn't include the full message with files
      let fileId: string | undefined;
      let downloadUrl: string | undefined;
      try {
        const message = await getChatMessage(messageId, toJid, contactEmail);
        if (message) {
          // File ID can be at top level (file_id) or in files array (files[0].file_id)
          fileId = (message as any)?.file_id || 
                   message?.file?.id || 
                   (message as any)?.files?.[0]?.file_id ||
                   message?.files?.[0]?.id;
          
          // Also check for download_url (direct download link)
          downloadUrl = (message as any)?.download_url || (message as any)?.files?.[0]?.download_url;
        } else {
          console.error("Could not fetch message - message not found or API error");
        }
      } catch (err) {
        console.error("Error fetching message:", err);
      }

      if (!fileId && !downloadUrl) {
        console.error("No file ID or download URL found. The message may not contain a voice note attachment.");
        return;
      }

      // Use operator_member_id (JID) for visible_to_user, fallback to userId if not available
      const visibleToUser = operatorMemberId || userId;
      
      if (!visibleToUser) {
        console.error("Could not determine visible_to_user (need operator_member_id or userId)");
        return;
      }

      console.log("Starting transcription flow...");
      try {
        await runTranscriptionFlow({ 
          toJid: String(toJid), 
          visibleToUserId: String(visibleToUser), 
          fileId: fileId ? String(fileId) : "", 
          downloadUrl: downloadUrl,
          messageId: messageId // Use messageId for reply_to threading
        });
        console.log("✓ Transcription completed and reply sent");
      } catch (err) {
        console.error("✗ Transcription flow error:", err instanceof Error ? err.message : String(err));
      }
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Webhook handling error", err);
  }
});


