import { downloadChatFile } from "./../services/zoomFilesClient.js";
import { transcribeAudio } from "./openaiClient.js";
import { postEphemeralTextReply } from "../lib/ephemeralReply.js";
import { ensureSupportedFormat } from "./audioConverter.js";

export type TranscribeParams = {
  toJid: string; // channel or user JID where original message lives
  visibleToUserId: string; // reactor/invoker user id for ephemeral
  fileId: string; // file attachment id from the voice note
  downloadUrl?: string; // direct download URL (alternative to fileId)
  threadTs?: string; // thread id/timestamp
};

export async function runTranscriptionFlow(params: TranscribeParams): Promise<void> {
  const { toJid, visibleToUserId, fileId, downloadUrl, threadTs } = params;

  console.log("Transcription flow started:", { toJid, visibleToUserId, fileId, downloadUrl, threadTs });

  try {
    console.log("Downloading file:", fileId || downloadUrl);
    const { buffer, fileName } = await downloadChatFile(fileId, downloadUrl);
    console.log("File downloaded, size:", buffer.length, "bytes", "filename:", fileName);

    // Convert to supported format if needed (AMR -> MP3)
    const { buffer: convertedBuffer, extension } = await ensureSupportedFormat(buffer, fileName);
    console.log("Audio format:", extension, "size:", convertedBuffer.length, "bytes");

    console.log("Sending to OpenAI for transcription...");
    const transcript = await transcribeAudio(convertedBuffer, { languageHints: ["en", "es"], extension });
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


