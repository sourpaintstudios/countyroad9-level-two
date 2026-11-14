import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const Q = new URLSearchParams(location.search);
const HOST = Q.get('host') === '1';   // embedded in the real game: report back to the page that opened us
if (Q.get('warn') === '0') { const w = document.getElementById('warn'); if (w) w.style.display = 'none'; }
function finish(won) { try { parent.postMessage({ cr9l2: 'done', won: !!won, score: Math.max(0, Math.min(3000, S.score | 0)), chickens: S.chickens | 0 }, location.origin); } catch (e) { } }

const GRAY_SRC = window.__GRAY_SRC || './gray.webp';
const W = 4, H = 3.4, L = 40, HW = W / 2, zc = -L / 2;
const R = Math.random, TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, rr = (a, b) => a + R() * (b - a);
const CHARGE_T = +(Q.get('charge') || 1.4);          // seconds to fill the load ring
const SPEED = +(Q.get('speed') || 1);                 // gray speed multiplier
const CHICK_AT = 1;                                   // damage needed to turn him

// ============================================================ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio || 1, Q.get('lite') ? 1 : 1.5);
renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
document.getElementById('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02030a);
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.32;
scene.fog = new THREE.FogExp2(0x2a4a8a, 0.007);
const cam = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.05, 400);
const CAM0 = new THREE.Vector3(0.25, 1.55, 0);
cam.position.copy(CAM0); cam.rotation.order = 'YXZ'; cam.rotation.x = -1.5 * Math.PI / 180;

// ============================================================ hall (approved look)
const ctex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (rep) t.repeat.set(...rep); return t; };
const panelTex = ctex(512, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f4f8ff'); gr.addColorStop(1, '#dfe9f7'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#9fb6d6'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12); });
const floorTex = ctex(512, 512, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8fb4e8'; g.lineWidth = 4; g.strokeRect(0, 0, w, h); g.strokeStyle = '#d8e6fa'; g.lineWidth = 2; g.strokeRect(10, 10, w - 20, h - 20); });
const white = new THREE.MeshPhysicalMaterial({ map: panelTex, color: 0xdbe7ff, roughness: 0.16, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 });
const whiteFrame = new THREE.MeshPhysicalMaterial({ color: 0xf2f6fd, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
const neonBlue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.42, 1.9), toneMapped: false });
const neonWhite = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.4, 3.8), toneMapped: false });
const darkGlass = new THREE.MeshPhysicalMaterial({ color: 0x000614, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.08, envMapIntensity: 0.04, depthWrite: false, fog: false });
const doorDark = new THREE.MeshStandardMaterial({ color: 0x050b1a, emissive: 0x041a40, emissiveIntensity: 0.6, roughness: 0.4 });
const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m; };
const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const rbox = (w, h, d, r, mat, x, y, z) => add(new RoundedBoxGeometry(w, h, d, 4, r), mat, x, y, z);

const mir = new Reflector(new THREE.PlaneGeometry(W, L), { textureWidth: Math.round(innerWidth * 0.6), textureHeight: Math.round(innerHeight * 0.6), color: 0x6f86b0, clipBias: 0.003 });
mir.rotation.x = -Math.PI / 2; mir.position.set(0, 0, zc); scene.add(mir);
floorTex.repeat.set(W / 2, L / 2);
const floor = add(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: floorTex, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0, envMapIntensity: 0.7 }), 0, 0.004, zc); floor.rotation.x = -Math.PI / 2;
const wallTexL = panelTex.clone(); wallTexL.repeat.set(L / 3, 1); wallTexL.needsUpdate = true;
const ceilMat = white.clone(); ceilMat.map = panelTex.clone(); ceilMat.map.repeat.set(W / 2, L / 3); ceilMat.map.needsUpdate = true; ceilMat.roughness = 0.1;
const ceil = add(new THREE.PlaneGeometry(W, L), ceilMat, 0, H, zc); ceil.rotation.x = Math.PI / 2;
for (const sx of [-1, 1]) { box(0.1, 0.03, L, neonWhite, sx * (HW - 0.22), H - 0.02, zc); box(0.02, 0.02, L, neonBlue, sx * 0.55, H - 0.01, zc); }
box(0.02, 0.02, L, neonBlue, 0, H - 0.01, zc);
for (let z = -3; z > -L; z -= 3) box(W - 0.4, 0.015, 0.02, neonBlue, 0, H - 0.01, z);
const lw = add(new THREE.PlaneGeometry(L, H), (() => { const m = white.clone(); m.map = wallTexL; return m; })(), -HW, H / 2, zc); lw.rotation.y = Math.PI / 2;
const DOORS = [-8, -15, -22, -29, -36];
for (const z of DOORS) {
  const dw = 1.5, dh = 2.5; box(0.06, dh, dw, doorDark, -HW + 0.03, dh / 2, z);
  for (const s of [-1, 1]) box(0.06, dh, 0.07, neonBlue, -HW + 0.06, dh / 2, z + s * dw / 2);
  box(0.06, 0.07, dw + 0.07, neonBlue, -HW + 0.06, dh, z);
  rbox(0.12, dh + 0.24, dw + 0.3, 0.05, whiteFrame, -HW + 0.06, (dh + 0.24) / 2, z);
  box(0.08, dh - 0.05, dw - 0.05, doorDark, -HW + 0.09, dh / 2, z);
}
const mull = 0.5, win = 4.5, pitch = win + mull;
for (let z = 0; z > -L - pitch; z -= pitch) {
  rbox(0.3, H, mull, 0.08, whiteFrame, HW - 0.1, H / 2, z - mull / 2);
  const cz = z - mull - win / 2; if (cz < -L) continue;
  const g = box(0.02, 2.2, win, darkGlass, HW - 0.04, 0.55 + 1.1, cz); g.renderOrder = 2;
  box(0.05, 0.03, win, neonBlue, HW - 0.1, 0.52, cz); box(0.05, 0.03, win, neonBlue, HW - 0.1, 2.78, cz);
  rbox(0.3, 0.55, win, 0.06, whiteFrame, HW - 0.1, 0.275, cz); rbox(0.3, H - 2.8, win, 0.06, whiteFrame, HW - 0.1, 2.8 + (H - 2.8) / 2, cz);
}
for (let z = -14; z > -L + 2; z -= 16) {
  const t = 0.3, d = 0.5;
  rbox(t, H, d, 0.06, whiteFrame, -HW + t / 2, H / 2, z); rbox(t, H, d, 0.06, whiteFrame, HW - t / 2, H / 2, z);
  rbox(W, t, d, 0.06, whiteFrame, 0, H - t / 2, z); rbox(W, 0.12, d, 0.04, whiteFrame, 0, 0.06, z);
  box(0.03, H - 2 * t, 0.03, neonBlue, -HW + t, H / 2, z + d / 2); box(0.03, H - 2 * t, 0.03, neonBlue, HW - t, H / 2, z + d / 2);
  box(W - 2 * t, 0.03, 0.03, neonBlue, 0, H - t, z + d / 2); box(W - 2 * t, 0.03, 0.03, neonBlue, 0, t - 0.02, z + d / 2);
}
box(0.08, 0.07, L, neonBlue, -HW + 0.04, 0.05, zc); box(0.08, 0.07, L, neonBlue, HW - 0.14, 0.05, zc);
const roomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.8, 3.2), toneMapped: false, fog: false });
add(new THREE.PlaneGeometry(W - 0.6, H - 0.6), roomMat, 0, H / 2, -L + 0.02);
new THREE.TextureLoader().load(window.__ROOM_SRC || './room.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; roomMat.map = t; roomMat.color.setRGB(1.25, 1.25, 1.35); roomMat.needsUpdate = true; });
rbox(W, H, 0.3, 0.1, whiteFrame, 0, H / 2, -L - 0.2);
{
  const N = 18000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const th = R() * TAU, ph = Math.acos(2 * R() - 1), r = 150 + R() * 60; pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph) - 40], i * 3); const k = 0.5 + R() * 1.6, b = R(); col.set([k * (0.8 + 0.2 * b), k * 0.9, k * (1 + 0.3 * (1 - b))], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starTex = ctex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, '#fff'); r.addColorStop(0.35, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 3.2, map: starTex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: false, fog: false, toneMapped: false })));
  const nebTex = (a, b) => ctex(256, 256, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, a); r.addColorStop(0.5, b); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  for (const [x, y, z, s, a, b] of [[60, 18, -14, 70, 'rgba(120,90,255,.55)', 'rgba(40,30,140,.25)'], [70, 8, -35, 90, 'rgba(255,150,90,.35)', 'rgba(120,50,80,.18)'], [65, 20, -46, 70, 'rgba(70,160,255,.45)', 'rgba(20,50,120,.2)'], [90, 15, -5, 100, 'rgba(180,90,255,.4)', 'rgba(60,20,110,.2)']]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex(a, b), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, opacity: 1.6 })); sp.position.set(x, y, z); sp.scale.set(s, s, 1); scene.add(sp); }
}
scene.add(new THREE.HemisphereLight(0xbdd0ff, 0x3a4c86, 0.26));
for (let z = -4; z > -L; z -= 9) { const p = new THREE.PointLight(0xc4d8ff, 3.2, 14, 1.8); p.position.set(0, H - 0.3, z); scene.add(p); }
for (let z = -8; z > -L; z -= 18) { const p = new THREE.PointLight(0x2f8cff, 5, 9, 1.6); p.position.set(-HW + 0.5, 1.2, z); scene.add(p); }

