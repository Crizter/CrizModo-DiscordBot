import { getSessionById } from "../../models/deepFocus/sessions.js";
import { endDeepFocusSession } from "../../utils/deepFocus/endSession.js";

export async function handleExitButton(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith("df_end_")) return;

  const rawId = customId.slice("df_end_".length);
  const sessionId = Number.parseInt(rawId, 10);
  if (!Number.isFinite(sessionId)) {
    return interaction.reply({ content: "Invalid session reference.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  let session = null;
  try {
    session = await getSessionById(sessionId);
  } catch (error) {
    console.error(`❌ Deep focus exit: failed loading session ${sessionId}:`, error);
    return interaction.editReply({ content: "Couldn't load that session." });
  }

  if (!session) {
    return interaction.editReply({ content: "That session no longer exists." });
  }
  if (session.user_id !== interaction.user.id) {
    return interaction.editReply({ content: "That isn't your deep focus session." });
  }
  if (session.ended_at) {
    return interaction.editReply({ content: "That deep focus session has already ended." });
  }

  await endDeepFocusSession({ sessionId, endReason: "manual", client });
  return interaction.editReply({ content: "🧘 Deep focus ended early." });
}
