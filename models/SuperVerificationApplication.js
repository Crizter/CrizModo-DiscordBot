import mongoose from "mongoose";

const superVerificationApplicationSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  ticketChannelId: {
    type: String,
    required: true,
  },
  applicantId: {
    type: String,
    required: true,
  },
  applicantUsername: {
    type: String,
    required: true,
  },
  answers: {
    type: [String],
    required: true,
  },
  autoCheckResult: {
    passed: { type: Boolean, required: true },
    reasons: { type: [String], default: [] },
    bypassApplies: { type: Boolean, default: false },
  },
  status: {
    // "approved"/"rejected" documents are hard-deleted immediately once
    // handled (free-tier Mongo cluster) — a document only ever exists in
    // "pending_review" for the normal lifetime of its stay in the DB.
    // Auto-rejects are never written at all. The enum still lists all three
    // so a stuck/undeleted record is diagnosable rather than invalid.
    type: String,
    enum: ["pending_review", "approved", "rejected"],
    default: "pending_review",
  },
  reviewMessageId: {
    type: String,
    default: null,
  },
  sequenceNumber: {
    type: Number,
    default: null,
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

superVerificationApplicationSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export const SuperVerificationApplication = mongoose.model(
  "SuperVerificationApplication",
  superVerificationApplicationSchema
);
