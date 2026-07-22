import { ChannelType } from "discord.js";
import { GroupSession } from "../../models/GroupSession.js";
import { Session } from "../../models/sessions.models.js";
import { getTodayHours } from "./voiceHours.js";

const MS_PER_HOUR = 3_600_000;

// Study-server channel names and display names are heavy on emoji decoration
// ("🎉Join anytime…🐸", "Nana🔥"). Strip pictographs, variation selectors,
// ZWJs, skin tones, and keycap combiners so the Pulse reads clean; keep CJK
// and other real letters (someone named 潼 stays 潼). Falls back to the
// second argument when a name was pure emoji.
function cleanDisplayText(text, fallback = "") {
  const cleaned = (text || "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

export async function buildSnapshot(guild, config) {
  const labelMap = new Map((config.roomLabels || []).map((l) => [l.channelId, l.label]));

  const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice);
  const rooms = [];
  let totalInVoice = 0;

  for (const channel of voiceChannels.values()) {
    const members = channel.members.filter((m) => !m.user.bot);
    if (members.size === 0) continue;

    totalInVoice += members.size;
    rooms.push({
      channelId: channel.id,
      label: cleanDisplayText(labelMap.get(channel.id) || channel.name, "voice room"),
      count: members.size,
      names: members.map((m) => cleanDisplayText(m.displayName, m.user.username)),
    });
  }
  rooms.sort((a, b) => b.count - a.count);

  const todayBuckets = await getTodayHours(guild.id);
  const totalHoursToday = todayBuckets.reduce((sum, b) => sum + b.ms, 0) / MS_PER_HOUR;

  const topRoomsToday = todayBuckets
    .map((b) => ({
      channelId: b.channelId,
      label: cleanDisplayText(
        labelMap.get(b.channelId) || guild.channels.cache.get(b.channelId)?.name,
        "deleted-channel"
      ),
      hours: b.ms / MS_PER_HOUR,
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

  const [soloSessions, groupSessions] = await Promise.all([
    Session.find({ guildId: guild.id, isActive: true }),
    GroupSession.find({ guildId: guild.id, status: { $in: ["waiting", "active"] } }),
  ]);

  const groupActive = groupSessions.filter((s) => s.status === "active");
  const lobbies = groupSessions
    .filter((s) => s.status === "waiting")
    .map((s) => ({ channelId: s.channelId, sessionId: s.sessionId }));

  return {
    totalInVoice,
    rooms,
    totalHoursToday,
    topRoomsToday,
    pomodoros: {
      solo: soloSessions.length,
      soloFocus: soloSessions.filter((s) => s.phase === "study").length,
      soloBreak: soloSessions.filter((s) => s.phase !== "study").length,
      group: groupActive.length,
      groupFocus: groupActive.filter((s) => s.phase === "study").length,
      groupBreak: groupActive.filter((s) => s.phase !== "study").length,
    },
    lobbies,
  };
}
