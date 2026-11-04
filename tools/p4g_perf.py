# p4g: draw calls per rendered frame (WebGL draw-call wrapper) across a scripted session incl. pause/resume/restart/main menu. usage: python3 p4g_perf.py URL
import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4191/'
UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
INIT = """(() => { const D = window.__d = { cur: 0, max: 0, frames: 0, byPhase: {}, phase: 'boot' };
 for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = P[f]; if (!o) continue; P[f] = function () { D.cur++; return o.apply(this, arguments); }; }
 const tick = () => { if (D.cur) { D.max = Math.max(D.max, D.cur); const p = D.byPhase[D.phase] = D.byPhase[D.phase] || { max: 0, frames: 0 }; p.max = Math.max(p.max, D.cur); p.frames++; D.frames++; } D.cur = 0; requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2.0, is_mobile=True, has_touch=True, user_agent=UA); pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/api/scores', lambda r: r.fulfill(status=200, content_type='application/json', body='{"ok":true,"top":[],"total":0}'))
        await pg.add_init_script(INIT); await pg.goto(URL + '?story=0'); await pg.wait_for_function('window.__cr9 && window.__cr9.S.ready', timeout=90000)
        ev = pg.evaluate; ph = lambda n: ev(f"window.__d.phase = '{n}'")
        await ph('title'); await pg.wait_for_timeout(800); await pg.tap('#titleCard', position={'x': 200, 'y': 450}); await pg.wait_for_function("window.__cr9.S.state === 'run'")
        await ph('drive+wave1'); await pg.wait_for_function("window.__cr9.S.fight.wave >= 0 && window.__cr9.S.fight.t > 2"); await pg.wait_for_timeout(1000)
        await ph('beam held'); await pg.touchscreen.tap(206, 820) if False else None
        cdp = await ctx.new_cdp_session(pg); await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 206, 'y': 820, 'id': 1}]}); await pg.wait_for_timeout(2500)
        await ph('kill+melt'); await ev("(() => { const S = window.__cr9.S; const sh = S.fight.ships.find(s => s.alive); if (sh) window.__cr9.p2.kill(sh); })()"); await pg.wait_for_timeout(3500)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        await ph('SHRED hyper'); await ev("window.__cr9.S.shred = 100"); await pg.wait_for_timeout(600); await ev('window.__cr9.p3.startHyper()'); await pg.wait_for_timeout(2500)
        await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(400); await ph('paused (loop stopped)'); await pg.wait_for_timeout(1500)
        await ph('countdown+resumed'); await ev('window.__cr9.pause.resume()'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=10000); await pg.wait_for_timeout(2000)
        await ph('after restart'); await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(300); await ph('after restart'); await ev('window.__cr9.pause.restart()'); await pg.wait_for_timeout(5000)
        await ph('after main menu'); await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(300); await ph('after main menu'); await ev('window.__cr9.pause.menu()'); await pg.wait_for_timeout(1500)
        await ph('new game from title'); await pg.tap('#titleCard', position={'x': 200, 'y': 450}); await pg.wait_for_function("window.__cr9.S.state === 'run'"); await pg.wait_for_timeout(5000)
        d = await ev('window.__d'); tex = await ev("(() => { let b = 0; const seen = new Set(); for (const t of Object.values(window.__cr9.G.tex)) { const i = t && t.image; if (i && i.width && !seen.has(i)) { seen.add(i); b += i.width * i.height * 4 * 1.34; } } return [Math.round(b / 1048576 * 10) / 10, window.__cr9.stats.textures]; })()")
        print(json.dumps({'maxDrawCallsPerFrame': d['max'], 'frames': d['frames'], 'byPhase': d['byPhase'], 'texMB_estimate_(G.tex images, RGBA +34% mips)': tex[0], 'textureObjects': tex[1], 'errors': errs}, indent=1))
        await b.close()
asyncio.run(main())