const comp = new EffectComposer(renderer); comp.setSize(innerWidth, innerHeight);
comp.addPass(new RenderPass(scene, cam));
if (!Q.get('nobloom')) comp.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.16, 0.4, 1.15));
comp.addPass(new OutputPass());

// ============================================================ paint colour, mixing, splats (from Squeeze Pop Overdrive)
const MOODS = {
  Joy: [[50, 100, 55], [330, 85, 62], [175, 80, 48], [25, 95, 58], [95, 70, 55], [190, 90, 60]],
  Rage: [[0, 90, 45], [12, 95, 50], [350, 85, 30], [28, 100, 55], [20, 100, 60], [330, 100, 40]],
  Euphoria: [[300, 90, 60], [190, 100, 55], [55, 100, 60], [270, 90, 62], [330, 95, 60], [160, 100, 50]],
  Dread: [[235, 60, 22], [260, 55, 30], [220, 70, 38], [350, 70, 32], [150, 45, 30], [300, 50, 15]],
  Serenity: [[185, 45, 60], [160, 40, 58], [210, 50, 65], [45, 40, 75], [270, 25, 68], [190, 30, 85]]
};
const MOOD_BAG = ['Joy', 'Rage', 'Euphoria', 'Euphoria', 'Joy', 'Dread', 'Serenity', 'Rage'];
const MIXM = ['multiply', 'overlay', 'source-over', 'hard-light'];
let moodIx = (R() * MOOD_BAG.length) | 0;
function makePalette() {
  moodIx = (moodIx + 1 + ((R() * 3) | 0)) % MOOD_BAG.length;
  const L6 = MOODS[MOOD_BAG[moodIx]].slice().sort(() => R() - .5);
  const pal = L6.map((o, i) => ({ h: o[0] + rr(-8, 8), s: clamp(o[1] + rr(-6, 6), 5, 100), l: clamp(o[2] + rr(-5, 5), 6, 85), type: i % 2 ? 'wc' : 'oil', mix: MIXM[(R() * MIXM.length) | 0] }));
  pal.hue = pal[0].h; pal.name = MOOD_BAG[moodIx]; return pal;
}
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360 | 0},${s | 0}%,${clamp(l, 0, 100) | 0}%,${a})`;
const hueMix = (a, b, t) => ((a + (((b - a + 540) % 360) - 180) * t) % 360 + 360) % 360;
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2, d = hi - lo; let h = 0, s = 0; if (d > 1e-6) { s = d / (1 - Math.abs(2 * l - 1)); if (hi === r) h = (g - b) / d + (g < b ? 6 : 0); else if (hi === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; } return [h, s * 100, l * 100]; }
function mixAt(g, x, y, c) {   // paint blends with whatever paint is already there
  try {
    const cw = g.canvas.width, ch = g.canvas.height; if (x < 0 || y < 0 || x >= cw || y >= ch) return c;
    const d = g.getImageData(x | 0, y | 0, 1, 1).data, a = d[3]; if (a < 40) return c;
    const hs = rgb2hsl(d[0], d[1], d[2]), m = clamp(0.5 * (a / 255) * (c.type === 'wc' ? 1.25 : 1), 0, .85);
    return Object.assign({}, c, { h: c.s < 8 ? hs[0] : hueMix(c.h, hs[0], m), s: lerp(c.s, hs[1], m * .5), l: lerp(c.l, hs[2], m * .6) });
  } catch (e) { return c; }
}
function blobPts(r, irr, n) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, k = r * (1 + (R() - .5) * irr); p.push([Math.cos(a) * k, Math.sin(a) * k]); } return p; }
function smoothPath(g, p) { const n = p.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let s = m(p[n - 1], p[0]); g.beginPath(); g.moveTo(s[0], s[1]); for (let i = 0; i < n; i++) { const e = m(p[i], p[(i + 1) % n]); g.quadraticCurveTo(p[i][0], p[i][1], e[0], e[1]); } g.closePath(); }
function drawSplat(g, x, y, r, c0, ang, stretch) {
  const c = mixAt(g, x, y, c0); g.save(); g.translate(x, y); g.rotate(ang); g.scale(1 + stretch, 1 / (1 + stretch * .45));
  if (c.type === 'oil') {
    g.globalCompositeOperation = c.mix; g.fillStyle = hsl(c.h, c.s, c.l, .85); smoothPath(g, blobPts(r * 1.15, .7, 18)); g.fill();
    g.globalCompositeOperation = 'source-over'; g.fillStyle = hsl(c.h, c.s, c.l, .95); smoothPath(g, blobPts(r, .65, 18)); g.fill();
    g.save(); g.scale(.62, .62); g.translate(-r * .1, -r * .12); g.fillStyle = hsl(c.h, c.s - 5, c.l + 12, .55); smoothPath(g, blobPts(r, .6, 14)); g.fill(); g.restore();
  } else {
    g.globalCompositeOperation = c.mix; for (let i = 0; i < 4; i++) { g.fillStyle = hsl(c.h, c.s, Math.min(c.l + 8, 72), .3); const rq = r * (1.55 - i * .2); smoothPath(g, blobPts(rq, .65, 18)); g.fill(); }
  }
  g.globalCompositeOperation = 'source-over';
  const n = Math.floor(r * rr(.12, .3)); for (let i = 0; i < n; i++) { const sr = r * rr(.04, .2), d = r * rr(.8, 2.6), a = rr(-Math.PI / 2, Math.PI / 2); g.fillStyle = c.type === 'oil' ? hsl(c.h, c.s, c.l, .9) : hsl(c.h, c.s, Math.min(c.l + 8, 72), .6); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, sr, 0, TAU); g.fill(); }
  g.restore();
}
function drawImpact(g, x, y, R0, pal, ppmScale) {   // the big centre splash with radial spokes
  const o = pal.find(p => p.type === 'oil') || pal[0], w = pal.find(p => p.type === 'wc') || pal[1];
  drawSplat(g, x, y, R0 * 1.5, w, 0, 0); drawSplat(g, x, y, R0, o, R() * TAU, 0);
  const k = 12 + ((R0 / ppmScale * 22) | 0);
  for (let i = 0; i < k; i++) {
    const a = R() * TAU, len = R0 * rr(1.1, 2.6), col = mixAt(g, x, y, pal[(R() * pal.length) | 0]), w2 = R0 * rr(.04, .11);
    g.save(); g.translate(x, y); g.rotate(a); g.globalCompositeOperation = col.mix; g.fillStyle = hsl(col.h, col.s, col.l, col.type === 'wc' ? .7 : .92);
    g.beginPath(); g.moveTo(R0 * .3, -w2); g.quadraticCurveTo(len * .5, -w2 * .2, len, 0); g.quadraticCurveTo(len * .5, w2 * .2, R0 * .3, w2); g.closePath(); g.fill();
    g.beginPath(); g.arc(len + w2 * .5, 0, w2 * 1.4, 0, TAU); g.fill(); g.restore();
  }
}

// ============================================================ paint surfaces (walls, glass, floor, ceiling)
const surfs = [];
function mkSurf(name, cw, ch, ppm, geo, place, map, drips) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d', { willReadFrequently: true });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  place(m); m.renderOrder = 3; scene.add(m);
  const s = { name, c, g, t, ppm, map, drips, dirty: false, mesh: m }; surfs.push(s); return s;
}
const PPM = 44.5;
const SL = mkSurf('left', Math.round(L * PPM), Math.round(H * PPM), PPM, new THREE.PlaneGeometry(L, H), m => { m.position.set(-HW + 0.13, H / 2, zc); m.rotation.y = Math.PI / 2; }, p => [(-p.z / L) * L * PPM, (H - p.y) * PPM], true);
const SR = mkSurf('glass', Math.round(L * PPM), Math.round(H * PPM), PPM, new THREE.PlaneGeometry(L, H), m => { m.position.set(HW - 0.27, H / 2, zc); m.rotation.y = -Math.PI / 2; }, p => [(1 + p.z / L) * L * PPM, (H - p.y) * PPM], true);
const SF = mkSurf('floor', Math.round(W * PPM), Math.round(L * PPM), PPM, new THREE.PlaneGeometry(W, L), m => { m.position.set(0, 0.012, zc); m.rotation.x = -Math.PI / 2; }, p => [(p.x + HW) * PPM, (1 + p.z / L) * L * PPM], false);
const SC = mkSurf('ceil', Math.round(W * PPM), Math.round(L * PPM), PPM, new THREE.PlaneGeometry(W, L), m => { m.position.set(0, H - 0.012, zc); m.rotation.x = Math.PI / 2; }, p => [(p.x + HW) * PPM, (-p.z / L) * L * PPM], false);
const SE = mkSurf('end', 256, Math.round(256 * H / W), 64, new THREE.PlaneGeometry(W, H), m => { m.position.set(0, H / 2, -L + 0.05); }, p => [(p.x + HW) * 64, (H - p.y) * 64], false);

// ============================================================ gray (cutout card) + paint-on-him canvas
const GH = 2.0; const GAR = 0.2789;
const ALW = 300, ALH = 1076;
const paintC = document.createElement('canvas'); paintC.width = ALW; paintC.height = ALH;
const paintG = paintC.getContext('2d', { willReadFrequently: true });
const compC = document.createElement('canvas'); compC.width = ALW; compC.height = ALH; const compG = compC.getContext('2d');
const compT = new THREE.CanvasTexture(compC); compT.colorSpace = THREE.SRGBColorSpace; compT.anisotropy = 4;
let maskD = null, maskW = 0, maskH = 0, maskCenter = null;
const ALPPM = ALH / GH;
const alienS = { name: 'alien', c: paintC, g: paintG, ppm: ALPPM, drips: true, dirty: false, alien: true };
const card = new THREE.Mesh(new THREE.PlaneGeometry(1, GH, 1, 20), new THREE.MeshBasicMaterial({ map: compT, transparent: true, alphaTest: 0.4, fog: false }));
card.renderOrder = 4; scene.add(card);
const gshadowTex = ctex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(10,20,50,.75)'); r.addColorStop(1, 'rgba(10,20,50,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: gshadowTex, transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
function recomposite() { compG.globalCompositeOperation = 'source-over'; compG.clearRect(0, 0, ALW, ALH); compG.drawImage(V.cv, 0, 0, ALW, ALH); drawFaceOnCard(); compG.globalCompositeOperation = 'source-atop'; compG.drawImage(paintC, 0, 0); compG.globalCompositeOperation = 'source-over'; compT.needsUpdate = true; alienS.dirty = false; }
function buildMask(src) {
  const mw = 120, mh = Math.round(mw * ALH / ALW), c = document.createElement('canvas'); c.width = mw; c.height = mh; const g = c.getContext('2d', { willReadFrequently: true });
  const d = document.createElement('canvas'); d.width = mw; d.height = mh; const dg = d.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, mw, mh);
  for (let a = 0; a < 16; a++) { const ang = a / 16 * TAU; for (const rad of [3, 6]) dg.drawImage(c, Math.cos(ang) * rad, Math.sin(ang) * rad); }
  dg.drawImage(c, 0, 0);
  return { d: dg.getImageData(0, 0, mw, mh).data, w: mw, h: mh };
}
const VARS = []; let V = { cv: document.createElement('canvas'), mask: null, hx: 150, top: 3, hw: 160, hs: 1 };
const maskAt = (u, v) => { const m = V.mask; if (!m || u < 0 || u > 1 || v < 0 || v > 1) return 0; const x = Math.min(m.w - 1, (u * m.w) | 0), y = Math.min(m.h - 1, ((1 - v) * m.h) | 0); return m.d[(y * m.w + x) * 4 + 3]; };
function analyzeHead(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, ALW, 260).data; let top = -1, best = 0, bx = 150;
  for (let y = 0; y < 240; y++) { let a = -1, b = -1; for (let x = 0; x < ALW; x++) if (d[(y * ALW + x) * 4 + 3] > 40) { if (a < 0) a = x; b = x; } if (a >= 0) { if (top < 0) top = y; if (b - a > best) { best = b - a; bx = (a + b) / 2; } } }
  return { top: Math.max(0, top), hw: best, hx: bx };
}
function makeVariants(bases) {
  const defs = [[0, null, 1], [1, null, 1.03], [0, [205, 238, 214], .95], [1, [244, 218, 206], 1.07]];
  for (const [bi, tint, hs] of defs) {
    const cv = document.createElement('canvas'); cv.width = ALW; cv.height = ALH; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bases[bi], 0, 0, ALW, ALH);
    if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`; g.fillRect(0, 0, ALW, ALH); g.globalCompositeOperation = 'destination-in'; g.drawImage(bases[bi], 0, 0, ALW, ALH); g.globalCompositeOperation = 'source-over'; }
    VARS.push(Object.assign({ cv, hs, mask: buildMask(cv) }, analyzeHead(cv)));
  }
}


