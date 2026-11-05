// The Trick Room's tricks, and how a combo of them becomes one continuous performance.
// Knife tricks are keyframes. A combo joins them into a single track (opening or closing the knife
// in between where it has to) and plays it through smooth curves, with the blade and handles
// speeding into their stops and bouncing off them. The hand that holds the knife is worked out from
// the same track. Card moves are functions of time; where the two hands hold is written per move.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, u) => a + (b - a) * u;
export const EASE = {
  lin: u => u,
  io: u => u * u * (3 - 2 * u),
  out: u => 1 - (1 - u) * (1 - u),
  in: u => u * u,
};
const win = (t, a, b) => clamp((t - a) / (b - a)); // progress through a window of time
const sm = (t, a, b) => EASE.io(win(t, a, b));
export const ramp = (v, a, b) => EASE.io(clamp((v - a) / (b - a)));
export const fold = (v, m) => { const r = ((v % m) + m) % m; return Math.min(r, m - r); };
export const wrap = a => ((((a + 180) % 360) + 360) % 360) - 180;

/** knife tricks play in this fraction of their written time; card moves in CARD_TEMPO */
export const TEMPO = 0.64;
export const CARD_TEMPO = 0.78;

// ============================================================ BUTTERFLY KNIFE
// Kinematics: the safe handle is the root. The blade hangs off pin 1 at angle b (0 = folded into the
// handles, 180 = out). The bite handle hangs off pin 2 on the blade at angle d relative to the blade
// (0 = along the blade, 180 = folded back to meet the safe handle). Open and latched is b 180, d 180.
const L = 132; // handle length from its pin
const OPEN = { b: 180, d: 180 };
const CLOSED = { b: 0, d: 0 };
export const BASE = { X: 0, Y: 0, rz: 90, ry: 0, rx: 0, b: 180, d: 180 };
export const GRIP = [L * 0.55, 0];

function seq(frames, base = BASE) {
  let t = 0, cur = { ...base };
  const keys = frames.map(([dt, p = {}, e = 'io']) => { t += dt; cur = { ...cur, ...p }; return { t, p: { ...cur }, e }; });
  return { keys, dur: t };
}

function bali(id, name, level, about, frames, pv = GRIP) {
  return { id, name, level, about, pv, ...seq(frames) };
}

