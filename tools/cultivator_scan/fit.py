import numpy as np, json, sys
sys.path.insert(0,'/home/ubuntu/tripo'); from skel import *
from scipy.optimize import minimize
j,b=readglb('/home/ubuntu/repos/3D-Game/public/models/Cultivator.glb'); S=Skel(j)
# Cultivator body z-centre vs skeleton
CP=np.concatenate([acc(j,b,p['attributes']['POSITION']) for p in j['meshes'][0]['primitives']])*0.01
d=np.load('/home/ubuntu/tripo/baked.npz'); V=d['V'].copy()
ymin,ymax=V[:,1].min(),V[:,1].max(); V=(V-[0,ymin,0])*(1.78/(ymax-ymin)); V[:,[0,2]]-=np.r_[V[:,0].mean(),V[:,2].mean()]
hx=V[np.abs(V[:,1]-1.6)<0.03,0]; V[:,0]-=(hx.min()+hx.max())/2
def zc(P,y): sl=np.abs(P[:,1]-y)<0.02; return (P[sl,2].min()+P[sl,2].max())/2
for y in [0.3,0.6,0.9,1.2,1.35]: print(y,'cult zc',round(zc(CP,y),3),'hy zc',round(zc(V,y),3))
dz=np.mean([zc(V,y)-zc(CP,y) for y in [0.3,0.6,0.9]]); print('dz',dz)
hips=S.idx['mixamorigHips']; S.nodes[hips]['translation']=list(np.array(S.nodes[hips]['translation'])+[0,0,dz*100])
W=lambda nm,pose=None: S.world(S.idx[nm],pose)[:3,3]
r=V[:,1]>1.0
T={'Left':np.array([0.225,0.80,0.09]),'Right':np.array([-0.235,0.81,0.08])}
pose={'mixamorigLeftArm':(0,0,-1.15),'mixamorigRightArm':(0,0,1.15),'mixamorigLeftUpLeg':(0,0,0.05),'mixamorigRightUpLeg':(0,0,-0.05),'mixamorigLeftLeg':(0.06,0,0),'mixamorigRightLeg':(0.06,0,0)}
base={k:list(S.nodes[S.idx[k]]['translation']) for k in S.idx if k.startswith('mixamorig')}
for side,sg in [('Left',-1),('Right',1)]:
    a,f,h=f'mixamorig{side}Arm',f'mixamorig{side}ForeArm',f'mixamorig{side}Hand'
    def setp(p):
        ax,az,fy,sc=p
        pose[a]=(ax,0,az); pose[f]=(0,fy,0)
        for k in (f,h): S.nodes[S.idx[k]]['translation']=list(np.array(base[k])*sc)
    def obj(p):
        setp(p); e=W(h,pose)-T[side]
        return e@e*100+0.02*p[0]**2+0.5*(p[3]-1)**2+0.05*(p[2]-sg*0.35)**2
    res=minimize(obj,[0.2,sg*1.15,sg*0.3,1.0],method='Nelder-Mead',options={'maxiter':4000,'xatol':1e-5,'fatol':1e-9})
    setp(res.x); print(side,res.x.round(3),'wrist',W(h,pose).round(3),'elbow',W(f,pose).round(3),'shoulder',W(a,pose).round(3))
C=d['VC']; dark=(V[:,1]<0.06)&(C.sum(1)<150)
for side,sg in [('Left',1),('Right',-1)]:
    m=dark&(np.sign(V[:,0])==sg); tx=np.median(V[m,0]); print(side,'shoe x',round(tx,3),m.sum())
    u=f'mixamorig{side}UpLeg'
    def lo(p):
        pose[u]=(0,0,p[0]); e=W(f'mixamorig{side}Foot',pose)[0]-(tx-sg*0.0); return e*e
    r_=minimize(lo,[sg*0.05],method='Nelder-Mead'); pose[u]=(0,0,-sg*0.062); print(u,r_.x, W(f'mixamorig{side}Foot',pose).round(3))
joints=[S.idx[san(j['nodes'][i]['name'])] for i in j['skins'][0]['joints']]
names=[san(S.nodes[i]['name']) for i in joints]
PW=np.array([S.world(i,pose) for i in joints])
json.dump({'pose':pose,'nodes':S.nodes,'joints':joints,'names':names,'shift':0},open('/home/ubuntu/tripo/fit.json','w'))
np.savez('/home/ubuntu/tripo/fitted.npz',V=V,F=d['F'],UV=d['UV'],VC=d['VC'],PW=PW)
# overlay
from PIL import Image, ImageDraw
from raster import raster
N=700; out=Image.new('RGB',(N*2,N),(200,200,200))
for k,(ux,uz) in enumerate([(np.array([1,0,0]),np.array([0,0,1])),(np.array([0,0,-1]),np.array([1,0,0]))]):
    s=N/1.9; cx=N/2
    xy=np.stack([cx+(V@ux)*s,N-20-V[:,1]*s],-1); zb,fid,bar=raster(xy[d['F']],(V@uz)[d['F']],N)
    img=np.full((N,N,3),200.); m=fid>=0; img[m]=(d['VC'][d['F'][fid[m]]]*bar[m][...,None]).sum(1)*0.5+60
    im=Image.fromarray(img.clip(0,255).astype(np.uint8)); dr=ImageDraw.Draw(im)
    P=PW[:,:3,3]; pj=np.stack([cx+(P@ux)*s,N-20-P[:,1]*s],-1)
    for a_,i in enumerate(joints):
        if S.par.get(i) in joints:
            p=joints.index(S.par[i]); dr.line([tuple(pj[p]),tuple(pj[a_])],fill=(255,60,60),width=3)
        dr.ellipse([pj[a_][0]-4,pj[a_][1]-4,pj[a_][0]+4,pj[a_][1]+4],fill=(255,255,0))
    out.paste(im,(k*N,0))
out.save('/home/ubuntu/tripo/fit.png')
