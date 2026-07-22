import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("superverify")
  .setDescription("Super Verification admin commands")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("post-apply-message")
      .setDescription(
        "Post the Super Verification requirements + Start button in this channel"
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

const REQUIREMENTS_TEXT = `**Requirements** and some reasons why your *application* was *denied*.
1. You are not more than a month old on this server.
2. You have received a kick/ban/timeout or *one severe warning*. For a minor warning, you will have to wait 1 month to be eligible, 2 months for two minor warnings, and 1 year for three minor warnings. (Minor warnings: Cam Open Room rule broken, Permission Only Rule broken, innocent minor mistake, etc.)
3. Disregarding the server's rules.
4. Answers provided in the form, such as the username, are wrong.
5. You are not very active on the server. As a reference, please note that your activity should consistently reach the level of Master or Grandmaster (Study Role Ranking) for two consecutive months.
6. If you are a YouTube Member or Patreon, link your account to Discord.

**TO GET SUPER VERIFIED, you need to answer all these questions. Our team will review them, so answer them carefully and completely.**`;

export async function execute(interaction, client) {
  if (interaction.options.getSubcommand() !== "post-apply-message") return;

  const embed = new EmbedBuilder()
    .setTitle("⛔ Super Verification")
    .setDescription(REQUIREMENTS_TEXT)
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("superverify_apply_start")
      .setLabel("Start Super-Verification")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "✅ Posted.", flags: 64 });
}
