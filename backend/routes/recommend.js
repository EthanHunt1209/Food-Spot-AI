// routes/recommend.js — UPDATED
// Key changes:
//   1. Cold-start (first-time user): restaurants sorted by community feedback score (best first → last)
//   2. Returning user: AI-trained from past feedback + filters, AI re-ranking enabled
//   3. submode='new': excludes already-visited restaurants
//   4. submode='surprise': fully AI-picked random high-rated restaurant
//   5. Group: all members' preferences sent to AI for best combined recommendation

const express    = require('express');
const Restaurant = require('../models/Restaurant');
const Session    = require('../models/Session');
const Feedback   = require('../models/Feedback');
const { protect } = require('../middleware/auth');
const {
  scoreRestaurant,
  scoreForGroup,
  aggregatePreferences,
  aiRankRestaurants,
  isFirstTimeUser,
} = require('../middleware/recommendEngine');

const router = express.Router();

// ── Attach community scores (avg user feedback rating per restaurant) ──
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
      // avgFeedbackRating alias for frontend compatibility
      avgFeedbackRating: counts[id] ? +(totals[id] / counts[id]).toFixed(1) : null,
    };
  });
}

// ═══════════════════════════════════════════════════════════
// POST /api/recommend/personal
// Body: { cuisines[], budget, spice, vegPreference, submode, userLat, userLng }
//
// Flow:
//   Cold-start user → sort by community feedback desc, no AI
//   Returning user  → score by preferences + feedback learning + AI re-rank
//   submode=surprise → random pick from unvisited high-rated pool
//   submode=new      → exclude already-visited restaurants
// ═══════════════════════════════════════════════════════════
router.post('/personal', protect, async (req, res) => {
  try {
    const {
      cuisines, budget, spice,
      vegPreference, submode = 'regular',
      userLat, userLng
    } = req.body;

    const user = req.user;
    const userLocation = (userLat && userLng)
      ? { lat: parseFloat(userLat), lng: parseFloat(userLng) }
      : null;

    // ── Cold-start detection ─────────────────────────────
    const coldStart = isFirstTimeUser(user);

    // Build preference object merging request params with user profile
    const pref = {
      preferredCuisines: cuisines?.length ? cuisines : (user.preferredCuisines || []),
      budgetPreference:  budget  || user.budgetPreference  || 2,
      spicePreference:   spice   || user.spicePreference   || 3,
      vegPreference:     vegPreference || user.vegPreference || 'any',
    };

    const dislikedIds = (user.dislikedRestaurants || []).map(String);
    let restaurants = await Restaurant.find();

    // ── submode: new — exclude already visited ───────────
    if (submode === 'new') {
      const visitedIds = (
        await Session.find({
          userId: user._id,
          selectedRestaurant: { $ne: null }
        }).distinct('selectedRestaurant')
      ).map(String);

      restaurants = restaurants.filter(r => !visitedIds.includes(String(r._id)));
    }

    // ── submode: surprise — random high-rated pick ───────
    if (submode === 'surprise') {
      // Filter out disliked, prefer rating >= 4.0
      let visitedIds = [];
      try {
        visitedIds = (
          await Session.find({
            userId: user._id,
            selectedRestaurant: { $ne: null }
          }).distinct('selectedRestaurant')
        ).map(String);
      } catch (_) {}

      // Prefer unvisited, high-rated
      let pool = restaurants.filter(r =>
        r.rating >= 4.0 &&
        !dislikedIds.includes(String(r._id)) &&
        !visitedIds.includes(String(r._id))
      );
      // Fallback: include visited if not enough options
      if (pool.length < 2) {
        pool = restaurants.filter(r =>
          r.rating >= 4.0 && !dislikedIds.includes(String(r._id))
        );
      }
      if (!pool.length) pool = restaurants.filter(r => !dislikedIds.includes(String(r._id)));
      if (!pool.length) pool = restaurants;

      const picked = pool[Math.floor(Math.random() * pool.length)];
      if (!picked) return res.json({ success: true, restaurants: [], session: null, isColdStart: coldStart });

      const [withScore] = await attachCommunityScores([picked]);
      withScore.matchScore = scoreRestaurant(picked, pref, userLocation);

      // Try AI for a reason/explanation
      try {
        const userContext = {
          preferredCuisines: pref.preferredCuisines,
          budgetPreference:  pref.budgetPreference,
          spicePreference:   pref.spicePreference,
        };
        const aiRanked = await aiRankRestaurants([withScore], userContext, false);
        if (aiRanked?.length) withScore.aiReason = aiRanked[0].aiReason || 'AI surprise pick — something you haven\'t tried yet!';
      } catch (_) {}

      const session = await Session.create({
        userId: user._id,
        mode:   'surprise',
        filters: {
          cuisines: pref.preferredCuisines,
          budget:   pref.budgetPreference,
          spice:    pref.spicePreference,
          submode,
        },
        recommendedRestaurants: [picked._id],
      });

      return res.json({
        success: true,
        restaurants: [withScore],
        session,
        isColdStart: coldStart,
        aiUsed: false,
      });
    }

    // ── Attach community scores to all restaurants ───────
    const withCommunity = await attachCommunityScores(restaurants);

    // ── Filter out disliked ──────────────────────────────
    let scored = withCommunity.filter(r => !dislikedIds.includes(String(r._id)));

    // ── COLD-START: Sort by community feedback (best → last) ──
    if (coldStart) {
      // Apply veg hard filter first if user set a veg preference during signup
      if (pref.vegPreference === 'veg') {
        // Separate veg-compatible and non-veg-only restaurants
        const vegFriendly = scored.filter(r => (r.tags || []).map(t => t.toLowerCase()).includes('veg'));
        const notVeg      = scored.filter(r => !(r.tags || []).map(t => t.toLowerCase()).includes('veg'));
        // Veg ones first, sorted by community score
        scored = [
          ...vegFriendly.sort((a, b) => (b.communityScore || b.rating) - (a.communityScore || a.rating)),
          ...notVeg.sort((a, b)      => (b.communityScore || b.rating) - (a.communityScore || a.rating)),
        ];
      } else {
        // Sort all by community feedback score desc, then by raw restaurant rating
        scored.sort((a, b) => {
          const aScore = a.communityScore || a.rating || 0;
          const bScore = b.communityScore || b.rating || 0;
          return bScore - aScore;
        });
      }
      // Add a basic matchScore so frontend % display works
      scored = scored.map(r => ({
        ...r,
        matchScore: scoreRestaurant(r, pref, userLocation),
      }));

    } else {
      // ── RETURNING USER: AI-trained recommendations ───────
      // Score restaurants using preference engine
      scored = scored.map(r => ({
        ...r,
        matchScore: scoreRestaurant(r, pref, userLocation),
      }));

      // Sort by matchScore desc, then by community score
      scored.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.communityScore || b.rating) - (a.communityScore || a.rating);
      });

      // ── AI Re-ranking using Claude ─────────────────────
      // Build rich context from past feedback
      const userFeedbacks = await Feedback.find({ userId: user._id })
        .populate('restaurantId', 'name cuisines priceLevel spiceLevel')
        .sort({ createdAt: -1 })
        .limit(20);

      const userContext = {
        preferredCuisines:     pref.preferredCuisines,
        budgetPreference:      pref.budgetPreference,
        spicePreference:       pref.spicePreference,
        vegPreference:         pref.vegPreference,
        userLocation,
        likedRestaurantIds:    (user.likedRestaurants    || []).map(String),
        dislikedRestaurantIds: dislikedIds,
        // Pass feedback history so AI can learn patterns
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

    // ── Save session ─────────────────────────────────────
    const session = await Session.create({
      userId: user._id,
      mode:   coldStart ? 'first-time' : 'personalized',
      filters: {
        cuisines: pref.preferredCuisines,
        budget:   pref.budgetPreference,
        spice:    pref.spicePreference,
        submode,
      },
      recommendedRestaurants: scored.map(r => r._id),
    });

    res.json({
      success:     true,
      restaurants: scored,
      session,
      isColdStart: coldStart,
      aiUsed:      !coldStart,
    });

  } catch (err) {
    console.error('Recommend personal error:', err.message);
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
      .sort({ createdAt: -1 })
      .limit(30);
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
    }).populate('selectedRestaurant', 'name address emoji cuisines rating priceLevel spiceLevel menu');

    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/recommend/group ─────────────────────────────
