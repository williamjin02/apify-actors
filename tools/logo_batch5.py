# Logo for sec-company-financials (512x512, no text). Same brand system: rounded square, vertical gradient, white glyph, accent badge.
import os
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
# SEC financials: statement sheet with bar chart + rising line, green up-arrow badge
img=base((30,64,175),(15,23,42)); d=ImageDraw.Draw(img); N=(30,58,138,255)
d.rounded_rectangle([330,330,1600,1640],radius=110,fill=W)
for i,h in enumerate([300,430,560,720]):
    x=470+i*260; d.rounded_rectangle([x,1440-h,x+170,1440],radius=30,fill=N)
d.line([(555,1020),(815,900),(1075,760),(1335,560)],fill=(245,158,11,255),width=60,joint='curve')
for x,y in [(555,1020),(815,900),(1075,760),(1335,560)]: d.ellipse([x-55,y-55,x+55,y+55],fill=(245,158,11,255))
d.rectangle([470,1480,1460,1520],fill=(203,213,225,255))
c=badge(d,(15,23,42,255),(34,197,94,255))
d.polygon([(c[0],c[1]-170),(c[0]+150,c[1]),(c[0]+55,c[1]),(c[0]+55,c[1]+160),(c[0]-55,c[1]+160),(c[0]-55,c[1]),(c[0]-150,c[1])],fill=W)
p='actors/sec-company-financials/logo.png'; img.resize((512,512),Image.LANCZOS).save(p); print('saved',p)
