import { handleDeepFocusStart } from "./start.js";
import { handleDeepFocusExit } from "./exit.js";
import { handleDeepFocusToggleTag } from "./toggleTag.js";
import { DEFAULT_DURATION_HOURS } from "../../services/deepFocus/manager.js";

export async function handleDeepFocusButton(interaction, client) {
  switch (interaction.customId) {
    case "deepfocus_enter":
      // Button entry: default duration, showTag null = the user's stored
      // preference (set via the toggle button or an explicit command option).
      return await handleDeepFocusStart(interaction, client, DEFAULT_DURATION_HOURS, null);
    case "deepfocus_exit":
      return await handleDeepFocusExit(interaction, client);
    case "deepfocus_toggletag":
      return await handleDeepFocusToggleTag(interaction);
    default:
      return await interaction.reply({ content: "❌ Unknown Deep Focus action.", flags: 64 });
  }
}
