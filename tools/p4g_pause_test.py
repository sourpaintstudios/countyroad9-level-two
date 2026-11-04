# p4g (v4.7.0) headless PAUSE test (p4h: countdown digits watched in-page, 0.5 s a beat): Playwright + Chrome/swiftshader, 412x915 touch viewport, real CDP touch input. usage: python3 p4g_pause_test.py http://localhost:4191/
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4191/'
SH = '/workspace/cr9-v44/shots/'
UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
R = []  # (name, ok, detail)
def chk(name, ok, detail=''):
    R.append((name, bool(ok), detail)); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail != '' else ''), flush=True)

async def mk(b, q='?story=0', dpr=2.0):
    ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=dpr, is_mobile=True, has_touch=True, user_agent=UA)
    pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
    errs, posts = [], []
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and '404' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
    async def api(route):
        rq = route.request
        if rq.method == 'POST': posts.append(rq.post_data); await route.fulfill(status=200, content_type='application/json', body='{"ok":false,"error":"stub"}')
        else: await route.fulfill(status=200, content_type='application/json', body='{"ok":true,"top":[],"total":0}')
    await pg.route('**/api/scores', api)
    await pg.goto(URL + q + '&fps=1' if '?' in q else URL + q)
    await pg.wait_for_function('window.__cr9 && window.__cr9.S.ready', timeout=90000); await pg.wait_for_timeout(300)
    return pg, cdp, errs, posts

async def touch(cdp, kind, x=0, y=0, i=1):
    await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y, 'id': i}]})
async def tap(cdp, x, y, hold=0.07):
    await touch(cdp, 'touchStart', x, y); await asyncio.sleep(hold); await touch(cdp, 'touchEnd')
def E(pg): return pg.evaluate
async def start_run(pg, cdp):
    await pg.tap('#titleCard', position={'x': 200, 'y': 450})
    await pg.wait_for_function("window.__cr9.S.state === 'run'", timeout=30000)
async def wait_live(pg, tmin=0.0):
    await pg.wait_for_function(f"(() => {{ const S = window.__cr9.S, F = S.fight; return S.state === 'run' && F && F.wave >= 0 && F.t > {tmin}; }})()", timeout=60000)
async def center(pg, sel):
    return await E(pg)(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.x, r.y, r.width, r.height]; }})()")
SNAP = """(() => { const c = window.__cr9, S = c.S, F = S.fight, A = c.A; return { paused: S.paused, counting: S.counting, state: S.state, score: S.score, kills: S.kills, shred: S.shred, streak: S.streak, hold: S.hold, latch: S.latch,
  ft: F ? F.t : null, wave: F ? F.wave : null, now: c.pause.NOW(), runDur: c.pause.runDur(), frames: S.fpsAll[0], ctx: A.ctx.state, ctxT: A.ctx.currentTime, songT: A.songEl.currentTime, songPaused: A.songEl.paused, stemPaused: A.stemEl ? A.stemEl.paused : null, stemT: A.stemEl ? A.stemEl.currentTime : null,
  stemGain: A.stemG ? A.stemG.gain.value : null, ships: F ? F.ships.filter(s => !s.gone).map(s => [+s.fx.toFixed(3), +s.fy.toFixed(3), +s.Z.toFixed(3), +(s.L || 0).toFixed(3)]) : [], particles: c.P ? c.P.count : 0, hitStop: S.hitStopUntil, grab: S.grab ? JSON.stringify([S.grab.t, S.grab.prog]) : null,
  hyperT: S.hyper ? S.hyper.t : null, pressId: S.pressId, padPress: S.padPress || 0, skyTaps: S.skyTaps || 0, grabTaps: S.grabTaps || 0, souls: S.souls, lives: S.lives, tq: c.pause.TQ.size,
  btn: !document.getElementById('pauseBtn').classList.contains('hidden'), menu: !document.getElementById('pauseMenu').classList.contains('hidden'), cd: document.getElementById('pauseMenu').classList.contains('count'), cdTxt: document.getElementById('pmCount').textContent }; })()"""
