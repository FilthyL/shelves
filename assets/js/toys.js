// The Trick Room's toys: what each toy is made of, how a combo is performed, and how it sounds.
// The tricks themselves, and how a combo becomes one continuous track, live in tricks.js. The real
// models are in toys3d.js; the flat CSS rigs below only stand in when Three.js can't load.
import { play, bed } from './sound.js';
import {
  BALISONG_TRICKS, CARD_MOVES, KARAMBIT_TRICKS, COMBOS, CARD_TEMPO, N, cardOf,
  knifeRoutine, karambitRoutine, deckRoutine, ramp, fold,
} from './tricks.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const RAD = Math.PI / 180;

// ============================================================ FLAT STAND-INS (no hands)
function handleHTML(bite) {
  const holes = [26, 52, 78, 104].map(x => `<i style="left:${x}px;width:${x === 104 ? 18 : 20}px"></i>`).join('');
  return `<span class="bl-handle${bite ? ' bite' : ''}">${holes}<b class="pin"></b>${bite ? '<b class="latch"></b>' : ''}</span>`;
}

const BLADE_SVG = `<svg class="bl-svg" viewBox="-7 -9 116 28" width="116" height="28" aria-hidden="true">
  <defs><linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#c0cbdc"/><stop offset=".7" stop-color="#8b9bb4"/><stop offset="1" stop-color="#5a6988"/></linearGradient></defs>
  <path fill="url(#steel)" fill-rule="evenodd" stroke="#3a4466" stroke-width=".8"
    d="M-5 -7 L72 -7 L104 1 L96 6 C70 15 30 16 8 15 L-2 15 Q-6 15 -6 11 L-6 -3 Q-6 -7 -5 -7 Z
       M30 -1 L66 -1 Q70 -1 70 3 L70 6 Q70 9 66 9 L30 9 Q26 9 26 6 L26 3 Q26 -1 30 -1 Z"/>
  <path d="M10 11 C40 11.5 70 9 95 4" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width=".7"/>
  <text x="80" y="2.5" font-size="3.4" fill="#3a4466" font-family="monospace">TRAINER</text>
</svg>`;


function makeBalisong(stage) {
  const el = document.createElement('div');
  el.className = 'bali';
  el.innerHTML = `<span class="bl-h1">${handleHTML(false)}</span><span class="bl-blade">${BLADE_SVG}<span class="bl-h2">${handleHTML(true)}</span></span>`;
  stage.append(el);
  const blade = el.querySelector('.bl-blade'), h2 = el.querySelector('.bl-h2');
  const put = p => {
    el.style.transform = `translate3d(${p.X}px, ${p.Y}px, 0) rotateZ(${p.rz}deg) rotateY(${p.ry}deg) rotateX(${p.rx}deg) translate(${-p.pv[0]}px, ${-p.pv[1]}px)`;
    blade.style.transform = `rotateZ(${p.b}deg)`;
    h2.style.transform = `translate(0px, 8px) rotateZ(${p.d}deg) translateZ(-3px)`;
  };
  return { render: put, pose: put, destroy() { el.remove(); } };
}

// the karambit's outline, y down: ring at the origin, handle to the right, blade curving down
const KARAMBIT_SVG = `<svg class="kb-svg" viewBox="-24 -64 190 90" width="190" height="90" aria-hidden="true">
  <path fill="#feae34" fill-rule="evenodd" d="M21 0 A21 21 0 1 1 -21 0 A21 21 0 1 1 21 0 Z M13.5 0 A13.5 13.5 0 1 0 -13.5 0 A13.5 13.5 0 1 0 13.5 0 Z"/>
  <path fill="#181425" stroke="#feae34" stroke-width="1" d="M14 -12 C40 -15 75 -14 100 -12 L104 -10 L104 12 C92 16 84 8 74 12 C64 16 56 8 46 12 C34 16 22 15 14 12 Z"/>
  <path fill="#262b44" stroke="#feae34" stroke-width="2.4" d="M104 -11 C142 -15 170 8 161 60 C151 36 134 18 106 10 L104 10 Z" transform="scale(1,-1) translate(0,0)"/>
  <rect x="99" y="-15" width="9" height="30" rx="3" fill="#feae34"/>
</svg>`;

