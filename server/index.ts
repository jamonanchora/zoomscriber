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
    
    let tokenScopes: string | null = null;
    let userInfo: any = null;
    
    try {
      const token = await getZoomAccessToken();
      // Try to get user info to check token works
      const userResp = await fetch("https://api.zoom.us/v2/users/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (userResp.ok) {
        userInfo = await userResp.json();
      }
      
      // Try to decode token to see scopes (JWT format)
      // Note: Zoom tokens might not be JWTs, so this might not work
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
          tokenScopes = payload.scope || payload.scopes || "N/A";
        }
      } catch {
        // Not a JWT, that's fine
      }
    } catch (err) {
      // Ignore
    }
    
    res.json({
      hasToken: !!tokenRecord,
      expiresAt: tokenRecord?.expires_at,
      expiresIn: tokenRecord ? Math.round((tokenRecord.expires_at - now) / 1000) : null,
      isExpired: tokenRecord ? now >= tokenRecord.expires_at : true,
      hasRefreshToken: !!tokenRecord?.refresh_token,
      tokenScopes,
      userInfo: userInfo ? { id: userInfo.id, email: userInfo.email, account_id: userInfo.account_id } : null,
      testToken: "valid" // Token works since we got userInfo
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


