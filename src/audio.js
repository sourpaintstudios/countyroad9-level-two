// CR9 v4.5 audio (every file name carries a content hash, see pack-assets.mjs): one shared AudioContext (unlocked by the radio-knob tap), REX's bus graph, OGG with MP3 fallback.
// MUSIC_Full streams through ONE <audio> element with two routes: the AM-radio chain (drive) and a clean route (fight / victory slam).
import ONE_SHOTS from './oneshots.json';
import MAN from './manifest.json';
const MAX_VOICES = 28;
// v4.5 review: true loop lengths [samples, file rate] (measured from REX's WAVs; the OGGs decode to exactly this). LAME/Lavc lead padding = 1105 samples.
const LOOP_LEN = { AMB_Tire_Roll_Loop: [220500, 44100], AMB_Wind_Desert_Loop: [308700, 44100], GTR_Shred_Hyper_Loop: [270691, 44100], AMB_Truck_Drive_Loop: [264600, 44100], GTR_Beam_Loop: [135345, 44100], ANIMAL_Cow_Hoofsteps_Loop: [176400, 44100], GTR_Beam_Strum_Loop: [180460, 44100], AMB_Ship_Hum_Loop: [119070, 44100], AMB_Crickets_Soft_Loop: [176400, 44100], AMB_Danger_Rumble_Loop: [176400, 44100], AMB_Wind_Bed_Loop: [882000, 44100], AMB_Road_Hum_Loop: [352800, 44100] }, LAME_LEAD = 1105;
export const loopPoints = (name, buffer) => { const L = LOOP_LEN[name]; if (!L) return null; const len = L[0] / L[1], extra = buffer.duration - len; if (extra <= 0.0005) return [0, buffer.duration]; const lead = Math.min(LAME_LEAD / L[1], extra); return [lead, lead + len]; }; // pass 3: exposed for the MP3 seam check
export const A = { ctx: null, fmt: 'ogg', raw: {}, buf: {}, bus: {}, voices: [], loops: new Set(), songEl: null, radioGain: null, cleanGain: null, ready: false };

function pickFormat() {
  const f = new URLSearchParams(location.search).get('fmt'); if (f === 'mp3' || f === 'ogg') return f;
  const a = document.createElement('audio');
  return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'; // p4b: OGG whenever the browser can play it at all ('probably' or 'maybe'); MP3 only as the fallback;
}
export const url = (n) => `${import.meta.env.BASE_URL}audio/${MAN.audio[A.fmt].music}`; // only MUSIC_Full streams

// v4.5.2: the sound pack fetch retries up to 3 times with backoff (0.5 / 1 / 2 s) before boot gives up
export async function prefetch(onProgress) { for (let i = 0; ; i++) { try { return await prefetchOnce(onProgress); } catch (e) { if (i >= 3) throw e; console.warn('audio retry', i + 1, e); await new Promise((r) => setTimeout(r, 500 * 2 ** i)); } } }
async function prefetchOnce(onProgress) {
  A.fmt = pickFormat();
  const base = `${import.meta.env.BASE_URL}audio/`, M = MAN.audio[A.fmt];
  const rj = await fetch(base + M.json); if (!rj.ok) throw new Error('audio index fetch failed'); const idx = await rj.json();
  const r = await fetch(base + M.bin);
  if (!r.ok) throw new Error('audio pack fetch failed');
  const total = +r.headers.get('content-length') || 0;
  let buf;
  if (r.body && r.body.getReader && total) {
    const rd = r.body.getReader(); buf = new Uint8Array(total); let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; buf.set(value, got); got += value.length; onProgress && onProgress(got / total); }
  } else { buf = new Uint8Array(await r.arrayBuffer()); onProgress && onProgress(1); }
  for (const n of ONE_SHOTS) { if (!idx[n]) continue; const [o, l] = idx[n]; A.raw[n] = buf.slice(o, o + l).buffer; }
}

