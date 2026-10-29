import { CONFIG } from '../config.js';

// Adding a recipe from a link, pasted text or photos. The Worker in worker/ does the
// converting (with Claude) and the saving (to recipes.json in Drive); this
// keeps the draft while that happens. The draft lives in sessionStorage so a
// trip to Google's sign-in and back doesn't lose it.

const DRAFT_KEY = 'mise.add.v1';

function emptyDraft() {
  // phase: input | reading | preview | saving; mode: url | text | photo
  return {
    phase: 'input', mode: 'url', url: '', text: '', images: [], recipe: null, warnings: [], error: '',
  };
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
    // Photos can be too big to keep; keep the rest.
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, images: [] }));
    } catch {
      // ignore
    }
  }
}

/**
 * A link or text shared to Mise, as #/add?url=… or #/add?text=… (what the
 * "Add to Mise" Shortcut opens). Fills in the draft and returns
 * 'read' to start reading, 'photo' when it needs a screenshot instead, or
 * false when nothing was shared.
 */
export function takeShared(params) {
  const shared = params.get('url') || params.get('text') || '';
  if (!shared.trim()) return false;
  // Shared text often has the link inside it ("Check out this post https://…").
  const link = shared.match(/https?:\/\/\S+/);
  if (link && /^https?:\/\/([\w-]+\.)*instagram\.com\//i.test(link[0])) {
    // Instagram doesn't let other apps read posts, so ask for a screenshot.
    Object.assign(draft, emptyDraft(), {
      mode: 'photo',
      error: 'Instagram doesn’t let other apps read posts. Take a screenshot of the recipe (the caption, or the story) and choose it here.',
    });
    saveDraft();
    return 'photo';
  }
  Object.assign(draft, emptyDraft(), link ? { mode: 'url', url: link[0] } : { mode: 'text', text: shared });
  saveDraft();
  return 'read';
}

export function resetDraft() {
  Object.assign(draft, emptyDraft());
  saveDraft();
}

export const addEnabled = Boolean(CONFIG.addRecipeUrl);

export const MAX_PHOTOS = 4;
// Claude reads images up to about this size without shrinking them itself,
// and a smaller upload is quicker from a phone.
const PHOTO_EDGE = 1568;

/** A photo, shrunk and turned into JPEG: { type, data (base64), preview (data URL) }. */
export async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), preview: url };
}

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

/** Turns the link, text or photos in the draft into draft.recipe. */
export async function convertDraft(token) {
  const body = {
    url: { url: draft.url.trim() },
    text: { text: draft.text },
    photo: { images: draft.images.map(({ type, data }) => ({ type, data })) },
  }[draft.mode];
  const { recipe, warnings } = await post('/convert', token, body);
  draft.recipe = recipe;
  draft.warnings = warnings;
}

/** Saves draft.recipe to recipes.json. Returns its final id. */
export async function saveRecipe(token) {
  const { id } = await post('/save', token, { recipe: draft.recipe });
  return id;
}
