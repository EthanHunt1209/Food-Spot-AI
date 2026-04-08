const express    = require('express');
const GroupRoom  = require('../models/GroupRoom');
const Restaurant = require('../models/Restaurant');
const Session    = require('../models/Session');
const { protect } = require('../middleware/auth');
const { scoreForGroup, aggregatePreferences } = require('../middleware/recommendEngine');

const router = express.Router();

function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── POST /api/group/create ────────────────────────────────
router.post('/create', protect, async (req, res) => {
  try {
    const user = req.user;
    let code;
    // Ensure unique code
    do { code = genCode(); } while (await GroupRoom.findOne({ code }));

    const room = await GroupRoom.create({
      code,
      host: user._id,
      members: [{
        userId: user._id,
        name:   user.name,
        preferredCuisines: user.preferredCuisines,
        budgetPreference:  user.budgetPreference,
        spicePreference:   user.spicePreference,
      }],
    });

    res.status(201).json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/group/join ──────────────────────────────────
router.post('/join', protect, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Room code is required.' });

    const room = await GroupRoom.findOne({ code: code.toUpperCase(), active: true });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found or expired.' });

    // Check if already a member
    const already = room.members.some(m => String(m.userId) === String(req.user._id));
    if (!already) {
      room.members.push({
        userId: req.user._id,
        name:   req.user.name,
        preferredCuisines: req.user.preferredCuisines,
        budgetPreference:  req.user.budgetPreference,
        spicePreference:   req.user.spicePreference,
      });
      await room.save();
    }

    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/group/:code ──────────────────────────────────
router.get('/:code', protect, async (req, res) => {
  try {
    const room = await GroupRoom.findOne({ code: req.params.code.toUpperCase(), active: true });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/group/:code/kick ────────────────────────────
router.post('/:code/kick', protect, async (req, res) => {
  try {
    const room = await GroupRoom.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    if (String(room.host) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Only the host can remove members.' });

    room.members = room.members.filter(m => String(m.userId) !== req.body.userId);
    await room.save();
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/group/recommend ─────────────────────────────
router.post('/recommend', protect, async (req, res) => {
  try {
    const { code } = req.body;
    const room = await GroupRoom.findOne({ code: code.toUpperCase(), active: true });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });

    const members = room.members.map(m => ({
      preferredCuisines: m.preferredCuisines,
      budgetPreference:  m.budgetPreference,
      spicePreference:   m.spicePreference,
    }));

    const restaurants = await Restaurant.find();
    const scored = restaurants
      .map(r => {
        const { avg, scores } = scoreForGroup(r, members);
        return { ...r.toObject(), matchScore: avg, memberScores: scores };
      })
      .sort((a, b) => b.matchScore - a.matchScore);

    // Save session for each member
    const aggPref = aggregatePreferences(members);
    const sessionPromises = room.members.map(m =>
      Session.create({
        userId: m.userId,
        mode: 'group',
        groupRoomCode: room.code,
        groupMembers: room.members.map(x => x.userId),
        filters: { cuisines: aggPref.preferredCuisines, budget: aggPref.budgetPreference, spice: aggPref.spicePreference },
        recommendedRestaurants: scored.map(r => r._id),
      })
    );
    await Promise.all(sessionPromises);

    res.json({ success: true, restaurants: scored, room });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/group/:code/close ─────────────────────────
router.delete('/:code/close', protect, async (req, res) => {
  try {
    const room = await GroupRoom.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    if (String(room.host) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Only the host can close the room.' });
    room.active = false;
    await room.save();
    res.json({ success: true, message: 'Room closed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
