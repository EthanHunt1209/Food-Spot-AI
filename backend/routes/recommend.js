// routes/recommend.js — FIXED VERSION
// Fixes:
//  1. Cuisine filter: only return restaurants that match selected cuisines
//  2. matchScore is always passed through so detail page never shows dash
//  3. Surprise mode returns exactly ONE restaurant
//  4. Uses correct engine exports: scoreRestaurant, scoreForGroup, aiRankRestaurants, isFirstTimeUser

const express    = require('express');
const Restaurant = require('../models/Restaurant');
const Session    = require('../models/Session');
const Feedback   = require('../models/Feedback');
const { protect } = require('../middleware/auth');
const {
  scoreRestaurant,
  scoreForGroup,
  aggregatePreferences,
  applyFeedbackLearning,
  aiRankRestaurants,
  isFirstTimeUser,
} = require('../middleware/recommendEngine');

const router = express.Router();

// ── Attach average community feedback rating to each restaurant ──
async function attachCommunityScores(restaurants) {
  const ids = restaurants.map(r => r._id);
  const feedbacks = await Feedback.find({ restaurantId: { $in: ids } });
  const totals = {}, counts = {};
  feedbacks.forEach(fb => {
    const id = String(fb.restaurantId);
    totals[id] = (totals[id] || 0) + fb.rating;
    counts[id] = (counts[id] || 0) + 1;
  });
  return restaurants.map(r => {
    const id = String(r._id || r.id);
    const communityScore = counts[id] ? +(totals[id] / counts[id]).toFixed(1) : null;
    return {
      ...r.toObject ? r.toObject() : r,
      communityScore,
      feedbackCount: counts[id] || 0,
    };
  });
}

// ── Filter restaurants by selected cuisines ──────────────────────
// If cuisines array is empty/missing, returns all restaurants (no filter).
// If cuisines selected, returns only restaurants whose cuisines array
// contains at least one of the selected cuisines (case-insensitive).
function filterByCuisines(restaurants, selectedCuisines) {
  if (!selectedCuisines || selectedCuisines.length === 0) return restaurants;
  const lower = selectedCuisines.map(c => c.toLowerCase());
  return restaurants.filter(r =>
    (r.cuisines || []).some(c => lower.includes(c.toLowerCase()))
  );
}

