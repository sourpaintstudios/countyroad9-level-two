# v4.1 (DOT): three PRE-BLURRED painted parallax layers cut/painted from the v2 drive plate. No runtime blur.
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
src = Image.open('tools/bg_drive_src.webp').convert('RGB')  # 720x1440, horizon at ~y 922
W, H = src.size
# far: sky (moon, nebula, stars), heaviest blur, feathered bottom
sky = src.crop((0, 0, W, 960)).filter(ImageFilter.GaussianBlur(2.6)).convert('RGBA')
a = np.ones((960, W), np.float32); a[900:] = np.linspace(1, 0, 60)[:, None]
sky.putalpha(Image.fromarray((a * 255).astype(np.uint8))); sky.save('art-src/bg_sky.webp', quality=82)
# near: fields + road, light blur (still reads painterly, never sharper than the props)
gr = src.crop((0, 880, W, H)).filter(ImageFilter.GaussianBlur(0.9)).convert('RGBA')
a = np.ones((H - 880, W), np.float32); a[:40] = np.linspace(0, 1, 40)[:, None]
gr.putalpha(Image.fromarray((a * 255).astype(np.uint8))); gr.save('art-src/bg_ground.webp', quality=82)
# mid: distant mesas/buttes painted procedurally in the sky's purples, medium blur, alpha silhouette
rng = np.random.default_rng(9); MW, MH = 1024, 256
im = Image.new('RGBA', (MW, MH), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
def ridge(base, amp, col, seed, flat=0.0):
    r = np.random.default_rng(seed); x = np.arange(MW); y = np.zeros(MW)
    for f, k in [(2, 1), (5, .5), (11, .25), (23, .12)]: y += k * np.sin(x / MW * np.pi * 2 * f + r.uniform(0, 6))
    y = (y - y.min()) / (y.max() - y.min())
    if flat: y = np.where(y > 0.55, 0.55 + (y - 0.55) * 0.15, y)  # flat-topped mesas
    pts = [(0, MH)] + [(int(i), int(base - amp * y[i])) for i in range(0, MW, 4)] + [(MW, MH)]
    d.polygon(pts, fill=col)
ridge(200, 120, (66, 48, 118, 255), 3, flat=1)
ridge(225, 80, (48, 34, 92, 255), 5, flat=1)
ridge(246, 40, (34, 26, 66, 255), 8)
arr = np.array(im).astype(np.float32)
n = rng.normal(0, 9, (MH, MW, 1)); arr[..., :3] = np.clip(arr[..., :3] + n * (arr[..., 3:] > 0), 0, 255)
rim = np.zeros((MH, MW)); al = arr[..., 3] > 0
rim[1:] = al[1:] & ~al[:-1]
for k in range(1, 4): arr[k:, :, :3] += (rim[:-k, :, None] * np.array([40, 30, 70]) * (1 - k / 4))
im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
im.save('art-src/bg_mesa.webp', quality=85)
# the gray's antenna (confused cow gag): stalk + glowing green ball, 64x96
an = Image.new('RGBA', (64, 96), (0, 0, 0, 0)); d = ImageDraw.Draw(an)
d.line([(32, 95), (30, 50), (36, 22)], fill=(150, 160, 150, 255), width=5)
for r, c in [(16, (125, 255, 58, 90)), (11, (125, 255, 58, 255)), (5, (230, 255, 200, 255))]: d.ellipse([36 - r, 18 - r, 36 + r, 18 + r], fill=c)
an.save('art-src/antenna.webp', quality=90)
print('ok')
