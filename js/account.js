import { CONFIG } from '../config.js';

// Optional Google sign-in that keeps favorites and recently opened recipes in
// step across devices. The state lives in the Drive "app data" folder: a
// hidden, per-app space this app can see and nothing else in the user's Drive.
//
// Sign-in is a page redirect rather than a popup, because popups don't work
// in an iPad home-screen app. Google's access lasts about an hour; after that
// the app redirects again without asking (prompt=none), only when it opens or
// comes back to the library, never in the middle of cooking.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPE = `email ${DRIVE_SCOPE}`;
const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_NAME = 'mise-state.json';

const ACCOUNT_KEY = 'mise.account.v1';
const RECORD_KEY = 'mise.sync.v1';
const PENDING_KEY = 'mise.signin.v1';

const KEEP_OPENED = 30;
const SILENT_RETRY_MS = 60 * 1000;
const PUSH_DELAY_MS = 1500;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// The synced record. Every change carries a time, so merging two devices
// keeps the latest choice: unstarring on the iPad sticks on the laptop.
//   favorites: { [recipeId]: { on: true|false, at: ms } }
//   opened:    { [recipeId]: ms }
function emptyRecord() {
  return { favorites: {}, opened: {} };
}

function seedRecord({ favorites, recent }) {
  // Older choices made before sign-in existed get tiny times, so anything
  // done since on any device wins over them.
  const record = emptyRecord();
  for (const id of favorites) record.favorites[id] = { on: true, at: 1 };
  recent.forEach((id, i) => { record.opened[id] = recent.length - i; });
  return record;
}

function merge(a, b) {
  const favorites = { ...a.favorites };
  for (const [id, f] of Object.entries(b.favorites || {})) {
    const mine = favorites[id];
    if (!mine || f.at > mine.at || (f.at === mine.at && f.on)) favorites[id] = f;
  }
  const opened = { ...a.opened };
  for (const [id, at] of Object.entries(b.opened || {})) {
    if (!(opened[id] >= at)) opened[id] = at;
  }
  const newest = Object.entries(opened).sort((x, y) => y[1] - x[1]).slice(0, KEEP_OPENED);
  return { favorites, opened: Object.fromEntries(newest) };
}

// Same content, same string: used to skip writes that change nothing.
function canon(record) {
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
  return JSON.stringify({ favorites: sorted(record.favorites), opened: sorted(record.opened) });
}

function lists(record) {
  const favorites = Object.entries(record.favorites)
    .filter(([, f]) => f.on).sort((x, y) => x[1].at - y[1].at).map(([id]) => id);
  const recent = Object.entries(record.opened).sort((x, y) => y[1] - x[1]).map(([id]) => id);
  return { favorites, recent };
}

class AuthError extends Error {}

/**
 * `seed()` returns the device's current { favorites, recent } the first time.
 * `onChange(lists)` runs when another device's changes arrive.
 * `onStatus()` runs when the sign-in or sync status changes.
 * `canRedirect()` says whether leaving the page briefly is fine right now.
 */
