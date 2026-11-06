// Ask the image CDN for every cover at both sizes the site uses, so its cache is warm before a visitor arrives.
// The links come from assets/js/img.js, the code the site itself runs, loaded through a data: URL so Node need not
// treat that .js file as a module. Never fails a build: a cover that cannot be warmed is just a slower first load.
//   node tools/warm.mjs          warm everything
//   node tools/warm.mjs --list   print the links and fetch nothing
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const code = readFileSync(new URL('../assets/js/img.js', here), 'utf8');
const { coverSrc, SIZES } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const covers = JSON.parse(readFileSync(new URL('../data/covers.json', here), 'utf8'));

const urls = new Set();
for (const e of Object.values(covers)) {
  for (const s of [e.src, ...Object.values(e.vols || {}).map(v => (typeof v === 'string' ? v : v?.src))]) {
    for (const size of Object.keys(SIZES)) { const u = s && coverSrc(s, size); if (u && u !== s) urls.add(u); }
  }
}

if (process.argv.includes('--list')) {
  console.log([...urls].sort().join('\n'));
  process.exit(0);
}

const queue = [...urls];
let ok = 0, slow = 0, failed = 0;
async function worker() {
  for (let u; (u = queue.pop());) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
        await r.arrayBuffer();
        if (r.ok) { ok++; if (Date.now() - t0 > 1000) slow++; break; }
        if (attempt) { failed++; console.log(`${r.status} ${u}`); }
      } catch (e) {
        if (attempt) { failed++; console.log(`${e.name} ${u}`); }
      }
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`warmed ${ok} of ${urls.size} cover links (${slow} had to be fetched from the source, ${failed} failed)`);
