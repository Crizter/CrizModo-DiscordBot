import { EmbedBuilder } from "discord.js";

const MAX_NAMES_PER_ROOM = 8;
const MAX_ROOMS_SHOWN = 6;
const WAVE_WIDTH = 22;
const HOUR_BAR_WIDTH = 10;
const MAX_ROOM_LABEL = 12;

const BLOCKS = "▁▂▃▄▅▆▇█";

// Activity levels — a status encoding, not decoration. Score = people in
// voice + active pomodoros. Identity is never color-alone: the level name is
// always printed next to the wave. Colors are Discord's own semantic ramp
// (grey → blurple → cyan → green → amber → red) so the embed reads native.
const ACTIVITY_LEVELS = [
  { min: 0,  name: "DORMANT",    color: 0x4e5058, beat: [0],                tagline: "All quiet — be the first one in." },
  { min: 1,  name: "QUIET",      color: 0x5865f2, beat: [0, 0, 1, 2, 1, 0], tagline: "A few night owls around." },
  { min: 4,  name: "WARMING UP", color: 0x00a8fc, beat: [0, 1, 3, 4, 3, 1], tagline: "People are settling in." },
  { min: 9,  name: "ACTIVE",     color: 0x23a55a, beat: [1, 3, 5, 7, 5, 3], tagline: "The server is humming." },
  { min: 16, name: "BUZZING",    color: 0xf0b232, beat: [2, 4, 6, 7, 6, 4], tagline: "Study rooms are filling up." },
  { min: 31, name: "PEAK",       color: 0xf23f43, beat: [4, 6, 7, 7, 7, 6], tagline: "Peak hours — full house." },
];

function activityLevelFor(score) {
  let level = ACTIVITY_LEVELS[0];
  for (const candidate of ACTIVITY_LEVELS) {
    if (score >= candidate.min) level = candidate;
  }
  return level;
}

// Repeat the level's beat pattern into a fixed-width waveform of block chars.
function buildWave(beat) {
  let wave = "";
  for (let i = 0; i < WAVE_WIDTH; i++) {
    wave += BLOCKS[beat[i % beat.length]];
  }
  return wave;
}

function truncateLabel(label, max) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function proportionalBar(value, max, width) {
  const filled = max > 0 ? Math.max(1, Math.round((value / max) * width)) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// One field per room: "🔊 Name — N" as the header (a single simple emoji —
// channel names and display names are already emoji-stripped in snapshot.js),
// members as a vertical bulleted list.
function buildMemberList(names) {
  const shown = names.slice(0, MAX_NAMES_PER_ROOM);
  const lines = shown.map((name) => `- ${name}`);
  if (names.length > MAX_NAMES_PER_ROOM) {
    lines.push(`- +${names.length - MAX_NAMES_PER_ROOM} more`);
  }
  return lines.join("\n");
}

function buildRoomFields(rooms) {
  if (rooms.length === 0) {
    return [{ name: "🔊 Voice rooms", value: "Nobody in voice right now.", inline: false }];
  }

  const fields = rooms.slice(0, MAX_ROOMS_SHOWN).map((room) => ({
    name: `🔊 ${truncateLabel(room.label, 40)} — ${room.count}`,
    value: buildMemberList(room.names),
    inline: false,
  }));

  const hidden = rooms.slice(MAX_ROOMS_SHOWN);
  if (hidden.length > 0) {
    const hiddenPeople = hidden.reduce((sum, r) => sum + r.count, 0);
    fields.push({
      name: "🔊 More rooms",
      value: `+${hidden.length} rooms · ${hiddenPeople} people`,
      inline: false,
    });
  }

  return fields;
}

// Ranked magnitude → proportional monospace bars in a code block. Labels are
// padded so bars share a common baseline; values right-aligned.
function buildHoursFieldValue(topRoomsToday) {
  if (topRoomsToday.length === 0) {
    return "No voice hours logged yet today.";
  }

  const rows = topRoomsToday.map((room) => ({
    label: truncateLabel(room.label, MAX_ROOM_LABEL),
    hours: room.hours,
  }));

  const labelWidth = Math.max(...rows.map((r) => r.label.length));
  const maxHours = Math.max(...rows.map((r) => r.hours));

  const lines = rows.map((row) => {
    const label = row.label.padEnd(labelWidth);
    const bar = proportionalBar(row.hours, maxHours, HOUR_BAR_WIDTH);
    const value = `${row.hours.toFixed(1)}h`.padStart(6);
    return `${label}  ${bar} ${value}`;
  });

  return "```\n" + lines.join("\n") + "\n```";
}

function buildSessionsFieldValue(pomodoros, lobbies) {
  const lines = [];

  // Phase breakdown only when it adds information — "(2 focus · 0 break)"
  // is noise; a uniform batch just says "(focus)" or "(break)".
  const describe = (count, focus, brk, kind) => {
    const phases = focus > 0 && brk > 0 ? `${focus} focus · ${brk} break` : focus > 0 ? "focus" : "break";
    return `${count} ${kind} (${phases})`;
  };

  const parts = [];
  if (pomodoros.group > 0) {
    parts.push(describe(pomodoros.group, pomodoros.groupFocus, pomodoros.groupBreak, "group"));
  }
  if (pomodoros.solo > 0) {
    parts.push(describe(pomodoros.solo, pomodoros.soloFocus, pomodoros.soloBreak, "solo"));
  }
  lines.push(parts.length ? parts.join(" · ") : "None running — `/pomodoro start` to open one.");

  for (const lobby of lobbies) {
    lines.push(`Lobby open in <#${lobby.channelId}> · code **${lobby.sessionId}**`);
  }

  return lines.join("\n");
}

export function buildPulseEmbed(snapshot) {
  const { totalInVoice, rooms, totalHoursToday, topRoomsToday, pomodoros, lobbies } = snapshot;
  const totalPomos = pomodoros.solo + pomodoros.group;

  const level = activityLevelFor(totalInVoice + totalPomos);
  const wave = buildWave(level.beat);

  const description = [
    "```",
    wave,
    "```",
    `### ${level.name}`,
    level.tagline,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setAuthor({ name: "SERVER PULSE · LIVE" })
    .setDescription(description)
    .setColor(level.color)
    .addFields(
      // KPI row — three inline stat tiles.
      { name: "In voice", value: `**${totalInVoice}**`, inline: true },
      { name: "Focus sessions", value: `**${totalPomos}**`, inline: true },
      { name: "Hours today", value: `**${totalHoursToday.toFixed(1)}h**`, inline: true },
      ...buildRoomFields(rooms),
      { name: "Today's top rooms", value: buildHoursFieldValue(topRoomsToday), inline: false },
      { name: "Pomodoros", value: buildSessionsFieldValue(pomodoros, lobbies), inline: false },
    )
    .setFooter({ text: "Live · updates automatically" })
    .setTimestamp();

  return embed;
}
