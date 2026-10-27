// Take everything out of backend A through its public API, the way you would if
// you were leaving. Writes a folder you could carry anywhere, and reports what the
// API would not give up.
import { A, get, allRows, waitUp } from './lib.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = new URL('./export/', import.meta.url);
await mkdir(new URL('files/', OUT), { recursive: true });
await waitUp(A);

// 1. the schema
const schemas = (await get(A, '/schemas')).json.results;
const mine = schemas.filter((s) => !s.className.startsWith('_') || s.className === '_User');
await writeFile(new URL('schema.json', OUT), JSON.stringify(mine, null, 2));
const fieldCount = Object.fromEntries(mine.map((s) => [s.className, Object.keys(s.fields).length]));
console.log(`  schema:   ${mine.length} classes, fields ${JSON.stringify(fieldCount)}`);

// 2. the rows
const data = {};
for (const s of mine) {
  data[s.className] = await allRows(A, s.className === '_User' ? '_User' : s.className);
}
await writeFile(new URL('data.json', OUT), JSON.stringify(data, null, 2));
console.log(`  rows:     ${Object.entries(data).map(([k, v]) => `${k}=${v.length}`).join(' ')}`);

// 3. the files. The JSON gives you a URL on the OLD host, not the bytes, so the
//    bytes have to be fetched one by one while that host is still answering.
let files = 0, bytes = 0, deadLinks = 0;
for (const [className, rows] of Object.entries(data)) {
  const fileFields = Object.entries(schemas.find((s) => s.className === className).fields)
    .filter(([, f]) => f.type === 'File').map(([n]) => n);
  for (const row of rows) {
    for (const f of fileFields) {
      if (!row[f]?.url) continue;
      const r = await fetch(row[f].url);
      if (!r.ok) { deadLinks++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      await writeFile(new URL(`files/${row[f].name}`, OUT), buf);
      files++; bytes += buf.length;
    }
  }
}
console.log(`  files:    ${files} downloaded (${bytes} bytes), ${deadLinks} unreachable`);

// 4. passwords. They are hashed, and the API does not return the hash.
const anyUser = data._User?.[0] ?? {};
const hasSecret = ['password', 'bcryptPassword', '_hashed_password'].filter((k) => k in anyUser);
console.log(`  passwords: ${hasSecret.length} credential field(s) present in the export`);

// 5. server-side code. Probe the endpoints that might hand it back.
const probes = ['/cloud', '/cloudcode', '/schemas/_CloudCode', '/functions', '/config'];
const found = [];
for (const p of probes) {
  const r = await get(A, p);
  if (r.ok && r.text.includes('discountedPrice')) found.push(p);
}
console.log(`  cloud code: ${found.length} endpoint(s) returned the source of discountedPrice`);

// 6. sessions
const sessions = (await get(A, '/classes/_Session?limit=0&count=1')).json?.count ?? 0;
console.log(`  sessions:  ${sessions} live on A, 0 transferable (tokens are issued per backend)`);
