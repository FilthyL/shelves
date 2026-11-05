// Generative cover art, spines, back covers and case frames. Pure CSS, no images needed.
import { rng, esc, hash, compactRanges } from './model.js';

const COMPS = {
  music:  ['orb', 'rings', 'grid', 'sun', 'mesh', 'stripes', 'type', 'arch', 'split', 'void'],
  movies: ['orb', 'split', 'type', 'sun', 'mesh', 'arch', 'bands', 'rings'],
  books:  ['type', 'bands', 'arch', 'grid', 'orb', 'stripes', 'split'],
  anime:  ['mesh', 'sun', 'orb', 'rings', 'split', 'arch'],
  manga:  ['mesh', 'sun', 'orb', 'rings', 'split', 'grid'],
};

const STYLES = ['serif', 'cond', 'wide', 'serif', 'cond'];

export function palVars(x) {
  const p = Array.isArray(x) ? x : x.pal;
  return `--bg:${p[0]};--ink:${p[1]};--ac:${p[2]};--ex:${p[3]}`;
}

function titleSize(t, style) {
  const n = t.length;
  let s = n <= 4 ? 30 : n <= 8 ? 20 : n <= 14 ? 14 : n <= 22 ? 11 : n <= 32 ? 9 : 7.2;
  s *= { cond: 1.12, wide: 0.72, serif: 1, mono: 0.7 }[style] || 1;
  // the longest word has to fit on one line, so titles never break mid-word
  const longest = Math.max(...String(t).split(/\s+/).map(w => w.length), 1);
  const em = { cond: 0.5, wide: 0.92, serif: 0.56, mono: 0.62 }[style] || 0.6;
  return Math.min(s, 84 / (longest * em)).toFixed(2);
}

