import { createStore } from './data.js';
import {
  escapeHTML as esc, fmtQty, unitLabel, scaleMeasure, fmtMinutes, totalMinutes, timeLabel,
} from './format.js';
import { mountTimers, startTimer, isRunning } from './timers.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

const ui = loadUI();
let book = null;
let syncInfo = null;
let currentView = null;

// ---------- small helpers ----------

function loadUI() {
  const defaults = {
    q: '', category: 'All', tags: [], maxTime: 0, scale: {}, checked: {}, favorites: [], recent: [],
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('mise.ui.v1')) };
  } catch {
    return defaults;
  }
}

function saveUI() {
  try {
    localStorage.setItem('mise.ui.v1', JSON.stringify(ui));
  } catch {
    // ignore
  }
}

function icon(name, size = 22) {
  const p = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.3 3 2.5 3 0-3-1-5.5 0-8z"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V10M9.5 3h5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  }[name];
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

// ---------- theme ----------

// index.html applies the saved theme before first paint; this keeps it in sync.
const THEME_KEY = 'mise.theme.v1';
const theme = loadTheme();
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function loadTheme() {
  try {
    return { mode: null, retro: false, ...JSON.parse(localStorage.getItem(THEME_KEY)) };
  } catch {
    return { mode: null, retro: false };
  }
}

function isDark() {
  return theme.mode ? theme.mode === 'dark' : systemDark.matches;
}

function applyTheme() {
  const root = document.documentElement;
  if (theme.mode) root.dataset.theme = theme.mode;
  else delete root.dataset.theme;
  if (theme.retro) root.dataset.retro = '';
  else delete root.dataset.retro;
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // ignore
  }
}

systemDark.addEventListener('change', () => {
  if (!theme.mode && document.body.dataset.view === 'library') renderLibrary();
});

function findRecipe(id) {
  return book?.recipes.find((r) => r.id === id);
}

function allSteps(recipe) {
  const out = [];
  for (const g of recipe.stepGroups || []) {
    for (const s of g.steps) out.push({ ...s, phase: g.name });
  }
  return out;
}

function ingredientIndex(recipe) {
  const map = new Map();
  for (const g of recipe.ingredientGroups || []) {
    for (const i of g.items) map.set(i.id, { ...i, group: g.name });
  }
  return map;
}

// Short recipes read better as a list on the ingredients screen than as a
// step-by-step walkthrough. A recipe's `cookMode` ("list" or "steps") overrides
// this rule.
const LIST_MAX_STEPS = 3;
const LIST_MAX_CHARS = 450;

function cookMode(recipe) {
  if (recipe.cookMode === 'list' || recipe.cookMode === 'steps') return recipe.cookMode;
  const steps = allSteps(recipe);
  const chars = steps.reduce((n, s) => n + s.text.length, 0);
  return steps.length <= LIST_MAX_STEPS && chars <= LIST_MAX_CHARS ? 'list' : 'steps';
}

function canCook(recipe) {
  return recipe.type !== 'notes' && allSteps(recipe).length > 0 && cookMode(recipe) === 'steps';
}

function scaleFor(id) {
  return ui.scale[id] || 1;
}

function checkedFor(id) {
  ui.checked[id] ||= [];
  return ui.checked[id];
}

// Oven temperature worth a "Preheat" callout: a step that talks about the
// oven or baking at 300°F or more (skips proofing and internal temps).
function preheatTemp(recipe) {
  for (const s of allSteps(recipe)) {
    if (!s.temperatures?.length || !/preheat|oven|bake|roast|broil/i.test(s.text)) continue;
    const t = s.temperatures.find((x) => (x.unit === 'C' ? x.value >= 150 : x.value >= 300));
    if (t) return t;
  }
  return null;
}

// ---------- ingredient lines ----------

const LEADING_AMOUNT = /^((?:about |~)?[\d¼½¾⅓⅔⅛⅜⅝⅞][\d¼½¾⅓⅔⅛⅜⅝⅞\s./–-]*(?:\s*(?:cups?|tablespoons?|teaspoons?|tbsp\.?|tsp\.?|grams?|g|kg|ml|oz\.?|ounces?|lbs?\.?|pounds?|cloves?|cans?|sticks?|stalks?|pinch(?:es)?|dash(?:es)?|packages?|packets?|pieces?|inch(?:es)?|large|medium|small)\b\.?)?)/i;

