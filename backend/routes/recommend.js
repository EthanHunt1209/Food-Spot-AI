const express    = require('express');
const Restaurant = require('../models/Restaurant');
const Session    = require('../models/Session');
const { protect } = require('../middleware/auth');
const { scoreRestaurant } = require('../middleware/recommendEngine');

const router = express.Router();

// ── POST /api/recommend/personal ──────────────────────────
// Generate and save a personalized recommendation session
router.post('/personal', protect, async (req, res) => {
  try {
    const { cuisines, budget, spice, submode = 'regular' } = req.body;
    const user = req.user;

    const pref = {
      preferredCuisines: cuisines?.length ? cuisines : user.preferredCuisines,
      budgetPreference:  budget  || user.budgetPreference,
      spicePreference:   spice   || user.spicePreference,
    };

    let restaurants = await Restaurant.find();

    // Exclude already-visited for "try new" mode
    if (submode === 'new') {
      const visitedIds = (await Session.find({ userId: user._id, selectedRestaurant: { $ne: null } })
        .distinct('selectedRestaurant'));
      restaurants = restaurants.filter(r => !visitedIds.map(String).includes(String(r._id)));
    }

    // Surprise: pick one random from high-rated pool
    if (submode === 'surprise') {
      const pool = restaurants.filter(r => r.rating >= 4);
      const picked = pool[Math.floor(Math.random() * pool.length)];
      if (!picked) return res.json({ success: true, restaurants: [], session: null });

      const session = await Session.create({
        userId: user._id,
        mode: 'surprise',
        filters: { cuisines: pref.preferredCuisines, budget: pref.budgetPreference, spice: pref.spicePreference, submode },
        recommendedRestaurants: [picked._id],
      });
      return res.json({ success: true, restaurants: [{ ...picked.toObject(), matchScore: scoreRestaurant(picked, pref) }], session });
    }

    // Score and sort
    const scored = restaurants
      .map(r => ({ ...r.toObject(), matchScore: scoreRestaurant(r, pref) }))
      .sort((a, b) => b.matchScore - a.matchScore);

    const session = await Session.create({
      userId: user._id,
      mode: 'personalized',
      filters: { cuisines: pref.preferredCuisines, budget: pref.budgetPreference, spice: pref.spicePreference, submode },
      recommendedRestaurants: scored.map(r => r._id),
    });

    res.json({ success: true, restaurants: scored, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/recommend/select ────────────────────────────
// User selects a restaurant from a session
router.post('/select', protect, async (req, res) => {
  try {
    const { sessionId, restaurantId } = req.body;
    if (!sessionId || !restaurantId)
      return res.status(400).json({ success: false, message: 'sessionId and restaurantId are required.' });

    const session = await Session.findOneAndUpdate(
      { _id: sessionId, userId: req.user._id },
      { selectedRestaurant: restaurantId },
      { new: true }
    );
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/recommend/history ────────────────────────────
router.get('/history', protect, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user._id })
      .populate('selectedRestaurant', 'name address emoji cuisines rating')
      .populate('recommendedRestaurants', 'name emoji')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/recommend/pending-feedback ───────────────────
router.get('/pending-feedback', protect, async (req, res) => {
  try {
    const sessions = await Session.find({
      userId: req.user._id,
      selectedRestaurant: { $ne: null },
      feedbackGiven: false,
    }).populate('selectedRestaurant', 'name address emoji cuisines rating priceLevel spiceLevel');

    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