// Must be called synchronously inside the radio-knob tap handler.
export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  A.ctx = new AC({ latencyHint: 'interactive' });
  A.ctx.resume();
  const ctx = A.ctx;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.15;
  const master = ctx.createGain(); master.gain.value = 0.9;
  // v4.5 audio review: brick-wall-ish safety limiter after the glue compressor (the worst-case stack rendered +0.6 dBFS / 18 clipped samples
  // through comp alone in headless Chrome; with this stage it peaks at -2.0 dBFS). Chrome's DynamicsCompressor also adds auto make-up gain, so the trim matters.
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
  const outTrim = ctx.createGain(); outTrim.gain.value = Math.pow(10, -1.5 / 20);
  master.connect(comp); comp.connect(lim); lim.connect(outTrim); outTrim.connect(ctx.destination); A.limiter = lim;
  // v3.2: every non-music bus goes through a gentle lowpass so nothing piercing reaches a phone speaker
  for (const b of ['amb', 'veh', 'sfx', 'music', 'soft']) { const g = ctx.createGain(); // v4.1 'soft': REX's ~3 kHz lowpass for the bright reward sounds
    if (b === 'music') g.connect(master); else { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = b === 'sfx' ? 6000 : b === 'soft' ? 3000 : 4500; lp.Q.value = 0.6; g.connect(lp); lp.connect(master); }
    A.bus[b] = g; }
  A.bus.master = master;
  A.songEl = makeEl(url('MUSIC_Full'));
  const src0 = ctx.createMediaElementSource(A.songEl);
  // v4.2 REX: 'muffle' stage in front of both routes. Open (20 kHz, gain 1) normally; the truck lift closes it to ~650 Hz for a muffled-radio second.
  A.muffleLP = ctx.createBiquadFilter(); A.muffleLP.type = 'lowpass'; A.muffleLP.frequency.value = 20000; A.muffleLP.Q.value = 0.7;
  A.muffleG = ctx.createGain(); A.muffleG.gain.value = 1; A.beamDuck = ctx.createGain(); A.beamDuck.gain.value = 1; src0.connect(A.beamDuck); A.beamDuck.connect(A.muffleLP); A.muffleLP.connect(A.muffleG);
  // v4.4 REX: the new master (CR9_Song_Master_v2, ~-14 LUFS, already EQ'd) sits 2 dB lower to keep the old balance with the effects. v4.5: VO duck stage (-6 dB under each audible line).
  A.songTrim = ctx.createGain(); A.songTrim.gain.value = Math.pow(10, -2 / 20); A.duckG = ctx.createGain(); A.duckG.gain.value = 1;
  // v4.5 review: warp stage (idle = fixed 5 ms delay, inaudible, ~5 ms later than the beat clock; the LFO depth is 0 until songWarp()). Keeps the song bus mono-compatible (same delay on L and R).
  A.warpD = ctx.createDelay(0.1); A.warpD.delayTime.value = 0.005; A.warpLfo = sineLfo(ctx); A.warpAmt = ctx.createGain(); A.warpAmt.gain.value = 0; A.warpLfo.connect(A.warpAmt); A.warpAmt.connect(A.warpD.delayTime); A.warpLfo.start();
  A.muffleG.connect(A.songTrim); A.songTrim.connect(A.duckG); A.duckG.connect(A.warpD); const src = A.warpD;
  // AM radio: band-limited + light grit
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 1.2;
  const ws = ctx.createWaveShaper(); ws.curve = softClip(2.2);
  A.radioGain = ctx.createGain(); A.radioGain.gain.value = 0;
  src.connect(hp); hp.connect(lp); lp.connect(ws); ws.connect(A.radioGain); A.radioGain.connect(A.bus.veh);
  // clean route (with a lowpass we can open up for the victory "slam")
  A.cleanLP = ctx.createBiquadFilter(); A.cleanLP.type = 'lowpass'; A.cleanLP.frequency.value = 18000;
  A.cleanGain = ctx.createGain(); A.cleanGain.gain.value = 0;
  src.connect(A.cleanLP); A.cleanLP.connect(A.cleanGain); A.cleanGain.connect(A.bus.music);
  // pass 3: REX's instrumental stem (GTR_Song_Stem) streams through its own element (DOT: never decoded) -> gain (0 until the beam) -> the muffle stage, so it shares
  // songTrim / VO duck / warp / clean+radio routes with the song. The song alone passes a beam duck (-3 dB while held) before the stem joins it.
  const st = MAN.audio[A.fmt] && MAN.audio[A.fmt].stem; if (st) { A.stemEl = makeEl(`${import.meta.env.BASE_URL}audio/${st}`); A.stemG = ctx.createGain(); A.stemG.gain.value = 0; ctx.createMediaElementSource(A.stemEl).connect(A.stemG); A.stemG.connect(A.muffleLP);
    A.primedStem = A.stemEl.play().then(() => A.stemEl.pause()).catch(() => {}); }
  const p = A.songEl.play();
  A.primed = p && p.then ? p.then(() => A.songEl.pause()).catch(() => {}) : Promise.resolve();
  const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
}
// pass 3: no oscillator nodes anywhere (Daniel). The warp LFO is a looped 1-cycle sine buffer (1 Hz at rate 1) driving the delay time: a control signal, never heard as a tone
function sineLfo(ctx) { const n = ctx.sampleRate, b = ctx.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * i / n); const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; return s; }
function makeEl(src) { const el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.src = src; el.setAttribute('playsinline', ''); return el; }
function softClip(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } return c; }

