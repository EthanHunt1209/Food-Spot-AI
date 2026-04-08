const express = require('express');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

// Returns distance in kilometres
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Extract latitude and longitude safely from restaurant document
function getRestaurantCoords(restaurant) {
  if (
    restaurant.location &&
    restaurant.location.type === 'Point' &&
    Array.isArray(restaurant.location.coordinates) &&
    restaurant.location.coordinates.length === 2
  ) {
    return {
      lng: restaurant.location.coordinates[0],
      lat: restaurant.location.coordinates[1],
    };
  }

  if (restaurant.lat != null && restaurant.lng != null) {
    return {
      lat: restaurant.lat,
      lng: restaurant.lng,
    };
  }

  return null;
}

// GET /api/location/nearby?lat=16.51&lng=80.63&radius=5
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        message: 'lat and lng query parameters are required.',
      });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const maxKm = parseFloat(radius) || 10;

    if (Number.isNaN(userLat) || Number.isNaN(userLng)) {
      return res.status(400).json({
        success: false,
        message: 'lat and lng must be valid numbers.',
      });
    }

    let restaurants = [];

    try {
      restaurants = await Restaurant.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [userLng, userLat],
            },
            $maxDistance: maxKm * 1000,
          },
        },
      });
    } catch (error) {
      const allRestaurants = await Restaurant.find();

      restaurants = allRestaurants.filter((restaurant) => {
        const coords = getRestaurantCoords(restaurant);
        if (!coords) return false;

        const dist = haversine(userLat, userLng, coords.lat, coords.lng);
        return dist <= maxKm;
      });
    }

    const withDistance = restaurants
      .map((restaurant) => {
        const coords = getRestaurantCoords(restaurant);
        if (!coords) return null;

        const dist = haversine(userLat, userLng, coords.lat, coords.lng);

        return {
          ...restaurant.toObject(),
          distanceKm: Number(dist.toFixed(2)),
          distanceLabel:
            dist < 1
              ? `${Math.round(dist * 1000)} m`
              : `${dist.toFixed(1)} km`,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({
      success: true,
      userLocation: { lat: userLat, lng: userLng },
      radius: maxKm,
      count: withDistance.length,
      restaurants: withDistance,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
});

// GET /api/location/all-with-distance?lat=16.51&lng=80.63
router.get('/all-with-distance', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const restaurants = await Restaurant.find();

    let userLat = null;
    let userLng = null;

    if (lat != null && lng != null) {
      userLat = parseFloat(lat);
      userLng = parseFloat(lng);

      if (Number.isNaN(userLat) || Number.isNaN(userLng)) {
        return res.status(400).json({
          success: false,
          message: 'lat and lng must be valid numbers.',
        });
      }
    }

    const withDistance = restaurants
      .map((restaurant) => {
        const coords = getRestaurantCoords(restaurant);

        if (!coords) {
          return {
            ...restaurant.toObject(),
            distanceKm: null,
            distanceLabel: null,
          };
        }

        if (userLat == null || userLng == null) {
          return {
            ...restaurant.toObject(),
            distanceKm: null,
            distanceLabel: null,
          };
        }

        const dist = haversine(userLat, userLng, coords.lat, coords.lng);

        return {
          ...restaurant.toObject(),
          distanceKm: Number(dist.toFixed(2)),
          distanceLabel:
            dist < 1
              ? `${Math.round(dist * 1000)} m`
              : `${dist.toFixed(1)} km`,
        };
      })
      .sort((a, b) => {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });

    res.json({
      success: true,
      restaurants: withDistance,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
});

module.exports = router;