function makeKarambit(stage) {
  const el = document.createElement('div');
  el.className = 'kb';
  el.innerHTML = KARAMBIT_SVG;
  stage.append(el);
  const put = p => { el.style.transform = `translate3d(${p.X}px, ${p.Y}px, 0) rotateZ(${p.rz}deg) rotateY(${p.ry}deg) rotateX(${p.rx}deg)`; };
  return { render: put, pose: put, destroy() { el.remove(); } };
}

function cardFace(i) {
  const { rank, suit, red } = cardOf(i);
  return `<span class="cf${red ? ' red' : ''}"><i>${rank}<br>${suit}</i><b>${suit}</b><i class="flip">${rank}<br>${suit}</i></span>`;
}

function makeDeck(stage) {
  const deck = document.createElement('div');
  deck.className = 'deck';
  deck.innerHTML = Array.from({ length: N }, (_, i) => `<span class="pcard"><span class="cb"></span>${cardFace(i)}</span>`).join('');
  stage.append(deck);
  const cards = [...deck.children];
  const put = s => s.cards.forEach((p, i) => { cards[i].style.transform = `translate3d(${p.x}px, ${p.y}px, ${p.z}px) rotateZ(${p.rz}deg) rotateY(${p.ry}deg) rotateX(${p.rx}deg)`; });
  return { render: put, pose: put, destroy() { deck.remove(); } };
}

// ============================================================ SOUND
// A combo takes its sounds from its own track, worked out once and cached on it. The knife clacks
// when the blade or a handle reaches a stop, rattles as a handle comes off one, and lands in the
// palm after a toss; cards tap as each one leaves the hand or lands, and a whole packet snaps.
// Two beds run underneath: air past whatever is moving fast, and cards sliding over each other.

/** merge events that land together: the loudest wins, a crowd of taps becomes one snap */
function settle(raw, { crowd = 6, gap = 0.012 } = {}) {
  raw.sort((a, b) => a.t - b.t);
  const out = [];
  for (let i = 0; i < raw.length;) {
    let j = i, v = 0;
    while (j < raw.length && raw[j].t - raw[i].t <= gap && raw[j].s === raw[i].s) v = Math.max(v, raw[j++].v);
    const n = j - i, e = raw[i];
    if (e.lift && n >= crowd) { i = j; continue; } // a whole deck lifting together makes no sound
    out.push(n >= crowd && e.s === 'tap' ? { t: e.t, s: 'snap', v: clamp(0.4 + n / 40, 0.4, 1) } : { t: e.t, s: e.s, v: Math.min(1, v + (n - 1) * 0.08) });
    i = j;
  }
  return out;
}

function knifeEvents(routine) {
  const k = routine.keys, raw = [];
  for (let i = 1; i < k.length; i++) {
    const a = k[i - 1].p, b = k[i].p, c = k[i + 1]?.p, z = k[i - 2]?.p, dt = k[i].t - k[i - 1].t;
    if (dt <= 0) continue;
    for (const j of ['b', 'd']) {
      const mv = b[j] - a[j];
      if (Math.abs(mv) < 1) continue;
      const goesOn = c && Math.abs(c[j] - b[j]) > 1 && Math.sign(c[j] - b[j]) === Math.sign(mv);
      if (fold(b[j], 180) < 1 && !goesOn) raw.push({ t: k[i].t, s: 'clack', v: clamp(0.5 + Math.abs(mv) / dt / 2300, 0.5, 1) });
      const wasStill = !z || Math.abs(a[j] - z[j]) < 1;
      if (fold(a[j], 180) < 1 && wasStill) raw.push({ t: k[i - 1].t + 0.015, s: 'rattle', v: 0.8 });
    }
    if (b.Y - a.Y > 100) raw.push({ t: k[i].t, s: 'catch', v: 1 }); // falling back into the hand
  }
  return settle(raw, { crowd: 99 });
}

function cardSpeed(p, q, fps) {
  return (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) + (Math.abs(q.rz - p.rz) + Math.abs(q.ry - p.ry) + Math.abs(q.rx - p.rx)) * 0.8) * fps;
}

