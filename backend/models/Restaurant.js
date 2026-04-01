const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  price:       { type: Number, required: true },
}, { _id: false });

const menuCategorySchema = new mongoose.Schema({
  category: { type: String, required: true },
  items:    [menuItemSchema],
}, { _id: false });

const restaurantSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  cuisines:   { type: [String], required: true },
  rating:     { type: Number, required: true, min: 0, max: 5 },
  priceLevel: { type: Number, required: true, min: 1, max: 3 },  // 1=₹  2=₹₹  3=₹₹₹
  spiceLevel: { type: Number, required: true, min: 1, max: 5 },
  tags:       { type: [String], default: [] },   // veg, nonveg, budget, rooftop, etc.
  address:    { type: String, default: '' },
  emoji:      { type: String, default: '🍽️' },
  menu:       [menuCategorySchema],
}, { timestamps: true });

// Full-text search index
restaurantSchema.index({ name: 'text', cuisines: 'text', tags: 'text' });

module.exports = mongoose.model('Restaurant', restaurantSchema);
