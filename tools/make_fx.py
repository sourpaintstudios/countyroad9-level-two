import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
C = 128; atlas = np.zeros((512, 512, 4), np.float32)
yy, xx = np.mgrid[0:C, 0:C].astype(np.float32); d = np.sqrt((xx-64)**2+(yy-64)**2)/64
def cell(i, rgba):
    x, y = (i % 4)*C, (i//4)*C; atlas[y:y+C, x:x+C] = rgba
def white(a): return np.dstack([np.ones_like(a)]*3+[a])
# 0 soft glow
cell(0, white(np.clip(1-d, 0, 1)**2))
# 1 paint glob with gloss highlight (rgb carries shading, tinted at runtime)
a = np.clip((0.8-d)*10, 0, 1); sh = np.clip(1.15 - np.sqrt((xx-48)**2+(yy-46)**2)/64, .55, 1)
hl = np.clip(1-np.sqrt((xx-46)**2+(yy-42)**2)/14, 0, 1)
g = np.dstack([sh+hl]*3+[a]); cell(1, np.clip(g, 0, 1.0))
# 2 splat (irregular)
r = np.random.default_rng(2); m = np.zeros((C, C), np.float32)
cv2.circle(m, (64, 64), 30, 1, -1, cv2.LINE_AA)
for k in range(12):
    an = r.uniform(0, 6.28); dd = r.uniform(30, 55); cv2.circle(m, (int(64+np.cos(an)*dd), int(64+np.sin(an)*dd)), int(r.uniform(4, 11)), 1, -1, cv2.LINE_AA)
    cv2.line(m, (64, 64), (int(64+np.cos(an)*dd), int(64+np.sin(an)*dd)), 1, int(r.uniform(3, 8)), cv2.LINE_AA)
cell(2, white(m))
# 3 spark / star
st = np.clip(1-np.abs(xx-64)/5, 0, 1)*np.clip(1-np.abs(yy-64)/60, 0, 1) + np.clip(1-np.abs(yy-64)/5, 0, 1)*np.clip(1-np.abs(xx-64)/60, 0, 1)
cell(3, white(np.clip(st + np.clip(1-d*2.5, 0, 1), 0, 1)))
# 4..7 notes via font
font = None
for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
    try: font = ImageFont.truetype(f, 104); break
    except Exception: pass
for i, ch in enumerate(['♪', '♫', '♬', '♩']):
    im = Image.new('L', (C, C), 0); dr = ImageDraw.Draw(im); dr.text((64, 66), ch, fill=255, font=font, anchor='mm')
    a = np.array(im).astype(np.float32)/255
    glow = cv2.GaussianBlur(a, (0, 0), 5)*.6
    cell(4+i, white(np.clip(a+glow, 0, 1)))
# 8 confetti rect
m = np.zeros((C, C), np.float32); cv2.rectangle(m, (40, 54), (88, 74), 1, -1); cell(8, white(m))
# 9 fire puff (noisy)
n = cv2.GaussianBlur(np.random.default_rng(5).random((C, C)).astype(np.float32), (0, 0), 6); n = (n-n.min())/(n.max()-n.min())
cell(9, white(np.clip((1-d)*1.4*(0.5+n), 0, 1)**1.5))
# 10 ring
cell(10, white(np.clip(1-np.abs(d-.8)*12, 0, 1)))
# 11 drip (teardrop)
m = np.zeros((C, C), np.float32); cv2.circle(m, (64, 84), 22, 1, -1, cv2.LINE_AA); cv2.fillPoly(m, [np.array([[46, 76], [82, 76], [64, 20]], np.int32)], 1, cv2.LINE_AA)
cell(11, white(cv2.GaussianBlur(m, (0, 0), 1)))
out = (np.clip(atlas, 0, 1)*255).astype(np.uint8)
Image.fromarray(out, 'RGBA').save('/workspace/cr9-v2/art_src/fx.png'); print('fx ok', font)