/** taps and snaps of one card move, in the move's own time */
function moveEvents(mv) {
  if (mv.sfx) return mv.sfx;
  const fps = 120, steps = Math.ceil(mv.dur * fps), raw = [];
  for (let i = 0; i < N; i++) {
    let prev = mv.f(0, i, N), moving = false, peak = 0;
    for (let s = 1; s <= steps; s++) {
      const t = Math.min(s / fps, mv.dur), p = mv.f(t, i, N), v = cardSpeed(prev, p, fps);
      if (!moving && v > 60) { moving = true; peak = v; raw.push({ t, s: 'tap', v: 0.4, lift: true }); }
      else if (moving) {
        peak = Math.max(peak, v);
        if (v < 12) { moving = false; if (peak > 120) raw.push({ t, s: 'tap', v: clamp(peak / 900, 0.35, 1) }); }
      }
      prev = p;
    }
  }
  return (mv.sfx = settle(raw));
}

function deckEvents(routine) {
  return routine.segs.flatMap(g => moveEvents(g.trick).map(e => ({ ...e, t: g.t0 + e.t * CARD_TEMPO })));
}

/** the karambit: a snick each time a spin is caught in the hand, a flick as one starts, a catch after a toss */
function karambitEvents(routine) {
  const k = routine.keys, raw = [];
  for (let i = 1; i < k.length; i++) {
    const a = k[i - 1].p, b = k[i].p, c = k[i + 1]?.p, dt = k[i].t - k[i - 1].t;
    if (dt <= 0) continue;
    const mv = b.rz - a.rz, goesOn = c && Math.sign(c.rz - b.rz) === Math.sign(mv) && Math.abs(c.rz - b.rz) > 1;
    if (Math.abs(mv) >= 150 && !goesOn) raw.push({ t: k[i].t, s: 'clack', v: clamp(0.45 + Math.abs(mv) / dt / 3000, 0.45, 0.85) });
    if (Math.abs(mv) >= 150 && (!k[i - 2] || Math.abs(a.rz - k[i - 2].p.rz) < 1)) raw.push({ t: k[i - 1].t + 0.01, s: 'rattle', v: 0.5 });
    if (b.Y - a.Y > 100) raw.push({ t: k[i].t, s: 'catch', v: 0.9 });
  }
  return settle(raw, { crowd: 99 });
}

export const routineSounds = r => (r.sfx ||= r.kind === 'knife' ? knifeEvents(r) : r.kind === 'karambit' ? karambitEvents(r) : deckEvents(r));

/** how loud the air and the sliding are at time t of a routine, played at `rate` times normal speed */
function knifeMotion(r, t, rate) {
  const h = 1 / 120, p = r.sample(t), q = r.sample(Math.min(r.dur, t + h));
  const w = (Math.abs(q.rz - p.rz) + (Math.abs(q.ry - p.ry) + Math.abs(q.rx - p.rx)) * 0.8 + Math.abs(q.b - p.b) * 0.7 + Math.abs(q.d - p.d) * 0.3 + Math.abs(q.Y - p.Y) * 1.2) / h * rate;
  const whup = 0.35 + 0.65 * Math.abs(Math.sin((p.rz + p.ry + p.rx + p.b) * RAD)); // blade, then handles, past the ear
  return { air: ramp(w, 150, 1300) * 0.3 * whup, airF: 380 + Math.min(w, 2200) * 0.75 };
}

function deckMotion(r, t, rate) {
  const h = 1 / 120, A = r.sample(t).cards, B = r.sample(Math.min(r.dur, t + h)).cards;
  let fast = 0, rub = 0;
  for (let i = 1; i < N; i++) {
    const a0 = A[i - 1], a1 = B[i - 1], b0 = A[i], b1 = B[i];
    fast = Math.max(fast, cardSpeed(b0, b1, 1 / h));
    if (Math.abs(b0.z - a0.z) < 3 && Math.hypot(b0.x - a0.x, b0.y - a0.y) < 70) { // touching: they rub
      rub += (Math.hypot((b1.x - b0.x) - (a1.x - a0.x), (b1.y - b0.y) - (a1.y - a0.y)) + Math.abs((b1.rz - b0.rz) - (a1.rz - a0.rz)) * 0.6) / h;
    }
  }
  return { air: ramp(fast * rate, 300, 2600) * 0.16, airF: 700 + Math.min(fast * rate, 3000) * 0.5, rub: ramp(rub * rate, 40, 900) * 0.14 };
}

