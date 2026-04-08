// routes/search.js — NEW unified search route
// GET /api/search?q=biryani&lat=16.51&lng=80.63
//
// Behaviour:
//   - If query matches a RESTAURANT NAME → returns that restaurant
//   - If query matches a FOOD ITEM NAME  → returns the item + which restaurant it's in
//   - Results are clearly typed: type: 'restaurant' | 'food_item'
//   - Distance from user is attached if lat/lng provided

const express    = require('express');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function distLabel(km) {
  if (km == null) return null;
  if (km < 0.1)  return 'Very close';
  if (km < 1)    return Math.round(km*1000) + ' m away';
  return km.toFixed(1) + ' km away';
}

// Highlight matched text with <mark> tags (for frontend)
function highlight(text, q) {
  if (!q) return text;
  return text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>');
}

// ════════════════════════════════════════════════════
// GET /api/search?q=biryani&lat=16.51&lng=80.63
// ════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { q, lat, lng } = req.query;
    if (!q || !q.trim())
      return res.status(400).json({ success: false, message: 'Query parameter q is required.' });

    const ql      = q.trim().toLowerCase();
    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;

    const allRests = await Restaurant.find();
    const results  = [];

    for (const r of allRests) {
      const dist = (userLat && userLng && r.lat && r.lng)
        ? +haversine(userLat, userLng, r.lat, r.lng).toFixed(2)
        : null;

      const distanceLabel = distLabel(dist);
      const restaurantBase = {
        restaurantId:   r._id,
        restaurantName: r.name,
        restaurantEmoji: r.emoji || '🍽️',
        address:        r.address,
        rating:         r.rating,
        priceLevel:     r.priceLevel,
        cuisines:       r.cuisines,
        tags:           r.tags,
        distanceKm:     dist,
        distanceLabel,
      };

      // ── 1. Restaurant name match ──────────────────────────
      const nameMatch    = r.name.toLowerCase().includes(ql);
      const cuisineMatch = (r.cuisines || []).some(c => c.toLowerCase().includes(ql));
      const tagMatch     = (r.tags     || []).some(t => t.toLowerCase().includes(ql));

      if (nameMatch || cuisineMatch || tagMatch) {
        results.push({
          type: 'restaurant',
          matchedOn: nameMatch ? 'name' : cuisineMatch ? 'cuisine' : 'tag',
          highlightedName: highlight(r.name, q),
          ...restaurantBase,
          // Full restaurant object for rendering
          fullData: r.toObject(),
        });
      }

      // ── 2. Food item name / description match ─────────────
      for (const section of (r.menu || [])) {
        for (const item of (section.items || [])) {
          const itemNameMatch = item.name.toLowerCase().includes(ql);
          const itemDescMatch = item.description.toLowerCase().includes(ql);

          if (itemNameMatch || itemDescMatch) {
            // Don't duplicate if this restaurant was already added as a restaurant result
            // — add a separate food_item result
            results.push({
              type:        'food_item',
              matchedOn:   itemNameMatch ? 'item_name' : 'item_description',
              // Item details
              itemName:    item.name,
              itemDesc:    item.description,
              itemPrice:   item.price,
              category:    section.category,
              // Highlighted versions for UI
              highlightedItemName: highlight(item.name, q),
              highlightedItemDesc: highlight(item.description, q),
              // Which restaurant this item is in
              ...restaurantBase,
            });
          }
        }
      }
    }

    // Sort: restaurant matches first, then food items; within each group sort by distance
    results.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'restaurant' ? -1 : 1;
      return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
    });

    res.json({
      success: true,
      query:   q,
      count:   results.length,
      restaurantCount: results.filter(r => r.type==='restaurant').length,
      foodItemCount:   results.filter(r => r.type==='food_item').length,
      results,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
