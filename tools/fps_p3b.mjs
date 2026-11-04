// p3b: melt fps with and without the paint layer (headless SwiftShader: relative cost only)
import { createRequire } from 'module'; const require = createRequire('/workspace/cr9-perftest/'); const { chromium } = require('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve('dist');
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
for (const rep of [0, 1]) for (const paint of ['1', '0']) { const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const pg = await ctx.newPage();
  await pg.goto(`${base}?skip=1&story=0&noboard=1&nograb=1&uncap=1&paint=${paint}`); await pg.waitForFunction(() => window.__cr9 && window.__cr9.S.ready, null, { timeout: 90000 });
  await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup');
  await pg.waitForFunction(() => { const S = window.__cr9.S; return S.state === 'run' && S.fight && S.fight.ships.some((s) => s.alive && s.g.face.visible && s.sc > 0.5); }, null, { timeout: 90000 });
  const r = await pg.evaluate(async () => { const { S, p3b, G } = window.__cr9; const sh = S.fight.ships.find((s) => s.alive && s.g.face.visible); p3b.kill(sh);
    let n = 0; const t0 = performance.now(); await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const info = G.renderer.info; return { fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), calls: info.render.calls, tex: info.memory.textures }; });
  console.log(JSON.stringify({ paint, ...r })); await ctx.close(); }
await b.close(); srv.close();
