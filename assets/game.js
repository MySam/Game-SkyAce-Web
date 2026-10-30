/* Sky Ace - 3D 비행 전투 시뮬레이션 (Three.js) */
(() => {
'use strict';

// ============================================================ utils
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _q1 = new Q(), _m1 = new THREE.Matrix4();
const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1);
const KMH = 3.6;

// ============================================================ settings
const settings = { invert: false, sound: true, music: true, hq: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('skyace.settings') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('skyace.settings', JSON.stringify(settings)); } catch (e) {} };
let progress = { cleared: {} };
try { progress = Object.assign(progress, JSON.parse(localStorage.getItem('skyace.progress') || '{}')); } catch (e) {}
const saveProgress = () => { try { localStorage.setItem('skyace.progress', JSON.stringify(progress)); } catch (e) {} };

// ============================================================ renderer / scene
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
function applyQuality() { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.hq ? 2 : 1)); }
applyQuality();
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0xc4dcea);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 700, 5600);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 12000);
scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x6f9a52, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(400, 900, 250);
scene.add(sun);

// sky dome with gradient
{
  const g = new THREE.SphereGeometry(10000, 24, 12);
  const cols = [];
  const pos = g.attributes.position;
  const top = new THREE.Color(0x7fb2d6), hor = new THREE.Color(0xd2e6ee);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10000;
    const c = hor.clone().lerp(top, clamp(y * 1.6, 0, 1));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.userData.sky = sky;
}

// ============================================================ terrain
const WORLD = 12000, SEG = 220, CELL = WORLD / SEG, HALF = WORLD / 2;
const RUNWAY = { x: 0, z0: 120, z1: -1620, w: 46 };
function baseFlatten(x, z) {
  const dx = Math.max(0, Math.abs(x) - 480);
  const dz = Math.max(0, z - 520, -2100 - z);
  return smooth(0, 520, Math.hypot(dx, dz));
}
function heightFn(x, z) {
  const f = baseFlatten(x, z);
  let h = 26 * Math.sin(x * 0.0021 + 0.5) * Math.cos(z * 0.0017)
        + 14 * Math.sin(x * 0.0052 + 1.3) * Math.sin(z * 0.0041 + 0.7)
        + 5 * Math.sin(x * 0.013) * Math.cos(z * 0.011) + 22;
  const d = Math.max(Math.abs(x), Math.abs(z + 700));
  const m = smooth(2300, 4300, d) * (420 + 230 * Math.sin(x * 0.0031) * Math.cos(z * 0.0027) + 120 * Math.sin(x * 0.009 + z * 0.007));
  return Math.max(-6, h) * f + m;
}
const heights = new Float32Array((SEG + 1) * (SEG + 1));
const terrain = (() => {
  const g = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const r = rng(7);
  const cLow = new THREE.Color(0x9cc77a), cMid = new THREE.Color(0x86b466), cHigh = new THREE.Color(0x7f9c74), cTop = new THREE.Color(0xc7d3c2), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ix = i % (SEG + 1), iy = Math.floor(i / (SEG + 1));
    const x = -HALF + ix * CELL, z = -HALF + iy * CELL;
    const h = heightFn(x, z);
    heights[i] = h;
    pos.setXYZ(i, x, h, z);
    if (h < 60) c.copy(cLow).lerp(cMid, clamp(h / 60, 0, 1));
    else if (h < 300) c.copy(cMid).lerp(cHigh, (h - 60) / 240);
    else c.copy(cHigh).lerp(cTop, clamp((h - 300) / 300, 0, 1));
    const n = (r() - 0.5) * 0.05;
    cols[i * 3] = c.r + n; cols[i * 3 + 1] = c.g + n; cols[i * 3 + 2] = c.b + n;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(mesh);
  // outer ground
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8fae78 }));
  outer.position.y = -8;
  scene.add(outer);
  return mesh;
})();
// ground height matching rendered triangles exactly
function groundAt(x, z) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  if (fx < 0 || fz < 0 || fx >= SEG || fz >= SEG) return -8;
  const ix = Math.floor(fx), iy = Math.floor(fz), u = fx - ix, v = fz - iy;
  const W = SEG + 1;
  const ha = heights[iy * W + ix], hb = heights[(iy + 1) * W + ix], hc = heights[(iy + 1) * W + ix + 1], hd = heights[iy * W + ix + 1];
  if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
  return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
}

// ============================================================ airbase
(() => {
  const len = RUNWAY.z0 - RUNWAY.z1, cz = (RUNWAY.z0 + RUNWAY.z1) / 2;
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x3b4352 });
  const white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.w, len).rotateX(-Math.PI / 2), asphalt);
  rw.position.set(RUNWAY.x, 0.12, cz); scene.add(rw);
  // centre dashes
  const dashG = new THREE.PlaneGeometry(0.9, 14).rotateX(-Math.PI / 2);
  const nD = Math.floor(len / 30);
  const dashes = new THREE.InstancedMesh(dashG, white, nD);
  const m = new THREE.Matrix4();
  for (let i = 0; i < nD; i++) { m.makeTranslation(RUNWAY.x, 0.18, RUNWAY.z0 - 20 - i * 30); dashes.setMatrixAt(i, m); }
  scene.add(dashes);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.7, len).rotateX(-Math.PI / 2), white);
    e.position.set(RUNWAY.x + s * (RUNWAY.w / 2 - 1.5), 0.17, cz); scene.add(e);
  }
  // threshold bars
  const bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 26).rotateX(-Math.PI / 2), white, 16);
  let k = 0;
  for (const zz of [RUNWAY.z0 - 18, RUNWAY.z1 + 18]) for (let i = 0; i < 8; i++) {
    const xx = (i < 4 ? -1 : 1) * (5 + (i % 4) * 4);
    m.makeTranslation(xx, 0.18, zz); bars.setMatrixAt(k++, m);
  }
  scene.add(bars);
  // taxiway + apron
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(18, 260).rotateX(-Math.PI / 2), asphalt);
  taxi.rotation.y = Math.PI / 2; taxi.position.set(150, 0.1, -260); scene.add(taxi);
  const taxi2 = new THREE.Mesh(new THREE.PlaneGeometry(18, 700).rotateX(-Math.PI / 2), asphalt);
  taxi2.position.set(110, 0.1, -560); scene.add(taxi2);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 420).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xaab8bd }));
  apron.position.set(290, 0.08, -520); scene.add(apron);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x55606a });
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(1, 60).rotateX(-Math.PI / 2), lineMat);
    l.position.set(210 + i * 40, 0.12, -420); scene.add(l);
  }
  // buildings
  const wall = new THREE.MeshLambertMaterial({ color: 0xeef1f3 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x5f86a8 });
  const roof = new THREE.MeshLambertMaterial({ color: 0x8a96a0 });
  function box(w, h, d, x, y, z, mat) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); scene.add(b); return b; }
  // terminal (rounded)
  const term = new THREE.Mesh(new THREE.CylinderGeometry(55, 55, 16, 24, 1, false, 0, Math.PI), wall);
  term.position.set(380, 8, -720); term.rotation.y = Math.PI / 2; scene.add(term);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(55.6, 55.6, 2, 24, 1, true, 0, Math.PI), glass);
    band.position.set(380, 3.5 + i * 5, -720); band.rotation.y = Math.PI / 2; scene.add(band);
  }
  // hangars
  for (let i = 0; i < 3; i++) {
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 40, 14, 1, false, -Math.PI / 2, Math.PI), roof);
    hb.rotation.x = -Math.PI / 2; hb.position.set(400, 0, -380 - i * 60); scene.add(hb);
  }
  // control tower
  box(8, 40, 8, 210, 20, -230, wall);
  box(14, 7, 14, 210, 43, -230, glass);
  box(16, 1.2, 16, 210, 47, -230, roof);
  box(30, 10, 22, 240, 5, -250, wall);
  // water tower
  const rust = new THREE.MeshLambertMaterial({ color: 0x7b4a35 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 9, 12), rust); tank.position.set(150, 26, -140); scene.add(tank);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(7.6, 4, 12), rust); cap.position.set(150, 32.5, -140); scene.add(cap);
  for (const [a, b] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 22, 5), rust);
    leg.position.set(150 + a * 0.9, 11, -140 + b * 0.9); leg.rotation.set(b * -0.02, 0, a * 0.02); scene.add(leg);
  }
  // radar dish
  const dish = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshLambertMaterial({ color: 0xdfe6ea, side: THREE.DoubleSide }));
  dish.position.set(300, 14, -170); dish.rotation.x = -1.0; scene.add(dish);
  box(2, 10, 2, 300, 5, -170, wall);
  scene.userData.dish = dish;
  // parked jets placeholder (filled after jet factory exists)
  scene.userData.apron = [[250, -470], [290, -470], [330, -470]];
})();

// ============================================================ trees & clouds
(() => {
  const r = rng(42);
  const N = 4200;
  const cone = new THREE.ConeGeometry(4.2, 13, 6); cone.translate(0, 9, 0);
  const trunk = new THREE.CylinderGeometry(0.7, 0.9, 4, 5); trunk.translate(0, 2, 0);
  const leaves = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N);
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0xa0624a }), N);
  const m = new THREE.Matrix4(), q = new Q(), s = new V3(), p = new V3(), c = new THREE.Color();
  const palette = [0x2fb3c6, 0x35a1bd, 0x3fc0c2, 0x2d93ad, 0x52b9a9];
  let n = 0;
  while (n < N) {
    // clustered forests
    const cx = (r() - 0.5) * 9000, cz = (r() - 0.5) * 9000 - 600;
    const cnt = 10 + Math.floor(r() * 40);
    for (let j = 0; j < cnt && n < N; j++) {
      const x = cx + (r() - 0.5) * 500, z = cz + (r() - 0.5) * 500;
      if (baseFlatten(x, z) < 0.6) continue;
      const h = groundAt(x, z);
      if (h > 430) continue;
      const sc = 0.7 + r() * 0.9;
      p.set(x, h - 0.5, z); q.setFromAxisAngle(AY, r() * 6.28); s.set(sc, sc * (0.8 + r() * 0.5), sc);
      m.compose(p, q, s);
      leaves.setMatrixAt(n, m); trunks.setMatrixAt(n, m);
      c.setHex(palette[Math.floor(r() * palette.length)]);
      leaves.setColorAt(n, c);
      n++;
    }
  }
  scene.add(leaves, trunks);

  // clouds - instanced puffs
  const puffs = 520;
  const cg = new THREE.IcosahedronGeometry(1, 1);
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa6ad, transparent: true, opacity: 0.88, flatShading: false });
  const clouds = new THREE.InstancedMesh(cg, cm, puffs);
  let k = 0;
  while (k < puffs) {
    const x = (r() - 0.5) * 10000, z = (r() - 0.5) * 10000, y = 320 + r() * 380;
    const parts = 5 + Math.floor(r() * 7);
    const size = 40 + r() * 70;
    for (let j = 0; j < parts && k < puffs; j++) {
      p.set(x + (r() - 0.5) * size * 2.6, y + (r() - 0.3) * size * 0.4, z + (r() - 0.5) * size * 1.6);
      const sc = size * (0.55 + r() * 0.6);
      s.set(sc, sc * 0.62, sc);
      q.identity();
      m.compose(p, q, s);
      clouds.setMatrixAt(k++, m);
    }
  }
  scene.add(clouds);
})();

// ============================================================ jet geometry (merged, 1 draw call per airframe)
function loftGeo(sections, colorFn, n = 14) {
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (const s of sections) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const x = s.w * Math.sign(ca) * Math.pow(Math.abs(ca), 0.75);
      const y = (sa >= 0 ? s.t : s.b) * Math.sign(sa) * Math.pow(Math.abs(sa), 1.15) + (s.y || 0);
      pos.push(x, y, s.z);
      c.setHex(colorFn(x, y - (s.y || 0), s.z)); col.push(c.r, c.g, c.b);
    }
  }
  for (let k = 0; k < sections.length - 1; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k * n + (i + 1) % n, cc = (k + 1) * n + (i + 1) % n, d = (k + 1) * n + i;
    idx.push(a, b, cc, a, cc, d);
  }
  // tail cap
  const last = sections[sections.length - 1], base = pos.length / 3;
  pos.push(0, last.y || 0, last.z); c.setHex(0x22262c); col.push(c.r, c.g, c.b);
  const ringStart = (sections.length - 1) * n;
  for (let i = 0; i < n; i++) {
    const p = (ringStart + i) * 3;
    pos.push(pos[p], pos[p + 1], pos[p + 2]); col.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < n; i++) idx.push(base, base + 1 + i, base + 1 + (i + 1) % n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function plateGeo(pts, thick, bevel = 0.06) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return g;
}
function flipWinding(g) {
  for (const name of ['position', 'normal', 'color']) {
    const at = g.attributes[name]; if (!at) continue;
    const a = at.array, s = at.itemSize;
    for (let t = 0; t < at.count; t += 3) for (let k = 0; k < s; k++) {
      const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, tmp = a[i1]; a[i1] = a[i2]; a[i2] = tmp;
    }
  }
  return g;
}
function part(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}
function mirrored(g) { const m = g.clone(); m.scale(-1, 1, 1); return flipWinding(m); }
function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}
function sym(list, geo, color) { const p = part(geo, color); list.push(p, mirrored(p)); }

