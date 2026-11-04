// p4b: budgets (draw calls, particles, texture MB via a WebGL upload hook), SHRED mid-melt shot, melt fps, audio single-format network log
import { createRequire } from 'module'; const require = createRequire('/workspace/cr9-perftest/'); const { chromium } = require('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve('dist');
const MT = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MT[path.extname(f)] || 'application/octet-stream', 'Content-Length': fs.statSync(f).size }); fs.createReadStream(f).pipe(r); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const HOOK = () => { const T = new Map(); window.__dc = 0; window.__texList = () => [...T.values()].sort((a, b) => b - a).map((v) => +(v / 1048576).toFixed(2)); window.__texB = () => { let s = 0; for (const v of T.values()) s += v; return s; };
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) { for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { const o = P[k]; if (o) P[k] = function () { window.__dc++; return o.apply(this, arguments); }; }
    const ti = P.texImage2D, ts = P.texStorage2D, bt = P.bindTexture, dt = P.deleteTexture;
    P.bindTexture = function (t, x) { if (t === this.TEXTURE_2D) this.__cur = x; return bt.apply(this, arguments); };
    const cti = P.compressedTexImage2D; P.compressedTexImage2D = function (t, l, f, w, h) { if (this.__cur && l === 0) T.set(this.__cur, w * h); return cti.apply(this, arguments); };
    P.deleteTexture = function (x) { T.delete(x); return dt.apply(this, arguments); };
    P.texStorage2D = function (t, lv, f, w, h) { if (this.__cur) T.set(this.__cur, w * h * ((f === 0x9278 || f === 0x9279) ? 1 : 4) * (lv > 1 ? 1.33 : 1)); /* ETC2 RGBA8/sRGB8_A8 = 1 B/px */ return ts.apply(this, arguments); };
    P.texImage2D = function () { const a = arguments; let w, h; if (a.length >= 8) { w = a[3]; h = a[4]; } else { const s = a[5]; w = s.videoWidth || s.naturalWidth || s.width; h = s.videoHeight || s.naturalHeight || s.height; } if (this.__cur && a[1] === 0) T.set(this.__cur, (w * h * 4) | 0); return ti.apply(this, arguments); }; } };
const TAG = process.env.TAG || 'p4b'; const out = {};
async function open(q, ua = true) { const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, ...(ua ? { userAgent: UA, isMobile: true, hasTouch: true } : {}) }); const pg = await ctx.newPage(); await pg.addInitScript(HOOK);
  const reqs = []; pg.on('request', (r) => reqs.push(r.url().replace(base, '/'))); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(base + q); await pg.waitForFunction(() => window.__cr9 && window.__cr9.S.ready, null, { timeout: 90000 }); return { ctx, pg, reqs, errs }; }
const sample = (pg, ms) => pg.evaluate(async (ms) => { const { G } = window.__cr9; let dr = 0, pp = 0, n = 0; const t0 = performance.now(); const fe = document.getElementById('fps');
  await new Promise((res) => { window.__dc = 0; const f = () => { n++; if (n > 1) dr = Math.max(dr, window.__dc); window.__dc = 0; const m = fe && fe.textContent.match(/ p(\d+)\//); if (m) pp = Math.max(pp, +m[1]); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return { fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), maxDraws: dr, maxParticles: pp, texMB: +(window.__texB() / 1048576).toFixed(1), etc2: !!G.etc2, texCount: G.renderer.info.memory.textures, texList: window.__texList() }; }, ms);
const go = async (pg) => { if (await pg.isVisible('#titleCard').catch(() => false)) { await pg.mouse.click(200, 400); await pg.dispatchEvent('#titleCard', 'pointerup'); } else await pg.mouse.click(200, 400);
  await pg.waitForFunction(() => { const S = window.__cr9.S; return S.state === 'run' && S.fight && S.fight.ships.some((s) => s.alive && s.g.face.visible && s.sc > 0.5); }, null, { timeout: 90000 }); };
// 1) normal play wave 1 with beam held + kill (melt fps)
{ const { ctx, pg, errs } = await open('?skip=1&story=0&noboard=1&nograb=1&uncap=1&fps=1'); await go(pg); await pg.mouse.move(206, 300); await pg.mouse.down();
  out.play = await sample(pg, 3000); await pg.mouse.up();
  await pg.evaluate(() => { const { S, p3b } = window.__cr9; const sh = S.fight.ships.find((s) => s.alive && s.g.face.visible); p3b.kill(sh); });
  out.melt = await sample(pg, 1500); out.playErrs = errs; await ctx.close(); }
// 2) SHRED: wave 3, HYPER, kill mid-SHRED -> mid-melt shot; stripes gone ~1 s after the last kick
{ const { ctx, pg, errs } = await open('?skip=1&story=0&noboard=1&nograb=1&uncap=1&fps=1&wave=3'); await go(pg); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { window.__cr9.S.shred = 100; window.__cr9.p3b.startHyper(); }); await pg.mouse.move(206, 300); await pg.mouse.down();
  const s1 = sample(pg, 2500); await pg.waitForTimeout(600);
  await pg.evaluate(() => { const { S, p3b } = window.__cr9; const sh = S.fight.ships.filter((s) => s.alive && s.g.face.visible).sort((a, b) => b.sc - a.sc)[0]; if (sh) p3b.kill(sh); });
  await pg.waitForTimeout(350); await pg.screenshot({ path: `shots/${TAG}_shred_midmelt.png` }); out.shred = await s1; await pg.mouse.up();
  out.floodAfterHyper = await pg.evaluate(async () => { await new Promise((r) => setTimeout(r, 6500)); return window.__cr9.p3b.W.paint.U.uFlood.value; });
  await pg.screenshot({ path: `shots/${TAG}_shred_after1s.png` }); out.shredErrs = errs; await ctx.close(); }
// 3) audio: one format only (Android UA -> OGG; ?fmt=mp3 -> MP3 only). Play 4 s past the knob so the song + stem elements start fetching.
for (const q of ['', 'fmt=mp3']) { const { ctx, pg, reqs } = await open(`?skip=1&story=0&noboard=1&nograb=1&${q}`); await go(pg); await pg.waitForTimeout(4000);
  const aud = reqs.filter((u) => /\/audio\//.test(u)); out['net_' + (q || 'default')] = { fmt: await pg.evaluate(() => window.__cr9.A.fmt), ogg: aud.filter((u) => /ogg/.test(u)).length, mp3: aud.filter((u) => /mp3/.test(u)).length, files: [...new Set(aud)] }; await ctx.close(); }
fs.writeFileSync(`shots/${TAG}_results.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
await b.close(); srv.close();
