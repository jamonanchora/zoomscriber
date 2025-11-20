import { loadConfig } from "../config.js";
import { getToken, saveToken, updateAccessToken } from "../db/tokenStore.js";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

// For admin-managed OAuth, we typically have one account token
// We'll use a constant account ID for the admin installation
const ADMIN_ACCOUNT_ID = "admin";

export async function getZoomAccessToken(): Promise<string> {
  const config = loadConfig();
  const tokenRecord = getToken(ADMIN_ACCOUNT_ID);

  // If we have a valid token, return it
  if (tokenRecord && Date.now() < tokenRecord.expires_at - 60_000) {
    return tokenRecord.access_token;
  }

  // If we have a refresh token, use it
  if (tokenRecord?.refresh_token) {
    try {
      const newToken = await refreshAccessToken(tokenRecord.refresh_token);
      return newToken;
    } catch (err) {
      // Refresh failed, need to re-authorize
      throw new Error("OAuth token expired. Please re-authorize the app at /oauth/install");
    }
  }

  throw new Error("No OAuth token found. Please authorize the app at /oauth/install");
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const config = loadConfig();
  const creds = Buffer.from(`${config.zoomClientId}:${config.zoomClientSecret}`).toString("base64");

  const resp = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as TokenResponse;
  updateAccessToken(ADMIN_ACCOUNT_ID, data.access_token, data.expires_in);
  return data.access_token;
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const config = loadConfig();
  const creds = Buffer.from(`${config.zoomClientId}:${config.zoomClientSecret}`).toString("base64");

  const resp = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.zoomRedirectUri
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Invalid token response: missing access_token or refresh_token");
  }

  saveToken(ADMIN_ACCOUNT_ID, data.access_token, data.refresh_token, data.expires_in);
}
