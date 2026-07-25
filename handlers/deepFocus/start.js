import { enterDeepFocus, DEFAULT_DURATION_HOURS } from "../../services/deepFocus/manager.js";

// Entry does several API round-trips (log post + role ops) and will blow the
// 3s interaction window — defer first, and catch internally: bot.js's generic
// error path calls bare interaction.reply, which throws after a defer.
// showTag: true/false = explicit choice; null = user's stored preference.
// channelId: explicit /deepfocus start channel option; null = fall back to
// the member's current voice channel (covers button entry too).
export async function handleDeepFocusStart(interaction, client, durationHours = DEFAULT_DURATION_HOURS, showTag = null, channelId = null) {
  try {
    await interaction.deferReply({ flags: 64 });

    const result = await enterDeepFocus({
      member: interaction.member,
      client,
      durationHours,
      showTag,
      channelId,
    });

    if (!result.ok) {
      return await interaction.editReply({ content: `❌ ${result.error}` });
    }

    const expiresUnix = Math.floor(result.expiresAt.getTime() / 1000);
    await interaction.editReply({
      content:
        `🧘 **Deep Focus on.** Distracting channels are hidden.\n` +
        `Stripped **${result.strippedCount}** access role(s) — they'll be restored automatically <t:${expiresUnix}:R> ` +
        `(<t:${expiresUnix}:t>), or use \`/deepfocus exit\` / the exit button anytime.` +
        (result.tagApplied ? `\nYour name now carries the 🧘 tag — it reverts when you exit.` : "") +
        (result.allowedChannelId ? `\n<#${result.allowedChannelId}> stays visible & joinable until you exit.` : ""),
    });
  } catch (error) {
    console.error("❌ Error starting Deep Focus:", error);
    const message = { content: "❌ Something went wrong entering Deep Focus. Nothing was changed." };
    if (interaction.deferred) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ ...message, flags: 64 }).catch(() => {});
  }
}
