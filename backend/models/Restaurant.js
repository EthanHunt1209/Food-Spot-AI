const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const menuCategorySchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    items: { type: [menuItemSchema], default: [] },
  },
  { _id: false }
);

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    cuisines: {
      type: [String],
      required: true,
      default: [],
    },

    rating: {
      type: Number,
      required: true,
      min: 0,
      max: 5,
    },

    priceLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 3,
    },

    spiceLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    tags: {
      type: [String],
      default: [],
    },

    address: {
      type: String,
      default: '',
      trim: true,
    },

    emoji: {
      type: String,
      default: '🍽️',
    },

    menu: {
      type: [menuCategorySchema],
      default: [],
    },

    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: [0, 0],
        validate: {
          validator: function (value) {
            return Array.isArray(value) && value.length === 2;
          },
          message: 'Location coordinates must be [lng, lat].',
        },
      },
    },

    lat: {
      type: Number,
      default: null,
    },

    lng: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

// Full-text search index
restaurantSchema.index({
  name: 'text',
  cuisines: 'text',
  tags: 'text',
  address: 'text',
});

// Geospatial index
restaurantSchema.index({ location: '2dsphere' });

// Auto-sync lat/lng -> location.coordinates
restaurantSchema.pre('save', function (next) {
  if (
    this.lat != null &&
    this.lng != null &&
    !Number.isNaN(this.lat) &&
    !Number.isNaN(this.lng)
  ) {
    this.location = {
      type: 'Point',
      coordinates: [this.lng, this.lat],
    };
  } else if (
    this.location &&
    Array.isArray(this.location.coordinates) &&
    this.location.coordinates.length === 2
  ) {
    this.lng = this.location.coordinates[0];
    this.lat = this.location.coordinates[1];
  }

  next();
});

module.exports = mongoose.model('Restaurant', restaurantSchema);