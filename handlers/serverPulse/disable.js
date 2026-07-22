import { PermissionFlagsBits } from "discord.js";
import { setPulseConfig } from "../../services/serverPulse/manager.js";

export async function handlePulseDisable(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return await interaction.reply({
      content: 'You need the "Manage Channels" permission to use this command.',
      flags: 64,
    });
  }

  const guildId = interaction.guildId;

  try {
    await setPulseConfig(guildId, { enabled: false });
    await interaction.reply({
      content: "❌ Server Pulse has been disabled.",
      flags: 64,
    });
    console.log(`🔧 Server Pulse disabled for guild ${guildId}`);
  } catch (error) {
    console.error("❌ Error disabling Server Pulse:", error);
    await interaction.reply({
      content: "❌ Failed to disable Server Pulse. Please try again.",
      flags: 64,
    });
  }
}
