import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    channelId: {
      type: String,
      required: false, // Channel where the pomodoro was started
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    workDuration: {
      type: Number, // in minutes
      required: true,
      min: [1, 'Work duration must be at least 1 minute'],
      max: [180, 'Work duration cannot exceed 180 minutes'],
    },
    breakDuration: {
      type: Number, // in minutes
      required: true,
      min: [1, 'Break must be at least 1 minute'],
      max: [60, 'Break cannot exceed 60 minutes'],
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
      type: Number, // Current phase duration in minutes
      required: true
    },
    actualEndTimestamp: {
      type: Date,
      required: false
    }
  },
  {
    timestamps: true,
  }
);

// TTL index: automatically deletes documents after 10 hours
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 36000 });

export const Session = mongoose.model("Session", sessionSchema);