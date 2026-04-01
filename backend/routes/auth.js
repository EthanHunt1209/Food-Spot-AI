const express = require('express');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ── POST /api/auth/register ───────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, preferredCuisines, budgetPreference, spicePreference } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ success: false, message: 'Email already registered.' });

    const user = await User.create({
      name, email, password,
      preferredCuisines:  preferredCuisines  || [],
      budgetPreference:   budgetPreference   || 2,
      spicePreference:    spicePreference    || 3,
    });

    const token = signToken(user._id);
    res.status(201).json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const token = signToken(user._id);
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/auth/profile ─────────────────────────────────
router.get('/profile', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── PATCH /api/auth/preferences ──────────────────────────
router.patch('/preferences', protect, async (req, res) => {
  try {
    const { preferredCuisines, budgetPreference, spicePreference } = req.body;
    const updates = {};
    if (preferredCuisines  !== undefined) updates.preferredCuisines  = preferredCuisines;
    if (budgetPreference   !== undefined) updates.budgetPreference   = budgetPreference;
    if (spicePreference    !== undefined) updates.spicePreference    = spicePreference;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
