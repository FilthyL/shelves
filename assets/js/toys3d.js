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
function stage(container, { cam = [260, 230, 1060], look = [0, -10, 0], fov = 30, floor = -250, orbit = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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

  const camera = new THREE.PerspectiveCamera(fov, 1, 20, 6000);
  // the camera sits on a sphere round the target; dragging moves it round (within limits)
  const target = new THREE.Vector3(...look), offset = new THREE.Vector3(...cam).sub(target);
  const dist = offset.length();
  let yaw = Math.atan2(offset.x, offset.z), pitch = Math.asin(offset.y / dist);
  const aim = () => {
    camera.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw));
    camera.lookAt(target);
  };
  aim();
  if (orbit) {
    canvas.classList.add('can-orbit');
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('is-orbiting'); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      yaw = Math.max(-1.2, Math.min(1.2, drag.yaw - (e.clientX - drag.x) * 0.006));
      pitch = Math.max(-0.05, Math.min(1.05, drag.pitch + (e.clientY - drag.y) * 0.005));
      aim(); renderer.render(scene, camera);
    });
    const end = () => { drag = null; canvas.classList.remove('is-orbiting'); };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }

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

// Solid handles, machined from one piece: rounded ends and a wide chamfer all round.
const HANDLE_T = 8.4; // thickness of one handle, mm
function handleGeometry() {
  const shape = roundRect(new THREE.Shape(), -10, -10, 142, 10, 9);
  const g = new THREE.ExtrudeGeometry(shape, { depth: HANDLE_T - 3, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 4, curveSegments: 12 });
  g.translate(0, 0, -(HANDLE_T - 3) / 2);
  return g;
}

function bladeGeometry() {
  // the same outline as the flat blade, mirrored to y-up: spine on top, edge below, a trainer slot
  const s = new THREE.Shape();
  s.moveTo(-5, 7); s.lineTo(72, 7); s.lineTo(104, -1); s.lineTo(96, -6);
  s.bezierCurveTo(70, -15, 30, -16, 8, -15); s.lineTo(-2, -15);
  s.quadraticCurveTo(-6, -15, -6, -11); s.lineTo(-6, 3); s.quadraticCurveTo(-6, 7, -5, 7);
  s.holes.push(roundRect(new THREE.Path(), 26, -9, 70, 1, 4));
  // a thick blank with a wide bevel all round, so it reads as a ground edge and a rounded spine
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 2.2, bevelSegments: 5, curveSegments: 20 });
  g.translate(0, 0, -0.7);
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
  tex.repeat.set(1 / 152, 1 / 20);
  tex.offset.set(10 / 152, 0.5);
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
// f: [knuckle, middle, tip] bend per finger (index to little); thumb: [out, across, twist, bend, tip bend],
// all measured from the sculpted hand's rest pose (a relaxed open hand)
const POSES = {
  grip: { f: [[78, 96, 52], [84, 98, 54], [86, 96, 52], [88, 92, 50]], spread: 0.15, thumb: [-25, -30, 0, 45, 40] },
  pinch: { f: [[46, 52, 26], [24, 30, 16], [28, 34, 18], [34, 38, 20]], spread: 0.6, thumb: [-10, -20, 0, 25, 20] },
  open: { f: [[8, 8, 4], [6, 6, 3], [8, 8, 4], [10, 10, 5]], spread: 1, thumb: [2, 0, 0, 4, 4] },
  hold: { f: [[12, 18, 10], [12, 18, 10], [14, 18, 10], [16, 18, 10]], spread: 0.25, thumb: [-12, -22, 0, 22, 18] },
  squeeze: { f: [[40, 52, 28], [40, 54, 28], [42, 54, 28], [44, 52, 26]], spread: 0.15, thumb: [-16, -26, 0, 32, 26] },
  catch: { f: [[24, 26, 14], [22, 24, 13], [24, 26, 14], [26, 26, 14]], spread: 0.5, thumb: [4, 0, 0, 10, 8] },
  spread: { f: [[30, 22, 10], [18, 14, 8], [22, 18, 10], [30, 24, 12]], spread: 1.5, thumb: [10, 4, 0, 6, 5] },
  point: { f: [[12, 10, 6], [72, 92, 52], [78, 92, 52], [82, 90, 50]], spread: 0.3, thumb: [-25, -30, 0, 45, 40] },
  relax: { f: [[26, 32, 16], [28, 36, 18], [32, 38, 18], [36, 40, 20]], spread: 0.5, thumb: [-6, -10, 0, 12, 10] },
};
const CONTACT = {
  grip: [0, 34, 27], pinch: [-22, 74, 20], open: [0, 32, 36], hold: [0, 50, 20], squeeze: [0, 48, 20],
  catch: [0, 46, 26], spread: [0, 50, 22], point: [0, 34, 24], relax: [0, 40, 28],
};

