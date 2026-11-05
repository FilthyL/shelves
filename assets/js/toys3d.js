// Real 3D for the Trick Room, drawn with Three.js and loaded only when the room opens: the knife,
// the deck and the hands that play them. The rigs only build, pose and light the models; what they
// do comes from the tracks in tricks.js. Track values use screen conventions (y down, clockwise
// angles), so they are mirrored into Three's y-up space as they are applied.
import { lerp, N, cardOf } from './tricks.js';

export const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
let THREE = null;
export async function loadThree() { return (THREE ||= await import(THREE_URL)); }

const RAD = Math.PI / 180;

// ------------------------------------------------------------ stage: renderer, camera, light, table
function stage(container, { cam = [260, 230, 1060], look = [0, -10, 0], fov = 30, floor = -250 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'toy-canvas';
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(studio(), 0.03, 1, 2000).texture; // the studio is 500 across; the default far plane (100) would clip it
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(fov, 1, 10, 6000);
  camera.position.set(...cam);
  camera.lookAt(...look);

  scene.add(new THREE.HemisphereLight(0xc0cbdc, 0x262b44, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(-320, 700, 520);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 100, far: 2200 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x2ce8f5, 0.6);
  rim.position.set(420, 180, -500);
  scene.add(rim);

  const table = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ opacity: 0.34 }));
  table.rotation.x = -Math.PI / 2;
  table.position.y = floor;
  table.receiveShadow = true;
  scene.add(table);

  const fit = () => {
    const w = canvas.clientWidth || container.clientWidth || 1, h = canvas.clientHeight || container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();
  return {
    scene,
    render: () => renderer.render(scene, camera),
    destroy() {
      ro.disconnect();
      scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { m.map?.dispose(); m.dispose(); }); });
      env.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/** a soft studio for reflections: a dark room with a few bright softboxes for steel to catch */
function studio() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x3a4466 }));
  s.add(room);
  const box = (w, h, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  box(700, 260, -160, 380, 220, 0xffffff); // overhead
  box(320, 520, 430, 60, 160, 0xc0cbdc); // right
  box(320, 520, -430, 40, 160, 0x8b9bb4); // left
  box(900, 240, 0, -60, 470, 0x5a6988); // in front, behind the camera
  box(500, 160, 0, -380, 120, 0x8b9bb4); // the table bouncing light up
  box(260, 260, -300, 0, -380, 0x2ce8f5);
  return s;
}

/** screen-convention pose → this object's transform (y mirrored, so z and x turns flip sign) */
function place(obj, x, y, z, rz, ry, rx) {
  obj.position.set(x, -y, z);
  obj.rotation.set(-rx * RAD, ry * RAD, -rz * RAD, 'ZYX');
}

// ------------------------------------------------------------ butterfly knife
function roundRect(path, x0, y0, x1, y1, r) {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0); path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r); path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1); path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r); path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

function handleGeometry() {
  const shape = roundRect(new THREE.Shape(), -9, -9, 141, 9, 6);
  for (const [a, b] of [[26, 46], [52, 72], [78, 98], [104, 122]]) shape.holes.push(roundRect(new THREE.Path(), a, -4, b, 4, 4));
  const pin = new THREE.Path(); pin.absarc(0, 0, 3, 0, Math.PI * 2, true); shape.holes.push(pin);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 4.6, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.7, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -2.3);
  return g;
}

function bladeGeometry() {
  // the same outline as the flat blade, mirrored to y-up: spine on top, edge below, a trainer slot
  const s = new THREE.Shape();
  s.moveTo(-5, 7); s.lineTo(72, 7); s.lineTo(104, -1); s.lineTo(96, -6);
  s.bezierCurveTo(70, -15, 30, -16, 8, -15); s.lineTo(-2, -15);
  s.quadraticCurveTo(-6, -15, -6, -11); s.lineTo(-6, 3); s.quadraticCurveTo(-6, 7, -5, 7);
  s.holes.push(roundRect(new THREE.Path(), 26, -9, 70, 1, 4));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.55, bevelSize: 0.9, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -0.4);
  return g;
}

