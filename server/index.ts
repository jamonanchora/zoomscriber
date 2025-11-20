import 'dotenv/config';
import express from "express";
import { zoomWebhookRouter } from "./routes/webhooks.js";
import { oauthRouter } from "./routes/oauth.js";

const app = express();

// Use native JSON parser
app.use(express.json({ limit: "10mb" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

// Diagnostic endpoint to check token status
app.get("/debug/token", async (_req, res) => {
  try {
    const { getToken } = await import("./db/tokenStore.js");
    const { getZoomAccessToken } = await import("./services/zoomAuth.js");
    const tokenRecord = getToken("admin");
    const now = Date.now();
    
    res.json({
      hasToken: !!tokenRecord,
      expiresAt: tokenRecord?.expires_at,
      expiresIn: tokenRecord ? Math.round((tokenRecord.expires_at - now) / 1000) : null,
      isExpired: tokenRecord ? now >= tokenRecord.expires_at : true,
      hasRefreshToken: !!tokenRecord?.refresh_token,
      testToken: (async () => {
        try {
          await getZoomAccessToken();
          return "valid";
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      })()
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.use("/oauth", oauthRouter);
app.use("/webhooks/zoom", zoomWebhookRouter);

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Zoomscriber listening on :${port}`);
  });
}

export default app;