export const BALISONG_TRICKS = [
  bali('basic-opening', 'Basic opening', 'Beginner', 'Hold the safe handle, flick the blade and bite handle out over the top, then flick the bite handle back to meet it.',
    [[0, CLOSED], [0.5], [0.35, { b: 180, rz: 78 }, 'out'], [0.25, { rz: 96 }], [0.35, { d: 180, rz: 90 }, 'out'], [0.8]]),
  bali('basic-closing', 'Basic closing', 'Beginner', 'The opening run backwards: let the bite handle fall away, then swing the blade home between the handles.',
    [[0, OPEN], [0.5], [0.35, { d: 0, rz: 102 }, 'out'], [0.25, { rz: 84 }], [0.35, { b: 0, rz: 90 }, 'out'], [0.8]]),
  bali('quick-draw', 'Quick draw', 'Beginner', 'A downward snap from the pocket that opens the knife in one movement.',
    [[0, { ...CLOSED, Y: -24 }], [0.35], [0.18, { b: 180, Y: 14, rz: 68 }, 'out'], [0.18, { d: 180, rz: 92, Y: 0 }, 'out'], [0.12, { rz: 90 }], [0.7]]),
  bali('forward-fan', 'Forward fan', 'Beginner', 'The open knife spins forward around the fingers, three full turns.',
    [[0, OPEN], [0.3], [1.8, { rz: 90 + 1080 }, 'lin'], [0.4]]),
  bali('reverse-fan', 'Reverse fan', 'Beginner', 'The same spin turned around: three turns backwards over the knuckles.',
    [[0, OPEN], [0.3], [1.8, { rz: 90 - 1080 }, 'lin'], [0.4]]),
  bali('y2k-rollover', 'Y2K rollover', 'Intermediate', 'The bite handle drops, the knife rolls over the back of the hand and lands latched again.',
    [[0, OPEN], [0.3], [0.3, { d: 0, rz: 112 }], [0.6, { ry: 180, rz: 270 }], [0.35, { d: 180 }, 'out'], [0.5, { ry: 360, rz: 450 }], [0.4]]),
  bali('zen-rollover', 'Zen rollover', 'Intermediate', 'A rollover pivoting on the pin itself, so the handles circle the index finger.',
    [[0, OPEN], [0.3], [0.35, { d: 0, rz: 120 }], [0.75, { rz: 480 }, 'lin'], [0.35, { d: 180, rz: 450 }, 'out'], [0.5]], [0, 0]),
  bali('chaplin', 'Chaplin', 'Intermediate', 'The safe handle stays put while the blade and bite handle whirl round it twice, like a cane.',
    [[0, OPEN], [0.3], [0.25, { d: 0 }], [1.2, { b: 900 }, 'lin'], [0.3, { d: 180 }, 'out'], [0.5]]),
  bali('helix', 'Helix', 'Advanced', 'A Chaplin that wobbles in and out of the plane as it spins, tracing a helix.',
    [[0, OPEN], [0.3], [0.25, { d: 0 }], [0.4, { b: 360, ry: 55 }, 'lin'], [0.4, { b: 540, ry: -55 }, 'lin'], [0.4, { b: 720, ry: 55 }, 'lin'], [0.4, { b: 900, ry: 0 }, 'lin'], [0.3, { d: 180 }, 'out'], [0.5]]),
  bali('aerial', 'Basic aerial', 'Intermediate', 'A toss: the knife leaves the hand, turns once with the handles swapping, and is caught open.',
    [[0, OPEN], [0.3], [0.2, { Y: 22 }, 'in'], [0.45, { Y: -170, rz: 270, d: 0 }, 'out'], [0.45, { Y: 0, rz: 450, d: 180 }, 'in'], [0.15, { Y: 10 }], [0.2, { Y: 0 }], [0.5]]),
  bali('double-aerial', 'Double aerial', 'Advanced', 'Higher and faster: two full turns in the air, folding shut and opening again before the catch.',
    [[0, OPEN], [0.3], [0.2, { Y: 24 }, 'in'], [0.6, { Y: -230, rz: 450, d: 0, b: 0 }, 'out'], [0.6, { Y: 0, rz: 810, d: 180, b: 180 }, 'in'], [0.15, { Y: 10 }], [0.2, { Y: 0 }], [0.5]]),
  bali('behind-hand-twirl', 'Behind-the-hand twirl', 'Intermediate', 'A twirl around the pin that passes behind the hand, tilted away from you.',
    [[0, OPEN], [0.3], [0.9, { rz: 450, ry: 40 }, 'lin'], [0.35, { ry: 0 }, 'out'], [0.5]], [0, 0]),
  bali('thumb-rollover', 'Thumb rollover', 'Beginner', 'The whole knife rolls over the thumb, once around the length of the handles.',
    [[0, OPEN], [0.3], [0.85, { rx: 360 }], [0.5]]),
  bali('pinky-rollover', 'Pinky rollover', 'Intermediate', 'Held at the very end of the handle, the knife swings a full circle around the little finger.',
    [[0, OPEN], [0.3], [0.35, { d: 0 }], [0.85, { rz: -270 }], [0.35, { d: 180 }, 'out'], [0.5]], [L, 0]),
  bali('index-rollover', 'Index rollover', 'Intermediate', 'A roll across the index finger that flips the knife over as it turns.',
    [[0, OPEN], [0.3], [0.3, { d: 0, rz: 60 }], [0.65, { rz: 420, rx: 180 }], [0.3, { d: 180, rz: 450, rx: 360 }, 'out'], [0.5]], [L * 0.3, 0]),
  bali('ladder', 'Ladder', 'Advanced', 'Flip after flip up the fingers, each one swapping the handles, a rung at a time.',
    [[0, { ...OPEN, Y: 70 }], [0.3], [0.3, { ry: 180, Y: 35, d: 0 }], [0.3, { ry: 360, Y: 0, d: 180 }], [0.3, { ry: 540, Y: -35, d: 0 }], [0.3, { ry: 720, Y: -70, d: 180 }], [0.4], [0.6, { Y: 0 }], [0.3]]),
  bali('snake', 'Snake', 'Advanced', 'Blade and handles weave against each other in an S without ever closing.',
    [[0, OPEN], [0.3], [0.3, { d: 0, b: 150, rz: 70 }], [0.3, { b: 210, d: -35, rz: 110 }], [0.3, { b: 150, d: 35, rz: 70 }], [0.3, { b: 210, d: -35, rz: 110 }], [0.3, { b: 180, d: 0, rz: 90 }], [0.3, { d: 180 }, 'out'], [0.5]]),
  bali('tornado', 'Tornado', 'Advanced', 'Spinning in two directions at once until the knife is a blur.',
    [[0, OPEN], [0.3], [1.6, { rz: 810, ry: 720 }, 'lin'], [0.5]]),
  bali('kickback', 'Kickback', 'Beginner', 'The bite handle kicks away and snaps back to the latch, twice.',
    [[0, OPEN], [0.3], [0.2, { d: 60, rz: 102 }, 'out'], [0.2, { d: 180, rz: 85 }, 'in'], [0.2, { d: 40, rz: 102 }, 'out'], [0.2, { d: 180, rz: 90 }, 'in'], [0.6]]),
  bali('double-twirl', 'Double twirl', 'Intermediate', 'Two twirls around the pin, the second leaning back out of the plane.',
    [[0, OPEN], [0.3], [0.7, { rz: 450 }, 'lin'], [0.2], [0.7, { rz: 810, ry: -40 }, 'lin'], [0.3, { ry: 0 }, 'out'], [0.5]], [0, 0]),
  bali('corkscrew', 'Corkscrew', 'Advanced', 'Opens from closed while rolling end over end, like a corkscrew going in.',
    [[0, CLOSED], [0.3], [0.6, { rx: 180, b: 180 }], [0.6, { rx: 360, d: 180 }], [0.6]]),
  bali('ripple', 'Ripple', 'Intermediate', 'Small fast taps that send a ripple through blade and handles, one after the other.',
    [[0, OPEN], [0.3], [0.22, { d: 120 }], [0.22, { d: 180 }], [0.22, { d: 120, b: 150 }], [0.22, { d: 180, b: 180 }], [0.22, { b: 150 }], [0.22, { b: 180 }], [0.5]]),
  bali('ice-pick-open', 'Ice pick opening', 'Beginner', 'The basic opening in a reverse grip, blade coming out pointing down.',
    [[0, { ...CLOSED, rz: -90 }], [0.4], [0.35, { b: 180, rz: -112 }, 'out'], [0.3, { d: 180, rz: -90 }, 'out'], [0.8]]),
  bali('pendulum', 'Pendulum', 'Beginner', 'The blade and bite handle swing loose under the safe handle like a pendulum, then latch.',
    [[0, OPEN], [0.3], [0.2, { d: 0 }], [0.45, { b: 110 }], [0.45, { b: 250 }], [0.45, { b: 130 }], [0.45, { b: 180 }], [0.3, { d: 180 }, 'out'], [0.5]]),
  bali('horizontal-aerial', 'Horizontal aerial', 'Advanced', 'Tossed flat: the knife rolls end over end on its long axis in the air and drops back latched.',
    [[0, OPEN], [0.3], [0.2, { Y: 22 }, 'in'], [0.45, { Y: -160, rx: 180, d: 0 }, 'out'], [0.45, { Y: 0, rx: 360, d: 180 }, 'in'], [0.15, { Y: 10 }], [0.2, { Y: 0 }], [0.5]]),
  bali('fan-to-close', 'Fan into a close', 'Intermediate', 'Two fans round the fingers, and the spin carries straight on into a closing.',
    [[0, OPEN], [0.3], [1.2, { rz: 810 }, 'lin'], [0.3, { d: 0 }], [0.3, { b: 0 }, 'out'], [0.5]]),
  bali('matrix', 'Matrix', 'Advanced', 'The blade swings round behind the hand while the knife rolls over, like dodging in slow motion.',
    [[0, OPEN], [0.3], [0.3, { d: 0 }], [0.6, { rx: 180, b: 360 }], [0.6, { rx: 360, b: 540 }], [0.3, { d: 180 }, 'out'], [0.4]]),
  bali('sunrise', 'Sunrise', 'Intermediate', 'The bite handle lets go and rises in one slow arc over the top before it latches.',
    [[0, OPEN], [0.3], [0.4, { d: 0, rz: 60 }], [0.8, { b: 540, rz: 120 }], [0.3, { d: 180, rz: 90 }, 'out'], [0.4]]),
  bali('ice-pick-close', 'Ice pick closing', 'Beginner', 'The ice pick opening backwards: the blade folds home in the reverse grip.',
    [[0, { ...OPEN, rz: -90 }], [0.3], [0.3, { d: 0, rz: -112 }, 'out'], [0.35, { b: 0, rz: -90 }, 'out'], [0.6]]),
  bali('fan-reversal', 'Fan reversal', 'Intermediate', 'Two fans forward, a stall with the blade up, then two straight back.',
    [[0, OPEN], [0.3], [0.8, { rz: 810 }, 'lin'], [0.18], [0.8, { rz: 90 }, 'lin'], [0.4]]),
  bali('bite-loop', 'Bite handle loop', 'Intermediate', 'The bite handle loops all the way round its pin and slaps back into the latch.',
    [[0, OPEN], [0.3], [0.5, { d: 540, rz: 100 }], [0.2, { rz: 90 }], [0.5]]),
];

// ============================================================ KARAMBIT
// A curved claw blade with a finger ring. The index finger goes through the ring, and the ring is
// the pivot: rz spins the knife round that finger (in the screen plane, the finger pointing into it).
// rz 0 is the handle across the fingers with the blade curving out below the little finger. A key
// with follow: 1 makes the hand turn with the knife whatever the angle (a wrist roll).
export const KBASE = { X: 0, Y: 0, rz: 0, ry: 0, rx: 0, b: 0, d: 0, follow: 0 };
const kara = (id, name, level, about, frames) => ({ id, name, level, about, pv: [0, 0], ...seq(frames, KBASE) });

