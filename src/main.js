// County Road 9 — v4.3 "Missing Time": AIM & BEAM. One finger: touch and hold on the ship to fire the guitar beam, drag to aim the
// reticle (it floats above your fingertip). Hold the beam on a gray ~5 s and it pops into a cow. Ships dive and weave in real depth.
// Waves: 1 big slow ship, 1 fast ship, 2 at once, then 2-and-2 back to back (DOT: never more than 2 ships on screen). Kills are earned (no timer melts). Finale: chorus, dancing cows, rank, high score.
import './style.css';
import { A, loopPoints, stemSync, stemBeam, hasStem, STEM, prefetch, unlock, decodeAll, play, pick, ramp, seekAndPlay, stopAll, Song, songMuffle, songDuck, songWarp } from './audio.js';
import { G, THREE, VH, initRenderer, toScreen, toWorld, updateCamera, loadTextures, subTex, sprite, canvasTex, makeParticles, CELL, makeFaceMat, makeMorphMat, MORPH_T, MAXP, makeBeam, GF, makePaintPass, PAINT_ON } from './gfx.js';
import { AT, buildAtmos, swayMat, updateAtmos } from './atmos.js';
import BEATS from './beats.json';
import COWS from './cows_meta.json';
import VO from './vo.json'; // v4.5 IKE's CB narration slots + captions
import { fetchBoard, postScore, renderBoard, rivalLine, cleanName, validName, NAME_MAX, scoreOf, round2, canPost, SCORE, multOf } from './board.js';
import { L2, initL2, cutscene, enterShip, endCard, fleeSfx, leaveShip } from './l2.js';
import PKG from '../package.json'; // v4.5.2: the build version baked into the bundle (version.json is written from the same file)
import MAN from './manifest.json'; // v4.5: the ONE cow sheet (built by tools/make_cow_sheet.py from src/cows.json)
const CF = COWS.frames, CC = COWS.cfg;

const $ = (id) => document.getElementById(id);
// ---------- p4g (v4.7.0) PAUSE: ONE game clock + pausable timers ----------
// NOW() is performance.now() minus every millisecond spent paused (and frozen while paused), so every game timer in this file (first-kill clock S.runT0, hit-stop, slow-mo, VO queue,
// cooldowns...) simply does not advance while the pause menu is up. setTimeout/clearTimeout below shadow the globals for this module only: pending timers are frozen with their
// remaining time on pause and re-armed on resume. (The 3-2-1 countdown and the "Sure?" timeout use the raw timers.) Nothing changes when the game is never paused (total stays 0).
const PZ = { on: false, t0: 0, total: 0 };
const NOW = () => (PZ.on ? PZ.t0 : performance.now()) - PZ.total;
const rawST = window.setTimeout.bind(window), rawCT = window.clearTimeout.bind(window);
const TQ = new Map(); let TID = 1e9;
function tqArm(id, e) { e.due = NOW() + e.rem; e.h = rawST(() => { TQ.delete(id); e.fn(...e.args); }, e.rem); }
function setTimeout(fn, ms, ...args) { ms = Math.max(0, +ms || 0); if (typeof fn !== 'function') return rawST(fn, ms); const id = ++TID, e = { fn, args, rem: ms, due: 0, h: 0 }; TQ.set(id, e); if (PZ.on) e.rem = ms; else tqArm(id, e); return id; }
function clearTimeout(id) { const e = TQ.get(id); if (e) { rawCT(e.h); TQ.delete(id); } else rawCT(id); }
const tqFreeze = () => { for (const e of TQ.values()) { rawCT(e.h); e.rem = Math.max(0, e.due - NOW()); } };
const tqThaw = () => { for (const [id, e] of TQ) tqArm(id, e); };
const tqClear = () => { for (const e of TQ.values()) rawCT(e.h); TQ.clear(); };
let RUN_MODE; // the mode the current run was started with (RESTART replays it)
const Q = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const BT = BEATS.beats_s; const BEAT = 60 / BEATS.tempo_bpm;
const PAL = [[0.62, 1, 0.12], [0.55, 0.2, 0.95], [0.15, 0.5, 1], [1, 0.3, 0.8], [1, 0.58, 0.12], [1, 0.92, 0.2]];
const bIdx = (t) => { const i = BT.findIndex((b) => b >= t); return i < 0 ? BT.length - 1 : i; };
const vib = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const SONG_RUN = 0.95; // song level during the drive/fight (clean route; the -2 dB master trim is in audio.js)
const START_T = 19.5, // v4.4 DANA/REX: lands on a beat 0.3 s before Daniel's first word (19.80 s)
  ENGINE_LVL = 0.5, MAX_PARADE = 8;
const FIRST_WAVE_AT = 1.4; // s after the drive starts: horn, then ship 1 swoops in (1.5 s fly-in)
const LOCK_S = 5, RET_DY = 110;
const lockSec = (w) => (w <= 1 ? 3 : w <= 3 ? 4 : 5); // p4e Chico: real seconds of beam to pop a gray - waves 1-2: 3 s, 3-4: 4 s, 5: 5 s (L stays on the 0..LOCK_S face/ring scale)
// pass 3 (Daniel) TOUCH PAD: the bottom dashboard strip is a relative pad. ONE gain constant (Chico's too-easy check may only lower it)
const PAD_GAIN = 2.5, PAD_ACCEL = 0.2, PAD_H = 0.22; // gain x finger travel; up to +20% on fast flicks; pad = bottom 22% of the screen
 // seconds of beam to pop a gray; the reticle floats this many CSS px above the fingertip
// v4.5 SHRED meter: fills from beam-lock seconds, kills and streaks (+ a slow trickle while a wave is up). Full -> SHRED! button -> ~6 s HYPER MODE.
const SHRED = { passive: 1.4, lock: 4.0, kill: 12, streak: 5 }, HYPER_S = 6, HYPER_RATE = LOCK_S / 1.5; // HYPER: lock 3.3x faster (a gray dies in ~1.5 s), every gray on screen gets hit
// REX's files (swappable names). Until a slot's file is in the pack, the synth stand-in plays.
const SND = { shredStart: 'GTR_Shred_Hyper_Start', shredLoop: 'GTR_Shred_Hyper_Loop', shredEnd: 'GTR_Shred_Hyper_End', boardSting: 'FIGHT_HighScore_Sting_G' };
const BILLBOARD = { on: true, text: ['COWS MISSING:', 'TOO MANY'] }; // v4.5 story hook (IKE owns the final text): a roadside billboard in the drive intro
const MAX_SHIPS = 2; // DOT: at most 2 ships on screen at once
// man: maneuver weights. size: saucer width in metres. speed scales maneuver tempo. time: wave timeout (ships escape, no free kills).
// call: IKE's wave callout. label: the HUD wave number (v4.3 DANA: real count 1/5..5/5; the 2-and-2 swarm is waves 4 and 5, back to back). chain: starts 0.5 s after the previous pair.
const WAVES = [
  { n: 1, size: 3.4, speed: 0.55, time: 12, man: { hover: 0.5, strafe: 0.35, pull: 0.1, dive: 0.05 }, call: 'HERE IT COMES!', label: '1/5', lines: ['Back to the pasture!'] },
  { n: 1, size: 2.1, speed: 1.05, time: 24, man: { hover: 0.2, strafe: 0.4, pull: 0.2, dive: 0.2 }, call: 'A FAST ONE!', label: '2/5', lines: ['Moo-ve over, buddy!'] },
  { n: 2, size: 2.0, speed: 0.95, time: 28, man: { hover: 0.25, strafe: 0.35, pull: 0.2, dive: 0.2 }, call: "TWO OF 'EM!", label: '3/5', lines: ['Udderly saved!'] },
  { n: 2, size: 1.9, speed: 1.0, time: 24, man: { hover: 0.25, strafe: 0.35, pull: 0.2, dive: 0.2 }, call: 'THEY BROUGHT FRIENDS!', label: '4/5', lines: ['Herd you the first time!'] },
  { n: 2, size: 1.9, speed: 1.05, time: 24, man: { hover: 0.25, strafe: 0.35, pull: 0.2, dive: 0.2 }, call: 'AND MORE FRIENDS!', label: '5/5', chain: true, lines: ["That's the whole herd!"] },
];
const TOTAL_GRAYS = WAVES.reduce((a, w) => a + w.n, 0);
const RANKS = [[0, 'Roadside Rookie'], [3, 'County Road Preacher'], [6, 'Soul Rancher'], [8, 'Legend of County Road 9']]; // v4.3: souls = kills (1:1). Rookie 0-2, Preacher 3-5, Rancher 6-7, Legend 8 (every soul)
const PB_Z = 4.2; // POINT BLANK: a kill while the ship is this close (metres) — i.e. mid-dive, right in your face
const WIN_LINES = ['ANOTHER SOUL SAVED!'];

// v4.5.2 stale-copy defense: an old tab (bfcache / restored session) compares its baked version with /version.json (no-store) and reloads if it is stale
const BUILD_V = PKG.version; let verBusy = false, STALE = null; // p4h: a newer build only SETS STALE; the page reloads when the player taps the update button (title / end card), never by itself
async function versionCheck() { if (verBusy || Q.get('nover')) return; verBusy = true;
  try { const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && j.v && j.v !== BUILD_V) { console.warn('stale build', BUILD_V, '->', j.v); STALE = j.v; } } } catch (e) {} finally { verBusy = false; } }
versionCheck(); document.addEventListener('visibilitychange', () => { if (!document.hidden) versionCheck(); }); window.addEventListener('pageshow', (e) => { if (e.persisted) versionCheck(); });
const S = { state: 'boot', steer: 0, steerT: 0, souls: 0, bi: 0, laughs: 0, hold: false, finger: null, aimW: [0, 300], par: 0 };
window.__cr9 = { S, A, Song, G, BT };

// ---------- scene ----------
const renderer = initRenderer($('gl'), Q.get('q'));
const scene = G.scene;
const ART = [['sky', 'bg_sky.webp'], ['mesa', 'bg_mesa.webp'], ['ground', 'bg_ground.webp'], ['faces', 'gray_atlas.webp'], ['cows', 'cows_sheet.webp'], ['cowsSdf', 'cows_sdf.png', { linear: true }],
  ['saucer', 'saucer.webp'], ['fx', 'fx.webp'], ['brush', 'brush.webp'], ['desert', 'bg_land.webp'], ['mnProps', 'mn_props.webp'], ['moon', 'moon.webp'], ['saguaro', 'saguaro.webp'], ['dash', 'dash.webp'], ['sign', 'sign.webp'], ['hero', 'hero.webp'],
  ['dlr', 'dlr_painting.webp'], ['heroUp', 'hero_overhead.webp'], ['heroBang', 'hero_headbang.webp'], ['heroFlinch', 'hero_flinch.webp']]; // v4.2: Daniel's pose frames (swapped on his ONE sprite)
// Daniel's poses: texture, sprite size (world units, 0.6456 per texture px), soundhole (texture px) -> beam origin. Measured by tools/make_poses.py.
const POSES = { idle: { tex: 'hero', w: 632, h: 992, hole: [182, 454] }, up: { tex: 'heroUp', w: 720, h: 1024, hole: [241, 212] }, bang: { tex: 'heroBang', w: 720, h: 1024, hole: [213, 382] }, flinch: { tex: 'heroFlinch', w: 720, h: 1024, hole: [178, 360] } };
const W = {}; let P;
const GR = []; // two grays (one per saucer slot; DOT: max 2 ships on screen): face quad + own paint layer + own expression state
const glowTex = () => subTex(G.tex.fx, [0, 0, 128, 128], 512, 512);
const F = 600, HZ = 21; const truckX = () => S.steer * 0.8;
const proj = (X, z) => [-10 + F * (X - truckX()) / z, HZ - F / z];
const proj3 = (X, Y, z) => [-10 + F * (X - truckX()) / z, HZ + F * (Y - 1) / z]; // camera 1 m above the road
// ---------- p4f MINNESOTA: the right shoulder (north side). ONE InstancedMesh = +1 draw call for up to 30 props (pines, fence, corn, hay), each a rect of the 512x512 mn_props atlas
// chosen per instance (aRect). Same sway shader idea as swayMat (gusts bend the crowns). The left shoulder keeps its saguaros + scrub (props above); the horizon band (bg_land) has Arizona left of centre, Minnesota right.
const MN_RECT = { pine1: [0, 0, 170, 320], pine2: [170, 0, 170, 320], pine3: [340, 0, 172, 256], fence: [0, 320, 256, 96], corn: [272, 320, 96, 192], hay: [384, 320, 128, 96] }, MN_MAX = 30;
function buildMinnesota(T) {
  const rr = Math.random, L = []; let n = 0;
  const add = (k, X, h, z) => L.push({ k, X, h, z, asp: MN_RECT[k][2] / MN_RECT[k][3], flip: rr() < 0.5 ? -1 : 1, i: n++ });
  for (let i = 0; i < 16; i++) add(['pine1', 'pine2', 'pine3'][i % 3], (i % 4 === 3 ? 2.55 : 2.9) + rr() * (i % 2 ? 1.1 : 3.4), 2.4 + rr() * 2.2, 0.7 + ((i + rr() * 0.8) / 16) * 30); // dark pines
  for (let i = 0; i < 6; i++) add('fence', 2.3 + rr() * 0.25, 0.85, 2 + (i / 6) * 30 + rr() * 2); // farm fence along the shoulder
  for (let i = 0; i < 5; i++) add('corn', 3.1 + rr() * 1.2, 1.5 + rr() * 0.4, 1 + (i / 5) * 30 + rr() * 3); // a cornfield edge
  for (let i = 0; i < 3; i++) add('hay', 3.4 + rr() * 1.6, 0.8, 5 + (i / 3) * 30 + rr() * 4); // hay bales
  const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); W.mnRect = new THREE.InstancedBufferAttribute(new Float32Array(MN_MAX * 4), 4); g.setAttribute('aRect', W.mnRect);
  const mat = new THREE.MeshBasicMaterial({ map: T.mnProps, transparent: true, depthTest: false, depthWrite: false });
  mat.onBeforeCompile = (sh) => { sh.uniforms.uSway = AT.sway; sh.uniforms.uSwayK = { value: 0.45 };
    sh.vertexShader = 'attribute vec4 aRect; uniform float uSway; uniform float uSwayK;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = aRect.xy + uv * aRect.zw;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  float hh = clamp(uv.y, 0., 1.); transformed.x += uSway * uSwayK * hh * hh * 60. / max(length(instanceMatrix[0].xyz), 1.);'); };
  mat.customProgramCacheKey = () => 'mnprops';
  W.mn = new THREE.InstancedMesh(g, mat, MN_MAX); W.mn.renderOrder = 3; W.mn.frustumCulled = false; W.mn.count = L.length; W.mnT = L; W.drive.add(W.mn);
  const m0 = new THREE.Matrix4().makeScale(0, 0, 0), c0 = new THREE.Color(1, 1, 1); for (let i = 0; i < MN_MAX; i++) { W.mn.setMatrixAt(i, m0); W.mn.setColorAt(i, c0); }
}
const _mn4 = new THREE.Matrix4(), _mnC = new THREE.Color();
function mnUpdate(speed, dt) { const L = W.mnT; if (!L) return;
  for (const t of L) { t.z -= speed * dt; if (t.z < 0.7) t.z += 30; }
  L.sort((a, b) => b.z - a.z); // far -> near inside the one draw call
  for (let i = 0; i < L.length; i++) { const t = L[i], z = t.z, fade = smooth(32, 27, z), hgt = F / z * t.h * fade, [x, y] = proj(t.X, z), r = MN_RECT[t.k];
    _mn4.makeScale(hgt * t.asp * t.flip, Math.max(hgt, 1e-3), 1); _mn4.setPosition(x, y, 0); W.mn.setMatrixAt(i, _mn4);
    W.mnRect.setXYZW(i, r[0] / 512, 1 - (r[1] + r[3]) / 512, r[2] / 512, r[3] / 512); _mnC.setScalar(clamp(1.6 / z + 0.28, 0.28, 1)); W.mn.setColorAt(i, _mnC); }
  W.mn.instanceMatrix.needsUpdate = true; W.mn.instanceColor.needsUpdate = true; W.mnRect.needsUpdate = true; }
function buildScene() {
  const T = G.tex;
  W.drive = new THREE.Group(); scene.add(W.drive);
  // DOT: three PRE-BLURRED painted layers (sky / mesas / fields+road), parallax at different speeds, plus a horizon haze. No runtime blur.
  const k = Math.max(1.2, G.VW * 1.15 / 720);
  W.sky = sprite(T.sky, 720 * k, 960 * k, { order: 0, parent: W.drive }); W.sky.position.y = HZ + (922 - 480) * k;
  W.ground = sprite(T.ground, 720 * k, 560 * k, { order: 0.5, parent: W.drive }); W.ground.position.y = HZ + (42 - 280) * k;
  W.mesa = sprite(T.mesa, 1024 * k * 0.95, 256 * k * 0.95, { order: 0.8, parent: W.drive }); W.mesa.position.y = HZ - 6 + 128 * k * 0.95;
  W.fog = sprite(glowTex(), 2600, 420, { order: 1, parent: W.drive }); W.fog.position.set(0, 60, 0);
  buildAtmos(W, T, k, HZ); // p4a: night sky / moon / clouds / road / fog shaders + dust, critters, spill
  W.dashes = []; for (let i = 0; i < 8; i++) { const d = sprite(null, 10, 60, { color: 0xb9ad8a, opacity: 0.42, order: 2, parent: W.drive }); d.z = 2 + i * 3.2; W.dashes.push(d); } // p4a: faded, worn center line
  W.props = [];
  const addProp = (tex, X, h, z) => { const ia = tex.image.width / tex.image.height; const m = sprite(tex, h * ia, h, { anchor: [0.5, 0], order: 3, parent: W.drive }); m.X = X; m.z = z; W.props.push(m); return m; };
  for (let i = 0; i < 5; i++) swayMat(addProp(T.saguaro, -(1.6 + Math.random() * 1.4), 1.5 + Math.random() * 0.5, 4 + i * 6).material, 0.35); // p4f: ARIZONA is the left shoulder only (the right shoulder is Minnesota)
  for (let i = 0; i < 7; i++) swayMat(addProp(T.brush, -(1.35 + Math.random() * 0.8), 0.55 + Math.random() * 0.3, 3 + i * 4.3).material, 1.6); // desert scrub: left only
  buildMinnesota(T);
  W.mile = addProp(AT.mile, 1.8, 0.95, 22); // p4c: on the shoulder, not the lane
  { const im = T.sign.image, PH = 420, st = canvasTex(im.width, im.height + PH, (g) => { const w = im.width, h = im.height + PH; // p4c IKE: the County Road 9 sign stands on a weathered post on the right shoulder
      const px = w * 0.45, pw = w * 0.11; const gr = g.createLinearGradient(px, 0, px + pw, 0); gr.addColorStop(0, '#3b3026'); gr.addColorStop(0.5, '#7a6a55'); gr.addColorStop(1, '#2a221b'); g.fillStyle = gr; g.fillRect(px, im.height * 0.75, pw, h - im.height * 0.75);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(px + pw / 2, h - 6, pw * 1.6, 7, 0, 0, 7); g.fill(); g.drawImage(im, 0, 0); });
    W.sign = addProp(st, 1.95, 1.05 * (im.height + PH) / im.height, 30); W.sign.once = true; }
  if (BILLBOARD.on) { W.bill = addProp(makeBillboard(), -1.9, 1.3, 16); W.bill.once = true; W.bill.z0 = 16; } // v4.5 story hook: passes in the first ~3 s of the drive
  W.lights = sprite(glowTex(), 900, 700, { add: true, color: 0xffb060, opacity: 0.35, order: 4, parent: W.drive }); W.lights.position.set(-10, -200, 0);
  // DOT: every saucer is an instance of ONE model (one draw call), likewise their glows
  const mk = (geo, mat, order) => { const m = new THREE.InstancedMesh(geo, mat, MAX_SHIPS); m.renderOrder = order; m.frustumCulled = false; for (let i = 0; i < MAX_SHIPS; i++) { m.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); m.setColorAt(i, new THREE.Color(1, 1, 1)); } scene.add(m); return m; };
  W.ships = mk(new THREE.PlaneGeometry(300, 138), new THREE.MeshBasicMaterial({ map: T.saucer, transparent: true, depthTest: false, depthWrite: false }), 30);
  W.glows = mk(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }), 29);
  // cow parade: ONE instanced mesh
  const cg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // v4.5: per-instance frame rect on the cow sheet (aCow), height = width * frame aspect (set in the matrix)
  W.cowRect = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARADE * 4), 4); cg.setAttribute('aCow', W.cowRect);
  const cm = new THREE.MeshBasicMaterial({ map: T.cows, transparent: true, depthTest: false, depthWrite: false });
  W.herdU = { uHT: { value: 0 } };
  cm.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, W.herdU); sh.vertexShader = 'attribute vec4 aCow;\nvarying vec2 vLu; varying vec4 vRc; varying float vId;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = aCow.xy + uv * aCow.zw; vLu = uv; vRc = aCow; vId = float(gl_InstanceID);');
    sh.fragmentShader = 'uniform float uHT; varying vec2 vLu; varying vec4 vRc; varying float vId;\n' + COW_WARP + sh.fragmentShader.replace('#include <map_fragment>', `
    float hf = floor(uHT*12.0 + vId*5.0); float ch = mod(hf, 4.0); float chew = ch < 1.0 ? 0.0 : ch < 2.0 ? 1.0 : ch < 3.0 ? 0.0 : -1.0; // 4-frame chew
    float ef = mod(hf + vId*13.0, 30.0); float ear = ef < 1.0 ? 0.6 : ef < 2.0 ? 1.0 : ef < 3.0 ? 0.4 : 0.0; // 3-frame ear flick every 2.5 s
    vec2 lu = cowWarp(vLu, chew, 0.0, ear, 0.0, 0.0);
    vec4 sampledDiffuseColor = (lu.x < 0.0 || lu.x > 1.0 || lu.y < 0.0 || lu.y > 1.0) ? vec4(0.0) : texture2D(map, vRc.xy + lu * vRc.zw);
    diffuseColor *= sampledDiffuseColor;`); };
  W.cows = new THREE.InstancedMesh(cg, cm, MAX_PARADE);
  W.cows.count = 0; W.cows.renderOrder = 19; W.cows.frustumCulled = false; W.drive.add(W.cows);
  const dw = G.VW * 1.04, dh = dw * 560 / 720; W.dash = sprite(T.dash, dw, dh, { anchor: [0.5, 0], order: 20, parent: W.drive }); W.dash.position.y = -VH / 2 - 10; W.dash.dh = dh; W.dash.dw = dw;
  const qg = new THREE.PlaneGeometry(FQ, FQ * 1.35).translate(0, -FQ * 0.35 / 2, 0); // p3b: 25% bigger quad: the gray's head fills less of its cell than the old badge did
  for (let i = 0; i < MAX_SHIPS; i++) { const pt = canvasTex(256, 256); const g = { i, paint: pt, pg: pt.ctx2d, FA: newFA(), rx: newRX(), bounce: 0, melt: 0, home: [0, 0, 1], bulge: 0, bob: 0, mock: 0 };
    g.face = new THREE.Group(); scene.add(g.face); g.face.visible = false; g.mat = makeFaceMat(T.faces, pt);
    g.q = new THREE.Mesh(qg, g.mat); g.q.renderOrder = 50; g.q.frustumCulled = false; g.face.add(g.q); GR.push(g); }
  W.face = GR[0].face;
  // Daniel: ONE flat sprite, ONE draw call (his soundhole glow is a pooled particle)
  W.hero = sprite(T.hero, 408, 640, { anchor: [0.5, 0], order: 21 }); W.hero.visible = false;
  W.beam = makeBeam(); W.beam.mesh.renderOrder = 45;
  // truck lift: a diving ship's tractor column (only visible during the 1.1 s lift)
  // v4.3 DOT: ONE see-through layer, baked once into a tiny 32x128 texture (well under half res, linear-filtered), normal blending, ship-wide only
  const colTex = canvasTex(32, 128, (g) => { const gr = g.createLinearGradient(0, 0, 32, 0); gr.addColorStop(0, 'rgba(125,255,58,0)'); gr.addColorStop(0.5, 'rgba(160,255,110,0.9)'); gr.addColorStop(1, 'rgba(125,255,58,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 128); const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.15, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-in'; g.fillStyle = v; g.fillRect(0, 0, 32, 128); });
  W.col = sprite(colTex, 1, 1, { opacity: 0, order: 18 }); W.col.visible = false;
  W.morphMat = makeMorphMat(T.faces, T.cows, T.cowsSdf, GR[0].paint);
  W.morph = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.45).translate(0, 0.725, 0), W.morphMat); W.morph.renderOrder = 52; W.morph.frustumCulled = false; W.morph.visible = false; scene.add(W.morph);
  // confused cow (IKE gag 3): lands, chews, looks around wearing the gray's antenna, trots to the parade
  // v4.5: no antenna (Daniel). The popped cow is one sprite whose map is a clone of the cow sheet; frames swap by uv offset/repeat only (no upload, no extra draw)
  W.cowPopT = subTex(T.cows, [0, 0, 1, 1], 1, 1); W.cowPop = sprite(W.cowPopT, 300, 300, { order: 53, anchor: [0.5, 0] }); W.cowPop.visible = false;
  // v4.5 Holstein shred gag: a melting RIPPLE (wave distortion running through the body), done in the sprite's own fragment shader (no extra draw)
  W.ripU = { uRip: { value: 0 }, uRipT: { value: 0 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uChew: { value: 0 }, uJaw: { value: 0 }, uEar: { value: 0 }, uKick: { value: 0 }, uKph: { value: 0 } };
  W.cowPop.material.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, W.ripU);
    sh.fragmentShader = 'uniform float uRip, uRipT, uChew, uJaw, uEar, uKick, uKph; uniform vec4 uRect;\n' + COW_WARP + sh.fragmentShader.replace('#include <map_fragment>', `
    vec2 lu = cowWarp((vMapUv - uRect.xy) / uRect.zw, uChew, uJaw, uEar, uKick, uKph); float wv = sin(lu.y * 11.0 - uRipT * 13.0) + 0.5 * sin(lu.x * 9.0 + uRipT * 9.0);
    vec2 ru = lu + uRip * vec2(0.035 * wv, 0.025 * sin(lu.x * 14.0 - uRipT * 15.0)) * smoothstep(0.0, 0.25, lu.y);
    vec4 sampledDiffuseColor = (ru.x < 0.0 || ru.x > 1.0 || ru.y < 0.0 || ru.y > 1.0) ? vec4(0.0) : texture2D(map, uRect.xy + ru * uRect.zw);
    diffuseColor *= sampledDiffuseColor;`); };
  P = makeParticles(T.fx); window.__cr9.W = W; window.__cr9.P = P;
  if (PAINT_ON) { W.paint = makePaintPass(T.dlr); W.paint.U.uIntro.value = 0; W.paint.U.uIntroA.value = 1; S.introPaintT = 0; } // p3b paint layer (one extra draw call)
}
// pass 2: procedural cow motion bending the sheet art in its own shader (no new textures, no extra draws). lu = frame-local uv (y up, legs at the bottom,
// muzzle front-right). chew: jaw slides side to side | jaw: jaw drops | ear: ears flick up | kick: legs kick (per-leg phase) | all stepped at 12 fps by the caller.
const COW_WARP = `vec2 cowWarp(vec2 lu, float chew, float jaw, float ear, float kick, float kph){
  vec2 M = vec2(0.72, 0.47); vec2 mq = (lu - M)/vec2(0.12, 0.1); float wj = smoothstep(1.0, 0.35, length(mq))*step(lu.y, M.y + 0.02);
  lu.x += wj*0.022*chew; lu.y += wj*0.05*jaw;
  float we = smoothstep(1.0, 0.2, length((lu - vec2(0.55, 0.73))/vec2(0.08, 0.06))) + smoothstep(1.0, 0.2, length((lu - vec2(0.9, 0.73))/vec2(0.08, 0.06)));
  lu.y -= we*0.035*ear;
  float lk = smoothstep(0.34, 0.0, lu.y); lu.x += kick*lk*0.055*sin(floor(lu.x*7.0)*2.3 + kph);
  return lu; }`;
const FACE_AT = { top: [0, 560, 0.5], center: [0, 330, 1], duel: [0, 570, 0.58] };
function showFace(where, cell = GF.serious, g = GR[0]) { const [x, y, s] = FACE_AT[where]; showGray(g, x, y, s, cell); }
function showGray(g, x, y, s, cell = GF.serious) { faceReset(g); g.shownAt = NOW(); g.twinT = 0; g.mat.uniforms.uTwin.value = 0; g.mat.uniforms.uRing.value = 0; g.face.visible = true; g.home = [x, y, s]; g.face.position.set(x, y, 0); g.face.scale.setScalar(s * 0.3); g.bounce = 1;
  const u = g.mat.uniforms; u.uMelt.value = 0; u.uAlpha.value = 1; setFaceG(g, cell, true); g.melt = 0; paintClear(g); }
// animated gray: blink, pupils track the finger, grin, laugh squash, strain, pre-melt shake, live crying-paint tears
function newFA() { return { blinkAt: 2, bT: 9, look: [0, 0], grin: 0, grinT: 0, strain: 0, strainT: 0, squashT: 0, shake: 0, tears: null }; }
function faceReset(g = GR[0]) { Object.assign(g.FA, { bT: 9, grin: 0, grinT: 0, strain: 0, strainT: 0, squashT: 0, shake: 0, tears: null }); if (g.rx) Object.assign(g.rx, newRX()); }
// ---------- pass 2: frame-stepped gray reactions (12 fps), all procedural on the ONE face quad (shader uniforms + transforms, no new textures) ----------
// DOT budgets: lock reaction 6 frames, melt 8 frames, pop 6 frames, at 12 fps; drips <= 100 pooled particles per gray (DRIP_MAX)
const FPS_RX = 12, DRIP_MAX = 100, f12 = (t) => Math.floor(t * FPS_RX);
const RX_EYE = [0.5, 1, 1, 1, 0.8, 0.7], RX_JAW = [0.4, 1, 1, 0.9, 0.7, 0.6], RX_SHO = [0.06, 0.12, 0.12, 0.07, 0.03, 0.02]; // eek: eyes snap huge (hold 2f), jaw drops, shoulders shoot up
const POP_SX = [1.35, 1.45, 0.72, 0.66, 1.12, 1], POP_SY = [0.62, 0.55, 1.38, 1.5, 0.92, 1]; // squash flat, stretch tall, settle (then the paint splat)
function newRX() { return { lockT: -1, seen: 0, stage: 0, stT: 0, eye: 0, jaw: 0, wob: 0, droop: 0, meltRaw: 0, drips: 0, dripAcc: 0, popT: -1, wisp: false, glare: 0, frames: {} }; }
function grayRX(g, dt, T) { const r = g.rx, u = g.mat.uniforms, on = NOW() - r.seen < 120 && !g.melt; r.stT += dt;
  const mark = (k, f) => { (r.frames[k] = r.frames[k] || new Set()).add(f); const F = S.rxF || (S.rxF = {}); (F[k] = F[k] || new Set()).add(f); }; // S.rxF: frame log for the headless checks
  if (on) { if (r.lockT < 0) { r.lockT = 0; S.lockReacts = (S.lockReacts || 0) + 1; } r.lockT += dt; } else if (r.lockT >= 0 && !g.melt) { r.lockT = -1; r.stage = 0; }
  let eye = 0, jaw = 0, sho = 0;
  if (r.lockT >= 0) { const f = f12(r.lockT); if (f < 6) { eye = RX_EYE[f]; jaw = RX_JAW[f]; sho = RX_SHO[f]; mark('lock', f); } else { eye = 0.6; jaw = 0.5; sho = 0.02 * Math.sin(T * 9); } }
  if (g.melt || r.popT >= 0) { eye = 1; jaw = 1; }
  r.eye += (eye - r.eye) * Math.min(1, dt * 30); r.jaw += (jaw - r.jaw) * Math.min(1, dt * 30); // ~1 frame of easing keeps the 12 fps poses readable
  // stage 2+: jelly wobble, stage 3+: droop (8 steps) + paint drips that run down off the chin, stage 4: harder wobble
  const L = r.stage, wobT = g.melt ? 0.7 : L >= 4 ? 0.75 : L >= 2 ? 0.35 : 0; r.wob += (wobT - r.wob) * Math.min(1, dt * 6);
  const droopT = g.melt ? 1 : L >= 3 ? Math.min(0.7, 0.3 + r.stT * 0.25) : 0; r.droop = Math.floor(droopT * 8) / 8;
  if (((L >= 3 && on) || g.melt) && r.drips < DRIP_MAX) { r.dripAcc += dt * (g.melt ? 40 : 9); while (r.dripAcc >= 1 && r.drips < DRIP_MAX) { r.dripAcc--; dripRun(g); r.drips++; S.dripsMax = Math.max(S.dripsMax || 0, r.drips); } }
  // melt: 8 frames at 12 fps (0.67 s), eyes slide down out of sync
  if (g.melt && L2.on) { if (u.uB.value !== GF.scared) setFaceG(g, GF.scared); u.uMelt.value = 0; u.uAlpha.value = 1; const dir = (g.home && g.home[0] < 0) ? -1 : 1; g.q.position.x += dir * r.meltRaw * r.meltRaw * 1400; g.q.position.y += Math.abs(Math.sin(r.meltRaw * 30)) * 18; r.meltRaw = Math.min(1, r.meltRaw + dt * 1.4); if (r.meltRaw >= 1) { g.face.visible = false; g.melt = 0; r.meltRaw = 0; } }
  else if (g.melt) { const mc = r.meltRaw < 0.3 ? GF.embarrassed : GF.drip; if (u.uB.value !== mc) setFaceG(g, mc); g.q.position.y -= r.meltRaw * 40; g.q.scale.y *= 1 - r.meltRaw * 0.12; r.meltRaw = Math.min(1, r.meltRaw + dt * 1.5); const mf = Math.min(7, f12(r.meltRaw / 1.5)); u.uMelt.value = (mf + 1) / 8; mark('melt', mf); u.uAlpha.value = clamp(1.6 - u.uMelt.value * 1.6 + (mf < 7 ? 0.4 : 0), 0, 1); if (r.meltRaw >= 1) { g.face.visible = false; g.melt = 0; r.meltRaw = 0; } }
  u.uEyeSlide.value = g.melt ? u.uMelt.value : r.droop * 0.5; u.uDroop.value = r.droop; u.uWob.value = r.wob; u.uJaw.value = r.jaw;
  u.uBulge.value = Math.max(u.uBulge.value, r.eye * 0.75);
  // idle smugness: half-lidded eyes unless something scares it; a glare after the beam lets go
  r.glare = Math.max(0, r.glare - dt); if (r.lockT < 0 && !g.melt && r.popT < 0) u.uLid.value = Math.max(u.uLid.value, r.glare > 0 ? 0.5 : 0.28);
  // always-on idle: slow breathing squash/stretch + sway (transforms only)
  const br = 0.03 * Math.sin(T * 2.4 + g.i * 1.7); g.q.scale.x *= 1 + br; g.q.scale.y *= 1 - br + sho; g.q.rotation.z += 0.04 * Math.sin(T * 1.1 + g.i);
  if (r.popT >= 0) { r.popT += dt; const f = f12(r.popT); if (f < 6) { if (!(g.twinT > 0) && !g.melt) { g.q.scale.x *= POP_SX[f]; g.q.scale.y *= POP_SY[f]; } mark('pop', f); } if (f >= 4 && !r.wisp) { r.wisp = true; soulWisp(g); } } }