// Hands on the cards hold the deck by its side edge: thumb on the front face, fingers wrapped round
// behind it, palm against the edge. The contact here is the middle of the deck.
const CARD_POSES = {
  hold: { f: [[40, 50, 26], [44, 52, 28], [46, 52, 28], [48, 50, 26]], spread: 0.2, thumb: [-12, -22, 0, 22, 18] },
  squeeze: { f: [[52, 60, 30], [54, 62, 30], [56, 62, 30], [58, 60, 28]], spread: 0.15, thumb: [-16, -26, 0, 32, 26] },
  catch: { f: [[24, 28, 14], [24, 28, 14], [26, 28, 14], [28, 28, 14]], spread: 0.5, thumb: [4, 0, 0, 10, 8] },
  spread: { f: [[20, 18, 10], [14, 14, 8], [18, 16, 10], [24, 20, 12]], spread: 1.4, thumb: [10, 4, 0, 6, 5] },
  pinch: { f: [[46, 40, 20], [56, 60, 30], [60, 62, 30], [64, 60, 28]], spread: 0.3, thumb: [-10, -26, 0, 36, 30] },
  point: { f: [[6, 6, 4], [70, 90, 50], [76, 90, 50], [80, 88, 48]], spread: 0.3, thumb: [-25, -30, 0, 45, 40] },
  relax: { f: [[12, 16, 8], [12, 18, 9], [14, 18, 9], [16, 20, 10]], spread: 0.4, thumb: [-6, -10, 0, 12, 10] },
  open: { f: [[12, 12, 6], [10, 10, 5], [12, 12, 6], [14, 14, 7]], spread: 0.9, thumb: [4, 0, 0, 5, 5] },
};
const CARD_CONTACT = {
  hold: [-42, 40, 40], squeeze: [-42, 40, 38], catch: [-46, 44, 44], spread: [-42, 44, 40],
  pinch: [-40, 72, 10], point: [-40, 98, 8], relax: [-46, 30, 46], open: [-48, 36, 46],
};

function capsuleHand({ mirror = false, poses = POSES, contact = CONTACT } = {}) {
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.62 });
  const nailMat = new THREE.MeshStandardMaterial({ color: NAIL, roughness: 0.35 });
  const root = new THREE.Group(), flip = new THREE.Group(), body = new THREE.Group();
  flip.scale.x = mirror ? -1 : 1;
  root.add(flip); flip.add(body);
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
    setPose(w, wf) {
      const { f, th, c, spread } = mixPose(w, poses, contact, wf);
      fingers.forEach(({ base, js, f: F }, i) => { base.rotation.z = F.spread * spread * RAD; js.forEach((j, k) => { j.rotation.x = f[i][k] * RAD; }); });
      thumb.rotation.set(th[1] * RAD, th[2] * RAD, th[0] * RAD, 'ZXY');
      tMid.rotation.x = th[3] * RAD; tTip.rotation.x = th[4] * RAD;
      body.position.set(-c[0], -c[1], -c[2]);
    },
  };
}

// ------------------------------------------------------------ sculpted hands
// Real hand models: the WebXR generic hands (MIT, Amazon and the Immersive Web group), fetched from
// jsDelivr like Three itself, so nothing is stored here. They are rigged with a bone per joint.
// Each bone is bent about axes worked out from the rest pose (knuckle line, finger line, palm), so
// a pose means the same on every finger, and the model is turned into the same frame as the capsule
// hand above: palm +z, fingers +y, knuckles at y 45. If the models can't load, capsules stand in.
const HAND_URL = side => `https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/${side}.glb`;
const LOADER_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
let handFiles = null;
function loadHandFiles() {
  handFiles ||= (async () => {
    const { GLTFLoader } = await import(LOADER_URL);
    const get = s => fetch(HAND_URL(s)).then(r => { if (!r.ok) throw new Error(`hand model ${r.status}`); return r.arrayBuffer(); });
    const [left, right] = await Promise.all([get('left'), get('right')]);
    return { loader: new GLTFLoader(), left, right };
  })();
  return handFiles.catch(e => { handFiles = null; console.warn('Hand models are unavailable, using simple hands.', e); return null; });
}

let skinMat = null;
const skin = () => (skinMat ||= new THREE.MeshPhysicalMaterial({
  color: SKIN, roughness: 0.5, sheen: 0.7, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xf6757a),
}));

