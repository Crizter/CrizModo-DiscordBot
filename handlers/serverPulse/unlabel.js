import { PermissionFlagsBits } from "discord.js";
import { getPulseConfig, setPulseConfig, refreshPulseNow } from "../../services/serverPulse/manager.js";

export async function handlePulseUnlabel(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return await interaction.reply({
      content: 'You need the "Manage Channels" permission to use this command.',
      flags: 64,
    });
  }

  const voiceChannel = interaction.options.getChannel("voice-channel");
  const guildId = interaction.guildId;

  try {
    const config = await getPulseConfig(guildId);
    const roomLabels = (config?.roomLabels || []).filter((l) => l.channelId !== voiceChannel.id);

    await setPulseConfig(guildId, { roomLabels });

    await interaction.reply({
      content: `✅ ${voiceChannel} label removed — Pulse will show its Discord channel name.`,
      flags: 64,
    });

    if (config?.enabled) {
      await refreshPulseNow(guildId, client);
    }
  } catch (error) {
    console.error("❌ Error removing label:", error);
    await interaction.reply({
      content: "❌ Failed to remove the label. Please try again.",
      flags: 64,
    });
  }
}
