import mongoose from "mongoose";

// Per-user Deep Focus preferences — currently just the 📵 name-tag toggle,
// flipped from the pinned message's toggle button (buttons can't take
// options) or persisted when /deepfocus start is run with an explicit
// show-tag value. One small doc per user who ever toggles; no TTL by design.
const deepFocusPreferenceSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    showTag: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

deepFocusPreferenceSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const DeepFocusPreference = mongoose.model("DeepFocusPreference", deepFocusPreferenceSchema);
