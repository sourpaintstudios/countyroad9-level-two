import numpy as np, cv2
rng = np.random.default_rng(9)
def oil(img_rgb, size=5, dyn=1):
    return cv2.xphoto.oilPainting(img_rgb, size, dyn)
def bulge(img, cx, cy, r, k):
    """magnify (k>0) or pinch around center"""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xx - cx, yy - cy; d = np.sqrt(dx*dx+dy*dy)/r
    f = np.where(d < 1, 1 - k*(1-d**2)**2, 1).astype(np.float32)
    return cv2.remap(img, cx+dx*f, cy+dy*f, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
def squash(img, cx, cy, rx, ry, sy, sx=1.0, rot=0.0):
    """scale region around point by sy vertically (sy<1 = squash), smooth falloff"""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xx-cx, yy-cy; d = np.sqrt((dx/rx)**2+(dy/ry)**2)
    a = np.clip(1-d, 0, 1); a = a*a*(3-2*a)
    ys = 1/sy; xs = 1/sx
    c, s = np.cos(rot*a), np.sin(rot*a)
    mx = cx + (dx*(1+(xs-1)*a))*c - (dy*(1+(ys-1)*a))*s
    my = cy + (dx*(1+(xs-1)*a))*s + (dy*(1+(ys-1)*a))*c
    return cv2.remap(img, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
def shift(img, cx, cy, rx, ry, ox, oy):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx-cx)/rx)**2+((yy-cy)/ry)**2); a = np.clip(1-d,0,1); a=a*a*(3-2*a)
    return cv2.remap(img, (xx-ox*a).astype(np.float32), (yy-oy*a).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
def strokes_tex(h, w, n, length=10, width=3, seed=1):
    """grayscale impasto height field made of short random strokes"""
    r = np.random.default_rng(seed); t = np.zeros((h, w), np.float32)
    for _ in range(n):
        x, y = r.uniform(0, w), r.uniform(0, h); a = r.uniform(0, np.pi)
        L = length*r.uniform(.5, 1.5); dx, dy = np.cos(a)*L, np.sin(a)*L
        cv2.line(t, (int(x-dx), int(y-dy)), (int(x+dx), int(y+dy)), float(r.uniform(.3, 1)), int(width*r.uniform(.6, 1.4)), cv2.LINE_AA)
    return cv2.GaussianBlur(t, (0, 0), 0.8)
def emboss(img, height, amt=0.35):
    gx = cv2.Sobel(height, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(height, cv2.CV_32F, 0, 1, ksize=3)
    shade = np.clip(1 + amt*(-gx - gy)/4, 0.6, 1.5)[..., None]
    return np.clip(img.astype(np.float32)*shade, 0, 255).astype(np.uint8)
def paint_ellipse(img, c, ax, color, angle=0, seed=0, strokes=True):
    """draw a filled ellipse with brushy texture"""
    m = np.zeros(img.shape[:2], np.float32); cv2.ellipse(m, (int(c[0]), int(c[1])), (int(ax[0]), int(ax[1])), angle, 0, 360, 1.0, -1, cv2.LINE_AA)
    m = cv2.GaussianBlur(m, (0, 0), 1.2)[..., None]
    col = np.zeros_like(img, np.float32); col[:] = color
    return (img*(1-m) + col*m).astype(np.uint8), m[..., 0]
