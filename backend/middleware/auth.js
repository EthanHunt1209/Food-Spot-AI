const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendOTPEmail, sendPasswordResetEmail } = require('../middleware/email');

const router = express.Router();

const signToken = (id) =>
  jwt.sign(
    { id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const safeUser = (user) => {
  const u = user.toObject ? user.toObject() : { ...user };
  delete u.password;
  delete u.emailOTP;
  delete u.emailOTPExpires;
  delete u.passwordResetToken;
  delete u.passwordResetExpires;
  return u;
};

// ── POST /api/auth/register ───────────────────────────────
// Direct registration without OTP (fallback / backward compat)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, preferredCuisines, budgetPreference, spicePreference } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing && existing.emailVerified) {
      return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });
    }

    let user;
    if (existing) {
      // Update and mark verified directly
      existing.name = name.trim();
      existing.password = password;
      existing.preferredCuisines = preferredCuisines || [];
      existing.budgetPreference = budgetPreference || 2;
      existing.spicePreference = spicePreference || 3;
      existing.emailVerified = true;
      existing.emailOTP = undefined;
      existing.emailOTPExpires = undefined;
      user = await existing.save();
    } else {
      user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password,
        preferredCuisines: preferredCuisines || [],
        budgetPreference: budgetPreference || 2,
        spicePreference: spicePreference || 3,
        emailVerified: true,
      });
    }

    const token = signToken(user._id);
    res.status(201).json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/send-otp ───────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { name, email, password, preferredCuisines, budgetPreference, spicePreference } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing && existing.emailVerified) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please login.' });
    }

    let user = existing || new User({
      name: name.trim(),
      email: normalizedEmail,
      password,
      preferredCuisines: preferredCuisines || [],
      budgetPreference: budgetPreference || 2,
      spicePreference: spicePreference || 3,
      emailVerified: false,
    });

    if (existing) {
      user.name = name.trim();
      user.password = password;
      user.preferredCuisines = preferredCuisines || [];
      user.budgetPreference = budgetPreference || 2;
      user.spicePreference = spicePreference || 3;
    }

    const otp = user.createEmailOTP();
    await user.save();

    try {
      await sendOTPEmail(user.email, user.name, otp);
    } catch (emailErr) {
      console.error('OTP email failed:', emailErr.message);

      const msg = emailErr.message || '';
      let friendlyMsg;

      if (msg.includes('RESEND_API_KEY') || msg.includes('not set')) {
        friendlyMsg = 'Email service not configured (RESEND_API_KEY missing). Add it in Render environment variables — get a free key at https://resend.com';
      } else if (msg.includes('timeout')) {
        friendlyMsg = 'Email service timed out. Please try again.';
      } else if (msg.includes('401') || msg.includes('403') || msg.includes('Invalid API')) {
        friendlyMsg = 'Invalid Resend API key. Check RESEND_API_KEY in your environment variables.';
      } else if (msg.includes('422') || msg.includes('domain') || msg.includes('from address')) {
        friendlyMsg = 'Email from-address not verified. On Resend free tier, use onboarding@resend.dev as the from address, or verify your domain.';
      } else {
        friendlyMsg = 'Email delivery failed: ' + msg;
      }

      return res.status(500).json({
        success: false,
        message: friendlyMsg,
        ...(process.env.NODE_ENV === 'development' ? { devOtp: otp } : {}),
      });
    }

    res.json({
      success: true,
      message: `Verification code sent to ${user.email}. Check your inbox and spam folder. It expires in 10 minutes.`,
    });
  } catch (err) {
    console.error('send-otp error:', err.message);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+emailOTP +emailOTPExpires +password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found. Please register first.' });
    }

    if (!user.verifyEmailOTP(otp.toString())) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new one.' });
    }

    user.emailVerified = true;
    user.emailOTP = undefined;
    user.emailOTPExpires = undefined;
    await user.save();

    const token = signToken(user._id);
    res.status(201).json({
      success: true,
      token,
      user: safeUser(user),
      message: 'Email verified successfully. Welcome to Food Spot AI!',
    });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (user.emailVerified === false) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email first. Check your inbox for the OTP.',
        needsVerification: true,
        email: normalizedEmail,
      });
    }

    const token = signToken(user._id);
    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/forgot-password ────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Always respond with success to prevent email enumeration
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account with that email exists, a reset link has been sent.',
      });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user.email, user.name, resetToken);
      res.json({ success: true, message: 'Password reset link sent! Check your email (and spam folder).' });
    } catch (emailErr) {
      console.error('Reset email failed:', emailErr.message);
      // Roll back token if email fails
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      res.status(500).json({
        success: false,
        message: 'Could not send reset email. ' + (
          emailErr.message.includes('not configured')
            ? 'Email service is not configured on the server.'
            : 'Email delivery failed. Please try again later.'
        ),
      });
    }
  } catch (err) {
    console.error('forgot-password error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token, email and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      email: normalizedEmail,
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires +password');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired. Please request a new one.' });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    console.error('reset-password error:', err.message);
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
    if (budgetPreference !== undefined) updates.budgetPreference = budgetPreference;
    if (spicePreference !== undefined) updates.spicePreference = spicePreference;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;