async def snap(pg): return await pg.evaluate(SNAP)
def verdict(run):
    import subprocess
    p = subprocess.run(['node', '/workspace/cr9-v44/tools/check_run.mjs'], input=json.dumps(run).encode(), capture_output=True, cwd='/workspace/cr9-v44/tools'); return p.stdout.decode().strip()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        # ================= A: button visibility, position, swallow, freeze, resume =================
        pg, cdp, errs, posts = await mk(b); ev = E(pg)
        chk('A1 pause button hidden on title', await ev("document.getElementById('pauseBtn').classList.contains('hidden')"))
        await start_run(pg, cdp)
        s = await snap(pg); chk('A2 pause button hidden at run start (first touch can never land on it)', not s['btn'], f"fight.t={s['ft']:.2f} wave={s['wave']}")
        await wait_live(pg, 0.2); await pg.wait_for_timeout(1200)  # (its 0.3 s pop-in animation must settle before measuring)
        s = await snap(pg); chk('A3 pause button visible once the run is live', s['btn'], f"wave={s['wave']} ft={s['ft']:.2f}")
        cx, cy, bx, by, bw, bh = await center(pg, '#pauseBtn')
        chk('A4 button size ~44 px round', abs(bw - 44) < 1.5 and abs(bh - 44) < 1.5, f'{bw}x{bh} at ({bx:.0f},{by:.0f})')
        rects = await ev("""(() => { const o = {}; for (const id of ['title9', 'shredBar', 'lives', 'souls', 'scoreHud', 'holdHere', 'shredBtn']) { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) continue; const r = e.getBoundingClientRect(); o[id] = [r.x, r.y, r.right, r.bottom]; } o.dashTop = innerHeight * 0.78; return o; })()""")
        ov = {k: v for k, v in rects.items() if k != 'dashTop' and not (bx + bw < v[0] or bx > v[2] or by + bh < v[1] or by > v[3])}
        gap = rects['shredBar'][0] - (bx + bw)
        chk('A5 button overlaps no HUD element; clear of dashboard', not ov and by + bh < rects['dashTop'], f'overlaps={list(ov)} gapToSHRED={gap:.0f}px rects={ {k: [round(x) for x in v] if isinstance(v, list) else v for k, v in rects.items()} }')
        await pg.screenshot(path=SH + 'p4g_pause_button.png')
        # sky tap-lock first so a latch is live, then pause with a real touch on the button
        await tap(cdp, 250, 300); await pg.wait_for_timeout(200)
        s0 = await snap(pg); print('   before pause:', {k: s0[k] for k in ('hold', 'latch', 'pressId', 'skyTaps', 'padPress', 'ft')})
        await pg.wait_for_function("window.__cr9.S.latch || !window.__cr9.S.fight || window.__cr9.S.fight.ships.length === 0", timeout=5000)
        cx, cy = (await center(pg, '#pauseBtn'))[:2]
        pre = await snap(pg); await tap(cdp, cx, cy); await pg.wait_for_timeout(250)
        s1 = await snap(pg)
        chk('A6 tap on button pauses; menu shown; button hidden', s1['paused'] and s1['menu'] and not s1['btn'])
        chk('A7 button tap fired no beam / tap-lock / press', s1['pressId'] == pre['pressId'] and s1['skyTaps'] == pre['skyTaps'] and s1['padPress'] == pre['padPress'], f"pressId {pre['pressId']}->{s1['pressId']} skyTaps {pre['skyTaps']}->{s1['skyTaps']}")
        chk('A8 beam latch / hold released on pause', not s1['hold'] and not s1['latch'], f"latch before pause={pre['latch']}")
        chk('A9 audio: ctx suspended, song + stem paused, guitar-stem gain 0', s1['ctx'] == 'suspended' and s1['songPaused'] and s1['stemPaused'] and s1['stemGain'] < 0.001, f"ctx={s1['ctx']} stemGain={s1['stemGain']}")
        await pg.screenshot(path=SH + 'p4g_pause_menu.png')
        # taps on the overlay (blank area, panel, between buttons) never reach the game
        for (x, y) in [(40, 120), (206, 700), (206, 880), (20, 450), (380, 40)]: await tap(cdp, x, y)
        await touch(cdp, 'touchStart', 206, 800); await asyncio.sleep(0.3); await touch(cdp, 'touchEnd')
        await pg.wait_for_timeout(200); s2 = await snap(pg)
        chk('A10 touches on the pause overlay never reach the game (no press, no beam, no grab tap)', s2['pressId'] == s1['pressId'] and s2['padPress'] == s1['padPress'] and s2['skyTaps'] == s1['skyTaps'] and s2['grabTaps'] == s1['grabTaps'] and not s2['hold'] and s2['paused'])
        # freeze: 5 s paused
        await pg.wait_for_timeout(5000); s3 = await snap(pg)
        same = lambda k: s3[k] == s1[k]
        chk('A11 game frozen 5 s: fight time, game clock, run time, score, ships, particles, frames, hit-stop', all(same(k) for k in ('ft', 'now', 'runDur', 'score', 'ships', 'particles', 'frames', 'hitStop', 'kills', 'shred')), f"ft {s1['ft']:.3f}->{s3['ft']:.3f} runDur {s1['runDur']:.3f}->{s3['runDur']:.3f} now {s1['now']:.1f}->{s3['now']:.1f} frames {s1['frames']}->{s3['frames']} ships {s1['ships']}")
        chk('A12 audio frozen: ctx clock + song/stem time unchanged and still suspended', s3['ctx'] == 'suspended' and s3['ctxT'] == s1['ctxT'] and s3['songT'] == s1['songT'] and s3['stemT'] == s1['stemT'], f"ctxT {s1['ctxT']:.3f}->{s3['ctxT']:.3f} songT {s1['songT']:.3f}->{s3['songT']:.3f}")
        chk('A13 render loop stopped while paused (no frames rendered)', s3['frames'] == s1['frames'])
        # sampler: per-frame fight-time jumps after resume
        await ev("window.__jump = { max: 0, last: null, n: 0 }; (function f() { const S = window.__cr9.S, F = S.fight; if (F && !S.paused) { if (window.__jump.last != null) { const d = F.t - window.__jump.last; window.__jump.max = Math.max(window.__jump.max, d); window.__jump.n++; } window.__jump.last = F.t; } else window.__jump.last = null; requestAnimationFrame(f); })()")
        # tap RESUME
        await ev("window.__cd = []; new MutationObserver(() => { const t = document.getElementById('pmCount').textContent; if (t) window.__cd.push(t); }).observe(document.getElementById('pmCount'), { childList: true, characterData: true, subtree: true })")  # p4h: the countdown is 0.5 s a beat now; watch the digits in-page
        rx, ry = (await center(pg, '#pmResume'))[:2]; await tap(cdp, rx, ry)
        await pg.wait_for_timeout(500); sc = await snap(pg)
        chk('A14 RESUME shows the 3-2-1 countdown with the game still frozen', sc['cd'] and sc['cdTxt'] in ('3', '2', '1') and sc['paused'] and sc['ft'] == s1['ft'] and sc['now'] == s1['now'], f"countdown shows {sc['cdTxt']!r}")
        seen = {sc['cdTxt']}
        for _ in range(16):
            await pg.wait_for_timeout(150); t = await snap(pg); seen.add(t['cdTxt']) if t['cd'] else None
            if not t['paused']: break
        seen |= set(await ev('window.__cd'))
        sr = await snap(pg); await pg.wait_for_timeout(700); sr2 = await snap(pg)
        chk('A15 countdown showed 3, 2, 1 then the game restarted', {'3', '2', '1'} <= seen and not sr['paused'] and sr['ctx'] == 'running', f'seen={sorted(seen)}')
        chk('A16 game clock continued from where it stopped (no time jump): NOW() and run time', sr['runDur'] - s1['runDur'] < 0.5 and sr['now'] - s1['now'] < 800, f"runDur {s1['runDur']:.3f}->{sr['runDur']:.3f} (paused ~8 s wall) fight.t {s1['ft']:.3f}->{sr['ft']:.3f}")
        jm = await ev('window.__jump')
        chk('A17 no dt spike after resume: largest per-frame fight-time step < 0.12 s', jm['max'] < 0.12 and jm['n'] > 3, f"max step {jm['max']:.3f} over {jm['n']} frames")
        chk('A18 audio resumed together: ctx running, song + stem playing, stem within 50 ms of song, song continued from the same spot', sr2['ctx'] == 'running' and not sr2['songPaused'] and not sr2['stemPaused'] and abs(sr2['stemT'] - sr2['songT']) < 0.05 and 0 <= sr2['songT'] - s1['songT'] < 2.0, f"songT {s1['songT']:.2f}->{sr2['songT']:.2f} stemT {sr2['stemT']:.2f} stemGain {sr2['stemGain']:.2f}")
        chk('A19 button back after resume, run goes on', sr2['btn'] and sr2['state'] == 'run' and sr2['frames'] > s3['frames'])
        st = await ev('window.__cr9.stats'); texmb = await ev("(() => { let b = 0; const seen = new Set(); for (const t of Object.values(window.__cr9.G.tex)) { const i = t && t.image; if (i && i.width && !seen.has(i)) { seen.add(i); b += i.width * i.height * 4 * 1.34; } } return b / 1048576; })()")
        chk('A20 draw calls < 45 and texture memory < 64 MB', st['draws'] < 45 and texmb < 64, f"draws={st['draws']} textures={st['textures']} texMB~{texmb:.1f}")
        # keyboard
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); k1 = await snap(pg)
        await pg.keyboard.press('Space'); await pg.wait_for_timeout(200); k1b = await snap(pg)
        await pg.keyboard.press('p'); await pg.wait_for_timeout(500); k2 = await snap(pg)
        chk('A21 Esc pauses, Space does not beam while paused, P resumes (countdown)', k1['paused'] and not k1b['hold'] and k2['counting'] and k2['paused'])
        await pg.wait_for_function("!window.__cr9.S.paused", timeout=8000); await pg.keyboard.press('p'); await pg.wait_for_timeout(300); k3 = await snap(pg)
        chk('A22 P pauses again', k3['paused'])
        # hidden tab while paused stays paused; resume -> hidden -> auto pause
        await ev("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))")
        await ev("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_timeout(300); v1 = await snap(pg)
        chk('A23 hide+show while paused: stays paused and silent (no auto-resume)', v1['paused'] and v1['ctx'] == 'suspended' and v1['songPaused'])
        rx, ry = (await center(pg, '#pmResume'))[:2]; await tap(cdp, rx, ry); await pg.wait_for_function("!window.__cr9.S.paused", timeout=8000); await pg.wait_for_timeout(300)
        await ev("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(300); v2 = await snap(pg)
        await ev("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
        chk('A24 tab hidden during a run auto-pauses (menu up, audio suspended)', v2['paused'] and v2['menu'] and v2['ctx'] == 'suspended' and await ev('window.__cr9.S.pauseWhy') == 'hidden')
        # hidden during the countdown cancels it
        rx, ry = (await center(pg, '#pmResume'))[:2]; await tap(cdp, rx, ry); await pg.wait_for_timeout(500)
        await ev("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(300); v3 = await snap(pg)
        await ev("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(2500); v4 = await snap(pg)
        chk('A25 tab hidden during the countdown cancels it back to the menu (still frozen)', v3['paused'] and not v3['cd'] and v4['paused'] and not v4['counting'] and v4['ft'] == v3['ft'], f"after 2.5 s: paused={v4['paused']} cd={v4['cd']}")
        # ================= B: "Sure?" + RESTART =================
        # build some state to be reset
        rx, ry = (await center(pg, '#pmResume'))[:2]; await tap(cdp, rx, ry); await pg.wait_for_function("!window.__cr9.S.paused", timeout=8000)
        await ev("window.__cr9.S.shred = 55; window.__cr9.S.souls = 2; window.__cr9.S.kills = 2; window.__cr9.S.streak = 2; window.__cr9.S.score = 4321;"); await pg.wait_for_timeout(300)
        await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(400)
        rrx, rry = (await center(pg, '#pmRestart'))[:2]; await tap(cdp, rrx, rry); await pg.wait_for_timeout(250)
        t1 = await ev("document.getElementById('pmRestart').textContent"); s_b1 = await snap(pg)
        chk('B1 first RESTART tap only asks "SURE?" (nothing restarts)', 'SURE' in t1 and s_b1['paused'] and s_b1['kills'] == 2, repr(t1))
        mx, my = (await center(pg, '#pmMenu'))[:2]; await tap(cdp, 206, 120); await pg.wait_for_timeout(250); t2 = await ev("document.getElementById('pmRestart').textContent")
        chk('B2 a tap elsewhere cancels "Sure?"', t2 == 'RESTART', repr(t2))
        await tap(cdp, rrx, rry); await pg.wait_for_timeout(3400); t3 = await ev("document.getElementById('pmRestart').textContent"); s_b3 = await snap(pg)
        chk('B3 "Sure?" times out after ~3 s (still paused, still on the same run)', t3 == 'RESTART' and s_b3['paused'] and s_b3['kills'] == 2, repr(t3))
        await tap(cdp, rrx, rry); await pg.wait_for_timeout(250); await tap(cdp, mx, my); await pg.wait_for_timeout(250); t4 = [await ev("document.getElementById('pmRestart').textContent"), await ev("document.getElementById('pmMenu').textContent")]
        chk('B4 arming MAIN MENU disarms RESTART (only one "Sure?" at a time)', t4[0] == 'RESTART' and 'SURE' in t4[1], repr(t4))
        await tap(cdp, rrx, rry); await pg.wait_for_timeout(250); await tap(cdp, rrx, rry); await pg.wait_for_timeout(900); s_r = await snap(pg)
        full = await ev("(() => { const S = window.__cr9.S; return { souls: S.souls, kills: S.kills, score: S.score, streak: S.streak, bestStreak: S.bestStreak, cowPts: S.cowPts, cowHits: S.cowHits, shred: S.shred, lives: S.lives, firstKill: S.firstKill, wave: S.fight.wave, locked: !!S.fight.locked, hyper: !!S.hyper, grab: !!S.grab, hold: S.hold, latch: S.latch, restarts: S.restarts, paused: S.paused, scoreTxt: document.getElementById('scoreN').textContent, shredW: document.getElementById('shredFill').style.width, ships: S.fight.ships.length, firstShipT: S.firstShipT, runDur: window.__cr9.pause.runDur(), tq: window.__cr9.pause.TQ.size, abducted: S.abducted, state: S.state }; })()")
        chk('B5 second tap RESTARTs: fresh run from wave 1 (score, souls, streak, SHRED, lives, first kill, locks all reset)', full['state'] == 'run' and full['souls'] == 0 and full['kills'] == 0 and full['score'] == 0 and full['streak'] == 0 and full['bestStreak'] == 0 and full['shred'] == 0 and full['lives'] == 3 and full['firstKill'] is None and full['wave'] == -1 and not full['locked'] and not full['hyper'] and not full['grab'] and not full['hold'] and not full['paused'] and full['scoreTxt'] == '0' and full['shredW'] in ('0%', '0px', ''), json.dumps(full))
        chk('B6 restart run clock restarted (run time ~1 s, not the old run\'s)', full['runDur'] < 3.0, f"runDur={full['runDur']:.2f}")
        chk('B7 restart did not reload the page and submitted no score', await ev('window.__cr9.S.restarts') == 1 and not posts, f'posts={len(posts)}')
        await wait_live(pg, 0.3); await pg.wait_for_timeout(500)
        wv = await ev("(() => { const F = window.__cr9.S.fight; return { wave: F.wave, label: F.wave >= 0 ? 'ok' : '', ships: F.ships.filter(s => s.alive).length }; })()")
        chk('B8 restarted game plays: wave 1 arrives with a ship', wv['wave'] == 0 and wv['ships'] >= 1, json.dumps(wv))
        await touch(cdp, 'touchStart', 206, 820); await asyncio.sleep(0.3); hh = await ev('window.__cr9.S.hold'); await touch(cdp, 'touchEnd')
        chk('B9 dashboard touch still starts the beam after a restart', hh)
        # ================= C: MAIN MENU =================
        await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(400)
        mx, my = (await center(pg, '#pmMenu'))[:2]; await tap(cdp, mx, my); await pg.wait_for_timeout(250); await tap(cdp, mx, my);
        c1 = await ev("(() => { const c = window.__cr9, S = c.S, A = c.A; return { state: S.state, title: !document.getElementById('titleCard').classList.contains('hidden'), start: document.getElementById('startText').textContent, hud: !document.getElementById('hud').classList.contains('hidden'), score: !document.getElementById('scoreHud').classList.contains('hidden'), btn: !document.getElementById('pauseBtn').classList.contains('hidden'), menu: !document.getElementById('pauseMenu').classList.contains('hidden'), ctx: A.ctx.state, songPaused: A.songEl.paused, stemPaused: A.stemEl.paused, loops: A.loops.size, voices: A.voices.length, hero: c.W.hero.visible, faces: c.GR.some(g => g.face.visible), fight: !!S.fight, paused: S.paused, menus: S.menus }; })()")
        chk('B10 MAIN MENU (after Sure?) shows the title; HUD, score, pause button, menu all hidden', c1['state'] == 'title' and c1['title'] and not c1['hud'] and not c1['score'] and not c1['btn'] and not c1['menu'] and not c1['paused'] and not c1['fight'] and not c1['hero'] and not c1['faces'], json.dumps(c1))
        chk('B11 audio reset: no loops/voices, song + stem stopped, ctx running', c1['loops'] == 0 and c1['songPaused'] and c1['stemPaused'] and c1['ctx'] == 'running', f"loops={c1['loops']} voices={c1['voices']} ctx={c1['ctx']}")
        chk('B12 no score submitted by leaving to the menu', not posts)
        await pg.screenshot(path=SH + 'p4g_main_menu_title.png')
        await pg.wait_for_timeout(500); await pg.tap('#titleCard', position={'x': 200, 'y': 450}); await pg.wait_for_function("window.__cr9.S.state === 'run'", timeout=20000)
        await wait_live(pg, 0.3); await pg.wait_for_timeout(700)
        c3 = await ev("(() => { const S = window.__cr9.S, A = window.__cr9.A; return { wave: S.fight.wave, souls: S.souls, score: S.score, ships: S.fight.ships.filter(s => s.alive).length, songPaused: A.songEl.paused, ctx: A.ctx.state, truck: !!(S.beds && S.beds.truck), hero: window.__cr9.W.hero.visible, hud: !document.getElementById('hud').classList.contains('hidden'), btn: !document.getElementById('pauseBtn').classList.contains('hidden') }; })()")
        chk('B14 new game from the title starts normally (wave 1, music, truck loop, HUD, pause button)', c3['wave'] == 0 and c3['souls'] == 0 and c3['score'] == 0 and c3['ships'] >= 1 and not c3['songPaused'] and c3['ctx'] == 'running' and c3['truck'] and c3['hero'] and c3['hud'] and c3['btn'], json.dumps(c3))
        await touch(cdp, 'touchStart', 206, 820); await asyncio.sleep(0.3); hh = await ev('window.__cr9.S.hold'); await touch(cdp, 'touchEnd')
        chk('B15 beam works in the new game', hh)
        # B13 (deterministic, in-page): MAIN MENU then a title pointerup in the same tick must NOT start a game (the tap that chose MAIN MENU can land on the title card)
        c2 = await ev("(() => { const c = window.__cr9; c.pause.pause(); c.pause.menu(); document.getElementById('titleCard').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return [c.S.state, c.S.menuTitle]; })()")
        await pg.wait_for_timeout(300); c2b = await ev('window.__cr9.S.state')
        chk('B13 a title tap in the first 0.5 s after MAIN MENU does not start a game by accident', c2[0] == 'title' and c2[1] is False and c2b == 'title', f'{c2} then {c2b}')
        await pg.wait_for_timeout(500); await pg.tap('#titleCard', position={'x': 200, 'y': 450}); await pg.wait_for_function("window.__cr9.S.state === 'run'", timeout=20000); await wait_live(pg, 0.3); await pg.wait_for_timeout(300)
        chk('B13b after 0.5 s the title starts a new game again', await ev("window.__cr9.S.state === 'run' && window.__cr9.S.fight.wave >= 0"))
        # ================= D: SHRED, HYPER, grab =================
        await ev("window.__cr9.S.shred = 100"); await pg.wait_for_timeout(500)
        sd = await ev("!document.getElementById('shredBtn').classList.contains('hidden')")
        await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(300); d1 = await snap(pg)
        await pg.wait_for_timeout(1500); d2 = await snap(pg)
        chk('D1 pause while the SHRED bar is full: bar value + game frozen', sd and d1['paused'] and d2['shred'] == 100 and d2['ft'] == d1['ft'])
        await ev('window.__cr9.pause.resume()'); await pg.wait_for_function("!window.__cr9.S.paused", timeout=8000); await pg.wait_for_timeout(300)
        await ev("window.__cr9.p3.startHyper()"); await pg.wait_for_timeout(1000)
        h0 = await snap(pg); await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(300); h1 = await snap(pg); await pg.wait_for_timeout(3000); h2 = await snap(pg)
        chk('D2 pause during HYPER/SHRED: hyper timer frozen, audio suspended, beam released', h1['hyperT'] is not None and h2['hyperT'] == h1['hyperT'] and h2['ctx'] == 'suspended' and not h2['hold'], f"hyper.t {h0['hyperT']:.2f}->{h1['hyperT']:.2f}->{h2['hyperT']:.2f}")
        await ev('window.__cr9.pause.resume()'); await pg.wait_for_function("!window.__cr9.S.paused", timeout=8000); await pg.wait_for_timeout(1000); h3 = await snap(pg)
        chk('D3 HYPER continues after resume (or ended on its own clock)', (h3['hyperT'] is None) or (h3['hyperT'] > h2['hyperT'] and h3['hyperT'] - h2['hyperT'] < 2.0), f"hyper.t {h2['hyperT']} -> {h3['hyperT']}")
        # grab
        await pg.wait_for_timeout(6500)  # let HYPER end
        await pg.wait_for_function("(() => { const S = window.__cr9.S; return S.state === 'run' && !S.grab && !S.lift && S.fight && S.fight.ships.some(s => s.alive && s.Z < 26 && !['peek','flee','dive'].includes(s.man.kind)); })()", timeout=40000); await ev('window.__cr9.test.grab()'); await pg.wait_for_timeout(1000); g0 = await snap(pg)
        if g0['grab']:
            await pg.wait_for_function("document.getElementById('pauseBtn') && !document.getElementById('pauseBtn').classList.contains('hidden')", timeout=5000)
            cx, cy = (await center(pg, '#pauseBtn'))[:2]; pre = await snap(pg); await tap(cdp, cx, cy); await pg.wait_for_timeout(300); g1 = await snap(pg); await pg.wait_for_timeout(3000); g2 = await snap(pg)
            chk('D4 pause during an abduction grab: button works, its tap is NOT a break-free tap, grab frozen', g1['paused'] and g1['grabTaps'] == pre['grabTaps'] and g2['grab'] == g1['grab'], f"grabTaps {pre['grabTaps']}->{g1['grabTaps']} grab {g1['grab']}")
            await ev('window.__cr9.pause.resume()'); await pg.wait_for_function("!window.__cr9.S.paused", timeout=8000); await pg.wait_for_timeout(500); g3 = await snap(pg)
            chk('D5 grab continues after resume', g3['grab'] is not None or g3['state'] != 'run' or g3['lives'] < 3, f"grab={g3['grab']} lives={g3['lives']}")
        else: chk('D4 grab test could not start a grab (skipped)', False, 'test hook returned no grab')
        await ev("window.__cr9.S.grab = null") if False else None
        chk('Z1 no console errors / warnings / page errors (part A-D)', not errs, json.dumps(errs[:6]))
        chk('Z2 no score POST anywhere in part A-D', not posts, f'{len(posts)} posts')
        await pg.context.close()
        # ================= E: first-kill clock (DANA) =================
        async def fk_run(pause_s):
            pg, cdp, errs, posts = await mk(b); ev = E(pg); await start_run(pg, cdp); await wait_live(pg, 0.1)
            info = {}
            if pause_s:
                await pg.wait_for_function("window.__cr9.S.fight.t > 2.0", timeout=30000)
                info['pre'] = await snap(pg); await ev('window.__cr9.pause.pause()'); info['p0'] = await snap(pg); await pg.wait_for_timeout(pause_s * 1000); info['mid'] = await snap(pg)
                await ev('window.__cr9.pause.resume()'); await pg.wait_for_function("!window.__cr9.S.paused", timeout=10000); info['post'] = await snap(pg)
            await pg.wait_for_function("window.__cr9.S.fight.t > 4.7 && window.__cr9.S.fight.ships.some(s => s.alive)", timeout=60000)
            info['ftKill'] = await ev('window.__cr9.S.fight.t')
            await ev("(() => { const S = window.__cr9.S; window.__cr9.p2.kill(S.fight.ships.find(s => s.alive)); })()"); await pg.wait_for_timeout(1500)
            o = await ev("(() => { const S = window.__cr9.S; return { firstKill: S.firstKill, runDur: window.__cr9.pause.runDur(), wall: performance.now() - S.runT0 - window.__cr9.pause.PZ.total + window.__cr9.pause.PZ.total, runT0: S.runT0, pzTotal: window.__cr9.pause.PZ.total, score: S.score, souls: S.souls, kills: S.kills, bestStreak: S.bestStreak, cowPts: S.cowPts, cowHits: S.cowHits, pointBlanks: S.pointBlanks, abducted: !!S.abducted, ft: S.fight.t }; })()")
            info['o'] = o; info['errs'] = errs; info['posts'] = posts; await pg.context.close(); return info
        ctl = await fk_run(0); pz = await fk_run(7)
        for nm, r in (('control (no pause)', ctl), ('paused 7 s mid-run', pz)):
            o = r['o']; run = {'name': 'TESTER', 'score': o['score'], 'souls': o['souls'], 'kills': o['kills'], 'bestStreak': o['bestStreak'], 'cowPts': o['cowPts'], 'cowHits': o['cowHits'], 'pointBlanks': o['pointBlanks'], 'firstKill': o['firstKill'], 'abducted': False, 'dur': round(o['runDur'], 1), 'v': '4.7.0'}
            r['run'] = run; r['verdict'] = verdict(run); print(f"   {nm}: firstKill={o['firstKill']} s, run time at +1.5 s after kill={o['runDur']:.2f} s, fight.t={o['ft']:.2f}, PZ.total={o['pzTotal']:.0f} ms, server verdict={r['verdict']}")
        pre, mid, post, p0 = pz['pre'], pz['mid'], pz['post'], pz['p0']
        chk('E1 run clock stops while paused: run time identical before/during the 7 s pause', mid['runDur'] == p0['runDur'] and mid['now'] == p0['now'] and mid['ft'] == p0['ft'], f"runDur {p0['runDur']:.3f} (at pause) -> {mid['runDur']:.3f} (7 s later)")
        chk('E2 run time right after resume equals the pre-pause value (paused wall time + countdown excluded)', post['runDur'] - p0['runDur'] < 0.3, f"{p0['runDur']:.3f} -> {post['runDur']:.3f}; PZ.total={pz['o']['pzTotal'] / 1000:.1f} s excluded")
        chk('E3 first-kill time with a 7 s pause (~game time) matches the control run: it did not absorb the pause', pz['o']['firstKill'] < pz['ftKill'] + 3.0 and abs(pz['o']['firstKill'] - ctl['o']['firstKill']) < 3.0 and pz['o']['firstKill'] < 9.0, f"control firstKill {ctl['o']['firstKill']} s (fight.t at kill {ctl['ftKill']:.2f}) vs paused-run firstKill {pz['o']['firstKill']} s (fight.t at kill {pz['ftKill']:.2f}); the pause + countdown was {pz['o']['pzTotal'] / 1000:.1f} s of wall time and is NOT in it (game clock can lag fight.t by the 0.1 s dt cap under software GL)")
        chk('E4 both runs validate on the real server rules (api/_lib.mjs checkRun) incl. FK_MIN 4.3', ctl['verdict'] == 'OK' and pz['verdict'] == 'OK', f"control={ctl['verdict']} paused={pz['verdict']}")
        chk('E5 no console errors in E', not ctl['errs'] and not pz['errs'], json.dumps(ctl['errs'][:3] + pz['errs'][:3]))
        await b.close()
    bad = [r for r in R if not r[1]]
    print(f'\n==== {len(R) - len(bad)}/{len(R)} passed ====')
    for r in bad: print('FAILED:', r[0], r[2])
    json.dump(R, open('/workspace/cr9-v44/shots/p4g_pause_test_results.json', 'w'), indent=1)
asyncio.run(main())
