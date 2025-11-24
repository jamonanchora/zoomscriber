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
  // For debugging: force refresh by setting FORCE_REFRESH_CHATBOT_TOKEN=true
  const forceRefresh = process.env.FORCE_REFRESH_CHATBOT_TOKEN === "true";
  const tokenRecord = getToken(CHATBOT_TOKEN_ID);
  
  if (!forceRefresh && tokenRecord && Date.now() < tokenRecord.expires_at - 60_000) {
    const expiresIn = Math.round((tokenRecord.expires_at - Date.now()) / 1000);
    console.log("Using cached chatbot token (expires in", expiresIn, "seconds)");
    
    // Decode cached token to verify type and log info
    try {
      const parts = tokenRecord.access_token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        const tokenType = payload.type;
        console.log("Cached token type:", tokenType, "(2 = Client Credentials, 0 = OAuth)");
        
        if (tokenType !== 2) {
          console.warn("WARNING: Cached token type is", tokenType, "but expected 2 (Client Credentials)");
        }
        // Note: Scopes are not in the token payload, they're in the response when requesting the token
        // We can't verify scope from the cached token itself
      }
    } catch {
      // Not a JWT or can't decode, that's fine - continue using the cached token
    }
    
    return tokenRecord.access_token;
  }
  
  if (forceRefresh) {
    console.log("Force refreshing chatbot token (FORCE_REFRESH_CHATBOT_TOKEN=true)");
  }

  // Need to get a new chatbot token
  // Per Zoom docs: grant_type should be in URL query parameter, not body
  console.log("Getting new chatbot token via Client Credentials Flow...");
  const creds = Buffer.from(`${config.zoomClientId}:${config.zoomClientSecret}`).toString("base64");

  // According to Zoom docs, grant_type should be in the URL, not the body
  // The scope "imchat:bot" should be automatically included based on app configuration
  const url = "https://zoom.us/oauth/token?grant_type=client_credentials";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`
      // Note: No Content-Type header needed when using URL params
    }
    // No body needed - grant_type is in URL
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
  console.log("Full token response:", JSON.stringify({
    access_token: data.access_token.substring(0, 30) + "...",
    token_type: data.token_type,
    expires_in: data.expires_in,
    scope: data.scope || "NOT PROVIDED"
  }, null, 2));
  
  // Verify token type is 2 (Client Credentials)
  try {
    const tokenParts = data.access_token.split(".");
    if (tokenParts.length === 3) {
      const tokenPayload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());
      const tokenType = tokenPayload.type;
      console.log("Decoded token type:", tokenType, "(2 = Client Credentials, 0 = OAuth Authorization Code)");
      
      if (tokenType !== 2) {
        console.error("ERROR: Token type is", tokenType, "but expected 2 (Client Credentials)");
        console.error("This token may not work with the chatbot API.");
        console.error("Client Credentials tokens should have type=2 in the JWT payload.");
      }
    }
  } catch (err) {
    console.warn("Could not decode token to verify type:", err);
  }

  // Verify the token has the required imchat:bot scope
  if (data.scope) {
    console.log("Chatbot token scopes:", data.scope);
    const scopes = data.scope.split(" ");
    console.log("Scopes list:", scopes);
    const hasImchatBotScope = scopes.includes("imchat:bot");
    console.log("Has imchat:bot scope?", hasImchatBotScope);
    
    if (!hasImchatBotScope) {
      console.error("WARNING: Client Credentials token does NOT have imchat:bot scope!");
      console.error("This will cause 401 errors when trying to send chatbot messages.");
      console.error("");
      console.error("To fix this:");
      console.error("1. Check your Zoom app configuration in the Marketplace");
      console.error("2. Navigate to Features -> Surface -> Team Chat Subscription");
      console.error("3. Ensure the chatbot feature is fully enabled");
      console.error("4. The imchat:bot scope should be automatically included based on app configuration");
      console.error("5. Verify the app type supports chatbot functionality");
      // Don't throw here - let it try and fail with a 401 so we can see the actual error
      // This is just a warning to help diagnose issues
    } else {
      console.log("✓ Token has required imchat:bot scope");
    }
  } else {
    console.warn("WARNING: Token response did not include scope information");
    console.warn("Unable to verify imchat:bot scope. The request may still work if scope is inferred from app config.");
    console.warn("If you get 401 errors, check your Zoom app configuration in the Marketplace.");
  }

  // Cache the chatbot token (Client Credentials tokens don't have refresh tokens)
  // They typically last 1 hour - use empty string for refresh_token
  saveToken(CHATBOT_TOKEN_ID, data.access_token, "", data.expires_in);
  
  return data.access_token;
}
