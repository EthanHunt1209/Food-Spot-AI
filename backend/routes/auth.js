// backend/routes/auth.js
// All email sending is handled by EmailJS on the frontend.
// Backend only stores/verifies OTPs and tokens — never sends emails itself.

const express = require('express');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const safeUser = (user) => {
  const u = user.toObject ? user.toObject() : { ...user };
  delete u.password;
  delete u.emailOTP;
  delete u.emailOTPExpires;
  delete u.passwordResetToken;
  delete u.passwordResetExpires;
  return u;
};

// ── POST /api/auth/register ──────────────────────────────
// Direct signup without OTP — used as fallback from frontend
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, preferredCuisines, budgetPreference, spicePreference } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing && existing.emailVerified)
      return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });

    let user;
    if (existing) {
      existing.name              = name.trim();
      existing.password          = password;
      existing.preferredCuisines = preferredCuisines || [];
      existing.budgetPreference  = budgetPreference  || 2;
      existing.spicePreference   = spicePreference   || 3;
      existing.emailVerified     = true;
      existing.emailOTP          = undefined;
      existing.emailOTPExpires   = undefined;
      user = await existing.save();
    } else {
      user = await User.create({
        name: name.trim(), email: normalizedEmail, password,
        preferredCuisines: preferredCuisines || [],
        budgetPreference:  budgetPreference  || 2,
        spicePreference:   spicePreference   || 3,
        emailVerified: true,
      });
    }

    res.status(201).json({ success: true, token: signToken(user._id), user: safeUser(user) });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/prepare-otp ───────────────────────────
// Creates user record + hashed OTP in DB.
// Returns plain OTP to frontend so EmailJS can email it.
// Backend never sends any email.
router.post('/prepare-otp', async (req, res) => {
  try {
    const { name, email, password, preferredCuisines, budgetPreference, spicePreference } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing && existing.emailVerified)
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please login.' });

    let user = existing || new User({
      name: name.trim(), email: normalizedEmail, password,
      preferredCuisines: preferredCuisines || [],
      budgetPreference:  budgetPreference  || 2,
      spicePreference:   spicePreference   || 3,
      emailVerified: false,
    });

    if (existing) {
      user.name              = name.trim();
      user.password          = password;
      user.preferredCuisines = preferredCuisines || [];
      user.budgetPreference  = budgetPreference  || 2;
      user.spicePreference   = spicePreference   || 3;
    }

    const otp = user.createEmailOTP();
    await user.save();

    // Return plain OTP — frontend (EmailJS) will email it to the user
    res.json({ success: true, otp });
  } catch (err) {
    console.error('prepare-otp error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/verify-otp ────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+emailOTP +emailOTPExpires +password');

    if (!user)
      return res.status(404).json({ success: false, message: 'Account not found. Please register first.' });

    if (!user.verifyEmailOTP(otp.toString()))
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new one.' });

    user.emailVerified   = true;
    user.emailOTP        = undefined;
    user.emailOTPExpires = undefined;
    await user.save();

    res.status(201).json({ success: true, token: signToken(user._id), user: safeUser(user) });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/login ─────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    if (user.emailVerified === false)
      return res.status(403).json({
        success: false,
        message: 'Please verify your email first. Check your inbox for the OTP.',
        needsVerification: true,
        email: email.toLowerCase().trim(),
      });

    res.json({ success: true, token: signToken(user._id), user: safeUser(user) });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/prepare-reset ─────────────────────────
// Generates reset token, returns the full reset link + user name.
// Frontend (EmailJS) emails it — backend never touches email.
router.post('/prepare-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ success: false, message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      // Don't reveal that email doesn't exist
      return res.json({ success: true, exists: false });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const resetLink   = `${frontendUrl}/reset-password.html?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    // Return name + reset link — frontend (EmailJS) will email it
    res.json({ success: true, exists: true, name: user.name, resetLink });
  } catch (err) {
    console.error('prepare-reset error:', err.message);
    res.status(500).json({ success: false, message: err.message });
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
      email: email.toLowerCase().trim(),
      passwordResetToken:   hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires +password');

    if (!user)
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired. Please request a new one.' });

    user.password             = newPassword;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    console.error('reset-password error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/auth/profile ────────────────────────────────
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('likedRestaurants', 'name emoji address');
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/auth/preferences ─────────────────────────
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