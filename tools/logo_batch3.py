# Logos for hiring-signals, eu-vat, eori, lei, sanctions, hts, federal-awards (512x512, no text).
import math
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
def star(d,c,R,r,fill=W):
    d.polygon([(c[0]+(R if k%2==0 else r)*math.cos(-math.pi/2+k*math.pi/5),c[1]+(R if k%2==0 else r)*math.sin(-math.pi/2+k*math.pi/5)) for k in range(10)],fill=fill)
def save(img,p): img.resize((512,512),Image.LANCZOS).save(p)
GREEN=(34,197,94,255)
# Hiring signals: briefcase + up arrow badge
img=base((16,185,129),(4,120,87)); d=ImageDraw.Draw(img)
d.rounded_rectangle([760,420,1290,700],radius=90,outline=W,width=90)
d.rounded_rectangle([330,620,1720,1440],radius=140,fill=W); d.rectangle([330,930,1720,990],fill=(4,120,87,255))
c=badge(d,(6,78,59,255),(245,158,11,255)); d.polygon([(c[0],c[1]-170),(c[0]-140,c[1]),(c[0]-50,c[1]),(c[0]-50,c[1]+150),(c[0]+50,c[1]+150),(c[0]+50,c[1]),(c[0]+140,c[1])],fill=W)
save(img,'actors/hiring-signals-by-domain/logo.png')
# EU VAT: ring of 12 stars + check
img=base((37,99,235),(30,58,138)); d=ImageDraw.Draw(img)
for k in range(12):
    a=k*math.pi/6; star(d,(1000+560*math.cos(a),960+560*math.sin(a)),120,50,(250,204,21,255))
d.rounded_rectangle([700,760,1300,1160],radius=80,fill=W)
for i in range(3): d.rounded_rectangle([780,820+i*110,1220-i*120,880+i*110],radius=30,fill=(30,58,138,255))
c=badge(d,(23,37,84,255),GREEN); check(d,c); save(img,'actors/eu-vat-validator/logo.png')
# EORI: shipping container + check
img=base((234,88,12),(154,52,18)); d=ImageDraw.Draw(img)
d.rounded_rectangle([300,620,1700,1320],radius=60,fill=W)
for i in range(9): x=400+i*140; d.rounded_rectangle([x,700,x+70,1240],radius=30,fill=(251,146,60,255))
c=badge(d,(124,45,18,255),GREEN); check(d,c); save(img,'actors/eori-validator/logo.png')
# LEI: building with ID tag
img=base((13,148,136),(17,94,89)); d=ImageDraw.Draw(img)
d.polygon([(330,700),(1020,330),(1710,700)],fill=W); d.rectangle([330,1360,1710,1480],fill=W)
for i in range(5): x=420+i*270; d.rounded_rectangle([x,780,x+130,1320],radius=30,fill=W)
c=badge(d,(19,78,74,255),(245,158,11,255)); d.rounded_rectangle([c[0]-150,c[1]-100,c[0]+150,c[1]+100],radius=30,outline=W,width=40); d.ellipse([c[0]-90,c[1]-40,c[0]-10,c[1]+40],fill=W); d.rectangle([c[0]+20,c[1]-30,c[0]+110,c[1]-5],fill=W); d.rectangle([c[0]+20,c[1]+15,c[0]+90,c[1]+40],fill=W)
save(img,'actors/lei-lookup/logo.png')
# Sanctions: shield + magnifier
img=base((220,38,38),(127,29,29)); d=ImageDraw.Draw(img)
d.polygon([(1000,300),(1600,520),(1560,1050),(1000,1560),(440,1050),(400,520)],fill=W)
d.polygon([(1000,470),(1440,630),(1410,1010),(1000,1380),(590,1010),(560,630)],fill=(185,28,28,255))
d.line([(760,930),(930,1100),(1260,740)],fill=W,width=110,joint='curve')
c=badge(d,(69,10,10,255),(15,23,42,255)); d.ellipse([c[0]-140,c[1]-140,c[0]+60,c[1]+60],outline=W,width=50); d.line([(c[0]+40,c[1]+40),(c[0]+150,c[1]+150)],fill=W,width=60)
save(img,'actors/sanctions-screener/logo.png')
# HTS: package box + percent badge
img=base((2,132,199),(12,74,110)); d=ImageDraw.Draw(img)
d.polygon([(1000,330),(1640,620),(1000,910),(360,620)],fill=(224,242,254,255))
d.polygon([(360,620),(1000,910),(1000,1640),(360,1350)],fill=W)
d.polygon([(1640,620),(1000,910),(1000,1640),(1640,1350)],fill=(186,230,253,255))
d.polygon([(680,475),(1320,765),(1320,960),(1220,910),(1220,810),(580,520)],fill=(12,74,110,255))
c=badge(d,(8,47,73,255),(245,158,11,255)); d.ellipse([c[0]-150,c[1]-150,c[0]-50,c[1]-50],fill=W); d.ellipse([c[0]+50,c[1]+50,c[0]+150,c[1]+150],fill=W); d.line([(c[0]+130,c[1]-150),(c[0]-130,c[1]+150)],fill=W,width=55)
save(img,'actors/hts-code-lookup/logo.png')
# Federal awards: capitol columns + dollar badge
img=base((30,64,175),(30,27,75)); d=ImageDraw.Draw(img)
d.pieslice([720,300,1280,860],180,360,fill=W); d.rectangle([980,220,1020,320],fill=W)
d.polygon([(300,820),(1000,600),(1700,820)],fill=W); d.rectangle([300,840,1700,920],fill=W); d.rectangle([300,1400,1700,1520],fill=W)
for i in range(6): x=370+i*245; d.rounded_rectangle([x,960,x+130,1380],radius=30,fill=W)
c=badge(d,(23,23,60,255),GREEN)
d.arc([c[0]-110,c[1]-160,c[0]+110,c[1]+10],60,300,fill=W,width=50); d.arc([c[0]-110,c[1]-10,c[0]+110,c[1]+160],240,480,fill=W,width=50); d.line([(c[0],c[1]-210),(c[0],c[1]+210)],fill=W,width=40)
save(img,'actors/federal-awards-by-company/logo.png'); print('saved 7')
