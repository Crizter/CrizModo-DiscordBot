import { SlashCommandBuilder } from "discord.js";
import { handleHelp } from "../handlers/pomodoro/help.js";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all CrizModo bot commands");

export async function execute(interaction, client) {
    await handleHelp(interaction);
}