// ============================================================ expressions (gray's face reacts)
const FACES = window.__FACES || {}, faceImg = {}, faceTint = {};
for (const k in FACES) { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(190,228,242)'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(i, 0, 0); faceTint[k] = c; alienS.dirty = true; drawPortrait(); }; i.src = FACES[k].src; faceImg[k] = i; }
const X = { name: 'serious', until: 0 };
const pick = a => a[(R() * a.length) | 0];
function drawFaceOnCard() { const fd = FACES[X.name], ft = faceTint[X.name]; if (fd && ft) { const k = V.hw / 164; compG.drawImage(ft, V.hx - fd.cx * k, V.top - 1, fd.w * k, fd.h * k); } }
const portC = document.getElementById('face'), portG = portC ? portC.getContext('2d') : null;
function drawPortrait() {
  if (!portG) return; const fd = FACES[X.name], fi = faceImg[X.name], w = portC.width, h = portC.height; portG.clearRect(0, 0, w, h);
  if (!(fd && fi && fi.complete && fi.naturalWidth)) return;
  const sc = h / fd.h * 1.0; portG.drawImage(fi, w / 2 - fd.cx * sc, 0, fd.w * sc, fd.h * sc);
}
function express(name, ms) { if (!FACES[name]) return; X.name = name; X.until = performance.now() + (ms || 900); alienS.dirty = true; drawPortrait(); if (portC) { portC.classList.remove('hit'); void portC.offsetWidth; portC.classList.add('hit'); } }
function idleFace() { const d = A.dmg; return d < .15 ? 'serious' : d < .45 ? 'determined' : d < .75 ? 'angry' : 'scared'; }
function reactHit(d) {
  const tot = A.dmg; express(tot > .8 ? pick(['embarrassed', 'scared']) : d > .5 ? pick(['scared', 'sad', 'surprised']) : d > .15 ? pick(['angry', 'disgusted', 'confused']) : pick(['surprised', 'disgusted']), 800 + d * 700);
}
function updateFace() {
  if (A.state === 'walk') { if (performance.now() > X.until) { const f = idleFace(); if (f !== X.name) { X.name = f; alienS.dirty = true; drawPortrait(); } } if (portC) portC.style.opacity = 1; }
  else if (portC && A.state !== 'chick' && A.state !== 'gone') portC.style.opacity = 0;
}

// ============================================================ chicken (placeholder art)
const chickC = document.createElement('canvas'); chickC.width = 256; chickC.height = 256;
(function drawChicken() {
  const g = chickC.getContext('2d'); g.translate(128, 128);
  g.fillStyle = '#16301f'; for (let i = -2; i <= 2; i++) { g.save(); g.rotate(i * .35); g.beginPath(); g.ellipse(0, -62, 14, 52, 0, 0, TAU); g.fill(); g.restore(); }   // tail
  g.fillStyle = '#e8b63a'; for (const s of [-1, 1]) { g.fillRect(s * 22 - 4, 70, 8, 50); for (let k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(s * 22 + k * 14, 124, 12, 5, k * .3, 0, TAU); g.fill(); } }   // legs+toes
  let gr = g.createRadialGradient(-10, 0, 10, 0, 10, 95); gr.addColorStop(0, '#a63a1a'); gr.addColorStop(1, '#5e1a0b'); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 12, 70, 74, 0, 0, TAU); g.fill();   // body
  g.fillStyle = '#6a210f'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 62, 20, 22, 46, s * -.25, 0, TAU); g.fill(); }   // wings
  g.fillStyle = '#9c3418'; g.beginPath(); g.ellipse(0, -56, 36, 38, 0, 0, TAU); g.fill();   // head
  g.fillStyle = '#d3121c'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * 13, -94 + Math.abs(i) * 7, 12, 0, TAU); g.fill(); }   // comb
  g.beginPath(); g.ellipse(0, -28, 8, 14, 0, 0, TAU); g.fill();   // wattle
  g.fillStyle = '#f2b632'; g.beginPath(); g.moveTo(-9, -52); g.lineTo(9, -52); g.lineTo(0, -34); g.closePath(); g.fill();   // beak
  g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 17, -64, 7, 0, TAU); g.fill(); } g.fillStyle = '#111'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 17, -63, 3.4, 0, TAU); g.fill(); }
})();
const chickT = new THREE.CanvasTexture(chickC); chickT.colorSpace = THREE.SRGBColorSpace;
const chickWC = document.createElement('canvas'); chickWC.width = 256; chickWC.height = 256; { const g = chickWC.getContext('2d'); g.drawImage(chickC, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.82)'; g.fillRect(0, 0, 256, 256); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#d3121c'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(128 + i * 13, 34 + Math.abs(i) * 7, 12, 0, TAU); g.fill(); } g.fillStyle = '#111'; for (const sg of [-1, 1]) { g.beginPath(); g.arc(128 + sg * 17, 65, 3.4, 0, TAU); g.fill(); } }
const chickWT = new THREE.CanvasTexture(chickWC); chickWT.colorSpace = THREE.SRGBColorSpace;
const chick = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: chickT, transparent: true, alphaTest: 0.3, fog: false })); chick.visible = false; chick.renderOrder = 4; scene.add(chick);

