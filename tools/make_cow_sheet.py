# v4.5 DOT: ONE cow sprite sheet (<= 1024x1024) + a matching half-res SDF sheet for the morph shader.
# Frames per cow type: hybrid3 (black alien eyes). Shred: bald gray (+ _spotted where it exists).
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd
sys.path.insert(0, os.path.dirname(__file__)); from eyes import find_eyes
C = json.load(open('src/cows.json')); SRC = C['src']
def load(name):
    p = os.path.join(SRC, name); return Image.open(p).convert('RGBA') if os.path.exists(p) else None
def trim(im):
    a = np.asarray(im)[..., 3]; ys, xs = np.nonzero(a > 8); return im.crop((max(0, xs.min() - 3), max(0, ys.min() - 3), min(im.width, xs.max() + 4), min(im.height, ys.max() + 4))), (max(0, xs.min() - 3), max(0, ys.min() - 3))
def eyes_of(t, im):
    e = C['eyes'].get(t) or find_eyes(im, 'black'); return [tuple(x) for x in e]
def fake_soul(im, eyes, keep_black=0):
    a = np.asarray(im).astype(float).copy(); h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]
    for k, (x, y, r) in enumerate(eyes):
        if k < keep_black: continue  # golden keeps one black eye
        d = np.hypot(xx - x, yy - y) / r; lum = a[..., :3].mean(-1)
        m = (d < 1.0) & (lum < 110) & (a[..., 3] > 100)
        iris = np.clip(1 - d, 0, 1)  # warm brown iris, darker rim, near-black pupil
        brown = np.stack([150 - 70 * (d > 0.75), 82 - 40 * (d > 0.75), 30 - 14 * (d > 0.75)], -1) * (0.75 + 0.5 * iris[..., None])
        pupil = d < 0.42; brown[pupil] = [28, 16, 10]
        a[..., :3][m] = brown[m]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
def fake_blink(im, eyes, only=None):
    out = im.copy(); a = np.asarray(im).astype(float); h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]; dr = ImageDraw.Draw(out)
    for k, (x, y, r) in enumerate(eyes):
        if only is not None and k != only: continue
        ring = (np.hypot(xx - x, yy - y) > r * 1.15) & (np.hypot(xx - x, yy - y) < r * 1.6) & (a[..., 3] > 200)
        px = a[..., :3][ring]; lum = px.mean(-1); px = px[lum > np.percentile(lum, 40)] if len(px) else np.array([[150, 120, 100]])
        skin = tuple(int(v) for v in np.median(px, 0))
        dr.ellipse([x - r * 1.1, y - r * 1.05, x + r * 1.1, y + r * 1.05], fill=skin + (255,))
        dr.arc([x - r * 1.05, y - r * 0.9, x + r * 1.05, y + r * 0.7], 15, 165, fill=(25, 15, 20, 255), width=max(2, r // 6))
    return out
frames = []  # (key, image)
for t in C['types']:
    hy = load(C['hybrid'].format(type=t))
    if hy is None: print('MISSING hybrid frame for', t); continue
    frames.append((f'{t}_hybrid', hy))
    sl = load(C['sleepy'].format(type=t)) if C.get('sleepy') else None  # pass-2 hook: sleepy normal eyes -> eye-snap
    if sl is not None: frames.append((f'{t}_sleepy', sl))  # Daniel: hybrid3 cows keep their black alien eyes (no blink, no brown-eye swap)
    sn = C['shredName'].get(t, t); sh = load(C['shred'].format(shred=sn)); sp = load(C['shredSpotted'].format(shred=sn))
    if sh is not None: frames.append((f'{t}_bald', sh))
    if sp is not None: frames.append((f'{t}_baldSpot', sp))
# trim, then find the biggest uniform scale that shelf-packs every frame into 1024x1024
tr = [(k, *trim(im)) for k, im in frames]
S, PAD = 1024, 4
def pack(s):
    x = y = rowh = 0; out = {}
    for k, im, _ in sorted(tr, key=lambda e: -e[1].height):
        w, h = int(im.width * s + 0.5), int(im.height * s + 0.5)
        if x + w + PAD > S: x, y, rowh = 0, y + rowh + PAD, 0
        if y + h + PAD > S: return None
        out[k] = (x + PAD, y + PAD, w, h); x += w + PAD; rowh = max(rowh, h)
    return out
lo, hi = 0.3, 1.0
for _ in range(20):
    m = (lo + hi) / 2
    if pack(m): lo = m
    else: hi = m
s = lo; R = pack(s)
sheet = Image.new('RGBA', (S, S), (0, 0, 0, 0)); sdf = np.full((S // 2, S // 2), 255, np.float32); meta = {}
for k, im, off in tr:
    x, y, w, h = R[k]; sm = im.resize((w, h), Image.LANCZOS); sheet.alpha_composite(sm, (x, y))
    # SDF: signed px distance at full res, normalised so 1.0 = frame width; encoded r = 127.5 - 1024*d (shader decodes (r-127.5)/1024 * width)
    al = np.asarray(sm)[..., 3] > 128; d = (nd.distance_transform_edt(al) - nd.distance_transform_edt(~al)) / w
    enc = np.clip(127.5 - 1024 * d, 0, 255); half = Image.fromarray(enc.astype(np.float32)).resize((max(1, w // 2), max(1, h // 2)), Image.BILINEAR)
    sdf[y // 2: y // 2 + half.height, x // 2: x // 2 + half.width] = np.asarray(half)
    meta[k] = {'uv': [x / S, 1 - (y + h) / S, w / S, h / S], 'px': [w, h], 'asp': h / w}
sheet.save('art-src/cows_sheet.webp', quality=90, method=6)
Image.fromarray(sdf.astype(np.uint8), 'L').save('art-src/cows_sdf.png', optimize=True)
cfg = {k: C[k] for k in ['types', 'rare', 'rareChance', 'shredKills']}
json.dump({'frames': meta, 'scale': s, 'cfg': cfg}, open('src/cows_meta.json', 'w'), indent=1)
print(f'{len(frames)} frames at scale {s:.3f} ->', ', '.join(k for k, _ in frames))
print('sheet bytes', os.path.getsize('art-src/cows_sheet.webp'), 'sdf bytes', os.path.getsize('art-src/cows_sdf.png'))
