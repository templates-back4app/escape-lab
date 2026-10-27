// The export's file URLs point at the backend you are leaving. This asks what they
// are worth once that backend stops answering -- which is the whole point of leaving.
import { B, get } from './lib.mjs';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('./export/data.json', import.meta.url), 'utf8'));
const exported = data.Product.find((p) => p.photo?.url)?.photo?.url;

async function probe(url) {
  try { const r = await fetch(url); return r.ok ? `${(await r.arrayBuffer()).byteLength} bytes` : `HTTP ${r.status}`; }
  catch (e) { return `unreachable (${e.cause?.code ?? e.message})`; }
}

const where = encodeURIComponent(JSON.stringify({ photo: { $exists: true } }));
const onCopy = (await get(B, `/classes/Product?where=${where}&limit=1`)).json.results[0]?.photo?.url;

console.log(`  the url written in the export:  ${await probe(exported)}`);
console.log(`  the same image on the copy:     ${await probe(onCopy)}`);