// ════════════════════════════════════════════════════════════════
// POST /api/recommend/personal
// Body: { cuisines[], budget, spice, vegPreference, submode, userLat, userLng }
// ════════════════════════════════════════════════════════════════
router.post('/personal', protect, async (req, res) => {
  try {
    const {
      cuisines, budget, spice,
      vegPreference, submode = 'regular',
      userLat, userLng,
    } = req.body;

    const user        = req.user;
    const userLocation = (userLat && userLng)
      ? { lat: parseFloat(userLat), lng: parseFloat(userLng) }
      : null;

    const coldStart   = isFirstTimeUser(user);
    const dislikedIds = (user.dislikedRestaurants || []).map(String);

    // Build effective preference — request params win over saved profile
    const pref = {
      preferredCuisines: cuisines?.length ? cuisines : (user.preferredCuisines || []),
      budgetPreference:  budget  || user.budgetPreference  || 2,
      spicePreference:   spice   || user.spicePreference   || 3,
      vegPreference:     vegPreference || user.vegPreference || 'any',
    };

    // The cuisines to filter by (only what the user explicitly chose in the wizard)
    const filterCuisines = cuisines?.length ? cuisines : [];

    let restaurants = await Restaurant.find();

    // ── submode=new: exclude already-visited restaurants ──
    if (submode === 'new') {
      const visitedIds = (
        await Session.find({ userId: user._id, selectedRestaurant: { $ne: null } })
          .distinct('selectedRestaurant')
      ).map(String);
      restaurants = restaurants.filter(r => !visitedIds.includes(String(r._id)));
    }

    // ── submode=surprise: single random unvisited high-rated pick ──
    if (submode === 'surprise') {
      let visitedIds = [];
      try {
        visitedIds = (
          await Session.find({ userId: user._id, selectedRestaurant: { $ne: null } })
            .distinct('selectedRestaurant')
        ).map(String);
      } catch (_) {}

      // Build pool: prefer unvisited + high-rated + not disliked
      let pool = restaurants.filter(r =>
        r.rating >= 4.0 &&
        !dislikedIds.includes(String(r._id)) &&
        !visitedIds.includes(String(r._id))
      );
      // Widen fallback progressively
      if (pool.length === 0)
        pool = restaurants.filter(r => r.rating >= 4.0 && !dislikedIds.includes(String(r._id)));
      if (pool.length === 0)
        pool = restaurants.filter(r => !dislikedIds.includes(String(r._id)));
      if (pool.length === 0)
        pool = restaurants;

      // Pick exactly ONE at random
      const picked = pool[Math.floor(Math.random() * pool.length)];
      if (!picked) {
        return res.json({ success: true, restaurants: [], session: null, isColdStart: coldStart });
      }

      const [withCommunity] = await attachCommunityScores([picked]);
      // Always compute and attach matchScore so the detail page can show it
      const matchScore = scoreRestaurant(withCommunity, pref, userLocation);
      const result = { ...withCommunity, matchScore, aiReason: 'AI surprise pick — something you haven\'t tried yet!' };

      const session = await Session.create({
        userId: user._id,
        mode:   'surprise',
        filters: { cuisines: pref.preferredCuisines, budget: pref.budgetPreference, spice: pref.spicePreference, submode },
        recommendedRestaurants: [picked._id],
      });

      // Return EXACTLY one restaurant for surprise
      return res.json({ success: true, restaurants: [result], session, isColdStart: coldStart, aiUsed: false });
    }

    // ── Apply cuisine filter FIRST (only restaurants matching selected cuisines) ──
    if (filterCuisines.length > 0) {
      restaurants = filterByCuisines(restaurants, filterCuisines);
    }

    // ── Attach community scores ───────────────────────────
    const withCommunity = await attachCommunityScores(restaurants);

    // ── Remove disliked ───────────────────────────────────
    let scored = withCommunity.filter(r => !dislikedIds.includes(String(r._id)));

    // ════════════════════════════════════════════════════
    // FIRST-TIME USER — sort by community feedback desc
    // ════════════════════════════════════════════════════
    if (coldStart) {
      const sortByCommunity = (a, b) =>
        (b.communityScore || b.rating || 0) - (a.communityScore || a.rating || 0);

      if (pref.vegPreference === 'veg') {
        const vegFriendly = scored.filter(r => (r.tags || []).map(t => t.toLowerCase()).includes('veg'));
        const notVeg      = scored.filter(r => !(r.tags || []).map(t => t.toLowerCase()).includes('veg'));
        scored = [
          ...vegFriendly.sort(sortByCommunity),
          ...notVeg.sort(sortByCommunity),
        ];
      } else {
        scored.sort(sortByCommunity);
      }

      // Attach matchScore to every restaurant so detail page always has it
      scored = scored.map(r => ({
        ...r,
        matchScore: scoreRestaurant(r, pref, userLocation),
      }));

    // ════════════════════════════════════════════════════
    // RETURNING USER — scoreRestaurant + AI re-rank
    // ════════════════════════════════════════════════════
    } else {
      // Fetch feedback history for AI context
      const userFeedbacks = await Feedback.find({ userId: user._id })
        .populate('restaurantId', 'name cuisines priceLevel spiceLevel')
        .sort({ createdAt: -1 })
        .limit(20);

      // Score every restaurant and attach matchScore
      scored = scored.map(r => ({
        ...r,
        matchScore: scoreRestaurant(r, pref, userLocation),
      }));

      // Primary sort: matchScore desc, secondary: community score
      scored.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.communityScore || b.rating) - (a.communityScore || a.rating);
      });

      // AI re-ranking (silent fallback if no GROQ_API_KEY or call fails)
      const userContext = {
        preferredCuisines:     pref.preferredCuisines,
        budgetPreference:      pref.budgetPreference,
        spicePreference:       pref.spicePreference,
        vegPreference:         pref.vegPreference,
        userLocation,
        likedRestaurantIds:    (user.likedRestaurants    || []).map(String),
        dislikedRestaurantIds: dislikedIds,
        recentFeedback: userFeedbacks.map(fb => ({
          restaurant: fb.restaurantId?.name,
          cuisines:   fb.restaurantId?.cuisines,
          rating:     fb.rating,
          liked:      fb.liked,
        })).filter(f => f.restaurant),
      };

      const aiRanked = await aiRankRestaurants(scored, userContext, false);
      if (aiRanked) scored = aiRanked;
    }

    const session = await Session.create({
      userId: user._id,
      mode:   coldStart ? 'first-time' : 'personalized',
      filters: { cuisines: pref.preferredCuisines, budget: pref.budgetPreference, spice: pref.spicePreference, submode },
      recommendedRestaurants: scored.map(r => r._id),
    });

    res.json({
      success:     true,
      restaurants: scored,   // every item has matchScore attached
      session,
      isColdStart: coldStart,
      aiUsed:      !coldStart,
    });

  } catch (err) {
    console.error('Recommend /personal error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/recommend/select ────────────────────────────
router.post('/select', protect, async (req, res) => {
  try {
    const { sessionId, restaurantId } = req.body;
    if (!sessionId || !restaurantId)
      return res.status(400).json({ success: false, message: 'sessionId and restaurantId required.' });
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
      .populate('selectedRestaurant', 'name address emoji cuisines rating priceLevel')
      .sort({ createdAt: -1 }).limit(30);
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/recommend/pending-feedback ───────────────────
router.get('/pending-feedback', protect, async (req, res) => {
  try {
    const sessions = await Session.find({
      userId: req.user._id, selectedRestaurant: { $ne: null }, feedbackGiven: false,
    }).populate('selectedRestaurant', 'name address emoji cuisines rating priceLevel spiceLevel menu');
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/recommend/group ─────────────────────────────
// Uses scoreForGroup (correct export name from recommendEngine)
router.post('/group', protect, async (req, res) => {
  try {
    const { code } = req.body;
    const GroupRoom = require('../models/GroupRoom');

    const room = await GroupRoom.findOne({ code: code.toUpperCase(), active: true });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found or expired.' });

    const members = room.members.map(m => ({
      preferredCuisines: m.preferredCuisines || [],
      budgetPreference:  m.budgetPreference  || 2,
      spicePreference:   m.spicePreference   || 3,
      vegPreference:     m.vegPreference     || 'any',
    }));

    const restaurants   = await Restaurant.find();
    const withCommunity = await attachCommunityScores(restaurants);
    const aggPref       = aggregatePreferences(members);

    // scoreForGroup is the correct export name
    let scored = withCommunity.map(r => {
      const { avg, scores } = scoreForGroup(r, members, null);
      return { ...r, matchScore: avg, memberScores: scores };
    }).sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return (b.communityScore || b.rating) - (a.communityScore || a.rating);
    });

    // AI re-ranking for group
    let aiUsed = false;
    const groupContext = {
      members: room.members.map(m => ({
        name:              m.name,
        preferredCuisines: m.preferredCuisines || [],
        budgetPreference:  m.budgetPreference  || 2,
        spicePreference:   m.spicePreference   || 3,
        vegPreference:     m.vegPreference     || 'any',
      })),
      aggregated: aggPref,
    };
    const aiRanked = await aiRankRestaurants(scored, groupContext, true);
    if (aiRanked) { scored = aiRanked; aiUsed = true; }

    // Save one session per group member
    await Promise.all(room.members.map(m =>
      Session.create({
        userId:        m.userId,
        mode:          'group',
        groupRoomCode: room.code,
        groupMembers:  room.members.map(x => x.userId),
        filters: { cuisines: aggPref.preferredCuisines, budget: aggPref.budgetPreference, spice: aggPref.spicePreference },
        recommendedRestaurants: scored.map(r => r._id),
      })
    ));

    res.json({ success: true, restaurants: scored, room, aiUsed });

  } catch (err) {
    console.error('Recommend /group error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
