// handlers/pomodoro/help.js
import { EmbedBuilder } from "discord.js";

export async function handleHelp(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setColor("#FFA500")
    .setTitle("📘 Pomodoro Bot Help")
    .setDescription("Here are all the available Pomodoro commands and their usage:")
    .addFields(
      { name: "/pomodoro setup", value: "Configure your Pomodoro durations and session limits." },
      { name: "/pomodoro start", value: "Start a Pomodoro session with your current setup." },
      { name: "/pomodoro rest", value: "Take a short manual break." },
      { name: "/pomodoro stopsession", value: "Stop the currently active session." },
      { name: "/pomodoro skip", value: "Skip the current phase (e.g., study → break)." },
      { name: "/pomodoro help", value: "Show this help menu." }
      // { name: "/pomodoro status", value: "Check current Pomodoro session status." } // Uncomment if you enable it
    )
    .setFooter({ text: "Stay focused and crush your goals 💪" });

  await interaction.reply({ embeds: [helpEmbed], ephemeral: false });
}
