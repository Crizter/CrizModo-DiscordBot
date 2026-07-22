import mongoose from "mongoose";

const deepFocusSessionSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    // The stripped allowlist subset — exactly what restore re-adds.
    savedRoleIds: {
      type: [String],
      default: [],
    },
    // Full role snapshot at entry (minus @everyone) — extra safety margin on
    // top of the log-channel message; not used by automated restore.
    allRoleIdsAtEntry: {
      type: [String],
      default: [],
    },
    // Message id of the snapshot posted to DEEP_FOCUS_LOG_CHANNEL_ID — the
    // manual recovery backup if this document is ever lost.
    logMessageId: {
      type: String,
      default: null,
    },
    // Nickname at entry — null means they were using their global display
    // name; restore sets exactly this back (setNickname(null) reverts to the
    // global name). Never derived by stripping the tag prefix: 32-char
    // truncation makes that lossy.
    savedNickname: {
      type: String,
      default: null,
    },
    // The "🧘 ..." nickname the bot actually applied (null = tag was opted
    // out, skipped, or failed). Restore only touches the nickname when the
    // member's current nickname still equals this — so a manual mid-focus
    // rename is never clobbered.
    appliedNickname: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["entering", "active", "restored", "member_left", "failed"],
      default: "entering",
    },
    // Mirror of "status is entering/active" kept as a boolean so the unique
    // partial index below can enforce one open session per user (and turn a
    // button double-click race into a clean E11000). Only ever set via
    // markClosed() in services/deepFocus/manager.js.
    isOpen: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    durationHours: {
      type: Number,
      min: 1,
      max: 24,
    },
    restoreAttempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// One open session per user; concurrent double-entry throws E11000.
deepFocusSessionSchema.index(
  { guildId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { isOpen: true } }
);

// Sweep query: { status: 'active', expiresAt: { $lte: now } }.
deepFocusSessionSchema.index({ status: 1, expiresAt: 1 });

// Cleanly-restored docs expire 7 days after restore (updatedAt, not
// createdAt). member_left/failed docs are kept indefinitely — they hold the
// saved roles staff needs for manual recovery. Open docs are never TTL'd.
deepFocusSessionSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 604800, partialFilterExpression: { status: "restored" } }
);

export const DeepFocusSession = mongoose.model("DeepFocusSession", deepFocusSessionSchema);
