// Rebuild the app on backend B from the export folder alone. Nothing is read from
// A here: if it is not in ./export, it does not make the trip.
import { B, post, put, req, get, waitUp } from './lib.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const OUT = new URL('./export/', import.meta.url);
const schema = JSON.parse(await readFile(new URL('schema.json', OUT), 'utf8'));
const data = JSON.parse(await readFile(new URL('data.json', OUT), 'utf8'));
await waitUp(B);

// NAIVE=1 does the move the obvious way: push the exported JSON up and call it
// done. It exists so you can watch exactly which parts of the app that breaks.
const NAIVE = process.env.NAIVE === '1';
console.log(`  mode: ${NAIVE ? 'naive (JSON straight up, no remapping)' : 'careful (ids, files and permissions remapped)'}`);

const SYSTEM = new Set(['objectId', 'createdAt', 'updatedAt', 'ACL']);
const payload = (row, drop = []) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !SYSTEM.has(k) && !drop.includes(k)));

// 1. the schema goes up unchanged, minus the fields every class already has
for (const s of schema) {
  if (s.className === '_User') continue;
  const fields = Object.fromEntries(Object.entries(s.fields).filter(([k]) => !SYSTEM.has(k)));
  const r = await post(B, `/schemas/${s.className}`, { className: s.className, fields });
  if (!r.ok && r.json?.code !== 103) throw new Error(`${s.className}: ${r.text}`);
}

// 2. probe: will the destination let us keep the identifiers and the dates?
const probeRow = data.Category[0];
const probe = await post(B, '/classes/Category', {
  ...payload(probeRow), objectId: probeRow.objectId, createdAt: probeRow.createdAt,
});
const keptId = probe.ok && probe.json.objectId === probeRow.objectId;
let keptDate = false;
if (probe.ok) {
  const back = await get(B, `/classes/Category/${probe.json.objectId}`);
  keptDate = back.json.createdAt === probeRow.createdAt;
  await req(B, 'DELETE', `/classes/Category/${probe.json.objectId}`);
}
console.log(`  objectId preserved on import: ${keptId ? 'yes' : 'NO'}`);
console.log(`  createdAt preserved:          ${keptDate ? 'yes' : 'NO'}`);

// 3. rows, parents first, keeping a map from every old id to its new one
const idMap = {};
for (const className of ['Category', '_User', 'Product']) {
  for (const row of data[className] ?? []) {
    let body = payload(row, className === '_User' ? ['sessionToken'] : []);
    if (NAIVE && row.ACL) body.ACL = row.ACL;   // the old user ids, copied verbatim
    // a pointer in the export names an id that only exists on the old backend
    if (!NAIVE) {
      for (const [k, v] of Object.entries(body)) {
        if (v && v.__type === 'Pointer' && idMap[v.objectId]) body[k] = { ...v, objectId: idMap[v.objectId] };
      }
    }
    // the export has no password, so one has to be invented
    if (className === '_User') body.password = randomUUID();
    const path = className === '_User' ? '/users' : `/classes/${className}`;
    const r = await post(B, path, body);
    if (!r.ok) throw new Error(`${className} ${row.objectId}: ${r.text}`);
    idMap[row.objectId] = r.json.objectId;
  }
}
console.log(`  rows inserted:                ${Object.keys(idMap).length}`);

// 4. the file bytes, re-uploaded, and the row pointed at the NEW url
let reup = 0;
for (const name of NAIVE ? [] : await readdir(new URL('files/', OUT))) {
  const bytes = await readFile(new URL(`files/${name}`, OUT));
  const up = await req(B, 'POST', `/files/${name.replace(/^[0-9a-f]+_/, '')}`,
    { body: bytes, raw: true, type: 'image/png' });
  if (!up.ok) throw new Error(up.text);
  for (const row of data.Product) {
    if (row.photo?.name !== name) continue;
    await put(B, `/classes/Product/${idMap[row.objectId]}`,
      { photo: { __type: 'File', name: up.json.name, url: up.json.url } });
    reup++;
  }
}
console.log(`  files re-uploaded:            ${reup}`);

// 5. the permissions, rewritten in terms of the NEW user ids
let acls = 0, orphaned = 0;
for (const row of NAIVE ? [] : data.Product) {
  if (!row.ACL) continue;
  const rebuilt = {};
  for (const [who, perms] of Object.entries(row.ACL)) {
    if (who === '*' || who.startsWith('role:')) { rebuilt[who] = perms; continue; }
    if (idMap[who]) rebuilt[idMap[who]] = perms; else { orphaned++; continue; }
  }
  await put(B, `/classes/Product/${idMap[row.objectId]}`, { ACL: rebuilt });
  acls++;
}
console.log(`  permissions rewritten:        ${acls} row(s), ${orphaned} reference(s) with no matching user`);
