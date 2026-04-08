const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
});

const mongoose = require('mongoose');
const Restaurant = require('../models/Restaurant');

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI missing in .env');
  process.exit(1);
}

const restaurants = [
  {
    name: 'Spice Hub',
    cuisines: ['Indian', 'Chinese'],
    rating: 4.5,
    priceLevel: 2,
    spiceLevel: 4,
    tags: ['veg', 'budget'],
    address: 'Benz Circle, Vijayawada',
    emoji: '🍛',
    lat: 16.5068,
    lng: 80.648,
    location: {
      type: 'Point',
      coordinates: [80.648, 16.5068],
    },
    menu: [
      {
        category: 'Starters',
        items: [
          {
            name: 'Veg Manchuria',
            description: 'Crispy veggie balls in spicy Manchurian sauce',
            price: 120,
          },
          {
            name: 'Paneer Tikka',
            description: 'Marinated cottage cheese grilled in tandoor',
            price: 150,
          },
          {
            name: 'Crispy Corn',
            description: 'Seasoned sweet corn tossed with peppers',
            price: 90,
          },
        ],
      },
      {
        category: 'Mains',
        items: [
          {
            name: 'Butter Paneer Masala',
            description: 'Rich tomato-cream curry',
            price: 220,
          },
          {
            name: 'Veg Fried Rice',
            description: 'Wok-tossed jasmine rice with veggies',
            price: 170,
          },
          {
            name: 'Dal Makhani',
            description: 'Slow-cooked black lentils in butter',
            price: 180,
          },
        ],
      },
    ],
  },
  {
    name: 'Biryani Palace',
    cuisines: ['Indian'],
    rating: 4.7,
    priceLevel: 2,
    spiceLevel: 5,
    tags: ['nonveg'],
    address: 'MG Road, Vijayawada',
    emoji: '🍚',
    lat: 16.5185,
    lng: 80.6248,
    location: {
      type: 'Point',
      coordinates: [80.6248, 16.5185],
    },
    menu: [
      {
        category: 'Biryani',
        items: [
          {
            name: 'Chicken Biryani',
            description: 'Hyderabadi dum-style with saffron',
            price: 280,
          },
          {
            name: 'Mutton Biryani',
            description: 'Slow-cooked aromatic on aged basmati',
            price: 350,
          },
        ],
      },
    ],
  },
  {
    name: 'Noodle Street',
    cuisines: ['Chinese', 'Thai'],
    rating: 4.2,
    priceLevel: 1,
    spiceLevel: 3,
    tags: ['veg', 'budget'],
    address: 'Governorpet, Vijayawada',
    emoji: '🍜',
    lat: 16.5148,
    lng: 80.6178,
    location: {
      type: 'Point',
      coordinates: [80.6178, 16.5148],
    },
    menu: [],
  },
  {
    name: 'Andhra Spices',
    cuisines: ['South Indian', 'Andhra'],
    rating: 4.8,
    priceLevel: 1,
    spiceLevel: 5,
    tags: ['veg', 'nonveg', 'budget'],
    address: 'Patamata, Vijayawada',
    emoji: '🌶️',
    lat: 16.4909,
    lng: 80.6678,
    location: {
      type: 'Point',
      coordinates: [80.6678, 16.4909],
    },
    menu: [],
  },
  {
    name: 'Pizza Corner',
    cuisines: ['Italian', 'Continental'],
    rating: 4.1,
    priceLevel: 3,
    spiceLevel: 2,
    tags: ['veg', 'nonveg'],
    address: 'Central Mall, Vijayawada',
    emoji: '🍕',
    lat: 16.5032,
    lng: 80.646,
    location: {
      type: 'Point',
      coordinates: [80.646, 16.5032],
    },
    menu: [],
  },
];

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    console.log('Clearing old restaurants...');
    await Restaurant.deleteMany({});

    console.log('Inserting restaurant seed data...');
    const inserted = await Restaurant.insertMany(restaurants);

    console.log(`Successfully seeded ${inserted.length} restaurants`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();