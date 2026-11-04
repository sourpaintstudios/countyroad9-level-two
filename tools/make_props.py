import numpy as np, cv2, sys
sys.path.insert(0, '/workspace/cr9-v2/tools')
from paintlib import oil, emboss, strokes_tex
S = '/workspace/cr9-v2/art_src/'; r = np.random.default_rng(4)
def fin(img, m, amt=.2, seed=1, o=3):
    u8 = np.clip(img, 0, 255).astype(np.uint8)
    u8 = oil(u8, o, 1); h, w = m.shape
    u8 = emboss(u8, cv2.GaussianBlur(strokes_tex(h, w, int(h*w/50), 7, 3, seed), (0, 0), 1), amt)
    return np.dstack([u8, (np.clip(cv2.GaussianBlur(m, (0, 0), .8), 0, 1)*255).astype(np.uint8)])
# CORN clump 240x480
W, H = 240, 480; img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
for k in range(5):
    x = 40+k*40+r.uniform(-10, 10); top = r.uniform(20, 90)
    cv2.line(img, (int(x), H), (int(x+r.uniform(-8, 8)), int(top)), (40, 80, 55), 7, cv2.LINE_AA); cv2.line(m, (int(x), H), (int(x), int(top)), 1, 7, cv2.LINE_AA)
    for j in range(7):
        y = top+40+j*55+r.uniform(-10, 10); s = 1 if r.random() < .5 else -1; L = r.uniform(50, 95)
        pts = np.array([[x, y], [x+s*L*.5, y-30], [x+s*L, y+r.uniform(-5, 25)], [x+s*L*.5, y-20]], np.int32)
        col = (r.uniform(30, 60), r.uniform(80, 130), r.uniform(60, 90))
        cv2.fillPoly(img, [pts], col, cv2.LINE_AA); cv2.fillPoly(m, [pts], 1, cv2.LINE_AA)
    cv2.line(img, (int(x), int(top)), (int(x), int(top-25)), (180, 160, 80), 4, cv2.LINE_AA); cv2.line(m, (int(x), int(top)), (int(x), int(top-25)), 1, 4, cv2.LINE_AA)
rim = cv2.GaussianBlur(np.clip(m-np.roll(m, 4, 1), 0, 1), (0, 0), 2)*(m > .5)
img = img + rim[..., None]*np.array([60, 130, 220])
img = img*np.linspace(1.2, .45, H)[:, None, None]
cv2.imwrite(S+'corn.png', cv2.cvtColor(fin(img, m, .25, 3, 2), cv2.COLOR_RGBA2BGRA))
# SAGUARO 220x440
W, H = 220, 440; img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
def arm(p0, p1, w):
    for t in (img, m): cv2.line(t, p0, p1, (1,) if t is m else (40, 90, 60), w, cv2.LINE_AA)
    cv2.circle(m, p1, w//2, 1, -1, cv2.LINE_AA); cv2.circle(img, p1, w//2, (40, 90, 60), -1, cv2.LINE_AA)
arm((110, 440), (110, 40), 52); arm((110, 250), (45, 250), 34); arm((45, 250), (45, 140), 34); arm((110, 210), (175, 210), 30); arm((175, 210), (175, 110), 30)
mb = (m > .5).astype(np.uint8); dist = np.clip(cv2.distanceTransform(mb, cv2.DIST_L2, 5)/20, 0, 1)
img = img*(.5+.6*dist[..., None])
for x in range(70, 150, 12): cv2.line(img, (x, 60), (x, 440), (25, 60, 40), 2, cv2.LINE_AA)
rim = cv2.GaussianBlur(np.clip(m-np.roll(m, 5, 1), 0, 1), (0, 0), 2)*(m > .5); img = img + rim[..., None]*np.array([90, 120, 230])
cv2.imwrite(S+'saguaro.png', cv2.cvtColor(fin(img, m, .25, 5, 2), cv2.COLOR_RGBA2BGRA))
# DASH 720x560 (bottom of screen), radio centred so its knob = start button
W, H = 720, 560; img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
pts = np.array([[0, 120], [180, 70], [540, 70], [720, 120], [720, H], [0, H]], np.int32)
cv2.fillPoly(m, [pts], 1, cv2.LINE_AA)
img[:] = (28, 24, 40)
img = img*(1+np.linspace(0.6, -0.3, H)[:, None, None])
cv2.line(img, (0, 122), (180, 72), (90, 80, 140), 5, cv2.LINE_AA); cv2.line(img, (180, 72), (540, 72), (90, 80, 140), 5, cv2.LINE_AA); cv2.line(img, (540, 72), (720, 122), (90, 80, 140), 5, cv2.LINE_AA)
# gauges left
for cx in (110, 200):
    cv2.circle(img, (cx, 200), 42, (12, 14, 20), -1, cv2.LINE_AA); cv2.circle(img, (cx, 200), 42, (90, 200, 120), 3, cv2.LINE_AA)
    for k in range(9):
        a = np.deg2rad(150+k*30); cv2.line(img, (int(cx+np.cos(a)*30), int(200+np.sin(a)*30)), (int(cx+np.cos(a)*38), int(200+np.sin(a)*38)), (140, 255, 150), 2, cv2.LINE_AA)
    cv2.line(img, (cx, 200), (cx+25, 185), (255, 120, 60), 3, cv2.LINE_AA)
# radio (center)
rx, ry, rw, rh = 250, 170, 300, 120
cv2.rectangle(img, (rx-10, ry-10), (rx+rw+10, ry+rh+10), (70, 70, 85), -1, cv2.LINE_AA)
cv2.rectangle(img, (rx, ry), (rx+rw, ry+rh), (18, 16, 22), -1)
cv2.rectangle(img, (rx+20, ry+20), (rx+200, ry+64), (255, 170, 60), -1)
g = np.zeros((H, W), np.float32); cv2.rectangle(g, (rx+20, ry+20), (rx+200, ry+64), 1, -1); g = cv2.GaussianBlur(g, (0, 0), 14)
img = img + g[..., None]*np.array([255, 150, 50])*.8
for k in range(17): cv2.line(img, (rx+28+k*10, ry+24), (rx+28+k*10, ry+(36 if k % 2 else 44)), (60, 30, 10), 2)
cv2.line(img, (rx+120, ry+20), (rx+120, ry+64), (220, 30, 20), 3)
for k in range(5): cv2.rectangle(img, (rx+22+k*36, ry+80), (rx+48+k*36, ry+100), (150, 150, 160), -1)
# steering wheel (bottom-left arc)
cv2.ellipse(img, (150, 610), (240, 220), 0, 200, 340, (14, 12, 18), 34, cv2.LINE_AA); cv2.ellipse(img, (150, 610), (240, 220), 0, 205, 335, (70, 70, 110), 4, cv2.LINE_AA)
cv2.ellipse(m, (150, 610), (240, 220), 0, 180, 360, 1, 40, cv2.LINE_AA)
# neon drips under the radio
for k in range(9):
    x = rx+20+k*32+int(r.uniform(-6, 6)); L = int(r.uniform(40, 140)); w = int(r.uniform(7, 13))
    cv2.line(img, (x, ry+rh+10), (x, ry+rh+10+L), (150, 255, 40), w, cv2.LINE_AA); cv2.circle(img, (x, ry+rh+10+L), int(w*.7), (170, 255, 60), -1, cv2.LINE_AA)
cv2.imwrite(S+'dash.png', cv2.cvtColor(fin(img, m, .2, 7, 2), cv2.COLOR_RGBA2BGRA))
print('props ok; radio knob centre in dash px =', rx+250, ry+60)
