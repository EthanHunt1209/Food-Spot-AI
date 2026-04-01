const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  rating:       { type: Number, required: true, min: 1, max: 5 },
  liked:        { type: Boolean, default: null },
  comment:      { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
