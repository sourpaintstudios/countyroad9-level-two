# p3b: Daniel's gray faces -> ONE 2048x2048 WebP atlas, 6x6 cells of 320 px (transparent bg, soft edges). No repainting.
# cells 0-14: clean sheet 1..15 | 15-29: melting sheet 1..15 | 30: clean master | 31: full dripping portrait | 32: video frame 11 (p4b: frame 21 cut)
import numpy as np, os, sys
from PIL import Image, ImageFilter
from scipy import ndimage
A='/home/box/agent-data/agents/889c1d0e-2b96-4450-b9d0-2eb4529f333a/attachments/'
P='/workspace/gray_refs/alien-reference-pack/expressions/'
OUT='/workspace/cr9-v44/tools/gray_cut'; os.makedirs(OUT,exist_ok=True)
C=320; N=6
SHEETS={'clean':(A+'27f253157c58d8c7d11d70812f4021aa484aa22385c33e23da823805bc47fdd9.jpg',[(148,463),(525,831),(892,1197),(1258,1567),(1629,1942)],[(80,327),(465,724),(869,1120)]),
        'melt':(A+'4c9bf99e650214cbed344862d12e7323d26d344321702c11bd1be62970bb39a2.jpg',[(133,473),(531,848),(901,1189),(1244,1552),(1609,1927)],[(71,325),(470,720),(866,1116)])}
def white_matte(rgb):
  a=rgb.astype(int); mn=a.min(2); sat=a.max(2)-mn
  bgish=(mn>222)&(sat<22)
  lab,n=ndimage.label(bgish); edge=set(np.unique(np.r_[lab[0],lab[-1],lab[:,0],lab[:,-1]]))-{0}
  bg=np.isin(lab,list(edge)); fg=~bg
  lab2,n2=ndimage.label(fg)
  if n2: sizes=ndimage.sum(fg,lab2,range(1,n2+1)); fg=lab2==(1+int(np.argmax(sizes)))  # biggest blob = the alien (drops label text)
  holes=ndimage.binary_fill_holes(fg)&~fg; hl,hn=ndimage.label(holes)
  if hn: hs=ndimage.sum(holes,hl,range(1,hn+1)); fg=fg|np.isin(hl,[i+1 for i,v in enumerate(hs) if v<60])  # keep eye glints, drop white gaps between drips
  loose=fg&(mn>212)&(sat<18); ll,ln=ndimage.label(loose)
  if ln: ls=ndimage.sum(loose,ll,range(1,ln+1)); fg=fg&~np.isin(ll,[i+1 for i,v in enumerate(ls) if v>=80 and mn[ll==i+1].mean()>230 and np.where(ll==i+1)[0].mean()>0.55*mn.shape[0]])  # paper-white gaps between drips
  return fg
