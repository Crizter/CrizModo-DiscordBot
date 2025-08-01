import mongoose from 'mongoose';

const roomActiveCheckSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  enabled: {
    type: Boolean,
    default: false
  },
  primaryChannelId: {
    type: String,
    default: null
  },
  secondaryChannelId: {
    type: String,
    default: null
  },
  requiredRoleId: {
    type: String,
    default: null
  },
  threshold: {
    type: Number,
    default: 10,
    min: 1,
    max: 50
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
roomActiveCheckSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export const RoomActiveCheck = mongoose.model('RoomActiveCheck', roomActiveCheckSchema);