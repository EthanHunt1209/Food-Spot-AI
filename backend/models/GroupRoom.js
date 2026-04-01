const mongoose = require('mongoose');

const groupRoomSchema = new mongoose.Schema({
  code:    { type: String, required: true, unique: true, uppercase: true },
  host:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name:   String,
    // Snapshot of preferences at time of joining
    preferredCuisines: [String],
    budgetPreference:  Number,
    spicePreference:   Number,
    joinedAt: { type: Date, default: Date.now },
  }],
  active:    { type: Boolean, default: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 2 * 60 * 60 * 1000) }, // 2 hours
}, { timestamps: true });

// Auto-expire rooms
groupRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('GroupRoom', groupRoomSchema);