export const KARAMBIT_TRICKS = [
  kara('index-spin', 'Index spin', 'Beginner', 'Fingers open, and the karambit spins twice round the index finger before the hand closes on it.',
    [[0], [0.25], [0.9, { rz: 720 }, 'lin'], [0.4]]),
  kara('reverse-spin', 'Reverse spin', 'Beginner', 'The same spin the other way: two turns backwards round the finger.',
    [[0], [0.25], [0.9, { rz: -720 }, 'lin'], [0.4]]),
  kara('triple-spin', 'Triple spin', 'Intermediate', 'Faster and longer: three turns in one go.',
    [[0], [0.2], [1.0, { rz: 1080 }, 'lin'], [0.4]]),
  kara('stall', 'Spin and stall', 'Intermediate', 'A turn and a half, a stop with the blade standing up, then the last half turn home.',
    [[0], [0.25], [0.6, { rz: 540 }, 'out'], [0.3], [0.3, { rz: 720 }, 'in'], [0.4]]),
  kara('inspect', 'Inspect', 'Beginner', 'The hand turns the karambit to the light: one face, a roll to show the other, and back.',
    [[0], [0.25], [0.5, { ry: 55, rz: -25, follow: 1 }], [0.4], [0.6, { rx: 180, ry: 35, follow: 1 }], [0.4], [0.6, { rx: 360, ry: 0, rz: 0, follow: 1 }], [0.2, { follow: 0 }], [0.3]]),
  kara('toss-catch', 'Toss and catch', 'Intermediate', 'Flicked up off the finger, two turns in the air, and caught back on the ring.',
    [[0], [0.25], [0.15, { Y: 16 }, 'in'], [0.45, { Y: -150, rz: 360 }, 'out'], [0.45, { Y: 0, rz: 720 }, 'in'], [0.12, { Y: 8 }], [0.2, { Y: 0 }], [0.4]]),
  kara('grip-switch', 'Grip switch', 'Beginner', 'A half turn flips it into a forward grip with the blade up, then a half turn back.',
    [[0], [0.25], [0.35, { rz: 180 }, 'out'], [0.5], [0.35, { rz: 360 }, 'out'], [0.4]]),
  kara('slash', 'Hook and pull', 'Beginner', 'A short reverse-grip slash: hook forward, pull back, the way the blade is meant to cut.',
    [[0], [0.2], [0.18, { X: -40, Y: -20, rz: -35, follow: 1 }, 'out'], [0.22, { X: 50, Y: 20, rz: 30, follow: 1 }, 'out'], [0.3, { X: 0, Y: 0, rz: 0, follow: 1 }], [0.2, { follow: 0 }], [0.3]]),
  kara('figure-eight', 'Figure eight', 'Advanced', 'Two spins while the hand tips the knife in and out of the plane, tracing an eight.',
    [[0], [0.25], [0.45, { rz: 360, ry: 40 }, 'lin'], [0.45, { rz: 720, ry: -40 }, 'lin'], [0.3, { ry: 0 }], [0.4]]),
  kara('wrist-roll', 'Wrist roll', 'Beginner', 'The whole hand rolls over and back, the karambit held on the ring the whole way.',
    [[0], [0.25], [0.7, { rx: 180, follow: 1 }], [0.3], [0.7, { rx: 360, follow: 1 }], [0.2, { follow: 0 }], [0.3]]),
  kara('behind-spin', 'Behind-the-hand spin', 'Intermediate', 'A spin that tips back so the blade passes behind the hand, then rolls forward again.',
    [[0], [0.25], [0.5, { rz: 360, ry: 70 }], [0.5, { rz: 720, ry: 0 }], [0.4]]),
  kara('spin-flurry', 'Spin flurry', 'Advanced', 'Three quick single spins, each caught and let go again.',
    [[0], [0.2], [0.35, { rz: 360 }, 'lin'], [0.12], [0.35, { rz: 720 }, 'lin'], [0.12], [0.35, { rz: 1080 }, 'lin'], [0.4]]),
  kara('fan-spin', 'Fan spin', 'Intermediate', 'A long smooth spin that slows down and speeds up again like a fan changing gear.',
    [[0], [0.2], [0.5, { rz: 300 }, 'in'], [0.4, { rz: 560 }, 'lin'], [0.6, { rz: 1080 }, 'out'], [0.4]]),
  kara('stab-spin', 'Stab and spin', 'Intermediate', 'A quick stab forward, and the recoil throws the knife into a spin back home.',
    [[0], [0.2], [0.16, { X: -30, Y: -40, follow: 1 }, 'out'], [0.2, { X: 0, Y: 0, follow: 0 }], [0.8, { rz: -720 }, 'lin'], [0.4]]),
  kara('ring-flip', 'Ring flip', 'Advanced', 'The knife flips over on the finger, a turn round two axes at once, and lands the right way up.',
    [[0], [0.25], [0.9, { rz: 360, rx: 360 }], [0.4]]),
  kara('slow-spin', 'Slow spin', 'Beginner', 'One slow, controlled turn so you can see the finger keep the ring moving.',
    [[0], [0.25], [1.2, { rz: 360 }], [0.4]]),
];


const KNIFE = Object.fromEntries(BALISONG_TRICKS.map(t => [t.id, t]));
const KARAMBIT = Object.fromEntries(KARAMBIT_TRICKS.map(t => [t.id, t]));

// ------------------------------------------------------------ a combo as one track
const ANGLES = ['rz', 'ry', 'rx', 'b', 'd'];
const POSE = ['X', 'Y', 'rz', 'ry', 'rx', 'b', 'd'];
const CHANNELS = [...POSE, 'pvx', 'pvy', 'hX', 'hY', 'hrz', 'hry', 'hrx'];
const isOpen = p => fold(p.b, 360) > 90;
const same = (a, b) => POSE.every(k => Math.abs(a[k] - b[k]) < 1e-6);
const shift = (p, off) => { const o = { ...p }; for (const a of ANGLES) o[a] += off[a] || 0; return o; };

/** a trick's keys as steps, without the pauses written at its start and end */
function steps(trick) {
  const k = trick.keys;
  const out = k.map((x, i) => ({ dt: i ? x.t - k[i - 1].t : 0, p: x.p, e: x.e }));
  if (out.length > 2 && same(out[1].p, out[0].p)) out.splice(1, 1);
  if (out.length > 2 && same(out.at(-1).p, out.at(-2).p)) out.pop();
  return out;
}

/** the order the knife actually needs: open it before a trick that starts open, close it before one that starts closed */
function plan(ids, from, table = KNIFE) {
  const out = [];
  let end = from;
  for (const id of ids) {
    const tr = table[id];
    if (!tr) continue;
    if (end && table === KNIFE) {
      if (isOpen(end) && !isOpen(tr.keys[0].p)) out.push({ trick: KNIFE['basic-closing'], auto: true });
      else if (!isOpen(end) && isOpen(tr.keys[0].p)) out.push({ trick: KNIFE['basic-opening'], auto: true });
    }
    out.push({ trick: tr, auto: false, ci: out.filter(s => !s.auto).length });
    end = tr.keys.at(-1).p;
  }
  return out;
}