// Rainbow anodised titanium, from ENDESGA 32: gold through magenta and blue to green and round to
// gold again, so the bands can wrap. Each row is shifted by a slow wave, so the colour flows like
// oil on water instead of sitting in straight stripes.
const RAINBOW = ['#fee761', '#feae34', '#f77622', '#b55088', '#68386c', '#124e89', '#0099db', '#2ce8f5', '#63c74d', '#fee761'];
function rainbowTexture(seed) {
  const W = 512, H = 64;
  const strip = document.createElement('canvas');
  strip.width = W; strip.height = 1;
  const sg = strip.getContext('2d'), grad = sg.createLinearGradient(0, 0, W, 0);
  RAINBOW.forEach((c, i) => grad.addColorStop(i / (RAINBOW.length - 1), c));
  sg.fillStyle = grad; sg.fillRect(0, 0, W, 1);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (let y = 0; y < H; y++) {
    const off = ((y * 2.2 + 46 * Math.sin(y / 9 + seed) + 22 * Math.sin(y / 3.7 + seed * 2) + seed * 90) % W + W) % W;
    g.drawImage(strip, -off, y); g.drawImage(strip, W - off, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // the handle's shape runs x -9..141, y -9..9, and extruded UVs are those raw coordinates
  tex.repeat.set(1 / 150, 1 / 18);
  tex.offset.set(9 / 150, 0.5);
  return tex;
}

const anodise = map => new THREE.MeshPhysicalMaterial({
  map, metalness: 0.7, roughness: 0.24, envMapIntensity: 1.3,
  iridescence: 0.85, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 620], // the thin oxide film that makes the shimmer
  clearcoat: 0.5, clearcoatRoughness: 0.15,
});

// ------------------------------------------------------------ hands
// A right hand built in its own frame: palm facing +z, fingers along +y, thumb on the -x side,
// sizes in millimetres like everything else here. A left hand is the same hand mirrored. Poses
// are joint angles in degrees; a hand shows a mix of them. The contact is the point of each pose
// that touches the toy, and the hand is moved so that point sits on its frame's origin.
const SKIN = 0xe8b796, NAIL = 0xead4aa, SLEEVE = 0x3a4466, CUFF = 0x5a6988;
const FINGERS = [ // knuckle x, y; three segment lengths; radius; how far it fans out
  { x: -25, y: 44, len: [40, 25, 19], r: 8.4, spread: 6 },
  { x: -8, y: 47, len: [44, 28, 21], r: 8.8, spread: 1 },
  { x: 9, y: 45, len: [41, 26, 20], r: 8.4, spread: -4 },
  { x: 25, y: 39, len: [32, 21, 17], r: 7.4, spread: -9 },
];
// f: [knuckle, middle, tip] bend per finger (index to little); thumb: [out, across, twist, middle, tip]
const POSES = {
  grip: { f: [[78, 96, 52], [84, 98, 54], [86, 96, 52], [88, 92, 50]], spread: 0.15, thumb: [26, 58, 40, 34, 26] },
  pinch: { f: [[46, 52, 26], [24, 30, 16], [28, 34, 18], [34, 38, 20]], spread: 0.6, thumb: [40, 52, 34, 20, 16] },
  open: { f: [[8, 8, 4], [6, 6, 3], [8, 8, 4], [10, 10, 5]], spread: 1, thumb: [38, 22, 10, 8, 5] },
  hold: { f: [[12, 18, 10], [12, 18, 10], [14, 18, 10], [16, 18, 10]], spread: 0.25, thumb: [26, 64, 38, 24, 18] },
  squeeze: { f: [[40, 52, 28], [40, 54, 28], [42, 54, 28], [44, 52, 26]], spread: 0.15, thumb: [24, 66, 38, 30, 24] },
  catch: { f: [[24, 26, 14], [22, 24, 13], [24, 26, 14], [26, 26, 14]], spread: 0.5, thumb: [30, 42, 22, 14, 10] },
  spread: { f: [[30, 22, 10], [18, 14, 8], [22, 18, 10], [30, 24, 12]], spread: 1.5, thumb: [38, 34, 16, 10, 8] },
  point: { f: [[12, 10, 6], [72, 92, 52], [78, 92, 52], [82, 90, 50]], spread: 0.3, thumb: [28, 52, 30, 30, 22] },
  relax: { f: [[26, 32, 16], [28, 36, 18], [32, 38, 18], [36, 40, 20]], spread: 0.5, thumb: [22, 42, 20, 18, 14] },
};
const CONTACT = {
  grip: [0, 34, 27], pinch: [-22, 74, 20], open: [0, 32, 36], hold: [0, 50, 20], squeeze: [0, 48, 20],
  catch: [0, 46, 26], spread: [0, 50, 22], point: [0, 34, 24], relax: [0, 40, 28],
};

// Hands on the cards hold the deck by its side edge: thumb on the front face, fingers wrapped round
// behind it, palm against the edge. The contact here is the middle of the deck.
const CARD_POSES = {
  hold: { f: [[40, 50, 26], [44, 52, 28], [46, 52, 28], [48, 50, 26]], spread: 0.2, thumb: [30, 36, 20, 10, 8] },
  squeeze: { f: [[52, 60, 30], [54, 62, 30], [56, 62, 30], [58, 60, 28]], spread: 0.15, thumb: [26, 42, 24, 16, 12] },
  catch: { f: [[24, 28, 14], [24, 28, 14], [26, 28, 14], [28, 28, 14]], spread: 0.5, thumb: [44, 26, 14, 8, 6] },
  spread: { f: [[20, 18, 10], [14, 14, 8], [18, 16, 10], [24, 20, 12]], spread: 1.4, thumb: [44, 30, 14, 8, 6] },
  pinch: { f: [[46, 40, 20], [56, 60, 30], [60, 62, 30], [64, 60, 28]], spread: 0.3, thumb: [34, 40, 26, 14, 10] },
  point: { f: [[6, 6, 4], [70, 90, 50], [76, 90, 50], [80, 88, 48]], spread: 0.3, thumb: [24, 50, 30, 30, 22] },
  relax: { f: [[12, 16, 8], [12, 18, 9], [14, 18, 9], [16, 20, 10]], spread: 0.4, thumb: [20, 30, 14, 10, 8] },
  open: { f: [[12, 12, 6], [10, 10, 5], [12, 12, 6], [14, 14, 7]], spread: 0.9, thumb: [40, 22, 10, 8, 5] },
};
const CARD_CONTACT = {
  hold: [-42, 40, 40], squeeze: [-42, 40, 38], catch: [-46, 44, 44], spread: [-42, 44, 40],
  pinch: [-40, 72, 10], point: [-40, 98, 8], relax: [-46, 30, 46], open: [-48, 36, 46],
};

function makeHand({ left = false, poses = POSES, contact = CONTACT } = {}) {
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.62 });
  const nailMat = new THREE.MeshStandardMaterial({ color: NAIL, roughness: 0.35 });
  const root = new THREE.Group(), mirror = new THREE.Group(), body = new THREE.Group();
  mirror.scale.x = left ? -1 : 1;
  root.add(mirror); mirror.add(body);
  const mesh = (geo, mat = skin) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const bone = (r, len) => { const g = new THREE.CapsuleGeometry(r, len, 4, 12); g.translate(0, len / 2, 0); return g; };

  const palm = new THREE.ExtrudeGeometry(roundRect(new THREE.Shape(), -33, -40, 33, 40, 14), { depth: 12, bevelEnabled: true, bevelThickness: 9, bevelSize: 9, bevelSegments: 4, curveSegments: 10 });
  palm.translate(0, 0, -6);
  body.add(mesh(palm));
  const pad = mesh(new THREE.SphereGeometry(20, 16, 12)); // the ball of the thumb
  pad.position.set(-24, -16, 8); pad.scale.set(1, 1.35, 0.7);
  body.add(pad);
  const wrist = mesh(new THREE.CylinderGeometry(27, 29, 64, 20));
  wrist.position.set(0, -72, 0); wrist.scale.z = 0.72;
  body.add(wrist);
  const sleeve = mesh(new THREE.CylinderGeometry(40, 44, 340, 24), new THREE.MeshStandardMaterial({ color: SLEEVE, roughness: 0.92 }));
  sleeve.position.y = -104 - 170;
  body.add(sleeve);
  const cuff = mesh(new THREE.TorusGeometry(40, 5, 10, 28), new THREE.MeshStandardMaterial({ color: CUFF, roughness: 0.85 }));
  cuff.rotation.x = Math.PI / 2; cuff.position.y = -104;
  body.add(cuff);

  const fingers = FINGERS.map(f => {
    const base = new THREE.Group();
    base.position.set(f.x, f.y, 0);
    body.add(base);
    let parent = base;
    const js = f.len.map((len, k) => {
      const j = new THREE.Group();
      if (k) j.position.y = f.len[k - 1];
      parent.add(j);
      j.add(mesh(bone(f.r * [1, 0.92, 0.84][k], len)));
      parent = j;
      return j;
    });
    const nail = mesh(new THREE.BoxGeometry(f.r * 1.1, f.len[2] * 0.55, 1.6), nailMat);
    nail.position.set(0, f.len[2] * 0.62, -f.r * 0.78);
    js[2].add(nail);
    return { base, js, f };
  });
  const thumb = new THREE.Group();
  thumb.position.set(-28, -26, 6);
  body.add(thumb);
  thumb.add(mesh(bone(10.5, 38)));
  const tMid = new THREE.Group(); tMid.position.y = 38; thumb.add(tMid); tMid.add(mesh(bone(9.8, 30)));
  const tTip = new THREE.Group(); tTip.position.y = 30; tMid.add(tTip); tTip.add(mesh(bone(9, 24)));
  const tNail = mesh(new THREE.BoxGeometry(11, 13, 1.6), nailMat); tNail.position.set(0, 15, -7.4); tTip.add(tNail);

  return {
    root,
    /** show a mix of poses, e.g. { grip: 0.7, pinch: 0.3 } */
    setPose(w) {
      let tot = 0;
      for (const k in w) if (poses[k]) tot += Math.max(0, w[k] || 0);
      if (tot < 1e-6) { w = { relax: 1 }; tot = 1; }
      const f = FINGERS.map(() => [0, 0, 0]), th = [0, 0, 0, 0, 0], c = [0, 0, 0];
      let spread = 0;
      for (const k in w) {
        const a = Math.max(0, w[k] || 0) / tot, p = poses[k];
        if (!a || !p) continue;
        p.f.forEach((row, i) => row.forEach((v, j) => { f[i][j] += v * a; }));
        p.thumb.forEach((v, j) => { th[j] += v * a; });
        contact[k].forEach((v, j) => { c[j] += v * a; });
        spread += p.spread * a;
      }
      fingers.forEach(({ base, js, f: F }, i) => { base.rotation.z = F.spread * spread * RAD; js.forEach((j, k) => { j.rotation.x = f[i][k] * RAD; }); });
      thumb.rotation.set(th[1] * RAD, th[2] * RAD, th[0] * RAD, 'ZXY');
      tMid.rotation.x = th[3] * RAD; tTip.rotation.x = th[4] * RAD;
      body.position.set(-c[0], -c[1], -c[2]);
    },
  };
}

