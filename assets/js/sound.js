// Sounds for the house, made on the fly with Web Audio. Nothing here is a recording: every click,
// whoosh and riffle is shaped noise or a short tone, so no audio files are stored or fetched.
// Browsers only allow sound after a click or key press, so the audio wakes on the first one.

const KEY = 'fm-sound';
let ctx = null, out = null, noise = null;
let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
const listeners = new Set();

export const soundOn = () => on;
export function onSound(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setSound(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private window: keep it for this visit */ }
  if (ctx) on ? ctx.resume() : ctx.suspend();
  if (on) wake();
  listeners.forEach(fn => fn(on));
}
export const toggleSound = () => setSound(!on);

function wake() {
  if (!on) return;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    out = ctx.createGain();
    out.gain.value = 0.7;
    out.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, wake, { capture: true, passive: true });

const ready = () => on && ctx && ctx.state === 'running';
const jitter = (v, k = 0.06) => v * (1 + (Math.random() * 2 - 1) * k);

/** a burst of filtered noise with a sharp attack and an exponential tail */
function burst(t, { type = 'bandpass', f = 2000, q = 1, gain = 0.3, attack = 0.002, decay = 0.05, sweep = 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = jitter(1, 0.2);
  const flt = ctx.createBiquadFilter();
  flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
  if (sweep) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f * sweep), t + attack + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(flt).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + attack + decay + 0.02);
}

/** a short decaying tone, for the ring of metal or the body of a knock */
function ping(t, f, { gain = 0.1, decay = 0.1, type = 'sine', to = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + decay + 0.02);
}

const SOUNDS = {
  // butterfly knife: a handle hitting the tang pin or the latch, steel on steel
  clack(t, v) {
    burst(t, { f: jitter(3400), q: 1.4, gain: 0.5 * v, decay: 0.035 });
    burst(t, { type: 'lowpass', f: 900, gain: 0.25 * v, decay: 0.03 });
    ping(t, jitter(2350, 0.04), { gain: 0.05 * v, decay: 0.12, type: 'triangle' });
    ping(t, jitter(3720, 0.04), { gain: 0.03 * v, decay: 0.08 });
  },
  // the pins rattling as a handle swings loose
  rattle(t, v) {
    burst(t, { type: 'highpass', f: jitter(4200), q: 0.8, gain: 0.18 * v, decay: 0.018 });
  },
  // the knife landing back in the palm
  catch(t, v) {
    burst(t, { type: 'lowpass', f: 700, gain: 0.45 * v, decay: 0.07, sweep: 0.4 });
    ping(t, 140, { gain: 0.12 * v, decay: 0.08, to: 70 });
    SOUNDS.clack(t + 0.012, v * 0.6);
  },
  // cards: one card leaving the thumb or landing on the pile
  tap(t, v) {
    burst(t, { f: jitter(2600, 0.15), q: 0.9, gain: 0.22 * v, decay: 0.014 });
  },
  // the whole deck squaring up, or a packet slapping down
  snap(t, v) {
    burst(t, { type: 'highpass', f: 1400, q: 0.7, gain: 0.42 * v, decay: 0.03 });
    burst(t, { type: 'lowpass', f: 500, gain: 0.3 * v, decay: 0.045 });
  },
  // the shelves: a plastic case leaving its slot
  case(t, v) {
    burst(t, { f: 1900, q: 2, gain: 0.25 * v, decay: 0.025 });
    ping(t + 0.004, jitter(820), { gain: 0.05 * v, decay: 0.05, type: 'triangle' });
    burst(t + 0.05, { f: 1500, q: 1.4, gain: 0.12 * v, decay: 0.02 });
  },
  // a book or manga sliding out: card stock against card stock
  paper(t, v) {
    burst(t, { f: 1800, q: 0.5, gain: 0.16 * v, attack: 0.05, decay: 0.16, sweep: 1.6 });
  },
  // putting something back
  set(t, v) {
    burst(t, { type: 'lowpass', f: 650, gain: 0.32 * v, decay: 0.05 });
    burst(t + 0.006, { f: 1700, q: 1.2, gain: 0.1 * v, decay: 0.02 });
  },
  // turning an object over in the hand
  turn(t, v) {
    burst(t, { f: 900, q: 0.6, gain: 0.08 * v, attack: 0.08, decay: 0.22, sweep: 2.2 });
  },
  // the front of the house opening: a latch, then the weight of the door
  door(t, v) {
    burst(t, { f: 2200, q: 2, gain: 0.2 * v, decay: 0.03 });
    ping(t + 0.01, 1240, { gain: 0.03 * v, decay: 0.1, type: 'triangle' });
    burst(t + 0.09, { type: 'lowpass', f: 380, gain: 0.35 * v, attack: 0.12, decay: 0.5, sweep: 0.5 });
  },
  // stepping into a room
  step(t, v) {
    burst(t, { type: 'lowpass', f: 420, gain: 0.28 * v, decay: 0.08, sweep: 0.5 });
    burst(t + 0.2, { type: 'lowpass', f: 380, gain: 0.2 * v, decay: 0.08, sweep: 0.5 });
  },
  // a small button
  tick(t, v) {
    burst(t, { f: 3000, q: 2, gain: 0.08 * v, decay: 0.012 });
  },
};

/** Play a one-shot sound now (or `delay` seconds from now). Silent until sound is allowed. */
export function play(name, v = 1, delay = 0) {
  if (!ready() || !SOUNDS[name]) return;
  SOUNDS[name](ctx.currentTime + delay + 0.005, Math.min(1.2, Math.max(0, v)));
}

/**
 * A continuous bed of noise whose loudness and colour follow something moving: air past a spinning
 * knife, cards sliding over each other. Call set() every frame; it glides so it never clicks.
 */
export function bed({ type = 'bandpass', q = 1.2 } = {}) {
  let src = null, flt = null, g = null;
  const start = () => {
    if (src || !ready()) return !!src;
    src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    g = ctx.createGain(); g.gain.value = 0;
    src.connect(flt).connect(g).connect(out);
    src.start();
    return true;
  };
  return {
    set(gain, f = 1000) {
      if (!gain && !src) return;
      if (!start()) return;
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(on ? gain : 0, t, 0.02);
      flt.frequency.setTargetAtTime(f, t, 0.03);
    },
    stop() {
      if (!src) return;
      const s = src, t = ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.03);
      s.stop(t + 0.2);
      src = null;
    },
  };
}
