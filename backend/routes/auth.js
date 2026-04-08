// routes/auth.js — Auth route handlers
// Imports protect FROM middleware/auth.js (not the other way around)

const express = require('express');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const User    = require('../models/User');
const { protect }                          = require('../middleware/auth');   // ← from middleware
const { sendOTPEmail, sendPasswordResetEmail } = require('../middleware/email');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const safeUser = (user) => {
  const u = user.toObject ? user.toObject() : { ...user };
  delete u.password;
  delete u.emailOTP;
  delete u.emailOTPExpires;
  delete u.passwordResetToken;
  delete u.passwordResetExpires;
  return u;
};

// ── POST /api/auth/send-otp ───────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { name, email, password, preferredCuisines, budgetPreference, spicePreference } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing && existing.emailVerified)
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

    let user = existing || new User({
      name: name.trim(), email: email.toLowerCase().trim(), password,
      preferredCuisines: preferredCuisines || [], budgetPreference: budgetPreference || 2,
      spicePreference: spicePreference || 3, emailVerified: false,
    });
    if (existing) {
      user.name = name.trim(); user.password = password;
      user.preferredCuisines = preferredCuisines || [];
      user.budgetPreference  = budgetPreference  || 2;
      user.spicePreference   = spicePreference   || 3;
    }

    const otp = user.createEmailOTP();
    await user.save();
    await sendOTPEmail(email, name, otp);
    res.json({ success: true, message: `OTP sent to ${email}. It expires in 10 minutes.` });
  } catch (err) {
    console.error('send-otp error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Failed to send OTP.' });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+emailOTP +emailOTPExpires +password');
    if (!user)
      return res.status(404).json({ success: false, message: 'Account not found. Please register first.' });
    if (!user.verifyEmailOTP(otp.toString()))
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please try again.' });

    user.emailVerified = true; user.emailOTP = undefined; user.emailOTPExpires = undefined;
    await user.save();
    const token = signToken(user._id);
    res.status(201).json({ success: true, token, user: safeUser(user), message: 'Email verified! Welcome to FoodSpot AI.' });
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
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    if (!user.emailVerified)
      return res.status(403).json({ success: false, message: 'Please verify your email first. Check your inbox for the OTP.', needsVerification: true, email });
    const token = signToken(user._id);
    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    await sendPasswordResetEmail(user.email, user.name, resetToken);
    res.json({ success: true, message: 'Password reset link sent! Check your email.' });
  } catch (err) {
    console.error('forgot-password error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send reset email. ' + err.message });
  }
});

// ── POST /api/auth/reset-password ────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;
    if (!token || !email || !newPassword)
      return res.status(400).json({ success: false, message: 'Token, email and new password are required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      email: email.toLowerCase(), passwordResetToken: hashedToken, passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires +password');
    if (!user)
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired.' });
    user.password = newPassword; user.passwordResetToken = undefined; user.passwordResetExpires = undefined;
    await user.save();
    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/auth/profile ─────────────────────────────────
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('likedRestaurants', 'name emoji address');
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/auth/preferences ──────────────────────────
router.patch('/preferences', protect, async (req, res) => {
  try {
    const { preferredCuisines, budgetPreference, spicePreference } = req.body;
    const updates = {};
    if (preferredCuisines !== undefined) updates.preferredCuisines = preferredCuisines;
    if (budgetPreference  !== undefined) updates.budgetPreference  = budgetPreference;
    if (spicePreference   !== undefined) updates.spicePreference   = spicePreference;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
