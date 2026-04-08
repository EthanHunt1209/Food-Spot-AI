const express = require('express');
const Feedback = require('../models/Feedback');
const Session = require('../models/Session');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { applyFeedbackLearning } = require('../middleware/recommendEngine');

const router = express.Router();

// ── POST /api/feedback/submit ─────────────────────────────
// Supports:
// {
//   sessionId,
//   restaurantId,
//   rating,
//   liked,
//   comment,
//   itemFeedbacks: [{ itemName, category, rating, liked, comment }]
// }
router.post('/submit', protect, async (req, res) => {
  try {
    const {
      sessionId,
      restaurantId,
      rating,
      liked,
      comment,
      itemFeedbacks
    } = req.body;

    if (!sessionId || !restaurantId || rating == null) {
      return res.status(400).json({
        success: false,
        message: 'sessionId, restaurantId and rating are required.'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5.'
      });
    }

    // Validate item feedbacks if provided
    if (itemFeedbacks?.length) {
      for (const item of itemFeedbacks) {
        if (!item.itemName || item.rating == null) {
          return res.status(400).json({
            success: false,
            message: 'Each item feedback needs itemName and rating.'
          });
        }

        if (item.rating < 1 || item.rating > 5) {
          return res.status(400).json({
            success: false,
            message: `Item rating must be between 1 and 5 for "${item.itemName}".`
          });
        }
      }
    }

    // Check session belongs to user
    const session = await Session.findOne({
      _id: sessionId,
      userId: req.user._id
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found.'
      });
    }

    if (session.feedbackGiven) {
      return res.status(409).json({
        success: false,
        message: 'Feedback already submitted for this session.'
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found.'
      });
    }

    // Save feedback
    const feedback = await Feedback.create({
      userId: req.user._id,
      sessionId,
      restaurantId,
      rating,
      liked: liked ?? null,
      comment: comment || '',
      itemFeedbacks: itemFeedbacks || []
    });

    // Mark session as feedback given
    session.feedbackGiven = true;
    await session.save();

    // Learning: update user preferences
    const user = await User.findById(req.user._id);
    applyFeedbackLearning(user, restaurant, liked === true, rating);
    await user.save();

    res.status(201).json({
      success: true,
      feedback,
      message: `Feedback saved! ${
        itemFeedbacks?.length
          ? `(${itemFeedbacks.length} dish rating${itemFeedbacks.length > 1 ? 's' : ''} recorded) `
          : ''
      }Your recommendations have been updated.`
    });
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

// ── GET /api/feedback/item-stats/:restaurantId ────────────
// Returns average rating per menu item for a restaurant
router.get('/item-stats/:restaurantId', async (req, res) => {
  try {
    const feedbacks = await Feedback.find({
      restaurantId: req.params.restaurantId,
      'itemFeedbacks.0': { $exists: true }
    });

    const stats = {};

    feedbacks.forEach((fb) => {
      (fb.itemFeedbacks || []).forEach((item) => {
        const key = item.itemName;

        if (!stats[key]) {
          stats[key] = {
            itemName: key,
            category: item.category,
            total: 0,
            count: 0,
            likedCount: 0
          };
        }

        stats[key].total += item.rating;
        stats[key].count += 1;

        if (item.liked === true) {
          stats[key].likedCount += 1;
        }
      });
    });

    const result = Object.values(stats)
      .map((s) => ({
        itemName: s.itemName,
        category: s.category,
        avgRating: +(s.total / s.count).toFixed(1),
        ratingCount: s.count,
        likedPct: s.count > 0
          ? Math.round((s.likedCount / s.count) * 100)
          : null
      }))
      .sort((a, b) => b.avgRating - a.avgRating);

    res.json({
      success: true,
      restaurantId: req.params.restaurantId,
      itemStats: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;