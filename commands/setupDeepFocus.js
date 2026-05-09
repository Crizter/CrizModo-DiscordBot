import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { handleSetupDeepFocus } from "../handlers/deepFocus/setup.js";

export const data = new SlashCommandBuilder()
    .setName("setupdeepfocus")
    .setDescription("Configure the Deep Focus role (admin-only, multi-step wizard)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, client) {
    await handleSetupDeepFocus(interaction, client);
}
