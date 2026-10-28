import { CONFIG } from '../config.js';

// Adding a recipe from a link or pasted text. The Worker in worker/ does the
// converting (with Claude) and the saving (to recipes.json in Drive); this
// keeps the draft while that happens. The draft lives in sessionStorage so a
// trip to Google's sign-in and back doesn't lose it.

const DRAFT_KEY = 'mise.add.v1';

function emptyDraft() {
  // phase: input | reading | preview | saving
  return { phase: 'input', mode: 'url', url: '', text: '', recipe: null, warnings: [], error: '' };
}

function load() {
  try {
    const d = { ...emptyDraft(), ...JSON.parse(sessionStorage.getItem(DRAFT_KEY)) };
    // A request that was running when the page went away is gone.
    if (d.phase === 'reading') d.phase = 'input';
    if (d.phase === 'saving') d.phase = 'preview';
    return d;
  } catch {
    return emptyDraft();
  }
}

export const draft = load();

export function saveDraft() {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function resetDraft() {
  Object.assign(draft, emptyDraft());
  saveDraft();
}

export const addEnabled = Boolean(CONFIG.addRecipeUrl);

async function post(path, token, body) {
  let res;
  try {
    res = await fetch(`${CONFIG.addRecipeUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(navigator.onLine ? 'Couldn’t reach the recipe service' : 'You’re offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

/** Turns draft.url or draft.text into draft.recipe. */
export async function convertDraft(token) {
  const body = draft.mode === 'url' ? { url: draft.url.trim() } : { text: draft.text };
  const { recipe, warnings } = await post('/convert', token, body);
  draft.recipe = recipe;
  draft.warnings = warnings;
}

/** Saves draft.recipe to recipes.json. Returns its final id. */
export async function saveRecipe(token) {
  const { id } = await post('/save', token, { recipe: draft.recipe });
  return id;
}
