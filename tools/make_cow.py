import numpy as np, cv2, sys
sys.path.insert(0, '/workspace/cr9-v2/tools')
from paintlib import oil, emboss, strokes_tex
r = np.random.default_rng(21)
S = '/workspace/cr9-v2/art_src/'
WH = (0.95, 0.94, 0.9); BL = (0.08, 0.07, 0.1)
def canvas(w, h): return np.zeros((h, w, 3), np.float32), np.zeros((h, w), np.float32)
def patches(img, m, seed, n=6, rad=(25, 60)):
    rr = np.random.default_rng(seed); h, w = m.shape
    pm = np.zeros((h, w), np.float32)
    for _ in range(n):
        cx, cy = rr.uniform(0, w), rr.uniform(0, h); rad0 = rr.uniform(*rad)
        pts = []
        for k in range(14):
            a = k/14*6.283; rk = rad0*rr.uniform(.6, 1.3); pts.append([cx+np.cos(a)*rk, cy+np.sin(a)*rk*.8])
        cv2.fillPoly(pm, [np.array(pts, np.int32)], 1.0, cv2.LINE_AA)
    pm = cv2.GaussianBlur(pm, (0, 0), 2)*m
    return img*(1-pm[..., None]) + np.array(BL)*255*pm[..., None]
def finish(img, m, seed):
    h, w = m.shape
    mb = (m > .5).astype(np.uint8)
    dist = np.clip(cv2.distanceTransform(mb, cv2.DIST_L2, 5)/18, 0, 1)
    # form shading: darker toward bottom & edges, blue rim light top-left, warm bounce
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32)/h
    img = img*(0.55+0.45*dist[..., None])*(1.05-0.35*yy[..., None])
    rim = np.clip(m - np.roll(np.roll(m, 6, 0), 6, 1), 0, 1); rim = cv2.GaussianBlur(rim, (0, 0), 2.5)*(m>.5)
    img = img + rim[..., None]*np.array([80, 160, 255])*.9
    edge = cv2.morphologyEx(mb, cv2.MORPH_GRADIENT, np.ones((4, 4), np.uint8)).astype(np.float32)
    img = img*(1-edge[..., None]*.8) + np.array([20, 15, 35])*edge[..., None]*.8
    u8 = np.clip(img, 0, 255).astype(np.uint8)
    u8 = oil(u8, 3, 1)
    u8 = emboss(u8, cv2.GaussianBlur(strokes_tex(h, w, int(h*w/60), 7, 3, seed), (0, 0), 1), .22)
    a = (cv2.GaussianBlur(m, (0, 0), .8)*255).astype(np.uint8)
    return np.dstack([u8, a])

# BODY 520x300 (facing right)
img, m = canvas(520, 300)
cv2.ellipse(m, (260, 140), (215, 105), 0, 0, 360, 1, -1, cv2.LINE_AA)
cv2.ellipse(m, (400, 120), (95, 90), 0, 0, 360, 1, -1, cv2.LINE_AA)  # shoulders
cv2.ellipse(m, (110, 125), (95, 95), 0, 0, 360, 1, -1, cv2.LINE_AA)   # hips
cv2.ellipse(m, (250, 245), (40, 30), 0, 0, 360, 1, -1, cv2.LINE_AA)    # udder
img[:] = np.array(WH)*255
img = patches(img, m, 3, 7, (30, 70))
ud = np.zeros_like(m); cv2.ellipse(ud, (250, 248), (38, 28), 0, 0, 360, 1, -1, cv2.LINE_AA)
img = img*(1-ud[..., None]) + np.array([235, 160, 170])*ud[..., None]
body = finish(img, m, 1)
# HEAD 240x220 (snout at right/bottom)
img, m = canvas(240, 220)
cv2.ellipse(m, (110, 95), (70, 62), -20, 0, 360, 1, -1, cv2.LINE_AA)
cv2.ellipse(m, (170, 140), (55, 45), -20, 0, 360, 1, -1, cv2.LINE_AA)  # muzzle
cv2.ellipse(m, (45, 60), (38, 16), -25, 0, 360, 1, -1, cv2.LINE_AA)   # ear
img[:] = np.array(WH)*255
img = patches(img, m, 8, 3, (25, 45))
mz = np.zeros_like(m); cv2.ellipse(mz, (178, 150), (46, 34), -20, 0, 360, 1, -1, cv2.LINE_AA); mz = cv2.GaussianBlur(mz, (0, 0), 2)
img = img*(1-mz[..., None]) + np.array([240, 150, 165])*mz[..., None]
cv2.circle(img, (190, 140), 6, (90, 30, 50), -1, cv2.LINE_AA); cv2.circle(img, (205, 158), 5, (90, 30, 50), -1, cv2.LINE_AA)
cv2.circle(img, (128, 88), 11, (25, 20, 30), -1, cv2.LINE_AA); cv2.circle(img, (131, 84), 4, (255, 255, 255), -1, cv2.LINE_AA)
cv2.line(img, (100, 45), (80, 8), (230, 215, 170), 14, cv2.LINE_AA); cv2.line(m, (100, 45), (80, 8), 1, 14, cv2.LINE_AA)  # horn
head = finish(img, m, 2)
# LEG 70x200 (pivot at top center)
img, m = canvas(70, 200)
pts = np.array([[8, 0], [62, 0], [52, 170], [18, 170]], np.int32); cv2.fillPoly(m, [pts], 1, cv2.LINE_AA)
cv2.ellipse(m, (35, 10), (27, 18), 0, 0, 360, 1, -1, cv2.LINE_AA)
img[:] = np.array(WH)*255
img = patches(img, m, 12, 2, (15, 30))
cv2.rectangle(m, (16, 165), (54, 196), 1, -1); cv2.rectangle(img, (16, 165), (54, 196), (40, 30, 30), -1)
leg = finish(img, m, 3)
# TAIL 60x220 (pivot top)
img, m = canvas(60, 220)
cv2.line(m, (30, 4), (30, 180), 1, 10, cv2.LINE_AA)
cv2.ellipse(m, (30, 192), (16, 26), 0, 0, 360, 1, -1, cv2.LINE_AA)
img[:] = np.array(WH)*255; cv2.ellipse(img, (30, 192), (16, 26), 0, 0, 360, (30, 25, 30), -1, cv2.LINE_AA)
tail = finish(img, m, 4)