function dripRun(g) { const f = g.face, s = f.scale.x, x = f.position.x + (Math.random() - 0.5) * 300 * s, y = f.position.y - (140 + Math.random() * 60) * s, c = PAL[(Math.random() * PAL.length) | 0]; S.dripsSpawned = (S.dripsSpawned || 0) + 1;
  P.spawn({ x, y, vx: 0, vy: -20 - Math.random() * 30, g: 260, drag: 2.5, life: 1.1 + Math.random() * 0.5, cell: CELL.drip, s0: 14 * Math.max(0.6, s * 2.5), s1: 22 * Math.max(0.6, s * 2.5), r: c[0], gg: c[1], b: c[2], a: 1, add: false, rot: 0, vr: 0 }); } // runs DOWN, slow then gathering speed
function soulWisp(g) { const f = g.face; S.wisps = (S.wisps || 0) + 1; for (let k = 0; k < 3; k++) P.spawn({ x: f.position.x + (k - 1) * 10, y: f.position.y + k * 18, vx: (k - 1) * 12, vy: 120 + k * 20, g: -30, drag: 0.6, life: 1.4, cell: CELL.glow, s0: 34 - k * 8, s1: 10, r: 0.85, gg: 1, b: 0.9, a: 1, add: true, rot: 0, vr: k === 1 ? 4 : 0 }); }
function startTears(speed = 90, g = GR[0]) { const F = g.FA; if (!F.tears) F.tears = { len: 0, speed, ci: 0 }; else F.tears.speed = Math.max(F.tears.speed, speed); }
function faceAnim(g, dt, T) {
  const u = g.mat.uniforms, cell = u.uB.value, f = g.face, FA = g.FA;
  if (T > FA.blinkAt) { FA.bT = 0; FA.blinkAt = T + 2.2 + Math.random() * 3.2; } FA.bT += dt;
  const blink = FA.bT < 0.18 ? Math.sin(Math.PI * FA.bT / 0.18) : 0;
  FA.strain += (FA.strainT - FA.strain) * Math.min(1, dt * 4); FA.grin += (FA.grinT - FA.grin) * Math.min(1, dt * 6);
  u.uLid.value = Math.max(blink, FA.strain * 0.42); u.uLidOK.value = 0; u.uStrain.value = FA.strain; u.uGrin.value = 0; // p3b: Daniel's art carries lids/grin; no procedural eye warps
  let tx = Math.sin(T * 0.7) * 0.3, ty = -0.5; const fx = g.lookAt ? null : S.hold ? S.aimW : null; if (g.lookAt) { tx = g.lookAt[0]; ty = g.lookAt[1]; }
  if (fx) { const dx = fx[0] - f.position.x, dy = fx[1] - f.position.y, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / 250); tx = dx / l * k; ty = dy / l * k; }
  FA.look[0] += (tx - FA.look[0]) * Math.min(1, dt * 9); FA.look[1] += (ty - FA.look[1]) * Math.min(1, dt * 9); u.uLook.value.set(FA.look[0], FA.look[1]);
  FA.squashT = Math.max(0, FA.squashT - dt); const sq = (cell === GF.laughing ? 0.07 : 0) * Math.sin(T * 22) + FA.squashT * 0.12 * Math.sin(T * 30);
  // v4.1: lock-second-2 eye bulge, head-bob to the song against its will (2.5-4 s), air-guitar mock on a miss
  u.uBulge.value += (g.bulge - u.uBulge.value) * Math.min(1, dt * 10);
  const ph = S.beatPh || 0, bob = g.bob * Math.sin(ph * Math.PI * 2), mk = g.mock;
  g.q.rotation.z += bob * 0.2 + mk * Math.sin(T * 30) * 0.32; g.q.position.y = Math.abs(bob) * 26 * g.bob + mk * Math.abs(Math.sin(T * 15)) * 18;
  const pu = mockPunch(mk); if (mk <= 0 && g.q.renderOrder === 51) g.q.renderOrder = 50; // v4.2 IKE: the 0.8 s air-guitar taunt pops the face up to ~2x so it reads on a phone
  g.q.scale.set((1 + sq + mk * 0.06 * Math.sin(T * 30)) * pu, (1 - sq) * pu, 1); g.q.position.y += (pu - 1) * 60;
  const sh = FA.shake; g.q.position.x = sh * 14 * Math.sin(T * 47); g.q.rotation.z += sh * 0.09 * Math.sin(T * 39);
  const tr = FA.tears; if (tr && tr.len < 118) { const n = Math.min(118, tr.len + dt * tr.speed); for (const x of [97, 159]) { const c = [0.05, 0.05, 0.07]; tr.ci++; // p3b: black tears (Daniel's clips)
      g.pg.fillStyle = rgbCss(c, 0.95); g.pg.fillRect(x - 1.5, 104 + tr.len, 3, n - tr.len + 1); g.pg.beginPath(); g.pg.arc(x, 104 + n, 2.5, 0, 7); g.pg.fill(); } tr.len = n; g.paint.needsUpdate = true; }
}
const mockPunch = (mk) => { if (mk <= 0) return 1; const p = 1 - mk; return 1 + (p < 0.15 ? smooth(0, 0.15, p) : 1 - smooth(0.45, 1, p)); }; // 0 -> 2x in 0.12 s, hold, ease back by 0.8 s
function setFaceG(g, cell, instant) { const u = g.mat.uniforms; if (u.uB.value === cell && !instant) return; u.uA.value = instant ? cell : u.uB.value; u.uB.value = cell; u.uMix.value = instant ? 1 : 0; g.bounce = 1; }
const setFace = (cell, instant) => setFaceG(GR[0], cell, instant);
function updateGray(g, dt, T) { // pop in, bounce, follow home, melt away
  const h = g.home, u = g.mat.uniforms; g.bounce = Math.max(0, g.bounce - dt * 4);
  const s = g.snap ? h[2] * (1 + g.bounce * 0.08) : g.face.scale.x + (h[2] * (1 + g.bounce * 0.08) - g.face.scale.x) * Math.min(1, dt * 10); g.face.scale.setScalar(s);
  g.q.rotation.z = u.uB.value === GF.laughing ? Math.sin(T * 14) * 0.08 : Math.sin(T * 1.5) * 0.03;
  u.uTwin.value += ((g.twinT || 0) - u.uTwin.value) * Math.min(1, dt * 9); // p3b: cross-fade to the melting twin
  { const Fi = S.fight, locked = Fi && (Fi.locked && Fi.locked.g === g || Fi.locked2 && Fi.locked2.g === g); u.uRing.value += ((locked && !g.melt ? 1 : 0) - u.uRing.value) * Math.min(1, dt * 8); u.uBeat.value = (S.bi || 0) + (S.beatPh || 0); }
  if (!g.melt && !g.mock && (g.twinT || 0) === 0 && NOW() - g.rx.seen > 400 && [GF.serious, GF.bored, GF.happy].includes(u.uB.value)) { const c = idleFace(g); if (c !== u.uB.value) setFaceG(g, c); }
  if (g.snap) g.face.position.set(h[0], h[1], 0); // v4.1: glued under its saucer (no lag while it weaves)
  else { g.face.position.x += (h[0] - g.face.position.x) * Math.min(1, dt * 10); g.face.position.y += (h[1] + Math.sin(T * 2 + h[0]) * 10 - g.face.position.y) * Math.min(1, dt * 8); }
  u.uMix.value = Math.min(1, u.uMix.value + dt * 7); u.uT.value = T;
  if (!g.melt && g.fade !== undefined) u.uAlpha.value = g.fade;
  faceAnim(g, dt, T); grayRX(g, dt, T); // pass 2: the melt is frame-stepped in grayRX
}

// ---------- HUD helpers ----------
function cmdRaw(html, small, ms = 1500) { clearTimeout(S.cmdT); if (ms) S.cmdT = setTimeout(hideCmd, ms); const e = $('cmd'); e.innerHTML = html; e.classList.remove('hidden', 'go', 'hyperTxt'); e.classList.toggle('small', !!small); void e.offsetWidth; e.classList.add('go'); }
// p4h (v4.8.0) BANNER QUEUE: wave callouts, SO CLOSE / THEY GOT AWAY / POINT BLANK and the SOUL SAVED banner share ONE slot, ~0.8 s each, on the game clock (so pausing freezes them).
// Held-open lines (ms = 0: "tap tap tap to break free", FINALE) and HYPER MODE! (asked for by the player, instant) bypass the queue.
const BANNER_MS = 800, BQ = { q: [], cur: null, until: 0 };
function bannerPush(b) { b.at = NOW(); if (BQ.q.length >= 3) BQ.q.shift(); BQ.q.push(b); S.bannersQueued = (S.bannersQueued || 0) + 1; bannerTick(); }
function bannerTick() { const n = NOW();
  if (S.state !== 'run') { BQ.q.length = 0; BQ.cur = null; return; } // anything that is not plain play owns the screen (other code hides its own banners)
  if (S.grab) { if (BQ.cur) { try { BQ.cur.hide(); } catch (e) {} BQ.cur = null; } return; } // a truck grab owns the screen; waiting banners go on after it (or expire after 3 s)
  if (BQ.cur && n >= BQ.until) { try { BQ.cur.hide(); } catch (e) {} BQ.cur = null; }
  while (!BQ.cur && BQ.q.length) { const b = BQ.q.shift(); if (n - b.at > 3000) continue; BQ.cur = b; BQ.until = n + (b.ms || BANNER_MS); S.bannersShown = (S.bannersShown || 0) + 1; b.show(); } }