function buildFighterGeo(pal) {
  const L = [];
  const fus = loftGeo([
    { z: -10.9, w: 0.03, t: 0.03, b: 0.03, y: -0.12 },
    { z: -10.1, w: 0.34, t: 0.28, b: 0.24, y: -0.1 },
    { z: -8.6, w: 0.66, t: 0.55, b: 0.44, y: -0.03 },
    { z: -6.6, w: 0.9, t: 0.76, b: 0.6, y: 0.03 },
    { z: -4.6, w: 1.08, t: 0.84, b: 0.68, y: 0.06 },
    { z: -2.6, w: 1.75, t: 0.8, b: 0.78, y: 0.0 },
    { z: 0.6, w: 2.0, t: 0.76, b: 0.82, y: 0.0 },
    { z: 3.6, w: 1.95, t: 0.64, b: 0.78, y: 0.0 },
    { z: 5.9, w: 1.7, t: 0.54, b: 0.66, y: 0.0 },
    { z: 7.3, w: 1.42, t: 0.46, b: 0.56, y: 0.0 },
  ], (x, y, z) => z < -9.7 ? pal.nose : (y < -0.2 ? pal.belly : (Math.abs(z + 1.2) < 0.9 && y > 0.3 ? pal.stripe : pal.main)));
  L.push(part(fus));
  // canopy
  const can = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  can.scale(0.6, 0.66, 2.5); can.translate(0, 0.66, -5.7);
  L.push(part(can, pal.glass));
  const frame = new THREE.BoxGeometry(1.22, 0.08, 0.14); frame.translate(0, 1.27, -5.0);
  L.push(part(frame, pal.dark));
  // intakes
  const intake = new THREE.BoxGeometry(0.8, 1.15, 3.8); intake.translate(1.9, -0.18, -2.0);
  sym(L, intake, pal.main);
  const inlet = new THREE.BoxGeometry(0.72, 1.0, 0.12); inlet.translate(1.9, -0.18, -3.92);
  sym(L, inlet, 0x111418);
  const lip = new THREE.BoxGeometry(0.86, 0.12, 0.5); lip.translate(1.9, 0.42, -3.7);
  sym(L, lip, pal.accent);
  // wings (with LERX)
  sym(L, plateGeo([[0.9, -5.6], [1.7, -3.0], [8.1, 2.5], [8.1, 3.8], [1.7, 4.7], [0.9, 4.7]], 0.24, 0.06).translate(0, -0.08, 0), pal.main);
  sym(L, plateGeo([[7.1, 1.6], [8.15, 2.5], [8.15, 3.85], [7.1, 3.85]], 0.3, 0.04).translate(0, -0.08, 0), pal.accent);
  // flaps (dark panel lines)
  sym(L, plateGeo([[2.6, 4.2], [6.8, 3.7], [6.8, 3.95], [2.6, 4.45]], 0.3, 0).translate(0, -0.08, 0), pal.panel);
  // horizontal stabs
  sym(L, plateGeo([[1.0, 4.6], [4.9, 6.8], [4.9, 7.9], [1.0, 8.3]], 0.2, 0.05).translate(0, -0.12, 0), pal.main);
  // canted twin tails
  {
    const fin = plateGeo([[0, 3.4], [2.75, 5.9], [2.75, 6.9], [0, 7.3]], 0.18, 0.05);
    fin.rotateZ(THREE.MathUtils.degToRad(62)); fin.translate(1.2, 0.45, 0);
    sym(L, fin, pal.accent);
    const tip = plateGeo([[2.15, 5.35], [2.8, 5.95], [2.8, 6.95], [2.15, 6.95]], 0.22, 0.02);
    tip.rotateZ(THREE.MathUtils.degToRad(62)); tip.translate(1.2, 0.45, 0);
    sym(L, tip, pal.tip);
  }
  if (pal.canard) sym(L, plateGeo([[0.9, -6.4], [2.9, -4.7], [2.9, -4.1], [0.9, -4.1]], 0.16, 0.04).translate(0, 0.05, 0), pal.accent);
  // nozzles
  const noz = new THREE.CylinderGeometry(0.6, 0.68, 1.5, 14, 1, true); noz.rotateX(Math.PI / 2); noz.translate(0.78, -0.05, 8.0);
  sym(L, noz, 0x3d434c);
  const inner = new THREE.CircleGeometry(0.56, 14); inner.translate(0.78, -0.05, 8.5);
  sym(L, inner, 0x0c0d10);
  const ring = new THREE.CylinderGeometry(0.62, 0.62, 0.25, 14, 1, true); ring.rotateX(Math.PI / 2); ring.translate(0.78, -0.05, 8.65);
  sym(L, ring, 0x8a6a4a);
  // ventral strakes
  const vs = plateGeo([[0, 4.8], [0.9, 6.0], [0.9, 6.9], [0, 7.0]], 0.12, 0.02); vs.rotateZ(-THREE.MathUtils.degToRad(70)); vs.translate(1.1, -0.65, 0);
  sym(L, vs, pal.belly);
  return mergeGeos(L);
}
function buildBomberGeo(pal) {
  const L = [];
  const half = [[0, -15], [30, 7], [27, 9.5], [21, 6.8], [15, 9.5], [9, 6.8], [3.5, 9.5], [0, 7.5]];
  const full = half.concat(half.slice(1, -1).reverse().map(p => [-p[0], p[1]]));
  L.push(part(plateGeo(full, 1.0, 0.45), pal.main));
  L.push(part(loftGeo([
    { z: -13, w: 0.3, t: 0.3, b: 0.3 }, { z: -10, w: 3.2, t: 1.5, b: 1.0 }, { z: -4, w: 5.2, t: 2.2, b: 1.2 },
    { z: 3, w: 5.0, t: 1.7, b: 1.1 }, { z: 7, w: 3.6, t: 0.9, b: 0.8 }], (x, y) => y > 0.6 ? pal.main : pal.belly)));
  const can = new THREE.BoxGeometry(2.6, 0.5, 2.2); can.translate(0, 1.95, -8.2); L.push(part(can, pal.glass));
  for (const x of [6.5, 10.5]) {
    const nac = loftGeo([{ z: -5, w: 0.3, t: 0.3, b: 0.3 }, { z: -3.5, w: 1.2, t: 1.4, b: 0.6 }, { z: 3, w: 1.1, t: 1.2, b: 0.6 }, { z: 6, w: 0.8, t: 0.7, b: 0.4 }], () => pal.panel);
    nac.translate(x, 0.6, 0);
    sym(L, nac);
  }
  const stripe = plateGeo([[5, 0.5], [28, 7.3], [27.4, 8.1], [5, 1.4]], 1.06, 0.4);
  sym(L, stripe, pal.accent);
  return mergeGeos(L);
}

const PALETTES = {
  player: { main: 0xe8ecf1, belly: 0xc9d1da, stripe: 0x2f62a8, accent: 0x2f62a8, tip: 0x1c3f75, nose: 0x5b6470, glass: 0x1d2c44, dark: 0x2a3038, panel: 0xb5bfca },
  fighter: { main: 0x59616d, belly: 0x8a929c, stripe: 0x9b2f2f, accent: 0x9b2f2f, tip: 0x2b2e33, nose: 0x30353c, glass: 0x3b2d1a, dark: 0x22252a, panel: 0x464d57 },
  ace: { main: 0x24272d, belly: 0x3a3e46, stripe: 0xd9a03a, accent: 0xd9a03a, tip: 0xb32020, nose: 0x15171a, glass: 0x6a4a12, dark: 0x111214, panel: 0x30343b, canard: true },
  bomber: { main: 0x4b5058, belly: 0x5e636b, accent: 0x8c2a2a, glass: 0x1b2230, panel: 0x3c4148 },
};
const GEO = {}, MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x4a4f55 });
function airframeGeo(kind) {
  if (!GEO[kind]) GEO[kind] = kind === 'bomber' ? buildBomberGeo(PALETTES.bomber) : buildFighterGeo(PALETTES[kind] || PALETTES.player);
  return GEO[kind];
}

// afterburner assets (shared)
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(170,220,255,.8)'); g.addColorStop(1, 'rgba(80,140,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const FLAME = {
  outerG: new THREE.ConeGeometry(0.55, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
  innerG: new THREE.ConeGeometry(0.3, 0.7, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.35),
  outerM: new THREE.MeshBasicMaterial({ color: 0x6fb8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
  innerM: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  outerR: new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
  glowM: new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
};
function addFlames(g, xs, z, y, red) {
  const out = [];
  for (const x of xs) {
    const f = new THREE.Group();
    f.add(new THREE.Mesh(FLAME.outerG, red ? FLAME.outerR : FLAME.outerM), new THREE.Mesh(FLAME.innerG, FLAME.innerM));
    const glow = new THREE.Sprite(FLAME.glowM); glow.scale.setScalar(2.6); f.add(glow);
    f.position.set(x, y, z); g.add(f); out.push(f);
  }
  return out;
}

function makeJet(kind = 'player', opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(airframeGeo(kind), MAT);
  g.add(body);
  const ud = { msl: [], gear: null, flames: [], lights: [] };
  if (kind === 'bomber') {
    ud.flames = addFlames(g, [-6.5, -10.5, 6.5, 10.5], 6.2, 0.6, true);
    for (const f of ud.flames) f.scale.setScalar(1.6);
  } else if (opts.flames !== false) ud.flames = addFlames(g, [-0.78, 0.78], 8.7, -0.05, kind !== 'player');
  if (kind === 'player' || opts.full) {
    // missiles on pylons (up to 4 shown)
    const mslGeoL = new THREE.CylinderGeometry(0.17, 0.17, 3.4, 8).rotateX(Math.PI / 2);
    const mslMatL = new THREE.MeshPhongMaterial({ color: 0xe9ecef, shininess: 60 });
    const tipG = new THREE.ConeGeometry(0.17, 0.6, 8).rotateX(-Math.PI / 2);
    const finG = new THREE.BoxGeometry(0.8, 0.04, 0.4);
    const darkM = new THREE.MeshLambertMaterial({ color: 0x2a3038 });
    for (const [x, z] of [[4.1, 1.2], [-4.1, 1.2], [6.0, 2.6], [-6.0, 2.6]]) {
      const m = new THREE.Group();
      const b = new THREE.Mesh(mslGeoL, mslMatL), t = new THREE.Mesh(tipG, darkM); t.position.z = -2.0;
      const fn = new THREE.Mesh(finG, darkM); fn.position.z = 1.4;
      const fn2 = fn.clone(); fn2.rotation.z = Math.PI / 2;
      const py = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 1.2), darkM); py.position.y = 0.28;
      m.add(b, t, fn, fn2, py); m.position.set(x, -0.6, z); g.add(m); ud.msl.push(m);
    }
    // gear
    const gear = new THREE.Group(), dm = new THREE.MeshLambertMaterial({ color: 0x30353d });
    for (const [x, z] of [[0, -6.8], [1.9, 1.8], [-1.9, 1.8]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), dm); s.position.set(x, -1.5, z);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12).rotateZ(Math.PI / 2), dm); w.position.set(x, -2.15, z);
      gear.add(s, w);
    }
    g.add(gear); ud.gear = gear;
    // navigation lights
    const lg = new THREE.SphereGeometry(0.16, 8, 6);
    for (const [x, c] of [[8.15, 0x30ff60], [-8.15, 0xff3030]]) {
      const l = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: c })); l.position.set(x, -0.08, 3.2); g.add(l); ud.lights.push(l);
    }
    const strobe = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff })); strobe.position.set(0, 0.55, 7.4); g.add(strobe); ud.strobe = strobe;
  }
  g.userData = ud;
  return g;
}
// parked jets on apron
for (const [x, z] of scene.userData.apron) {
  const j = makeJet('player', { flames: false });
  j.position.set(x, 2.3, z); j.rotation.y = Math.PI; scene.add(j);
}

// ============================================================ effects
const fx = (() => {
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const pool = [];
  const add = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  function spawn(kind, pos, size, life, vel) {
    let p = null;
    for (const o of pool) if (!o.alive && o.kind === kind) { p = o; break; }
    if (!p) {
      let mat;
      if (kind === 'fire') mat = add(0xff9a3c);
      else if (kind === 'flash') mat = add(0xfff2c0);
      else if (kind === 'flare') mat = add(0xffe9a8);
      else if (kind === 'spark') mat = add(0xffd27a);
      else mat = new THREE.MeshLambertMaterial({ color: kind === 'trail' || kind === 'vapor' ? 0xf4f6f8 : 0x4a4a4a, transparent: true, depthWrite: false });
      p = { mesh: new THREE.Mesh(sphere, mat), kind, alive: false, vel: new V3() };
      scene.add(p.mesh); pool.push(p);
    }
    p.alive = true; p.t = 0; p.life = life; p.size = size; p.mesh.visible = true;
    p.mesh.position.copy(pos);
    if (vel) p.vel.copy(vel); else p.vel.set(0, 0, 0);
    p.mesh.scale.setScalar(size * 0.3);
    return p;
  }
  const tv = new V3(), tv2 = new V3();
  function explosion(pos, big = 1) {
    spawn('flash', pos, 26 * big, 0.28);
    for (let i = 0; i < 12; i++) {
      tv.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(50 * big);
      spawn('fire', tv2.copy(pos).addScaledVector(tv, 0.12), (7 + Math.random() * 8) * big, 0.6 + Math.random() * 0.6, tv);
    }
    for (let i = 0; i < 10; i++) {
      tv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((60 + Math.random() * 60) * big);
      spawn('spark', pos, 1.2 * big, 0.5 + Math.random() * 0.5, tv);
    }
    for (let i = 0; i < 8; i++) {
      tv.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(18 * big);
      spawn('smoke', pos, (5 + Math.random() * 6) * big, 2 + Math.random() * 1.5, tv);
    }
    audio.boom(pos, big);
    const d = pos.distanceTo(camera.position);
    if (d < 500) G.shake = Math.max(G.shake, (1 - d / 500) * 1.2 * big);
  }
  function update(dt) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.alive = false; p.mesh.visible = false; continue; }
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.kind === 'smoke') { p.vel.multiplyScalar(0.97); p.vel.y += 4 * dt; }
      else if (p.kind === 'flare') p.vel.y -= 25 * dt;
      else if (p.kind === 'spark') { p.vel.y -= 30 * dt; p.vel.multiplyScalar(0.98); }
      let grow, op;
      switch (p.kind) {
        case 'trail': grow = 0.4 + k * 1.6; op = 0.45 * (1 - k); break;
        case 'vapor': grow = 0.5 + k * 1.2; op = 0.5 * (1 - k); break;
        case 'flare': grow = 1; op = 1 - k; break;
        case 'spark': grow = 1 - k * 0.5; op = 1 - k; break;
        case 'smoke': grow = 0.3 + Math.sqrt(k) * 0.9; op = 0.42 * (1 - k); break;
        default: grow = 0.3 + Math.sqrt(k) * 0.9; op = 1 - k;
      }
      p.mesh.scale.setScalar(p.size * grow);
      p.mesh.material.opacity = op;
    }
  }
  return { spawn, explosion, update };
})();

