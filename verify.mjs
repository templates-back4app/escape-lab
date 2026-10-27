// Run one battery of checks against both backends and print them side by side.
// Every check is something the app actually does, not a count of bytes moved.
import { A, B, get, post, waitUp } from './lib.mjs';
import { USERS } from './users.mjs';

const CHECKS = [
  ['categories', async (s) => String((await get(s, '/classes/Category?limit=0&count=1')).json.count)],
  ['products', async (s) => String((await get(s, '/classes/Product?limit=0&count=1')).json.count)],
  ['fields on Product', async (s) =>
    String(Object.keys((await get(s, '/schemas/Product')).json.fields).length)],
  ['cheapest 3 in Garden', async (s) => {
    const cat = (await get(s, '/classes/Category?where=' + encodeURIComponent(JSON.stringify({ name: 'Garden' })))).json.results[0];
    const where = { category: { __type: 'Pointer', className: 'Category', objectId: cat.objectId } };
    const r = await get(s, `/classes/Product?where=${encodeURIComponent(JSON.stringify(where))}&order=price,sku&limit=3&keys=name`);
    return r.json.results.map((p) => p.name).join(' / ');
  }],
  ['pointer resolves', async (s) => {
    const where = encodeURIComponent(JSON.stringify({ sku: 'SKU-0005' }));
    const r = await get(s, `/classes/Product?where=${where}&include=category`);
    return r.json.results[0]?.category?.name ?? 'BROKEN';
  }],
  ['the uploaded image loads', async (s) => {
    const where = encodeURIComponent(JSON.stringify({ photo: { $exists: true } }));
    const r = await get(s, `/classes/Product?where=${where}&limit=1`);
    const url = r.json.results[0]?.photo?.url;
    if (!url) return 'no file on any row';
    try {
      const f = await fetch(url);
      return f.ok ? `${(await f.arrayBuffer()).byteLength} bytes` : `HTTP ${f.status}`;
    } catch (e) { return `unreachable (${e.cause?.code ?? e.message})`; }
  }],
  ['oldest product dated', async (s) => {
    const r = await get(s, '/classes/Product?order=createdAt&limit=1&keys=createdAt');
    return (r.json.results[0]?.createdAt ?? '?').slice(0, 10);
  }],
  ['ana can log in', async (s) => {
    const u = USERS[0];
    const r = await get(s, `/login?username=${u.username}&password=${encodeURIComponent(u.password)}`, { master: false });
    return r.ok ? 'yes' : `no (${r.json?.error ?? r.status})`;
  }],
  ['ana reads her private row', async (s) => {
    const u = USERS[0];
    const log = await get(s, `/login?username=${u.username}&password=${encodeURIComponent(u.password)}`, { master: false });
    if (!log.ok) return 'cannot try: no login';
    const where = encodeURIComponent(JSON.stringify({ sku: 'SKU-PRIVATE' }));
    const r = await get(s, `/classes/Product?where=${where}`, { master: false, session: log.json.sessionToken });
    return r.json?.results?.length === 1 ? 'yes' : 'no';
  }],
  ['that row is still owner-only', async (s) => {
    const where = encodeURIComponent(JSON.stringify({ sku: 'SKU-PRIVATE' }));
    const anon = await get(s, `/classes/Product?where=${where}`, { master: false });
    const mk = await get(s, `/classes/Product?where=${where}`);
    const acl = mk.json?.results?.[0]?.ACL ?? {};
    const named = Object.keys(acl).filter((k) => k !== '*' && !k.startsWith('role:'));
    if (!named.length) return 'NO: nobody named';
    const user = await get(s, `/classes/_User/${named[0]}`);
    const who = user.ok ? user.json.username : 'MISSING USER';
    return `${anon.json.results.length === 0 ? 'yes' : 'NO: public'}, owner=${who}`;
  }],
  ['cloud function answers', async (s) => {
    const r = await post(s, '/functions/discountedPrice', { sku: 'SKU-0005' });
    return r.ok ? String(r.json.result) : `no (${r.json?.error ?? r.status})`;
  }],
];

await waitUp(A); await waitUp(B);
const rows = [];
for (const [label, fn] of CHECKS) {
  const a = await fn(A).catch((e) => `error: ${e.message}`);
  const b = await fn(B).catch((e) => `error: ${e.message}`);
  rows.push([label, a, b, a === b ? 'same' : 'DIFFERENT']);
}

const w = [Math.max(...rows.map((r) => r[0].length)), Math.max(...rows.map((r) => r[1].length)), Math.max(...rows.map((r) => r[2].length))];
const line = (r) => `  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`;
console.log('');
console.log(line(['check', 'the backend you built on', 'the copy you moved to', '']));
console.log(`  ${'-'.repeat(w[0])}  ${'-'.repeat(w[1])}  ${'-'.repeat(w[2])}  ----`);
for (const r of rows) console.log(line(r));
console.log('');
console.log(`  ${rows.filter((r) => r[3] === 'same').length} of ${rows.length} checks identical on the copy.`);
