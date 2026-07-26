import { SlashCommandBuilder, ChannelType } from "discord.js";
import { handleDeepFocusStart } from "../handlers/deepFocus/start.js";
import { handleDeepFocusExit } from "../handlers/deepFocus/exit.js";
import { handleDeepFocusStatus } from "../handlers/deepFocus/status.js";
import { handleDeepFocusPostMessage } from "../handlers/deepFocus/postMessage.js";
import { DEFAULT_DURATION_HOURS, MAX_DURATION_HOURS } from "../services/deepFocus/manager.js";

// No setDefaultMemberPermissions — start/exit/status are for everyone.
// post-message enforces ManageChannels at runtime in its handler.
export const data = new SlashCommandBuilder()
    .setName("deepfocus")
    .setDescription("Deep Focus mode — hide distracting channels while you study")
    .addSubcommand(subcommand =>
        subcommand
            .setName("start")
            .setDescription("Enter Deep Focus — access roles saved & stripped, channels hidden")
            .addIntegerOption(option =>
                option.setName("hours")
                    .setDescription(`Auto-exit after this many hours (default ${DEFAULT_DURATION_HOURS})`)
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(MAX_DURATION_HOURS)
            )
            .addChannelOption(option =>
                option.setName("channel")
                    .setDescription("Keep this one voice channel visible & joinable (default: your current voice channel, if any)")
                    .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("exit")
            .setDescription("Exit Deep Focus and restore your roles")
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("status")
            .setDescription("Check your Deep Focus status and time remaining")
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("post-message")
            .setDescription("Post the Deep Focus entry/exit message in this channel (admin)")
            .addStringOption(option =>
                option.setName("message-id")
                    .setDescription("Edit this existing message in this channel instead of posting a new one")
                    .setRequired(false)
            )
    );

export async function execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
        case "start": {
            const hours = interaction.options.getInteger("hours") ?? DEFAULT_DURATION_HOURS;
            const channelOption = interaction.options.getChannel("channel");
            await handleDeepFocusStart(interaction, client, hours, channelOption?.id ?? null);
            break;
        }
        case "exit":
            await handleDeepFocusExit(interaction, client);
            break;
        case "status":
            await handleDeepFocusStatus(interaction);
            break;
        case "post-message":
            await handleDeepFocusPostMessage(interaction);
            break;
        default:
            await interaction.reply({ content: "❌ Invalid Deep Focus command.", flags: 64 });
    }
}
