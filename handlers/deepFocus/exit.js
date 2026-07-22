import { requestExit } from "../../services/deepFocus/manager.js";

export async function handleDeepFocusExit(interaction, client) {
  try {
    await interaction.deferReply({ flags: 64 });

    const result = await requestExit(interaction.guildId, interaction.user.id, client);

    if (!result.hadSession) {
      return await interaction.editReply({
        content: result.ok
          ? "ℹ️ No saved Deep Focus session found — removed the role; there were no roles to restore."
          : "❌ You're not in Deep Focus.",
      });
    }

    await interaction.editReply({
      content: result.ok
        ? "✅ **Deep Focus off.** Your roles are restored — welcome back!"
        : "⚠️ Exit started, but some roles couldn't be restored yet. I'll keep retrying every minute automatically.",
    });
  } catch (error) {
    console.error("❌ Error exiting Deep Focus:", error);
    const message = { content: "❌ Something went wrong exiting Deep Focus. I'll retry automatically." };
    if (interaction.deferred) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ ...message, flags: 64 }).catch(() => {});
  }
}
