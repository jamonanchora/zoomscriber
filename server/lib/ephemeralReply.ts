import { sendChatbotMessage } from "../services/zoomChatbotClient.js";

export async function postEphemeralTextReply(params: {
  toJid: string;
  visibleToUserId: string;
  threadTs?: string;
  text: string;
}): Promise<void> {
  const { toJid, visibleToUserId, threadTs, text } = params;
  
  try {
    // First try ephemeral message (visible only to specific user)
    await sendChatbotMessage({
      to_jid: toJid,
      visible_to_user: visibleToUserId,
      reply_to: threadTs, // Use reply_to for threading per API docs
      content: {
        head: {
          text: text
        }
      }
    });
    console.log("✓ Ephemeral message sent successfully");
  } catch (ephemeralErr) {
    console.error("Failed to send ephemeral reply:", ephemeralErr);
    console.log("Attempting fallback: sending regular (non-ephemeral) message to test if chatbot API works...");
    
    try {
      // Fallback: Try sending a regular message (without visible_to_user)
      // This will be visible to everyone in the chat, but helps us test if the chatbot API works at all
      await sendChatbotMessage({
        to_jid: toJid,
        // Omit visible_to_user to send a regular message
        reply_to: threadTs,
        content: {
          head: {
            text: `[Transcription] ${text}`
          }
        }
      });
      console.log("✓ Regular message sent successfully (fallback worked - chatbot API is functional)");
      console.warn("NOTE: Message was sent as regular (visible to all) instead of ephemeral (visible to one user)");
      console.warn("This indicates the chatbot API works, but ephemeral messages may not be supported with admin-managed OAuth tokens");
    } catch (regularErr) {
      // Both ephemeral and regular failed - this is a broader chatbot API issue
      console.error("Failed to send regular message as well:", regularErr);
      console.error("Transcription was successful but reply could not be sent.");
      console.error("This indicates a broader chatbot API authentication issue, not just ephemeral-specific.");
      console.error("Possible causes:");
      console.error("1. Chatbot feature not properly configured in Zoom app");
      console.error("2. Token missing imchat:bot scope");
      console.error("3. Admin-managed OAuth tokens may not work with chatbot API");
      console.error("4. App needs to be re-authorized or published");
      throw regularErr; // Re-throw the regular error since both failed
    }
  }
}


