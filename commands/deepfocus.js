import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { getActiveSession } from "../models/deepFocus/sessions.js";
import { endDeepFocusSession } from "../utils/deepFocus/endSession.js";

export const data = new SlashCommandBuilder()
  .setName("deepfocus")
  .setDescription("Manage your deep focus session.")
  .addSubcommand((sub) =>
    sub.setName("end").setDescription("End your active deep focus session")
  )
  .addSubcommand((sub) =>
    sub
      .setName("force-end")
      .setDescription("Admin: end another user's deep focus session")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to force-end").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Check your active deep focus session")
  );

export async function execute(interaction, client) {
  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case "end":
      return handleUserEnd(interaction, client);
    case "force-end":
      return handleForceEnd(interaction, client);
    case "status":
      return handleStatus(interaction, client);
    default:
      return interaction.reply({ content: "❌ Invalid deepfocus command.", flags: 64 });
  }
}

export async function handleUserEnd(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const session = await getActiveSession(interaction.guildId, interaction.user.id).catch(() => null);
  if (!session) {
    return interaction.editReply({ content: "You don't have an active deep focus session." });
  }

  await endDeepFocusSession({ sessionId: session.id, endReason: "manual", client });
  return interaction.editReply({ content: "🧘 Deep focus ended." });
}

export async function handleForceEnd(interaction, client) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    return interaction.reply({
      content: "❌ You need the Moderate Members permission to force-end sessions.",
      flags: 64,
    });
  }

  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getUser("user", true);

  const session = await getActiveSession(interaction.guildId, target.id).catch(() => null);
  if (!session) {
    return interaction.editReply({ content: `<@${target.id}> has no active deep focus session.` });
  }

  await endDeepFocusSession({ sessionId: session.id, endReason: "admin", client });
  return interaction.editReply({ content: `🛠️ Ended deep focus for <@${target.id}>.` });
}

export async function handleStatus(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const session = await getActiveSession(interaction.guildId, interaction.user.id).catch(() => null);
  if (!session) {
    return interaction.editReply({ content: "No active deep focus session." });
  }

  const expiresEpoch = Math.floor(new Date(session.expires_at).getTime() / 1000);
  const startedEpoch = Math.floor(new Date(session.started_at).getTime() / 1000);
  return interaction.editReply({
    content: `🧘 Deep focus active.\n• Started: <t:${startedEpoch}:F>\n• Ends: <t:${expiresEpoch}:F> (<t:${expiresEpoch}:R>)`,
  });
}
