// handlers/deepFocus/setup.js
//
// Admin setup wizard for the Deep Focus Role feature + pickup-message builder.
// Scope of this file:
//   - /setupdeepfocus wizard (multi-step, ephemeral, in-memory state)
//   - Persistent pickup message construction
// Out of scope (owned by the Lifecycle agent):
//   - df_duration, df_exceptions, df_activate_*, df_end_* component handlers
//
// customIds claimed by this file: dfsetup_role, dfsetup_hidden_cats,
// dfsetup_hidden_chans, dfsetup_whitelist, dfsetup_always, dfsetup_target,
// dfsetup_skip_2, dfsetup_skip_3, dfsetup_skip_4, dfsetup_skip_5,
// dfsetup_confirm, dfsetup_cancel.

import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    StringSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
} from "discord.js";

import { getConfig, upsertConfig, setSetupMessage } from "../../models/deepFocus/configs.js";
import { applyRoleHides } from "../../utils/deepFocus/permissions.js";

// -----------------------------------------------------------------------------
// Wizard state
// -----------------------------------------------------------------------------

/**
 * In-memory wizard state keyed by guildId. Only one admin wizard per guild at a
 * time — a new /setupdeepfocus wipes any previous entry so stale components
 * from a prior invocation become no-ops (they'll see getWizardState → null and
 * reply with an "expired" error).
 *
 * @typedef {Object} WizardState
 * @property {string} [roleId]
 * @property {string[]} hiddenCategoryIds
 * @property {string[]} hiddenChannelIds
 * @property {string[]} whitelistChannelIds
 * @property {string[]} alwaysVisibleChannelIds
 * @property {string} [setupChannelId]
 * @property {number} maxDurationMinutes
 * @property {1|2|3|4|5|6} step
 * @property {number} updatedAt   // ms epoch; used for idle sweep
 * @property {string} userId      // who started the wizard
 */

/** @type {Map<string, WizardState>} */
export const wizardState = new Map();

const WIZARD_IDLE_MS = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// A single sweeper across module lifetime. Node keeps process alive for the bot
// anyway, so unref() keeps behaviour predictable without altering shutdown.
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [gid, st] of wizardState.entries()) {
        if (now - st.updatedAt > WIZARD_IDLE_MS) wizardState.delete(gid);
    }
}, SWEEP_INTERVAL_MS);
if (typeof sweeper.unref === "function") sweeper.unref();

export function getWizardState(guildId) {
    return wizardState.get(guildId) ?? null;
}

export function setWizardState(guildId, state) {
    wizardState.set(guildId, { ...state, updatedAt: Date.now() });
}

export function clearWizardState(guildId) {
    wizardState.delete(guildId);
}

function freshState(userId) {
    return {
        roleId: undefined,
        hiddenCategoryIds: [],
        hiddenChannelIds: [],
        whitelistChannelIds: [],
        alwaysVisibleChannelIds: [],
        setupChannelId: undefined,
        maxDurationMinutes: 600,
        step: 1,
        updatedAt: Date.now(),
        userId,
    };
}

// -----------------------------------------------------------------------------
// Entry point: /setupdeepfocus
// -----------------------------------------------------------------------------