function ingredientLine(ing, scale) {
  // At 1x the original line is always correct, so show it with the amount bolded.
  if (scale === 1 || ing.quantity == null) {
    const raw = esc(ing.raw);
    const m = ing.raw.match(LEADING_AMOUNT);
    const body = m ? `<b>${esc(m[1].trim())}</b> ${esc(ing.raw.slice(m[1].length).trim())}` : raw;
    const unscaled = scale !== 1 && (ing.quantity == null && ing.quantityText) ? ` <span class="ing-x">×${fmtQty(scale)}</span>` : '';
    return body + unscaled;
  }
  const q = ing.quantity * scale;
  let amount = fmtQty(q);
  if (ing.quantityMax != null) amount += `–${fmtQty(ing.quantityMax * scale)}`;
  const unit = unitLabel(ing.unit, ing.quantityMax != null ? ing.quantityMax * scale : q);
  const amt = [amount, unit].filter(Boolean).join(' ');
  const alt = ing.altMeasure ? ` <span class="ing-alt">(${esc(scaleMeasure(ing.altMeasure, scale))})</span>` : '';
  const name = [ing.size, ing.item].filter(Boolean).join(' ');
  const prep = ing.preparation ? `<span class="ing-prep">, ${esc(ing.preparation)}</span>` : '';
  const note = ing.note ? ` <span class="ing-note">(${esc(ing.note)})</span>` : '';
  return `<b>${esc(amt)}</b>${alt} ${esc(name)}${prep}${note}`;
}

function ingredientItem(recipe, ing, { showGroup = false } = {}) {
  const checked = checkedFor(recipe.id).includes(ing.id);
  const group = showGroup && ing.group ? `<span class="ing-group">${esc(ing.group)}</span>` : '';
  const opt = ing.optional ? '<span class="pill">optional</span>' : '';
  return `
    <li>
      <button class="ing ${checked ? 'is-checked' : ''}" data-action="check" data-ing="${esc(ing.id)}" aria-pressed="${checked}">
        <span class="ing-box">${icon('check', 16)}</span>
        <span class="ing-text">${group}${ingredientLine(ing, scaleFor(recipe.id))} ${opt}</span>
      </button>
    </li>`;
}

function ingredientGroupsHTML(recipe) {
  if (!recipe.ingredientGroups?.length) return '<p class="muted">No ingredient list for this one.</p>';
  return recipe.ingredientGroups.map((g) => `
    <div class="ing-block">
      ${g.name ? `<h4 class="ing-heading">${esc(g.name)}</h4>` : ''}
      <ul class="ing-list">${g.items.map((i) => ingredientItem(recipe, { ...i, group: g.name })).join('')}</ul>
    </div>`).join('');
}

function scaleControl(recipe) {
  const s = scaleFor(recipe.id);
  return `
    <div class="seg" role="group" aria-label="Scale recipe">
      ${[0.5, 1, 2, 3].map((v) => `<button data-action="scale" data-scale="${v}" class="${v === s ? 'is-on' : ''}">${fmtQty(v)}×</button>`).join('')}
    </div>`;
}

// ---------- library ----------

function recipeTags() {
  const tags = new Set();
  for (const r of book.recipes) (r.tags || []).forEach((t) => tags.add(t));
  return [...tags].sort();
}

function matches(r) {
  if (ui.category !== 'All' && r.category !== ui.category) return false;
  if (ui.tags.length && !ui.tags.every((t) => r.tags?.includes(t))) return false;
  if (ui.maxTime) {
    const m = totalMinutes(r);
    if (!m || m > ui.maxTime) return false;
  }
  return true;
}

function searchScore(r, q) {
  if (!q) return 1;
  const title = r.title.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const w of words) {
    if (title.startsWith(w)) score += 10;
    else if (title.includes(w)) score += 6;
    else if ((r.tags || []).some((t) => t.includes(w))) score += 4;
    else if (r.ingredientGroups?.some((g) => g.items.some((i) => (i.item || i.raw).toLowerCase().includes(w)))) score += 2;
    else if ((r.source || '').toLowerCase().includes(w)) score += 1;
    else return 0;
  }
  return score;
}

