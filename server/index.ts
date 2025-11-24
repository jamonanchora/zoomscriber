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

// Diagnostic endpoint to test chatbot API directly
app.get("/debug/test-chatbot", async (_req, res) => {
  try {
    const { getZoomAccessToken } = await import("./services/zoomAuth.js");
    const { loadConfig } = await import("./config.js");
    const token = await getZoomAccessToken();
    const config = loadConfig();
    
    if (!config.zoomBotJid) {
      return res.status(400).json({ error: "ZOOM_BOT_JID not configured" });
    }
    
    // Try a minimal chatbot API call
    const testPayload = {
      robot_jid: config.zoomBotJid,
      to_jid: "test", // This will fail but should give us a different error if token is wrong
      account_id: "test",
      content: { head: { text: "test" } }
    };
    
    const resp = await fetch("https://api.zoom.us/v2/im/chat/messages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(testPayload)
    });
    
    const text = await resp.text();
    
    res.json({
      status: resp.status,
      statusText: resp.statusText,
      response: text,
      tokenPrefix: token.substring(0, 30) + "...",
      botJid: config.zoomBotJid,
      note: "If status is 401, token doesn't work for chatbot API even though it works for other APIs"
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Diagnostic endpoint to check account config
app.get("/debug/account", async (_req, res) => {
  try {
    const { getAccountConfig } = await import("./db/accountStore.js");
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    const accountConfig = getAccountConfig();
    
    res.json({
      storedAccountId: accountConfig?.account_id || null,
      storedRobotJid: accountConfig?.robot_jid || null,
      envAccountId: config.zoomAccountId || null,
      envBotJid: config.zoomBotJid || null,
      hasStoredConfig: !!accountConfig,
      accountIdSource: accountConfig?.account_id ? "database (from bot_installed)" : "environment variable or not set",
      mismatchWarning: accountConfig?.account_id && config.zoomAccountId && accountConfig.account_id !== config.zoomAccountId
        ? `WARNING: Database account_id (${accountConfig.account_id}) differs from env var (${config.zoomAccountId})`
        : null
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
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


