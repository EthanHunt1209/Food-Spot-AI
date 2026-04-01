const express    = require('express');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

// ── GET /api/restaurants/top ──────────────────────────────
router.get('/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const restaurants = await Restaurant.find().sort({ rating: -1 }).limit(limit);
    res.json({ success: true, restaurants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/restaurants/all ──────────────────────────────
router.get('/all', async (req, res) => {
  try {
    const restaurants = await Restaurant.find();
    res.json({ success: true, restaurants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/restaurants/search?q=biryani ────────────────
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const restaurants = q
      ? await Restaurant.find({ $text: { $search: q } }, { score: { $meta: 'textScore' } })
                        .sort({ score: { $meta: 'textScore' } })
      : await Restaurant.find().sort({ rating: -1 });
    res.json({ success: true, restaurants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/restaurants/:id ──────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    res.json({ success: true, restaurant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
