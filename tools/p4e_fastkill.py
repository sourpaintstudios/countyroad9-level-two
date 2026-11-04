# p4e DANA: fastest honest first kill in wave 1 (3 s beam). An "expert thumb": finger already on the pad when the run starts,
# drives the reticle onto ship 1 as fast as CDP allows and never lets go. Real touch input only (no test hooks); records S.firstKill.
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4191/'; N = int(sys.argv[2]) if len(sys.argv) > 2 else 5
UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
async def one(b):
    ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=1, is_mobile=True, has_touch=True, user_agent=UA)
    pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
    await pg.route('**/api/scores', lambda r: r.fulfill(status=200, content_type='application/json', body='{"ok":true,"top":[],"total":0}'))
    t = lambda k, x=0, y=0: cdp.send('Input.dispatchTouchEvent', {'type': k, 'touchPoints': [] if k == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]})
    await pg.goto(URL); await pg.wait_for_function('window.__cr9.S.ready', timeout=60000); await pg.wait_for_timeout(300)
    await pg.tap('#titleCard', position={'x': 200, 'y': 450})
    await pg.wait_for_function("!document.getElementById('story').classList.contains('hidden')", timeout=30000); await pg.wait_for_timeout(300)
    await pg.tap('#story', position={'x': 200, 'y': 600})
    await pg.wait_for_function("window.__cr9.S.state==='run'", timeout=30000)
    f = [206.0, 830.0]; await t('touchStart', *f); first_on = None; t0 = time.time()
    while time.time() - t0 < 25:
        s = await pg.evaluate("(() => { const S = window.__cr9.S, F = S.fight; return { fk: S.firstKill, tg: window.__cr9.input.target(), r: S.ret, L: F && F.locked ? F.locked.L : 0, rt: (performance.now() - S.runT0) / 1000 }; })()")
        if s['fk'] is not None: break
        if s['L'] > 0 and first_on is None: first_on = round(s['rt'], 2)
        if s['tg'] and s['r']:
            nx, ny = f[0] + (s['tg'][0] - s['r'][0]) / 2.5, f[1] + (s['tg'][1] - 110 - s['r'][1]) / 2.5
            if not (4 <= nx <= 408 and 720 <= ny <= 910): nx, ny = 206.0, 830.0
            f = [nx, ny]; await t('touchMove', nx, ny)
    await t('touchEnd'); await ctx.close(); return {'firstKill': s['fk'], 'lockStart': first_on}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'])
        out = [await one(b) for _ in range(N)]; await b.close()
    print(json.dumps({'runs': out, 'min': min(r['firstKill'] for r in out if r['firstKill'])}))
asyncio.run(main())