// ============================================================ game state
const WHITE_ODDS = +(Q.get('white') || .2), PTS = { CHICK: 100, MELT: 100, WHITE: 3 }; const GOAL = +(Q.get('goal') || 5), STEP = 5; let CZ = 0, camV = 0;
const A = { state: 'none', id: 0, z: -(L - 5), x: 0.1, gh: GH, gw: GH * GAR, hs: 1, rotY: 0, ent: 1, ph: 0, creep: 0, d0: 12, bob: 0, dmg: 0, t: 0, stagger: 0, kn: 0, cT: 0, cx: 0, cz: 0 };
const S = { score: 0, won: false, started: false, over: false, lives: 3, chickens: 0, throws: 0, hits: 0, charge: 0, hold: false, pid: -1, fx: 0, fy: 0, ret: { x: innerWidth / 2, y: innerHeight * .42 }, sdir: 0, pal: makePalette(), shake: 0, firstThrow: false, flash: 0 };
const blobs = [], drips = [], parts = [], bubbles = [];
function spawnAlien() {
  const cz0 = CZ; A.state = 'walk'; A.id++; A.dmg = 0; A.t = 0; A.stagger = 0; A.kn = 0; A.creep = 0; A.ph = 0;
  V = VARS.length ? VARS[(A.id - 1 + (R() * 2 | 0)) % VARS.length] : V; A.hs = V.hs * rr(.97, 1.04); A.gh = GH * A.hs; A.gw = A.gh * GAR;
  const doors = DOORS.filter(d => d < cz0 - 8 && d > cz0 - 16);
  if (S.chickens % 2 === 0 && doors.length) { A.z = pickOne(doors) + .2; A.x = -HW + .65; A.ent = 0; A.rotY = .9; A.door = true; }
  else { A.z = cz0 - 16; A.x = .1; A.ent = 1; A.rotY = 0; A.door = false; }
  A.d0 = CZ - A.z; card.visible = true; shadow.visible = true; chick.visible = false; card.material.opacity = A.door ? 0 : 1;
  X.name = 'serious'; X.until = 0; drawPortrait(); paintG.clearRect(0, 0, ALW, ALH); recomposite(); setBar(0);
}
function pickOne(a) { return a[(R() * a.length) | 0]; }
const alienWorld = (u, v) => new THREE.Vector3(A.x + (u - .5) * A.gw * Math.max(.3, Math.cos(A.rotY)), v * A.gh + A.bob, A.z);

// ============================================================ audio (synth, no files)
let AC = null, master = null, lastPop = 0;
function aud() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .8; const cp = AC.createDynamicsCompressor(); master.connect(cp); cp.connect(AC.destination); } catch (e) { return null; } } if (AC.state === 'suspended') AC.resume(); return AC; }
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function noise(t, dur, type, f0, f1, vol) { const n = AC.sampleRate * dur, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = R() * 2 - 1; const s = AC.createBufferSource(); s.buffer = b; const f = AC.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); }
function tone(t, f, dur, type, vol, f2) { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0005, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05); }
let chargeSnd = null;
function sndCharge() { if (!aud()) return; const t = AC.currentTime, o = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o2.type = 'triangle'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(440, t + CHARGE_T); o2.frequency.setValueAtTime(220, t); o2.frequency.exponentialRampToValueAtTime(880, t + CHARGE_T); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + CHARGE_T); o.connect(g); o2.connect(g); g.connect(master); o.start(t); o2.start(t); chargeSnd = { stop() { const n = AC.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(.001, g.gain.value), n); g.gain.exponentialRampToValueAtTime(.001, n + .12); try { o.stop(n + .15); o2.stop(n + .15); } catch (e) { } } }; }
function sndStrum() { if (!AC) return; const t = AC.currentTime, n = [62, 66, 69, 74, 76, 78][(R() * 6) | 0]; tone(t, mtof(n), .35, 'triangle', .08); }
function sndThrow(c) { if (!AC) return; const t = AC.currentTime; tone(t, 140 - c * 50, .5 + c * .5, 'sine', .55 + .4 * c, 30); noise(t, .3 + c * .4, 'lowpass', 1800 + c * 2500, 120, .5 + .4 * c); noise(t, .05, 'highpass', 2500, 6500, .22); tone(t + .02, mtof(62 + (c > .6 ? 12 : 0)), .6, 'sawtooth', .06 * (.4 + c), 0); }
function sndPop(sz) { if (!AC) return; const t = AC.currentTime; if (t - lastPop < .04) return; lastPop = t; noise(t, .07, 'bandpass', rr(500, 1600), rr(150, 400), .16); tone(t, 180, .09, 'sine', .14, 70); if (sz > .09 && R() < .4) tone(t + .01, mtof([74, 76, 78, 81, 83][(R() * 5) | 0] + 12), .4, 'triangle', .05); }
function sndHit() { if (!AC) return; const t = AC.currentTime; tone(t, 90, .25, 'sine', .5, 40); noise(t, .12, 'lowpass', 900, 150, .5); }
function sndBawk() { if (!AC) return; const t = AC.currentTime; for (let i = 0; i < 3; i++) tone(t + i * .11, 520 - i * 40, .09, 'square', .09, 340); tone(t + .38, 640, .22, 'square', .08, 300); }
function sndLose() { if (!AC) return; const t = AC.currentTime; tone(t, 200, .8, 'sawtooth', .25, 45); noise(t, .6, 'lowpass', 1200, 80, .5); }

// ============================================================ fluid smoke overlay
let FL = null;
function startFluid() { try { if (window.SPSFluid) { SPSFluid.start({ z: 5, ignore: '.btn', idle: false }); SPSFluid.setColor(S.pal.hue, 1); FL = window.SPSFluid; } } catch (e) { } }
const projv = new THREE.Vector3();
function toScreen(p) { projv.copy(p).project(cam); return [(projv.x * .5 + .5) * innerWidth, (-projv.y * .5 + .5) * innerHeight, projv.z]; }
function smokeAt(x, y, dx, dy, hue, k) { if (FL && FL.on()) FL.splat(x, y, dx, dy, hue, k == null ? .55 : k); }

