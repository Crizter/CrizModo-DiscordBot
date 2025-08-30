import { Session } from "../../models/sessions.models.js";
import { activeTimers, handlePhaseCompletion } from "../../utils/pomodoroScheduler.js";

export async function handleSkip(interaction) {
  const userId = interaction.user.id;

  try {
    const session = await Session.findOne({ userId, isActive: true });

    if (!session) {
      return await interaction.reply({
        content: "❌ You don't have an active Pomodoro session to skip.",
        flags: 64, // Use flags instead of ephemeral
      });
    }

    // Clear the current timer
    const timer = activeTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(userId);
    }

    const currentPhase = session.phase;
    
    await interaction.reply({
      content: `⏭️ Skipped ${currentPhase} phase! Moving to next phase...`,
      flags: 64, // Use flags instead of ephemeral
    });

    console.log(`⏭️ User ${userId} skipped ${currentPhase} phase`);

    // Handle the phase completion (which will transition to next phase)
    await handlePhaseCompletion(userId, interaction.client);

  } catch (err) {
    console.error("❌ Error in handleSkip:", err);
    await interaction.reply({
      content: "❌ An error occurred while skipping the phase.",
      flags: 64, // Use flags instead of ephemeral
    });
  }
}