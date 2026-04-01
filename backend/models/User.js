const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },

  // Learned preferences (updated after feedback)
  preferredCuisines:   { type: [String], default: [] },
  budgetPreference:    { type: Number, default: 2, min: 1, max: 3 },
  spicePreference:     { type: Number, default: 3, min: 1, max: 5 },
  likedRestaurants:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],
  dislikedRestaurants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],
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

// Never expose password
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
