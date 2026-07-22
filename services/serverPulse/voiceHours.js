import { ChannelType } from "discord.js";
import { VoiceHourBucket } from "../../models/VoiceHourBucket.js";
import { trackJoin, untrackUser, allTrackedEntries } from "./state.js";

export function dayKeyFor(date = new Date()) {
  return date.toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

async function addMs(guildId, channelId, ms) {
  if (ms <= 0) return;
  await VoiceHourBucket.findOneAndUpdate(
    { guildId, channelId, dayKey: dayKeyFor() },
    { $inc: { ms } },
    { upsert: true }
  );
}

export function handleJoin(guildId, userId, channelId) {
  trackJoin(guildId, userId, channelId);
}

export async function handleLeave(guildId, userId) {
  const entry = untrackUser(guildId, userId);
  if (!entry) return;
  await addMs(guildId, entry.channelId, Date.now() - entry.joinedAt.getTime());
}

export async function handleMove(guildId, userId, newChannelId) {
  await handleLeave(guildId, userId);
  trackJoin(guildId, userId, newChannelId);
}

// Called on ClientReady: everyone already sitting in a voice channel counts
// as having just joined "now" — time before restart is already flushed into
// buckets from prior periodic ticks, so this only needs to seed the cursor,
// not backfill anything.
export function rehydrateFromGuild(guild) {
  const now = new Date();
  const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice);

  for (const channel of voiceChannels.values()) {
    for (const member of channel.members.values()) {
      if (member.user.bot) continue;
      trackJoin(guild.id, member.id, channel.id, now);
    }
  }
}

// Periodic safety tick: flush accrual for every currently-tracked user so
// "today hours" keep climbing for long sitters without waiting for a leave.
// Returns the distinct set of guildIds that had something to flush, so the
// caller can trigger a Pulse refresh only for guilds that actually changed
// (cost scales with concurrently-active voice users, not with guild count).
export async function flushAllActive() {
  const now = Date.now();
  const guildIds = new Set();

  for (const [guildId, userId, entry] of allTrackedEntries()) {
    guildIds.add(guildId);
    const elapsed = now - entry.joinedAt.getTime();
    if (elapsed > 0) {
      await addMs(guildId, entry.channelId, elapsed);
    }
    trackJoin(guildId, userId, entry.channelId, new Date(now));
  }

  return guildIds;
}

export async function getTodayHours(guildId) {
  const buckets = await VoiceHourBucket.find({ guildId, dayKey: dayKeyFor() });
  return buckets.map((b) => ({ channelId: b.channelId, ms: b.ms }));
}
