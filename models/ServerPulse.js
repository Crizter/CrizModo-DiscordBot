import mongoose from "mongoose";

const roomLabelSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true },
    label: { type: String, required: true, maxlength: 40 },
  },
  { _id: false }
);

const serverPulseConfigSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    pulseChannelId: {
      type: String,
      default: null,
    },
    pulseMessageId: {
      type: String,
      default: null,
    },
    roomLabels: {
      type: [roomLabelSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export const ServerPulseConfig = mongoose.model("ServerPulseConfig", serverPulseConfigSchema);
