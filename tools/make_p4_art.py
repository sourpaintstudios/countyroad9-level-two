# p4a: realistic night-desert plates (generated, art_src/p4) -> keyed WebP layers in art-src. Moon from Daniel's SPS desert-moon photo.
import numpy as np, cv2
from PIL import Image, ImageFilter
S='/workspace/cr9-v44/art_src/p4/'; O='/workspace/cr9-v44/art-src/'
def key(path):
  a=np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
  r,g,b=a[...,0],a[...,1],a[...,2]; mag=np.minimum(r,b)-g  # magenta-ness
  al=np.clip(1.0-(mag-40)/80.0,0,1)
  al=cv2.GaussianBlur(al,(0,0),0.8)
  r2=np.minimum(r,np.maximum(g*1.15,b*0.55)); b2=np.minimum(b,np.maximum(g*1.6,r2*1.3)+20)  # despill magenta fringe
  out=np.dstack([r2,g,b2,al*255]).clip(0,255).astype(np.uint8); return Image.fromarray(out,'RGBA')
def save(im,name,q=80): im.save(O+name,'WEBP',quality=q,method=6); print(name,im.size)
# sky: 720x960 (bottom of the plate meets the horizon)
sky=Image.open(S+'sky.jpg').convert('RGB').resize((720,1280),Image.LANCZOS).crop((0,320,720,1280)); save(sky,'bg_sky.webp',78)
# far mountains -> the 'mesa' slot (1024x256, ground at the bottom edge = horizon)
m=key(S+'mount.jpg').resize((1024,576),Image.LANCZOS).crop((0,296,1024,552)); save(m,'bg_mesa.webp',80)
# mid desert band: cacti + brush standing on the horizon, faded out below it (the road plate carries the near ground)
d=key(S+'mid.jpg').resize((1024,576),Image.LANCZOS).crop((0,200,1024,360)); a=np.asarray(d).copy(); h=a.shape[0]
fade=np.clip(1-(np.arange(h)-128)/28,0,1)[:,None]; a[...,3]=(a[...,3]*fade).astype(np.uint8); save(Image.fromarray(a,'RGBA'),'bg_desert.webp',80)
# road: 720x560 from the horizon (42 px of sky slot above it), painted dashes removed (the game scrolls its own faded line)
rd=np.asarray(Image.open(S+'road.jpg').convert('RGB'))
hsv=cv2.cvtColor(rd,cv2.COLOR_RGB2HSV); mask=((hsv[...,0]>12)&(hsv[...,0]<35)&(hsv[...,1]>90)&(hsv[...,2]>90)).astype(np.uint8)*255
mask=cv2.dilate(mask,np.ones((7,7),np.uint8)); rd=cv2.inpaint(rd,mask,7,cv2.INPAINT_TELEA)
Image.fromarray(rd).save('/tmp/road_inp.png'); kk=key('/tmp/road_inp.png'); al=np.asarray(kk)[...,3]; hz=int(np.argmax((al>200).mean(1)>0.95)); print('road horizon',hz)
ri=kk.crop((0,hz-42,768,1024)).resize((720,560),Image.LANCZOS)
a=np.asarray(ri).copy()  # sky slot above the horizon is transparent (sky/mountains show)
save(Image.fromarray(a,'RGBA'),'bg_ground.webp',80)
# props
sg=key(S+'saguaro.jpg'); sg=sg.crop(sg.getchannel('A').point(lambda v:255 if v>30 else 0).getbbox()); sg.thumbnail((150,400),Image.LANCZOS); save(sg,'saguaro.webp',82)
br=key(S+'brush.jpg'); br=br.crop(br.getchannel('A').point(lambda v:255 if v>30 else 0).getbbox()); br.thumbnail((200,200),Image.LANCZOS); save(br,'brush.webp',82)
# moon: Daniel's SPS desert-moon photo, soft round matte
mo=Image.open('/workspace/gray_refs/brand/sps_logo_desert_moon.jpg').convert('RGB'); a=np.asarray(mo).astype(np.float32)
L=a.mean(2); sub=(L[40:340,820:1120]>170).astype(np.uint8); n,lab,st,cen=cv2.connectedComponentsWithStats(sub); k=1+int(np.argmax(st[1:,4])); x0,y0,w0,h0=st[k,:4]; ys=np.array([40+y0,40+y0+h0]); xs=np.array([820+x0,820+x0+w0]); cy,cx=int(ys.mean()),int(xs.mean()); R=int(min(np.ptp(ys),np.ptp(xs))/2)+2; print('moon',cx,cy,R)
c=mo.crop((cx-R,cy-R,cx+R,cy+R)).resize((128,128),Image.LANCZOS); yy,xx=np.mgrid[0:128,0:128]; d=np.hypot(xx-63.5,yy-63.5)/64
al=np.clip((0.97-d)/0.06,0,1); ca=np.asarray(c).copy(); out=np.dstack([ca,(al*255).astype(np.uint8)]); save(Image.fromarray(out,'RGBA'),'moon.webp',85)
