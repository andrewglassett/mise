const FRACTIONS = [
  [0, ''],
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
  [1, ''],
];

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 0.3333 -> "⅓", 1.5 -> "1½", 2.3 -> "2.3", 360 -> "360". */
export function fmtQty(n) {
  if (n == null || Number.isNaN(n)) return '';
  if (n >= 20) return String(Math.round(n));
  let whole = Math.floor(n);
  const frac = n - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) {
    if (Math.abs(frac - f[0]) < Math.abs(frac - best[0])) best = f;
  }
  if (Math.abs(frac - best[0]) > 0.04) {
    return String(Math.round(n * 10) / 10);
  }
  if (best[0] === 1) whole += 1;
  if (!whole && !best[1]) return '0';
  return `${whole || ''}${best[1]}`;
}

const UNIT_LABELS = {
  cup: ['cup', 'cups'],
  tbsp: ['Tbsp', 'Tbsp'],
  tsp: ['tsp', 'tsp'],
  clove: ['clove', 'cloves'],
  can: ['can', 'cans'],
  stick: ['stick', 'sticks'],
  stalk: ['stalk', 'stalks'],
  piece: ['piece', 'pieces'],
  packet: ['packet', 'packets'],
  package: ['package', 'packages'],
  pint: ['pint', 'pints'],
  inch: ['inch', 'inches'],
};

export function unitLabel(unit, qty) {
  if (!unit) return '';
  const pair = UNIT_LABELS[unit];
  if (!pair) return unit;
  return qty != null && qty > 1 ? pair[1] : pair[0];
}

/** Scales a leading number in a short measurement like "200 g". */
export function scaleMeasure(text, factor) {
  if (!text || factor === 1) return text;
  return text.replace(/^(\d+(?:\.\d+)?)/, (m) => {
    const v = parseFloat(m) * factor;
    return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  });
}

export function fmtMinutes(min) {
  if (min == null) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Seconds -> "4:05" or "1:02:09". */
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function totalMinutes(recipe) {
  const t = recipe.times || {};
  if (t.total?.minutes) return t.total.minutes;
  let sum = 0;
  for (const [k, v] of Object.entries(t)) {
    if (k !== 'total' && k !== 'active' && v?.minutes) sum += v.minutes;
  }
  return sum || null;
}

const TIME_LABELS = {
  prep: 'Prep', cook: 'Cook', bake: 'Bake', proof: 'Proof', rest: 'Rest', active: 'Active', total: 'Total',
};
export function timeLabel(key) {
  return TIME_LABELS[key] || key[0].toUpperCase() + key.slice(1);
}
