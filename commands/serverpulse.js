import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { handlePulseSetup } from "../handlers/serverPulse/setup.js";
import { handlePulseDisable } from "../handlers/serverPulse/disable.js";
import { handlePulseRefresh } from "../handlers/serverPulse/refresh.js";
import { handlePulseLabel } from "../handlers/serverPulse/label.js";
import { handlePulseUnlabel } from "../handlers/serverPulse/unlabel.js";

export const data = new SlashCommandBuilder()
    .setName("serverpulse")
    .setDescription("Configure the live Server Pulse embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(subcommand =>
        subcommand
            .setName("setup")
            .setDescription("Post (or move) the Server Pulse embed in a channel")
            .addChannelOption(option =>
                option.setName("channel")
                    .setDescription("Text channel to post the Pulse embed in")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("disable")
            .setDescription("Stop updating the Server Pulse embed")
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("refresh")
            .setDescription("Force an immediate Server Pulse rebuild")
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("label")
            .setDescription("Set a custom display name for a voice channel on the Pulse")
            .addChannelOption(option =>
                option.setName("voice-channel")
                    .setDescription("Voice channel to label")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildVoice)
            )
            .addStringOption(option =>
                option.setName("name")
                    .setDescription("Custom label (max 40 characters)")
                    .setRequired(true)
                    .setMaxLength(40)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("unlabel")
            .setDescription("Remove a voice channel's custom label")
            .addChannelOption(option =>
                option.setName("voice-channel")
                    .setDescription("Voice channel to unlabel")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildVoice)
            )
    );

export async function execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
        case "setup":
            await handlePulseSetup(interaction, client);
            break;
        case "disable":
            await handlePulseDisable(interaction, client);
            break;
        case "refresh":
            await handlePulseRefresh(interaction, client);
            break;
        case "label":
            await handlePulseLabel(interaction, client);
            break;
        case "unlabel":
            await handlePulseUnlabel(interaction, client);
            break;
        default:
            await interaction.reply({ content: "❌ Invalid Server Pulse command.", flags: 64 });
    }
}