/**
 * Join tricks into one track of keys. `from` is the pose the knife is in now, so a new run starts
 * where the last one stopped; `loop` adds the way back to the start, so a repeat never jumps.
 */
export function knifeRoutine(ids, { from = null, loop = false, lead = 0.2, tail = 0.45, table = KNIFE } = {}) {
  const todo = plan(ids, from, table);
  if (!todo.length) todo.push({ trick: Object.values(table)[0], auto: true, idle: true });
  const keys = [], segs = [];
  let t = 0, cur = null;
  const push = (p, e = 'io') => keys.push({ t, p: { ...p }, e });
  const moveTo = p => { // carry the angles on from where they are, then glide to p
    const off = {};
    for (const a of ANGLES) off[a] = Math.round((cur[a] - p[a]) / 360) * 360;
    const q = shift(p, off);
    const far = Math.max(...ANGLES.map(a => Math.abs(q[a] - cur[a]))) / 700 + Math.hypot(q.X - cur.X, q.Y - cur.Y) / 450 + Math.hypot(q.pvx - cur.pvx, q.pvy - cur.pvy) / 500;
    if (far > 0.002) { t += clamp(far, 0, 0.38) + 0.08; push(q); }
    return off;
  };
  if (from) { cur = { pvx: GRIP[0], pvy: 0, ...from }; push(cur); }
  for (const step of todo) {
    const st = steps(step.trick), pv = step.trick.pv;
    const withPv = p => ({ ...p, pvx: pv[0], pvy: pv[1] });
    let off = {};
    if (!cur) { cur = withPv(st[0].p); push(cur); t += lead; push(cur); } else off = moveTo(withPv(st[0].p));
    const t0 = t;
    if (!step.idle) for (let i = 1; i < st.length; i++) { t += Math.max(0.03, st[i].dt * TEMPO); push(shift(withPv(st[i].p), off), st[i].e); }
    cur = keys.at(-1).p;
    if (!step.idle) segs.push({ trick: step.trick, auto: step.auto, ci: step.ci, t0, t1: t });
  }
  if (loop && keys.length > 1) {
    // close or open as needed and come back to the very first pose
    const first = keys[0].p;
    if (table === KNIFE && isOpen(cur) !== isOpen(first)) {
      const tr = KNIFE[isOpen(cur) ? 'basic-closing' : 'basic-opening'], st = steps(tr);
      const off = moveTo({ ...st[0].p, pvx: tr.pv[0], pvy: tr.pv[1] }), t0 = t;
      for (let i = 1; i < st.length; i++) { t += st[i].dt * TEMPO; push(shift({ ...st[i].p, pvx: tr.pv[0], pvy: tr.pv[1] }, off), st[i].e); }
      cur = keys.at(-1).p;
      segs.push({ trick: tr, auto: true, t0, t1: t });
    }
    const back = { ...first };
    for (const a of ANGLES) back[a] = first[a] + Math.round((cur[a] - first[a]) / 360) * 360;
    t += 0.28; push(back);
  } else { t += tail; push(cur); }
  handTrack(keys, from && Number.isFinite(from.hrz) ? { rz: from.hrz, ry: from.hry, rx: from.hrx } : null);
  const r = trackOf(keys, segs, t);
  r.kind = table === KNIFE ? 'knife' : 'karambit';
  return r;
}

/** the karambit's combos: the same track, no opening or closing */
export const karambitRoutine = (ids, o = {}) => knifeRoutine(ids, { ...o, table: KARAMBIT });

/**
 * Where the hand is at each key. It holds the safe handle and turns with the knife while the two
 * line up; when the knife spins in the fingers, or flies, the hand stays where it was.
 */
function handTrack(keys, start) {
  // a run that starts mid-trick starts from where the hand really is, not where the knife points
  let h = start || { rz: keys[0].p.rz, ry: keys[0].p.ry, rx: keys[0].p.rx };
  for (const { p } of keys) {
    if (p.Y > -60) {
      const c = {};
      let lined = true;
      for (const a of ['rz', 'ry', 'rx']) { c[a] = p[a] - Math.round((p[a] - h[a]) / 360) * 360; if (Math.abs(c[a] - h[a]) > 75) lined = false; }
      if (p.follow) h = { rz: p.rz, ry: p.ry, rx: p.rx }; // the wrist turns the knife: the hand goes with it
      else if (lined) h = c;
    }
    p.hrz = h.rz; p.hry = h.ry; p.hrx = h.rx;
    p.hX = p.X; p.hY = p.Y > -40 ? p.Y : -40 + (p.Y + 40) * 0.12; // a tossed knife leaves the hand below it
  }
}

// ------------------------------------------------------------ smooth curves through the keys
/**
 * One channel as cubic pieces. Tangents keep each run monotone (no overshoot), a flick launches
 * fast, and a blade or handle reaching a stop speeds into it and bounces off it a little.
 */
function curve(keys, ch, snap) {
  const n = keys.length, T = keys.map(k => k.t), V = keys.map(k => k.p[ch]);
  const s = [], m = new Array(n).fill(0), seg = [], bumps = [];
  for (let i = 0; i < n - 1; i++) s[i] = (V[i + 1] - V[i]) / Math.max(1e-4, T[i + 1] - T[i]);
  for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] > 0 ? 2 / (1 / s[i - 1] + 1 / s[i]) : 0;
  for (let i = 0; i < n - 1; i++) {
    let m0 = m[i], m1 = m[i + 1];
    const e = keys[i + 1].e, moved = Math.abs(V[i + 1] - V[i]) > 1;
    const stops = snap && moved && fold(V[i + 1], 180) < 1 && !(i + 1 < n - 1 && s[i + 1] * s[i] > 0);
    if (stops) {
      m0 = Math.sign(s[i]) * Math.min(Math.abs(m0), Math.abs(s[i]));
      m1 = 2 * s[i];
      bumps.push({ t: T[i + 1], dir: -Math.sign(s[i]), a: Math.min(7, Math.abs(m1) * 0.0035) });
    } else if (e === 'out' && moved) { m0 = 2 * s[i]; m1 = 0; } else if (e === 'in' && moved) {
      m0 = Math.sign(s[i]) * Math.min(Math.abs(m0), Math.abs(s[i]));
      m1 = 2 * s[i];
    }
    seg.push({ t0: T[i], t1: T[i + 1], v0: V[i], v1: V[i + 1], m0, m1 });
  }
  return { seg, bumps };
}

function valueAt(c, t) {
  const { seg } = c;
  let v;
  if (!seg.length) return 0;
  if (t <= seg[0].t0) v = seg[0].v0;
  else if (t >= seg.at(-1).t1) v = seg.at(-1).v1;
  else {
    let lo = 0, hi = seg.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (seg[mid].t1 < t) lo = mid + 1; else hi = mid; }
    const g = seg[lo], h = g.t1 - g.t0, u = h > 0 ? (t - g.t0) / h : 1, u2 = u * u, u3 = u2 * u;
    v = (2 * u3 - 3 * u2 + 1) * g.v0 + (u3 - 2 * u2 + u) * h * g.m0 + (-2 * u3 + 3 * u2) * g.v1 + (u3 - u2) * h * g.m1;
  }
  for (const b of c.bumps) {
    const d = t - b.t;
    if (d > 0 && d < 0.3) v += b.dir * b.a * Math.exp(-d / 0.05) * Math.sin((d * 2 * Math.PI) / 0.11);
  }
  return v;
}