function bannerClear() { BQ.q.length = 0; BQ.cur = null; }
function cmd(html, small, ms = 1500, now) { if (!now && ms > 0 && ms < 5000 && S.state === 'run' && !S.grab) return bannerPush({ ms: BANNER_MS, show: () => cmdRaw(html, small, 0), hide: hideCmd }); return cmdRaw(html, small, ms); }
function hideCmd() { $('cmd').classList.add('hidden'); }
let introT = 0; // big word + animated hand, shown just before each game
function showIntro(word, kind, beats) { const e = $('intro'); document.body.classList.add('introOn'); $('introWord').textContent = word; e.className = kind; void e.offsetWidth; e.classList.add('go'); clearTimeout(introT); introT = setTimeout(hideIntro, beats * BEAT * 1000); }
function hideIntro() { clearTimeout(introT); $('intro').className = 'hidden'; document.body.classList.remove('introOn'); }
function sub(t) { const e = $('sub'); e.classList.remove('dashHint'); if (!t) return e.classList.add('hidden'); e.textContent = t; e.classList.remove('hidden'); }
function popText(t, color, sy) { const el = $('pop'); el.style.top = sy ? `${sy}px` : ''; el.classList.toggle('small', !!sy); el.textContent = t; el.style.color = color || ''; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
function flash(a = 0.8, ms = 180) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms`; f.style.opacity = 0; }); }
function beatPulse() { const b = $('beat'); b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); }
function soulsHud() { const e = $('souls'); const ic = $('soulsIco'); if (ic && !ic.width2 && G.tex && G.tex.cows) { drawStoryCow(ic); ic.width2 = 1; } $('soulsN').textContent = S.souls; // the HUD cow is the hybrid3 holstein from the sheet (no emoji)
  e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }

// ---------- paint ----------
const rgbCss = (c, a = 1) => `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},${a})`;
function paintClear(g = GR[0]) { g.pg.clearRect(0, 0, 256, 256); g.paint.needsUpdate = true; }
function paintSplat(n = 3, rim = 0, g = GR[0]) { const pg = g.pg; for (let j = 0; j < n; j++) { const c = PAL[(Math.random() * PAL.length) | 0]; const a = Math.random() * 7, d = rim ? 84 + Math.random() * 26 : Math.sqrt(Math.random()) * 85, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, r = rim ? 9 + Math.random() * 8 : 14 + Math.random() * 12;
  pg.fillStyle = rgbCss(c, 0.9); pg.beginPath(); pg.arc(x, y, r, 0, 7); pg.fill(); for (let k = 0; k < 6; k++) { const b = Math.random() * 7, dd = r * (1.1 + Math.random()); pg.beginPath(); pg.arc(x + Math.cos(b) * dd, y + Math.sin(b) * dd, r * 0.25, 0, 7); pg.fill(); } } g.paint.needsUpdate = true; }
function faceUV(wx, wy) { const f = W.face, s = f.scale.x; const lx = (wx - f.position.x) / s, ly = (wy - f.position.y) / s; return [(lx + FQ / 2) / FQ * 256, (FQ / 2 - ly) / FQ * 256]; }
const FQ = 540;

// ---------- particles ----------
// DOT: a melt may use at most 300 of the (reused) 500-particle pool: S.budget is set on each kill and spent by every burst until it expires
function burst(x, y, n, o = {}) { if (S.budget != null) { n = Math.min(n, S.budget); S.budget -= n; } for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = (o.spd || 500) * (0.3 + Math.random() * 0.9), c = o.color || PAL[(Math.random() * PAL.length) | 0];
  P.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (o.up || 0), g: o.g ?? 400, drag: 1.2, life: (o.life || 1.2) * (0.6 + Math.random() * 0.6), cell: o.cells ? o.cells[(Math.random() * o.cells.length) | 0] : CELL.spark, s0: o.s0 || 30, s1: o.s1 ?? 6, r: c[0], gg: c[1], b: c[2], a: 1, add: o.add ?? true, rot: a, vr: o.vr || 0 }); } }
const splash = (x, y, n = 16) => burst(x, y, n, { cells: [CELL.glob, CELL.splat, CELL.drip], add: false, spd: 600, g: 700, life: 1, s0: 34, s1: 14 });
const confetti = (x, y, n = 40) => burst(x, y, n, { cells: [CELL.confetti, CELL.note, CELL.note + 1], add: false, spd: 650, g: 450, life: 1.8, s0: 24, s1: 24, vr: 8 });

// ---------- road + DOT's parallax (sky slowest, mesas, fields+road fastest) ----------
function updateRoad(dt, T) {
  if (S.state === 'run' || S.state === 'morph' || S.state === 'parade') S.steerT = Math.sin(T * 0.23) * 0.45; // the truck drifts lane to lane
  S.steer += (S.steerT - S.steer) * Math.min(1, dt * 2);
  const speed = S.state === 'end' ? 3 : 6;
  S.par += ((S.hold ? S.aimW[0] : 0) - S.par) * Math.min(1, dt * 2);
  W.sky.position.x = -S.steer * 6 - S.par * 0.015 + Math.sin(T * 0.03) * 14;
  W.mesa.position.x = -S.steer * 18 - S.par * 0.05;
  W.ground.position.x = -S.steer * 30; W.fog.position.x = -S.steer * 18; W.desert.position.x = -S.steer * 24 - S.par * 0.08;
  for (const d of W.dashes) { d.z -= speed * dt; if (d.z < 0.9) d.z += 8 * 3.2; const [x, y] = proj(0, d.z); d.position.set(x, y, 0); d.scale.set(Math.max(0.2, 3 / d.z), 6 / d.z, 1); d.visible = d.z > 1; }
  for (const p of W.props) { p.z -= speed * dt; if (p.z < 0.7) { if (p.once) { p.visible = false; continue; } p.z += 30; }
    const [x, y] = proj(p.X, p.z); p.position.set(x, y, 0); p.scale.setScalar(F / p.z); p.renderOrder = 3 + Math.round(15 - p.z / 2); p.visible = p.z < 32; p.material.color.setScalar(clamp(1.6 / p.z + 0.25, 0.25, 1)); }
  mnUpdate(speed, dt);
  W.dash.rotation.z = -S.steer * 0.03; W.dash.position.x = S.steer * 10;
  // saved cows trot ahead of the truck (instanced); they dance in the finale
  const m4 = new THREE.Matrix4(), n = Math.min(S.souls, MAX_PARADE); W.cows.count = n;
  const dance = S.state === 'parade' || S.state === 'end', bt = T * 2 * Math.PI * (BEATS.tempo_bpm / 120);
  for (let i = 0; i < n; i++) { const z = (dance ? 2.1 : 2.6) + i * 0.95 + (dance ? Math.sin(T * 1.5 + i) * 0.15 : 0), X = (i % 2 ? 0.55 : -0.55) * (1 + (i >> 2) * 0.35) + Math.sin(T * 0.8 + i * 1.7) * (dance ? 0.2 : 0.08) + truckX() * 0.6;
    const [x, y] = proj(X, z), s = F / z * (dance ? 1.25 : 0.9), hop = Math.abs(Math.sin(bt + i)) * s * (dance ? 0.2 : 0.06), rz = dance ? Math.sin(bt * 0.5 + i) * 0.22 : Math.sin(T * 1.3 + i * 2.1) * 0.045, br = 1 + 0.035 * Math.sin(T * 2.3 + i * 1.3); // pass 2: always-on sway + breathing squash
    let key = (S.cowList && S.cowList[i]) || 'holstein_hybrid', bump = 0; const I = S.idleSnap; // idle eye-snap: one cow at a time, every few seconds
    if (I && I.i === i && CF[key.replace('_hybrid', '_sleepy')]) { const u = (NOW() - I.t0) / 1000 - 0.3; if (eyeAt(u) === 'sleepy') key = key.replace('_hybrid', '_sleepy'); if (u >= SNAP_AT && !I.done) { I.done = true; eyeSnap(null, true); } if (I.done) bump = 0.1 * Math.max(0, 1 - (u - SNAP_AT) / 0.18); }
    const f = CF[key] || CF[Object.keys(CF)[0]]; W.cowRect.setXYZW(i, ...f.uv); const ks = 0.85; // sheet frames are trimmed tight, so they read a bit bigger than the old cow
    m4.makeRotationZ(rz); m4.scale(new THREE.Vector3((i % 2 ? -s : s) * ks * (1 + bump), s * ks * (1 + bump) * f.asp * (dance ? 1 + Math.sin(bt + i) * 0.08 : br), 1)); m4.setPosition(x, y + hop, 0); W.cows.setMatrixAt(i, m4); }
  W.herdU.uHT.value = T; W.cows.instanceMatrix.needsUpdate = true; W.cowRect.needsUpdate = true;
  idleSnapTick(n);
}
function idleSnapTick(n) { const now = NOW(), I = S.idleSnap; if (I && now - I.t0 < 1400) return; // at most one cow at a time
  if (!n || now < (S.idleSnapNext || 0)) return; S.idleSnapNext = now + 3500 + Math.random() * 3000;
  const ok = []; for (let i = 0; i < n; i++) { const k = (S.cowList && S.cowList[i]) || 'holstein_hybrid'; if (/_hybrid$/.test(k) && CF[k.replace('_hybrid', '_sleepy')]) ok.push(i); }
  S.idleSnap = ok.length ? { i: ok[(Math.random() * ok.length) | 0], t0: now, done: false } : null; }

// ---------- truck lift (a diving ship's tractor beam grabs the truck for 1.1 s): Daniel flinches, the radio goes muffled, snaps back on the drop ----------
// ---------- v4.5 cows: pick a hybrid3 cow per kill (black alien eyes, no blink/eye swap), the 1 s bubble morph, HYPER: hair-shed -> bald gray ----------
const spawnB = (o) => { if (S.budget != null) { if (S.budget <= 0) return; S.budget--; } P.spawn(o); }; // DOT: counts against the 300-per-melt budget
const COW_HAIR = { holstein: [0.95, 0.93, 0.88], highland: [0.86, 0.42, 0.13], longhorn: [0.62, 0.3, 0.12], golden: [1, 0.82, 0.2] };
function pickCow(shred) { // CC.shredKills is the ONE flag: 'bald' (HYPER kills -> bald gray cows, golden = rare random drop) or 'golden' (HYPER kills -> golden)
  const plain = CC.types.filter((t) => t !== CC.rare && CF[t + '_hybrid']); if (shred && CC.shredKills === 'golden' && CF[CC.rare + '_hybrid']) return { type: CC.rare, bald: null };
  let t = CF[CC.rare + '_hybrid'] && Math.random() < CC.rareChance ? CC.rare : plain[(Math.random() * plain.length) | 0];
  if (!S.cowsPicked && plain.length > 1) { const last = localStorage.getItem('cr9_first_cow'); if (t === last) { const o = plain.filter((p) => p !== last); t = o[(Math.random() * o.length) | 0]; } } // v4.5.2 Chico: run's first cow != last run's first cow
  if (!S.cowsPicked++) try { localStorage.setItem('cr9_first_cow', t); } catch (e) {}
  if (!shred && !S.baldSeen && S.fight && S.fight.wave >= 2) { shred = true; S.baldForced = (S.baldForced || 0) + 1; } // v4.5.2 Chico: at least one bald shred cow by wave 3, HYPER or not
  if (Q.get('cow') && CF[Q.get('cow') + '_hybrid']) t = Q.get('cow'); // test hook: ?cow=golden|holstein|highland|longhorn
  if (shred && CC.shredKills === 'bald') { const o = [t + '_bald', t + '_baldSpot'].filter((k) => CF[k]); if (o.length) { S.baldSeen = true; return { type: t, bald: o[(Math.random() * o.length) | 0] }; } }
  return { type: t, bald: null };
}
const cowKey = (c, f) => (f === 'bald' ? c.bald : CF[`${c.type}_${f}`] ? `${c.type}_${f}` : `${c.type}_hybrid`);
function setCowPopFrame(c, f) { const k = cowKey(c, f), fr = CF[k], t = W.cowPopT; t.offset.set(fr.uv[0], fr.uv[1]); t.repeat.set(fr.uv[2], fr.uv[3]); W.ripU.uRect.value.set(...fr.uv); W.cowPop.asp = fr.asp; c.frame = f; }
// pass 2 eye-snap (IKE frames + DANA timing): sleepy normal eyes hold 0.3 s, flicker black/sleepy/black/sleepy every 60 ms, then SNAP to black at 0.54 s.
// The snap lands on the same frame as ANIMAL_Cow_Moo_Daniel starts, with REX's FX_Eye_Snap_Pop (both silent until the files land).
const SNAP_AT = 0.54; const eyeAt = (u) => (u < 0.3 ? 'sleepy' : u >= SNAP_AT ? 'hybrid' : Math.floor((u - 0.3) / 0.06) % 2 ? 'sleepy' : 'hybrid');
function eyeSnap(cow, idle) { S.eyeSnaps = (S.eyeSnaps || 0) + 1; if (idle && idleSnapQuiet()) { S.idleSnapsMuted = (S.idleSnapsMuted || 0) + 1; return; } sfxSlot('FX_Eye_Snap_Pop', idle ? 0.35 : 0.8); // REX: pop ON the snap frame, the moo 80 ms later
  if (!idle) { fadeKillTaunt(); if (S.voCur && S.voCur.kind === 'kill' && S.voCur.h) S.tauntLeak = (S.tauntLeak || 0) + 1; S.snapMooSync = (S.snapMooSync || 0) + 1; S.meltSnapUntil = NOW() + 1600; const st = S.state; setTimeout(() => { if (S.state === st) { hybridMoo(cow, true); S.snapMoos = (S.snapMoos || 0) + 1; } }, 80); return; }
  S.idleSnaps = (S.idleSnaps || 0) + 1; const now = NOW(), at = A.ctx.currentTime + 0.08; // herd idle snaps: Daniel's short moo; REX's bright snort at most once per 20 s. pass-2 review: 80 ms after the pop, like the melt
  if (A.buf.ANIMAL_Cow_Snort_01 && now > (S.snortNext || 0) && Math.random() < 0.3) { S.snortNext = now + 20000; S.snorts = (S.snorts || 0) + 1; play('ANIMAL_Cow_Snort_01', { gain: 0.45, when: at }); }
  else if (A.buf.ANIMAL_Cow_Moo_Daniel_02) play('ANIMAL_Cow_Moo_Daniel_02', { gain: 0.5, when: at }); }
// pass-2 review: the herd's idle snap sounds stay out of the 5 s lock countdown, the final morph, the MISSING TIME giggle and the 1.6 s after a melt snap
function idleSnapQuiet() { const now = NOW(); return voLocked() || S.state === 'missing' || now < (S.giggleUntil || 0) || now < (S.meltSnapUntil || 0); }
const hasSleepy = (c) => !c.bald && !!CF[cowKey(c, 'sleepy')]; // pass-2 eye-snap hook (frames only exist once IKE's cow_hybrid3_*_sleepy.png land)
function setMorphCow(c, f) { const fr = CF[cowKey(c, f)], u = W.morphMat.uniforms; u.uCowR.value.set(...fr.uv); u.uCowAsp.value = fr.asp; }
function hybridMoo(c, snap) { if (snap && !c.bald && A.buf.ANIMAL_Cow_Moo_Daniel) { play('ANIMAL_Cow_Moo_Daniel', { gain: 0.9 }); duckSet('moo', A.buf.ANIMAL_Cow_Moo_Daniel.duration * 1000); return; } // the song ducks under Daniel's moo like a voice line // Daniel's own moo finishes the melt-to-cow on the eye snap
  if (c.bald) play(A.buf.ANIMAL_Cow_Bald_Gray_Moo ? 'ANIMAL_Cow_Bald_Gray_Moo' : 'ANIMAL_Cow_Moo_01', { gain: 0.9 }); else { const r = ['ANIMAL_Cow_Moo_Hybrid_01', 'ANIMAL_Cow_Moo_Hybrid_02', 'ANIMAL_Cow_Moo_Daniel', 'ANIMAL_Cow_Moo_Daniel'].filter((k) => A.buf[k]); play(r.length ? r[(Math.random() * r.length) | 0] : 'ANIMAL_Cow_Moo_01', { gain: 0.9 }); } } // pass-2 hook: Daniel's own moo, double weight, once REX's file lands
function hairShed(x, y, w, c) { const col = COW_HAIR[c.type] || [0.8, 0.7, 0.6]; S.hairSheds = (S.hairSheds || 0) + 1; // ~40 tufts, falling, gone in < 1 s
  for (let i = 0; i < 40; i++) { const k = Math.random(), dark = c.type === 'holstein' && k < 0.4; spawnB({ x: x + (Math.random() - 0.5) * w, y: y + Math.random() * w * 0.55, vx: (Math.random() - 0.5) * 260, vy: 60 + Math.random() * 160, g: 900, life: 0.55 + Math.random() * 0.35, cell: CELL.drip, s0: 18 + Math.random() * 10, s1: 10, r: dark ? 0.1 : col[0], gg: dark ? 0.09 : col[1], b: dark ? 0.1 : col[2], add: false, vr: (Math.random() - 0.5) * 12 }); } }
// per-kill bubble morph: ~1 s on the shared morph quad (uT 0.4 -> 2.2 at 1.8x): the blob bubbles + swells, forms the cow with a squash-stretch wobble, a ripple and ~30 paint-bubble pops
const KM_S = 1.0;
function startKillMorph(job) { const { x, y, fr, cow, g } = job, QW = clamp(fr / 0.36, 230, 420), u = W.morphMat.uniforms; S.km = { t: 0, x, y, QW, cow, pops: 0, rip: false };
  u.tPaint.value = g.paint; u.uCell.value = 2; u.uBub.value = 1; u.uT.value = 0.4; setMorphCow(cow, hasSleepy(cow) ? 'sleepy' : 'hybrid'); W.morph.visible = true; W.morph.position.set(x, y - 1.07 * QW, 0); W.morph.scale.set(QW, QW, 1);
  play(A.buf.FX_Hybrid_Bubble_Morph ? 'FX_Hybrid_Bubble_Morph' : 'FIGHT_Paint_Burst', { gain: 0.85 }); S.killMorphs = (S.killMorphs || 0) + 1; }
function killMorphUpdate(dt, T) { const m = S.km; if (!m) { if (S.kmQ && S.kmQ.length && S.state === 'run' && !W.morph.visible && !(S.popQ && S.popQ.length) && popFreeIn() <= KM_S) startKillMorph(S.kmQ.shift()); return; }
  m.t += dt; const k = m.t / KM_S, u = W.morphMat.uniforms; u.uT.value = Math.min(MORPH_T[5], 0.4 + k * 1.8); u.uTime.value = T; const uT = u.uT.value;
  const bx = m.x, by = W.morph.position.y; // 30 paint-bubble pops while it boils (first 0.6 s)
  while (m.pops < 30 && m.pops < k / 0.6 * 30) { m.pops++; const c = PAL[(Math.random() * PAL.length) | 0]; spawnB({ x: bx + (Math.random() - 0.5) * m.QW * 0.7, y: by + Math.random() * m.QW * 0.35, vx: 0, vy: 40 + Math.random() * 60, g: 0, life: 0.18 + Math.random() * 0.12, cell: CELL.glob, s0: 6, s1: 22 + Math.random() * 14, r: c[0], gg: c[1], b: c[2], add: false }); }
  if (!m.rip && uT >= 0.9) { m.rip = true; for (let i = 0; i < 2; i++) spawnB({ x: bx, y: by + 12, vx: 0, vy: 0, g: 0, life: 0.45 + i * 0.12, cell: CELL.ring, s0: 30, s1: m.QW * (1.1 + i * 0.4), r: 0.7, gg: 1, b: 0.5, add: true }); G.shake = Math.max(G.shake, 0.2); }
  const w = uT > 0.9 ? Math.exp(-(uT - 0.9) * 2.2) * Math.sin((uT - 0.9) * 16) : 0.06 * Math.sin(T * 26); // squash-stretch wobble
  W.morph.scale.set(m.QW * (1 + 0.14 * w), m.QW * (1 - 0.14 * w), 1);
  if (m.t >= KM_S) { W.morph.visible = false; u.uBub.value = 0; S.km = null; cowPop(bx, by, m.cow, 0.92 * m.QW / 300); }
}
const LIFT_S = 1.1;
function startLift(sh) { const now = NOW(); if (S.lift || now < (S.liftCool || 0)) { G.shake = Math.max(G.shake, 0.25); vib(25); return; } S.liftCool = now + 9000; // at most one lift per 9 s (the muffle must stay a surprise)
  S.lift = { t: 0, sh }; S.lifts++; whoosh(); S.hero.flinch = 1; ohNo(); ohNoClip(); laugh(); sayBank('TRUCK_LIFTED'); G.shake = Math.max(G.shake, 0.35); vib([40, 30, 40]);
  songMuffle(true); play('SFX_SubSwell_SilencePull', { gain: 0.45, bus: 'amb' }); }
function liftUpdate(dt) { const L = S.lift; if (!L) { S.liftK = 0; W.col.visible = false; W.drive.position.y = 0; return; }
  L.t += dt; const k = clamp(L.t / LIFT_S, 0, 1), lk = Math.sin(k * Math.PI) ** 0.7; S.liftK = lk;
  W.drive.position.y = -lk * 150; W.dash.position.y = -VH / 2 - 10 + lk * 96; W.dash.rotation.z += Math.sin(L.t * 40) * 0.02 * lk;
  const sh = L.sh, top = sh && !sh.gone ? sh.y - 60 * sh.sc : VH / 2, bot = -VH / 2 + 120; W.col.visible = true; W.col.material.opacity = 0.6 * lk;
  W.col.position.set(sh ? sh.x : 0, (top + bot) / 2, 0); W.col.scale.set(clamp(300 * (sh ? sh.sc : 1) * 0.7, 140, 380), Math.max(10, top - bot), 1);
  if (k >= 1) { S.lift = null; S.liftK = 0; W.col.visible = false; W.drive.position.y = 0; W.dash.position.y = -VH / 2 - 10; songMuffle(false); G.shake = Math.max(G.shake, 0.5); vib(50); play('FIGHT_Riff_Hit_Splat_01', { gain: 0.35 }); } }

// ---------- v4.5 ABDUCTION (Daniel approved): 3 truck lives. A ship that isn't killed and reaches the truck (a dive the beam isn't on, or a wave timeout)
// grabs it: camera tilts up, the truck lifts in the beam, an OHNO clip plays. 8 taps in 3 s break free and KEEP the truck; a failed escape costs one (Chico).
// Losing the 3rd truck = MISSING TIME. No grabs in wave 1. A ship the beam leaves alone for 2.5 s goes for the truck (so idle play is abducted by ~45 s).
// DOT: the beam is ONE layer (W.col, a 32x128 texture, far below half-res) and the horizon fog is hidden while the camera is pushed in.
const SESS = { abducts: 0 }; // per page session (pass 3): MISSING TIME count for the tally + giggle skip
// pass 3 (Daniel: lose ~1 in 3 runs): waves 1-2 unchanged; from wave 3 on ships go for the truck sooner, re-grab sooner, and breaking free takes more taps
const TUNE = (w) => w >= 3 ? { aggro: 1.7, grace: 4200, taps: 7, max: 3.3, rad: 0.75, multi: true } : w >= 2 ? { aggro: 2.0, grace: 4800, taps: 6, rad: 0.75, multi: false } : { aggro: AGGRO_S, grace: GRAB_GRACE, taps: 6, rad: 1, multi: false }; // pass 3b (Chico): break free = 6 taps in 3 s everywhere (2 taps/s; a mid thumb at 1.9-2.5 taps/s usually makes it); lock radius 75% from wave 3; wave 4+: a 2nd ship may dive while one is beamed
const wTune = () => TUNE(S.fight ? Math.max(0, S.fight.wave) : 0);
const JINK = { base: 0.1, grow: 1.3, wave0: 0 }; // pass 3b: a beamed ship jinks sideways, harder the longer the beam holds (screen-width fraction-ish, depth-scaled); none in wave 1 so the first lock stays easy const wTune = () => TUNE(S.fight ? S.fight.wave : 0);
const TS = Math.max(1, Math.min(6, +Q.get('ts') || 1)); // headless bench only: run the game clock faster (abduction-rate sim)
const LIVES = 3, GRAB_TAPS = 8, GRAB_MAX = 3.0, GRAB_GRACE = 6000, GRACE_FREE = 9000, AGGRO_S = 2.5, NOGRAB = Q.get('nograb') === '1';
const TRUCK_SVG = '<svg viewBox="0 0 34 20" width="34" height="20"><path d="M2 6h17v9H2zM19 9h7l5 4v2H19z" fill="currentColor"/><circle cx="8" cy="16.5" r="3" fill="#111" stroke="currentColor" stroke-width="1.5"/><circle cx="26" cy="16.5" r="3" fill="#111" stroke="currentColor" stroke-width="1.5"/></svg>';
function livesHud(bump) { const e = $('lives'); if (!e) return; e.innerHTML = Array.from({ length: LIVES }, (_, i) => `<i class="${i < S.lives ? '' : 'lost'}">${TRUCK_SVG}</i>`).join(''); if (bump) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } }
function canGrab() { return !NOGRAB && S.state === 'run' && !!S.fight && (S.fight.wave >= 1 || S.grabAnyWave) && !S.grab && !S.hyper && NOW() > (S.grabGrace || 0); }
function startGrab(sh, why) {
  if (!canGrab()) return false; const Fi = S.fight;
  if (S.lift) { S.lift.t = LIFT_S; liftUpdate(0); }
  S.grabs++; S.grabLog.push([why, +runDur().toFixed(1), Fi.wave]); const lethal = false; S.grab = { t: 0, sh, taps: 0, lethal, k: 0, free: false, need: wTune().taps, max: wTune().max || GRAB_MAX };
  S.hold = false; beamSound(false); cueSet(0, false); hideAim(); for (const o of [Fi.locked, Fi.locked2]) if (o) o.L = Math.max(0, o.L * 0.6); Fi.locked = Fi.locked2 = null;
  if (sh && sh.g) setFaceG(sh.g, GF.happy); // p3b: grabbing the truck
  S.hero.flinch = 1; ohNo(); ohNoClip(); laugh(); sayBank('TRUCK_LIFTED'); songMuffle(true); play('SFX_SubSwell_SilencePull', { gain: 0.5, bus: 'amb' });
  G.shake = Math.max(G.shake, 0.5); vib([60, 40, 60]); W.fog.visible = false; pushIn(sh.x * 0.6, Math.max(0, sh.y) * 0.5 + 120, 1.12); // camera tilts up at the ship
  hideIntro(); sub(''); $('pop').classList.remove('go');
  hide('shredBtn'); if (lethal) cmd('NOOO!', false, 0); else { cmd('tap tap tap to break free', true, 0); const ce = $('cmd'); ce.classList.add('grabLine'); ce.style.top = ''; document.body.classList.add('grabOn'); /* p4c IKE: grab captions sit on the dashboard under Daniel (CSS body.grabOn), gray + beam stay clear */ show('grabBar'); grabHud(); } // p3b: one small line UNDER the ship (never over the face); the BREAK FREE button pulses on the dashboard
  return true;
}
function grabHud() { const f = $('grabFill'); if (f && S.grab) f.style.width = `${clamp(S.grab.taps / (S.grab.need || GRAB_TAPS), 0, 1) * 100}%`; }
function grabTap() { const g = S.grab; if (!g || g.lethal || g.free) return; g.taps++; S.grabTaps++; vib(15); G.shake = Math.max(G.shake, 0.22); play('FIGHT_Riff_Hit_Splat_01', { gain: 0.16, rate: 0.9 + g.taps * 0.06 }); grabHud(); if (g.taps >= (g.need || GRAB_TAPS)) grabFree(true); }
function grabFree(broke) { const g = S.grab; g.won = !!broke; hide('grabBar'); hideCmd(); document.body.classList.remove('grabOn'); { const ce = $('cmd'); ce.classList.remove('grabLine'); ce.style.top = ''; }
  if (!broke) { S.lives = Math.max(0, S.lives - 1); S.livesLost++; S.lossLog.push(+runDur().toFixed(1)); livesHud(true);
    if (S.lives <= 0) { S.abductAt = +runDur().toFixed(1); sayBank('ABDUCTED', null, true); S.cutShip = g.sh; abducted(); return; } } // pass 3: the last loss goes straight into the abduction cut scene // the last truck goes all the way up
  g.free = true; g.ft = 0; g.k0 = g.k; songMuffle(false); if (g.sh && g.sh.g && g.sh.g.face.visible) { setFaceG(g.sh.g, broke ? GF.embarrassed : GF.laughing); if (!broke) laugh(); } // p3b: got away with it -> face 14 + REX's laugh; hit/broken free -> 11
  if (broke) { S.breakFrees++; if (!S.hyper && S.shred < 100) shredAdd(30); /* breaking free keeps the truck AND charges SHRED */ popText('BROKE FREE!', '#b6ff2e'); flash(0.4, 250); play('GTR_Beat_Bonus_02_Soft', { gain: 0.4 }); }
  else { popText('TRUCK LOST!', '#ff5a5a'); if (S.lives === 1) lastTruck(); } // fires while the fight is still frozen, so it never lands on a lock
  const sh = g.sh; if (sh && !sh.gone) { if (sh.alive) startMan(sh, 'pull'); else startMan(sh, 'flee'); } }
function lastTruck() { // Chico: final-life warning: the radio warps, the last truck icon flashes red, Daniel's VO slot (caption until recorded)
  if (S.state !== 'run' || S.lives !== 1) return; S.lastWarn = (S.lastWarn || 0) + 1; $('lives').classList.add('last'); sayBank('LAST_TRUCK'); vib([80, 60, 80]); // review: not exempt, so it waits out a beam-lock countdown
  } // the song warp starts WITH the caption (voPlay), lasting as long as it. review: live wow + low-pass dip on the song bus (audio.js); the old AM-radio chain (HP 320 / LP 2.6 kHz / tanh) is no longer used
function grabUpdate(dt, T) {
  const g = S.grab; if (!g) return; g.t += dt; S.hero.flinch = Math.max(S.hero.flinch, 0.6); let k;
  if (g.lethal) { k = 1.6 + smooth(0.2, 3.0, g.t) * 14; if (g.t > 3.3 && !g.done) { g.done = true; S.abductAt = +runDur().toFixed(1); abducted(); return; } } // the truck goes all the way up the beam
  else if (!g.free) { k = Math.min(1, g.t / 0.5) * (1.6 + 0.12 * Math.sin(T * 28)); if (g.t >= (g.max || GRAB_MAX)) grabFree(false); }
  else { g.ft += dt; k = g.k0 * (1 - smooth(0, 0.45, g.ft)); if (g.ft >= 0.45) { S.grab = null; S.liftK = 0; W.col.visible = false; W.drive.position.y = 0; W.dash.position.y = -VH / 2 - 10; W.fog.visible = true; pushOut(); S.grabGrace = NOW() + (g.won ? GRACE_FREE : wTune().grace); /* a break-free earns a longer breather (pass-1 tuning: mid players were re-grabbed every ~10 s) */ if (S.shred >= 100) show('shredBtn'); G.shake = Math.max(G.shake, 0.5); vib(50); play('FIGHT_Riff_Hit_Splat_01', { gain: 0.35 }); return; } }
  g.k = k; S.liftK = k; W.drive.position.y = -k * 150; W.dash.position.y = -VH / 2 - 10 + k * 96; W.dash.rotation.z = Math.sin(g.t * 34) * 0.03 * Math.min(1, k);
  const sh = g.sh, top = sh && !sh.gone ? sh.y - 60 * sh.sc : VH / 2, bot = -VH / 2 + 120 + k * 96; W.col.visible = true; W.col.material.opacity = g.free ? 0.6 * (1 - g.ft / 0.45) : 0.7 + 0.1 * Math.sin(T * 20);
  W.col.position.set(sh ? sh.x : 0, (top + bot) / 2, 0); W.col.scale.set(clamp(300 * (sh ? sh.sc : 1) * 0.8, 160, 420), Math.max(10, top - bot), 1);
}
function abducted() { if (!L2.on && !S.l2Done) { S.l2Done = true; document.body.classList.remove('grabOn'); S.state = 'missing'; S.grab = null; S.fight = null; S.hold = false; beamSound(false); cueSet(0, false); hideAim(); hideCmd(); sub(''); W.col.visible = false; GR.forEach((g) => (g.face.visible = false)); drawShips(0); hide('shredBtn'); hide('grabBar'); stopAll(); clearPops(); bannerClear(); cutscene(() => { clearPops(); bannerClear(); enterShip(); startRun(RUN_MODE); }); return; } // pass 1: the last truck goes up -> the MISSING TIME end card right away (score + board + Play Again); 'SIGN THE SHEET' posts any run with >= 1 kill
  document.body.classList.remove('grabOn'); S.abducted = true; S.missN = ++SESS.abducts; S.missCardDone = false; S.grab = null; S.fight = null; S.state = 'missing'; S.hold = false; beamSound(false); cueSet(0, false); hideAim(); hideCmd(); sub('');
  W.col.visible = false; GR.forEach((g) => (g.face.visible = false)); drawShips(0); hide('shredBtn'); hide('grabBar'); ['saved', 'meter', 'cowQ'].forEach(hide); hideIntro();
  calcScore(); S.rank = rankFor(S.souls); const c = A.ctx; ramp(A.cleanGain.gain, 0, c.currentTime, 0.5); ramp(A.radioGain.gain, 0, c.currentTime, 0.1); engineLevel(0, 0.4); songMuffle(false);
  flash(0.6, 500); play('SFX_SubSwell_SilencePull', { gain: 0.6, bus: 'amb' });
  // pass 3: ~5 s CUT SCENE: Daniel rises in the green beam with his guitar, pink/blue/green notes around him, into the saucer, which zooms away. The song (94.4 s, chord on 'Oh no!' 3.5 s) starts now.
  const sh = S.cutShip; S.cutShip = null; W.hero.visible = true; S.cut = { t: 0, x0: W.hero.position.x, y0: W.hero.position.y, sx: sh ? sh.x : 0, sy: sh ? Math.max(sh.y, 380) : 480, ss: sh ? Math.max(0.8, sh.sc) : 1.1 }; S.cuts = (S.cuts || 0) + 1; S.cutAt = NOW();
  W.drive.position.y = 0; W.dash.position.y = -VH / 2 - 10; S.liftK = 0; pushIn(S.cut.sx * 0.3, 200, 1.06); missSong(); S.missSkippable = S.missN > 1; S.missSkipAt = NOW() + MISS_AUDIO.ohno * 1000; play('SFX_SubSwell_SilencePull', { gain: 0.5, bus: 'amb', when: A.ctx.currentTime + 3.9 });
}
const CUT_S = 5.0, NOTE_RGB = [[1, 0.35, 0.8], [0.25, 0.6, 1], [0.55, 1, 0.25]]; // pink, blue, green
function cutUpdate(dt, T) { const c = S.cut; if (!c) return; c.t += dt; const t = c.t, h = W.hero, rise = smooth(0.4, 3.6, t), into = smooth(3.4, 4.1, t), zoom = smooth(4.1, 4.8, t);
  const hx = lerp(c.x0, c.sx, rise), hy = lerp(c.y0, c.sy - 260, rise) + Math.sin(t * 5) * 10 * (1 - into); h.position.set(hx, hy, 0); h.rotation.z = Math.sin(t * 3.1) * 0.12 * (1 - into); const hs = (1 - 0.65 * rise) * (1 - into); h.scale.set(408 * hs, 640 * hs, 1); h.visible = hs > 0.02;
  if (into > 0 && !c.gulp) { c.gulp = true; play('FIGHT_Riff_Hit_Splat_01', { gain: 0.3, rate: 0.7 }); }
  // the saucer (instance 0 of the ship mesh) hovers, then zooms off up-right
  const zx = c.sx + zoom * 900, zy = c.sy + zoom * 700, zs = c.ss * (1 + 0.15 * Math.sin(t * 2)) * (1 - 0.85 * zoom); _d.position.set(zx, zy, 0); _d.rotation.set(0, 0, Math.sin(t * 2) * 0.05 + zoom * 0.4); _d.scale.set(zs, zs, 1); _d.updateMatrix(); W.ships.setMatrixAt(0, _d.matrix); _c.setRGB(1, 1, 1); W.ships.setColorAt(0, _c); W.ships.instanceMatrix.needsUpdate = W.ships.instanceColor.needsUpdate = true;
  const top = c.sy - 60, bot = -VH / 2 + 160; W.col.visible = t < 4.2; W.col.material.opacity = (0.75 + 0.1 * Math.sin(T * 20)) * (1 - smooth(3.8, 4.2, t)); W.col.position.set(lerp(c.x0, c.sx, rise * 0.8), (top + bot) / 2, 0); W.col.scale.set(300, top - bot, 1);
  if (t < 3.9 && Math.random() < 0.55) { const k = (Math.random() * 3) | 0, cc = NOTE_RGB[k], a = Math.random() * 7; S.cutNotes = (S.cutNotes || 0) + 1; S.cutNoteRGB = S.cutNoteRGB || [0, 0, 0]; S.cutNoteRGB[k]++;
    P.spawn({ x: hx + Math.cos(a) * 170, y: hy + 320 * hs + Math.sin(a) * 200, vx: -Math.sin(a) * 90, vy: 90 + Math.random() * 80, g: -20, drag: 0.5, life: 1.3, cell: CELL.note + ((Math.random() * 4) | 0), s0: 34, s1: 24, r: cc[0], gg: cc[1], b: cc[2], a: 1, add: true, rot: 0, vr: 3 }); }
  if (t >= CUT_S) cutEnd(); }
function cutEnd() { if (!S.cut) return; S.cut = null; W.hero.visible = false; W.col.visible = false; drawShips(0); W.fog.visible = true; pushOut(); if (S.state !== 'missing') return; S.nameDone = !canPost(S) || !!Q.get('noboard'); showEnd(); }
// REX-style danger hum (synth, no file): a low beating drone that swells as a ship closes in on the truck
function dangerUpdate() { const Fi = S.fight; let d = 0;
  if (Fi && S.state === 'run') for (const sh of Fi.ships) if ((sh.alive || sh.tgrab) && !sh.gone) d = Math.max(d, (1 - smooth(3, 14, sh.Z)) * (sh.man.kind === 'dive' ? 1 : 0.35));
  if (S.grab && !S.grab.free) d = 1; S.danger = d; S.dangerPeak = Math.max(S.dangerPeak || 0, d);
  if (!S.beds) S.beds = {}; if (!S.beds.danger && d > 0.02 && A.buf.AMB_Danger_Rumble_Loop) S.beds.danger = play('AMB_Danger_Rumble_Loop', { loop: true, gain: 0, bus: 'amb' }); // pass 3: REX's recorded rumble replaces the synth drone (same d*d curve)
  if (S.beds.danger) ramp(S.beds.danger.g.gain, 0.9 * d * d, null, 0.15); }

// ---------- audio helpers ----------
function engineLevel(v, tc = 0.4) { const b = S.beds && S.beds.truck; if (b) ramp(b.g.gain, v, null, tc); }
function laugh() { if (A.buf.VO_Gray_Laugh) play('VO_Gray_Laugh', { gain: 0.9 }); else play(pick('ALIEN_Laugh_Miss', 3), { gain: 0.9 }); S.laughs++; S.grayLaughs = (S.grayLaughs || 0) + (A.buf.VO_Gray_Laugh ? 1 : 0); } // pass 3: REX's HA HA HA on an escape or a truck grab
// REX: the BEAM HUM climbs in key with the countdown (D E F# A), a second hum (a third above) stacks when two ships are locked,
// and a big D chord lands on the pop. Every voice = triangle + sine an octave down, through TWO 1.8 kHz lowpasses (nothing above ~2 kHz).
const lp18 = (c) => { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.Q.value = 0.7; return f; };
// pass 3 (Daniel): the synth lock hum (humVoice/humSet) is removed; no sample yet -> silent. cueSet keeps the lock-stage bookkeeping only.
function cueStart() {}
function cueSet(stage, on, stage2 = -1) { S.humN = 0; }
// REX v4.3 POINT BLANK: horn honk pitched down (rate 0.8) + a synth D5 power chord + the cow moo (+120 ms), all through 2x 1.8 kHz lowpass
function pbBus() { const c = A.ctx; if (S.pbBus && S.pbBus.c === c) return S.pbBus.in; const i = c.createGain(), l1 = lp18(c), l2 = lp18(c); i.connect(l1); l1.connect(l2); l2.connect(A.bus.sfx); S.pbBus = { c, in: i }; return i; }
function pointBlank(sh) { const c = A.ctx; if (!c) return; S.pointBlanks++; const d = pbBus(), t = c.currentTime;
  cmd('POINT BLANK!', false, 1200); G.shake = Math.max(G.shake, 0.8);
  play('ANIMAL_Cow_Moo_01', { gain: 0.72, when: t + 0.12, dest: d }); // pass 3 (REX): the horn honk is gone here
  play(A.buf.GTR_PointBlank_Chord ? 'GTR_PointBlank_Chord' : ATTACK.chord, { gain: 0.6, dest: d }); S.pbChord = (S.pbChord || 0) + 1; } // pass 3: REX's recorded GTR_PointBlank_Chord replaces the synth power chord
function killChord() { const c = A.ctx; if (!c) return; const t = c.currentTime; S.chords = (S.chords || 0) + 1; if (A.buf[ATTACK.chord]) { S.chordFiles = (S.chordFiles || 0) + 1; play(ATTACK.chord, { gain: ATTACK.chordGain }); return; }
  /* pass 3: no synth chord fallback; without the sample the kill is silent */ }
// pass 2 (REX): the beam attack is Daniel's guitar. ATTACK is the one hook: strums cycle one per song beat while the beam is held,
// the kill lands GTR_Kill_Chord. If the strum files are missing from the pack, the old zap start/loop/stop + synth chord play instead.
const ATTACK = { strums: ['GTR_Strum_01', 'GTR_Strum_02', 'GTR_Strum_03', 'GTR_Strum_04', 'GTR_Strum_05', 'GTR_Strum_06'], chord: 'GTR_Kill_Chord', gain: 0.5, chordGain: 0.8, bus: 'soft',
  zap: { start: 'GTR_Beam_Start_01', loop: 'GTR_Beam_Loop', stop: 'GTR_Beam_Stop' } };
const hasStrums = () => ATTACK.strums.every((n) => A.buf[n]);
function strum() { const n = ATTACK.strums[(S.strumI = ((S.strumI || 0) + 1)) % ATTACK.strums.length]; S.strums = (S.strums || 0) + 1; S.lastStrum = n; S.strumAt = NOW(); if (S.hero) S.hero.strum = 1; return play(n, { gain: ATTACK.gain, bus: ATTACK.bus }); }
const STRUM_FALLBACK = true; // pass 3: the beam plays REX's guitar stem (the song itself); the strum cycling is ONLY the fallback until the stem file ships
function beamSound(on) {
  if (hasStem()) { stemBeam(on); S.stemBeamOn = on; if (on) S.stemBeams = (S.stemBeams || 0) + 1; return; }
  if (STRUM_FALLBACK && hasStrums()) { if (on) { if (S.strumOn) return; S.strumOn = true; S.strumI = -1; strum(); } else if (S.strumOn) S.strumOn = false; return; }
  const z = ATTACK.zap; // fallback: the old laser zap
  if (on) { if (S.beamLoop) return; play(z.start, { gain: 0.45, bus: 'soft' }); S.beamLoop = play(z.loop, { loop: true, gain: 0.28, bus: 'soft' }); }
  else if (S.beamLoop) { S.beamLoop.stop(0, 0.08); S.beamLoop = null; play(z.stop, { gain: 0.35, bus: 'soft' }); }
}

// ---------- run flow ----------
const hide = (id) => $(id).classList.add('hidden'), show = (id) => $(id).classList.remove('hidden');
function clearPops() { ['pop', 'ptsPop'].forEach((id) => { const e = $(id); if (e) { e.classList.remove('go'); e.textContent = ''; } }); hide('saved'); S.savedPend = null; clearTimeout(S.savedPT); }
function startRun(mode, opts) { RUN_MODE = mode; clearPops(); if (!L2.on) S.l2Done = false; /* fix: a fresh Level One run must always be able to go to Level Two */ S.cut = null; clearSave(); bannerClear(); S.runAlive = true; saveAt = 0; // p4h: a new run replaces any saved one (a restore consumes its save first) S.missT0 = 0; [S.giggleT, S.giggleT0, S.missOpenT, S.missChordT, S.missFadeT].forEach(clearTimeout); // pass 3: a stale timer from the last loss must not unlock the next one
  stopGiggle(); stopAll(); P.clear(); hideIntro(); S.beamLoop = null;
  Object.assign(S, { hero: { beat: 0, cheer: 0, oops: 0, raise: 0, bang: 0, flinch: 0 }, lift: null, liftCool: 0, lifts: 0, lives: LIVES, grab: null, grabs: 0, grabLog: [], livesLost: 0, lossLog: [], grabAnyWave: false, abductAt: null, lastWarn: 0, aggroDives: 0, grabTaps: 0, breakFrees: 0, grabGrace: 0, abducted: false, danger: 0, dangerPeak: 0, maxShips: 0, cowGags: 0, panics: 0, meltWins: [], meltCur: null, meltUntil: 0, meltMin: 0, fpsAll: [0, 0], sec: {}, killLog: [], chords: 0, dual: 0, morphDone: false, morphMinFps: 0, morphFps: 0, souls: 0, laughs: 0, steerT: 0, beds: {}, kills: 0, melts: 0, firstKill: null,
    streak: 0, bestStreak: 0, streakPts: 0, cowPts: 0, cowHits: 0, hitStopUntil: 0, lockedOnce: false, latch: false, shredRdy: false, finalSave: null, pointBlanks: 0, score: 0, newBest: false, rankShown: false, bestShown: false, budget: null, slowUntil: 0, hold: false, finger: null, fight: null, pressId: 0, chain: null, restored: false, runT0: NOW(), soCloses: 0, mocks: 0, rank: null, firstShipT: null, shred: 0, hyper: null, hypers: 0, hyperKills: 0, shredReadyAt: [], hyperAt: [], voQ: [], voCur: null, voLog: [], nameDone: false, boardRes: null, cowPopVo: 0, ohnos: 0, taunts: 0, ohnoW4: false, cowsPicked: 0, baldSeen: false });
  document.body.classList.remove('grabOn');  hide('shredBtn'); hide('vo'); hide('nameScreen'); shredHud(); document.body.classList.remove('hyperOn');
  W.cows.count = 0; W.morph.visible = false; W.cowPop.visible = false; S.km = null; S.kmQ = []; S.popQ = []; S.cowPopsShown = 0; S.cowList = []; S.finalCow = null; W.col.visible = false; songMuffle(false); W.fog.visible = true; W.drive.position.y = 0; W.dash.position.y = -VH / 2 - 10; S.liftK = 0; hide('grabBar'); $('lives').classList.remove('last'); clearInterval(S.warpIv); if (A.songEl) A.songEl.playbackRate = 1; if (A.stemEl) A.stemEl.playbackRate = 1; livesHud();
  GR.forEach((g) => { faceReset(g); g.face.visible = false; g.melt = 0; g.fade = undefined; g.bulge = g.bob = g.mock = 0; g.lookAt = null; g.snap = false; });
  W.hero.visible = true; W.beam.mesh.visible = false; W.props.forEach((p) => { if (p.once) { p.z = p.z0 || 30; p.visible = true; } });
  ['rank', 'bubble', 'newBest', 'endCard', 'saved', 'meter', 'lockRing', 'reticle', 'cowQ'].forEach(hide); hideCmd(); sub('');
  show('hud'); soulsHud(); scoreHud(0); hide('holdHere'); G.zoom = 1; G.focus.set(0, 0);
  const t0 = opts && opts.songT != null ? opts.songT : mode === 'parade' ? 66 : START_T;
  Song.reset(); seekAndPlay(A.songEl, t0); ramp(A.radioGain.gain, 0, null, 0.05); ramp(A.cleanGain.gain, SONG_RUN, null, 0.2); A.cleanLP.frequency.cancelScheduledValues(0); A.cleanLP.frequency.value = 20000; // v4.4 REX: clean route only, no extra EQ
  S.beds.truck = play('AMB_Truck_Drive_Loop', { loop: true, gain: 0, bus: 'veh' }); engineLevel(ENGINE_LVL, 0.3); // REX's truck loop; no crickets, no static
  cueStart(); cueSet(0, false);
  S.state = 'run'; S.bi = bIdx(t0);
  if (mode === 'parade') { S.souls = 3; S.kills = 3; soulsHud(); return startParade(); }
  const w0 = mode === 'duel' ? WAVES.length - 1 : clamp((parseInt(Q.get('wave') || '1', 10) || 1) - 1, 0, WAVES.length - 1);
  S.fight = { wave: w0 - 1, t: 0, t0: 0, ships: [], next: FIRST_WAVE_AT, waveOn: false, locked: null, lastKillPress: -1, spawnQ: [] };
  sub('📻 KCR9 AM · County Road 9'); 
}
function onBeat(i) { if (S.hero) S.hero.beat = 1; shredBeat(); if (S.strumOn && S.hold && S.state === 'run' && NOW() - (S.strumAt || 0) > 150) strum(); if (S.state === 'parade') beatPulse(); }

// ----- waves -----
function nextWave() {
  const Fi = S.fight; Fi.wave++;
  if (Fi.wave >= WAVES.length) return startParade();
  const spec = WAVES[Fi.wave]; Fi.ships = Fi.ships.filter((s) => !s.gone); Fi.waveOn = true; Fi.t0 = Fi.t; Fi.wkills = 0;
  for (let k = 0; k < spec.n; k++) Fi.spawnQ.push([Fi.t + k * 0.35, k]);
  cmd(spec.call, true, 1700); { const WL = voPick('WAVE', Fi.wave); let ohD = 0; if (Fi.wave === 3 && !S.ohnoW4) { S.ohnoW4 = true; S.ohnoW4At = +runDur().toFixed(1); ohD = ohNoClip() || 0; } // v4.5.2 REX: Daniel's sung OH NO on the 2-ship entrance, once per run, ducked (grab or not)
    if (ohD) { S.w4LineDelay = Math.round(ohD * 1000 + 250); setTimeout(() => { if (S.fight === Fi && S.state === 'run') { S.w4LineAt = NOW(); sayNow(WL, 'wave'); } }, S.w4LineDelay); } else sayNow(WL, 'wave'); } // REX ruling: OHNO first, wave-4 intro 250 ms after it ends (no overlap)
  /* Daniel's 'oh no' bank, one line per wave; pass 3: the instant the wave appears */ S.callAt = NOW(); S.lastCall = spec.call; S.calls = (S.calls || 0) + 1; play(pick('ALIEN_Smug_Chirp', 3), { gain: 0.8 });
  if (Fi.wave === 0 || Q.get('skip')) { play('GTR_Beat_Bonus_02_Soft', { gain: 0.5 }); vib(60); showIntro('AIM & BEAM!', 'beam', 3); sub(matchMedia('(pointer: coarse)').matches ? 'Tap anywhere to fire. Slide to aim.' : 'Hold the mouse on the ship and drag to aim.'); $('sub').classList.add('dashHint'); /* p4d IKE: the aim hint sits on the dashboard, off the gray's forehead */ }
  show('meter'); $('meterTxt').textContent = `WAVE ${spec.label}`; $('meterFill').style.width = '100%';
  ramp(A.cleanGain.gain, SONG_RUN * 0.63, null, 0.4); engineLevel(ENGINE_LVL * 0.6); saveRun(true);
}
function prepWave(w) { // DOT: pre-stage the next saucer slots during the melt (paint layer cleared + uploaded, face reset), so the spawn costs nothing
  const Fi = S.fight; if (w >= WAVES.length) return; const busy = new Set(Fi.ships.filter((s) => !s.gone).map((s) => s.slot));
  GR.forEach((g, i) => { if (busy.has(i)) return; faceReset(g); paintClear(g); g.face.visible = false; g.mat.uniforms.uMelt.value = 0; g.mat.uniforms.uBulge.value = 0; });
}
function spawnShip(k) { if (S.firstShipT == null) S.firstShipT = +((NOW() - S.runT0) / 1000).toFixed(2); // DANA: first ship within ~8 s of the drive // returns false (and the spawn waits) while both on-screen slots are still busy: DOT's 2-ship cap includes fleeing saucers
  const Fi = S.fight, spec = WAVES[Fi.wave];
  const slot = [0, 1].find((i) => !Fi.ships.some((s) => s.slot === i && !s.gone)); if (slot === undefined) return false;
  AT.green = 1.1; const g = GR[slot]; showGray(g, 0, 0, 0.05, GF.serious); g.snap = true; g.fade = 0; g.bulge = g.bob = g.mock = 0; g.lookAt = null; g.mat.uniforms.uBulge.value = 0;
  const side = [-1, 1][k % 2];
  const sh = { slot, g, alive: true, size: spec.size, spd: spec.speed, X: side * 3 + (Math.random() - 0.5), Y: 3.2, Z: 46, ph: Math.random() * 6, L: 0, Lpeak: 0, stage: 0, laughT: -9, peeked: S.souls > 0, x: 0, y: 0, sc: 0.01, fx: 0, fy: 0, fr: 1 };
  startMan(sh, sh.peeked ? 'peek' : 'swoop'); Fi.ships.push(sh); return true;
}
// maneuvers in real depth: X lateral, Y height, Z distance (metres). Z is eased in 1/Z so a swoop grows smoothly on screen.
function startMan(sh, kind) {
  const zN = sh.size > 2.5 ? 5.6 : 5; const rx = (z, f) => (Math.random() * 2 - 1) * z * f; let to, dur;
  switch (kind) {
    case 'peek': to = [sh.X * 0.45, 3.8, 7.5]; dur = 0.6; break; // v4.2: close enough that the double-take reads on a phone
    case 'panic': to = [sh.X, sh.Y, sh.Z]; dur = 1.0; panicGag(sh); break;
    case 'swoop': { const z = zN + Math.random() * 3; to = [rx(z, 0.22), 3.9 + Math.random() * 0.7, z]; dur = sh.peeked ? 0.9 : 1.5; break; }
    case 'hover': { const z = clamp(sh.Z + (Math.random() - 0.5) * 2, zN, sh.size > 2.5 ? 8 : 11); to = [clamp(sh.X + (Math.random() - 0.5) * 1.2, -z * 0.28, z * 0.28), 3.5 + Math.random() * 1.3, z]; dur = 2.2; break; }
    case 'strafe': { const z = clamp(sh.Z + (Math.random() - 0.5) * 3, 4.5, 13); to = [-Math.sign(sh.X || 1) * z * (0.18 + Math.random() * 0.12), 3.2 + Math.random() * 1.6, z]; dur = 2.0; break; }
    case 'pull': { const z = 14 + Math.random() * 8; to = [rx(z, 0.18), 4.5 + Math.random() * 1.5, z]; dur = 2.0; break; }
    case 'dive': to = [truckX() + (Math.random() - 0.5) * 0.5, 1.8, 2.8]; dur = 1.3; sh.dove = false; break;
    case 'flee': to = [sh.X * 2 + (Math.random() - 0.5) * 4, 10, 45]; dur = 1.4; break;
  }
  if (['swoop', 'hover', 'strafe', 'pull'].includes(kind)) for (const o of S.fight.ships) { // keep a crowd readable: no two ships stacked on the same screen column
    if (o === sh || !o.alive || o.gone || !o.man) continue; const ox = o.man.to[0] / o.man.to[2], mx = to[0] / to[2];
    if (Math.abs(mx - ox) < 0.16) to[0] = clamp((ox + (mx >= ox ? 0.17 : -0.17)) * to[2], -to[2] * 0.3, to[2] * 0.3); }
  const fixed = ['peek', 'panic', 'swoop', 'flee'].includes(kind);
  sh.man = { kind, t: 0, dur: fixed ? dur : dur / sh.spd, from: [sh.X, sh.Y, sh.Z], to };
}
function nextMan(sh) {
  const k = sh.man.kind;
  if (k === 'flee') { sh.gone = true; if (!sh.g.melt) sh.g.face.visible = false; return; }
  if (k === 'peek') return startMan(sh, 'panic');
  if (k === 'panic') { sh.g.lookAt = null; sh.g.bulge = 0; setFaceG(sh.g, GF.determined); return startMan(sh, 'swoop'); }
  if (k === 'dive') return startMan(sh, sh.tgrab ? 'flee' : 'pull');
  const w = WAVES[S.fight.wave].man; let r = Math.random(), kind = 'hover';
  for (const [n, p] of Object.entries(w)) if ((r -= p) <= 0) { kind = n; break; }
  if (kind === 'dive' && S.fight.ships.some((o) => o !== sh && o.alive && o.man.kind === 'dive')) kind = 'strafe'; // one diver at a time
  if (kind === k && kind !== 'hover') kind = 'hover';
  startMan(sh, kind);
}
function panicGag(sh) { // IKE 4 (v4.2): a 1.0 s DOUBLE-TAKE at the cow parade: glance down (casual), back at you, SNAP back to the cows (eyes huge, sweat drop), then dives in anyway
  const g = sh.g, Fi = S.fight, alive = () => S.fight === Fi && sh.alive && sh.man.kind === 'panic'; S.panics++; sh.panicT0 = NOW();
  const cx = clamp(-sh.x / 500, -0.9, 0.9); g.lookAt = [cx, -0.95]; setFaceG(g, GF.curious);
  setTimeout(() => { if (alive()) { g.lookAt = [0, -0.2]; } }, 250);
  setTimeout(() => { if (!alive()) return; g.lookAt = [cx, -1]; setFaceG(g, GF.surprised); g.FA.squashT = 0.35; g.bulge = 1; g.bounce = 1; sh.take2 = true;
    P.spawn({ x: sh.fx + sh.fr * 0.75, y: sh.fy + sh.fr * 0.5, vx: 10, vy: -30, g: 160, life: 0.55, cell: CELL.drip, s0: 34, s1: 24, r: 0.55, gg: 0.85, b: 1, a: 1, add: false }); }, 480);
  setTimeout(() => { if (S.fight === Fi) { g.bulge = 0; sh.take2 = false; } }, 1000);
}
function shipStep(sh, dt, T) {
  const m = sh.man; m.t += dt; const e = smooth(0, 1, m.t / m.dur);
  sh.Z = 1 / lerp(1 / m.from[2], 1 / m.to[2], m.kind === 'flee' ? e * e : e); sh.X = lerp(m.from[0], m.to[0], e); sh.Y = lerp(m.from[1], m.to[1], e);
  if (m.t >= m.dur) nextMan(sh);
  for (const o of S.fight.ships) { if (o === sh || !o.alive || o.gone || !sh.alive) continue; // v4.2: two ships never sit on top of each other (keeps faces readable)
    const dx = sh.x - o.x, thr = (sh.fr + o.fr) * 1.05; if (Math.abs(dx) < thr && Math.abs(sh.fy - o.fy) < thr) { const push = Math.sign(dx || sh.slot - 0.5) * dt * 2.2 * Math.max(1, sh.Z / 5); sh.X += push; sh.man.to[0] += push; } }
  const wv = ['panic', 'peek'].includes(sh.man.kind) ? 0.2 : 1;
  { const Fi = S.fight, lkd = sh.alive && (sh === Fi.locked || sh === Fi.locked2) && !S.hyper && Fi.wave >= 1, ja = lkd ? JINK.base + JINK.grow * smooth(0, LOCK_S, sh.L) : 0; sh.jT = (sh.jT || 0) - dt;
    if (sh.jT <= 0) { sh.jT = 0.3 + Math.random() * 0.35; sh.jTo = (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.45); } sh.jx = lerp(sh.jx || 0, (sh.jTo || 0) * ja, Math.min(1, dt * 6)); }
  const X = sh.X + (sh.jx || 0) * (sh.fr || 60) * sh.Z / F + /* jink in ship radii on screen: the same at any depth */ Math.sin(T * 1.1 * sh.spd + sh.ph) * 0.3 * wv * Math.min(1, sh.Z / 6), Y = sh.Y + Math.sin(T * 1.7 + sh.ph) * 0.16 * wv;
  const [x, y] = proj3(X, Y, sh.Z), sc = sh.size * F / sh.Z / 300;
  const vx = (x - (sh.px ?? x)) / Math.max(dt, 1e-3); sh.bank = lerp(sh.bank || 0, clamp(-vx * 0.0006, -0.4, 0.4), Math.min(1, dt * 6)); sh.px = x;
  sh.x = x; sh.y = y; sh.sc = sc; sh.fx = x; sh.fy = y - 185 * sc; sh.fr = 217 * 0.64 * sc;
  if ((sh.alive || sh.tgrab) && sh.man.kind === 'dive' && sh.Z < 3.7 && !sh.dove) { sh.dove = true; const Fi = S.fight, beamed = sh.alive && (sh === Fi.locked || sh === Fi.locked2); // the beam on a diver shoves it off (old 1 s bump); otherwise it GRABS the truck
    if (beamed || !startGrab(sh, sh.tgrab ? 'timeout' : 'dive')) { if (sh.alive) startLift(sh); } } // a diving ship grabs the truck in its tractor beam for a second
  const g = sh.g;
  if (sh.alive || sh.escaped || sh.tgrab) { g.home = [sh.fx, sh.fy, 0.64 * sc]; g.q.renderOrder = 50 - sh.Z * 0.2; g.fade = sh.tgrab ? 1 : sh.escaped ? clamp(1 - sh.man.t / 0.8, 0, 1) : 1 - 0.5 * smooth(8, 40, sh.Z); }
}
const _d = new THREE.Object3D(), _c = new THREE.Color();
function drawShips(T) {
  const Fi = S.fight;
  const fogY = W.fog.position.y + W.drive.position.y, fogH = 210; // DOT: the additive ship glow must not stack on the additive horizon fog
  for (let i = 0; i < MAX_SHIPS; i++) { const sh = Fi && Fi.ships.find((s) => s.slot === i && !s.gone);
    if (!sh || S.state !== 'run') { _d.position.set(0, 0, 0); _d.rotation.set(0, 0, 0); _d.scale.set(0, 0, 0); _d.updateMatrix(); W.ships.setMatrixAt(i, _d.matrix); W.glows.setMatrixAt(i, _d.matrix); continue; }
    _d.position.set(sh.x, sh.y, 0); _d.rotation.set(0, 0, sh.bank + Math.sin(T * 2 + sh.ph) * 0.04); _d.scale.set(sh.sc, sh.sc, 1); _d.updateMatrix(); W.ships.setMatrixAt(i, _d.matrix);
    const fk = smooth(6, 42, sh.Z); _c.setRGB(lerp(1, 0.5, fk), lerp(1, 0.46, fk), lerp(1, 0.8, fk)); W.ships.setColorAt(i, _c); // far = hazy, bluish (fog), near = full colour
    const lk = sh === Fi.locked || sh === Fi.locked2; _d.position.set(sh.x, sh.y - 80 * sh.sc, 0); _d.rotation.set(0, 0, 0); _d.scale.setScalar(sh.sc * (lk ? 1.6 + Math.sin(T * 14) * 0.15 : 1.1)); _d.updateMatrix(); W.glows.setMatrixAt(i, _d.matrix);
    const gy = sh.y - 80 * sh.sc, gr = 150 * sh.sc * (lk ? 1.6 : 1.1), ov = clamp((Math.min(gy + gr, fogY + fogH) - Math.max(gy - gr, fogY - fogH)) / (2 * gr), 0, 1); sh.fogOv = ov;
    const a = (lk ? 0.95 : 0.35) * (1 - fk * 0.7) * (sh.alive ? 1 : 0.3) * (1 - 0.85 * ov); /* skip the glow where it overlaps the fog */ if (lk) _c.setRGB(0.5 * a, a, 0.25 * a); else _c.setRGB(a, 0.35 * a, 0.85 * a); W.glows.setColorAt(i, _c); }
  if (Fi && S.state === 'run') S.maxShips = Math.max(S.maxShips || 0, Fi.ships.filter((q) => !q.gone).length);
  W.ships.instanceMatrix.needsUpdate = W.glows.instanceMatrix.needsUpdate = true; W.ships.instanceColor.needsUpdate = W.glows.instanceColor.needsUpdate = true;
}

// ----- the BEAM LOCK -----
function fightUpdate(dt, T) {
  const Fi = S.fight; if (!Fi || S.state !== 'run' || S.grab) return; // the fight freezes while the truck is in the beam
  Fi.t += dt;
  if (Fi.next != null && Fi.t >= Fi.next) { Fi.next = null; nextWave(); if (S.state !== 'run') return; }
  while (Fi.spawnQ.length && Fi.spawnQ[0][0] <= Fi.t) { if (!spawnShip(Fi.spawnQ[0][1])) { Fi.spawnQ[0][0] = Fi.t + 0.1; break; } Fi.spawnQ.shift(); }
  if (Fi.waveOn) { const left = 1 - (Fi.t - Fi.t0) / WAVES[Fi.wave].time; $('meterFill').style.width = `${clamp(left, 0, 1) * 100}%`; if (left <= 0) escapeWave(); }
  for (const sh of Fi.ships) if (!sh.gone) shipStep(sh, dt, T);
  // targeting: the reticle must sit on the gray or its saucer; a light magnet pulls the beam end on when close
  let best = null, bd = 9, sec = null, sd = 9; // v4.2: the beam can hold TWO ships when both sit inside the reticle (second hum stacks)
  if (S.hold) for (const sh of Fi.ships) if (sh.alive && sh.Z < 26 && !['peek', 'flee'].includes(sh.man.kind)) {
    const r = Math.max(75, (sh.y - sh.fy) * 0.5 + sh.fr + 15) * (sh === Fi.locked || sh === Fi.locked2 ? 1.35 : 1) * wTune().rad, d = Math.hypot(S.aimW[0] - sh.fx, S.aimW[1] - (sh.fy + sh.y) / 2) / r;
    if (d < bd) { sec = best; sd = bd; bd = d; best = sh; } else if (d < sd) { sec = sh; sd = d; } }
  let lockNow = best && bd < 1 ? best : null, lock2 = lockNow && sec && sd < 1 ? sec : null; Fi.magnet = best && bd < 1.6 ? best : null;
  if (S.hyper) { const tg = Fi.ships.filter((sh) => sh.alive && sh.Z < 26 && !['peek', 'flee'].includes(sh.man.kind)); lockNow = tg[0] || null; lock2 = tg[1] || null; Fi.magnet = lockNow; } // HYPER: the beam auto-fires at every gray on screen
  for (const o of [lockNow, lock2]) if (o && o !== Fi.locked && o !== Fi.locked2 && !S.hyper) lockStart(o);
  for (const o of [Fi.locked, Fi.locked2]) if (o && o !== lockNow && o !== lock2) lostLock(o);
  Fi.locked = lockNow; Fi.locked2 = lock2; if (lockNow) { hideIntro(); sub(''); } if (lock2) S.dual += dt;
  for (const sh of Fi.ships) { const g = sh.g; g.mock = Math.max(0, g.mock - dt / 0.8);
    if (!sh.alive) continue;
    if (sh === lockNow || sh === lock2) { sh.g.rx.seen = NOW(); sh.L += dt * (S.hyper ? HYPER_RATE : LOCK_S / lockSec(Fi.wave)); sh.Lpeak = Math.max(sh.Lpeak, sh.L); const st = Math.floor(sh.L); if (st > sh.stage && st <= 4) { sh.stage = st; lockStage(sh, st); } if (sh.L >= LOCK_S) { kill(sh); continue; } }
    else if (sh.L > 0) sh.L = Math.max(0, sh.L - dt * LOCK_S / lockSec(Fi.wave)); // p4e Chico: off target the progress drains ~1 s of beam per second (no reset)
    faceFromLock(sh, dt); }
  if (Fi.wave >= 1) for (const sh of Fi.ships) { if (!sh.alive) continue; // a ship the beam leaves alone gets brave and dives for the truck
    if (sh === Fi.locked || sh === Fi.locked2) sh.idleT = Math.max(0, (sh.idleT || 0) - 2 * dt); else sh.idleT = (sh.idleT || 0) + dt;
    if (sh.idleT > wTune().aggro && canGrab() && !['dive', 'peek', 'panic', 'flee'].includes(sh.man.kind) && (wTune().multi || !Fi.ships.some((o) => o !== sh && o.alive && o.man.kind === 'dive'))) { sh.idleT = 0; startMan(sh, 'dive'); S.aggroDives++; } }
  const l1 = Fi.locked, l2 = Fi.locked2; cueSet(l1 ? Math.floor(l1.L) : 0, !!l1, l2 ? Math.floor(l2.L) : -1);
  if (!S.hyper && S.shred < 100) shredAdd(dt * ((Fi.waveOn ? SHRED.passive : 0) + SHRED.lock * ((l1 ? 1 : 0) + (l2 ? 1 : 0))));
}
const lockFace = (sh, L) => L < 0.05 ? idleFace(sh.g) : L >= 4 ? GF.lockScared : L >= 2 ? GF.hands11 : L >= 0.9 ? GF.lockScared : GF.lockSurp /* p4b: lock-on = solid black eyes only; frame 21 cut */;
function idleFace(g) { const t = NOW() - (g.shownAt || 0); return t < 1600 ? GF.serious : (Math.floor(t / 2600 + g.i) & 1) ? GF.happy : GF.bored; } /* p4b: arrival/idle faces are black-eyed (curious is white-eyed = comedy-only) */ // p3b: arrives Serious, idles Bored / Curious
function faceFromLock(sh, dt) { // IKE 1: 0-1 s smug grin | 1-2.5 shocked, eyes widen | 2.5-4 head bobs to the song against its will | 4-5 cries paint, screams
  const g = sh.g, L = sh.L, k = Math.min(1, dt * 6);
  if (sh.man.kind === 'panic' || g.mock > 0) { g.bob += (0 - g.bob) * k; return; }
  const cell = lockFace(sh, L); if (g.mat.uniforms.uB.value !== cell) setFaceG(g, cell); // p3b: 4 Surprised -> 8 Scared -> hands on head (video 11/21, swapped on the beat) -> 8 Scared scream
  g.FA.grinT = L < 1 ? 0.85 : 0; g.FA.strainT = clamp((L - 1) / 3, 0, 1);
  g.bulge = L >= 2 ? Math.min(1, (L - 2) * 3) * (L >= 4 ? 0.6 : 1) : 0;
  g.bob += ((L >= 2.5 && L < 4.3 ? 1 : 0) - g.bob) * k;
  g.FA.shake = L >= 4 ? 0.3 + (L - 4) * 0.6 : 0;
}
const below = (sh) => { const [, y] = toScreen(sh.fx, sh.fy - sh.fr * 1.3); return clamp(y, 60, innerHeight * 0.62); };
function lockStage(sh, st) { // Chico: 1 flinch, 2 eyes bulge, 3 paint drips, 4 scream (5 = pop, in kill). Vibration + pitch climb every second.
  const g = sh.g; vib(20 + st * 30); play(['ALIEN_Fear_Step_1', 'ALIEN_Fear_Step_2_Soft', 'ALIEN_Fear_Step_3', 'ALIEN_Gasp_01'][st - 1], { gain: (0.5 + st * 0.08) * (st === 2 ? 1.22 : 1) }); // REX: Fear_Step_2_Soft, loudness-matched
  burst(sh.fx, sh.fy, 3 + st * 3, { spd: 240 + st * 60 }); S.lockPulse = 1;
  // pass 2: no reaction words; every stage reads from the face (see grayAnim: eek -> bulge + wobble -> droop + running drips -> scream wobble)
  g.rx.stage = st; g.rx.stT = 0; S.reactStages = (S.reactStages || 0) + 1;
  if (st === 1) { g.FA.squashT = 0.55; g.bounce = 1; }
  if (st === 2) { g.bounce = 1; }
  if (st === 3) { startTears(110, g); paintSplat(2, 1, g); }
  if (st === 4) { startTears(240, g); G.shake = Math.max(G.shake, 0.3); }
}
function lostLock(sh) { // IKE 2: the gray mocks the miss with a terrible 0.8 s air guitar + laugh (you keep your progress)
  const Fi = S.fight; if (!sh.alive || sh.L < 0.6 || Fi.t - sh.laughT < 2.5) return; sh.laughT = Fi.t;
  const g = sh.g; g.mock = 1; setFaceG(g, GF.laughing); g.FA.squashT = 0.4; laugh(); S.mocks++; S.hero.oops = 1; S.mockG = g; S.mockUntil = NOW() + 800; g.q.renderOrder = 51;
  burst(sh.fx, sh.fy, 8, { cells: [CELL.note, CELL.note + 1, CELL.note + 2], spd: 300, g: 100, add: true, s0: 30, s1: 12 });
  setTimeout(() => { if (S.fight === Fi && sh.alive) { setFaceG(g, GF.determined); g.rx.glare = 1.2; S.glares = (S.glares || 0) + 1; } }, 800); // pass 2: then it glares
}
function beamUp() {
  S.hold = false; beamSound(false); const Fi = S.fight; S.streak = 0; S.chain = null;
  { const pe = $('pop'); if (pe.classList.contains('small')) pe.classList.remove('go'); } // a lock callout must not outlive the beam
  if (!Fi || S.state !== 'run') return;
  if (Fi.ships.some((s) => s.alive && s.L >= 4)) { cmd('SO CLOSE!', true); S.soCloses++; play('RADIO_Wrong_Station_Thunk', { gain: 0.6, bus: 'veh' }); vib([30, 30, 30]); }
  for (const o of [Fi.locked, Fi.locked2]) if (o) lostLock(o); Fi.locked = Fi.locked2 = null;
}
function escapeWave() { // kills are EARNED: when the wave clock runs out the survivors laugh and escape
  const Fi = S.fight; Fi.waveOn = false; let n = 0;
  let grabber = canGrab(); for (const sh of Fi.ships) if (sh.alive) { sh.alive = false; n++; setFaceG(sh.g, GF.laughing); if (grabber) { grabber = false; sh.tgrab = true; startMan(sh, 'dive'); } else { sh.escaped = true; startMan(sh, 'flee'); } } // one survivor goes for the truck
  if (n) { cmd('THEY GOT AWAY!', true); laugh(); sayBank('MISSED_ONE'); } Fi.locked = Fi.locked2 = null; Fi.next = Fi.t + (WAVES[Fi.wave + 1] && WAVES[Fi.wave + 1].chain ? 0.8 : 1.6);
}
function kill(sh) {
  if (S.hyper) AT.brk = 1.6;
  const Fi = S.fight, g = sh.g; sh.alive = false; sh.L = LOCK_S; if (Fi.locked === sh) { Fi.locked = Fi.locked2; } Fi.locked2 = null; cueSet(4, false); killChord(); S.meltUntil = NOW() + 2400;
  S.kills++; Fi.wkills++; if (S.firstKill == null) S.firstKill = round2((NOW() - S.runT0) / 1000); // DANA: rounded BEFORE scoring
  const cont = !!S.chain && S.pressId === S.chain.from + 1 && Fi.lastKillPress === S.chain.from; /* p4h: the first press after a pause/restore continues the chain the pause interrupted */ S.streak = Fi.lastKillPress === S.pressId || cont ? S.streak + 1 : 1; S.chain = null; Fi.lastKillPress = S.pressId; S.bestStreak = Math.max(S.bestStreak, S.streak); // streak = kills chained without letting go
  const fx = sh.fx, fy = sh.fy, lastOfWave = !Fi.ships.some((s) => s.alive), final = lastOfWave && Fi.wave === WAVES.length - 1;
  S.killLog.push([Fi.wave, +(Fi.t - Fi.t0).toFixed(2), S.streak]);
  const pb = sh.Z < PB_Z; if (pb) pointBlank(sh);
  if (!S.hyper) shredAdd(SHRED.kill + (S.streak >= 2 ? SHRED.streak * S.streak : 0)); else S.hyperKills = (S.hyperKills || 0) + 1;
  vib(pb ? [90, 30, 260] : [60, 30, 220]); play('ALIEN_Scream_Melt_01', { gain: 0.75 }); play('FIGHT_Paint_Burst', { gain: 0.7 }); paintSfx('brush'); setTimeout(() => paintSfx('drip'), 380);
  setFaceG(g, GF.scared); g.twinT = 1; setTimeout(() => { if (g.face.visible) setFaceG(g, GF.sad); }, 150); g.FA.shake = 1; startTears(320, g); g.bob = 0; g.bulge = 1; g.mock = 0; g.rx.popT = 0; g.rx.wisp = false; g.rx.stage = 4;
  S.budget = 240; clearTimeout(S.budgetT); // pass 2 DOT: 240 melt + <= 100 drips < 350 S.budgetT = setTimeout(() => (S.budget = null), 2400);
  paintRun(fx, fy, 3); windshieldSplat(fx, fy); splash(fx, fy, 26); flash(S.streak >= 2 ? 0.4 : 0.75, 240); /* p4f: harder flash */ G.shake = 0.82; S.hero.flinch = 0; if (S.streak >= 2) { S.hero.bang = 1; S.hero.raise = 0; S.bangs = (S.bangs || 0) + 1; } else { S.hero.raise = 1; S.raises = (S.raises || 0) + 1; } // IKE: guitar overhead on a kill, head-bang on a streak
  { const m = multOf(S.streak); sh.saveMult = m; sh.savePts = SCORE.SAVE * m; S.cowPts += sh.savePts; } // p4f: the SAVED cow pays 1,500 x the streak at the kill (cap 5x); shown when the cow is saved (savePop)
  S.hitStopUntil = Math.max(S.hitStopUntil, NOW() + 80); // p4f IKE: ~80 ms hit-stop (game time only; audio + beam sound are wall-clock and untouched; fight time can only fall BEHIND the wall clock)
  if (S.streak >= 2) { play('GTR_Beat_Bonus_02_Soft', { gain: 0.41 }); ramp(A.cleanGain.gain, SONG_RUN * Math.min(1.21, 0.63 + 0.15 * S.streak), null, 0.15); S.streakShown = NOW(); }
  if (lastOfWave) { Fi.waveOn = false; prepWave(Fi.wave + 1); S.dryUntil = NOW() + 2600; } // clean wave: the paint dries into a finished canvas (DLR signature)
  saveRun(true); // p4h: the kill is in the save the moment it happens (score, streak, wave state); the final kill deletes it
  if (final) { killTaunt(null); slowMo(350); setTimeout(() => { if (S.fight === Fi && S.state === 'run') startMorph(sh); }, 350); return; } // the last gray gets the full, centred cow morph
  pushIn(fx, fy, 1.3); slowMo(450);
  setTimeout(() => { if (S.fight !== Fi) return; g.melt = 1; g.FA.shake = 0; fleeSfx(); }, 300);
  const cow = pickCow(!!S.hyper); sh.cow = cow; (S.cowList = S.cowList || []).push(cowKey(cow, cow.bald ? 'bald' : 'hybrid')); killTaunt(cow);
  setTimeout(() => { if (S.fight !== Fi) return; (S.kmQ = S.kmQ || []).push({ x: fx, y: fy, fr: sh.fr, cow, g }); }, 300); // v4.5: the 1 s bubble morph starts with the melt
  setTimeout(() => { if (S.fight !== Fi) return; addSoul(); S.melts++; confetti(fx, fy, 40); play('FIGHT_Saved_Sting_Soft', { gain: 0.39 }); savedBanner(WAVES[Fi.wave].lines[0], true); pushOut(); savePop(sh.savePts, sh.saveMult, ...toScreen(fx, fy)); }, 520);
  setTimeout(() => { if (S.fight === Fi) { startMan(sh, 'flee'); sh.man.dur = 0.9; } }, 600); // the empty saucer clears out fast so the next pair can come in
  if (lastOfWave) Fi.next = Fi.t + (WAVES[Fi.wave + 1] && WAVES[Fi.wave + 1].chain ? 1.2 : 1.7); // the next ship comes right after the melt; the 2nd swarm pair right on its heels
}
function savedBanner(line, wait) { if (wait) { S.savedPend = line; clearTimeout(S.savedPT); S.savedPT = setTimeout(() => S.savedPend != null && savedBanner(S.savedPend), 4500); return; } S.savedPend = null; clearTimeout(S.savedPT); bannerPush({ ms: BANNER_MS, hide: () => hide('saved'), show: () => { S.savedShownAt = NOW(); $('winLine').textContent = line || ''; { const bg = document.querySelector('#saved .big'); if (bg) bg.textContent = L2.on ? 'NO SOUL. NO CHANCE.' : WIN_LINES[0]; } const e = $('saved'); show('saved'); e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; } }); }
function addSoul() { S.souls++; soulsHud(); if (W.paint) W.paint.streak(0.2 + Math.random() * 0.6, 0.98, 2, 0.008); } // a saved cow: a white run from the top
// p4f scoring display + juice
const fmt = (n) => Math.abs(n).toLocaleString('en-US');
function scoreHud(bump) { S.score = scoreOf(S); const e = $('scoreN'); if (e) e.textContent = S.score.toLocaleString('en-US'); const h = $('scoreHud'); if (h) { h.classList.remove('hidden'); if (bump) { h.classList.remove('bump'); void h.offsetWidth; h.classList.add('bump'); } } saveRun(); }
function ptsPop(txt, cls, sx, sy) { const el = $('ptsPop'); el.textContent = txt; el.className = cls || ''; el.style.left = `${clamp(sx, 70, innerWidth - 70)}px`; el.style.top = `${clamp(sy, 90, innerHeight * 0.6)}px`; void el.offsetWidth; el.classList.add('go'); }
function savePop(pts, mult, sx, sy) { if (!pts) return; ptsPop(mult >= 2 ? `+${fmt(pts)} x${mult} STREAK${mult >= SCORE.MULT_CAP ? ' MAX' : ''}` : `+${fmt(pts)}`, mult >= 2 ? 'streak' : '', sx, sy); S.pointsShown = (S.pointsShown || 0) + 1; S.lastSavePop = [pts, mult]; scoreHud(1); }
function windshieldSplat(x, y) { if (!W.paint) return; const [sx, sy] = toScreen(x, y); const px = clamp(sx / innerWidth + (Math.random() - 0.5) * 0.08, 0.06, 0.94), py = clamp(1 - sy / innerHeight + (Math.random() - 0.5) * 0.05, 0.1, 0.95), c = Math.random() < 0.5 ? 0 : 1;
  W.paint.splat(px, py, c, 0.05 + Math.random() * 0.025); W.paint.splat(clamp(px + (Math.random() - 0.5) * 0.3, 0.05, 0.95), clamp(py + (Math.random() - 0.5) * 0.12, 0.1, 0.95), 2, 0.03 + Math.random() * 0.02); W.paint.streak(px, py, c, 0.014 + Math.random() * 0.012); S.splats = (S.splats || 0) + 1; }
// p4f: shooting a SAVED cow by mistake (the beam dwelling 0.25 s on a landed cow while not locked on a gray) = -1,000 and the streak breaks; once per cow
function cowShotUpdate(dt) { const c = W.cowPop, Fi = S.fight; if (!c.visible || c.shot || !S.hold || S.state !== 'run' || S.hyper || S.grab || !Fi || Fi.locked || Fi.locked2 || S.popT < FLY + 0.15 || S.popT > c.landEnd) { if (c.aimT) c.aimT = 0; return; }
  const w = Math.abs(c.scale.x) * 300, h = Math.abs(c.scale.y) * 300, dx = Math.abs(S.aimW[0] - c.position.x), dy = S.aimW[1] - c.position.y;
  if (dx < w * 0.4 && dy > -20 && dy < h * 0.9) { c.aimT = (c.aimT || 0) + dt; if (c.aimT >= 0.25) cowShot(c); } else c.aimT = 0; }
function cowShot(c) { c.shot = true; c.hit = 1; S.cowHits = Math.min(S.cowHits + 1, S.kills); S.streak = 0; vib([40, 40, 40]); G.shake = Math.max(G.shake, 0.4); play('ANIMAL_Cow_Moo_02', { gain: 0.6, rate: 1.15 }); popText('Sorry, Bessie!', '#ff9fb8');
  const [sx, sy] = toScreen(c.position.x, c.position.y + 140); ptsPop(`-${fmt(SCORE.COW_HIT)}`, 'neg', sx, sy); scoreHud(1); S.cowShots = (S.cowShots || 0) + 1; }
function paintRun(x, y, n) { if (!W.paint) return; const [sx, sy] = toScreen(x, y); for (let k = 0; k < n; k++) W.paint.streak(clamp(sx / innerWidth + (k - (n - 1) / 2) * 0.05 + (Math.random() - 0.5) * 0.02, 0.03, 0.97), clamp(1 - sy / innerHeight, 0, 1), k % 2 ? 1 : 0, 0.016 + Math.random() * 0.014); S.paintRuns = (S.paintRuns || 0) + n; } // kills / melts splash paint that runs DOWN the screen
function pushIn(x, y, z) { G.zoom = z; G.focus.set(x * 0.8, y * 0.75); }
function pushOut() { G.zoom = 1; G.focus.set(0, 0); }
function slowMo(ms) { S.slowUntil = NOW() + ms; }
// IKE 3 (v4.5): the hybrid cow drops out of the morph with BLACK alien eyes, lands with the hybrid moo, chews, looks around confused;
// HYPER kills: hair sheds (~40 tufts) -> bald gray cow (plain or spotted) with its own reaction gag.
function nextGrayX() { const Fi = S.fight; if (!Fi) return null; const sh = Fi.ships.find((q) => q.alive && !q.gone); if (sh) return sh.fx; return Fi.spawnQ && Fi.spawnQ.length ? 0 : null; }
function sfxSlot(n, gain) { if (A.buf[n]) play(n, { gain }); } // REX's file when it lands; silent until then
// bald (HYPER) cow gags: Holstein = melting ripple (Jelly_Splat) | spotted longhorn = head shake, black eyes POP on the Horn_Wobble's final thud (2.4 s) |
// grinner = laughs at the next incoming gray | plain gray = moo, then a bonk squash (Blink_Bonk) + alien chew (Alien_Groan). The reaction sound REPLACES the bald moo, except for the plain gray (staggered after it).
const REACT_END = { grin: 2.7, ripple: 2.0, shake: 3.2, chew: 3.4 };
function reactFor(cow) { if (!cow.bald) return null; if (cow.type === 'golden') return 'grin'; if (cow.type === 'holstein') return 'ripple'; if (cow.type === 'longhorn' && /Spot$/.test(cow.bald)) return 'shake'; return 'chew'; }
// v4.5.2 (Chico bug): there is ONE cow-pop sprite, so a 2nd queued morph (or the final-morph flush of several) used to replace a cow still on stage -> one cow went missing.
// Now pops queue: a new pop waits until the one on stage has finished its gag and walked off; the next kill morph starts so its cow lands right as the stage frees.
const FLY = 0.42, LAND_SY = [0.68, 0.84, 1.1, 0.96]; // pass 2: beamed-down flight = 5 frames at 12 fps; landing squash = 4 frames
function popFreeIn() { const c = W.cowPop; return c.visible ? Math.max(0, c.landEnd + 0.6 - S.popT) : 0; }
function cowPop(x, y, cow, s0 = 0.55) { const c = W.cowPop; S.popQ = S.popQ || []; if (c.visible || S.popQ.length) { S.popQ.push([x, y, cow, s0]); return; } cowPopNow(x, y, cow, s0); }
function cowPopNow(x, y, cow, s0 = 0.55) { const c = W.cowPop; S.cowPopsShown = (S.cowPopsShown || 0) + 1; if (c.visible && c.sleepy && !c.snapped) { c.snapped = true; eyeSnap(c.cow); } /* a new pop cut the last one short: still give it its snap + moo */ c.popped = false; c.shot = false; c.hit = 0; c.aimT = 0; c.reactOn = false; c.chewSnd = 0; W.ripU.uRip.value = 0; c.visible = true; c.material.opacity = 1; S.popT = 0; c.from = [x, y]; c.s0 = s0; c.land = [clamp(x, -230, 230), -175]; c.mooed = false; c.side = c.land[0] > 0 ? 1 : -1;
  c.cow = cow || pickCow(false); c.shed = false; c.sleepy = hasSleepy(c.cow); c.snapped = false; c.snapK = 0; setCowPopFrame(c.cow, c.sleepy ? 'sleepy' : 'hybrid'); c.react = reactFor(c.cow); c.landEnd = (c.react ? REACT_END[c.react] : 1.75) + FLY - 0.28; c.frames = { fly: new Set(), land: new Set() }; }
function landFx(x, y) { // pass 3: paint drips (60, pooled) + a halo of 8 music notes from the existing fx atlas (particles: no new texture, no new draw call)
  const b0 = S.budget; S.budget = null; burst(x, y + 120, 60, { cells: [CELL.drip, CELL.glob, CELL.splat], add: false, spd: 260, up: 160, g: 900, life: 1.1, s0: 22, s1: 10 }); S.budget = b0;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c = PAL[i % PAL.length]; P.spawn({ x: x + Math.cos(a) * 150, y: y + 300 + Math.sin(a) * 45, vx: -Math.sin(a) * 120, vy: Math.cos(a) * 36 + 20, g: 0, drag: 0.4, life: 1.4, cell: CELL.note + (i % 4), s0: 34, s1: 26, r: c[0], gg: c[1], b: c[2], a: 1, add: true, rot: 0, vr: 2 }); }
  S.landFx = (S.landFx || 0) + 1; }
function cowPopUpdate(dt) {
  const c = W.cowPop; if (!c.visible) { if (S.popQ && S.popQ.length) cowPopNow(...S.popQ.shift()); else return; } S.popT += dt; const t = S.popT, q = $('cowQ');
  let x, y, s = 1, sx = 1, sy = 1, lean = 0;
  const U = W.ripU, kf = f12(t);
  if (t < FLY) { const k = t / FLY; x = lerp(c.from[0], c.land[0], k); y = lerp(c.from[1], c.land[1], k * k); s = lerp(c.s0, 1, k); // pass 2 beamed: 5 frames, legs kick, jaw drops (Muuuuh), slow spin
    U.uKick.value = kf % 2 ? -1 : 1; U.uKph.value = kf * 1.7; U.uJaw.value = 1; U.uChew.value = 0; U.uEar.value = 0.5; lean = 0.18 * Math.sin(k * Math.PI * 1.5); c.frames.fly.add(kf); }
  else if (t < c.landEnd) { const u = t - FLY; U.uKick.value = 0; U.uJaw.value = 0; x = c.land[0]; y = c.land[1] + Math.abs(Math.sin(u * 9)) * 22 * Math.exp(-u * 6);
    if (!c.mooed) { c.mooed = true; S.cowGags++; if ((!c.react || c.react === 'chew') && !c.sleepy) hybridMoo(c.cow); landFx(x, y); S.cowLandAt = NOW(); burst(x, y, 10, { cells: [CELL.glob], add: false, spd: 220, g: 500, s0: 20, s1: 8, color: [0.6, 0.5, 0.45] }); }
    if (c.sleepy && !c.snapped) { const f = eyeAt(u); if (f !== c.frame) setCowPopFrame(c.cow, f); if (u >= SNAP_AT) { c.snapped = true; c.snapK = 1; eyeSnap(c.cow); } } // sleepy -> flicker -> black, instant (no fade)
    if (c.snapK > 0) { s *= 1 + 0.12 * c.snapK; c.snapK = Math.max(0, c.snapK - dt / 0.18); }
    if (c.cow.bald && !c.shed && u > 0.3) { c.shed = true; hairShed(x, y, 300, c.cow); setCowPopFrame(c.cow, 'bald'); G.shake = Math.max(G.shake, 0.25); c.reactOn = true; c.reactT = u; S.reacts = S.reacts || {}; S.reacts[c.react] = (S.reacts[c.react] || 0) + 1;
      if (c.react === 'grin') sfxSlot('ANIMAL_Cow_Grinner_Laugh', 0.85); if (c.react === 'ripple') sfxSlot('ANIMAL_Cow_Jelly_Splat', 0.8); if (c.react === 'shake') sfxSlot('ANIMAL_Cow_Horn_Wobble', 0.8); }
    sy = 1 - 0.18 * Math.exp(-u * 10) + 0.025 * Math.sin(u * 22); sx = (u > 0.3 && u < 0.62) || u > 0.85 ? -1 : 1; lean = Math.sin(u * 7) * 0.05; // chew + look left/right
    { const lf = f12(u); if (lf < 4) { sy *= LAND_SY[lf]; s *= 1 + (1 - LAND_SY[lf]) * 0.5; c.frames.land.add(lf); } // pass 2 land: 4-frame squash + wobble
      const ch = lf % 4; U.uChew.value = ch === 1 ? 1 : ch === 3 ? -1 : 0; const ef = (lf + 7) % 18; U.uEar.value = ef === 0 ? 0.6 : ef === 1 ? 1 : ef === 2 ? 0.4 : 0; // 4-frame chew, 3-frame ear flick
      sy *= 1 + 0.03 * Math.sin(u * 5); }
    if (c.react && c.reactOn) { const r = u - c.reactT; // v4.5 shred-cow gags (bald cows)
      if (c.react === 'ripple') { W.ripU.uRip.value = Math.max(0, 1 - r / 1.1); W.ripU.uRipT.value = r; sx = 1; } // Holstein: melting ripple through the body
      if (c.react === 'chew') { sx = 1; if (u > 2.15 && c.chewSnd === 0) { c.chewSnd = 1; sfxSlot('ANIMAL_Cow_Blink_Bonk', 0.75); } if (u > 2.3 && c.chewSnd === 1) { c.chewSnd = 2; sfxSlot('ANIMAL_Cow_Alien_Groan', 0.7); }
        if (u > 2.15 && u < 2.25) sy *= 0.9; if (u > 2.3) { sy *= 1 + 0.035 * Math.sin((u - 2.3) * 24); lean = Math.sin((u - 2.3) * 12) * 0.03; } } // blink-bonk (squash), then an alien chew
      if (c.react === 'shake') { sx = 1; const P2 = 2.4; lean = r < P2 ? Math.sin(r * 38) * 0.085 * Math.min(1, r * 4) * (1 - 0.5 * r / P2) : 0; if (r >= P2) { const e = r - P2; s = 1 + 0.16 * Math.exp(-e * 9) * Math.sin(Math.min(e * 14, Math.PI)); if (!c.popped) { c.popped = true; vib(30); burst(x + 70, y + 200, 6, { cells: [CELL.spark], spd: 200, g: 0, s0: 18, s1: 2, color: [0.8, 1, 0.6] }); } } } // longhorn: head shake, then the black eyes POP
      if (c.react === 'grin') { const nx = nextGrayX(); sx = nx == null ? 1 : nx < x ? -1 : 1; lean = -sx * 0.12 + Math.sin(r * 30) * 0.04; sy *= 1 + Math.abs(Math.sin(r * 22)) * 0.05; } } // grinner leans at the next gray and laughs back
    if (S.savedPend != null && u > 0.35) savedBanner(S.savedPend); // pass 3: the banner waits until the cow has landed (never over the splat)
    const [qx, qy] = toScreen(x + 40, y + 230); q.style.left = qx + 'px'; q.style.top = qy + 'px'; q.classList.toggle('hidden', u > 0.9); }
  else { const k = Math.min(1, (t - c.landEnd) / 0.6); q.classList.add('hidden'); x = lerp(c.land[0], c.side * 150, k); y = lerp(c.land[1], -40, k) + Math.abs(Math.sin(t * 16)) * 14; s = 1 - 0.6 * k; c.material.opacity = 1 - k * k; if (k >= 1) c.visible = false; sx = c.side; }
  if (c.hit > 0) { c.hit = Math.max(0, c.hit - dt * 3); sy *= 1 - 0.25 * Math.sin(c.hit * Math.PI); lean += Math.sin(c.hit * 30) * 0.06 * c.hit; }
  c.position.set(x, y, 0); c.scale.set(s * sx, s * sy * (c.asp || 0.7), 1); c.rotation.z = lean;
}

// ----- morph: v2's 2.2 s paint-melt cow, synced to FIGHT_Transform_Cow. v4.1: always centred on screen -----
function startMorph(sh) { S.finalSave = [sh.savePts, sh.saveMult];
  const pend = (S.km ? [[S.km.x, W.morph.position.y, S.km.cow, 0.92 * S.km.QW / 300]] : []).concat((S.kmQ || []).map((j) => [j.x, j.y, j.cow, 0.55])); // pass 3 fix: a kill morph still boiling (or queued) when the last gray dies used to vanish with no cow, snap or moo
  const g = sh.g, Fi = S.fight; S.state = 'morph'; S.hold = false; beamSound(false); cueSet(0, false); hideAim(); hide('meter'); hideCmd(); sub('');
  GR.forEach((q) => (q.face.visible = false)); Fi.ships.forEach((s) => (s.gone = true)); drawShips(0);
  W.morphMat.uniforms.tPaint.value = g.paint; const QW = 560; S.morphQW = QW; W.morph.scale.set(QW, QW, 1); W.morph.position.set(0, -60, 0); // face starts high-centre, the cow stands mid-screen
  W.morphMat.uniforms.uT.value = 0; W.morphMat.uniforms.uCell.value = 2; W.morph.visible = true; S.budget = 300; S.km = null; S.kmQ = []; pend.forEach((p) => cowPop(...p)); S.flushedPops = (S.flushedPops || 0) + pend.length;
  const cow = pickCow(!!S.hyper); S.finalCow = cow; S.finalBlink = 0; S.finalEye = null; S.snapPopT = 0; (S.cowList = S.cowList || []).push(cowKey(cow, cow.bald ? 'bald' : 'hybrid')); setMorphCow(cow, hasSleepy(cow) ? 'sleepy' : 'hybrid'); W.morphMat.uniforms.uBub.value = 0.6; // v4.5: the full slow version, final gray only
  S.morphT0 = A.ctx.currentTime + 0.03; play(A.buf.FX_Hybrid_Bubble_Morph_Long ? 'FX_Hybrid_Bubble_Morph_Long' : 'FIGHT_Paint_Burst', { gain: 0.9, when: S.morphT0 }); // REX: 2.5 s long bubble morph (final gray only) play('FIGHT_Paint_Burst', { gain: 0.8 });
  pushIn(0, 160 / 0.75, 1.2); S.morphFrames = 0; S.morphWall = NOW(); S.morphTs = [];
}
function updateMorph(T) {
  const mt = (A.ctx.currentTime - S.morphT0) * (MORPH_T[5] / 2.5); // the five stages stretched over REX's 2.5 s FX_Hybrid_Bubble_Morph_Long S.morphFrames++; if (!S.morphDone) S.morphTs.push(NOW()); W.morphMat.uniforms.uT.value = clamp(mt, 0, MORPH_T[5]); W.morphMat.uniforms.uTime.value = T;
  if (mt > 0.05 && mt < 1.4 && Math.random() < 0.7 && S.budget > 0) { S.budget--; const c = PAL[(Math.random() * 3) | 0]; P.spawn({ x: W.morph.position.x + (Math.random() - 0.5) * 300, y: W.morph.position.y + S.morphQW * (mt < 0.9 ? 0.9 : 0.3), vy: -100, g: 900, life: 1, cell: CELL.drip, s0: 22, s1: 14, r: c[0], gg: c[1], b: c[2], add: false }); }
  if (mt >= MORPH_T[5] && !S.morphDone) { S.morphDone = true; S.morphFps = S.morphFrames / ((NOW() - S.morphWall) / 1000); S.morphMinFps = minFps(S.morphTs);
    addSoul(); S.melts++; S.hero.raise = 1; if (S.finalSave) savePop(S.finalSave[0], S.finalSave[1], innerWidth / 2, innerHeight * 0.36); savedBanner(WAVES[WAVES.length - 1].lines[0]); flash(0.8, 400); G.shake = 0.8; S.morphDoneAt = NOW();
    if (!hasSleepy(S.finalCow)) hybridMoo(S.finalCow); const mp = W.morph.position; splash(mp.x, mp.y + 150, 40); confetti(mp.x, mp.y + 200, 60); engineLevel(ENGINE_LVL, 1.0);
    const t = A.ctx.currentTime; ramp(A.cleanGain.gain, SONG_RUN * 1.21, t, 0.03); play('FIGHT_Saved_Sting_Soft', { gain: 0.43, when: t + 0.1 }); play('FIGHT_Crowd_Cheer_Soft', { gain: 0.42 }); play('FIGHT_Finale_Fireworks_01', { gain: 0.7 });
    for (let k = 0; k < 4; k++) setTimeout(() => burst((Math.random() - 0.5) * 500, 300 + Math.random() * 400, 30, { spd: 500, g: 200, cells: [CELL.spark, CELL.glow], s0: 26, s1: 4 }), k * 250);
    setTimeout(() => { if (S.state === 'morph') { pushOut(); startParade(); } }, 2400); }
  if (S.morphDone && S.finalCow) { const el = (NOW() - S.morphDoneAt) / 1000, c = S.finalCow, mp = W.morph.position; // HYPER final cow: shed -> bald ~0.5 s after it forms
    if (hasSleepy(c) && !S.finalBlink) { const f = eyeAt(el); if (f !== S.finalEye) { S.finalEye = f; setMorphCow(c, f); } if (el >= SNAP_AT) { S.finalBlink = 1; eyeSnap(c); G.shake = Math.max(G.shake, 0.2); S.snapPopT = NOW(); } }
    if (c.bald && !S.finalBlink && el > 0.5) { S.finalBlink = 2; hairShed(mp.x, mp.y + 40, S.morphQW * 0.8, c); setMorphCow(c, 'bald'); }
  }
  if (S.morphDone) { const el = (NOW() - S.morphDoneAt) / 1000, pop = 1 + 0.22 * Math.exp(-el * 5) * Math.sin(el * 18) + (S.snapPopT ? 0.1 * Math.max(0, 1 - (NOW() - S.snapPopT) / 180) : 0), k = clamp(el - 1.6, 0, 0.6) / 0.6;
    W.morph.scale.set(S.morphQW * pop * (1 - k * 0.6), S.morphQW * (2 - pop) * (1 - k * 0.6), 1); W.morph.position.y = lerp(W.morph.position.y, -250, k * 0.2); if (k >= 1) W.morph.visible = false; }
}
function minFps(ts) { // lowest frame rate over any 0.5 s window of the morph
  let lo = Infinity; for (let i = 1, j = 0; i < ts.length; i++) { while (ts[i] - ts[j + 1] >= 500) j++; const span = ts[i] - ts[j]; if (span >= 500) lo = Math.min(lo, (i - j) * 1000 / span); }
  if (lo === Infinity && ts.length > 1) lo = (ts.length - 1) * 1000 / (ts[ts.length - 1] - ts[0]); return lo === Infinity ? 0 : lo;
}
// ----- FINALE + end card -----
function rankFor(souls) { let r = RANKS[0][1]; for (const [t, n] of RANKS) if (souls >= t) r = n; return r; }
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
function calcScore() { S.score = scoreOf(S); // the same formula the server checks
  const best = +(localStorage.getItem('cr9_best_v42') || 0); S.best = Math.max(best, S.score); S.newBest = S.score > best && S.score > 0; if (S.newBest) localStorage.setItem('cr9_best_v42', String(S.score)); }
const NAME_AT = 8.6, WIN_LINE = [5.1, 7.7]; // REX: 'Oh no!' 97.94 s, 'You were supposed to yell that' 99.28-100.28 s; parade song 92.9 s at +0.25 s // pass 3: the song's 'Oh no!' (97.9 s = +5.25 s) and 'You were supposed to yell that' (99.3 s) play out; other sounds duck under it; was 5.3 // pass 2: the name sheet opens 5.3 s after FINALE (song seeks to 92.9 s at +0.25 s)
function startParade() { // chorus 2 slams back in clean, every saved cow dances behind the truck, confetti, rank (IKE: by souls) + high score
  if (S.lift) { S.lift.t = LIFT_S; liftUpdate(0); } S.state = 'parade'; S.morphDone = false; S.fight = null; S.hold = false; beamSound(false); cueSet(0, false); hideAim(); W.morph.visible = false; GR.forEach((g) => (g.face.visible = false)); drawShips(0);
  ['saved', 'meter', 'cowQ'].forEach(hide); hideIntro();
  cmd('FINALE!', false, 0); sub(S.souls ? `${S.souls} saved soul${S.souls === 1 ? '' : 's'} dance down County Road 9` : 'The grays got away… this time'); S.paradeT = 0; S.fwT = 0;
  calcScore(); S.rank = rankFor(S.souls);
  const c = A.ctx, t = c.currentTime; ramp(A.radioGain.gain, 0, t, 0.03); ramp(A.cleanGain.gain, 0, t, 0.03);
  setTimeout(() => { if (S.state !== 'parade') return; Song.reset(); seekAndPlay(A.songEl, 92.9); const t2 = A.ctx.currentTime + 0.1; A.cleanLP.frequency.cancelScheduledValues(t2); A.cleanLP.frequency.setValueAtTime(20000, t2); // v4.4 REX: no extra EQ on the master (the old 700 Hz sweep + radio layer are gone)
    ramp(A.cleanGain.gain, 1.05, t2, 0.25); play('FIGHT_Crowd_Cheer_Soft', { gain: 0.42 }); play('FIGHT_Finale_Fireworks_01', { gain: 0.7 }); }, 250);
  engineLevel(ENGINE_LVL * 0.4, 0.6);
  if (S.souls) { S.beds.hoof = play('ANIMAL_Cow_Hoofsteps_Loop', { loop: true, gain: 0.7 }); play('ANIMAL_Cow_Moo_01', { gain: 0.9 }); setTimeout(() => play('ANIMAL_Cow_Moo_02', { gain: 0.7, rate: 1.12 }), 1300); }
  S.hero.raise = 1;
}
function finaleUpdate(dt) {
  S.paradeT += dt; S.fwT += dt; const t = S.paradeT;
  for (let k = 0; k < 2; k++) if (Math.random() < 0.35) { const c = PAL[(Math.random() * PAL.length) | 0]; P.spawn({ x: (Math.random() - 0.5) * G.VW, y: VH / 2, vx: (Math.random() - 0.5) * 60, vy: -170, g: 60, life: 4, cell: Math.random() < 0.5 ? CELL.confetti : CELL.note + ((Math.random() * 4) | 0), s0: 26, s1: 30, r: c[0], gg: c[1], b: c[2], add: false, vr: 6 }); }
  if (S.fwT > 0.8) { S.fwT = 0; burst((Math.random() - 0.5) * G.VW * 0.8, 350 + Math.random() * 350, 26, { spd: 480, g: 160, cells: [CELL.spark, CELL.glow], s0: 26, s1: 4 }); }
  if (t > 2.2 && !S.rankShown) { S.rankShown = true; hideCmd(); sub(''); $('rankTitle').textContent = S.rank; $('rankScore').textContent = `${S.souls} soul${S.souls === 1 ? '' : 's'} · ${S.score.toLocaleString()} pts`; show('rank'); play('FIGHT_Saved_Sting_Soft', { gain: 0.39 }); flash(0.4, 300); vib(60); }
  if (t > 3.8 && S.newBest && !S.bestShown) { S.bestShown = true; show('newBest'); flash(0.7, 400); G.shake = 0.6; play('GTR_Beat_Bonus_02_Soft', { gain: 0.45 }); play('FIGHT_Crowd_Cheer_Soft', { gain: 0.48 }); confetti(0, 300, 90); S.hero.bang = 1; vib([60, 40, 60, 40, 120]); }
  if (t > WIN_LINE[0] && !S.winDuck) { S.winDuck = true; sfxDuck(true); if (A.songEl && A.songEl.paused && A.buf.VO_Ohno_SingThat) { play('VO_Ohno_SingThat', { gain: 0.95, bus: 'music' }); S.ohnoLineClip = (S.ohnoLineClip || 0) + 1; } } if (t > WIN_LINE[1] && S.winDuck === true) { S.winDuck = 2; sfxDuck(false); }
  if (t > NAME_AT && !S.nameDone) { if (canPost(S) && !Q.get('noboard')) showNameEntry(); else { S.nameDone = true; showEnd(); } } // v4.4: the arcade name screen right after the rank card
  if (S.souls >= TOTAL_GRAYS && t > 2.6 && !S.perfectVo) { S.perfectVo = true; sayBank('PERFECT_RUN'); }
}
function drawCow(cv, k) { const f = CF[k], img = G.tex.cows && G.tex.cows.image; if (!f || !img || !cv.getContext) return; const g = cv.getContext('2d');
  const sx = f.uv[0] * img.width, sy = (1 - f.uv[1] - f.uv[3]) * img.height, sw = f.uv[2] * img.width, sh = f.uv[3] * img.height; cv.width = Math.round(sw); cv.height = Math.round(sh); g.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height); }
function missCows() { // Daniel's clip: on MISSING TIME the longhorn + the grinner turn to camera, grin and bob; REX's giggle; THEN 'Get even? PLAY AGAIN'
  const box = $('missCows'), ag = $('again'); clearTimeout(S.giggleT); if (!S.abducted) { box.classList.add('hidden'); ag.classList.remove('wait'); return; }
  box.classList.remove('hidden'); if (!box.dataset.drawn) { drawCow($('missCowA'), 'longhorn_hybrid'); drawCow($('missCowB'), CF.golden_bald ? 'golden_bald' : 'golden_hybrid'); box.dataset.drawn = '1'; }
  box.classList.remove('skip'); if (S.missCardDone) { S.missSkippable = false; ag.classList.remove('wait'); return; } S.missCardDone = true; // pass 3: the grin + giggle run once per card (not again after signing the sheet)
  S.missSkippable = S.missN > 1; S.missSkipAt = (S.missT0 || NOW()) + MISS_AUDIO.ohno * 1000; // pass 3: from the 2nd loss, a tap AFTER 'Oh no!' (3.5 s) skips the rest // pass 3 (Chico): full grin + giggle the FIRST loss of the session; from the 2nd on, a tap skips the PLAY AGAIN lock
  box.classList.remove('go'); void box.offsetWidth; box.classList.add('go'); ag.classList.add('wait');
  const gg = A.buf.FX_Cow_Giggle, GIG = MISS_AUDIO.gig * 1000; S.giggleUntil = NOW() + GIG + (gg ? gg.duration : 0) * 1000; clearTimeout(S.giggleT0);
  const since = S.missT0 ? NOW() - S.missT0 : 0; if (!S.missT0 || since > 9000) missSong(); const el = S.missT0 ? NOW() - S.missT0 : 0; // pass 3: the song started with the cut scene
  S.giggleT0 = setTimeout(() => { if (S.state === 'end' && gg) { S.giggleH = play('FX_Cow_Giggle', { gain: 0.85 }); S.giggles = (S.giggles || 0) + 1; S.giggleAt = NOW() - S.missT0; } }, Math.max(0, GIG - el));
  S.giggleT = setTimeout(() => { ag.classList.remove('wait'); popAgain(); S.missSkippable = false; }, Math.max(0, MISS_AUDIO.last * 1000 - el)); }
function popAgain() { const ag = $('again'); ag.classList.remove('pop'); void ag.offsetWidth; ag.classList.add('pop'); S.againPopAt = S.missT0 ? NOW() - S.missT0 : null; }
function sfxDuck(on) { if (!A.ctx) return; for (const b of ['sfx', 'soft', 'amb', 'veh']) if (A.bus[b]) ramp(A.bus[b].gain, on ? 0.4 : 1, null, on ? 0.08 : 0.3); S.sfxDucked = on; }
// pass 2 (abduction loss): the song plays from 94.4 s under the existing 650 Hz muffle, opens up so 'abducted by gray aliens, oh no' plays over the card,
// GTR_Kill_Chord lands (muffled) on the 'Oh no!' 3.5 s in (song 97.9 s), and the giggle waits for the chord's 2.2 s tail (5.7 s in)
const MISS_AUDIO = { seek: 94.4, open: 1.0, ohno: 3.5, yell: 4.88, last: 5.9, fade: 6.6, gig: 7.0 }; // pass 3: song runs to ~101 s ('You were supposed to yell that' 99.3 s), PLAY AGAIN pops on the last word (100.6 s), giggle after him
function missSong() { const c = A.ctx; if (!c || !A.songEl) return; const t = c.currentTime; S.missT0 = NOW(); S.missSongs = (S.missSongs || 0) + 1; clearTimeout(S.missOpenT); clearTimeout(S.missChordT); clearTimeout(S.missLineT); clearTimeout(S.missFadeT);
  Song.reset(); seekAndPlay(A.songEl, MISS_AUDIO.seek); songMuffle(true); A.cleanLP.frequency.cancelScheduledValues(t); A.cleanLP.frequency.setValueAtTime(20000, t); ramp(A.radioGain.gain, 0, t, 0.02); ramp(A.cleanGain.gain, 0.95, t, 0.05);
  S.missOpenT = setTimeout(() => { if (!['end', 'missing'].includes(S.state) || !S.abducted) return; songMuffle(false); S.missOpenAt = NOW() - S.missT0; }, MISS_AUDIO.open * 1000);
  S.missLineT = setTimeout(() => { if (A.songEl && A.songEl.paused && A.buf.VO_Ohno_SingThat && S.abducted) { play('VO_Ohno_SingThat', { gain: 0.95, bus: 'music' }); S.ohnoLineClip = (S.ohnoLineClip || 0) + 1; } }, (97.94 - MISS_AUDIO.seek) * 1000); // pass 3: only when the song isn't playing
  S.missChordT = setTimeout(() => { if (!['end', 'missing'].includes(S.state) || !S.abducted) return; S.missChordAt = NOW() - S.missT0; S.missChordSong = A.songEl.currentTime; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.7; lp.connect(A.bus.sfx);
    if (A.buf[ATTACK.chord]) play(ATTACK.chord, { gain: ATTACK.chordGain, dest: lp }); else killChord(); }, MISS_AUDIO.ohno * 1000);
  S.missFadeT = setTimeout(() => { if (['end', 'missing'].includes(S.state) && S.abducted) ramp(A.cleanGain.gain, 0, null, 0.5); }, MISS_AUDIO.fade * 1000); }
function skipMiss() { if (NOW() < (S.missSkipAt || 0)) { S.missEarlyTaps = (S.missEarlyTaps || 0) + 1; return; } S.missSkippable = false; clearTimeout(S.missFadeT); if (S.cut) { S.cutSkips = (S.cutSkips || 0) + 1; cutEnd(); S.missSkippable = false; } if (A.cleanGain) ramp(A.cleanGain.gain, 0, null, 0.15); clearTimeout(S.giggleT); stopGiggle(); $('again').classList.remove('wait'); $('missCows').classList.add('skip'); S.missSkips = (S.missSkips || 0) + 1; } // pass 3: REX's stopGiggle (50 ms fade)
function stopGiggle() { clearTimeout(S.giggleT0); if (S.giggleH) { S.giggleH.stop(0, 0.05); S.giggleH = null; } S.giggleUntil = 0; } // pass-2 review: call from Chico's tap-to-skip (pass 3); ~50 ms fade via play().stop
function drawMissGray() { const cv = $('missGray'); if (!cv) return; cv.classList.toggle('hidden', !S.abducted); let im = G.tex.faces && G.tex.faces.image; if (G.tex.faces && G.tex.faces.etc2) { im = S.missImg; if (!im) { im = S.missImg = new Image(); im.onload = () => { S.missGrayDrawn = 0; drawMissGray(); }; im.src = G.tex.faces.webp; return; } if (!im.complete) return; } if (!S.abducted || !im) return; // p4b: ETC2 atlas has no CPU image -> fetch the webp (cached) for this card // p3b: the MISSING TIME card shows Daniel's full dripping portrait (atlas cell 31)
  const x = cv.getContext('2d'), c = 320; x.clearRect(0, 0, c, c); x.drawImage(im, (GF.drip % 6) * c, Math.floor(GF.drip / 6) * c, c, c, 0, 0, c, c); S.missGrayDrawn = (S.missGrayDrawn || 0) + 1; }
function showEnd() { if (!L2.on && !S.abducted && !S.l2Done) { S.l2Done = true; S.state = 'missing'; S.fight = null; S.hold = false; beamSound(false); cueSet(0, false); hideAim(); hideCmd(); sub(''); hide('nameScreen'); hide('rank'); GR.forEach((g) => (g.face.visible = false)); drawShips(0); stopAll(); clearPops(); bannerClear(); cutscene(() => { clearPops(); bannerClear(); enterShip(); startRun(RUN_MODE === 'parade' ? undefined : RUN_MODE); }); return; } /* fix: a Level One WIN also goes to the abduction clip + Level Two */ if (L2.on && !S.abducted) { S.state = 'end'; endCard(() => goTitle(true), (S.score || scoreOf(S) || 0), () => { goTitle(true); startRun(RUN_MODE); }); return; } if (L2.on) leaveShip(); S.l2Done = false;
  S.state = 'end'; hideCmd(); sub(''); hide('rank'); engineLevel(ENGINE_LVL * 0.3, 1); S.beds.hoof && S.beds.hoof.stop(0, 0.6);
  $('endTitle').innerHTML = S.abducted ? "OOPS! YOU'VE BEEN ABDUCTED<small class='soon'>COMING SOON: LEVEL 2</small>" : `${S.souls} soul${S.souls === 1 ? '' : 's'} saved<br>on County Road 9`; $('endCard').classList.toggle('missing', !!S.abducted); drawMissGray();
  $('endMiss').innerHTML = S.abducted ? `They found the truck on County Road 9 at dawn, engine still warm.<br>Daniel can't account for the last three hours.<b>${S.souls} soul${S.souls === 1 ? '' : 's'} saved · ${(S.score || 0).toLocaleString()} pts</b>` : ''; $('endMiss').classList.toggle('hidden', !S.abducted);
  $('endSing').classList.toggle('hidden', !S.abducted); $('endTally').classList.toggle('hidden', !(S.abducted && S.missN >= 2)); if (S.abducted && S.missN >= 2) $('endTally').textContent = `Abducted tonight: ${S.missN}. The diner's starting to believe you.`; /* pass 3 (IKE) */ missCows(); $('again').innerHTML = S.abducted ? '<small>Get even?</small>PLAY AGAIN' : 'PLAY AGAIN';
  $('signBtn').classList.toggle('hidden', !(S.abducted && canPost(S) && !(S.boardRes && S.boardRes.ok) && !Q.get('noboard') && !S.posting));
  $('endRank').innerHTML = `${S.rank || rankFor(S.souls)}<br><small>${(S.score || 0).toLocaleString()} pts · best ${(S.best || S.score || 0).toLocaleString()}${S.newBest ? ' · NEW HIGH SCORE!' : ''}</small>`;
  $('endStats').textContent = `${S.firstKill != null ? `First kill at ${mmss(S.firstKill)}` : 'First kill: none yet'}\nKills: ${S.kills} of ${TOTAL_GRAYS} · ${(S.kills * SCORE.KILL).toLocaleString('en-US')} pts · best streak ${S.bestStreak}x\nSaved cows: +${S.cowPts.toLocaleString('en-US')}${S.cowHits ? ` · cows shot: ${S.cowHits} (-${(S.cowHits * SCORE.COW_HIT).toLocaleString('en-US')})` : ''}\nAlien laughs: ${S.laughs}`;
  meltClose(); S.meltMin = S.meltWins.reduce((m, w) => { const f = minFps(w); return f && (!m || f < m) ? f : m; }, 0); // DOT: every run reports its lowest melt fps (all kill melts + the final morph)
  $('endFps').style.display = Q.get('fps') === '1' ? '' : 'none'; // DOT: tech line only with ?fps=1
  $('endFps').textContent = S.meltMin ? `lowest melt fps: ${Math.round(S.meltMin)} · run avg ${Math.round(avgFps())} fps` : `no melts this run · run avg ${Math.round(avgFps())} fps`;
  $('endPerfect').textContent = S.souls >= TOTAL_GRAYS ? "Every soul saved. The diner's gonna believe you this time." : ''; $('endPerfect').classList.toggle('hidden', S.souls < TOTAL_GRAYS);
  $('endRival').innerHTML = S.boardRes ? (S.boardRes.ok ? rivalLine(S.boardRes, S.score) : `Couldn't pin it to the wall (${S.boardRes.error || 'offline'}). Your best here: ${localBest().toLocaleString()}`) : '';
  $('endRival').classList.toggle('hidden', !S.boardRes);
  show('endCard'); $('endCard').scrollTop = 0; fillBoard($('endBoard'), S.boardRes); // DOT: the board is fetched here (end card) or on the title, never during play
}
// ----- Daniel: bobs on every beat, strums while the beam is on, grins + raises the guitar on kills, flinches at dives and laughs -----
// v4.2 IKE: no emoji stickers. Daniel's reactions are real POSE FRAMES on his one sprite: guitar overhead (kill), head-bang (streak), flinch (truck lift).
// 'oh no!' stays as a small text tag over his head during the lift.
function ohNo() { const b = $('bubble'); b.textContent = 'oh no!'; b.classList.remove('hidden', 'go'); void b.offsetWidth; b.classList.add('go'); clearTimeout(S.bubT); S.bubT = setTimeout(() => b.classList.add('hidden'), 1100); }
function setPose(name) { const p = POSES[name], hs = W.hero; if (S.pose === name) return p; S.pose = name; hs.material.map = G.tex[p.tex]; hs.material.needsUpdate = false; S.poseK = [p.w / 632, p.h / 992]; return p; }
function heroUpdate(dt, T) {
  const h = S.hero, hs = W.hero; if (!h || !hs.visible) return; h.beat = Math.max(0, h.beat - dt * 4); h.cheer = Math.max(0, h.cheer - dt * 1.4); h.oops = Math.max(0, h.oops - dt * 1.8);
  h.raise = Math.max(0, h.raise - dt / 1.0); h.bang = Math.max(0, h.bang - dt / 0.9); h.flinch = Math.max(0, h.flinch - dt / 1.1);
  const strum = S.hold || S.state === 'parade' ? 1 : 0, lk = S.fight && S.fight.locked ? 1 : 0;
  // pose: flinch > head-bang (hair-flying frame + 3 nods in 0.9 s) > guitar overhead > idle
  const nod = h.bang > 0 ? Math.abs(Math.sin((1 - h.bang) * Math.PI * 3)) : 0; // 3 head-bang nods in 0.9 s on the hair-flying frame
  const pn = S.hyper ? (Math.floor(S.hyper.t / 0.12) % 2 ? 'bang' : 'up') : h.flinch > 0 ? 'flinch' : S.shredRdy ? 'up' : h.bang > 0 ? 'bang' : h.raise > 0.08 ? 'up' : 'idle'; /* p4f: SHRED ready = guitar raised */ const p = setPose(pn); S.poseShown = S.poseShown || {}; S.poseShown[pn] = (S.poseShown[pn] || 0) + 1;
  const lift = S.liftK || 0, upK = pn === 'up' ? Math.sin(Math.min(1, (1 - h.raise) / 0.25) * Math.PI / 2) : 0;
  const bx = G.VW / 2 - 135 + S.steer * 10 - (pn === 'flinch' ? 18 : 0), by = -VH / 2 - 40 + lift * 96, jump = upK * 40 * (1 - Math.max(0, (1 - h.raise) - 0.6) * 2.5) + (S.state === 'parade' ? Math.abs(Math.sin(T * 4.6)) * 40 : 0) + (S.shredRdy ? Math.abs(Math.sin(T * 7)) * 30 : 0);
  const [kx, ky] = S.poseK || [1, 1];
  hs.position.set(bx, by + jump, 0); hs.scale.set(kx * (1 + h.beat * 0.02), ky * (1 - h.beat * 0.035 - nod * 0.05), 1);
  hs.rotation.z = Math.sin(T * 1.2) * 0.02 + (pn === 'idle' || pn === 'bang' ? strum * Math.sin(T * 19) * (0.025 + lk * 0.02) : 0) + (pn === 'bang' ? -0.03 - nod * 0.1 : 0) + (pn === 'flinch' ? 0.08 + Math.sin(T * 30) * 0.03 * h.flinch : 0) + h.oops * Math.sin(T * 26) * 0.05;
  hs.material.color.setScalar(1 - h.oops * 0.2);
  const K = 408 / 632, gx = (p.hole[0] - p.w / 2) * K, gy = (p.h - p.hole[1]) * K + 66, cs = Math.cos(hs.rotation.z), sn = Math.sin(hs.rotation.z); S.hole = [bx + gx * cs - gy * sn, by + jump + gx * sn + gy * cs];
  if (S.shredRdy) P.spawn({ x: S.hole[0], y: S.hole[1], g: 0, life: 0.14, cell: CELL.glow, s0: 200 + 70 * Math.sin(T * 14), s1: 150, r: 0.9, gg: 0.5 + 0.5 * Math.sin(T * 9), b: 0.9, a: 0.7, add: true }); // p4f: the guitar glows while SHRED is ready
  if (strum || h.beat > 0.7) P.spawn({ x: S.hole[0], y: S.hole[1], g: 0, life: 0.12, cell: CELL.glow, s0: 150 + lk * 60, s1: 110, r: 0.5, gg: lk ? 1 : 0.85, b: lk ? 0.4 : 1, a: strum ? 0.8 : 0.35, add: true });
  if (strum && lk && Math.random() < 0.3) P.spawn({ x: S.hole[0], y: S.hole[1], vx: -80 - Math.random() * 120, vy: 150 + Math.random() * 150, g: 0, drag: 1, life: 0.8, cell: CELL.note + ((Math.random() * 4) | 0), s0: 26, s1: 10, r: 0.5, gg: 1, b: 0.4, a: 1, add: true });
  const [sx, sy] = toScreen(bx - 250, by + 560 + jump); const b = $('bubble'); b.style.left = sx + 'px'; b.style.top = sy + 'px';
}
// ----- aim, beam, reticle + lock ring (DOM, so no extra draw calls) -----
function hideAim() { ['reticle', 'lockRing', 'lockNum', 'padLine'].forEach(hide); W.beam.mesh.visible = false; }
function aimUpdate() { if (S.pad && S.hold) { S.aimW = toWorld(S.ret[0], S.ret[1]); if (S.pad.tIn) { S.padLat = NOW() - S.pad.tIn; S.padLatMax = Math.max(S.padLatMax || 0, S.padLat); S.pad.tIn = 0; } return; } if (!S.finger) return; const rx = S.finger[0], ry = Math.max(8, S.finger[1] - RET_DY); S.ret = [rx, ry]; S.aimW = toWorld(rx, ry); }
function drawAim(T) {
  const Fi = S.fight, on = (S.hold || (S.hyper && Fi && Fi.locked)) && S.state === 'run' && Fi, b = W.beam; b.mesh.visible = !!on; if (!on) S.beamSeg = null; const ret = $('reticle'), ring = $('lockRing');
  if (!on) { ret.classList.add('hidden'); } else {
    const lk = Fi.locked, mg = Fi.magnet, p0 = S.hole || [200, -400];
    const p2 = lk ? [lk.fx, lk.fy] : mg ? [lerp(S.aimW[0], mg.fx, 0.35), lerp(S.aimW[1], mg.fy, 0.35)] : S.aimW;
    S.beamSeg = [p0[0], p0[1], p2[0], p2[1]]; b.set(p0, [lerp(p0[0], p2[0], 0.35), Math.max(p0[1], p2[1]) + 140], p2, (lk ? 30 + lk.L * 7 : 20) * (S.hyper ? 2.1 : 1), T); b.mat.uniforms.uT.value = T; b.mat.uniforms.uPow.value = (lk ? 1.15 : 0.5) * (S.hyper ? 1.7 : 1); // HYPER: wider + brighter
    if (S.hyper && Fi.locked2 && Math.random() < 0.5) { const l2 = Fi.locked2; P.spawn({ x: lerp(p0[0], l2.fx, Math.random()), y: lerp(p0[1], l2.fy, Math.random()), vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, g: 0, life: 0.3, cell: CELL.spark, s0: 30, s1: 4, r: 1, gg: 0.5, b: 1, a: 1, add: true }); } // the second gray gets hit too
    b.mat.uniforms.uPulse.value = Math.max(0, (S.lockPulse || 0)); S.lockPulse = Math.max(0, (S.lockPulse || 0) - 0.08);
    if (lk && Math.random() < 0.6) P.spawn({ x: p2[0] + (Math.random() - 0.5) * 60, y: p2[1] + (Math.random() - 0.5) * 60, vx: (Math.random() - 0.5) * 300, vy: Math.random() * 300, g: 300, life: 0.4, cell: CELL.spark, s0: 24, s1: 4, r: 0.6, gg: 1, b: 0.3, a: 1, add: true });
    padLine(); if (S.hold && S.ret) { ret.style.transform = `translate(${S.ret[0]}px, ${S.ret[1]}px)`; ret.classList.remove('hidden'); } else ret.classList.add('hidden'); ret.classList.toggle('lock', !!lk); ret.classList.toggle('near', !lk && !!mg); }
  // lock ring on the target: progress = seconds of beam, big number = the second you're in
  let tg = null; if (Fi && S.state === 'run') { tg = Fi.locked; if (!tg) for (const s of Fi.ships) if (s.alive && s.L > 0.05 && (!tg || s.L > tg.L)) tg = s; }
  if (!tg) { ring.classList.add('hidden'); hide('lockNum'); }
  else { const [x, y] = toScreen(tg.fx, tg.fy), [x2] = toScreen(tg.fx + tg.fr, tg.fy), r = Math.max(34, (x2 - x) * 1.25);
    ring.style.transform = `translate(${x}px, ${y}px)`; ring.style.width = ring.style.height = `${r * 2}px`; ring.style.setProperty('--p', `${(tg.L / LOCK_S) * 100}%`);
    ring.classList.remove('hidden'); ring.classList.toggle('idle', tg !== Fi.locked); const n = Math.min(5, Math.floor(tg.L)), ln = $('lockNum'); ln.textContent = n > 0 ? String(n) : ''; ln.style.transform = `translate(${x}px, ${Math.max(70, y - r - 30)}px)`; /* p4d Chico: the number sits just above the lock ring, never on the ship */ ln.classList.toggle('hidden', !n); }
}


