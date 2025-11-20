import { loadConfig } from "../config.js";

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getZoomAccessToken(): Promise<string> {
  const config = loadConfig();
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }

  const creds = Buffer.from(`${config.zoomClientId}:${config.zoomClientSecret}`).toString("base64");
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
    config.zoomAccountId
  )}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to fetch Zoom access token: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as TokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };
  return cachedToken.token;
}


