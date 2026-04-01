/**
 * Rasa Recommendation Engine
 * Scores restaurants for a given user preference profile.
 */

const MAX_SCORE = 2.5 * 2 + 1.5 * 2 + 1.2 * 3 + 5; // cuisine + budget + spice + rating

/**
 * Score a single restaurant against a preference profile.
 * @param {Object} restaurant - Mongoose restaurant document or plain object
 * @param {Object} pref - { preferredCuisines, budgetPreference, spicePreference }
 * @returns {number} 0-100 match percentage
 */
function scoreRestaurant(restaurant, pref) {
  let s = 0;

  // Cuisine match (up to 2 matches rewarded)
  const cuisineMatches = restaurant.cuisines.filter(c =>
    pref.preferredCuisines.map(x => x.toLowerCase()).includes(c.toLowerCase())
  ).length;
  s += Math.min(cuisineMatches, 2) * 2.5;

  // Budget closeness
  s += Math.max(0, 2 - Math.abs(restaurant.priceLevel - pref.budgetPreference)) * 1.5;

  // Spice closeness
  s += Math.max(0, 3 - Math.abs(restaurant.spiceLevel - pref.spicePreference)) * 1.2;

  // Raw rating (0–5)
  s += restaurant.rating;

  return Math.round((s / MAX_SCORE) * 100);
}

/**
 * Score a restaurant for a group by averaging individual scores.
 * @param {Object} restaurant
 * @param {Array}  members - array of preference objects
 * @returns {{ avg: number, scores: number[] }}
 */
function scoreForGroup(restaurant, members) {
  const scores = members.map(m => scoreRestaurant(restaurant, m));
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { avg, scores };
}

/**
 * Build an aggregated preference profile from an array of member prefs.
 */
function aggregatePreferences(members) {
  const allCuisines = [...new Set(members.flatMap(m => m.preferredCuisines))];
  const avgBudget = Math.round(members.reduce((s, m) => s + m.budgetPreference, 0) / members.length);
  const avgSpice  = Math.round(members.reduce((s, m) => s + m.spicePreference,  0) / members.length);
  return { preferredCuisines: allCuisines, budgetPreference: avgBudget, spicePreference: avgSpice };
}

/**
 * Apply learning from feedback to user preferences.
 * Mutates the preference object in place and returns it.
 */
function applyFeedbackLearning(user, restaurant, liked, rating) {
  const cuisines = restaurant.cuisines;

  if (liked) {
    // Boost: add cuisines to preferred list if not already there
    cuisines.forEach(c => {
      if (!user.preferredCuisines.includes(c)) user.preferredCuisines.push(c);
    });
    // Nudge budget toward restaurant's price level
    user.budgetPreference = Math.round((user.budgetPreference + restaurant.priceLevel) / 2);
    // Nudge spice toward restaurant's spice level
    user.spicePreference  = Math.round((user.spicePreference + restaurant.spiceLevel) / 2);
    // Track liked
    if (!user.likedRestaurants.includes(restaurant._id)) {
      user.likedRestaurants.push(restaurant._id);
    }
  } else {
    // Downgrade: remove cuisine only if rating is very low
    if (rating <= 2) {
      user.preferredCuisines = user.preferredCuisines.filter(c => !cuisines.includes(c));
    }
    if (!user.dislikedRestaurants.includes(restaurant._id)) {
      user.dislikedRestaurants.push(restaurant._id);
    }
  }

  return user;
}

module.exports = { scoreRestaurant, scoreForGroup, aggregatePreferences, applyFeedbackLearning };
