# v4.2 IKE: Daniel's pose frames (guitar overhead / head-bang / flinch), same paint pass + blue rim as hero.png.
# Each pose is its own <=1024 texture swapped onto the ONE hero sprite (still 1 draw call).
import numpy as np, cv2, sys, json
sys.path.insert(0, '/workspace/cr9-v2/tools')
from paintlib import oil, emboss, strokes_tex
from rembg import remove, new_session
from PIL import Image
D = '/workspace/cr9-v42/tools/poses/'; OUT = '/workspace/cr9-v42/art-src/'
sess = new_session('isnet-general-use')
CW, CH, FEET = 720, 1024, 1024 - 85   # canvas; feet line (hero.png feet at 907 of 992 -> 85 px margin)
HERO_CX = 237 + (720 - 632) / 2        # hero bbox centre, re-expressed in the wider canvas
TARGET_H = {'overhead': 930, 'headbang': 880, 'flinch': 900}
meta = {}
for n, th in TARGET_H.items():
    im = Image.open(D + n + '.jpg').convert('RGB')
    cut = np.array(remove(im, session=sess))           # RGBA
    a = cut[..., 3]; ys, xs = np.where(a > 128); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    rgb0 = cv2.cvtColor(cut[..., :3], cv2.COLOR_RGB2BGR)
    # glowing soundhole in the source (bright cyan-blue)
    b, g, r = [rgb0[..., i].astype(int) for i in range(3)]
    hm = (b > 200) & (g > 150) & (r < 140) & (a > 128); hy, hx = np.where(hm)
    s = th / (y1 - y0 + 1)
    crop = cut[y0:y1 + 1, x0:x1 + 1]; crop = cv2.resize(crop, (int((x1 - x0 + 1) * s), int((y1 - y0 + 1) * s)), interpolation=cv2.INTER_AREA)
    h, w = crop.shape[:2]; ox = int(HERO_CX - w / 2); ox = max(0, min(CW - w, ox)); oy = FEET - h
    can = np.zeros((CH, CW, 4), np.uint8); can[oy:oy + h, ox:ox + w] = crop
    rgb = cv2.cvtColor(can[..., :3], cv2.COLOR_RGB2BGR); al = can[..., 3].astype(np.float32)
    al = cv2.GaussianBlur(cv2.erode(al, np.ones((3, 3), np.uint8)), (0, 0), 1)
    rgb = oil(rgb, 2, 1); rgb = emboss(rgb, cv2.GaussianBlur(strokes_tex(CH, CW, 9000, 8, 3, 7), (0, 0), 1), .12)
    am = (al > 128).astype(np.float32); rim = cv2.GaussianBlur(np.clip(am - np.roll(np.roll(am, 7, 0), 7, 1), 0, 1), (0, 0), 3)[..., None]
    rgb = np.clip(rgb.astype(np.float32) + rim * np.array([255, 160, 60]) * .9, 0, 255).astype(np.uint8)
    out = np.dstack([rgb, al.astype(np.uint8)])
    Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGRA2RGBA)).save(OUT + f'hero_{n}.webp', quality=85, method=6)
    hole = [float((hx.mean() - x0) * s + ox), float((hy.mean() - y0) * s + oy)] if len(hx) else None
    meta[n] = {'w': CW, 'h': CH, 'hole': hole}
    chk = Image.new('RGBA', (CW, CH), (255, 0, 255, 255)); chk.alpha_composite(Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGRA2RGBA))); chk.convert('RGB').save(f'/tmp/chk_{n}.png')
print(json.dumps(meta))
