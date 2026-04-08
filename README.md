# 🍽️ Rasa — AI-Powered Restaurant Recommender

A full-stack restaurant recommendation system with JWT authentication, personalized scoring, group room codes, feedback learning, and a polished dark-themed frontend.

---

## 📁 Project Structure

```
rasa/
├── backend/
│   ├── server.js                  ← Express entry point
│   ├── .env.example               ← Environment variables template
│   ├── package.json
│   ├── models/
│   │   ├── User.js                ← User schema + bcrypt hashing
│   │   ├── Restaurant.js          ← Restaurant + menu schema
│   │   ├── Session.js             ← Recommendation session schema
│   │   ├── Feedback.js            ← Post-visit feedback schema
│   │   └── GroupRoom.js           ← Room-code group session schema
│   ├── middleware/
│   │   ├── auth.js                ← JWT protect middleware
│   │   └── recommendEngine.js     ← Scoring + preference learning
│   ├── routes/
│   │   ├── auth.js                ← Register, login, profile, preferences
│   │   ├── restaurants.js         ← Top, all, search, by ID
│   │   ├── recommend.js           ← Personal, select, history, pending
│   │   ├── feedback.js            ← Submit feedback, view feedback
│   │   └── group.js               ← Create/join/kick/recommend/close room
│   └── data/
│       └── seed.js                ← Seed 5 restaurants into MongoDB
└── frontend/
    └── index.html                 ← Complete single-file frontend
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js** v18+
- **MongoDB** running locally (`mongodb://localhost:27017`) or a MongoDB Atlas URI

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env and set your MONGO_URI and JWT_SECRET

# Seed the database with restaurants
npm run seed

# Start development server
npm run dev

# OR start production server
npm start
```

Backend runs on **http://localhost:5000**

### 3. Frontend Setup

The frontend is a single `index.html` file — no build step needed.

```bash
# Option A: Open directly in browser
open frontend/index.html

# Option B: Serve with any static server
npx serve frontend/
# or
python3 -m http.server 3000 --directory frontend/
```

> **Important:** The frontend calls `http://localhost:5000/api` by default. If your backend runs on a different port, update the `const API = '...'` line at the top of the `<script>` in `index.html`.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/rasa` |
| `JWT_SECRET` | Secret key for JWT signing | *(change this!)* |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `NODE_ENV` | Environment | `development` |

---

## 📡 API Reference

### Auth Routes (Public)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `name, email, password, preferredCuisines[], budgetPreference, spicePreference` | Create account |
| POST | `/api/auth/login` | `email, password` | Login, get JWT |

### Auth Routes (Protected)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/api/auth/profile` | — | Get current user |
| PATCH | `/api/auth/preferences` | `preferredCuisines[], budgetPreference, spicePreference` | Update preferences |

### Restaurant Routes (Public)

| Method | Endpoint | Query | Description |
|---|---|---|---|
| GET | `/api/restaurants/top` | `?limit=10` | Top-rated restaurants |
| GET | `/api/restaurants/all` | — | All restaurants |
| GET | `/api/restaurants/search` | `?q=biryani` | Full-text search |
| GET | `/api/restaurants/:id` | — | Single restaurant |

### Recommendation Routes (Protected)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/recommend/personal` | `cuisines[], budget, spice, submode` | Get personalized recs + save session |
| POST | `/api/recommend/select` | `sessionId, restaurantId` | Mark restaurant as selected |
| GET | `/api/recommend/history` | — | Past recommendation sessions |
| GET | `/api/recommend/pending-feedback` | — | Sessions with no feedback yet |

### Feedback Routes (Protected)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/feedback/submit` | `sessionId, restaurantId, rating, liked, comment` | Submit feedback + update preferences |
| GET | `/api/feedback/user` | — | All user feedback |

### Group Room Routes (Protected)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/group/create` | — | Create room, get code |
| POST | `/api/group/join` | `code` | Join existing room |
| GET | `/api/group/:code` | — | Get room details |
| POST | `/api/group/:code/kick` | `userId` | Host removes a member |
| POST | `/api/group/recommend` | `code` | Score restaurants for group |
| DELETE | `/api/group/:code/close` | — | Host closes room |

---

## 🧠 Recommendation Engine

Located in `backend/middleware/recommendEngine.js`

