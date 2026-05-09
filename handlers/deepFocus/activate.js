import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { getConfig } from "../../models/deepFocus/configs.js";
import {
  createSession,
  getActiveSession,
} from "../../models/deepFocus/sessions.js";
import { recordOverride } from "../../models/deepFocus/overrides.js";
import { applyUserExceptions } from "../../utils/deepFocus/permissions.js";
import { applyBadge } from "../../utils/deepFocus/nicknameBadge.js";
import { scheduleExpiry } from "../../utils/deepFocus/expiryScheduler.js";

// Per-user activation state; wiped on confirm/cancel or 10-minute TTL.
const pendingActivations = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function stateKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function setState(guildId, userId, partial) {
  const key = stateKey(guildId, userId);
  const prev = pendingActivations.get(key);
  if (prev?.ttl) clearTimeout(prev.ttl);
  const ttl = setTimeout(() => pendingActivations.delete(key), STATE_TTL_MS);
  const next = { ...(prev ?? {}), ...partial, ttl };
  pendingActivations.set(key, next);
  return next;
}

function getState(guildId, userId) {
  return pendingActivations.get(stateKey(guildId, userId)) ?? null;
}

function clearState(guildId, userId) {
  const key = stateKey(guildId, userId);
  const prev = pendingActivations.get(key);
  if (prev?.ttl) clearTimeout(prev.ttl);
  pendingActivations.delete(key);
}

function buildActivationComponents(config, withBadge) {
  const maxMinutes = config.maxDurationMinutes ?? 600;
  const presetMinutes = [30, 45, 60, 90, 120, 180, 240, 300, 480, 600].filter((m) => m <= maxMinutes);
  if (presetMinutes.length === 0) presetMinutes.push(Math.min(30, maxMinutes));

  const durationSelect = new StringSelectMenuBuilder()
    .setCustomId("df_duration_picker")
    .setPlaceholder("Select focus duration")
    .addOptions(
      presetMinutes.map((m) => ({
        label: m >= 60 ? `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)}h` : `${m}m`,
        value: String(m),
      }))
    );

  const whitelist = config.whitelistChannelIds ?? [];
  const exceptionsSelect = new ChannelSelectMenuBuilder()
    .setCustomId("df_exceptions_picker")
    .setPlaceholder(whitelist.length ? "Pick exception channels (optional)" : "No exception channels configured")
    .setMinValues(0)
    .setMaxValues(Math.min(25, Math.max(1, whitelist.length || 1)))
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement);

  const confirmButton = new ButtonBuilder()
    .setCustomId(withBadge ? "df_confirm_badge" : "df_confirm_plain")
    .setLabel("Start Deep Focus")
    .setStyle(ButtonStyle.Success);

  return [
    new ActionRowBuilder().addComponents(durationSelect),
    new ActionRowBuilder().addComponents(exceptionsSelect),
    new ActionRowBuilder().addComponents(confirmButton),
  ];
}

export async function handleActivate(interaction, client, { withBadge }) {
  await interaction.deferReply({ ephemeral: true });

  const config = await getConfig(interaction.guildId).catch(() => null);
  if (!config) {
    return interaction.editReply({ content: "Deep focus is not configured for this server." });
  }

  const existing = await getActiveSession(interaction.guildId, interaction.user.id).catch(() => null);
  if (existing) {
    const epoch = Math.floor(new Date(existing.expires_at).getTime() / 1000);
    return interaction.editReply({
      content: `You're already in deep focus (ends <t:${epoch}:R>).`,
    });
  }

  setState(interaction.guildId, interaction.user.id, { withBadge, duration: null, exceptions: [] });

  const components = buildActivationComponents(config, withBadge);
  return interaction.editReply({
    content: `Configure your deep focus session${withBadge ? " (with badge)" : ""}. Pick a duration, optionally choose exception channels, then confirm.`,
    components,
  });
}

export async function handleActivateComponent(interaction, client) {
  const { customId } = interaction;

  if (customId === "df_duration_picker") {
    const minutes = parseInt(interaction.values[0], 10);
    setState(interaction.guildId, interaction.user.id, { duration: minutes });
    return interaction.deferUpdate();
  }

  if (customId === "df_exceptions_picker") {
    const selected = interaction.values ?? [];
    setState(interaction.guildId, interaction.user.id, { exceptions: selected });
    return interaction.deferUpdate();
  }

  if (customId === "df_confirm_badge" || customId === "df_confirm_plain") {
    return confirmActivation(interaction, client, customId === "df_confirm_badge");
  }
}

