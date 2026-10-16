'use strict';

// Store needs, Nutrition and Wishlist pages. Uses the helpers and state from app.js.

const uid = () => Math.random().toString(36).slice(2, 10);
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const MEAL_EMOJI = { Breakfast: '🌅', Lunch: '☀️', Dinner: '🌙', Snack: '🍓' };
const r1 = n => Math.round(n * 10) / 10;

function defaultMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 17 ? 'Snack' : 'Dinner';
}

/* ---------- nutrition ---------- */

let foodMeal = null;
let foodQuery = '';

function dayFood(k) { return (state.food && state.food[k]) || []; }

function foodTotals(k) {
  return dayFood(k).reduce((t, x) => ({ cal: t.cal + x.cal * x.qty, p: t.p + x.p * x.qty, f: t.f + x.f * x.qty }), { cal: 0, p: 0, f: 0 });
}

function foodGoalsHit(k) {
  if (!dayFood(k).length) return false;
  const t = foodTotals(k);
  return t.p >= GOALS.protein && t.f >= GOALS.fiber;
}

// Best foods to close a gap: lots of the nutrient, for not many calories, that still fit today's budget.
function bestFoods(metric, calRoom) {
  return FOODS
    .filter(x => !x.brand && !isDairy(x) && x[metric] >= 2 && x.cal <= Math.max(calRoom, 130))
    .map(x => ({ x, s: x[metric] * (x[metric] / Math.max(x.cal, 1)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(o => o.x);
}

function foodCoach(k) {
  const t = foodTotals(k);
  const pLeft = GOALS.protein - t.p, fLeft = GOALS.fiber - t.f, calLeft = GOALS.calories - t.cal;
  const tips = [];
  if (!dayFood(k).length) {
    return [{ e: '🌸', html: `Log your first meal and you'll see progress toward your <b>${GOALS.protein} g protein</b> and <b>${GOALS.fiber} g fiber</b> goals.` }];
  }
  const dairyItems = dayFood(k).filter(isDairy);
  if (dairyItems.length) tips.push({ e: '', html: `<b>Heads up: dairy.</b> ${dairyItems.map(x => esc(shortFood(x.name))).join(', ')} may contain milk. Double-check before you eat it.` });
  if (pLeft <= 0 && fLeft <= 0) {
    tips.push({ e: '💖', html: '<b>Protein and fiber goals hit.</b> That is exactly how you build muscle while leaning out.' });
  } else {
    if (pLeft > 0) {
      const picks = bestFoods('p', calLeft);
      tips.push({ e: '🍗', html: `<b>${Math.ceil(pLeft)} g protein to go.</b> Easy wins: ${picks.map(x => `${esc(shortFood(x.name))} (${r1(x.p)} g)`).join(', ')}.` });
    } else tips.push({ e: '💪', html: '<b>Protein goal hit.</b> Your muscles have what they need to grow.' });
    if (fLeft > 0) {
      const picks = bestFoods('f', calLeft);
      tips.push({ e: '🥦', html: `<b>${Math.ceil(fLeft)} g fiber to go.</b> Try ${picks.map(x => `${esc(shortFood(x.name))} (${r1(x.f)} g)`).join(', ')}.` });
    } else tips.push({ e: '🌿', html: '<b>Fiber goal hit.</b> That keeps you full on fewer calories.' });
  }
  if (calLeft < -100) tips.push({ e: '🫶', html: `About ${fmt(-calLeft)} cal over today. No stress, just get back on plan tomorrow.` });
  else if (calLeft >= 0 && (pLeft > 0 || fLeft > 0)) tips.push({ e: '✨', html: `${fmt(calLeft)} cal left to spend, so make them high-protein, high-fiber ones.` });
  return tips;
}

const shortFood = name => name.replace(/\s*\(.*\)/, '').replace(/:.*/, '').toLowerCase();

function foodMeter(label, val, goal, unit, kind) {
  const pct = Math.min(100, goal ? val / goal * 100 : 0);
  const hit = kind !== 'kcal' && val >= goal;
  const over = kind === 'kcal' && val > goal + 100;
  return `<div class="fmeter ${kind} ${hit ? 'hit' : ''} ${over ? 'over' : ''}">
    <div class="fmeter-top"><span>${label}</span><b>${fmt(val)}<small> / ${fmt(goal)} ${unit}</small>${hit ? ' ✓' : ''}</b></div>
    <div class="fbar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function foodRow(x, i, src) {
  const dairy = isDairy(x);
  return `<li class="food-pick ${dairy ? 'has-dairy' : ''}">
    <div class="fn"><b>${esc(x.name)}</b>
      <small>${x.brand && !x.name.startsWith(x.brand) ? `${esc(x.brand)} · ` : ''}${r1(x.p)} g protein · ${r1(x.f)} g fiber · ${x.approx ? '≈' : ''}${fmt(x.cal)} cal${x.src ? ` · ${esc(x.src)}` : ''}</small>
      ${dairy ? '<span class="dairy-tag">Contains dairy</span>' : ''}</div>
    <button class="plus" data-act="food-add" data-src="${src}" data-i="${i}" aria-label="Add ${esc(x.name)}">＋</button>
  </li>`;
}

/* ---------- food lookup ---------- */

// Milk-based ingredients. Plant "milks", nut butters and anything labelled dairy-free don't count.
const DAIRY_WORDS = /\b(milk|cheese|cheddar|mozzarella|parmesan|feta|ricotta|yogh?urt|whey|casein|caseinate|butter|buttermilk|cream|creamer|ghee|lactose|kefir|latte|cappuccino|macchiato|frappuccino|queso|custard|gelato|ice cream)\b/i;
const NOT_DAIRY = /\b(dairy[- ]free|non[- ]?dairy|vegan|(oat|almond|soy|coconut|cashew|rice|pea|plant|hemp|macadamia|pistachio|flax)[- ]?(milk|yogh?urt|creamer|cream|cheese|butter|latte|based)s?|(peanut|almond|cashew|sunflower|cocoa|shea|apple|nut|seed) butter|cream of tartar|ice cream cone)\b/gi;

const PLANT_MILK = /\b(oat|almond|soy|coconut|cashew|rice|pea|plant|hemp|macadamia|pistachio)[- ]?(milk|based)/i;
const SAYS_DAIRY_FREE = /\b(dairy[- ]free|non[- ]?dairy|vegan)\b/i;

function hasDairy(text) {
  let t = String(text || '');
  if (SAYS_DAIRY_FREE.test(t)) return false;
  // An oat-milk latte or coconut-milk ice cream is still dairy-free.
  if (PLANT_MILK.test(t)) t = t.replace(/\b(latte|cappuccino|macchiato|frappuccino|ice cream|yogh?urt|creamer|cheese)\b/gi, ' ');
  return DAIRY_WORDS.test(t.replace(NOT_DAIRY, ' '));
}

const isDairy = x => x.dairy === true || (x.dairy === undefined && hasDairy(x.name));

const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
const stem = w => w.replace(/(ies)$/, 'y').replace(/(oes|ses|xes)$/, m => m.slice(0, -2)).replace(/([^s])s$/, '$1');

/* ---------- "what did you eat?" ---------- */

// Turns "1/2 cup baked sweet potato" into calories, protein and fiber.
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25, couple: 2 };
const UNICODE_FRAC = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };
const UNITS = [
  [/^(cups?|c)$/, { vol: 1, label: 'cup' }],
  [/^(tablespoons?|tbsps?|tbs|tbl|tb)$/, { vol: 1 / 16, label: 'tbsp' }],
  [/^(teaspoons?|tsps?)$/, { vol: 1 / 48, label: 'tsp' }],
  [/^(ml|milliliters?|millilitres?)$/, { vol: 1 / 236.6, label: 'ml' }],
  [/^(oz|ounces?)$/, { g: 28.35, label: 'oz' }],
  [/^(lbs?|pounds?)$/, { g: 453.6, label: 'lb' }],
  [/^(g|grams?|gr)$/, { g: 1, label: 'g' }],
  [/^(kg|kilograms?)$/, { g: 1000, label: 'kg' }],
  [/^(slices?|pieces?|pcs?|medium|large|small|whole|scoops?|cans?|links?|fillets?|patty|patties|strips?|sticks?|bars?|packets?|servings?|handfuls?|bowls?|containers?|eggs?)$/, { count: true }],
];
const COOKED = /\b(baked|cooked|grilled|roasted|boiled|steamed|fried|sauteed|sautéed|scrambled|poached|broiled|toasted|mashed)\b/;
const AVOID = ['frozen', 'canned', 'dehydrated', 'dried', 'powder', 'babyfood', 'infant', 'toddler', 'fast foods', 'with salt', 'restaurant', 'school lunch', 'formulated', 'imitation',
  ' roll', 'nugget', 'breaded', 'batter', 'patty', 'patties', 'sausage', 'frankfurter', 'sandwich', 'meatless', 'game meat', 'glutinous', 'chips', 'leaves', 'bran',
  'reduced sodium', 'reduced fat', 'low fat', 'unenriched', 'loaf', 'luncheon', 'deli', 'salad', 'mix', 'prepared from recipe', 'pickled', 'juice', 'sweetened', 'syrup', 'sauce', 'soup', 'stuffed', 'with added'];

function parseAmount(tokens) {
  let qty = null;
  while (tokens.length) {
    const t = tokens[0];
    let v = null;
    if (/^\d+(\.\d+)?$/.test(t)) v = parseFloat(t);
    else if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); v = b ? a / b : null; }
    else if (/^\d*[½⅓⅔¼¾⅛]$/.test(t)) v = (parseInt(t, 10) || 0) + UNICODE_FRAC[t.slice(-1)];
    else if (NUM_WORDS[t] !== undefined && (qty === null || t === 'half')) v = NUM_WORDS[t];
    if (v === null) break;
    qty = qty === null ? v : (t === 'half' ? qty * 0.5 : qty + v);
    tokens.shift();
    if (tokens[0] === 'a' || tokens[0] === 'an') tokens.shift(); // "half a cup"
  }
  return qty;
}

function parseFood(text) {
  const tokens = text.toLowerCase().replace(/(\d)([a-z½⅓⅔¼¾⅛])/g, '$1 $2').replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
  const qty = parseAmount(tokens);
  let unit = null, unitTok = '';
  if (tokens[0] === 'fl' && /^oz/.test(tokens[1] || '')) { tokens.splice(0, 2); unit = { vol: 1 / 8, label: 'fl oz' }; unitTok = 'fl oz'; }
  else if (tokens.length > 1) {
    const hit = UNITS.find(([re]) => re.test(tokens[0]));
    // "2 eggs": the count word is the food, not a unit.
    if (hit && !(hit[1].count && /^eggs?$/.test(tokens[0]) && tokens.length === 1)) { unitTok = tokens.shift(); unit = hit[1]; }
  }
  if (tokens[0] === 'of') tokens.shift();
  return { qty: qty === null ? 1 : qty, hadQty: qty !== null, unit, unitTok, food: tokens.join(' ') };
}

// USDA SR Legacy database, bundled as usda-foods.json and loaded once.
// Row: [description, kcal/100 g, protein/100 g, fiber/100 g, category, [[amount, portion, grams], ...]]
let usdaDb = null;
function loadUsda() {
  if (!usdaDb) {
    usdaDb = fetch('usda-foods.json').then(r => {
      if (!r.ok) throw new Error('db');
      return r.json();
    }).then(rows => rows.map(([d, kcal, p, f, cat, portions]) => ({
      d, kcal, p, f, cat,
      lc: d.toLowerCase(),
      words: d.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem),
      portions: portions.map(([amount, text, g]) => ({ amount, text: text.toLowerCase(), g })),
    }))).catch(err => { usdaDb = null; throw err; });
  }
  return usdaDb;
}

// USDA calls grilled chicken "roasted" or "broiled", and so on.
const SYNONYMS = {
  grilled: ['grilled', 'roasted', 'broiled'], baked: ['baked', 'roasted'], scrambled: ['scrambled'],
  steak: ['steak', 'beef'], hamburger: ['ground', 'beef'], fries: ['french', 'fried'], oatmeal: ['oat'],
  yam: ['sweet'], ground: ['ground'], cooked: ['cooked', 'boiled', 'roasted', 'baked', 'steamed'],
};

// Everyday staples point at the plain, cooked version unless you type something more specific ("fried chicken breast").
const STAPLES = [
  ['chicken breast', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted'],
  ['chicken thigh', 'Chicken, broilers or fryers, thigh, meat only, cooked, roasted'],
  ['salmon', 'Fish, salmon, Atlantic, farmed, cooked, dry heat'],
  ['shrimp', 'Crustaceans, shrimp, cooked'],
  ['tuna', 'Fish, tuna, light, canned in water, without salt, drained solids'],
  ['ground turkey', 'Turkey, Ground, cooked'],
  ['ground beef', 'Beef, ground, 93% lean meat / 7% fat, crumbles, cooked, pan-browned'],
  ['sirloin', 'Beef, top sirloin, steak, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, broiled'],
  ['steak', 'Beef, top sirloin, steak, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, broiled'],
  ['bacon', 'Pork, cured, bacon, cooked, baked'],
  ['egg white', 'Egg, white, raw, fresh'],
  ['egg', 'Egg, whole, cooked, hard-boiled'],
  ['brown rice', "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)"],
  ['rice', 'Rice, white, long-grain, regular, enriched, cooked'],
  ['oatmeal', 'Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt'],
  ['oat', 'Cereals, oats, regular and quick, not fortified, dry'],
  ['pasta', 'Pasta, cooked, enriched, without added salt'],
  ['flour tortilla', 'Tortillas, ready-to-bake or -fry, flour, shelf stable'],
  ['tortilla', 'Tortillas, ready-to-bake or -fry, corn'],
  ['bread', 'Bread, whole-wheat, commercially prepared'],
  ['bagel', 'Bagels, plain, enriched, with calcium propionate (includes onion, poppy, sesame)'],
  ['avocado', 'Avocados, raw, all commercial varieties'],
  ['orange', "Oranges, raw, navels (Includes foods for USDA's Food Distribution Program)"],
  ['kiwi', 'Kiwifruit, green, raw'],
  ['cauliflower rice', 'Cauliflower, raw'],
  ['cauliflower', 'Cauliflower, cooked, boiled, drained, without salt'],
  ['cooked spinach', 'Spinach, cooked, boiled, drained, without salt'],
  ['spinach', 'Spinach, raw'],
  ['olive oil', 'Oil, olive, salad or cooking'],
  ['banana', 'Bananas, raw'],
  ['apple', "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)"],
  ['grape', 'Grapes, red or green (European type, such as Thompson seedless), raw'],
  ['almond milk', 'Beverages, almond milk, unsweetened, shelf stable'],
  ['peanut butter', 'Peanut butter, smooth style, without salt'],
  ['almond', 'Nuts, almonds, dry roasted, without salt added'],
  ['sweet potato', 'Sweet potato, cooked, baked in skin, flesh, without salt'],
  ['potato', 'Potatoes, baked, flesh and skin, without salt'],
  ['broccoli', 'Broccoli, cooked, boiled, drained, without salt'],
  ['tofu', 'Tofu, raw, firm, prepared with calcium sulfate'],
  ['black bean', 'Beans, black, mature seeds, cooked, boiled, without salt'],
];
// Words that don't change which staple you mean.
const NEUTRAL = ['grilled', 'baked', 'cooked', 'roasted', 'plain', 'lean', 'boneless', 'skinless', 'fresh', 'whole', 'white', 'regular', 'large', 'medium', 'small', 'organic', 'raw', 'steamed', 'boiled', 'hard', 'boiled'];

function stapleFor(words, db) {
  const typed = words.map(stem).join(' ');
  for (const [k, desc] of STAPLES) {
    const keyWords = k.split(' ');
    if (!keyWords.every(w => typed.split(' ').includes(stem(w)))) continue;
    const rest = words.filter(w => !keyWords.includes(stem(w)) && !NEUTRAL.includes(w));
    if (rest.length) continue;
    const hit = db.find(x => x.d === desc);
    if (hit) return hit;
  }
  return null;
}

// Categories you rarely mean unless you say so (typing "almond milk" shouldn't find chocolate almonds).
const UNLIKELY_CATS = {
  'Sweets': /candy|candies|chocolate|cookie|cake|syrup|sugar|gum|jam|jelly|pudding/,
  'Snacks': /chip|cracker|pretzel|popcorn|snack|bar/,
  'Fast Foods': /fast|burger|pizza|fries|nugget|taco|burrito/,
  'Meals, Entrees, and Side Dishes': /meal|entree|casserole|lasagna|pizza/,
  'Soups, Sauces, and Gravies': /soup|sauce|gravy|broth/,
  'Sausages and Luncheon Meats': /sausage|deli|luncheon|salami|ham|hot dog|bologna|pepperoni/,
  'Fats and Oils': /oil|butter|margarine|mayo|dressing|lard/,
  'Baked Products': /bread|bagel|muffin|cookie|cake|tortilla|biscuit|cracker|pie|roll|bun|croissant|waffle|pancake/,
};

function scoreFood(x, words, typed) {
  const hit = w => {
    const s = stem(w);
    return x.words.includes(s) || (SYNONYMS[w] || []).some(v => x.words.includes(stem(v)));
  };
  let sc = words.filter(hit).length / words.length;
  if (sc < 0.99) return sc - 1;
  const firstSeg = x.lc.split(',')[0];
  if (words.some(w => stem(w) === x.words[0] || firstSeg.includes(w))) sc += 0.15;
  AVOID.forEach(a => { if (x.lc.includes(a) && !typed.includes(a.trim())) sc -= 0.15; });
  ['oil', 'cracker', 'candies', 'cookies', 'gluten-free', 'fat-free', 'omega', 'flavor', 'sticks'].forEach(a => { if (x.lc.includes(a) && !typed.includes(a)) sc -= 0.3; });
  const unlikely = UNLIKELY_CATS[x.cat];
  if (unlikely && !unlikely.test(typed)) sc -= 0.5;
  if (/meat and skin|with skin/.test(x.lc) && !/skin/.test(typed) && !/apple|potato|pear/.test(typed)) sc -= 0.2;
  if (COOKED.test(typed) && /\braw\b/.test(x.lc)) sc -= 0.4;
  if (!COOKED.test(typed) && /\braw\b/.test(x.lc) && /(chicken|beef|pork|turkey|salmon|fish|shrimp|steak|sirloin|egg|rice|bean|lentil|pasta|potato|oat|quinoa)/.test(typed)) sc -= 0.2;
  return sc - x.d.length / 1500;
}

function cupsIn(p) {
  const t = p.text;
  if (/\bcup/.test(t)) return p.amount;
  if (/\b(tbsp|tablespoon)/.test(t)) return p.amount / 16;
  if (/\b(tsp|teaspoon)/.test(t)) return p.amount / 48;
  if (/\bfl oz/.test(t)) return p.amount / 8;
  return null;
}

function gramsFor(parsed, food) {
  const { qty, unit, unitTok } = parsed;
  if (unit && unit.g) return { g: qty * unit.g, note: '' };
  const usable = food.portions.filter(p => p.g && p.amount);
  if (unit && unit.vol) {
    const p = usable.find(cupsIn);
    if (p) return { g: qty * unit.vol * (p.g / cupsIn(p)), note: '' };
    const liquid = /\b(milk|juice|beverage|soup|coffee|tea|water|broth|smoothie|drink)\b/.test(food.lc);
    return { g: qty * unit.vol * (liquid ? 240 : 150), note: 'cup size estimated' };
  }
  if (!unit && qty >= 4) {
    for (const x of usable) {
      const m = x.text.match(/\((\d+)\s+(?:whole\s+)?(kernels|nuts|almonds|pieces|halves|chips|crackers)\)/);
      if (m) return { g: qty * x.g / x.amount / Number(m[1]), note: '' };
    }
  }
  const want = stem(unitTok || '');
  const p = (want && usable.find(x => x.text.split(/[^a-z]+/).map(stem).includes(want)))
    || usable.find(x => /\bmedium\b/.test(x.text))
    || usable.find(x => !cupsIn(x))
    || usable[0];
  if (p) return { g: qty * p.g / p.amount, note: '' };
  return { g: qty * 100, note: 'per 100 g' };
}

// The built-in food whose name covers every typed word with the fewest extra words ("2 eggs" is a whole egg, not egg whites).
const FILLER = ['whole', 'plain', 'fresh', 'medium', 'large', 'small', 'cooked', 'raw', 'cup', 'oz', 'tbsp', 'slice'];
function bestLocal(words) {
  const typed = words.map(stem);
  return FOODS.map(x => {
    if (x.brand && !typed.includes(stem(x.brand.toLowerCase()))) return null;
    const nameWords = x.name.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z0-9%&]+/).filter(Boolean).map(stem);
    const all = x.name.toLowerCase();
    if (!typed.every(w => nameWords.includes(w) || all.includes(w))) return null;
    const extra = nameWords.filter(w => !typed.includes(w) && !FILLER.includes(w)).length;
    return { x, sc: -extra - x.name.length / 1000 };
  }).filter(Boolean).sort((a, b) => b.sc - a.sc).map(o => o.x)[0] || null;
}

// How many of a built-in food's servings the typed amount is, or null when the units don't line up.
function localFactor(local, parsed) {
  const { qty, unit, unitTok } = parsed;
  if (!unit && qty >= 4 && /\(\S+\s*(oz|cup|tbsp|tsp)/i.test(local.name)) return null;
  if (local.brand || !unit) return qty;
  const m = local.name.toLowerCase().match(/\((\d+\/\d+|\d*\.?\d+)\s*(cup|tbsp|tsp|oz)s?\b/);
  if (m && unit.label === m[2]) {
    const [a, b] = m[1].split('/').map(Number);
    return qty / (b ? a / b : a);
  }
  if (unit.count && local.name.toLowerCase().includes(stem(unitTok))) return qty;
  return null;
}

function niceName(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const STOP = ['and', 'with', 'the', 'of', 'a', 'an', 'some', 'my', 'piece', 'pieces', 'serving', 'servings'];

// Your own entries first, then built-in foods (they carry a serving), then the USDA database with real portion weights.
async function resolveFood(text) {
  const raw = text.trim();
  if (!raw) return null;
  const known = (state.myFoods || []).find(m => m.name.toLowerCase() === raw.toLowerCase());
  if (known) return { ...known, src: 'My foods' };

  const parsed = parseFood(raw);
  const words = parsed.food.split(/\s+/).filter(w => w.length > 1 && !STOP.includes(w));
  if (!words.length) return null;

  const local = bestLocal(words);
  const factor = local && localFactor(local, parsed);
  if (factor) {
    return { name: niceName(raw), cal: Math.round(local.cal * factor), p: r1(local.p * factor), f: r1(local.f * factor),
      dairy: isDairy(local), approx: local.approx, match: `${local.name}${factor !== 1 ? ` × ${r1(factor)}` : ''}`, src: local.brand || 'Built-in' };
  }

  const db = await loadUsda();
  const staple = stapleFor(words, db);
  let best = staple ? { x: staple, sc: 9 } : null;
  if (!staple) for (const x of db) {
    const sc = scoreFood(x, words, parsed.food);
    if (!best || sc > best.sc) best = { x, sc };
  }
  let loose = false;
  if ((!best || best.sc < 0.5) && words.length > 1) {
    const fewer = words.slice(0, -1);
    for (const x of db) {
      const sc = scoreFood(x, fewer, parsed.food);
      if (!best || sc > best.sc) best = { x, sc };
    }
    loose = best && best.sc >= 0.5;
  }
  if (!best || best.sc < 0.5) {
    if (!local) return null;
    return { name: niceName(raw), cal: Math.round(local.cal * parsed.qty), p: r1(local.p * parsed.qty), f: r1(local.f * parsed.qty),
      dairy: isDairy(local), approx: true, match: `${local.name} × ${r1(parsed.qty)} (closest match)`, src: 'Built-in' };
  }
  const food = best.x;
  const { g, note } = gramsFor(parsed, food);
  const s = g / 100;
  return {
    name: niceName(raw),
    cal: Math.round(food.kcal * s),
    p: r1(food.p * s),
    f: r1(food.f * s),
    dairy: hasDairy(food.d),
    match: `${food.d} · ${Math.round(g)} g${note ? ` (${note})` : ''}${loose ? ' (closest match)' : ''}`,
    src: 'USDA',
  };
}

let preview = null;      // { text, state: 'loading' | 'ready' | 'none' | 'error', food }
let previewTimer = null;
const previewCache = {};

function previewHtml() {
  if (!preview || !foodQuery.trim()) return '';
  if (preview.state === 'loading') return '<div class="eat-preview muted searching">Working it out…</div>';
  if (preview.state === 'none') return '<div class="eat-preview muted">Couldn\'t find that. Try simpler words, like "baked sweet potato".</div>';
  if (preview.state === 'error') return '<div class="eat-preview muted">The food database didn\'t load. Refresh the page and try again.</div>';
  const x = preview.food;
  return `<div class="eat-preview ready ${x.dairy ? 'has-dairy' : ''}">
    <div class="ep-main">
      <b>${esc(x.name)}</b>
      <span class="ep-macros">${x.approx ? '≈' : ''}${fmt(x.cal)} cal · ${r1(x.p)} g protein · ${r1(x.f)} g fiber</span>
      <small class="muted">${esc(x.match || '')}${x.src ? ` · ${esc(x.src)}` : ''}</small>
      ${x.dairy ? '<span class="dairy-tag">Contains dairy</span>' : ''}
    </div>
    <button class="btn primary sm" data-act="food-commit">Add</button>
  </div>`;
}

function paintPreview() {
  const box = document.getElementById('eat-preview');
  if (box) box.innerHTML = previewHtml();
}

function schedulePreview(now) {
  clearTimeout(previewTimer);
  const text = foodQuery.trim();
  if (text.length < 3) { preview = null; paintPreview(); return Promise.resolve(null); }
  if (previewCache[text.toLowerCase()]) { preview = { text, state: 'ready', food: previewCache[text.toLowerCase()] }; paintPreview(); return Promise.resolve(preview.food); }
  preview = { text, state: 'loading' };
  paintPreview();
  return new Promise(resolve => {
    previewTimer = setTimeout(async () => {
      try {
        const food = await resolveFood(text);
        if (text !== foodQuery.trim()) return resolve(null);
        if (food) previewCache[text.toLowerCase()] = food;
        preview = food ? { text, state: 'ready', food } : { text, state: 'none' };
      } catch (err) {
        if (text !== foodQuery.trim()) return resolve(null);
        preview = { text, state: 'error' };
      }
      paintPreview();
      resolve(preview.state === 'ready' ? preview.food : null);
    }, now ? 0 : 350);
  });
}

async function commitFood(k) {
  const text = foodQuery.trim();
  if (!text) return;
  const food = preview && preview.state === 'ready' && preview.text === text ? preview.food : await schedulePreview(true);
  if (!food) return;
  addFood(k, food, foodMeal);
  rememberFood(food);
  foodQuery = '';
  preview = null;
  save();
  toast(`Added ${food.name}`);
  const y = window.scrollY; renderFood(k); window.scrollTo(0, y);
  const inp = app.querySelector('.eat-input'); if (inp) inp.focus();
}

function quickPicksHtml() {
  const mine = (state.myFoods || []).map((x, i) => ({ x, i })).slice(-8).reverse();
  return `
    <h3>Plan meals</h3><ul class="food-list">${PLAN_MEALS.map((x, i) => foodRow(x, i, 'plan')).join('')}</ul>
    ${mine.length ? `<h3>Recent</h3><ul class="food-list">${mine.map(o => foodRow(o.x, o.i, 'mine')).join('')}</ul>` : ''}`;
}

function renderFood(k) {
  if (!foodMeal) foodMeal = defaultMeal();
  const t = foodTotals(k);
  const items = dayFood(k);
  const prevK = key(addDays(parseKey(k), -1));
  const nextK = key(addDays(parseKey(k), 1));

  const logged = MEALS.map(m => {
    const list = items.filter(x => x.meal === m);
    if (!list.length) return '';
    return `<div class="meal-group"><h3>${m}</h3><ul class="food-list logged">${list.map(x => `
      <li class="food-pick ${isDairy(x) ? 'has-dairy' : ''}">
        <div class="fn"><b>${esc(x.name)}${x.qty !== 1 ? ` <em>×${x.qty}</em>` : ''}</b><small>${r1(x.p * x.qty)} g protein · ${r1(x.f * x.qty)} g fiber · ${fmt(x.cal * x.qty)} cal</small>
          ${isDairy(x) ? '<span class="dairy-tag">Contains dairy</span>' : ''}</div>
        <div class="qty">
          <button data-act="food-qty" data-id="${x.id}" data-d="-0.5" aria-label="Less">−</button>
          <button data-act="food-qty" data-id="${x.id}" data-d="0.5" aria-label="More">＋</button>
          <button data-act="food-del" data-id="${x.id}" aria-label="Remove">✕</button>
        </div>
      </li>`).join('')}</ul></div>`;
  }).join('');

  app.innerHTML = `
    <div class="nav-row">
      <a class="icon-btn" href="#/food/${prevK}" aria-label="Previous day">‹</a>
      <div class="center"><div class="eyebrow">${k === todayKey() ? 'Today' : esc(shortDate(k))}</div><h1 class="h-sm">Nutrition</h1></div>
      <a class="icon-btn" href="#/food/${nextK}" aria-label="Next day">›</a>
    </div>

    <section class="card juicy">
      ${foodMeter('Protein', t.p, GOALS.protein, 'g', 'protein')}
      ${foodMeter('Fiber', t.f, GOALS.fiber, 'g', 'fiber')}
      ${foodMeter('Calories', t.cal, GOALS.calories, 'cal', 'kcal')}
      <ul class="coach-list">${foodCoach(k).map(c => `<li><span>${c.e}</span><div>${c.html}</div></li>`).join('')}</ul>
    </section>

    ${logged ? `<section class="card">${logged}</section>` : ''}

    <section class="card">
      <div class="card-head"><h2>What did you eat?</h2></div>
      <div class="meal-chips" role="group" aria-label="Meal">
        ${MEALS.map(m => `<button class="mchip ${m === foodMeal ? 'on' : ''}" data-act="food-meal" data-meal="${m}">${m}</button>`).join('')}
      </div>
      <div class="eat-row">
        <input type="text" class="eat-input" placeholder="e.g. 1/2 cup baked sweet potato" autocomplete="off" enterkeyhint="done" value="${esc(foodQuery)}" data-act="food-search" aria-label="What did you eat?">
      </div>
      <div id="eat-preview">${previewHtml()}</div>
      ${quickPicksHtml()}
      <div class="row-btns left">
        <button class="btn ghost sm" data-act="food-plan" data-k="${k}">Add full plan day</button>
        <button class="btn ghost sm" data-act="food-copy" data-k="${k}">Copy yesterday</button>
      </div>
    </section>
    <p class="fineprint">Goals: ${GOALS.protein} g protein and ${GOALS.fiber}+ g fiber to grow muscle, about ${fmt(GOALS.calories)} cal to lose fat. Values come from the USDA food database (built in) and are estimates.</p>
  `;
  app.dataset.k = k;
}

function addFood(k, x, meal) {
  if (!state.food) state.food = {};
  const list = state.food[k] || (state.food[k] = []);
  list.push({ id: uid(), name: x.name, brand: x.brand || '', dairy: isDairy(x), cal: num(x.cal), p: num(x.p), f: num(x.f), qty: 1, meal: meal || x.meal || foodMeal || defaultMeal() });
}

// Everything you type is remembered, so the same entry is instant next time.
function rememberFood(x) {
  if (!state.myFoods) state.myFoods = [];
  state.myFoods = state.myFoods.filter(m => m.name.toLowerCase() !== x.name.toLowerCase());
  state.myFoods.push({ name: x.name, dairy: isDairy(x), approx: x.approx, cal: x.cal, p: x.p, f: x.f, match: x.match });
  if (state.myFoods.length > 200) state.myFoods.shift();
}

/* ---------- store needs ---------- */

function guessCat(name) {
  const n = name.toLowerCase();
  const order = ['frozen', 'care', 'dairy', 'protein', 'produce', 'pantry'];
  for (const id of order) {
    if (STORE_CATS.find(c => c.id === id).words.some(w => n.includes(w))) return id;
  }
  return 'other';
}

function addStoreItems(names) {
  if (!state.store) state.store = [];
  const have = new Set(state.store.filter(x => !x.done).map(x => x.name.toLowerCase()));
  let added = 0;
  names.forEach(n => {
    if (have.has(n.toLowerCase())) return;
    state.store.push({ id: uid(), name: n, cat: guessCat(n), done: false });
    have.add(n.toLowerCase());
    added++;
  });
  return added;
}

const DAY_MS = 86400000;
const storeKey = name => name.trim().toLowerCase();

function storeTabs(active) {
  return `<nav class="subtabs store-tabs" aria-label="Store needs">
    <a href="#/store" class="${active === 'list' ? 'on' : ''}">List</a>
    <a href="#/store/history" class="${active === 'history' ? 'on' : ''}">History &amp; trends</a>
  </nav>`;
}

function renderStore(view) {
  if (view === 'history') return renderStoreHistory();
  const items = state.store || [];
  const toBuy = items.filter(x => !x.done).length;
  const bought = items.filter(x => x.done).length;
  const onList = new Set(items.map(x => storeKey(x.name)));
  const again = storeTrends().top.filter(t => !onList.has(t.key)).slice(0, 8);

  const groups = STORE_CATS.map(c => {
    const list = items.filter(x => x.cat === c.id);
    if (!list.length) return '';
    return `<div class="store-group"><h3>${c.e} ${c.name}</h3><ul class="store-list">${list.map(x => `
      <li class="${x.done ? 'done' : ''}">
        <label><input type="checkbox" data-act="store-toggle" data-id="${x.id}" ${x.done ? 'checked' : ''}><span class="box"></span><span class="sn">${esc(x.name)}</span></label>
        <button class="x" data-act="store-del" data-id="${x.id}" aria-label="Remove ${esc(x.name)}">✕</button>
      </li>`).join('')}</ul></div>`;
  }).join('');

  app.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">Store needs</h1>
      <span class="pill">${toBuy} to get</span>
    </div>
    ${storeTabs('list')}
    <section class="card">
      <form class="quick-add" data-form="store-add">
        <input name="name" placeholder="Add an item" maxlength="60" required aria-label="Item" autocomplete="off">
        <button class="btn primary" type="submit">Add</button>
      </form>
      ${again.length ? `<div class="again"><span class="muted">Buy again:</span>${again.map(t => `<button class="again-chip" data-act="store-again" data-name="${esc(t.name)}">+ ${esc(t.name)}</button>`).join('')}</div>` : ''}
      <div class="row-btns left">
        <button class="btn ghost sm" data-act="store-plan">Meal-plan staples</button>
        <button class="btn ghost sm" data-act="store-fiber">High-fiber staples</button>
      </div>
    </section>
    ${groups ? `<section class="card"><div class="store-actions"><span class="muted">${items.length} item${items.length > 1 ? 's' : ''}</span><button class="btn link-danger" data-act="store-clear-all">Clear all</button></div>${groups}</section>
      <div class="finish-bar ${bought ? 'active' : ''}">
        <button class="btn primary block" data-act="store-finish" ${bought ? '' : 'disabled'}>${bought ? `Finish trip · ${bought} bought` : 'Check off items as you shop'}</button>
        ${bought && toBuy ? `<p class="muted center">${toBuy} unchecked item${toBuy > 1 ? 's' : ''} will stay on the list.</p>` : ''}
      </div>`
      : `<div class="empty"><div class="big-emoji">🛒</div><p>The list is empty. Add something above.</p></div>`}
  `;
}

// What we buy most, how often, and when we last got it.
function storeTrends() {
  const trips = state.trips || [];
  const byItem = {};
  const byCat = {};
  trips.forEach(t => t.items.forEach(i => {
    const k = storeKey(i.name);
    const e = byItem[k] || (byItem[k] = { key: k, name: i.name, cat: i.cat, count: 0, dates: [] });
    e.count++;
    e.dates.push(t.date);
    e.name = i.name;
    byCat[i.cat] = (byCat[i.cat] || 0) + 1;
  }));
  const top = Object.values(byItem).map(e => {
    const ds = [...new Set(e.dates)].sort();
    const every = ds.length > 1 ? Math.round((parseKey(ds[ds.length - 1]) - parseKey(ds[0])) / DAY_MS / (ds.length - 1)) : null;
    return { ...e, last: ds[ds.length - 1], every };
  }).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  const totalItems = trips.reduce((n, t) => n + t.items.length, 0);
  return { trips, top, byCat, totalItems };
}

function renderStoreHistory() {
  const { trips, top, byCat, totalItems } = storeTrends();
  const maxCount = top.length ? top[0].count : 1;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const catMax = cats.length ? cats[0][1] : 1;
  const thisMonth = trips.filter(t => t.date.startsWith(monthKey(new Date()))).length;

  app.innerHTML = `
    <div class="page-head"><h1 class="page-title">Store needs</h1></div>
    ${storeTabs('history')}
    ${trips.length ? `
      <div class="tiles store-tiles">
        <div class="tile"><span>Trips</span><b>${trips.length}</b><span class="delta">${thisMonth} this month</span></div>
        <div class="tile"><span>Items bought</span><b>${totalItems}</b></div>
        <div class="tile"><span>Avg per trip</span><b>${fmt(totalItems / trips.length)}</b></div>
      </div>
      <section class="card">
        <h2>What we buy most</h2>
        <ul class="trend-list">${top.slice(0, 10).map(t => `
          <li>
            <div class="trend-top"><b>${esc(t.name)}</b><span>${t.count}×</span></div>
            <div class="trend-bar"><i style="width:${t.count / maxCount * 100}%"></i></div>
            <small class="muted">${t.every ? `About every ${t.every} day${t.every === 1 ? '' : 's'} · ` : ''}last bought ${esc(shortDate(t.last))}</small>
          </li>`).join('')}</ul>
      </section>
      <section class="card">
        <h2>By category</h2>
        <ul class="trend-list">${cats.map(([id, n]) => {
          const c = STORE_CATS.find(x => x.id === id) || STORE_CATS[STORE_CATS.length - 1];
          return `<li><div class="trend-top"><b>${c.e} ${c.name}</b><span>${n}</span></div><div class="trend-bar"><i style="width:${n / catMax * 100}%"></i></div></li>`;
        }).join('')}</ul>
      </section>
      <section class="card">
        <h2>Past trips</h2>
        ${trips.slice().reverse().map(t => `
          <details class="trip">
            <summary><b>${esc(prettyDate(t.date))}</b><span class="muted">${t.items.length} item${t.items.length > 1 ? 's' : ''}</span></summary>
            <p class="trip-items">${t.items.map(i => esc(i.name)).join(' · ')}</p>
            <button class="btn ghost sm" data-act="trip-del" data-id="${t.id}">Delete trip</button>
          </details>`).join('')}
      </section>`
    : `<div class="empty"><div class="big-emoji">🧾</div><p>No trips yet. When you finish a shopping trip, what you bought is saved here, and trends show up after a few trips.</p></div>`}
  `;
}

/* ---------- wishlist ---------- */

function workoutsSince(k) {
  return Object.keys(state.logs).filter(d => d >= k && state.logs[d].done && logHasData(state.logs[d])).length;
}

function safeUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; }
}

function renderWish() {
  const list = state.wish || [];
  const open = list.filter(x => !x.bought);
  const bought = list.filter(x => x.bought);
  const total = open.reduce((s, x) => s + num(x.price), 0);
  let celebrate = false;

  const card = x => {
    const done = x.goal ? workoutsSince(x.added) : 0;
    const earned = x.goal && done >= x.goal;
    if (earned && !x.celebrated && !x.bought) { x.celebrated = true; celebrate = true; }
    return `<article class="wish ${earned ? 'earned' : ''} ${x.bought ? 'bought' : ''}">
      <h3>${esc(x.name)}</h3>
      ${num(x.price) ? `<div class="price">$${r1(num(x.price)).toLocaleString()}</div>` : ''}
      ${x.goal && !x.bought ? `<div class="earn">
          <div class="fbar"><i style="width:${Math.min(100, done / x.goal * 100)}%"></i></div>
          <small>${earned ? '<span class="earned-tag">Earned. Treat yourself.</span>' : `${done} / ${x.goal} workouts to earn it`}</small>
        </div>` : ''}
      <div class="wish-actions">
        ${x.url ? `<a class="btn ghost sm" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">View</a>` : ''}
        <button class="btn ${x.bought ? 'ghost' : 'primary'} sm" data-act="wish-bought" data-id="${x.id}">${x.bought ? 'Undo' : 'Bought'}</button>
        <button class="x" data-act="wish-del" data-id="${x.id}" aria-label="Remove ${esc(x.name)}">✕</button>
      </div>
    </article>`;
  };

  app.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">Wishlist</h1>
      ${total ? `<span class="pill">$${fmt(total)} total</span>` : ''}
    </div>
    <details class="card juicy add-wish" ${list.length ? '' : 'open'}>
      <summary><b>Add an item</b></summary>
      <form data-form="wish-add">
        <label class="field"><span>What is it?</span><input name="name" required maxlength="60" placeholder="e.g. Ribbed matching set"></label>
        <div class="grid2">
          <label class="field"><span>Price $</span><input name="price" type="number" inputmode="decimal" min="0" step="0.01"></label>
          <label class="field"><span>Earn it after</span><input name="goal" type="number" inputmode="numeric" min="0" placeholder="# workouts"></label>
        </div>
        <label class="field"><span>Link (optional)</span><input name="url" type="text" inputmode="url" autocomplete="off" placeholder="Paste a link"></label>
        <button class="btn primary block" type="submit">Add to wishlist</button>
      </form>
    </details>
    ${open.length ? `<div class="wish-grid">${open.sort((a, b) => (b.goal && workoutsSince(b.added) >= b.goal) - (a.goal && workoutsSince(a.added) >= a.goal)).map(card).join('')}</div>`
      : `<div class="empty"><p>Add clothes, gear and treats. Set a workout goal to <b>earn</b> each one.</p></div>`}
    ${bought.length ? `<details class="card"><summary><b>Bought (${bought.length})</b></summary><div class="wish-grid">${bought.map(card).join('')}</div></details>` : ''}
  `;
  if (celebrate) { save(); confetti(); toast('You earned something on your wishlist'); }
}

/* ---------- events ---------- */

app.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const k = app.dataset.k;

  if (act === 'food-meal') { foodMeal = t.dataset.meal; renderFood(k); }
  if (act === 'food-add') {
    const src = { plan: PLAN_MEALS, mine: state.myFoods || [] }[t.dataset.src];
    const x = src[Number(t.dataset.i)];
    addFood(k, x, t.dataset.src === 'plan' ? x.meal : foodMeal);
    save(); toast(`Added ${shortFood(x.name)}`);
    const y = window.scrollY; renderFood(k); window.scrollTo(0, y);
  }
  if (act === 'food-qty' || act === 'food-del') {
    const list = state.food[k] || [];
    const i = list.findIndex(x => x.id === t.dataset.id);
    if (i < 0) return;
    if (act === 'food-del') list.splice(i, 1);
    else list[i].qty = Math.max(0.5, list[i].qty + Number(t.dataset.d));
    save();
    const y = window.scrollY; renderFood(k); window.scrollTo(0, y);
  }
  if (act === 'food-commit') commitFood(k);
  if (act === 'food-plan') { PLAN_MEALS.forEach(x => addFood(k, x, x.meal)); save(); toast('Plan day added'); renderFood(k); }
  if (act === 'food-copy') {
    const y = dayFood(key(addDays(parseKey(k), -1)));
    if (!y.length) { toast('Nothing logged yesterday'); return; }
    y.forEach(x => { addFood(k, x, x.meal); state.food[k][state.food[k].length - 1].qty = x.qty; });
    save(); toast('Copied yesterday'); renderFood(k);
  }

  if (act === 'store-del') { state.store = state.store.filter(x => x.id !== t.dataset.id); save(); renderStore(); }
  if (act === 'store-plan') { const n = addStoreItems(PLAN_GROCERIES); save(); toast(n ? `Added ${n} items` : 'Already on the list'); renderStore(); }
  if (act === 'store-fiber') { const n = addStoreItems(FIBER_BOOSTERS); save(); toast(n ? `Added ${n} items` : 'Already on the list'); renderStore(); }
  if (act === 'store-clear-all' && confirm('Clear every item from the list? Your trip history stays.')) {
    state.store = []; save(); toast('List cleared'); renderStore();
  }
  if (act === 'store-again') { addStoreItems([t.dataset.name]); save(); renderStore(); }
  if (act === 'store-finish') {
    const bought = state.store.filter(x => x.done);
    if (!bought.length) return;
    if (!state.trips) state.trips = [];
    state.trips.push({ id: uid(), date: todayKey(), at: new Date().toISOString(), items: bought.map(x => ({ name: x.name, cat: x.cat })) });
    state.store = state.store.filter(x => !x.done);
    save(); toast(`Trip saved · ${bought.length} item${bought.length > 1 ? 's' : ''}`); renderStore();
  }
  if (act === 'trip-del' && confirm('Delete this trip from the history?')) {
    state.trips = state.trips.filter(x => x.id !== t.dataset.id); save(); renderStoreHistory();
  }

  if (act === 'wish-bought') {
    const x = state.wish.find(w => w.id === t.dataset.id);
    x.bought = !x.bought; save();
    if (x.bought) toast('Enjoy it');
    renderWish();
  }
  if (act === 'wish-del' && confirm('Remove this from your wishlist?')) {
    state.wish = state.wish.filter(x => x.id !== t.dataset.id); save(); renderWish();
  }
});

app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act === 'store-toggle') {
    const x = state.store.find(i => i.id === t.dataset.id);
    x.done = t.checked; save();
    const y = window.scrollY; renderStore(); window.scrollTo(0, y);
  }
});

app.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.act === 'food-search') {
    foodQuery = t.value;
    schedulePreview();
  }
});

app.addEventListener('keydown', e => {
  if (e.target.dataset && e.target.dataset.act === 'food-search' && e.key === 'Enter') {
    e.preventDefault();
    commitFood(app.dataset.k);
  }
});

app.addEventListener('submit', e => {
  const f = e.target;
  const form = f.dataset.form;
  if (!form) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));

  if (form === 'store-add') {
    const name = (d.name || '').trim();
    if (!name) return;
    addStoreItems([name]); save(); renderStore();
    const inp = app.querySelector('.quick-add input'); if (inp) inp.focus();
  }
  if (form === 'wish-add') {
    if (!state.wish) state.wish = [];
    state.wish.unshift({
      id: uid(), name: d.name.trim(), price: d.price, url: safeUrl(d.url),
      goal: Math.max(0, Math.round(num(d.goal))), added: todayKey(), bought: false,
    });
    save(); toast('Added to your wishlist'); renderWish();
  }
});