function lastName(c) {
  if (!c) return '';
  const first = String(c).split(/\s*(?:&|,| and )\s*/)[0];
  const parts = first.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/** Front-cover markup for one physical object. Caller wraps it in .cover (a size container). */
export function coverHTML(obj) {
  const it = obj.item;
  const r = rng(it.seed ^ 0x9e3779b9);
  const comps = COMPS[it.kind] || COMPS.books;
  const comp = it.art && COMPS.music.concat(COMPS.books).includes(it.art) ? it.art : comps[Math.floor(r() * comps.length)];
  const vr = obj.vol ? rng(it.seed + obj.vol * 7919) : r; // volumes vary their art a little
  const x = 20 + vr() * 60, y = 22 + vr() * 50, rad = 22 + vr() * 22, a = Math.floor(vr() * 180), k = 2 + vr() * 5;
  const hue = obj.vol ? (obj.vol * 23) % 360 : 0;
  const style = it.kind === 'manga' ? 'cond' : STYLES[Math.floor(r() * STYLES.length)];
  const place = ['tl', 'bl', 'tl', 'bl', 'c'][Math.floor(r() * 5)];
  const vars = `${palVars(it)};--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--r:${rad.toFixed(1)};--a:${a}deg;--k:${k.toFixed(2)};--hue:${hue}deg`;

  let shape = '';
  if (comp === 'grid') {
    const shapes = ['q0', 'q1', 'q2', 'q3', 'ci', 'tr', 'sq', 'hc', 'no'];
    const cols = ['var(--ac)', 'var(--ex)', 'var(--ink)', 'var(--bg)'];
    for (let i = 0; i < 12; i++) {
      const s = shapes[Math.floor(vr() * shapes.length)];
      const c = cols[Math.floor(vr() * 3)];
      shape += `<i class="tl-${s}" style="--c:${c}"></i>`;
    }
  }

  const T = esc(it.title), C = esc(it.creator || '');
  const ts = titleSize(it.title, style);
  let type = '';
  if (it.kind === 'manga') {
    type = `<span class="mg-logo"><b style="--ts:${titleSize(it.title, 'cond')}">${T}</b>${it.original && it.original !== it.title ? `<small>${esc(it.original)}</small>` : ''}</span>
      <span class="mg-vol"><small>VOL.</small>${obj.vol ?? 1}</span>
      <span class="mg-foot"><b>${C}</b><i>${esc(it.publisher || 'Filthy Residency')}</i></span>`;
  } else if (comp !== 'void' || it.kind !== 'music') {
    const creator = `<span class="art-creator">${C}</span>`;
    const title = `<span class="art-title s-${style}" style="--ts:${ts}">${T}</span>`;
    type = `<span class="art-type p-${place}">${it.kind === 'books' || it.kind === 'music' ? creator + title : title + creator}</span>`;
  }

  let extra = '';
  if (it.kind === 'movies') {
    const bits = [it.year, it.runtime && `${it.runtime} min`, it.country].filter(Boolean).map(esc).join(' · ');
    extra = `<span class="art-billing"><b>A ${C} film</b><i>${bits}</i></span>`;
  } else if (it.kind === 'anime' && it.original) {
    extra = `<span class="art-jp">${esc(it.original)}</span>`;
  } else if (it.kind === 'books') {
    extra = `<span class="art-colophon">FR</span>`;
  }

  const art = `<div class="art art-${comp} k-${it.kind}" style="${vars}"><span class="art-shape">${shape}</span>${type}${extra}</div>`;
  if (!obj.cover) return art;
  // a series cover reused for a volume gets a volume badge; a real per-volume cover already shows it
  const badge = obj.vol && obj.cover === it.cover && !it.volCovers[obj.vol] ? `<span class="img-vol">${obj.vol}</span>` : '';
  return `${art}<img class="art-img" src="${esc(obj.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">${badge}`;
}

/** Inner markup for a spine. The wrapper carries palette vars and sp-<group>/fmt-<format>. */
export function spineHTML(obj) {
  const it = obj.item;
  const T = esc(it.title), C = esc(it.creator || '');
  const tip = `<span class="sp-shade"></span>`;
  switch (it.fmt.group) {
    case 'sleeve':
      return `<span class="sp-v"><b>${C}</b><i>${T}</i></span>${tip}`;
    case 'jewel':
      return `<span class="sp-ins"><span class="sp-v"><b>${C}</b><i>${T}</i></span><span class="sp-cat">${esc(it.cat.slice(-3))}</span></span>${tip}`;
    case 'cassette':
      return `<span class="sp-ins"><span class="sp-v"><b>${C}</b><i>${T}</i></span></span>${tip}`;
    case 'case': {
      const band = { bluray: 'BLU-RAY', '4k': '4K UHD', dvd: 'DVD' }[it.format];
      return `<span class="sp-band">${band}</span><span class="sp-ins"><span class="sp-v"><i>${T}</i><b>${esc(lastName(it.creator))}</b></span><span class="sp-foot">${esc(it.year || '')}</span></span>${tip}`;
    }
    case 'vhs': {
      const sticker = hash(it.id) % 3 === 0 ? '<span class="sp-sticker">BE KIND<br>REWIND</span>' : '';
      return `<span class="sp-v"><i>${T}</i></span>${sticker}<span class="sp-vhs">VHS</span>${tip}`;
    }
    case 'box':
      return `<span class="sp-v"><i>${T}</i></span><span class="sp-obi"><span>${esc(it.original || 'BOX')}</span><em>完全生産限定版</em></span><span class="sp-foot">BD-BOX</span>${tip}`;
    case 'book':
      return `<span class="sp-band t"></span><span class="sp-v"><i>${T}</i><b>${esc(lastName(it.creator))}</b></span><span class="sp-band b"></span><span class="sp-colo"></span>${tip}`;
    case 'manga':
      return `<span class="sp-mtop"><b>${obj.vol}</b></span><span class="sp-v"><i>${T}</i></span><span class="sp-v sp-auth">${C}</span><span class="sp-pub"></span>${tip}`;
    default:
      return `<span class="sp-v"><i>${T}</i></span>${tip}`;
  }
}

export function spineClass(obj) {
  return `spine sp-${obj.item.fmt.group} fmt-${obj.item.format}`;
}

/** A face-out object: the cover inside its case or sleeve. */
export function frameHTML(obj) {
  const it = obj.item, g = it.fmt.group;
  const cover = `<span class="cover">${coverHTML(obj)}</span>`;
  const gloss = '<span class="fr-gloss"></span>';
  switch (g) {
    case 'jewel': return `<span class="fr fr-jewel"><span class="fr-hinge"></span>${cover}${gloss}</span>`;
    case 'case': {
      const band = { bluray: 'BLU-RAY', '4k': '4K ULTRA HD', dvd: '' }[it.format];
      return `<span class="fr fr-case fr-${it.format}">${band ? `<span class="fr-band">${band}</span>` : ''}${cover}${gloss}</span>`;
    }
    case 'cassette': return `<span class="fr fr-cassette">${cover}${gloss}</span>`;
    case 'sleeve': return `<span class="fr fr-sleeve">${cover}<span class="fr-wear"></span></span>`;
    case 'vhs': return `<span class="fr fr-vhs">${cover}<span class="fr-wear"></span></span>`;
    case 'box': return `<span class="fr fr-box">${cover}<span class="fr-obi"><em>完全生産限定版</em></span>${gloss}</span>`;
    case 'book': return `<span class="fr fr-book fr-${it.format}">${cover}<span class="fr-hinge"></span></span>`;
    case 'manga': return `<span class="fr fr-manga">${cover}<span class="fr-hinge"></span></span>`;
    default: return `<span class="fr">${cover}</span>`;
  }
}

function barcode(seed) {
  const r = rng(seed);
  let x = 0; const stops = [];
  while (x < 96) {
    const w = 0.8 + Math.floor(r() * 3) * 0.9;
    const gap = 0.7 + Math.floor(r() * 2) * 0.9;
    stops.push(`#111 ${x.toFixed(1)}% ${(x + w).toFixed(1)}%`, `transparent ${(x + w).toFixed(1)}% ${(x + w + gap).toFixed(1)}%`);
    x += w + gap;
  }
  const digits = String(seed % 1e12).padStart(12, '0');
  return `<span class="barcode"><span style="background:linear-gradient(90deg,${stops.join(',')})"></span><i>${digits.slice(0, 1)} ${digits.slice(1, 7)} ${digits.slice(7)}</i></span>`;
}

/** Back cover. Tracklist for records, blurb and specs for everything else. */
export function backHTML(obj) {
  const it = obj.item;
  let body = '';
  if (it.kind === 'music' && Array.isArray(it.tracks) && it.tracks.length) {
    const sides = it.format === 'vinyl' || it.format === 'cassette';
    const half = Math.ceil(it.tracks.length / 2);
    const li = (t, i) => `<li><span>${sides ? (i < half ? 'A' : 'B') + ((i < half ? i : i - half) + 1) : String(i + 1).padStart(2, '0')}</span>${esc(t)}</li>`;
    body = `<ol class="bk-tracks">${it.tracks.map(li).join('')}</ol>`;
  } else {
    const blurb = it.note || `${it.title}${it.creator ? `, ${it.creator}` : ''}${it.year ? `, ${it.year}` : ''}.`;
    body = `<p class="bk-blurb">${esc(blurb)}</p>`;
    if (it.tags.length) body += `<p class="bk-tags">${it.tags.map(esc).join(' / ')}</p>`;
  }
  const spec = [it.fmt.label, it.year, it.runtime && `${it.runtime} min`, it.episodes && `${it.episodes} eps`, it.pages && `${it.pages} pp`,
    obj.vol && `Vol. ${obj.vol}`].filter(Boolean).map(esc).join(' · ');
  return `<div class="back k-${it.kind} bk-${it.fmt.group}" style="${palVars(obj.pal || it.pal)}">
    <div class="bk-head"><b>${esc(it.title)}</b><i>${esc(it.creator || '')}</i></div>
    ${body}
    <div class="bk-foot">${barcode(it.seed)}<span class="bk-meta"><b>${esc(it.cat)}${obj.vol ? `·${String(obj.vol).padStart(2, '0')}` : ''}</b><i>${spec}</i><i>Filthy Residency Collection</i></span></div>
  </div>`;
}

/** The disc / record / tape that slides out in the inspector. */
export function mediaHTML(obj) {
  const it = obj.item, pv = palVars(obj.pal || it.pal);
  if (it.format === 'vinyl') {
    return `<span class="media media-vinyl" style="${pv}"><span class="vinyl-spin"><span class="vinyl-label"><b>${esc(it.creator || '')}</b><i>${esc(it.title)}</i><em>33⅓ RPM</em></span></span></span>`;
  }
  if (it.format === 'cd') {
    return `<span class="media media-cd" style="${pv}"><span class="cd-spin"><span class="cd-print"><b>${esc(it.title)}</b></span></span></span>`;
  }
  if (it.format === 'cassette') {
    return `<span class="media media-tape" style="${pv}"><span class="tape-label"><b>${esc(it.title)}</b><i>A</i></span><span class="tape-win"><i></i><i></i></span></span>`;
  }
  return '';
}

export function volumeLine(it) {
  const owned = compactRanges(it.vols || []);
  return it.total ? `${owned} of ${it.total}` : owned;
}
