import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { MAX_DURATION_HOURS } from "../../services/deepFocus/manager.js";

// Admin-only: posts the pinned entry/exit message, or edits an already-
// posted one in place (via the message-id option) — preserves the message's
// id/position/reactions instead of delete-and-repost. Carries BOTH buttons —
// the deep-focus channel stays visible in focus mode, so this one message
// serves both directions.
export async function handleDeepFocusPostMessage(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return await interaction.reply({
      content: 'You need the "Manage Channels" permission to use this command.',
      flags: 64,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("📵 Deep Focus Mode")
    .setDescription(
      [
        "Hide every distracting channel and study in peace.",
        "",
        "**What happens when you enter:**",
        "- Your channel-access roles are safely saved, then removed",
        "- You get the Deep Focus role — most categories disappear",
        "- This channel and the server-info channels stay visible",
        "",
        `**Exiting:** press **Exit Deep Focus** below or run \`/deepfocus exit\` anytime. ` +
          `Your roles are restored automatically after **${MAX_DURATION_HOURS}h** at the latest.`,
        "",
        `**📵 Name tag:** while focusing, a 📵 appears in your name (your exact name comes back on exit). ` +
          `Press **Name Tag** below to turn it on/off for your entries.`,
        "",
        `Want a shorter timer? Use \`/deepfocus start hours:<1-${MAX_DURATION_HOURS}>\`.`,
        `**One channel can stay open** (a cam or temp channel) — pressing **Enter Deep Focus** below will ask you ` +
          `to pick one first (skippable), or use \`/deepfocus start channel:<#channel>\` directly.`,
      ].join("\n")
    )
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("deepfocus_enter")
      .setLabel("Enter Deep Focus")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("deepfocus_exit")
      .setLabel("Exit Deep Focus")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("deepfocus_toggletag")
      .setLabel("📵 Name Tag")
      .setStyle(ButtonStyle.Secondary)
  );

  const messageId = interaction.options.getString("message-id");
  if (messageId) {
    const existing = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!existing) {
      return await interaction.reply({
        content: "❌ Couldn't find that message in this channel — check the ID and make sure you're in the right channel.",
        flags: 64,
      });
    }
    // Refuse to overwrite a message this bot didn't post — a wrong/mistyped
    // ID must never clobber someone else's message content.
    if (existing.author.id !== interaction.client.user.id) {
      return await interaction.reply({
        content: "❌ That message wasn't posted by this bot — refusing to edit it.",
        flags: 64,
      });
    }
    await existing.edit({ embeds: [embed], components: [row] });
    return await interaction.reply({ content: "✅ Updated — same message, reactions and pin untouched.", flags: 64 });
  }

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "✅ Posted.", flags: 64 });
}
