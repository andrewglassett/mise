// The shopping list: what's on it, which store section each thing is in, and
// how amounts for the same thing from different recipes add up. The list
// itself is kept by account.js, which syncs it with favorites.
//
//   items:  { [id]: { id, name, section, amounts: [{ qty, max, unit, recipeId }],
//                     recipes: { [recipeId]: title }, manual, checked, at } }
//           A removed item stays as { id, deleted: true, at } for a while, so
//           another device doesn't bring it back.
//   aisles: { [key]: { section, at } }  sections you picked, remembered per thing

import { fmtQty, unitLabel } from './format.js';

// In the order you'd usually walk a store.
export const SECTIONS = [
  ['produce', 'Produce'],
  ['bakery', 'Bakery'],
  ['meat', 'Meat & seafood'],
  ['dairy', 'Dairy & eggs'],
  ['pantry', 'Pantry'],
  ['sauces', 'Oils, sauces & condiments'],
  ['spices', 'Spices'],
  ['baking', 'Baking'],
  ['frozen', 'Frozen'],
  ['drinks', 'Drinks'],
  ['household', 'Household'],
  ['other', 'Other'],
];

// Words and phrases per section. The longest match wins, so "garlic powder"
// lands in Spices and "garlic" in Produce, "coconut milk" in Pantry and
// "milk" in Dairy.
const WORDS = {
  produce: `garlic, onion, shallot, scallion, green onion, leek, ginger, galangal, lemongrass, lemon, lime, orange,
    apple, pear, banana, berry, strawberry, blueberry, raspberry, grape, pineapple, mango, avocado, tomato, potato,
    sweet potato, yam, carrot, celery, cucumber, zucchini, squash, pumpkin, eggplant, bell pepper, red pepper,
    green pepper, jalapeño, jalapeno, serrano, habanero, poblano, fresh chile, thai chili, bird's eye chili,
    green chili, chile threads, cabbage, kale, spinach, lettuce, arugula, chard, greens, broccoli, cauliflower,
    brussels sprout, bok choy, bean sprout, green bean, corn, fresh corn, mushroom, beet, beetroot, radish, turnip,
    fennel, fennel bulb, jicama, asparagus, pea, okra, artichoke, herb, cilantro, coriander leaves, parsley, basil,
    thai basil, mint, dill, chive, thyme, fresh thyme, rosemary, sage leaves, oregano leaves, tarragon, lime leaves,
    makrut lime leaves, lemon juice, lime juice, lemon zest, lime zest, orange zest, lemon peel, date, medjool date,
    fig, cherry, peach, plum, melon, watermelon, rhubarb, salad, fresh red chile, mustard greens, juice of lime,
    juice of a lime, juice of lemon, juice of a lemon`,
  bakery: `bread, baguette, bun, roll, tortilla, pita, naan, bagel, croissant, english muffin, sourdough loaf`,
  meat: `chicken, chicken thigh, chicken breast, beef, chuck, chuck roast, steak, ground beef, pork, ground pork,
    bacon, pancetta, prosciutto, ham, sausage, chorizo, salami, turkey, lamb, veal, duck, anchovy, fish, salmon,
    tuna, cod, shrimp, prawn, scallop, crab, clam, mussel, squid, eomuk, fish cake`,
  dairy: `milk, whole milk, butter, unsalted butter, cream, heavy cream, whipping cream, half-and-half, buttermilk,
    sour cream, crème fraîche, creme fraiche, mascarpone, cream cheese, cottage cheese, ricotta, yogurt,
    greek yogurt, cheese, cheddar, parmesan, parmigiano, gruyère, gruyere, mozzarella, feta, goat cheese, egg,
    egg yolk, egg white, ghee, soy milk, oat milk, almond milk, tofu, tteok, vegan cheese, vegan sour cream`,
  pantry: `rice, jasmine rice, basmati rice, sticky rice, pasta, noodle, spaghetti, ramen, oat, oats, quinoa, couscous,
    lentil, bean, black bean, kidney bean, cannellini bean, chickpea, canned, diced tomatoes, crushed tomatoes,
    whole tomatoes, tomato paste, tomato sauce, stock, broth, bouillon, chicken stock, chicken broth, beef stock,
    beef broth, vegetable stock, vegetable broth, coconut milk, nut, walnut, pecan, almond, cashew, peanut,
    hazelnut, pine nut, pistachio, seed, pumpkin seed, sunflower seed, sesame seed, chia seed, raisin, dried fruit,
    peanut butter, cashew butter, almond butter, cracker, graham cracker, oyster cracker, chip, tortilla chip,
    bread crumb, breadcrumb, panko, cereal, granola, kombu, dasima, dried anchovy, dried mushroom, wood-ear,
    nori, seaweed, masa harina, dried corn, fritos, nuts, pumpkin puree, pumpkin purée, canned in adobo`,
  sauces: `oil, olive oil, vegetable oil, canola oil, avocado oil, sesame oil, coconut oil, peanut oil, neutral oil,
    cooking spray, vinegar, soy sauce, fish sauce, oyster sauce, hoisin, hot sauce, sriracha, chili sauce,
    chili garlic sauce, chili paste, gochujang, miso, miso paste, mustard, dijon, mayonnaise, ketchup, worcestershire,
    tahini, honey, maple syrup, mirin, shaoxing, coconut aminos, marmite, horseradish, pesto, salsa, jam, sauce,
    pomegranate molasses, tamarind, nuoc cham, preserved lemon, capers, olive, pickle, salad dressing,
    dressing mix, ranch seasoning`,
  spices: `salt, kosher salt, sea salt, flaky salt, pepper, black pepper, white pepper, peppercorn, cayenne,
    paprika, smoked paprika, chili powder, chili flakes, red pepper flakes, chile flakes, aleppo pepper, gochugaru,
    cumin, coriander, coriander seed, turmeric, cinnamon, cinnamon stick, nutmeg, mace, allspice, clove, cardamom,
    star anise, fennel seed, mustard seed, mustard powder, celery seed, bay leaf, dried oregano, dried thyme,
    dried sage, dried marjoram, dried herb, oregano, marjoram, garlic powder, onion powder, granulated garlic,
    granulated onion, ground ginger, five-spice, curry powder, za'atar, sumac, msg, dried chile, dried chili, chile,
    chiles, guajillo, ancho, pasilla, morita, árbol, arbol, chipotle, pequin, kashmiri, sichuan peppercorn,
    juniper, saffron, vanilla bean, spice`,
  baking: `flour, all-purpose flour, bread flour, cake flour, rye flour, whole wheat flour, rice flour, almond meal,
    sugar, brown sugar, powdered sugar, cane sugar, coconut sugar, palm sugar, baking powder, baking soda, yeast,
    vanilla, vanilla extract, cocoa, cocoa powder, cacao, chocolate, chocolate chip, cornstarch, potato starch,
    tapioca starch, cornmeal, molasses, corn syrup, golden syrup, malt syrup, malt powder, condensed milk,
    sweetened condensed milk, evaporated milk, milk powder, shortening, lard, gelatin, sprinkles, shredded coconut,
    coconut flakes, food coloring, lye, kansui, dough conditioner, dulce de leche, chocolate bar, hershey,
    icing`,
  frozen: `frozen, ice cream, sherbet, frozen peas, puff pastry, ice`,
  drinks: `wine, red wine, white wine, sherry, rum, vodka, gin, whiskey, bourbon, beer, sake, juice, orange juice,
    coffee, cold brew, tea, soda, sparkling water, club soda`,
  household: `paper towel, foil, plastic wrap, parchment, zip bag, dish soap, sponge, trash bag, napkin`,
};

