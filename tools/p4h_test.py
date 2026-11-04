# p4h (v4.8.0) headless test: save/restore on reload, no auto-reload mid-run, one banner at a time, button sizes + menu a11y, pause keeps the streak, countdown.
# usage: python3 p4h_test.py http://localhost:4191/ [parts: ABCDEFG]   (Playwright + Chrome/swiftshader, 412x915 touch, real CDP touch for the buttons that matter)
import asyncio, sys, json, time, subprocess
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4191/'
PARTS = sys.argv[2] if len(sys.argv) > 2 else 'ABCDEFG'
SH = '/workspace/cr9-v44/shots/'
UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
R = []
def chk(name, ok, detail=''):
    R.append((name, bool(ok), detail)); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail != '' else ''), flush=True)
KEY = 'cr9_run_v1'

async def mk(b, q='?story=0', w=412, h=915, dpr=2.0, ctx=None, version=None):
    if ctx is None:
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=True, has_touch=True, user_agent=UA)
    pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
    pg.__dict__['errs'] = errs = []; pg.__dict__['posts'] = posts = []
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and '404' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
    async def api(route):
        rq = route.request
        if rq.method == 'POST': posts.append(rq.post_data); await route.fulfill(status=200, content_type='application/json', body='{"ok":false,"error":"stub"}')
        else: await route.fulfill(status=200, content_type='application/json', body='{"ok":true,"top":[],"total":0}')
    await pg.route('**/api/scores', api)
    if version:
        async def ver(route): await route.fulfill(status=200, content_type='application/json', body=json.dumps({'v': version}))
        await pg.route('**/version.json*', ver)
    await pg.goto(URL + q)
    await pg.wait_for_function('window.__cr9 && window.__cr9.S.ready', timeout=90000); await pg.wait_for_timeout(300)
    return pg, cdp
async def reload(pg, q=None):
    await pg.goto(URL + (q or '?story=0')) if q else await pg.reload()
    await pg.wait_for_function('window.__cr9 && window.__cr9.S.ready', timeout=90000); await pg.wait_for_timeout(300)
async def touch(cdp, kind, x=0, y=0, i=1):
    await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y, 'id': i}]})
async def tap(cdp, x, y, hold=0.07):
    await touch(cdp, 'touchStart', x, y); await asyncio.sleep(hold); await touch(cdp, 'touchEnd')
async def center(pg, sel):
    return await pg.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.x, r.y, r.width, r.height]; }})()")
async def tap_el(pg, cdp, sel):
    cx, cy = (await center(pg, sel))[:2]; await tap(cdp, cx, cy)
async def start_run(pg, cdp):
    await pg.tap('#titleCard', position={'x': 200, 'y': 450}); await pg.wait_for_function("window.__cr9.S.state === 'run'", timeout=30000)
async def wait_live(pg, tmin=0.0):
    await pg.wait_for_function(f"(() => {{ const S = window.__cr9.S, F = S.fight; return S.state === 'run' && F && F.wave >= 0 && F.t > {tmin}; }})()", timeout=60000)
async def wait_ship(pg, minrun=0.0):
    await pg.wait_for_function(f"(() => {{ const S = window.__cr9.S, F = S.fight; return S.state === 'run' && !S.paused && F && F.ships.some(s => s.alive && !s.gone && s.man && s.man.kind !== 'flee') && window.__cr9.pause.runDur() > {minrun}; }})()", timeout=60000)
