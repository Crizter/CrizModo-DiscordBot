import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { DeepFocusSession } from "../../models/DeepFocusSession.js";
import { DeepFocusPreference } from "../../models/DeepFocusPreference.js";
import {
  DEEP_FOCUS_ENABLED,
  DEEP_FOCUS_ROLE_ID,
  DEEP_FOCUS_LOG_CHANNEL_ID,
  DEEP_FOCUS_STRIPPABLE_ROLE_IDS,
} from "../../config/constants.js";

const SWEEP_INTERVAL_MS = 60_000;
const STALE_ENTERING_MS = 5 * 60_000; // 'entering' older than this = crashed entry
const MAX_RESTORE_ATTEMPTS = 5;
export const MAX_DURATION_HOURS = 24;
export const DEFAULT_DURATION_HOURS = 24;

// Fixed allowlist for the "allowed channel" exception overwrite — a channel
// the user picks (or their current voice channel) to stay visible/joinable
// despite the category-level Deep Focus deny. Deliberately NOT "whatever
// perms they currently have": copying only these flags, and only the ones
// the member already holds, means the overwrite can never grant anything new
// or leak a moderation-ish permission even if the member happens to have one
// via some other role. See resolveChannelException.
const CHANNEL_OVERWRITE_SAFE_FLAGS = [
  "ViewChannel",
  "Connect",
  "Speak",
  "Stream",
  "UseVAD",
  "RequestToSpeak",
  "SendMessages",
  "ReadMessageHistory",
  "AddReactions",
  "EmbedLinks",
  "AttachFiles",
  "UseApplicationCommands",
  "UseExternalEmojis",
  "UseExternalStickers",
];

let sweepInterval = null;

// Rate limiting (in-memory — resets on restart, which is fine for abuse
// throttling). Enter is gated for 30s after any enter/exit so button spam
// can't thrash role strips/restores; EXIT IS NEVER GATED — users must never
// feel trapped in focus mode. The tag toggle gets a light 3s guard.
// const ENTER_COOLDOWN_MS = 30_000;
// const TOGGLE_COOLDOWN_MS = 3_000;
const ENTER_COOLDOWN_MS= 0 ;
const TOGGLE_COOLDOWN_MS = 0 ; 
const lastStateChange = new Map(); // "guildId:userId" -> timestamp of last enter/exit
const lastTagToggle = new Map(); // "guildId:userId" -> timestamp of last toggle

function cooldownRemaining(map, key, windowMs) {
  const ts = map.get(key);
  if (!ts) return 0;
  return Math.max(0, windowMs - (Date.now() - ts));
}

function pruneCooldowns() {
  const now = Date.now();
  for (const [key, ts] of lastStateChange) {
    if (now - ts > ENTER_COOLDOWN_MS) lastStateChange.delete(key);
  }
  for (const [key, ts] of lastTagToggle) {
    if (now - ts > TOGGLE_COOLDOWN_MS) lastTagToggle.delete(key);
  }
}

// The only place status/isOpen are closed together, so the unique partial
// index invariant (isOpen mirrors "entering|active") can't drift.
async function markClosed(session, status) {
  session.status = status;
  session.isOpen = false;
  await session.save();
}

function unixSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

