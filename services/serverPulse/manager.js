import { ServerPulseConfig } from "../../models/ServerPulse.js";
import { buildSnapshot } from "./snapshot.js";
import { buildPulseEmbed } from "./embed.js";
import { scheduleDebounced, clearGuildDebounce } from "./state.js";
import { flushAllActive } from "./voiceHours.js";

const DEBOUNCE_MS = 2500;
const MAX_CONSECUTIVE_FAILURES = 5;
const HOUR_FLUSH_INTERVAL_MS = 60_000;

// Config cache: mirrors utils/roomActiveCheckManager.js's getGuildConfig/setGuildConfig.
const configCache = new Map();
const failureCounts = new Map();
let hourFlushInterval = null;

export async function setPulseConfig(guildId, updates) {
  // $set (not a bare replacement document) because callers pass partial
  // updates (e.g. just { roomLabels }) — a bare update document here would
  // wipe every other field, unlike RoomActiveCheck's setGuildConfig which
  // always receives the full field set.
  const updated = await ServerPulseConfig.findOneAndUpdate(
    { guildId },
    { $set: { guildId, ...updates } },
    { upsert: true, new: true }
  );
  configCache.set(guildId, updated.toObject());
  return updated;
}

export async function getPulseConfig(guildId) {
  if (configCache.has(guildId)) return configCache.get(guildId);

  const config = await ServerPulseConfig.findOne({ guildId });
  if (!config) return null;

  const configObj = config.toObject();
  configCache.set(guildId, configObj);
  return configObj;
}

export async function initializeGuildPulseState(guildId) {
  const existing = await ServerPulseConfig.findOne({ guildId });
  if (existing) {
    configCache.set(guildId, existing.toObject());
  }
  // Unlike RoomActiveCheck, no doc is created eagerly here — Server Pulse
  // stays fully absent (cache + DB) until an admin runs /serverpulse setup.
}

export async function removeGuildPulseState(guildId) {
  configCache.delete(guildId);
  clearGuildDebounce(guildId);
  failureCounts.delete(guildId);
  await ServerPulseConfig.findOneAndDelete({ guildId }).catch(() => {});
}

export function schedulePulseRefresh(guildId, client) {
  scheduleDebounced(
    guildId,
    () => {
      refreshPulse(guildId, client).catch((error) =>
        console.error(`❌ Server Pulse refresh failed for guild ${guildId}:`, error)
      );
    },
    DEBOUNCE_MS
  );
}

export async function refreshPulseNow(guildId, client) {
  await refreshPulse(guildId, client);
}

async function refreshPulse(guildId, client) {
  const config = await getPulseConfig(guildId);
  if (!config || !config.enabled || !config.pulseChannelId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const snapshot = await buildSnapshot(guild, config);
  const embed = buildPulseEmbed(snapshot);

  try {
    const channel = await guild.channels.fetch(config.pulseChannelId);
    if (!channel) throw new Error("Pulse channel not found");

    if (config.pulseMessageId) {
      try {
        const message = await channel.messages.fetch(config.pulseMessageId);
        await message.edit({ embeds: [embed] });
        failureCounts.delete(guildId);
        return;
      } catch (editError) {
        if (editError.code !== 10008) throw editError; // only recover from Unknown Message
      }
    }

    const message = await channel.send({ embeds: [embed] });
    await setPulseConfig(guildId, { pulseMessageId: message.id });
    failureCounts.delete(guildId);
  } catch (error) {
    console.error(`❌ Server Pulse edit failed for guild ${guildId}:`, error.message);
    const failures = (failureCounts.get(guildId) || 0) + 1;
    failureCounts.set(guildId, failures);

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`🛑 Disabling Server Pulse for guild ${guildId} after ${failures} consecutive failures`);
      failureCounts.delete(guildId);
      await setPulseConfig(guildId, { enabled: false }).catch(() => {});
    }
  }
}

// Periodic safety tick: flushes voice-hour accrual for long sitters and
// refreshes the Pulse for any guild that had something flush, so "today
// hours" keep climbing without waiting for someone to leave voice.
export function startHourFlushTick(client) {
  if (hourFlushInterval) return; // idempotent guard
  hourFlushInterval = setInterval(async () => {
    try {
      const activeGuildIds = await flushAllActive();
      for (const guildId of activeGuildIds) {
        const config = await getPulseConfig(guildId);
        if (config?.enabled) schedulePulseRefresh(guildId, client);
      }
    } catch (error) {
      console.error("❌ Error in Server Pulse hour-flush tick:", error);
    }
  }, HOUR_FLUSH_INTERVAL_MS);
}
