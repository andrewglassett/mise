// Reads a recipe web page into something short enough to hand to Claude.
// Most recipe sites embed a schema.org Recipe as JSON-LD for search engines:
// it has the ingredients and steps without the life story, so prefer it.

const MAX_TEXT = 60_000;

function findRecipe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findRecipe(n);
      if (hit) return hit;
    }
    return null;
  }
  const type = [].concat(node['@type'] || []);
  if (type.includes('Recipe')) return node;
  return findRecipe(node['@graph']) || findRecipe(node.mainEntity);
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;/g, '’')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function pageText(html) {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|p|div|li|h\d|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decode(body).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, MAX_TEXT);
}

function meta(html, name) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
  return m ? decode(m[1]).trim() : '';
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

/** Returns { url, title, kind, content }: the page's JSON-LD or its text. */
export async function readPage(url) {
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new Error('That doesn’t look like a web address');
  }
  if (!/^https?:$/.test(target.protocol)) throw new Error('Only http and https links work');
  // Instagram only shows posts to signed-in people, so a server can't read them.
  if (/(^|\.)instagram\.com$/.test(target.hostname)) {
    throw new Error('Instagram doesn’t let other apps read posts. Take a screenshot of the recipe and use From a photo.');
  }

  const res = await fetch(target, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`The site answered ${res.status}. Try copying the recipe and pasting it in.`);
  const html = await res.text();
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();

  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = findRecipe(JSON.parse(m[1].trim()));
      if (found) {
        // Reviews and ratings are long and say nothing about cooking.
        const { review, aggregateRating, video, articleBody, ...rest } = found;
        return { url: res.url, title, kind: 'json-ld', content: JSON.stringify(rest) };
      }
    } catch {
      // Some sites ship invalid JSON-LD; fall through to the page text.
    }
  }
  // Pages built by scripts have little text; their share description helps.
  const description = meta(html, 'og:description') || meta(html, 'description');
  const text = `${description ? `${description}\n\n` : ''}${pageText(html)}`.trim();
  if (text.length < 200) throw new Error('Couldn’t read a recipe from that page. Try copying it and pasting it in.');
  return { url: res.url, title, kind: 'text', content: text };
}
