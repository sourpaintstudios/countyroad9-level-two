import numpy as np, cv2, sys
sys.path.insert(0, '/workspace/cr9-v2/tools')
from paintlib import *
SRC = '/workspace/cr9-v2/art_src/face_base.png'
base = cv2.cvtColor(cv2.imread(SRC), cv2.COLOR_BGR2RGB)
H, W = base.shape[:2]
SKIN = np.array([150, 178, 168], np.float32); SKIN_D = np.array([70, 95, 95], np.float32)
LE, RE = (160, 265), (345, 258); MOUTH = (258, 382)
tex = cv2.GaussianBlur(strokes_tex(H, W, 4000, 9, 4, 3), (0,0), 1.4)
SKIN = base[140:170, 235:275].reshape(-1,3).mean(0).astype(np.float32); SKIN_D = SKIN*.45

def mouth(img, c, rx, ry, teeth_top=0, teeth_bot=0, tongue=True, angle=0):
    out = img.astype(np.float32)
    # lip rim (skin darker) then interior
    rim = np.zeros((H, W), np.float32); cv2.ellipse(rim, c, (int(rx*1.12), int(ry*1.12)), angle, 0, 360, 1, -1, cv2.LINE_AA)
    rim = cv2.GaussianBlur(rim, (0, 0), 2)[..., None]
    out = out*(1-rim*.85) + SKIN_D*.9*rim*.85
    m = np.zeros((H, W), np.float32); cv2.ellipse(m, c, (rx, ry), angle, 0, 360, 1, -1, cv2.LINE_AA)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx-c[0])/rx)**2 + ((yy-c[1])/ry)**2)
    inner = np.clip(1-d, 0, 1)[..., None]
    col = np.array([20, 4, 12], np.float32)*(1-inner) + np.array([95, 18, 38], np.float32)*inner
    if tongue:
        tm = np.clip(1 - np.sqrt(((xx-c[0])/(rx*.6))**2 + ((yy-(c[1]+ry*.65))/(ry*.45))**2), 0, 1)
        tm = (tm > 0).astype(np.float32)*np.clip(tm*3, 0, 1)
        col = col*(1-tm[..., None]) + np.array([200, 80, 105], np.float32)*tm[..., None]
    mm = cv2.GaussianBlur(m, (0, 0), 1.0)[..., None]
    out = out*(1-mm) + col*mm
    out = out.astype(np.uint8)
    # teeth: little pale triangles along top/bottom of opening
    for row, n in ((-1, teeth_top), (1, teeth_bot)):
        for i in range(n):
            t = (i+.5)/n*1.6-.8
            x = c[0] + t*rx*.9; ytop = c[1] + row*ry*np.sqrt(max(0, 1-(t*.9)**2))*.95
            L = ry*(.28 if abs(t) < .5 else .2); wdt = rx/n*.8
            pts = np.array([[x-wdt, ytop], [x+wdt, ytop], [x, ytop - row*L]], np.int32)
            cv2.fillPoly(out, [pts], (235, 228, 190), cv2.LINE_AA)
    return out