// Things you almost always have, unticked when adding a recipe's ingredients.
const STAPLES = ['water', 'salt', 'kosher salt', 'sea salt', 'fine sea salt', 'table salt', 'pepper',
  'black pepper', 'salt and pepper', 'ice', 'starter', 'sourdough starter', 'levain', 'leaven', 'poolish',
  'discard', 'tangzhong'];

const IRREGULAR = { leaves: 'leaf', loaves: 'loaf', chilies: 'chili', chillies: 'chili' };

function singular(word) {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ch|sh|x|ss|o)es$/.test(word)) return word.replace(/es$/, '');
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** "Fresh Limes (about 2)" -> "fresh lime": what makes two lines the same thing. */
export function itemKey(name) {
  return String(name).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/&/g, ' and ')
    .split(/[^a-zà-ÿ']+/).filter(Boolean).map(singular).join(' ');
}

// Words that don't change what you buy: "peeled garlic" and "garlic cloves"
// are both garlic, "ancho chiles" and "chiles anchos" the same chile.
const FILLER = new Set(['peeled', 'whole', 'fresh', 'freshly', 'chopped', 'minced', 'sliced', 'diced', 'grated',
  'raw', 'toasted', 'large', 'small', 'medium', 'clove', 'head', 'of', 'dried', 'ground', 'finely', 'roughly']);

/** What makes two things the same on the list, whatever order the words are in. */
function matchKey(name) {
  const words = itemKey(name).split(' ');
  const kept = words.filter((w) => !FILLER.has(w));
  return (kept.length ? kept : words).sort().join(' ');
}

const PHRASES = Object.entries(WORDS).flatMap(([section, list]) => (
  list.split(',').map((p) => [itemKey(p), section]).filter(([p]) => p)
)).sort((a, b) => b[0].length - a[0].length);

/** The store section for a thing: the one you last chose for it, else a best guess. */
export function sectionFor(name, aisles = {}) {
  const key = itemKey(name);
  if (aisles[key]) return aisles[key].section;
  const padded = ` ${key} `;
  return PHRASES.find(([p]) => padded.includes(` ${p} `))?.[1] || 'other';
}

export function isStaple(name) {
  const key = itemKey(name);
  if (STAPLES.some((s) => key === itemKey(s))) return true;
  // Any plain salt or black pepper, but not the kind you'd buy specially.
  if (/\bsalt\b/.test(key) && !/\b(flaky|flake|maldon|pretzel|smoked|celery|garlic)\b/.test(key)) return true;
  return /\b(black pepper|water|starter|levain|discard|poolish|reserved)\b/.test(key);
}

/** "(½ cup) brown sugar" -> "Brown sugar". */
export function cleanName(name) {
  const s = String(name).replace(/^\([^)]*\)\s*/, '').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "3 onions + 1 cup + 200 g": amounts in the same unit added together. */
export function amountText(item) {
  const byUnit = new Map();
  for (const a of item.amounts || []) {
    if (a.qty == null) continue;
    const u = byUnit.get(a.unit || '') || { qty: 0, max: 0, range: false };
    u.qty += a.qty;
    u.max += a.max ?? a.qty;
    u.range ||= a.max != null;
    byUnit.set(a.unit || '', u);
  }
  return [...byUnit].map(([unit, u]) => {
    const n = u.range ? `${fmtQty(u.qty)}–${fmtQty(u.max)}` : fmtQty(u.qty);
    return [n, unitLabel(unit, u.max)].filter(Boolean).join(' ');
  }).join(' + ');
}

export function liveItems(list) {
  return Object.values(list.items).filter((i) => !i.deleted);
}

function findItem(list, name) {
  const key = matchKey(name);
  return liveItems(list).find((i) => matchKey(i.name) === key);
}

/** Whether a recipe's ingredient is already on the list for that recipe. */
export function onList(list, name, recipeId) {
  const item = findItem(list, name);
  return Boolean(item && !item.checked && item.recipes?.[recipeId]);
}

/**
 * Adds one thing to the list, joining it with the same thing already there.
 * `from` is { recipeId, title, qty, max, unit } for a recipe's ingredient, or
 * nothing for something typed in. Returns the changed list.
 */
export function addItem(list, name, from) {
  const at = Date.now();
  const amount = from && { qty: from.qty ?? null, max: from.max ?? null, unit: from.unit || null, recipeId: from.recipeId };
  let item = findItem(list, name);
  if (item && item.checked) {
    // Already bought: this is a new trip, so start the thing over.
    item = { ...item, amounts: [], recipes: {}, manual: false, checked: false };
  }
  if (!item) {
    item = {
      id: crypto.randomUUID(), name: cleanName(name), section: sectionFor(name, list.aisles),
      amounts: [], recipes: {}, manual: false, checked: false,
    };
  }
  const next = { ...item, amounts: [...item.amounts], recipes: { ...item.recipes }, at };
  // The plainest wording wins: "Garlic" over "Peeled garlic".
  if (cleanName(name).length < next.name.length) next.name = cleanName(name);
  if (from) {
    // Adding the same recipe again replaces its amount instead of doubling it.
    next.amounts = next.amounts.filter((a) => a.recipeId !== from.recipeId).concat(amount);
    next.recipes[from.recipeId] = from.title;
  } else {
    next.manual = true;
  }
  return { ...list, items: { ...list.items, [next.id]: next } };
}

export function updateItem(list, id, changes) {
  const item = { ...list.items[id], ...changes, at: Date.now() };
  const aisles = changes.section
    ? { ...list.aisles, [itemKey(item.name)]: { section: changes.section, at: item.at } }
    : list.aisles;
  return { ...list, aisles, items: { ...list.items, [id]: item } };
}

export function removeItems(list, ids) {
  const at = Date.now();
  const items = { ...list.items };
  for (const id of ids) items[id] = { id, deleted: true, at };
  return { ...list, items };
}

/** Takes a recipe's amounts off the list; things only that recipe needed go. */
export function removeRecipe(list, recipeId) {
  const at = Date.now();
  const items = { ...list.items };
  for (const item of liveItems(list)) {
    if (!item.recipes?.[recipeId]) continue;
    const recipes = { ...item.recipes };
    delete recipes[recipeId];
    const amounts = item.amounts.filter((a) => a.recipeId !== recipeId);
    items[item.id] = Object.keys(recipes).length || item.manual
      ? { ...item, recipes, amounts, at }
      : { id: item.id, deleted: true, at };
  }
  return { ...list, items };
}
