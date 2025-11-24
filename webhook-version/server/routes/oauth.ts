import { Router, type Request, type Response } from "express";
import { loadConfig } from "../config.js";
import { exchangeCodeForToken } from "../services/zoomAuth.js";

export const oauthRouter = Router();

oauthRouter.get("/install", (_req: Request, res: Response) => {
  const config = loadConfig();
  // Don't pass scope - use scopes configured in Zoom Marketplace app settings
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.zoomClientId,
    redirect_uri: config.zoomRedirectUri
  });
  const authUrl = `https://zoom.us/oauth/authorize?${params.toString()}`;
  res.redirect(authUrl);
});

oauthRouter.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    return res.status(400).send(`OAuth error: ${error}`);
  }

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    await exchangeCodeForToken(code);
    res.send(`
      <html>
        <body>
          <h1>Zoomscriber Authorization Successful!</h1>
          <p>The app has been authorized and is ready to use.</p>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Authorization failed: ${message}`);
  }
});