// ============================================================ HUD
const hud = document.getElementById('hud'), hg = hud.getContext('2d');
const barFill = document.getElementById('barFill'), elLives = document.getElementById('lives'), elChick = document.getElementById('chicks'), elMsg = document.getElementById('msg');
let VW = innerWidth, VH = innerHeight;
function sizeHud() { VW = innerWidth; VH = innerHeight; hud.width = VW * DPR; hud.height = VH * DPR; hud.style.width = VW + 'px'; hud.style.height = VH + 'px'; hg.setTransform(DPR, 0, 0, DPR, 0, 0); }
sizeHud();
const FIG = () => ({ x: VW / 2, y: VH - 118, r: 92 });
function setBar(v) { barFill.style.width = (clamp(v, 0, 1) * 100).toFixed(0) + '%'; }
function setLives() { elLives.textContent = '●'.repeat(S.lives) + '○'.repeat(3 - S.lives); }
const elScore = document.getElementById('score'); function setScore() { elScore.textContent = S.score.toLocaleString() + ' PTS'; }
function setChicks() { elChick.textContent = 'CHICKENS ' + S.chickens + '/' + GOAL; }
let msgT = 0; function say(t, ms = 1600) { elMsg.textContent = t; elMsg.style.opacity = 1; msgT = performance.now() + ms; }
function drawFigure(g, cx, cy, s, charge, pop) {
  g.save(); g.translate(cx, cy); const k = s * (1 + pop * .08 + charge * .04); g.scale(k, k);
  const glow = charge > 0 ? hsl(S.pal.hue, 100, 60, .25 + charge * .5) : null;
  if (glow) { const gr = g.createRadialGradient(0, -10, 10, 0, -10, 105); gr.addColorStop(0, glow); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-120, -130, 240, 260); }
  g.fillStyle = '#1a1a22'; g.beginPath(); g.moveTo(-22, 8); g.lineTo(22, 8); g.lineTo(26, 80); g.lineTo(6, 80); g.lineTo(0, 30); g.lineTo(-6, 80); g.lineTo(-26, 80); g.closePath(); g.fill();   // legs
  g.fillStyle = '#2b2236'; g.beginPath(); g.moveTo(-30, -52); g.lineTo(30, -52); g.lineTo(26, 14); g.lineTo(-26, 14); g.closePath(); g.fill();   // jacket
  g.fillStyle = '#e8c9a8'; g.beginPath(); g.arc(0, -72, 17, 0, TAU); g.fill();   // head
  g.fillStyle = '#e6c04a'; g.beginPath(); g.moveTo(-20, -70); g.quadraticCurveTo(-24, -100, 0, -96); g.quadraticCurveTo(24, -100, 20, -70); g.quadraticCurveTo(26, -42, 14, -34); g.lineTo(12, -66); g.quadraticCurveTo(0, -78, -12, -66); g.lineTo(-14, -34); g.quadraticCurveTo(-26, -42, -20, -70); g.fill();   // blond hair
  g.fillStyle = '#7a3b1a'; g.save(); g.rotate(-.5); g.beginPath(); g.ellipse(4, 12, 30, 22, 0, 0, TAU); g.fill(); g.fillStyle = '#2a1408'; g.beginPath(); g.arc(4, 12, 7, 0, TAU); g.fill(); g.fillStyle = '#4a2a14'; g.fillRect(28, 8, 52, 7); g.restore();   // guitar
  g.strokeStyle = '#e8c9a8'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(24, -40); g.lineTo(34, -6); g.stroke();   // strum arm
  g.restore();
}
let popT = 0;
function drawHud(dt) {
  hg.clearRect(0, 0, VW, VH); const f = FIG(), pop = Math.max(0, popT - performance.now()) / 220;
  if (S.hold || S.charge > 0) { hg.strokeStyle = 'rgba(255,255,255,.18)'; hg.lineWidth = 7; hg.beginPath(); hg.arc(f.x, f.y - 20, f.r, 0, TAU); hg.stroke(); hg.strokeStyle = hsl(S.pal.hue, 100, 62, 1); hg.lineWidth = 7; hg.lineCap = 'round'; hg.beginPath(); hg.arc(f.x, f.y - 20, f.r, -Math.PI / 2, -Math.PI / 2 + S.charge * TAU); hg.stroke(); if (S.charge >= 1) { hg.strokeStyle = hsl(S.pal.hue + 40, 100, 75, .6 + .4 * Math.sin(performance.now() / 60)); hg.beginPath(); hg.arc(f.x, f.y - 20, f.r + 8, 0, TAU); hg.stroke(); } }
  else { hg.strokeStyle = 'rgba(255,255,255,.35)'; hg.setLineDash([6, 8]); hg.lineWidth = 3; hg.beginPath(); hg.arc(f.x, f.y - 20, f.r, 0, TAU); hg.stroke(); hg.setLineDash([]); }
  drawFigure(hg, f.x, f.y, 1, S.charge, pop);
  if (S.started && !S.over && !S.won) { const b = joyBase(); hg.strokeStyle = 'rgba(255,255,255,.4)'; hg.lineWidth = 3; hg.beginPath(); hg.arc(b.x, b.y, b.r, 0, TAU); hg.stroke(); hg.fillStyle = 'rgba(255,255,255,.08)'; hg.fill();
    hg.fillStyle = 'rgba(255,255,255,.55)'; hg.font = '800 10px system-ui'; hg.textAlign = 'center'; hg.fillText('WALK', b.x, b.y - b.r - 8); hg.fillStyle = JOY.on ? 'rgba(255,225,74,.9)' : 'rgba(255,255,255,.35)'; hg.beginPath(); hg.arc(b.x + JOY.kx, b.y + JOY.ky, 19, 0, TAU); hg.fill(); }
  hg.fillStyle = 'rgba(255,255,255,.5)'; hg.font = '10px system-ui'; hg.textAlign = 'center'; hg.fillText('YOU (stand-in)', f.x, f.y + 96);
  if (S.hold) {
    const r = S.ret; hg.strokeStyle = hsl(S.pal.hue, 100, 70, .9); hg.lineWidth = 3; hg.beginPath(); hg.arc(r.x, r.y, 26 - S.charge * 8, 0, TAU); hg.stroke(); hg.beginPath(); hg.moveTo(r.x - 38, r.y); hg.lineTo(r.x - 12, r.y); hg.moveTo(r.x + 12, r.y); hg.lineTo(r.x + 38, r.y); hg.moveTo(r.x, r.y - 38); hg.lineTo(r.x, r.y - 12); hg.moveTo(r.x, r.y + 12); hg.lineTo(r.x, r.y + 38); hg.stroke();
    hg.strokeStyle = hsl(S.pal.hue, 100, 70, .3); hg.setLineDash([4, 8]); hg.beginPath(); hg.moveTo(f.x, f.y - 90); hg.lineTo(r.x, r.y); hg.stroke(); hg.setLineDash([]);
  }
  if (msgT && performance.now() > msgT) { elMsg.style.opacity = 0; msgT = 0; }
  for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.t -= dt; if (b.t <= 0) { b.el.remove(); bubbles.splice(i, 1); continue; } if (b.follow) { const p = toScreen(alienWorld(.5, .85)); b.x = p[0]; b.y = p[1]; } b.el.style.transform = `translate(${clamp(b.x, 90, VW - 90)}px,${b.y}px) translate(-50%,-100%) rotate(${b.rot}deg) scale(${1 + Math.sin(b.t * 30) * .04})`; }
}

