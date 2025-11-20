import request from "supertest";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../server/services/transcribeFlow.js", () => ({
  runTranscriptionFlow: vi.fn(async () => {})
}));

import app from "../server/index.js";
import { runTranscriptionFlow } from "../server/services/transcribeFlow.js";

describe("webhook reaction handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes transcription on :pencil: reaction with file", async () => {
    const payload = {
      event: "team_chat.channel_reaction_added",
      event_id: "evt-1",
      payload: {
        reaction: { emoji: ":pencil:" },
        message: {
          to_jid: "jid:channel",
          thread_ts: "t1",
          files: [{ id: "file123" }]
        },
        operator: { user_id: "user123" }
      }
    };

    const res = await request(app).post("/webhooks/zoom").send(payload);
    expect(res.status).toBe(200);
    // allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 10));
    expect(runTranscriptionFlow).toHaveBeenCalledTimes(1);
    expect(runTranscriptionFlow).toHaveBeenCalledWith(
      expect.objectContaining({ toJid: "jid:channel", visibleToUserId: "user123", fileId: "file123", threadTs: "t1" })
    );
  });
});