// ---------- v4.5 SHRED meter + HYPER MODE ----------
function shredHud() { const f = $('shredFill'); if (f) f.style.width = `${clamp(S.shred || 0, 0, 100)}%`; const v = S.shred || 0; $('shredBar').classList.toggle('hot', v >= 80 && v < 100); $('shredBar').classList.toggle('full', v >= 100); } // p4f Chico: glows + pulses from 80 %, the full state is louder
// p4f: the ready cue persists until the SHRED is tapped or the fight can't use it (grab, hyper, morph, parade, end): the button, Daniel's raised guitar and the bar all follow ONE flag
function shredSync() { const ok = S.state === 'run' && !!S.fight && !S.grab && !S.hyper && (S.shred || 0) >= 100; S.shredRdy = ok; if (ok === vis('shredBtn')) { /* in sync */ } else if (ok) show('shredBtn'); else hide('shredBtn'); document.body.classList.toggle('shredRdy', ok);
  const hh = (matchMedia('(pointer: coarse)').matches || Q.get('holdhere') === '1') && S.state === 'run' && !!S.fight && !S.lockedOnce && !S.grab && !Q.get('nohold'); if (hh === vis('holdHere')) { /* in sync */ } else if (hh) show('holdHere'); else hide('holdHere'); } // p4f: HOLD HERE flashes on the dashboard until the first lock