// ============================================================ throw
function aimRay(nx, ny) { const v = new THREE.Vector3(nx, ny, .5).unproject(cam); return v.sub(cam.position).normalize(); }
function trace(O, D) {
  let best = { t: 1e9, kind: null };
  const test = (t, kind, p, extra) => { if (t > .15 && t < best.t) best = { t, kind, p: p.clone(), ...extra }; };
  const P = new THREE.Vector3();
  if (D.x < -1e-6) { const t = (-HW + .13 - O.x) / D.x; P.copy(O).addScaledVector(D, t); if (P.z < 0 && P.z > -L && P.y > 0 && P.y < H) test(t, 'surf', P, { surf: SL }); }
  if (D.x > 1e-6) { const t = (HW - .27 - O.x) / D.x; P.copy(O).addScaledVector(D, t); if (P.z < 0 && P.z > -L && P.y > 0 && P.y < H) test(t, 'surf', P, { surf: SR }); }
  if (D.y < -1e-6) { const t = (.012 - O.y) / D.y; P.copy(O).addScaledVector(D, t); if (P.z < 0 && P.z > -L && Math.abs(P.x) < HW) test(t, 'surf', P, { surf: SF }); }
  if (D.y > 1e-6) { const t = (H - .012 - O.y) / D.y; P.copy(O).addScaledVector(D, t); if (P.z < 0 && P.z > -L && Math.abs(P.x) < HW) test(t, 'surf', P, { surf: SC }); }
  if (D.z < -1e-6) { const t = (-L + .05 - O.z) / D.z; P.copy(O).addScaledVector(D, t); if (Math.abs(P.x) < HW && P.y > 0 && P.y < H) test(t, 'surf', P, { surf: SE }); }
  if (A.state === 'walk' && D.z < -1e-6) { const t = (A.z - O.z) / D.z; P.copy(O).addScaledVector(D, t); const cw = A.gw * Math.max(.3, Math.cos(A.rotY)), u = (P.x - (A.x - cw / 2)) / cw, v = (P.y - A.bob) / A.gh; if (t < best.t && maskAt(u, v) > 100) test(t, 'alien', P, { u, v }); }
  if (A.state === 'chick' && !A.melt && D.z < -1e-6) { const t = (chick.position.z - O.z) / D.z; P.copy(O).addScaledVector(D, t); if (Math.abs(P.x - chick.position.x) < .55 && Math.abs(P.y - chick.position.y) < .6) test(t, 'chick', P, {}); }
  return best;
}
function launch(nx, ny, c) {
  const pal = S.pal, O = cam.position, ctr = aimRay(nx, ny);
  const org = new THREE.Vector3(0, -.58, -.65).applyEuler(cam.rotation).add(O);
  const n = 26 + Math.round(c * 82), spread = .009 + c * c * .05; let hit = 0;
  const reg = trace(O, ctr); let centre = false;
  if (reg.kind === 'alien' && reg.v > .55 && reg.v < .82 && Math.abs(reg.u - .5) < .3 && c >= .5) centre = true;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, rd = Math.pow(R(), .7) * spread, D = ctr.clone(); const up = new THREE.Vector3(0, 1, 0), rt = new THREE.Vector3().crossVectors(D, up).normalize(), u2 = new THREE.Vector3().crossVectors(rt, D).normalize();
    D.addScaledVector(rt, Math.cos(a) * rd).addScaledVector(u2, Math.sin(a) * rd).normalize();
    const hitr = i === 0 ? reg : trace(O, D), col = pal[(R() * pal.length) | 0], dist = hitr.t < 1e8 ? hitr.t : 30;
    const size = .035 + Math.pow(R(), 2.4) * (.07 + c * .16), T = clamp(.3 + dist / 50, .34, .8) * rr(.9, 1.15);
    const b = { s: org.clone().add(new THREE.Vector3(rr(-.1, .1), rr(-.08, .08), 0)), kind: hitr.kind, surf: hitr.surf, p: hitr.p, u: hitr.u, v: hitr.v, aid: A.id, t: -R() * .08, T, col, size, c, arc: rr(.1, .5), cen: i === 0 && c > .3, emit: i < 5 };
    if (hitr.kind === 'alien') hit++;
    if (b.kind) blobs.push(b);
  }
  return { hitFrac: hit / n, centre, reg };
}
function bandValue(c) { return c < .15 ? .08 : c < .9 ? .08 + (c - .15) / .75 * .34 : .7; }
function doThrow(nx, ny, c) {
  c = clamp(c, 0.02, 1); S.throws++; S.firstThrow = true;
  const res = launch(nx, ny, c); sndThrow(c); popT = performance.now() + 220; S.shake = .18 + c * .5;
  try { navigator.vibrate && navigator.vibrate([Math.min(30 + c * 120, 160), 25, 20]); } catch (e) { }
  if (A.state === 'walk') {
    let dmg = res.centre ? 1 : res.hitFrac * bandValue(c) * 2.5;
    if (res.hitFrac > .05 || res.centre) { S.hits++; A.pendingDmg = (A.pendingDmg || 0) + dmg; A.pendingKn = c >= .9 && res.hitFrac > .12 ? 6 : 0; A.pendingAt = performance.now() + 380; }
    else { say('MISS', 700); express(pick(['proud', 'laughing', 'curious']), 900); }
  }
  S.pal = makePalette(); if (FL) FL.setColor(S.pal.hue, 1);
}
function applyDamage() {
  if (!A.pendingAt || performance.now() < A.pendingAt) return; const d = A.pendingDmg || 0; A.pendingAt = 0; A.pendingDmg = 0;
  if (A.state !== 'walk') return; A.dmg = Math.min(CHICK_AT, A.dmg + d); setBar(A.dmg); A.stagger = .45; sndHit(); reactHit(d); if (A.pendingKn) { A.kn = A.pendingKn; A.pendingKn = 0; }
  if (A.dmg >= CHICK_AT) toChicken();
}
function toChicken() {
  A.state = 'chick'; A.cT = 0; A.melt = 0; A.white = R() < WHITE_ODDS; chick.material.map = A.white ? chickWT : chickT; chick.material.needsUpdate = true; chick.scale.set(1, 1, 1); A.cx = A.x; A.cz = A.z; card.visible = false; shadow.visible = false; chick.visible = true; S.chickens++; setChicks(); sndBawk(); express('surprised', 1400);
  const p = toScreen(new THREE.Vector3(A.cx, .9, A.cz));
  for (let i = 0; i < 7; i++) smokeAt(p[0], p[1], rr(-60, 60), rr(-80, 20), S.pal[(R() * S.pal.length) | 0].h);
  for (let i = 0; i < 70; i++) parts.push({ p: new THREE.Vector3(A.cx + rr(-.2, .2), rr(.3, 1.4), A.cz + rr(-.2, .2)), v: new THREE.Vector3(rr(-2, 2), rr(.5, 3.5), rr(-1.5, 1.5)), t: 0, T: rr(.8, 1.6), col: new THREE.Color().setHSL((R() < .5 ? .02 : R()), .8, .5) });
  addBubble(A.white ? 'WHITE CHICKEN!' : 'BAWK!', true, 1.4, -6); const pts = PTS.CHICK * (A.white ? PTS.WHITE : 1); S.score += pts; setScore(); say(A.white ? 'WHITE CHICKEN! +' + pts : 'CHICKEN! +' + pts, 1600); setBar(1);
}
const featherGeo = new THREE.BufferGeometry(); const FP = 160;
featherGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FP * 3), 3)); featherGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FP * 3), 3));
const featherPts = new THREE.Points(featherGeo, new THREE.PointsMaterial({ size: .09, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false })); featherPts.frustumCulled = false; scene.add(featherPts);
const blobGeo = new THREE.BufferGeometry(); const BP = 420;
blobGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BP * 3), 3)); blobGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BP * 3), 3));
const dotTex = ctex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.7, 'rgba(255,255,255,.95)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const blobPtsMesh = new THREE.Points(blobGeo, new THREE.PointsMaterial({ size: .11, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, sizeAttenuation: true })); blobPtsMesh.frustumCulled = false; blobPtsMesh.renderOrder = 6; scene.add(blobPtsMesh);

// ---- landing: paint the surface / the gray
function meltChicken(b) {
  if (A.state !== 'chick' || A.melt) return; A.melt = 1; A.meltT = 0; const pts = PTS.MELT * (A.white ? PTS.WHITE : 1); S.score += pts; setScore(); sndPop(.3); sndBawk();
  const cp = chick.position, fp = new THREE.Vector3(cp.x, .012, cp.z), m = SF.map(fp), pl = S.pal;
  drawImpact(SF.g, m[0], m[1], .5 * SF.ppm, pl, SF.ppm); drawSplat(SF.g, m[0], m[1], .7 * SF.ppm, pl[(R() * pl.length) | 0], R() * TAU, .1); SF.dirty = true;
  const p = toScreen(new THREE.Vector3(cp.x, 1, cp.z)); for (let i = 0; i < 9; i++) smokeAt(p[0], p[1], rr(-60, 60), rr(-60, 30), pl[(R() * pl.length) | 0].h);
  for (let i = 0; i < 60; i++) parts.push({ p: new THREE.Vector3(cp.x + rr(-.2, .2), rr(.2, 1), cp.z + rr(-.2, .2)), v: new THREE.Vector3(rr(-1.6, 1.6), rr(.3, 2.8), rr(-1.2, 1.2)), t: 0, T: rr(.7, 1.4), col: new THREE.Color().setHSL(R(), .8, .55) });
  addBubble((A.white ? 'WHITE MELT! +' : 'MELTED! +') + pts, false, 1.3, -4, p[0], p[1] - 30);
}
function land(b) {
  if (b.kind === 'chick') { meltChicken(b); return; }
  const s = b.kind === 'alien' ? alienS : b.surf; let x, y, ppm = s.ppm, r;
  if (b.kind === 'alien') { if (b.aid !== A.id || A.state !== 'walk') return; x = b.u * ALW; y = (1 - b.v) * ALH; r = Math.min(b.size, .1) * ppm; }
  else { const m = s.map(b.p); x = m[0]; y = m[1]; r = b.size * ppm; }
  const ang = R() * TAU;
  if (b.cen) { drawImpact(s.g, x, y, r * (b.kind === 'alien' ? 2.0 : 2.6) * (1 + b.c * .8), S.pal, ppm); }
  else drawSplat(s.g, x, y, r, b.col, ang, .1 + .4 * R());
  if (s.drips && r > ppm * .05 && R() < .4 + b.c * .4) addDrip(s, x + (R() - .5) * r * .8, y + r * .45, r, b.col);
  s.dirty = true; sndPop(b.size);
  if (b.kind !== 'alien' && b.size > .07 && R() < .5) { const p = toScreen(b.p); if (p[2] < 1) smokeAt(p[0], p[1], rr(-40, 40), rr(-40, 40), b.col.h, .35); }
}
function addDrip(s, x, y, r, col) { if (drips.length > 130) return; drips.push({ s, x, y, x0: x, w: clamp(r * .22, 1.6, 7), reach: rr(.12, .7) * s.ppm * (s.alien ? .9 : 1.1), d: 0, col, t: -rr(.1, 1.2), v: rr(.1, .3) * s.ppm }); }
function stepDrips(dt) {
  for (let i = drips.length - 1; i >= 0; i--) {
    const d = drips[i]; d.t += dt; if (d.t < 0) continue; const m = Math.max(0, 1 - d.d / d.reach); const v = d.v * (.25 + .75 * m) * dt; d.y += v; d.d += v; d.x += (R() - .5) * .5 + (d.x0 - d.x) * .05;
    const g = d.s.g, w = Math.max(.7, d.w * (.3 + .7 * m)); g.fillStyle = hsl(d.col.h, d.col.s, d.col.l, .95); g.beginPath(); g.arc(d.x, d.y, w, 0, TAU); g.fill(); d.s.dirty = true;
    if (d.d >= d.reach || d.y > d.s.c.height) drips.splice(i, 1);
  }
}

