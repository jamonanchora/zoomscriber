import { vi, describe, it, expect } from "vitest";

vi.mock("../server/services/zoomFilesClient.js", () => ({
  downloadChatFile: vi.fn(async () => ({ buffer: Buffer.from("fakeaudio"), contentType: "audio/m4a", fileName: "v.m4a" }))
}));

vi.mock("../server/services/openaiClient.js", () => ({
  transcribeAudio: vi.fn(async () => "hello world")
}));

const postEphemeralSpy = vi.fn(async () => {});
vi.mock("../server/lib/ephemeralReply.js", () => ({
  postEphemeralTextReply: (...args: unknown[]) => postEphemeralSpy(...args)
}));

import { runTranscriptionFlow } from "../server/services/transcribeFlow.js";

describe("runTranscriptionFlow", () => {
  it("downloads, transcribes and posts ephemeral reply", async () => {
    await runTranscriptionFlow({ toJid: "jid:channel", visibleToUserId: "user123", fileId: "file123", threadTs: "t1" });
    expect(postEphemeralSpy).toHaveBeenCalledTimes(1);
    const arg = postEphemeralSpy.mock.calls[0][0];
    expect(arg.toJid).toBe("jid:channel");
    expect(arg.visibleToUserId).toBe("user123");
    expect(arg.threadTs).toBe("t1");
    expect(typeof arg.text).toBe("string");
    expect(arg.text.length).toBeGreaterThan(0);
  });
});