/** ease a mix of poses towards a target, by k (0 stays, 1 jumps) */
function easeMix(cur, target, k) {
  for (const n of new Set([...Object.keys(cur), ...Object.keys(target)])) cur[n] = lerp(cur[n] || 0, target[n] || 0, k);
  return cur;
}
const follow = (now, last, ms) => (now && last ? 1 - Math.exp(-(now - last) / ms) : 1);

// how the knife hand sits round the handle (turned about the handle's own axis), and how the whole
// performance leans so the arm comes up from the lower left
const ROLL = -28, LEAN = 34;

export async function makeBalisong3D(container, { framing, near } = {}) {
  await loadThree();
  const st = stage(container, near ? { cam: [130, 130, 800], look: [-40, 6, 0] } : { cam: [210, 190, 1040], look: [-30, 16, 0], ...framing });
  const safeFinish = anodise(rainbowTexture(0)), biteFinish = anodise(rainbowTexture(2.4));
  const gold = new THREE.MeshStandardMaterial({ color: 0xfeae34, metalness: 1, roughness: 0.28 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe8eef5, metalness: 1, roughness: 0.3, envMapIntensity: 1.6 });
  const hGeo = handleGeometry(), pinGeo = new THREE.CylinderGeometry(3.4, 3.4, 13.5, 20);
  pinGeo.rotateX(Math.PI / 2);
  const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  const world = new THREE.Group(), outer = new THREE.Group(), inner = new THREE.Group();
  world.rotation.z = LEAN * RAD;
  st.scene.add(world);
  outer.add(inner); world.add(outer);
  const h1 = shadow(new THREE.Mesh(hGeo, safeFinish)); h1.position.z = 3.4;
  const pin1 = shadow(new THREE.Mesh(pinGeo, gold));
  const blade = new THREE.Group();
  const bladeMesh = shadow(new THREE.Mesh(bladeGeometry(), steel));
  const h2 = new THREE.Group(); h2.position.set(0, -8, 0);
  const h2Mesh = shadow(new THREE.Mesh(hGeo, biteFinish)); h2Mesh.position.z = -3.4;
  const pin2 = shadow(new THREE.Mesh(pinGeo, gold));
  const latch = shadow(new THREE.Mesh(new THREE.BoxGeometry(12, 13, 2.4), steel)); latch.position.set(134, 0, -6.6);
  h2.add(h2Mesh, pin2, latch);
  blade.add(bladeMesh, h2);
  inner.add(h1, pin1, blade);

  // the hand: its contact point rides on the track's hand position, turned with the hand's angles
  const hand = makeHand(), hPivot = new THREE.Group(), hRoll = new THREE.Group();
  hRoll.rotation.x = ROLL * RAD;
  hPivot.add(hRoll); hRoll.add(hand.root); world.add(hPivot);
  const mix = { grip: 1 };
  let last = 0;

  const apply = (p, now) => {
    place(outer, p.X, p.Y, 0, p.rz, p.ry, p.rx);
    inner.position.set(-p.pv[0], p.pv[1], 0);
    blade.rotation.z = -p.b * RAD;
    h2.rotation.z = -p.d * RAD;
    place(hPivot, p.hX, p.hY, 0, p.hrz, p.hry, p.hrx);
    // the grip loosens to a pinch while the knife turns in the fingers, and opens flat to catch it
    const air = p.air || 0, pinch = p.pinch || 0;
    easeMix(mix, { grip: (1 - pinch) * (1 - air), pinch: pinch * (1 - air), open: air }, follow(now, last, 40));
    last = now || 0;
    hand.setPose(mix);
    st.render();
  };
  return {
    three: true,
    render: apply,
    pose: p => apply(p, 0),
    destroy: st.destroy,
  };
}