// Embed field values cap at 1024 chars — chunk long role lists across fields.
function chunkedFields(name, lines) {
  const fields = [];
  let current = [];
  let currentLen = 0;
  for (const line of lines) {
    if (currentLen + line.length + 1 > 1000 && current.length > 0) {
      fields.push({ name: fields.length === 0 ? name : `${name} (cont.)`, value: current.join("\n") });
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += line.length + 1;
  }
  fields.push({
    name: fields.length === 0 ? name : `${name} (cont.)`,
    value: current.length > 0 ? current.join("\n") : "*(none)*",
  });
  return fields;
}

// Never trust a channel id at face value — only ever preserve access the
// member ALREADY has, never grant anything new. Must be called BEFORE any
// Deep Focus mutation (role add/strip), while permissionsFor() still
// reflects the member's real, un-stripped roles. Returns null if the member
// doesn't currently have ViewChannel (+Connect for voice channels) — this is
// what stops someone from naming another user's private temp/cam channel
// they were never let into.
function resolveChannelException(channel, member) {
  if (!channel || typeof channel.permissionsFor !== "function") return null;
  const perms = channel.permissionsFor(member);
  if (!perms || !perms.has(PermissionFlagsBits.ViewChannel)) return null;
  if (channel.isVoiceBased?.() && !perms.has(PermissionFlagsBits.Connect)) return null;

  const overwrite = {};
  for (const flagName of CHANNEL_OVERWRITE_SAFE_FLAGS) {
    if (perms.has(PermissionFlagsBits[flagName])) overwrite[flagName] = true;
  }
  return overwrite;
}

// Posted BEFORE any mutation — this message is the manual recovery backup if
// the DB doc is ever lost. Raw IDs are the real payload: role mentions render
// blank once a role is deleted. Throws on failure so entry aborts cleanly.
async function postSnapshotLog(client, member, { savedRoleIds, allRoleIds, expiresAt, durationHours, savedNickname, targetChannel }) {
  const channel = await client.channels.fetch(DEEP_FOCUS_LOG_CHANNEL_ID);
  if (!channel) throw new Error("Deep Focus log channel not found");

  const strippedLines = savedRoleIds.length
    ? savedRoleIds.map((id) => `<@&${id}> \`${id}\``)
    : ["*(no allowlist roles to strip)*"];
  const allLines = allRoleIds.length ? allRoleIds.map((id) => `\`${id}\``) : ["*(none)*"];

  const embed = new EmbedBuilder()
    .setTitle(`📵 Deep Focus snapshot — ${member.user.tag}`)
    .setDescription(
      [
        `**User:** <@${member.id}> \`${member.id}\``,
        `**Entered:** <t:${unixSeconds(new Date())}:F>`,
        `**Expires:** <t:${unixSeconds(expiresAt)}:F> (${durationHours}h)`,
        `**Nickname at entry:** ${savedNickname ? `\`${savedNickname}\`` : "*(none — global display name)*"}`,
        `**Allowed channel exception:** ${targetChannel ? `<#${targetChannel.id}> \`${targetChannel.id}\`` : "*(none)*"}`,
      ].join("\n")
    )
    .addFields(
      ...chunkedFields("Stripped roles (restored on exit)", strippedLines),
      ...chunkedFields("All roles at entry (raw IDs)", allLines)
    )
    .setColor(0x5865f2)
    .setFooter({ text: `userId: ${member.id}` })
    .setTimestamp();

  return await channel.send({ embeds: [embed] });
}

async function postRestoreFailureAlert(client, session) {
  try {
    const channel = await client.channels.fetch(DEEP_FOCUS_LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const roleLines = session.savedRoleIds.length
      ? session.savedRoleIds.map((id) => `\`${id}\``)
      : ["*(none)*"];

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Deep Focus restore FAILED — manual action needed")
      .setDescription(
        [
          `Could not restore roles for <@${session.userId}> \`${session.userId}\` after ${session.restoreAttempts} attempts.`,
          `Re-add the roles below manually and remove the Deep Focus role.`,
          session.allowedChannelId
            ? `Also manually clear the member permission overwrite on <#${session.allowedChannelId}> \`${session.allowedChannelId}\` (Deep Focus allowed-channel exception).`
            : "",
        ].filter(Boolean).join("\n")
      )
      .addFields(...chunkedFields("Roles to restore (raw IDs)", roleLines))
      .setColor(0xf23f43)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("❌ Could not post Deep Focus restore-failure alert:", error);
  }
}

export async function getOpenSession(guildId, userId) {
  return await DeepFocusSession.findOne({ guildId, userId, isOpen: true });
}

export async function getShowTagPreference(guildId, userId) {
  const pref = await DeepFocusPreference.findOne({ guildId, userId });
  return pref ? pref.showTag : true; // tag defaults on
}

export async function setShowTagPreference(guildId, userId, showTag) {
  await DeepFocusPreference.findOneAndUpdate(
    { guildId, userId },
    { $set: { showTag } },
    { upsert: true }
  );
}

