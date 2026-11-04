# p4f (Minnesota on the right): paints bg_land.webp (1024x160 horizon band: LEFT = the original Arizona desert, RIGHT = Minnesota pines + farm fields + barn)
# and mn_props.webp (512x512 atlas of near props: 3 pines, fence, corn, hay bale). Dark, moonlit, painterly; same palette as the p4a plates.
import numpy as np, cv2, sys, math
from PIL import Image
sys.path.insert(0, '/workspace/cr9-v44/tools')
from paintlib import emboss, strokes_tex
O = '/workspace/cr9-v44/art-src/'; SS = 2
rng = np.random.default_rng(44)
def paint(rgb_f, alpha_f, amt=0.22, seed=3, med=3):
    """painterly finish: median 'oil' smear + impasto stroke emboss, alpha kept (soft)"""
    u8 = np.clip(rgb_f, 0, 255).astype(np.uint8); u8 = cv2.medianBlur(u8, med)
    h, w = alpha_f.shape; u8 = emboss(u8, cv2.GaussianBlur(strokes_tex(h, w, int(h * w / 60), 6, 2, seed), (0, 0), 1), amt)
    a = np.clip(cv2.GaussianBlur(alpha_f, (0, 0), 0.7), 0, 1)
    return np.dstack([u8, (a * 255).astype(np.uint8)])
def rim(m, col, shift=5, k=1.0, up=True):
    """moon sits up-right: light the right-facing and top edges of mask m"""
    r = np.clip(m - np.roll(m, shift, 1), 0, 1)
    if up: r = np.maximum(r, np.clip(m - np.roll(m, 3, 0), 0, 1) * 0.7)
    r = cv2.GaussianBlur(r, (0, 0), 1.2 * SS / 2) * (m > .3)
    return r[..., None] * np.array(col, np.float32) * k
