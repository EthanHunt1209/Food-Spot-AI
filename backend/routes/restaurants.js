const express = require('express');
const mongoose = require('mongoose');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

// GET /api/restaurants/top?limit=10
router.get('/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const restaurants = await Restaurant.find()
      .sort({ rating: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: restaurants.length,
      restaurants,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch top restaurants.',
    });
  }
});

// GET /api/restaurants/all
router.get('/all', async (req, res) => {
  try {
    const restaurants = await Restaurant.find().sort({ rating: -1, name: 1 });

    res.json({
      success: true,
      count: restaurants.length,
      restaurants,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch restaurants.',
    });
  }
});

// GET /api/restaurants/search?q=biryani
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();

    let restaurants;

    if (q) {
      try {
        restaurants = await Restaurant.find(
          { $text: { $search: q } },
          { score: { $meta: 'textScore' } }
        ).sort({ score: { $meta: 'textScore' } });
      } catch (textError) {
        restaurants = await Restaurant.find({
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { cuisine: { $regex: q, $options: 'i' } },
            { address: { $regex: q, $options: 'i' } },
          ],
        }).sort({ rating: -1, name: 1 });
      }
    } else {
      restaurants = await Restaurant.find().sort({ rating: -1, name: 1 });
    }

    res.json({
      success: true,
      count: restaurants.length,
      restaurants,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to search restaurants.',
    });
  }
});

// GET /api/restaurants/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid restaurant ID.',
      });
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found.',
      });
    }

    res.json({
      success: true,
      restaurant,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch restaurant.',
    });
  }
});

module.exports = router;