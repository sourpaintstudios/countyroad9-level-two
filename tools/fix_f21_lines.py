# p4a: remove the two white "waveform" scan lines baked into video frame 21 (atlas cell 33). Run after make_gray_atlas.py.
import numpy as np, cv2
from PIL import Image
P='art-src/gray_atlas.webp'; a=np.array(Image.open(P).convert('RGBA')); x0,y0=3*320,5*320
c=a[y0:y0+320,x0:x0+320].copy(); rgb=c[...,:3].astype(int)
m=np.zeros((320,320),np.uint8)
for lo,hi in [(52,69),(102,120)]:
    band=(rgb[lo:hi].min(2)>120)&(c[lo:hi,:,3]>0); m[lo:hi][band]=255
m=cv2.dilate(m,np.ones((5,5),np.uint8))
bgr=cv2.cvtColor(c[...,:3],cv2.COLOR_RGB2BGR); out=cv2.inpaint(bgr,m,7,cv2.INPAINT_TELEA)
al=cv2.inpaint(c[...,3],m,7,cv2.INPAINT_TELEA)
c[...,:3]=cv2.cvtColor(out,cv2.COLOR_BGR2RGB); c[...,3]=al
a[y0:y0+320,x0:x0+320]=c; Image.fromarray(a).save(P,'WEBP',quality=90,method=6,exact=True)
print('masked px',int((m>0).sum()))
