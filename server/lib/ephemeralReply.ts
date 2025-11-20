import { sendChatbotMessage } from "../services/zoomChatbotClient.js";

export async function postEphemeralTextReply(params: {
  toJid: string;
  visibleToUserId: string;
  threadTs?: string;
  text: string;
}): Promise<void> {
  const { toJid, visibleToUserId, threadTs, text } = params;
  
  try {
    await sendChatbotMessage({
      to_jid: toJid,
      visible_to_user: visibleToUserId,
      thread_ts: threadTs,
      content: {
        body: [{ type: "message", text }]
      }
    });
  } catch (err) {
    // If ephemeral fails, log but don't fail completely
    // The transcription still worked, we just can't send the reply
    console.error("Failed to send ephemeral reply:", err);
    console.error("Transcription was successful but reply could not be sent.");
    console.error("This usually means:");
    console.error("1. Chatbot feature not properly configured in Zoom app");
    console.error("2. Token missing imchat:bot scope");
    console.error("3. App needs to be re-authorized");
    throw err; // Re-throw so caller knows it failed
  }
}


