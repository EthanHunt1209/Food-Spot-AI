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
  priceLevel: { type: Number, required: true, min: 1, max: 3 },
  spiceLevel: { type: Number, required: true, min: 1, max: 5 },
  tags:       { type: [String], default: [] },
  address:    { type: String, default: '' },
  emoji:      { type: String, default: '🍽️' },
  menu:       [menuCategorySchema],

  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  },

  lat: { type: Number, default: null },
  lng: { type: Number, default: null },

}, { timestamps: true });

// Keep your existing full-text search
restaurantSchema.index({ name: 'text', cuisines: 'text', tags: 'text' });

// Add geospatial index
restaurantSchema.index({ location: '2dsphere' });

// Auto-sync lat/lng into GeoJSON location
restaurantSchema.pre('save', function (next) {
  if (this.lat != null && this.lng != null) {
    this.location = {
      type: 'Point',
      coordinates: [this.lng, this.lat],
    };
  }
  next();
});

module.exports = mongoose.model('Restaurant', restaurantSchema);