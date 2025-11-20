import { loadConfig } from "../config.js";

export type TranscriptionOptions = {
  languageHints?: string[]; // e.g., ['en','es']
};

export async function transcribeAudio(buffer: Buffer, opts?: TranscriptionOptions): Promise<string> {
  const config = loadConfig();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), "audio.m4a");
  form.append("model", "whisper-1");
  if (opts?.languageHints && opts.languageHints.length > 0) {
    // Whisper does language autodetect; hints are informational (no official param), so we ignore here.
  }

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: form as unknown as BodyInit
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI transcription failed: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as { text?: string };
  return data.text ?? "";
}


