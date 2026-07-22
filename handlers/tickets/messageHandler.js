// Shared entry point for ticket-channel messages. Super Verification no
// longer runs through here — it's a button + modal flow in a dedicated apply
// channel (handlers/superVerification/). This is reserved for the
// FAQ-autoreply feature (docs/ticket-ai-autoreply-design.md), not yet built.
export async function handleTicketMessage(message, client) {
  if (message.author.bot) return;
  if (!message.guild) return;

  // TODO: FAQ auto-reply logic goes here once that feature is built.
}
