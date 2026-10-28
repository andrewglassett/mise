// Mise's one server piece: turns a recipe link or pasted text into a recipe
// with Claude, and saves it to recipes.json in Google Drive. The app can't do
// either itself, because both need keys that can't sit in a web page.
//
//   POST /convert  { url } or { text }  ->  { recipe, warnings }
//   POST /save     { recipe }           ->  { id, modifiedTime }
//
// Both need the owner's Google sign-in from the app (Authorization: Bearer).

import { HttpError, requireOwner, readBook, writeBook } from './google.js';
import { readPage } from './page.js';
import { convert } from './convert.js';
import { tidy, insert } from './recipe.js';

const MAX_PASTE = 60_000;

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

async function handleConvert(body, env) {
  let source;
  if (body.url) {
    source = await readPage(String(body.url).trim());
  } else if (body.text?.trim()) {
    source = { kind: 'paste', content: String(body.text).slice(0, MAX_PASTE) };
  } else {
    throw new HttpError(400, 'Paste a link or a recipe');
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
  // Checked again against the file as it is now, in case it changed.
  const recipe = tidy(body.recipe, book);
  const modifiedTime = await writeBook(env, insert(book, recipe), version);
  return { id: recipe.id, modifiedTime };
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const json = (data, status = 200) => Response.json(data, { status, headers });

    const { pathname } = new URL(request.url);
    const route = { '/convert': handleConvert, '/save': handleSave }[pathname];
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
