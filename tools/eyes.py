# find the two eyes on a right-facing cow sprite: bright sclera blobs (cow_*.png) or big black blobs (hybrid art)
import numpy as np
from PIL import Image
from scipy import ndimage as nd
def find_eyes(im, mode='white'):
    a = np.asarray(im.convert('RGBA')).astype(int); h, w = a.shape[:2]
    rgb, al = a[..., :3], a[..., 3] > 200
    if mode == 'white': m = (rgb.min(-1) > 200) & ((rgb.max(-1) - rgb.min(-1)) < 40) & al
    else: m = (rgb.max(-1) < 45) & al
    reg = np.zeros_like(m); reg[: int(h * 0.6), int(w * 0.5):] = True; m &= reg
    m = nd.binary_opening(m, iterations=1)
    lab, n = nd.label(m); out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i); A = len(xs)
        if A < 60 or A > 2500: continue
        bw, bh = np.ptp(xs) + 1, np.ptp(ys) + 1; fill = A / (bw * bh)
        if fill < 0.5 or not (0.5 < bw / bh < 1.8): continue
        if mode != 'white':  # a real alien eye carries a white catch-light inside its blob
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            if not (rgb[y0:y1, x0:x1].min(-1) > 200).any() or A < 150: continue
        out.append((A, xs.mean(), ys.mean(), max(bw, bh) / 2))
    best, bs = None, 1e9  # the pair: same height, a head-width apart
    for i in range(len(out)):
        for j in range(i + 1, len(out)):
            p, q = out[i], out[j]; dx, dy = abs(p[1] - q[1]), abs(p[2] - q[2])
            if 25 < dx < 90 and dy < 20:
                sc = dy - (p[0] + q[0]) / 200
                if sc < bs: bs, best = sc, sorted([p, q], key=lambda e: e[1])
    if not best: out.sort(reverse=True); best = out[:2]
    return [(round(x), round(y), round(r)) for _, x, y, r in best]
if __name__ == '__main__':
    import sys, glob
    for f in sys.argv[1:]: print(f, find_eyes(Image.open(f), 'black' if 'hybrid' in f else 'white'))
