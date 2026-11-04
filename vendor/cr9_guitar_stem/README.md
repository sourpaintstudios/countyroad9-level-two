# CR9 guitar stem + gray laugh

| file | md5 | size |
|---|---|---|
| GTR_Song_Stem.ogg | 8d5d43fda9781a88c0c70b06e4122798 | 2,764,884 B (Vorbis ~96 kbps mono) |
| GTR_Song_Stem.mp3 | 9d667a3722993595c78b9cbd2a30d964 | 2,886,156 B (LAME 96 kbps CBR mono) |
| VO_Gray_Laugh.ogg | b08844dfc10135907cf3ed5426b15e1b | 23,004 B |
| VO_Gray_Laugh.mp3 | c72c311f70ec36ad1df49514fbacac40 | 30,554 B |

## GTR_Song_Stem
- Source: demucs htdemucs `no_vocals.wav` of CR9_Song_OpenMic.wav (the only instrumental stem; there is no separate guitar stem).
- The game's song (`public/audio/{ogg,mp3}/MUSIC_Full.*`) is the OpenMic mix starting at the same sample, cut at 240.4496 s. Raw song vs MUSIC_Full.ogg measured at 0 to 1 samples (Vorbis decode jitter).
- Stem: mono, 44.1 kHz, trimmed to exactly 10,603,827 samples (same length as MUSIC_Full.ogg), 50 ms fade-out at the end, normalized to -3.3 dBFS.
- Checked on the decoded encoded files with cross-correlation at 30, 120 and 200 s:
  - Against the stem master: **0 samples** (OGG and MP3).
  - Against MUSIC_Full.ogg: **0 samples** (OGG and MP3).
  - The MP3's LAME/Xing header removes the encoder delay, so the decoded MP3 has no offset.
- Encoded peak: OGG -3.41 dBFS, MP3 -3.53 dBFS.
- 2.5–4.5 kHz share: OGG 4.9%, MP3 5.05%. No EQ was needed.
- Vocal bleed: limited to what htdemucs leaves (faint residue only in loud vocal phrases). It is masked because the song plays underneath at the same time.

## VO_Gray_Laugh
- Source: the "HA HA HA!" at 4.26–5.72 s of the mp4 (confirmed by transcription). Cut 4.15–6.00 s, 10 ms fade-in, 120 ms fade-out.
- Processing: 100 Hz high-pass, -3 dB peaking cut at 3.3 kHz (Q 0.9), soft peak control, -17 LUFS.
- Result: 1.85 s, mono, 44.1 kHz.
  - OGG: -17.25 LUFS, peak -3.83 dBFS, 2.5–4.5 kHz share 6.2%.
  - MP3: -17.45 LUFS, peak -4.26 dBFS, 2.5–4.5 kHz share 6.3%.
- The clip's music bed is still faintly audible between the "ha"s (no separation tool was available).

## Integration note (game not edited)
1. **Pack.** Add `GTR_Song_Stem` next to `MUSIC_Full` (same ogg/mp3 format choice).
2. **Element.** Stream it; don't decode it, because the full buffer is about 80 MB. In `initAudio`:
   `A.gtrEl = makeEl(url('GTR_Song_Stem')); A.gtrG = ctx.createGain(); A.gtrG.gain.value = 0; ctx.createMediaElementSource(A.gtrEl).connect(A.gtrG); A.gtrG.connect(A.duckG?...)`
   - Route it after the muffle stage so truck-lift and MISSING TIME muffling also apply. Simplest: connect `A.gtrG` into `A.muffleLP`, so it shares songTrim, duck, warp and the clean/radio routes.
   - Do NOT put it under `A.duckG` if that node is used for the beam duck below.
   - Prime it in the same gesture as the song (`play().then(pause)`).
3. **Lockstep.** Every song transport call must also hit the stem:
   - `seekAndPlay(A.songEl, t)` → `seekAndPlay(A.gtrEl, t)`. This covers run start at START_T = 19.5 (parade mode 66), startParade at 92.9 and MISSING TIME at 94.4.
   - Every `songEl.pause()`, including `stopAll`.
   - Every `playbackRate` change (main.js reset sets it to 1).
4. **Drift resync.** In `onBeat` (or Song.update): if `!A.songEl.paused && Math.abs(A.gtrEl.currentTime - A.songEl.currentTime) > 0.020`, set `A.gtrEl.currentTime = A.songEl.currentTime`.
   - Two HTMLMediaElements run on separate media clocks. Android Chrome can drift tens of ms over a few minutes and after stalls or seeks.
   - Seeking is not sample-accurate (MP3 especially), so a resync can click. Do it only while the gain is 0, or dip the gain over about 10 ms around the seek.
   - Alternative if memory allows: one AudioContext clock for both (both as AudioBuffers). That is ruled out here for memory.
5. **Beam.**
   - Hold start: `A.gtrG.gain` ramps 0 → 0.9 over 40 ms (`linearRampToValueAtTime`).
   - Release: ramps to 0 over 150 ms.
   - While held: duck the main song about 3 dB (×0.708) with its own gain on `MUSIC_Full`'s path before the stem joins it. Do not reuse songDuck's -6 dB, which stays for VO.
6. **Kill and strums.** Keep `GTR_Kill_Chord` on kill. Drop the per-beat strums: remove the GTR_Strum_01..06 calls in `onBeat` and `strum()`, or empty `ATTACK.strums`. Note that `hasStrums()` also mutes the lock hum, so decide whether the hum comes back.
7. **Laugh.** VO_Gray_Laugh is a normal one-shot `play('VO_Gray_Laugh', {gain: ...})` on the sfx bus.