// Flips the stored preference (pinned-message toggle button). Rate-limited;
// affects the NEXT entry — an already-applied nickname is left alone.
export async function toggleShowTagPreference(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const remainingMs = cooldownRemaining(lastTagToggle, key, TOGGLE_COOLDOWN_MS);
  if (remainingMs > 0) {
    return { ok: false, remainingMs };
  }
  lastTagToggle.set(key, Date.now());

  const current = await getShowTagPreference(guildId, userId);
  await setShowTagPreference(guildId, userId, !current);
  return { ok: true, showTag: !current };
}

// Crash-safe ordering: nothing is mutated until both the log message and the
// DB doc (with the full savedRoleIds list) exist — so recovery is always
// possible no matter where a crash lands. See the sweep for the recovery
// paths ('entering' docs older than 5 min get rolled back/forward).
// showTag: true/false = explicit choice (persisted as the user's preference);
// null/undefined = resolve from the stored preference (button entry).
// channelId: explicit channel picked via the /deepfocus start option; null =
// fall back to the member's current voice channel, if any (covers button
// entry, which can't carry command options).
export async function enterDeepFocus({ member, client, durationHours = DEFAULT_DURATION_HOURS, showTag = null, channelId = null }) {
  if (!DEEP_FOCUS_ENABLED) {
    return { ok: false, error: "Deep Focus is currently disabled." };
  }

  // Rate limit: one enter per 30s window after any enter/exit — throttles
  // button-spam thrash of role strips/restores. Exit is never gated.
  const cooldownKey = `${member.guild.id}:${member.id}`;
  const remainingMs = cooldownRemaining(lastStateChange, cooldownKey, ENTER_COOLDOWN_MS);
  if (remainingMs > 0) {
    return {
      ok: false,
      error: `Slow down — you can enter Deep Focus again in **${Math.ceil(remainingMs / 1000)}s**.`,
    };
  }

  const hours = Math.min(Math.max(Math.round(durationHours), 1), MAX_DURATION_HOURS);
  const guild = member.guild;
  const botMember = guild.members.me;

  // 1. Validations — fail fast before touching anything.
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, error: "I'm missing the **Manage Roles** permission." };
  }
  const focusRole = guild.roles.cache.get(DEEP_FOCUS_ROLE_ID);
  if (!focusRole) {
    return { ok: false, error: "The Deep Focus role doesn't exist on this server." };
  }
  if (focusRole.position >= botMember.roles.highest.position) {
    return { ok: false, error: "The Deep Focus role is above my highest role — I can't assign it." };
  }
  if (await getOpenSession(guild.id, member.id)) {
    return { ok: false, error: "You're already in Deep Focus. Use `/deepfocus exit` to leave." };
  }

  // 2. Compute what to strip: allowlist ∩ user's roles, minus roles the bot
  // can never touch (managed = booster/integration; above bot's top role).
  // Zero matches is fine — the Deep Focus role's deny overwrites are the core
  // mechanic; stripping only removes competing allows.
  const strippableRoles = member.roles.cache.filter(
    (role) =>
      DEEP_FOCUS_STRIPPABLE_ROLE_IDS.includes(role.id) &&
      !role.managed &&
      role.position < botMember.roles.highest.position
  );
  const savedRoleIds = [...strippableRoles.keys()];
  const allRoleIds = [...member.roles.cache.filter((r) => r.id !== guild.id).keys()];
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  const savedNickname = member.nickname; // null = using global display name

  // 2b. Resolve the allowed-channel exception now, while permissions still
  // reflect the member's real un-stripped roles — validation only, no
  // mutation yet (applied at step 6b, after the role strip below).
  // channelExceptionSkipReason surfaces in the reply text (see
  // buildEnterResultMessage) so a rejected/failed exception is visible from
  // Discord itself instead of only in the server console.
  const targetChannel = channelId ? guild.channels.cache.get(channelId) : member.voice.channel;
  let channelExceptionSkipReason = null;
  if (channelId && !targetChannel) {
    channelExceptionSkipReason = "channel_not_found";
  }
  const channelException = targetChannel ? resolveChannelException(targetChannel, member) : null;
  if (targetChannel && !channelException) {
    channelExceptionSkipReason = "no_access";
    console.log(`⚠️ Deep Focus: ${member.user.tag} picked <#${targetChannel.id}> but currently lacks View/Connect there — exception skipped`);
  }

  // 3. Log message first — the DB-loss backup exists before anything changes.
  let logMessage;
  try {
    logMessage = await postSnapshotLog(client, member, {
      savedRoleIds,
      allRoleIds,
      expiresAt,
      durationHours: hours,
      savedNickname,
      targetChannel: channelException ? targetChannel : null,
    });
  } catch (error) {
    console.error("❌ Deep Focus: snapshot log failed, aborting entry:", error);
    return { ok: false, error: "Couldn't write the role-snapshot log — nothing was changed. Try again." };
  }

  // 4. DB doc with the complete restore payload, still before any mutation.
  let session;
  try {
    session = await DeepFocusSession.create({
      guildId: guild.id,
      userId: member.id,
      savedRoleIds,
      allRoleIdsAtEntry: allRoleIds,
      logMessageId: logMessage.id,
      savedNickname,
      status: "entering",
      expiresAt,
      durationHours: hours,
    });
  } catch (error) {
    if (error.code === 11000) {
      return { ok: false, error: "You're already in Deep Focus." };
    }
    console.error("❌ Deep Focus: failed to save session:", error);
    return { ok: false, error: "Couldn't save your session — nothing was changed. Try again." };
  }

  // 5. Assign the Deep Focus role.
  try {
    await member.roles.add(DEEP_FOCUS_ROLE_ID, "Deep Focus entry");
  } catch (error) {
    console.error("❌ Deep Focus: failed to add focus role:", error);
    await markClosed(session, "failed");
    return { ok: false, error: "Couldn't assign the Deep Focus role. Nothing else was changed." };
  }

  // 5b. Optional visible tag: prefix the display name with 📵. Purely
  // cosmetic — never fails entry. The server owner and members above the bot
  // can't be renamed (member.manageable false) — skipped silently. Intent is
  // persisted BEFORE the rename so a crash between the two is covered by
  // restore's current-nickname === appliedNickname guard.
  let resolvedShowTag;
  if (showTag === null || showTag === undefined) {
    resolvedShowTag = await getShowTagPreference(guild.id, member.id);
  } else {
    resolvedShowTag = showTag;
    // Explicit command choice becomes the sticky preference for button entry.
    await setShowTagPreference(guild.id, member.id, showTag).catch(() => {});
  }

  let tagApplied = false;
  if (
    resolvedShowTag &&
    member.manageable &&
    botMember.permissions.has(PermissionFlagsBits.ManageNicknames)
  ) {
    const tagged = `📵 ${member.displayName}`.slice(0, 32);
    session.appliedNickname = tagged;
    await session.save();
    try {
      await member.setNickname(tagged, "Deep Focus entry — focus tag");
      tagApplied = true;
    } catch (error) {
      console.error(`❌ Deep Focus: couldn't set focus tag for ${member.id}:`, error.message);
      session.appliedNickname = null;
      await session.save();
    }
  }

  // 6. Strip the access roles, one by one — partial failures are tolerated:
  // savedRoleIds is already persisted, and restore's re-add is a no-op for
  // roles the user still has.
  for (const role of strippableRoles.values()) {
    try {
      await member.roles.remove(role, "Deep Focus entry — access role stripped");
    } catch (error) {
      console.error(`❌ Deep Focus: failed to strip role ${role.id} from ${member.id}:`, error.message);
    }
  }

  // 6b. Apply the allowed-channel exception, if one was resolved at 2b.
  // Member-level overwrite beats the category's role-level Deep Focus deny,
  // so this punches a hole for exactly one channel without reopening the
  // whole category. Purely additive, best-effort — never fails entry.
  let allowedChannelId = null;
  if (targetChannel && channelException) {
    try {
      await targetChannel.permissionOverwrites.edit(member.id, channelException, {
        reason: "Deep Focus entry — allowed channel exception",
      });
      allowedChannelId = targetChannel.id;
      console.log(`📵 Deep Focus: allowed-channel exception set for ${member.user.tag} on <#${targetChannel.id}> —`, channelException);
    } catch (error) {
      console.error(`❌ Deep Focus: couldn't set channel exception for ${member.id} on ${targetChannel.id}:`, error.message);
      channelExceptionSkipReason = "overwrite_failed";
    }
  }
  session.allowedChannelId = allowedChannelId;

  // 7. Session is live.
  session.status = "active";
  await session.save();

  lastStateChange.set(cooldownKey, Date.now());
  console.log(`📵 ${member.user.tag} entered Deep Focus for ${hours}h (${savedRoleIds.length} roles stripped)`);
  return { ok: true, session, strippedCount: savedRoleIds.length, expiresAt, tagApplied, allowedChannelId, channelExceptionSkipReason };
}