function trackOf(keys, segs, dur) {
  const curves = Object.fromEntries(CHANNELS.map(ch => [ch, curve(keys, ch, ch === 'b' || ch === 'd')]));
  const raw = t => { const o = {}; for (const ch of CHANNELS) o[ch] = valueAt(curves[ch], t); return o; };
  return {
    kind: 'knife', keys, segs, dur,
    /** the knife and the hand at time t */
    sample(t) {
      const p = raw(t), q = raw(Math.min(dur, t + 1 / 240));
      // how far the knife has turned in the fingers, and how fast it is turning there
      let off = 0, spin = 0;
      for (const a of ['rz', 'ry', 'rx']) {
        off = Math.max(off, Math.abs(wrap(p[a] - p['h' + a])));
        spin += Math.abs((q[a] - q['h' + a]) - (p[a] - p['h' + a])) * 240;
      }
      p.pv = [p.pvx, p.pvy];
      p.pinch = Math.max(ramp(off, 10, 38), ramp(spin, 120, 420));
      p.air = ramp(-p.Y, 40, 95);
      return p;
    },
  };
}


// ============================================================ DECK OF CARDS
export const N = 26;
const SUITS = [['♠', 0], ['♥', 1], ['♦', 1], ['♣', 0]];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const REST = i => ({ x: 0, y: 0, z: i * 0.45, rz: 0, ry: 0, rx: 0 });

