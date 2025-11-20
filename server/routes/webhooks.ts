import { Router, type Request, type Response } from "express";
import { verifyZoomRequest } from "../lib/verifyZoom.js";
import { seenRecently, markSeen } from "../lib/idempotencyStore.js";
import { runTranscriptionFlow } from "../services/transcribeFlow.js";
import { getChatMessage } from "../services/zoomMessagesClient.js";

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
    const eventId: string | undefined = req.body?.event_id ?? req.body?.eventId;
    if (eventId) {
      if (seenRecently(eventId)) {
        console.log("Duplicate event ignored:", eventId);
        return; // dedupe
      }
      markSeen(eventId);
    }

    const event: string | undefined = req.body?.event;
    console.log("Processing event:", event);

    // Slash command delivery (shape may vary; handle commonly seen fields)
    if (event === "bot_notification" && req.body?.payload?.cmd) {
      const cmd = String(req.body.payload.cmd);
      if (cmd === "/zoomscribe") {
        const toJid = req.body.payload?.toJid || req.body.payload?.to_jid || req.body.payload?.toJID;
        const userId = req.body.payload?.userId || req.body.payload?.user_id || req.body.payload?.userID;
        const threadTs = req.body.payload?.thread_ts || req.body.payload?.threadTs;
        const referencedFileId = req.body.payload?.fileId || req.body.payload?.file_id;
        if (toJid && userId && referencedFileId) {
          await runTranscriptionFlow({ toJid, visibleToUserId: String(userId), fileId: String(referencedFileId), threadTs });
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
      const userId = payload?.operator_id || payload?.operator?.user_id || payload?.reactor?.user_id || payload?.user_id;
      const messageId = payload?.object?.msg_id || payload?.msg_id;
      const contactId = payload?.object?.contact_id || payload?.contact_id;
      const contactMemberId = payload?.object?.contact_member_id;
      const contactEmail = payload?.object?.contact_email;
      
      console.log("Extracted values:", { userId, messageId, contactId, contactMemberId, contactEmail });

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
      console.log("Fetching message details for messageId:", messageId, "toJid:", toJid, "contactEmail:", contactEmail);
      
      let fileId: string | undefined;
      let downloadUrl: string | undefined;
      try {
        const message = await getChatMessage(messageId, toJid, contactEmail);
        if (message) {
          console.log("Message fetched:", JSON.stringify(message, null, 2));
          // File ID can be at top level (file_id) or in files array (files[0].file_id)
          fileId = (message as any)?.file_id || 
                   message?.file?.id || 
                   (message as any)?.files?.[0]?.file_id ||
                   message?.files?.[0]?.id;
          
          // Also check for download_url (direct download link)
          downloadUrl = (message as any)?.download_url || (message as any)?.files?.[0]?.download_url;
          
          console.log("File ID extracted:", fileId);
          console.log("Download URL extracted:", downloadUrl);
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

      console.log("Starting transcription flow...");
      try {
        await runTranscriptionFlow({ 
          toJid: String(toJid), 
          visibleToUserId: String(userId), 
          fileId: fileId ? String(fileId) : "", 
          downloadUrl: downloadUrl,
          threadTs: undefined 
        });
        console.log("Transcription flow completed successfully");
      } catch (err) {
        console.error("Transcription flow error:", err);
      }
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Webhook handling error", err);
  }
});


