import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { SUPER_VERIFICATION_REVIEW_CHANNEL_ID } from "../../config/constants.js";
import {
  extractAnswersFromModal,
  QUESTIONS_PER_MODAL,
  TOTAL_SUPER_VERIFICATION_STEPS,
} from "../../services/superVerificationModals.js";
import { runSuperVerificationChecks } from "../../services/superVerificationChecks.js";
import { SuperVerificationDraft } from "../../models/SuperVerificationDraft.js";
import { SuperVerificationApplication } from "../../models/SuperVerificationApplication.js";

export const REJECTION_MESSAGE =
  "You're not eligible for Super Verification right now because you don't meet the requirements. Please reapply once you do.";

const QUESTION_LABELS = [
  "Read & understood requirements",
  "Discord username",
  "Where are you from",
  "Age",
  "How found the server / how long a member",
  "How long following Enrico's YouTube streams",
  "Community strength",
  "Community weakness",
  "YouTube video ideas",
  "Livestream feature ideas",
  "Study Fam rating",
  "What they'd like taught",
  "Would recommend to a friend",
  "Willing to be patient",
  "Comfortable on cam during livestreams",
];

export async function handleSuperVerificationModalSubmit(interaction, client) {
  const step = parseInt(
    interaction.customId.replace("superverify_modal_", ""),
    10
  );

  const draft = await SuperVerificationDraft.findOne({
    applicantId: interaction.user.id,
  });
  if (!draft) {
    return interaction.reply({
      content:
        "⚠️ Couldn't find your in-progress application — please click Start Super-Verification again.",
      flags: 64,
    });
  }

  const stepAnswers = extractAnswersFromModal(interaction, step);
  const startIndex = (step - 1) * QUESTIONS_PER_MODAL;
  const answers = draft.answers.slice();
  stepAnswers.forEach((answer, i) => {
    answers[startIndex + i] = answer;
  });

  if (step < TOTAL_SUPER_VERIFICATION_STEPS) {
    draft.answers = answers;
    draft.step = step + 1;
    await draft.save();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`superverify_continue_${step + 1}`)
        .setLabel(`Continue (${step + 1}/${TOTAL_SUPER_VERIFICATION_STEPS})`)
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({
      content: `Step ${step}/${TOTAL_SUPER_VERIFICATION_STEPS} saved. Click below to continue.`,
      components: [row],
      flags: 64,
    });
  }

  // Final step — draft is done with either way, so clean it up now.
  await SuperVerificationDraft.deleteOne({ _id: draft._id });

  const member =
    interaction.member ??
    (await interaction.guild.members.fetch(interaction.user.id));
  const { passed, reasons, bypassApplies } = runSuperVerificationChecks(
    member,
    answers
  );

  if (!passed) {
    console.log(
      `🚫 [super-verify] auto-rejected ${interaction.user.username} (${interaction.user.id}) — reasons: ${reasons.join("; ")}`
    );

    const reviewChannel = await client.channels
      .fetch(SUPER_VERIFICATION_REVIEW_CHANNEL_ID)
      .catch(() => null);
    if (reviewChannel) {
      await reviewChannel.send(
        `🚫 Auto-rejected <@${interaction.user.id}> (${interaction.user.username}) — reasons: ${reasons.join("; ")}`
      );
    }

    return interaction.reply({ content: REJECTION_MESSAGE, flags: 64 });
  }

  const application = await SuperVerificationApplication.create({
    guildId: interaction.guild.id,
    applicantId: interaction.user.id,
    applicantUsername: interaction.user.username,
    answers,
    autoCheckResult: { passed, reasons, bypassApplies },
    status: "pending_review",
  });

  const reviewChannel = await client.channels.fetch(
    SUPER_VERIFICATION_REVIEW_CHANNEL_ID
  );
  const embed = buildReviewEmbed(interaction, application);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`superverify_approve_${application._id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`superverify_reject_${application._id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
  );

  const reviewMessage = await reviewChannel.send({
    embeds: [embed],
    components: [row],
  });
  application.reviewMessageId = reviewMessage.id;
  await application.save();

  return interaction.reply({
    content:
      "✅ Your application passed initial checks and has been sent to our team for review.",
    flags: 64,
  });
}

function buildReviewEmbed(interaction, application) {
  const embed = new EmbedBuilder()
    .setTitle("Super Verification — new application")
    .setColor(0x5865f2)
    .setDescription(
      `Applicant: <@${interaction.user.id}> (${interaction.user.username})` +
        (application.autoCheckResult.bypassApplies
          ? "\n\n✅ **YouTube Member/Patreon bypass applies** — every requirement is skipped for this applicant (age, username match, warnings, activity). It's routed here for your review, not because a check failed."
          : "\n\n⚠️ Please manually check warning history (`/warnings` via YAG bot) and activity rank (Lionbot) before approving.")
    );

  application.answers.forEach((answer, i) => {
    embed.addFields({
      name: `${i + 1}. ${QUESTION_LABELS[i]}`,
      value: (answer || "—").slice(0, 1024),
    });
  });

  return embed;
}