function rot([x, y], deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
/** a card whose centre swings around pivot p by deg */
function around(p, deg) {
  const [x, y] = rot([-p[0], -p[1]], deg);
  return [p[0] + x, p[1] + y];
}
function move(id, name, level, about, dur, f) { return { id, name, level, about, dur, f }; }

export const CARD_MOVES = [
  move('thumb-fan', 'Thumb fan', 'Beginner', 'The deck turns face up and the thumb pushes it into a perfect arc, then closes it again.', 2.8, (t, i, n) => {
    const open = sm(t, 0.35, 1.0) * (1 - sm(t, 1.9, 2.5));
    const deg = (-62 + (124 * i) / (n - 1)) * open;
    const [x, y] = around([-24, 42], deg);
    return { x, y, z: i * 0.45, rz: deg, ry: 180 * sm(t, 0, 0.3) * (1 - sm(t, 2.5, 2.8)), rx: 0 };
  }),
  move('charlier', 'Charlier cut', 'Beginner', 'A one-handed cut: the bottom half swings up and over the top half and lands on it.', 2.0, (t, i, n) => {
    const p = sm(t, 0.2, 1.4), arc = Math.sin(p * Math.PI);
    if (i < n / 2) return { x: arc * 34, y: -arc * 72, z: i * 0.45 + (p > 0.5 ? n * 0.45 : 0), rz: -arc * 26, ry: 0, rx: arc * 18 };
    return { x: -arc * 8, y: arc * 16, z: i * 0.45, rz: arc * 6, ry: 0, rx: 0 };
  }),
  move('swivel-cut', 'Swivel cut', 'Beginner', 'The top half pivots on one corner, swings all the way round and settles back.', 2.0, (t, i, n) => {
    if (i < n / 2) return REST(i);
    const deg = 360 * sm(t, 0.2, 1.6);
    const [x, y] = around([35, 49], deg);
    return { x, y, z: i * 0.45 + 6 * Math.sin((deg * Math.PI) / 360), rz: deg, ry: 0, rx: 0 };
  }),
  move('revolution-cut', 'Revolution cut', 'Intermediate', 'The top packet revolves a full turn around the far corner while the bottom packet makes room.', 2.0, (t, i, n) => {
    const p = sm(t, 0.2, 1.6);
    if (i < n / 2) return { ...REST(i), x: 14 * Math.sin(p * Math.PI) };
    const [x, y] = around([-35, -49], -360 * p);
    return { x, y, z: i * 0.45 + 10 * Math.sin(p * Math.PI), rz: -360 * p, ry: 0, rx: 0 };
  }),
  move('sybil-cut', 'Sybil cut', 'Advanced', 'Three packets split between the fingers, trade places in mid-air and stack back in a new order.', 3.0, (t, i, n) => {
    const k = Math.min(2, Math.floor((i * 3) / n));
    const spots = [[[0, 0], [-62, 34], [0, -58], [0, 0]], [[0, 0], [0, -58], [62, 34], [0, 0]], [[0, 0], [62, 34], [-62, 34], [0, 0]]][k];
    const times = [0, 0.8, 1.7, 2.6];
    let seg = 0;
    while (seg < 2 && t > times[seg + 1]) seg++;
    const u = EASE.io(win(t, times[seg], times[seg + 1]));
    const x = lerp(spots[seg][0], spots[seg + 1][0], u), y = lerp(spots[seg][1], spots[seg + 1][1], u);
    const order = t > 2.0 ? [1, 2, 0][k] : k; // packets land in a new order
    return { x, y, z: order * n * 0.15 + (i % Math.ceil(n / 3)) * 0.45, rz: (x / 62) * 14, ry: 0, rx: y < -20 ? 16 : 0 };
  }),
  move('spring', 'Spring', 'Intermediate', 'Pressure bends the deck and the cards fly one by one across to the other hand.', 2.5, (t, i, n) => {
    const toRight = sm(t, 0, 0.3), back = sm(t, 1.9, 2.4), j = n - 1 - i;
    const t0 = 0.35 + j * 0.035, u = win(t, t0, t0 + 0.42);
    const x = u <= 0 ? 85 * toRight : u >= 1 ? -85 : lerp(85, -85, u);
    const y = u > 0 && u < 1 ? -78 * Math.sin(Math.PI * u) : 0;
    const z = u >= 1 ? j * 0.45 : i * 0.45;
    return { x: back ? lerp(x, 0, back) : x, y, z, rz: u > 0 && u < 1 ? lerp(12, -12, u) : 0, ry: 0, rx: u > 0 && u < 1 ? 25 : 0 };
  }),
  move('waterfall', 'Waterfall', 'Beginner', 'The cards cascade out of the top hand in a stream and stack up in the bottom hand.', 2.5, (t, i, n) => {
    const up = sm(t, 0, 0.3), back = sm(t, 1.9, 2.4);
    const t0 = 0.4 + i * 0.035, u = win(t, t0, t0 + 0.42);
    const y = u <= 0 ? -84 * up : u >= 1 ? 72 : lerp(-84, 72, u * u);
    return { x: u > 0 && u < 1 ? Math.sin(u * Math.PI) * 8 : 0, y: back ? lerp(y, 0, back) : y, z: i * 0.45, rz: 0, ry: 0, rx: u > 0 && u < 1 ? 22 * u : 0 };
  }),
  move('ribbon-spread', 'Ribbon spread and turnover', 'Beginner', 'The deck spreads into a ribbon, a wave turns every card face up and back, and it gathers again.', 3.3, (t, i, n) => {
    const s = sm(t, 0.1, 0.7) * (1 - sm(t, 2.7, 3.2));
    const a = 0.9 + i * 0.024, b = 1.85 + i * 0.024;
    return { x: (-160 + (320 * i) / (n - 1)) * s, y: 0, z: i * 0.45, rz: 0, ry: 180 * sm(t, a, a + 0.25) * (1 - sm(t, b, b + 0.25)), rx: 0 };
  }),
  move('riffle-shuffle', 'Riffle shuffle and bridge', 'Intermediate', 'Two halves riffle together card by card, push square, then arch into a bridge and fall flat.', 3.1, (t, i, n) => {
    const half = n / 2, left = i < half;
    const rank = left ? 2 * i : 2 * (i - half) + 1;
    const split = sm(t, 0.1, 0.5), drop = win(t, 0.7 + rank * 0.03, 0.8 + rank * 0.03), push = sm(t, 1.75, 2.05), bridge = Math.sin(Math.PI * sm(t, 2.15, 2.9));
    const side = left ? -1 : 1;
    const x = side * (58 * split - 40 * drop) * (1 - push);
    const z = drop > 0 ? rank * 0.45 : i * 0.45;
    return { x, y: -bridge * (6 + 22 * Math.sin((Math.PI * rank) / (n - 1))), z, rz: side * 7 * split * (1 - push), ry: 0, rx: bridge * 30 };
  }),
  move('pinwheel', 'Pinwheel', 'Intermediate', 'The deck splits into two packets that spin round each other like a pinwheel.', 2.4, (t, i, n) => {
    const p = sm(t, 0.2, 2.0), sep = Math.sin(p * Math.PI), top = i >= n / 2;
    const deg = (top ? 180 : -180) * p;
    const [x, y] = rot([0, (top ? -1 : 1) * 30 * sep], deg);
    return { x, y, z: i * 0.45, rz: deg, ry: 0, rx: 0 };
  }),
  move('scissor-cut', 'Scissor cut', 'Beginner', 'Two packets open on one corner like a pair of scissors, cross over and close.', 2.0, (t, i, n) => {
    const p = sm(t, 0.2, 1.6), open = Math.sin(p * Math.PI), top = i >= n / 2;
    const deg = (top ? 38 : -38) * open;
    const [x, y] = around([-35, 49], deg);
    return { x, y, z: i * 0.45 + (p > 0.5 ? (top ? -1 : 1) * n * 0.22 : 0), rz: deg, ry: 0, rx: 0 };
  }),
  move('card-throw', 'Boomerang throw', 'Intermediate', 'The top card spins out across the room and curves back onto the deck.', 2.4, (t, i, n) => {
    if (i !== n - 1) return REST(i);
    const u = sm(t, 0.15, 2.1), phi = u * 2 * Math.PI;
    return { x: 150 * (1 - Math.cos(phi)), y: -90 * Math.sin(phi), z: i * 0.45 + 60 * Math.sin(u * Math.PI), rz: 1440 * u, ry: 0, rx: 50 * Math.sin(u * Math.PI) };
  }),
  move('anaconda', 'Anaconda dribble', 'Advanced', 'The cards dribble from hand to hand in a snaking stream that swings left and right.', 2.7, (t, i, n) => {
    const up = sm(t, 0, 0.3), back = sm(t, 2.1, 2.6), j = n - 1 - i;
    const t0 = 0.4 + j * 0.04, u = win(t, t0, t0 + 0.5);
    let x, y;
    if (u <= 0) { x = -60 * up; y = -74 * up; } else if (u >= 1) { x = 52; y = 70; } else {
      x = lerp(-60, 52, u) + 28 * Math.sin(u * 2 * Math.PI); y = lerp(-74, 70, u);
    }
    return { x: back ? lerp(x, 0, back) : x, y: back ? lerp(y, 0, back) : y, z: u >= 1 ? j * 0.45 : i * 0.45, rz: u > 0 && u < 1 ? 32 * Math.sin(u * 2 * Math.PI) : 0, ry: 0, rx: 0 };
  }),
  move('two-hand-spread', 'Two-hand spread', 'Beginner', 'Both hands pull the deck into one wide arc, hold it up, and push it shut again.', 3.0, (t, i, n) => {
    const open = sm(t, 0.25, 1.0) * (1 - sm(t, 2.0, 2.7)), deg = (-75 + (150 * i) / (n - 1)) * open;
    const [x, y] = around([0, 150], deg);
    return { x, y, z: i * 0.45, rz: deg, ry: 0, rx: 0 };
  }),
  move('overhand-shuffle', 'Overhand shuffle', 'Beginner', 'The top hand holds the deck while the thumb below peels off small packets, four at a time.', 3.2, (t, i, n) => {
    const up = sm(t, 0, 0.3), back = sm(t, 2.6, 3.1), k = Math.floor((n - 1 - i) / 4), t0 = 0.45 + k * 0.3, u = sm(t, t0, t0 + 0.24);
    const from = [44 * up, -44 * up], to = [-22, 24];
    const x = lerp(from[0], to[0], u), y = lerp(from[1], to[1], u) - 18 * Math.sin(u * Math.PI);
    const z = u >= 1 ? (k * 4 + (i % 4)) * 0.45 : i * 0.45 + 2;
    return { x: lerp(x, 0, back), y: lerp(y, 0, back), z, rz: 8 * Math.sin(u * Math.PI), ry: 0, rx: 0 };
  }),
  move('faro', 'Faro shuffle', 'Advanced', 'Two halves meet edge to edge and weave together one card at a time, then cascade and push square.', 3.0, (t, i, n) => {
    const half = n / 2, left = i < half, side = left ? -1 : 1, rank = left ? 2 * i : 2 * (i - half) + 1;
    const split = sm(t, 0.1, 0.5), meet = sm(t, 0.7, 1.2), cascade = Math.sin(Math.PI * sm(t, 1.4, 2.0)), push = sm(t, 2.1, 2.5);
    const x = side * (40 * split - 37 * meet) * (1 - push), z = meet > 0.5 ? rank * 0.45 : i * 0.45;
    return { x, y: -cascade * 10 * Math.sin((Math.PI * rank) / (n - 1)), z, rz: side * 4 * split * (1 - meet), ry: 0, rx: cascade * 28 };
  }),
  move('turnover', 'Top card turnover', 'Beginner', 'The thumb flips the top card face up onto the deck, shows it, and flips it face down again.', 2.2, (t, i, n) => {
    if (i !== n - 1) return REST(i);
    const a = sm(t, 0.2, 0.75), b = sm(t, 1.25, 1.8), lift = 22 * (Math.sin(Math.PI * a) + Math.sin(Math.PI * b));
    return { x: 0, y: -lift * 0.3, z: i * 0.45 + lift, rz: 0, ry: 180 * (a - b), rx: 0 };
  }),
  move('pressure-fan', 'Pressure fan', 'Intermediate', 'Squeezed from the bottom, the deck snaps into a fan that swings left and right before it closes.', 2.8, (t, i, n) => {
    const open = sm(t, 0.25, 0.7) * (1 - sm(t, 2.1, 2.6)), sway = 16 * Math.sin(Math.PI * 2 * sm(t, 0.8, 2.0));
    const deg = (-52 + (104 * i) / (n - 1)) * open + sway * open;
    const [x, y] = around([0, 49], deg);
    return { x, y, z: i * 0.45, rz: deg, ry: 0, rx: 0 };
  }),
  move('cut-and-carry', 'Cut and carry', 'Beginner', 'The top half is lifted off, carried over in an arc and slid in underneath.', 2.4, (t, i, n) => {
    const top = i >= n / 2, p = sm(t, 0.2, 1.8), arc = Math.sin(Math.PI * p);
    if (!top) return { ...REST(i), z: i * 0.45 + (p > 0.6 ? (n / 2) * 0.45 : 0) };
    return { x: 90 * arc, y: -120 * arc, z: i * 0.45 + 30 * arc - (p > 0.6 ? (n / 2) * 0.45 : 0), rz: 20 * arc, ry: 0, rx: 0 };
  }),
];

/** which card sits at position i in the deck */
export function cardOf(i) {
  const k = i * 5 + 3, [suit, red] = SUITS[k % 4];
  return { rank: RANKS[(k * 7) % 13], suit, red: !!red };
}

// ------------------------------------------------------------ the hands that hold the cards
// Both hands hold the cards from behind, palms towards you, so the cards stay in view. A hold is
// where the hand touches the cards (in the deck's own space, y down), how it is turned, and a mix
// of grips: hold, squeeze, pinch, catch, spread, point, relax.
const H = (x, y, rz = 0, w = { hold: 1 }) => ({ x, y, rz, w });
export const HOME_L = H(-4, 16, 0, { hold: 1 });
export const REST_R = H(150, 205, -10, { relax: 1 });
export function mixH(a, b, u) {
  const w = {};
  for (const k of new Set([...Object.keys(a.w), ...Object.keys(b.w)])) w[k] = lerp(a.w[k] || 0, b.w[k] || 0, u);
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), rz: lerp(a.rz, b.rz, u), w };
}
const corner = (pivot, deg, c) => { const [x, y] = around(pivot, deg), [dx, dy] = rot(c, deg); return [x + dx, y + dy]; };
const along = (k, n) => -160 + (320 * clamp(k, 0, n - 1)) / (n - 1);

