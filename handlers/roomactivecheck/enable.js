import { PermissionFlagsBits } from "discord.js";
import { setGuildConfig, getGuildConfig } from "../../utils/roomActiveCheckManager.js";

export async function handleEnableRoomActiveCheck(interaction, client) {
  try {
    // Check if user has ManageChannels permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return await interaction.reply({
        content: 'You need the "Manage Channels" permission to use this command.',
        ephemeral: true
      });
    }

    const enabled = interaction.options.getBoolean('enabled');
    const primaryChannel = interaction.options.getChannel('primary-channel');
    const secondaryChannel = interaction.options.getChannel('secondary-channel');
    const requiredRole = interaction.options.getRole('required-role');
    const threshold = interaction.options.getInteger('threshold') || 10;
    const guildId = interaction.guildId;

    // Validate channels are voice channels
    if (primaryChannel.type !== 2 || secondaryChannel.type !== 2) { // 2 = GuildVoice
      return await interaction.reply({
        content: '❌ Both channels must be voice channels.',
        ephemeral: true
      });
    }

    // Validate channels are different
    if (primaryChannel.id === secondaryChannel.id) {
      return await interaction.reply({
        content: '❌ Primary and secondary channels must be different.',
        ephemeral: true
      });
    }

    // Check bot permissions for both channels
    const botMember = interaction.guild.members.cache.get(client.user.id);
    
    if (!primaryChannel.permissionsFor(botMember).has(PermissionFlagsBits.ViewChannel)) {
      return await interaction.reply({
        content: '❌ I need permission to view the primary voice channel.',
        ephemeral: true
      });
    }

    if (!secondaryChannel.permissionsFor(botMember).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels])) {
      return await interaction.reply({
        content: '❌ I need "View Channel" and "Manage Channels" permissions for the secondary voice channel.',
        ephemeral: true
      });
    }

    // Defer reply for database operation
    await interaction.deferReply({ ephemeral: true });

    // Store the configuration in database
    const config = {
      enabled,
      primaryChannelId: primaryChannel.id,
      secondaryChannelId: secondaryChannel.id,
      requiredRoleId: requiredRole.id,
      threshold
    };

    try {
      await setGuildConfig(guildId, config);

      if (enabled) {
        await interaction.editReply({
          content: `✅ Room active check feature has been **enabled** and saved to database with the following settings:
📊 **Primary Channel**: ${primaryChannel.name}
👁️ **Secondary Channel**: ${secondaryChannel.name}
🎭 **Required Role**: ${requiredRole.name}
📈 **Threshold**: ${threshold} members
                
The secondary channel will be visible to the required role when the primary channel has more than ${threshold} members.`
        });
      } else {
        await interaction.editReply({
          content: `❌ Room active check feature has been **disabled** for this server and saved to database.`
        });
      }

      console.log(`🔧 Room active check feature ${enabled ? 'enabled' : 'disabled'} and saved to database for guild: ${guildId}`);
      if (enabled) {
        console.log(`   Primary: ${primaryChannel.name} (${primaryChannel.id})`);
        console.log(`   Secondary: ${secondaryChannel.name} (${secondaryChannel.id})`);
        console.log(`   Role: ${requiredRole.name} (${requiredRole.id})`);
        console.log(`   Threshold: ${threshold}`);
      }

    } catch (dbError) {
      console.error('❌ Database error:', dbError);
      await interaction.editReply({
        content: '❌ An error occurred while saving the configuration to the database. Please try again.'
      });
    }

  } catch (error) {
    console.error('❌ Error in handleEnableRoomActiveCheck:', error);
    
    if (interaction.deferred) {
      await interaction.editReply({
        content: '❌ An error occurred while updating the feature settings.'
      });
    } else {
      await interaction.reply({
        content: '❌ An error occurred while updating the feature settings.',
        ephemeral: true
      });
    }
  }
}