// ============================================================ OH NO cue (flash + everyone yells)
function addBubble(text, follow, dur, rot, x, y) {
  const el = document.createElement('div'); el.className = 'bub'; el.textContent = text; document.getElementById('ui').appendChild(el);
  bubbles.push({ el, t: dur, follow, x: x || 0, y: y || 0, rot: rot || 0 });
}
function ohNo() {
  const f = document.getElementById('ohno'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  try { navigator.vibrate && navigator.vibrate([60, 30, 60]); } catch (e) { }
  if (A.state === 'walk') addBubble('OH NO!', true, 1.1, -5);
  const fg = FIG(); addBubble('OH NO!', false, 1.1, 4, fg.x + 70, fg.y - 130);
  if (FL) for (let i = 0; i < 6; i++) FL.splat(rr(.1, .9) * innerWidth, rr(.2, .7) * innerHeight, rr(-300, 300), rr(-300, 300), rr(0, 360));
  S.shake = .6;
}
document.getElementById('btnOhno').addEventListener('click', e => { e.stopPropagation(); ohNo(); });
document.getElementById('btnOhno').addEventListener('pointerdown', e => e.stopPropagation());

// ============================================================ input
function onDown(e) {
  if (!S.started || S.over) return; if (e.target.closest && e.target.closest('.btn')) return; const f = FIG();
  if (Math.hypot(e.clientX - f.x, e.clientY - (f.y - 20)) > f.r + 18 || S.hold) return;
  S.hold = true; S.pid = e.pointerId; S.charge = 0; S.fx = e.clientX; S.fy = e.clientY; S.moved = false; S.lastX = e.clientX; S.sdir = 0;
  S.ret.x = innerWidth / 2 + 30; S.ret.y = innerHeight * .44; sndCharge(); try { navigator.vibrate && navigator.vibrate(10); } catch (_) { }
  document.getElementById('hint').style.opacity = 0;
}
function onMove(e) {
  if (!S.hold || e.pointerId !== S.pid) return;
  if (!S.moved && Math.hypot(e.clientX - S.fx, e.clientY - S.fy) > 14) S.moved = true;
  if (S.moved) { S.ret.x = e.clientX; S.ret.y = e.clientY - 74; }
  const dx = e.clientX - S.lastX; if (Math.abs(dx) > 7) { const dir = Math.sign(dx); if (S.sdir && dir !== S.sdir) { S.charge = Math.min(1, S.charge + .055); sndStrum(); } S.sdir = dir; S.lastX = e.clientX; }
}
function onUp(e) {
  if (!S.hold || e.pointerId !== S.pid) return; S.hold = false; if (chargeSnd) { chargeSnd.stop(); chargeSnd = null; }
  const c = S.charge, nx = (S.ret.x / innerWidth) * 2 - 1, ny = -(S.ret.y / innerHeight) * 2 + 1; S.charge = 0; doThrow(nx, ny, c);
}
const JOY = { on: false, pid: -1, x: 0, y: 0, kx: 0, ky: 0 }, KEY = { x: 0, y: 0 }; let PX = 0;
const joyBase = () => ({ x: 62, y: VH - 96, r: 44 });
function joySet(e) { const b = joyBase(); let dx = e.clientX - b.x, dy = e.clientY - b.y; const m = Math.hypot(dx, dy); if (m > b.r) { dx *= b.r / m; dy *= b.r / m; } JOY.kx = dx; JOY.ky = dy; const nx = dx / b.r, ny = dy / b.r, mm = Math.hypot(nx, ny); if (mm < .18) { JOY.x = 0; JOY.y = 0; } else { JOY.x = nx; JOY.y = ny; } }
addEventListener('pointerdown', e => {
  if (!S.started || S.over || S.won || JOY.on || (e.target.closest && e.target.closest('.btn'))) return; const b = joyBase(), f = FIG();
  if (Math.hypot(e.clientX - b.x, e.clientY - b.y) > b.r + 26 || Math.hypot(e.clientX - f.x, e.clientY - (f.y - 20)) < f.r + 18) return;
  JOY.on = true; JOY.pid = e.pointerId; joySet(e); e.stopImmediatePropagation(); e.preventDefault();
}, true);
addEventListener('pointermove', e => { if (JOY.on && e.pointerId === JOY.pid) { joySet(e); e.stopImmediatePropagation(); } }, true);
const joyEnd = e => { if (JOY.on && e.pointerId === JOY.pid) { JOY.on = false; JOY.x = JOY.y = JOY.kx = JOY.ky = 0; e.stopImmediatePropagation(); } };
addEventListener('pointerup', joyEnd, true); addEventListener('pointercancel', joyEnd, true);
const KM = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }; const KD = {};
addEventListener('keydown', e => { if (KM[e.code]) { KD[e.code] = 1; kUpd(); e.preventDefault(); } }); addEventListener('keyup', e => { if (KM[e.code]) { delete KD[e.code]; kUpd(); } });
function kUpd() { KEY.x = KEY.y = 0; for (const c in KD) { KEY.x += KM[c][0]; KEY.y += KM[c][1]; } }
addEventListener('pointerdown', onDown, true); addEventListener('pointermove', onMove, true); addEventListener('pointerup', onUp, true); addEventListener('pointercancel', onUp, true);
addEventListener('contextmenu', e => e.preventDefault());