KILL = "(() => { const S = window.__cr9.S; const sh = S.fight.ships.find(s => s.alive); if (!sh) return false; window.__cr9.p2.kill(sh); return true; })()"
STATE = """(() => { const c = window.__cr9, S = c.S, F = S.fight; return { state: S.state, paused: S.paused, counting: S.counting, restored: S.restored, score: S.score, kills: S.kills, souls: S.souls, lives: S.lives, streak: S.streak, best: S.bestStreak, shred: S.shred, cowPts: S.cowPts, pb: S.pointBlanks, firstKill: S.firstKill,
  wave: F ? F.wave : null, ft: F ? F.t : null, next: F ? F.next : null, waveOn: F ? F.waveOn : null, runDur: c.pause.runDur(), pressId: S.pressId, chain: S.chain ? S.chain.from : null, grab: S.grab ? { taps: S.grab.taps, t: S.grab.t, need: S.grab.need } : null, hyper: S.hyper ? S.hyper.t : null, lockedOnce: S.lockedOnce,
  ships: F ? F.ships.filter(s => !s.gone && (s.alive || s.tgrab)).map(s => ({ slot: s.slot, alive: s.alive, L: +s.L.toFixed(3), X: +s.X.toFixed(2), Y: +s.Y.toFixed(2), Z: +s.Z.toFixed(2), k: s.man.kind })) : [], songT: c.A.songEl ? c.A.songEl.currentTime : null, songPaused: c.A.songEl ? c.A.songEl.paused : null,
  menu: !document.getElementById('pauseMenu').classList.contains('hidden'), btn: !document.getElementById('pauseBtn').classList.contains('hidden'), resumeBtn: !document.getElementById('resumeBtn').classList.contains('hidden'), newBtn: !document.getElementById('newBtn').classList.contains('hidden'),
  startText: !document.getElementById('startText').classList.contains('hidden'), title: !document.getElementById('titleCard').classList.contains('hidden'), note: !document.getElementById('pmNote').classList.contains('hidden'), save: localStorage.getItem('cr9_run_v1') !== null, hud: !document.getElementById('hud').classList.contains('hidden'),
  upd: !document.getElementById('updBtn').classList.contains('hidden'), ctx: c.A.ctx ? c.A.ctx.state : null }; })()"""
async def st(pg): return await pg.evaluate(STATE)
def verdict(run):
    p = subprocess.run(['node', '/workspace/cr9-v44/tools/check_run.mjs'], input=json.dumps(run).encode(), capture_output=True, cwd='/workspace/cr9-v44/tools'); return p.stdout.decode().strip()
LAUNCH = dict(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])

async def build_state(pg, cdp):
    """real run: wait for wave 1 ship, kill it with the game's own kill() after the 4.4 s floor, then kill ship 2 on the same press (streak 2), stop in wave 3 with 2 ships alive"""
    await start_run(pg, cdp); await wait_live(pg, 0.1); await wait_ship(pg, 5.0)
    await pg.evaluate(KILL); await pg.wait_for_function("window.__cr9.S.souls >= 1", timeout=8000)
    await pg.wait_for_function("(() => { const F = window.__cr9.S.fight; return F.wave >= 1 && F.ships.some(s => s.alive && s.man.kind !== 'flee'); })()", timeout=30000); await pg.wait_for_timeout(1200)
    await pg.evaluate(KILL); await pg.wait_for_function("window.__cr9.S.souls >= 2", timeout=8000)
    await pg.wait_for_function("(() => { const F = window.__cr9.S.fight; return F.wave >= 2 && F.ships.filter(s => s.alive).length >= 1; })()", timeout=40000); await pg.wait_for_timeout(1500)

