# County Road 9: v2 phone test (Sour Paint Studios)

Live: https://cr9-test-scene.vercel.app (Vercel project `cr9-test-scene`).
Built for Android Chrome. The target is 30 fps on a mid-range phone.
Rollback to v1: promote deployment `dpl_FvbZcRAUSfUurn38f1c1rQXbqJok`.
The v1 code is still in `/workspace/cr9-test-scene` and was not changed.

## Flow
1. **Drive-in (about verse 1):** Tap the radio knob to start. This also unlocks the audio. The song plays through the AM radio on a night road.
   - Optional: drag left or right to steer.
   - Saucers appear. The song and the crickets cut out for half a beat, the truck dies, and the scene cuts to the fight.
2. **Staredown:** The smug alien face pops into a green TARGET LOCK above the saucer, with a smug chirp.
3. **Fight:**
   - The **left stick** (or a drag on the left half) aims the reticle. The saucer drifts and jukes.
   - **Hold the right button** to fire the rainbow beam from the soundhole. Notes and paint globs stream along the beam and splat onto the face.
   - Each beat from the beat map that lands while you are on target steps up the charge, the camera zoom, the face (smug, then shocked with hands on cheeks, then screaming, then melting) and the combo. The combo carries across rounds.
   - If you are off target, or not holding, on a beat, the alien recovers one step. If he recovers fully, he laughs.
   - At **full charge (4 beats)**, sparks fly off the strings for exactly one beat. **Release on the next beat** to fire the finisher. The window is forgiving and uses your calibration offset.
   - Releasing early is a weak hit, and he laughs. Holding past the window fizzles, he laughs, and the charge resets.
4. **Transformation:** Music *saves* aliens. A real-time WebGL morph lasting 2.2 s plays in one draw call, synced to REX's `FIGHT_Transform_Cow` cue. Stage times:

   | Time | Stage |
   |---|---|
   | 0 s | Sag and drip |
   | 0.40 s | Collapse into a swirling puddle |
   | 0.90 s | SDF rise into the cow shape |
   | 1.40 s | Colour floods in from the bottom up |
   | 1.70 s | Shake off the drips, sparkle, moo |

   The moo rings out past the end of the cue. Tap to skip, but only after you have seen one full morph (`localStorage cr9_morph_seen`).
5. **Finale:** The cow drops onto the road, shakes, and walks off into the field. Then:
   - fireworks, fire, notes and confetti
   - **ANOTHER SOUL SAVED!** with "Souls saved: N"
   - the song slams back in clean and loud
   - an end card with Play again and Re-tune timing

`TRANSFORMS` in `src/main.js` maps each genre to an animal. Only `country → cow` is wired up.

## URL flags
- `?fps=1`: perf overlay showing fps, draws, triangles, textures, MB, particles, pixel ratio, audio format, song time, calibration, state and morph fps.
- `?skip=fight`: jumps straight to the fight after the knob.
- `?q=low`: lower render resolution.
- `?fmt=mp3` or `?fmt=ogg`: forces the audio format.

Calibration is stored in `localStorage cr9_cal_v1`, the same as v1. Desktop keys: Space holds the beam and the arrow keys aim.

## Scene cost
Measured in the headless check:
- About 15–29 draw calls.
- Under 60 triangles.
- About 22 MB of estimated texture memory. Every texture is 1024 px or smaller, and the face atlas is 512 px per face.
- One particle pool (500 max, one draw call), with a peak of about 180 live particles.
- One beam ribbon.

Download sizes:
- JS: 589 KB (155 KB gzip).
- Art: about 0.87 MB of webp.
- One-shot sound pack: about 1.1 MB, fetched before the knob becomes active.
- The song streams.

## Art credits
- **From Daniel's own images:** the road backdrop (from his night-road photo, repainted and regraded), the saucer (cut from his painting), the alien face (from his smug-alien painting), the guitarist (cut from his mockup), and the County Road 9 sign. All of these were given a painterly oil/emboss pass and rim light (`tools/`).
- **Procedural (code-painted, in `tools/`):** the fear, scream and laugh expressions, which are warps and paint-overs of Daniel's face; the cow and its rig parts; corn; saguaros; the dashboard and radio; the FX atlas; the sky; and all shaders (beam, melt, morph).
- **AI-generated images:** none ship. The generated keyframes could not be exported into the build.

