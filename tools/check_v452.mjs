// v4.5.2 functional checks in headless Chrome against a local dist/ (run from cr9-perftest for playwright): version.json, title, art retry, kmQ double morph, first-cow memory, forced bald, wave-4 OHNO, HYPER-line wait.
import { createRequire } from 'module'; const require = createRequire('/workspace/cr9-perftest/'); const { chromium } = require('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve(process.argv[2] || 'dist'); let failArt = 0;
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/index.html'; if (!path.extname(p) && fs.existsSync(path.join(root, p + '.html'))) p += '.html'; /* vercel cleanUrls */ const f = path.join(root, p);
  if (/\/art\/sky|bg_sky/.test(p) && failArt > 0) { failArt--; r.writeHead(503); return r.end(); } // first N art loads of the sky fail
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } const ext = path.extname(f); r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' }[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(r); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const res = {}; const ok = (k, v) => { res[k] = v; console.log(v ? 'PASS' : 'FAIL', k); };
const ready = (pg) => pg.waitForFunction(() => window.__cr9 && window.__cr9.S.ready, null, { timeout: 90000 });
{ const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const pg = await ctx.newPage(); failArt = 2; await pg.goto(base); await ready(pg);
  ok('title', (await pg.title()) === 'County Road 9 · Missing Time v4.5.2'); ok('art retry after 2 failures', failArt === 0);
  const v = await pg.evaluate(async () => (await (await fetch('/version.json', { cache: 'no-store' })).json()).v); ok('version.json 4.5.2', v === '4.5.2');
  ok('meta no-cache', await pg.evaluate(() => !!document.querySelector('meta[http-equiv="Cache-Control"]')));
  // stale build: serve a newer version.json -> page must reload
  await pg.route('**/version.json*', (rt) => rt.fulfill({ contentType: 'application/json', body: '{"v":"9.9.9"}' }));
  const nav = pg.waitForEvent('framenavigated', { timeout: 8000 }).then(() => true).catch(() => false);
  await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  ok('stale build reloads', await nav); await ctx.close(); }
{ const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const pg = await ctx.newPage(); failArt = 99; await pg.goto(base); await pg.waitForFunction(() => /Tap to reload/.test(document.getElementById('startText').textContent), null, { timeout: 60000 }).catch(() => {});
  ok('art fail -> tappable message', /Tap to reload/.test(await pg.textContent('#startText'))); failArt = 0;
  const nav = pg.waitForEvent('framenavigated', { timeout: 8000 }).then(() => true).catch(() => false); await pg.dispatchEvent('#titleCard', 'pointerup'); ok('tap reloads', await nav); await ctx.close(); }
{ const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=1&story=0&noboard=1'); await ready(pg);
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight, null, { timeout: 60000 });
  const first = await pg.evaluate(() => localStorage.getItem('cr9_first_cow'));
  // queue two kill morphs at once (what a HYPER double kill does) and watch both cows land
  const r = await pg.evaluate(async () => { const { S } = window.__cr9; S.cowPopsShown = 0; const g = window.__cr9.GR[0]; S.kmQ.push({ x: -100, y: 0, fr: 120, cow: { type: 'holstein', bald: null }, g }, { x: 100, y: 0, fr: 120, cow: { type: 'highland', bald: null }, g });
    await new Promise((r) => setTimeout(r, 9000)); return { shown: S.cowPopsShown, q: S.kmQ.length + (S.popQ || []).length, morphs: S.killMorphs }; });
  ok(`both queued morph cows appear (${JSON.stringify(r)})`, r.shown >= 2 && r.q === 0);
  const t = await pg.evaluate(async () => { const { S, t452 } = window.__cr9; const o = {};
    // first cow differs from the stored previous-run first cow (20 simulated runs)
    let diff = 0; for (let i = 0; i < 20; i++) { const prev = localStorage.getItem('cr9_first_cow'); S.cowsPicked = 0; S.baldSeen = true; const c = t452.pickCow(false); if (!prev || c.type !== prev) diff++; } o.firstDiff = diff;
    // bald forced by wave 3 without HYPER
    S.baldSeen = false; S.fight.wave = 1; o.w2 = !!t452.pickCow(false).bald; S.fight.wave = 2; o.w3 = !!t452.pickCow(false).bald; o.after = !!t452.pickCow(false).bald;
    // HYPER line then a wave intro: the wave line must wait
    S.voCur = null; S.voQ = []; t452.sayBank('SHRED_HIT', null, true); await new Promise((r) => setTimeout(r, 100)); o.hyperSlot = S.voCur && S.voCur.slot;
    t452.sayNow(t452.voPick('WAVE', 1), 'wave'); o.stillHyper = S.voCur && S.voCur.slot; o.queued = S.voQ.length;
    const hy = S.voCur.until; let seen = null; for (let i = 0; i < 80 && !seen; i++) { await new Promise((r) => setTimeout(r, 50)); if (S.voCur && S.voCur.kind === 'wave') seen = performance.now() - hy; } o.thenWave = seen != null ? 'wave' : null; o.waveStartVsHyperEnd = seen && Math.round(seen); o.log = S.voLog.slice(-3);
    // wave-4 entrance OHNO once per run
    S.grabGrace = performance.now() + 1e9; S.liftCool = 1e9; S.voCur = null; S.voQ = []; S.w4LineAt = 0; const n0 = S.ohnos; S.ohnoW4 = false; S.fight.wave = 2; t452.nextWave(); const n1 = S.ohnos; const vo0 = S.voCur && S.voCur.kind; const endAt = S.ohnoEndAt;
    for (let i = 0; i < 120 && !S.w4LineAt; i++) await new Promise((r) => setTimeout(r, 50)); o.w4 = { voDuringOhno: vo0 || null, gapMs: S.w4LineAt ? Math.round(S.w4LineAt - endAt) : null, delay: S.w4LineDelay, kind: S.voCur && S.voCur.kind };
    S.fight.wave = 2; t452.nextWave(); o.ohno = [n1 - n0, S.ohnos - n1, S.ohnoW4At]; return o; });
  console.log(JSON.stringify(t));
  ok('first cow != previous run first cow (20/20)', t.firstDiff === 20); ok('bald forced by wave 3', !t.w2 && t.w3 && !t.after);
  ok('wave intro waits for HYPER line', t.hyperSlot === 'VO_SHRED_HIT' && t.stillHyper === 'VO_SHRED_HIT' && t.queued === 1 && t.thenWave === 'wave');
  ok('wave-4 OHNO once per run', t.ohno[0] === 1 && t.ohno[1] === 0);
  ok(`wave-4 intro starts ~250 ms after OHNO ends, no overlap (${JSON.stringify(t.w4)})`, !t.w4.voDuringOhno && t.w4.gapMs >= 240 && t.w4.gapMs <= 400 && t.w4.kind === 'wave'); await ctx.close(); }
{ // keyboard: Enter starts, arrows move the reticle, Space holds the beam, Space taps break free, S = SHRED, Enter = PLAY AGAIN; touch still works
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const pg = await ctx.newPage(); await pg.goto(base + '?story=0&noboard=1&nograb=1&embed=1'); await ready(pg);
  await pg.keyboard.press('Enter'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight, null, { timeout: 60000 }); ok('Enter on title starts', true);
  await pg.waitForFunction(() => window.__cr9.S.fight.ships.some((s) => s.alive && s.Z < 26), null, { timeout: 30000 });
  await pg.keyboard.press('ArrowRight'); const f0 = await pg.evaluate(() => window.__cr9.S.finger.slice()); await pg.keyboard.down('ArrowLeft'); await pg.waitForTimeout(400); await pg.keyboard.up('ArrowLeft');
  const f1 = await pg.evaluate(() => window.__cr9.S.finger.slice()); const scrollY = await pg.evaluate(() => scrollY);
  ok(`arrows move the reticle (${Math.round(f0[0])} -> ${Math.round(f1[0])}), page not scrolled`, f1[0] < f0[0] - 50 && scrollY === 0);
  // steer onto the target with the arrows (like a drag), hold Space until a kill
  await pg.keyboard.down(' '); let killed = false; const t0 = Date.now();
  while (Date.now() - t0 < 25000 && !killed) { const d = await pg.evaluate(() => { const t = window.__cr9.input.target(), f = window.__cr9.S.finger; return t ? [t[0] - f[0], t[1] - f[1]] : [0, 0]; });
    const keys = []; if (d[0] < -12) keys.push('ArrowLeft'); if (d[0] > 12) keys.push('ArrowRight'); if (d[1] < -12) keys.push('ArrowUp'); if (d[1] > 12) keys.push('ArrowDown');
    for (const k of keys) await pg.keyboard.down(k); await pg.waitForTimeout(60); for (const k of keys) await pg.keyboard.up(k); killed = await pg.evaluate(() => window.__cr9.S.kills > 0); }
  const hb = await pg.evaluate(() => ({ hold: window.__cr9.S.hold, pid: window.__cr9.S.pid, beams: window.__cr9.S.keyBeams })); await pg.keyboard.up(' ');
  ok(`Space hold beams a gray to a kill (${JSON.stringify(hb)})`, killed && hb.beams >= 1); ok('Space up releases the beam', !(await pg.evaluate(() => window.__cr9.S.hold)));
  const sh = await pg.evaluate(() => { const { S } = window.__cr9; S.shred = 100; S.hyper = null; document.getElementById('shredBtn').classList.remove('hidden'); return S.hypers; }); await pg.keyboard.press('s');
  ok('S fires SHRED', (await pg.evaluate(() => window.__cr9.S.hypers)) === sh + 1);
  const gt = await pg.evaluate(() => { const { S } = window.__cr9; S.grab = { t: 0, taps: 0, lethal: false, k: 0, free: false, sh: S.fight.ships[0] }; return S.grabTaps || 0; }); await pg.keyboard.press(' '); await pg.keyboard.press(' ');
  ok('Space taps break-free taps when grabbed', (await pg.evaluate(() => window.__cr9.S.grabTaps)) === gt + 2); await pg.evaluate(() => { window.__cr9.S.grab = null; });
  // touch path untouched: a pointer hold still beams
  await pg.mouse.move(640, 300); await pg.mouse.down(); const ph = await pg.evaluate(() => [window.__cr9.S.hold, window.__cr9.S.pid]); await pg.mouse.up(); ok(`pointer hold still beams (${ph})`, ph[0] === true && ph[1] !== 'kb');
  // end card: Enter = PLAY AGAIN; Enter in the name box only submits
  await pg.evaluate(() => { const { S } = window.__cr9; S.state = 'end'; S.missSkippable = false; document.getElementById('endCard').classList.remove('hidden'); S.runs0 = S.runT0; });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(300); ok('Enter on end card = PLAY AGAIN', await pg.evaluate(() => window.__cr9.S.state === 'run' && window.__cr9.S.runT0 !== window.__cr9.S.runs0));
  await pg.evaluate(() => { const { S } = window.__cr9; S.state = 'name'; document.getElementById('nameScreen').classList.remove('hidden'); document.getElementById('endCard').classList.remove('hidden'); S.runs0 = S.runT0; });
  await pg.keyboard.type('TESTKB'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  ok('Enter in name box does not restart', await pg.evaluate(() => window.__cr9.S.runT0 === window.__cr9.S.runs0)); await ctx.close(); }
{ // title card HOW TO PLAY link + the page
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }); const pg = await ctx.newPage(); await pg.goto(base); await ready(pg);
  ok('title has HOW TO PLAY link to /how-to-play', (await pg.getAttribute('#howBtn', 'href')) === '/how-to-play');
  await pg.tap('#howBtn'); await pg.waitForURL(/how-to-play/, { timeout: 8000 }).catch(() => {}); ok('tapping it opens /how-to-play (game not started)', /how-to-play/.test(pg.url()));
  const txt = await pg.textContent('main'); ok('page has REX line', txt.includes('Turn your sound up. The music is your weapon, and the cows talk back.'));
  ok('page has story closer + collapsed scoring details', txt.includes("You're not killing them. You're saving them.") && txt.includes('25 years') && (await pg.evaluate(() => { const d = document.querySelector('details'); return !!d && !d.open && d.textContent.includes('1,185'); })));
  ok('page has PLAY NOW -> /', (await pg.getAttribute('a.play', 'href')) === '/'); ok('page fits phone width', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pg.screenshot({ path: 'shots/v452_howtoplay_phone.png', fullPage: true }); await pg.setViewportSize({ width: 1280, height: 800 }); await pg.screenshot({ path: 'shots/v452_howtoplay_desktop.png', fullPage: true });
  await pg.click('a.play'); await pg.waitForURL((u) => u.pathname === '/desktop.html', { timeout: 8000 }).catch(() => {}); ok('PLAY NOW returns to the game (desktop-size window -> letterboxed frame)', !!(await pg.$('#game'))); await pg.setViewportSize({ width: 412, height: 915 }); await pg.goto(base + 'how-to-play'); await pg.click('a.play'); await pg.waitForURL((u) => u.pathname === '/', { timeout: 8000 }); ok('PLAY NOW returns to the game (phone)', !!(await pg.$('#titleCard'))); await ctx.close(); }
{ // desktop letterbox: a wide window redirects to /desktop.html with the game in a centred phone-shaped frame; keys reach the game
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }); const pg = await ctx.newPage(); await pg.goto(base + '?story=0&noboard=1&nograb=1');
  await pg.waitForURL(/desktop\.html/, { timeout: 10000 }).catch(() => {}); const fr = await pg.$('#game'); const box = fr && (await fr.boundingBox());
  ok(`wide window letterboxed (${box && [Math.round(box.x), Math.round(box.width), Math.round(box.height)]})`, /desktop\.html/.test(pg.url()) && box && Math.abs(box.width - 1080 * 9 / 19.5) < 2 && Math.abs(box.x + box.width / 2 - 960) < 2);
  const g = await fr.contentFrame(); await g.waitForFunction(() => window.__cr9 && window.__cr9.S.ready, null, { timeout: 90000 }); await pg.waitForTimeout(300);
  await pg.keyboard.press('Enter'); const st = await g.waitForFunction(() => window.__cr9.S.state === 'run', null, { timeout: 30000 }).then(() => true).catch(() => false); ok('Enter in the desktop frame starts the game', st);
  await pg.screenshot({ path: 'shots/v452_desktop_1920x1080_frame_play.png' }); await ctx.close();
  const c2 = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }); const p2 = await c2.newPage(); await p2.goto(base); await ready(p2); ok('phone is NOT redirected', !/desktop/.test(p2.url())); await c2.close(); }
