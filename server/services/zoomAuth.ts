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
    console.log("Using cached access token (expires in", Math.round((tokenRecord.expires_at - Date.now()) / 1000), "seconds)");
    return tokenRecord.access_token;
  }

  // If we have a refresh token, use it
  if (tokenRecord?.refresh_token) {
    console.log("Token expired, refreshing...");
    try {
      const newToken = await refreshAccessToken(tokenRecord.refresh_token);
      console.log("Token refreshed successfully");
      return newToken;
    } catch (err) {
      console.error("Token refresh failed:", err);
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
    console.error("Token refresh API error:", resp.status, text);
    throw new Error(`Token refresh failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error("Token refresh response missing access_token");
  }
  
  // Log scopes for debugging
  if (data.scope) {
    console.log("Refreshed token scopes:", data.scope);
    const scopes = data.scope.split(" ");
    console.log("Has imchat:bot scope?", scopes.includes("imchat:bot"));
  }
  
  // Update both access and refresh tokens if provided
  if (data.refresh_token) {
    saveToken(ADMIN_ACCOUNT_ID, data.access_token, data.refresh_token, data.expires_in);
  } else {
    // Keep existing refresh token if new one not provided
    const existing = getToken(ADMIN_ACCOUNT_ID);
    updateAccessToken(ADMIN_ACCOUNT_ID, data.access_token, data.expires_in);
    if (existing?.refresh_token) {
      // Update refresh token in DB if we have it
      saveToken(ADMIN_ACCOUNT_ID, data.access_token, existing.refresh_token, data.expires_in);
    }
  }
  
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

  // Log scopes for debugging
  console.log("Token received with scopes:", data.scope || "not provided in response");
  if (data.scope) {
    const scopes = data.scope.split(" ");
    console.log("Scopes list:", scopes);
    console.log("Has imchat:bot scope?", scopes.includes("imchat:bot"));
  }

  saveToken(ADMIN_ACCOUNT_ID, data.access_token, data.refresh_token, data.expires_in);
}
