// The Trick Room: fidget toys you can play with. Each toy is a rig of parts moved in 3D by a
// trick, and each trick is a timeline sampled every frame. Nothing here is a video or a GIF.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, u) => a + (b - a) * u;
const EASE = {
  lin: u => u,
  io: u => u * u * (3 - 2 * u),
  out: u => 1 - (1 - u) * (1 - u),
  in: u => u * u,
};
const win = (t, a, b) => clamp((t - a) / (b - a)); // progress through a window of time
const sm = (t, a, b) => EASE.io(win(t, a, b));

// ============================================================ BUTTERFLY KNIFE
// Kinematics: the safe handle is the root. The blade hangs off pin 1 at angle b (0 = folded into the
// handles, 180 = out). The bite handle hangs off pin 2 on the blade at angle d relative to the blade
// (0 = along the blade, 180 = folded back to meet the safe handle). Open and latched is b 180, d 180.
const L = 132; // handle length from its pin
const OPEN = { b: 180, d: 180 };
const CLOSED = { b: 0, d: 0 };
const BASE = { X: 0, Y: 0, rz: 90, ry: 0, rx: 0, b: 180, d: 180 };
const GRIP = [L * 0.55, 0];

function seq(frames) {
  let t = 0, cur = { ...BASE };
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
];

function sampleBali(trick, time) {
  const { keys } = trick;
  if (time <= 0) return keys[0].p;
  for (let k = 1; k < keys.length; k++) {
    if (time <= keys[k].t) {
      const a = keys[k - 1], b = keys[k];
      const u = EASE[b.e](b.t === a.t ? 1 : (time - a.t) / (b.t - a.t));
      const out = {};
      for (const key in b.p) out[key] = lerp(a.p[key], b.p[key], u);
      return out;
    }
  }
  return keys[keys.length - 1].p;
}

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

function makeBalisong(stage, { ghosts = 2 } = {}) {
  const rigs = [];
  for (let g = 0; g <= ghosts; g++) {
    const el = document.createElement('div');
    el.className = 'bali' + (g ? ' ghost' : '');
    el.style.opacity = g ? String(0.22 / g) : '';
    el.innerHTML = `<span class="bl-h1">${handleHTML(false)}</span><span class="bl-blade">${BLADE_SVG}<span class="bl-h2">${handleHTML(true)}</span></span>`;
    stage.append(el);
    rigs.push({ el, blade: el.querySelector('.bl-blade'), h2: el.querySelector('.bl-h2') });
  }
  const put = (r, p, pv) => {
    r.el.style.transform = `translate3d(${p.X}px, ${p.Y}px, 0) rotateZ(${p.rz}deg) rotateY(${p.ry}deg) rotateX(${p.rx}deg) translate(${-pv[0]}px, ${-pv[1]}px)`;
    r.blade.style.transform = `rotateZ(${p.b}deg)`;
    r.h2.style.transform = `translate(0px, 8px) rotateZ(${p.d}deg) translateZ(-3px)`;
  };
  let lastTrick = null, from = null, lastMain = null;
  const ANG = ['rz', 'ry', 'rx', 'b', 'd'];
  const mix = (a, b, u) => {
    const o = {};
    for (const k in b) o[k] = ANG.includes(k) ? a[k] + ((((b[k] - a[k]) % 360) + 540) % 360 - 180) * u : lerp(a[k], b[k], u);
    return o;
  };
  return {
    tricks: BALISONG_TRICKS,
    render(trick, t, moving) {
      if (trick !== lastTrick) { from = lastMain; lastTrick = trick; }
      rigs.forEach((r, g) => {
        r.el.hidden = g > 0 && !moving;
        if (g > 0 && !moving) return;
        const tt = Math.max(0, t - g * 0.035);
        let p = sampleBali(trick, tt), pv = trick.pv;
        if (from && tt < 0.3) {
          const u = EASE.io(tt / 0.3);
          p = mix(from.p, p, u);
          pv = [lerp(from.pv[0], trick.pv[0], u), lerp(from.pv[1], trick.pv[1], u)];
        }
        if (g === 0) lastMain = { p, pv };
        put(r, p, pv);
      });
    },
    pose(p = { ...BASE, rz: 62, Y: 34 }) { rigs.forEach((r, g) => { r.el.hidden = g > 0; if (!g) put(r, p, GRIP); }); },
    destroy() { rigs.forEach(r => r.el.remove()); },
  };
}

