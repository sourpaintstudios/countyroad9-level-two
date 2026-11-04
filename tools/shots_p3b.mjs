// p3b phone shots (412x915): wave 1 + wave 3 faces, lock, melt, splat, grab prompt, missing-time card, thumbnail
import { createRequire } from 'module'; const require = createRequire('/workspace/cr9-perftest/'); const { chromium } = require('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve('dist'), extra = process.argv[2] || '', tag = process.argv[3] || 'p3b';
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(root, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } const ext = path.extname(f); r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' }[ext] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const shot = async (pg, n) => { await pg.screenshot({ path: `shots/${tag}_${n}.png` }); console.log('shot', n); };
const start = async (wave) => { const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, hasTouch: false }); const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('pageerror', e.message));
  await pg.goto(`${base}?skip=1&story=0&noboard=1&nograb=1&wave=${wave}${extra}`); await pg.waitForFunction(() => window.__cr9 && window.__cr9.S.ready, null, { timeout: 90000 });
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup');
  await pg.waitForFunction(() => { const S = window.__cr9.S; return S.state === 'run' && S.fight && S.fight.ships.some((s) => s.alive && s.g && s.g.face.visible && s.sc > 0.5); }, null, { timeout: 90000 }); return { ctx, pg }; };
const shipPos = (pg) => pg.evaluate(() => { const { S, p3b } = window.__cr9; const sh = S.fight.ships.filter((s) => s.alive && s.g.face.visible).sort((a, b) => b.sc - a.sc)[0]; return sh ? p3b.toScreen(sh.fx, sh.fy) : null; });
{ const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 }); const pg = await ctx.newPage(); await pg.goto(`${base}?noboard=1${extra}`); await pg.waitForFunction(() => window.__cr9 && window.__cr9.S.ready, null, { timeout: 90000 }); await pg.waitForTimeout(2600); await shot(pg, 'intro'); await ctx.close(); }
let { ctx, pg } = await start(0); await pg.waitForTimeout(2500); await shot(pg, 'wave1');
// lock: hold the beam on the nearest ship and follow it
let p = await shipPos(pg); await pg.mouse.move(p[0], p[1]); await pg.mouse.down();
for (let i = 0; i < 40; i++) { await pg.waitForTimeout(60); p = await shipPos(pg); if (p) await pg.mouse.move(p[0], p[1]); if (i === 8) await shot(pg, 'lock_surprised'); if (i === 14) await pg.evaluate(() => { const Fi = window.__cr9.S.fight; if (Fi.locked) Fi.locked.L = Math.max(Fi.locked.L, 2.2); }); if (i === 20) await shot(pg, 'lock_hands'); }
await shot(pg, 'lock_scream');
// melt: kill it
await pg.mouse.up(); await pg.evaluate(() => { const { S, p3b } = window.__cr9; const sh = S.fight.ships.filter((s) => s.alive && s.g.face.visible).sort((a, b) => b.sc - a.sc)[0]; window.__k = sh; if (sh) p3b.kill(sh); });
await pg.waitForTimeout(200); await shot(pg, 'melt_twin'); await pg.evaluate(() => window.__cr9.p3b.W.paint && (window.__cr9.p3b.W.paint.U.uFlood.value = 0)); await pg.waitForTimeout(350); await shot(pg, 'melt'); await pg.waitForTimeout(450); await shot(pg, 'splat');
await ctx.close();
({ ctx, pg } = await start(3)); await pg.waitForTimeout(3000); await shot(pg, 'wave3'); await pg.evaluate(() => { const S = window.__cr9.S; S.shred = 100; window.__cr9.p3b.startHyper(); }); await pg.waitForTimeout(700); await shot(pg, 'shred');
// grab prompt (forced), then lost truck -> laugh
await ctx.close();
{ const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 }); const pg = await ctx.newPage();
  await pg.goto(`${base}?skip=1&story=0&noboard=1&wave=3${extra}`); await pg.waitForFunction(() => window.__cr9 && window.__cr9.S.ready, null, { timeout: 90000 });
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup');
  await pg.waitForFunction(() => { const S = window.__cr9.S; return S.state === 'run' && S.fight && S.fight.ships.some((s) => s.alive && s.g.face.visible && s.sc > 0.5); }, null, { timeout: 90000 });
  const ok = await pg.evaluate(() => { const { S, p3b } = window.__cr9; S.grabGrace = 0; const sh = S.fight.ships.find((s) => s.alive && s.g.face.visible); return p3b.startGrab(sh, 'shot'); });
  console.log('grab', ok); await pg.waitForTimeout(900); await shot(pg, 'grab');
  // lose all trucks -> MISSING TIME card
  await pg.evaluate(() => { const S = window.__cr9.S; S.lives = 1; }); await pg.waitForTimeout(3500); await pg.waitForTimeout(7000); await shot(pg, 'missing_card');
  await ctx.close(); }
// close-up: big face, centred (crop of the wave-1 lock), plus the 96 px thumbnail comes from tools/thumb
await b.close(); srv.close();
