# Logos for grants-gov-opportunity-search and ai-crawler-access-checker (512x512, no text).
import math, os
from PIL import Image, ImageDraw
S=2048; W=(255,255,255,255)
def base(a,b):
    img=Image.new('RGBA',(S,S),(0,0,0,0)); grad=Image.new('RGBA',(S,S)); gd=ImageDraw.Draw(grad)
    for y in range(S):
        t=y/(S-1); gd.line([(0,y),(S,y)],fill=tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))+(255,))
    m=Image.new('L',(S,S),0); ImageDraw.Draw(m).rounded_rectangle([0,0,S-1,S-1],radius=420,fill=255)
    img.paste(grad,(0,0),m); return img
def badge(d,ring,fill,c=(1560,1540),r=250):
    d.ellipse([c[0]-r-40,c[1]-r-40,c[0]+r+40,c[1]+r+40],fill=ring); d.ellipse([c[0]-r,c[1]-r,c[0]+r,c[1]+r],fill=fill); return c
def check(d,c): d.line([(c[0]-120,c[1]),(c[0]-30,c[1]+100),(c[0]+130,c[1]-100)],fill=W,width=70,joint='curve')
def save(img,p):
    if os.path.isdir(os.path.dirname(p)): img.resize((512,512),Image.LANCZOS).save(p); print('saved',p)
# Grants: calendar page with dollar seed/sprout, magnifier badge
img=base((22,163,74),(21,94,117)); d=ImageDraw.Draw(img); D=(21,94,117,255); L=(220,252,231,255)
d.rounded_rectangle([340,420,1600,1560],radius=120,fill=W)
d.rounded_rectangle([340,420,1600,700],radius=120,fill=L); d.rectangle([340,600,1600,700],fill=L)
for x in (620,1320): d.rounded_rectangle([x-50,300,x+50,560],radius=50,fill=(15,70,90,255))
for r in range(3):
    for c in range(4):
        x=480+c*270; y=800+r*230
        d.rounded_rectangle([x,y,x+170,y+150],radius=30,fill=(245,158,11,255) if (r,c)==(1,2) else D)
c=badge(d,(15,60,75,255),(245,158,11,255))
d.ellipse([c[0]-150,c[1]-150,c[0]+60,c[1]+60],outline=W,width=50); d.line([(c[0]+40,c[1]+40),(c[0]+150,c[1]+150)],fill=W,width=60)
save(img,'actors/grants-gov-opportunity-search/logo.png')
# AI crawler access: robot head + shield/check badge
img=base((99,102,241),(15,23,42)); d=ImageDraw.Draw(img); P=(67,56,202,255)
d.line([(1000,300),(1000,470)],fill=W,width=60); d.ellipse([920,230,1080,390],fill=(245,158,11,255))
d.rounded_rectangle([420,470,1580,1350],radius=220,fill=W)
d.rounded_rectangle([300,780,420,1060],radius=50,fill=W); d.rounded_rectangle([1580,780,1700,1060],radius=50,fill=W)
d.ellipse([600,700,820,920],fill=P); d.ellipse([1180,700,1400,920],fill=P)
d.rounded_rectangle([680,1080,1320,1190],radius=55,fill=P)
c=badge(d,(30,27,75,255),(34,197,94,255)); check(d,c)
save(img,'actors/ai-crawler-access-checker/logo.png')
