// Mise's one server piece: turns a recipe link or pasted text into a recipe
// with Claude, and saves it to recipes.json in Google Drive. The app can't do
// either itself, because both need keys that can't sit in a web page.
//
//   POST /convert  { url }, { text }, { images: [{ type, data }] }
//                  or { edit: { recipe, request } }  ->  { recipe, warnings }
//   POST /save     { recipe, replaceId? }            ->  { id, modifiedTime }
//   POST /delete   { id }               ->  { id, modifiedTime }
//
// Both need the owner's Google sign-in from the app (Authorization: Bearer).

import { HttpError, requireOwner, readBook, writeBook } from './google.js';
import { readPage } from './page.js';
import { convert } from './convert.js';
import { tidy, insert } from './recipe.js';
import { recipeSchema } from './schema.js';

const MAX_PASTE = 60_000;
const MAX_REQUEST = 2_000;
const MAX_PHOTOS = 4;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  return allowed.includes(origin) ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  } : {};
}

// The book without the recipe being edited, so its id doesn't count as taken.
function without(book, id) {
  return { ...book, recipes: book.recipes.filter((r) => r.id !== id) };
}

async function handleEdit({ recipe, request }, env) {
  if (!recipe?.id || !String(request || '').trim()) throw new HttpError(400, 'Say what should change');
  const { book } = await readBook(env);
  const others = without(book, recipe.id);
  const out = await convert(env, {
    source: { kind: 'edit', recipe, request: String(request).slice(0, MAX_REQUEST) },
    categories: book.categories,
    existingIds: others.recipes.map((r) => r.id),
    existingTags: [...new Set(book.recipes.flatMap((r) => r.tags || []))].sort(),
  });
  // Fields the conversion doesn't know about (like nutrition) come through as they were.
  const known = Object.keys(recipeSchema([]).properties.recipe.properties);
  const edited = { ...out.recipe, id: recipe.id };
  for (const [k, v] of Object.entries(recipe)) {
    if (!known.includes(k) && k !== 'times') edited[k] = v;
  }
  return { recipe: tidy(edited, others), warnings: out.warnings || [] };
}

async function handleConvert(body, env) {
  if (body.edit) return handleEdit(body.edit, env);
  let source;
  if (body.url) {
    source = await readPage(String(body.url).trim());
  } else if (Array.isArray(body.images) && body.images.length) {
    const images = body.images.slice(0, MAX_PHOTOS);
    // Claude takes images up to 5 MB; the app sends them much smaller.
    if (images.some((i) => !PHOTO_TYPES.includes(i.type) || typeof i.data !== 'string' || i.data.length > 5_000_000)) {
      throw new HttpError(400, 'Those photos couldn’t be read. Try a JPEG or PNG.');
    }
    source = { kind: 'photo', images };
  } else if (body.text?.trim()) {
    source = { kind: 'paste', content: String(body.text).slice(0, MAX_PASTE) };
  } else {
    throw new HttpError(400, 'Paste a link or a recipe, or choose a photo');
  }
  const { book } = await readBook(env);
  const out = await convert(env, {
    source,
    categories: book.categories,
    existingIds: book.recipes.map((r) => r.id),
    existingTags: [...new Set(book.recipes.flatMap((r) => r.tags || []))].sort(),
  });
  const recipe = tidy(out.recipe, book);
  console.log('converted', recipe.id, JSON.stringify(out.usage));
  return { recipe, warnings: out.warnings || [] };
}

async function handleSave(body, env) {
  if (!body.recipe) throw new HttpError(400, 'Nothing to save');
  const { book, version } = await readBook(env);
  if (!body.replaceId) {
    // Checked again against the file as it is now, in case it changed.
    const recipe = tidy(body.recipe, book);
    const modifiedTime = await writeBook(env, insert(book, recipe), version);
    return { id: recipe.id, modifiedTime };
  }
  // An edit keeps its id (so favorites still find it) and its place, unless
  // it moved to another category.
  const at = book.recipes.findIndex((r) => r.id === body.replaceId);
  if (at === -1) throw new HttpError(404, 'That recipe isn’t in recipes.json any more');
  const others = without(book, body.replaceId);
  const recipe = tidy({ ...body.recipe, id: body.replaceId }, others);
  let next;
  if (recipe.category === book.recipes[at].category) {
    const recipes = [...book.recipes];
    recipes[at] = recipe;
    next = { ...book, recipes };
  } else {
    next = insert(others, recipe);
  }
  const modifiedTime = await writeBook(env, next, version);
  return { id: recipe.id, modifiedTime };
}

async function handleDelete(body, env) {
  const { book, version } = await readBook(env);
  const recipes = book.recipes.filter((r) => r.id !== body.id);
  if (recipes.length === book.recipes.length) throw new HttpError(404, 'That recipe is already gone');
  const modifiedTime = await writeBook(env, { ...book, recipes }, version);
  return { id: body.id, modifiedTime };
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const json = (data, status = 200) => Response.json(data, { status, headers });

    const { pathname } = new URL(request.url);
    const route = { '/convert': handleConvert, '/save': handleSave, '/delete': handleDelete }[pathname];
    if (!route || request.method !== 'POST') return json({ error: 'Not found' }, 404);

    try {
      await requireOwner(request, env);
      const body = await request.json().catch(() => ({}));
      return json(await route(body, env));
    } catch (err) {
      console.error(pathname, err);
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: err.message || 'Something went wrong' }, status);
    }
  },
};