def hand(img, cx, cy, ang, s=1.0, flip=False):
    """painted 4-finger alien hand, fingers pointing along ang (deg)"""
    layer = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
    a = np.deg2rad(ang); ux, uy = np.cos(a), np.sin(a); px, py = -uy, ux
    if flip: px, py = -px, -py
    def cap(p0, p1, r, col):
        cv2.line(layer, tuple(map(int, p0)), tuple(map(int, p1)), col, int(r*2), cv2.LINE_AA)
        cv2.line(m, tuple(map(int, p0)), tuple(map(int, p1)), 1.0, int(r*2), cv2.LINE_AA)
    # palm
    cv2.ellipse(layer, (int(cx), int(cy)), (int(34*s), int(44*s)), ang+90, 0, 360, tuple(SKIN.tolist()), -1, cv2.LINE_AA)
    cv2.ellipse(m, (int(cx), int(cy)), (int(34*s), int(44*s)), ang+90, 0, 360, 1.0, -1, cv2.LINE_AA)
    # forearm going back
    cap((cx, cy), (cx-ux*120*s, cy-uy*120*s), 24*s, tuple((SKIN*.85).tolist()))
    for i, (off, L) in enumerate(((-21, 80), (-7, 95), (7, 92), (21, 74))):
        b = (cx+ux*28*s+px*off*s, cy+uy*28*s+py*off*s)
        e = (b[0]+ux*L*s+px*off*.15*s, b[1]+uy*L*s+py*off*.15*s)
        cap(b, e, 8.5*s, tuple((SKIN*(1.0 + .04*i)).tolist()))
        # knuckle shading line
        mid = ((b[0]+e[0])/2, (b[1]+e[1])/2)
        cv2.circle(layer, tuple(map(int, mid)), int(5*s), tuple((SKIN*.8).tolist()), 2, cv2.LINE_AA)
        cv2.circle(layer, tuple(map(int, e)), int(5*s), tuple((SKIN*1.15).tolist()), -1, cv2.LINE_AA)
    # thumb
    tb = (cx-ux*5*s-px*30*s, cy-uy*5*s-py*30*s); te = (tb[0]+ux*45*s-px*25*s, tb[1]+uy*45*s-py*25*s)
    cap(tb, te, 10*s, tuple((SKIN*.95).tolist()))
    # outline
    mb = (m > .5).astype(np.uint8)
    edge = cv2.morphologyEx(mb, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(np.float32)
    layer = layer*(1-edge[..., None]) + SKIN_D*.6*edge[..., None]
    # light from upper-left (blue rim)
    dist = cv2.distanceTransform(mb, cv2.DIST_L2, 5); dist = np.clip(dist/9, 0, 1)
    layer = layer*(0.55+0.45*dist[..., None])
    hl = np.clip(cv2.GaussianBlur(m, (0,0), 3) - cv2.GaussianBlur(np.roll(np.roll(m, 4, 0), 4, 1), (0,0), 3), 0, 1)
    layer = layer + hl[..., None]*np.array([90, 140, 200], np.float32)
    mm = cv2.GaussianBlur(m, (0, 0), 1.0)[..., None]
    return (img*(1-mm) + layer*mm).astype(np.uint8)

def finish(img, splats=0, seed=0):
    out = oil(img, 3, 2)
    out = emboss(out, tex, .12)
    r = np.random.default_rng(seed)
    for _ in range(splats):
        col = [(170, 255, 40), (150, 60, 230), (255, 130, 30), (60, 150, 255), (170,255,40)][r.integers(5)]
        x, y = r.uniform(110, 400), r.uniform(120, 440); rad = r.uniform(10, 26)
        o = out.copy()
        cv2.circle(o, (int(x), int(y)), int(rad), col, -1, cv2.LINE_AA)
        for k in range(6):
            a = r.uniform(0, 6.28); d = rad*r.uniform(1.1, 1.9)
            cv2.circle(o, (int(x+np.cos(a)*d), int(y+np.sin(a)*d)), int(rad*r.uniform(.15, .35)), col, -1, cv2.LINE_AA)
        cv2.line(o, (int(x), int(y)), (int(x+r.uniform(-4, 4)), int(y+rad*r.uniform(1.5, 3))), col, int(rad*.45), cv2.LINE_AA)
        out = cv2.addWeighted(o, .9, out, .1, 0)
    return out

def closed_eye(img, c, kind):
    out = img.astype(np.float32)
    m = np.zeros((H, W), np.float32); cv2.ellipse(m, c, (62, 48), 0, 0, 360, 1.0, -1, cv2.LINE_AA)
    m = cv2.GaussianBlur(m, (0,0), 5)[..., None]
    out = (out*(1-m) + SKIN*0.85*m).astype(np.uint8)
    dark = tuple((SKIN*.2).tolist())
    if kind == 'clench':
        for dy, a0 in ((-8, 1), (8, -1)):
            pts = np.array([[c[0]-48, c[1]+dy*2.2], [c[0], c[1]+dy*.2], [c[0]+48, c[1]+dy*2.2]], np.int32)
            cv2.polylines(out, [pts], False, dark, 6, cv2.LINE_AA)
        cv2.line(out, (c[0]-50, c[1]), (c[0]+50, c[1]), dark, 7, cv2.LINE_AA)
    else:  # laugh crescent
        cv2.ellipse(out, (c[0], c[1]+18), (48, 30), 0, 200, 340, dark, 8, cv2.LINE_AA)
        cv2.ellipse(out, (c[0], c[1]+18), (40, 22), 0, 215, 325, (150, 255, 60), 3, cv2.LINE_AA)
    return out

# ---- SMUG (base, sly half-lidded eyes) ----
smug = base.copy()
for (ex, ey) in (LE, RE):  # heavy upper lids
    m = np.zeros((H, W), np.float32); cv2.ellipse(m, (ex, ey-30), (60, 34), 0, 0, 180, 1.0, -1, cv2.LINE_AA)
    m = cv2.GaussianBlur(m, (0,0), 3)[..., None]
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32)[..., None]
    lidcol = SKIN*(0.75 + 0.25*np.clip((ey-30-yy)/34+1, 0, 1))
    smug = (smug*(1-m) + lidcol*m).astype(np.uint8)
    cv2.ellipse(smug, (ex, ey-30), (60, 34), 0, 20, 160, tuple((SKIN*.25).tolist()), 5, cv2.LINE_AA)
