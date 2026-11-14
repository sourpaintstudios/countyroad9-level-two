// v4.1 (DOT): EVERY shipped asset gets a content hash in its filename (art, the one-shot packs, the song).
// Sources: art-src/ + vendor/cr9_sound_pack. Output: public/art, public/audio, and src/manifest.json (imported by the bundle).
import fs from 'fs'; import crypto from 'crypto'; import { execSync } from 'child_process';
// v4.5: rebuild the ONE cow sheet from vendor/cr9_cows by filename (src/cows.json) first
try { execSync('python3 tools/make_cow_sheet.py', { stdio: 'inherit' }); } catch (e) { console.log('cow sheet rebuild skipped (python deps missing); using committed art-src/cows_sheet.webp'); }
const h8 = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 8);
const hashed = (name, b) => { const i = name.lastIndexOf('.'); return `${name.slice(0, i)}.${h8(b)}${name.slice(i)}`; };
fs.rmSync('public/art', { recursive: true, force: true }); fs.rmSync('public/audio', { recursive: true, force: true });
fs.mkdirSync('public/art', { recursive: true });
const man = { art: {}, audio: {} };
for (const f of fs.readdirSync('art-src')) { const b = fs.readFileSync(`art-src/${f}`); const n = hashed(f, b); fs.writeFileSync(`public/art/${n}`, b); man.art[f] = n; }
const names = JSON.parse(fs.readFileSync('src/oneshots.json', 'utf8'));
for (const fmt of ['ogg', 'mp3']) {
  fs.mkdirSync(`public/audio/${fmt}`, { recursive: true });
  const idx = {}; const parts = []; let off = 0;
  for (const n of names) { let fp = `vendor/cr9_sound_pack/${fmt}/${n}.${fmt}`; const fa = `vendor/cr9_atmos_pack/${fmt}/${n}.${fmt}`; if (fs.existsSync(fa)) fp = fa; /* p4b: REX's atmosphere pack drops in by name */ if (!fs.existsSync(fp)) { console.log('  (slot empty, skipped)', n); continue; } const b = fs.readFileSync(fp); idx[n] = [off, b.length]; parts.push(b); off += b.length; }
  const bin = Buffer.concat(parts), js = Buffer.from(JSON.stringify(idx));
  // v4.4 REX song drop-in slot: the newest vendor/cr9_sound_pack/music/CR9_Song_Master_v*.{ogg,mp3} wins (sample-aligned with MUSIC_Full); else MUSIC_Full. WAV never ships.
  const md = 'vendor/cr9_sound_pack/music', masters = fs.existsSync(md) ? fs.readdirSync(md).filter((f) => /^CR9_Song_Master_v\d+\./.test(f) && f.endsWith('.' + fmt)).sort((a, b) => parseInt(a.match(/v(\d+)/)[1]) - parseInt(b.match(/v(\d+)/)[1])) : [];
  const songSrc = masters.length ? `${md}/${masters[masters.length - 1]}` : `vendor/cr9_sound_pack/${fmt}/MUSIC_Full.${fmt}`, mus = fs.readFileSync(songSrc); console.log('song', fmt, songSrc);
  const m = { bin: hashed(`pack_${fmt}.bin`, bin), json: hashed(`pack_${fmt}.json`, js), music: `${fmt}/` + hashed(`MUSIC_Full.${fmt}`, mus) };
  fs.writeFileSync(`public/audio/${m.bin}`, bin); fs.writeFileSync(`public/audio/${m.json}`, js); fs.writeFileSync(`public/audio/${m.music}`, mus);
  // pass 3 (Daniel/REX/DOT): full-length guitar-only stem, sample-aligned with the song, STREAMED (never decoded): vendor/cr9_sound_pack/music/CR9_Guitar_Stem*.{ogg,mp3}, newest name wins. Absent -> null (strum fallback).
  const SD = 'vendor/cr9_guitar_stem', stems = fs.existsSync(`${SD}/GTR_Song_Stem.${fmt}`) ? [`${SD}/GTR_Song_Stem.${fmt}`] : []; // REX: instrumental stem, 0-sample aligned with MUSIC_Full
  if (process.env.CR9_STEM_TEST) stems.push('__test'); m.stem = null;
  if (stems.length) { const sp = stems[stems.length - 1] === '__test' ? `${process.env.CR9_STEM_TEST}.${fmt}` : stems[stems.length - 1]; const sb = fs.readFileSync(sp); m.stem = `${fmt}/` + hashed(`GTR_Stem.${fmt}`, sb); fs.writeFileSync(`public/audio/${m.stem}`, sb); console.log('stem', fmt, sp, (sb.length / 1048576).toFixed(2) + ' MB'); } else console.log('stem', fmt, 'none yet (strum fallback)');
  man.audio[fmt] = m; console.log(fmt, off, m);
}
fs.writeFileSync('src/manifest.json', JSON.stringify(man, null, 1));
fs.copyFileSync('vendor/cr9_sound_pack/MUSIC_Beats.json', 'src/beats.json');
// v4.5.2 stale-copy defense: the build version (package.json) the running bundle compares against; served no-store (public/vercel.json)
fs.writeFileSync('public/version.json', JSON.stringify({ v: JSON.parse(fs.readFileSync('package.json', 'utf8')).version, built: new Date().toISOString() }));
