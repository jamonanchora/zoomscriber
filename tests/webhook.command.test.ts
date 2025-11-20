import request from "supertest";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../server/services/transcribeFlow.js", () => ({
  runTranscriptionFlow: vi.fn(async () => {})
}));

import app from "../server/index.js";
import { runTranscriptionFlow } from "../server/services/transcribeFlow.js";

describe("webhook slash command handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes transcription when /zoomscribe provides context", async () => {
    const payload = {
      event: "bot_notification",
      event_id: "evt-2",
      payload: {
        cmd: "/zoomscribe",
        toJid: "jid:channel",
        userId: "user999",
        thread_ts: "t-thread",
        fileId: "fileABC"
      }
    };

    const res = await request(app).post("/webhooks/zoom").send(payload);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(runTranscriptionFlow).toHaveBeenCalledTimes(1);
    expect(runTranscriptionFlow).toHaveBeenCalledWith(
      expect.objectContaining({ toJid: "jid:channel", visibleToUserId: "user999", fileId: "fileABC", threadTs: "t-thread" })
    );
  });
});


