import { escapeHTML } from './format.js';

// Recipe imagery. A recipe can name a photo in `image`; every recipe also gets
// a drawn placeholder (category colour, pattern and line drawing) that shows
// until the photo loads, or instead of it when there isn't one.

// Line drawings on a 64×64 grid, matched to categories by keyword.
const DRAWINGS = {
  loaf: '<path d="M9 40c0-13 10-21 23-21s23 8 23 21v5a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z"/><path d="M21 27l4 7M30 25l4 7M39 27l4 7"/>',
  pancakes: '<ellipse cx="32" cy="27" rx="21" ry="6"/><path d="M11 27v6c0 3.3 9.4 6 21 6s21-2.7 21-6v-6"/><path d="M11 33v6c0 3.3 9.4 6 21 6s21-2.7 21-6v-6"/><path d="M27 19.5l2-5h7l2 5"/>',
  pot: '<path d="M13 29h38v13a8 8 0 0 1-8 8H21a8 8 0 0 1-8-8z"/><path d="M8 29h48M27 23h10"/><path d="M24 9c-2 3 2 5 0 8M32 7c-2 3 2 5 0 8M40 9c-2 3 2 5 0 8"/>',
  jar: '<path d="M23 12h18v7H23z"/><path d="M21 19h22a3 3 0 0 1 3 3v24a7 7 0 0 1-7 7H25a7 7 0 0 1-7-7V22a3 3 0 0 1 3-3z"/><path d="M18 31h28v11H18"/>',
  crackers: '<path d="M11 15h25v25H11z"/><path d="M28 27h25v25H28z"/><path d="M17 21h.01M23.5 21h.01M30 21h.01M17 27.5h.01M17 34h.01M34 33h.01M40.5 33h.01M47 33h.01M34 39.5h.01M40.5 39.5h.01M47 39.5h.01M34 46h.01M40.5 46h.01M47 46h.01"/>',
  cookie: '<path d="M51 30a19 19 0 1 1-13-18 5 5 0 0 0 7 6 5 5 0 0 0 6 12z"/><path d="M24 25h.01M33 36h.01M22 40h.01M38 25h.01M28 46h.01"/>',
  bottle: '<path d="M28 7h8v11l5 7v27a4 4 0 0 1-4 4H27a4 4 0 0 1-4-4V25l5-7z"/><path d="M23 34h18v12H23"/>',
  crock: '<path d="M19 18h26M21 18c-5 4-7 10-7 17 0 10 6 17 18 17s18-7 18-17c0-7-2-13-7-17"/><path d="M24 12h16v6H24z"/><path d="M27 36h.01M35 31h.01M37 41h.01M30 44h.01"/>',
  bowl: '<path d="M9 30h46a23 23 0 0 1-46 0z"/><path d="M21 54h22"/><path d="M44 9l-9 21"/>',
};

const KINDS = [
  [/bread|bun|loaf|dough|bak/i, 'loaf', 26],
  [/breakfast|brunch|pancake/i, 'pancakes', 46],
  [/ferment|pantry|pickle|preserve/i, 'crock', 168],
  [/main|dinner|lunch|soup|stew/i, 'pot', 128],
  [/dip|sauce|basic|condiment/i, 'jar', 6],
  [/snack|cracker|appetizer|starter/i, 'crackers', 208],
  [/dessert|cookie|cake|sweet|pastr/i, 'cookie', 338],
  [/amaro|infusion|drink|cocktail|liqueur|beverage/i, 'bottle', 284],
];

const PATTERNS = ['dots', 'stripes', 'grid', 'waves'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function kindFor(recipe) {
  const text = `${recipe.category || ''} ${recipe.title || ''}`;
  for (const [re, drawing, hue] of KINDS) if (re.test(recipe.category || '')) return { drawing, hue };
  for (const [re, drawing, hue] of KINDS) if (re.test(text)) return { drawing, hue };
  return { drawing: 'bowl', hue: hash(recipe.category || recipe.id) % 360 };
}

/** The drawn placeholder. Same recipe, same picture, every time. */
export function placeholderHTML(recipe) {
  const h = hash(recipe.id || recipe.title || '');
  const { drawing, hue } = kindFor(recipe);
  const tilt = (h % 17) - 8;
  const pattern = PATTERNS[(h >> 5) % PATTERNS.length];
  const shift = ((h >> 9) % 13) - 6;
  return `
    <span class="art-fill art-${pattern}" style="--h:${hue + shift}" aria-hidden="true">
      <svg class="art-drawing" viewBox="0 0 64 64" style="--tilt:${tilt}deg" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${DRAWINGS[drawing]}</svg>
    </span>`;
}

// A bare Drive file ID loads as a resized copy; anything else is used as a URL.
function imageSrc(src, width) {
  if (/^[\w-]{25,}$/.test(src)) return `https://lh3.googleusercontent.com/d/${src}=w${width}`;
  return src;
}

/**
 * The recipe's picture for a card, row or header. `size` is the width in CSS
 * pixels it's shown at, so Drive photos are fetched no bigger than needed.
 */
export function artHTML(recipe, { variant = 'card', size = 320 } = {}) {
  const image = typeof recipe.image === 'string' ? { src: recipe.image } : recipe.image;
  const width = Math.round(size * 2);
  const photo = image?.src
    ? `<img src="${escapeHTML(imageSrc(image.src, width))}" alt="${escapeHTML(image.alt || '')}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<span class="art art-${variant}">${placeholderHTML(recipe)}${photo}</span>`;
}
