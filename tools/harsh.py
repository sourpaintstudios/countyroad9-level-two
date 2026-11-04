# DANA: harsh-range check on every SHIPPED one-shot (from the built OGG pack). Harsh band = 2-5 kHz. Flag if band RMS is within 10 dB of the full-band RMS.
import json, subprocess, numpy as np, glob, sys
d = 'dist/audio/'; pj = json.load(open(glob.glob(d + 'pack_ogg.*.json')[0])); blob = open(glob.glob(d + 'pack_ogg.*.bin')[0], 'rb').read()
items = pj['files'] if 'files' in pj else pj
rows = []
for name, ent in (items.items() if isinstance(items, dict) else [(e['name'], e) for e in items]):
    off, ln = (ent['o'], ent['l']) if 'o' in ent else (ent['offset'], ent['length']) if 'offset' in ent else ent[:2]
    pcm = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', '-', '-f', 'f32le', '-ac', '1', '-ar', '44100', '-'], input=blob[off:off + ln], capture_output=True).stdout
    x = np.frombuffer(pcm, np.float32)
    if len(x) < 1024: rows.append((name, None)); continue
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2; f = np.fft.rfftfreq(len(x), 1 / 44100)
    tot = X.sum(); band = X[(f >= 2000) & (f <= 5000)].sum(); rows.append((name, 10 * np.log10(band / tot + 1e-12)))
flag = sorted([r for r in rows if r[1] is not None and r[1] > -10], key=lambda r: -r[1])
print(json.dumps({'shipped': len(rows), 'flagged': len(flag)}))
for n, v in flag: print(f'  {n}: harsh band {v:+.1f} dB re overall')