// Idempotent — safe to run repeatedly on the same session (the sweep retries
// partial failures every minute). Re-adds are guarded per-role: NOT
// roles.add([array]) (one deleted role id fails the whole PATCH) and never
// roles.set() (clobbers managed/booster roles).
export async function restoreSession(session, client, { reason = "Deep Focus ended" } = {}) {
  const guild = client.guilds.cache.get(session.guildId);
  if (!guild) {
    session.restoreAttempts += 1;
    await session.save();
    if (session.restoreAttempts >= MAX_RESTORE_ATTEMPTS) await markClosed(session, "failed");
    return { ok: false };
  }

  const member = await guild.members.fetch(session.userId).catch(() => null);
  if (!member) {
    // User left (or the GuildMemberRemove event was missed while the bot was
    // down) — keep the saved roles for staff, stop trying.
    await markClosed(session, "member_left");
    console.log(`📵 Deep Focus: ${session.userId} no longer in guild — session closed as member_left`);
    return { ok: true };
  }

  const botMember = guild.members.me;
  let failures = 0;

  for (const roleId of session.savedRoleIds) {
    if (member.roles.cache.has(roleId)) continue; // already back — idempotent
    const role = guild.roles.cache.get(roleId);
    // Deleted / managed / above-bot roles are permanently unrestorable — skip
    // rather than fail forever. The log message keeps the raw IDs for staff.
    if (!role || role.managed || role.position >= botMember.roles.highest.position) continue;
    try {
      await member.roles.add(role, reason);
    } catch (error) {
      console.error(`❌ Deep Focus: failed to restore role ${roleId} to ${member.id}:`, error.message);
      failures += 1;
    }
  }

  if (member.roles.cache.has(DEEP_FOCUS_ROLE_ID)) {
    try {
      await member.roles.remove(DEEP_FOCUS_ROLE_ID, reason);
    } catch (error) {
      console.error(`❌ Deep Focus: failed to remove focus role from ${member.id}:`, error.message);
      failures += 1;
    }
  }

  // Nickname restore — cosmetic, so it never counts toward failures or holds
  // the session open. Only fires while their current nickname is still the
  // exact tag the bot applied: a manual mid-focus rename is respected, and a
  // crash-before-rename at entry naturally skips here. Idempotent across
  // sweep retries (once restored, the guard no longer matches).
  if (
    session.appliedNickname &&
    member.nickname === session.appliedNickname &&
    member.manageable &&
    botMember.permissions.has(PermissionFlagsBits.ManageNicknames)
  ) {
    try {
      await member.setNickname(session.savedNickname ?? null, reason);
    } catch (error) {
      console.error(`❌ Deep Focus: couldn't restore nickname for ${member.id}:`, error.message);
    }
  }

  // Channel exception cleanup — unlike the nickname, this is a real access
  // grant (not cosmetic), so a failure here counts toward `failures` the same
  // as a role restore: it gets retried by the sweep and eventually alerts
  // staff via postRestoreFailureAlert rather than being silently dropped. A
  // since-deleted channel (routine for temp/cam channels) is a safe no-op —
  // the overwrite is already gone with the channel.
  if (session.allowedChannelId) {
    const exceptionChannel = guild.channels.cache.get(session.allowedChannelId);
    if (exceptionChannel) {
      try {
        await exceptionChannel.permissionOverwrites.delete(member.id, reason);
      } catch (error) {
        console.error(`❌ Deep Focus: couldn't clear channel exception for ${member.id}:`, error.message);
        failures += 1;
      }
    }
  }

  if (failures === 0) {
    await markClosed(session, "restored");
    console.log(`📵 Deep Focus: restored ${session.savedRoleIds.length} roles for ${member.user.tag}`);
    return { ok: true };
  }

  session.restoreAttempts += 1;
  await session.save();
  if (session.restoreAttempts >= MAX_RESTORE_ATTEMPTS) {
    await postRestoreFailureAlert(client, session);
    await markClosed(session, "failed");
  }
  return { ok: false };
}

