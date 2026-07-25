import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { MAX_DURATION_HOURS } from "../../services/deepFocus/manager.js";

// Admin-only: posts the pinned entry/exit message. Carries BOTH buttons —
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

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "✅ Posted.", flags: 64 });
}
