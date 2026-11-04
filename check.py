import math
# Headless check for CR9 v4.5 (story card, SHRED/HYPER, bubble-morph cows, VO captions, arcade name entry + WITNESSES board)
# Headless check for CR9 v4.3 AIM & BEAM (Playwright + Chrome/swiftshader, 412x915 Android touch viewport, real CDP touch input).
# Runs: good (aim bot holds the beam on the best target; in wave 2 it lets go at 4.2 s once -> SO CLOSE + air-guitar mock),
# random (random holds + drags), idle (no input: every wave must time out, 0 kills, still an end card), ?skip=duel (last 2-ship pair), ?skip=parade.
import asyncio, sys, random, json, time
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4191/'
ONLY = sys.argv[2].split(',') if len(sys.argv) > 2 else None
SH = '/workspace/cr9-v44/shots/'
UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
RES = {}
MID = {}  # mid seed name -> (kills, trucks lost)
MID_SEEDS = ('mid', 'mid2', 'mid3', 'mid4', 'mid5'); MID_FLOOR = 3; MID_AVG = 4  # Chico's rule: average kills >= 4 across the seeds, no seed under 3, each seed loses <= 1 truck
if ONLY and 'midset' in ONLY: ONLY = [n for n in ONLY if n != 'midset'] + [n for n in MID_SEEDS if n not in ONLY]  # 'midset' = all five mid seeds + the aggregate check
ST = """(() => { const S = window.__cr9.S, F = S.fight; return { state: S.state, wave: F ? F.wave : null, kills: S.kills, souls: S.souls, firstKill: S.firstKill, streak: S.streak,
  locked: !!(F && F.locked), L: F && F.locked ? F.locked.L : 0, maxL: F ? Math.max(0, ...F.ships.filter(s => s.alive).map(s => s.L)) : 0,
  ships: F ? F.ships.filter(s => !s.gone).map(s => [s.man.kind, +s.Z.toFixed(1), s.alive]) : [], tgt: window.__cr9.input.target(), mock: performance.now() < (S.mockUntil || 0),
  pop: W => 0, popT: window.__cr9.W.cowPop.visible ? S.popT : -1, soClose: S.soCloses, streakAge: S.streakShown ? performance.now() - S.streakShown : 1e9,
  take2: !!(F && F.ships.some(s => s.take2)), pose: S.pose, raise: S.hero ? S.hero.raise : 0, bang: S.hero ? S.hero.bang : 0, liftK: S.liftK || 0, dual: !!(F && F.locked2),
  shredBtn: !document.getElementById('shredBtn').classList.contains('hidden'), hyper: !!S.hyper, shred: S.shred || 0, km: S.km ? S.km.t : -1, bald: !!(window.__cr9.W.cowPop.cow && window.__cr9.W.cowPop.cow.bald), react: window.__cr9.W.cowPop.react || '',
  vo: !document.getElementById('vo').classList.contains('hidden'), bill: !!(window.__cr9.W.bill && window.__cr9.W.bill.visible && window.__cr9.W.bill.z < 9),
  grab: S.grab ? (S.grab.lethal ? 'lethal' : S.grab.free ? 'free' : 'held') : '', lives: S.lives,
  call: document.getElementById('cmd').classList.contains('hidden') || performance.now() - (S.callAt || 0) > 900 ? '' : document.getElementById('cmd').textContent }; })()"""