export async function decodeAll() {
  await Promise.all(Object.keys(A.raw).map(async (n) => {
    try { A.buf[n] = await new Promise((res, rej) => A.ctx.decodeAudioData(A.raw[n], res, rej)); } catch (e) { console.warn('decode failed', n); }
  }));
  A.raw = {}; A.ready = true;
}

// DOM event timestamp -> AudioContext clock as *heard* at the output.
export function eventToAudioTime(ts) {
  const ctx = A.ctx;
  if (ctx.getOutputTimestamp) { const o = ctx.getOutputTimestamp(); if (o && o.performanceTime > 0) return o.contextTime + (ts - o.performanceTime) / 1000; }
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) + (ts - performance.now()) / 1000;
}
export function audibleNow() { return eventToAudioTime(performance.now()); }

export function play(name, o = {}) {
  const ctx = A.ctx, buffer = A.buf[name];
  if (!ctx || !buffer) return null;
  const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = o.rate || 1;
  const g = ctx.createGain(); g.gain.value = o.gain ?? 1;
  let node = g;
  if (o.pan !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); node = p; }
  node.connect(o.dest || A.bus[o.bus || 'sfx']); src.connect(g);
  if (o.loop) { src.loop = true; const L = LOOP_LEN[name]; // v4.5 review: Chrome trims LAME padding on decode, so the old fixed 0.05 s trim cut 100 ms of real audio per cycle
    if (L) { const len = L[0] / L[1], extra = buffer.duration - len; if (extra > 0.0005) { const lead = Math.min(LAME_LEAD / L[1], extra); src.loopStart = lead; src.loopEnd = lead + len; } } }
  const when = Math.max(o.when ?? 0, 0);
  if (o.duration) src.start(when, o.offset || 0, o.duration); else src.start(when, o.offset || 0);
  const h = { src, g, name, loop: !!o.loop, stop(t = 0, fade = 0.05) {
    try { const at = Math.max(t, ctx.currentTime); g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, fade / 3); src.stop(at + fade + 0.05); } catch (e) {}
    A.loops.delete(h); } };
  if (o.loop) A.loops.add(h);
  else {
    A.voices.push(h);
    src.onended = () => { const i = A.voices.indexOf(h); if (i >= 0) A.voices.splice(i, 1); };
    if (A.voices.length > MAX_VOICES) A.voices.shift().stop();
  }
  return h;
}
export const pick = (base, n) => `${base}_0${1 + Math.floor(Math.random() * n)}`;
export function ramp(param, v, t, tc) { if (!A.ctx) return; const at = Math.max(t ?? A.ctx.currentTime, A.ctx.currentTime); param.cancelScheduledValues(at); param.setTargetAtTime(v, at, tc); }

export async function seekAndPlay(el, t) {
  if (A.primed) await A.primed;
  const go = () => { try { el.currentTime = t; } catch (e) {} const p = el.play(); if (p && p.catch) p.catch(() => {}); if (el === A.songEl) stemResync(t); };
  if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, { once: true });
}
export function stopAll() {
  for (const h of [...A.loops]) h.stop();
  for (const h of [...A.voices]) h.stop();
  A.voices.length = 0;
  if (A.songEl) A.songEl.pause(); if (A.stemEl) { A.stemEl.pause(); if (A.stemG) A.stemG.gain.value = 0; }
  if (A.radioGain) { ramp(A.radioGain.gain, 0, null, 0.02); ramp(A.cleanGain.gain, 0, null, 0.02); }
}

