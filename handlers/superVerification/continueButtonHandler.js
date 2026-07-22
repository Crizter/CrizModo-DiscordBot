import { SuperVerificationDraft } from "../../models/SuperVerificationDraft.js";
import { buildSuperVerificationModal } from "../../services/superVerificationModals.js";

// "Continue" button shown after modal steps 1 and 2 — opens the next modal.
export async function handleSuperVerificationContinueButton(interaction, client) {
  const step = parseInt(
    interaction.customId.replace("superverify_continue_", ""),
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

  await interaction.showModal(buildSuperVerificationModal(step));
}
