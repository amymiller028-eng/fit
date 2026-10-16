// Built-in food library, matched instantly as you type. Values are typical label/USDA
// estimates per serving: cal = calories, p = protein (g), f = fiber (g).
// dairy: true marks foods that contain milk; everything else here is dairy-free.
const FOODS = [
  { name: 'Egg whites (1/2 cup)', cal: 63, p: 13, f: 0 },
  { name: 'Whole egg', cal: 72, p: 6, f: 0 },
  { name: 'Chicken breast (4 oz cooked)', cal: 185, p: 35, f: 0 },
  { name: 'Salmon (5 oz cooked)', cal: 290, p: 31, f: 0 },
  { name: 'Plant protein powder, pea (1 scoop)', cal: 120, p: 24, f: 1 },
  { name: 'Tuna (1 can, in water)', cal: 120, p: 26, f: 0 },
  { name: 'Lean ground turkey (4 oz cooked)', cal: 170, p: 23, f: 0 },
  { name: 'Shrimp (4 oz cooked)', cal: 110, p: 24, f: 0 },
  { name: 'Lean steak, sirloin (4 oz cooked)', cal: 210, p: 33, f: 0 },
  { name: 'Firm tofu (1/2 cup)', cal: 180, p: 22, f: 3 },
  { name: 'Edamame (3/4 cup shelled)', cal: 140, p: 13.5, f: 6 },
  { name: 'Lentils (1/2 cup cooked)', cal: 115, p: 9, f: 8 },
  { name: 'Black beans (1/2 cup)', cal: 115, p: 8, f: 7.5 },
  { name: 'Chickpeas (1/2 cup)', cal: 135, p: 7, f: 6 },
  { name: 'Hummus (2 tbsp)', cal: 70, p: 2, f: 2 },
  { name: 'Plant-based protein bar', cal: 210, p: 15, f: 8 },
  { name: 'Chia seeds (1 tbsp)', cal: 60, p: 2, f: 4 },
  { name: 'Raspberries (1 cup)', cal: 64, p: 1.5, f: 8 },
  { name: 'Blueberries (1/2 cup)', cal: 42, p: 0.5, f: 2 },
  { name: 'Strawberries (1 cup)', cal: 50, p: 1, f: 3 },
  { name: 'Apple (medium)', cal: 95, p: 0.5, f: 4.5 },
  { name: 'Pear (medium)', cal: 100, p: 0.6, f: 5.5 },
  { name: 'Banana (medium)', cal: 105, p: 1.3, f: 3 },
  { name: 'Oats (1/2 cup dry)', cal: 150, p: 5, f: 4 },
  { name: 'Oat milk, unsweetened (1 cup)', cal: 120, p: 3, f: 2 },
  { name: 'Almond milk, unsweetened (1 cup)', cal: 35, p: 1, f: 0.5 },
  { name: 'Broccoli (1 cup cooked)', cal: 55, p: 3.7, f: 5 },
  { name: 'Big salad (greens + veggies)', cal: 60, p: 2, f: 3 },
  { name: 'Spinach (2 cups raw)', cal: 14, p: 1.7, f: 1.3 },
  { name: 'Sweet potato (6 oz baked)', cal: 150, p: 3.4, f: 5.6 },
  { name: 'White rice (3/4 cup cooked)', cal: 155, p: 3, f: 0.5 },
  { name: 'Brown rice (3/4 cup cooked)', cal: 165, p: 3.5, f: 2.5 },
  { name: 'Quinoa (3/4 cup cooked)', cal: 165, p: 6, f: 4 },
  { name: 'Avocado (1/4)', cal: 80, p: 1, f: 3.4 },
  { name: 'Sourdough (1 slice)', cal: 120, p: 4, f: 1 },
  { name: 'Ezekiel bread (1 slice)', cal: 80, p: 5, f: 3 },
  { name: 'Almonds (1 oz)', cal: 165, p: 6, f: 3.5 },
  { name: 'Peanut butter (1 tbsp)', cal: 95, p: 3.5, f: 1 },
  { name: 'Olive oil (1 tsp)', cal: 40, p: 0, f: 0 },
  // Common Starbucks orders (approximate; check the Starbucks app for exact numbers).
  { name: 'Starbucks Caffè Americano (grande)', brand: 'Starbucks', approx: true, cal: 15, p: 1, f: 0 },
  { name: 'Starbucks Pike Place brewed coffee (grande)', brand: 'Starbucks', approx: true, cal: 5, p: 1, f: 0 },
  { name: 'Starbucks Cold Brew (grande)', brand: 'Starbucks', approx: true, cal: 5, p: 0, f: 0 },
  { name: 'Starbucks Iced Brown Sugar Oatmilk Shaken Espresso (grande)', brand: 'Starbucks', approx: true, cal: 120, p: 2, f: 1 },
  { name: 'Starbucks Oatmilk Latte (grande)', brand: 'Starbucks', approx: true, cal: 220, p: 5, f: 3 },
  { name: 'Starbucks Almondmilk Latte (grande)', brand: 'Starbucks', approx: true, cal: 110, p: 3, f: 1 },
  { name: 'Starbucks Iced Matcha Latte with oatmilk (grande)', brand: 'Starbucks', approx: true, cal: 240, p: 4, f: 2 },
  { name: 'Starbucks Pink Drink (grande)', brand: 'Starbucks', approx: true, cal: 140, p: 1, f: 1 },
  { name: 'Starbucks Rolled & Steel-Cut Oatmeal', brand: 'Starbucks', approx: true, cal: 160, p: 5, f: 4 },
  { name: 'Starbucks Plain Bagel', brand: 'Starbucks', approx: true, cal: 280, p: 11, f: 2 },
  { name: 'Starbucks Avocado Spread', brand: 'Starbucks', approx: true, cal: 90, p: 1, f: 3 },
  { name: 'Starbucks Caffè Latte, 2% milk (grande)', brand: 'Starbucks', approx: true, dairy: true, cal: 190, p: 13, f: 0 },
  { name: 'Starbucks Egg White & Roasted Red Pepper Egg Bites', brand: 'Starbucks', approx: true, dairy: true, cal: 170, p: 12, f: 1 },
  { name: 'Starbucks Spinach, Feta & Egg White Wrap', brand: 'Starbucks', approx: true, dairy: true, cal: 290, p: 20, f: 3 },
  { name: 'Starbucks Impossible Breakfast Sandwich', brand: 'Starbucks', approx: true, dairy: true, cal: 420, p: 22, f: 3 },
];

