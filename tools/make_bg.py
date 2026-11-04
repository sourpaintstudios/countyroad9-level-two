import numpy as np, cv2, sys
sys.path.insert(0, '/workspace/cr9-v2/tools')
from paintlib import emboss
W, H = 720, 1440; HZ = 800; VX = 360
r = np.random.default_rng(7)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def noise(scale, seed, octaves=4):
    rr = np.random.default_rng(seed); out = np.zeros((H, W), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        s = max(2, int(W/scale*(2**o)))
        g = rr.random((int(s*H/W)+2, s+2)).astype(np.float32)
        out += cv2.resize(g, (W, H), interpolation=cv2.INTER_CUBIC)*amp; tot += amp; amp *= .5
    return out/tot

def lerp(a, b, t): return a + (b-a)*t[..., None]
def C(*c): return np.array(c, np.float32)

def base_scene(kind):
    n1, n2 = noise(3, 1), noise(6, 2)
    t = np.clip(yy/HZ, 0, 1)
    sky = lerp(C(8, 8, 32), C(40, 26, 92), t**1.6)
    swirl = np.clip((n1-.45)*3, 0, 1)
    sky = lerp(sky, C(92, 60, 170), swirl*.55*(t**.5))
    sky = lerp(sky, C(30, 60, 140), np.clip((n2-.55)*3, 0, 1)*.5)
    img = sky.copy()
    # moon
    d = np.sqrt((xx-520)**2+(yy-260)**2)
    img = lerp(img, C(120, 120, 200), np.clip(1-d/170, 0, 1)**2*.6)
    img = lerp(img, C(245, 240, 210), np.clip((34-d)/3, 0, 1))
    # horizon glow
    img = lerp(img, C(70, 50, 120), np.exp(-((yy-HZ)/40)**2)*.6)
    ground = yy > HZ
    gt = np.clip((yy-HZ)/(H-HZ), 0, 1)
    # road trapezoid
    half = 6 + gt*330
    road = ground & (np.abs(xx-VX) < half)
    left = ground & (xx < VX-half); right = ground & (xx > VX+half)
    corn = lerp(C(14, 30, 30), C(30, 70, 50), noise(10, 3)) 
    corn = lerp(corn, C(60, 110, 120), np.clip((noise(20, 4)-.5)*4, 0, 1)*.5)
    if kind == 'drive':
        desert = lerp(C(60, 40, 50), C(120, 80, 60), noise(8, 5))
        desert = lerp(desert, C(150, 110, 70), gt[..., None][..., 0]*.4)
        img[left] = desert[left]
    else:
        img[left] = corn[left]
    img[right] = corn[right]
    asphalt = lerp(C(22, 22, 34), C(40, 40, 58), noise(12, 6))
    img[road] = asphalt[road]
    # shoulder lines
    edge = ground & (np.abs(np.abs(xx-VX)-half*.93) < 1+gt*4)
    img[edge] = C(150, 150, 160)
    # center dashes (static; runtime adds moving dashes on top)
    z = 1/(gt+.02); dash = ground & (np.abs(xx-VX) < 1+gt*9) & ((z*1.2 % 2) < 1)
    img[dash] = C(230, 180, 40)
    if kind == 'drive':  # headlight pool
        hl = np.exp(-(((xx-VX)/(60+gt*380))**2)) * np.clip((yy-HZ-40)/400, 0, 1) * ground
        img = img*(1+hl[..., None]*np.array([1.6, 1.3, .7]))
    # tree line / corn tops silhouette band at horizon
    band = (yy > HZ-14-noise(30, 8)*22) & (yy < HZ+4)
    img[band] = lerp(img, C(10, 12, 26), np.ones_like(yy)*.85)[band]
    return np.clip(img, 0, 255)

def angle_field(kind):
    n = noise(4, 11, 3)*np.pi*2
    a = n*.6 + .3
    ground = yy > HZ
    # ground strokes point toward vanishing point
    ga = np.arctan2(yy-HZ, xx-VX)
    a = np.where(ground, ga, a)
    corn = ground & (np.abs(xx-VX) > 6+np.clip((yy-HZ)/(H-HZ), 0, 1)*330)
    a = np.where(corn, np.pi/2 + (noise(40, 12, 2)-.5)*.8, a)
    return a

def paint(img, ang, passes):
    canvas = cv2.GaussianBlur(img, (0, 0), 6).astype(np.float32)
    height = np.zeros((H, W), np.float32)
    for (n, L, w, jit) in passes:
        ys = r.integers(0, H, n); xs = r.integers(0, W, n)
        for x, y in zip(xs, ys):
            a = ang[y, x]; col = img[y, x] * (1 + r.normal(0, jit, 3))
            l = L*r.uniform(.6, 1.4); dx, dy = np.cos(a)*l, np.sin(a)*l
            p0 = (int(x-dx), int(y-dy)); p1 = (int(x+dx), int(y+dy)); ww = max(1, int(w*r.uniform(.7, 1.3)))
            cv2.line(canvas, p0, p1, tuple(np.clip(col, 0, 255).tolist()), ww, cv2.LINE_AA)
            cv2.line(height, p0, p1, float(r.uniform(.2, 1)), ww, cv2.LINE_AA)
    out = emboss(np.clip(canvas, 0, 255).astype(np.uint8), cv2.GaussianBlur(height, (0, 0), .8), .18)
    return out

def stars(img):
    for _ in range(260):
        x, y = r.integers(0, W), r.integers(0, int(HZ*.92)); s = r.choice([1, 1, 1, 2, 2, 3])
        b = r.uniform(.5, 1); cv2.circle(img, (int(x), int(y)), int(s), (int(255*b), int(245*b), int(220*b)), -1, cv2.LINE_AA)
    # neon paint flecks
    for _ in range(40):
        x, y = r.integers(0, W), r.integers(0, H); cv2.circle(img, (int(x), int(y)), int(r.integers(2, 6)), (170, 255, 40), -1, cv2.LINE_AA)
    return img

def drips(img, cols):
    # paint drips running from the bottom edge band
    for i in range(34):
        x = int(r.uniform(0, W)); col = cols[r.integers(len(cols))]; w = int(r.uniform(6, 16)); L = int(r.uniform(30, 120))
        y0 = H - 140 + int(r.uniform(-20, 20))
        cv2.line(img, (x, y0), (x, y0+L), col, w, cv2.LINE_AA); cv2.circle(img, (x, y0+L), int(w*.75), col, -1, cv2.LINE_AA)
    return img

for kind in ('fight', 'drive'):
    b = base_scene(kind); a = angle_field(kind)
    out = paint(b, a, [(16000, 22, 9, .10), (26000, 12, 5, .12), (30000, 6, 3, .15)])
    out = stars(out)
    if kind == 'fight': out = drips(out, [(170, 255, 40), (130, 50, 200), (60, 30, 110)])
    cv2.imwrite(f'/workspace/cr9-v2/art_src/bg_{kind}.png', cv2.cvtColor(out, cv2.COLOR_RGB2BGR))
    print(kind)
