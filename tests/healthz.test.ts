import request from "supertest";
import app from "../server/index.js";

describe("healthz", () => {
  it("returns ok true", async () => {
    const res = await request(app).get("/healthz").send();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});


