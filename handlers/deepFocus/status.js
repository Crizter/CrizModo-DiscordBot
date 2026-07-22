import { getOpenSession } from "../../services/deepFocus/manager.js";

export async function handleDeepFocusStatus(interaction) {
  try {
    const session = await getOpenSession(interaction.guildId, interaction.user.id);

    if (!session) {
      return await interaction.reply({
        content: "ℹ️ You're not in Deep Focus. Start with `/deepfocus start`.",
        flags: 64,
      });
    }

    const expiresUnix = Math.floor(session.expiresAt.getTime() / 1000);
    await interaction.reply({
      content:
        `🧘 **Deep Focus is on.**\n` +
        `Auto-exit <t:${expiresUnix}:R> (<t:${expiresUnix}:f>).\n` +
        `**${session.savedRoleIds.length}** role(s) will be restored on exit.`,
      flags: 64,
    });
  } catch (error) {
    console.error("❌ Error fetching Deep Focus status:", error);
    await interaction.reply({ content: "❌ Couldn't fetch your Deep Focus status.", flags: 64 }).catch(() => {});
  }
}
