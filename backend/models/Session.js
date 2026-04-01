const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mode:   { type: String, enum: ['first-time', 'personalized', 'group', 'surprise'], required: true },

  filters: {
    cuisines: [String],
    budget:   Number,
    spice:    Number,
    submode:  String,     // regular | new | surprise
  },

  // For group sessions
  groupRoomCode: { type: String, default: null },
  groupMembers:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  recommendedRestaurants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],
  selectedRestaurant:     { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null },
  feedbackGiven:          { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
