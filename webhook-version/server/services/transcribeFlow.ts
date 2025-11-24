import { downloadChatFile } from "./zoomFilesClient.js";
import { transcribeAudio } from "./openaiClient.js";
import { sendWebhookMessage } from "./incomingWebhookClient.js";
import { ensureSupportedFormat } from "./audioConverter.js";

export type TranscribeParams = {
  toJid: string; // channel or user JID where original message lives (not used for webhooks, but kept for compatibility)
  visibleToUserId: string; // reactor/invoker user id (not used for webhooks, but kept for compatibility)
  fileId: string; // file attachment id from the voice note
  downloadUrl?: string; // direct download URL (alternative to fileId)
  messageId?: string; // original message ID (not used for webhooks, but kept for compatibility)
};

export async function runTranscriptionFlow(params: TranscribeParams): Promise<void> {
  const { fileId, downloadUrl } = params;

  console.log("Transcription flow started:", { fileId, downloadUrl });

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
    console.log("Sending transcript via incoming webhook...");
    await sendWebhookMessage(text);
    console.log("✓ Transcript sent successfully via webhook");
  } catch (err) {
    console.error("Error in transcription flow:", err);
    throw err;
  }
}

