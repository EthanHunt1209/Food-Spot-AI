// middleware/recommendEngine.js
// COMPLETE VERSION — replace your existing file with this one
// Exports: scoreRestaurant, scoreForGroup, aggregatePreferences,
//          applyFeedbackLearning, aiRankRestaurants, isFirstTimeUser,
//          distanceScore, vegScore, MAX_SCORE

// ── Score constants ────────────────────────────────────────
const MAX_SCORE_BASE = 2.5 * 2 + 1.5 * 2 + 1.2 * 3 + 5; // 16.6
const MAX_SCORE      = MAX_SCORE_BASE + 2.0 + 1.5;        // 20.1

// ── Haversine distance (km) ────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos((lat1 * Math.PI) / 180)
             * Math.cos((lat2 * Math.PI) / 180)
             * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Distance score: 2.0 pts at 0 km → 0 pts at 10+ km ────
function distanceScore(rLat, rLng, uLat, uLng) {
  if (!uLat || !uLng || !rLat || !rLng) return 0;
  const km = haversineKm(uLat, uLng, rLat, rLng);
  if (km === null || km >= 10) return 0;
  return +(2.0 * (1 - km / 10)).toFixed(2);
}

// ── Veg/non-veg compliance score ─────────────────────────
function vegScore(restaurant, pref) {
  if (!pref.vegPreference || pref.vegPreference === 'any') return 0;
  const tags = (restaurant.tags || []).map(t => t.toLowerCase());
  if (pref.vegPreference === 'veg'    && tags.includes('veg'))    return 1.5;
  if (pref.vegPreference === 'nonveg' && tags.includes('nonveg')) return 1.5;
  // Hard penalty: strict veg user + nonveg-only restaurant
  if (pref.vegPreference === 'veg' && tags.includes('nonveg') && !tags.includes('veg')) return -5;
  return 0;
}

// ── Main per-restaurant score (0–100) ─────────────────────
function scoreRestaurant(restaurant, pref, userLocation = null) {
  let s = 0;

  // 1. Cuisine match — up to 5.0 pts
  const prefLower = (pref.preferredCuisines || []).map(c => c.toLowerCase());
  const hits = (restaurant.cuisines || [])
    .filter(c => prefLower.includes(c.toLowerCase())).length;
  s += Math.min(hits, 2) * 2.5;

  // 2. Budget closeness — up to 3.0 pts
  s += Math.max(0, 2 - Math.abs(restaurant.priceLevel - (pref.budgetPreference || 2))) * 1.5;

  // 3. Spice closeness — up to 3.6 pts
  s += Math.max(0, 3 - Math.abs(restaurant.spiceLevel - (pref.spicePreference || 3))) * 1.2;

  // 4. Restaurant rating — up to 5.0 pts
  s += restaurant.rating || 0;

  // 5. Distance bonus — up to 2.0 pts
  if (userLocation) {
    s += distanceScore(restaurant.lat, restaurant.lng, userLocation.lat, userLocation.lng);
  }

  // 6. Veg/non-veg match — up to 1.5 pts (or −5 for hard mismatch)
  s += vegScore(restaurant, pref);

  return Math.round((Math.max(s, 0) / MAX_SCORE) * 100);
}

// ── Group scoring ─────────────────────────────────────────
// Returns { avg, scores[] } where avg is 0–100
function scoreForGroup(restaurant, members, userLocation = null) {
  if (!members || members.length === 0) return { avg: 0, scores: [] };
  const scores = members.map(m => scoreRestaurant(restaurant, m, userLocation));
  const avg    = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { avg, scores };
}

// ── Aggregate group member preferences ────────────────────
function aggregatePreferences(members) {
  if (!members || members.length === 0) {
    return { preferredCuisines: [], budgetPreference: 2, spicePreference: 3, vegPreference: 'any' };
  }
  const allCuisines = [...new Set(members.flatMap(m => m.preferredCuisines || []))];
  const avgBudget   = Math.round(members.reduce((s, m) => s + (m.budgetPreference || 2), 0) / members.length);
  const avgSpice    = Math.round(members.reduce((s, m) => s + (m.spicePreference  || 3), 0) / members.length);
  // Veg wins if ANY member is strict veg
  const vegPref = members.some(m => m.vegPreference === 'veg') ? 'veg' : 'any';
  return { preferredCuisines: allCuisines, budgetPreference: avgBudget, spicePreference: avgSpice, vegPreference: vegPref };
}