## Sound credits
All sounds are by REX (`/workspace/cr9_sound_pack`).
- `VO_Got_Him_PLACEHOLDER` is not used, because the on-screen text replaced it.
- The single `FIGHT_Transform_Cow` cue drives the morph. The separate `FIGHT_Morph_Stage1–5` files are not layered on top, to avoid doubling.

## Test
- `python check.py [url] [dpr]` runs the full headless Playwright pass: 412x915 viewport, touch, Android user agent. Screenshots go to `shots/`.
- `npm run build` packs the audio and builds into `dist/`.

---
# v3 "Missing Time Mixtape" (this folder: /workspace/cr9-v3; cr9-v2 is untouched)
Flow: title MISSING TIME → tap (unlocks audio) → song on the AM radio from 14.0 s → 3 microgames at 19.9 s (verse 1), each 13 beats (2 command + 8 play + 3 reaction):
TILT! (DeviceOrientation gamma, fallback drag/arrow keys; dodge the chasing beam spot, lose if >2.0 s in it), TAP THE RADIO! (3 taps within ±150 ms of beats; static clears, ship wobbles), SWIPE! (2 paint strokes across the gray).
Win = gray gasps, melts away, a cow joins the parade + moo. Fail = smug laugh, OH NO!, truck lifts in the beam, run continues.
ANSWER THE GRAYS at chorus 1 (43.4 s): gray plays 3/3/4-note phrases (lit strings + warbly triangle synth), you answer on 3 strings (bottom 36% of screen).
Key: measured D major (chroma of MUSIC_Full 14–74 s vs Krumhansl profiles). Strings = I–IV–V roots D/G/A; GTR_Beat_Bonus_01 (a G-chord strum) is rate-shifted −5/0/+2 semitones. Gray notes D5/G5/A5.
Difficulty curve: phrase 1 half-time (a note every 2 beats), ±180 ms, pure notes; phrase 2 on the beat, ±120 ms, small pitch scoops; phrase 3 four notes, ±100 ms, bigger scoops + vibrato. Gray notes always land on D-major tones D5/G5/A5 (inside D4–D6 for phone speakers). Timing: snapped to the nearest answer beat after calibration (cr9_cal_v1, clamped 0–250 ms). Forgiving by design: any answer advances the face (smug → surprised → moved/tears → morph); a perfect copy just gets PERFECT!. Wrong/off-beat taps make him laugh (ALIEN_Laugh_Miss_01) once per round; a silent round gets a laugh, and the 2nd silent round in a row advances anyway, so the cow always melts out.
After 3 phrases: v2's 2.2 s morph + FIGHT_Transform_Cow → ANOTHER SOUL SAVED! → PIED PIPER PARADE (one InstancedMesh, max 5 cows, hoofsteps loop + moos) → end card "X souls saved on County Road 9" + Play again.
Flags: ?fps=1 (thin bottom strip), ?skip=duel, ?skip=parade, ?q=low. Desktop keys: arrows steer, Space taps radio, A/S/D strings.
Test: `python check.py [url]` runs good-bot (screens → shots/v3_*.png), sloppy random real taps, no-input, skip=duel, skip=parade; all must reach the end card with no console errors.