async def run(b, name, mode, shots, skip=None, dpr=2.0, seed=11):
    ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=dpr, is_mobile=True, has_touch=True, user_agent=UA)
    pg = await ctx.new_page(); errs = []; cdp = await ctx.new_cdp_session(pg)
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and not ('localhost' in URL and '404' in m.text) else None)  # local preview has no /api: the board must fail gracefully
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
    posts = []
    if 'localhost' in URL:  # no /api locally: stub it with the REAL server rules (api/_lib.mjs checkRun) so client and server scoring are tested together
        async def api(route):
            rq = route.request
            if rq.method == 'POST':
                body = rq.post_data or ''
                pr = await asyncio.create_subprocess_exec('node', '/workspace/cr9-v44/tools/check_run.mjs', stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)
                out, _ = await pr.communicate(body.encode()); verdict = out.decode().strip(); posts.append([verdict, json.loads(body)])
                if verdict == 'OK': await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': 'local', 'rank': 1, 'total': 1, 'top': [{'rank': 1, 'id': 'local', 'name': json.loads(body)['name'], 'score': json.loads(body)['score'], 'souls': json.loads(body)['souls'], 'abducted': bool(json.loads(body).get('abducted'))}]}))
                else: await route.fulfill(status=400, content_type='application/json', body=json.dumps({'ok': False, 'error': verdict}))
            else: await route.fulfill(status=200, content_type='application/json', body='{"ok":true,"top":[],"total":0}')
        await pg.route('**/api/scores', api)
    await pg.add_init_script("(() => { const L = window.__stut = { n: 0, preKill: 0, on: false, last: 0, worst: 0 }; const f = (t) => { if (L.on && L.last) { const d = t - L.last; if (d > 50) { L.n++; if (window.__cr9 && window.__cr9.S.firstKill == null) L.preKill++; } L.worst = Math.max(L.worst, d); } L.last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); })()")
    await pg.goto(URL + '?fps=1' + (f'&skip={skip}' if skip else ''))
    await pg.wait_for_function("window.__cr9.S.ready", timeout=60000); await pg.wait_for_timeout(300)
    import os
    if os.environ.get('NOBEAM'): await pg.evaluate('window.__cr9.W.col.material.visible = false')
    ev = pg.evaluate; taken = set(); info = {'shots': [], 'released': False, 'moves': 0}
    async def shot(n):
        if shots and n not in taken: taken.add(n); await pg.screenshot(path=SH + f"v44_{'' if name == 'good' else name + '_'}{n}.png"); info['shots'].append(n)
    async def touch(kind, x=0, y=0):
        await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]})
    async def padAim(tx, ty, down):  # p4e: since pass 3 touch only beams from the dashboard pad (bottom 22%); drive the reticle like a thumb (gain 2.5)
        # tx, ty = where the reticle should go (screen px). Returns True (finger down).
        if not down: info['fing'] = [206.0, 830.0]; await touch('touchStart', *info['fing']); await asyncio.sleep(0.02)
        r = await ev("window.__cr9.S.ret"); f = info['fing']
        if r:
            tx = min(400.0, max(12.0, tx)); ty = min(915 * 0.78 - 26, max(915 * 0.06 + 2, ty))  # p4e: aim only where the crosshair can go (padClamp) - no wind-up past the clamp
            nx, ny = f[0] + (tx - r[0]) / 2.5, f[1] + (ty - r[1]) / 2.5
            cx, cy = min(408.0, max(4.0, nx)), min(910.0, max(716.0, ny))
            if (cx, cy) != (nx, ny) and abs(cx - f[0]) < 1 and abs(cy - f[1]) < 1:  # thumb is pinned at the pad edge: a real player lifts and re-plants it (only then)
                await touch('touchEnd'); await asyncio.sleep(0.02); info['fing'] = [206.0, 830.0]; await touch('touchStart', *info['fing']); info['recentre'] = info.get('recentre', 0) + 1; return True
            info['fing'] = [cx, cy]; await touch('touchMove', cx, cy)  # p4e: slide to the pad edge instead of teleporting the reference point (a teleport flings the crosshair)
        return True
    await shot('00_title')
    await pg.tap('#titleCard', position={'x': 200, 'y': 450}); t0 = time.time()
    if not skip:
        await pg.wait_for_function("!document.getElementById('story').classList.contains('hidden')", timeout=30000); await pg.wait_for_timeout(500); await shot('02_story')
        info['storyText'] = await pg.inner_text('#story'); await pg.tap('#story', position={'x': 200, 'y': 600})
    await pg.wait_for_function("['run','parade'].includes(window.__cr9.S.state)", timeout=30000); t0 = time.time()
    await ev("window.__stut.on = true; window.__stut.last = 0")
    aud = await ev("(() => { const A = window.__cr9.A, S = window.__cr9.S, b = [...new Set([...Object.keys(A.raw), ...Object.keys(A.buf)])]; return {banned: b.filter(n => /^AMB_Crickets$|Squeal|TruckBed|Static|Gasp_02|^FIGHT_Crowd_Cheer$|^FIGHT_Saved_Sting$|^GTR_Beat_Bonus_02$|^ALIEN_Fear_Step_2$/.test(n)), truck: !!(S.beds && S.beds.truck), synth: !!A.engine, beds: !!(A.buf.AMB_Wind_Desert_Loop && A.buf.AMB_Tire_Roll_Loop)}; })()")
    need = ['ANIMAL_Cow_Jelly_Splat','ANIMAL_Cow_Grinner_Laugh','ANIMAL_Cow_Horn_Wobble','ANIMAL_Cow_Blink_Bonk','ANIMAL_Cow_Alien_Groan','ANIMAL_Cow_Bald_Gray_Moo','FX_Hybrid_Bubble_Morph','FX_Hybrid_Bubble_Morph_Long','ANIMAL_Cow_Moo_Hybrid_01','ANIMAL_Cow_Moo_Hybrid_02','GTR_Shred_Hyper_Start','GTR_Shred_Hyper_Loop','GTR_Shred_Hyper_End','FIGHT_HighScore_Sting_G','OHNO_Ch2','OHNO_Ch2_alt','OHNO_Ch3','OHNO_Ch3_alt']
    dec = await ev("(need) => need.map(n => { const b = window.__cr9.A.buf[n]; if (!b) return [n, null]; let pk = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } } return [n, +b.duration.toFixed(2), +(20 * Math.log10(pk)).toFixed(1)]; })", need)
    aud['decoded'] = dec
    if any(d[1] is None or d[2] > -0.1 or d[2] < -12 for d in dec): errs.append(f'SFX DECODE/LEVEL PROBLEM {dec}')
    if aud['banned'] or not aud['truck'] or aud['synth'] or not aud['beds']:  # p4c: REX bans only the old AMB_Crickets 4.6 kHz tone (AMB_Crickets_Soft_Loop is fine); stale S.cue replaced by the p4b atmosphere beds being decoded
        errs.append(f'AUDIO SETUP WRONG {aud}')
    if not skip: await pg.wait_for_timeout(900); await shot('01_drive')
    rnd = random.Random(seed); down = False; lastSec = 0; relUntil = 0; x = y = 0; n = 0
    seen = set(); deadline = time.time() + 280
    while time.time() < deadline:
        st = await ev(ST); seen.add(st['state'])
        if name == 'good' and st['state'] == 'run' and not info.get('fakeVo'):  # pass 3: stand-in 2.2 s audio for the (unrecorded) kill taunts, so the 120 ms fade at the snap can be checked
            info['fakeVo'] = await ev("(() => { const A = window.__cr9.A; if (!A.buf.FX_Cow_Giggle) return false; ['VO_COWPOP_01', 'VO_COWPOP_02', 'VO_COWPOP_03'].forEach((k) => (A.buf[k] = A.buf.FX_Cow_Giggle)); return true; })()")
        if st['state'] in ('end',): break
        if st['state'] == 'name':
            if down: await touch('touchEnd'); down = False
            await pg.wait_for_timeout(500); await shot('name_entry')
            if mode in ('good', 'mid', 'midnotap', 'sloppy'): await pg.fill('#nameIn', {'good': 'qa bot!!', 'mid': 'mid bot', 'midnotap': 'gone bot', 'sloppy': 'rnd bot'}[mode]); await shot('name_typed'); info['typed'] = await pg.input_value('#nameIn'); await pg.tap('#nameGo')
            elif mode == 'sloppy': await pg.tap('#nameSkip')
            else: info['waitedCountdown'] = True; await pg.wait_for_function("window.__cr9.S.state==='end'", timeout=40000)
            await pg.wait_for_function("window.__cr9.S.state==='end'", timeout=20000); continue
        if st['grab'] == 'held' and (mode in ('good', 'sloppy', 'mid') or (mode == 'abduct' and info.get('forced', 0) <= 1)):  # mash the screen to break free
            if down: await touch('touchEnd'); down = False
            await shot('abduction_grab')
            if mode == 'mid':  # a so-so player reacts late and taps at 2-4.5 taps/s: sometimes makes it, sometimes not
                delay = rnd.uniform(0.4, 0.9); rate = rnd.uniform(3.0, 5.5); nt = int((3.0 - delay) * rate); await asyncio.sleep(delay)
                t1 = time.time()
                for i in range(nt):  # taps on a fixed schedule (CDP touch round-trips ~0.15 s on swiftshader would otherwise slow the bot well below its intended rate)
                    await touch('touchStart', 206, 600); await touch('touchEnd'); await asyncio.sleep(max(0, t1 + (i + 1) / rate - time.time()))
                    if not await ev("!!window.__cr9.S.grab && !window.__cr9.S.grab.free && !window.__cr9.S.grab.lethal"): break
                reg = await ev("window.__cr9.S.grabTaps")
                info.setdefault('midTaps', []).append({'planned': nt, 'rate': round(rate, 1), 'wall': round(time.time() - t1, 2), 'totalRegistered': reg})
            else:
                for _ in range(16):  # a good player keeps mashing until the beam lets go
                    await touch('touchStart', 206, 600); await touch('touchEnd'); await asyncio.sleep(0.05)
                    if not await ev("!!window.__cr9.S.grab && !window.__cr9.S.grab.free && !window.__cr9.S.grab.lethal"): break
            continue
        if st['grab'] == 'lethal': await shot('abduction_lethal')
        if st['state'] == 'missing': await asyncio.sleep(0.1); continue
        if mode == 'abduct' and st['state'] == 'run' and st['ships'] and not st['grab'] and any(a and z < 20 for k, z, a in st['ships']):
            info['forced'] = info.get('forced', 0) + 1
            if info['forced'] <= 4: await ev('window.__cr9.test.grab()'); await asyncio.sleep(0.3 if info['forced'] == 1 else 0.1)
            if info['forced'] >= 2:  # 2nd + 3rd grabs: no taps (2nd auto-drops after 4 s, 3rd is lethal)
                await pg.wait_for_function("!window.__cr9.S.grab || window.__cr9.S.grab.lethal", timeout=60000)
            continue
        if st['shredBtn'] and st['state'] == 'run' and ((mode == 'good' and st['kills'] >= 1) or  # p4e: the good bot lands a plain (non-HYPER) kill before its first SHRED so a hybrid cow + eye snap happen
                                                        (mode == 'sloppy' and rnd.random() < 0.08)):
            if down: await touch('touchEnd'); down = False
            bb2 = await pg.locator('#shredBtn').bounding_box()
            if not bb2: continue
            await shot('shred_button')
            await touch('touchStart', bb2['x'] + bb2['width'] / 2, bb2['y'] + bb2['height'] / 2); await touch('touchEnd'); continue
        if mode == 'good' and st['state'] == 'run':
            tg = st['tgt']
            if time.time() < relUntil: pass
            elif tg:
                down = await padAim(tg[0], tg[1] - 110, down)  # target() is the finger point for direct aim (reticle 110 px above); the pad drives the reticle itself
                info['moves'] += 1
                # one deliberate early release in wave 2 at >= 4.2 s of lock -> SO CLOSE + air-guitar mock
                if st['wave'] == 1 and st['L'] >= 4.2 and not info['released']:
                    info['released'] = True; await touch('touchEnd'); down = False; relUntil = time.time() + 1.0
            elif down and not st['ships']: pass  # keep holding between waves (streaks)
        elif mode in ('mid', 'midnotap') and st['state'] == 'run':  # so-so aimer: late, wobbly, impatient (lets go every few seconds)
            tg = st['tgt']; now = time.time()
            if now < relUntil: pass
            elif tg:
                if not info.get('aimT'): info['aimT'] = now + rnd.uniform(0.3, 0.8); info['holdT'] = rnd.uniform(2.5, 5.0); info['off'] = (rnd.gauss(0, 55), rnd.gauss(0, 65)); info['offT'] = None  # p4e (Chico pending): holds 2.5-5 s
                if now >= info['aimT']:
                    ox, oy = info['off']
                    if not down: info['downAt'] = now
                    # p4e (Chico): when the ship jinks (changes direction) the so-so thumb overshoots ~1/3 of the time and needs ~0.5 s to get back on
                    pv = info.get('tgPrev'); vx = vy = 0.0
                    if pv and now > pv[2]: vx, vy = (tg[0] - pv[0]) / (now - pv[2]), (tg[1] - pv[1]) / (now - pv[2])
                    lv = info.get('tgVel')
                    if lv and math.hypot(*lv) > 25 and math.hypot(vx, vy) > 25 and lv[0] * vx + lv[1] * vy < 0:  # direction flipped = jink
                        info['jinks'] = info.get('jinks', 0) + 1
                        if rnd.random() < 1 / 3:
                            sp = math.hypot(*lv); mag = rnd.uniform(70, 110); info['over'] = (lv[0] / sp * mag, lv[1] / sp * mag, now); info['overshoots'] = info.get('overshoots', 0) + 1
                    info['tgPrev'] = (tg[0], tg[1], now); info['tgVel'] = (vx, vy) if (vx or vy) else lv
                    ov = info.get('over'); ex = ey = 0.0
                    if ov:
                        f = 1 - (now - ov[2]) / 0.5
                        if f > 0: ex, ey = ov[0] * f, ov[1] * f
                        else: info['over'] = None
                    down = await padAim(tg[0] + ox + ex + rnd.gauss(0, 12), tg[1] - 110 + oy + ey + rnd.gauss(0, 12), down)
                    k = 0.5 ** ((now - info['offT']) / 0.5) if info.get('offT') else 1.0; info['offT'] = now  # p4e: aim error halves every ~0.5 s of wall time (was 0.975 per loop step, i.e. tied to box speed)
                    info['off'] = (info['off'][0] * k, info['off'][1] * k); info['moves'] += 1
                    if now - info['downAt'] > info['holdT']: await touch('touchEnd'); down = False; relUntil = now + rnd.uniform(0.3, 1.0); info['aimT'] = 0  # p4e: lets go 0.3-1.0 s
            elif down: await touch('touchEnd'); down = False; info['aimT'] = 0
        elif False: pass
        elif mode == 'sloppy' and st['state'] == 'run':
            if not down: x, y = rnd.randint(30, 380), rnd.randint(250, 880); await touch('touchStart', x, y); down = True; n = rnd.randint(5, 50)
            x = min(400, max(5, x + rnd.randint(-40, 40))); y = min(900, max(150, y + rnd.randint(-50, 50))); await touch('touchMove', x, y); n -= 1; info['moves'] += 1
            if n <= 0: await touch('touchEnd'); down = False; await asyncio.sleep(rnd.uniform(0.1, 1.0))
        elif down and st['state'] != 'run': await touch('touchEnd'); down = False
        # screenshots
        if shots and st['state'] == 'run':
            if st['pose'] == 'up' and 0.2 < st['raise'] < 0.9: await shot('guitar_overhead')
            if st['pose'] == 'bang' and st['bang'] < 0.9: await shot('head_bang')
            sec = int(st['L'])
            if st['wave'] == 0 and st['locked'] and sec > lastSec and sec <= 4: lastSec = sec; await shot(f'lock_s{sec}')
            if st['kills'] >= 1 and 'lock_s5_pop' not in taken: await shot('lock_s5_pop')
            if 0.45 < st['popT'] < 1.1: await shot('cow_confused')
            if any(k == 'dive' and z < 4.2 and a for k, z, a in st['ships']): await shot('dive')
            elif any(z < 5.0 and a for k, z, a in st['ships']): await shot('near_ship')
            if any(z > 15 and a and k in ('pull', 'swoop', 'peek', 'panic') for k, z, a in st['ships']) and st['wave'] is not None: await shot('far_ship')
            if st['mock']: await shot('air_guitar_mock')
            if st['soClose'] >= 1 and 'so_close' not in taken: await shot('so_close')
            if st['streakAge'] < 600: await shot('streak')
            if st['wave'] == 2 and sum(1 for k, z, a in st['ships'] if a and z < 20) == 2: await shot('two_ships')
            if st['wave'] == 4 and sum(1 for k, z, a in st['ships'] if a and z < 20) == 2: await shot('swarm_pair2')
            if st['take2']: await shot('panic_double_take')
            if "POINT BLANK" in (await ev("document.getElementById('cmd').classList.contains('hidden') ? '' : document.getElementById('cmd').textContent")): await shot('point_blank')
            if "TWO OF" in st['call']: await shot('wave_callout')
            if "BROUGHT FRIENDS" in st['call']: await shot('wave_callout_friends')
            if st['liftK'] > 0.75: await shot('truck_lift_flinch')
            if st['hyper']: await shot('hyper_mode')
            if st['hyper'] and st['dual']: await shot('hyper_two_grays')
            if 0.25 < st['km'] < 0.5: await shot('kill_morph_blob')
            if 0.75 < st['km'] < 0.95: await shot('kill_morph_forming')
            if 0.3 < st['popT'] < 0.9 and not st['bald']: await shot('cow_hybrid_eyes')
            if st['bald'] and 0.62 < st['popT'] < 0.9: await shot('cow_hair_shed')
            if st['react'] and st['popT'] > 1.0 and st['popT'] < 1.5: await shot(f"cow_react_{st['react']}")
            if st['vo'] and not info.get('cap'):
                await pg.wait_for_timeout(350)
                cap = await ev("(() => { const e = document.getElementById('vo'), r = e.getBoundingClientRect(), cs = getComputedStyle(e); const pe = e.style.pointerEvents; e.style.pointerEvents = 'auto'; const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); e.style.pointerEvents = pe; return { hidden: e.classList.contains('hidden'), op: +cs.opacity, h: r.height, y: Math.round(r.top), text: e.innerText, onTop: !!top && (top === e || e.contains(top)), over: top ? top.id || top.tagName : '' }; })()")
                if not cap['hidden'] and cap['op'] > 0.9 and cap['h'] > 10: info['cap'] = cap; await shot('vo_caption')
            if st['bill']: await shot('billboard')
            if st['dual']: await shot('dual_lock')
            if st['mock']:
                if await ev("(() => { const g = window.__cr9.S.mockG; return g && g.q.scale.x > 1.7; })()"): await shot('mock_punch_2x')
        if shots and st['state'] == 'morph' and await ev('window.__cr9.W.morphMat.uniforms.uT.value') > 1.9: await shot('final_morph')
        if st['state'] == 'parade' and shots:
            pt = await ev("window.__cr9.S.paradeT")
            if pt > 1.2: await shot('finale')
            if await ev("!document.getElementById('rank').classList.contains('hidden')"): await pg.wait_for_timeout(400); await shot('rank')
            if await ev("window.__cr9.S.bestShown"): await pg.wait_for_timeout(300); await shot('new_high_score')
        await asyncio.sleep(0.03 if mode == 'good' else 0.05)
    if down: await touch('touchEnd')
    if mode == 'abduct':  # p4d: 1st loss - a tap DURING the abduction scene (after 'Oh no!' 3.5 s, before the 5.9 s unlock) must not skip it
        await pg.wait_for_function("['missing', 'end'].includes(window.__cr9.S.state) && window.__cr9.S.abducted && window.__cr9.S.missT0 > 0 && performance.now() - window.__cr9.S.missT0 > 4300", timeout=120000, polling=50)
        info['tapAt'] = round(await ev("(performance.now() - window.__cr9.S.missT0) / 1000"), 2); await pg.tap('#gl', force=True); await pg.wait_for_timeout(150)
        info['firstTapKeptLock'] = info['tapAt'] < 5.7 and await ev("(window.__cr9.S.state === 'missing' || document.getElementById('again').classList.contains('wait')) && (window.__cr9.S.missSkips || 0) === 0")
    await pg.wait_for_function("window.__cr9.S.state==='end'", timeout=30000); await pg.wait_for_timeout(700); await shot('end_card')
    if await ev("window.__cr9.S.abducted"):
        await pg.wait_for_timeout(1200 if mode != 'abduct' else 100); await shot('missing_time')
        if mode == 'abduct':  # p4d: REX timing from abduction-scene start (S.missT0): PLAY AGAIN locked until 5.9 s, giggle at 7.0 s; on the FIRST loss a tap must not skip the lock
            if not info.get('firstTapKeptLock'): errs.append(f"1ST LOSS: A TAP AT {info.get('tapAt')} s SKIPPED THE ABDUCTION SCENE")
            await pg.wait_for_function("!document.getElementById('again').classList.contains('wait')", timeout=15000); info['unlockAt'] = round(await ev("(performance.now() - window.__cr9.S.missT0) / 1000"), 2)
            await pg.wait_for_function("!!window.__cr9.S.giggleAt", timeout=15000); info['giggleAt'] = round(await ev("window.__cr9.S.giggleAt / 1000"), 2)
            print(f"[{name}] 1st loss timing: tap {info['tapAt']} s, unlock {info['unlockAt']} s (want 5.9), giggle {info['giggleAt']} s (want 7.0)")
            if not (5.7 <= info['unlockAt'] <= 6.5): errs.append(f"PLAY AGAIN UNLOCK AT {info['unlockAt']} s (want 5.9)")
            if not (6.8 <= info['giggleAt'] <= 7.6): errs.append(f"GIGGLE AT {info['giggleAt']} s (want 7.0)")
        if mode in ('mid', 'midnotap', 'sloppy', 'good') and await ev("!document.getElementById('signBtn').classList.contains('hidden')"):  # MISSING TIME -> sign the sheet -> back to the card
            await pg.tap('#signBtn', force=True); await pg.wait_for_function("window.__cr9.S.state==='name'", timeout=10000); await pg.fill('#nameIn', 'gone bot'); info['typed'] = await pg.input_value('#nameIn'); await pg.tap('#nameGo')
            await pg.wait_for_function("window.__cr9.S.state==='end'", timeout=20000); await pg.wait_for_timeout(800); await shot('missing_time_signed')
        await pg.wait_for_function("!document.getElementById('again').classList.contains('wait')", timeout=15000)
        info['ufo'] = await ev("document.querySelectorAll('#endBoard .ufo').length"); info['sing'] = await ev("document.getElementById('endSing').innerText"); info['againTxt'] = await ev("document.getElementById('again').innerText")
    total = time.time() - t0
    await pg.wait_for_function("!document.getElementById('again').classList.contains('wait')", timeout=15000)  # MISSING TIME: Play Again shows after the cows' giggle
    bb = await pg.locator('#again').bounding_box()
    await pg.wait_for_timeout(1500); await shot('end_board')
    xtra_cap = info.get('cap'); stut = await ev('window.__stut')
    brd = await ev("(() => ({ title: document.getElementById('endTitle').innerText, rival: document.getElementById('endRival').innerText, board: document.getElementById('endBoard').innerText.slice(0, 300) }))()")
    xtra = await ev("(() => { const S = window.__cr9.S; return { flushedPops: S.flushedPops || 0, tauntLeak: S.tauntLeak || 0, voKill: S.voKill || 0, tauntFades: S.tauntFades || 0, missSkips: S.missSkips || 0, snapMoos: S.snapMoos || 0, giggles: S.giggles || 0, snorts: S.snorts || 0, eyeSnaps: S.eyeSnaps || 0, snapMooSync: S.snapMooSync || 0, idleSnaps: S.idleSnaps || 0, livesLost: S.livesLost, lossLog: S.lossLog, abductAt: S.abductAt, lastWarn: S.lastWarn, aggroDives: S.aggroDives, lives: S.lives, grabs: S.grabs, grabLog: S.grabLog, breakFrees: S.breakFrees, grabTaps: S.grabTaps, abducted: S.abducted, dangerPeak: +(S.dangerPeak || 0).toFixed(2), firstShipT: S.firstShipT, shredReadyAt: S.shredReadyAt, hyperAt: S.hyperAt, hypers: S.hypers, hyperKills: S.hyperKills, vo: S.voLog, ohnos: S.ohnos, killMorphs: S.killMorphs || 0, hairSheds: S.hairSheds || 0, reacts: S.reacts || {}, cows: S.cowList, boardRes: S.boardRes, postDur: S.postDur || null, nameDone: S.nameDone, sections: window.__cr9.secReport(), cowGags: S.cowGags, panics: S.panics, lifts: S.lifts, poses: S.poseShown, chords: S.chords, pointBlanks: S.pointBlanks, perfect: document.getElementById('endPerfect').textContent, prompt: S.lastSub || null, dualLockS: +(S.dual || 0).toFixed(1), calls: S.calls, meltMin: S.meltMin, maxShips: S.maxShips || null }; })()")
    endFps = await pg.inner_text('#endFps')
    st = await ev("({rank: [window.__cr9.S.rank, window.__cr9.S.score, window.__cr9.S.best, window.__cr9.S.newBest], kills: window.__cr9.S.kills, souls: window.__cr9.S.souls, firstKill: window.__cr9.S.firstKill, bestStreak: window.__cr9.S.bestStreak, laughs: window.__cr9.S.laughs, mocks: window.__cr9.S.mocks, soCloses: window.__cr9.S.soCloses, log: window.__cr9.S.killLog, morphMin: window.__cr9.S.morphMinFps, stats: window.__cr9.stats})")
    stats = await pg.inner_text('#endStats'); fps = await pg.inner_text('#fps')
    if mode == 'abduct' and await ev("window.__cr9.S.abducted"):  # pass 3: the FIRST loss of the session must not be skippable and shows no tally
        info['firstTally'] = await ev("!document.getElementById('endTally').classList.contains('hidden')"); info['firstSkips'] = await ev("window.__cr9.S.missSkips || 0")
    await pg.tap('#again', force=True); await pg.wait_for_timeout(1200); again = await ev("window.__cr9.S.state")
    if mode == 'abduct' and name == 'abduct' and again == 'run':  # pass 3: a 2nd loss in the same session -> tally line + tap skips the giggle lock (REX's stopGiggle, 50 ms fade)
        t2 = time.time()
        while time.time() - t2 < 90 and await ev("window.__cr9.S.state") == 'run':
            if await ev("(() => { const S = window.__cr9.S; return !S.grab && S.fight && S.fight.ships.some((s) => s.alive && s.Z < 20); })()"): await ev('window.__cr9.test.grab()')
            await asyncio.sleep(0.3)
        await pg.wait_for_function("['missing', 'end'].includes(window.__cr9.S.state) && window.__cr9.S.missT0 > 0 && performance.now() - window.__cr9.S.missT0 > 3900", timeout=30000)  # p4d: skip is allowed after 'Oh no!' (3.5 s) and before the 5.9 s unlock
        sk = {'tally': await ev("document.getElementById('endTally').classList.contains('hidden') ? '' : document.getElementById('endTally').innerText"), 'waitBefore': await ev("window.__cr9.S.state === 'missing' || document.getElementById('again').classList.contains('wait')"), 'giggleOn': await ev("!!window.__cr9.S.giggleH")}
        await shot('missing_time_2nd'); tt = time.time(); await pg.tap('#gl', force=True); await pg.wait_for_timeout(300)
        await pg.wait_for_timeout(300); sk['tally'] = await ev("document.getElementById('endTally').classList.contains('hidden') ? '' : document.getElementById('endTally').innerText")  # p4d: the tally lives on the end card, read it after the skip lands there
        sk.update({'waitAfter': await ev("document.getElementById('again').classList.contains('wait')"), 'giggleAfter': await ev("!!window.__cr9.S.giggleH"), 'skips': await ev("window.__cr9.S.missSkips || 0"), 'stateAfter': await ev("window.__cr9.S.state"), 'ms': round((time.time() - tt) * 1000)})
        info['second'] = sk
        print(f'[{name}] 2nd loss in session: {sk}')
        if not (sk['tally'].startswith("Abducted tonight: 2. The diner's starting to believe you.") and sk['waitBefore'] and not sk['waitAfter'] and not sk['giggleAfter'] and sk['skips'] == 1 and sk['stateAfter'] == 'end'): errs.append(f'2ND LOSS TALLY/SKIP WRONG {sk}')
        if info.get('firstTally') or info.get('firstSkips'): errs.append(f"1ST LOSS SHOWED A TALLY OR SKIPPED {info.get('firstTally')} {info.get('firstSkips')}")
        await pg.tap('#again', force=True); await pg.wait_for_timeout(1200); again = await ev("window.__cr9.S.state")
    ok = not errs and again == 'run' and bb and bb['width'] > 300
    if mode == 'good' and name == 'goodfps': pass
    if mode == 'good': ok = ok and st['firstKill'] is not None and st['firstKill'] < 15
    if not skip and (xtra['firstShipT'] is None or xtra['firstShipT'] > 8): ok = False; errs.append(f"FIRST SHIP LATE {xtra['firstShipT']}")
    if mode == 'good' and (st['souls'] != st['kills'] or (st['kills'] == 8 and 'Every soul saved' not in xtra['perfect'])): ok = False; errs.append('SOULS != KILLS or no perfect line')
    if mode != 'good' and xtra['perfect'] and st['souls'] < 8: ok = False; errs.append('perfect line on a non-perfect run')
    if (xtra['maxShips'] or 0) > 2: ok = False; errs.append('MORE THAN 2 SHIPS ON SCREEN')
    if not endFps: ok = False; errs.append('NO MELT FPS LINE ON END CARD')
    if mode == 'idle' and skip != 'parade': ok = ok and st['kills'] == 0
    if mode == 'good' and name == 'good' and xtra['hypers'] < 2: ok = False; errs.append(f"HYPER < 2 in good run ({xtra['hypers']})")
    ab = xtra['abducted']; xtra['caption'] = xtra_cap; xtra['midTaps'] = info.get('midTaps'); xtra['stutter'] = {'over50ms': stut['n'], 'beforeFirstKill': stut['preKill'], 'worstMs': round(stut['worst'])}; xtra['posts'] = [[v, p['score'], p['dur'], p.get('abducted')] for v, p in posts]; xtra['ufo'] = info.get('ufo'); xtra['jinkOver'] = [info.get('jinks', 0), info.get('overshoots', 0), info.get('recentre', 0)]
    if any(v != 'OK' for v, p in posts): ok = False; errs.append(f'HONEST SCORE REJECTED {xtra["posts"]}')
    if mode == 'midnotap' and not (ab and st['kills'] >= 1 and posts and posts[0][0] == 'OK' and posts[0][1].get('abducted') is True and info.get('ufo', 0) >= 1): ok = False; errs.append(f"NATURAL ABDUCTION DID NOT POST WITH THE SAUCER FLAG (abducted {ab}, kills {st['kills']}, posts {xtra['posts']}, ufo {info.get('ufo')})")
    if mode == 'good' and (ab or st['souls'] != 8 or xtra['livesLost'] != 0): ok = False; errs.append(f"GOOD PLAYER LOST A TRUCK (abducted {ab}, lost {xtra['livesLost']}, grabs {xtra['grabs']})")
    if name == 'good':  # pass 3: drive one kill taunt (stand-in audio) through the snap fade directly
        info['fadeTest'] = await ev("window.__cr9.test.killTauntFade()")
        if not (info['fadeTest']['had'] and info['fadeTest']['cleared'] and info['fadeTest']['fades'] >= 1): ok = False; errs.append(f"KILL TAUNT FADE TEST FAILED {info['fadeTest']}")
        print(f"[{name}] kill-taunt fade test: {info['fadeTest']}")
    if xtra['tauntLeak']: ok = False; errs.append(f"KILL TAUNT STILL PLAYING AFTER THE SNAP ({xtra['tauntLeak']})")
    if ab and xtra['giggles'] < 1: ok = False; errs.append('NO GIGGLE ON MISSING TIME')
    nonBald = sum(1 for k in (xtra['cows'] or []) if k.endswith('_hybrid'))
    if mode == 'good' and (xtra['eyeSnaps'] < nonBald or xtra['snapMooSync'] < nonBald or xtra['idleSnaps'] < 1): ok = False; errs.append(f"EYE SNAP MISSING (snaps {xtra['eyeSnaps']}, moo-sync {xtra['snapMooSync']}, idle {xtra['idleSnaps']}, hybrid cows {nonBald})")
    if mode == 'good' and name == 'good' and not (xtra_cap and xtra_cap['onTop'] and 'DANIEL' in xtra_cap['text']): ok = False; errs.append(f'NO VISIBLE NARRATION CAPTION {xtra_cap}')
    if mode == 'idle' and not skip:
        g0 = xtra['grabLog'][0] if xtra['grabLog'] else None
        if not (ab and xtra['livesLost'] == 3 and xtra['abductAt'] is not None and xtra['abductAt'] <= 50 and g0 and g0[2] == 1 and ('MISSING TIME' in brd['title'] or 'ABDUCTED' in brd['title']) and 'Badly' in info.get('sing', '') and 'Get even' in info.get('againTxt', '') and xtra['dangerPeak'] > 0.3 and xtra['lastWarn'] >= 1): ok = False; errs.append(f"IDLE ABDUCTION TIMING WRONG (abducted at {xtra['abductAt']}, first grab {g0})")
    if mode == 'mid': MID[name] = (st['kills'], xtra['livesLost'])  # Chico: the kill AVERAGE across the mid seeds is checked in main() after all five run
    if mode == 'mid' and (ab or 'parade' not in seen or st['kills'] < MID_FLOOR or xtra['livesLost'] > 1): ok = False; errs.append(f"MID PLAYER: abducted {ab}, lost {xtra['livesLost']}, kills {st['kills']}")  # Chico: per seed >= 3 kills, <= 1 truck lost (was 4-6 kills each)
    if mode == 'abduct' and not (ab and xtra['livesLost'] == 3 and xtra['breakFrees'] >= 1 and xtra['lastWarn'] >= 1 and ('MISSING TIME' in brd['title'] or 'ABDUCTED' in brd['title']) and 'Badly' in info.get('sing', '') and 'Get even' in info.get('againTxt', '')): ok = False; errs.append('ABDUCT CHECK FAILED')
    if mode == 'sloppy' and xtra['grabs'] and xtra['breakFrees'] < xtra['grabs'] - xtra['livesLost']: ok = False; errs.append('TAPS DID NOT BREAK FREE')
    if mode == 'sloppy' and xtra['hypers'] < 1 and not ab: ok = False; errs.append('HYPER < 1 in random run')
    if any(v[0].startswith('VO_W') and v[1] == 'skipped' for v in xtra['vo']): ok = False; errs.append('WAVE INTRO LINE WAS QUEUED/SKIPPED (must play instantly)')
    if any(v[3] for v in xtra['vo'] if len(v) > 3 and not v[0].startswith(('VO_SHRED_HIT', 'VO_TRASH', 'VO_LAST_TRUCK', 'VO_ABDUCTED', 'VO_W', 'VO_COWPOP'))): ok = False; errs.append('VO LINE STARTED DURING A LOCK')
    RES[name] = ok
    if shots: info['mockScale'] = None
    print(f"[{name}] {'PASS' if ok else 'FAIL'} states {sorted(seen)} | wall {total:.0f}s | touch moves {info['moves']}\n  end card: {stats!r} | again -> {again}\n  {json.dumps(st)}\n  end fps line: {endFps!r}\n  extra: {json.dumps(xtra)}\n  board: {json.dumps(brd)} typed {info.get('typed')!r} story {info.get('storyText', '')[:60]!r}\n  shots: {info['shots']}\n  fps strip: {fps}\n  audio {aud}\n  ERRORS: {errs}", flush=True)
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        jobs = [('good', lambda: run(b, 'good', 'good', True)), ('random', lambda: run(b, 'random', 'sloppy', False, dpr=1)), ('idle', lambda: run(b, 'idle', 'idle', False, dpr=1)),
                ('skip=duel', lambda: run(b, 'skip=duel', 'idle', False, 'duel', 1)), ('skip=parade', lambda: run(b, 'skip=parade', 'idle', False, 'parade', 1)),
                ('abduct', lambda: run(b, 'abduct', 'abduct', True, dpr=1)), ('mid', lambda: run(b, 'mid', 'mid', False, dpr=1)), ('mid2', lambda: run(b, 'mid2', 'mid', False, dpr=1, seed=23)), ('mid3', lambda: run(b, 'mid3', 'mid', False, dpr=1, seed=5)), ('mid4', lambda: run(b, 'mid4', 'mid', False, dpr=1, seed=7)), ('mid5', lambda: run(b, 'mid5', 'mid', False, dpr=1, seed=41)), ('midnotap', lambda: run(b, 'midnotap', 'midnotap', False, dpr=1)), ('abduct2', lambda: run(b, 'abduct2', 'abduct', False, dpr=2)), ('goodfps', lambda: run(b, 'goodfps', 'good', False, dpr=2))]
        jobs = [j for j in jobs if (ONLY and j[0] in ONLY) or (not ONLY and j[0] not in ('goodfps', 'abduct2'))]
        sem = asyncio.Semaphore(int(__import__('os').environ.get('CR9_PAR', '3')))  # swiftshader: more than 4 parallel pages starves the CPU
        async def lim(f):
            async with sem: await f()
        await asyncio.gather(*[lim(j[1]) for j in jobs])
        await b.close()
    ran = [n for n in MID_SEEDS if n in MID]
    if ran:
        avg = sum(MID[n][0] for n in ran) / len(ran)
        print('MID SUMMARY: ' + ', '.join(f'{n} {MID[n][0]} kills/{MID[n][1]} lost' for n in ran) + f' | avg kills {avg:.2f}')
        if len(ran) == len(MID_SEEDS):  # the average is only meaningful over the full seed set; a single-seed run keeps just the per-seed rule
            RES['midset'] = avg >= MID_AVG and all(RES.get(n) for n in ran)
            print(f"[midset] {'PASS' if RES['midset'] else 'FAIL'} avg kills {avg:.2f} (need >= {MID_AVG}), min {min(MID[n][0] for n in ran)} (need >= {MID_FLOOR}), max lost {max(MID[n][1] for n in ran)} (need <= 1)", flush=True)
        else: print(f'[midset] not checked: only {len(ran)}/{len(MID_SEEDS)} mid seeds ran (run all five, or pass midset)', flush=True)
    print('ALL PASS' if all(RES.values()) and len(RES) == len(jobs) + ('midset' in RES) else f'SOME FAILED: {RES}')
asyncio.run(main())
