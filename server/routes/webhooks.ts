import { Router, type Request, type Response } from "express";
import { verifyZoomRequest } from "../lib/verifyZoom.js";
import { seenRecently, markSeen } from "../lib/idempotencyStore.js";
import { runTranscriptionFlow } from "../services/transcribeFlow.js";

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
      
      const emoji = payload?.reaction?.emoji || payload?.reaction_emoji || payload?.emoji;
      console.log("Detected emoji:", emoji);
      
      // Normalize pencil matching
      const isPencil = emoji === ":pencil:" || emoji === "pencil" || emoji === "✏️" || emoji?.includes("pencil");
      console.log("Is pencil reaction?", isPencil);
      
      if (!isPencil) {
        console.log("Not a pencil reaction, ignoring");
        return;
      }

      const toJid = payload?.message?.to_jid || payload?.channel?.to_jid || payload?.to_jid || payload?.toJid;
      const userId = payload?.operator?.user_id || payload?.reactor?.user_id || payload?.user_id || payload?.operator_id;
      const threadTs = payload?.message?.thread_ts || payload?.message?.ts || payload?.thread_ts;

      console.log("Extracted values:", { toJid, userId, threadTs });

      // Attempt to resolve an attached audio file id from payload
      const message = payload?.message || {};
      const fileId = message?.files?.[0]?.id || 
                     message?.files?.[0]?.file_id ||
                     message?.attachments?.[0]?.file_id ||
                     message?.attachments?.[0]?.id ||
                     payload?.file_id;

      console.log("File ID found:", fileId);
      console.log("Message structure:", JSON.stringify(message, null, 2));

      if (!toJid || !userId) {
        console.error("Missing required fields - toJid:", toJid, "userId:", userId);
        return;
      }

      if (!fileId) {
        console.error("No file ID found in message. Message may not contain a voice note attachment.");
        return;
      }

      console.log("Starting transcription flow...");
      try {
        await runTranscriptionFlow({ 
          toJid: String(toJid), 
          visibleToUserId: String(userId), 
          fileId: String(fileId), 
          threadTs: threadTs ? String(threadTs) : undefined 
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


