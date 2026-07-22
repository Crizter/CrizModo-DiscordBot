import { Session } from "../../models/sessions.models.js";
import { startPomodoroLoop, activeTimers } from "../../utils/pomodoroScheduler.js";
import { getSessionEmbed } from "../../utils/getSessionEmbed.js";
import { schedulePulseRefresh } from "../../services/serverPulse/manager.js";

export async function handleStart(interaction, client) {
  const userId = interaction.user.id;
  const channelId = interaction.channelId; // Get the channel where command was used

  try {
    // Check if user already has an active session
    const existingSession = await Session.findOne({ userId, isActive: true });
    if (existingSession) {
      const { embed, components } = await getSessionEmbed(userId);
      
      if (embed) {
        return await interaction.reply({
          content: "⚠️ You already have an active session running!",
          embeds: [embed],
          components,
          flags: 64
        });
      } else {
        return await interaction.reply({
          content: "⚠️ You already have an active session running! Use `/pomodoro stopsession` to stop it first.",
          flags: 64
        });
      }
    }

    // Clear any existing timer for this user
    const existingTimer = activeTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      activeTimers.delete(userId);
    }

    // Get user's settings or create default
    let userSession = await Session.findOne({ userId });
    if (!userSession) {
      // Create default session settings
      userSession = new Session({
        userId,
        workDuration: 25,
        breakDuration: 5,
        longBreakDuration: 15,
        sessionsBeforeLongBreak: 4,
        maxSessions: 8,
        isActive: false,
        phase: 'study',
        endTime: 25
      });
      await userSession.save();
    }

    // Calculate actual end timestamp for the initial study phase
    const actualEndTime = Date.now() + (userSession.workDuration * 60 * 1000);

    // Start new session - update the existing document
    await Session.updateOne(
      { userId },
      {
        isActive: true,
        phase: 'study',
        completedSessions: 0,
        endTime: userSession.workDuration,
        actualEndTimestamp: new Date(actualEndTime),
        startTime: new Date(),
        channelId: channelId, // Store the channel ID where command was used
        guildId: interaction.guildId
      }
    );

    console.log(`🚀 Created session for ${userId} in channel ${channelId} ending at ${new Date(actualEndTime).toLocaleTimeString()}`);

    if (interaction.guildId) schedulePulseRefresh(interaction.guildId, client);

    // Send initial embed
    const { embed, components } = await getSessionEmbed(userId);
    
    if (!embed) {
      return await interaction.reply({
        content: "❌ Failed to create session embed. Please try again.",
        flags: 64
      });
    }

    await interaction.reply({
      content: "🍅 **Pomodoro session started!** Time to focus! 🔥",
      embeds: [embed],
      components
    });

    // Start the Pomodoro loop
    console.log(`🚀 Starting Pomodoro session for user ${userId}`);
    startPomodoroLoop(userId, client);

  } catch (error) {
    console.error("❌ Error starting Pomodoro session:", error);
    await interaction.reply({
      content: "❌ Failed to start your Pomodoro session. Please try again.",
      flags: 64
    });
  }
}