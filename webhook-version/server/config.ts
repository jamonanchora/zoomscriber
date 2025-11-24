export type AppConfig = {
  port: number;
  zoomClientId: string;
  zoomClientSecret: string;
  zoomRedirectUri: string;
  zoomVerificationToken?: string; // legacy verification
  webhookSecret?: string; // if using JWS-based verification
  appBaseUrl: string;
  openaiApiKey: string;
  // Incoming Webhook configuration
  webhookEndpoint: string; // Full webhook URL from Zoom (e.g., https://integrations.zoom.us/chat/webhooks/incomingwebhook/...)
  webhookVerificationToken: string; // Verification token for the webhook
};

export const loadConfig = (): AppConfig => {
  const {
    PORT,
    ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET,
    ZOOM_REDIRECT_URI,
    ZOOM_VERIFICATION_TOKEN,
    ZOOM_WEBHOOK_SECRET,
    APP_BASE_URL,
    OPENAI_API_KEY,
    ZOOM_WEBHOOK_ENDPOINT,
    ZOOM_WEBHOOK_VERIFICATION_TOKEN
  } = process.env;

  if (!ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    throw new Error("Missing required Zoom OAuth environment variables (ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET)");
  }
  if (!APP_BASE_URL) {
    throw new Error("Missing APP_BASE_URL");
  }
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  if (!ZOOM_WEBHOOK_ENDPOINT) {
    throw new Error("Missing ZOOM_WEBHOOK_ENDPOINT (required for incoming webhooks)");
  }
  if (!ZOOM_WEBHOOK_VERIFICATION_TOKEN) {
    throw new Error("Missing ZOOM_WEBHOOK_VERIFICATION_TOKEN (required for incoming webhooks)");
  }

  const redirectUri = ZOOM_REDIRECT_URI || `${APP_BASE_URL}/oauth/callback`;

  return {
    port: Number(PORT ?? 3000),
    zoomClientId: ZOOM_CLIENT_ID,
    zoomClientSecret: ZOOM_CLIENT_SECRET,
    zoomRedirectUri: redirectUri,
    zoomVerificationToken: ZOOM_VERIFICATION_TOKEN,
    webhookSecret: ZOOM_WEBHOOK_SECRET,
    appBaseUrl: APP_BASE_URL,
    openaiApiKey: OPENAI_API_KEY,
    webhookEndpoint: ZOOM_WEBHOOK_ENDPOINT,
    webhookVerificationToken: ZOOM_WEBHOOK_VERIFICATION_TOKEN
  };
};

