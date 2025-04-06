// handlers/pomodoro/skip.js
import { Session } from "../../models/sessions.models.js";
import { activeTimers, startPomodoroLoop } from "../../utils/pomodoroScheduler.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export async function handleSkip(interaction) {
  const userId = interaction.user.id;

  try {
    const session = await Session.findOne({ userId, isActive: true });

    if (!session) {
      const replyOptions = {
        content: "❌ No active session to skip.",
        ephemeral: interaction.isButton?.() ? true : false,
      };
      return interaction.reply(replyOptions);
    }

    // Clear the current timer
    const timer = activeTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(userId);
    }

// Store the current phase before flipping
const wasStudy = session.currentPhase === "study";
const wasBreak = session.currentPhase === "break" || session.currentPhase === "longBreak";

// Flip phase
session.currentPhase = wasStudy ? "break" : "study";

//  increment session if we just finished a study phase
if (wasStudy) {
  session.completedSessions += 1;
}
    await session.save();

    const replyMsg =
      session.currentPhase === "study"
        ? "⏩ Skipped! Time to focus again. 🔥"
        : "⏩ Skipped! Take a short break now. ☕";

    if (interaction.isButton?.()) {
      await interaction.reply(replyMsg);

    //    update buttons (same layout)
      if (interaction.message) {
        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("start_session")
            .setLabel("▶️ Start Session")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId("stop_session")
            .setLabel("⛔ Stop")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(false),

          new ButtonBuilder()
            .setCustomId("skip_phase")
            .setLabel("⏭️ Skip Phase")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false)
        );

        await interaction.message.edit({ components: [updatedRow] });
      }
    } else {
      await interaction.reply(replyMsg);
    }

    // Restart loop with updated phase
    startPomodoroLoop(userId, interaction.client);
  } catch (err) {
    console.error("❌ Failed to skip phase:", err);
    const errorMsg = "⚠️ Something went wrong while skipping.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true });
    }
  }
}
