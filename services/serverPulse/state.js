// Single owner of Server Pulse's in-memory state: the per-guild debounce
// timer registry and the live voice-join tracker. Every other Server Pulse
// module reads/writes through the functions exported here — nothing else
// should declare its own copy of these Maps. (See utils/groupPomodoroManager.js
// vs utils/startGroupPomodoroLoop.js for what happens when that rule is broken:
// two same-named `activeGroupTimers` Maps, silently diverging.)

const debounceTimers = new Map(); // guildId -> Timeout
const joinTracker = new Map(); // "guildId:userId" -> { channelId, joinedAt }

function trackerKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function scheduleDebounced(guildId, fn, delayMs) {
  const existing = debounceTimers.get(guildId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    debounceTimers.delete(guildId);
    fn();
  }, delayMs);

  debounceTimers.set(guildId, timer);
}

export function clearGuildDebounce(guildId) {
  const existing = debounceTimers.get(guildId);
  if (existing) {
    clearTimeout(existing);
    debounceTimers.delete(guildId);
  }
}

export function trackJoin(guildId, userId, channelId, joinedAt = new Date()) {
  joinTracker.set(trackerKey(guildId, userId), { channelId, joinedAt });
}

export function untrackUser(guildId, userId) {
  const key = trackerKey(guildId, userId);
  const entry = joinTracker.get(key) ?? null;
  joinTracker.delete(key);
  return entry;
}

export function allTrackedEntries() {
  return Array.from(joinTracker.entries()).map(([key, entry]) => {
    const separatorIndex = key.indexOf(":");
    return [key.slice(0, separatorIndex), key.slice(separatorIndex + 1), entry];
  });
}
