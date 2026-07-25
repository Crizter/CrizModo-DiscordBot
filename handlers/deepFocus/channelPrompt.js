import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType } from "discord.js";
import { enterDeepFocus, getOpenSession, DEFAULT_DURATION_HOURS } from "../../services/deepFocus/manager.js";
import { buildEnterResultMessage } from "./start.js";

// Button entry can't carry command options (unlike /deepfocus start's
// `channel` option), so "Enter Deep Focus" now shows a one-step, skippable
// channel picker first instead of entering immediately.
export async function handleDeepFocusEnterPrompt(interaction) {
  const existing = await getOpenSession(interaction.guildId, interaction.user.id);
  if (existing) {
    return await interaction.reply({
      content: "❌ You're already in Deep Focus. Use `/deepfocus exit` to leave.",
      flags: 64,
    });
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("deepfocus_channel_select")
      .setPlaceholder("Keep a voice channel visible while focusing (optional)")
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
      .setMinValues(1)
      .setMaxValues(1)
  );
  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("deepfocus_enter_skip")
      .setLabel("Skip — hide everything")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    content:
      "Want to keep one voice channel visible & joinable while you focus (e.g. a cam or temp channel)? " +
      "Pick it below, or skip to hide everything but the Deep Focus channel.",
    components: [selectRow, skipRow],
    flags: 64,
  });
}

// Shared tail for both the select-menu pick and the skip button: deferUpdate
// (not deferReply) so the result replaces the picker prompt in place instead
// of leaving a second, now-stale message with a live select menu behind.
async function finishEntry(interaction, client, channelId) {
  try {
    await interaction.deferUpdate();

    const result = await enterDeepFocus({
      member: interaction.member,
      client,
      durationHours: DEFAULT_DURATION_HOURS,
      showTag: null,
      channelId,
    });

    await interaction.editReply({ content: buildEnterResultMessage(result), components: [] });
  } catch (error) {
    console.error("❌ Error finishing Deep Focus entry:", error);
    const message = { content: "❌ Something went wrong entering Deep Focus. Nothing was changed.", components: [] };
    if (interaction.deferred) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ ...message, flags: 64 }).catch(() => {});
  }
}

export async function handleDeepFocusChannelSelect(interaction, client) {
  await finishEntry(interaction, client, interaction.values[0] ?? null);
}

// channelId null → enterDeepFocus falls back to the member's current voice
// channel, if any (same default as button entry always had).
export async function handleDeepFocusEnterSkip(interaction, client) {
  await finishEntry(interaction, client, null);
}
