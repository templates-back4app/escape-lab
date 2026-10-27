// Minimal REST client for a Parse-compatible backend. No dependencies: everything
// here is an HTTP call anyone can make with curl, which is the first thing the
// escape test is checking.

export const A = { base: 'http://127.0.0.1:1337/parse', appId: 'origin-app',      master: 'origin-master-key' };
export const B = { base: 'http://127.0.0.1:1338/parse', appId: 'destination-app', master: 'destination-master-key' };

function headers(s, { master = true, session, type = 'application/json' } = {}) {
  const h = { 'X-Parse-Application-Id': s.appId, 'X-Parse-Revocable-Session': '1' };
  if (type) h['Content-Type'] = type;
  if (master) h['X-Parse-Master-Key'] = s.master;
  if (session) h['X-Parse-Session-Token'] = session;
  return h;
}

export async function req(s, method, path, { body, master = true, session, type, raw } = {}) {
  const r = await fetch(s.base + path, {
    method,
    headers: headers(s, { master, session, type: raw ? type : (body ? 'application/json' : null) }),
    body: raw ? body : (body ? JSON.stringify(body) : undefined),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, ok: r.ok, json, text };
}

export const get  = (s, p, o)    => req(s, 'GET', p, o);
export const post = (s, p, b, o) => req(s, 'POST', p, { ...o, body: b });
export const put  = (s, p, b, o) => req(s, 'PUT', p, { ...o, body: b });

// Pull every row of a class, in pages, ordered so two runs agree.
export async function allRows(s, className) {
  const out = [];
  for (let skip = 0; ; skip += 500) {
    const r = await get(s, `/classes/${className}?limit=500&skip=${skip}&order=createdAt,objectId`);
    if (!r.ok) throw new Error(`${className}: ${r.text}`);
    out.push(...r.json.results);
    if (r.json.results.length < 500) break;
  }
  return out;
}

export async function waitUp(s, seconds = 90) {
  for (let i = 0; i < seconds * 2; i++) {
    try {
      const r = await get(s, '/serverInfo');
      if (r.status === 200) return true;
    } catch {}
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`backend at ${s.base} never came up`);
}

// A tiny, valid PNG -- the file we will try to carry across.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR42mNk' +
  'YPjPgAwYhxhgHGKAcYgBxiEGGIcYYBxigHEIAQCk1Qr3kGsVHAAAAABJRU5ErkJggg==', 'base64');

// Deterministic pseudo-random, so the seeded data is identical on every run.
export function rng(seed = 42) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