function shredAdd(v) { if (S.hyper || S.state !== 'run') return; const was = S.shred; S.shred = Math.min(100, S.shred + v); shredHud(); if (was < 100 && S.shred >= 100) shredReady(); }
function shredReady() { S.shredReadyAt.push(+((NOW() - S.runT0) / 1000).toFixed(1)); show('shredBtn'); S.shredCue = 'wait'; /* pass 3: GTR_Shred_Ready on the next beat, then FX_Shred_Ready_Pulse every beat until the tap (replaces the Sparks sizzle) */ vib([30, 30, 30]); sayBank('SHRED_READY'); }
function shredBeat() { if (!S.shredCue) return; if (S.state !== 'run' || S.hyper || (S.shred || 0) < 100) { S.shredCue = null; return; } if (S.shredCue === 'wait') { S.shredCue = 'pulse'; play('GTR_Shred_Ready', { gain: 0.8, bus: 'soft' }); S.shredReadyCues = (S.shredReadyCues || 0) + 1; } play('FX_Shred_Ready_Pulse', { gain: 0.8 }); S.shredPulses = (S.shredPulses || 0) + 1; }
function startHyper() {
  if (S.state !== 'run' || S.hyper || S.grab || S.shred < 100) return; const c = A.ctx;
  S.hyper = { t: 0, fl: 0 }; S.hypers++; S.hyperAt.push(+((NOW() - S.runT0) / 1000).toFixed(1)); S.shred = 0; shredHud(); hide('shredBtn'); document.body.classList.add('hyperOn');
  GR.forEach((g) => { if (g.face.visible && !g.melt) { setFaceG(g, GF.scared, true); g.twinT = 1; g.mat.uniforms.uTwin.value = 1; } }); // p3b: SHRED snaps every gray to melting 8 Scared at once
  if (W.paint) W.paint.U.uFlood.value = 1; paintSfx('smear'); // SHRED paints the edges (palette-knife smear)
  cmd('HYPER MODE!', false, 1200, true); $('cmd').classList.add('hyperTxt'); flash(1, 450); G.shake = 1; S.hitStopUntil = Math.max(S.hitStopUntil, NOW() + 110); shredBang(); vib([80, 40, 80, 40, 160]); sayBank('SHRED_HIT', null, true); // the one line allowed during play
  S.shredCue = null; play('FX_Shred_Hit', { gain: 0.8 }); S.shredHits = (S.shredHits || 0) + 1; stemBeam(true); // pass 3: REX's recorded hit; the song stem goes to full for the SHRED
  if (A.buf[SND.shredStart]) play(SND.shredStart, { gain: 0.8 });
  if (A.buf[SND.shredLoop]) S.hyperLoop = play(SND.shredLoop, { loop: true, gain: 0.7, when: c.currentTime + (A.buf[SND.shredStart] ? Math.min(0.85, A.buf[SND.shredStart].duration) : 0) }); // REX: 3 bars @117.3 BPM; OGG loops gapless (the MP3 fallback trims its encoder padding)
}
function shredBang() { const h = S.hole || [0, -300]; for (let i = 0; i < 3; i++) P.spawn({ x: h[0], y: h[1], vx: 0, vy: 0, g: 0, life: 0.5 + i * 0.12, cell: CELL.ring, s0: 60, s1: 520 + i * 260, r: i === 1 ? 1 : 0.7, gg: i === 1 ? 0.35 : 1, b: i === 1 ? 0.85 : 0.4, a: 1, add: true }); burst(h[0], h[1], 32, { spd: 720, g: 200, cells: [CELL.spark, CELL.glow, CELL.note], s0: 40, s1: 6, life: 0.9 }); S.shredBangs = (S.shredBangs || 0) + 1; }
function hyperUpdate(dt) { const H = S.hyper; if (!H) return; H.t += dt; H.fl += dt;
  if (S.state !== 'run' || H.t >= HYPER_S) return endHyper();
  G.shake = Math.max(G.shake, 0.3); if (S.hero) S.hero.raise = 1;
  if (H.fl > 0.5 && H.t < HYPER_S - 1) { H.fl = 0; if (W.paint) W.paint.U.uFlood.value = Math.max(W.paint.U.uFlood.value, 0.85); } // p4b DOT: no full-screen colour flashes; fresh edge/dash stripes every 0.5 s, each drips away in ~1 s
  if (Math.random() < 0.5 && S.hole) P.spawn({ x: S.hole[0], y: S.hole[1], vx: (Math.random() - 0.3) * 500, vy: 200 + Math.random() * 400, g: 600, life: 0.6, cell: CELL.note + ((Math.random() * 4) | 0), s0: 34, s1: 20, r: 1, gg: 0.9, b: 0.4, add: true }); // notes fly off the guitar (pooled, capped by the 500 pool)
}
function endHyper() { const H = S.hyper; if (!H) return; S.hyper = null; document.body.classList.remove('hyperOn'); $('flash').style.background = '';
  if (S.hyperLoop) { S.hyperLoop.stop(0, 0.08); S.hyperLoop = null; } if (!S.hold) stemBeam(false); // the stem drops back after SHRED
  if (S.state === 'run') { if (A.buf[SND.shredEnd]) play(SND.shredEnd, { gain: 0.75 }); } }
