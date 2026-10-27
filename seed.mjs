// Build the backend of a small app on backend A: classes, rows, relationships,
// a file, users with passwords, and one row only its owner may read.
import { A, post, get, req, PNG, rng } from './lib.mjs';
import { waitUp } from './lib.mjs';
import { USERS } from './users.mjs';

const CATEGORIES = ['Tools', 'Garden', 'Kitchen'];
const WORDS = ['Copper', 'Folding', 'Heavy', 'Compact', 'Brass', 'Steel', 'Quiet', 'Wide'];
const NOUNS = ['Wrench', 'Trowel', 'Kettle', 'Clamp', 'Shears', 'Funnel', 'Hammer', 'Sieve'];

await waitUp(A);

// Classes, with the field types spelled out, so the schema itself is part of the export.
async function defineClass(className, fields) {
  const r = await post(A, `/schemas/${className}`, { className, fields });
  if (!r.ok && r.json?.code !== 103) throw new Error(`${className}: ${r.text}`);
}
await defineClass('Category', { name: { type: 'String' } });
await defineClass('Product', {
  name:     { type: 'String' },
  price:    { type: 'Number' },
  sku:      { type: 'String' },
  tags:     { type: 'Array' },
  photo:    { type: 'File' },
  category: { type: 'Pointer', targetClass: 'Category' },
});

const cats = {};
for (const name of CATEGORIES) {
  const r = await post(A, '/classes/Category', { name });
  if (!r.ok) throw new Error(r.text);
  cats[name] = r.json.objectId;
}

const rand = rng(7);
let made = 0;
for (let i = 0; i < 120; i++) {
  const name = `${WORDS[Math.floor(rand() * WORDS.length)]} ${NOUNS[Math.floor(rand() * NOUNS.length)]}`;
  const cat = CATEGORIES[i % CATEGORIES.length];
  const r = await post(A, '/classes/Product', {
    name,
    price: Math.round((4 + rand() * 90) * 100) / 100,
    sku: `SKU-${String(i).padStart(4, '0')}`,
    tags: rand() > 0.5 ? ['sale'] : ['sale', 'new'],
    category: { __type: 'Pointer', className: 'Category', objectId: cats[cat] },
  });
  if (!r.ok) throw new Error(r.text);
  made++;
  if (i === 0) {
    // one product carries an uploaded image
    const up = await req(A, 'POST', '/files/photo.png', { body: PNG, raw: true, type: 'image/png' });
    if (!up.ok) throw new Error(up.text);
    const patch = await req(A, 'PUT', `/classes/Product/${r.json.objectId}`, {
      body: { photo: { __type: 'File', name: up.json.name, url: up.json.url } },
    });
    if (!patch.ok) throw new Error(patch.text);
    console.log(`  uploaded photo.png -> ${up.json.url}`);
  }
}

const userIds = {};
for (const u of USERS) {
  const r = await post(A, '/users', u);
  if (r.ok) { userIds[u.username] = r.json.objectId; continue; }
  if (r.json?.code !== 202) throw new Error(r.text);
  // the account is already there: a signup does not return its id, so look it up
  const where = encodeURIComponent(JSON.stringify({ username: u.username }));
  const found = await get(A, `/classes/_User?where=${where}`);
  userIds[u.username] = found.json.results[0].objectId;
}

// A row only ana may read: the permission is written in terms of HER object id.
const priv = await post(A, '/classes/Product', {
  name: "Ana's private draft",
  price: 999,
  sku: 'SKU-PRIVATE',
  tags: ['draft'],
  category: { __type: 'Pointer', className: 'Category', objectId: cats.Tools },
  ACL: { [userIds.ana]: { read: true, write: true } },
});
if (!priv.ok) throw new Error(priv.text);
made++;

const counts = {};
for (const c of ['Category', 'Product', '_User']) {
  const r = await get(A, `/classes/${c}?limit=0&count=1`);
  counts[c] = r.json.count;
}
console.log(`  seeded A: ${JSON.stringify(counts)} (restricted row owned by ana=${userIds.ana})`);