// ============================================================ audio (SFX + procedural BGM)
const audio = (() => {
  let ctx = null, master, sfxBus, musicBus, verbSend, noiseBuf;
  const eng = {};
  let lockOsc = null, lockGain = null;
  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    master = ctx.createGain(); master.gain.value = 0.95;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = settings.music ? 0.32 : 0; musicBus.connect(master);
    const verb = ctx.createConvolver(); verb.buffer = impulse(2.4, 2.6);
    verbSend = ctx.createGain(); verbSend.gain.value = 0.45; verbSend.connect(verb); verb.connect(master);
    // ---- engine layers
    const src = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random()); return s; };
    eng.out = ctx.createGain(); eng.out.gain.value = 0; eng.out.connect(sfxBus);
    eng.rumbleF = ctx.createBiquadFilter(); eng.rumbleF.type = 'lowpass'; eng.rumbleF.frequency.value = 160;
    eng.rumbleG = ctx.createGain(); eng.rumbleG.gain.value = 0.9;
    src().connect(eng.rumbleF); eng.rumbleF.connect(eng.rumbleG); eng.rumbleG.connect(eng.out);
    eng.o1 = ctx.createOscillator(); eng.o1.type = 'sawtooth';
    eng.o2 = ctx.createOscillator(); eng.o2.type = 'sawtooth'; eng.o2.detune.value = 18;
    eng.bodyF = ctx.createBiquadFilter(); eng.bodyF.type = 'lowpass'; eng.bodyF.frequency.value = 300; eng.bodyF.Q.value = 2;
    eng.bodyG = ctx.createGain(); eng.bodyG.gain.value = 0.18;
    eng.o1.connect(eng.bodyF); eng.o2.connect(eng.bodyF); eng.bodyF.connect(eng.bodyG); eng.bodyG.connect(eng.out);
    eng.o1.start(); eng.o2.start();
    eng.whineF = ctx.createBiquadFilter(); eng.whineF.type = 'bandpass'; eng.whineF.Q.value = 9; eng.whineF.frequency.value = 1800;
    eng.whineG = ctx.createGain(); eng.whineG.gain.value = 0.25;
    src().connect(eng.whineF); eng.whineF.connect(eng.whineG); eng.whineG.connect(eng.out);
    eng.burnF = ctx.createBiquadFilter(); eng.burnF.type = 'lowpass'; eng.burnF.frequency.value = 700;
    eng.burnG = ctx.createGain(); eng.burnG.gain.value = 0;
    src().connect(eng.burnF); eng.burnF.connect(eng.burnG); eng.burnG.connect(eng.out);
    // wind
    eng.windF = ctx.createBiquadFilter(); eng.windF.type = 'bandpass'; eng.windF.frequency.value = 600; eng.windF.Q.value = 0.7;
    eng.windG = ctx.createGain(); eng.windG.gain.value = 0;
    src().connect(eng.windF); eng.windF.connect(eng.windG); eng.windG.connect(sfxBus);
    // lock tone
    lockOsc = ctx.createOscillator(); lockOsc.type = 'square'; lockOsc.frequency.value = 900;
    const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 2200;
    lockGain = ctx.createGain(); lockGain.gain.value = 0;
    lockOsc.connect(lf); lf.connect(lockGain); lockGain.connect(sfxBus); lockOsc.start();
    music.start();
  }
  const on = () => ctx && settings.sound;
  const T = () => ctx.currentTime;
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function noise(t, dur, type, f0, f1, vol, q = 1, verb = 0, bus) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain(); env(g, t, 0.004, vol, dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus); if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(verbSend); }
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
  }
  function osc(t, type, f0, f1, dur, vol, verb = 0, bus) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.003, vol, dur);
    o.connect(g); g.connect(bus || sfxBus); if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(verbSend); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  const distVol = pos => pos ? 1 / (1 + pos.distanceTo(camera.position) / 250) : 1;
  let lastFlyby = 0;
  return {
    init,
    get ctx() { return ctx; },
    get musicBus() { return musicBus; },
    get verbSend() { return verbSend; },
    setMusic(onv) { if (musicBus) musicBus.gain.setTargetAtTime(onv ? 0.32 : 0, T(), 0.3); },
    engine(th, speed, active) {
      if (!ctx) return;
      const t = T(), k = 0.12, a = on() && active;
      eng.out.gain.setTargetAtTime(a ? 0.55 : 0, t, 0.2);
      eng.rumbleG.gain.setTargetAtTime(0.5 + th * 0.9, t, k);
      eng.rumbleF.frequency.setTargetAtTime(110 + th * 160, t, k);
      eng.o1.frequency.setTargetAtTime(38 + th * 46, t, 0.25); eng.o2.frequency.setTargetAtTime(38.5 + th * 46.5, t, 0.25);
      eng.bodyF.frequency.setTargetAtTime(180 + th * 520, t, k);
      eng.whineF.frequency.setTargetAtTime(1200 + th * 2600, t, 0.3);
      eng.whineG.gain.setTargetAtTime(0.06 + th * 0.18, t, k);
      eng.burnG.gain.setTargetAtTime(th > 0.85 ? (th - 0.85) / 0.15 * 1.1 : 0, t, 0.2);
      eng.windG.gain.setTargetAtTime(a ? clamp(speed / 260, 0, 1) * 0.22 : 0, t, 0.3);
      eng.windF.frequency.setTargetAtTime(300 + speed * 3, t, 0.3);
    },
    gun(pos) {
      if (!on()) return; const t = T(), v = distVol(pos);
      noise(t, 0.06, 'bandpass', 2600, 900, 0.5 * v, 1.2, 0.15);
      osc(t, 'sine', 160, 45, 0.09, 0.55 * v);
      noise(t, 0.12, 'lowpass', 900, 200, 0.35 * v, 0.7);
    },
    enemyGun(pos) {
      if (!on()) return; const t = T(), v = distVol(pos) * 0.7;
      if (v < 0.04) return;
      noise(t, 0.05, 'bandpass', 1900, 700, 0.35 * v, 1.5, 0.3);
    },
    missile(pos) {
      if (!on()) return; const t = T(), v = distVol(pos);
      osc(t, 'sine', 120, 40, 0.25, 0.6 * v);
      noise(t, 0.35, 'bandpass', 500, 2800, 0.6 * v, 2, 0.3);
      noise(t + 0.2, 1.6, 'bandpass', 2400, 900, 0.3 * v, 1.2, 0.4);
    },
    boom(pos, big = 1) {
      if (!on()) return; const t = T(), v = Math.min(1.2, distVol(pos) * 1.4) * Math.min(big, 1.5);
      osc(t, 'sine', 95, 26, 1.3 * big, 0.9 * v, 0.2);
      noise(t, 1.8 * big, 'lowpass', 2200, 140, 0.9 * v, 0.8, 0.6);
      noise(t, 0.25, 'highpass', 3000, 3000, 0.4 * v, 0.7, 0.3);
      for (let i = 0; i < 6; i++) noise(t + 0.08 + Math.random() * 0.7, 0.05, 'highpass', 2500, 2500, 0.25 * v * Math.random(), 0.7, 0.4);
    },
    hit() { if (!on()) return; const t = T(); osc(t, 'square', 210, 90, 0.12, 0.25); noise(t, 0.15, 'highpass', 1800, 800, 0.45, 1); },
    hitConfirm() { if (!on()) return; noise(T(), 0.05, 'bandpass', 4200, 4200, 0.18, 3); },
    flare() { if (!on()) return; const t = T(); for (let i = 0; i < 3; i++) noise(t + i * 0.07, 0.18, 'bandpass', 3500, 1200, 0.35, 1.5, 0.2); },
    warn() { if (!on()) return; const t = T(); osc(t, 'square', 1150, 1150, 0.09, 0.14); osc(t + 0.11, 'square', 860, 860, 0.09, 0.14); },
    kill(n) { if (!on()) return; const t = T(), base = 660 + Math.min(n, 4) * 60; osc(t, 'triangle', base, base, 0.12, 0.2); osc(t + 0.09, 'triangle', base * 1.5, base * 1.5, 0.22, 0.2, 0.3); },
    alarm() { if (!on()) return; const t = T(); for (let i = 0; i < 3; i++) osc(t + i * 0.18, 'sawtooth', 520, 520, 0.14, 0.12); },
    flyby(pos) {
      if (!on() || T() - lastFlyby < 1.2) return; lastFlyby = T();
      const v = distVol(pos);
      noise(T(), 1.1, 'bandpass', 2400, 260, 0.9 * v, 1.4, 0.3);
    },
    lockTone(state) {
      if (!ctx) return; const t = T();
      if (!on() || state === 0) { lockGain.gain.setTargetAtTime(0, t, 0.02); return; }
      if (state === 1) { lockOsc.frequency.setTargetAtTime(880, t, 0.01); lockGain.gain.setValueAtTime((t * 8 % 1) < 0.5 ? 0.05 : 0, t); }
      else { lockOsc.frequency.setTargetAtTime(1480, t, 0.01); lockGain.gain.setTargetAtTime(0.05, t, 0.01); }
    },
    ui() { if (!on()) return; osc(T(), 'triangle', 880, 1320, 0.07, 0.12); },
    noise, osc,
  };
})();

