import { handleSuperVerificationMessage } from "./superVerificationHandler.js";

// Shared entry point for both ticket features. Super Verification detection
// runs first; if a message isn't a form paste, control falls through — this
// is where the FAQ-autoreply feature (docs/ticket-ai-autoreply-design.md,
// not yet built) will plug in.
export async function handleTicketMessage(message, client) {
  if (message.author.bot) return;
  if (!message.guild) return;

  try {
    const { handled } = await handleSuperVerificationMessage(message, client);
    if (handled) return;
  } catch (error) {
    console.error("❌ Error in super verification handler:", error);
    return;
  }

  // TODO: FAQ auto-reply fallback goes here once that feature is built.
}
