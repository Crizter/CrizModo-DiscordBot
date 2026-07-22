import mongoose from "mongoose";

const voiceHourBucketSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    dayKey: {
      type: String, // YYYY-MM-DD, UTC
      required: true,
    },
    ms: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

voiceHourBucketSchema.index({ guildId: 1, channelId: 1, dayKey: 1 }, { unique: true });

// Ambient/FOMO stats only ever display "today" — prune old daily rollups
// after ~45 days (arbitrary, cheap headroom for a future "this week" view;
// easy to bump later). No partialFilterExpression needed here (unlike
// GroupSession's TTL): a bucket is only ever written to during its own UTC
// day, so a 45-day window can never clip a document still being updated.
voiceHourBucketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 45 });

export const VoiceHourBucket = mongoose.model("VoiceHourBucket", voiceHourBucketSchema);