// ------------------------------------------------------------ deck of cards
function cardCanvas(draw) {
  const c = document.createElement('canvas');
  c.width = 280; c.height = 392;
  const g = c.getContext('2d');
  g.beginPath(); g.roundRect(2, 2, 276, 388, 22); g.closePath();
  g.save(); g.clip(); draw(g); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function backTexture() {
  return cardCanvas(g => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 280, 392);
    g.fillStyle = '#a22633'; g.fillRect(18, 18, 244, 356);
    g.save(); g.beginPath(); g.rect(18, 18, 244, 356); g.clip();
    g.strokeStyle = '#e43b44'; g.lineWidth = 9;
    for (let i = -400; i < 700; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 392, 392); g.stroke(); g.beginPath(); g.moveTo(i + 392, 0); g.lineTo(i, 392); g.stroke(); }
    g.fillStyle = '#ead4aa';
    for (let y = 31; y < 380; y += 26) for (let x = 31; x < 270; x += 26) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
  });
}

function faceTexture({ rank, suit, red }) {
  return cardCanvas(g => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 280, 392);
    g.fillStyle = red ? '#e43b44' : '#181425';
    g.textAlign = 'center';
    const corner = () => { g.font = '700 44px "Bodoni Moda", Georgia, serif'; g.fillText(rank, 34, 56); g.font = '40px Georgia, serif'; g.fillText(suit, 34, 98); };
    corner();
    g.save(); g.translate(280, 392); g.rotate(Math.PI); corner(); g.restore();
    g.font = '150px Georgia, serif'; g.textBaseline = 'middle'; g.fillText(suit, 140, 200);
  });
}