// ---- procedural cinematic soundtrack (enhanced orchestral/synth hybrid, D minor, 138 BPM)
const music = (() => {
  const BPM = 138, STEP = 60 / BPM / 4;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // extended chord progression with more harmonic variety (i - VI - III - VII - i - VI - iv - V)
  const PROG = [
    [38, 'm7'], [34, 'M7'], [41, 'M'], [36, 'M7'],
    [38, 'm7'], [34, 'M7'], [43, 'm'], [45, 'M'],
    [38, 'm'], [34, 'M9'], [41, 'M7'], [36, 'sus4'],
    [38, 'm9'], [34, 'M7'], [36, 'M'], [33, 'M7']
  ];
  // chord voicings for richer harmony
  const chordVoicing = (r, q) => {
    if (q === 'm') return [r, r + 3, r + 7];
    if (q === 'M') return [r, r + 4, r + 7];
    if (q === 'm7') return [r, r + 3, r + 7, r + 10];
    if (q === 'M7') return [r, r + 4, r + 7, r + 11];
    if (q === 'm9') return [r, r + 3, r + 7, r + 10, r + 14];
    if (q === 'M9') return [r, r + 4, r + 7, r + 11, r + 14];
    if (q === 'sus4') return [r, r + 5, r + 7];
    return [r, r + 4, r + 7];
  };
  // cinematic lead motifs with more variation
  const MOTIFS = [
    [0, -1, 2, 1, 0, 4, -1, 3], [2, 4, 1, 0, 1, -1, 2, 4],
    [4, 3, 2, 5, 1, 2, 0, -1], [0, 1, 2, 4, 5, 3, 2, 1],
    [3, -1, 4, 2, 1, 0, -1, 2], [5, 4, 3, 2, 1, -1, 0, 2],
    [0, 2, 4, 6, 4, 2, 0, -1], [1, 3, 5, 4, 2, 0, -1, 1]
  ];
  // counter-melody patterns
  const COUNTER = [
    [4, -1, 3, -1, 2, -1, 1, -1], [-1, 2, -1, 3, -1, 4, -1, 5],
    [2, 3, 4, -1, 3, 2, 1, -1], [-1, 4, 3, 2, -1, 1, 2, 3]
  ];
  let step = 0, nextT = 0, timer = null, intensity = 0, target = 0, delay = null, reverb = null, chorus = null;
  function ctxOk() { return audio.ctx && audio.musicBus; }

  // enhanced voice with vibrato and filter sweep
  function voice(t, type, freq, dur, vol, cutoff, out, vibrato = false) {
    const ctx = audio.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (vibrato) {
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      lfo.frequency.value = 5.2; lfoG.gain.value = freq * 0.012;
      lfo.connect(lfoG); lfoG.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    f.type = 'lowpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.25), t + dur * 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol * 0.85, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(out || audio.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // lush orchestral-style pad with multiple detuned layers
  function pad(t, notes, dur, vol) {
    const ctx = audio.ctx;
    const detunes = [-14, -7, 0, 7, 14]; // 5 layer unison
    for (const n of notes) {
      for (const det of detunes) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n + 24);
        o.detune.value = det + (Math.random() - 0.5) * 4; // slight random detune for warmth
        f.type = 'lowpass'; f.frequency.value = 1200; f.Q.value = 0.7;
        const v = vol / detunes.length;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + dur * 0.25);
        g.gain.setValueAtTime(v * 0.9, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(reverb || audio.musicBus);
        o.start(t); o.stop(t + dur + 0.1);
      }
      // sub-octave sine layer for warmth
      const sub = ctx.createOscillator(), subG = ctx.createGain();
      sub.type = 'sine'; sub.frequency.value = mtof(n + 12);
      subG.gain.setValueAtTime(0.0001, t);
      subG.gain.linearRampToValueAtTime(vol * 0.15, t + dur * 0.3);
      subG.gain.linearRampToValueAtTime(0.0001, t + dur);
      sub.connect(subG); subG.connect(audio.musicBus);
      sub.start(t); sub.stop(t + dur + 0.1);
    }
  }

  // string-like sustained layer
  function strings(t, notes, dur, vol) {
    const ctx = audio.ctx;
    for (const n of notes) {
      for (const oct of [0, 12]) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = mtof(n + 36 + oct); o.detune.value = (Math.random() - 0.5) * 8;
        f.type = 'lowpass'; f.frequency.value = 2200; f.Q.value = 0.5;
        const v = vol * (oct === 0 ? 0.6 : 0.4);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + dur * 0.4);
        g.gain.setValueAtTime(v * 0.8, t + dur * 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(reverb || audio.musicBus);
        o.start(t); o.stop(t + dur + 0.1);
      }
    }
  }

  // punchy kick with layered sub
  function kick(t, v) {
    const ctx = audio.ctx;
    // main kick body
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.15);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g); g.connect(audio.musicBus);
    o.start(t); o.stop(t + 0.35);
    // click layer for attack
    audio.noise(t, 0.02, 'bandpass', 4500, 2000, v * 0.4, 2, 0, audio.musicBus);
    // sub layer
    const sub = ctx.createOscillator(), subG = ctx.createGain();
    sub.type = 'sine'; sub.frequency.value = 50;
    subG.gain.setValueAtTime(v * 0.6, t);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    sub.connect(subG); subG.connect(audio.musicBus);
    sub.start(t); sub.stop(t + 0.3);
  }

  // layered snare with more body
  function snare(t, v) {
    audio.noise(t, 0.18, 'highpass', 1600, 800, v * 0.9, 0.9, 0.3, audio.musicBus);
    audio.noise(t, 0.08, 'bandpass', 800, 400, v * 0.5, 1.2, 0.15, audio.musicBus);
    audio.osc(t, 'triangle', 240, 140, 0.09, v * 0.7, 0, audio.musicBus);
    audio.osc(t, 'sine', 180, 100, 0.06, v * 0.4, 0, audio.musicBus);
  }

  // varied hi-hat patterns
  function hat(t, v, open) {
    audio.noise(t, open ? 0.14 : 0.03, 'highpass', open ? 7000 : 9000, open ? 7000 : 9000, v, 0.8, 0.1, audio.musicBus);
  }

  // ride cymbal for variation
  function ride(t, v) {
    audio.noise(t, 0.25, 'bandpass', 6000, 6000, v * 0.5, 1.5, 0.35, audio.musicBus);
    audio.osc(t, 'sine', 420, 420, 0.15, v * 0.2, 0.2, audio.musicBus);
  }

  // bass with movement
  function bass(t, note, dur, vol) {
    const ctx = audio.ctx;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    const freq = mtof(note);
    o.type = 'sawtooth'; o.frequency.value = freq;
    o2.type = 'square'; o2.frequency.value = freq; o2.detune.value = -1200; // sub octave
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(350, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol * 0.7, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(audio.musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function schedule(s, t) {
    const bar = Math.floor(s / 16) % PROG.length, st = s % 16;
    const [root, q] = PROG[bar], ch = chordVoicing(root, q);
    const I = intensity;
    const section = Math.floor(bar / 4) % 4; // 4 sections for variety

    // ambient pad always present
    if (st === 0) {
      pad(t, ch.slice(0, 3), STEP * 16, I === 0 ? 0.035 : 0.022);
      if (I >= 1 && section % 2 === 0) strings(t, ch.slice(0, 2), STEP * 16, 0.018);
    }

    // evolving arpeggio with octave variations
    const arpPattern = section % 2 === 0 ? [0, 1, 2, 1] : [0, 2, 1, 2];
    if (I === 0 ? st % 2 === 0 : true) {
      const octShift = (st >= 8 && I > 0) ? 12 : (st >= 12 ? 24 : 0);
      const noteIdx = arpPattern[st % 4] % ch.length;
      const n = ch[noteIdx] + 36 + octShift;
      const cutoff = I === 0 ? 2000 : 2800 + Math.sin(s * 0.1) * 400;
      voice(t, 'square', mtof(n), STEP * 1.5, I === 0 ? 0.032 : 0.025, cutoff, delay);
      // subtle octave double
      if (I >= 2 && st % 4 === 0) {
        voice(t, 'triangle', mtof(n + 12), STEP * 2, 0.015, 3500, reverb);
      }
    }

    // bass line with more movement
    if (I >= 1) {
      const bassPattern = section === 0 ? [0, 0, 12, 0, 0, 12, 0, 7] :
                          section === 1 ? [0, 7, 0, 12, 7, 0, 12, 0] :
                          section === 2 ? [0, 0, 5, 7, 0, 12, 7, 5] :
                                          [0, 12, 7, 5, 0, 7, 12, 0];
      if (st % 2 === 0) {
        const bassNote = root + bassPattern[(st / 2) | 0];
        bass(t, bassNote, STEP * 1.7, 0.14);
      }
    }

    // enhanced drum patterns
    if (I >= 1) {
      // kick patterns vary by section
      const kickPattern = section % 2 === 0 ? [0, 6, 10, 14] : [0, 3, 6, 10, 12];
      if (kickPattern.includes(st)) kick(t, 0.7);

      // hi-hats with groove
      if (st % 2 === 1) hat(t, 0.08, st % 8 === 7);
      if (I >= 2 && st % 4 === 2) hat(t, 0.04, false);
    } else if (st === 0 || st === 10) kick(t, 0.32);

    if (I >= 2) {
      // snare with variations
      if (st === 4 || st === 12) snare(t, 0.38);
      if (st === 14 && bar % 2 === 1) snare(t, 0.22);
      if (section === 3 && st === 10) snare(t, 0.18); // fill variation

      // ride cymbal accents
      if (section >= 2 && st % 8 === 0) ride(t, 0.12);

      // cinematic lead melody
      if (st % 2 === 0) {
        const motifIdx = (bar + section) % MOTIFS.length;
        const m = MOTIFS[motifIdx][(st / 2) | 0];
        if (m >= 0) {
          const scale = [0, 2, 3, 5, 7, 8, 10, 12]; // extended scale
          const base = ch[0] + 48;
          const n = base + scale[m % scale.length] + (q.includes('M') && m === 2 ? 1 : 0);
          voice(t, 'sawtooth', mtof(n), STEP * 1.8, 0.065, 3600, delay, true);
          // harmony layer
          if (m > 0 && section >= 1) {
            voice(t, 'triangle', mtof(n - 5), STEP * 1.4, 0.03, 2800, reverb);
          }
        }
      }

      // counter-melody in certain sections
      if (section >= 2 && st % 2 === 1) {
        const cm = COUNTER[bar % COUNTER.length][((st - 1) / 2) | 0];
        if (cm >= 0) {
          const scale = [0, 2, 3, 5, 7, 8, 10];
          const n = ch[0] + 60 + scale[cm % 7];
          voice(t, 'sine', mtof(n), STEP * 1.2, 0.025, 4000, reverb, true);
        }
      }
    }
  }

  function tick() {
    if (!ctxOk()) return;
    const ctx = audio.ctx;
    if (ctx.state !== 'running') return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.15) {
      if (step % 16 === 0) intensity = target;
      schedule(step, nextT);
      nextT += STEP; step++;
    }
  }

  return {
    start() {
      if (timer) return;
      const ctx = audio.ctx;

      // stereo ping-pong delay
      delay = ctx.createDelay(1); delay.delayTime.value = STEP * 3;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      const wet = ctx.createGain(); wet.gain.value = 0.45;
      const dry = ctx.createGain(); dry.gain.value = 1;
      const inp = ctx.createGain();
      inp.connect(dry); dry.connect(audio.musicBus);
      inp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(audio.musicBus);
      delay = inp;

      // reverb send for lush ambience
      reverb = ctx.createGain(); reverb.gain.value = 0.7;
      reverb.connect(audio.verbSend || audio.musicBus);

      timer = setInterval(tick, 25);
    },
    set(level) { target = level; },
    get level() { return target; },
  };
})();

// ============================================================ game state
// wave: f = fighters, a = aces, b = bombers
const MISSIONS = [
  { name: '작전 1 · 초계 비행', desc: '적 편대 요격 · 3단계', skill: 0.55, stages: [
    [{ f: 3 }, { f: 4 }],
    [{ f: 4 }, { f: 3, a: 1 }, { f: 5 }],
    [{ f: 5 }, { f: 3, b: 2 }, { f: 4, a: 2 }] ] },
  { name: '작전 2 · 공중 우세', desc: '대규모 공중전 · 3단계', skill: 0.75, stages: [
    [{ f: 5 }, { f: 4, a: 1 }, { f: 6 }],
    [{ f: 4, b: 2 }, { f: 6, a: 1 }, { f: 5, a: 2 }],
    [{ f: 6, a: 1 }, { a: 3, f: 3 }, { b: 3, f: 5 }, { a: 2, f: 6 }] ] },
  { name: '작전 3 · 정예 요격', desc: '에이스 편대 격멸 · 4단계', skill: 1.0, stages: [
    [{ f: 6 }, { f: 5, a: 2 }],
    [{ a: 3, f: 4 }, { b: 3, f: 6 }, { f: 8 }],
    [{ a: 4, f: 4 }, { f: 7, a: 2 }, { b: 4, f: 4, a: 1 }],
    [{ a: 5 }, { f: 8, a: 2 }, { a: 4, b: 2, f: 4 }] ] },
  { name: '서바이벌', desc: '끝없는 적 웨이브 · 최고 기록 도전', skill: 0.7, survival: true, stages: [[]] },
];
const ETYPES = {
  fighter: { hp: 55, speed: [185, 215], turn: 0.62, mslGap: [18, 28], acc: 1, score: 100, label: '전투기' },
  ace: { hp: 110, speed: [215, 240], turn: 0.95, mslGap: [9, 14], acc: 1.6, score: 250, label: '에이스' },
  bomber: { hp: 420, speed: [135, 150], turn: 0.22, mslGap: [999, 999], acc: 0.8, score: 300, label: '폭격기' },
};
const LOADOUT = { gun: Infinity, msl: Infinity, flares: Infinity };
const player = {
  obj: makeJet('player'),
  pos: new V3(), quat: new Q(), vel: new V3(), speed: 0, throttle: 0,
  hp: 100, alive: true, onGround: true, gPitch: 0, gearDown: true,
  gun: LOADOUT.gun, msl: LOADOUT.msl, flares: LOADOUT.flares, gunCool: 0, mslCool: 0, flareCool: 0, vaporT: 0,
};
scene.add(player.obj);

const G = {
  state: 'menu', mission: null, missionIdx: 0, stage: 0, wave: 0, waveDelay: 0, enemyTotalStage: 0,
  enemies: [], bullets: [], missiles: [], flares: [], waypoint: new V3(), wpActive: false, engaged: false,
  score: 0, time: 0, kills: 0, target: null, lockT: 0, locked: false, camMode: 0,
  stick: { x: 0, y: 0 }, keys: {}, firing: false, toastT: 0, deadT: 0, endT: 0, warnT: 0, outT: 0,
  stageClearT: 0, lockBeepT: 0, shake: 0, hitMark: 0, combo: 0, comboT: 0, survWave: 0,
};
function fwd(q, out = new V3()) { return out.set(0, 0, -1).applyQuaternion(q); }
function upv(q, out = new V3()) { return out.set(0, 1, 0).applyQuaternion(q); }
function rightv(q, out = new V3()) { return out.set(1, 0, 0).applyQuaternion(q); }

