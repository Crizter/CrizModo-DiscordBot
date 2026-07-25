// handlers/pomodoro/help.js — the server-wide help embed. Reached via both
// /help and /pomodoro help. When adding a command to the bot, add it here too.
import { EmbedBuilder } from "discord.js";

export async function handleHelp(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setColor("#FFA500")
    .setTitle("📘 CrizModo Bot — All Commands")
    .setDescription("Everything the bot can do, in one place.")
    .addFields(
      {
        name: "🍅 Solo Pomodoro",
        value: [
          "`/pomodoro setup` — Set your work/break/long-break durations and session limits",
          "`/pomodoro start` — Start a session with your saved setup",
          "`/pomodoro rest` — Take a manual break",
          "`/pomodoro skip` — Skip the current phase (study → break, or back)",
          "`/pomodoro stopsession` — Stop the active session",
        ].join("\n"),
      },
      {
        name: "👥 Group Pomodoro",
        value: [
          "`/pomodoro group create` — Host a group session (optionally set durations)",
          "`/pomodoro group join session-id:<code>` — Join a session by its code",
          "`/pomodoro group leave` — Leave your current group session",
          "`/pomodoro group status` — Check the group session's progress",
          "`/pomodoro group end` — End the session (host only)",
        ].join("\n"),
      },
      {
        name: "🧘 Deep Focus",
        value: [
          "`/deepfocus start [hours:1-24] [show-tag] [channel]` — Hide distracting channels; roles saved & auto-restored (default 24h, 🧘 name tag on by default, channel keeps one voice channel visible)",
          "`/deepfocus exit` — Leave Deep Focus and get your roles back",
          "`/deepfocus status` — See your time remaining",
        ].join("\n"),
      },
      {
        name: "ℹ️ General",
        value: [
          "`/help` — Show this menu",
          "`/ping` — Check the bot is alive",
        ].join("\n"),
      },
      {
        name: "🛠️ Staff only",
        value: [
          "`/superverify post-apply-message` — Post the Super Verification apply message",
          "`/serverpulse setup|disable|refresh|label|unlabel` — Manage the live Server Pulse embed",
          "`/enable-roomactivecheck` — Configure dynamic voice-channel visibility",
          "`/listmembers` — List members by role(s), optionally remove those roles",
          "`/deepfocus post-message` — Post the Deep Focus enter/exit buttons",
        ].join("\n"),
      }
    )
    .setFooter({ text: "Stay focused and crush your goals 💪" });

  await interaction.reply({ embeds: [helpEmbed], ephemeral: false });
}
