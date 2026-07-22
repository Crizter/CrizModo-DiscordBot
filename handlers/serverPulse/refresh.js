import { PermissionFlagsBits } from "discord.js";
import { getPulseConfig, refreshPulseNow } from "../../services/serverPulse/manager.js";

export async function handlePulseRefresh(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return await interaction.reply({
      content: 'You need the "Manage Channels" permission to use this command.',
      flags: 64,
    });
  }

  const guildId = interaction.guildId;
  const config = await getPulseConfig(guildId);

  if (!config || !config.enabled) {
    return await interaction.reply({
      content: "❌ Server Pulse isn't set up yet. Run `/serverpulse setup` first.",
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    await refreshPulseNow(guildId, client);
    await interaction.editReply({ content: "✅ Server Pulse refreshed." });
  } catch (error) {
    console.error("❌ Error refreshing Server Pulse:", error);
    await interaction.editReply({ content: "❌ Failed to refresh Server Pulse." });
  }
}