// ============================================================ enemies
const eTmp = { f: new V3(), to: new V3(), aim: new V3(), d: new V3(), q: new Q(), m: new THREE.Matrix4() };
class Enemy {
  constructor(type, pos, heading, skill) {
    const T = ETYPES[type];
    this.type = type; this.T = T;
    this.obj = makeJet(type);
    if (type === 'ace') this.obj.scale.setScalar(1.08);
    scene.add(this.obj);
    this.pos = pos.clone(); this.base = new Q(); this.bank = 0;
    this.speed = T.speed[0] + Math.random() * (T.speed[1] - T.speed[0]);
    this.hp = T.hp; this.maxHp = T.hp; this.alive = true; this.skill = skill;
    this.fireT = 0; this.mslT = (6 + Math.random() * 10) / skill;
    this.role = 'approach'; this.roleT = 4 + Math.random() * 4;
    this.orbitA = Math.random() * Math.PI * 2; this.orbitR = 1100 + Math.random() * 700; this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.jink = new V3(); this.jinkT = 0; this.smokeT = 0; this.flybyDone = false;
    _m1.lookAt(this.pos, _v1.copy(this.pos).add(heading), AY); this.base.setFromRotationMatrix(_m1);
    this.vel = new V3();
    if (type === 'bomber') { this.route = new V3(RUNWAY.x + (Math.random() - 0.5) * 600, 0, -700 + (Math.random() - 0.5) * 600); this.gunnerT = 0; }
  }
  update(dt) {
    const { f, to, aim } = eTmp;
    fwd(this.base, f);
    to.copy(player.pos).sub(this.pos);
    const dist = to.length();
    this.roleT -= dt;
    this.jinkT -= dt;
    if (this.jinkT <= 0) { this.jinkT = 1.2 + Math.random() * 2; this.jink.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.35, Math.random() - 0.5).multiplyScalar(420 * (1.25 - this.skill * 0.5)); }
    let turn = this.T.turn * (0.75 + this.skill * 0.45), tSpeed = this.T.speed[0] + 10;
    if (this.type === 'bomber') {
      // fly toward the airbase, loop around it
      aim.copy(this.route); aim.y = 900;
      if (Math.hypot(this.pos.x - this.route.x, this.pos.z - this.route.z) < 400) this.route.set((Math.random() - 0.5) * 4000, 0, -700 + (Math.random() - 0.5) * 4000);
    } else {
      if (this.role === 'attack') {
        aim.copy(player.pos).addScaledVector(player.vel, clamp(dist / 900, 0, 1.2)).add(this.jink);
        if (dist < 200) { this.role = 'extend'; this.roleT = 2.5 + Math.random() * 2; }
        else if (this.roleT <= 0) this.role = 'orbit', this.roleT = 6 + Math.random() * 6;
        tSpeed = this.T.speed[1];
      } else if (this.role === 'extend') {
        aim.copy(this.pos).addScaledVector(f, 700).add(this.jink);
        tSpeed = this.T.speed[1] + 30;
        if (this.roleT <= 0) this.role = 'orbit', this.roleT = 3 + Math.random() * 4;
      } else { // orbit / approach: circle the player at range, waiting for an attack slot
        this.orbitA += this.orbitDir * dt * 0.12;
        aim.set(Math.cos(this.orbitA) * this.orbitR, 0, Math.sin(this.orbitA) * this.orbitR).add(player.pos);
        aim.y = player.pos.y + 120 * Math.sin(this.orbitA * 3);
        if (this.role === 'approach' && this.roleT <= 0) this.role = 'orbit';
      }
    }
    const gh = groundAt(this.pos.x, this.pos.z);
    if (this.pos.y < gh + 170) aim.y = Math.max(aim.y, this.pos.y + 420);
    const ag = groundAt(aim.x, aim.z) + 140; if (aim.y < ag) aim.y = ag;
    eTmp.m.lookAt(this.pos, aim, AY);
    eTmp.q.setFromRotationMatrix(eTmp.m);
    const desired = fwd(eTmp.q, eTmp.d);
    const yawTurn = f.x * desired.z - f.z * desired.x;
    this.base.rotateTowards(eTmp.q, turn * dt);
    const maxBank = this.type === 'bomber' ? 0.5 : 1.3;
    this.bank = lerp(this.bank, clamp(-yawTurn * 3.5, -maxBank, maxBank), clamp(dt * 3, 0, 1));
    this.obj.quaternion.copy(this.base).multiply(_q1.setFromAxisAngle(AZ, this.bank));
    this.speed = lerp(this.speed, tSpeed, dt * 0.5);
    this.vel.copy(fwd(this.base, f)).multiplyScalar(this.speed);
    this.pos.addScaledVector(this.vel, dt);
    this.obj.position.copy(this.pos);
    for (const fl of this.obj.userData.flames) fl.scale.z = (this.type === 'bomber' ? 1.6 : 1) * (3 + Math.random() * 0.8);
    // flyby whoosh
    if (dist < 140 && !this.flybyDone) { this.flybyDone = true; audio.flyby(this.pos); } else if (dist > 400) this.flybyDone = false;
    if (player.alive && G.state === 'play') this.weapons(dt, dist);
    if (this.hp < this.maxHp * 0.45) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.05; fx.spawn('smoke', this.pos, this.type === 'bomber' ? 6 : 3, 1.2); if (Math.random() < 0.3) fx.spawn('fire', this.pos, 2.5, 0.3); } }
    if (this.pos.y < groundAt(this.pos.x, this.pos.z) + 4) this.kill(false);
  }
  weapons(dt, dist) {
    const fw = fwd(this.base, eTmp.f);
    const toPn = eTmp.to.copy(player.pos).sub(this.pos).normalize();
    this.fireT -= dt;
    if (this.type === 'bomber') {
      // tail/side gunner: fires at player within 650m in any direction except front
      this.gunnerT -= dt;
      if (dist < 650 && this.gunnerT <= 0) {
        this.gunnerT = 0.12;
        const lead = eTmp.aim.copy(player.pos).addScaledVector(player.vel, dist / 820).sub(this.pos).normalize();
        lead.x += (Math.random() - 0.5) * 0.06; lead.y += (Math.random() - 0.5) * 0.06; lead.z += (Math.random() - 0.5) * 0.06;
        spawnBullet(eTmp.d.copy(this.pos).addScaledVector(lead, 12), lead.normalize(), this.vel, 'enemy');
      }
      return;
    }
    const ang = Math.acos(clamp(fw.dot(toPn), -1, 1));
    if (ang < 0.14 && dist < 950 && this.fireT <= 0) {
      this.fireT = 0.085;
      const lead = eTmp.aim.copy(player.pos).addScaledVector(player.vel, dist / 900).sub(this.pos).normalize();
      const spread = 0.04 / (this.skill * this.T.acc);
      lead.x += (Math.random() - 0.5) * spread; lead.y += (Math.random() - 0.5) * spread; lead.z += (Math.random() - 0.5) * spread;
      spawnBullet(eTmp.d.copy(this.pos).addScaledVector(fw, 10), lead.normalize(), this.vel, 'enemy');
      if (Math.random() < 0.5) audio.enemyGun(this.pos);
    }
    this.mslT -= dt;
    if (this.mslT <= 0 && dist < 2600 && dist > 450 && ang < 0.6) {
      const incoming = G.missiles.filter(m => m.owner === 'enemy' && m.target === player).length;
      if (incoming < 2) {
        this.mslT = (this.T.mslGap[0] + Math.random() * (this.T.mslGap[1] - this.T.mslGap[0])) / this.skill;
        spawnMissile(eTmp.d.copy(this.pos).addScaledVector(fw, 4).add(_v3.set(0, -1, 0)), this.base, this.vel, 'enemy', player);
      } else this.mslT = 3;
    }
  }
  damage(d) {
    if (!this.alive) return;
    this.hp -= d;
    if (this.hp <= 0) this.kill(true);
  }
  kill(byPlayer) {
    if (!this.alive) return;
    this.alive = false; scene.remove(this.obj);
    fx.explosion(this.pos, this.type === 'bomber' ? 2.2 : 1.2);
    // falling debris
    for (let i = 0; i < 4; i++) fx.spawn('fire', this.pos, 3, 1.4, _v1.copy(this.vel).multiplyScalar(0.3).add(_v2.set((Math.random() - 0.5) * 40, -20 - Math.random() * 30, (Math.random() - 0.5) * 40)));
    if (byPlayer !== false) {
      G.kills++;
      G.combo = G.comboT > 0 ? G.combo + 1 : 1; G.comboT = 4;
      const bonus = (G.combo - 1) * 50;
      G.score += this.T.score + bonus;
      const names = ['', '', '더블 킬!', '트리플 킬!', '쿼드라 킬!', '에이스 연속 격추!'];
      toast(G.combo >= 2 ? `${names[Math.min(G.combo, 5)]} +${this.T.score + bonus}` : `${this.T.label} 격추 +${this.T.score}`, 1.2);
      audio.kill(G.combo);
    }
    if (G.target === this) { G.target = null; G.lockT = 0; G.locked = false; }
  }
}
function updateSquad() {
  // limit simultaneous attackers so a big swarm stays fair
  const fighters = G.enemies.filter(e => e.alive && e.type !== 'bomber');
  const maxAtk = 2 + Math.round(G.mission.skill * 2) + (G.mission.survival ? Math.min(3, Math.floor(G.survWave / 3)) : 0);
  let atk = fighters.filter(e => e.role === 'attack').length;
  if (atk < maxAtk) {
    const cands = fighters.filter(e => e.role === 'orbit' || e.role === 'approach').sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos));
    for (const e of cands) { if (atk >= maxAtk) break; e.role = 'attack'; e.roleT = 12 + Math.random() * 10 + (e.type === 'ace' ? 10 : 0); atk++; }
  }
}

// ============================================================ projectiles
const bulletGeo = new THREE.BoxGeometry(0.25, 0.25, 8);
const bulletMatP = new THREE.MeshBasicMaterial({ color: 0xfff1a0 });
const bulletMatE = new THREE.MeshBasicMaterial({ color: 0xff6a4c });
const bTmp = { a: new V3(), b: new V3(), c: new V3() };
function spawnBullet(pos, dir, baseVel, owner) {
  let b = null;
  for (const o of G.bullets) if (!o.alive) { b = o; break; }
  if (!b) { b = { mesh: new THREE.Mesh(bulletGeo, bulletMatP), vel: new V3(), prev: new V3(), alive: false }; scene.add(b.mesh); G.bullets.push(b); }
  b.alive = true; b.owner = owner; b.t = 0; b.mesh.visible = true;
  b.mesh.material = owner === 'player' ? bulletMatP : bulletMatE;
  b.mesh.position.copy(pos); b.prev.copy(pos);
  b.vel.copy(dir).multiplyScalar(owner === 'player' ? 1050 : 820).add(baseVel);
  b.mesh.quaternion.setFromUnitVectors(bTmp.a.set(0, 0, -1), bTmp.b.copy(b.vel).normalize());
}
function segSphere(a, b, c, r) {
  const ab = bTmp.a.copy(b).sub(a), ac = bTmp.b.copy(c).sub(a);
  const t = clamp(ac.dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
  return bTmp.c.copy(a).addScaledVector(ab, t).distanceToSquared(c) < r * r;
}
function updateBullets(dt) {
  for (const b of G.bullets) {
    if (!b.alive) continue;
    b.t += dt; b.prev.copy(b.mesh.position);
    b.mesh.position.addScaledVector(b.vel, dt);
    const p = b.mesh.position;
    if (b.t > 1.6 || p.y < groundAt(p.x, p.z)) { b.alive = false; b.mesh.visible = false; continue; }
    if (b.owner === 'player') {
      for (const e of G.enemies) {
        if (e.alive && segSphere(b.prev, p, e.pos, e.type === 'bomber' ? 24 : 11)) {
          e.damage(7); b.alive = false; b.mesh.visible = false;
          fx.spawn('spark', p, 1.5, 0.25, _v1.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30));
          G.hitMark = 0.12; audio.hitConfirm(); break;
        }
      }
    } else if (player.alive && segSphere(b.prev, p, player.pos, 8)) {
      b.alive = false; b.mesh.visible = false; hurtPlayer(2.2); fx.spawn('flash', p, 2.5, 0.12);
    }
  }
}
const mslGeo = new THREE.CylinderGeometry(0.3, 0.3, 3.8, 8).rotateX(Math.PI / 2);
const mslMat = new THREE.MeshPhongMaterial({ color: 0xe0e4e8, shininess: 60 });
const mslMatE = new THREE.MeshPhongMaterial({ color: 0x8a3a30, shininess: 40 });

// Realistic missile parameters
const MSL_PARAMS = {
  player: {
    dropTime: 0.15,        // time before motor ignition (separation phase)
    ignitionDelay: 0.08,   // delay after drop before full thrust
    boostDuration: 2.8,    // main motor burn time
    sustainDuration: 4.0,  // sustainer motor time
    boostThrust: 420,      // acceleration during boost (m/s²)
    sustainThrust: 120,    // acceleration during sustain
    maxSpeed: 680,         // Mach 2+ equivalent
    coastDrag: 0.92,       // drag coefficient after motor burnout
    turnRate: 3.8,         // max turn rate (rad/s)
    leadFactor: 0.85,      // proportional navigation gain
    lifetime: 12,          // total missile lifetime
  },
  enemy: {
    dropTime: 0.12,
    ignitionDelay: 0.06,
    boostDuration: 2.2,
    sustainDuration: 3.0,
    boostThrust: 340,
    sustainThrust: 90,
    maxSpeed: 520,
    coastDrag: 0.94,
    turnRate: 1.8,
    leadFactor: 0.7,
    lifetime: 10,
  }
};

function spawnMissile(pos, quat, baseVel, owner, target) {
  const params = owner === 'player' ? MSL_PARAMS.player : MSL_PARAMS.enemy;
  const m = {
    mesh: new THREE.Mesh(mslGeo, owner === 'player' ? mslMat : mslMatE),
    pos: pos.clone(),
    quat: quat.clone(),
    vel: baseVel.clone(),
    speed: baseVel.length(),
    owner,
    target,
    t: 0,
    alive: true,
    trailT: 0,
    // realistic flight phases
    phase: 'drop',         // drop -> ignition -> boost -> sustain -> coast
    phaseT: 0,
    motorActive: false,
    params,
    // visual effects
    flameObj: null,
    smokeT: 0,
    lastLOS: new V3(),     // for proportional navigation
  };

  // flame effect (initially hidden during drop)
  const flameGroup = new THREE.Group();
  const outerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 1.8, 8).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const innerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 1.2, 6).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  outerFlame.position.z = 2.8; innerFlame.position.z = 2.5;
  flameGroup.add(outerFlame, innerFlame);
  const glow = new THREE.Sprite(FLAME.glowM); glow.scale.setScalar(4); glow.position.z = 3.2;
  flameGroup.add(glow);
  flameGroup.visible = false; // hidden until ignition
  m.mesh.add(flameGroup);
  m.flameObj = flameGroup;

  scene.add(m.mesh); G.missiles.push(m);
  return m;
}

const mTmp = { tp: new V3(), f: new V3(), m: new THREE.Matrix4(), q: new Q(), los: new V3(), losRate: new V3() };