const CARD_HANDS = {
  'thumb-fan': t => {
    const open = sm(t, 0.35, 1.0) * (1 - sm(t, 1.9, 2.5)), k = sm(t, 0, 0.3) * (1 - sm(t, 2.5, 2.8));
    const [cx, cy] = corner([-24, 42], 62 * open, [28, -40]);
    return {
      L: mixH(HOME_L, H(-24, 42, -8, { hold: 1 }), k),
      R: mixH(REST_R, H(cx, cy, 20 * open, { pinch: 1 }), sm(t, 0.15, 0.35) * (1 - sm(t, 1.05, 1.4))),
    };
  },
  charlier: t => {
    const arc = Math.sin(sm(t, 0.2, 1.4) * Math.PI);
    return { L: H(-4, 16, 0, { hold: 1 - arc * 0.8, spread: arc * 0.8 }), R: REST_R };
  },
  'swivel-cut': t => ({ L: HOME_L, R: mixH(REST_R, H(35, 49, 0, { pinch: 1 }), sm(t, 0, 0.2) * (1 - sm(t, 1.65, 1.95))) }),
  'revolution-cut': t => {
    const k = sm(t, 0, 0.2) * (1 - sm(t, 1.65, 1.95)), p = sm(t, 0.2, 1.6);
    return { L: mixH(HOME_L, H(-35, -49, 0, { pinch: 1 }), k), R: mixH(REST_R, H(14 * Math.sin(p * Math.PI) + 8, 12, 0, { hold: 1 }), k) };
  },
  'sybil-cut': (t, n, f) => {
    const k = sm(t, 0, 0.2) * (1 - sm(t, 2.7, 3.0)), a = f(t, 0, n), b = f(t, n - 1, n);
    return { L: mixH(HOME_L, H(a.x - 6, a.y + 10, a.rz, { spread: 1 }), k), R: mixH(REST_R, H(b.x + 6, b.y + 10, b.rz, { spread: 1 }), k) };
  },
  spring: t => {
    const toRight = sm(t, 0, 0.3), back = sm(t, 1.9, 2.4);
    return {
      L: H(-85 * toRight * (1 - back) - 4, 16, 0, { catch: 1 - back, hold: back }),
      R: mixH(REST_R, H(85 * toRight + 4, 14, 0, { squeeze: 1 }), sm(t, 0, 0.12) * (1 - sm(t, 1.7, 2.05))),
    };
  },
  waterfall: t => {
    const up = sm(t, 0, 0.3), back = sm(t, 1.9, 2.4);
    return {
      L: H(-4, 16 + 72 * up * (1 - back), 0, { catch: 1 - back, hold: back }),
      R: mixH(REST_R, H(4, -84 * up + 12, 0, { squeeze: 1 }), sm(t, 0, 0.12) * (1 - sm(t, 1.7, 2.05))),
    };
  },
  'ribbon-spread': (t, n) => {
    const s = sm(t, 0.1, 0.7) * (1 - sm(t, 2.7, 3.2));
    const wave = t > 0.85 && t < 1.75 ? along((t - 0.9) / 0.024 + 5, n) : t >= 1.75 && t < 2.65 ? along((t - 1.85) / 0.024 + 5, n) : null;
    const R = wave === null ? H(160 * s + 6, 14, 0, { hold: 1 }) : H(wave, -6, 0, { point: 1 });
    return { L: H(-160 * s - 6, 16, 0, { hold: 1 }), R: mixH(REST_R, R, sm(t, 0, 0.12) * (1 - sm(t, 3.0, 3.3))) };
  },
  'riffle-shuffle': t => {
    const split = sm(t, 0.1, 0.5), push = sm(t, 1.75, 2.05), bridge = Math.sin(Math.PI * sm(t, 2.15, 2.9)), x = 58 * split * (1 - push);
    const lift = 16 - bridge * 18, g = { hold: 1 - bridge * 0.6, squeeze: bridge * 0.6 };
    return { L: H(-x - 8, lift, -7 * split * (1 - push), g), R: mixH(REST_R, H(x + 8, lift, 7 * split * (1 - push), g), sm(t, 0, 0.12) * (1 - sm(t, 2.85, 3.1))) };
  },
  pinwheel: t => {
    const sep = Math.sin(sm(t, 0.2, 2.0) * Math.PI);
    return { L: H(-4, 16, 0, { hold: 1 - sep, spread: sep }), R: REST_R };
  },
  'scissor-cut': t => ({ L: mixH(HOME_L, H(-35, 49, 0, { pinch: 1 }), sm(t, 0, 0.2) * (1 - sm(t, 1.65, 1.95))), R: REST_R }),
  'card-throw': t => {
    const hold = mixH(REST_R, H(30, -34, -20, { pinch: 1 }), sm(t, 0, 0.12));
    const thrown = mixH(hold, H(115, -80, -40, { open: 1 }), sm(t, 0.15, 0.4));
    return { L: HOME_L, R: mixH(thrown, REST_R, sm(t, 0.9, 1.5)) };
  },
  anaconda: t => {
    const up = sm(t, 0, 0.3), back = sm(t, 2.1, 2.6);
    return {
      L: mixH(H(-60 * up - 4, -74 * up + 16, 0, { squeeze: 1 }), HOME_L, back),
      R: mixH(REST_R, H(52 + 4, 70 + 14, 0, { catch: 1 }), sm(t, 0, 0.2) * (1 - back)),
    };
  },
  'two-hand-spread': (t, n, f) => {
    const a = f(t, 0, n), b = f(t, n - 1, n), k = sm(t, 0, 0.2) * (1 - sm(t, 2.7, 3.0));
    return { L: H(a.x - 6, a.y + 16, a.rz, { hold: 1 }), R: mixH(REST_R, H(b.x + 6, b.y + 16, b.rz, { hold: 1 }), k) };
  },
  'overhand-shuffle': t => {
    const up = sm(t, 0, 0.3), back = sm(t, 2.6, 3.1);
    return {
      L: mixH(H(-22 - 4, 24 + 16, 0, { catch: 1 }), HOME_L, back),
      R: mixH(REST_R, H(44 * up + 6, -44 * up + 14, 0, { squeeze: 1 }), sm(t, 0, 0.12) * (1 - sm(t, 2.5, 2.9))),
    };
  },
  faro: t => {
    const split = sm(t, 0.1, 0.5), meet = sm(t, 0.7, 1.2), push = sm(t, 2.1, 2.5), x = (40 * split - 30 * meet) * (1 - push);
    return { L: H(-x - 8, 16, 0, { hold: 1 }), R: mixH(REST_R, H(x + 8, 16, 0, { hold: 1 }), sm(t, 0, 0.12) * (1 - sm(t, 2.7, 3.0))) };
  },
  turnover: t => ({ L: HOME_L, R: mixH(REST_R, H(30, -34, -10, { pinch: 1 }), sm(t, 0.02, 0.18) * (1 - sm(t, 1.9, 2.2))) }),
  'pressure-fan': (t, n, f) => {
    const top = f(t, Math.floor(n / 2), n), k = sm(t, 0.1, 0.25) * (1 - sm(t, 2.3, 2.7));
    return { L: H(-4, 49 + 6, 0, { squeeze: 1 }), R: mixH(REST_R, H(top.x + 4, top.y - 30, top.rz, { pinch: 1 }), k) };
  },
  'cut-and-carry': (t, n, f) => {
    const c = f(t, n - 1, n), k = sm(t, 0, 0.18) * (1 - sm(t, 2.0, 2.4));
    return { L: HOME_L, R: mixH(REST_R, H(c.x + 6, c.y + 14, c.rz, { squeeze: 1 }), k) };
  },
};
for (const m of CARD_MOVES) m.hands = CARD_HANDS[m.id];

