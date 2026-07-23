import { Session } from "../models/sessions.models.js";
import { getSessionEmbed } from "./getSessionEmbed.js";
import { schedulePulseRefresh } from "../services/serverPulse/manager.js";
import { POMODORO_FALLBACK_CHANNEL_ID } from "../config/constants.js";

export const activeTimers = new Map();

function canSend(channel, guild) {
  return !!channel?.isTextBased?.() &&
    !!channel.permissionsFor(guild.members.me)?.has(["SendMessages", "ViewChannel"]);
}

// Finds the guild + originally-started-in channel for a session. Prefers a
// direct guildId lookup (always set since start.js began storing it); falls
// back to scanning every guild for the channel only for pre-migration
// sessions with no guildId (these TTL out within 10 hours, so this path is
// short-lived). Scanning-by-channel can't recover once the channel itself
// is deleted, which is exactly the gap the direct guildId lookup closes.
async function findGuildAndChannel(session, client) {
  if (session.guildId) {
    const guild = client.guilds.cache.get(session.guildId);
    if (guild) {
      const channel = guild.channels.cache.get(session.channelId)
        ?? await guild.channels.fetch(session.channelId).catch(() => null);
      return { guild, channel };
    }
  }

  for (const [, guild] of client.guilds.cache) {
    const channel = guild.channels.cache.get(session.channelId)
      ?? await guild.channels.fetch(session.channelId).catch(() => null);
    if (channel) return { guild, channel };
  }

  return { guild: null, channel: null };
}

// Resolves where to deliver a solo Pomodoro notification, in priority order:
// 1) the user's current voice channel, if they're in one — the session
//    "follows" them so it never keeps posting into a channel they've left,
//    which also matters because that original channel is often a temporary
//    voice channel that gets deleted once they leave it;
// 2) the channel the session was started in, if it still exists (used when
//    the user isn't in voice);
// 3) the configured fallback channel, for when the original is gone and
//    there's no live voice channel to use instead;
// 4) the guild's system channel / first viewable text channel, as a last resort.
async function resolveNotificationChannel(session, client) {
  const { guild, channel: originalChannel } = await findGuildAndChannel(session, client);
  if (!guild) return { guild: null, channel: null };

  const member = await guild.members.fetch(session.userId).catch(() => null);
  const voiceChannel = member?.voice?.channel;

  if (canSend(voiceChannel, guild)) return { guild, channel: voiceChannel };
  if (canSend(originalChannel, guild)) return { guild, channel: originalChannel };

  if (POMODORO_FALLBACK_CHANNEL_ID) {
    const fallbackChannel = guild.channels.cache.get(POMODORO_FALLBACK_CHANNEL_ID)
      ?? await guild.channels.fetch(POMODORO_FALLBACK_CHANNEL_ID).catch(() => null);
    if (canSend(fallbackChannel, guild)) return { guild, channel: fallbackChannel };
  }

  const systemChannel = guild.systemChannel
    || guild.channels.cache.find((ch) => ch.isTextBased() && ch.viewable);
  return { guild, channel: canSend(systemChannel, guild) ? systemChannel : null };
}

export async function startPomodoroLoop(userId, client) {
  // Clear any existing timer for this user first
  const existingTimer = activeTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    activeTimers.delete(userId);
    console.log(`🧹 Cleared existing timer for user ${userId}`);
  }

  const session = await Session.findOne({ userId, isActive: true });
  if (!session) {
    console.log(`❌ No active session found for user ${userId}`);
    return;
  }

  console.log(`▶️ Starting Pomodoro loop for ${userId}`);
  console.log(`⏱️ Work: ${session.workDuration}m | Break: ${session.breakDuration}m | Long Break: ${session.longBreakDuration}m`);
  console.log(`📊 Sessions before long break: ${session.sessionsBeforeLongBreak} | Max sessions: ${session.maxSessions}`);

  // Start the first study phase timer (don't send initial reminder as it's sent in start.js)
  console.log(`🔁 Starting initial study phase for ${session.workDuration} minute(s)...`);
  
  const timeoutId = setTimeout(() => {
    activeTimers.delete(userId);
    handlePhaseCompletion(userId, client);
  }, session.workDuration * 60 * 1000);

  activeTimers.set(userId, timeoutId);
}

// Called once on bot boot: re-arms a timer for every session left `isActive`
// from before the restart, using the phase's actualEndTimestamp instead of
// the full phase duration. Without this, a restart silently orphans every
// running solo session — the DB doc stays isActive forever (or until the
// unconditional 10h TTL), but nothing ever fires its next phase again.
// Known limitation: if the bot was down long enough for more than one phase
// boundary to pass, this only catches up one phase per session on boot —
// handlePhaseCompletion re-arms the *next* phase at full duration from now,
// not further compressed. Acceptable for restarts on the order of minutes;
// not exact for multi-hour outages.
export async function resumeAllActiveSessions(client) {
  const sessions = await Session.find({ isActive: true });
  console.log(`🔁 Resuming ${sessions.length} active solo Pomodoro session(s) after restart`);

  for (const session of sessions) {
    const { userId } = session;

    const existingTimer = activeTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      activeTimers.delete(userId);
    }

    const remainingMs = session.actualEndTimestamp
      ? session.actualEndTimestamp.getTime() - Date.now()
      : 0;

    const timeoutId = setTimeout(() => {
      activeTimers.delete(userId);
      handlePhaseCompletion(userId, client);
    }, Math.max(0, remainingMs));

    activeTimers.set(userId, timeoutId);
  }
}

