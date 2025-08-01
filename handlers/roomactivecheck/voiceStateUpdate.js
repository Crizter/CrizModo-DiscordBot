import { PermissionFlagsBits } from "discord.js";
import { getGuildConfig, manageChannelVisibility } from "../../utils/roomActiveCheckManager.js";

export async function handleVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild.id;
    
    // Get guild configuration
    const config = await getGuildConfig(guildId);
    if (!config || !config.enabled) {
        return; // Feature is disabled or not configured, do nothing
    }

    // Check if the voice state change involves the primary voice channel
    const primaryChannelId = config.primaryChannelId;
    const affectsPrimaryChannel = 
        oldState.channelId === primaryChannelId || 
        newState.channelId === primaryChannelId;

    if (!affectsPrimaryChannel) {
        return; // Change doesn't involve primary channel, do nothing
    }

    try {
        // Get the primary voice channel
        const primaryChannel = await newState.guild.channels.fetch(primaryChannelId);
        if (!primaryChannel) {
            console.error('❌ Primary voice channel not found');
            return;
        }

        // Count members in primary channel
        const memberCount = primaryChannel.members.size;
        console.log(`📊 Primary channel "${primaryChannel.name}" member count: ${memberCount}`);

        // Manage channel visibility based on member count
        await manageChannelVisibility(newState.guild, memberCount, config);

    } catch (error) {
        console.error('❌ Error in handleVoiceStateUpdate:', error);
    }
}