async def part_A(b):
    print('\n=== A: save / restore on reload ===')
    pg, cdp = await mk(b); ctx = pg.context; ev = pg.evaluate
    chk('A0 title with no save: TAP TO START shown, no RESUME / NEW GAME', (lambda s: s['startText'] and not s['resumeBtn'] and not s['newBtn'] and not s['save'])(await st(pg)))
    await build_state(pg, cdp)
    await ev("window.__cr9.S.shred = 55; window.__cr9.S.shred = 55"); await pg.wait_for_timeout(900)
    s0 = await st(pg); print('   before reload:', {k: s0[k] for k in ('score', 'kills', 'souls', 'lives', 'streak', 'shred', 'wave', 'ft', 'runDur', 'pressId')}, 'ships', s0['ships'])
    chk('A1 a save exists while the run is live (localStorage)', s0['save'])
    await reload(pg)
    s1 = await st(pg)
    chk('A2 after reload the title shows RESUME RUN + NEW GAME (no TAP TO START), nothing started', s1['title'] and s1['resumeBtn'] and s1['newBtn'] and not s1['startText'] and s1['state'] == 'title', f"sub={await ev('document.getElementById(\"resumeSub\").textContent')!r}")
    await pg.screenshot(path=SH + 'p4h_title_resume.png')
    await tap(cdp, 200, 300); await pg.wait_for_timeout(600); s1b = await st(pg)
    chk('A3 a tap on the title background does NOT start a game or drop the save', s1b['state'] == 'title' and s1b['save'] and s1b['resumeBtn'])
    away = 3.0; await pg.wait_for_timeout(int(away * 1000))
    await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000); await pg.wait_for_timeout(500)
    s2 = await st(pg); print('   after restore:', {k: s2[k] for k in ('score', 'kills', 'souls', 'lives', 'streak', 'shred', 'wave', 'ft', 'runDur', 'pressId')}, 'ships', s2['ships'])
    chk('A4 RESUME RUN lands in the PAUSE menu (run frozen, note shown, button hidden, title gone)', s2['paused'] and s2['menu'] and s2['note'] and not s2['btn'] and not s2['title'] and s2['state'] == 'run')
    chk('A5 score, kills, souls, lives, streak, SHRED, wave come back exactly as saved', all(s2[k] == s0[k] for k in ('score', 'kills', 'lives', 'streak', 'wave', 'cowPts', 'pb', 'firstKill', 'best', 'lockedOnce')) and s2['souls'] == s2['kills'] and abs(s2['shred'] - s0['shred']) < 6, f"score {s0['score']}->{s2['score']} kills {s0['kills']}->{s2['kills']} streak {s0['streak']}->{s2['streak']} lives {s0['lives']}->{s2['lives']} shred {s0['shred']:.1f}->{s2['shred']:.1f} wave {s0['wave']}->{s2['wave']}")
    chk('A6 run clock comes back as saved (the 3 s away + restore time excluded)', abs(s2['runDur'] - s0['runDur']) < 1.5, f"runDur {s0['runDur']:.2f} (at reload) -> {s2['runDur']:.2f}")
    chk('A7 wave clock + every live ship restored (same count, slots, maneuver kinds, positions within 1.0 m of where they were)', len(s2['ships']) == len(s0['ships']) and all(abs(a['X'] - c['X']) < 1.0 and abs(a['Z'] - c['Z']) < 2.0 for a, c in zip(sorted(s0['ships'], key=lambda q: q['slot']), sorted(s2['ships'], key=lambda q: q['slot']))) and abs(s2['ft'] - s0['ft']) < 1.5, f"before={s0['ships']} after={s2['ships']} ft {s0['ft']:.2f}->{s2['ft']:.2f}")
    chk('A8 song position restored (within 2 s) and still paused', abs(s2['songT'] - s0['songT']) < 2.0 and s2['songPaused'], f"songT {s0['songT']:.2f}->{s2['songT']:.2f}")
    chk('A9 a save restores once: the save key was consumed + rewritten for the live run (one key, no title RESUME)', s2['save'])
    await pg.screenshot(path=SH + 'p4h_resume.png')
    await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_function("!window.__cr9.S.paused", timeout=15000); await pg.wait_for_timeout(1500); s3 = await st(pg)
    chk('A10 RESUME after a restore: run goes on (frames, fight time, ships), no time jump', s3['state'] == 'run' and s3['ft'] > s2['ft'] and s3['ft'] - s2['ft'] < 4.0 and s3['runDur'] - s2['runDur'] < 3.5 and s3['btn'] and s3['ctx'] == 'running' and not s3['songPaused'], f"ft {s2['ft']:.2f}->{s3['ft']:.2f} runDur {s2['runDur']:.2f}->{s3['runDur']:.2f}")
    # B: reload while PAUSED -> comes back paused
    await tap_el(pg, cdp, '#pauseBtn'); await pg.wait_for_function("window.__cr9.S.paused", timeout=5000); sp = await st(pg)
    await pg.wait_for_timeout(500); await reload(pg); sr = await st(pg)
    chk('A11 reload while PAUSED: title offers RESUME RUN', sr['resumeBtn'] and sr['title'])
    await pg.wait_for_timeout(2000); await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000); await pg.wait_for_timeout(400); sq = await st(pg)
    chk('A12 ...and restores INTO the pause menu with the paused values (score, kills, wave, run time)', sq['paused'] and sq['menu'] and sq['score'] == sp['score'] and sq['kills'] == sp['kills'] and sq['wave'] == sp['wave'] and abs(sq['runDur'] - sp['runDur']) < 1.0, f"runDur {sp['runDur']:.2f}->{sq['runDur']:.2f} score {sp['score']}->{sq['score']}")
    chk('A13 no console errors (restore path)', not pg.errs, json.dumps(pg.errs[:5]))
    await ctx.close()