---
# v3.1 (this folder: /workspace/cr9-v31; cr9-v3 is untouched). Rollback = v3 `dpl_HzJjhp7xCnmQNenWKYfkBXhjJGMg`.
- **HOLD & SLIDE theremin duel** replaces the 3-string answer duel. Opens with a 3-beat (~1.5 s) demo: hand icon + HOLD & SLIDE!. Then 3 phrases of 16 beats with 3 reaction beats between them (~30 s in total). The gray's melody (D major) scrolls right to left as one glowing ribbon (`makeLine` in gfx.js). Its height is the pitch and its thickness is the grading tolerance. Hold anywhere: finger height (22–78% of the screen, D6 at the top, D4 at the bottom) sets a live Web Audio theremin (sine + soft triangle, 5.6 Hz vibrato on detune, lowpass) that is soft-snapped toward D-major tones (`snapSemi`). The gray sings its line on a warbly triangle voice. No sound files.
- Grading is continuous: closeness at the playhead (30% of the width), with a ~150 ms reaction grace, fills the GRAY MATCH meter and floods paint over the face. Rests and letting go are fine. If you stay far off pitch for 1.2 s, the gray plays the ALIEN_Laugh_Miss_01 laugh (3.5 s cooldown). Phrases: tol ±3.2 / ±2.1 / ±1.4 semitones, lookahead 3.4 / 2.9 / 2.5 s (later phrases scroll faster), with more bends and vibrato later on. The duel always ends on time, then the face floats down, the 2.2 s morph plays, then ANOTHER SOUL SAVED!. The end card shows "Gray matched: NN%".
- Microgame intro card: big word + animated 👆 (TILT! / TAP! / SWIPE!) for ~1.5 beats, with TELL_TruckBed_Beep (first 0.45 s = two pips) as the cue.
- SWIPE is more forgiving: the target radius grows from 120 to 180 (out of 256 face-UV units), the stroke length needed drops from 150 to 100, and the window grows from 8 beats to 13 (rel 1–14).
- Missed microgame: a big TRY AGAIN button for the 3 reaction beats + 4 extra beats. Tapping it replays that game once.
- Parade lasts 5 s (tap to skip after 1.5 s), then the end card with a huge pulsing PLAY AGAIN at the top. A small line shows the lowest fps over any 0.5 s window of the cow morph.
- Test: `python check.py [url]` (default http://localhost:4181/ via `npx vite preview --port 4181`). Runs: good (hook bot + a real CDP held touch drag along the line), random (random taps/held drags, presses TRY AGAIN once), idle, ?skip=duel, ?skip=parade. Shots go to shots/v31_*.png.

---
# v3.2 (this folder: /workspace/cr9-v32; v3.1 untouched). Rollback = v3.1 `dpl_DC3Lz7u7dCorxxio4cACNZu8Hfo9`.
- Audio: removed the shrill AMB_Crickets bed (centroid 4.6 kHz, 100% of energy above 4 kHz) and the sub-only VEH_Truck_Idle (centroid 39 Hz, inaudible on phones). Added a live '84 Chevy idle in `audio.js makeEngine`: ~48 Hz sawtooths, soft clip, resonant 420 Hz lowpass, 90 Hz highpass, 7.3 Hz lope, RPM wobble, plus 260 Hz bandpassed tire-hum noise, on the veh bus at 0.2 (ducked during the duel). The amb/veh buses now pass a 4.5 kHz lowpass and sfx a 6 kHz lowpass (music untouched); the intro beep gain dropped from 2.2 to 1.4.
- Animated gray (face shader uniforms uLook/uLid/uGrin/uStrain + JS `faceAnim`): blinks every 2-5 s; pupils track the finger (duel hold, swipe), otherwise the truck; smug grin grows while off pitch; laugh squash and stretch; strain (tremble, squint, flush) grows with the match meter; shudder before the melt; live rainbow 'crying paint' tears. Sequence: smug -> shocked once you start matching -> tears -> crying-paint scream cell + shake -> melt.
- Big melts: camera push-in, 0.5 s at half speed, crying + shake, then pop. Microgame wins: a cow sprite pops out (elastic) with ANIMAL_Cow_Moo_01 and a paint splash, then trots to the parade. Duel: the morph starts from the crying face under a 1.3x push-in; at the end the cow bounces out with ANIMAL_Cow_Moo_02 + a big splash + confetti, then the camera pulls back for ANOTHER SOUL SAVED!.
- vercel.json: `Cache-Control: no-cache` on / and /index.html.
- Waves / two-saucer round: NOT built (scope cut).

## v4 (preview)
- Waves: 3 waves (1 saucer, 1 saucer, 2 saucers at once). Each ship flies in from the fogged horizon tiny/dim and grows into place. A ~5 s matched hold kills (hp 4.2/4.0/2.5 each). Every wave is force-won when its line ends. The next ship arrives ~1.5 s after a melt. In the two-saucer wave, line colour (pink/cyan) and the saucer glow show whose line is live.
- Every kill: crying-paint face, GOT HIM!, push-in + half-speed, melt, cow pop + moo + splash, ANOTHER SOUL SAVED!, souls counter. The last gray gets the full 2.2 s SDF cow morph.
- Daniel (hero.webp) bobs on the beat, strums with a soundhole glow and note sparks while you hold, jumps with 😁 on kills, flinches with 😬 when a gray laughs.
- Finale: chorus 2 (92.9 s) slams back in on the clean route with a lowpass sweep, crowd + fireworks, saved cows dance behind the truck, confetti, rank card (Roadside Rookie → Legend of County Road 9), NEW HIGH SCORE! (localStorage cr9_best_v4).
- Audio: AMB_Truck_Drive_Loop replaces the synth engine. TELL_TruckBed_Beep → TELL_Horn_Honk (0.9), RADIO_Squeal_Cut → RADIO_Wrong_Station_Thunk (0.6). Static bed and crickets removed. ALIEN_Gasp_02 dropped (61% of its energy in 2.5–4.5 kHz). Asset/audio URLs carry ?v=4.
- Depth: no DOF blur; a horizon fog layer plus far-ship tint/scale.

## v4.1 — aim & beam
- **Controls (one finger):** touch and hold anywhere = guitar beam on; drag to aim. The reticle floats 110 CSS px above the fingertip so the finger never covers the target. Lift = beam off.
- **Kills are earned:** 5 s of continuous lock kills a gray. Losing lock decays the meter at 0.15/s, never below 60% of the peak reached.
- **Lock escalation:** s1 flinch / s2 bug-eyes / s3 paint drips / s4 scream / s5 pop. Vibration grows 50→170 ms, cue steps D E F# A D (triangle through 2× 1.8 kHz lowpass). Sounds: Fear_Step_1-3, Gasp_01, Scream_Melt_01.
- **Waves:** 1 big slow ship → 1 fast → 2 → 3 (7 grays). Ships swoop, hover, strafe, pull back and dive in real Z. Survivors flee when a wave times out; with no input the run ends with 0 kills, rank Roadside Rookie.
- **Streaks:** a kill chained without lifting gives 2x!/3x!… plus a bonus soul, and the radio level ramps up.
- **Gags (IKE spec):** face states, air-guitar mock + laugh on a miss, a confused cow with an antenna, next-gray panic, Daniel's reactions, win lines, ranks by souls.
- **Ops:** every art/audio file is content-hashed (pack-assets.mjs → src/manifest.json); /art and /audio are immutable, / and index.html are no-cache.
- **Tests:** `python3 check.py http://localhost:4191/ [good|random|idle|duel|parade]`

## v4.2 — late pass-1 notes
- Waves: 1 big → 1 fast → "TWO OF 'EM!" → "THEY BROUGHT FRIENDS!" 2-and-2 back to back (8 grays). Never more than 2 ships on screen (2 instanced slots; spawns wait for a free slot).
- Daniel: real pose frames on his one sprite (tools/make_poses.py): guitar overhead on a kill, head-bang on a streak kill, flinch on the truck lift. No emoji; "oh no!" is a text tag.
- Truck lift: a diving ship grabs the truck for 1.1 s (max once per 9 s); the song goes through a 650 Hz lowpass at x0.8 and snaps back open with a x1.18 punch on the drop.
- Audio: *_Soft files for Crowd_Cheer / Saved_Sting / Beat_Bonus_02 / Fear_Step_2 (loudness-matched, BS.1770). Beam hum climbs D E F# A, a second hum a third above stacks when two ships are locked, D-major chord on every pop; all synth voices through 2x 1.8 kHz lowpass.
- Gags: panic double-take (1.0 s), air-guitar taunt punches the face + guitar to ~2x.
- DOT: one fog layer; ship glow fades out where it overlaps the fog; the end card always shows the lowest melt fps + run average.
