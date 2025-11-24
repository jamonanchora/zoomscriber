import { loadConfig } from "../config.js";

/**
 * Sends a message via Zoom Incoming Webhook
 * 
 * Based on Zoom's Incoming Webhook format:
 * - Endpoint: https://integrations.zoom.us/chat/webhooks/incomingwebhook/{webhook_id}?format=message
 * - Authorization: {verification_token}
 * - Content-Type: application/json
 * - Body: Simple text string for format=message, or JSON object for format=fields
 */
export async function sendWebhookMessage(text: string): Promise<void> {
  const config = loadConfig();
  
  if (!config.webhookEndpoint) {
    throw new Error("ZOOM_WEBHOOK_ENDPOINT is required but not configured");
  }
  
  if (!config.webhookVerificationToken) {
    throw new Error("ZOOM_WEBHOOK_VERIFICATION_TOKEN is required but not configured");
  }

  // Use format=message for simple text messages
  const url = `${config.webhookEndpoint}?format=message`;
  
  console.log(`Sending webhook message to: ${config.webhookEndpoint.substring(0, 50)}...`);
  
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": config.webhookVerificationToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(text) // Simple text format
  });

  if (!resp.ok) {
    const responseText = await resp.text();
    let errorMessage: string;
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.message || errorData.error || responseText;
    } catch {
      errorMessage = responseText;
    }
    throw new Error(`Webhook send failed: ${resp.status} ${errorMessage}`);
  }
  
  console.log("✓ Webhook message sent successfully");
}

/**
 * Sends structured data via Zoom Incoming Webhook using fields format
 */
export async function sendWebhookFields(fields: Record<string, string>): Promise<void> {
  const config = loadConfig();
  
  if (!config.webhookEndpoint) {
    throw new Error("ZOOM_WEBHOOK_ENDPOINT is required but not configured");
  }
  
  if (!config.webhookVerificationToken) {
    throw new Error("ZOOM_WEBHOOK_VERIFICATION_TOKEN is required but not configured");
  }

  // Use format=fields for structured JSON
  const url = `${config.webhookEndpoint}?format=fields`;
  
  console.log(`Sending webhook fields to: ${config.webhookEndpoint.substring(0, 50)}...`);
  
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": config.webhookVerificationToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(fields)
  });

  if (!resp.ok) {
    const responseText = await resp.text();
    let errorMessage: string;
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.message || errorData.error || responseText;
    } catch {
      errorMessage = responseText;
    }
    throw new Error(`Webhook send failed: ${resp.status} ${errorMessage}`);
  }
  
  console.log("✓ Webhook fields sent successfully");
}