// Seen from the front, the hand on the left of the screen is the performer's right hand. Each hand is
// turned a quarter about its fingers so the palm faces the deck's edge, then leans in a little.
const TURN = { L: 90, R: -90 }, TILT = { L: 10, R: -10 };

export async function makeDeck3D(container, { framing, near } = {}) {
  await loadThree();
  const st = stage(container, { cam: near ? [110, 140, 700] : [160, 170, 900], look: [10, 18, 0], floor: -230, ...framing });
  const geo = new THREE.BoxGeometry(70, 98, 0.42);
  const edge = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.85 });
  const back = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.5, alphaTest: 0.5 });
  const cards = Array.from({ length: N }, (_, i) => {
    const face = new THREE.MeshStandardMaterial({ map: faceTexture(cardOf(i)), roughness: 0.55, alphaTest: 0.5 });
    // box faces: +x, -x, +y, -y, +z (towards you: the back design), -z (the face)
    const m = new THREE.Mesh(geo, [edge, edge, edge, edge, back, face]);
    m.castShadow = true; m.receiveShadow = true;
    st.scene.add(m);
    return m;
  });
  const grips = { poses: CARD_POSES, contact: CARD_CONTACT };
  const hands = { L: makeHand(grips), R: makeHand({ ...grips, left: true }) }, frames = {}, held = {};
  for (const side of ['L', 'R']) { frames[side] = new THREE.Group(); frames[side].add(hands[side].root); hands[side].root.scale.setScalar(0.88); st.scene.add(frames[side]); }
  let last = 0;
  const putCard = (m, p) => place(m, p.x, p.y, p.z, p.rz, p.ry, p.rx);
  const putHand = (side, h, k) => {
    const c = held[side] ||= { x: h.x, y: h.y, rz: h.rz, w: { ...h.w } };
    c.x = lerp(c.x, h.x, k); c.y = lerp(c.y, h.y, k); c.rz = lerp(c.rz, h.rz, k);
    easeMix(c.w, h.w, k);
    place(frames[side], c.x, c.y, 6, c.rz + TILT[side], TURN[side], 0);
    hands[side].setPose(c.w);
  };
  const apply = (s, now) => {
    s.cards.forEach((p, i) => putCard(cards[i], p));
    const k = follow(now, last, 55);
    last = now || 0;
    putHand('L', s.L, k); putHand('R', s.R, k);
    st.render();
  };
  return {
    three: true,
    render: apply,
    pose: s => apply(s, 0),
    destroy: st.destroy,
  };
}
