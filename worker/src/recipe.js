import { HttpError } from './google.js';

// Checks a converted recipe and fixes what can be fixed safely, so a small
// slip in the conversion never stops the app from reading recipes.json.

const TIME_PARTS = ['prep', 'cook', 'bake', 'proof', 'rest', 'active', 'total'];

// The units the app knows how to scale, and common ways of writing them.
// Anything else is dropped, and the line keeps its wording in raw.
const UNIT_NAMES = Object.fromEntries([
  ['cup', 'cups', 'c'], ['tbsp', 'tablespoon', 'tablespoons', 'tbs', 'tbl'],
  ['tsp', 'teaspoon', 'teaspoons'], ['g', 'gram', 'grams'], ['kg', 'kilogram', 'kilograms'],
  ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], ['l', 'liter', 'liters', 'litre', 'litres'],
  ['oz', 'ounce', 'ounces'], ['lb', 'lbs', 'pound', 'pounds'], ['clove', 'cloves'], ['can', 'cans'],
  ['stick', 'sticks'], ['stalk', 'stalks'], ['package', 'packages'], ['packet', 'packets'],
  ['pint', 'pints'], ['piece', 'pieces'], ['slice', 'slices'], ['inch', 'inches'],
].flatMap(([unit, ...alts]) => [unit, ...alts].map((a) => [a, unit])));

function slug(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recipe';
}

export function uniqueId(id, taken) {
  const base = slug(id);
  let next = base;
  for (let n = 2; taken.has(next); n += 1) next = `${base}-${n}`;
  return next;
}

function dropEmpty(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete obj[k];
  }
  return obj;
}

/** Returns the cleaned recipe. Throws when it can't be made valid. */
export function tidy(input, book) {
  const r = structuredClone(input);
  if (!r.title?.trim()) throw new Error('The recipe needs a title');
  r.title = r.title.trim();
  const categories = book.categories || [];
  if (categories.length && !categories.includes(r.category)) throw new Error(`Unknown category "${r.category}"`);
  r.id = uniqueId(r.id || r.title, new Set(book.recipes.map((x) => x.id)));

  if (r.totalTime) {
    // From the conversion: times arrive as totalTime plus a list of parts.
    const parts = (r.timeParts || []).filter((p) => TIME_PARTS.includes(p.part) && p.part !== 'total');
    r.times = Object.fromEntries(parts.map(({ part, ...t }) => [part, t]));
    if (r.totalTime.text?.trim()) r.times.total = r.totalTime;
    delete r.totalTime;
    delete r.timeParts;
  }

  const ingIds = new Set();
  r.ingredientGroups = (r.ingredientGroups || []).filter((g) => g.items?.length);
  r.ingredientGroups.forEach((g, gi) => {
    g.items.forEach((ing, ii) => {
      ing.id = `i${gi + 1}-${ii + 1}`;
      ing.item = ing.item || ing.raw;
      if (ing.unit) ing.unit = UNIT_NAMES[ing.unit.toLowerCase().replace(/\.$/, '')];
      if (ing.size && !['small', 'medium', 'large'].includes(ing.size)) delete ing.size;
      dropEmpty(ing);
      ingIds.add(ing.id);
    });
  });

  let n = 0;
  r.stepGroups = (r.stepGroups || []).filter((g) => g.steps?.length);
  for (const g of r.stepGroups) {
    for (const s of g.steps) {
      n += 1;
      s.number = n;
      s.id = `s${n}`;
      // A timer only works when its label is words in the step.
      s.timers = (s.timers || []).filter((t) => t.label && s.text.includes(t.label))
        .map((t) => ({ ...t, maxSeconds: Math.max(t.minSeconds, t.maxSeconds) }));
      s.ingredientRefs = [...new Set((s.ingredientRefs || []).filter((id) => ingIds.has(id)))];
      dropEmpty(s);
    }
  }
  if (!n && r.type !== 'notes') throw new Error('The recipe has no steps');
  if (r.times) {
    for (const [k, t] of Object.entries(r.times)) if (!t?.text?.trim()) delete r.times[k];
    if (!Object.keys(r.times).length) delete r.times;
  }
  if (r.tags) r.tags = [...new Set(r.tags.map((t) => t.toLowerCase().trim()).filter(Boolean))];
  return dropEmpty(r);
}

/** Adds the recipe after the last one in its category, in category order. */
export function insert(book, recipe) {
  const order = book.categories || [];
  const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
  const at = book.recipes.findIndex((x) => rank(x.category) > rank(recipe.category));
  const recipes = [...book.recipes];
  recipes.splice(at === -1 ? recipes.length : at, 0, recipe);
  return { ...book, recipes };
}

const MAX_CATEGORY = 40;

/**
 * Renames, adds, removes and reorders categories: { categories: [{ name, was? }],
 * removed: [{ was, moveTo }] }. `was` is a category's name in the file, so its
 * recipes follow it when it's renamed; a removed category's recipes move to
 * `moveTo`. Returns the book with its recipes re-sorted into the new order.
 */
export function recategorize(book, body) {
  const current = book.categories || [];
  const rows = Array.isArray(body.categories) ? body.categories : [];
  const removed = Array.isArray(body.removed) ? body.removed : [];
  const names = rows.map((c) => String(c?.name || '').trim());
  if (!names.length) throw new HttpError(400, 'Keep at least one category');
  if (names.some((n) => !n || n.length > MAX_CATEGORY)) {
    throw new HttpError(400, `Each category needs a name of up to ${MAX_CATEGORY} characters`);
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    throw new HttpError(400, 'Two categories have the same name');
  }
  const rename = new Map();
  rows.forEach((c, i) => { if (c.was != null) rename.set(c.was, names[i]); });
  for (const r of removed) {
    if (!names.includes(r?.moveTo)) throw new HttpError(400, `Choose where the recipes in “${r?.was}” go`);
    rename.set(r.was, r.moveTo);
  }
  // Checked against the file as it is now: each old category is used once,
  // only ones that exist can change, and every one with recipes lands somewhere.
  const used = new Set(book.recipes.map((r) => r.category));
  const stale = rename.size !== rows.filter((c) => c.was != null).length + removed.length
    || [...rename.keys()].some((c) => !current.includes(c))
    || current.some((c) => used.has(c) && !rename.has(c));
  if (stale) throw new HttpError(409, 'The categories changed since you opened this. Reload and try again.');

  const rank = (c) => (names.includes(c) ? names.indexOf(c) : names.length);
  const recipes = book.recipes
    .map((r) => (rename.has(r.category) ? { ...r, category: rename.get(r.category) } : r))
    .sort((a, b) => rank(a.category) - rank(b.category));
  return { ...book, categories: names, recipes };
}
