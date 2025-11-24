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

/**
 * Get a chatbot-specific token using Client Credentials Flow
 * The chatbot API requires Client Credentials tokens, not Authorization Code tokens
 * Client Credentials tokens are cached and reused until they expire (typically 1 hour)
 */
export async function getChatbotToken(): Promise<string> {
  const CHATBOT_TOKEN_ID = "chatbot";
  const config = loadConfig();
  
  // Check if we have a cached chatbot token that's still valid
  const tokenRecord = getToken(CHATBOT_TOKEN_ID);
  if (tokenRecord && Date.now() < tokenRecord.expires_at - 60_000) {
    console.log("Using cached chatbot token (expires in", Math.round((tokenRecord.expires_at - Date.now()) / 1000), "seconds)");
    return tokenRecord.access_token;
  }

  // Need to get a new chatbot token
  console.log("Getting new chatbot token via Client Credentials Flow...");
  const creds = Buffer.from(`${config.zoomClientId}:${config.zoomClientSecret}`).toString("base64");

  // For Client Credentials, we may need to request the imchat:bot scope explicitly
  const params = new URLSearchParams({
    grant_type: "client_credentials"
  });
  
  // Try requesting the scope explicitly (may or may not be needed)
  // The scope should be granted based on app configuration, but let's try requesting it
  params.append("scope", "imchat:bot");

  const resp = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("Chatbot token API error:", resp.status, text);
    throw new Error(`Failed to get chatbot token: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error("Chatbot token response missing access_token");
  }

  console.log("Chatbot token obtained via Client Credentials Flow");
  if (data.scope) {
    console.log("Chatbot token scopes:", data.scope);
    const scopes = data.scope.split(" ");
    console.log("Has imchat:bot scope?", scopes.includes("imchat:bot"));
    if (!scopes.includes("imchat:bot")) {
      console.error("WARNING: Client Credentials token does NOT have imchat:bot scope!");
      console.error("This may be why the chatbot API is rejecting the token.");
      console.error("Check app configuration in Zoom Marketplace to ensure imchat:bot scope is enabled for Client Credentials flow.");
    }
  } else {
    console.warn("WARNING: Client Credentials token response did not include scope information");
  }

  // Cache the chatbot token (Client Credentials tokens don't have refresh tokens)
  // They typically last 1 hour - use empty string for refresh_token
  saveToken(CHATBOT_TOKEN_ID, data.access_token, "", data.expires_in);
  
  return data.access_token;
}
