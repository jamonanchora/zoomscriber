import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execAsync = promisify(exec);

/**
 * Converts AMR audio to MP3 format for OpenAI Whisper
 * Requires ffmpeg to be installed on the system
 */
export async function convertAmrToMp3(amrBuffer: Buffer): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "zoomscriber-"));
  const inputPath = join(tempDir, "input.amr");
  const outputPath = join(tempDir, "output.mp3");

  try {
    // Write AMR buffer to temp file
    await writeFile(inputPath, amrBuffer);

    // Convert using ffmpeg
    // -i input: input file
    // -ar 16000: sample rate 16kHz (good for speech)
    // -ac 1: mono channel
    // -b:a 64k: bitrate
    // -y: overwrite output file
    await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -b:a 64k -y "${outputPath}"`);

    // Read converted MP3
    const { readFile } = await import("node:fs/promises");
    const mp3Buffer = await readFile(outputPath);

    return mp3Buffer;
  } finally {
    // Cleanup temp files
    try {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Detects audio format from buffer or filename and converts if needed
 */
export async function ensureSupportedFormat(
  buffer: Buffer,
  fileName?: string
): Promise<{ buffer: Buffer; extension: string }> {
  const ext = fileName?.toLowerCase().split(".").pop() || "";

  // If it's already a supported format, return as-is
  const supportedFormats = ["mp3", "m4a", "mp4", "wav", "flac", "ogg", "oga", "webm", "mpeg", "mpga"];
  if (supportedFormats.includes(ext)) {
    return { buffer, extension: ext };
  }

  // If it's AMR, convert to MP3
  if (ext === "amr" || buffer.slice(0, 6).toString("ascii") === "#!AMR\n") {
    console.log("Converting AMR to MP3...");
    const mp3Buffer = await convertAmrToMp3(buffer);
    return { buffer: mp3Buffer, extension: "mp3" };
  }

  // Default: try to convert to MP3 (ffmpeg will handle it)
  console.log(`Unknown format ${ext}, attempting conversion to MP3...`);
  const mp3Buffer = await convertAmrToMp3(buffer);
  return { buffer: mp3Buffer, extension: "mp3" };
}

