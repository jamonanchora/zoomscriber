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

  console.log("Transcription flow started:", { toJid, visibleToUserId, fileId, threadTs });

  try {
    console.log("Downloading file:", fileId);
    const { buffer } = await downloadChatFile(fileId);
    console.log("File downloaded, size:", buffer.length, "bytes");

    console.log("Sending to OpenAI for transcription...");
    const transcript = await transcribeAudio(buffer, { languageHints: ["en", "es"] });
    console.log("Transcription received:", transcript.substring(0, 100) + "...");

    const text = transcript && transcript.trim().length > 0 ? transcript.trim() : "(No speech detected)";
    console.log("Posting ephemeral reply...");
    await postEphemeralTextReply({ toJid, visibleToUserId, threadTs, text });
    console.log("Ephemeral reply posted successfully");
  } catch (err) {
    console.error("Error in transcription flow:", err);
    throw err;
  }
}