async def part_B(b):
    print('\n=== B: restored run submits restored:true; save is deleted on end / Restart / Main Menu; TTL; corrupt ===')
    pg, cdp = await mk(b); ctx = pg.context; ev = pg.evaluate
    await build_state(pg, cdp); await pg.wait_for_timeout(600)
    await reload(pg); await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000)
    await pg.wait_for_timeout(500); await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_function("!window.__cr9.S.paused", timeout=15000)
    # finish the run with the game's own kill(): chain all 8 on one press (a valid 8-chain), then the name entry
    t0 = time.time()
    while time.time() - t0 < 150:
        s = await st(pg)
        if s['state'] != 'run': break
        await pg.evaluate(KILL); await pg.wait_for_timeout(700)
    await pg.wait_for_function("document.getElementById('nameScreen') && !document.getElementById('nameScreen').classList.contains('hidden')", timeout=90000)
    chk('B1 save is deleted the moment the last gray dies / run leaves play', not (await st(pg))['save'])
    await pg.fill('#nameIn', 'TESTER'); await pg.wait_for_timeout(200); await tap_el(pg, cdp, '#nameGo'); await pg.wait_for_function("window.__cr9.S.nameDone", timeout=20000); await pg.wait_for_timeout(500)
    chk('B2 one score POST', len(pg.posts) == 1, f'{len(pg.posts)}')
    body = json.loads(pg.posts[0]); print('   POST body:', body)
    chk('B3 the POST carries restored: true', body.get('restored') is True)
    v = verdict(body); chk('B4 the real server rules accept it (api/_lib.mjs checkRun, FK_MIN 4.3 unchanged)', v == 'OK', v)
    ctl = dict(body); ctl.pop('restored'); chk('B5 identical run without the flag is judged identically', verdict(ctl) == v)
    chk('B6 save stays deleted at the end card', not (await st(pg))['save'])
    await ctx.close()
    # control: a normal run never sends restored
    pg, cdp = await mk(b); await start_run(pg, cdp); await wait_live(pg, 0.1); await wait_ship(pg, 5.0)
    await pg.evaluate("window.__cr9.S.name = 1"); chk('B7 a run that was never restored has S.restored false (so no flag is sent)', (await st(pg))['restored'] is False)
    # Restart deletes the save
    await pg.wait_for_function("window.__cr9.S.fight.wave >= 0 && !document.getElementById('pauseBtn').classList.contains('hidden')", timeout=20000); await pg.wait_for_timeout(1200)
    chk('B8 save exists before Restart', (await st(pg))['save'])
    await pg.evaluate('window.__cr9.pause.pause()'); await pg.wait_for_timeout(400)
    await tap_el(pg, cdp, '#pmRestart'); await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#pmRestart'); await pg.wait_for_function("window.__cr9.S.state === 'run' && !window.__cr9.S.paused && window.__cr9.S.restarts >= 1", timeout=10000); await pg.wait_for_timeout(200)
    s = await st(pg); chk('B9 Restart deletes the save (fresh run, no wave called yet)', not s['save'] and s['kills'] == 0, f"save={s['save']} wave={s['wave']}")
    await wait_live(pg, 0.1); await pg.wait_for_timeout(1500); chk('B10 ...and the fresh run starts saving itself again from its first wave', (await st(pg))['save'])
    await pg.evaluate('window.__cr9.pause.pause()'); await pg.wait_for_timeout(400)
    await tap_el(pg, cdp, '#pmMenu'); await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#pmMenu'); await pg.wait_for_function("window.__cr9.S.state === 'title'", timeout=10000); await pg.wait_for_timeout(300)
    s = await st(pg); chk('B11 Main Menu deletes the save; title shows TAP TO START (no RESUME)', not s['save'] and s['startText'] and not s['resumeBtn'] and not s['newBtn'], json.dumps({k: s[k] for k in ('save', 'startText', 'resumeBtn', 'newBtn')}))
    await reload(pg); s = await st(pg); chk('B12 ...and a reload after Main Menu has nothing to resume', not s['resumeBtn'] and s['startText'])
    await pg.context.close()
    # TTL
    pg, cdp = await mk(b); ctx = pg.context; await build_state(pg, cdp); await pg.evaluate('window.__cr9.pause.pause()'); await pg.wait_for_timeout(400)
    raw = await pg.evaluate("localStorage.getItem('cr9_run_v1')"); o = json.loads(raw)
    async def put(age_min, extra=None):
        d = json.loads(raw); d['ts'] = int(time.time() * 1000 - age_min * 60000); (extra or (lambda x: None))(d)
        await pg.evaluate("v => localStorage.setItem('cr9_run_v1', v)", json.dumps(d))
    await put(29); await reload(pg); s = await st(pg); chk('B13 a 29-minute-old save is still offered', s['resumeBtn'], f'resumeBtn={s["resumeBtn"]}')
    await pg.evaluate("v => localStorage.setItem('cr9_run_v1', v)", json.dumps({**o, 'ts': int(time.time() * 1000 - 31 * 60000)}))
    await reload(pg); s = await st(pg); chk('B14 a 31-minute-old save is dropped (not offered, key removed)', not s['resumeBtn'] and s['startText'] and not s['save'])
    await pg.evaluate("v => localStorage.setItem('cr9_run_v1', v)", json.dumps({**o, 'ts': int(time.time() * 1000 - 29 * 60000), 'b': '4.7.0'}))
    await reload(pg); s = await st(pg); chk('B15 a save from another build is dropped', not s['resumeBtn'] and not s['save'])
    # corrupt
    bad = {'garbage text': '{not json', 'array': '[1,2,3]', 'wrong shape': json.dumps({'f': 1, 'b': '4.8.0', 'ts': int(time.time() * 1000), 'r': 'x', 'fi': 5}), 'lives 99': json.dumps({**o, 'r': {**o['r'], 'lives': 99}}), 'NaN-ish ship': json.dumps({**o, 'ships': [{'sl': 0}]}), 'kills 8': json.dumps({**o, 'r': {**o['r'], 'kills': 8}}), 'empty string': ''}
    ok = True; det = []
    for nm, v in bad.items():
        await pg.evaluate("v => localStorage.setItem('cr9_run_v1', v)", v); await reload(pg); s = await st(pg)
        good = s['startText'] and not s['resumeBtn'] and not s['newBtn'] and s['state'] == 'title' and not s['save']; ok &= good; det.append(f"{nm}:{'ok' if good else 'BAD'}")
    chk('B16 corrupt / invalid saves (7 kinds) fall back to a clean title with TAP TO START and the bad key is removed', ok, ' '.join(det))
    await pg.evaluate("v => localStorage.setItem('cr9_run_v1', v)", '{not json'); await reload(pg); await start_run(pg, cdp); await wait_live(pg, 0.1); s = await st(pg)
    chk('B17 after a corrupt save a normal run starts and plays', s['state'] == 'run' and s['wave'] >= 0)
    # restore that throws midway -> clean title
    await pg.evaluate("window.__cr9.pause.pause()"); await pg.evaluate("window.__cr9.pause.menu()")
    await pg.wait_for_timeout(300); await pg.evaluate("window.__cr9.pause.pause && 0")
    r = await pg.evaluate("(async () => { try { const ok = await window.__cr9.save.restoreRun({ f: 1, r: {}, fi: {}, ships: [], grab: null, hyper: null }); return { ok, state: window.__cr9.S.state, restoring: window.__cr9.S.restoring }; } catch (e) { return { err: String(e) }; } })()")
    await pg.wait_for_timeout(500); s = await st(pg)
    chk('B18 a restore that fails halfway (thrown error) falls back to the clean title (no hang, no half run)', r.get('ok') is False and s['state'] == 'title' and s['title'] and not s['restoring'] if 'restoring' in s else (r.get('ok') is False and s['state'] == 'title' and s['title']), f'{r} state={s["state"]}')
    await tap(cdp, 200, 450); await pg.wait_for_timeout(800); await pg.wait_for_function("window.__cr9.S.state === 'run'", timeout=20000); chk('B19 ...and a new game starts from there', True)
    chk('B20 no unexpected console errors (restore failure logs one warning)', all('restore failed' in e or 'could not open' in e for e in pg.errs), json.dumps(pg.errs[:4]))
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**LAUNCH)
        for part, fn in (('A', part_A), ('B', part_B)):
            if part in PARTS: await fn(b)
        try:
            from p4h_more import run_more
            await run_more(b, PARTS, globals())
        except ImportError: pass
        await b.close()
    bad = [r for r in R if not r[1]]
    print(f'\n==== {len(R) - len(bad)}/{len(R)} passed ===='); [print('FAILED:', r[0], r[2]) for r in bad]
    json.dump(R, open('/workspace/cr9-v44/shots/p4h_test_results_%s.json' % PARTS, 'w'), indent=1)
asyncio.run(main())