// pass 3: synthShred / synthDive stand-ins removed (REX's GTR_Shred_Hyper_* samples ship)

// ---------- v4.5 narration (Chico/DOT rules): lines play during the drive and between waves only, never while a beam lock is active ----------
// (held up to 2.5 s, then skipped). VO 8 (SHRED HIT) is exempt. Audible lines duck the song 6 dB (REX). Captions stay under 3 s.
const VO_MAX_WAIT = 2500, TRASH_WAIT = 6500, CAP_MAX = 2.8, KILL_TAUNT_MAX = 1.2; /* pass 3 (Chico + REX): trash talk waits up to 6.5 s for a gap, then drops */ let CLEAN = Q.get('clean') === '1' || (Q.get('clean') !== '0' && localStorage.getItem('cr9_clean') === '1');
const voBag = {}, voTake = {};
function voPick(bank, idx) { const B = VO.banks[bank]; if (!B || !B.length) return null; if (idx != null) return B[Math.min(idx, B.length - 1)];
  let bag = voBag[bank]; if (!bag || !bag.length) { bag = voBag[bank] = B.map((_, i) => i).sort(() => Math.random() - 0.5); if (bag.length > 1 && bag[0] === voBag[bank + '_last']) bag.push(bag.shift()); } // shuffle bag: no repeats
  const i = bag.shift(); voBag[bank + '_last'] = i; return B[i]; }
function voSlot(L) { const base = CLEAN && L.clean && A.buf[L.slot + '_Clean'] ? L.slot + '_Clean' : L.slot; const takes = [base, base + '_1', base + '_2', base + '_3'].filter((k) => A.buf[k]); if (!takes.length) return null;
  const last = voTake[base]; const pool = takes.length > 1 ? takes.filter((k) => k !== last) : takes; const k = pool[(Math.random() * pool.length) | 0]; voTake[base] = k; return k; } // random take, never the same one twice in a row
const voText = (L) => (CLEAN && L.clean ? L.clean : L.text);
function voLocked() { const Fi = S.fight; return !!(Fi && (Fi.locked || Fi.locked2)) || S.state === 'morph'; }
function sayNow(L, kind) { if (!L || !S.voQ) return; if (kind === 'wave' && S.voCur && S.voCur.slot === 'VO_SHRED_HIT') { S.voQ.unshift({ L, exempt: true, kind, at: NOW(), maxWait: 4000 }); S.waveWaited = (S.waveWaited || 0) + 1; return; } if (S.voCur) voEnd(); voPlay(L, true, kind); } // v4.5.2 REX: a wave intro waits for the HYPER line to finish instead of cutting it // pass 3: wave intros + kill taunts start right now (never queued, never held by a lock)
function sayBank(bank, idx, exempt) { const L = voPick(bank, idx); if (L) sayLine(L, exempt); }
function sayLine(L, exempt, maxWait = VO_MAX_WAIT) { if (!S.voQ) return; S.voQ.push({ L, exempt: !!exempt, at: NOW(), maxWait }); if (exempt) { S.voQ.sort((a, b) => b.exempt - a.exempt); if (S.voCur && !S.voCur.exempt) voEnd(); } }
function voUpdate() { const now = NOW();
  if (S.voCur && (now >= S.voCur.until || (!S.voCur.exempt && voLocked()))) voEnd(); // (kill taunts + wave intros play as exempt: they ride over the melt / lock) // review: no narration under a beam-lock countdown
  if (S.voCur || !S.voQ || !S.voQ.length) return;
  const q = S.voQ[0]; if (now - q.at > q.maxWait) { S.voQ.shift(); S.voLog.push([q.L.slot, 'skipped']); return; }
  if (!q.exempt && voLocked()) return; // hold it
  S.voQ.shift(); voPlay(q.L, q.exempt, q.kind); }
function voPlay(L, exempt, kind) { const now = NOW(), k = voSlot(L), b = k && A.buf[k], dur = Math.min(CAP_MAX, b ? b.duration : Math.max(1.4, voText(L).length * 0.055));
  if (b) { S.voCur = { h: play(k, { gain: 1, bus: 'veh' }) }; duckSet('vo', dur * 1000); } else S.voCur = {};
  Object.assign(S.voCur, { until: now + dur * 1000, exempt, slot: L.slot, kind: kind || null }); if (kind === 'kill') S.voKill = (S.voKill || 0) + 1; S.voLog.push([L.slot, +((now - S.runT0) / 1000).toFixed(1), b ? 'audio' : 'caption', !!voLocked()]);
  if (/^VO_LAST_TRUCK/.test(L.slot)) { songWarp(dur + 0.2, 0.03); S.warpAt = +runDur().toFixed(1); } // pass 1: the last-truck line rides REX's songWarp wobble
  const e = $('vo'); e.innerHTML = `<span class="vt"><b>DANIEL:</b> ${voText(L)}</span>`; e.classList.remove('hidden', 'go'); void e.offsetWidth; e.classList.add('go'); }
function voEnd() { const c = S.voCur; if (!c) return; if (c.h && NOW() < c.until - 50) c.h.stop(0, 0.1); if (c.h) duckSet('vo', 0); S.voCur = null; hide('vo'); }
// pass-2 review: one duck owner per source (VO, OHNO, Daniel's moo); the song comes back only when the LAST of them ends
function duckSet(key, ms) { const now = NOW(), D = (S.ducks = S.ducks || {}); D[key] = ms > 0 ? now + ms : 0; clearTimeout(S.duckT);
  const live = Object.values(D).filter((t) => t > now); songDuck(live.length > 0); if (live.length) S.duckT = setTimeout(() => duckSet('_', 0), Math.min(...live) - now + 5); }
function ohNoClip() { const n = ['OHNO_Ch2', 'OHNO_Ch2_alt', 'OHNO_Ch3', 'OHNO_Ch3_alt'].filter((k) => A.buf[k]); if (!n.length) return; const k = n[(Math.random() * n.length) | 0]; S.ohnos++;
  S.ohnoH = play(k, { gain: 1.0, bus: 'music' }); S.ohnoEndAt = NOW() + A.buf[k].duration * 1000; duckSet('ohno', A.buf[k].duration * 1000); return A.buf[k].duration; } // Daniel's real OH NO from the song on the truck lift, song ducked under it
function lockStart(sh) { S.lockedOnce = true; woo(); // TRASH talk: only right as a beam locks on (never once the countdown is running), random, no repeats, at most one per 10 s
  if (S.voCur || NOW() < (S.tauntNext || 0) || Math.random() > 0.6) return; const L = voPick('TRASH'); if (!L) return; S.tauntNext = NOW() + 10000; S.taunts++; sayLine(L, false, TRASH_WAIT); } // review: queued, so it lands after the lock ends (kill or break), never under the 5 s countdown
function woo() { const now = NOW(); if (now < (S.wooNext || 0) || !A.buf.VO_Gray_Scream_Woo_01) return; S.wooI = ((S.wooI || 0) + 1) % 2; S.wooNext = now + 4000; // pass 3 REX: alternate 01/02, at most once every 4 s
  play(S.wooI ? 'VO_Gray_Scream_Woo_01' : 'VO_Gray_Scream_Woo_02', { gain: 0.55 }); S.woos = (S.woos || 0) + 1; (S.wooLog = S.wooLog || []).push([S.wooI ? 1 : 2, Math.round(now)]); }
function ambUpdate() { // p4a REX hooks: REAL recordings only. Each slot plays REX's file when it lands in the pack, else the CC0/PD placeholder (see /workspace/cr9_p4_sfx/SOURCES.md)
  if (!A.ctx) return; const Fi = S.fight, run = S.state === 'run' && Fi; const ships = run && Fi.ships.some((s) => !s.gone && s.Z < 40), gap = run && !Fi.waveOn && !S.grab;
  const lockL = run ? Math.max(0, ...Fi.ships.filter((s) => s.alive).map((s) => s.L || 0)) : 0; // ship drone rises with the lock
  const duck = (S.hold ? 0.55 : 1) * (S.cut ? 0.5 : 1); // bed ducks under the beam/guitar stem and cutscenes
  const hush = AT.hush > 0 ? 0.08 : 1; // Chico: wind + crickets drop out right before a dive
  const drive = run || S.state === 'title' || S.state === 'parade';
  const B = S.beds || (S.beds = {});
  const slots = [['hum', ['AMB_Ship_Hum_Pan_Loop', 'AMB_Ship_Hum_Loop'], ships, (0.18 + 0.5 * Math.min(1, lockL / 4)) * duck, 0.3],
    ['crk', ['AMB_Crickets_Soft_Loop'], gap, 1.0 * hush, 0.5],
    ['wind', ['AMB_Wind_Desert_Loop', 'AMB_Wind_Bed_Loop'], drive, (0.6 + 0.4 * Math.min(1, AT.wind)) * duck * hush, 0.35], // p4b REX: beds are mastered at -25 LUFS, played ~unity under everything
    ['tire', ['AMB_Tire_Roll_Loop', 'AMB_Tire_Hum_Loop', 'AMB_Road_Hum_Loop'], drive && !S.lift, 0.9 * duck, 0.6]];
  for (const [k, names, on, v, tc] of slots) { const n = names.find((x) => A.buf[x]); if (!n) continue;
    if (on && !B[k]) { B[k] = play(n, { loop: true, gain: 0, bus: 'amb' }); B[k].v = -1; }
    if (B[k]) { const tv = on ? v : 0; if (Math.abs(tv - (B[k].v ?? -1)) > 0.03 || B[k].on !== !!on) { B[k].on = !!on; B[k].v = tv; ramp(B[k].g.gain, tv, null, AT.hush > 0 ? 0.08 : tc); } } }
  if (gap && !S.gapCue && Math.random() < 0.004) { S.gapCue = true; const far = pickA(['AMB_Truck_Horn_Distant', 'AMB_Coyote_Distant_01', 'AMB_Coyote_Distant_02'].filter((x) => A.buf[x])); if (far) play(far, { gain: 0.5, bus: 'amb' }); } // IKE: a far horn/coyote in the lull
  if (!gap) S.gapCue = false;
  S.ambOn = { hum: !!(B.hum && B.hum.on), crk: !!(B.crk && B.crk.on), wind: !!(B.wind && B.wind.on), tire: !!(B.tire && B.tire.on) }; }
const pickA = (a) => a.length ? a[(Math.random() * a.length) | 0] : null; // p4b fix: audio.pick(base, n) builds a name, it was being called with arrays (gusts/coyotes never played)
// p4b REX atmosphere pack: paint foley (brush on a kill, drips as the melt runs, palette-knife smear on SHRED)
function paintSfx(k) { const L = { brush: ['FX_Paint_Brush_Wet_01', 'FX_Paint_Brush_Wet_02'], drip: ['FX_Paint_Drip_01', 'FX_Paint_Drip_02', 'FX_Paint_Drip_03'], smear: ['FX_Paint_Smear_Knife'] }[k].filter((x) => A.buf[x]); if (!L.length || !A.ctx) return; play(pickA(L), { gain: k === 'drip' ? 0.4 : 0.5, bus: 'sfx' }); S.paintSfx = (S.paintSfx || 0) + 1; }
function whoosh() { const n = A.buf.FX_Abduct_Whoosh ? 'FX_Abduct_Whoosh' : null; if (n) play(n, { gain: 0.8, bus: 'sfx' }); S.whooshes = (S.whooshes || 0) + 1; }
AT.onGust = () => { const n = pickA(['FX_Wind_Gust_01', 'FX_Wind_Gust_02', 'FX_Wind_Gust_03'].filter((x) => A.buf[x])); if (n && A.ctx) play(n, { gain: 0.5, bus: 'amb', pan: Math.random() * 1.4 - 0.7 }); S.gusts = (S.gusts || 0) + 1; };
AT.onEyes = () => { const n = pickA(['AMB_Coyote_Distant_01', 'AMB_Coyote_Distant_02'].filter((x) => A.buf[x])); if (n && A.ctx && Math.random() < 0.5) /* p4b: real coyotes replace the wolf placeholder */ play(n, { gain: 0.35, bus: 'amb' }); };
function atmosTick(dt, T) { const Fi = S.fight, run = S.state === 'run' && !!Fi;
  const preDive = run && canGrab() && Fi.ships.some((sh) => sh.alive && sh.man && !['dive', 'peek', 'panic', 'flee'].includes(sh.man.kind) && sh.idleT > wTune().aggro - 0.5);
  if (preDive || (run && Fi.ships.some((sh) => sh.man && sh.man.kind === 'dive' && sh.man.t < 0.4))) AT.hush = Math.max(AT.hush, 0.6);
  let spill = null; if (run) { let best = null; for (const sh of Fi.ships) if (!sh.gone && sh.Z < 14 && (!best || sh.Z < best.Z)) best = sh; if (best) { const [x, y] = proj(best.X, Math.max(1.2, best.Z)); spill = [x, y, clamp(1.4 - best.Z / 10, 0, 1)]; } }
  setFogHoles(Fi, run);
  updateAtmos(dt, T, W, { wave: Fi ? Math.max(0, Fi.wave) : 0, run, beam: S.beamSeg, spill, steer: S.steer }, proj); }
