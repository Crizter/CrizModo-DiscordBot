import { PermissionFlagsBits } from "discord.js";
import { getPulseConfig, setPulseConfig, refreshPulseNow } from "../../services/serverPulse/manager.js";

export async function handlePulseLabel(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return await interaction.reply({
      content: 'You need the "Manage Channels" permission to use this command.',
      flags: 64,
    });
  }

  const voiceChannel = interaction.options.getChannel("voice-channel");
  const name = interaction.options.getString("name");
  const guildId = interaction.guildId;

  try {
    const config = await getPulseConfig(guildId);
    const roomLabels = (config?.roomLabels || []).filter((l) => l.channelId !== voiceChannel.id);
    roomLabels.push({ channelId: voiceChannel.id, label: name });

    await setPulseConfig(guildId, { roomLabels });

    await interaction.reply({
      content: `✅ ${voiceChannel} will now show as **${name}** on the Server Pulse.`,
      flags: 64,
    });

    if (config?.enabled) {
      await refreshPulseNow(guildId, client);
    }
  } catch (error) {
    console.error("❌ Error labeling voice channel:", error);
    await interaction.reply({
      content: "❌ Failed to set the label. Please try again.",
      flags: 64,
    });
  }
}