### Scoring Formula

```
Score = (Cuisine Match × 2.5) + (Budget Closeness × 1.5) + (Spice Closeness × 1.2) + Rating
Max   = 5 + 3 + 3.6 + 5 = 16.6  →  normalized to 0–100%
```

### Learning from Feedback

When a user submits feedback, `applyFeedbackLearning()` runs:

- **Liked + high rating:** Cuisines added to preferences, budget/spice nudged toward restaurant's values
- **Disliked + low rating (≤2):** Cuisines removed from preferences
- Restaurant added to `likedRestaurants` or `dislikedRestaurants`

### Group Mode

- All member preferences are merged (`aggregatePreferences`)
- Each restaurant is scored against the merged profile
- Members with no cuisines set get all cuisines included
- Room codes auto-expire after **2 hours** (via MongoDB TTL index)

---

## 🗄️ Data Models

### User
```json
{
  "name": "string",
  "email": "string (unique)",
  "password": "bcrypt hashed",
  "preferredCuisines": ["Indian", "Chinese"],
  "budgetPreference": 2,
  "spicePreference": 4,
  "likedRestaurants": ["ObjectId"],
  "dislikedRestaurants": ["ObjectId"]
}
```

### Restaurant
```json
{
  "name": "Spice Hub",
  "cuisines": ["Indian", "Chinese"],
  "rating": 4.5,
  "priceLevel": 2,
  "spiceLevel": 4,
  "tags": ["veg", "budget"],
  "address": "Benz Circle, Vijayawada",
  "emoji": "🍛",
  "menu": [
    {
      "category": "Starters",
      "items": [{ "name": "Paneer Tikka", "description": "...", "price": 150 }]
    }
  ]
}
```

### Session
```json
{
  "userId": "ObjectId",
  "mode": "personalized | group | first-time | surprise",
  "filters": { "cuisines": [], "budget": 2, "spice": 3, "submode": "regular" },
  "recommendedRestaurants": ["ObjectId"],
  "selectedRestaurant": "ObjectId",
  "feedbackGiven": false
}
```

### Feedback
```json
{
  "userId": "ObjectId",
  "sessionId": "ObjectId",
  "restaurantId": "ObjectId",
  "rating": 4,
  "liked": true,
  "comment": "Great spice level!"
}
```

### GroupRoom
```json
{
  "code": "XK7F2A",
  "host": "ObjectId",
  "members": [{ "userId": "ObjectId", "name": "Priya", "preferredCuisines": [], "budgetPreference": 2, "spicePreference": 4 }],
  "active": true,
  "expiresAt": "2 hours from creation"
}
```

---

## 🛠️ Development Phases

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ | Frontend UI + restaurant dataset + first-time recs |
| 2 | ✅ | Register/login + MongoDB + user data storage |
| 3 | ✅ | Personalized recommendations (scoring engine) |
| 4 | ✅ | Group mode with room codes |
| 5 | ✅ | History + feedback system + preference learning |
| 6 | 🔜 | AI-based vector similarity (cosine) |

---

## 🔮 Phase 6 — AI Enhancement (Coming Next)

To upgrade the engine to vector-based recommendations:

1. Convert user preferences → feature vectors
2. Convert restaurants → feature vectors  
3. Use **cosine similarity** to find nearest matches
4. Optionally integrate an LLM for natural language preference input

Libraries to explore: `ml-matrix` (Node), `TensorFlow.js`, or offload to a Python FastAPI microservice.

---

## 🚢 Deployment

### Backend → Render / Railway
```bash
# Set environment variables in dashboard
# Start command: node server.js
```

### Frontend → Vercel / Netlify
```bash
# Deploy the frontend/ folder
# Update const API = 'https://your-backend.onrender.com/api' in index.html
```

### Database → MongoDB Atlas
```
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/rasa
```

---

## 📦 Dependencies

### Backend
| Package | Purpose |
|---|---|
| `express` | Web framework |
| `mongoose` | MongoDB ODM |
| `jsonwebtoken` | JWT auth |
| `bcryptjs` | Password hashing |
| `cors` | Cross-origin requests |
| `dotenv` | Environment variables |
| `nodemon` | Dev auto-restart |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Make changes
4. Test with `npm run dev`
5. Submit a PR

---

## 📄 License

MIT
