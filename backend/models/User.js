const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },

  // Learned preferences
  preferredCuisines: { type: [String], default: [] },
  budgetPreference: { type: Number, default: 2, min: 1, max: 3 },
  spicePreference: { type: Number, default: 3, min: 1, max: 5 },
  likedRestaurants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],
  dislikedRestaurants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],

  // Email verification
  emailVerified: { type: Boolean, default: false },
  emailOTP: { type: String, select: false },
  emailOTPExpires: { type: Date, select: false },

  // Password reset
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false }
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Generate 6-digit OTP, store hashed version, return plain OTP
userSchema.methods.createEmailOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.emailOTP = crypto.createHash('sha256').update(otp).digest('hex');
  this.emailOTPExpires = new Date(Date.now() + 10 * 60 * 1000);
  return otp;
};

// Verify OTP

userSchema.methods.verifyEmailOTP = function (plain) {
  if (!this.emailOTP || !this.emailOTPExpires) return false;
  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  return this.emailOTP === hash && this.emailOTPExpires > new Date();
};

// Generate password reset token, store hashed version, return plain token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
  return resetToken;
};

// Never expose sensitive fields
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailOTP;
  delete obj.emailOTPExpires;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);