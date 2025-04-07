import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    workDuration: {
      type: Number, // in minutes
      required: true,
      min: [5, 'Work duration must be at least 5 minutes'],
      max: [180, 'Work duration cannot exceed 120 minutes'],
    },
    breakDuration: {
      type: Number, // in minutes
      required: true,
      min: [1, 'Break must be at least 1 minute'],
      max: [60, 'Break cannot exceed 30 minutes'],
    },
    longBreakDuration: {
      type: Number, // in minutes
      required: true,
      min: 30,
      max: 120,
    },
    sessionsBeforeLongBreak: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    maxSessions:{
      type: Number, 
      required: false,
      min: 0,
      max: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    completedSessions: {
      type: Number,
      default: 0,
    },
    phase: {
      type: String,
      enum: ["study", "break", "long_break"],
      default: "study",
    },
    endTime: {
      type: Number, // duration in minutes for the current session type
    },
    
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// TTL index: automatically deletes documents after 2 hours (adjustable)
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 36000 });

export const Session = mongoose.model("Session", sessionSchema);