export async function handleSetupDeepFocus(interaction, _client) {
    try {
        if (!interaction.inGuild()) {
            return interaction.reply({
                content: "❌ This command can only be used in a server.",
                flags: MessageFlags.Ephemeral,
            });
        }

        // Bot permission pre-check.
        const me = interaction.guild.members.me;
        const needed = [
            { flag: PermissionFlagsBits.ManageRoles, name: "Manage Roles" },
            { flag: PermissionFlagsBits.ManageChannels, name: "Manage Channels" },
        ];
        const missing = needed.filter(p => !me.permissions.has(p.flag)).map(p => p.name);
        if (missing.length) {
            return interaction.reply({
                embeds: [errorEmbed(
                    "Missing bot permissions",
                    `I need the following guild-level permissions to run the Deep Focus wizard:\n• ${missing.join("\n• ")}`
                )],
                flags: MessageFlags.Ephemeral,
            });
        }

        // Fresh state wipes any stale in-flight wizard in this guild.
        clearWizardState(interaction.guildId);
        setWizardState(interaction.guildId, freshState(interaction.user.id));

        await interaction.reply({
            embeds: [stepEmbed(1, "Pick the Deep Focus role",
                "Select the role the bot will grant when users activate Deep Focus. " +
                "The bot's highest role must sit **above** this role in your role list.")],
            components: [rolePickerRow()],
            flags: MessageFlags.Ephemeral,
        });
    } catch (err) {
        console.error("[deepFocus/setup] handleSetupDeepFocus error:", err);
        await safeReply(interaction, {
            embeds: [errorEmbed("Wizard failed to start", "An unexpected error occurred. Check logs and try again.")],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// -----------------------------------------------------------------------------
// Dispatcher: dfsetup_* custom IDs
// -----------------------------------------------------------------------------

export async function handleSetupComponent(interaction, _client) {
    const id = interaction.customId;
    if (!id || !id.startsWith("dfsetup_")) return;

    const state = getWizardState(interaction.guildId);
    if (!state) {
        return interaction.reply({
            embeds: [errorEmbed(
                "Wizard expired",
                "This Deep Focus setup session is no longer active. Run `/setupdeepfocus` again to start over."
            )],
            flags: MessageFlags.Ephemeral,
        });
    }

    // Lock wizard to its initiator so two admins don't race.
    if (state.userId !== interaction.user.id) {
        return interaction.reply({
            embeds: [errorEmbed(
                "Wizard in use",
                "Another admin is currently running the Deep Focus wizard in this server. Wait for them to finish, or run `/setupdeepfocus` again once they've timed out."
            )],
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        switch (id) {
            case "dfsetup_role":        return handleRoleStep(interaction, state);
            case "dfsetup_hidden_cats": return handleHiddenCatsStep(interaction, state);
            case "dfsetup_skip_2":      return advanceToStep(interaction, state, 3);
            case "dfsetup_hidden_chans":return handleHiddenChansStep(interaction, state);
            case "dfsetup_skip_3":      return advanceToStep(interaction, state, 4);
            case "dfsetup_whitelist":   return handleWhitelistStep(interaction, state);
            case "dfsetup_skip_4":      return advanceToStep(interaction, state, 5);
            case "dfsetup_always":      return handleAlwaysStep(interaction, state);
            case "dfsetup_skip_5":      return advanceToStep(interaction, state, 6);
            case "dfsetup_target":      return handleTargetStep(interaction, state);
            case "dfsetup_confirm":     return handleConfirm(interaction, state);
            case "dfsetup_cancel":      return handleCancel(interaction, state);
            default:
                return interaction.reply({
                    embeds: [errorEmbed("Unknown step", "This button is not recognised.")],
                    flags: MessageFlags.Ephemeral,
                });
        }
    } catch (err) {
        console.error(`[deepFocus/setup] component ${id} error:`, err);
        await safeReply(interaction, {
            embeds: [errorEmbed("Step failed", "An unexpected error occurred. Your progress has been kept — try again.")],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// -----------------------------------------------------------------------------
// Step handlers
// -----------------------------------------------------------------------------

async function handleRoleStep(interaction, state) {
    const roleId = interaction.values?.[0];
    if (!roleId) return showStep1(interaction, state, "No role was selected.");

    const role = interaction.guild.roles.cache.get(roleId) ?? await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) return showStep1(interaction, state, "The selected role could not be found.");

    const me = interaction.guild.members.me;
    if (me.roles.highest.comparePositionTo(role) <= 0) {
        return showStep1(interaction, state,
            `My highest role (**${me.roles.highest.name}**) is not above **${role.name}**. ` +
            "Move my role above the Deep Focus role in Server Settings → Roles, then pick again.");
    }
    if (role.managed) {
        return showStep1(interaction, state, `**${role.name}** is managed by an integration and can't be assigned by the bot.`);
    }

    state.roleId = roleId;
    state.step = 2;
    setWizardState(interaction.guildId, state);

    return interaction.update({
        embeds: [stepEmbed(2, "Pick hidden categories",
            "Select categories that should be hidden from users while Deep Focus is active. " +
            "Every channel under these categories will be hidden unless it's in your always-visible list. " +
            "Skip if you'd rather pick channels individually.")],
        components: [hiddenCategoriesRow(state), skipRow("dfsetup_skip_2", "Skip this step")],
    });
}

async function handleHiddenCatsStep(interaction, state) {
    state.hiddenCategoryIds = interaction.values ?? [];
    state.step = 3;
    setWizardState(interaction.guildId, state);

    return interaction.update({
        embeds: [stepEmbed(3, "Pick additional hidden channels",
            "Select individual channels (text, voice, stage, forum) outside those categories to hide. " +
            "Skip if none.")],
        components: [hiddenChannelsRow(state), skipRow("dfsetup_skip_3", "Skip this step")],
    });
}

async function handleHiddenChansStep(interaction, state) {
    state.hiddenChannelIds = interaction.values ?? [];
    state.step = 4;
    setWizardState(interaction.guildId, state);

    return interaction.update({
        embeds: [stepEmbed(4, "Pick whitelist channels",
            "These are channels users can optionally keep visible when they activate Deep Focus " +
            "(shown as 'exceptions' on the pickup message). Skip if you don't want exceptions.")],
        components: [whitelistRow(state), skipRow("dfsetup_skip_4", "Skip this step")],
    });
}

async function handleWhitelistStep(interaction, state) {
    state.whitelistChannelIds = interaction.values ?? [];
    state.step = 5;
    setWizardState(interaction.guildId, state);

    return interaction.update({
        embeds: [stepEmbed(5, "Pick always-visible channels",
            "Channels that remain visible to users in Deep Focus regardless of category hiding — " +
            "usually announcements, rules, or status channels. Skip if none.")],
        components: [alwaysRow(state), skipRow("dfsetup_skip_5", "Skip this step")],
    });
}

async function handleAlwaysStep(interaction, state) {
    state.alwaysVisibleChannelIds = interaction.values ?? [];
    state.step = 6;
    setWizardState(interaction.guildId, state);

    return interaction.update({
        embeds: [stepEmbed(6, "Pick the setup channel",
            "This is the text channel where the **Deep Focus pickup message** will be posted. " +
            "Users will use buttons on that message to activate Deep Focus.")],
        components: [targetRow()],
    });
}

async function handleTargetStep(interaction, state) {
    const channelId = interaction.values?.[0];
    if (!channelId) {
        return interaction.update({
            embeds: [stepEmbed(6, "Pick the setup channel", "No channel was selected — pick one to continue.")],
            components: [targetRow()],
        });
    }

    const channel = interaction.guild.channels.cache.get(channelId) ?? await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.update({
            embeds: [errorEmbed("Invalid channel",
                "The selected channel must be a standard text channel the bot can view and send messages in.")],
            components: [targetRow()],
        });
    }

    const me = interaction.guild.members.me;
    const perms = channel.permissionsFor(me);
    if (!perms || !perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) {
        return interaction.update({
            embeds: [errorEmbed("Missing channel permissions",
                `I can't view or send messages in <#${channel.id}>. Grant **View Channel** and **Send Messages**, then try again.`)],
            components: [targetRow()],
        });
    }

    state.setupChannelId = channelId;
    setWizardState(interaction.guildId, state);

    return interaction.update({
        embeds: [summaryEmbed(state, interaction.guild)],
        components: [confirmRow()],
    });
}

async function advanceToStep(interaction, state, next) {
    state.step = next;
    setWizardState(interaction.guildId, state);

    switch (next) {
        case 3:
            return interaction.update({
                embeds: [stepEmbed(3, "Pick additional hidden channels",
                    "Select individual channels (text, voice, stage, forum) to hide. Skip if none.")],
                components: [hiddenChannelsRow(state), skipRow("dfsetup_skip_3", "Skip this step")],
            });
        case 4:
            return interaction.update({
                embeds: [stepEmbed(4, "Pick whitelist channels",
                    "Channels users can optionally keep visible while in Deep Focus. Skip if no exceptions.")],
                components: [whitelistRow(state), skipRow("dfsetup_skip_4", "Skip this step")],
            });
        case 5:
            return interaction.update({
                embeds: [stepEmbed(5, "Pick always-visible channels",
                    "Channels that always remain visible during Deep Focus. Skip if none.")],
                components: [alwaysRow(state), skipRow("dfsetup_skip_5", "Skip this step")],
            });
        case 6:
            return interaction.update({
                embeds: [stepEmbed(6, "Pick the setup channel",
                    "This is the text channel where the Deep Focus pickup message will be posted.")],
                components: [targetRow()],
            });
        default:
            return interaction.update({
                embeds: [errorEmbed("Unknown step", "Something went sideways. Run `/setupdeepfocus` again.")],
                components: [],
            });
    }
}

// -----------------------------------------------------------------------------
// Confirm / cancel
// -----------------------------------------------------------------------------

async function handleConfirm(interaction, state) {
    if (!state.roleId || !state.setupChannelId) {
        return interaction.update({
            embeds: [errorEmbed("Missing required fields",
                "Either the Deep Focus role or the setup channel wasn't set. Start over with `/setupdeepfocus`.")],
            components: [],
        });
    }

    await interaction.update({
        embeds: [infoEmbed("Applying configuration…", "Saving settings and applying role overrides — hang tight.")],
        components: [],
    });

    const guild = interaction.guild;

    // 1. Apply role permission overrides.
    try {
        const result = await applyRoleHides(guild, state.roleId, {
            categoryIds: state.hiddenCategoryIds,
            channelIds: state.hiddenChannelIds,
        });
        if (result.failed && result.failed.length) {
            console.warn("[deepFocus/setup] applyRoleHides partial failure:", result.failed);
        }
    } catch (err) {
        console.error("[deepFocus/setup] applyRoleHides failed:", err);
        return interaction.editReply({
            embeds: [errorEmbed("Couldn't apply role overrides",
                "The role exists but I couldn't apply the channel/category overrides. Your wizard state is preserved — press **Confirm & Apply** again.")],
            components: [confirmRow()],
        });
    }

    // 2. Persist config.
    try {
        await upsertConfig({
            guildId: guild.id,
            roleId: state.roleId,
            setupChannelId: state.setupChannelId,
            setupMessageId: null,
            hiddenCategoryIds: state.hiddenCategoryIds,
            hiddenChannelIds: state.hiddenChannelIds,
            whitelistChannelIds: state.whitelistChannelIds,
            alwaysVisibleChannelIds: state.alwaysVisibleChannelIds,
            maxDurationMinutes: 600,
        });
    } catch (err) {
        console.error("[deepFocus/setup] upsertConfig failed:", err);
        return interaction.editReply({
            embeds: [errorEmbed("Database error",
                "Couldn't save the Deep Focus configuration. Try **Confirm & Apply** again.")],
            components: [confirmRow()],
        });
    }

    // 3. Post the pickup message.
    let messageId;
    try {
        const config = (await getConfig(guild.id)) ?? {
            guildId: guild.id,
            roleId: state.roleId,
            setupChannelId: state.setupChannelId,
            setupMessageId: null,
            hiddenCategoryIds: state.hiddenCategoryIds,
            hiddenChannelIds: state.hiddenChannelIds,
            whitelistChannelIds: state.whitelistChannelIds,
            alwaysVisibleChannelIds: state.alwaysVisibleChannelIds,
            maxDurationMinutes: 600,
        };
        const channel = await guild.channels.fetch(state.setupChannelId);
        const payload = buildPickupMessage(config, guild);
        const msg = await channel.send(payload);
        messageId = msg.id;
    } catch (err) {
        console.error("[deepFocus/setup] posting pickup message failed:", err);
        return interaction.editReply({
            embeds: [errorEmbed("Couldn't post pickup message",
                "Config was saved but I couldn't post the pickup message in the chosen channel. Check my permissions there and press **Confirm & Apply** again.")],
            components: [confirmRow()],
        });
    }

    // 4. Record message id.
    try {
        await setSetupMessage(guild.id, messageId);
    } catch (err) {
        console.error("[deepFocus/setup] setSetupMessage failed:", err);
        // Non-fatal: message is up, we just didn't record the id. Tell the admin.
        return interaction.editReply({
            embeds: [errorEmbed("Pickup message posted, but metadata didn't save",
                `Message ${messageId} was posted in <#${state.setupChannelId}> but the id couldn't be recorded. Press **Confirm & Apply** again to retry.`)],
            components: [confirmRow()],
        });
    }

    // 5. Success.
    clearWizardState(guild.id);
    return interaction.editReply({
        embeds: [successSummaryEmbed(state, guild, messageId)],
        components: [],
    });
}

async function handleCancel(interaction, _state) {
    clearWizardState(interaction.guildId);
    return interaction.update({
        embeds: [infoEmbed("Wizard cancelled", "No changes were made. Run `/setupdeepfocus` again anytime.")],
        components: [],
    });
}

// -----------------------------------------------------------------------------
// Pickup message builder (exported for Lifecycle agent reuse)
// -----------------------------------------------------------------------------

/**
 * Build the persistent pickup message payload for the setup channel.
 * Returns `{ embeds, components }` — suitable for `channel.send(...)` or for
 * re-posting if the original message is deleted.
 */
export function buildPickupMessage(config, guild) {
    const hiddenCats = (config.hiddenCategoryIds ?? [])
        .map(id => guild.channels.cache.get(id))
        .filter(Boolean);
    const alwaysVisible = (config.alwaysVisibleChannelIds ?? [])
        .map(id => guild.channels.cache.get(id))
        .filter(Boolean);

    const hiddenCatsText = hiddenCats.length
        ? hiddenCats.map(c => `• **${c.name}**`).join("\n")
        : "_None configured._";
    const alwaysVisibleText = alwaysVisible.length
        ? alwaysVisible.map(c => `• <#${c.id}>`).join("\n")
        : "_None configured._";

    const embed = new EmbedBuilder()
        .setTitle("🧘 Deep Focus")
        .setColor(0x5865F2)
        .setDescription(
            "Opt in to a distraction-free session. While Deep Focus is active, the channels listed below will be hidden from you until the timer ends or you end it manually.\n\n" +
            "Press an **Activate** button to start. You'll pick a duration and any exception channels on the next screen."
        )
        .addFields(
            { name: "🙈 Hidden categories", value: hiddenCatsText, inline: false },
            { name: "👁️ Always visible",  value: alwaysVisibleText, inline: false },
        )
        .setFooter({ text: "Deep Focus · Choose 'with Badge' to add a 🧘 prefix to your nickname while focused." });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("df_activate_badge")
            .setLabel("🧘 Activate with Badge")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("df_activate_plain")
            .setLabel("🧘 Activate (no badge)")
            .setStyle(ButtonStyle.Primary),
    );

    return { embeds: [embed], components: [buttons] };
}

// -----------------------------------------------------------------------------
// View helpers — rows / embeds
// -----------------------------------------------------------------------------

function rolePickerRow() {
    return new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId("dfsetup_role")
            .setPlaceholder("Pick the Deep Focus role")
            .setMinValues(1)
            .setMaxValues(1),
    );
}

function hiddenCategoriesRow(state) {
    return new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId("dfsetup_hidden_cats")
            .setPlaceholder("Pick categories to hide (optional)")
            .addChannelTypes(ChannelType.GuildCategory)
            .setMinValues(0)
            .setMaxValues(25)
            .setDefaultChannels(safeDefaults(state.hiddenCategoryIds)),
    );
}

function hiddenChannelsRow(state) {
    return new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId("dfsetup_hidden_chans")
            .setPlaceholder("Pick additional channels to hide (optional)")
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildVoice,
                ChannelType.GuildStageVoice,
                ChannelType.GuildForum,
                ChannelType.GuildAnnouncement,
            )
            .setMinValues(0)
            .setMaxValues(25)
            .setDefaultChannels(safeDefaults(state.hiddenChannelIds)),
    );
}

function whitelistRow(state) {
    return new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId("dfsetup_whitelist")
            .setPlaceholder("Pick whitelist channels (optional)")
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildVoice,
                ChannelType.GuildStageVoice,
                ChannelType.GuildForum,
                ChannelType.GuildAnnouncement,
            )
            .setMinValues(0)
            .setMaxValues(25)
            .setDefaultChannels(safeDefaults(state.whitelistChannelIds)),
    );
}

function alwaysRow(state) {
    return new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId("dfsetup_always")
            .setPlaceholder("Pick always-visible channels (optional)")
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildVoice,
                ChannelType.GuildStageVoice,
                ChannelType.GuildForum,
                ChannelType.GuildAnnouncement,
            )
            .setMinValues(0)
            .setMaxValues(25)
            .setDefaultChannels(safeDefaults(state.alwaysVisibleChannelIds)),
    );
}

