import { getGuildConfig, manageChannelVisibility } from "../../utils/roomActiveCheckManager.js";

export async function handleVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild.id;
    
    // Get guild configuration
    const config = await getGuildConfig(guildId);
    if (!config || !config.enabled) {
        return; // Feature is disabled or not configured, do nothing
    }

    // Check if the voice state change involves either the primary OR secondary voice channel
    const primaryChannelId = config.primaryChannelId;
    const secondaryChannelId = config.secondaryChannelId;
    
    const affectsRelevantChannels = 
        oldState.channelId === primaryChannelId || 
        newState.channelId === primaryChannelId ||
        oldState.channelId === secondaryChannelId || 
        newState.channelId === secondaryChannelId;

    if (!affectsRelevantChannels) {
        return; // Change doesn't involve relevant channels, do nothing
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
        console.log(`📊 Voice state update detected - Primary channel "${primaryChannel.name}" member count: ${memberCount}`);

        // Manage channel visibility based on member count and secondary channel status
        await manageChannelVisibility(newState.guild, memberCount, config);

    } catch (error) {
        console.error('❌ Error in handleVoiceStateUpdate:', error);
    }
}