function updateMissiles(dt) {
  for (const m of G.missiles) {
    if (!m.alive) continue;
    m.t += dt;
    m.phaseT += dt;
    const p = m.params;

    // Phase state machine for realistic flight
    let thrust = 0;
    switch (m.phase) {
      case 'drop':
        // Missile separates from aircraft, falls slightly
        m.vel.y -= 15 * dt; // gravity during separation
        if (m.phaseT >= p.dropTime) {
          m.phase = 'ignition';
          m.phaseT = 0;
          audio.missile(m.pos); // ignition sound
        }
        break;

      case 'ignition':
        // Motor igniting, building thrust
        m.motorActive = true;
        m.flameObj.visible = true;
        thrust = p.boostThrust * (m.phaseT / p.ignitionDelay) * 0.5;
        m.vel.y -= 8 * dt; // still some gravity effect
        if (m.phaseT >= p.ignitionDelay) {
          m.phase = 'boost';
          m.phaseT = 0;
        }
        // small flame during ignition
        m.flameObj.children[0].scale.set(0.6, 0.6, 0.4 + m.phaseT / p.ignitionDelay * 0.6);
        break;

      case 'boost':
        // Full motor burn - maximum acceleration
        thrust = p.boostThrust;
        if (m.phaseT >= p.boostDuration) {
          m.phase = 'sustain';
          m.phaseT = 0;
        }
        // intense flame with flickering
        const boostFlicker = 0.9 + Math.random() * 0.2;
        m.flameObj.children[0].scale.set(boostFlicker, boostFlicker, 1.4 + Math.random() * 0.4);
        m.flameObj.children[1].scale.set(boostFlicker * 0.8, boostFlicker * 0.8, 1.2);
        m.flameObj.children[2].scale.setScalar(4 + Math.random() * 1.5);
        break;

      case 'sustain':
        // Sustainer motor - lower thrust
        thrust = p.sustainThrust;
        if (m.phaseT >= p.sustainDuration) {
          m.phase = 'coast';
          m.phaseT = 0;
          m.motorActive = false;
          m.flameObj.visible = false;
        }
        // smaller sustained flame
        const sustainFlicker = 0.85 + Math.random() * 0.15;
        m.flameObj.children[0].scale.set(sustainFlicker * 0.7, sustainFlicker * 0.7, 0.8 + Math.random() * 0.2);
        m.flameObj.children[1].scale.set(sustainFlicker * 0.5, sustainFlicker * 0.5, 0.6);
        m.flameObj.children[2].scale.setScalar(2.5 + Math.random() * 0.8);
        break;

      case 'coast':
        // Motor burned out - coasting on kinetic energy
        m.speed *= Math.pow(p.coastDrag, dt * 10); // aerodynamic drag
        m.vel.y -= 5 * dt; // gravity pulls it down
        break;
    }

    // Apply thrust and acceleration
    const f = fwd(m.quat, mTmp.f);
    if (thrust > 0) {
      m.speed = Math.min(p.maxSpeed, m.speed + thrust * dt);
    }

    // Guidance system (proportional navigation)
    const tgt = m.target;
    if (tgt && tgt.alive !== false && m.phase !== 'drop') {
      const tp = mTmp.tp.copy(tgt.pos);

      // Lead pursuit - predict target position
      if (tgt.vel) {
        const timeToTarget = m.pos.distanceTo(tgt.pos) / Math.max(m.speed, 100);
        const leadTime = timeToTarget * p.leadFactor;
        tp.addScaledVector(tgt.vel, leadTime);

        // Account for target acceleration (if turning)
        if (tgt.type !== 'bomber') {
          tp.y += tgt.vel.y * leadTime * 0.3;
        }
      }

      // Proportional navigation - turn proportional to line-of-sight rate
      const los = mTmp.los.copy(tp).sub(m.pos).normalize();

      // Calculate LOS rate (change in line of sight)
      if (m.lastLOS.lengthSq() > 0) {
        const losRate = mTmp.losRate.copy(los).sub(m.lastLOS).divideScalar(Math.max(dt, 0.001));
        // Navigation constant (typically 3-5 for missiles)
        const navGain = 4.0;
        const commandedTurn = losRate.multiplyScalar(navGain);

        // Apply turn command with rate limiting based on speed
        const speedFactor = clamp(m.speed / 300, 0.5, 1.5);
        const maxTurn = p.turnRate * speedFactor * dt;

        mTmp.m.lookAt(m.pos, tp, AY);
        mTmp.q.setFromRotationMatrix(mTmp.m);
        m.quat.rotateTowards(mTmp.q, maxTurn);
      }
      m.lastLOS.copy(los);

      // Hit detection with improved accuracy
      const dist = m.pos.distanceTo(tgt.pos);
      const hitR = tgt.isFlare ? 28 : tgt.type === 'bomber' ? 28 : 16;

      // Proximity fuze - detonate when closest approach
      const closing = m.vel.dot(mTmp.tp.copy(tgt.pos).sub(m.pos).normalize());
      if (dist < hitR || (dist < hitR * 2 && closing < 0 && m.phase !== 'drop')) {
        m.alive = false;
        fx.explosion(m.pos, 1.0);
        if (tgt === player) hurtPlayer(34);
        else if (tgt.damage) tgt.damage(tgt.type === 'bomber' ? 160 : 120);
        else if (tgt.isFlare) tgt.alive = false;
      }
    }

    // Update velocity and position
    const newF = fwd(m.quat, mTmp.f);
    m.vel.lerp(newF.multiplyScalar(m.speed), m.phase === 'drop' ? 0.1 : 0.3);
    m.pos.addScaledVector(m.vel, dt);
    m.mesh.position.copy(m.pos);
    m.mesh.quaternion.copy(m.quat);

    // Smoke/trail effects - more during motor burn
    m.trailT -= dt;
    m.smokeT -= dt;
    if (m.motorActive) {
      // Heavy smoke trail during motor burn
      if (m.trailT <= 0) {
        m.trailT = 0.02;
        fx.spawn('trail', mTmp.tp.copy(m.pos).addScaledVector(newF, 2), m.phase === 'boost' ? 3.5 : 2.5, 2.0);
      }
      if (m.smokeT <= 0) {
        m.smokeT = 0.04;
        fx.spawn('smoke', mTmp.tp.copy(m.pos).addScaledVector(newF, 2.5), m.phase === 'boost' ? 2.5 : 1.8, 1.5);
      }
    } else if (m.phase === 'coast') {
      // Light vapor trail when coasting
      if (m.trailT <= 0 && m.speed > 200) {
        m.trailT = 0.06;
        fx.spawn('vapor', mTmp.tp.copy(m.pos).addScaledVector(newF, 1.5), 1.5, 1.0);
      }
    }

    // Lifetime and ground collision
    if (m.t > p.lifetime || m.pos.y < groundAt(m.pos.x, m.pos.z)) {
      if (m.alive && m.t <= p.lifetime) fx.explosion(m.pos, 0.6);
      m.alive = false;
    }

    if (!m.alive) scene.remove(m.mesh);
  }
  G.missiles = G.missiles.filter(m => m.alive);
}
function dropFlares() {
  if (player.flares <= 0 || player.flareCool > 0 || !player.alive) return;
  player.flares -= 2; player.flareCool = 0.8;
  audio.flare();
  const r = rightv(player.quat, new V3());
  for (const s of [-1, 1]) G.flares.push({ pos: player.pos.clone(), vel: player.vel.clone().multiplyScalar(0.6).addScaledVector(r, s * 40).add(new V3(0, -15, 0)), isFlare: true, alive: true, t: 0 });
  for (const m of G.missiles) if (m.owner === 'enemy' && m.target === player && Math.random() < 0.88) m.target = G.flares[G.flares.length - 1 - (Math.random() < 0.5 ? 0 : 1)];
}
function updateFlares(dt) {
  for (const fl of G.flares) {
    fl.t += dt; fl.vel.multiplyScalar(0.985); fl.vel.y -= 20 * dt;
    fl.pos.addScaledVector(fl.vel, dt);
    if (Math.random() < 0.7) fx.spawn('flare', fl.pos, 2.2, 0.35);
    if (fl.t > 3) fl.alive = false;
  }
  G.flares = G.flares.filter(f => f.alive);
}

// ============================================================ player
function hurtPlayer(d) {
  if (!player.alive || G.state !== 'play') return;
  player.hp = Math.max(0, player.hp - d);
  flashHull(); audio.hit();
  G.shake = Math.max(G.shake, d > 10 ? 1.0 : 0.25);
  if (player.hp <= 0) crash('격추당했습니다');
}
function crash(reason) {
  if (!player.alive) return;
  player.alive = false;
  fx.explosion(player.pos, 1.6);
  player.obj.visible = false;
  G.deadT = 2.6; G.deadReason = reason;
}
function resetPlayer() {
  player.pos.set(RUNWAY.x, 2.25, RUNWAY.z0 - 40);
  player.quat.identity(); player.gPitch = 0; player.speed = 0; player.throttle = 0; player.vel.set(0, 0, 0);
  player.hp = 100; player.alive = true; player.onGround = true; player.gearDown = true;
  player.gun = LOADOUT.gun; player.msl = LOADOUT.msl; player.flares = LOADOUT.flares;
  player.obj.visible = true;
}
const pTmp = { f: new V3(), r: new V3(), u: new V3(), d: new V3(), z: new V3(), e: new THREE.Euler() };
function updatePlayer(dt) {
  const p = player, K = G.keys;
  let sx = G.stick.x, sy = G.stick.y;
  if (K.ArrowLeft || K.KeyA) sx = -1; if (K.ArrowRight || K.KeyD) sx = 1;
  if (K.ArrowUp || K.KeyW) sy = 1; if (K.ArrowDown || K.KeyS) sy = -1;
  if (K.ShiftLeft || K.KeyE) setThrottle(p.throttle + dt * 0.6);
  if (K.ControlLeft || K.KeyQ) setThrottle(p.throttle - dt * 0.6);
  if (settings.invert) sy = -sy;

  const maxSpd = p.gearDown ? 190 : 260;
  const target = p.throttle * maxSpd;
  const f = fwd(p.quat, pTmp.f);
  if (p.speed < target) p.speed = Math.min(target, p.speed + (p.onGround ? 22 : 30) * (0.4 + p.throttle) * dt);
  else p.speed -= (p.speed - target) * 0.25 * dt;
  if (!p.onGround) p.speed -= f.y * 9.8 * dt * 1.1;
  p.speed = clamp(p.speed, 0, 340);

  if (p.onGround) {
    const yaw = Math.atan2(-f.x, -f.z);
    const newYaw = yaw - sx * 0.5 * dt * clamp(p.speed / 30, 0, 1);
    if (p.speed > 50 && sy > 0.15) p.gPitch = Math.min(0.28, p.gPitch + sy * 0.45 * dt);
    else p.gPitch = Math.max(0, p.gPitch - 0.4 * dt);
    p.quat.setFromEuler(pTmp.e.set(p.gPitch, newYaw, 0, 'YXZ'));
    fwd(p.quat, f);
    p.vel.copy(f).multiplyScalar(p.speed); p.vel.y = 0;
    p.pos.addScaledVector(p.vel, dt);
    p.pos.y = groundAt(p.pos.x, p.pos.z) + 2.25;
    if (p.gPitch > 0.08 && p.speed > 52) { p.onGround = false; toast('이륙!', 1.2); }
    if (p.speed > 8 && baseFlatten(p.pos.x, p.pos.z) > 0.15) crash('활주로 이탈');
  } else {
    const auth = clamp(p.speed / 70, 0.25, 1);
    p.quat.multiply(_q1.setFromAxisAngle(AX, sy * 1.2 * auth * dt));
    p.quat.multiply(_q1.setFromAxisAngle(AZ, -sx * 2.4 * auth * dt));
    const r = rightv(p.quat, pTmp.r), u = upv(p.quat, pTmp.u);
    p.quat.premultiply(_q1.setFromAxisAngle(AY, r.y * 0.85 * auth * dt));
    if (Math.abs(sx) < 0.08 && u.y > 0.2) p.quat.multiply(_q1.setFromAxisAngle(AZ, -r.y * 1.1 * dt));
    const lift = smooth(38, 62, p.speed);
    if (lift < 1) {
      fwd(p.quat, f);
      _m1.lookAt(pTmp.z.set(0, 0, 0), pTmp.d.set(0, -1, 0).add(f), AY);
      _q1.setFromRotationMatrix(_m1);
      p.quat.rotateTowards(_q1, (1 - lift) * 0.9 * dt);
      if (lift < 0.6 && G.toastT <= 0) toast('실속 경고', 0.8);
    }
    p.quat.normalize();
    fwd(p.quat, f);
    p.vel.copy(f).multiplyScalar(p.speed);
    p.vel.y -= (1 - lift) * 30;
    p.pos.addScaledVector(p.vel, dt);
    const gh = groundAt(p.pos.x, p.pos.z);
    if (p.pos.y < gh + 2.25) {
      const u2 = upv(p.quat, pTmp.u);
      const gentle = u2.y > 0.9 && f.y > -0.12 && p.vel.y > -9 && p.speed < 95 && p.gearDown && baseFlatten(p.pos.x, p.pos.z) < 0.1;
      if (gentle) { p.onGround = true; p.gPitch = Math.max(0, Math.asin(clamp(f.y, -1, 1))); p.pos.y = gh + 2.25; toast('착륙', 1.2); }
      else crash(p.gearDown ? '지면 충돌' : '지면 충돌 (기어 올림 상태)');
    }
    if (p.pos.y > 2400) p.quat.rotateTowards(_q1.setFromRotationMatrix(_m1.lookAt(pTmp.z.set(0, 0, 0), pTmp.d.set(f.x, -0.3, f.z), AY)), 0.6 * dt);
    // wingtip vapor on hard pulls
    p.vaporT -= dt;
    if (Math.abs(sy) > 0.55 && p.speed > 110 && p.vaporT <= 0) {
      p.vaporT = 0.025;
      for (const s of [-1, 1]) fx.spawn('vapor', pTmp.d.set(s * 8.1, -0.1, 3.2).applyQuaternion(p.quat).add(p.pos), 0.9, 0.7);
    }
  }
  p.obj.position.copy(p.pos);
  p.obj.quaternion.copy(p.quat);
  const burner = p.throttle > 0.85;
  const fl = 0.5 + p.throttle * 3.2 + (burner ? 2.2 : 0) + Math.random() * 0.5 * p.throttle;
  for (const fm of p.obj.userData.flames) {
    const w = 0.85 + p.throttle * 0.35 + (burner ? 0.2 : 0);
    fm.scale.set(w, w, fl); fm.visible = p.throttle > 0.02;
    fm.children[2].scale.setScalar((1.8 + p.throttle * 1.6) / w);
  }
  const ud = p.obj.userData;
  const gs = ud.gear.scale;
  gs.y = lerp(gs.y, p.gearDown ? 1 : 0.01, clamp(dt * 3, 0, 1));
  ud.gear.visible = gs.y > 0.05;
  ud.msl.forEach((m, i) => m.visible = p.msl > i);
  ud.strobe.visible = (G.time % 1.2) < 0.08;

  p.gunCool = Math.max(p.gunCool - dt, (G.firing || K.Space) ? -0.2 : 0);
  p.mslCool -= dt; p.flareCool -= dt;
  let shots = 0;
  while ((G.firing || K.Space) && p.gun > 0 && p.gunCool <= 0 && !p.onGround && shots < 4) {
    p.gunCool += 0.06; p.gun--; shots++;
    const fwdN = fwd(p.quat, new V3());
    const dir = fwdN.clone();
    dir.x += (Math.random() - 0.5) * 0.008; dir.y += (Math.random() - 0.5) * 0.008; dir.z += (Math.random() - 0.5) * 0.008;
    const side = p.gun % 2 ? 1.2 : -1.2;
    spawnBullet(p.pos.clone().addScaledVector(fwdN, 12).addScaledVector(rightv(p.quat, pTmp.r), side), dir.normalize(), p.vel, 'player');
    if (p.gun % 2 === 0) audio.gun();
    G.shake = Math.max(G.shake, 0.07);
  }
}
function fireMissile() {
  const p = player;
  if (!p.alive || p.msl <= 0 || p.mslCool > 0 || p.onGround) return;
  p.msl--; p.mslCool = 0.45;
  const slot = p.obj.userData.msl[Math.min(p.msl, 3)];
  const pos = slot ? slot.getWorldPosition(new V3()) : p.pos.clone();
  spawnMissile(pos, p.quat, p.vel, 'player', G.locked ? G.target : null);
  if (!G.locked) toast('LOCK 없이 발사', 0.8);
}

// ============================================================ targeting
function targetScore(e, f) { const d = _v1.copy(e.pos).sub(player.pos); const len = d.length(); return Math.acos(clamp(d.divideScalar(len).dot(f), -1, 1)) * 2000 + len; }
function cycleTarget() {
  const alive = G.enemies.filter(e => e.alive);
  if (!alive.length) { G.target = null; return; }
  const f = fwd(player.quat, new V3());
  alive.sort((a, b) => targetScore(a, f) - targetScore(b, f));
  const i = alive.indexOf(G.target);
  G.target = alive[(i + 1) % alive.length];
  G.lockT = 0; G.locked = false;
  audio.ui();
}
function updateTargeting(dt) {
  if (G.target && !G.target.alive) G.target = null;
  if (!G.target && G.enemies.some(e => e.alive)) {
    const f = fwd(player.quat, new V3());
    let best = null, bs = 1e9;
    for (const e of G.enemies) { if (!e.alive) continue; const s = targetScore(e, f); if (s < bs) { bs = s; best = e; } }
    G.target = best; G.lockT = 0;
  }
  const t = G.target;
  if (!t) { G.locked = false; G.lockT = 0; audio.lockTone(0); return; }
  const d = _v1.copy(t.pos).sub(player.pos), l = d.length();
  const ang = Math.acos(clamp(d.divideScalar(l).dot(fwd(player.quat, _v2)), -1, 1));
  if (ang < 0.5 && l < 3000 && !player.onGround && player.alive) {
    G.lockT += dt;
    if (G.lockT > 0.9 && !G.locked) G.locked = true;
  } else { G.lockT = Math.max(0, G.lockT - dt * 2); if (G.lockT <= 0) G.locked = false; }
  audio.lockTone(G.locked ? 2 : G.lockT > 0 ? 1 : 0);
}

