const express    = require('express');
const Feedback   = require('../models/Feedback');
const Session    = require('../models/Session');
const Restaurant = require('../models/Restaurant');
const User       = require('../models/User');
const { protect } = require('../middleware/auth');
const { applyFeedbackLearning } = require('../middleware/recommendEngine');

const router = express.Router();

// ── POST /api/feedback/submit ─────────────────────────────
router.post('/submit', protect, async (req, res) => {
  try {
    const { sessionId, restaurantId, rating, liked, comment } = req.body;

    if (!sessionId || !restaurantId || rating == null)
      return res.status(400).json({ success: false, message: 'sessionId, restaurantId, and rating are required.' });

    if (rating < 1 || rating > 5)
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });

    // Check session belongs to user and has a selection
    const session = await Session.findOne({ _id: sessionId, userId: req.user._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    if (session.feedbackGiven) return res.status(409).json({ success: false, message: 'Feedback already submitted for this session.' });

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found.' });

    // Save feedback
    const feedback = await Feedback.create({
      userId: req.user._id,
      sessionId,
      restaurantId,
      rating,
      liked: liked ?? null,
      comment: comment || '',
    });

    // Mark session as feedback given
    session.feedbackGiven = true;
    await session.save();

    // ── Learning: update user preferences ────────────────
    const user = await User.findById(req.user._id);
    applyFeedbackLearning(user, restaurant, liked === true, rating);
    await user.save();

    res.status(201).json({ success: true, feedback, message: 'Feedback saved. Your recommendations have been updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/feedback/user ────────────────────────────────
router.get('/user', protect, async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ userId: req.user._id })
      .populate('restaurantId', 'name emoji address rating')
      .sort({ createdAt: -1 });
    res.json({ success: true, feedbacks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
