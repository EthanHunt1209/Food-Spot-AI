// routes/location.js  — NEW FILE
// Add to server.js:  app.use('/api/location', require('./routes/location'));

const express    = require('express');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

// ── Haversine distance formula ─────────────────────────────
// Returns distance in kilometres between two lat/lng points
function haversine(lat1, lng1, lat2, lng2) {
  const R   = 6371;                          // Earth radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── GET /api/location/nearby?lat=16.51&lng=80.63&radius=5 ──
// Returns all restaurants sorted by distance, with km attached
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'lat and lng query parameters are required.',
      });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const maxKm   = parseFloat(radius) || 10;   // default 10 km radius

    // Option A — MongoDB $near (uses 2dsphere index, very fast)
    // This returns restaurants within maxKm, sorted by distance from MongoDB
    let restaurants;
    try {
      restaurants = await Restaurant.find({
        location: {
          $near: {
            $geometry:    { type: 'Point', coordinates: [userLng, userLat] },
            $maxDistance: maxKm * 1000,   // metres
          },
        },
      });
    } catch {
      // Option B — Fallback: fetch all and filter in JS
      // (use this if 2dsphere index hasn't been built yet)
      restaurants = await Restaurant.find();
    }

    // Attach human-readable distance to each restaurant
    const withDistance = restaurants.map(r => {
      const dist = haversine(userLat, userLng, r.lat, r.lng);
      return {
        ...r.toObject(),
        distanceKm:   +dist.toFixed(2),
        distanceLabel: dist < 1
          ? Math.round(dist * 1000) + ' m'
          : dist.toFixed(1) + ' km',
      };
    });

    // Sort by distance (closest first)
    withDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({
      success: true,
      userLocation: { lat: userLat, lng: userLng },
      radius: maxKm,
      count: withDistance.length,
      restaurants: withDistance,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/location/all-with-distance?lat=16.51&lng=80.63 ──
// Returns ALL restaurants with distance attached (no radius filter)
router.get('/all-with-distance', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const restaurants  = await Restaurant.find();

    const withDistance = restaurants.map(r => {
      const dist = (lat && lng)
        ? haversine(parseFloat(lat), parseFloat(lng), r.lat, r.lng)
        : null;
      return {
        ...r.toObject(),
        distanceKm:   dist != null ? +dist.toFixed(2) : null,
        distanceLabel: dist != null
          ? dist < 1
            ? Math.round(dist * 1000) + ' m'
            : dist.toFixed(1) + ' km'
          : null,
      };
    });

    if (lat && lng) {
      withDistance.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    }

    res.json({ success: true, restaurants: withDistance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
