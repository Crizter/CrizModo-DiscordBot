import {
  YOUTUBE_MEMBER_ROLE_ID,
  PATREON_ROLE_ID,
} from "../config/constants.js";

const MIN_SERVER_AGE_MS = 30 * 24 * 60 * 60 * 1000; // ~1 month

function normalizeUsername(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/^@/, "")
    .replace(/#\d{4}$/, ""); // strip legacy discriminator if present
}

const MIN_USERNAME_MATCH_LENGTH = 3;

// Real applicants often type a nickname or their name without the numeric
// suffix Discord appends (e.g. "Lucyfer" for the account "lucyfer1703"), not
// their exact handle — so match on prefix, not just exact equality. The
// minimum length guard avoids trivial matches like "a" matching everything.
function usernamesLooselyMatch(stated, actual) {
  if (!stated || !actual) return false;
  if (stated === actual) return true;
  if (
    stated.length < MIN_USERNAME_MATCH_LENGTH ||
    actual.length < MIN_USERNAME_MATCH_LENGTH
  ) {
    return false;
  }
  return stated.startsWith(actual) || actual.startsWith(stated);
}

// Runs the requirements this bot can check on its own (server age, form
// completeness, stated-username match). Warnings and activity rank are never
// checked here — they're always a human call in the mod-review channel.
// YouTube Member / Patreon roles bypass EVERY requirement, not just the
// human-only ones — knowledge.md requirement 6 exempts them outright.
export function runSuperVerificationChecks(member, answers) {
  const reasons = [];

  const bypassApplies = Boolean(
    (YOUTUBE_MEMBER_ROLE_ID && member.roles.cache.has(YOUTUBE_MEMBER_ROLE_ID)) ||
      (PATREON_ROLE_ID && member.roles.cache.has(PATREON_ROLE_ID))
  );

  const hasBlankAnswer = answers.some(
    (answer) => !answer || answer.trim().length === 0
  );
  if (hasBlankAnswer) {
    reasons.push("One or more form questions were left unanswered.");
  }

  if (!bypassApplies) {
    const joinedAt = member.joinedTimestamp;
    if (!joinedAt || Date.now() - joinedAt < MIN_SERVER_AGE_MS) {
      reasons.push("Applicant has been on the server for less than a month.");
    }

    const statedUsername = normalizeUsername(answers[1] || "");
    const actualUsername = normalizeUsername(member.user.username || "");
    const actualDisplayName = normalizeUsername(member.displayName || "");
    const usernameMatches =
      statedUsername.length > 0 &&
      (usernamesLooselyMatch(statedUsername, actualUsername) ||
        usernamesLooselyMatch(statedUsername, actualDisplayName));
    if (!usernameMatches) {
      reasons.push(
        "The Discord username stated in the form doesn't match the applicant's actual username."
      );
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
    bypassApplies,
  };
}
