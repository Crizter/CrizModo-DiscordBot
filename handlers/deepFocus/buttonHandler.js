import { handleDeepFocusExit } from "./exit.js";
import { handleDeepFocusEnterPrompt, handleDeepFocusEnterSkip } from "./channelPrompt.js";

export async function handleDeepFocusButton(interaction, client) {
  switch (interaction.customId) {
    case "deepfocus_enter":
      // Shows the skippable channel picker instead of entering immediately —
      // buttons can't carry command options like /deepfocus start's channel.
      return await handleDeepFocusEnterPrompt(interaction);
    case "deepfocus_enter_skip":
      return await handleDeepFocusEnterSkip(interaction, client);
    case "deepfocus_exit":
      return await handleDeepFocusExit(interaction, client);
    default:
      return await interaction.reply({ content: "❌ Unknown Deep Focus action.", flags: 64 });
  }
}
