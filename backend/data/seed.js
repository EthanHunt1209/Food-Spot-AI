require('dotenv').config();
const mongoose   = require('mongoose');
const Restaurant = require('../models/Restaurant');

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
    menu: [
      { category: 'Starters', items: [
        { name: 'Veg Manchuria',   description: 'Crispy veggie balls in spicy Manchurian sauce', price: 120 },
        { name: 'Paneer Tikka',    description: 'Marinated cottage cheese grilled in tandoor',   price: 150 },
        { name: 'Crispy Corn',     description: 'Seasoned sweet corn tossed with peppers',       price: 90  },
      ]},
      { category: 'Mains', items: [
        { name: 'Butter Paneer Masala', description: 'Rich tomato-cream curry',               price: 220 },
        { name: 'Veg Fried Rice',       description: 'Wok-tossed jasmine rice with veggies',  price: 170 },
        { name: 'Dal Makhani',          description: 'Slow-cooked black lentils in butter',   price: 180 },
      ]},
      { category: 'Desserts', items: [
        { name: 'Gulab Jamun', description: 'Milk dumplings soaked in rose syrup',         price: 80 },
        { name: 'Kheer',       description: 'Creamy rice pudding with cardamom and nuts',  price: 90 },
      ]},
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
    menu: [
      { category: 'Biryani', items: [
        { name: 'Chicken Biryani', description: 'Hyderabadi dum-style with saffron',     price: 280 },
        { name: 'Mutton Biryani',  description: 'Slow-cooked aromatic on aged basmati',  price: 350 },
        { name: 'Egg Biryani',     description: 'Layered with masala-coated boiled eggs', price: 220 },
      ]},
      { category: 'Sides', items: [
        { name: 'Raita',          description: 'Chilled yogurt with cucumber and mint', price: 60 },
        { name: 'Mirchi Ka Salan', description: 'Green chilli curry',                  price: 70 },
        { name: 'Shorba',         description: 'Spiced lamb bone broth',               price: 90 },
      ]},
      { category: 'Desserts', items: [
        { name: 'Double Ka Meetha', description: 'Hyderabadi bread pudding with nuts', price: 100 },
      ]},
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
    menu: [
      { category: 'Noodles', items: [
        { name: 'Hakka Noodles',    description: 'Classic wok-tossed with soy and garlic',      price: 130 },
        { name: 'Pad Thai',         description: 'Rice noodles with tamarind and peanuts',       price: 160 },
        { name: 'Singapore Noodles', description: 'Thin vermicelli with curry powder',           price: 145 },
      ]},
      { category: 'Rice', items: [
        { name: 'Schezwan Fried Rice', description: 'Spicy Indo-Chinese style',           price: 140 },
        { name: 'Pineapple Fried Rice', description: 'Thai sweet and savory with cashews', price: 155 },
      ]},
      { category: 'Soups', items: [
        { name: 'Hot & Sour Soup', description: 'Tangy mushroom broth with silken tofu', price: 90  },
        { name: 'Tom Yum',         description: 'Lemongrass and galangal broth',         price: 110 },
      ]},
    ],
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
    menu: [
      { category: 'Thaali', items: [
        { name: 'Full Andhra Meals', description: 'Unlimited rice with 4 curries, pappu, rasam, curd', price: 180 },
        { name: 'Mini Meals',        description: 'Lighter version with 2 curries and rice',            price: 120 },
      ]},
      { category: 'Curries', items: [
        { name: 'Gongura Mutton',  description: 'Tender mutton in fiery sorrel leaves gravy',     price: 260 },
        { name: 'Royyala Vepudu', description: 'Coastal prawn stir fry with coconut',             price: 280 },
        { name: 'Pesarattu Curry', description: 'Moong dal crepe with tomato ginger curry',       price: 140 },
      ]},
      { category: 'Extras', items: [
        { name: 'Pappu (Dal)',    description: 'Tempered toor dal with tamarind',     price: 70 },
        { name: 'Vankaya Fry',   description: 'Brinjal stir fry with mustard seeds', price: 90 },
        { name: 'Perugu Pachadi', description: 'Curd chutney with green chilli',     price: 50 },
      ]},
    ],
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
    menu: [
      { category: 'Pizzas', items: [
        { name: 'Margherita',       description: 'Classic San Marzano tomato with fresh mozzarella', price: 350 },
        { name: 'BBQ Chicken',      description: 'Smoky grilled chicken with caramelised onion',     price: 420 },
        { name: 'Quattro Formaggi', description: 'Four cheese blend on olive oil base',             price: 390 },
      ]},
      { category: 'Pasta', items: [
        { name: 'Penne Arrabbiata',  description: 'Spicy tomato and garlic — no cream',             price: 280 },
        { name: 'Spaghetti Carbonara', description: 'Egg, pancetta, pecorino — classic Roman',     price: 320 },
        { name: 'Pesto Fusilli',     description: 'Basil pesto with sun-dried tomatoes',            price: 290 },
      ]},
      { category: 'Sides', items: [
        { name: 'Garlic Bread',  description: 'Buttery herbed baguette toasted golden', price: 120 },
        { name: 'Caesar Salad', description: 'Romaine, croutons, anchovy dressing',    price: 220 },
      ]},
    ],
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  await Restaurant.deleteMany({});
  const inserted = await Restaurant.insertMany(restaurants);
  console.log(`✅ Seeded ${inserted.length} restaurants`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
