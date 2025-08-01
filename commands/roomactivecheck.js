import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { handleEnableRoomActiveCheck } from "../handlers/roomactivecheck/enable.js";

export const data = new SlashCommandBuilder()
    .setName("enable-roomactivecheck")
    .setDescription("Toggle the dynamic voice channel visibility feature")
    .addBooleanOption(option =>
        option.setName("enabled")
            .setDescription("Enable or disable the room active check feature")
            .setRequired(true)
    )
    .addChannelOption(option =>
        option.setName("primary-channel")
            .setDescription("The voice channel to monitor for member count")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildVoice)
    )
    .addChannelOption(option =>
        option.setName("secondary-channel")
            .setDescription("The voice channel to show/hide based on member count")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildVoice)
    )
    .addRoleOption(option =>
        option.setName("required-role")
            .setDescription("The role that can see the secondary channel when enabled")
            .setRequired(true)
    )
    .addIntegerOption(option =>
        option.setName("threshold")
            .setDescription("Member count threshold (default: 10)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction, client) {
    await handleEnableRoomActiveCheck(interaction, client);
}