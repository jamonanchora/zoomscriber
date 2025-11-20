import { Router, type Request, type Response } from "express";
import { verifyZoomRequest } from "../lib/verifyZoom.js";
import { seenRecently, markSeen } from "../lib/idempotencyStore.js";
import { runTranscriptionFlow } from "../services/transcribeFlow.js";

export const zoomWebhookRouter = Router();

// Verify signatures and tokens
zoomWebhookRouter.use(verifyZoomRequest);

// Main webhook endpoint
zoomWebhookRouter.post("/", async (req: Request, res: Response) => {
  // Acknowledge immediately (Zoom expects 200 quickly)
  res.status(200).send();

  try {
    const eventId: string | undefined = req.body?.event_id ?? req.body?.eventId;
    if (eventId) {
      if (seenRecently(eventId)) return; // dedupe
      markSeen(eventId);
    }

    const event: string | undefined = req.body?.event;

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
      const emoji = payload?.reaction?.emoji || payload?.reaction_emoji;
      // Normalize pencil matching
      const isPencil = emoji === ":pencil:" || emoji === "pencil" || emoji === "✏️";
      if (!isPencil) return;

      const toJid = payload?.message?.to_jid || payload?.channel?.to_jid || payload?.to_jid;
      const userId = payload?.operator?.user_id || payload?.reactor?.user_id || payload?.user_id;
      const threadTs = payload?.message?.thread_ts || payload?.message?.ts || payload?.thread_ts;

      // Attempt to resolve an attached audio file id from payload
      const fileId = payload?.message?.files?.[0]?.id || payload?.message?.attachments?.[0]?.file_id;

      if (toJid && userId && fileId) {
        await runTranscriptionFlow({ toJid: String(toJid), visibleToUserId: String(userId), fileId: String(fileId), threadTs });
      }
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Webhook handling error", err);
  }
});


