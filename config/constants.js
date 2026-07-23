// Ticket categories MEE6 creates ticket channels under — the bot watches both.
export const TICKET_CATEGORY_IDS = ["1156305410261778503", "1156305412916793535"];

// Discord roles that count as staff/mod for ticket-handling purposes.
export const STAFF_ROLE_IDS = ["946582026977439754", "950945987831160885"];

// Bypass rule roles — skips the warnings/activity checks for YouTube Members,
// Patreons, and Server Boosters during Super Verification.
export const YOUTUBE_MEMBER_ROLE_ID = "1047804584250322944";
export const PATREON_ROLE_ID = "1268205706335752224";
export const BOOSTER_ROLE_ID = "815190382194720809";

// Super Verification channels
export const SUPER_VERIFICATION_ANSWERS_CHANNEL_ID = "966423204891598908";
export const SUPER_VERIFICATION_NUMBERING_CHANNEL_ID = "989524291097858048";
export const SUPER_VERIFICATION_REVIEW_CHANNEL_ID = "1528209117812883567";
// View-only channel where the apply message + Start button live. Regular
// users should not be able to send messages here (set via Discord channel
// permissions) — the bot also auto-deletes any stray non-bot message as a
// safety net.
export const SUPER_VERIFICATION_APPLY_CHANNEL_ID = "1528378646228631612";

export const SUPER_VERIFICATION_ENABLED = true;

// Deep Focus mode. The Deep Focus role carries ViewChannel-deny overwrites on
// most categories (configured manually by admins in Discord — the bot never
// touches channel overwrites). Because a role-level ALLOW beats a role-level
// DENY, the bot strips the access roles below on entry (after snapshotting
// them to the log channel + DB) and restores them on exit/expiry.
export const DEEP_FOCUS_ENABLED = true;
export const DEEP_FOCUS_ROLE_ID = "989664630500626434";
// Channel where role snapshots are logged — the manual recovery backup if DB
// data is ever lost.
export const DEEP_FOCUS_LOG_CHANNEL_ID = "1529614165306507304";
// Access roles stripped on entry (Permission Only, Super-Verified channel,
// Cam Only channel, etc.) — the roles whose channel-level ViewChannel allows
// would otherwise defeat the Deep Focus role's denies.
export const DEEP_FOCUS_STRIPPABLE_ROLE_IDS = [
  "950929377363906581",
  "966431293904658533",
  "961314937874034708",
  "992491016080871625",
  "992491302358888519",
  "992491245383467209",
  "961293321093927003",
];

// Pomodoro notification fallback. Study voice channels here are often
// temporary and get deleted once a user leaves them, which used to strand
// solo/group session messages with nowhere to go. This is the last resort,
// used only when a user isn't in any voice channel AND their original
// session channel can no longer be resolved. Leave null to skip this tier
// and fall through to the guild's system channel instead.
export const POMODORO_FALLBACK_CHANNEL_ID = "1215764685236863118";