export async function requestExit(guildId, userId, client) {
  const session = await getOpenSession(guildId, userId);

  if (!session) {
    // Role without a doc (manual admin assignment) — just take the role off.
    const guild = client.guilds.cache.get(guildId);
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    if (member?.roles.cache.has(DEEP_FOCUS_ROLE_ID)) {
      await member.roles.remove(DEEP_FOCUS_ROLE_ID, "Deep Focus exit — no saved session").catch(() => {});
      return { ok: true, hadSession: false };
    }
    return { ok: false, hadSession: false };
  }

  // Pull expiry to now BEFORE restoring: if this restore partially fails, the
  // sweep's normal expiry query retries it every minute instead of waiting
  // out the original duration.
  session.expiresAt = new Date();
  await session.save();

  const result = await restoreSession(session, client, { reason: "Deep Focus manual exit" });
  // Exit itself is never rate-limited, but it arms the enter cooldown so an
  // immediate re-enter (thrash cycle) is throttled.
  lastStateChange.set(`${guildId}:${userId}`, Date.now());
  return { ok: result.ok, hadSession: true };
}

// Used by the GuildMemberRemove listener — keeps savedRoleIds for staff.
export async function closeSessionForDepartedMember(guildId, userId) {
  const session = await getOpenSession(guildId, userId);
  if (!session) return;
  await markClosed(session, "member_left");
  console.log(`📵 Deep Focus: ${userId} left the guild mid-focus — session closed, roles kept in DB`);
}

