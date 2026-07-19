import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  TICKET_CATEGORY_IDS,
  STAFF_ROLE_IDS,
  SUPER_VERIFICATION_ENABLED,
  SUPER_VERIFICATION_REVIEW_CHANNEL_ID,
} from "../../config/constants.js";
import { parseSuperVerificationForm } from "../../services/formParser.js";
import { runSuperVerificationChecks } from "../../services/superVerificationChecks.js";
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

// Returns { handled: true } once it has taken ownership of the message
// (either auto-rejected it or routed it to mod review), or { handled: false }
// so the shared ticket message handler can fall through to other logic.
export async function handleSuperVerificationMessage(message, client) {
  if (!SUPER_VERIFICATION_ENABLED) return { handled: false };
  if (message.author.bot) return { handled: false };
  if (
    !message.channel.parentId ||
    !TICKET_CATEGORY_IDS.includes(message.channel.parentId)
  ) {
    return { handled: false };
  }

  const { isForm, answers } = parseSuperVerificationForm(message.content);
  if (!isForm) return { handled: false };

  // A staff reply landing after this paste (but before we finish processing
  // it) means a mod is already handling it manually — a reply from BEFORE
  // the paste doesn't count, so this is a point-in-time check, not the
  // FAQ feature's permanent "staff replied -> stay silent forever" flag.
  const messagesAfter = await message.channel.messages.fetch({
    after: message.id,
    limit: 50,
  });
  const alreadyHandled = messagesAfter.some((m) =>
    m.member?.roles.cache.some((role) => STAFF_ROLE_IDS.includes(role.id))
  );
  if (alreadyHandled) return { handled: true };

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id));
  const { passed, reasons, bypassApplies } = runSuperVerificationChecks(
    member,
    answers
  );

  if (!passed) {
    // No DB write for auto-rejects — nothing ever needs to look this up
    // again, and every unnecessary write costs quota on a free Mongo cluster.
    await message.reply(REJECTION_MESSAGE);
    return { handled: true };
  }

  const application = await SuperVerificationApplication.create({
    guildId: message.guild.id,
    ticketChannelId: message.channel.id,
    applicantId: message.author.id,
    applicantUsername: message.author.username,
    answers,
    autoCheckResult: { passed, reasons, bypassApplies },
    status: "pending_review",
  });

  const reviewChannel = await client.channels.fetch(
    SUPER_VERIFICATION_REVIEW_CHANNEL_ID
  );
  const embed = buildReviewEmbed(message, application);
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

  return { handled: true };
}

function buildReviewEmbed(message, application) {
  const embed = new EmbedBuilder()
    .setTitle("Super Verification — new application")
    .setColor(0x5865f2)
    .setDescription(
      `Applicant: <@${message.author.id}> (${message.author.username})\n` +
        `Ticket: <#${message.channel.id}>` +
        (application.autoCheckResult.bypassApplies
          ? "\n\n✅ **YouTube Member/Patreon bypass applies** — you can skip the warnings and activity checks for this applicant."
          : "\n\n⚠️ Please manually check warning history (`/warnings` via YAG bot) and activity rank (Lionbot) before approving.")
    );

  application.answers.forEach((answer, i) => {
    embed.addFields({
      name: `${i + 1}. ${QUESTION_LABELS[i]}`,
      value: answer.slice(0, 1024) || "—",
    });
  });

  return embed;
}