async function confirmActivation(interaction, client, withBadge) {
  await interaction.deferReply({ ephemeral: true });

  const config = await getConfig(interaction.guildId).catch(() => null);
  if (!config) {
    clearState(interaction.guildId, interaction.user.id);
    return interaction.editReply({ content: "Deep focus is not configured for this server." });
  }

  const state = getState(interaction.guildId, interaction.user.id);
  if (!state || !state.duration) {
    return interaction.editReply({ content: "Please pick a duration first." });
  }

  const existing = await getActiveSession(interaction.guildId, interaction.user.id).catch(() => null);
  if (existing) {
    const epoch = Math.floor(new Date(existing.expires_at).getTime() / 1000);
    clearState(interaction.guildId, interaction.user.id);
    return interaction.editReply({ content: `You're already in deep focus (ends <t:${epoch}:R>).` });
  }

  const maxMinutes = config.maxDurationMinutes ?? 600;
  if (state.duration < 30 || state.duration > maxMinutes) {
    return interaction.editReply({
      content: `Duration must be between 30 and ${maxMinutes} minutes.`,
    });
  }

  const whitelistSet = new Set(config.whitelistChannelIds ?? []);
  const exceptions = (state.exceptions ?? []).filter((id) => whitelistSet.has(id));

  const expiresAt = new Date(Date.now() + state.duration * 60_000);
  const startedAt = new Date();

  let member;
  try {
    member = await interaction.guild.members.fetch(interaction.user.id);
  } catch (error) {
    console.error("❌ Deep focus: failed to fetch member:", error);
    clearState(interaction.guildId, interaction.user.id);
    return interaction.editReply({ content: "Could not fetch your guild membership. Try again." });
  }

  let badgeResult = null;
  if (withBadge) {
    try {
      badgeResult = await applyBadge(member, expiresAt);
      if (!badgeResult?.applied) {
        console.warn(`⚠️ Deep focus: badge not applied for ${interaction.user.id} (likely permission)`);
      }
    } catch (error) {
      console.warn(`⚠️ Deep focus: applyBadge threw for ${interaction.user.id}:`, error);
    }
  }

  try {
    await member.roles.add(config.roleId, "Deep Focus activation");
  } catch (error) {
    console.error("❌ Deep focus: failed to add role:", error);
    clearState(interaction.guildId, interaction.user.id);
    return interaction.editReply({ content: "Failed to assign deep focus role. Check my permissions." });
  }

  let sessionId;
  try {
    const created = await createSession({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      startedAt,
      expiresAt,
      exemptionChannelIds: exceptions,
      badgeEnabled: withBadge,
      originalNickname: badgeResult?.originalNickname ?? null,
    });
    sessionId = created.id;
  } catch (error) {
    console.error("❌ Deep focus: createSession failed:", error);
    clearState(interaction.guildId, interaction.user.id);
    return interaction.editReply({ content: "Failed to create session record. Role changes may need manual cleanup." });
  }

  try {
    const { applied } = await applyUserExceptions(interaction.guild, interaction.user.id, exceptions);
    for (const channelId of applied) {
      try {
        await recordOverride({ sessionId, channelId });
      } catch (error) {
        console.error(`❌ Deep focus: recordOverride failed for ${channelId}:`, error);
      }
    }
  } catch (error) {
    console.error("❌ Deep focus: applyUserExceptions failed:", error);
  }

  scheduleExpiry(sessionId, expiresAt, client);

  const expiresEpoch = Math.floor(expiresAt.getTime() / 1000);
  const dmEmbed = new EmbedBuilder()
    .setTitle("🧘 Deep Focus Active")
    .setDescription(`Your deep focus is active until <t:${expiresEpoch}:F> (<t:${expiresEpoch}:R>).`)
    .setColor(0x5865f2);
  const endButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`df_end_${sessionId}`)
      .setLabel("End Early")
      .setStyle(ButtonStyle.Danger)
  );

  let dmSent = false;
  try {
    await interaction.user.send({ embeds: [dmEmbed], components: [endButton] });
    dmSent = true;
  } catch {
    dmSent = false;
  }

  clearState(interaction.guildId, interaction.user.id);

  const summary = `🧘 Deep focus active until <t:${expiresEpoch}:F> (<t:${expiresEpoch}:R>). Use /deepfocus end to stop early.`;
  if (dmSent) {
    return interaction.editReply({ content: summary, components: [] });
  }
  return interaction.editReply({
    content: `${summary}\n(Couldn't DM you — control button below.)`,
    embeds: [dmEmbed],
    components: [endButton],
  });
}
