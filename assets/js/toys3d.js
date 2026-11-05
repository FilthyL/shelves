// Real 3D for the Trick Room, drawn with Three.js and loaded only when the room opens.
// The rigs play the same tricks as the flat versions in toys.js; this file only builds and lights
// the models. Trick values use screen conventions (y down, clockwise angles), so they are mirrored
// into Three's y-up space as they are applied.
import { BALISONG_TRICKS, CARD_MOVES, BASE, GRIP, EASE, lerp, sampleBali, N, REST, cardOf } from './toys.js';

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
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(container);
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

export async function makeBalisong3D(container, { framing, near } = {}) {
  await loadThree();
  const st = stage(container, near ? { cam: [170, 150, 700], look: [0, 6, 0] } : framing);
  const safeFinish = anodise(rainbowTexture(0)), biteFinish = anodise(rainbowTexture(2.4));
  const gold = new THREE.MeshStandardMaterial({ color: 0xfeae34, metalness: 1, roughness: 0.28 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe8eef5, metalness: 1, roughness: 0.3, envMapIntensity: 1.6 });
  const hGeo = handleGeometry(), pinGeo = new THREE.CylinderGeometry(3.4, 3.4, 13.5, 20);
  pinGeo.rotateX(Math.PI / 2);
  const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner); st.scene.add(outer);
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

  let lastTrick = null, from = null, last = null;
  const ANG = ['rz', 'ry', 'rx', 'b', 'd'];
  const mix = (a, b, u) => {
    const o = {};
    for (const k in b) o[k] = ANG.includes(k) ? a[k] + ((((b[k] - a[k]) % 360) + 540) % 360 - 180) * u : lerp(a[k], b[k], u);
    return o;
  };
  const apply = (p, pv) => {
    place(outer, p.X, p.Y, 0, p.rz, p.ry, p.rx);
    inner.position.set(-pv[0], pv[1], 0);
    blade.rotation.z = -p.b * RAD;
    h2.rotation.z = -p.d * RAD;
    st.render();
  };
  return {
    tricks: BALISONG_TRICKS,
    three: true,
    render(trick, t) {
      if (trick !== lastTrick) { from = last; lastTrick = trick; }
      let p = sampleBali(trick, t), pv = trick.pv;
      if (from && t < 0.3) { // ease from where the last trick ended
        const u = EASE.io(t / 0.3);
        p = mix(from.p, p, u);
        pv = [lerp(from.pv[0], pv[0], u), lerp(from.pv[1], pv[1], u)];
      }
      last = { p, pv };
      apply(p, pv);
    },
    pose(p = { ...BASE, rz: 62, Y: 30 }) { last = { p, pv: GRIP }; apply(p, GRIP); },
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

export async function makeDeck3D(container, { framing, near } = {}) {
  await loadThree();
  const st = stage(container, { cam: near ? [130, 140, 560] : [200, 210, 900], look: [0, -10, 0], floor: -210, ...framing });
  const geo = new THREE.BoxGeometry(70, 98, 0.42);
  const edge = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.85 });
  const back = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.5, alphaTest: 0.5, transparent: false });
  const cards = Array.from({ length: N }, (_, i) => {
    const face = new THREE.MeshStandardMaterial({ map: faceTexture(cardOf(i)), roughness: 0.55, alphaTest: 0.5 });
    // box faces: +x, -x, +y, -y, +z (towards you: the back design), -z (the face)
    const m = new THREE.Mesh(geo, [edge, edge, edge, edge, back, face]);
    m.castShadow = true; m.receiveShadow = true;
    st.scene.add(m);
    return m;
  });
  const put = (m, p) => place(m, p.x, p.y, p.z, p.rz, p.ry, p.rx);
  return {
    tricks: CARD_MOVES,
    three: true,
    render(trick, t) { cards.forEach((m, i) => put(m, trick.f(Math.min(t, trick.dur), i, N))); st.render(); },
    pose() { cards.forEach((m, i) => put(m, { ...REST(i), rz: -8 + i * 0.12, x: i * 0.15 })); st.render(); },
    destroy: st.destroy,
  };
}