const CARDS = Object.fromEntries(CARD_MOVES.map(m => [m.id, m]));

/** Card moves played one after another; every move starts and ends with the deck square. */
export function deckRoutine(ids, { lead = 0.2, tail = 0.5, loop = false } = {}) {
  const segs = [];
  let t = lead;
  ids.map(id => CARDS[id]).filter(Boolean).forEach((mv, ci) => {
    if (ci) t += 0.06;
    const d = mv.dur * CARD_TEMPO;
    segs.push({ trick: mv, auto: false, ci, t0: t, t1: t + d });
    t += d;
  });
  const dur = t + (loop ? 0.12 : tail);
  const rest = Array.from({ length: N }, (_, i) => REST(i));
  return {
    kind: 'cards', segs, dur,
    sample(t) {
      const s = segs.find(g => t >= g.t0 && t < g.t1);
      if (!s) return { cards: rest, L: HOME_L, R: REST_R };
      const u = (t - s.t0) / CARD_TEMPO, f = s.trick.f;
      const hands = s.trick.hands ? s.trick.hands(u, N, f) : { L: HOME_L, R: REST_R };
      return { cards: rest.map((_, i) => f(u, i, N)), ...hands };
    },
  };
}

// ============================================================ SUGGESTED COMBOS
export const COMBOS = {
  balisong: [
    { id: 'first-flips', name: 'First flips', tricks: ['basic-opening', 'forward-fan', 'reverse-fan', 'basic-closing'] },
    { id: 'rollovers', name: 'Rollovers', tricks: ['quick-draw', 'y2k-rollover', 'zen-rollover', 'thumb-rollover', 'basic-closing'] },
    { id: 'cane-work', name: 'Cane work', tricks: ['basic-opening', 'chaplin', 'pendulum', 'kickback', 'basic-closing'] },
    { id: 'air-time', name: 'Air time', tricks: ['basic-opening', 'aerial', 'forward-fan', 'double-aerial', 'basic-closing'] },
    { id: 'twirls', name: 'Twirls', tricks: ['basic-opening', 'double-twirl', 'behind-hand-twirl', 'ripple', 'basic-closing'] },
    { id: 'flow-state', name: 'Flow state', tricks: ['basic-opening', 'sunrise', 'matrix', 'fan-reversal', 'fan-to-close'] },
    { id: 'air-show', name: 'Air show', tricks: ['basic-opening', 'horizontal-aerial', 'aerial', 'bite-loop', 'basic-closing'] },
  ],
  karambit: [
    { id: 'warm-up', name: 'Warm up', tricks: ['index-spin', 'reverse-spin', 'inspect'] },
    { id: 'spin-control', name: 'Spin control', tricks: ['stall', 'spin-flurry', 'fan-spin', 'slow-spin'] },
    { id: 'show-off', name: 'Show off', tricks: ['toss-catch', 'figure-eight', 'ring-flip', 'behind-spin'] },
    { id: 'close-quarters', name: 'Close quarters', tricks: ['slash', 'stab-spin', 'grip-switch', 'triple-spin'] },
    { id: 'the-inspect', name: 'The inspect', tricks: ['inspect', 'wrist-roll', 'index-spin', 'inspect'] },
  ],
  cards: [
    { id: 'show-the-deck', name: 'Show the deck', tricks: ['thumb-fan', 'ribbon-spread'] },
    { id: 'cuts', name: 'One-hand cuts', tricks: ['charlier', 'scissor-cut', 'swivel-cut', 'revolution-cut'] },
    { id: 'flow', name: 'Flow', tricks: ['spring', 'waterfall', 'anaconda'] },
    { id: 'full-routine', name: 'Full routine', tricks: ['riffle-shuffle', 'sybil-cut', 'pinwheel', 'card-throw', 'thumb-fan'] },
    { id: 'shuffles', name: 'Shuffles', tricks: ['riffle-shuffle', 'overhand-shuffle', 'faro', 'cut-and-carry'] },
    { id: 'showtime', name: 'Showtime', tricks: ['two-hand-spread', 'pressure-fan', 'turnover'] },
  ],
};