// ============================================================ DECK OF CARDS
const N = 26;
const SUITS = [['♠', 0], ['♥', 1], ['♦', 1], ['♣', 0]];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const REST = i => ({ x: 0, y: 0, z: i * 0.45, rz: 0, ry: 0, rx: 0 });

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
];

function cardFace(k) {
  const [suit, red] = SUITS[k % 4];
  const rank = RANKS[(k * 7) % 13];
  return `<span class="cf${red ? ' red' : ''}"><i>${rank}<br>${suit}</i><b>${suit}</b><i class="flip">${rank}<br>${suit}</i></span>`;
}

function makeDeck(stage) {
  const deck = document.createElement('div');
  deck.className = 'deck';
  deck.innerHTML = Array.from({ length: N }, (_, i) => `<span class="pcard"><span class="cb"></span>${cardFace(i * 5 + 3)}</span>`).join('');
  stage.append(deck);
  const cards = [...deck.children];
  const put = (el, p) => { el.style.transform = `translate3d(${p.x}px, ${p.y}px, ${p.z}px) rotateZ(${p.rz}deg) rotateY(${p.ry}deg) rotateX(${p.rx}deg)`; };
  return {
    tricks: CARD_MOVES,
    render(trick, t) { cards.forEach((el, i) => put(el, trick.f(Math.min(t, trick.dur), i, N))); },
    pose() { cards.forEach((el, i) => put(el, { ...REST(i), rz: -8 + i * 0.12, x: i * 0.15 })); },
    destroy() { deck.remove(); },
  };
}

// ============================================================ REGISTRY + PLAYER
export const TOYS = {
  balisong: { make: makeBalisong, tricks: BALISONG_TRICKS, preview: 'forward-fan', scale: 1.2 },
  cards: { make: makeDeck, tricks: CARD_MOVES, preview: 'thumb-fan', scale: 1.35 },
};
export const trickCount = room => room.items.reduce((s, it) => s + (TOYS[it.toy]?.tricks.length || 0), 0);
export const durOf = trick => trick.dur;

/** Drive a rig: play one trick, optionally loop it or move on to the next. */
export function player(rig, { onTrick, onTick } = {}) {
  let idx = 0, t = 0, last = 0, raf = 0, playing = false, speed = 1, mode = 'all'; // all | loop | once
  const tricks = rig.tricks;
  const frame = now => {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000) * speed;
    last = now;
    if (playing) {
      t += dt;
      const trick = tricks[idx];
      if (t >= trick.dur) {
        if (mode === 'loop') t = 0;
        else if (mode === 'all') { idx = (idx + 1) % tricks.length; t = 0; onTrick?.(idx); }
        else { t = trick.dur; playing = false; onTick?.(); }
      }
      rig.render(tricks[idx], t, playing);
    }
    onTick?.(t / tricks[idx].dur);
    if (playing) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
  return {
    get index() { return idx; },
    get playing() { return playing; },
    get speed() { return speed; },
    get mode() { return mode; },
    go(i) { idx = (i + tricks.length) % tricks.length; t = 0; playing = true; rig.render(tricks[idx], 0, true); onTrick?.(idx); kick(); },
    toggle() { playing = !playing; if (playing) { if (t >= tricks[idx].dur) t = 0; kick(); } else rig.render(tricks[idx], t, false); onTick?.(); },
    setSpeed(s) { speed = s; },
    setMode(m) { mode = m; },
    stop() { playing = false; cancelAnimationFrame(raf); raf = 0; },
  };
}
