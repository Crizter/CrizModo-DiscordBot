import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { handleListMembers } from "../handlers/listMembers/handleListMembers.js";

export const data = new SlashCommandBuilder()
    .setName("listmembers")
    .setDescription("List members by roles and optionally remove roles from them")
    .addRoleOption(option =>
        option.setName("role1")
            .setDescription("First role to filter/remove")
            .setRequired(true)
    )
    .addRoleOption(option =>
        option.setName("role2")
            .setDescription("Second role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role3")
            .setDescription("Third role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role4")
            .setDescription("Fourth role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role5")
            .setDescription("Fifth role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role6")
            .setDescription("Fifth role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role7")
            .setDescription("Fifth role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role8")
            .setDescription("Fifth role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role9")
            .setDescription("Fifth role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role10")
            .setDescription("Fifth role to filter/remove")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option.setName("role11")
            .setDescription("Fifth role to filter/remove")
            .setRequired(false)
    )

    .addBooleanOption(option =>
        option.setName("show-all")
            .setDescription("Show members with ANY of the roles (default: ALL roles required)")
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option.setName("remove-roles")
            .setDescription("Remove the specified roles from listed members")
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction, client) {
    await handleListMembers(interaction, client);
}