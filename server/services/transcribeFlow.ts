import { downloadChatFile } from "./../services/zoomFilesClient.js";
import { transcribeAudio } from "./openaiClient.js";
import { postEphemeralTextReply } from "../lib/ephemeralReply.js";

export type TranscribeParams = {
  toJid: string; // channel or user JID where original message lives
  visibleToUserId: string; // reactor/invoker user id for ephemeral
  fileId: string; // file attachment id from the voice note
  threadTs?: string; // thread id/timestamp
};

export async function runTranscriptionFlow(params: TranscribeParams): Promise<void> {
  const { toJid, visibleToUserId, fileId, threadTs } = params;

  const { buffer } = await downloadChatFile(fileId);

  const transcript = await transcribeAudio(buffer, { languageHints: ["en", "es"] });

  const text = transcript && transcript.trim().length > 0 ? transcript.trim() : "(No speech detected)";
  await postEphemeralTextReply({ toJid, visibleToUserId, threadTs, text });
}


