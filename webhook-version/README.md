# Zoomscriber - Webhook Version

This is a rebuilt version of Zoomscriber that uses **Zoom Incoming Webhooks** instead of the Chatbot API to send transcript messages back to Zoom.

## Key Differences from Original Version

1. **No Chatbot API**: This version does not use the Zoom Chatbot API (`/v2/im/chat/messages`)
2. **Incoming Webhooks**: Instead, it uses Zoom's Incoming Webhook feature to send messages
3. **Simpler Configuration**: No need for `ZOOM_BOT_JID` or `ZOOM_ACCOUNT_ID` - just the webhook endpoint and verification token

## Setup

### 1. Create an Incoming Webhook in Zoom

1. Go to your Zoom app in the Zoom Marketplace
2. Navigate to the "Incoming Webhook" feature
3. Create a new webhook and copy:
   - **Webhook Endpoint URL**: `https://integrations.zoom.us/chat/webhooks/incomingwebhook/{webhook_id}`
   - **Verification Token**: The token provided by Zoom

### 2. Environment Variables

Create a `.env` file with the following variables:

```env
# Zoom OAuth (for accessing messages and files)
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
ZOOM_REDIRECT_URI=https://your-domain.com/oauth/callback
APP_BASE_URL=https://your-domain.com

# Zoom Incoming Webhook (for sending messages)
ZOOM_WEBHOOK_ENDPOINT=https://integrations.zoom.us/chat/webhooks/incomingwebhook/...
ZOOM_WEBHOOK_VERIFICATION_TOKEN=your_verification_token

# OpenAI (for transcription)
OPENAI_API_KEY=your_openai_key

# Optional: Webhook verification
ZOOM_WEBHOOK_SECRET=your_webhook_secret  # For HMAC signature verification
ZOOM_VERIFICATION_TOKEN=your_legacy_token  # Legacy token verification

# Server
PORT=3000
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Application

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## How It Works

1. **Receives Webhook Events**: Listens for Zoom webhook events (reactions, slash commands)
2. **Finds Messages**: Uses the Zoom API to find the message with the audio file
3. **Downloads & Transcribes**: Downloads the audio file and transcribes it using OpenAI Whisper
4. **Sends via Webhook**: Sends the transcript back using the Incoming Webhook (instead of Chatbot API)

## Usage

The workflow is the same as the original version:

1. Send a voice note in a Zoom chat
2. React with a ✏️ (pencil) emoji to the message
3. The app will transcribe the audio and send the transcript via the incoming webhook

## Webhook Format

The app uses the `format=message` format for simple text messages:

```bash
curl 'https://integrations.zoom.us/chat/webhooks/incomingwebhook/{webhook_id}?format=message' \
  -X POST \
  -H 'Authorization: {verification_token}' \
  -H 'Content-Type: application/json' \
  -d '"Hello World!"'
```

For structured data, you can use `format=fields` (not currently used, but available in the code).

## Notes

- The webhook sends messages to the channel where the webhook was configured
- Unlike the Chatbot API, you cannot send ephemeral messages (visible to only one user)
- All messages sent via the webhook are visible to everyone in the channel
- The webhook endpoint and token are configured once and used for all messages

