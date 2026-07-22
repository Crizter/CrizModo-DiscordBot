import mongoose from "mongoose";

// One draft per applicant at a time (unique applicantId) — this is both the
// in-progress state across the 3 modal steps AND the anti-spam guard:
// creating a second draft while one exists is rejected by the unique index,
// so a user can't start a second application while one is mid-flow.
const superVerificationDraftSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  applicantId: {
    type: String,
    required: true,
    unique: true,
  },
  applicantUsername: {
    type: String,
    required: true,
  },
  answers: {
    type: [String],
    default: [],
  },
  step: {
    type: Number,
    default: 1,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

superVerificationDraftSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export const SuperVerificationDraft = mongoose.model(
  "SuperVerificationDraft",
  superVerificationDraftSchema
);