// Restart-proof by construction: expiry lives in the DB, not in memory.
// Note on the awaits inside: role ops are network I/O — they never block the
// event loop, only this function's own progress. The overlap guard below is
// the actual hazard to manage: a tick slowed past 60s by a mass-expiry
// backlog must not overlap the next tick and double-process sessions.
let sweepRunning = false;

export function startDeepFocusSweep(client) {
  if (sweepInterval) return; // idempotent guard
  sweepInterval = setInterval(async () => {
    if (sweepRunning) return; // previous tick still draining a backlog
    sweepRunning = true;
    try {
      const now = new Date();

      // Expired sessions + failed-exit retries (requestExit pulls expiresAt
      // to now, so partial manual-exit failures land here too).
      const due = await DeepFocusSession.find({ status: "active", expiresAt: { $lte: now } });
      for (const session of due) {
        await restoreSession(session, client, { reason: "Deep Focus expired" });
      }

      // Crashed entries: 'entering' docs that never reached 'active'. Running
      // restore rolls them back (or forward — it's idempotent either way).
      const stale = await DeepFocusSession.find({
        status: "entering",
        updatedAt: { $lte: new Date(now.getTime() - STALE_ENTERING_MS) },
      });
      for (const session of stale) {
        console.log(`📵 Deep Focus: recovering crashed entry for ${session.userId}`);
        await restoreSession(session, client, { reason: "Deep Focus entry recovery" });
      }

      pruneCooldowns(); // keep the in-memory rate-limit maps tiny
    } catch (error) {
      console.error("❌ Error in Deep Focus sweep:", error);
    } finally {
      sweepRunning = false;
    }
  }, SWEEP_INTERVAL_MS);
}