// ============================================================ mission flow
function clearWorld() {
  for (const e of G.enemies) if (e.alive) scene.remove(e.obj);
  for (const m of G.missiles) scene.remove(m.mesh);
  G.enemies = []; G.missiles = []; G.flares = [];
  for (const b of G.bullets) { b.alive = false; b.mesh.visible = false; }
}
function startMission(idx) {
  audio.init();
  G.missionIdx = idx; G.mission = MISSIONS[idx];
  clearWorld();
  Object.assign(G, { stage: 0, wave: 0, score: 0, time: 0, kills: 0, target: null, locked: false, lockT: 0, deadT: 0, endT: 0, stageClearT: 0, combo: 0, comboT: 0, survWave: 0, shake: 0, waveDelay: 0 });
  resetPlayer();
  setThrottle(0);
  beginStage(0);
  G.state = 'play';
  $('menu').classList.add('hidden'); $('overlay').classList.add('hidden'); $('hud').classList.remove('hidden');
  objective('스로틀을 올려 이륙하세요');
  music.set(1);
  camSnap = true;
}
function waveCount(w) { return (w.f || 0) + (w.a || 0) + (w.b || 0); }
function survivalWave(n) { return { f: Math.min(10, 3 + n), a: Math.floor(n / 2), b: n % 3 === 2 ? 1 + Math.floor(n / 6) : 0 }; }
function beginStage(s) {
  G.stage = s; G.wave = 0; G.engaged = false; G.waveDelay = 0;
  const waves = G.mission.survival ? [] : G.mission.stages[s];
  G.enemyTotalStage = waves.reduce((a, w) => a + waveCount(w), 0);
  const ang = s === 0 ? -Math.PI / 2 + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2;
  const base = s === 0 ? new V3(0, 0, -800) : player.pos;
  const dist = G.mission.survival ? 1600 : 2000 + Math.random() * 600;
  G.waypoint.set(clamp(base.x + Math.cos(ang) * dist, -3800, 3800), 0, clamp(base.z + Math.sin(ang) * dist, -4300, 3300));
  G.waypoint.y = Math.max(groundAt(G.waypoint.x, G.waypoint.z) + 380, 420);
  G.wpActive = true;
  if (s > 0) objective('교전 거점으로 이동');
}
function spawnWave(def) {
  const f = fwd(player.quat, new V3()); f.y = 0; if (f.lengthSq() < 0.01) f.set(0, 0, -1); f.normalize();
  const groups = [];
  if (def.f) groups.push(['fighter', def.f]);
  if (def.a) groups.push(['ace', def.a]);
  if (def.b) groups.push(['bomber', def.b]);
  let gi = 0;
  for (const [type, n] of groups) {
    // each group arrives as a V formation from its own bearing
    const bearing = (gi === 0 ? (Math.random() - 0.5) * 1.2 : (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.2));
    const dir = f.clone().applyAxisAngle(AY, bearing);
    const range = type === 'bomber' ? 2600 : 2000 + Math.random() * 500;
    const lead = player.pos.clone().addScaledVector(dir, range);
    lead.y = Math.max(groundAt(lead.x, lead.z) + 260, (type === 'bomber' ? 850 : player.pos.y + (Math.random() - 0.3) * 250));
    const heading = dir.clone().negate();
    const side = new V3(-heading.z, 0, heading.x);
    const spacing = type === 'bomber' ? 110 : 55;
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2), s = i === 0 ? 0 : (i % 2 ? 1 : -1);
      const pos = lead.clone().addScaledVector(side, s * row * spacing).addScaledVector(heading, -row * spacing * 0.8);
      pos.y += row * 6;
      if (type === 'bomber' && i > 0 && Math.abs(pos.x) > 4300) pos.x = clamp(pos.x, -4300, 4300);
      G.enemies.push(new Enemy(type, pos, heading, G.mission.skill));
    }
    gi++;
  }
  const n = waveCount(def);
  const parts = [def.f ? `전투기 ${def.f}` : '', def.a ? `에이스 ${def.a}` : '', def.b ? `폭격기 ${def.b}` : ''].filter(Boolean).join(' · ');
  toast(G.wave === 0 && !G.mission.survival ? `적기 ${n}기 접근!` : `증원 출현! ${parts}`, 1.8);
  audio.alarm();
  music.set(2);
}
function stageWaves() { return G.mission.survival ? null : G.mission.stages[G.stage]; }
function updateMissionLine() {
  const m = G.mission, alive = G.enemies.filter(e => e.alive).length;
  let txt;
  if (m.survival) txt = `${m.name} · 웨이브 ${G.survWave || '-'} · 격추 ${G.kills} · 점수 ${G.score}`;
  else txt = `${m.name} · 단계 ${G.stage + 1}/${m.stages.length} · 웨이브 ${Math.min(G.wave + (G.engaged ? 1 : 0), stageWaves().length)}/${stageWaves().length} · 격추 ${G.kills}`;
  if (G.engaged && alive) objectiveCount(alive);
  $('missionLine').textContent = txt;
}
function objectiveCount(n) { const t = `적기를 격추하세요 · 남은 적 ${n}`; if ($('objective').textContent !== t) objective(t, true); }
function objective(t, hot) { const o = $('objective'); o.textContent = t; o.classList.toggle('hot', !!hot); }
function toast(t, dur = 1.5) { const el = $('toast'); el.textContent = t; el.classList.add('show'); G.toastT = dur; }
function rearm(full) {
  if (full) { player.msl = LOADOUT.msl; player.gun = LOADOUT.gun; player.flares = LOADOUT.flares; player.hp = Math.min(100, player.hp + 35); }
  else { player.msl = Math.min(LOADOUT.msl, player.msl + 2); player.gun = Math.min(LOADOUT.gun, player.gun + 200); player.flares = Math.min(LOADOUT.flares, player.flares + 8); player.hp = Math.min(100, player.hp + 10); }
}
function updateMission(dt) {
  G.time += dt;
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').classList.remove('show'); }
  if (G.comboT > 0) G.comboT -= dt;
  const ot = $('objective').textContent;
  if (player.onGround && G.stage === 0 && G.wpActive) {
    if (player.speed > 50 && ot !== '화면을 위로 드래그해 이륙하세요') objective('화면을 위로 드래그해 이륙하세요');
  } else if (!player.onGround && (ot === '스로틀을 올려 이륙하세요' || ot === '화면을 위로 드래그해 이륙하세요')) objective('교전 거점으로 이동');

  if (G.wpActive && !player.onGround && Math.hypot(G.waypoint.x - player.pos.x, G.waypoint.z - player.pos.z) < 750) {
    G.wpActive = false; G.engaged = true;
    if (G.mission.survival) { G.survWave = 1; spawnWave(survivalWave(1)); }
    else spawnWave(stageWaves()[0]);
  }
  const alive = G.enemies.filter(e => e.alive).length;
  if (G.engaged && player.alive && G.stageClearT === 0) {
    if (G.mission.survival) {
      if (alive <= 2 && G.waveDelay <= 0) G.waveDelay = 3;
      if (G.waveDelay > 0) {
        G.waveDelay -= dt;
        if (G.waveDelay <= 0) { G.survWave++; G.score += 100; rearm(false); spawnWave(survivalWave(G.survWave)); }
      }
    } else {
      const waves = stageWaves();
      const more = G.wave + 1 < waves.length;
      // reinforcements arrive while a few enemies are still fighting → constant action
      if (more && alive <= Math.max(1, Math.floor(waveCount(waves[G.wave]) * 0.34)) && G.waveDelay <= 0) G.waveDelay = 2.5;
      if (G.waveDelay > 0) {
        G.waveDelay -= dt;
        if (G.waveDelay <= 0 && more) { G.wave++; rearm(false); spawnWave(waves[G.wave]); }
      }
      if (!more && alive === 0) {
        G.stageClearT = 3;
        G.score += 300;
        music.set(1);
        if (G.stage + 1 >= G.mission.stages.length) { toast('작전 완료!', 2.8); G.endT = 1; }
        else { toast(`단계 ${G.stage + 1} 클리어! 재무장 완료`, 2.4); objective('다음 교전 준비'); }
        rearm(true);
      }
    }
  }
  if (G.stageClearT > 0) {
    G.stageClearT -= dt;
    if (G.stageClearT <= 0) {
      G.stageClearT = 0;
      G.enemies = [];
      if (G.endT > 0) { G.endT = 0; endMission(true); }
      else beginStage(G.stage + 1);
    }
  }
  updateMissionLine();
  updateSquad();
  const r = Math.max(Math.abs(player.pos.x), Math.abs(player.pos.z + 700));
  if (r > 4600 && player.alive) { G.outT += dt; if (G.toastT <= 0) toast('작전 구역 이탈 중 - 복귀하세요', 1.2); if (G.outT > 12) crash('작전 구역 이탈'); }
  else G.outT = 0;
  if (!player.alive) { G.deadT -= dt; if (G.deadT <= 0 && G.state === 'play') endMission(false); }
  const incoming = G.missiles.some(m => m.owner === 'enemy' && m.target === player);
  $('warn').style.display = incoming && player.alive ? 'block' : 'none';
  if (incoming && player.alive) { G.warnT -= dt; if (G.warnT <= 0) { G.warnT = 0.32; audio.warn(); } }
}
function endMission(win) {
  G.state = 'result';
  audio.lockTone(0);
  music.set(0);
  const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  const surv = G.mission.survival;
  if (win) G.score += Math.max(0, 900 - Math.floor(G.time)) + Math.floor(player.hp * 5);
  const prev = progress.cleared[G.missionIdx] || 0;
  const record = (win || surv) && G.score > prev;
  if (win || surv) { progress.cleared[G.missionIdx] = Math.max(prev, G.score); saveProgress(); }
  $('ovTitle').textContent = surv ? '서바이벌 종료' : win ? '작전 성공' : '작전 실패';
  $('ovBody').innerHTML = `${win ? '' : (G.deadReason || '') + '<br>'}${surv ? `도달 웨이브 <b>${G.survWave}</b> · ` : ''}격추 <b>${G.kills}</b>기 · 비행 시간 ${mins}분 ${secs}초<br>점수 <b>${G.score}</b>${record ? ' <span style="color:#ffd166">★ 최고 기록</span>' : ''}`;
  const btns = $('ovBtns'); btns.innerHTML = '';
  const mk = (t, fn, sec) => { const b = document.createElement('button'); b.textContent = t; if (sec) b.className = 'sec'; b.onclick = () => { audio.ui(); fn(); }; btns.appendChild(b); };
  mk('다시 하기', () => startMission(G.missionIdx));
  if (win && G.missionIdx + 1 < MISSIONS.length) mk('다음 작전', () => startMission(G.missionIdx + 1));
  mk('메인 메뉴', showMenu, true);
  $('overlay').classList.remove('hidden');
}
function showMenu() {
  G.state = 'menu';
  clearWorld();
  resetPlayer();
  $('hud').classList.add('hidden'); $('overlay').classList.add('hidden'); $('menu').classList.remove('hidden');
  buildMenu();
  audio.engine(0, 0, false); audio.lockTone(0);
  music.set(0);
}
function buildMenu() {
  const list = $('missionList'); list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const b = document.createElement('button'); b.className = 'mbtn' + (m.survival ? ' surv' : '');
    const best = progress.cleared[i];
    b.innerHTML = `<span>${m.name}<br><small>${m.desc}</small></span><small>${best ? '<span class="star">★</span> ' + best : '시작 ▶'}</small>`;
    b.onclick = () => { audio.init(); audio.ui(); startMission(i); };
    list.appendChild(b);
  });
}
function pauseMenu() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  audio.engine(0, 0, false); audio.lockTone(0);
  $('ovTitle').textContent = '일시 정지';
  $('ovBody').textContent = `${G.mission.name} · 격추 ${G.kills} · 점수 ${G.score}`;
  const btns = $('ovBtns'); btns.innerHTML = '';
  const mk = (t, fn, sec) => { const b = document.createElement('button'); b.textContent = t; if (sec) b.className = 'sec'; b.onclick = () => { audio.ui(); fn(); }; btns.appendChild(b); };
  mk('계속하기', () => { G.state = 'play'; $('overlay').classList.add('hidden'); });
  mk('다시 하기', () => startMission(G.missionIdx), true);
  mk('메인 메뉴', showMenu, true);
  $('overlay').classList.remove('hidden');
}

// ============================================================ camera
let camSnap = true;
const camPos = new V3(), camLook = new V3(), cTmp = { want: new V3(), look: new V3(), up: new V3() };
let menuAng = 0;
function updateCamera(dt) {
  if (G.state === 'menu') {
    menuAng += dt * 0.16;
    const c = player.pos;
    const r = 23 + Math.sin(menuAng * 0.5) * 4;
    camera.position.set(c.x + Math.sin(menuAng) * r, 4 + Math.sin(menuAng * 0.7) * 2.5, c.z + Math.cos(menuAng) * r);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.x, c.y + 0.5, c.z - 2);
    camera.fov = 50;
    camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight);
    return;
  }
  if (camera.view && camera.view.enabled) camera.clearViewOffset();
  const p = player;
  const f = fwd(p.quat, pTmp.f), u = upv(p.quat, pTmp.u);
  if (G.camMode === 1 && p.alive) {
    p.obj.visible = false;
    camera.position.copy(p.pos).addScaledVector(f, -3.6).addScaledVector(u, 1.55);
    camera.quaternion.copy(p.quat);
  } else {
    if (p.alive) p.obj.visible = true;
    const flatUp = cTmp.up.set(0, 1, 0).lerp(u, 0.35).normalize();
    const want = cTmp.want.copy(p.pos).addScaledVector(f, -28 - clamp(p.speed / 260, 0, 1) * 6).addScaledVector(flatUp, 7.5);
    if (!p.alive) want.copy(camPos);
    const minY = groundAt(want.x, want.z) + 3;
    if (want.y < minY) want.y = minY;
    camPos.lerp(want, camSnap ? 1 : 1 - Math.exp(-dt * 7));
    const look = cTmp.look.copy(p.pos).addScaledVector(f, 40).addScaledVector(flatUp, 2);
    camLook.lerp(look, camSnap ? 1 : 1 - Math.exp(-dt * 10));
    camSnap = false;
    camera.position.copy(camPos);
    camera.up.copy(flatUp);
    camera.lookAt(camLook);
  }
  if (G.shake > 0.01) {
    const s = G.shake * 0.9;
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
    G.shake *= Math.exp(-dt * 6);
  }
  const fov = 60 + clamp((p.speed - 60) / 200, 0, 1) * 12;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, dt * 2); camera.updateProjectionMatrix(); }
}