function isFavorite(id) {
  return ui.favorites.includes(id);
}

function badgesHTML(r) {
  return [
    ...(r.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`),
    r.type === 'notes' ? `<span class="pill pill-quiet">${icon('note', 14)} Notes</span>` : '',
    r.methodSource === 'suggested' ? '<span class="pill pill-warn">Untested method</span>' : '',
  ].join('');
}

function favMark(r) {
  return isFavorite(r.id) ? `<span class="fav-mark" aria-label="Favorite">${icon('star', 15)}</span>` : '';
}

// Cards are for the short rows on the home screen.
function card(r, { showCategory = true } = {}) {
  const mins = totalMinutes(r);
  const meta = [
    mins ? `${icon('clock', 16)} ${fmtMinutes(mins)}` : '',
    r.yield ? esc(r.yield) : '',
  ].filter(Boolean).join('<span class="dot">·</span>');
  const badges = badgesHTML(r);
  return `
    <a class="card" href="#/r/${encodeURIComponent(r.id)}">
      ${showCategory ? `<span class="card-cat">${esc(r.category)}</span>` : ''}
      <span class="card-title">${favMark(r)}${esc(r.title)}</span>
      ${meta ? `<span class="card-meta">${meta}</span>` : ''}
      ${badges ? `<span class="card-badges">${badges}</span>` : ''}
    </a>`;
}

// Compact rows are for full lists, so hundreds of recipes stay scannable.
function row(r, { showCategory = false } = {}) {
  const mins = totalMinutes(r);
  const sub = [showCategory ? esc(r.category) : '', r.yield ? esc(r.yield) : '']
    .filter(Boolean).join('<span class="dot">·</span>');
  const badges = badgesHTML(r);
  return `
    <a class="row" href="#/r/${encodeURIComponent(r.id)}">
      <span class="row-main">
        <span class="row-title">${favMark(r)}${esc(r.title)}</span>
        ${sub || badges ? `<span class="row-sub">${sub}${badges ? `<span class="row-badges">${badges}</span>` : ''}</span>` : ''}
      </span>
      <span class="row-time">${mins ? fmtMinutes(mins) : ''}</span>
      ${icon('next', 18)}
    </a>`;
}

function rowsHTML(list, opts) {
  return `<div class="rows">${list.map((r) => row(r, opts)).join('')}</div>`;
}

function syncText() {
  if (!syncInfo) return '';
  if (syncInfo.newerSchema) return 'Data format is newer than this app; reload to update';
  if (syncInfo.error) return book ? 'Offline · showing saved recipes' : `Couldn't load recipes (${esc(syncInfo.error)})`;
  if (syncInfo.source === 'cache') return 'Saved copy · checking for updates…';
  if (syncInfo.checkedAt) {
    const t = new Date(syncInfo.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Up to date · checked ${t}`;
  }
  return '';
}

function renderLibrary() {
  document.body.dataset.view = 'library';
  const counts = { All: book.recipes.length };
  for (const r of book.recipes) counts[r.category] = (counts[r.category] || 0) + 1;
  const cats = ['All', ...(book.categories || [...new Set(book.recipes.map((r) => r.category))])];
  const times = [[0, 'Any time'], [30, '≤ 30 min'], [60, '≤ 1 hr']];

  app.innerHTML = `
    <div class="library">
      <aside class="filters">
        <div class="brand">
          <h1>Mise</h1>
          <div class="brand-tools">
            <button class="tool" data-action="toggle-dark" aria-pressed="${isDark()}" ${theme.retro ? 'disabled' : ''} title="Dark mode" aria-label="Dark mode">${icon(isDark() ? 'sun' : 'moon', 20)}</button>
            <button class="tool tool-retro" data-action="toggle-retro" aria-pressed="${theme.retro}" title="90s mode" aria-label="90s mode">95</button>
          </div>
        </div>
        <button class="sync" data-action="refresh" title="Check for new recipes">${icon('refresh', 15)}<span id="sync-text">${syncText()}</span></button>
        <label class="search">
          ${icon('search')}
          <input id="q" type="search" placeholder="Search recipes or ingredients" value="${esc(ui.q)}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
          <button class="search-clear" data-action="clear-search" aria-label="Clear search" ${ui.q ? '' : 'hidden'}>${icon('x', 18)}</button>
        </label>
        <nav class="cats" aria-label="Categories">
          ${cats.map((c) => `
            <button class="cat ${ui.category === c ? 'is-on' : ''}" data-action="category" data-cat="${esc(c)}">
              <span>${esc(c)}</span><span class="count">${counts[c] || 0}</span>
            </button>`).join('')}
        </nav>
        <div class="chips">
          ${recipeTags().map((t) => `<button class="chip ${ui.tags.includes(t) ? 'is-on' : ''}" data-action="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
          <span class="chip-sep"></span>
          ${times.map(([v, l]) => `<button class="chip ${ui.maxTime === v ? 'is-on' : ''}" data-action="time" data-time="${v}">${l}</button>`).join('')}
        </div>
      </aside>
      <main class="results" id="results"></main>
    </div>`;
  renderResults();
}

// Only visible in 90s mode.
function retroFooter(where = 'top') {
  if (where === 'top') {
    return '<div class="retro-only retro-banner"><marquee scrollamount="4">★ Welcome to my recipe page! ★ Now with ' + book.recipes.length + ' recipes! ★ Sign my guestbook! ★</marquee></div>';
  }
  return `<div class="retro-only retro-footer">
      <p><img src="icons/icon.svg" alt="" width="16" height="16"> Under construction</p>
      <p>Best viewed in Netscape Navigator 4.0 at 800×600</p>
      <p>You are visitor <span class="counter">${String(book.recipes.length * 1337).padStart(7, '0')}</span></p>
    </div>`;
}

function byTitle(a, b) {
  return a.title.localeCompare(b.title);
}

function isHome() {
  return ui.category === 'All' && !ui.q.trim() && !ui.tags.length && !ui.maxTime;
}

const SHELF_SIZE = 8;

function shelf(title, list, { category = null, showCategory = true } = {}) {
  if (!list.length) return '';
  const more = category && list.length > SHELF_SIZE;
  return `
    <section class="shelf">
      <div class="shelf-head">
        <h2>${esc(title)} <span class="count">${list.length}</span></h2>
        ${category ? `<button class="linkbtn" data-action="category" data-cat="${esc(category)}">See all</button>` : ''}
      </div>
      <div class="shelf-row">
        ${list.slice(0, SHELF_SIZE).map((r) => card(r, { showCategory })).join('')}
        ${more ? `<button class="card card-more" data-action="category" data-cat="${esc(category)}">See all ${list.length} ${icon('next', 18)}</button>` : ''}
      </div>
    </section>`;
}

// Home: recent and favorite recipes, then a short row per category.
function renderHome(el) {
  const byId = new Map(book.recipes.map((r) => [r.id, r]));
  const recent = ui.recent.map((id) => byId.get(id)).filter(Boolean);
  const favorites = ui.favorites.map((id) => byId.get(id)).filter(Boolean).sort(byTitle);
  const cats = book.categories || [...new Set(book.recipes.map((r) => r.category))];
  el.innerHTML = retroFooter()
    + shelf('Recent', recent)
    + shelf('Favorites', favorites)
    + cats.map((c) => shelf(c, book.recipes.filter((r) => r.category === c).sort(byTitle), { category: c, showCategory: false })).join('')
    + retroFooter('bottom');
}

function renderResults() {
  const el = document.getElementById('results');
  if (!el) return;
  if (isHome()) {
    renderHome(el);
    return;
  }
  const q = ui.q.trim().toLowerCase();
  const list = book.recipes
    .filter(matches)
    .map((r) => [r, searchScore(r, q)])
    .filter(([, s]) => s > 0);

  if (!list.length) {
    el.innerHTML = `<div class="empty"><p>No recipes match.</p><button class="btn" data-action="reset-filters">Clear filters</button></div>`;
    return;
  }

  const count = `<p class="result-count">${list.length} recipe${list.length === 1 ? '' : 's'}</p>`;

  if (q) {
    list.sort((a, b) => b[1] - a[1] || byTitle(a[0], b[0]));
    el.innerHTML = count + rowsHTML(list.map(([r]) => r), { showCategory: true });
    return;
  }

  if (ui.category !== 'All') {
    el.innerHTML = `<h2 class="list-title">${esc(ui.category)}</h2>${count}${rowsHTML(list.map(([r]) => r).sort(byTitle))}`;
    return;
  }

  // All categories with a tag or time filter: group the rows by category.
  const byCat = new Map();
  for (const [r] of list) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r);
  }
  const order = book.categories || [...byCat.keys()];
  el.innerHTML = count + order.filter((c) => byCat.has(c)).map((c) => `
    <section class="cat-section">
      <h2>${esc(c)}</h2>
      ${rowsHTML(byCat.get(c).sort(byTitle))}
    </section>`).join('');
}

// ---------- recipe overview (ingredients screen) ----------

function renderOverview(recipe) {
  document.body.dataset.view = 'overview';
  if (ui.recent[0] !== recipe.id) {
    ui.recent = [recipe.id, ...ui.recent.filter((id) => id !== recipe.id)].slice(0, SHELF_SIZE);
    saveUI();
  }
  const fav = isFavorite(recipe.id);
  const steps = allSteps(recipe);
  const cook = canCook(recipe);
  const listView = steps.length > 0 && !cook;
  const heat = preheatTemp(recipe);
  const times = Object.entries(recipe.times || {}).filter(([, v]) => v?.text);
  const checked = checkedFor(recipe.id).length;

  app.innerHTML = `
    <div class="overview">
      <header class="topbar">
        <a class="iconbtn" href="#/" aria-label="All recipes">${icon('back')}</a>
        <div class="topbar-title">
          <span class="eyebrow">${esc(recipe.category)}</span>
          <h1>${esc(recipe.title)}</h1>
        </div>
        <button class="iconbtn fav-btn ${fav ? 'is-fav' : ''}" data-action="favorite" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}">${icon('star')}</button>
      </header>
      <div class="overview-body">
        <section class="panel ingredients-panel">
          <div class="panel-head">
            <h2>Ingredients</h2>
            ${recipe.ingredientGroups?.length ? scaleControl(recipe) : ''}
          </div>
          ${checked ? `<button class="linkbtn" data-action="uncheck-all">Uncheck all (${checked})</button>` : ''}
          ${ingredientGroupsHTML(recipe)}
        </section>
        <section class="panel info-panel">
          ${recipe.methodSource === 'suggested' ? '<p class="banner banner-warn">Untested method: this is a typical method, not the original author\'s.</p>' : ''}
          ${listView ? methodHTML(recipe, { primary: true }) : ''}
          ${heat ? `<div class="callout">${icon('flame', 28)}<div><span>Preheat</span><strong>${heat.value}°${esc(heat.unit)}</strong></div></div>` : ''}
          <dl class="facts">
            ${recipe.yield ? `<div><dt>Yield</dt><dd>${esc(recipe.yield)}</dd></div>` : ''}
            ${times.map(([k, v]) => `<div><dt>${timeLabel(k)}</dt><dd>${esc(v.text)}</dd></div>`).join('')}
            ${cook ? `<div><dt>Steps</dt><dd>${steps.length}</dd></div>` : ''}
          </dl>
          ${recipe.equipment?.length ? `<h3>Equipment</h3><ul class="bullets">${recipe.equipment.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
          ${recipe.nutrition ? `<h3>Nutrition</h3><p>${esc(recipe.nutrition)}</p>` : ''}
          ${recipe.notes?.length ? `<h3>Notes</h3><ul class="bullets">${recipe.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
          ${steps.length === 0 && recipe.type !== 'notes' ? '<p class="muted">This recipe has no steps yet.</p>' : ''}
          ${steps.length && !listView ? methodHTML(recipe) : ''}
        </section>
        ${recipe.source ? `<p class="credit">Source: ${esc(recipe.source)}</p>` : ''}
      </div>
      ${cook ? `
        <footer class="startbar">
          <a class="btn btn-primary btn-big" href="#/r/${encodeURIComponent(recipe.id)}/s/1">Start cooking ${icon('next')}</a>
        </footer>` : ''}
    </div>`;
}

// The whole method as a numbered list. For short recipes it's the main way to
// read the recipe; for longer ones it's a preview before cook mode.
function methodHTML(recipe, { primary = false } = {}) {
  const groups = (recipe.stepGroups || []).filter((g) => g.steps.length);
  return `
    <div class="method-block ${primary ? 'is-primary' : ''}">
      ${primary ? '<h2>Method</h2>' : '<h3>Method</h3>'}
      ${groups.map((g) => `
        ${g.name ? `<h4 class="ing-heading">${esc(g.name)}</h4>` : ''}
        <ol class="method" start="${g.steps[0].number}">
          ${g.steps.map((s) => `<li>${stepTextHTML(s)}</li>`).join('')}
        </ol>`).join('')}
    </div>`;
}

// ---------- step walkthrough ----------

function stepTextHTML(step) {
  let html = esc(step.text);
  // Make each timer phrase in the sentence tappable, in order of appearance.
  let from = 0;
  (step.timers || []).forEach((t, i) => {
    const label = esc(t.label);
    const at = html.indexOf(label, from);
    if (at === -1) return;
    const btn = `<button class="inline-timer" data-action="timer" data-step="${step.number}" data-timer="${i}">${icon('timer', 18)}${label}</button>`;
    html = html.slice(0, at) + btn + html.slice(at + label.length);
    from = at + btn.length;
  });
  html = html.replace(/(\d{2,3}\s?°\s?[FC])/g, '<strong class="temp">$1</strong>');
  return html.replace(/\n/g, '<br>');
}

function renderStep(recipe, n) {
  document.body.dataset.view = 'cook';
  const steps = allSteps(recipe);
  const step = steps[n - 1];
  const total = steps.length;
  const ings = ingredientIndex(recipe);
  const refs = (step.ingredientRefs || []).map((id) => ings.get(id)).filter(Boolean);
  const showGroups = new Set(refs.map((r) => r.group)).size > 1;
  const id = encodeURIComponent(recipe.id);
  const prevHref = n > 1 ? `#/r/${id}/s/${n - 1}` : `#/r/${id}`;
  const nextHref = n < total ? `#/r/${id}/s/${n + 1}` : `#/r/${id}/done`;
  const prevPhase = steps[n - 2]?.phase;
  const phaseStart = step.phase && step.phase !== prevPhase;
  const temps = (step.temperatures || []);

  app.innerHTML = `
    <div class="cook">
      <header class="topbar cookbar">
        <a class="iconbtn" href="#/r/${id}" aria-label="Ingredients">${icon('list')}</a>
        <div class="topbar-title">
          <span class="eyebrow">${esc(recipe.title)}</span>
          <h1>Step ${n} <span class="of">of ${total}</span></h1>
        </div>
        <a class="iconbtn" href="#/" aria-label="Exit cook mode">${icon('x')}</a>
      </header>
      <div class="progress" aria-hidden="true">
        ${steps.map((s, i) => `<span class="${i < n ? 'is-done' : ''} ${i > 0 && s.phase !== steps[i - 1].phase ? 'gap' : ''}"></span>`).join('')}
      </div>
      <main class="step ${refs.length ? 'has-ings' : ''}" id="step">
        <section class="step-body">
          ${step.phase ? `<p class="phase ${phaseStart ? 'is-new' : ''}">${esc(step.phase)}</p>` : ''}
          ${temps.length ? `<div class="step-temps">${temps.map((t) => `<span class="temp-badge">${icon('flame', 20)}${t.value}°${esc(t.unit)}</span>`).join('')}</div>` : ''}
          <p class="step-text">${stepTextHTML(step)}</p>
          ${step.timers?.length ? `
            <div class="timer-chips">
              ${step.timers.map((t, i) => {
                const on = isRunning(recipe.id, step.number, t.label);
                return `<button class="timer-chip ${on ? 'is-on' : ''}" data-action="timer" data-step="${step.number}" data-timer="${i}">${icon('timer', 20)}<span>${on ? 'Running' : 'Start'} · ${esc(t.label)}</span></button>`;
              }).join('')}
            </div>` : ''}
        </section>
        ${refs.length ? `
          <aside class="step-ings">
            <h2>You'll need</h2>
            <ul class="ing-list">${refs.map((r) => ingredientItem(recipe, r, { showGroup: showGroups })).join('')}</ul>
          </aside>` : ''}
      </main>
      <footer class="cooknav">
        <a class="btn btn-big" href="${prevHref}">${icon('back')} ${n > 1 ? 'Back' : 'Ingredients'}</a>
        <a class="btn btn-primary btn-big" href="${nextHref}">${n < total ? 'Next' : 'Finish'} ${icon('next')}</a>
      </footer>
    </div>`;

  bindSwipe(document.getElementById('step'), prevHref, nextHref);
}

function renderDone(recipe) {
  document.body.dataset.view = 'cook';
  const id = encodeURIComponent(recipe.id);
  const total = allSteps(recipe).length;
  app.innerHTML = `
    <div class="cook">
      <header class="topbar cookbar">
        <a class="iconbtn" href="#/r/${id}/s/${total}" aria-label="Last step">${icon('back')}</a>
        <div class="topbar-title">
          <span class="eyebrow">${esc(recipe.title)}</span>
          <h1>All done</h1>
        </div>
        <a class="iconbtn" href="#/" aria-label="Exit cook mode">${icon('x')}</a>
      </header>
      <main class="done">
        <div class="done-mark">${icon('check', 44)}</div>
        <h2>Enjoy your ${esc(recipe.title)}.</h2>
        ${recipe.notes?.length ? `<div class="panel"><h3>Notes</h3><ul class="bullets">${recipe.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
      </main>
      <footer class="cooknav">
        <a class="btn btn-big" href="#/r/${id}/s/1">Start over</a>
        <a class="btn btn-primary btn-big" href="#/" data-action="finish">Back to recipes</a>
      </footer>
    </div>`;
}

function bindSwipe(el, prevHref, nextHref) {
  if (!el) return;
  let x0 = null;
  let y0 = null;
  el.addEventListener('touchstart', (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) location.hash = dx < 0 ? nextHref : prevHref;
  }, { passive: true });
}

// ---------- screen wake lock (keeps the iPad awake while cooking) ----------

let wakeLock = null;
async function setAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.body.dataset.view === 'cook' || document.body.dataset.view === 'overview') setAwake(true);
});

// ---------- routing ----------

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'r' && parts[1]) {
    if (parts[2] === 's') return { name: 'step', id: parts[1], n: parseInt(parts[3], 10) || 1 };
    if (parts[2] === 'done') return { name: 'done', id: parts[1] };
    return { name: 'overview', id: parts[1] };
  }
  return { name: 'library' };
}

function render() {
  if (!book) {
    app.innerHTML = `<div class="loading"><h1>Mise</h1><p>${syncInfo?.error ? `Couldn't load recipes: ${esc(syncInfo.error)}` : 'Loading recipes…'}</p></div>`;
    return;
  }
  const route = parseRoute();
  const prev = currentView;
  currentView = { ...route };
  const recipe = route.id ? findRecipe(route.id) : null;

  if (route.name !== 'library' && !recipe) {
    location.replace('#/');
    return;
  }
  if (route.name === 'step') {
    const total = allSteps(recipe).length;
    if (!canCook(recipe) || route.n < 1 || route.n > total) {
      location.replace(`#/r/${encodeURIComponent(recipe.id)}`);
      return;
    }
    renderStep(recipe, route.n);
  } else if (route.name === 'done') {
    renderDone(recipe);
  } else if (route.name === 'overview') {
    renderOverview(recipe);
  } else {
    renderLibrary();
  }

  setAwake(route.name !== 'library');
  const sameScreen = prev && prev.name === route.name && prev.id === route.id && prev.n === route.n;
  if (!sameScreen) window.scrollTo(0, 0);
}

// Re-render without losing scroll position (checkbox taps, scale changes).
function rerender() {
  const y = window.scrollY;
  const inner = document.querySelector('.ingredients-panel, .step-ings');
  const innerY = inner?.scrollTop;
  render();
  window.scrollTo(0, y);
  const again = document.querySelector('.ingredients-panel, .step-ings');
  if (again && innerY != null) again.scrollTop = innerY;
}

// ---------- events ----------

app.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  ui.q = e.target.value;
  saveUI();
  document.querySelector('.search-clear').hidden = !ui.q;
  renderResults();
});

app.addEventListener('keydown', (e) => {
  if (e.target.id === 'q' && e.key === 'Enter') e.target.blur();
});

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const route = parseRoute();
  const recipe = route.id ? findRecipe(route.id) : null;

  switch (el.dataset.action) {
    case 'category':
      ui.category = el.dataset.cat;
      saveUI();
      renderLibrary();
      window.scrollTo(0, 0);
      break;
    case 'favorite':
      ui.favorites = isFavorite(recipe.id)
        ? ui.favorites.filter((id) => id !== recipe.id)
        : [...ui.favorites, recipe.id];
      saveUI();
      rerender();
      break;
    case 'tag': {
      const t = el.dataset.tag;
      ui.tags = ui.tags.includes(t) ? ui.tags.filter((x) => x !== t) : [...ui.tags, t];
      saveUI();
      renderLibrary();
      break;
    }
    case 'time':
      ui.maxTime = Number(el.dataset.time);
      saveUI();
      renderLibrary();
      break;
    case 'clear-search':
      ui.q = '';
      saveUI();
      renderLibrary();
      document.getElementById('q').focus();
      break;
    case 'reset-filters':
      Object.assign(ui, { q: '', category: 'All', tags: [], maxTime: 0 });
      saveUI();
      renderLibrary();
      break;
    case 'toggle-dark':
      theme.mode = isDark() ? 'light' : 'dark';
      applyTheme();
      renderLibrary();
      break;
    case 'toggle-retro':
      theme.retro = !theme.retro;
      applyTheme();
      renderLibrary();
      if (theme.retro) toast('Welcome to Mise 95');
      break;
    case 'refresh':
      store.refresh().then(() => toast('Recipes are up to date'));
      break;
    case 'scale':
      ui.scale[recipe.id] = Number(el.dataset.scale);
      saveUI();
      rerender();
      break;
    case 'check': {
      const list = checkedFor(recipe.id);
      const id = el.dataset.ing;
      ui.checked[recipe.id] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      saveUI();
      rerender();
      break;
    }
    case 'uncheck-all':
      ui.checked[recipe.id] = [];
      saveUI();
      rerender();
      break;
    case 'timer': {
      const step = allSteps(recipe).find((x) => x.number === Number(el.dataset.step));
      const t = step?.timers?.[Number(el.dataset.timer)];
      if (!t) break;
      startTimer({
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        stepNumber: step.number,
        label: t.label,
        minSeconds: t.minSeconds,
        maxSeconds: t.maxSeconds,
      });
      rerender();
      break;
    }
    case 'finish':
      ui.checked[recipe.id] = [];
      saveUI();
      break;
    default:
  }
});

document.addEventListener('keydown', (e) => {
  if (document.body.dataset.view !== 'cook' || e.target.matches('input, textarea')) return;
  const nav = document.querySelectorAll('.cooknav a');
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    nav[1]?.click();
  } else if (e.key === 'ArrowLeft') {
    nav[0]?.click();
  } else if (e.key === 'Escape') {
    location.hash = '#/';
  }
});

document.addEventListener('mise:timers', () => {
  if (document.body.dataset.view === 'cook') rerender();
});

window.addEventListener('hashchange', render);

mountTimers(document.getElementById('timers'), (t) => {
  location.hash = `#/r/${encodeURIComponent(t.recipeId)}/s/${t.stepNumber}`;
});

// ---------- data ----------

const store = createStore((nextBook, info) => {
  const had = Boolean(book);
  const changed = nextBook !== book;
  book = nextBook;
  syncInfo = info;
  if (!had || (changed && document.body.dataset.view === 'library')) {
    render();
  } else if (changed) {
    // Redraw the same screen with the new data, keeping the scroll position.
    rerender();
  } else {
    const s = document.getElementById('sync-text');
    if (s) s.textContent = syncText();
    if (!book) render();
  }
  if (info.updated) toast('Recipes updated');
});

render();
store.start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
