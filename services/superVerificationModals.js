import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";

// Discord modal labels are capped at 45 characters, so `label` is a
// shortened version of each full question in knowledge.md — placeholders
// carry back a bit of the nuance that doesn't fit in the label itself.
// `fullText` is the exact original question wording, used wherever the
// complete question needs to be shown (e.g. the answers-channel archive).
const QUESTIONS = [
  {
    customId: "sv_q1",
    label: "Read & meet all requirements? (Y/N)",
    style: TextInputStyle.Short,
    placeholder: "Please double-check before proceeding",
    fullText:
      "Have you read all the requirements above before applying? Are you sure you meet all the necessary requirements in order to get Super Verified? Please double-check before starting the process.",
  },
  {
    customId: "sv_q2",
    label: "Your Discord username",
    style: TextInputStyle.Short,
    placeholder: "e.g. yourname (no @ symbol)",
    fullText: "What is your Discord username",
  },
  {
    customId: "sv_q3",
    label: "Where are you from?",
    style: TextInputStyle.Short,
    fullText: "Where are you from?",
  },
  {
    customId: "sv_q4",
    label: "How old are you?",
    style: TextInputStyle.Short,
    fullText: "How old are you?",
  },
  {
    customId: "sv_q5",
    label: "How'd you find the server + how long",
    style: TextInputStyle.Paragraph,
    fullText:
      "How'd you come to know about the server? How long have you been a member?",
  },
  {
    customId: "sv_q6",
    label: "How long following Enrico on YouTube?",
    style: TextInputStyle.Short,
    fullText: "How long have you been following Enrico's streams on YouTube?",
  },
  {
    customId: "sv_q7",
    label: "Strengths of Enrico's study server?",
    style: TextInputStyle.Paragraph,
    fullText:
      "What do you think is the strength of Enrico's study server's community?",
  },
  {
    customId: "sv_q8",
    label: "Weaknesses of Enrico's study server?",
    style: TextInputStyle.Paragraph,
    placeholder: "Anything confusing or unclear?",
    fullText:
      "What do you think is the weakness of Enrico's study server's community? Did you find something confusing?",
  },
  {
    customId: "sv_q9",
    label: "YouTube video ideas for Enrico?",
    style: TextInputStyle.Paragraph,
    fullText:
      "What would you like to see Enrico doing on YouTube? Is there any video idea you would like to suggest for videos?",
  },
  {
    customId: "sv_q10",
    label: "Any Livestream ideas?",
    style: TextInputStyle.Paragraph,
    fullText:
      "What would you like to see Enrico doing on the YouTube live streams? Is there any feature you would like to add or remove from them?",
  },
  {
    customId: "sv_q11",
    label: "Rate the Study Fam overall",
    style: TextInputStyle.Paragraph,
    placeholder: "Give an honest, complete opinion",
    fullText:
      "How would you rate the Study Fam overall? (Give an honest and complete opinion)",
  },
  {
    customId: "sv_q12",
    label: "Suggest productivity related content you want",
    style: TextInputStyle.Paragraph,
    placeholder: "e.g. time management, focus techniques",
    fullText:
      "Is there anything specifically about productivity that you would like Enrico or this community to teach you?",
  },
  {
    customId: "sv_q13",
    label: "Would you recommend Enrico server?",
    style: TextInputStyle.Short,
    fullText: "Would you recommend this productive community to a friend?",
  },
  {
    customId: "sv_q14",
    label: "Willing to wait weeks/months(y/n)?",
    style: TextInputStyle.Short,
    placeholder: "Verification can take a long time",
    fullText:
      "Are you willing to be patient? The Super Verification process can take a lot of time, so you must be willing to be patient if you decide to submit this form. It can take weeks or months (depending on the specific case). Be aware of this.",
  },
  {
    customId: "sv_q15",
    label: "Comfortable on cam during livestreams?",
    style: TextInputStyle.Short,
    placeholder: "Joining implies consent to be on stream",
    fullText:
      "Are you comfortable showing yourself on the cam on Super Room whenever Enrico livestreams on YouTube? By joining the room, you implicitly consent to potentially be a part of the YouTube Livestream. Do you understand this?",
  },
];

export const SUPER_VERIFICATION_QUESTION_TEXTS = QUESTIONS.map(
  (q) => q.fullText
);

export const QUESTIONS_PER_MODAL = 5;
export const TOTAL_SUPER_VERIFICATION_STEPS = Math.ceil(
  QUESTIONS.length / QUESTIONS_PER_MODAL
);

function questionsForStep(step) {
  const startIndex = (step - 1) * QUESTIONS_PER_MODAL;
  return QUESTIONS.slice(startIndex, startIndex + QUESTIONS_PER_MODAL);
}

export function buildSuperVerificationModal(step) {
  const modal = new ModalBuilder()
    .setCustomId(`superverify_modal_${step}`)
    .setTitle(`Super Verification (${step}/${TOTAL_SUPER_VERIFICATION_STEPS})`);

  const rows = questionsForStep(step).map((question) => {
    const input = new TextInputBuilder()
      .setCustomId(question.customId)
      .setLabel(question.label)
      .setStyle(question.style)
      .setRequired(true);
    if (question.placeholder) input.setPlaceholder(question.placeholder);
    return new ActionRowBuilder().addComponents(input);
  });

  modal.addComponents(...rows);
  return modal;
}

export function extractAnswersFromModal(interaction, step) {
  return questionsForStep(step).map((question) =>
    interaction.fields.getTextInputValue(question.customId).trim()
  );
}