smug = shift(smug, MOUTH[0]+45, MOUTH[1], 50, 30, 6, -8)  # smirk corner up
smug = finish(smug)

# ---- SHOCKED: huge eyes, brows up, O mouth, hands on cheeks ----
sh = base.copy()
sh = shift(sh, 255, 170, 220, 120, 0, -18)
sh = bulge(sh, *LE, 78, -0.45); sh = bulge(sh, *RE, 78, -0.45)
sh = squash(sh, 258, 420, 120, 90, 1.25)
sh = mouth(sh, (258, 400), 34, 52, tongue=False)
sh = hand(sh, 118, 372, -78, 0.85, flip=True)
sh = hand(sh, 398, 366, -102, 0.85)
sh = finish(sh, 0)

# ---- SCREAM: squeezed eyes, giant mouth with teeth, paint hits ----
sc = base.copy()
sc = closed_eye(sc, LE, 'clench'); sc = closed_eye(sc, RE, 'clench')
sc = shift(sc, 255, 150, 230, 110, 0, -12)
sc = squash(sc, 258, 430, 150, 110, 1.4)
sc = mouth(sc, (258, 410), 62, 82, 7, 6, True)
sc = finish(sc, 9, 4)

# ---- LAUGH: crescent eyes, wide grin, head tilt ----
la = base.copy()
la = closed_eye(la, LE, 'laugh'); la = closed_eye(la, RE, 'laugh')
la = mouth(la, (258, 392), 78, 42, 8, 0, True)
M = cv2.getRotationMatrix2D((256, 300), 9, 1.0); la = cv2.warpAffine(la, M, (W, H), borderMode=cv2.BORDER_REFLECT)
la = finish(la, 0)

atlas = np.zeros((1024, 1024, 3), np.uint8)
for i, f in enumerate((smug, sh, sc, la)):
    atlas[(i//2)*512:(i//2)*512+512, (i % 2)*512:(i % 2)*512+512] = f
cv2.imwrite('/workspace/cr9-v2/art_src/faces_atlas.png', cv2.cvtColor(atlas, cv2.COLOR_RGB2BGR))
print('ok')