// Song clock: maps AudioContext time <-> song seconds using the streamed element, smoothed so beats don't jitter.
// truck lift: song through ~650 Hz and down ~2 dB (≈ -4 LU with the lowpass); on the drop it snaps back to full INSTANTLY with a tiny volume punch
export function songMuffle(on) {
  const c = A.ctx; if (!c || !A.muffleLP) return; const t = c.currentTime, f = A.muffleLP.frequency, g = A.muffleG.gain;
  f.cancelScheduledValues(t); g.cancelScheduledValues(t);
  if (on) { f.setValueAtTime(f.value, t); f.exponentialRampToValueAtTime(650, t + 0.12); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.8, t + 0.12); }
  else { f.setValueAtTime(20000, t); g.setValueAtTime(1.18, t); g.setTargetAtTime(1, t + 0.06, 0.08); }
}
// v4.5 review: LAST TRUCK radio warp, done live on the song bus: a wow/flutter pitch wobble from an LFO-modulated DelayNode (no element
// playbackRate, so the Song clock and beat sync are untouched) plus a low-pass dip on the muffle stage. dur s; depth = pitch swing (0.03 ~ +/-50 cents).
export function songWarp(dur = 1.5, depth = 0.03) {
  const c = A.ctx; if (!c || !A.warpD) return; const t = c.currentTime, f = A.muffleLP.frequency, hz = 3.5, amp = depth / (2 * Math.PI * hz);
  A.warpLfo.playbackRate.setValueAtTime(hz, t); A.warpAmt.gain.cancelScheduledValues(t); A.warpAmt.gain.setValueAtTime(0, t); A.warpAmt.gain.linearRampToValueAtTime(amp, t + 0.15); A.warpAmt.gain.setValueAtTime(amp, t + dur - 0.3); A.warpAmt.gain.linearRampToValueAtTime(0, t + dur);
  if (A.muffleG.gain.value < 0.95) return; // pass-2 review: a truck lift/grab owns the muffle filter (650 Hz); the wobble still plays, the LP dip would re-open it early
  f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.exponentialRampToValueAtTime(1200, t + 0.25); f.setValueAtTime(1200, t + dur - 0.4); f.exponentialRampToValueAtTime(20000, t + dur);
}
export function songDuck(on) { const c = A.ctx; if (!c || !A.duckG) return; const t = c.currentTime, g = A.duckG.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(on ? 0.5 : 1, t, on ? 0.04 : 0.15); }
export const Song = {
  off: null, // ctxTime - songTime
  update() {
    const el = A.songEl; if (!el || el.paused || el.readyState < 2) return;
    const o = A.ctx.currentTime - el.currentTime;
    if (this.off === null || Math.abs(o - this.off) > 0.25) this.off = o; else this.off += (o - this.off) * 0.05;
  },
  reset() { this.off = null; },
  at(ctxT) { return this.off === null ? (A.songEl ? A.songEl.currentTime : 0) : ctxT - this.off; },
  heard() { return this.at(audibleNow()); },
};

// v4: the synthesized engine is gone; the truck is REX's AMB_Truck_Drive_Loop on the veh bus (see main.js engineLevel).

// ---------- pass 3: guitar stem sync + beam gain ----------
// started with the song and re-seeked to the song's time on every song seek; stemSync() (every ~500 ms) nudges it back if it drifts > 30 ms
export const STEM = { CHECK_MS: 250, MAX_DRIFT: 0.02, ATTACK: 0.04, RELEASE: 0.15, LOUD: 0.9, DUCK: 0.708, held: false, blocked: 0, drift: [], fixes: 0, last: 0 };
function stemResync(t) { const s = A.stemEl; if (!s) return; s.playbackRate = A.songEl ? A.songEl.playbackRate : 1; const go = () => { try { s.currentTime = t ?? A.songEl.currentTime; } catch (e) {} const p = s.play(); if (p && p.catch) p.catch(() => {}); STEM.resyncs = (STEM.resyncs || 0) + 1; }; if (s.readyState >= 1) go(); else s.addEventListener('loadedmetadata', go, { once: true }); }
export function stemSync(now) { const s = A.stemEl, el = A.songEl; if (!s || !el || now - STEM.last < STEM.CHECK_MS) return; STEM.last = now;
  if (el.paused) { if (!s.paused) s.pause(); return; } if (s.paused && s.readyState >= 1) return stemResync(el.currentTime); if (s.seeking || el.seeking || s.readyState < 2) return;
  const d = s.currentTime - el.currentTime; STEM.drift.push(Math.round(d * 1000)); if (STEM.drift.length > 400) STEM.drift.shift(); if (Math.abs(d) > STEM.MAX_DRIFT) { if (STEM.held || A.stemG.gain.value > 0.0005) { STEM.blocked++; return; } STEM.fixes++; try { s.currentTime = el.currentTime; } catch (e) {} } } // REX: never jump while audible
export function stemBeam(on) { if (!A.stemG || !A.ctx) return false; STEM.held = !!on; const t = A.ctx.currentTime, dur = on ? STEM.ATTACK : STEM.RELEASE;
  for (const [g, v] of [[A.stemG.gain, on ? STEM.LOUD : 0], [A.beamDuck.gain, on ? STEM.DUCK : 1]]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + dur); } return true; } // 0 -> 0.9 in 40 ms, -> 0 in 150 ms; song -3 dB while held
export const hasStem = () => !!A.stemEl;
