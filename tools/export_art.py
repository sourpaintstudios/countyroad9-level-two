from PIL import Image
import os, json
S = '/workspace/cr9-v2/art_src/'; O = '/workspace/cr9-v2/public/art/'
jobs = {'bg_fight': (None, 80), 'bg_drive': (None, 80), 'hero': (None, 85), 'faces_atlas': (None, 85), 'cow_parts': (None, 88),
        'cow_full': (None, 88), 'saucer': (None, 88), 'fx': (None, 90), 'corn': ((160, 320), 85), 'saguaro': ((150, 300), 85),
        'dash': (None, 85), 'sign_cut': ((300, 494), 85)}
tot = 0
for n, (sz, q) in jobs.items():
    im = Image.open(S+n+'.png')
    if sz: im = im.resize(sz, Image.LANCZOS)
    p = O+n.replace('_cut', '')+'.webp'
    im.save(p, 'WEBP', quality=q, method=6); s = os.path.getsize(p); tot += s; print(n, im.size, s//1024, 'KB')
print('total', tot//1024, 'KB')
