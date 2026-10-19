import { CONFIG } from '../config.js';

const CACHE_KEY = 'mise.book.v1';
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(entry) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Storage full or blocked: the app still works, it just refetches next time.
  }
}

function driveUrl(params) {
  const q = new URLSearchParams({ ...params, key: CONFIG.driveApiKey });
  return `${DRIVE}${encodeURIComponent(CONFIG.driveFileId)}?${q}`;
}

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  // Drive answers 404 for files that exist but aren't shared by link.
  if (res.status === 404 && url.startsWith(DRIVE)) {
    throw new Error('recipes.json is not shared as "Anyone with the link"');
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function validate(book) {
  if (!book || !Array.isArray(book.recipes)) throw new Error('recipes.json has no recipes array');
  return book;
}

/**
 * Loads the recipe book and keeps it fresh.
 *
 * Shows the cached copy immediately, then asks Drive for the file's
 * modifiedTime and downloads it only when that has changed. Checks again
 * whenever the app comes back to the foreground and every few minutes.
 */
export function createStore(onChange) {
  let book = null;
  let modifiedTime = null;
  let inflight = null;
  const useDrive = Boolean(CONFIG.driveApiKey);

  const status = {
    source: null, // 'drive' | 'cache' | 'local'
    checkedAt: null,
    error: null,
    newerSchema: false,
  };

  function publish(next, info) {
    book = validate(next);
    status.newerSchema = (book.schemaVersion ?? 1) > CONFIG.supportedSchemaVersion;
    onChange(book, { ...status, ...info });
  }

  async function refreshFromDrive() {
    const meta = await getJSON(driveUrl({ fields: 'modifiedTime' }));
    status.checkedAt = Date.now();
    status.error = null;
    if (book && meta.modifiedTime === modifiedTime) {
      status.source = 'drive';
      onChange(book, { ...status, updated: false });
      return;
    }
    const next = validate(await getJSON(driveUrl({ alt: 'media' })));
    const updated = Boolean(book);
    modifiedTime = meta.modifiedTime;
    status.source = 'drive';
    writeCache({ modifiedTime, book: next });
    publish(next, { updated });
  }

  async function refreshFromLocal() {
    const next = await getJSON(`${CONFIG.localDataUrl}?t=${Date.now()}`);
    const updated = Boolean(book) && JSON.stringify(next) !== JSON.stringify(book);
    status.source = 'local';
    status.checkedAt = Date.now();
    status.error = null;
    if (!book || updated) publish(next, { updated });
    else onChange(book, { ...status, updated: false });
  }

  function refresh() {
    if (inflight) return inflight;
    inflight = (useDrive ? refreshFromDrive() : refreshFromLocal())
      .catch((err) => {
        console.warn('Mise: could not refresh recipes', err);
        status.error = err.message || String(err);
        onChange(book, { ...status, updated: false });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  function start() {
    const cached = useDrive ? readCache() : null;
    if (cached?.book) {
      modifiedTime = cached.modifiedTime;
      status.source = 'cache';
      try {
        publish(cached.book, { updated: false });
      } catch {
        modifiedTime = null;
      }
    }
    refresh();

    setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, CONFIG.pollMinutes * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    window.addEventListener('online', refresh);
  }

  return { start, refresh, get book() { return book; }, status };
}
