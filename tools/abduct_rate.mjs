// pass 3: abduction rate of a simulated MID-SKILL touch player (pad aiming, 180 ms reaction, 55% corrections, 3 px tremor; break-free taps ~2.9/s +-0.5)
// node tools/abduct_rate.mjs [dist] [runs] [ts]   (ts = game clock multiplier for speed; player timings are scaled with it)
import { createRequire } from 'module'; const require = createRequire('/workspace/cr9-perftest/'); const { chromium } = require('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve(process.argv[2] || 'dist'), RUNS = +(process.argv[3] || 9), TS = +(process.argv[4] || 3);
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const out = []; const PAR = +(process.argv[5] || 4); let next = 0;
// MID-SKILL model (pass 3b): 260 ms reaction, corrections every 90 ms at 45% of the error (15%: 1.3x overshoot), 5 px tremor, smooth pursuit leads 70% of the lag,
// sticks with its ship (notices a diver after ~500 ms, switches 60% of the time), ~300 ms to put the thumb down, break-free taps 1.9-2.5 per s (top ~2.5)
async function one(run) { const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }); const pg = await ctx.newPage(); await pg.goto(base + `?story=0&noboard=1&ts=${TS}`);
  await pg.waitForFunction(() => window.__cr9 && window.__cr9.S.ready, null, { timeout: 120000 }); await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); await pg.waitForFunction(() => window.__cr9.S.state === 'run' && window.__cr9.S.fight, null, { timeout: 120000 });
  const r = await pg.evaluate(async (TS) => { const { S, p3 } = window.__cr9; const ptr = (type, x, y, id) => { const el = document.elementFromPoint(x, y) || document.body; el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); };
    const rn = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2; const raf = () => new Promise((r) => requestAnimationFrame(r)); const t0 = performance.now(); let down = false, fx = 206, fy = innerHeight - 90, id = 100, hist = [], lastC = 0, nextTap = 0, tgt = null, diverSeen = 0, downAt = 0;
    const tapRate = 1.9 + Math.random() * 0.6; const R = 260 / TS, C = 90 / TS;
    const ok = (q) => q && q.alive && !q.gone && q.Z < 26 && !['peek', 'flee'].includes(q.man.kind);
    while (performance.now() - t0 < 420000 / TS) { await raf(); const st = S.state; if (st === 'morph') continue; if (st !== 'run') break; const now = performance.now();
      if (S.grab) { if (down) { ptr('pointerup', fx, fy, id); down = false; } if (now > nextTap) { nextTap = now + 1000 / tapRate / TS * (0.85 + Math.random() * 0.3); ptr('pointerdown', 206, 500, 999); ptr('pointerup', 206, 500, 999); } continue; }
      const Fi = S.fight; if (!Fi) continue; const div = Fi.ships.find((q) => ok(q) && q.man.kind === 'dive' && q !== tgt);
      if (div) { if (!diverSeen) diverSeen = now; else if (now - diverSeen > 500 / TS) { if (Math.random() < 0.6) { tgt = div; hist = []; } diverSeen = -1; } } else diverSeen = 0;
      if (!ok(tgt)) { tgt = Fi.ships.filter(ok).sort((a, b) => a.Z - b.Z)[0] || null; hist = []; }
      if (!tgt) { if (down) { ptr('pointerup', fx, fy, id); down = false; } continue; }
      hist.push([now, p3.shipScreen(tgt)]); if (hist.length > 120) hist.shift();
      if (!down) { if (!downAt) downAt = now + 300 / TS; if (now >= downAt) { downAt = 0; id++; fx = 206; fy = innerHeight - 90; ptr('pointerdown', fx, fy, id); down = true; } continue; }
      if (now - lastC > C && S.ret) { lastC = now; const si = hist.findIndex((h) => h[0] >= now - R), seen = hist[Math.max(0, si)], pr = hist[Math.max(0, si - 6)], dtv = Math.max(1, seen[0] - pr[0]); const tx = seen[1][0] + (seen[1][0] - pr[1][0]) / dtv * R * 0.7, ty = seen[1][1] + (seen[1][1] - pr[1][1]) / dtv * R * 0.7;
        const k = Math.random() < 0.15 ? 0.58 : 0.45; fx += (tx - S.ret[0]) * k / p3.PAD_GAIN + rn() * 5; fy += (ty - S.ret[1]) * k / p3.PAD_GAIN + rn() * 5;
        if (fx < 8 || fx > innerWidth - 8 || fy < p3.padTop() + 2 || fy > innerHeight - 2) { ptr('pointerup', fx, fy, id); down = false; continue; } ptr('pointermove', fx, fy, id); } }
    return { end: S.state, abducted: !!S.abducted, souls: S.souls, grabs: S.grabs, breakFrees: S.breakFrees, lost: S.livesLost, grabLog: S.grabLog, tapRate: +tapRate.toFixed(2), dur: +((performance.now() - t0) / 1000 * TS).toFixed(0) }; }, TS);
  r.run = run; console.log(JSON.stringify(r)); out.push(r); await ctx.close(); }
await Promise.all(Array.from({ length: PAR }, async () => { while (next < RUNS) await one(next++); }));
const ab = out.filter((r) => r.abducted).length; console.log(`ABDUCTION RATE ${ab}/${out.length} = ${(ab / out.length * 100).toFixed(0)}%`); fs.writeFileSync('shots/p3_abduct_rate.json', JSON.stringify(out, null, 1)); await b.close(); srv.close();
