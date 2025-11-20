export type AppConfig = {
  port: number;
  zoomAccountId: string;
  zoomClientId: string;
  zoomClientSecret: string;
  zoomVerificationToken?: string; // legacy verification
  webhookSecret?: string; // if using JWS-based verification
  appBaseUrl?: string;
  openaiApiKey: string;
};

export const loadConfig = (): AppConfig => {
  const {
    PORT,
    ZOOM_ACCOUNT_ID,
    ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET,
    ZOOM_VERIFICATION_TOKEN,
    ZOOM_WEBHOOK_SECRET,
    APP_BASE_URL,
    OPENAI_API_KEY
  } = process.env;

  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    throw new Error("Missing required Zoom S2S OAuth environment variables");
  }
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return {
    port: Number(PORT ?? 3000),
    zoomAccountId: ZOOM_ACCOUNT_ID,
    zoomClientId: ZOOM_CLIENT_ID,
    zoomClientSecret: ZOOM_CLIENT_SECRET,
    zoomVerificationToken: ZOOM_VERIFICATION_TOKEN,
    webhookSecret: ZOOM_WEBHOOK_SECRET,
    appBaseUrl: APP_BASE_URL,
    openaiApiKey: OPENAI_API_KEY
  };
};


