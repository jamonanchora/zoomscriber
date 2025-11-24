export type AppConfig = {
  port: number;
  zoomClientId: string;
  zoomClientSecret: string;
  zoomRedirectUri: string;
  zoomBotJid?: string; // Bot JID for chatbot messages
  zoomAccountId?: string; // Account ID for chatbot API (required for Client Credentials tokens)
  zoomVerificationToken?: string; // legacy verification
  webhookSecret?: string; // if using JWS-based verification
  appBaseUrl: string;
  openaiApiKey: string;
};

export const loadConfig = (): AppConfig => {
  const {
    PORT,
    ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET,
    ZOOM_REDIRECT_URI,
    ZOOM_BOT_JID,
    ZOOM_ACCOUNT_ID,
    ZOOM_VERIFICATION_TOKEN,
    ZOOM_WEBHOOK_SECRET,
    APP_BASE_URL,
    OPENAI_API_KEY
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

  const redirectUri = ZOOM_REDIRECT_URI || `${APP_BASE_URL}/oauth/callback`;

  return {
    port: Number(PORT ?? 3000),
    zoomClientId: ZOOM_CLIENT_ID,
    zoomClientSecret: ZOOM_CLIENT_SECRET,
    zoomRedirectUri: redirectUri,
    zoomBotJid: ZOOM_BOT_JID,
    zoomAccountId: ZOOM_ACCOUNT_ID,
    zoomVerificationToken: ZOOM_VERIFICATION_TOKEN,
    webhookSecret: ZOOM_WEBHOOK_SECRET,
    appBaseUrl: APP_BASE_URL,
    openaiApiKey: OPENAI_API_KEY
  };
};