export function createAccount({ seed, onChange, onStatus, canRedirect }) {
  const enabled = Boolean(CONFIG.googleClientId);
  let acct = read(ACCOUNT_KEY) || {};
  let record = read(RECORD_KEY) || seedRecord(seed());
  let state = 'idle'; // idle | syncing | synced | offline | error
  let syncedAt = null;
  let queue = Promise.resolve();
  let pushTimer = null;

  write(RECORD_KEY, record);

  function saveAccount() {
    write(ACCOUNT_KEY, acct.email || acct.token ? acct : null);
  }

  function tokenValid() {
    return Boolean(acct.token) && acct.expiresAt > Date.now();
  }

  function setState(next) {
    state = next;
    onStatus();
  }

  function redirectUri() {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }

  function signIn({ silent = false } = {}) {
    const nonce = crypto.randomUUID();
    write(PENDING_KEY, { state: nonce, silent, hash: location.hash });
    const p = new URLSearchParams({
      client_id: CONFIG.googleClientId,
      redirect_uri: redirectUri(),
      response_type: 'token',
      scope: SCOPE,
      state: nonce,
      include_granted_scopes: 'true',
    });
    if (acct.email) p.set('login_hint', acct.email);
    // Ask again explicitly if Drive access was left out last time.
    if (acct.missingScope && !silent) p.set('prompt', 'consent');
    if (silent) {
      p.set('prompt', 'none');
      acct.lastSilent = Date.now();
      saveAccount();
    }
    location.assign(`${AUTH_URL}?${p}`);
  }

  function trySilentRenew() {
    if (!acct.email || tokenValid() || acct.needsReconnect) return false;
    if (Date.now() - (acct.lastSilent || 0) < SILENT_RETRY_MS) return false;
    signIn({ silent: true });
    return true;
  }

  // Google sends the result back in the URL fragment. Read it, then put the
  // address back to the screen the person was on.
  function handleRedirect() {
    if (!/(^#|&)(access_token|error)=/.test(location.hash)) return;
    const p = new URLSearchParams(location.hash.slice(1));
    const pending = read(PENDING_KEY);
    write(PENDING_KEY, null);
    history.replaceState(null, '', location.pathname + location.search + (pending?.hash || ''));
    if (!pending || p.get('state') !== pending.state) return;
    if (p.get('access_token') && !(p.get('scope') || '').split(' ').includes(DRIVE_SCOPE)) {
      // Signed in, but Drive access was left unticked or isn't offered.
      acct.token = null;
      acct.needsReconnect = true;
      acct.missingScope = true;
    } else if (p.get('access_token')) {
      acct.token = p.get('access_token');
      acct.missingScope = false;
      acct.expiresAt = Date.now() + (Number(p.get('expires_in')) - 60) * 1000;
      acct.needsReconnect = false;
      if (!pending.silent) acct.lastSilent = 0;
    } else if (pending.silent) {
      // Signed out of Google, or access was removed: wait for a tap.
      acct.needsReconnect = true;
      acct.token = null;
    }
    saveAccount();
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: { ...opts.headers, Authorization: `Bearer ${acct.token}` },
    });
    if (res.status === 401) {
      acct.token = null;
      saveAccount();
      throw new AuthError('Google access expired');
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res;
  }

  async function ensureEmail() {
    if (acct.email && acct.emailChecked) return;
    const info = await (await api('https://www.googleapis.com/oauth2/v3/userinfo')).json();
    acct.email = info.email;
    acct.emailChecked = true;
    saveAccount();
    onStatus();
  }

  async function readRemote() {
    const q = encodeURIComponent(`name='${FILE_NAME}'`);
    const list = await (await api(`${FILES}?spaces=appDataFolder&q=${q}&fields=files(id)`)).json();
    const id = list.files?.[0]?.id;
    if (!id) return null;
    const data = await (await api(`${FILES}/${id}?alt=media`)).json();
    return { id, record: { ...emptyRecord(), ...data } };
  }

  async function writeRemote(id, rec) {
    const body = JSON.stringify(rec);
    if (id) {
      await api(`${UPLOAD}/${id}?uploadType=media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
      });
      return;
    }
    const b = `mise${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    await api(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
        + `--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`,
    });
  }

  // Read what other devices saved, merge, show it, and save back the result.
  async function syncOnce() {
    if (!tokenValid()) {
      onStatus();
      return;
    }
    setState('syncing');
    try {
      await ensureEmail();
      const remote = await readRemote();
      const merged = merge(record, remote?.record || emptyRecord());
      if (canon(merged) !== canon(record)) {
        record = merged;
        write(RECORD_KEY, record);
        onChange(lists(record));
      }
      if (!remote || canon(merged) !== canon(remote.record)) await writeRemote(remote?.id, merged);
      syncedAt = Date.now();
      setState('synced');
    } catch (err) {
      console.warn('Mise: could not sync', err);
      setState(err instanceof AuthError ? 'idle' : navigator.onLine ? 'error' : 'offline');
    }
  }

  function sync() {
    queue = queue.then(syncOnce);
    return queue;
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sync, PUSH_DELAY_MS);
  }

  function noteFavorite(id, on) {
    record.favorites[id] = { on, at: Date.now() };
    write(RECORD_KEY, record);
    if (tokenValid()) schedulePush();
  }

  function noteOpened(id) {
    record = merge(record, { favorites: {}, opened: { [id]: Date.now() } });
    write(RECORD_KEY, record);
    if (tokenValid()) schedulePush();
  }

  function signOut() {
    if (acct.token) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acct.token)}`, {
        method: 'POST', mode: 'no-cors',
      }).catch(() => {});
    }
    acct = {};
    saveAccount();
    syncedAt = null;
    setState('idle');
  }

  function catchUp() {
    if (tokenValid()) sync();
    else if (canRedirect()) trySilentRenew();
    else onStatus();
  }

  /** Returns true when the page is about to leave for Google's sign-in. */
  function start() {
    if (!enabled) return false;
    handleRedirect();
    if (trySilentRenew()) return true;
    if (tokenValid()) sync();

    setInterval(() => {
      if (document.visibilityState === 'visible' && tokenValid()) sync();
    }, CONFIG.pollMinutes * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') catchUp();
    });
    window.addEventListener('online', () => {
      if (tokenValid()) sync();
    });
    return false;
  }

  return {
    start,
    signIn,
    signOut,
    sync,
    noteFavorite,
    noteOpened,
    /** The current Google access token, or null when it has expired. */
    token: () => (tokenValid() ? acct.token : null),
    get status() {
      return {
        enabled,
        signedIn: Boolean(acct.email),
        email: acct.email || '',
        connected: tokenValid(),
        needsReconnect: Boolean(acct.email) && !tokenValid(),
        missingScope: Boolean(acct.missingScope),
        state,
        syncedAt,
      };
    },
  };
}