// p4b Chico: fog + dust are cut away around every live target ship (saucer + gray) and any falling / morphing cow (world coords, 4 slots)
function setFogHoles(Fi, run) { const H = AT.u && AT.u.uHoles; if (!H) return; let n = 0; const put = (x, y, r) => { if (n < 4) H.value[n++].set(x, y, r, 1); };
  if (run) for (const sh of Fi.ships) if (!sh.gone && (sh.alive || sh.tgrab) && sh.sc > 0.02) put(sh.x, sh.y - 30 * sh.sc, Math.max(60, 230 * sh.sc));
  for (const o of [W.morph, W.cowPop]) if (o && o.visible) { const h = (o === W.morph ? 1.45 : 300) * o.scale.y; put(o.position.x, o.position.y + h * 0.5, Math.max(80, h * 0.7)); }
  while (n < 4) H.value[n++].w = 0; }
function killTaunt(cow) { // pass 3 (Chico + REX): the kill taunt starts AT the kill and plays over the melt; the snap pop + Moo_Daniel never wait for it (faded at the snap)
  if (NOW() < (S.cowPopVoNext || 0) || Math.random() > 0.35) return; const B = VO.banks.COWPOP; if (!B || !B.length) return;
  if (S.voCur && S.voCur.exempt && S.voCur.kind !== 'wave') return; // never cut SHRED_HIT / ABDUCTED
  let pool = B.filter((L) => !L.only || (cow && L.only === cow.type)); const durOf = (L) => { const k = voSlot(L); return k && A.buf[k] ? A.buf[k].duration : null; };
  const short = pool.filter((L) => { const d = durOf(L); return d != null && d <= KILL_TAUNT_MAX; }); if (short.length) pool = short; // keep the pool to recorded lines <= 1.2 s where any exist
  if (!pool.length) return; const L = pool[(Math.random() * pool.length) | 0]; S.cowPopVoNext = NOW() + 12000; S.cowPopVo++; sayNow(L, 'kill'); }
function fadeKillTaunt() { const c = S.voCur; if (!c || c.kind !== 'kill' || !c.h) return; c.h.stop(0, 0.12); c.h = null; duckSet('vo', 0); S.tauntFades = (S.tauntFades || 0) + 1; } // at the snap: 120 ms fade; the caption stays up

// ---------- v4.5 story card (one screen before the drive; IKE owns the final text/art) ----------
function showStory(go) { const el = $('story'); const art = MAN.art['story.webp'] ? `${import.meta.env.BASE_URL}art/${MAN.art['story.webp']}` : null;
  const a = $('storyArt'); if (art) { a.style.backgroundImage = `url(${art})`; a.classList.add('img'); } else drawStoryCow(a);
  show('story'); let done = false; const fin = (e) => { if (e) e.stopPropagation(); if (done) return; done = true; hide('story'); clearTimeout(t); go(); };
  el.onpointerup = fin; const t = setTimeout(fin, 12000); }
function drawStoryCow(cv) { if (!cv.getContext) return; const k = 'holstein_hybrid', f = CF[k], img = G.tex.cows.image, g = cv.getContext('2d'); const W2 = img.width, H2 = img.height;
  const sx = f.uv[0] * W2, sy = (1 - f.uv[1] - f.uv[3]) * H2, sw = f.uv[2] * W2, sh = f.uv[3] * H2; cv.width = Math.round(sw); cv.height = Math.round(sh); g.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height); }
function makeBillboard() { // hook: a roadside billboard prop that passes once in the drive intro
  const t = canvasTex(256, 128, (g) => { g.fillStyle = '#f3e7c9'; g.fillRect(0, 0, 256, 100); g.strokeStyle = '#3a2a1a'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 94); g.fillStyle = '#5a4630'; g.fillRect(40, 100, 10, 28); g.fillRect(206, 100, 10, 28);
    g.fillStyle = '#b1221b'; g.font = '900 30px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.fillText(BILLBOARD.text[0], 128, 44); g.fillStyle = '#1a1a1a'; g.font = '900 34px Arial Black, Impact, sans-serif'; g.fillText(BILLBOARD.text[1], 128, 84); });
  return t; }

// ---------- v4.4 name entry (big arcade screen after the rank card) + the WITNESSES board ----------
const runDur = () => (NOW() - S.runT0) / 1000;
function localBest() { return +(localStorage.getItem('cr9_best_v42') || 0); }
function showNameEntry() {
  S.state = 'name'; hide('rank'); const inp = $('nameIn'); inp.value = localStorage.getItem('cr9_name') || ''; inp.maxLength = NAME_MAX; $('nameMsg').textContent = ''; $('nameScore').textContent = `${S.score.toLocaleString()} pts · ${S.souls} soul${S.souls === 1 ? '' : 's'}`;
  show('nameScreen'); S.nameT0 = NOW(); nameTick(); clearInterval(S.nameIv); S.nameIv = setInterval(nameTick, 250); setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 60);
}
function nameTick() { const left = Math.max(0, 30 - Math.floor((NOW() - S.nameT0) / 1000)); $('nameCount').textContent = left; if (left <= 0 && S.state === 'name' && !S.posting) nameSkip(); }
function nameSkip() { clearInterval(S.nameIv); hide('nameScreen'); try { $('nameIn').blur(); } catch (e) {} S.nameDone = true; showEnd(); }
async function nameSubmit() {
  if (S.posting) return; const name = cleanName($('nameIn').value).trim(); const msg = $('nameMsg');
  if (!validName(name)) { msg.textContent = name ? 'The diner won\'t write that one. Try another.' : 'Sign your name, witness.'; vib(40); return; }
  localStorage.setItem('cr9_name', name); S.posting = true; msg.textContent = 'Pinning it to the wall…';
  const run = { name, score: S.score, souls: S.souls, kills: S.kills, bestStreak: S.bestStreak, cowPts: S.cowPts, cowHits: S.cowHits, pointBlanks: S.pointBlanks, firstKill: S.firstKill, abducted: !!S.abducted, dur: +runDur().toFixed(1), v: BUILD_V }; if (S.restored) run.restored = true; // p4h: the run was continued after a reload
  const res = await postScore(run); S.posting = false; S.boardRes = res; S.postDur = run.dur;
  if (!res.ok && /name/.test(res.error || '')) { msg.textContent = 'The diner won\'t write that one. Try another.'; return; }
  clearInterval(S.nameIv); hide('nameScreen'); try { $('nameIn').blur(); } catch (e) {} S.nameDone = true; showEnd();
  if (res.ok && res.rank <= 10) { // REX: making the board = the high-score sting (G major)
    S.boardSting = true; if (A.buf[SND.boardSting]) play(SND.boardSting, { gain: 0.8 }); else { killChord(); play('ANIMAL_Cow_Moo_01', { gain: 0.8 }); } /* killChord = the GTR_Kill_Chord sample */ confetti(0, 300, 60); vib([60, 40, 120]); }
}
async function fillBoard(el, myRes) {
  el.innerHTML = '<div class="sheet loading">Reading the sign-in sheet…</div>';
  const data = myRes && myRes.ok ? myRes : await fetchBoard(); S.boardShown = data ? (data.top || []).length : -1;
  renderBoard(el, data, rankFor, myRes && myRes.ok ? myRes.id : null, localBest());
}
async function openTitleBoard(e) { e.stopPropagation(); e.preventDefault(); show('boardScreen'); await fillBoard($('titleBoard'), null); }

// ---------- input: ONE finger. Touch and hold (on the ship) = beam on; drag = aim (reticle floats above the fingertip) ----------
document.addEventListener('pointerdown', (e) => {
  if (S.paused) return; // p4g: the pause menu owns every touch
  if ((S.state === 'end' || S.state === 'missing') && S.missSkippable) { skipMiss(); return; } // pass 3: later losses, a tap skips the ~2.9 s giggle lock
  if (S.state === 'parade' && S.paradeT > NAME_AT && !S.nameDone) { if (canPost(S) && !Q.get('noboard')) return showNameEntry(); S.nameDone = true; return showEnd(); }
  if (S.grab) { e.preventDefault(); return grabTap(); }
  if (S.state !== 'run' || !S.fight) return;
  const touch = e.pointerType !== 'mouse'; if (S.hold && !(touch && S.latch)) return;
  if (touch) { e.preventDefault(); // p4f (Daniel: 'the first tap is hard'): a touch ANYWHERE starts the beam. Sky = auto-lock the nearest ship and LATCH the beam when the finger lifts; dashboard = the relative pad, exactly as before
    const sky = e.clientY < padTop(), was = S.hold; S.hold = true; S.latch = false; S.pid = e.pointerId; S.finger = [e.clientX, e.clientY]; S.pad = { last: [e.clientX, e.clientY], lt: e.timeStamp, tIn: 0, sky, x0: e.clientX, y0: e.clientY };
    if (!S.ret || S.padRetStale) S.ret = [innerWidth / 2, innerHeight * 0.4]; S.padRetStale = false; padClamp();
    if (sky) autoLock(e.clientX, e.clientY, true); else if (!S.lockedOnce) autoLock(S.ret[0], S.ret[1], false); else S.autoSeek = false; // dashboard: only the very first presses snap; after the first lock the pad is untouched
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {} if (!was) { S.pressId++; beamSound(true); } aimUpdate(); hideIntro(); S.padPress = (S.padPress || 0) + 1; if (sky) S.skyTaps = (S.skyTaps || 0) + 1; return; }
  S.pad = null; S.hold = true; S.pid = e.pointerId; S.finger = [e.clientX, e.clientY]; S.pressId++; aimUpdate(); beamSound(true); hideIntro(); // desktop mouse: direct aiming
}, { passive: false });
// p4f: snap the reticle onto the ship nearest to (px, py) (screen px); no ship targetable yet -> keep trying while the finger stays put (autoSeek)
function autoLock(px, py, sky) { const Fi = S.fight; let best = null, bd = 1e9;
  if (Fi) for (const sh of Fi.ships) if (sh.alive && sh.Z < 26 && !['peek', 'flee'].includes(sh.man.kind)) { const [x, y] = toScreen(sh.fx, (sh.fy + sh.y) / 2), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = [x, y]; } }
  if (best) { S.ret = best; padClamp(); S.autoSeek = false; S.autoLocks = (S.autoLocks || 0) + 1; return true; }
  if (sky) { S.ret = [px, py]; padClamp(); } S.autoSeek = true; return false; }
// a latched beam (sky tap, finger lifted) stays on the ship; it lets go when nothing is locked for 1.5 s, nothing is targetable, 10 s pass, or a new touch takes over
function latchUpdate(dt) { if (!S.latch) return; const Fi = S.fight; if (!S.hold || S.state !== 'run' || !Fi || S.grab) { S.latch = false; return; }
  S.latchT += dt; S.latchLost = Fi.locked || Fi.locked2 || S.hyper ? 0 : S.latchLost + dt;
  if (S.latchT > 10 || S.latchLost > 1.5 || !Fi.ships.some((sh) => sh.alive && !['peek', 'flee'].includes(sh.man.kind))) { S.latch = false; S.pad = null; S.latchEnds = (S.latchEnds || 0) + 1; beamUp(); } }
function autoSeekUpdate() { if (S.autoSeek && S.hold && S.state === 'run' && S.ret) autoLock(S.ret[0], S.ret[1], false); }
function padTop() { return innerHeight * (1 - PAD_H); }
function padClamp() { const r = S.ret; r[0] = clamp(r[0], 12, innerWidth - 12); r[1] = clamp(r[1], innerHeight * 0.06, padTop() - 24); } // the crosshair stays in the play area (above the pad, below the HUD)
function padMove(e) { const P = S.pad, evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
  for (const q of evs) { const dx = q.clientX - P.last[0], dy = q.clientY - P.last[1], dt = Math.max(1, q.timeStamp - P.lt), v = Math.hypot(dx, dy) / dt; // px per ms
    const g = PAD_GAIN * (1 + PAD_ACCEL * clamp((v - 0.6) / 1.4, 0, 1)); S.ret[0] += dx * g; S.ret[1] += dy * g; P.last = [q.clientX, q.clientY]; P.lt = q.timeStamp; }
  if (P.sky === undefined || !P.sky) S.autoSeek = S.autoSeek && Math.hypot(e.clientX - P.x0, e.clientY - P.y0) < 14; else S.autoSeek = S.autoSeek && Math.hypot(e.clientX - P.x0, e.clientY - P.y0) < 14;
  padClamp(); S.finger = P.sky ? [e.clientX, e.clientY] : [e.clientX, clamp(e.clientY, padTop(), innerHeight)]; P.tIn = P.tIn || NOW(); S.padMoves = (S.padMoves || 0) + 1; } // no smoothing: the next frame draws the new crosshair
function padLine() { const el = $('padLine'); if (!S.pad || S.pad.sky || !S.hold || !S.ret || !S.finger) { el.classList.add('hidden'); return; } const [x0, y0] = S.finger, [x1, y1] = S.ret, L = Math.hypot(x1 - x0, y1 - y0);
  el.style.width = `${L}px`; el.style.transform = `translate(${x0}px, ${y0}px) rotate(${Math.atan2(y1 - y0, x1 - x0)}rad)`; el.classList.remove('hidden'); } // ONE DOM line, no WebGL draw call
document.addEventListener('pointermove', (e) => { if (S.hold && e.pointerId === S.pid) { if (S.pad) padMove(e); else S.finger = [e.clientX, e.clientY]; } });
const up = (e) => { if (S.hold && e.pointerId === S.pid) { if (e.type === 'pointerup' && S.pad && S.pad.sky && S.state === 'run' && S.fight && !S.grab) { S.latch = true; S.latchT = 0; S.latchLost = 0; S.pid = null; S.latches = (S.latches || 0) + 1; return; } beamUp(); S.pad = null; } }; // p4f: a sky tap latches the beam when the finger lifts
document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
document.addEventListener('contextmenu', (e) => e.preventDefault());
$('again').addEventListener('pointerdown', (e) => { e.stopPropagation(); startRun(); });
// ---------- v4.5.2 KEYBOARD (desktop): arrows or WASD move the reticle like a drag, Space held = beam (taps = break free when grabbed), X = SHRED, Enter/Space = start / story, Enter = PLAY AGAIN ----------
const KEYS = new Set(), KEY_SPEED = 0.9; // reticle speed in screen-heights per second
const vis = (id) => !$(id).classList.contains('hidden');
function keyFinger() { if (!S.finger) S.finger = [innerWidth / 2, innerHeight * 0.42 + RET_DY]; return S.finger; }
function keyAim(dt) { if (!KEYS.size) return; let dx = 0, dy = 0; if (KEYS.has('ArrowLeft')) dx--; if (KEYS.has('ArrowRight')) dx++; if (KEYS.has('ArrowUp')) dy--; if (KEYS.has('ArrowDown')) dy++; if (!dx && !dy) return;
  if (S.hold && S.pid !== 'kb') return; S.pad = null; const f = keyFinger(), v = KEY_SPEED * innerHeight * Math.min(dt, 0.1), n = Math.hypot(dx, dy); f[0] = clamp(f[0] + dx / n * v, 0, innerWidth); f[1] = clamp(f[1] + dy / n * v, RET_DY + 8, innerHeight); S.keyMoves = (S.keyMoves || 0) + 1; }
const WASD = { w: 'ArrowUp', a: 'ArrowLeft', s: 'ArrowDown', d: 'ArrowRight' }; const keyOf = (e) => WASD[(e.key || '').toLowerCase()] || e.key;
document.addEventListener('keydown', (e) => { const tgt = e.target; if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return; const k = keyOf(e);
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return; // the name box keeps its own Enter (submit) and typing
  if (k === 'Escape' || ((k === 'p' || k === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey)) { if (e.repeat) return; if (S.paused) { if (!S.counting) resumeGame(); } else if (S.state === 'run') pauseGame('key'); return; } // p4g
  if (S.paused) { // p4h: the menu is a dialog: Tab cycles inside it, Enter / Space on a menu button click it, everything else is swallowed
    if (k === 'Tab') { if (!S.counting) pmTrap(e); else e.preventDefault(); return; }
    if ((k === 'Enter' || k === ' ') && tgt && tgt.tagName === 'BUTTON' && tgt.closest && tgt.closest('#pauseMenu')) return;
    e.preventDefault(); if ((k === 'Enter' || k === ' ') && !S.counting && !(tgt && tgt.tagName === 'BUTTON')) { try { $('pmResume').focus({ preventScroll: true }); } catch (_) {} } return; }
  if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
  if (k.startsWith('Arrow')) { KEYS.add(k); if (!(S.hold && S.pid !== 'kb')) keyFinger(); return; }
  if ((k === 'Enter' || k === ' ') && !e.repeat) { if (vis('titleCard') && !vis('boardScreen')) { if (tgt && (tgt.tagName === 'BUTTON' || tgt.tagName === 'A')) return; return titleGo(null, S.hasSave ? 'resume' : 'start'); } if (vis('story') && $('story').onpointerup) return $('story').onpointerup(); }
  if (k === ' ') { if (e.repeat) return; if (S.grab) return grabTap(); if (S.state !== 'run' || !S.fight || S.hold) return; S.hold = true; S.pid = 'kb'; keyFinger(); S.pressId++; aimUpdate(); beamSound(true); hideIntro(); S.keyBeams = (S.keyBeams || 0) + 1; return; }
  if ((k === 'x' || k === 'X') && !e.repeat && vis('shredBtn') && S.state === 'run') return startHyper();
  if (k === 'Enter' && !e.repeat && S.state === 'end' && vis('endCard')) { if (S.missSkippable) return skipMiss(); if (vis('again')) startRun(); }
});
document.addEventListener('keyup', (e) => { KEYS.delete(keyOf(e)); KEYS.delete(e.key); if (e.key === ' ' && S.hold && S.pid === 'kb') beamUp(); });
addEventListener('blur', () => { KEYS.clear(); if (S.hold && S.pid === 'kb') beamUp(); });
$('signBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); hide('endCard'); showNameEntry(); }); // abducted runs: sign the sheet from the MISSING TIME card
$('shredBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); startHyper(); });
$('nameGo').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); nameSubmit(); });
$('nameSkip').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); nameSkip(); });
$('nameIn').addEventListener('input', (e) => { const v = cleanName(e.target.value); if (v !== e.target.value) e.target.value = v; });
$('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameSubmit(); } });
$('endCard').addEventListener('pointerdown', () => { if (S.state === 'end' && S.missSkippable) skipMiss(); }); // pass 3: a tap on the card skips the giggle lock (later losses only)
['nameScreen', 'endCard', 'boardScreen'].forEach((id) => $(id).addEventListener('pointerdown', (e) => e.stopPropagation()));
$('hiBtn').addEventListener('pointerup', openTitleBoard);
const cleanLbl = () => ($('cleanBtn').textContent = `CLEAN WORDS: ${CLEAN ? 'ON' : 'OFF'}`); cleanLbl(); // clean-language toggle (captions + _Clean VO takes)
$('cleanBtn').addEventListener('pointerdown', (e) => e.stopPropagation());
$('cleanBtn').addEventListener('pointerup', (e) => { e.stopPropagation(); e.preventDefault(); CLEAN = !CLEAN; localStorage.setItem('cr9_clean', CLEAN ? '1' : '0'); cleanLbl(); }); $('hiBtn').addEventListener('pointerdown', (e) => e.stopPropagation());
['pointerdown', 'pointerup'].forEach((ev) => $('howBtn').addEventListener(ev, (e) => e.stopPropagation())); // v4.5.2: the HOW TO PLAY link navigates; it never starts the game
$('boardClose').addEventListener('pointerup', (e) => { e.stopPropagation(); hide('boardScreen'); });
$('boardScreen').addEventListener('pointerup', (e) => e.stopPropagation());
document.addEventListener('visibilitychange', () => { if (!A.ctx) return; if (document.hidden && S.state === 'run' && !S.paused) { pauseGame('hidden'); return; } /* p4g: tab/app hidden mid-run = PAUSE (the menu waits for you) */ if (document.hidden && S.counting) { cancelCountdown(); return; } if (S.paused) return; /* stays paused + silent until RESUME */ if (document.hidden) { A.ctx.suspend(); S.wasPlaying = A.songEl && !A.songEl.paused; A.songEl && A.songEl.pause(); A.stemEl && A.stemEl.pause(); } else { A.ctx.resume(); if (S.wasPlaying) { A.songEl.play().catch(() => {}); A.stemEl && (A.stemEl.currentTime = A.songEl.currentTime, A.stemEl.play().catch(() => {})); } } });
// ---------- p4g (v4.7.0) PAUSE: button (top-left, under the CR9 logo), menu (RESUME / RESTART / MAIN MENU), 3-2-1 countdown, auto-pause when the tab is hidden ----------
// The menu is plain HTML over the (stopped) canvas: no textures, no fonts, no draw calls. While paused: the render loop is stopped (setAnimationLoop(null)), NOW() is frozen, every pending
// game timer is frozen (tqFreeze), CSS animations are paused (body.paused), the beam/latch are released, and the audio context + song + stem are suspended exactly like the tab-hidden handler.
// Nothing here touches scoring, difficulty or the touch rules; a restarted/abandoned run never reaches nameSubmit(), so it never posts a score.
const PB = { on: false }; let armedId = null, armT = 0; S.paused = false; S.counting = false; S.pauses = 0; S.pauseMs = 0;
const PM_LABEL = { pmRestart: 'RESTART', pmMenu: 'MAIN MENU' };
function pauseBtnSync() { const Fi = S.fight, on = !S.paused && S.state === 'run' && !!Fi && Fi.wave >= 0; // live = the first wave has been called (never on the title, menus, end card, or the first touch of a run)
  if (on !== PB.on) { PB.on = on; $('pauseBtn').classList.toggle('hidden', !on); if (on) S.pbShownAt = NOW(); } }
function releaseForPause() { // the touch beam / latch / keyboard beam let go (no SO CLOSE, no taunt, no sound: it is silent and frozen anyway)
  KEYS.clear(); S.hold = false; S.latch = false; S.pad = null; S.pid = null; S.autoSeek = false; // p4h: the beam latch lets go but the STREAK stays (the chain is linked across the pause: S.chain)
  const Fi = S.fight; if (Fi) Fi.locked = Fi.locked2 = null;
  beamSound(false); S.stemBeamOn = false;
  if (A.ctx && A.stemG) { for (const [pr, v] of [[A.stemG.gain, 0], [A.beamDuck.gain, 1]]) { try { pr.cancelScheduledValues(0); pr.value = v; } catch (e) {} } } // no 150 ms guitar tail when the audio wakes up
  { const pe = $('pop'); if (pe.classList.contains('small')) pe.classList.remove('go'); }
  hideAim(); try { vib(0); } catch (e) {}
  try { renderer.render(scene, G.camera); if (W.paint) { const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(W.paint.scene, W.paint.cam); renderer.autoClear = ac; } } catch (e) {} } // one last frame without the beam: that is what stays under the menu
function pauseAudio() { if (!A.ctx) return; S.pSong = !!(A.songEl && !A.songEl.paused); if (A.songEl) A.songEl.pause(); if (A.stemEl) A.stemEl.pause(); try { A.ctx.suspend(); } catch (e) {} }
function pauseGame(why) {
  if (S.paused || S.state !== 'run') return false;
  S.chain = S.streak > 0 && (S.hold || S.latch || S.chain) ? { from: S.pressId } : null; // p4h: pause keeps the streak: the next press after RESUME continues the chain
  tqFreeze(); PZ.t0 = performance.now(); PZ.on = true; S.paused = true; S.counting = false; S.pauses++; S.pauseWhy = why;
  releaseForPause(); renderer.setAnimationLoop(null); pauseAudio();
  PB.on = false; $('pauseBtn').classList.add('hidden'); document.body.classList.add('paused'); disarm();
  const m = $('pauseMenu'); m.classList.remove('hidden', 'count'); S.pmOpenAt = performance.now(); $('pmNote').classList.toggle('hidden', why !== 'restored'); saveRun(true);
  try { $('pmResume').focus({ preventScroll: true }); } catch (e) {} return true; } // p4h: focus lands on RESUME
function disarm() { rawCT(armT); if (armedId) { const b = $(armedId); b.classList.remove('sure'); b.textContent = PM_LABEL[armedId]; armedId = null; } }
function arm(id) { disarm(); armedId = id; const b = $(id); b.classList.add('sure'); b.innerHTML = 'SURE?<small>tap again to confirm</small>'; armT = rawST(disarm, 3000); }
function resumeGame() { // RESUME: 3-2-1, then the clock, timers, audio and render loop all restart together
  if (!S.paused || S.counting) return; disarm(); S.counting = true; S.cdStart = performance.now(); $('pauseMenu').classList.add('count'); $('pmNote').classList.add('hidden'); let n = 3;
  const tick = () => { if (!S.counting) return; if (n === 0) return finishResume(); const c = $('pmCount'); c.textContent = n; c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); n--; S.cdT = rawST(tick, 500); }; // p4h: 3 beats x 0.5 s = 1.5 s
  tick(); }
function skipCountdown() { if (!S.counting || S.finishing || performance.now() - (S.cdStart || 0) < 300) return; rawCT(S.cdT); S.cdSkips = (S.cdSkips || 0) + 1; finishResume(); } // p4h: a tap on the countdown skips it (not in its first 0.3 s: a double-tap on RESUME is not a skip)
function cancelCountdown() { S.counting = false; S.finishing = false; rawCT(S.cdT); $('pauseMenu').classList.remove('count'); if (A.ctx) { if (A.songEl) A.songEl.pause(); if (A.stemEl) A.stemEl.pause(); try { A.ctx.suspend(); } catch (e) {} } }
async function finishResume() {
  if (S.finishing) return; S.finishing = true;
  if (A.ctx) await Promise.race([A.ctx.resume().catch(() => {}), new Promise((r) => rawST(r, 600))]);
  S.finishing = false; if (!S.paused || !S.counting) return; // cancelled (tab hidden again / restart / menu) while the audio was waking up
  const el = A.songEl, st = A.stemEl; // song + guitar stem restart together at the same spot, so the stem stays in sync with the beam
  if (S.pSong && el) { if (st) { try { st.currentTime = el.currentTime; } catch (e) {} } for (const x of [el, st]) { if (!x) continue; const p = x.play(); if (p && p.catch) p.catch(() => {}); } }
  Song.reset(); const t1 = performance.now(); S.pauseMs += t1 - PZ.t0; PZ.total += t1 - PZ.t0; PZ.on = false; S.paused = false; S.counting = false; S.resumes = (S.resumes || 0) + 1; // game clock continues exactly where it stopped
  tqThaw(); try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {} document.body.classList.remove('paused'); $('pauseMenu').classList.add('hidden'); $('pauseMenu').classList.remove('count');
  lastPerf = performance.now(); renderer.setAnimationLoop(loopFn); } // the first frame's dt is ~0 (and dt is capped at 0.1 s anyway): no time jump
function leavePause() { // RESTART / MAIN MENU: drop the paused run for good (its timers, sounds, music), keep the audio context awake
  rawCT(S.cdT); disarm(); tqClear(); hardSilence(); const t1 = performance.now(); if (PZ.on) { S.pauseMs += t1 - PZ.t0; PZ.total += t1 - PZ.t0; PZ.on = false; }
  S.paused = false; S.counting = false; S.finishing = false; document.body.classList.remove('paused'); $('pauseMenu').classList.add('hidden'); $('pauseMenu').classList.remove('count');
  if (A.ctx) { try { A.ctx.resume(); } catch (e) {} } stopAll(); songDuck(false); S.ducks = {}; Song.reset(); songMuffle(false); S.savedPend = null; S.budget = null; clearInterval(S.warpIv);
  if (A.songEl) A.songEl.playbackRate = 1; if (A.stemEl) A.stemEl.playbackRate = 1; }
