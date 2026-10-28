// Google calls the Worker makes: checking who is asking, and reading and
// writing recipes.json as the service account.

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * The app sends the Google access token it already has from signing in.
 * Google says which app it was issued to and whose account it is; only the
 * owner's account, signed in through Mise itself, gets through.
 */
export async function requireOwner(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in to add recipes');
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new HttpError(401, 'Your Google sign-in has expired. Sign in again.');
  const info = await res.json();
  const owner = env.OWNER_EMAIL.toLowerCase();
  if (info.aud !== env.GOOGLE_CLIENT_ID || String(info.email_verified) !== 'true'
    || (info.email || '').toLowerCase() !== owner) {
    throw new HttpError(403, 'Only the owner of this recipe book can add recipes');
  }
}

function b64url(bytes) {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cached = null;

// A service account signs its own short-lived request for an access token
// (a JWT signed with its private key). Tokens last an hour; reuse one while
// this Worker instance is warm.
async function serviceToken(env) {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = key.private_key.replace(/-----[^-]+-----|\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const signer = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signer, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`Service account sign-in failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

async function drive(env, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${await serviceToken(env)}` },
  });
  if (res.status === 404) throw new Error('The service account can’t see recipes.json. Share the file with it as Editor.');
  if (!res.ok) throw new Error(`Drive: ${res.status} ${await res.text()}`);
  return res;
}

async function fileVersion(env) {
  const meta = await (await drive(env, `${FILES}/${env.DRIVE_FILE_ID}?fields=version,modifiedTime`)).json();
  return meta.version;
}

/** The current recipe book and the Drive version it was read at. */
export async function readBook(env) {
  const version = await fileVersion(env);
  const book = await (await drive(env, `${FILES}/${env.DRIVE_FILE_ID}?alt=media`)).json();
  return { book, version };
}

/**
 * Writes the whole file back in place, keeping its Drive ID. Drive has no
 * "only if unchanged" write, so check the version again just before writing;
 * an edit made in between is not overwritten.
 */
export async function writeBook(env, book, version) {
  if (await fileVersion(env) !== version) {
    throw new HttpError(409, 'recipes.json changed while saving. Try Save again.');
  }
  const res = await drive(env, `${UPLOAD}/${env.DRIVE_FILE_ID}?uploadType=media&fields=modifiedTime`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(book, null, 2),
  });
  return (await res.json()).modifiedTime;
}
