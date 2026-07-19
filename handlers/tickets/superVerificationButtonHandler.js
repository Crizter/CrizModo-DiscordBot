import { EmbedBuilder } from "discord.js";
import {
  SUPER_VERIFICATION_ANSWERS_CHANNEL_ID,
  SUPER_VERIFICATION_NUMBERING_CHANNEL_ID,
} from "../../config/constants.js";
import { SuperVerificationApplication } from "../../models/SuperVerificationApplication.js";
import { REJECTION_MESSAGE } from "./superVerificationHandler.js";

const APPLICATION_SUBMITTED_MESSAGE =
  "Your Super Verification application has been submitted. You're on hold — a moderator will follow up in due time.";

export async function handleSuperVerificationButton(interaction, client) {
  const isApprove = interaction.customId.startsWith("superverify_approve_");
  const isReject = interaction.customId.startsWith("superverify_reject_");
  if (!isApprove && !isReject) return;

  await interaction.deferUpdate();

  const applicationId = interaction.customId.replace(
    isApprove ? "superverify_approve_" : "superverify_reject_",
    ""
  );

  const application = await SuperVerificationApplication.findById(
    applicationId
  );
  if (!application) {
    return interaction.followUp({
      content: "❌ Application not found (already handled, or expired).",
      flags: 64,
    });
  }
  if (application.status !== "pending_review") {
    return interaction.followUp({
      content: `⚠️ Already handled (status: ${application.status}).`,
      flags: 64,
    });
  }

  const ticketChannel = await client.channels
    .fetch(application.ticketChannelId)
    .catch(() => null);

  try {
    if (isReject) {
      if (ticketChannel) await ticketChannel.send(REJECTION_MESSAGE);
      await updateReviewMessage(
        interaction,
        `❌ Rejected by ${interaction.user.username}`
      );
    } else {
      const numberingChannel = await client.channels.fetch(
        SUPER_VERIFICATION_NUMBERING_CHANNEL_ID
      );
      const nextNumber = await getNextSequenceNumber(numberingChannel);

      const answersChannel = await client.channels.fetch(
        SUPER_VERIFICATION_ANSWERS_CHANNEL_ID
      );
      const answersEmbed = new EmbedBuilder()
        .setTitle(`Super Verification — #${nextNumber}`)
        .setDescription(
          `Applicant: <@${application.applicantId}> (${application.applicantUsername})`
        )
        .setColor(0x57f287);
      application.answers.forEach((answer, i) => {
        answersEmbed.addFields({
          name: `${i + 1}.`,
          value: answer.slice(0, 1024) || "—",
        });
      });
      await answersChannel.send({ embeds: [answersEmbed] });
      await numberingChannel.send(
        `**${nextNumber}** - **${application.applicantUsername}**`
      );

      if (ticketChannel) await ticketChannel.send(APPLICATION_SUBMITTED_MESSAGE);

      await updateReviewMessage(
        interaction,
        `✅ Approved by ${interaction.user.username} — #${nextNumber}`
      );
    }
  } catch (error) {
    console.error("❌ Error processing super verification decision:", error);
    await interaction.followUp({
      content:
        "❌ Something went wrong while processing this decision — the application record was kept so you can retry.",
      flags: 64,
    });
    return;
  }

  // Hard delete once fully handled either way — free-tier Mongo cluster, no
  // need to keep resolved applications around; the messages posted above
  // (or the rejection reply) are the permanent record from here on.
  await SuperVerificationApplication.deleteOne({ _id: application._id });
}

async function updateReviewMessage(interaction, note) {
  const originalEmbed = interaction.message.embeds[0];
  const embed = originalEmbed
    ? EmbedBuilder.from(originalEmbed).setFooter({ text: note })
    : new EmbedBuilder().setDescription(note);

  await interaction.editReply({ embeds: [embed], components: [] });
}

async function getNextSequenceNumber(channel) {
  const lastMessages = await channel.messages.fetch({ limit: 1 });
  const lastMessage = lastMessages.first();

  if (!lastMessage) return 1;

  const match = lastMessage.content.match(/\*{0,2}(\d+)\*{0,2}/);
  if (!match) {
    throw new Error(
      `Could not parse a sequence number from the numbering channel's last message: "${lastMessage.content}"`
    );
  }

  return parseInt(match[1], 10) + 1;
}