async function sculptedHand(files, { side = 'left', poses = POSES, contact = CONTACT } = {}) {
  const model = (await files.loader.parseAsync(files[side].slice(0), '')).scene;
  model.updateMatrixWorld(true);
  const bone = n => model.getObjectByName(n);
  const at = n => bone(n).getWorldPosition(new THREE.Vector3());
  const wrist = at('wrist'), iP = at('index-finger-phalanx-proximal'), pP = at('pinky-finger-phalanx-proximal'), mP = at('middle-finger-phalanx-proximal');
  const F = mP.clone().sub(wrist).normalize();                              // along the fingers
  const A = pP.clone().sub(iP); A.addScaledVector(F, -A.dot(F)).normalize(); // index to little finger
  // measured from the models: these hands rest with the fingers bent slightly back, but the thumb sits on
  // the palm side, which for a left hand is (index to little) x (along the fingers), and the reverse for a right
  const s = side === 'left' ? 1 : -1;
  const N = s > 0 ? new THREE.Vector3().crossVectors(A, F) : new THREE.Vector3().crossVectors(F, A); // out of the palm
  const X = A.clone().multiplyScalar(s);
  const toH = new THREE.Matrix4().makeBasis(X, F, N).invert();
  model.traverse(o => { if (o.isMesh) { o.material = skin(); o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

  // The model's bones all hang straight off the armature (WebXR moves each joint on its own), so
  // bending is done here: each chain is walked from the knuckle out, every joint turned by the
  // turns of the joints before it, in the armature's own space.
  const rest = n => bone(n).position.clone();
  const fl = rest('middle-finger-phalanx-proximal').sub(rest('wrist')).normalize();
  const al = rest('pinky-finger-phalanx-proximal').sub(rest('index-finger-phalanx-proximal')); al.addScaledVector(fl, -al.dot(fl)).normalize();
  const nl = s > 0 ? new THREE.Vector3().crossVectors(al, fl) : new THREE.Vector3().crossVectors(fl, al);
  const curl = new THREE.Vector3().crossVectors(fl, nl).normalize();
  const tl = rest('thumb-tip').sub(rest('thumb-metacarpal')).normalize();
  // the thumb bends in the plane its joints already curve in at rest
  const t1 = rest('thumb-phalanx-proximal').sub(rest('thumb-metacarpal')), t2 = rest('thumb-tip').sub(rest('thumb-phalanx-proximal'));
  const tFlex = new THREE.Vector3().crossVectors(t1, t2);
  if (tFlex.length() < 1e-6) tFlex.crossVectors(tl, nl);
  tFlex.normalize();
  const chain = names => names.map(n => { const b = bone(n); return { b, P: b.position.clone(), Q: b.quaternion.clone() }; });
  const fingers = ['index', 'middle', 'ring', 'pinky'].map(f => chain(['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(x => `${f}-finger-${x}`)));
  const thumb = chain(['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']);
  const C = new THREE.Quaternion(), D = new THREE.Quaternion(), v = new THREE.Vector3(), here = new THREE.Vector3();
  const run = (ch, turns) => {
    C.identity();
    here.copy(ch[0].P);
    ch.forEach((j, k) => {
      if (k) here.add(v.copy(j.P).sub(ch[k - 1].P).applyQuaternion(C));
      for (const [axis, deg] of turns[k] || []) C.multiply(D.setFromAxisAngle(axis, deg * RAD));
      j.b.position.copy(here);
      j.b.quaternion.copy(C).multiply(j.Q);
    });
  };
  const wristB = bone('wrist'), knuckleB = bone('middle-finger-phalanx-proximal');
  // only now turn the model into the hand frame: the axes above are measured in the model's own space
  const align = new THREE.Group();
  align.add(model);
  align.quaternion.setFromRotationMatrix(toH);
  align.scale.setScalar(1000);
  const k = iP.clone().add(pP).multiplyScalar(0.5).applyMatrix4(toH).multiplyScalar(1000);
  align.position.set(-k.x, 45 - k.y, -k.z);

  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(align);
  const SPREAD = [6, 1, -4, -9];
  return {
    root,
    sculpted: true,
    setPose(w, wf) {
      const m = mixPose(w, poses, contact, wf);
      fingers.forEach((ch, i) => run(ch, [[[nl, s * SPREAD[i] * m.spread], [curl, m.f[i][0]]], [[curl, m.f[i][1]]], [[curl, m.f[i][2]]]]));
      // thumb: out (positive spreads it from the fingers), across (positive brings it over the palm), twist, then the two bends
      run(thumb, [[[nl, s * m.th[0]], [fl, s * m.th[1]], [tl, -s * m.th[2]]], [[tFlex, m.th[3]]], [[tFlex, m.th[4]]]]);
      body.position.set(-m.c[0], -m.c[1], -m.c[2]);
    },
    /** where the wrist and the middle knuckle are now, in the scene */
    wrist: out => wristB.getWorldPosition(out),
    knuckle: out => knuckleB.getWorldPosition(out),
  };
}

/** blend a mix of poses into joint angles and a contact point */
function mixPose(w, poses, contact, wf = null) {
  let tot = 0;
  for (const k in w) if (poses[k]) tot += Math.max(0, w[k] || 0);
  if (tot < 1e-6) { w = { relax: 1 }; tot = 1; }
  const f = [0, 1, 2, 3].map(() => [0, 0, 0]), th = [0, 0, 0, 0, 0], c = [0, 0, 0];
  let spread = 0;
  for (const k in w) {
    const a = Math.max(0, w[k] || 0) / tot, p = poses[k];
    if (!a || !p) continue;
    if (!wf) p.f.forEach((row, i) => row.forEach((v, j) => { f[i][j] += v * a; }));
    p.thumb.forEach((v, j) => { th[j] += v * a; });
    contact[k].forEach((v, j) => { c[j] += v * a; });
    spread += p.spread * a;
  }
  if (wf) wf.forEach((fw, i) => {
    let t = 0;
    for (const k in fw) if (poses[k]) t += Math.max(0, fw[k] || 0);
    for (const k in fw) { const a = t ? Math.max(0, fw[k] || 0) / t : 0; if (a && poses[k]) poses[k].f[i].forEach((v, j) => { f[i][j] += v * a; }); }
  });
  return { f, th, c, spread };
}

/**
 * Follows a target mix of poses smoothly: two easing stages (so a change starts and ends gently),
 * and each finger a little behind the one before it, index first, the way a real hand closes.
 */
function poseFollower(start) {
  const two = ms => ({ ms, a: { ...start }, b: { ...start } });
  const main = two(70), fingers = [60, 78, 96, 114].map(two);
  let last = 0;
  return (target, now) => {
    const dt = now && last ? Math.min(100, now - last) : 1e9;
    last = now || 0;
    for (const s of [main, ...fingers]) { const k = 1 - Math.exp(-dt / s.ms); easeMix(s.a, target, k); easeMix(s.b, s.a, k); }
    return { w: main.b, wf: fingers.map(s => s.b) };
  };
}

/**
 * A sleeve from a fixed elbow to the wrist, so the arm swings from the elbow as the hand moves.
 * The elbow is set the first time, back along the forearm from where the hand starts.
 */
function sleeveFor(scene, hand, { reach = 330, tail = 260 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: SLEEVE, roughness: 0.92 });
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(40, 46, 1, 28, 1, true), mat);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(40, 5.5, 10, 32), new THREE.MeshStandardMaterial({ color: CUFF, roughness: 0.85 }));
  const inside = new THREE.Mesh(new THREE.CircleGeometry(38, 28), new THREE.MeshStandardMaterial({ color: 0x181425, roughness: 1 }));
  for (const m of [sleeve, cuff]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  scene.add(inside);
  let elbow = null;
  const w = new THREE.Vector3(), kn = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return () => {
    hand.root.updateMatrixWorld(true);
    hand.wrist(w); hand.knuckle(kn);
    if (!elbow) elbow = w.clone().add(w.clone().sub(kn).normalize().multiplyScalar(reach));
    dir.copy(elbow).sub(w);
    const len = dir.length();
    dir.normalize();
    const start = w.clone().addScaledVector(dir, 5); // cover the cut end of the hand model, leave the wrist
    sleeve.scale.set(1, len + tail, 1);
    sleeve.position.copy(start).addScaledVector(dir, (len + tail) / 2);
    sleeve.quaternion.setFromUnitVectors(up, dir);
    cuff.position.copy(start); cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    inside.position.copy(start).addScaledVector(dir, 1); inside.quaternion.copy(cuff.quaternion);
  };
}

/** a hand for a rig: sculpted when the models load, capsules when they don't */
async function makeHand(files, opts = {}) {
  if (files) { try { return await sculptedHand(files, opts); } catch (e) { console.warn('Could not build a sculpted hand.', e); } }
  return capsuleHand({ ...opts, mirror: opts.side === 'right' });
}

/** ease a mix of poses towards a target, by k (0 stays, 1 jumps) */
function easeMix(cur, target, k) {
  for (const n of new Set([...Object.keys(cur), ...Object.keys(target)])) cur[n] = lerp(cur[n] || 0, target[n] || 0, k);
  return cur;
}
const follow = (now, last, ms) => (now && last ? 1 - Math.exp(-(now - last) / ms) : 1);

// First person: the camera is your eyes. Each scene is tipped back so your forearms come up from
// below, towards you, and the toy sits in front of you a little below eye level. tilt is that tip
// (about the left-right axis), cam and look are where the eyes are and what they look at.
const POV = {
  knife: { tilt: -40, cam: [-70, 360, 560], look: [-10, 40, 0], near: { cam: [-60, 330, 520], look: [-10, 30, 0] } },
  karambit: { tilt: 0, cam: [-40, 50, 740], look: [10, -50, 0], near: { cam: [-30, 30, 580], look: [10, -60, 0] } },
  cards: { tilt: -46, cam: [0, 380, 520], look: [0, 30, 0], near: { cam: [0, 350, 470], look: [0, 24, 0] } },
};
const viewOf = (key, near, framing) => {
  const v = POV[key], at = near ? v.near : v;
  return { cam: at.cam, look: at.look, orbit: !near, ...framing };
};
const tipped = (scene, key) => { const g = new THREE.Group(); g.rotation.x = POV[key].tilt * RAD; scene.add(g); return g; };

// how the knife hand sits round the handle (turned about the handle's own axis), and how the whole
// performance leans so the arm comes up from the lower left
const ROLL = -28, LEAN = 34;
// The tricks and the hand are built left-handed; the whole knife scene is drawn mirrored, so on screen it
// is a right hand, with its arm coming up from the lower right.
const MIRROR = true;

export async function makeBalisong3D(container, { framing, near } = {}) {
  await loadThree();
  const m = MIRROR ? -1 : 1;
  const st = stage(container, viewOf('knife', near, framing));
  const safeFinish = anodise(rainbowTexture(0)), biteFinish = anodise(rainbowTexture(2.4));
  const gold = new THREE.MeshStandardMaterial({ color: 0xfeae34, metalness: 1, roughness: 0.28 });
  // brushed steel: the anisotropy streaks the highlight along the blade
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xe8eef5, metalness: 1, roughness: 0.26, envMapIntensity: 1.6, anisotropy: 0.7, anisotropyRotation: 0 });
  const hGeo = handleGeometry(), SPAN = 2 * (1.5 + 0.5 + HANDLE_T / 2); // handle centres either side of the blade
  const pinGeo = new THREE.CylinderGeometry(3.2, 3.2, SPAN + HANDLE_T + 1, 20);
  pinGeo.rotateX(Math.PI / 2);
  // a pivot screw head on each outside face, with a dark socket
  const headGeo = new THREE.CylinderGeometry(5, 5.2, 1.6, 28); headGeo.rotateX(Math.PI / 2);
  const socketGeo = new THREE.CylinderGeometry(2, 2, 0.6, 6); socketGeo.rotateX(Math.PI / 2);
  const socketMat = new THREE.MeshStandardMaterial({ color: 0x3e2731, metalness: 0.6, roughness: 0.6 });
  const screws = parent => [1, -1].forEach(side => {
    const head = new THREE.Mesh(headGeo, gold), socket = new THREE.Mesh(socketGeo, socketMat);
    head.position.z = side * (SPAN / 2 + HANDLE_T / 2 + 0.6); socket.position.z = side * (SPAN / 2 + HANDLE_T / 2 + 1.3);
    head.castShadow = true; parent.add(head, socket);
  });
  const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  const world = new THREE.Group(), outer = new THREE.Group(), inner = new THREE.Group();
  world.rotation.z = m * LEAN * RAD;
  world.scale.x = m;
  tipped(st.scene, 'knife').add(world);
  outer.add(inner); world.add(outer);
  const h1 = shadow(new THREE.Mesh(hGeo, safeFinish)); h1.position.z = SPAN / 2;
  const pin1 = shadow(new THREE.Mesh(pinGeo, gold));
  const blade = new THREE.Group();
  const bladeMesh = shadow(new THREE.Mesh(bladeGeometry(), steel));
  const h2 = new THREE.Group(); h2.position.set(0, -8, 0);
  const h2Mesh = shadow(new THREE.Mesh(hGeo, biteFinish)); h2Mesh.position.z = -SPAN / 2;
  const pin2 = shadow(new THREE.Mesh(pinGeo, gold));
  const latch = shadow(new THREE.Mesh(new THREE.BoxGeometry(14, 15, 3), steel)); latch.position.set(134, 0, -SPAN / 2 - HANDLE_T / 2 - 1.5);
  h2.add(h2Mesh, pin2, latch);
  screws(h2);
  blade.add(bladeMesh, h2);
  inner.add(h1, pin1, blade);
  screws(inner);

  // the hand: its contact point rides on the track's hand position, turned with the hand's angles
  const hand = await makeHand(await loadHandFiles(), { side: 'left' }), hPivot = new THREE.Group(), hRoll = new THREE.Group();
  hRoll.rotation.x = ROLL * RAD;
  hPivot.add(hRoll); hRoll.add(hand.root); world.add(hPivot);
  const arm = hand.sculpted ? sleeveFor(st.scene, hand) : null;
  const pose = poseFollower({ grip: 1 });

  const apply = (p, now) => {
    place(outer, p.X, p.Y, 0, p.rz, p.ry, p.rx);
    inner.position.set(-p.pv[0], p.pv[1], 0);
    blade.rotation.z = -p.b * RAD;
    h2.rotation.z = -p.d * RAD;
    // while the knife spins in the fingers the wrist and fingers pump with it, twice a turn
    const beat = (p.pinch || 0) * (1 - (p.air || 0)), phase = 2 * (p.rz + p.ry + p.rx) * RAD;
    place(hPivot, p.hX, p.hY + beat * 3 * Math.cos(phase), 0, p.hrz + beat * 7 * Math.sin(phase), p.hry, p.hrx + beat * 4 * Math.cos(phase));
    // the grip loosens to a pinch while the knife turns in the fingers, and opens flat to catch it
    const air = p.air || 0, pinch = p.pinch || 0;
    const push = pinch * (1 - air) * 0.22 * (1 + Math.sin(2 * (p.rz + p.ry + p.rx) * RAD));
    const { w, wf } = pose({ grip: (1 - pinch) * (1 - air) + push, pinch: pinch * (1 - air), open: air }, now);
    hand.setPose(w, wf);
    arm?.();
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
/** a card's printing; the face is drawn mirrored because it is seen from the back of its geometry */
function cardCanvas(draw, mirrored = false) {
  const c = document.createElement('canvas');
  c.width = 280; c.height = 392;
  const g = c.getContext('2d');
  if (mirrored) { g.translate(280, 0); g.scale(-1, 1); }
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // extruded caps take the shape's own coordinates as UVs: -35..35 by -49..49
  tex.repeat.set(1 / 70, 1 / 98);
  tex.offset.set(0.5, 0.5);
  return tex;
}

/** One card: a rounded slab with real thickness. Its groups: the face (-z), the back (+z), the edge. */
function cardGeometry() {
  const g = new THREE.ExtrudeGeometry(roundRect(new THREE.Shape(), -35, -49, 35, 49, 4.5), { depth: 0.36, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.18);
  const [caps, sides] = g.groups; // the caps hold the bottom faces first, then the top faces
  g.clearGroups();
  g.addGroup(caps.start, caps.count / 2, 0);
  g.addGroup(caps.start + caps.count / 2, caps.count / 2, 1);
  g.addGroup(sides.start, sides.count, 2);
  return g;
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
  }, true);
}

// Seen from the front, the hand on the left of the screen is the performer's right hand. Each hand is
// turned a quarter about its fingers so the palm faces the deck's edge, then leans in a little.
const TURN = { L: 90, R: -90 }, TILT = { L: 10, R: -10 };

export async function makeDeck3D(container, { framing, near } = {}) {
  await loadThree();
  const st = stage(container, { ...viewOf('cards', near, framing), floor: -260 });
  const table = tipped(st.scene, 'cards');
  const geo = cardGeometry();
  // card stock with a plastic coating: a soft sheen on the printing, matt white edges
  const coat = { roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3 };
  const edge = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8 });
  const back = new THREE.MeshPhysicalMaterial({ map: backTexture(), ...coat });
  const cards = Array.from({ length: N }, (_, i) => {
    const face = new THREE.MeshPhysicalMaterial({ map: faceTexture(cardOf(i)), ...coat });
    const m = new THREE.Mesh(geo, [face, back, edge]);
    m.castShadow = true; m.receiveShadow = true;
    table.add(m);
    return m;
  });
  const grips = { poses: CARD_POSES, contact: CARD_CONTACT }, files = await loadHandFiles();
  const hands = { L: await makeHand(files, { ...grips, side: 'left' }), R: await makeHand(files, { ...grips, side: 'right' }) }, frames = {}, held = {}, arms = {};
  for (const side of ['L', 'R']) {
    frames[side] = new THREE.Group(); frames[side].add(hands[side].root); hands[side].root.scale.setScalar(0.92); table.add(frames[side]);
    if (hands[side].sculpted) arms[side] = sleeveFor(st.scene, hands[side]);
  }
  let last = 0;
  const putCard = (m, p) => place(m, p.x, p.y, p.z, p.rz, p.ry, p.rx);
  const followers = { L: null, R: null };
  const putHand = (side, h, k, now) => {
    const c = held[side] ||= { a: { x: h.x, y: h.y, rz: h.rz }, b: { x: h.x, y: h.y, rz: h.rz } };
    for (const n of ['x', 'y', 'rz']) { c.a[n] = lerp(c.a[n], h[n], k); c.b[n] = lerp(c.b[n], c.a[n], k); }
    place(frames[side], c.b.x, c.b.y, 6, c.b.rz + TILT[side], TURN[side], 0);
    const { w, wf } = (followers[side] ||= poseFollower(h.w))(h.w, now);
    hands[side].setPose(w, wf);
  };
  const apply = (s, now) => {
    s.cards.forEach((p, i) => putCard(cards[i], p));
    const k = follow(now, last, 45);
    last = now || 0;
    putHand('L', s.L, k, now); putHand('R', s.R, k, now);
    arms.L?.(); arms.R?.();
    st.render();
  };
  return {
    three: true,
    render: apply,
    pose: s => apply(s, 0),
    destroy: st.destroy,
  };
}


// ------------------------------------------------------------ karambit
// An original karambit in black and gold: a curved claw blade of blackened steel with a polished gold
// edge and an engraved swirl, a black lacquer handle with a gold inlay and a violet stone, a gold
// guard and finger ring. Built in its own plane with the ring centre at the origin, handle along +x,
// the blade curving down (-y) past the end of the handle.
function karambitShapes() {
  const ring = new THREE.Shape(); ring.absarc(0, 0, 21, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, 13.5, 0, Math.PI * 2, true); ring.holes.push(hole);
  const handle = new THREE.Shape();
  handle.moveTo(14, 12); handle.bezierCurveTo(40, 15, 75, 14, 100, 12); handle.lineTo(104, 10); handle.lineTo(104, -12);
  handle.bezierCurveTo(92, -16, 84, -8, 74, -12); handle.bezierCurveTo(64, -16, 56, -8, 46, -12); handle.bezierCurveTo(34, -16, 22, -15, 14, -12);
  handle.lineTo(14, 12);
  const inlay = roundRect(new THREE.Shape(), 26, -2.2, 92, 2.2, 2.2);
  const guard = roundRect(new THREE.Shape(), 99, -15, 108, 15, 3);
  const blade = new THREE.Shape();
  blade.moveTo(104, 11); blade.bezierCurveTo(142, 15, 170, -8, 161, -60);
  blade.bezierCurveTo(151, -36, 134, -18, 106, -10); blade.lineTo(104, -10); blade.lineTo(104, 11);
  return { ring, handle, inlay, guard, blade };
}

/** the blade's printing: blackened steel, a gold edge along the inner curve, and a thin engraved swirl */
function bladeTexture() {
  const c = document.createElement('canvas'), W = 512, H = 384;
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // map the blade's own coordinates (x 100..170, y -64..18 mm) onto the canvas
  const x0 = 100, y1 = 18, sx = W / 72, sy = H / 82;
  const P = (x, y) => [(x - x0) * sx, (y1 - y) * sy];
  g.fillStyle = '#262b44'; g.fillRect(0, 0, W, H);
  g.lineCap = 'round';
  g.strokeStyle = '#feae34'; g.lineWidth = 30;
  g.beginPath(); g.moveTo(...P(161, -60)); g.bezierCurveTo(...P(151, -36), ...P(134, -18), ...P(106, -10)); g.stroke();
  g.strokeStyle = '#ead4aa'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(...P(110, 4)); g.bezierCurveTo(...P(132, 8), ...P(150, -4), ...P(152, -30)); g.stroke();
  g.beginPath(); g.moveTo(...P(118, -2)); g.bezierCurveTo(...P(134, 2), ...P(144, -10), ...P(142, -26)); g.stroke();
  g.lineWidth = 2;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(...P(124 + k * 9, -4 - k * 5), 5 + k, 0, Math.PI * 1.5); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(1 / 72, 1 / 82);
  tex.offset.set(-x0 / 72, 64 / 82);
  return tex;
}

function karambitModel() {
  const sh = karambitShapes();
  const ex = (shape, depth, bevel = 0.8, bevelSize = bevel) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize, bevelSegments: 4, curveSegments: 24 });
    g.translate(0, 0, -depth / 2);
    return g;
  };
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xfeae34, metalness: 1, roughness: 0.22, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x181425, metalness: 0.3, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const bladeMat = new THREE.MeshPhysicalMaterial({ map: bladeTexture(), metalness: 1, roughness: 0.3, clearcoat: 0.3, envMapIntensity: 1.5 });
  const stone = new THREE.MeshPhysicalMaterial({ color: 0xb55088, metalness: 0, roughness: 0.05, transmission: 0.4, thickness: 4, ior: 1.7, clearcoat: 1 });
  const g = new THREE.Group();
  const add = (geo, mat, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.z = z; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(ex(sh.ring, 5, 1.4), gold);
  add(ex(sh.handle, 7, 1.6, 1.8), lacquer);
  add(ex(sh.inlay, 0.6, 0.3), gold, 5.1); add(ex(sh.inlay, 0.6, 0.3), gold, -5.1);
  add(ex(sh.guard, 8, 1.2), gold);
  add(ex(sh.blade, 1.4, 0.7, 2.4), bladeMat);
  for (const x of [38, 82]) for (const z of [5.4, -5.4]) { const r = add(new THREE.CylinderGeometry(2.4, 2.4, 1, 16), gold, z); r.rotation.x = Math.PI / 2; r.position.x = x; }
  for (const z of [5.6, -5.6]) { const s = add(new THREE.OctahedronGeometry(3.4, 0), stone, z); s.position.x = 60; s.scale.set(1, 0.7, 0.5); }
  return g;
}