// The cut-day meals from the Glute + Cut Plan doc, made dairy-free (fiber estimated).
const PLAN_MEALS = [
  { name: 'Plan breakfast: egg whites, egg, spinach, sourdough', cal: 260, p: 29, f: 2, meal: 'Breakfast' },
  { name: 'Plan snack: edamame + raspberries', cal: 170, p: 14, f: 10, meal: 'Snack' },
  { name: 'Plan lunch: chicken, rice, salad, avocado', cal: 430, p: 38, f: 6, meal: 'Lunch' },
  { name: 'Plan pre-workout: apple + plant protein shake', cal: 215, p: 24.5, f: 5.5, meal: 'Snack' },
  { name: 'Plan dinner: salmon, sweet potato, broccoli', cal: 530, p: 39, f: 10, meal: 'Dinner' },
];

const STORE_CATS = [
  { id: 'produce', name: 'Produce', e: '🥬', words: ['spinach', 'berr', 'apple', 'pear', 'banana', 'avocado', 'broccoli', 'sweet potato', 'salad', 'greens', 'lettuce', 'tomato', 'cucumber', 'pepper', 'onion', 'garlic', 'lemon', 'lime', 'fruit', 'veg', 'kale', 'zucchini', 'carrot'] },
  { id: 'protein', name: 'Protein', e: '🍗', words: ['chicken', 'salmon', 'turkey', 'beef', 'tuna', 'shrimp', 'fish', 'egg', 'tofu', 'protein', 'steak', 'jerky'] },
  { id: 'dairy', name: 'Fridge', e: '🥛', words: ['yogurt', 'milk', 'cheese', 'kefir', 'creamer', 'hummus'] },
  { id: 'pantry', name: 'Pantry', e: '🥫', words: ['rice', 'oat', 'bread', 'sourdough', 'chia', 'lentil', 'bean', 'chickpea', 'almond', 'nut', 'oil', 'spice', 'sauce', 'pasta', 'quinoa', 'bar', 'coffee', 'tea', 'honey', 'seasoning'] },
  { id: 'frozen', name: 'Frozen', e: '🧊', words: ['frozen', 'ice cream', 'popsicle'] },
  { id: 'care', name: 'Household & personal', e: '🧴', words: ['shampoo', 'lotion', 'skincare', 'makeup', 'band', 'sock', 'legging', 'bottle', 'deodorant', 'gum', 'vitamin', 'creatine', 'electrolyte', 'serum', 'spf', 'sunscreen', 'hair', 'nail', 'paper towel', 'toilet', 'soap', 'detergent', 'trash bag', 'sponge', 'razor', 'toothpaste', 'dog', 'treats', 'poop bag'] },
  { id: 'other', name: 'Other', e: '🛍️', words: [] },
];

const PLAN_GROCERIES = [
  'Egg whites (carton)', 'Eggs', 'Spinach', 'Sourdough bread', 'Frozen edamame (shelled)', 'Raspberries',
  'Chicken breast', 'Rice', 'Salad greens', 'Avocados', 'Apples', 'Plant protein powder',
  'Salmon', 'Sweet potatoes', 'Broccoli', 'Olive oil',
];

const FIBER_BOOSTERS = ['Raspberries', 'Chia seeds', 'Lentils', 'Pears', 'Black beans'];
