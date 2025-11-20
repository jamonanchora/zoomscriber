import { sendChatbotMessage } from "../services/zoomChatbotClient.js";

export async function postEphemeralTextReply(params: {
  toJid: string;
  visibleToUserId: string;
  threadTs?: string;
  text: string;
}): Promise<void> {
  const { toJid, visibleToUserId, threadTs, text } = params;
  await sendChatbotMessage({
    to_jid: toJid,
    visible_to_user: visibleToUserId,
    thread_ts: threadTs,
    content: {
      body: [{ type: "message", text }]
    }
  });
}