function toySound(motion, withRub) {
  const air = bed({ q: 0.9 }), rub = withRub ? bed({ type: 'highpass', q: 0.5 }) : null;
  return {
    step(r, a, b, rate) {
      for (const e of routineSounds(r)) if (e.t > a && e.t <= b) play(e.s, e.v);
      const m = motion(r, b, rate);
      air.set(m.air, m.airF);
      rub?.set(m.rub, 2600);
    },
    hush() { air.set(0); rub?.set(0); },
    stop() { air.stop(); rub?.stop(); },
  };
}
const knifeSound = () => toySound(knifeMotion, false);
const deckSound = () => toySound(deckMotion, true);

// ============================================================ PERFORMER
/**
 * Plays a routine on a rig, once or over and over. A routine can be swapped for a longer one while
 * it plays (a trick added to the combo), and a new run starts from the pose the last one ended in.
 */
export function performer(rig, { sound, onStep, onEnd } = {}) {
  let r = null, t = 0, last = 0, raf = 0, running = false, speed = 1, heard = -1, step = -2, state = null;
  const show = now => { state = r.sample(t); rig.render(state, now); };
  const stepAt = () => { let i = -1; r.segs.forEach((g, k) => { if (t >= g.t0 - 0.02) i = k; }); return i; };
  const frame = now => {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000) * speed;
    last = now;
    t += dt;
    let ended = false;
    if (t >= r.dur) {
      sound?.step(r, heard, r.dur, speed);
      if (r.loop) { t -= r.dur; heard = -1; } else { t = r.dur; running = false; ended = true; }
    }
    show(now);
    if (running) { sound?.step(r, heard, t, speed); heard = t; } else sound?.hush();
    const i = stepAt();
    if (i !== step) { step = i; onStep?.(i, r.segs[i] || null); }
    if (ended) onEnd?.();
    if (running) raf = requestAnimationFrame(frame);
  };
  const go = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
  return {
    get running() { return running; },
    get routine() { return r; },
    get state() { return state; },
    get time() { return t; },
    /** play a routine from time `from` (seconds into it) */
    run(routine, from = 0) { r = routine; t = from; heard = from - 1e-6; step = -2; running = true; show(0); go(); },
    /** swap in a routine that starts the same way, keeping the place */
    swap(routine) { r = routine; if (t > r.dur) t = r.dur; if (!running) show(0); },
    /** hold still at the start of a routine */
    hold(routine) { this.stop(false); r = routine; t = 0; show(0); },
    setSpeed(s) { speed = s; },
    stop(silence = true) { running = false; cancelAnimationFrame(raf); raf = 0; if (silence) sound?.stop(); else sound?.hush(); },
  };
}

// ============================================================ REGISTRY
/** Build a toy in real 3D; if Three.js cannot load, fall back to the flat CSS rig. Resolves to the rig. */
async function make3d(name, flat, { container, anchor }, opts = {}) {
  try {
    const m = await import('./toys3d.js');
    return await m[name](container, opts);
  } catch (e) {
    console.warn('3D toys are unavailable, showing the flat version.', e);
    return flat(anchor, opts);
  }
}

const loopable = make => (ids, o = {}) => { const r = make(ids, o); r.loop = !!o.loop; return r; };

export const TOYS = {
  balisong: {
    make: (where, o) => make3d('makeBalisong3D', makeBalisong, where, o), sound: knifeSound,
    tricks: BALISONG_TRICKS, combos: COMBOS.balisong, routine: loopable(knifeRoutine), preview: ['forward-fan', 'reverse-fan'], scale: 1.2,
  },
  karambit: {
    make: (where, o) => make3d('makeKarambit3D', makeKarambit, where, o), sound: knifeSound,
    tricks: KARAMBIT_TRICKS, combos: COMBOS.karambit, routine: loopable(karambitRoutine), preview: ['index-spin', 'reverse-spin'], scale: 1.3,
  },
  cards: {
    make: (where, o) => make3d('makeDeck3D', makeDeck, where, o), sound: deckSound,
    tricks: CARD_MOVES, combos: COMBOS.cards, routine: loopable(deckRoutine), preview: ['thumb-fan'], scale: 1.35,
  },
};
export const trickCount = room => room.items.reduce((s, it) => s + (TOYS[it.toy]?.tricks.length || 0), 0);