def pine(w, h, seed, tiers=8, lean=0.0):
    """one painted pine on a transparent (h x w) canvas at SS x; returns rgb float, alpha float"""
    r = np.random.default_rng(seed); W, H = w * SS, h * SS
    img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32); cx = W / 2
    tw = max(4, W * 0.035)
    cv2.line(m, (int(cx), H), (int(cx + lean * W), int(H * 0.12)), 1, int(tw), cv2.LINE_AA)
    cv2.line(img, (int(cx), H), (int(cx + lean * W), int(H * 0.12)), (24, 18, 16), int(tw), cv2.LINE_AA)
    top = H * 0.04; bot = H * 0.93
    for t in range(tiers):                     # boughs: wide at the bottom, ragged jagged edges
        k = t / (tiers - 1); y = top + (bot - top) * (0.10 + 0.9 * k) ** 1.0; hw = W * (0.10 + 0.40 * k ** 0.85) * r.uniform(0.9, 1.08); th = (bot - top) / tiers * r.uniform(1.5, 1.9)
        ox = cx + lean * W * (1 - k)
        pts = [(ox, y - th)]
        n = 11
        for j in range(n + 1):                 # right edge, jagged
            u = j / n; pts.append((ox + hw * u + r.uniform(-1, 1) * hw * 0.05, y - th + th * u * u * 0.75 + (th * 0.28 if j % 2 else 0) * r.uniform(.5, 1.2)))
        pts.append((ox + hw * 0.1, y + th * 0.05)); pts.append((ox - hw * 0.1, y + th * 0.05))
        for j in range(n, -1, -1):             # left edge
            u = j / n; pts.append((ox - hw * u + r.uniform(-1, 1) * hw * 0.05, y - th + th * u * u * 0.75 + (th * 0.28 if j % 2 else 0) * r.uniform(.5, 1.2)))
        pts = np.array(pts, np.int32)
        shade = 0.55 + 0.5 * (1 - k) * 0.4 + r.uniform(-0.05, 0.05)
        col = (14 * shade + 4, 36 * shade + 8, 34 * shade + 10)
        cv2.fillPoly(img, [pts], col, cv2.LINE_AA); cv2.fillPoly(m, [pts], 1, cv2.LINE_AA)
        # darker underside needles
        cv2.polylines(img, [pts], True, (6, 16, 18), max(1, SS), cv2.LINE_AA)
    # needle flecks: a few lighter dabs on the moon side
    for _ in range(int(W * H / 900)):
        x, y = r.uniform(W * .2, W * .85), r.uniform(top, bot)
        if m[int(y), int(x)] > .5: cv2.circle(img, (int(x), int(y)), 1, (28, 62, 60), -1, cv2.LINE_AA)
    img += rim(m, (58, 100, 170), 4 * SS // 2, 0.8)
    img *= np.linspace(1.25, 0.6, H)[:, None, None]       # moonlit crown, dark base
    rgba = paint(img, m, 0.26, seed, 3)
    out = cv2.resize(rgba, (w, h), interpolation=cv2.INTER_AREA)
    return out
def fence(w, h):
    r = np.random.default_rng(7); W, H = w * SS, h * SS; img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
    post = [(W * 0.08, 0.0), (W * 0.5, 0.02), (W * 0.92, -0.03)]
    for x, tilt in post:
        pw = int(W * 0.035); top = H * 0.18
        cv2.line(m, (int(x), H - 2), (int(x + tilt * W * 0.1), int(top)), 1, pw, cv2.LINE_AA); cv2.line(img, (int(x), H - 2), (int(x + tilt * W * 0.1), int(top)), (52, 40, 32), pw, cv2.LINE_AA)
    for yy in (0.32, 0.55, 0.78):              # three rails, slightly sagging
        pts = np.array([(W * 0.06, H * yy), (W * 0.5, H * (yy + 0.02)), (W * 0.94, H * (yy - 0.01))], np.int32)
        cv2.polylines(m, [pts], False, 1, max(2, SS * 2), cv2.LINE_AA); cv2.polylines(img, [pts], False, (60, 46, 36), max(2, SS * 2), cv2.LINE_AA)
    img += rim(m, (95, 130, 190), 3 * SS // 2, 1.1); img *= np.linspace(1.15, .75, H)[:, None, None]
    return cv2.resize(paint(img, m, 0.2, 5, 3), (w, h), interpolation=cv2.INTER_AREA)
def hay(w, h):
    W, H = w * SS, h * SS; img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
    c = (W // 2, int(H * 0.52)); ax = (int(H * 0.42), int(H * 0.42))
    cv2.ellipse(m, c, ax, 0, 0, 360, 1, -1, cv2.LINE_AA); cv2.ellipse(img, c, ax, 0, 0, 360, (96, 82, 44), -1, cv2.LINE_AA)
    for i in range(1, 7):                      # spiral ring strokes
        s = i / 7; cv2.ellipse(img, (int(c[0] + W * 0.015 * i), c[1]), (int(ax[0] * (1 - s * .9)), int(ax[1] * (1 - s * .9))), 0, 0, 360, (62 + 6 * (i % 2), 52 + 5 * (i % 2), 28), max(1, SS), cv2.LINE_AA)
    img *= np.linspace(1.15, .5, H)[:, None, None]; img += rim(m, (110, 140, 190), 3 * SS // 2, 1.0)
    return cv2.resize(paint(img, m, 0.25, 9, 3), (w, h), interpolation=cv2.INTER_AREA)
# ---------------- near-prop atlas 512x512 ----------------
atlas = np.zeros((512, 512, 4), np.uint8)
def put(a, x, y): h, w = a.shape[:2]; atlas[y:y + h, x:x + w] = a
put(pine(170, 320, 11, 9, 0.0), 0, 0); put(pine(170, 320, 23, 8, 0.015), 170, 0); put(pine(172, 256, 37, 7, -0.01), 340, 0)
put(fence(256, 96), 0, 320)
cim = Image.open(O + 'corn.webp').convert('RGBA'); cim.thumbnail((96, 192), Image.LANCZOS); ca = np.asarray(cim).copy()
ca[..., :3] = (ca[..., :3].astype(np.float32) * np.array([0.7, 0.9, 0.78])).clip(0, 255).astype(np.uint8)   # moon-cooled corn
put(ca, 256 + 16, 320 + 192 - ca.shape[0])
put(hay(128, 96), 384, 320)
Image.fromarray(atlas, 'RGBA').save(O + 'mn_props.webp', 'WEBP', quality=84, method=6); print('mn_props.webp', atlas.shape)
# ---------------- the horizon band: left = original desert, right = Minnesota ----------------
des = np.asarray(Image.open('/tmp/bg_desert.pre-p4f.webp' if False else O + 'bg_desert.webp').convert('RGBA')).astype(np.float32)   # 1024x160 (unchanged source)
BW, BH = 1024, 160; W, H = BW * SS, BH * SS; HZ = 134 * SS
img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
x0 = 480 * SS                                    # Minnesota starts at the centre seam (crossfaded 480..544)
def blob_row(y, x1, x2, col, a=1.0):
    cv2.rectangle(img, (x1, y), (x2, H), col, -1); cv2.rectangle(m, (x1, y), (x2, H), a, -1)
# rolling farm fields: stacked low bands, each a different crop tint, with furrow lines converging to the road
fields = [(0, 1024, 127, (16, 30, 34)), (500, 1024, 129, (22, 38, 38)), (560, 780, 131, (26, 42, 36)), (700, 1024, 130, (18, 34, 36)), (500, 700, 132, (30, 44, 34))]
for xa, xb, yy, col in fields:
    pts = [(max(xa, 480) * SS, H)]; 
    for xx in range(max(xa, 480), xb + 1, 16): pts.append((xx * SS, int((yy + 1.8 * math.sin(xx * 0.021 + yy)) * SS)))
    pts.append((xb * SS, H)); pts = np.array(pts, np.int32); cv2.fillPoly(img, [pts], col, cv2.LINE_AA); cv2.fillPoly(m, [pts], 1, cv2.LINE_AA)
for i in range(46):                              # furrow strokes
    xx = rng.uniform(500, 1020) * SS; yy = rng.uniform(128, 140) * SS; L = rng.uniform(10, 38) * SS
    cv2.line(img, (int(xx), int(yy)), (int(xx + L), int(yy + rng.uniform(-1, 1) * SS)), (30 + rng.uniform(0, 14), 52 + rng.uniform(0, 14), 44), SS, cv2.LINE_AA)
# fence line along the near field edge: posts + 2 wires
for xx in range(520, 1024, 19):
    xo = xx * SS; hgt = int((7 + 2.5 * math.sin(xx * .07)) * SS); cv2.line(img, (xo, HZ - 2 * SS), (xo, HZ - hgt - 2 * SS), (40, 34, 30), SS + 1, cv2.LINE_AA); cv2.line(m, (xo, HZ - 2 * SS), (xo, HZ - hgt - 2 * SS), 1, SS + 1, cv2.LINE_AA)
for yo in (6, 3.5):
    cv2.line(img, (520 * SS, int(HZ - yo * SS)), (1022 * SS, int(HZ - yo * SS)), (52, 56, 70), max(1, SS // 2), cv2.LINE_AA); cv2.line(m, (520 * SS, int(HZ - yo * SS)), (1022 * SS, int(HZ - yo * SS)), 0.8, max(1, SS // 2), cv2.LINE_AA)
# barn + silo silhouette (right of centre), warm lit window
bx, by, bw_, bh_ = 690 * SS, 133 * SS, 46 * SS, 22 * SS
barn = np.array([(bx, by), (bx, by - bh_), (bx + bw_ * .25, by - bh_ - 9 * SS), (bx + bw_ * .5, by - bh_ - 12 * SS), (bx + bw_ * .75, by - bh_ - 9 * SS), (bx + bw_, by - bh_), (bx + bw_, by)], np.int32)
cv2.fillPoly(img, [barn], (22, 20, 30), cv2.LINE_AA); cv2.fillPoly(m, [barn], 1, cv2.LINE_AA)
sx_ = bx + bw_ + 3 * SS; cv2.rectangle(img, (sx_, by - 36 * SS), (sx_ + 12 * SS, by), (30, 30, 42), -1); cv2.rectangle(m, (sx_, by - 36 * SS), (sx_ + 12 * SS, by), 1, -1)
cv2.ellipse(img, (sx_ + 6 * SS, by - 36 * SS), (6 * SS, 6 * SS), 0, 180, 360, (36, 36, 50), -1, cv2.LINE_AA); cv2.ellipse(m, (sx_ + 6 * SS, by - 36 * SS), (6 * SS, 6 * SS), 0, 180, 360, 1, -1, cv2.LINE_AA)
cv2.rectangle(img, (bx + 16 * SS, by - 12 * SS), (bx + 22 * SS, by - 6 * SS), (255, 196, 96), -1)
glow = np.zeros((H, W), np.float32); cv2.circle(glow, (bx + 19 * SS, by - 9 * SS), 9 * SS, 1, -1); glow = cv2.GaussianBlur(glow, (0, 0), 6 * SS)
img += glow[..., None] * np.array([120, 70, 20], np.float32); 
# treeline: dense pines. clusters left & right of the barn, small near the centre seam
def tree(xc, hgt, wid, shade):
    xc, hgt, wid = int(xc * SS), int(hgt * SS), int(wid * SS); tiers = 5 if hgt < 40 * SS else 7
    for t in range(tiers):
        k = t / (tiers - 1); y = HZ - hgt + hgt * (0.1 + 0.9 * k); hw = wid * (0.2 + 0.8 * k ** 0.9) / 2; th = hgt / tiers * 1.7
        pts = np.array([(xc, y - th), (xc + hw, y), (xc + hw * .4, y - th * .12), (xc, y + th * .05), (xc - hw * .4, y - th * .12), (xc - hw, y)], np.int32)
        col = (10 * shade + 4, 28 * shade + 8, 28 * shade + 10); cv2.fillPoly(img, [pts], col, cv2.LINE_AA); cv2.fillPoly(m, [pts], 1, cv2.LINE_AA)
    cv2.line(img, (xc, HZ), (xc, HZ - int(hgt * .1)), (20, 16, 14), SS, cv2.LINE_AA); cv2.line(m, (xc, HZ), (xc, HZ - int(hgt * .1)), 1, SS, cv2.LINE_AA)
xs = []
for xx in np.arange(520, 1024, 7.5):
    if 668 < xx < 760 and rng.random() < 0.85: continue     # clearing around the barn
    far = (xx - 480) / 544                                   # taller toward the right edge (nearer to the camera in the painted perspective)
    hh = rng.uniform(26, 60) * (0.55 + 0.7 * far) * (1.25 if (860 < xx < 960 or 560 < xx < 640) else 0.9)
    xs.append((xx + rng.uniform(-3, 3), hh, hh * rng.uniform(.36, .5), rng.uniform(.7, 1.1)))
xs.sort(key=lambda t: t[1])                                  # short ones first (behind), tall in front
for t in xs: tree(*t)
img += rim(m, (46, 82, 140), 3 * SS, 0.6)
land_r = paint(img, m, 0.22, 21, 3)
# left half: the ORIGINAL desert (full-res), right half: Minnesota; 64 px crossfade at the seam
R = cv2.resize(land_r, (BW, BH), interpolation=cv2.INTER_AREA).astype(np.float32); D = des
ramp = np.clip((np.arange(BW) - 480) / 64.0, 0, 1)[None, :]                # 0 = desert, 1 = Minnesota
ad = D[..., 3] / 255.0 * (1 - ramp); ar = R[..., 3] / 255.0 * ramp; at = np.clip(ad + ar, 0, 1)
rgb = (D[..., :3] * ad[..., None] + R[..., :3] * ar[..., None]) / np.maximum(at, 1e-4)[..., None]
fade = np.clip(1 - (np.arange(BH) - 128) / 28, 0, 1)[:, None]               # same horizon fade as the desert band (hides the join with the road plate)
at = at * fade
out = np.dstack([np.clip(rgb, 0, 255), at * 255]).astype(np.uint8)
Image.fromarray(out, 'RGBA').save(O + 'bg_land.webp', 'WEBP', quality=82, method=6); print('bg_land.webp', out.shape)
# previews on a night colour
for n, a in (('bg_land', out), ('mn_props', atlas)):
    im = Image.fromarray(a, 'RGBA'); bg = Image.new('RGBA', im.size, (34, 36, 58, 255)); bg.alpha_composite(im); bg.convert('RGB').save(f'/tmp/p4f/{n}_prev.png')