// ============================================================ HUD
const hud = {
  spd: $('spd').querySelector('.box'), alt: $('alt').querySelector('.box'),
  thVal: $('throttle').querySelector('.val'), thFill: $('throttle').querySelector('.fill'), thKnob: $('throttle').querySelector('.knob'),
  hullTxt: $('hull').querySelector('b'), hullBar: $('hull').querySelector('.fillb'),
  gun: $('gunCount'), msl: $('mslCount'), flare: $('flareCount'),
  wp: $('wpMarker'), wpTxt: $('wpMarker').querySelector('b'), cross: $('crosshair'), markers: $('markers'),
  radar: $('radar').getContext('2d'), lockTxt: $('lockTxt'), btnMsl: $('btnMsl'),
};
const mkPool = [];
function projectToScreen(v, out) {
  _v1.copy(v).project(camera);
  const behind = _v1.z > 1;
  out.x = (_v1.x * 0.5 + 0.5) * innerWidth; out.y = (-_v1.y * 0.5 + 0.5) * innerHeight; out.behind = behind;
  if (behind) { out.x = innerWidth - out.x; out.y = innerHeight - out.y; }
  return out;
}
function edgeClamp(o, m = 40) {
  const onScreen = !o.behind && o.x > m && o.x < innerWidth - m && o.y > m && o.y < innerHeight - m;
  if (onScreen) return false;
  const cx = innerWidth / 2, cy = innerHeight / 2;
  let dx = o.x - cx, dy = o.y - cy;
  if (o.behind && Math.abs(dy) < 1) dy = 1;
  const s = Math.min((cx - m) / Math.abs(dx || 1e-3), (cy - m) / Math.abs(dy || 1e-3));
  o.x = cx + dx * s; o.y = cy + dy * s;
  return true;
}
let hullFlash = 0;
function flashHull() { hullFlash = 0.4; }
function updateHUD(dt) {
  const p = player;
  hud.spd.textContent = Math.round(p.speed * KMH);
  hud.alt.textContent = Math.max(0, Math.round(p.pos.y - 2.25));
  const th = Math.round(p.throttle * 100);
  hud.thVal.textContent = th + '%';
  hud.thFill.style.height = th + '%'; hud.thKnob.style.bottom = th + '%';
  hud.hullTxt.textContent = Math.round(p.hp) + '%';
  hud.hullBar.style.width = p.hp + '%';
  hullFlash -= dt;
  hud.hullBar.style.background = hullFlash > 0 ? '#ff6b6b' : p.hp > 50 ? '#8ee6b8' : p.hp > 25 ? '#ffd166' : '#ff6b6b';
  hud.gun.textContent = p.gun === Infinity ? '∞' : p.gun; hud.msl.textContent = p.msl === Infinity ? '∞' : p.msl; hud.flare.textContent = p.flares === Infinity ? '∞' : p.flares;
  $('gearLbl').textContent = p.gearDown ? '올림' : '내림';
  // gun pipper
  const pip = projectToScreen(_v2.copy(p.pos).addScaledVector(fwd(p.quat, _v3), 700), {});
  hud.cross.style.left = pip.x + 'px'; hud.cross.style.top = pip.y + 'px';
  hud.cross.style.display = pip.behind || !p.alive ? 'none' : 'block';
  G.hitMark -= dt; hud.cross.classList.toggle('hit', G.hitMark > 0);
  // waypoint
  if (G.wpActive) {
    const o = projectToScreen(G.waypoint, {});
    const edge = edgeClamp(o, 60);
    hud.wp.style.display = 'flex';
    hud.wp.style.left = o.x + 'px'; hud.wp.style.top = o.y + 'px';
    hud.wp.querySelector('.ring').style.display = edge ? 'none' : 'block';
    hud.wpTxt.textContent = Math.round(Math.hypot(G.waypoint.x - p.pos.x, G.waypoint.z - p.pos.z));
  } else hud.wp.style.display = 'none';
  // enemy markers
  const alive = G.enemies.filter(e => e.alive);
  while (mkPool.length < alive.length) {
    const d = document.createElement('div'); d.className = 'mk'; d.innerHTML = '<div class="box"></div><div class="ring"></div><div class="hpb"><div class="hp"></div></div><div class="d"></div>';
    hud.markers.appendChild(d); mkPool.push(d);
  }
  mkPool.forEach((d, i) => {
    const e = alive[i];
    if (!e) { d.style.display = 'none'; return; }
    const o = projectToScreen(e.pos, {});
    const edge = edgeClamp(o, 50);
    d.style.display = 'block'; d.style.left = o.x + 'px'; d.style.top = o.y + 'px';
    const sel = e === G.target;
    d.className = 'mk ' + e.type + (sel ? ' sel' : '') + (sel && G.locked ? ' locked' : '') + (edge ? ' edge' : '');
    d.querySelector('.d').textContent = edge ? '' : (e.type !== 'fighter' ? e.T.label + ' ' : '') + Math.round(e.pos.distanceTo(p.pos)) + 'm';
    d.querySelector('.hp').style.width = (e.hp / e.maxHp * 100) + '%';
    const ring = d.querySelector('.ring');
    if (sel && !G.locked && G.lockT > 0 && !edge) {
      const s = (1 - G.lockT / 0.9) * 90 + 30;
      ring.style.display = 'block'; ring.style.width = ring.style.height = s + 'px';
    } else ring.style.display = 'none';
  });
  hud.lockTxt.style.display = G.locked ? 'block' : 'none';
  hud.btnMsl.classList.toggle('ready', G.locked && p.msl > 0);
  drawRadar();
}
function drawRadar() {
  const c = hud.radar, W = 240, R = 118;
  c.clearRect(0, 0, W, W);
  c.save(); c.translate(W / 2, W / 2);
  c.fillStyle = 'rgba(30,70,82,.85)'; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(16,46,58,.9)'; c.beginPath(); c.arc(0, 0, R * 0.78, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(126,227,214,.28)'; c.lineWidth = 1.5;
  for (const r of [0.26, 0.52, 0.78]) { c.beginPath(); c.arc(0, 0, R * r, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.moveTo(-R * 0.78, 0); c.lineTo(R * 0.78, 0); c.moveTo(0, -R * 0.78); c.lineTo(0, R * 0.78); c.stroke();
  const f = fwd(player.quat, _v1);
  const yaw = Math.atan2(f.x, -f.z);
  const range = 3500, sc = R * 0.78 / range;
  const plot = (x, z, col, size, shape) => {
    let dx = x - player.pos.x, dz = z - player.pos.z;
    const rx = dx * Math.cos(-yaw) - dz * Math.sin(-yaw), rz = dx * Math.sin(-yaw) + dz * Math.cos(-yaw);
    let px = rx * sc, py = rz * sc;
    const l = Math.hypot(px, py), mx = R * 0.76;
    if (l > mx) { px *= mx / l; py *= mx / l; }
    c.fillStyle = col;
    if (shape === 'diamond') { c.beginPath(); c.moveTo(px, py - size); c.lineTo(px + size, py); c.lineTo(px, py + size); c.lineTo(px - size, py); c.closePath(); c.fill(); }
    else { c.beginPath(); c.arc(px, py, size, 0, Math.PI * 2); c.fill(); }
  };
  plot(RUNWAY.x, (RUNWAY.z0 + RUNWAY.z1) / 2, 'rgba(255,255,255,.75)', 4);
  if (G.wpActive) plot(G.waypoint.x, G.waypoint.z, '#9ff0e4', 7, 'diamond');
  for (const e of G.enemies) if (e.alive) plot(e.pos.x, e.pos.z, e === G.target ? '#ffd166' : e.type === 'ace' ? '#ff9f43' : '#ff6b6b', e.type === 'bomber' ? 7 : 5, e.type === 'bomber' ? 'diamond' : null);
  for (const m of G.missiles) if (m.owner === 'enemy') plot(m.pos.x, m.pos.z, '#ffffff', 3);
  c.fillStyle = '#9ff0e4'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fill();
  c.restore();
}

// ============================================================ input
function setThrottle(v) { player.throttle = clamp(v, 0, 1); }
(() => {
  // stick: drag anywhere on canvas
  const base = $('stickBase'), knob = $('stickKnob');
  let sid = null, ox = 0, oy = 0;
  const radius = () => Math.min(innerWidth, innerHeight) * 0.13;
  canvas.addEventListener('pointerdown', e => {
    audio.init();
    if (G.state !== 'play' || sid !== null) return;
    sid = e.pointerId; ox = e.clientX; oy = e.clientY;
    base.style.display = 'block'; base.style.left = ox + 'px'; base.style.top = oy + 'px';
    knob.style.transform = 'translate(0,0)';
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== sid) return;
    const R = radius();
    let dx = (e.clientX - ox) / R, dy = (e.clientY - oy) / R;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    // dead zone + response curve
    const curve = v => Math.sign(v) * Math.pow(Math.max(0, Math.abs(v) - 0.06) / 0.94, 1.35);
    G.stick.x = curve(dx); G.stick.y = curve(-dy);
    knob.style.transform = `translate(${dx * R * 0.55}px,${dy * R * 0.55}px)`;
  });
  const end = e => { if (e.pointerId !== sid) return; sid = null; G.stick.x = G.stick.y = 0; base.style.display = 'none'; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  // throttle slider
  const th = $('throttle'), track = th.querySelector('.track');
  let tid = null;
  const setFromY = y => { const r = track.getBoundingClientRect(); setThrottle(1 - (y - r.top) / r.height); };
  th.addEventListener('pointerdown', e => { e.stopPropagation(); audio.init(); tid = e.pointerId; th.setPointerCapture(e.pointerId); setFromY(e.clientY); });
  th.addEventListener('pointermove', e => { if (e.pointerId === tid) setFromY(e.clientY); });
  th.addEventListener('pointerup', e => { if (e.pointerId === tid) tid = null; });
  th.addEventListener('pointercancel', () => tid = null);
  $('thMax').addEventListener('pointerdown', e => { e.stopPropagation(); setThrottle(1); audio.ui(); });
  $('thStop').addEventListener('pointerdown', e => { e.stopPropagation(); setThrottle(0); audio.ui(); });

  // buttons
  const gun = $('btnGun');
  gun.addEventListener('pointerdown', e => { e.preventDefault(); audio.init(); G.firing = true; gun.classList.add('on'); gun.setPointerCapture(e.pointerId); });
  const gunUp = () => { G.firing = false; gun.classList.remove('on'); };
  gun.addEventListener('pointerup', gunUp); gun.addEventListener('pointercancel', gunUp); gun.addEventListener('lostpointercapture', gunUp);
  const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio.init(); fn(); });
  tap('btnMsl', fireMissile);
  tap('btnTarget', cycleTarget);
  tap('btnFlare', dropFlares);
  tap('btnCam', () => { G.camMode = (G.camMode + 1) % 2; camSnap = true; audio.ui(); });
  tap('btnGear', () => {
    if (player.onGround) { toast('지상에서는 기어를 올릴 수 없습니다', 1.2); return; }
    player.gearDown = !player.gearDown; audio.ui();
  });
  tap('btnHome', pauseMenu);

  // keyboard (PC testing)
  addEventListener('keydown', e => {
    G.keys[e.code] = true;
    if (G.state !== 'play') return;
    if (e.code === 'KeyR') fireMissile();
    if (e.code === 'KeyT') cycleTarget();
    if (e.code === 'KeyF') dropFlares();
    if (e.code === 'KeyC') { G.camMode = (G.camMode + 1) % 2; camSnap = true; }
    if (e.code === 'KeyG') $('btnGear').dispatchEvent(new PointerEvent('pointerdown'));
    if (e.code === 'Escape') pauseMenu();
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => { G.keys[e.code] = false; });

  // menu options
  const inv = $('optInvert'), snd = $('optSound'), hq = $('optHQ'), mus = $('optMusic');
  inv.checked = settings.invert; snd.checked = settings.sound; hq.checked = settings.hq; mus.checked = settings.music;
  mus.onchange = () => { settings.music = mus.checked; saveSettings(); audio.init(); audio.setMusic(settings.music); };
  inv.onchange = () => { settings.invert = inv.checked; saveSettings(); };
  snd.onchange = () => { settings.sound = snd.checked; saveSettings(); };
  hq.onchange = () => { settings.hq = hq.checked; saveSettings(); applyQuality(); renderer.setSize(innerWidth, innerHeight); };

  // Android back / lifecycle hooks
  window.__back = () => {
    if (G.state === 'play') pauseMenu();
    else if (G.state === 'paused') { G.state = 'play'; $('overlay').classList.add('hidden'); }
    else if (G.state === 'result') showMenu();
    else if (window.Android && Android.exit) Android.exit();
  };
  window.__pause = () => { if (G.state === 'play') pauseMenu(); audio.engine(0, 0, false); if (audio.ctx) audio.ctx.suspend(); };
  window.__resume = () => { if (audio.ctx) audio.ctx.resume(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.__pause(); });
})();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// ============================================================ main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.05);
  if (G.state === 'play') {
    if (player.alive) updatePlayer(dt);
    for (const e of G.enemies) if (e.alive) e.update(dt);
    updateBullets(dt);
    updateMissiles(dt);
    updateFlares(dt);
    updateTargeting(dt);
    updateMission(dt);
    updateHUD(dt);
    audio.engine(player.throttle, player.speed, player.alive);
  } else if (G.state === 'menu') {
    player.obj.position.copy(player.pos); player.obj.quaternion.copy(player.quat);
    for (const fm of player.obj.userData.flames) fm.visible = false;
    player.obj.userData.strobe.visible = (now % 1200) < 90;
  }
  if (scene.userData.dish) scene.userData.dish.rotation.y += dt * 0.8;
  fx.update(dt);
  updateCamera(dt);
  scene.userData.sky.position.copy(camera.position);
  renderer.render(scene, camera);
}
showMenu();
requestAnimationFrame(frame);
window.__G = G; window.__player = player; window.__startMission = startMission;
})();
