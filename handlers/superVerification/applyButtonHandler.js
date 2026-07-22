import { SuperVerificationDraft } from "../../models/SuperVerificationDraft.js";
import { SuperVerificationApplication } from "../../models/SuperVerificationApplication.js";
import { buildSuperVerificationModal } from "../../services/superVerificationModals.js";

// "Start Super-Verification" button in the apply channel. Anti-spam: at most
// one draft (in-progress) or one pending_review application per user at a
// time — clicking Start again while a draft exists resumes it rather than
// starting over, since Discord modals can be dismissed without submitting.
export async function handleSuperVerificationApplyButton(interaction, client) {
  const existingApplication = await SuperVerificationApplication.findOne({
    applicantId: interaction.user.id,
    status: "pending_review",
  });
  if (existingApplication) {
    return interaction.reply({
      content:
        "⚠️ You already have a Super Verification application submitted and awaiting review. Please wait for a decision before applying again.",
      flags: 64,
    });
  }

  const existingDraft = await SuperVerificationDraft.findOne({
    applicantId: interaction.user.id,
  });
  if (existingDraft) {
    return interaction.showModal(
      buildSuperVerificationModal(existingDraft.step)
    );
  }

  await SuperVerificationDraft.create({
    guildId: interaction.guild.id,
    applicantId: interaction.user.id,
    applicantUsername: interaction.user.username,
    answers: [],
    step: 1,
  });

  await interaction.showModal(buildSuperVerificationModal(1));
}
