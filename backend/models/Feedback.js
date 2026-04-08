const mongoose = require('mongoose');

// Optional per-item feedback inside one restaurant feedback submission
const itemFeedbackSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: ''
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  liked: {
    type: Boolean,
    default: null
  },
  comment: {
    type: String,
    default: ''
  }
}, { _id: false });

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  liked: {
    type: Boolean,
    default: null
  },
  comment: {
    type: String,
    default: ''
  },

  // New optional per-dish feedback
  itemFeedbacks: {
    type: [itemFeedbackSchema],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);