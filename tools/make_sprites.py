import numpy as np, cv2, glob, sys
sys.path.insert(0, '/workspace/cr9-v2/tools')
from paintlib import oil, emboss, strokes_tex
from rembg import remove, new_session
from PIL import Image
A = '/home/box/agent-data/agents/889c1d0e-2b96-4450-b9d0-2eb4529f333a/attachments/'
S = '/workspace/cr9-v2/art_src/'
sess = new_session('isnet-general-use')
def rgba(a): return cv2.cvtColor(np.array(a), cv2.COLOR_RGBA2BGRA)
# --- saucer from Daniel's painting (07d33f), elliptical soft mask
im = cv2.imread(S+'ref_07d33f.png')
c = im[40:280, 620:1140].copy()  # 520x240
h, w = c.shape[:2]; m = np.zeros((h, w), np.float32)
cv2.ellipse(m, (270, 112), (215, 72), -4, 0, 360, 1, -1, cv2.LINE_AA)
cv2.ellipse(m, (280, 48), (100, 40), 0, 0, 360, 1, -1, cv2.LINE_AA)  # dome
m = cv2.GaussianBlur(m, (0, 0), 5)
out = np.dstack([c, (m*255).astype(np.uint8)])
cv2.imwrite(S+'saucer.png', out)
# --- hero cleanup: remove beam remnant + controls; oil paint pass + blue rim
hcut = cv2.imread(S+'hero_cut.png', cv2.IMREAD_UNCHANGED)  # 790x1240
h, w = hcut.shape[:2]
b, g, r, a = [hcut[..., i].astype(np.float32) for i in range(4)]
beam = (b > 170) & (g > 140) & (r < 190) & (b - r > 40)
yy, xx = np.mgrid[0:h, 0:w]
a[beam & (yy < 330) & (xx < 300)] = 0
a[(yy < 520) & (xx < 210) & ~((yy > 380) & (xx > 40))] = 0  # sky beam streak top-left
keep = np.zeros((h, w), np.uint8)
cv2.rectangle(keep, (0, 0), (790, 1010), 1, -1); cv2.rectangle(keep, (60, 1000), (180, 1135), 1, -1); cv2.rectangle(keep, (440, 1000), (560, 1105), 1, -1)
a = a*keep
a = cv2.erode(a, np.ones((3, 3), np.uint8))
a = cv2.GaussianBlur(a, (0, 0), 1)
rgb = cv2.merge([hcut[..., 0], hcut[..., 1], hcut[..., 2]])
rgb = oil(rgb, 2, 1)
rgb = emboss(rgb, cv2.GaussianBlur(strokes_tex(h, w, 9000, 8, 3, 7), (0, 0), 1), .12)
# blue rim from upper-left
am = (a > 128).astype(np.float32)
rim = np.clip(am - np.roll(np.roll(am, 7, 0), 7, 1), 0, 1)
rim = cv2.GaussianBlur(rim, (0, 0), 3)[..., None]
rgb = np.clip(rgb.astype(np.float32) + rim*np.array([255, 160, 60])*.9, 0, 255).astype(np.uint8)
out = np.dstack([rgb, a.astype(np.uint8)])
out = cv2.resize(out, (632, 992), interpolation=cv2.INTER_AREA)
cv2.imwrite(S+'hero.png', out)
for n in ('saucer', 'hero'):
    i = Image.open(S+n+'.png'); bg = Image.new('RGBA', i.size, (255, 0, 255, 255)); bg.alpha_composite(i.convert('RGBA')); bg.convert('RGB').save(f'/tmp/chk_{n}.png')
print('ok')
