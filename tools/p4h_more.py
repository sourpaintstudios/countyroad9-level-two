# p4h (v4.8.0) test parts C-G (called from p4h_test.py)
import asyncio, json, time
TEXMB = "(() => { let b = 0; const seen = new Set(); for (const t of Object.values(window.__cr9.G.tex)) { const i = t && t.image; if (i && i.width && !seen.has(i)) { seen.add(i); b += i.width * i.height * 4 * 1.34; } } return b / 1048576; })()"
async def run_more(b, PARTS, g):
    chk, mk, st, tap, tap_el, center, start_run, wait_live, wait_ship, reload, build_state, KILL, verdict, SH = (g[k] for k in ('chk', 'mk', 'st', 'tap', 'tap_el', 'center', 'start_run', 'wait_live', 'wait_ship', 'reload', 'build_state', 'KILL', 'verdict', 'SH'))
    if 'C' in PARTS:
        print('\n=== C: a newer build never reloads a run / pause / restore by itself ===')
        pg, cdp = await mk(b, version='9.9.9'); ev = pg.evaluate; await ev('window.__mark = 1')
        await pg.wait_for_timeout(800); s = await st(pg)
        chk('C1 stale build detected: the title shows a small "NEW VERSION · TAP TO UPDATE" button, the page did NOT reload', s['upd'] and await ev('window.__mark === 1') and s['title'], f"text={await ev('document.getElementById(\"updBtn\").textContent')!r}")
        r = await center(pg, '#updBtn'); chk('C2 update button is >= 44 px tall and on screen', r[5] >= 44 and r[3] >= 0 and r[3] + r[5] <= 915, f'{r[4]:.0f}x{r[5]:.0f} at y={r[3]:.0f}')
        await start_run(pg, cdp); await wait_live(pg, 0.1)
        fire = "(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); })()"
        await ev(fire); await pg.wait_for_timeout(1800); s = await st(pg)
        chk('C3 during a live run: no reload (page marker alive), run still running, no update prompt', await ev('window.__mark === 1') and s['state'] == 'run' and not s['upd'], f"state={s['state']} upd={s['upd']}")
        await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(300); await ev(fire); await pg.wait_for_timeout(1800); s = await st(pg)
        chk('C4 while PAUSED: no reload, still paused, no update prompt', await ev('window.__mark === 1') and s['paused'] and not s['upd'])
        await ev('window.__cr9.pause.resume()'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=10000); await ev(fire); await pg.wait_for_timeout(1500)
        chk('C5 after RESUME: still no reload (run goes on)', await ev('window.__mark === 1') and (await st(pg))['state'] == 'run')
        await pg.wait_for_timeout(1200)  # a save exists now -> reload (a crash / swipe-away) -> resume path with a stale build
        await reload(pg); await ev('window.__mark = 2'); s = await st(pg)
        chk('C6 title with a SAVED run + stale build: RESUME RUN offered, no update prompt (it would throw the save away)', s['resumeBtn'] and not s['upd'] and await ev('window.__mark === 2'))
        await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000); await ev(fire); await pg.wait_for_timeout(1500); s = await st(pg)
        chk('C7 while a run is being / has been restored: no reload, no update prompt', await ev('window.__mark === 2') and s['paused'] and not s['upd'] and s['menu'])
        await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#pmMenu'); await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#pmMenu'); await pg.wait_for_function("window.__cr9.S.state === 'title'", timeout=10000); await pg.wait_for_timeout(600)
        s = await st(pg); chk('C8 back on the title (no save): the update prompt shows now', s['upd'] and not s['resumeBtn'])
        await ev("(() => { document.getElementById('titleCard').classList.add('hidden'); document.getElementById('endCard').classList.remove('hidden'); })()"); await pg.wait_for_timeout(600); s = await st(pg)
        chk('C9 end card (synthetic: card shown by hand): the update prompt shows there too', s['upd'])
        await ev("(() => { document.getElementById('endCard').classList.add('hidden'); document.getElementById('titleCard').classList.remove('hidden'); })()"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SH + 'p4h_update_prompt.png')
        async with pg.expect_navigation(timeout=20000): await tap_el(pg, cdp, '#updBtn')
        await pg.wait_for_function('window.__cr9 && window.__cr9.S.ready', timeout=60000); chk('C10 tapping it reloads the page (the only reload path)', await ev('window.__mark === undefined'))
        await pg.context.close()
        # same page WITHOUT a stale build: no prompt
        pg, cdp = await mk(b); await pg.wait_for_timeout(500); s = await st(pg); chk('C11 current build: no update prompt', not s['upd']); await pg.context.close()
    if 'D' in PARTS:
        print('\n=== D: one banner at a time ===')
        pg, cdp = await mk(b); ev = pg.evaluate; await start_run(pg, cdp); await wait_live(pg, 0.1); await wait_ship(pg, 0.5); await ev('window.__cr9.S.grabGrace = 1e12')  # test control: no truck grab can start and hold the banner queue (a grab owns the screen by design)
        await ev("""(() => { const w = window.__w = { frames: [], max: 0, ev: [], cmdTxt: null }; const cm = document.getElementById('cmd'), sv = document.getElementById('saved'), vo = document.getElementById('vo'); let last = '';
          (function f() { const a = !cm.classList.contains('hidden') && getComputedStyle(cm).visibility !== 'hidden', b = !sv.classList.contains('hidden'); const k = (a ? 'C' : '') + (b ? 'S' : ''); const now = window.__cr9.pause.NOW();
            if (a && b) w.max = 2; if (k !== last) { const r = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.right), Math.round(q.bottom)]; }; w.ev.push({ k, t: now, cmd: a ? cm.textContent : null, cr: a ? r(cm) : null, sr: b ? r(sv) : null, st: b ? sv.textContent : null }); last = k; } requestAnimationFrame(f); })(); })()""")
        # flood: 6 at once -> still one at a time, the queue is capped, nothing sticks (wave 1: no truck grab can hold the queue)
        await ev("window.__w.ev.length = 0; window.__w.max = 0"); n0 = await ev('window.__cr9.S.bannersShown || 0'); await ev("(() => { for (let i = 0; i < 6; i++) window.__cr9.p3.savedBanner('Udderly saved!'); })()"); await pg.wait_for_timeout(4500); w = await ev('window.__w'); n1 = await ev('window.__cr9.S.bannersShown || 0')
        chk('D5 6 banners at once: never two together, the queue is capped (2 - 4 of them shown, the rest dropped), screen clear afterwards', w['max'] == 0 and 2 <= n1 - n0 <= 4 and not await ev("!document.getElementById('saved').classList.contains('hidden')"), f"shown={n1 - n0}")
        # Daniel caption: pill above the dashboard, off the ships
        await wait_ship(pg, 0.5); await pg.wait_for_timeout(300)
        info = await ev("""(() => { const c = window.__cr9, S = c.S; const L = c.t452.voPick('WAVE', 1); c.t452.sayNow(L, 'wave'); const e = document.getElementById('vo'); const q = e.querySelector('.vt') ? e.querySelector('.vt').getBoundingClientRect() : e.getBoundingClientRect();
          const ships = S.fight.ships.filter(s => !s.gone && s.alive).map(s => { const [x, y] = c.p3.shipScreen(s); return { x, y, r: Math.max(60, s.fr || 60) }; });
          const hit = ships.filter(s => !(q.right < s.x - s.r || q.left > s.x + s.r || q.bottom < s.y - s.r || q.top > s.y + s.r)); return { cap: [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)], text: e.textContent, ships: ships.map(s => [Math.round(s.x), Math.round(s.y), Math.round(s.r)]), hit: hit.length, padTop: innerHeight * 0.78 }; })()""")
        await pg.wait_for_timeout(200); await pg.screenshot(path=SH + 'p4h_caption.png')
        chk('D7 Daniel caption: short label ("DANIEL:", no emoji), sits above the thumb pad (bottom <= pad top) and over no ship', 'DANIEL:' in info['text'] and info['cap'][3] <= info['padTop'] + 1 and info['hit'] == 0 and info['cap'][1] > 0.34 * 915, json.dumps(info))
        await ev('window.__w.ev.length = 0; window.__w.max = 0; document.getElementById("vo").classList.add("hidden")')
        try: await pg.wait_for_function("!document.body.classList.contains('introOn')", timeout=12000)
        except Exception: pass
        await ev("(() => { window.__cr9.p3.savedBanner('Moo-ve over, buddy!'); window.__cr9.t452.nextWave(); })()")  # the overlap case: SOUL SAVED + the next wave callout in the same moment
        await pg.wait_for_timeout(280); await pg.screenshot(path=SH + 'p4h_banners.png'); await pg.wait_for_function("!document.getElementById('cmd').classList.contains('hidden')", timeout=4000); await pg.wait_for_timeout(250); await pg.screenshot(path=SH + 'p4h_banners_wave_call.png'); await pg.wait_for_timeout(2400)
        w = await ev('window.__w'); print('   banner events:', json.dumps(w['ev']))
        e = w['ev']; shown = [x for x in e if x['k']]
        chk('D1 "ANOTHER SOUL SAVED!" and the wave callout were never on screen together', w['max'] == 0 and len(shown) >= 2 and all(len(x['k']) == 1 for x in shown), f"sequence={[x['k'] for x in e]}")
        chk('D2 both were shown, in order (saved first, then the callout)', [x['k'] for x in e][:3] == ['S', '', 'C'] or [x['k'] for x in e][:2] == ['S', 'C'], f"{[x['k'] for x in e]} texts={[x['cmd'] or x['st'] for x in shown]}")
        dur = []
        for i, x in enumerate(e[:-1]):
            if x['k']: dur.append(round((e[i + 1]['t'] - x['t']) / 1000, 2))
        chk('D3 each banner stays ~0.8 s (0.6 - 1.2 s on the game clock; the frame loop is 30 fps)', dur and all(0.6 <= d <= 1.2 for d in dur[:2]), f'durations={dur}')
        PB = (12, 76, 56, 120); H = 915
        bad = []
        for x in shown:
            r = x['cr'] or x['sr']
            if r[3] > 0.34 * H: bad.append(('into middle third', x['k'], r))
            if not (r[2] < PB[0] or r[0] > PB[2] or r[3] < PB[1] or r[1] > PB[3]): bad.append(('over pause button', x['k'], r))
        chk('D4 banners sit above the middle third of the screen (bottom edge <= 34% of the height) and clear of the pause button', not bad, f"rects={[x['cr'] or x['sr'] for x in shown]} problems={bad}")
        # pause during a banner: it freezes with the game and still hides ~0.8 s of GAME time later
        await ev("window.__w.ev.length = 0"); await ev("window.__cr9.p3.savedBanner('Herd you the first time!')"); await pg.wait_for_timeout(250); await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(2500)
        vis_paused = await ev("!document.getElementById('saved').classList.contains('hidden')")
        await ev('window.__cr9.pause.resume()'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=10000); await pg.wait_for_timeout(1500)
        chk('D6 pausing mid-banner freezes it (still up after 2.5 s paused), then it finishes after RESUME', vis_paused and not await ev("!document.getElementById('saved').classList.contains('hidden')"))
        chk('D8 no console errors (banners)', not pg.errs, json.dumps(pg.errs[:4])); await pg.context.close()
    if 'E' in PARTS:
        print('\n=== E: button sizes + menu accessibility ===')
        for (w_, h_) in ((412, 915), (320, 568)):
            pg, cdp = await mk(b, w=w_, h=h_); ev = pg.evaluate
            m = await ev("""(() => { const o = {}; for (const id of ['cleanBtn', 'howBtn', 'hiBtn']) { const r = document.getElementById(id).getBoundingClientRect(); o[id] = [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, Math.round(r.top), Math.round(r.bottom)]; } return o; })()""")
            chk(f'E1 {w_}x{h_} title: CLEAN WORDS, HOW TO PLAY, HIGH SCORES all >= 44 px tall', all(v[1] >= 44 for v in m.values()), json.dumps(m))
            chk(f'E2 {w_}x{h_} title: every button fully on screen (no scrolling needed)', all(v[3] <= h_ and v[2] >= 0 for v in m.values()), f"viewport h={h_} bottoms={[v[3] for v in m.values()]}")
            if w_ == 412: await pg.screenshot(path=SH + 'p4h_title_buttons.png')
            # with a saved run: RESUME RUN + NEW GAME
            await start_run(pg, cdp); await wait_live(pg, 0.1); await pg.wait_for_timeout(1500); await reload(pg)
            m2 = await ev("""(() => { const o = {}; for (const id of ['resumeBtn', 'newBtn', 'cleanBtn', 'howBtn', 'hiBtn']) { const r = document.getElementById(id).getBoundingClientRect(); o[id] = [Math.round(r.width), Math.round(r.height * 10) / 10, Math.round(r.top), Math.round(r.bottom)]; } return o; })()""")
            chk(f'E3 {w_}x{h_} title with a saved run: RESUME RUN / NEW GAME / CLEAN WORDS / HOW TO PLAY / HIGH SCORES all >= 44 px tall and on screen', all(v[1] >= 44 and v[3] <= h_ for v in m2.values()), json.dumps(m2))
            if w_ == 320: await pg.screenshot(path=SH + 'p4h_title_buttons_320.png')
            await pg.context.close()
        pg, cdp = await mk(b); ev = pg.evaluate
        ids = ['resumeBtn', 'newBtn', 'hiBtn', 'cleanBtn', 'howBtn', 'nameGo', 'nameSkip', 'boardClose', 'again', 'signBtn', 'shredBtn', 'pauseBtn', 'pmResume', 'pmRestart', 'pmMenu', 'updBtn']
        lab = await ev("ids => Object.fromEntries(ids.map(i => [i, document.getElementById(i).getAttribute('aria-label')]))", ids)
        chk('E4 aria-labels on all 16 main buttons', all(lab.values()), json.dumps({k: v for k, v in lab.items() if not v}) or 'all set')
        dlg = await ev("(() => { const m = document.getElementById('pauseMenu'); return [m.getAttribute('role'), m.getAttribute('aria-modal'), m.getAttribute('aria-labelledby'), document.getElementById(m.getAttribute('aria-labelledby')).textContent]; })()")
        chk('E5 pause menu is role="dialog" aria-modal, labelled by its title', dlg[0] == 'dialog' and dlg[1] == 'true' and dlg[3] == 'PAUSED', json.dumps(dlg))
        await start_run(pg, cdp); await wait_live(pg, 0.1); await pg.wait_for_timeout(1200)
        await pg.keyboard.press('Escape'); await pg.wait_for_function('window.__cr9.S.paused', timeout=5000); await pg.wait_for_timeout(400)
        act = lambda: ev('document.activeElement && document.activeElement.id')
        chk('E6 on open, focus lands on RESUME', await act() == 'pmResume', await act())
        seq = []
        for k in ('Tab', 'Tab', 'Tab', 'Shift+Tab'): await pg.keyboard.press(k); seq.append(await act())
        chk('E7 Tab is not swallowed: it cycles RESUME > RESTART > MAIN MENU > RESUME inside the dialog; Shift+Tab goes back', seq == ['pmRestart', 'pmMenu', 'pmResume', 'pmMenu'], json.dumps(seq))
        await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Shift+Tab')  # menu -> restart -> resume ... land on RESTART
        await pg.keyboard.press('Tab'); a = await act()
        await ev("document.getElementById('pmRestart').focus()"); r0 = (await ev('window.__cr9.S.restarts || 0'))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400); armed = await ev("document.getElementById('pmRestart').classList.contains('sure')")
        paused_now = await ev('window.__cr9.S.paused'); await pg.wait_for_timeout(500); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1200); s = await st(pg)
        chk('E8 RESTART answers the keyboard: Enter arms "Sure?", a second Enter restarts (fresh run)', armed and paused_now and (await ev('window.__cr9.S.restarts || 0')) == r0 + 1 and s['state'] == 'run' and not s['paused'] and s['kills'] == 0, f'armed={armed} restarts {r0}->{await ev("window.__cr9.S.restarts || 0")}')
        await wait_live(pg, 0.1); await pg.wait_for_timeout(1500); await pg.keyboard.press('p'); await pg.wait_for_function('window.__cr9.S.paused', timeout=5000); await pg.wait_for_timeout(400)
        await ev("document.getElementById('pmMenu').focus()"); await pg.keyboard.press('Space'); await pg.wait_for_timeout(400); armed = await ev("document.getElementById('pmMenu').classList.contains('sure')")
        await pg.wait_for_timeout(500); await pg.keyboard.press('Space'); await pg.wait_for_timeout(1200); s = await st(pg)
        chk('E9 MAIN MENU answers the keyboard (Space, Space): back on the title', armed and s['state'] == 'title' and s['title'], f"armed={armed} state={s['state']}")
        await pg.wait_for_timeout(600); await start_run(pg, cdp); await wait_live(pg, 0.1); await pg.wait_for_timeout(1200); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        await ev("document.getElementById('pmResume').click()"); await pg.wait_for_timeout(300); s = await st(pg)
        chk('E10 a plain click() (screen reader / switch access: no pointer) on RESUME starts the countdown', s['counting'], f"counting={s['counting']}")
        await pg.wait_for_function('!window.__cr9.S.paused', timeout=10000)
        chk('E11 a fresh Space press in play after the menu is the beam, not a stuck button (focus is released on resume)', await ev('(document.activeElement && document.activeElement.tagName) || "BODY"') in ('BODY', 'HTML'))
        # touch still works on the buttons (real CDP touch)
        await pg.wait_for_timeout(500); await tap_el(pg, cdp, '#pauseBtn'); await pg.wait_for_function('window.__cr9.S.paused', timeout=5000); await pg.wait_for_timeout(500)
        await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_timeout(400); s = await st(pg)
        chk('E12 touch on RESUME still works once (pointerdown + the click after it did not double-fire)', s['counting'] and (await ev('window.__cr9.S.resumes || 0')) <= 1, f"counting={s['counting']}")
        await pg.wait_for_function('!window.__cr9.S.paused', timeout=10000)
        # SHRED vs thumb strip (report only, nothing moved)
        await ev('window.__cr9.S.shred = 100'); await pg.wait_for_timeout(700)
        meas = await ev("""(() => { const out = []; const sb = document.getElementById('shredBtn'); const pad = { l: 0, t: innerHeight * 0.78, r: innerWidth, b: innerHeight }; for (let i = 0; i < 6; i++) {} const r = sb.getBoundingClientRect(); const ix = Math.max(0, Math.min(r.right, pad.r) - Math.max(r.left, pad.l)), iy = Math.max(0, Math.min(r.bottom, pad.b) - Math.max(r.top, pad.t));
          const area = Math.PI * Math.pow(Math.min(r.width, r.height) / 2, 2); const cx = r.x + r.width / 2, cy = r.y + r.height / 2, rad = Math.min(r.width, r.height) / 2; let inside = 0, n = 0; for (let y = cy - rad; y <= cy + rad; y += 2) for (let x = cx - rad; x <= cx + rad; x += 2) { if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) { n++; if (y >= pad.t) inside++; } }
          return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], padTop: Math.round(pad.t), shredInPadPct: Math.round(inside / n * 100), widthPx: Math.round(r.width) }; })()""")
        print('   SHRED vs thumb strip (bottom 22% = the beam pad, #pad):', json.dumps(meas)); chk('E13 measured SHRED/thumb-strip overlap (report only; button not moved)', True, json.dumps(meas))
        await pg.context.close()
    if 'F' in PARTS:
        print('\n=== F: pause keeps the streak; countdown 1.5 s; tap skips ===')
        pg, cdp = await mk(b); ev = pg.evaluate; await start_run(pg, cdp); await wait_live(pg, 0.1); await wait_ship(pg, 5.0)
        # a held press (S.hold) on press id 7, first kill = streak 1 on that press
        await ev("(() => { const S = window.__cr9.S; S.pressId = 7; S.hold = true; })()"); await pg.evaluate(KILL); await pg.wait_for_function('window.__cr9.S.kills >= 1', timeout=5000)
        s0 = await st(pg); await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(500); s1 = await st(pg)
        chk('F1 pause with the beam held on a 1-chain: streak is KEPT (1), beam latch released, chain link set', s1['streak'] == 1 and s0['streak'] == 1 and s1['chain'] == 7 and not (await ev('window.__cr9.S.hold')), json.dumps({'before': s0['streak'], 'paused': s1['streak'], 'chain': s1['chain']}))
        await ev('window.__cr9.pause.resume()'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=10000)
        await pg.wait_for_function("(() => { const F = window.__cr9.S.fight; return F.ships.some(s => s.alive && s.man.kind !== 'flee'); })()", timeout=40000); await pg.wait_for_timeout(800)
        await ev("(() => { const S = window.__cr9.S; S.pressId = 8; S.hold = true; })()"); await pg.evaluate(KILL); await pg.wait_for_function('window.__cr9.S.kills >= 2', timeout=5000); await pg.wait_for_timeout(300); s2 = await st(pg)
        chk('F2 first press after RESUME + a kill continues the chain: streak 2, bestStreak 2, cowPts = 1,500 x (1 + 2) = 4,500', s2['streak'] == 2 and s2['best'] == 2 and s2['cowPts'] == 4500, f"streak={s2['streak']} best={s2['best']} cowPts={s2['cowPts']}")
        await pg.context.close()
        pg, cdp = await mk(b); ev = pg.evaluate; await start_run(pg, cdp); await wait_live(pg, 0.1); await wait_ship(pg, 5.0)
        await ev("(() => { const S = window.__cr9.S; S.pressId = 7; S.hold = true; })()"); await pg.evaluate(KILL); await pg.wait_for_function('window.__cr9.S.kills >= 1', timeout=5000); await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(400)
        await ev('window.__cr9.pause.resume()'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=10000)
        await pg.wait_for_function("(() => { const F = window.__cr9.S.fight; return F.ships.some(s => s.alive && s.man.kind !== 'flee'); })()", timeout=40000); await pg.wait_for_timeout(800)
        await ev("(() => { const S = window.__cr9.S; S.pressId = 9; S.hold = true; })()"); await pg.evaluate(KILL); await pg.wait_for_function('window.__cr9.S.kills >= 2', timeout=5000); await pg.wait_for_timeout(300); s3 = await st(pg)
        chk('F3 control: if the player lets go and presses AGAIN after resume (second press), the chain is NOT carried: streak 1, cowPts = 1,500 x (1 + 1) = 3,000', s3['streak'] == 1 and s3['cowPts'] == 3000, f"streak={s3['streak']} cowPts={s3['cowPts']}")
        await pg.context.close()
        # reload keeps the chain too
        pg, cdp = await mk(b); ev = pg.evaluate; await start_run(pg, cdp); await wait_live(pg, 0.1); await wait_ship(pg, 5.0)
        await ev("(() => { const S = window.__cr9.S; S.pressId = 7; S.hold = true; })()"); await pg.evaluate(KILL); await pg.wait_for_function('window.__cr9.S.kills >= 1', timeout=5000); await pg.wait_for_timeout(1500); await reload(pg)
        await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000); s4 = await st(pg)
        chk('F4 reload with the beam held on a 1-chain: streak 1 + chain link come back', s4['streak'] == 1 and s4['chain'] == 7, f"streak={s4['streak']} chain={s4['chain']}")
        await pg.context.close()
        # countdown timing + skip
        pg, cdp = await mk(b); ev = pg.evaluate; await start_run(pg, cdp); await wait_live(pg, 0.1); await pg.wait_for_timeout(1500)
        await ev("window.__tm = { t: [], digits: [] }; new MutationObserver(() => { const t = document.getElementById('pmCount').textContent; if (t) window.__tm.digits.push([t, performance.now()]); }).observe(document.getElementById('pmCount'), { childList: true, characterData: true, subtree: true }); setInterval(() => { if (!window.__cr9.S.paused && !window.__tm.done && window.__tm.t0) { window.__tm.done = performance.now(); } }, 10)")
        await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(500)
        await ev("window.__tm.t0 = performance.now()"); await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_function('window.__tm.done', timeout=10000); tm = await ev('window.__tm')
        digs = tm['digits']; steps = [round(digs[i + 1][1] - digs[i][1]) for i in range(len(digs) - 1)]; tot = tm['done'] - digs[0][1]
        chk('F5 countdown: 3, 2, 1 at ~0.5 s a beat; total ~1.5 s from the 3 to the game running', [d[0] for d in digs][:3] == ['3', '2', '1'] and all(430 <= x <= 650 for x in steps[:2]) and 1350 <= tot <= 2300, f"digits={[d[0] for d in digs]} steps_ms={steps} 3->running={tot:.0f} ms (includes audio resume)")
        await pg.wait_for_timeout(1500); await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(500); await ev("window.__tm = { digits: [] }; window.__tm.t0 = performance.now(); window.__skipDone = 0; setInterval(() => { if (!window.__cr9.S.paused && !window.__skipDone) window.__skipDone = performance.now(); }, 10)")
        await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_timeout(450); c0 = await st(pg); await tap(cdp, 206, 450); await pg.wait_for_function('window.__skipDone', timeout=10000); tt = await ev('window.__skipDone - window.__tm.t0')
        chk('F6 a tap on the countdown (after 0.45 s) skips it: the game is running < 1.3 s after the RESUME tap (a full countdown is ~1.5 s + audio wake)', c0['counting'] and tt < 1300 and (await ev('window.__cr9.S.cdSkips || 0')) == 1, f'running after {tt:.0f} ms, counting at tap={c0["counting"]}')
        await pg.wait_for_timeout(1000); s = await st(pg); chk('F7 after a skip the run is live and unfrozen (clock moving, audio running)', s['state'] == 'run' and not s['paused'] and s['ctx'] == 'running' and not s['songPaused'])
        # a double-tap on RESUME is not a skip
        await ev('window.__cr9.pause.pause()'); await pg.wait_for_timeout(500); sk0 = await ev('window.__cr9.S.cdSkips || 0'); await tap_el(pg, cdp, '#pmResume'); await asyncio.sleep(0.1); await tap(cdp, 206, 450); await pg.wait_for_timeout(300)
        chk('F8 a quick second tap (<0.3 s) on RESUME does not skip the countdown', (await st(pg))['counting'] and (await ev('window.__cr9.S.cdSkips || 0')) == sk0)
        await pg.wait_for_function('!window.__cr9.S.paused', timeout=10000); await pg.context.close()
    if 'G' in PARTS:
        print('\n=== G: grab + hyper restored, first-kill with a reload, draw calls / textures ===')
        # grab
        pg, cdp = await mk(b); ev = pg.evaluate; await start_run(pg, cdp); await wait_live(pg, 0.1); await wait_ship(pg, 5.0)
        await pg.evaluate(KILL); await pg.wait_for_function('window.__cr9.S.souls >= 1', timeout=5000)
        await pg.wait_for_function("(() => { const F = window.__cr9.S.fight; return F.wave >= 1 && F.ships.some(s => s.alive && s.man.kind !== 'flee'); })()", timeout=40000); await pg.wait_for_timeout(1500)
        await pg.wait_for_function("(() => { const S = window.__cr9.S; return S.state === 'run' && !S.grab && !S.lift && S.fight.ships.some(s => s.alive && s.Z < 26 && !['peek','flee','dive'].includes(s.man.kind)); })()", timeout=40000)
        ok = await ev('window.__cr9.test.grab()'); await pg.wait_for_timeout(1200); g0 = await st(pg); lives0 = g0['lives']; print('   grab before reload:', g0['grab'], 'lives', lives0)
        chk('G1 test setup: a truck grab is open (not yet broken free), 3 trucks', ok and g0['grab'] is not None and lives0 == 3)
        await reload(pg); await pg.wait_for_timeout(2500); await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000); await pg.wait_for_timeout(300); g1 = await st(pg)
        chk('G2 reload during an abduction grab: the grab comes back (same taps, timer within 1 s) - reloading is not an escape', g1['grab'] is not None and g1['grab']['taps'] == g0['grab']['taps'] and abs(g1['grab']['t'] - g0['grab']['t']) < 1.0 and g1['lives'] == 3, f"before={g0['grab']} after={g1['grab']} lives={g1['lives']}")
        await pg.wait_for_timeout(3000); g1b = await st(pg); chk('G3 grab frozen while paused after the restore', g1b['grab'] == g1['grab'])
        await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=15000)
        await pg.wait_for_function("window.__cr9.S.grab === null", timeout=20000); await pg.wait_for_timeout(500); g2 = await st(pg)
        chk('G4 not tapping through the restored grab costs the truck as it would have (lives 3 -> 2)', g2['lives'] == 2, f"lives={g2['lives']}")
        await pg.context.close()
        # hyper
        pg, cdp = await mk(b); ev = pg.evaluate; await start_run(pg, cdp); await wait_live(pg, 0.1); await wait_ship(pg, 5.0); await pg.wait_for_timeout(1000)
        await ev('window.__cr9.S.shred = 100'); await pg.wait_for_timeout(500); await ev('window.__cr9.p3.startHyper()'); await pg.wait_for_timeout(1500); h0 = await st(pg)
        await reload(pg); await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000); await pg.wait_for_timeout(300); h1 = await st(pg)
        chk('G5 reload during HYPER MODE: it comes back with its timer (within 1 s) and an empty SHRED bar', h0['hyper'] is not None and h1['hyper'] is not None and abs(h1['hyper'] - h0['hyper']) < 1.0 and h1['shred'] == 0, f"hyper.t {h0['hyper']}->{h1['hyper']} shred={h1['shred']}")
        await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=15000); await pg.wait_for_timeout(7000); h2 = await st(pg)
        chk('G6 HYPER runs out on its own clock afterwards (ended, SHRED button not stuck)', h2['hyper'] is None and h2['state'] == 'run', f"hyper={h2['hyper']}")
        await pg.context.close()
        # first kill with a reload in the middle
        async def fk(reload_mid):
            pg, cdp = await mk(b); ev = pg.evaluate; await start_run(pg, cdp); await wait_live(pg, 0.1); info = {}
            if reload_mid:
                await pg.wait_for_function('window.__cr9.S.fight.t > 2.2', timeout=30000); await pg.wait_for_timeout(500); info['pre'] = await st(pg); await reload(pg); await pg.wait_for_timeout(6000)  # 6 s away
                await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000); info['rest'] = await st(pg); await pg.wait_for_timeout(500)
                await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=15000)
            await pg.wait_for_function("window.__cr9.S.fight.t > 4.7 && window.__cr9.S.fight.ships.some(s => s.alive)", timeout=60000); info['ftKill'] = await ev('window.__cr9.S.fight.t')
            await pg.evaluate(KILL); await pg.wait_for_timeout(1500)
            o = await ev("(() => { const S = window.__cr9.S; return { firstKill: S.firstKill, runDur: window.__cr9.pause.runDur(), score: S.score, souls: S.souls, kills: S.kills, bestStreak: S.bestStreak, cowPts: S.cowPts, cowHits: S.cowHits, pointBlanks: S.pointBlanks, restored: S.restored, ft: S.fight.t }; })()")
            info['o'] = o; info['posts'] = pg.posts; await pg.context.close(); return info
        ctl = await fk(False); rl = await fk(True)
        for nm, r in (('control (no reload)', ctl), ('reload at fight.t~2.7, 6 s away', rl)):
            o = r['o']; run = {'name': 'TESTER', 'score': o['score'], 'souls': o['souls'], 'kills': o['kills'], 'bestStreak': o['bestStreak'], 'cowPts': o['cowPts'], 'cowHits': o['cowHits'], 'pointBlanks': o['pointBlanks'], 'firstKill': o['firstKill'], 'abducted': False, 'dur': round(o['runDur'], 1), 'v': '4.8.0'}
            if o['restored']: run['restored'] = True
            r['verdict'] = verdict(run); print(f"   {nm}: firstKill={o['firstKill']} s, fight.t at kill={r['ftKill']:.2f}, run time={o['runDur']:.2f}, verdict={r['verdict']}")
        chk('G7 first-kill time with a reload in the middle matches the control (the time away + restore is not in it)', rl['o']['firstKill'] >= 4.3 and abs(rl['o']['firstKill'] - rl['ftKill']) < 1.3 and abs(rl['o']['firstKill'] - ctl['o']['firstKill']) < 1.5, f"control {ctl['o']['firstKill']} (fight.t {ctl['ftKill']:.2f}) vs reload {rl['o']['firstKill']} (fight.t {rl['ftKill']:.2f}); restored run clock at restore {rl['rest']['runDur']:.2f} vs before reload {rl['pre']['runDur']:.2f}")
        chk('G8 the reloaded run (restored:true) validates on the real server rules incl. FK_MIN 4.3', rl['verdict'] == 'OK' and ctl['verdict'] == 'OK', f"control={ctl['verdict']} reloaded={rl['verdict']}")
        # draw calls + texture memory in a restored run
        pg, cdp = await mk(b); ev = pg.evaluate; await build_state(pg, cdp); await reload(pg); await pg.wait_for_timeout(300); await tap_el(pg, cdp, '#resumeBtn'); await pg.wait_for_function("window.__cr9.S.paused && window.__cr9.S.restored", timeout=40000)
        await pg.wait_for_timeout(500); await tap_el(pg, cdp, '#pmResume'); await pg.wait_for_function('!window.__cr9.S.paused', timeout=15000); await pg.wait_for_timeout(2500)
        stt = await ev('window.__cr9.stats'); tex = await ev(TEXMB)
        chk('G9 restored run in play: texture memory < 64 MB (draw calls: see p4h_perf.py, the in-game counter only sees the last pass)', tex < 64, f"textures={stt['textures']} texMB~{tex:.1f}")
        chk('G10 no console errors across the restored run', not pg.errs, json.dumps(pg.errs[:4])); await pg.context.close()
