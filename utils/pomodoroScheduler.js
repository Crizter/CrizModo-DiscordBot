import { Session } from "../models/sessions.models.js";
import { getSessionEmbed } from "./getSessionEmbed.js";

export const activeTimers = new Map();

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
    // Get the session to find the original channel
    const session = await Session.findOne({ userId, isActive: true });
    if (!session || !session.channelId) {
      console.log(`❌ No session or channel found for user ${userId}`);
      return;
    }

    console.log(`🔍 Debug: Session channelId: ${session.channelId}`);

    // Find the guild that contains the channel
    let targetGuild = null;
    let originalChannel = null;

    for (const [, guild] of client.guilds.cache) {
      // Check if this guild has the channel in its cache
      const channel = guild.channels.cache.get(session.channelId);
      if (channel) {
        targetGuild = guild;
        originalChannel = channel;
        console.log(`🔍 Debug: Found channel in guild: ${guild.name}`);
        break;
      }
    }

    // If not found in cache, try to fetch from each guild until we find it
    if (!targetGuild) {
      for (const [, guild] of client.guilds.cache) {
        try {
          const channel = await guild.channels.fetch(session.channelId);
          if (channel) {
            targetGuild = guild;
            originalChannel = channel;
            console.log(`🔍 Debug: Fetched channel from guild: ${guild.name}`);
            break;
          }
        } catch (error) {
          // Channel doesn't belong to this guild, continue to next guild
          continue;
        }
      }
    }

    if (!targetGuild) {
      console.log(`❌ Could not find guild containing channel ${session.channelId}`);
      return;
    }

    // Check if user is in this guild
    const member = await targetGuild.members.fetch(userId).catch(() => null);
    if (!member) {
      console.log(`❌ User ${userId} not found in guild ${targetGuild.name}`);
      return;
    }

    console.log(`🔍 Debug: Original channel found: ${originalChannel ? originalChannel.name : 'NOT FOUND'}`);
    
    // Fallback to voice channel if original channel is not accessible
    const voiceChannel = member.voice?.channel;
    console.log(`🔍 Debug: Voice channel: ${voiceChannel ? voiceChannel.name : 'NOT FOUND'}`);
    
    // Final fallback to system channel
    const fallbackChannel = targetGuild.systemChannel || 
      targetGuild.channels.cache.find((ch) => ch.isTextBased() && ch.viewable);
    console.log(`🔍 Debug: Fallback channel: ${fallbackChannel ? fallbackChannel.name : 'NOT FOUND'}`);

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

    let messageSent = false;

    // Try original channel first
    if (originalChannel && originalChannel.isTextBased()) {
      console.log(`🔍 Debug: Checking permissions for original channel: ${originalChannel.name}`);
      const botPermissions = originalChannel.permissionsFor(targetGuild.members.me);
      console.log(`🔍 Debug: Bot permissions: SendMessages=${botPermissions?.has('SendMessages')}, ViewChannel=${botPermissions?.has('ViewChannel')}`);
      
      if (botPermissions?.has(['SendMessages', 'ViewChannel'])) {
        try {
          await originalChannel.send({ content: message, embeds: [embed], components });
          messageSent = true;
          console.log(`📣 Sent ${phase} reminder to original channel: ${originalChannel.name} in ${targetGuild.name}`);
        } catch (error) {
          console.log(`❌ Failed to send to original channel: ${error.message}`);
        }
      } else {
        console.log(`❌ Bot lacks permissions in original channel: ${originalChannel.name}`);
      }
    } else if (originalChannel) {
      console.log(`❌ Original channel ${originalChannel.name} is not text-based: ${originalChannel.type}`);
    }

    // Fallback to voice channel if original channel failed
    if (!messageSent && voiceChannel?.isTextBased() && voiceChannel?.permissionsFor(targetGuild.members.me)?.has(['SendMessages', 'ViewChannel'])) {
      try {
        await voiceChannel.send({ content: message, embeds: [embed], components });
        messageSent = true;
        console.log(`📣 Sent ${phase} reminder to voice channel: ${voiceChannel.name}`);
      } catch (error) {
        console.log(`❌ Failed to send to voice channel: ${error.message}`);
      }
    }

    // Final fallback
    if (!messageSent && fallbackChannel?.permissionsFor(targetGuild.members.me)?.has(['SendMessages', 'ViewChannel'])) {
      try {
        await fallbackChannel.send({ content: message, embeds: [embed], components });
        messageSent = true;
        console.log(`📣 Sent ${phase} reminder to fallback channel: ${fallbackChannel.name} in ${targetGuild.name}`);
      } catch (error) {
        console.log(`❌ Failed to send to fallback channel: ${error.message}`);
      }
    }

    if (!messageSent) {
      console.log(`❌ Failed to send message to any channel for user ${userId} in guild ${targetGuild.name}`);
    }

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

    // Find the guild that contains the channel
    let targetGuild = null;
    let originalChannel = null;

    for (const [, guild] of client.guilds.cache) {
      const channel = guild.channels.cache.get(session.channelId);
      if (channel) {
        targetGuild = guild;
        originalChannel = channel;
        break;
      }
    }

    if (!targetGuild) {
      for (const [, guild] of client.guilds.cache) {
        try {
          const channel = await guild.channels.fetch(session.channelId);
          if (channel) {
            targetGuild = guild;
            originalChannel = channel;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }

    if (!targetGuild) {
      console.log(`❌ Could not find guild for completion message`);
      return;
    }

    const member = await targetGuild.members.fetch(userId).catch(() => null);
    if (!member) {
      console.log(`❌ User not found in target guild for completion message`);
      return;
    }

    const voiceChannel = member.voice?.channel;
    const fallbackChannel = targetGuild.systemChannel || 
      targetGuild.channels.cache.find((ch) => ch.isTextBased() && ch.viewable);

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

    // Try original channel first, then voice channel, then fallback
    const channelToUse = (originalChannel?.isTextBased() ? originalChannel : null) || 
                        (voiceChannel?.isTextBased() ? voiceChannel : null) || 
                        fallbackChannel;
    
    if (channelToUse?.permissionsFor(targetGuild.members.me)?.has(['SendMessages', 'ViewChannel'])) {
      await channelToUse.send({ content: message, embeds: [completionEmbed] }).catch(() => {});
      console.log(`🏁 Sent completion message to channel: ${channelToUse.name} in ${targetGuild.name}`);
    }

    console.log(`🏁 Pomodoro session completed successfully for user ${userId}`);
  } catch (err) {
    console.error("❌ Failed to end session:", err);
  }
}
// Export the phase completion handler for use in skip functionality
export { handlePhaseCompletion };