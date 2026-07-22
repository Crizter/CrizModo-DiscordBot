import { getPulseConfig, schedulePulseRefresh } from "../../services/serverPulse/manager.js";
import { handleJoin, handleLeave, handleMove } from "../../services/serverPulse/voiceHours.js";

export async function handlePulseVoiceStateUpdate(oldState, newState) {
  const guildId = newState.guild.id;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return; // mute/deafen/etc — not a channel change

  const config = await getPulseConfig(guildId);
  if (!config || !config.enabled) return;

  const userId = member.id;

  try {
    if (!oldChannelId && newChannelId) {
      handleJoin(guildId, userId, newChannelId);
    } else if (oldChannelId && !newChannelId) {
      await handleLeave(guildId, userId);
    } else if (oldChannelId && newChannelId) {
      await handleMove(guildId, userId, newChannelId);
    }
  } catch (error) {
    console.error("❌ Error tracking voice hours for Server Pulse:", error);
  }

  schedulePulseRefresh(guildId, newState.client);
}