def soften(rgb,fg):
  al=Image.fromarray((fg*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
  im=Image.fromarray(rgb).convert('RGBA'); im.putalpha(al); return im
def place(im,scale,top=8,cx=None):
  bb=im.getchannel('A').point(lambda v:255 if v>40 else 0).getbbox()
  im=im.crop(bb); w,h=im.size
  im=im.resize((max(1,round(w*scale)),max(1,round(h*scale))),Image.LANCZOS)
  cell=Image.new('RGBA',(C,C),(0,0,0,0))
  a=np.asarray(im.getchannel('A'))>128; hh=max(1,a.shape[0]//3)
  xs=np.where(a[:hh].any(0))[0]; hx=(xs.min()+xs.max())/2 if len(xs) else im.width/2  # centre on the head, not the shoulders
  cell.alpha_composite(im,(int(round(C/2-hx)),top)) if True else None
  return cell
def place_safe(im,scale,top=8):
  bb=im.getchannel('A').point(lambda v:255 if v>40 else 0).getbbox(); im=im.crop(bb); w,h=im.size
  im=im.resize((max(1,round(w*scale)),max(1,round(h*scale))),Image.LANCZOS)
  a=np.asarray(im.getchannel('A'))>128; hh=max(1,a.shape[0]//3); xs=np.where(a[:hh].any(0))[0]; hx=(xs.min()+xs.max())/2
  big=Image.new('RGBA',(C*3,C*3),(0,0,0,0)); big.alpha_composite(im,(int(round(C*1.5-hx)),C+top)); return big.crop((C,C,2*C,2*C))
cells={}
for k,(f,rows,cols) in SHEETS.items():
  src=np.asarray(Image.open(f).convert('RGB'))
  for r,(y0,y1) in enumerate(rows):
    for c,(x0,x1) in enumerate(cols):
      i=r*3+c; crop=src[max(0,y0-6):y1+2, max(0,x0-10):x1+10]
      im=soften(crop,white_matte(crop)); im.save(f'{OUT}/{k}_{i+1:02d}.png')
      cells[(0 if k=='clean' else 15)+i]=place_safe(im,0.98 if k=='clean' else 0.93,top=6)
from rembg import remove, new_session
sess=new_session('isnet-general-use')
def cut(path,box=None,headfrac=1.3,top=6):
  im=Image.open(path).convert('RGB')
  if box: im=im.crop(box)
  m=remove(im,session=sess,only_mask=True,post_process_mask=True)
  a=np.asarray(m)>128; lab,n=ndimage.label(a)
  if n: s=ndimage.sum(a,lab,range(1,n+1)); a=lab==(1+int(np.argmax(s)))
  rgba=soften(np.asarray(im),a)
  bb=rgba.getchannel('A').point(lambda v:255 if v>40 else 0).getbbox()
  # head width from the top quarter of the silhouette; crop head+shoulders = headfrac * head width tall... scale head to ~210 px wide
  al=np.asarray(rgba.getchannel('A'))[bb[1]:bb[3],bb[0]:bb[2]]>128; q=max(4,al.shape[0]//5); xs=np.where(al[:q].any(0))[0]; hw=xs.max()-xs.min()
  rgba=rgba.crop((bb[0],bb[1],bb[2],min(bb[3],bb[1]+int(hw*headfrac*1.0/ (150/hw) if False else int(hw*2.2)))))
  return rgba, 150/hw
for idx,(p,box,name) in {30:(A+'86c1410f3158acde2f80c327a7b8ec48d838a4f3ef79ab41b159e841aaa0ab58.jpg',(0,480,1080,1850),'master'),31:(A+'e8281964bfd77f21586d5e5e79bd7fe71d2cd1b95c871153d1aec136a4f4aa07.jpg',None,'drip'),
                         32:(P+'11_hands-on-head-sonic-rings.jpg',None,'f11')}.items():  # p4b: frame 21 (glitch strip) cut, frame 11 only
  im,sc=cut(p,box)
  if name in ('f11',):  # video frames: soft oval vignette so no rectangular background remnants survive the cut
    w,h=im.size; yy,xx=np.mgrid[0:h,0:w]; d=np.sqrt(((xx-w/2)/(w*0.5))**2+((yy-h*0.42)/(h*0.55))**2); v=np.clip((1.0-d)/0.18,0,1)
    a=np.asarray(im.getchannel('A')).astype(float)*v; im.putalpha(Image.fromarray(a.astype(np.uint8)))
  im.save(f'{OUT}/{name}.png'); cells[idx]=place_safe(im,sc,top=6)
atlas=Image.new('RGBA',(C*N,C*N),(0,0,0,0))  # p4b: trimmed 2048 -> 1920 (6x6 cells of 320, no dead border)
for i,c in cells.items(): atlas.alpha_composite(c,((i%N)*C,(i//N)*C))
# premultiply-safe edge: bleed colour into transparent texels so linear filtering never shows white halos
arr=np.asarray(atlas).copy(); a=arr[...,3]
idx=ndimage.distance_transform_edt(a<8,return_distances=False,return_indices=True)
for ch in range(3): arr[...,ch]=arr[...,ch][idx[0],idx[1]]
Image.fromarray(arr).save('/workspace/cr9-v44/art-src/gray_atlas.webp','WEBP',quality=84,method=6,exact=True)
Image.fromarray(arr).save('/workspace/cr9-v44/art_src/gray_atlas.png')
print('atlas', os.path.getsize('/workspace/cr9-v44/art-src/gray_atlas.webp'))
