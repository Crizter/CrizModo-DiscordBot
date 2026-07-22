import { toggleShowTagPreference, getOpenSession } from "../../services/deepFocus/manager.js";

// Pinned-message toggle: flips the user's stored 🧘 name-tag preference.
// The shared message can't show per-user state, so the result is confirmed
// ephemerally. Affects the NEXT entry — an already-applied tag stays until
// exit.
export async function handleDeepFocusToggleTag(interaction) {
  try {
    const result = await toggleShowTagPreference(interaction.guildId, interaction.user.id);

    if (!result.ok) {
      return await interaction.reply({
        content: `⏳ Easy — try again in ${Math.ceil(result.remainingMs / 1000)}s.`,
        flags: 64,
      });
    }

    const openSession = await getOpenSession(interaction.guildId, interaction.user.id);
    await interaction.reply({
      content:
        `🧘 Name tag is now **${result.showTag ? "ON" : "OFF"}** for your Deep Focus sessions.` +
        (openSession ? "\n(You're in focus right now — this applies from your next entry.)" : ""),
      flags: 64,
    });
  } catch (error) {
    console.error("❌ Error toggling Deep Focus name tag:", error);
    await interaction.reply({ content: "❌ Couldn't update your preference. Try again.", flags: 64 }).catch(() => {});
  }
}