function hardSilence() { if (!A.ctx) return; for (const h of [...A.loops, ...A.voices]) { try { h.g.gain.cancelScheduledValues(0); h.g.gain.value = 0; } catch (e) {} } } // old sounds must not blip when the context wakes
function restartRun() { if (!S.paused) return; leavePause(); clearSave(); S.restarts = (S.restarts || 0) + 1; startRun(RUN_MODE); lastPerf = performance.now(); renderer.setAnimationLoop(loopFn); } // a fresh run from wave 1, no page reload, no score post
function goTitle(force) { // MAIN MENU: back to the title card, the run is abandoned (nothing is posted); a new game from there starts like the first one
  if (!S.paused && !force) return; leavePause(); clearSave(); S.runAlive = false; S.restoring = false; S.restored = false; S.chain = null; bannerClear(); S.titleBusy = false; S.menus = (S.menus || 0) + 1;
  S.state = 'title'; S.fight = null; S.cut = null; S.lift = null; S.grab = null; S.hyper = null; S.hold = false; S.latch = false; S.pad = null; S.pid = null; S.abducted = false; S.km = null; S.kmQ = []; S.popQ = []; S.cowList = []; S.finalCow = null; S.hero = null; S.shred = 0; S.dryUntil = 0; S.meltUntil = 0;
  ['hud', 'scoreHud', 'holdHere', 'grabBar', 'shredBtn', 'vo', 'cmd', 'sub', 'meter', 'reticle', 'lockRing', 'lockNum', 'padLine', 'cowQ', 'intro', 'bubble', 'rank', 'saved', 'endCard', 'nameScreen', 'pauseBtn'].forEach(hide); PB.on = false;
  ['grabOn', 'hyperOn', 'introOn', 'duelOn'].forEach((c) => document.body.classList.remove(c)); $('pop').classList.remove('go'); $('shredBar').classList.remove('hot', 'full');
  P.clear(); W.cows.count = 0; W.morph.visible = false; W.cowPop.visible = false; W.col.visible = false; W.hero.visible = false; W.beam.mesh.visible = false; W.fog.visible = true; W.drive.position.y = 0; W.dash.position.y = -VH / 2 - 10; S.liftK = 0; G.zoom = 1; G.focus.set(0, 0); G.shake = 0;
  GR.forEach((g) => { faceReset(g); g.face.visible = false; g.melt = 0; g.fade = undefined; g.bulge = g.bob = g.mock = 0; g.lookAt = null; g.snap = false; });
  if (W.paint) { W.paint.U.uIntro.value = 0; W.paint.U.uIntroA.value = 1; S.introPaintT = 0; } // the title looks like a fresh launch (the drive-in paint intro replays)
  show('titleCard'); $('startText').textContent = 'TAP TO START'; $('startText').classList.add('ready'); S.menuTitle = false; rawST(() => { S.menuTitle = true; }, 500); // the tap that chose MAIN MENU must not also start the next game
  resumeSync(); lastPerf = performance.now(); renderer.setAnimationLoop(loopFn); }
{ // wiring: every touch on the pause button / menu stays there (nothing reaches the game's document handlers: no beam, no sky tap-lock, no break-free tap)
  const eat = (el) => ['pointerup', 'pointercancel', 'pointermove', 'touchstart', 'touchend', 'touchmove', 'mousedown', 'mouseup', 'click'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
  const pb = $('pauseBtn'), pm = $('pauseMenu'); eat(pb); eat(pm);
  pb.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (NOW() - (S.pbShownAt || 0) < 350) return; pauseGame('button'); }); // swallowed (not acted on) in its first 0.35 s on screen
  pm.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (S.counting) return skipCountdown(); if (armedId) disarm(); }); // a tap anywhere else cancels "Sure?"; a tap on the countdown skips it
  // p4h: every menu button answers a touch (pointerdown, instant) AND a click with no pointer behind it (keyboard Enter / Space, screen readers): e.detail === 0
  let lastAct = -1e9;
  const btn = (id, fn) => { const el = $(id), go = (kb) => { if (S.counting) return skipCountdown(); if (performance.now() - (S.pmOpenAt || 0) < 250 || (kb && performance.now() - lastAct < 400)) return; lastAct = performance.now(); fn(); };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); go(false); });
    el.addEventListener('click', (e) => { e.stopPropagation(); if (e.detail !== 0) return; go(true); }); };
  btn('pmResume', () => resumeGame());
  btn('pmRestart', () => { if (armedId === 'pmRestart') { disarm(); restartRun(); } else arm('pmRestart'); });
  btn('pmMenu', () => { if (armedId === 'pmMenu') { disarm(); goTitle(); } else arm('pmMenu'); });
}
function pmTrap(e) { const bs = ['pmResume', 'pmRestart', 'pmMenu'].map($), i = bs.indexOf(document.activeElement); e.preventDefault(); bs[i < 0 ? 0 : (i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus({ preventScroll: true }); } // Tab / Shift+Tab cycle RESUME > RESTART > MAIN MENU inside the dialog

// ---------- p4h (v4.8.0) SAVE + RESTORE A RUN ----------
// The run is written to localStorage ('cr9_run_v1') at the EXACT moment: on every score / kill / wave change, on pause, on pagehide and when the tab is hidden, plus once a second while a run is live.
// It is never a wave-start checkpoint, so a reload cannot redo a bad wave. Restoring is explicit (title: RESUME RUN), lands in the PAUSE menu (RESUME > 3-2-1) and consumes the save (it is rewritten by the live run).
// What comes back: score parts, lives, streak (+ the chain link), SHRED bar, wave + wave clock, every live ship (position, maneuver, beam progress), an open truck grab, a running HYPER, the run clock (the time away does not count) and the song position.
// What does not: particles, a melting cow / morph in flight (its soul and points are already counted), a truck lift in progress, sounds, camera push-ins.
const SAVE_KEY = 'cr9_run_v1', SAVE_TTL = 30 * 60 * 1000, MAN_KINDS = ['peek', 'swoop', 'hover', 'strafe', 'pull', 'dive', 'flee'];
let saveAt = 0, saveLoopAt = 0; Object.assign(S, { runAlive: false, restoring: false, restored: false, hasSave: false, zeroDt: 0, saves: 0, chain: null, titleBusy: false });
const isNum = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi, isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi, isArr = (v, n) => Array.isArray(v) && v.length <= n;
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
function saveable() { const Fi = S.fight; return S.state === 'run' && !!Fi && Fi.wave >= 0 && Fi.wave < WAVES.length && S.kills < TOTAL_GRAYS && S.lives > 0 && !S.abducted && !S.cut && !S.restoring; }
function snapRun() { const Fi = S.fight, n = NOW(), g0 = S.grab, h0 = S.hyper;
  const src = Fi.ships.filter((s) => !s.gone && s.man && (s.alive || (s.tgrab && s.man.kind === 'dive'))); // alive ships, plus the one sent to dive on the truck after a wave ran out
  const ships = src.map((s) => { const m = s.man; return { sl: s.slot, al: !!s.alive, sz: s.size, sp: s.spd, X: s.X, Y: s.Y, Z: s.Z, ph: s.ph, L: s.L, Lp: s.Lpeak, st: s.stage, pk: !!s.peeked, tg: !!s.tgrab, dv: !!s.dove, id: s.idleT || 0, m: m.kind === 'panic' ? null : { k: m.kind, t: m.t, d: m.dur, f: m.from.slice(), o: m.to.slice() } }; });
  const grab = g0 && !g0.free && !g0.lethal && src.indexOf(g0.sh) >= 0 ? { t: g0.t, taps: g0.taps, need: g0.need, max: g0.max, k: g0.k, si: src.indexOf(g0.sh) } : null;
  return { f: 1, b: BUILD_V, ts: Date.now(), mode: RUN_MODE == null ? null : String(RUN_MODE), songT: A.songEl ? A.songEl.currentTime : 0, el: (n - S.runT0) / 1000,
    r: { score: S.score, kills: S.kills, bestStreak: S.bestStreak, streak: S.streak, streakPts: S.streakPts, cowPts: S.cowPts, cowHits: S.cowHits, pointBlanks: S.pointBlanks, firstKill: S.firstKill, lives: S.lives, livesLost: S.livesLost, lossLog: S.lossLog, grabs: S.grabs, grabLog: S.grabLog,
      breakFrees: S.breakFrees, grabTaps: S.grabTaps, soCloses: S.soCloses, lockedOnce: !!S.lockedOnce, ohnoW4: !!S.ohnoW4, firstShipT: S.firstShipT, shred: h0 ? 0 : S.shred, hypers: S.hypers, hyperKills: S.hyperKills || 0, shredReadyAt: S.shredReadyAt, hyperAt: S.hyperAt, killLog: S.killLog, cowList: S.cowList || [],
      pressId: S.pressId, chain: S.streak > 0 && (S.hold || S.latch || S.chain) ? S.pressId : -1, liftCool: Math.max(0, (S.liftCool || 0) - n), grabGrace: Math.max(0, (S.grabGrace || 0) - n) },
    fi: { wave: Fi.wave, t: Fi.t, t0: Fi.t0, next: Fi.next, waveOn: !!Fi.waveOn, wkills: Fi.wkills || 0, spawnQ: Fi.spawnQ.map((a) => [a[0], a[1]]), lkp: Fi.lastKillPress }, ships, grab, hyper: h0 ? { t: h0.t } : null }; }
function validSave(o) { // every number is range-checked; anything odd = no save (the title never shows RESUME for a save that could not be restored)
  try {
    if (!o || typeof o !== 'object' || o.f !== 1 || o.b !== BUILD_V || !isNum(o.ts, 1, 1e15) || Date.now() - o.ts > SAVE_TTL || o.ts - Date.now() > 120000) return false;
    const r = o.r, f = o.fi; if (!r || !f || typeof r !== 'object' || typeof f !== 'object') return false;
    if (!isInt(r.kills, 0, TOTAL_GRAYS - 1) || !isInt(r.lives, 1, LIVES) || !isInt(f.wave, 0, WAVES.length - 1) || !isNum(o.el, 0, 900) || !isNum(o.songT, 0, 600)) return false;
    if (!isNum(f.t, 0, 1e4) || !isNum(f.t0, 0, 1e4) || !(f.next === null || isNum(f.next, 0, 1e4)) || !isArr(f.spawnQ, 4) || !isInt(f.wkills, 0, 8) || !(isNum(f.lkp, -1, 1e8))) return false;
    for (const a of f.spawnQ) if (!isArr(a, 2) || a.length !== 2 || !isNum(a[0], 0, 1e4) || !isInt(a[1], 0, 1)) return false;
    if (![r.score, r.cowPts].every((v) => Number.isInteger(v) && Math.abs(v) < 1e7) || ![r.bestStreak, r.streak, r.cowHits, r.pointBlanks, r.livesLost, r.grabs, r.breakFrees, r.grabTaps, r.soCloses, r.hypers, r.hyperKills, r.streakPts].every((v) => isInt(v, 0, 1e6))) return false;
    if (!isInt(r.pressId, 0, 1e8) || !isInt(r.chain, -1, 1e8) || !isNum(r.shred, 0, 100) || !isNum(r.liftCool, 0, 1e5) || !isNum(r.grabGrace, 0, 1e5)) return false;
    if (!(r.firstKill === null ? r.kills === 0 : isNum(r.firstKill, 0, 900)) || !(r.firstShipT === null || isNum(r.firstShipT, 0, 900))) return false;
    if (![r.lossLog, r.grabLog, r.shredReadyAt, r.hyperAt, r.killLog, r.cowList].every((v) => isArr(v, 200)) || !r.cowList.every((c) => typeof c === 'string' && c.length < 80)) return false;
    if (!isArr(o.ships, 2)) return false;
    for (const d of o.ships) { if (!d || !isInt(d.sl, 0, 1) || ![d.sz, d.sp, d.X, d.Y, d.Z, d.ph, d.L, d.Lp, d.id].every((v) => isNum(v, -1e3, 1e3)) || !isInt(d.st, 0, 4)) return false;
      if (d.m !== null && (!d.m || !MAN_KINDS.includes(d.m.k) || !isNum(d.m.t, 0, 100) || !isNum(d.m.d, 0.01, 100) || !isArr(d.m.f, 3) || d.m.f.length !== 3 || !d.m.f.every((v) => isNum(v, -1e3, 1e3)) || !isArr(d.m.o, 3) || d.m.o.length !== 3 || !d.m.o.every((v) => isNum(v, -1e3, 1e3)))) return false; }
    if (new Set(o.ships.map((d) => d.sl)).size !== o.ships.length) return false;
    if (o.grab !== null && (!o.grab || !isInt(o.grab.si, 0, o.ships.length - 1) || ![o.grab.t, o.grab.k].every((v) => isNum(v, 0, 1e3)) || !isInt(o.grab.taps, 0, 1e3) || !isInt(o.grab.need, 1, 1e3) || !isNum(o.grab.max, 0.1, 100))) return false;
    if (o.hyper !== null && (!o.hyper || !isNum(o.hyper.t, 0, 100) || o.grab)) return false;
    return true;
  } catch (e) { return false; } }
function readSave() { let raw = null; try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; } if (raw == null) return null;
  try { const o = JSON.parse(raw); if (validSave(o)) return o; } catch (e) {} clearSave(); return null; } // corrupt / stale / other build: dropped, the title stays clean
function saveRun(force) { if (!S.runAlive || S.restoring) return;
  try { if (!saveable()) { if (S.state === 'run' && S.fight && S.fight.wave < 0) return; clearSave(); return; } // drive-in (no wave called yet) keeps nothing; a finished run keeps nothing
    const n = performance.now(); if (!force && n - saveAt < 250) return; saveAt = n; localStorage.setItem(SAVE_KEY, JSON.stringify(snapRun())); S.saves++; } catch (e) {} }
function runSync() { if (!S.runAlive || S.restoring) return; // every frame: a run that has ended deletes its save; a live run saves once a second
  if (S.state !== 'run' || S.kills >= TOTAL_GRAYS) { S.runAlive = false; clearSave(); return; } const n = performance.now(); if (n - saveLoopAt > 1000) { saveLoopAt = n; saveRun(); } }
let updOn = false;
function updSync() { const on = !!STALE && !S.paused && !S.counting && !S.restoring && !S.runAlive && !S.hasSave && S.state !== 'run' && (vis('titleCard') || vis('endCard')) && !vis('boardScreen') && !vis('nameScreen'); if (on !== updOn) { updOn = on; $('updBtn').classList.toggle('hidden', !on); } } // p4h: the "New version" prompt: only on the title / end card, never in a run, a pause or a restore, and not while a saved run waits
function resumeSync() { const sv = readSave(), rb = $('resumeBtn'), nb = $('newBtn'); S.hasSave = !!sv; rb.classList.toggle('hidden', !sv); nb.classList.toggle('hidden', !sv); $('startText').classList.toggle('hidden', !!sv);
  if (sv) $('resumeSub').textContent = `WAVE ${WAVES[sv.fi.wave].label} · ${sv.r.score.toLocaleString('en-US')} PTS · ${sv.r.lives} ${sv.r.lives === 1 ? 'TRUCK' : 'TRUCKS'}`; return sv; }
function restoreShip(d) { const Fi = S.fight, g = GR[d.sl]; AT.green = 1.1; showGray(g, 0, 0, 0.05, GF.serious); g.snap = true; g.fade = 0; g.bulge = g.bob = g.mock = 0; g.lookAt = null; g.mat.uniforms.uBulge.value = 0;
  const sh = { slot: d.sl, g, alive: d.al, size: d.sz, spd: d.sp, X: d.X, Y: d.Y, Z: d.Z, ph: d.ph, L: d.L, Lpeak: d.Lp, stage: d.st, laughT: -9, peeked: d.pk, x: 0, y: 0, sc: 0.01, fx: 0, fy: 0, fr: 1, tgrab: d.tg, dove: d.dv, idleT: d.id };
  if (d.m) sh.man = { kind: d.m.k, t: d.m.t, dur: d.m.d, from: d.m.f.slice(), to: d.m.o.slice() }; else startMan(sh, 'swoop'); // a double-take in progress restarts as a plain swoop
  if (!d.al) setFaceG(g, GF.laughing); Fi.ships.push(sh); return sh; }
async function restoreRun(sv) { // title > RESUME RUN: rebuild the run exactly as saved, draw it for a few frames without advancing it, then open the PAUSE menu (RESUME > 3-2-1)
  S.restoring = true;
  try {
    const r = sv.r, f = sv.fi; clearSave(); startRun(sv.mode || undefined, { songT: sv.songT }); S.restoring = true;
    Object.assign(S, { kills: r.kills, souls: r.kills, melts: r.kills, bestStreak: r.bestStreak, streak: r.streak, streakPts: r.streakPts, cowPts: r.cowPts, cowHits: r.cowHits, pointBlanks: r.pointBlanks, firstKill: r.firstKill, lives: r.lives, livesLost: r.livesLost, lossLog: r.lossLog.slice(), grabs: r.grabs, grabLog: r.grabLog.slice(),
      breakFrees: r.breakFrees, grabTaps: r.grabTaps, soCloses: r.soCloses, lockedOnce: r.lockedOnce, ohnoW4: r.ohnoW4, firstShipT: r.firstShipT, shred: r.shred, hypers: r.hypers, hyperKills: r.hyperKills, shredReadyAt: r.shredReadyAt.slice(), hyperAt: r.hyperAt.slice(), killLog: r.killLog.slice(), cowList: r.cowList.slice(),
      pressId: r.pressId, chain: r.chain >= 0 ? { from: r.chain } : null });
    const Fi = S.fight; Object.assign(Fi, { wave: f.wave, t: f.t, t0: f.t0, next: f.next, waveOn: f.waveOn, wkills: f.wkills, spawnQ: f.spawnQ.map((a) => [a[0], a[1]]), lastKillPress: f.lkp, locked: null, locked2: null });
    const ships = sv.ships.map(restoreShip);
    livesHud(); soulsHud(); shredHud(); scoreHud(0); $('lives').classList.toggle('last', S.lives === 1); hideIntro(); sub(''); hideCmd(); hide('saved'); hide('holdHere');
    if (Fi.waveOn) { show('meter'); $('meterTxt').textContent = `WAVE ${WAVES[Fi.wave].label}`; $('meterFill').style.width = `${clamp(1 - (Fi.t - Fi.t0) / WAVES[Fi.wave].time, 0, 1) * 100}%`; } else hide('meter');
    ramp(A.cleanGain.gain, SONG_RUN * 0.63, null, 0.4); engineLevel(ENGINE_LVL * 0.6);
    if (sv.grab) { const ga = S.grabAnyWave; S.grabGrace = 0; S.grabAnyWave = true; const ok = startGrab(ships[sv.grab.si], 'restore'); S.grabAnyWave = ga; if (ok && S.grab) { Object.assign(S.grab, { t: sv.grab.t, taps: sv.grab.taps, need: sv.grab.need, max: sv.grab.max, k: sv.grab.k }); grabHud(); } S.grabs = r.grabs; S.grabLog = r.grabLog.slice(); S.grabTaps = r.grabTaps; }
    if (sv.hyper) { S.shred = 100; startHyper(); if (S.hyper) S.hyper.t = sv.hyper.t; S.hypers = r.hypers; S.hyperAt = r.hyperAt.slice(); S.shred = 0; shredHud(); }
    hideCmd(); voEnd(); S.voQ = []; S.voLog = []; for (const h of [...A.voices]) { try { h.stop(); } catch (e) {} } // the sounds of the rebuild itself (grab laugh, SHRED hit) stay silent
    S.zeroDt = 4; for (let i = 0; i < 60 && S.zeroDt > 0; i++) await new Promise((rs) => rawST(rs, 50)); // the loop draws the rebuilt run for 4 frames at dt = 0
    if (A.primed) await A.primed; for (let i = 0; i < 20 && A.songEl && A.songEl.paused; i++) await new Promise((rs) => rawST(rs, 50)); // the song must be playing before the pause can freeze it
    if (!pauseGame('restored')) throw new Error('could not open the pause menu');
    const n = NOW(); S.runT0 = n - sv.el * 1000; S.liftCool = r.liftCool > 0 ? n + r.liftCool : 0; S.grabGrace = r.grabGrace > 0 ? n + r.grabGrace : 0; // the run clock is exactly what was saved: the time away does not count
    try { if (A.songEl) A.songEl.currentTime = sv.songT; if (A.stemEl) A.stemEl.currentTime = sv.songT; } catch (e) {} S.bi = bIdx(sv.songT); S.pSong = true; Song.reset();
    S.restoring = false; S.restored = true; S.restores = (S.restores || 0) + 1; saveRun(true); return true;
  } catch (e) { console.warn('restore failed', e); S.restoring = false; clearSave(); try { goTitle(true); } catch (e2) { location.reload(); } return false; } }
window.__cr9.save = { snapRun, readSave, validSave, saveRun, clearSave, restoreRun, resumeSync, KEY: SAVE_KEY, BQ, STALE: () => STALE, setStale: (v) => { STALE = v; } };
window.__cr9.pause = { pause: (w) => pauseGame(w || 'test'), resume: () => resumeGame(), restart: () => restartRun(), menu: () => goTitle(), PZ, NOW, TQ, runDur: () => runDur() };
// test hooks (headless check): where a finger must be so the reticle sits on the best target (highest lock progress, else nearest)
window.__cr9.input = {
  target() { const Fi = S.fight; if (!Fi || S.state !== 'run') return null; let best = null;
    const div = Fi.ships.find((q) => q.alive && q.man.kind === 'dive' && q.Z < 26); if (div) best = div; // a good player swings onto the diver first
    if (!best) for (const sh of Fi.ships) if (sh.alive && sh.Z < 26 && !['peek', 'flee'].includes(sh.man.kind)) { if (!best || sh.L > best.L + 0.01 || (Math.abs(sh.L - best.L) <= 0.01 && sh.Z < best.Z)) best = sh; }
    if (!best) return null; const [x, y] = toScreen(best.fx, (best.fy + best.y) / 2); return [x, y + RET_DY]; },
};
window.__cr9.GR = GR;
window.__cr9.loopPoints = loopPoints; window.__cr9.STEM = STEM; window.__cr9.p3 = { shredReady: () => shredReady(), startHyper: () => startHyper(), shipScreen: (sh) => { const [x, y] = toScreen(sh.fx, (sh.fy + sh.y) / 2); return [x, y]; }, JINK, TUNE, CUT_S, startMan: (sh, k) => startMan(sh, k), PAD_GAIN, PAD_H, padTop, MISS_AUDIO, woo, landFx, savedBanner };
window.__cr9.p2 = { ATTACK, MISS_AUDIO, NAME_AT, FLY, hasStrums, abducted: () => abducted(), kill: (sh) => kill(sh), lockStage: (sh, st) => lockStage(sh, st), cowPop: (x, y, c) => cowPop(x, y, c), pickCow: (h) => pickCow(h) }; // pass-2 headless checks
window.__cr9.t452 = { pickCow, sayNow, voPick, sayBank, nextWave };
window.__cr9.p3b = { GR, GF, kill, startHyper, startGrab, toScreen, setFaceG, W }; // p3b screenshot hooks (tools/shots_p3b.mjs) // v4.5.2 headless checks (tools/check_v452.mjs)
window.__cr9.test = { killTauntFade() { const L = VO.banks.COWPOP[2]; sayNow(L, 'kill'); const c = S.voCur, had = !!(c && c.h), g0 = c && c.h && c.h.g ? c.h.g.gain.value : null; fadeKillTaunt(); return { had, cleared: !!c && !c.h, fades: S.tauntFades || 0, captionUp: !$('vo').classList.contains('hidden') }; }, grab() { S.grabGrace = 0; S.grabAnyWave = true; const sh = S.fight && S.fight.ships.find((q) => q.alive); return sh ? startGrab(sh, 'test') : false; }, lift() { S.liftCool = 0; S.lift = null; const sh = S.fight && S.fight.ships.find((q) => q.alive); if (sh) startLift(sh); return !!sh; },
  dive() { S.liftCool = 0; const sh = S.fight && S.fight.ships.find((q) => q.alive && !['peek', 'panic', 'dive', 'flee'].includes(q.man.kind)); if (sh) startMan(sh, 'dive'); return !!sh; } }; // headless bench hook (forces a truck lift)

// ---------- DOT: frame-rate bookkeeping (every melt window + per section), always on, cheap ----------
function meltClose() { if (S.meltCur && S.meltCur.length > 1) S.meltWins.push(S.meltCur); S.meltCur = null; }
function secName() { const Fi = S.fight; if (S.state === 'morph') return 'final morph'; if (S.state === 'parade') return 'finale'; if (S.state === 'end') return 'end card';
  if (S.state !== 'run') return S.state; if (NOW() < S.meltUntil) return 'melt'; if (S.grab) return 'abduction'; if (S.lift) return 'truck lift'; if (!Fi || Fi.wave < 0) return 'drive-in';
  return `wave ${WAVES[Fi.wave].label}`; }
function secTick(now) { if (!S.sec) return; const n = secName(), q = S.sec[n] || (S.sec[n] = { f: 0, t0: now, last: now, ts: [] }); if (S.secLast !== n) { q.ts = q.ts.length > 4000 ? [] : q.ts; } S.secLast = n;
  q.f++; q.ts.push(now); q.last = now;
  const melting = S.state === 'morph' || (S.state === 'run' && now < S.meltUntil); if (melting) (S.meltCur || (S.meltCur = [])).push(now); else meltClose();
  S.fpsAll[0]++; if (!S.fpsAll[1]) S.fpsAll[1] = now; S.fpsAll[2] = now; }
function avgFps() { const a = S.fpsAll; return a && a[2] > a[1] ? (a[0] - 1) * 1000 / (a[2] - a[1]) : 0; }
window.__cr9.secReport = () => { const o = {}; for (const [n, q] of Object.entries(S.sec || {})) { const runs = []; let cur = [q.ts[0]]; for (let i = 1; i < q.ts.length; i++) { if (q.ts[i] - q.ts[i - 1] > 200) { runs.push(cur); cur = []; } cur.push(q.ts[i]); } runs.push(cur);
  const fr = runs.reduce((a, r) => a + r.length - 1, 0), tm = runs.reduce((a, r) => a + (r[r.length - 1] - r[0]), 0); const mins = runs.map((r) => minFps(r)).filter((x) => x > 0);
  o[n] = { avg: tm > 0 ? +(fr * 1000 / tm).toFixed(1) : 0, min: mins.length ? +Math.min(...mins).toFixed(1) : null, secs: +(tm / 1000).toFixed(1) }; } return o; };

// ---------- main loop (30 fps lock) ----------
const UNCAP = Q.get('uncap') === '1'; // headless benchmarking only: lifts the 30 fps cap so render cost shows up as fps
const fpsOn = Q.get('fps') === '1'; if (fpsOn) show('fps');
let last = 0, lastPerf = NOW(), fc = 0, fT = 0, cpu = 0; S.fps = 0;
const loopFn = (now) => {
  if (!UNCAP && now - last < 1000 / 30 - 3) return; last = now;
  const c0 = NOW(); const dt = S.zeroDt > 0 ? (S.zeroDt--, 0) : Math.min((now - lastPerf) / 1000, 0.1); lastPerf = now; /* p4h: zeroDt = a few frames that draw a restored run without advancing it */ const T = (now - PZ.total) / 1000; // p4g: T (animation phase) is game time too
  if (A.ctx && S.state !== 'title' && S.state !== 'boot') {
    Song.update(); const song = Song.heard(); S.song = song;
    if (S.bi < BT.length && BT[S.bi] < song - 1) S.bi = bIdx(song - 0.05);
    while (S.bi < BT.length && BT[S.bi] <= song) { onBeat(S.bi); S.bi++; }
    const b0 = BT[Math.max(0, S.bi - 1)], b1 = BT[Math.min(BT.length - 1, S.bi)]; S.beatPh = b1 > b0 ? clamp((song - b0) / (b1 - b0), 0, 1) : 0;
    if (S.state === 'morph') updateMorph(T);
    if (S.state === 'parade') finaleUpdate(dt);
  }
  const gdt = (NOW() < (S.hitStopUntil || 0) ? dt * 0.03 : NOW() < (S.slowUntil || 0) ? dt * 0.5 : dt) * TS; // p4f: hit-stop = game time ~frozen for ~80 ms (never faster than the wall clock) S.timeScale = gdt / (dt || 1); // brief half-speed beat on pops
  if (W.drive) {
    updateRoad(S.state === 'title' ? dt * 0.3 : gdt, T); atmosTick(S.state === 'title' ? dt * 0.3 : gdt, T);
    document.body.classList.toggle('padOn', S.state === 'run'); pauseBtnSync(); bannerTick(); updSync(); runSync(); keyAim(dt); aimUpdate(); fightUpdate(gdt, T); latchUpdate(dt); autoSeekUpdate(); cowShotUpdate(gdt); shredSync(); if ((S.state === 'run' || S.lift) && !S.grab) liftUpdate(gdt); grabUpdate(gdt, T); dangerUpdate(); drawShips(T); heroUpdate(gdt, T); drawAim(T); killMorphUpdate(gdt, T); cowPopUpdate(gdt); cutUpdate(gdt, T); hyperUpdate(dt); voUpdate(); ambUpdate(); stemSync(NOW());
    for (const g of GR) if (g.face.visible) updateGray(g, gdt, T);
  }
  if (P) { P.update(gdt); P.mat.uniforms.uScale.value = renderer.getPixelRatio() * innerHeight / VH * G.camera.zoom; }
  updateCamera(gdt);
  renderer.render(scene, G.camera);
  if (W.paint) { const Pp = W.paint, U = Pp.U; Pp.wind = AT.gust; Pp.update(dt, T, innerWidth / innerHeight);
    if (S.introPaintT != null) { S.introPaintT += dt; U.uIntro.value = Math.min(1, S.introPaintT / 2.2); if (S.state === 'run' || S.introPaintT > 9) U.uIntroA.value = Math.max(0, U.uIntroA.value - dt * 1.4); if (U.uIntroA.value <= 0) S.introPaintT = null; }
    U.uPal.value += ((S.abducted && S.state !== 'run' ? 1 : 0) - U.uPal.value) * Math.min(1, dt * 1.5);
    U.uDry.value += ((NOW() < (S.dryUntil || 0) || (S.state === 'end' && !S.abducted) ? 1 : 0) - U.uDry.value) * Math.min(1, dt * 1.2);
    const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(Pp.scene, Pp.cam); renderer.autoClear = ac; }
  cpu = cpu * 0.9 + (NOW() - c0) * 0.1; fc++; secTick(now - PZ.total);
  if (now - fT > 1000) { S.fps = fc * 1000 / (now - fT); fc = 0; fT = now; const i = renderer.info;
    window.__cr9.stats = { fps: S.fps, cpu, draws: i.render.calls, tris: i.render.triangles, textures: i.memory.textures, particles: P ? P.count : 0, px: renderer.getPixelRatio(), morphFps: S.morphFps, morphMinFps: S.morphMinFps };
    const Fi = S.fight; if (fpsOn) $('fps').textContent = `${S.fps.toFixed(0)}fps cpu${cpu.toFixed(1)}ms dr${i.render.calls} tex${i.memory.textures} p${P ? P.count : 0}/${MAXP} px${renderer.getPixelRatio().toFixed(2)} song${(S.song || 0).toFixed(1)} ${S.state}${Fi ? ` w${Fi.wave + 1} k${S.kills}` : ''}`; }
}; renderer.setAnimationLoop(loopFn);

// DOT: warm-up. Upload EVERY texture (cow sheet + SDF incl. the bald shred frames, billboard, poses, fx) and compile EVERY program with every
// first-use object switched on (faces, morph, hyper beam, abduction beam, cow pop, parade cows, billboard, fog), then draw one tiny offscreen frame.
function warmUp() {
  const seen = new Set(), up = (t) => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); renderer.initTexture(t); } };
  Object.values(G.tex).forEach(up);
  scene.traverse((o) => { for (const m of [].concat(o.material || [])) { up(m.map); up(m.alphaMap); if (m.uniforms) for (const u of Object.values(m.uniforms)) up(u && u.value); } });
  const objs = [W.morph, W.beam.mesh, W.cowPop, W.col, W.fog, W.bill, W.hero, ...GR.map((g) => g.face)].filter(Boolean), was = objs.map((o) => o.visible), cc = W.cows.count;
  objs.forEach((o) => (o.visible = true)); W.cows.count = 1; if (W.col.material) W.col.material.opacity = 0.5;
  const hy = W.beam.u && W.beam.u.uHyper; if (hy) hy.value = 1;
  renderer.compile(scene, G.camera);
  const rt = new THREE.WebGLRenderTarget(64, 64); renderer.setRenderTarget(rt); renderer.render(scene, G.camera); renderer.setRenderTarget(null); rt.dispose();
  objs.forEach((o, i) => (o.visible = was[i])); W.cows.count = cc; if (hy) hy.value = 0; W.col.material.opacity = 0;
  if (MAN.art['story.webp']) { const im = new Image(); im.src = `${import.meta.env.BASE_URL}art/${MAN.art['story.webp']}`; if (im.decode) im.decode().catch(() => {}); S.storyImg = im; } // story card art decoded before the tap
  S.warmTex = seen.size;
}
function loadFail(msg, e) { S.loadFailed = true; $('startText').textContent = msg; $('startText').classList.add('ready'); console.warn(e); } // v4.5.2: only after 3 retries each; the title card tap reloads
// ---------- boot: all art + one-shots preload before the start tap ----------
(async function boot() {
  try { await loadTextures(ART, (p) => ($('loadPct').textContent = Math.round(p * 40))); }
  catch (e) { loadFail('Could not load the art. Tap to reload.', e); return; }
  buildScene(); warmUp(); initL2();
  S.state = 'title';
  try { await prefetch((p) => ($('loadPct').textContent = 40 + Math.round(p * 60))); }
  catch (e) { loadFail('Could not load sounds. Tap to reload.', e); return; }
  S.ready = true; $('startText').textContent = 'TAP TO START'; $('startText').classList.add('ready'); resumeSync(); // p4h: a saved run (< 30 min old) turns the title into RESUME RUN / NEW GAME
})();
// p4h: with a saved run waiting, a tap on the title BACKGROUND does nothing (an accidental tap must not throw the run away): RESUME RUN or NEW GAME, both on purpose
$('titleCard').addEventListener('pointerup', (e) => { if (S.hasSave) { e.stopPropagation(); return; } titleGo(e, 'start'); });
{ const act = (el, fn) => { let st = -1e9; // pointerup (touch / mouse) and click with detail 0 (keyboard, screen reader) both work, never twice
    el.addEventListener('pointerdown', (e) => e.stopPropagation()); el.addEventListener('pointerup', (e) => { e.stopPropagation(); e.preventDefault(); st = performance.now(); fn(e); }); el.addEventListener('click', (e) => { e.stopPropagation(); if (e.detail !== 0 || performance.now() - st < 700) return; fn(e); }); };
  act($('resumeBtn'), (e) => titleGo(e, 'resume')); act($('newBtn'), (e) => titleGo(e, 'new')); act($('updBtn'), () => location.reload()); }
async function titleGo(e, mode) {
  if (e && e.stopPropagation) e.stopPropagation(); if (S.loadFailed) return location.reload(); if (!S.ready || S.titleBusy) return; if (typeof mode !== 'string') mode = S.hasSave ? 'resume' : 'start';
  const sv = mode === 'resume' ? readSave() : null; if (mode === 'resume' && !sv) { resumeSync(); return; } // the save expired / vanished since the title drew: the buttons are refreshed, nothing starts
  if (mode === 'new') { clearSave(); resumeSync(); } // NEW GAME is the one tap that discards a saved run
  const go = () => (sv ? restoreRun(sv) : Q.get('skip') || Q.get('story') === '0' ? startRun(Q.get('skip')) : showStory(() => startRun()));
  if (A.ctx) { if (!S.menuTitle) return; S.menuTitle = false; hide('titleCard'); go(); return; } // p4g: back on the title from the pause menu: audio is already unlocked + decoded
  S.titleBusy = true; unlock(); $('startText').textContent = 'Tuning in…'; $('startText').classList.remove('ready'); if (sv) $('resumeSub').textContent = 'Tuning in…';
  try { await decodeAll(); } finally { S.titleBusy = false; }
  hide('titleCard'); go(); // v4.5: one-screen story card before the drive (a restored run skips it)
}
// p4h: the run is saved when the page goes away or the tab is hidden (pause also saves)
window.addEventListener('pagehide', () => saveRun(true)); document.addEventListener('visibilitychange', () => { if (document.hidden) saveRun(true); });