// ============================================================ main loop
let last = performance.now(), T0 = 0; const bpos = blobGeo.attributes.position.array, bcol = blobGeo.attributes.color.array, fpos = featherGeo.attributes.position.array, fcol = featherGeo.attributes.color.array;
const tmpC = new THREE.Color();
function frame(now) {
  requestAnimationFrame(frame); let dt = Math.min((now - last) / 1000, .05); last = now; if (!S.started) { comp.render(); drawHud(dt); return; } T0 += dt;
  if (S.hold) S.charge = Math.min(1, S.charge + dt / CHARGE_T);
  // alien
  if (A.state === 'walk') {
    A.t += dt; const dist = CZ - A.z, prog = 1 - (dist - 1.2) / Math.max(1, A.d0 - 1.2), v = (1.05 + clamp(prog, 0, 1) * 1.1) * SPEED * (A.stagger > 0 ? .15 : 1) * (A.ent < 1 ? .6 : 1); A.stagger = Math.max(0, A.stagger - dt);
    if (A.ent < 1) { A.ent = Math.min(1, A.ent + dt / 1.4); }
    const se = A.ent * A.ent * (3 - 2 * A.ent);
    A.z += v * dt; if (A.kn > 0) { const k = Math.min(A.kn, 14 * dt); A.z -= k; A.kn -= k; }
    A.ph += dt * (4.2 + v * 1.1); A.bob = Math.abs(Math.sin(A.ph)) * .05;
    const tx = .1 + (CAM0.x + PX - .1) * .6 * se + Math.sin(A.t * .9) * .3 * se; A.x = A.door ? lerp(-HW + .65, tx, se) : tx; A.rotY = A.door ? .9 * (1 - se) : 0;
    card.material.opacity = A.door ? clamp(A.t * 3, 0, 1) : 1;
    card.position.set(A.x, A.gh / 2 + A.bob, A.z); card.rotation.set(0, A.rotY, Math.sin(A.ph) * .035); shadow.position.set(A.x, .02, A.z + .02); card.scale.set(A.gw, A.hs, 1);
    { const pa = card.geometry.attributes.position, bp = card.userData.bp || (card.userData.bp = pa.array.slice()), sw = Math.sin(A.ph); for (let i = 0; i < pa.count; i++) { const by = bp[i * 3 + 1], vv = (by + GH / 2) / GH, w = Math.pow(Math.max(0, 1 - vv / .56), 1.3); pa.array[i * 3] = bp[i * 3] + sw * .2 * w * (A.ent < 1 ? .7 : 1) + Math.sin(A.ph * .5) * .03 * vv; } pa.needsUpdate = true; }
    if (A.z > CZ - 1.15) { gotYou(); }
  } else if (A.state === 'chick') {
    A.cT += dt;
    if (A.melt) { A.meltT += dt; const m = clamp(A.meltT / .7, 0, 1); chick.scale.set(1 + m * .6, Math.max(.02, 1 - m), 1); chick.position.y = .62 * (1 - m) + .05; chick.position.x = A.cx; if (m >= 1) { chick.visible = false; chick.scale.set(1, 1, 1); A.state = 'wait'; A.cT = 0; } }
    else { const fl = clamp((A.cT - 3.4) / 1.4, 0, 1), hop = Math.abs(Math.sin(A.cT * 7)) * (A.cT < 3.4 ? .14 : .4); chick.position.set(A.cx + Math.sin(A.cT * 3) * .18, .62 + hop + fl * 2.6, A.cz - fl * 9); chick.scale.setScalar(1 - fl * .55); chick.rotation.z = Math.sin(A.cT * 9) * .12; if (A.cT > 4.8) { chick.visible = false; A.state = 'wait'; A.cT = 0; } }
  } else if (A.state === 'wait') { A.cT += dt; if (A.cT > 1.4) { if (S.chickens >= GOAL) { S.open = true; A.state = 'clear'; card.visible = false; shadow.visible = false; say('THE WAY IS CLEAR - WALK TO THE CONTROL ROOM', 3600); } else spawnAlien(); } }
  if (A.state === 'gone') { A.cT += dt; if (A.cT > 1.6 && !S.over) spawnAlien(); }
  applyDamage(); updateFace();
  // blobs in flight
  let bi = 0; for (let i = blobs.length - 1; i >= 0; i--) {
    const b = blobs[i]; b.t += dt; if (b.t < 0) continue; const u = b.t / b.T;
    if (u >= 1) { land(b); blobs.splice(i, 1); continue; }
  }
  for (const b of blobs) { if (bi >= BP) break; const u = clamp(b.t / b.T, 0, 1); if (b.t < 0) { bpos[bi * 3] = bpos[bi * 3 + 1] = bpos[bi * 3 + 2] = 9999; bi++; continue; } const e = 1 - Math.pow(1 - u, 1.8);
    const tgt = b.kind === 'alien' ? alienWorld(b.u, b.v) : b.kind === 'chick' ? chick.position : b.p; const px = lerp(b.s.x, tgt.x, e), py = lerp(b.s.y, tgt.y, e) + Math.sin(u * Math.PI) * b.arc, pz = lerp(b.s.z, tgt.z, e);
    bpos[bi * 3] = px; bpos[bi * 3 + 1] = py; bpos[bi * 3 + 2] = pz; tmpC.setHSL(((b.col.h % 360) + 360) % 360 / 360, b.col.s / 100, clamp(b.col.l / 100, .2, .72)); bcol[bi * 3] = tmpC.r * 1.15; bcol[bi * 3 + 1] = tmpC.g * 1.15; bcol[bi * 3 + 2] = tmpC.b * 1.15;
    if (b.emit && FL) { const sp = toScreen(projv.set(px, py, pz)); const pv = b._ps; if (pv && sp[2] < 1) smokeAt(sp[0], sp[1], (sp[0] - pv[0]) * .7, (sp[1] - pv[1]) * .7, b.col.h, .3); b._ps = sp; }
    bi++; }
  for (let k = bi; k < BP; k++) bpos[k * 3] = bpos[k * 3 + 1] = bpos[k * 3 + 2] = 9999; blobGeo.attributes.position.needsUpdate = true; blobGeo.attributes.color.needsUpdate = true;
  // feathers
  let fi = 0; for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; if (p.t > p.T) { parts.splice(i, 1); continue; } p.v.y -= 4 * dt; p.p.addScaledVector(p.v, dt); if (fi < FP) { fpos[fi * 3] = p.p.x; fpos[fi * 3 + 1] = p.p.y; fpos[fi * 3 + 2] = p.p.z; fcol[fi * 3] = p.col.r; fcol[fi * 3 + 1] = p.col.g; fcol[fi * 3 + 2] = p.col.b; fi++; } }
  for (let k = fi; k < FP; k++) fpos[k * 3] = fpos[k * 3 + 1] = fpos[k * 3 + 2] = 9999; featherGeo.attributes.position.needsUpdate = true; featherGeo.attributes.color.needsUpdate = true;
  stepDrips(dt);
  for (const s of surfs) if (s.dirty) { s.t.needsUpdate = true; s.dirty = false; }
  if (alienS.dirty) recomposite();
  // camera shake
  S.shake = Math.max(0, S.shake - dt * 2.2); {
    if (S.won) { const nz = CZ + (-(L - 3.4) - CZ) * Math.min(1, dt * 1.5); camV = (CZ - nz) / Math.max(dt, 1e-3); CZ = nz; PX += (0 - PX) * Math.min(1, dt * 2); }
    else if (S.started && !S.over) {
      const jx = JOY.x + KEY.x, jy = JOY.y + KEY.y, m = Math.hypot(jx, jy), k = m > 1 ? 1 / m : 1, sp = 2.7 * k;
      PX = clamp(PX + jx * sp * dt * .85, -1.55, 1.2);
      const gate = S.chickens >= GOAL ? -(L - 3) : -(STEP * 1.4 * S.chickens + 7), ncz = clamp(CZ + jy * sp * dt, gate, 0); camV = (CZ - ncz) / Math.max(dt, 1e-3); CZ = ncz;
      if (S.open && CZ <= -(L - 4.6)) winLevel();
    } else camV = 0;
  }
  cam.position.set(CAM0.x + PX + (R() - .5) * S.shake * .04, CAM0.y + (R() - .5) * S.shake * .04 + Math.sin(T0 * 9) * .016 * Math.min(1, Math.abs(camV) / .6), CZ);
  comp.render(); drawHud(dt);
}
function gotYou() {
  A.state = 'gone'; A.cT = 0; express(pick(['laughing', 'excited']), 1600); card.visible = false; shadow.visible = false; S.lives--; setLives(); sndLose(); S.shake = 1; try { navigator.vibrate && navigator.vibrate([200, 60, 200]); } catch (e) { }
  const f = document.getElementById('hurt'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  if (S.lives <= 0) { S.over = true; document.getElementById('over').style.display = 'flex'; document.getElementById('overTxt').textContent = S.score.toLocaleString() + ' PTS  ·  CHICKENS: ' + S.chickens; } else say('HE GOT TO YOU', 1500);
}
function winLevel() {
  S.won = true; A.state = 'won'; say('MASTER CONTROL ROOM', 2600); setTimeout(() => { document.getElementById('winTxt').textContent = S.score.toLocaleString() + ' PTS  ·  CHICKENS ' + S.chickens; document.getElementById('win').style.display = 'flex'; }, 3200);
}
function restart() { S.score = 0; setScore(); S.won = false; S.open = false; PX = 0; JOY.on = false; JOY.x = JOY.y = 0; CZ = 0; document.getElementById('win').style.display = 'none'; S.lives = 3; S.chickens = 0; S.over = false; S.charge = 0; S.hold = false; setLives(); setChicks(); document.getElementById('over').style.display = 'none'; for (const s of surfs) { s.g.clearRect(0, 0, s.c.width, s.c.height); s.t.needsUpdate = true; } blobs.length = 0; drips.length = 0; spawnAlien(); }
document.getElementById('btnRetry').addEventListener('click', restart); document.getElementById('btnAgain').addEventListener('click', restart);
function begin() { if (S.started) return; S.started = true; aud(); document.getElementById('start').style.display = 'none'; startFluid(); spawnAlien(); setLives(); setChicks(); document.getElementById('hint').style.opacity = 1; }
document.getElementById('btnStart').addEventListener('click', begin);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); comp.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); sizeHud(); });

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
Promise.all([loadImg(GRAY_SRC), loadImg(window.__GRAY2_SRC || './gray2.webp')]).then(bases => {
  makeVariants(bases); V = VARS[0]; recomposite(); card.visible = false; shadow.visible = false; window.__ready = true; document.getElementById('btnStart').disabled = false; document.getElementById('btnStart').textContent = 'TAP TO START'; if (Q.get('auto')) begin();
});
requestAnimationFrame(frame);
window.__t = { meltChicken,  get CZ() { return CZ; }, get PX() { return PX; }, JOY, KEY, VARS, winLevel, setCZ: z => { CZ = z; }, X, express, S, A, blobs, doThrow, ohNo, begin, aimRay, trace, surfs, spawnAlien, toChicken, cam, setZ: z => { A.z = z; } };

if (HOST) { for (const [id, f] of [['btnDone', () => finish(true)], ['btnEnd', () => finish(false)], ['btnSkip', () => finish(false)]]) { const b = document.getElementById(id); b.style.display = ''; b.addEventListener('click', f); } }