async function handlePhaseCompletion(userId, client) {
  const session = await Session.findOne({ userId, isActive: true });
  if (!session) {
    console.log(`❌ No active session found for user ${userId} during phase completion`);
    return;
  }

  const {
    workDuration,
    breakDuration,
    longBreakDuration,
    sessionsBeforeLongBreak,
    maxSessions,
    completedSessions,
    phase: currentPhase
  } = session;

  console.log(`⏰ Phase completed: ${currentPhase} for user ${userId}`);

  let nextPhase;
  let duration;
  let shouldIncrementSession = false;
  let shouldEndSession = false;

  if (currentPhase === 'study') {
    // Study phase completed - increment session count
    shouldIncrementSession = true;
    const newCompletedSessions = completedSessions + 1;

    console.log(`✅ Study session ${newCompletedSessions}/${maxSessions} completed`);

    // Check if this was the last session
    if (newCompletedSessions >= maxSessions) {
      await Session.updateOne({ userId }, { completedSessions: newCompletedSessions });
      await endPomodoroSession(userId, client);
      return;
    }

    // Determine break type
    if (newCompletedSessions % sessionsBeforeLongBreak === 0) {
      // Time for a long break
      nextPhase = 'long_break';
      duration = longBreakDuration;
      console.log(`🌴 Starting long break after ${newCompletedSessions} sessions`);
    } else {
      // Regular break
      nextPhase = 'break';
      duration = breakDuration;
      console.log(`☕ Starting short break after session ${newCompletedSessions}`);
    }

  } else if (currentPhase === 'break' || currentPhase === 'long_break') {
    // Break completed - start next study session
    nextPhase = 'study';
    duration = workDuration;
    console.log(`📚 Break completed, starting next study session`);
  }

  // Calculate actual end timestamp
  const actualEndTime = Date.now() + (duration * 60 * 1000);

  // Update session in database
  const updateData = {
    phase: nextPhase,
    endTime: duration,
    actualEndTimestamp: new Date(actualEndTime) // Always set this
  };

  if (shouldIncrementSession) {
    updateData.completedSessions = completedSessions + 1;
  }

  await Session.updateOne({ userId }, updateData);

  if (session.guildId) schedulePulseRefresh(session.guildId, client);

  console.log(`🔄 Phase transition: ${currentPhase} → ${nextPhase} (${duration}m)`);
  console.log(`⏰ New phase will end at: ${new Date(actualEndTime).toLocaleTimeString()}`);

  // Send reminder for the new phase
  await remindUser(userId, nextPhase, duration, client);

  // Set timer for the new phase
  const timeoutId = setTimeout(() => {
    activeTimers.delete(userId);
    handlePhaseCompletion(userId, client);
  }, duration * 60 * 1000);

  activeTimers.set(userId, timeoutId);
}

async function remindUser(userId, phase, duration, client) {
  try {
    const session = await Session.findOne({ userId, isActive: true });
    if (!session || !session.channelId) {
      console.log(`❌ No session or channel found for user ${userId}`);
      return;
    }

    const { guild, channel } = await resolveNotificationChannel(session, client);
    if (!guild || !channel) {
      console.log(`❌ Could not resolve a notification channel for user ${userId}`);
      return;
    }

    const { embed, components } = await getSessionEmbed(userId);
    if (!embed) {
      console.log(`❌ No embed generated for user ${userId}`);
      return;
    }

    const phaseMessages = {
      study: `🔥 Time to focus! Study session started.`,
      break: `☕ Break time! Take a short rest.`,
      long_break: `🌴 Long break time! You've earned this rest.`
    };

    const message = `⏰ <@${userId}> ${phaseMessages[phase] || 'New phase started!'}`;

    await channel.send({ content: message, embeds: [embed], components });
    console.log(`📣 Sent ${phase} reminder to #${channel.name} in ${guild.name}`);
  } catch (err) {
    console.error("❌ Reminder error:", err);
  }
}

async function endPomodoroSession(userId, client) {
  try {
    // Get the session to find the original channel
    const session = await Session.findOne({ userId, isActive: true });

    // Update session to inactive
    await Session.updateOne({ userId }, { isActive: false });

    if (session?.guildId) schedulePulseRefresh(session.guildId, client);

    // Clear timer
    const timer = activeTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(userId);
    }

    if (!session?.channelId) {
      console.log(`❌ No channel ID found for completion message`);
      return;
    }

    const { guild: targetGuild, channel: channelToUse } = await resolveNotificationChannel(session, client);
    if (!targetGuild || !channelToUse) {
      console.log(`❌ Could not resolve a notification channel for completion message`);
      return;
    }

    const userMention = `<@${userId}>`;
    const message = `🏁 ${userMention} **Congratulations!** 🎉\n\nYour Pomodoro session is complete! You've successfully finished all your study sessions. Great job today! 💪✨`;

    const completionEmbed = {
      title: "🍅 Pomodoro Session Complete!",
      description: "Well done! You've completed all your study sessions.",
      color: 0x2ecc71,
      fields: [
        {
          name: "🎯 Achievement Unlocked",
          value: "Consistent Focus Master",
          inline: true
        },
        {
          name: "⏰ Session Status", 
          value: "All sessions completed successfully",
          inline: true
        }
      ],
      footer: {
        text: "Ready for another productive session? Use /pomodoro start!"
      },
      timestamp: new Date().toISOString()
    };

    await channelToUse.send({ content: message, embeds: [completionEmbed] }).catch(() => {});
    console.log(`🏁 Sent completion message to channel: ${channelToUse.name} in ${targetGuild.name}`);

    console.log(`🏁 Pomodoro session completed successfully for user ${userId}`);
  } catch (err) {
    console.error("❌ Failed to end session:", err);
  }
}
// Export the phase completion handler for use in skip functionality
export { handlePhaseCompletion };