// The karambit hand: palm down, index finger through the ring pointing away into the scene, the
// other fingers tucked while it spins and wrapped round the handle when it is caught.
const KARAMBIT_POSES = {
  grip: { f: [[20, 30, 16], [82, 96, 52], [86, 96, 52], [90, 92, 50]], spread: 0.1, thumb: [-26, -36, 0, 52, 42] },
  spin: { f: [[2, 4, 2], [86, 98, 54], [88, 96, 52], [90, 92, 50]], spread: 0.1, thumb: [-22, -30, 0, 42, 34] },
  open: { f: [[4, 4, 2], [22, 26, 14], [24, 28, 14], [26, 28, 14]], spread: 0.6, thumb: [-4, -8, 0, 10, 8] },
};
// held, the ring sits on the first joint of the index finger with the handle deep in the fist; spinning,
// it rides out on the finger so the turning knife clears the tucked fingers
const KARAMBIT_CONTACT = { grip: [-26, 66, 16], spin: [-26, 100, 0], open: [-26, 100, 0] };

export async function makeKarambit3D(container, { framing, near } = {}) {
  await loadThree();
  const m = MIRROR ? -1 : 1;
  const st = stage(container, viewOf('karambit', near, framing));
  // Held up to show it, the way the owner asked: knife upright with the ring at the top and the index
  // finger through it, the fist round the handle, the blade curving out at the bottom, the hand coming
  // in from the right, seen from the front a little turned so the ring reads as an oval
  const world = new THREE.Group(), rig = new THREE.Group(), outer = new THREE.Group(), inner = new THREE.Group();
  world.scale.x = m;
  // from the palm-down pointing grip: a quarter turn about the finger stands the handle up, then a
  // turn about the vertical faces the palm and the blade's curve towards you (built left-handed, mirrored)
  rig.rotation.set(0, -40 * RAD, 90 * RAD, 'YXZ');
  // moves (a toss, a slash) are meant on screen, so they are turned back out of the rig's frame
  const unturn = rig.quaternion.clone().invert(), at = new THREE.Vector3();
  const onScreen = (x, y) => at.set(x, -y, 0).applyQuaternion(unturn);
  st.scene.add(world); world.add(rig);
  outer.add(inner); rig.add(outer);
  const knife = karambitModel();
  knife.scale.x = -1; // measured: this puts the handle across the other fingers, the blade past the little finger
  inner.add(knife);

  const hand = await makeHand(await loadHandFiles(), { side: 'left', poses: KARAMBIT_POSES, contact: KARAMBIT_CONTACT });
  const hPivot = new THREE.Group(), hBase = new THREE.Group();
  // turn the hand so the index finger points into the scene and the palm faces down
  hBase.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)));
  hPivot.add(hBase); hBase.add(hand.root); rig.add(hPivot);
  const arm = hand.sculpted ? sleeveFor(st.scene, hand, { reach: 260, tail: 60 }) : null;
  const pose = poseFollower({ grip: 1 });

  const apply = (p, now) => {
    place(outer, 0, 0, 0, p.rz, p.ry, p.rx); outer.position.copy(onScreen(p.X, p.Y));
    inner.position.set(-p.pv[0], p.pv[1], 0);
    place(hPivot, 0, 0, 0, p.hrz, p.hry, p.hrx); hPivot.position.copy(onScreen(p.hX, p.hY));
    const air = p.air || 0, spin = p.pinch || 0;
    const { w, wf } = pose({ grip: (1 - spin) * (1 - air), spin: spin * (1 - air), open: air }, now);
    hand.setPose(w, wf);
    arm?.();
    st.render();
  };
  return { three: true, render: apply, pose: p => apply(p, 0), destroy: st.destroy };
}

/** a hand on its own, for checking poses by eye: pose(mix) then look from a side */
export async function handStage(container, { side = 'left', cards = false } = {}) {
  await loadThree();
  const st = stage(container, { cam: [0, 60, 520], look: [0, 40, 0], floor: -400 });
  const hand = await makeHand(await loadHandFiles(), cards ? { side, poses: CARD_POSES, contact: CARD_CONTACT } : { side });
  const holder = new THREE.Group();
  holder.add(hand.root); st.scene.add(holder);
  return {
    pose(w, turnY = 0, raw = null) {
      const table = cards ? CARD_POSES : POSES, at = cards ? CARD_CONTACT : CONTACT;
      if (raw) { table.raw = raw; at.raw = [0, 0, 0]; w = { raw: 1 }; }
      hand.setPose(w); holder.rotation.set(0, turnY * RAD, 0); hand.root.children[0].position.set(0, 0, 0); st.render();
    },
    destroy: st.destroy,
  };
}