// ===== pass 2 checks: no reaction words, procedural gray/cow animation frame counts, strums replace the zap, win name sheet 5.3 s, abduction audio beat, budgets =====
{ const dist = path.join(root, 'assets'); const js = fs.readdirSync(dist).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dist, f), 'utf8')).join('');
  ok('no floating reaction words in the bundle (FLINCH!/BUG-EYED!/DRIP!/AAAAH!/POP!)', !/FLINCH!|BUG-EYED!|DRIP!|AAAAH!|'POP!'/.test(js));
  const crypto = await import('crypto'); const md5 = (b) => crypto.createHash('md5').update(b).digest('hex'); let mdOK = 0, mdN = 0;
  for (const fmt of ['ogg', 'mp3']) { const aud = path.join(root, 'audio'); const jf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.json')), bf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.bin'));
    const idx = JSON.parse(fs.readFileSync(path.join(aud, jf))), bin = fs.readFileSync(path.join(aud, bf));
    for (const n of ['GTR_Strum_01', 'GTR_Strum_02', 'GTR_Strum_03', 'GTR_Strum_04', 'GTR_Strum_05', 'GTR_Strum_06', 'GTR_Kill_Chord', 'GTR_Beam_Strum_Loop']) { mdN++; const e = idx[n]; if (!e) continue;
      if (md5(bin.subarray(e[0], e[0] + e[1])) === md5(fs.readFileSync(`/workspace/cr9_strums/${n}.${fmt}`))) mdOK++; } }
  ok(`REX strums in both packs, md5 match (${mdOK}/${mdN})`, mdOK === mdN); }
{ const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, recordVideo: { dir: 'shots/_vid', size: { width: 412, height: 915 } } }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=1&story=0&noboard=1&nograb=1'); await ready(pg);
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight && window.__cr9.S.fight.ships.some((s) => s.alive && s.Z < 20), null, { timeout: 60000 });
  { const s0 = await pg.evaluate(() => window.__cr9.S.strums || 0); await pg.keyboard.down(' '); await pg.waitForTimeout(2200); await pg.evaluate((s0) => { window.__strumN = (window.__cr9.S.strums || 0) - s0; window.__zap = !!window.__cr9.S.beamLoop; }, s0); await pg.keyboard.up(' '); }
  const r = await pg.evaluate(async () => { const { S, p2, P } = window.__cr9, o = {}; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    o.hasStrums = p2.hasStrums(); o.strumsOnPress = window.__strumN; o.zapLoop = window.__zap; S.rxF = {}; S.dripsMax = 0;
    const sh = S.fight.ships.find((s) => s.alive); const g = sh.g; o.popBefore = document.getElementById('pop').textContent;
    // drive the lock reaction by hand: keep the gray 'seen' by the beam, step the stages 1-4, then kill it
    let peak = 0, ts = []; const loop = (ms) => new Promise((res) => { const t0 = performance.now(); const f = (t) => { g.rx.seen = performance.now(); peak = Math.max(peak, P.count); ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    sh.man.kind = 'hover'; sh.man.dur = 99; await wait(400); S.rxF = {}; await loop(700); o.lockFrames = [...(S.rxF.lock || [])].sort((a, b) => a - b);
    let wobPk = 0; const pk = (ms) => new Promise((res) => { const t0 = performance.now(); const f = () => { g.rx.seen = performance.now(); wobPk = Math.max(wobPk, Math.abs(g.mat.uniforms.uWob.value)); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    for (const st of [1, 2, 3, 4]) { p2.lockStage(sh, st); sh.L = st + 0.1; if (st === 2) { await pk(450); o.wob = wobPk; } else await loop(450);  if (st === 4) { o.droop = g.mat.uniforms.uDroop.value; o.jaw = g.mat.uniforms.uJaw.value; o.bulge = g.mat.uniforms.uBulge.value; } }
    o.popText = document.getElementById('pop').classList.contains('go') ? document.getElementById('pop').textContent : '';
    const mt = []; S.rxF.melt = new Set(); S.rxF.pop = new Set(); S.wisps = 0; p2.kill(sh); let gone = false; const gw = () => { if (!g.face.visible) gone = true; if (!gone) requestAnimationFrame(gw); }; requestAnimationFrame(gw); const rec = (ms) => new Promise((res) => { const t0 = performance.now(); const f = (t) => { mt.push(t); peak = Math.max(peak, P.count); if (t - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); await rec(2600);
    o.meltFrames = [...(S.rxF.melt || [])].sort((a, b) => a - b); o.popFrames = [...(S.rxF.pop || [])].sort((a, b) => a - b); o.wisps = S.wisps || 0; o.drips = S.dripsMax; o.dripsTotal = (S.dripsSpawned || 0); o.peakParticles = peak; o.faceGone = gone;
    let lo = Infinity; for (let i = 1, j = 0; i < mt.length; i++) { while (mt[i] - mt[j + 1] >= 500) j++; const sp = mt[i] - mt[j]; if (sp >= 500) lo = Math.min(lo, (i - j) * 1000 / sp); } o.meltMinFps = Math.round(lo);
    const c = window.__cr9.W.cowPop; o.cowFly = c.frames ? [...c.frames.fly].sort((a, b) => a - b) : null; o.cowLand = c.frames ? [...c.frames.land].sort((a, b) => a - b) : null; o.chordFiles = S.chordFiles || 0; o.stats = window.__cr9.stats;
    o.texMB = +(Object.values(window.__cr9.G.tex || {}).reduce((m, t) => { const im = t && t.image; return m + (im && im.width ? im.width * im.height * 4 * (t.generateMipmaps === false ? 1 : 1.33) : 0); }, 0) / 1048576).toFixed(1);
    return o; });
  console.log(JSON.stringify(r));
  if (JSON.parse(fs.readFileSync('src/manifest.json', 'utf8')).audio.ogg.stem) ok('pass 3: the stem replaces the strums (no strums on press, no zap loop)', r.strumsOnPress === 0 && !r.zapLoop); else ok('strums replace the zap (1 strum on press, more on the beat, no zap loop)', r.hasStrums && r.strumsOnPress >= 2 && !r.zapLoop);
  ok('kill plays GTR_Kill_Chord', r.chordFiles >= 1);
  ok(`gray lock reaction = 6 frames @12fps (${r.lockFrames})`, r.lockFrames.join() === '0,1,2,3,4,5');
  ok('lock stages animate the face (wobble, droop, jaw, wide eyes), no word', r.wob > 0.2 && r.droop > 0.2 && r.jaw > 0.3 && r.bulge > 0.4 && !r.popText);
  ok(`gray melt = 8 frames (${r.meltFrames}), pop = 6 frames (${r.popFrames}), soul wisp`, r.meltFrames.join() === '0,1,2,3,4,5,6,7' && r.popFrames.join() === '0,1,2,3,4,5' && r.wisps >= 1 && r.faceGone);
  ok(`drips run down from the particle pool, <=100 per gray (${r.drips})`, r.drips > 10 && r.drips <= 100);
  ok(`peak particles < 350 (${r.peakParticles})`, r.peakParticles < 350);
  ok(`cow beamed flight 5 frames (${r.cowFly}), landing 4 frames (${r.cowLand})`, r.cowFly && r.cowFly.length >= 5 && r.cowLand.join() === '0,1,2,3');
  ok(`draw calls < 45 (${r.stats && r.stats.draws})`, r.stats && r.stats.draws < 45);
  ok(`textures < 64 MB (${r.texMB} MB est)`, r.texMB < 64);
  console.log(`melt min fps (headless swiftshader, not a phone): ${r.meltMinFps}`);
  await pg.screenshot({ path: 'shots/p2_after_melt_cow.png' }); const vp = await pg.video().path(); await ctx.close(); fs.renameSync(vp, 'shots/p2_melt_cow.webm'); console.log('clip shots/p2_melt_cow.webm'); }
{ // win: name sheet 5.3 s after FINALE
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=parade&story=0'); await ready(pg);
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'parade', null, { timeout: 60000 });
  const w = await pg.evaluate(async () => { const { S } = window.__cr9; let at5 = null, at8 = null, duck = false; for (let i = 0; i < 600 && S.state === 'parade'; i++) { await new Promise((r) => setTimeout(r, 25)); if (S.paradeT > 5.4 && at5 == null) at5 = S.state; if (S.paradeT > 6.5 && S.paradeT < 8.4) duck = duck || !!S.sfxDucked; if (S.paradeT > 8.4 && at8 == null) at8 = S.state; } return { at5, at8, duck, opened: S.state, t: S.paradeT }; });
  ok(`name sheet held to 8.6 s after FINALE so 'You were supposed to yell that' plays (${JSON.stringify(w)})`, w.at5 === 'parade' && w.at8 === 'parade' && w.opened === 'name' && w.t >= 8.6 && w.t < 8.75 && w.duck); await ctx.close(); }
{ // abduction loss: song from 94.4 s, muffle -> open, Kill_Chord on 'Oh no!' (3.5 s), giggle after its tail (5.7 s)
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=1&story=0&noboard=1&nograb=1'); await ready(pg);
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight, null, { timeout: 60000 });
  const m = await pg.evaluate(async () => { const { S, A, p2 } = window.__cr9; p2.abducted(); const o = {}; await new Promise((r) => setTimeout(r, 1000)); o.muffled = A.muffleLP.frequency.value < 2000; o.songT = A.songEl.currentTime;
    await new Promise((r) => setTimeout(r, 6600)); return Object.assign(o, { pop: S.againPopAt, songEnd: A.songEl.currentTime, open: S.missOpenAt, chord: S.missChordAt, chordSong: S.missChordSong, gig: S.giggleAt, giggles: S.giggles || 0, fOpen: A.muffleLP.frequency.value }); });
  console.log(JSON.stringify(m)); ok('MISSING TIME song starts at ~94.4 s under the muffle', m.muffled && m.songT > 95.2 && m.songT < 95.7 /* pass 3: the song now starts WITH the cut scene, so 1 s in = ~95.4 */);
  ok('song opens up ~1 s in', Math.abs(m.open - 1000) < 150 && m.fOpen > 15000); ok(`Kill_Chord on 'Oh no!' 3.5 s in (song ${m.chordSong && m.chordSong.toFixed(2)} s)`, Math.abs(m.chord - 3500) < 150 && Math.abs(m.chordSong - 97.9) < 0.35);
  ok(`giggle after his line (~7.0 s, ${m.gig && Math.round(m.gig)} ms)`, m.giggles === 1 && Math.abs(m.gig - 7000) < 200); ok(`PLAY AGAIN pops on the last word (song 100.3 s = ~5.9 s, ${m.pop && Math.round(m.pop)} ms); song ran to ${m.songEnd && m.songEnd.toFixed(1)} s`, Math.abs(m.pop - 5900) < 200 && m.songEnd > 100.8); await pg.screenshot({ path: 'shots/p2_missing_time.png' }); await ctx.close(); }
// ===== pass 3 checks: touch pad aiming, Chico difficulty, banner after landing, abduction skip, landing FX, REX video SFX + loops, budgets =====
const P3 = {}; const PTR = `window.__ptr = (type, x, y, id = 7) => { const el = document.elementFromPoint(x, y) || document.body; el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); }; window.__raf = () => new Promise((r) => requestAnimationFrame(() => r()));`;
{ const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=1&story=0&noboard=1&nograb=1'); await ready(pg);
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight && window.__cr9.S.fight.ships.some((s) => s.alive && s.Z < 26), null, { timeout: 60000 }); await pg.addScriptTag({ content: PTR });
  const r = await pg.evaluate(async () => { const { S, p3 } = window.__cr9, o = {}, H = innerHeight, top = p3.padTop(); const fy = []; o.gain = p3.PAD_GAIN; o.padTop = top;
    o.touchAction = getComputedStyle(document.getElementById('pad')).touchAction;
    __ptr('pointerdown', 206, 400, 3); await __raf(); o.skyTouchBeams = S.hold; if (S.hold) __ptr('pointerup', 206, 400, 3);
    S.padLatMax = 0; S.padRetStale = true; __ptr('pointerdown', 150, H - 80); await __raf(); o.holdOnPad = S.hold && !!S.pad; const r0 = S.ret.slice(); o.lineVis = !document.getElementById('padLine').classList.contains('hidden');
    let x = 150; for (let i = 0; i < 20; i++) { x += 3; __ptr('pointermove', x, H - 80); fy.push(S.finger[1]); await __raf(); } // slow: 60 px at ~0.2 px/ms
    o.slow = (S.ret[0] - r0[0]) / 60; o.latMax = Math.round(S.padLatMax);
    const r1 = S.ret.slice(); for (let i = 0; i < 3; i++) { x -= 20; __ptr('pointermove', x, H - 80); fy.push(S.finger[1]); await new Promise((r) => setTimeout(r, 8)); } await __raf(); o.fast = (r1[0] - S.ret[0]) / 60; // flick: 60 px at ~2.5 px/ms
    let y = H - 60; for (let i = 0; i < 30; i++) { y -= 4; __ptr('pointermove', x, y); fy.push(S.finger[1]); await __raf(); } o.clampY = S.ret[1]; o.minY = Math.round(H * 0.06); // push past the top: clamped
    for (let i = 0; i < 40; i++) { x += 12; __ptr('pointermove', Math.min(x, 411), H - 80); await __raf(); } o.clampX = S.ret[0];
    o.fingerYmin = Math.min(...fy); o.fingerInStrip = fy.every((v) => v >= top - 0.5 && v <= H); o.lines = document.querySelectorAll('#padLine').length;
    await new Promise((r) => setTimeout(r, 200)); o.aimMatches = Math.abs(window.__cr9.G.camera ? 1 : 1); __ptr('pointerup', x, H - 80); await __raf(); o.released = !S.hold; o.stats = window.__cr9.stats; return o; });
  console.log(JSON.stringify(r)); P3.pad = r;
  ok(`pad: touch-action none on the pad (${r.touchAction})`, r.touchAction === 'none'); ok('pad: a touch in the sky does not fire the beam', !r.skyTouchBeams); ok('pad: touching the strip starts the beam, lifting releases it', r.holdOnPad && r.released);
  ok(`pad: slow drag gain = ${r.gain}x (${r.slow.toFixed(2)})`, Math.abs(r.slow - r.gain) < 0.08); ok(`pad: fast flick slight accel, <= 3x (${r.fast.toFixed(2)})`, r.fast > r.slow + 0.1 && r.fast <= r.gain * 1.2 + 0.01);
  ok(`pad: touch -> crosshair latency < 50 ms (max ${r.latMax} ms)`, r.latMax < 50); ok(`pad: finger y stays in the bottom strip (min ${Math.round(r.fingerYmin)} >= ${Math.round(r.padTop)})`, r.fingerInStrip);
  ok(`pad: crosshair clamped to the play area (y ${Math.round(r.clampY)} >= ${r.minY}, x ${Math.round(r.clampX)} <= 400)`, r.clampY >= r.minY - 0.5 && r.clampX <= 412 - 12 + 0.5); ok('pad: ONE finger->crosshair line element (DOM, 0 draw calls)', r.lines === 1 && r.lineVis);
  // tap to break free still works with a touch anywhere
  const gt = await pg.evaluate(async () => { const { S } = window.__cr9; S.grab = { t: 0, taps: 0, lethal: false, k: 0, free: false, sh: S.fight.ships[0] }; const n = S.grabTaps || 0; __ptr('pointerdown', 206, 300, 9); __ptr('pointerup', 206, 300, 9); __ptr('pointerdown', 206, 860, 9); __ptr('pointerup', 206, 860, 9); const d = S.grabTaps - n; S.grab = null; return d; }); ok(`pad: tap-to-break-free still counts taps (${gt})`, gt === 2);
  await pg.evaluate(async () => { __ptr('pointerdown', 206, innerHeight - 90, 11); for (let i = 0; i < 10; i++) { __ptr('pointermove', 206 + i * 6, innerHeight - 90 - i * 3, 11); await __raf(); } }); await pg.screenshot({ path: 'shots/p3_touchpad_aim.png' }); await pg.evaluate(() => __ptr('pointerup', 266, innerHeight - 120, 11));
  // Chico (pass 3b): MID-SKILL thumb = 260 ms reaction, corrections every 90 ms at 45% of the error (15% chance of a 1.3x overshoot), 5 px tremor.
  // Measures: from a 220 px miss in WAVE 3 rules (75% radius, jink), does the beam stay on the ship ALL THE WAY to the kill (5 s) on the first try? Target ~60% (50-70%).
  const sim = await pg.evaluate(async () => { const { S, p3 } = window.__cr9; const rn = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2; let ok = 0, n = 0, acq = 0; const log = [];
    S.fight.wave = 2; S.grabGrace = performance.now() + 1e9; S.liftCool = 1e12;
    for (let tr = 0; tr < (window.__TR || 24); tr++) { let sh = null; for (let k = 0; k < 100 && !sh; k++) { sh = S.fight && S.fight.ships.find((q) => q.alive && q.Z < 26 && !['peek', 'flee'].includes(q.man.kind)); if (!sh) await new Promise((r) => setTimeout(r, 100)); } if (!sh) break;
      sh.L = 0; sh.stage = 0; p3.startMan(sh, 'strafe'); await new Promise((r) => setTimeout(r, 150)); const p0 = p3.shipScreen(sh); const a = Math.random() * 7; S.padRetStale = false; S.ret = [p0[0] + Math.cos(a) * 220, p0[1] + Math.sin(a) * 120];
      let fx = 206, fy = innerHeight - 90; const id = 300 + tr; __ptr('pointerdown', fx, fy, id); n++; const hist = []; let had = false, lost = false, held = 0, lastC = 0; const t0 = performance.now();
      while (performance.now() - t0 < 9000) { await __raf(); S.fight.wave = 2; S.fight.t0 = S.fight.t; S.fight.waveOn = true; const now = performance.now(); if (!sh.alive) break; hist.push([now, p3.shipScreen(sh)]); if (hist.length > 90) hist.shift();
        if (S.fight.locked === sh || S.fight.locked2 === sh) { if (!had) held = 0; had = true; held += 16.7 * 0 + (hist.length > 1 ? now - hist[hist.length - 2][0] : 16); if (held >= 5000) break; sh.L = Math.min(sh.L, 4.9); } else if (had) { lost = true; break; } else if (now - t0 > 3500) { window.__dbg = [!!S.grab, Math.round(S.fight.t * 10), S.fight.locked && S.fight.locked.slot, S.fight.magnet && S.fight.magnet.slot, sh.slot, S.aimW.map(Math.round), Math.round(sh.fx), Math.round((sh.fy + sh.y) / 2), S.hold, S.ret.map(Math.round), p3.shipScreen(sh).map(Math.round), S.state, sh.Z, sh.man.kind]; break; }
        if (now - lastC > 90) { lastC = now; const si = hist.findIndex((h) => h[0] >= now - 260), seen = hist[Math.max(0, si)], pr = hist[Math.max(0, si - 6)], dtv = Math.max(1, seen[0] - pr[0]), vx = (seen[1][0] - pr[1][0]) / dtv, vy = (seen[1][1] - pr[1][1]) / dtv; /* smooth pursuit: leads by 70% of the lag */ const tx = seen[1][0] + vx * 260 * 0.7, ty = seen[1][1] + vy * 260 * 0.7; const k = Math.random() < 0.15 ? 0.58 : 0.45; fx += (tx - S.ret[0]) * k / p3.PAD_GAIN + rn() * 5; fy += (ty - S.ret[1]) * k / p3.PAD_GAIN + rn() * 5; __ptr('pointermove', fx, fy, id); } }
      __ptr('pointerup', fx, fy, id); const win = had && !lost && held >= 5000; if (had) acq++; if (win) ok++; log.push(win ? 1 : had ? 0 : '-'); (window.__zl = window.__zl || []).push([Math.round(sh.Z), Math.round(held), sh.man.kind, S.fight.wave, S.fight.waveOn]); sh.L = 0; sh.stage = 0; await new Promise((r) => setTimeout(r, 300)); }
    return { zl: window.__zl, dbg: window.__dbg, ok, n, acq, rate: n ? ok / n : 0, log: log.join(''), gain: p3.PAD_GAIN }; });
  console.log('Chico sim', JSON.stringify(sim)); P3.sim = sim; ok(`Chico: mid-skill holds the beam to the kill on the first try ~60% (${sim.ok}/${sim.n} = ${(sim.rate * 100).toFixed(0)}%, acquired ${sim.acq}, gain ${sim.gain})`, sim.n >= 20 && sim.rate >= 0.5 && sim.rate <= 0.7);
  ok(`first lock (wave 1 rules) stays easy`, await pg.evaluate(() => window.__cr9.p3.TUNE(0).rad === 1 && window.__cr9.p3.JINK.base > 0));
  // banner waits for the landing; landing paint drips + 8-note halo; particles
  const bn = await pg.evaluate(async () => { const { S, p2, P } = window.__cr9; const sh = S.fight.ships.find((q) => q.alive); S.landFx = 0; S.cowLandAt = 0; S.savedShownAt = 0; let peak = 0, shot = false; p2.kill(sh);
    const t0 = performance.now(); while (performance.now() - t0 < 5000) { await new Promise((r) => requestAnimationFrame(r)); peak = Math.max(peak, P.count); if (S.cowLandAt && !shot && performance.now() - S.cowLandAt > 250) { shot = true; window.__shotNow = true; } }
    return { land: S.cowLandAt, shown: S.savedShownAt, landFx: S.landFx, peak, stats: window.__cr9.stats }; });
  console.log(JSON.stringify(bn)); P3.bn = bn;
  ok(`banner held until the cow lands (shown ${Math.round(bn.shown - bn.land)} ms after landing)`, bn.land > 0 && bn.shown >= bn.land); ok(`landing FX (drips + note halo) fired (${bn.landFx})`, bn.landFx >= 1); ok(`peak particles < 350 with landing FX (${bn.peak})`, bn.peak < 350);
  await pg.evaluate(async () => { const { S, W, p3 } = window.__cr9; p3.landFx(0, -175); for (let i = 0; i < 9; i++) await new Promise((r) => requestAnimationFrame(r)); }); await pg.screenshot({ path: 'shots/p3_cow_landing_fx.png' });
  // REX: woo alternates, <= 1 per 4 s; hum with ships, crickets only between waves
  const au = await pg.evaluate(async () => { const { S, p3 } = window.__cr9; S.wooNext = 0; S.wooLog = []; for (let i = 0; i < 5; i++) p3.woo(); const burst = S.wooLog.length; S.wooNext = 0; p3.woo(); S.wooNext = 0; p3.woo(); const seq = S.wooLog.map((w) => w[0]);
    await new Promise((r) => setTimeout(r, 300)); const a1 = { ...S.ambOn }; const Fi = S.fight, w = Fi.waveOn; Fi.waveOn = false; await new Promise((r) => setTimeout(r, 300)); const a2 = { ...S.ambOn }; Fi.waveOn = w; await new Promise((r) => setTimeout(r, 300)); const a3 = { ...S.ambOn };
    const crk = S.beds.crk; return { burst, seq, a1, a2, a3, crkGain: crk && crk.g.gain.value, src: S.beds.hum && S.beds.hum.src.buffer && S.beds.hum.src.loop, fmt: window.__cr9.A.fmt }; });
  console.log(JSON.stringify(au)); P3.au = au;
  const sr = await pg.evaluate(async () => { const { S, p3 } = window.__cr9; S.shredPulses = 0; S.shredReadyCues = 0; S.shredHits = 0; S.shred = 100; S.hyper = null; p3.shredReady(); await new Promise((r) => setTimeout(r, 1800)); const o = { ready: S.shredReadyCues, pulses: S.shredPulses }; p3.startHyper(); const ph = S.shredPulses; await new Promise((r) => setTimeout(r, 1200)); o.hits = S.shredHits; o.pulsesAfterTap = S.shredPulses - ph; o.stemFull = window.__cr9.A.stemG ? +window.__cr9.A.stemG.gain.value.toFixed(2) : null; return o; });
  console.log(JSON.stringify(sr)); ok(`SHRED ready: GTR_Shred_Ready on the beat + pulse every beat, tap -> FX_Shred_Hit, pulse stops, stem up (${JSON.stringify(sr)})`, sr.ready === 1 && sr.pulses >= 2 && sr.hits === 1 && sr.pulsesAfterTap === 0 && sr.stemFull > 0.8);
  ok(`woo: 5 lock-ons in a burst -> 1 scream (${au.burst}); alternates 01/02 (${au.seq})`, au.burst === 1 && au.seq[0] !== au.seq[1] && au.seq[1] !== au.seq[2]);
  ok(`ship hum loops while ships are up; crickets only between waves (${JSON.stringify([au.a1, au.a2, au.a3])})`, au.a1.hum && !au.a1.crk && au.a2.crk && !au.a3.crk && au.src);
  await ctx.close(); }
{ // abduction: 1st loss unskippable; from the 2nd, taps before 'Oh no!' (3.5 s) do nothing, a tap after skips the rest
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=1&story=0&noboard=1&nograb=1'); await ready(pg);
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight, null, { timeout: 60000 });
  const tap = async () => { await pg.touchscreen.tap(206, 880); };
  await pg.evaluate(() => window.__cr9.p2.abducted()); await pg.waitForTimeout(4200); await tap(); const m1 = await pg.evaluate(() => ({ skips: window.__cr9.S.missSkips || 0, wait: document.getElementById('again').classList.contains('wait') }));
  await pg.waitForTimeout(3500); await pg.evaluate(() => { document.getElementById('again').classList.remove('hidden'); }); await pg.dispatchEvent('#again', 'pointerdown'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight, null, { timeout: 30000 });
  await pg.evaluate(() => window.__cr9.p2.abducted()); await pg.waitForTimeout(1900); await tap(); const m2a = await pg.evaluate(() => ({ skips: window.__cr9.S.missSkips || 0, n: window.__cr9.S.missN }));
  await pg.waitForTimeout(2000); await tap(); await pg.waitForTimeout(250); const m2b = await pg.evaluate(() => ({ dbg: [window.__cr9.S.missSkippable, window.__cr9.S.missEarlyTaps, Math.round(window.__cr9.S.missSkipAt - performance.now()), window.__cr9.S.state], skips: window.__cr9.S.missSkips || 0, wait: document.getElementById('again').classList.contains('wait'), gig: window.__cr9.S.giggleUntil, gain: window.__cr9.A.cleanGain.gain.value }));
  console.log(JSON.stringify({ m1, m2a, m2b })); ok('1st loss: tap after Oh no! does NOT skip', m1.skips === 0); ok(`2nd loss: tap before Oh no! (2.6 s) does not skip (${m2a.skips})`, m2a.skips === 0 && m2a.n === 2);
  ok('2nd loss: tap after Oh no! (4.6 s) skips the rest (giggle off, PLAY AGAIN unlocked, song faded)', m2b.skips === 1 && !m2b.wait && m2b.gig === 0 && m2b.gain < 0.3); await pg.screenshot({ path: 'shots/p3_missing_time_skip.png' }); await ctx.close(); }
{ // desktop mouse: direct aim (no pad); REX sfx md5 in both packs; MP3 loop seam
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=1&story=0&noboard=1&nograb=1&fmt=mp3'); await ready(pg);
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight, null, { timeout: 60000 });
  await pg.mouse.move(150, 300); await pg.mouse.down(); await pg.waitForTimeout(100); const md = await pg.evaluate(() => ({ pad: window.__cr9.S.pad, ret: window.__cr9.S.ret })); await pg.mouse.up();
  ok(`mouse aims directly (no pad; reticle at the cursor ${md.ret && md.ret.map(Math.round)})`, !md.pad && md.ret && Math.abs(md.ret[0] - 150) < 1 && Math.abs(md.ret[1] - 190) < 1);
  const seam = await pg.evaluate(async () => { const { A } = window.__cr9; const out = {}; for (const n of ['AMB_Ship_Hum_Loop', 'AMB_Crickets_Soft_Loop']) { const h = window.__cr9.loopPoints; const bf = A.buf[n]; if (!bf) { out[n] = null; continue; } const [s0, s1] = h(n, bf), d = bf.getChannelData(0), sr = bf.sampleRate;
      const i0 = Math.round(s0 * sr), i1 = Math.round(s1 * sr); let med = 0; for (let i = i0 + 1; i < i0 + 4000; i++) med += Math.abs(d[i] - d[i - 1]); med /= 4000; const jump = Math.abs(d[i0] - d[i1 - 1]);
      let naive = Math.abs(d[0] - d[d.length - 1]); out[n] = { fmt: A.fmt, dur: +bf.duration.toFixed(4), loop: [+s0.toFixed(4), +s1.toFixed(4)], jumpOverMedian: +(jump / med).toFixed(2), naiveOverMedian: +(naive / med).toFixed(2) }; } return out; });
  console.log(JSON.stringify(seam)); P3.seam = seam; for (const [n, v] of Object.entries(seam)) ok(`MP3 loop seam ${n} trimmed (loop ${v && v.loop}, jump ${v && v.jumpOverMedian}x median step)`, v && v.fmt === 'mp3' && v.jumpOverMedian < 4);
  await ctx.close();
  const crypto = await import('crypto'); const md5 = (x) => crypto.createHash('md5').update(x).digest('hex'); const README = fs.readFileSync('/workspace/cr9_video_sfx/README.md', 'utf8'); let good = 0, tot = 0;
  for (const fmt of ['ogg', 'mp3']) { const aud = path.join(root, 'audio'); const jf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.json')), bf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.bin')); const idx = JSON.parse(fs.readFileSync(path.join(aud, jf))), bin = fs.readFileSync(path.join(aud, bf));
    for (const n of ['VO_Gray_Scream_Woo_01', 'VO_Gray_Scream_Woo_02', 'AMB_Ship_Hum_Loop', 'AMB_Crickets_Soft_Loop']) { tot++; const e = idx[n]; if (!e) continue; const h = md5(bin.subarray(e[0], e[0] + e[1])); const row = README.split('\n').find((l) => l.startsWith(`| ${n}.${fmt} `)); if (row && row.includes(h)) good++; } }
  ok(`REX video SFX in both packs, md5 = README (${good}/${tot})`, good === tot); }
{ // guitar stem (only when the build carries one): streamed (not decoded), starts with the song, <=30 ms drift, re-synced after seeks, 40 ms in / 150 ms out on the beam
  const man = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8')); const has = !!(man.audio.ogg.stem); P3.stemInBuild = has;
  if (!has) console.log('INFO no guitar stem in this build (REX file not delivered): strum fallback active');
  else { const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=1&story=0&noboard=1&nograb=1'); await ready(pg);
    await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight, null, { timeout: 60000 });
    const st = await pg.evaluate(async () => { const { A, STEM, S, p2 } = window.__cr9, w = (ms) => new Promise((r) => setTimeout(r, ms)), o = {}; await w(3000); STEM.drift.length = 0; await w(6000); o.run = STEM.drift.slice(); o.playing = !A.stemEl.paused;
      o.g0 = A.stemG.gain.value; document.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, pointerType: 'mouse', clientX: 200, clientY: 300, bubbles: true })); await w(120); o.gOn = A.stemG.gain.value; o.duckOn = A.beamDuck.gain.value; const f0 = STEM.fixes; A.stemEl.currentTime += 0.08; STEM.last = 0; await w(600); o.jumpWhileAudible = STEM.fixes - f0; document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, pointerType: 'mouse', clientX: 200, clientY: 300, bubbles: true })); await w(150); o.g150 = A.stemG.gain.value; await w(400); o.gOff = A.stemG.gain.value; o.duckOff = A.beamDuck.gain.value; o.blocked = STEM.blocked; o.strumsDuringStem = S.strumOn || false;
      p2.abducted(); await w(1500); STEM.drift.length = 0; await w(3000); o.afterSeek = STEM.drift.slice(); o.songT = A.songEl.currentTime; o.stemT = A.stemEl.currentTime; o.fixes = STEM.fixes; o.resyncs = STEM.resyncs;
      o.bigBuffers = Object.entries(A.buf).filter(([k, v]) => v.duration > 30).map(([k]) => k); o.heapMB = performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null; o.fmt = A.fmt; return o; });
    const mx = (a) => Math.max(...a.map(Math.abs)); console.log(JSON.stringify({ ...st, run: undefined, afterSeek: undefined, runMax: mx(st.run), seekMax: mx(st.afterSeek) })); P3.stem = { ...st, runMax: mx(st.run), seekMax: mx(st.afterSeek) };
    ok(`stem plays with the song, drift <= 30 ms + correction (max ${mx(st.run)} ms over ${st.run.length} checks)`, st.playing && st.run.length >= 8 && mx(st.run) <= 45);
    ok(`stem re-synced after the 94.4 s seek (max ${mx(st.afterSeek)} ms, song ${st.songT.toFixed(2)} / stem ${st.stemT.toFixed(2)})`, mx(st.afterSeek) <= 60 && Math.abs(st.songT - st.stemT) < 0.06);
    ok(`stem gain 0 idle -> loud on the beam (40 ms) -> 0 after release (${[st.g0, st.gOn, st.g150, st.gOff].map((v) => v.toFixed(2))})`, st.g0 < 0.01 && st.gOn > 0.85 && st.duckOn < 0.75 && st.duckOff > 0.97 && st.g150 < 0.1 && st.gOff < 0.01 && !st.strumsDuringStem);
    ok(`stem never resyncs while audible (fixes while held: ${st.jumpWhileAudible}, blocked ${st.blocked})`, st.jumpWhileAudible === 0 && st.blocked > 0);
    ok(`stem is streamed, never decoded (no >30 s AudioBuffers: ${st.bigBuffers})`, st.bigBuffers.length === 0); await ctx.close(); } }
{ const crypto = await import('crypto'); const md5 = (x) => crypto.createHash('md5').update(x).digest('hex'); const RM = fs.readFileSync('/workspace/cr9_guitar_stem/README.md', 'utf8'); let good = 0;
  const man = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8')); for (const fmt of ['ogg', 'mp3']) { if (man.audio[fmt].stem && RM.includes(md5(fs.readFileSync(path.join(root, 'audio', man.audio[fmt].stem))))) good++;
    const aud = path.join(root, 'audio'); const jf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.json')), bf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.bin')); const idx = JSON.parse(fs.readFileSync(path.join(aud, jf))), bin = fs.readFileSync(path.join(aud, bf)); const e = idx.VO_Gray_Laugh; if (e && RM.includes(md5(bin.subarray(e[0], e[0] + e[1])))) good++; }
  ok(`REX stem + VO_Gray_Laugh md5 = README (${good}/4)`, good === 4); }
{ // pass 3 abduction cut scene + card, and laugh on a truck grab
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }); const pg = await ctx.newPage(); await pg.goto(base + '?skip=1&story=0&noboard=1'); await ready(pg);
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight && window.__cr9.S.fight.ships.some((s) => s.alive), null, { timeout: 60000 });
  const lg = await pg.evaluate(() => { const { S, test } = window.__cr9; const n = S.grayLaughs || 0; test.grab(); return (S.grayLaughs || 0) - n; }); ok(`VO_Gray_Laugh plays on a truck grab (${lg})`, lg === 1);
  const cs = await pg.evaluate(async () => { const { S, p3, W, P } = window.__cr9; S.lives = 1; const g = S.grab; g.t = 99; const w = (ms) => new Promise((r) => setTimeout(r, ms)); await w(100); const o = { state: S.state, cut: !!S.cut, n0: S.cutNotes || 0 }; o.y0 = W.hero.position.y; await w(2200); o.y2 = W.hero.position.y; o.col = W.col.visible; o.heroVis = W.hero.visible; window.__shotCut = 1; return o; });
  await pg.screenshot({ path: 'shots/p3_abduction_cutscene_lift.png' });
  const cs2 = await pg.evaluate(async () => { const { S, W } = window.__cr9; const w = (ms) => new Promise((r) => setTimeout(r, ms)); await w(1900); const o = { heroScale: W.hero.scale.x }; await w(1300); o.card = !document.getElementById('endCard').classList.contains('hidden'); o.title = document.getElementById('endTitle').textContent; o.cutMs = S.cutAt ? null : null; o.notes = S.cutNoteRGB; o.chord = S.missChordAt; o.state = S.state; return o; });
  console.log(JSON.stringify({ cs, cs2 })); P3.cut = { cs, cs2 };
  ok('abduction: last truck lost -> cut scene (Daniel rises in the green beam)', cs.cut && cs.state === 'missing' && cs.y2 > cs.y0 + 150 && cs.col && cs.heroVis);
  ok(`cut scene notes pink/blue/green (${cs2.notes}), Daniel pulled into the ship (scale ${Math.round(cs2.heroScale)})`, cs2.notes && cs2.notes.every((v) => v > 3) && cs2.heroScale < 40);
  ok(`card after ~5 s: "${cs2.title}"`, cs2.card && /OOPS! YOU'VE BEEN ABDUCTED/.test(cs2.title) && /COMING SOON: LEVEL 2/.test(cs2.title)); ok(`'Oh no!' chord lands during the cut scene (${Math.round(cs2.chord)} ms)`, Math.abs(cs2.chord - 3500) < 200);
  await pg.waitForTimeout(3500); await pg.screenshot({ path: 'shots/p3_abducted_card.png' });
  await pg.evaluate(() => document.getElementById('again').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await pg.waitForTimeout(500); const rs = await pg.evaluate(() => ({ st: window.__cr9.S.state, wave: window.__cr9.S.fight && window.__cr9.S.fight.wave, lives: window.__cr9.S.lives })); ok(`PLAY AGAIN restarts from the start (${JSON.stringify(rs)})`, rs.st === 'run' && rs.wave <= 0 && rs.lives === 3);
  // 2nd loss: a tap before 3.5 s does nothing, a tap after skips the cut scene straight to the card
  await pg.waitForFunction(() => window.__cr9.S.fight && window.__cr9.S.fight.ships.some((s) => s.alive), null, { timeout: 30000 });
  await pg.evaluate(() => { const { S, test } = window.__cr9; S.grabGrace = 0; test.grab(); S.lives = 1; S.grab.t = 99; }); await pg.waitForTimeout(1500); await pg.touchscreen.tap(206, 500); const k1 = await pg.evaluate(() => ({ cut: !!window.__cr9.S.cut, n: window.__cr9.S.missN }));
  await pg.waitForTimeout(2300); await pg.touchscreen.tap(206, 500); await pg.waitForTimeout(150); const k2 = await pg.evaluate(() => ({ cut: !!window.__cr9.S.cut, card: !document.getElementById('endCard').classList.contains('hidden'), wait: document.getElementById('again').classList.contains('wait'), skips: window.__cr9.S.cutSkips || 0 }));
  console.log(JSON.stringify({ k1, k2 })); ok('2nd loss: tap before Oh no! keeps the cut scene', k1.cut && k1.n >= 2); ok('2nd loss: tap after Oh no! skips the cut scene -> card, PLAY AGAIN ready', !k2.cut && k2.card && !k2.wait && k2.skips >= 1); await ctx.close(); }
{ const src = ['src/main.js', 'src/audio.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n'); const js = fs.readdirSync(path.join(root, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(root, 'assets', f), 'utf8')).join('');
  ok('no synthesized audio: no createOscillator / OscillatorNode / synthShred / synthDive / humVoice in src or bundle', !/createOscillator|OscillatorNode|synthShred\(|synthDive\(|humVoice\(/.test(src) && !/createOscillator|OscillatorNode/.test(js)); }
{ const crypto = await import('crypto'); const md5 = (x) => crypto.createHash('md5').update(x).digest('hex'); const RM = fs.readFileSync('/workspace/cr9_real_sfx/README.md', 'utf8') + fs.readFileSync('/workspace/cr9_shred_sfx/README.md', 'utf8').split('## UPDATE')[0].split('\n').filter((l) => l.startsWith('| GTR_Shred_Ready')).join('\n'); let good = 0, tot = 0;
  for (const fmt of ['ogg', 'mp3']) { const aud = path.join(root, 'audio'); const jf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.json')), bf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.bin')); const idx = JSON.parse(fs.readFileSync(path.join(aud, jf))), bin = fs.readFileSync(path.join(aud, bf));
    for (const n of ['AMB_Danger_Rumble_Loop', 'GTR_PointBlank_Chord', 'GTR_Shred_Ready', 'FX_Shred_Ready_Pulse', 'FX_Shred_Hit']) { tot++; const e = idx[n]; if (e && RM.includes(md5(bin.subarray(e[0], e[0] + e[1])))) good++; } }
  ok(`REX real-recording replacements in both packs, md5 = READMEs (${good}/${tot})`, good === tot); }
{ const crypto = await import('crypto'); const md5 = (x) => crypto.createHash('md5').update(x).digest('hex'); const RM = fs.readFileSync('/workspace/cr9_real_sfx2/README.md', 'utf8').split('\n'); const names = fs.readdirSync('/workspace/cr9_real_sfx2/ogg').map((f) => f.replace('.ogg', '')); let good = 0, tot = 0;
  for (const fmt of ['ogg', 'mp3']) { const aud = path.join(root, 'audio'); const jf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.json')), bf = fs.readdirSync(aud).find((f) => f.startsWith(`pack_${fmt}.`) && f.endsWith('.bin')); const idx = JSON.parse(fs.readFileSync(path.join(aud, jf))), bin = fs.readFileSync(path.join(aud, bf));
    for (const n of names) { tot++; const e = idx[n], row = RM.find((l) => l.startsWith(`| ${n} `)); if (e && row && row.includes(md5(bin.subarray(e[0], e[0] + e[1])))) good++; } }
  ok(`REX pack audit: ${names.length} recorded replacements in both packs, md5 = README (${good}/${tot})`, good === tot); }
fs.writeFileSync('shots/p3_results.json', JSON.stringify(P3, null, 1));
// unit-style: run pickCow logic through the page for first-cow + bald (exposed via S counters after a scripted run)
await b.close(); srv.close(); const bad = Object.values(res).filter((v) => !v).length; console.log(bad ? `${bad} FAIL` : 'ALL PASS'); process.exit(bad ? 1 : 0);