// Group recommendations: considers ALL members' preferences
// AI re-ranks to find best overall satisfaction for the group
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

    // Score each restaurant for the group
    let scored = withCommunity.map(r => {
      const { avg, scores } = scoreForGroup(r, members);
      return {
        ...r,
        matchScore:   avg,
        memberScores: scores,
      };
    }).sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return (b.communityScore || b.rating) - (a.communityScore || a.rating);
    });

    // ── AI Re-ranking for group ────────────────────────────
    // Pass full member profile so AI can reason across all preferences
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

    let aiUsed = false;
    const aiRanked = await aiRankRestaurants(scored, groupContext, true);
    if (aiRanked) {
      scored = aiRanked;
      aiUsed = true;
    }

    // Save sessions for each group member
    await Promise.all(room.members.map(m =>
      Session.create({
        userId:        m.userId,
        mode:          'group',
        groupRoomCode: room.code,
        groupMembers:  room.members.map(x => x.userId),
        filters: {
          cuisines: aggPref.preferredCuisines,
          budget:   aggPref.budgetPreference,
          spice:    aggPref.spicePreference,
        },
        recommendedRestaurants: scored.map(r => r._id),
      })
    ));

    res.json({
      success:     true,
      restaurants: scored,
      room,
      aiUsed,
    });

  } catch (err) {
    console.error('Recommend group error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;