// ── Feedback-driven preference learning ───────────────────
function applyFeedbackLearning(user, restaurant, liked, rating) {
  const cuisines = restaurant.cuisines || [];
  if (liked === true) {
    cuisines.forEach(c => {
      if (!user.preferredCuisines.includes(c)) user.preferredCuisines.push(c);
    });
    user.budgetPreference = Math.round((user.budgetPreference + restaurant.priceLevel) / 2);
    user.spicePreference  = Math.round((user.spicePreference  + restaurant.spiceLevel) / 2);
    const id = String(restaurant._id);
    if (!user.likedRestaurants.map(String).includes(id)) {
      user.likedRestaurants.push(restaurant._id);
    }
  } else if (liked === false) {
    if (rating <= 2) {
      user.preferredCuisines = user.preferredCuisines.filter(c => !cuisines.includes(c));
    }
    const id = String(restaurant._id);
    if (!user.dislikedRestaurants.map(String).includes(id)) {
      user.dislikedRestaurants.push(restaurant._id);
    }
  }
  // Clamp
  user.budgetPreference = Math.max(1, Math.min(3, user.budgetPreference));
  user.spicePreference  = Math.max(1, Math.min(5, user.spicePreference));
  return user;
}

// ── Cold-start detection ──────────────────────────────────
// Returns true if user has no meaningful preference data
function isFirstTimeUser(user) {
  return (
    (!user.preferredCuisines  || user.preferredCuisines.length  === 0) &&
    (!user.likedRestaurants   || user.likedRestaurants.length   === 0) &&
    (!user.dislikedRestaurants || user.dislikedRestaurants.length === 0)
  );
}

// ── AI re-ranking via Claude API ──────────────────────────
async function aiRankRestaurants(restaurants, userContext, isGroup = false) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !restaurants.length) return null;

  try {
    const summaries = restaurants.map(r => ({
      id:            String(r._id),
      name:          r.name,
      cuisines:      r.cuisines,
      priceLevel:    r.priceLevel,
      spiceLevel:    r.spiceLevel,
      rating:        r.rating,
      tags:          r.tags,
      communityScore: r.communityScore || r.rating,
    }));

    const prompt = isGroup
      ? `You are a restaurant recommendation AI.
Rank these restaurants for a GROUP to maximize overall satisfaction.

Group preferences:
${JSON.stringify(userContext, null, 2)}

Restaurants:
${JSON.stringify(summaries, null, 2)}

Rules:
- Rank by best overall group satisfaction
- If any member is vegetarian, rank veg-friendly restaurants higher
- Higher community feedback score = better
- Return ONLY a JSON array of IDs, best first: ["id1","id2",...]`
      : `You are a restaurant recommendation AI.
Rank these restaurants for a SINGLE user.

User profile:
${JSON.stringify(userContext, null, 2)}

Restaurants:
${JSON.stringify(summaries, null, 2)}

Rules:
- Priority: filters (cuisine, budget, spice, veg) → community score → feedback history
- Never recommend explicitly disliked restaurants
- Return ONLY a JSON array of IDs, best first: ["id1","id2",...]`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) return null;
    const data      = await resp.json();
    const text      = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    const rankedIds = JSON.parse(text);
    if (!Array.isArray(rankedIds)) return null;

    const order = rankedIds.map(String);
    return [...restaurants].sort((a, b) => {
      const ai = order.indexOf(String(a._id));
      const bi = order.indexOf(String(b._id));
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  } catch (e) {
    console.warn('AI ranking failed, using heuristic:', e.message);
    return null;
  }
}

// ── Exports ───────────────────────────────────────────────
module.exports = {
  scoreRestaurant,
  scoreForGroup,
  aggregatePreferences,
  applyFeedbackLearning,
  aiRankRestaurants,
  isFirstTimeUser,
  distanceScore,
  vegScore,
  MAX_SCORE,
};
