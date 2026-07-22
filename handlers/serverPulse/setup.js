import { PermissionFlagsBits } from "discord.js";
import { setPulseConfig, refreshPulseNow } from "../../services/serverPulse/manager.js";

export async function handlePulseSetup(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return await interaction.reply({
      content: 'You need the "Manage Channels" permission to use this command.',
      flags: 64,
    });
  }

  const channel = interaction.options.getChannel("channel");
  const guildId = interaction.guildId;

  await interaction.deferReply({ flags: 64 });

  try {
    await setPulseConfig(guildId, {
      enabled: true,
      pulseChannelId: channel.id,
      pulseMessageId: null, // force a fresh message in the new channel
    });

    await refreshPulseNow(guildId, client);

    await interaction.editReply({
      content: `✅ Server Pulse enabled and posted in ${channel}.`,
    });

    console.log(`🔧 Server Pulse enabled for guild ${guildId} in channel ${channel.id}`);
  } catch (error) {
    console.error("❌ Error setting up Server Pulse:", error);
    await interaction.editReply({
      content: "❌ Failed to set up Server Pulse. Please try again.",
    });
  }
}