function targetRow() {
    return new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId("dfsetup_target")
            .setPlaceholder("Pick the channel for the pickup message")
            .addChannelTypes(ChannelType.GuildText)
            .setMinValues(1)
            .setMaxValues(1),
    );
}

function skipRow(customId, label) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(ButtonStyle.Secondary),
    );
}

function confirmRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("dfsetup_confirm")
            .setLabel("Confirm & Apply")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("dfsetup_cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
    );
}

function stepEmbed(step, title, body) {
    return new EmbedBuilder()
        .setTitle(`Deep Focus setup · Step ${step} of 6`)
        .setDescription(`**${title}**\n\n${body}`)
        .setColor(0x5865F2);
}

function errorEmbed(title, body) {
    return new EmbedBuilder()
        .setTitle(`⚠️ ${title}`)
        .setDescription(body)
        .setColor(0xED4245);
}

function infoEmbed(title, body) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(body)
        .setColor(0x5865F2);
}

function summaryEmbed(state, guild) {
    const fmtChannels = (ids) => {
        if (!ids || !ids.length) return "_None_";
        return ids.map(id => {
            const c = guild.channels.cache.get(id);
            return c ? `<#${c.id}>` : `\`${id}\``;
        }).join(", ");
    };
    const fmtCats = (ids) => {
        if (!ids || !ids.length) return "_None_";
        return ids.map(id => {
            const c = guild.channels.cache.get(id);
            return c ? `**${c.name}**` : `\`${id}\``;
        }).join(", ");
    };
    const role = state.roleId ? guild.roles.cache.get(state.roleId) : null;

    return new EmbedBuilder()
        .setTitle("Review Deep Focus setup")
        .setDescription("Confirm the configuration below to apply it. This will update channel overrides for the role and post the pickup message.")
        .addFields(
            { name: "🎭 Role",                  value: role ? `<@&${role.id}>` : `\`${state.roleId}\``, inline: false },
            { name: "🙈 Hidden categories",     value: fmtCats(state.hiddenCategoryIds), inline: false },
            { name: "🙈 Hidden channels",       value: fmtChannels(state.hiddenChannelIds), inline: false },
            { name: "✅ Whitelist exceptions",  value: fmtChannels(state.whitelistChannelIds), inline: false },
            { name: "👁️ Always visible",       value: fmtChannels(state.alwaysVisibleChannelIds), inline: false },
            { name: "📍 Pickup channel",        value: state.setupChannelId ? `<#${state.setupChannelId}>` : "_Not set_", inline: false },
            { name: "⏱️ Max duration",          value: `${state.maxDurationMinutes} minutes`, inline: false },
        )
        .setColor(0xFEE75C);
}

