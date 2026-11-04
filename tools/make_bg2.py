import numpy as np, cv2, sys, glob
sys.path.insert(0, '/workspace/cr9-v2/tools')
from paintlib import emboss
A = '/home/box/agent-data/agents/889c1d0e-2b96-4450-b9d0-2eb4529f333a/attachments/'
src = cv2.cvtColor(cv2.imread(glob.glob(A+'a2bc5a*')[0]), cv2.COLOR_BGR2RGB)  # 1200x1200
# remove the photo's saucer + its beam (we draw our own)
m = np.zeros(src.shape[:2], np.uint8)
cv2.ellipse(m, (618, 372), (190, 70), 0, 0, 360, 255, -1)
pts = np.array([[540, 400], [700, 400], [760, 700], [480, 700]], np.int32); cv2.fillPoly(m, [pts], 255)
src = cv2.inpaint(src, m, 9, cv2.INPAINT_TELEA)
crop = src[0:1200, 300:900]  # 600x1200 portrait
W, H = 720, 1440
img = cv2.resize(crop, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
r = np.random.default_rng(3)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
HZ = 772/1200*H

def grade(img, kind):
    out = img.copy()
    gnd = (yy >= HZ-6)[..., None]
    g = np.clip(img*np.array([0.8, 0.9, 1.3])*(1.15 if kind=='drive' else 0.95) + np.array([10, 4, 24]), 0, 255)
    if kind == 'drive':
        hl = np.exp(-(((xx-W*.5)/(30+(yy-HZ).clip(0)*.85))**2))*np.clip((yy-HZ-20)/420, 0, 1)
        g = g*(1+hl[..., None]*np.array([2.6, 2.0, .9]))
    # procedural night sky in Daniel's palette
    t = np.clip(yy/HZ, 0, 1)[..., None]
    sky = np.array([10, 8, 34])*(1-t) + np.array([52, 34, 112])*t
    n1 = cv2.resize(r.random((10, 5)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
    n2 = cv2.resize(r.random((24, 12)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
    sky = sky + np.clip(n1-.45, 0, 1)[..., None]*np.array([120, 60, 190]) + np.clip(n2-.6, 0, 1)[..., None]*np.array([30, 90, 170])
    d = np.sqrt((xx-W*.22)**2+(yy-H*.12)**2)[..., None]
    sky = sky + np.clip(1-d/160, 0, 1)**2*np.array([70, 70, 120])
    sky = np.where(d < 30, np.array([240, 236, 210]), sky)
    sky = sky + np.exp(-((yy-HZ)/50)**2)[..., None]*np.array([60, 40, 90])
    out = np.where(gnd, g, sky)
    cxl = 351 + (324-351)*np.clip((yy-HZ)/(H-HZ), 0, 1)
    yel = (img[..., 0] > 110) & (img[..., 2] < img[..., 0]*.65) & (yy > HZ) & (np.abs(xx-cxl) < 6+(yy-HZ)*.05)
    out[yel] = np.array([240, 190, 50])
    return np.clip(out, 0, 255)

def paint(img, passes):
    gray = cv2.GaussianBlur(img.mean(2).astype(np.float32), (0, 0), 3)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=5); gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=5)
    ang = np.arctan2(gy, gx) + np.pi/2
    mag = np.sqrt(gx*gx+gy*gy)
    # swirl in flat areas of the sky, field strokes vertical-ish
    sw = np.arctan2(yy-HZ*.45, xx-W*.55) + np.pi/2
    flat = mag < 60
    ang = np.where(flat & (yy < HZ), sw, ang)
    ang = np.where(flat & (yy >= HZ), np.pi/2 + np.sin(xx*.05)*.3, ang)
    canvas = cv2.GaussianBlur(img, (0, 0), 4)
    height = np.zeros((H, W), np.float32)
    for (n, L, w, jit) in passes:
        ys = r.integers(0, H, n); xs = r.integers(0, W, n)
        for x, y in zip(xs, ys):
            a = ang[y, x]; col = img[y, x]*(1+r.normal(0, jit)) + r.normal(0, 6, 3)
            l = L*r.uniform(.6, 1.4); dx, dy = np.cos(a)*l, np.sin(a)*l
            p0 = (int(x-dx), int(y-dy)); p1 = (int(x+dx), int(y+dy)); ww = max(1, int(w*r.uniform(.7, 1.3)))
            cv2.line(canvas, p0, p1, tuple(np.clip(col, 0, 255).tolist()), ww, cv2.LINE_AA)
            cv2.line(height, p0, p1, float(r.uniform(.2, 1)), ww, cv2.LINE_AA)
    return emboss(np.clip(canvas, 0, 255).astype(np.uint8), cv2.GaussianBlur(height, (0, 0), .8), .2)

for kind in ('fight', 'drive'):
    g = grade(img, kind)
    out = paint(g, [(14000, 24, 10, .08), (30000, 12, 5, .10), (40000, 6, 3, .12)])
    # re-draw crisp stars + neon flecks
    for _ in range(120):
        x, y = r.integers(0, W), r.integers(0, int(HZ*.95)); cv2.circle(out, (int(x), int(y)), int(r.choice([1, 1, 2])), (240, 235, 255), -1, cv2.LINE_AA)
    for _ in range(25):
        x, y = r.integers(0, W), r.integers(0, H); cv2.circle(out, (int(x), int(y)), int(r.integers(2, 5)), (170, 255, 40), -1, cv2.LINE_AA)
    cv2.imwrite(f'/workspace/cr9-v2/art_src/bg_{kind}.png', cv2.cvtColor(out, cv2.COLOR_RGB2BGR)); print(kind)