# atlas 1024x512 (RGBA)
atlas = np.zeros((512, 1024, 4), np.uint8)
def put(im, x, y): h, w = im.shape[:2]; atlas[y:y+h, x:x+w] = im; return [x, y, w, h]
rects = {'body': put(body, 0, 0), 'head': put(head, 530, 0), 'leg': put(leg, 780, 0), 'tail': put(tail, 860, 0)}
cv2.imwrite(S+'cow_parts.png', cv2.cvtColor(atlas, cv2.COLOR_RGBA2BGRA))
# rest-pose layout (cow-local px, origin = body top-left), used by both the assembled image and runtime rig
rig = {'body': [0, 0], 'head': [420, -20], 'legs': [[95, 190], [150, 195], [360, 190], [410, 195]], 'tail': [20, 70]}
# assembled cow 512x384 for the morph (one image = rest pose of the rig)
W, H = 760, 460; ox, oy = 40, 60
comp = np.zeros((H, W, 4), np.float32)
def over(im, x, y, dark=1.0):
    h, w = im.shape[:2]; x, y = int(x), int(y)
    a = im[..., 3:4].astype(np.float32)/255; c = im[..., :3].astype(np.float32)*dark
    reg = comp[y:y+h, x:x+w]
    reg[..., :3] = c*a + reg[..., :3]*(1-a); reg[..., 3:4] = a + reg[..., 3:4]*(1-a)
for i, (lx, ly) in enumerate(rig['legs']):
    if i in (1, 3): over(leg, ox+lx-35, oy+ly, .6)
over(tail, ox+rig['tail'][0]-30, oy+rig['tail'][1])
for i, (lx, ly) in enumerate(rig['legs']):
    if i in (0, 2): continue
for i, (lx, ly) in enumerate(rig['legs']):
    if i in (0, 2): over(leg, ox+lx-35, oy+ly)
over(body, ox, oy); over(head, ox+rig['head'][0], oy+rig['head'][1])
comp8 = np.clip(comp, 0, 255).astype(np.uint8); comp8[..., 3] = np.clip(comp[..., 3]*255, 0, 255).astype(np.uint8)
comp8 = cv2.resize(comp8, (512, 310), interpolation=cv2.INTER_AREA)
cv2.imwrite(S+'cow_full.png', cv2.cvtColor(comp8, cv2.COLOR_RGBA2BGRA))
import json; json.dump({'rects': rects, 'rig': rig, 'full': {'w': W, 'h': H, 'ox': ox, 'oy': oy}}, open(S+'cow_rig.json', 'w'))
from PIL import Image
i = Image.open(S+'cow_full.png'); bg = Image.new('RGBA', i.size, (40, 30, 80, 255)); bg.alpha_composite(i); bg.convert('RGB').save('/tmp/chk_cow.png')
print(rects)