function successSummaryEmbed(state, guild, messageId) {
    const channelMention = state.setupChannelId ? `<#${state.setupChannelId}>` : "the chosen channel";
    return new EmbedBuilder()
        .setTitle("✅ Deep Focus is live")
        .setDescription(
            `Pickup message posted in ${channelMention}. Users can now opt in by picking a duration and pressing an **Activate** button.\n\n` +
            "Re-run `/setupdeepfocus` anytime to change the configuration."
        )
        .addFields(
            { name: "Role", value: state.roleId ? `<@&${state.roleId}>` : "_unset_", inline: true },
            { name: "Pickup message id", value: `\`${messageId}\``, inline: true },
        )
        .setColor(0x57F287);
}

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

function safeDefaults(ids) {
    // setDefaultChannels accepts up to 25 entries and Discord rejects empty
    // arrays only in some versions — pass an array unconditionally.
    if (!Array.isArray(ids)) return [];
    return ids.slice(0, 25);
}

async function safeReply(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (err) {
        console.error("[deepFocus/setup] safeReply failed:", err);
    }
}

async function showStep1(interaction, state, errorMessage) {
    state.step = 1;
    setWizardState(interaction.guildId, state);
    return interaction.update({
        embeds: [
            errorEmbed("Role selection rejected", errorMessage),
            stepEmbed(1, "Pick the Deep Focus role", "Try again with a different role, or adjust the role hierarchy and retry."),
        ],
        components: [rolePickerRow()],
    });
}
