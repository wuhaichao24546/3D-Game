import numpy as np, json, sys, copy
sys.path.insert(0,'/home/ubuntu/tripo'); from skel import Skel, san
from raster import raster
from PIL import Image
f=json.load(open('fit.json')); d=np.load('fitted.npz'); b=np.load('baked.npz'); vm=b['vm']
names=f['names']; PW=d['PW']; V=d['V']; F=d['F']; VC=d['VC']
wl=np.load('wl_out.npy'); wn=list(np.load('wl_in.npz')['names'])
W=np.zeros((len(V),len(names)),np.float32)
for k,n in enumerate(wn): W[:,names.index(str(n))]=wl[vm,k]
# top-4 + normalise
o=np.argsort(-W,1); W4=np.zeros_like(W); r=np.arange(len(W))[:,None]; W4[r,o[:,:4]]=W[r,o[:,:4]]; W4/=W4.sum(1,keepdims=True)
np.save('W4.npy',W4)
A=1.50; FB=0.24; LS=0.062
def S_(hipdy=0):
    s=Skel({'nodes':copy.deepcopy(f['nodes'])}); 
    if hipdy: h=s.idx['mixamorigHips']; t=s.nodes[h]['translation']; s.nodes[h]['translation']=[t[0],t[1]+hipdy,t[2]]
    return s
def posed(pose,hipdy=0):
    s=S_(hipdy); M=np.array([s.world(i,pose)@np.linalg.inv(PW[k]) for k,i in enumerate(f['joints'])])
    Vh=np.c_[V,np.ones(len(V))]; out=np.einsum('vj,jab,vb->va',W4,M,Vh)[:,:3]; return out
poses={
 'bind':(f['pose'],0),
 'idle':({'mixamorigLeftArm':(0,0,-A),'mixamorigRightArm':(0,0,A),'mixamorigLeftForeArm':(0,-FB,0),'mixamorigRightForeArm':(0,FB,0),'mixamorigLeftUpLeg':(0,0,-LS),'mixamorigRightUpLeg':(0,0,LS),'mixamorigLeftLeg':(0.06,0,0),'mixamorigRightLeg':(0.06,0,0)},0),
 'walk':({'mixamorigLeftUpLeg':(0.7,0,-LS),'mixamorigRightUpLeg':(-0.7,0,LS),'mixamorigLeftLeg':(0.1,0,0),'mixamorigRightLeg':(0.98+0.1,0,0),'mixamorigLeftArm':(-0.38,0,-A+0.2),'mixamorigRightArm':(0.38,0,A-0.2),'mixamorigLeftForeArm':(0,-FB,0),'mixamorigRightForeArm':(0,FB,0)},0),
 'meditate':({'mixamorigLeftUpLeg':(-1.35,0.35,0.15),'mixamorigRightUpLeg':(-1.35,-0.35,-0.15),'mixamorigLeftLeg':(2.2,0,0),'mixamorigRightLeg':(2.2,0,0),'mixamorigLeftArm':(0.4,0,-0.9),'mixamorigRightArm':(0.4,0,0.9),'mixamorigLeftForeArm':(0,-1.1,0),'mixamorigRightForeArm':(0,1.1,0)},-55),
 'fly':({'mixamorigLeftArm':(-0.9,0,-0.35),'mixamorigRightArm':(-0.9,0,0.35),'mixamorigLeftUpLeg':(0.15,0,0.1),'mixamorigRightUpLeg':(-0.1,0,-0.1),'mixamorigLeftForeArm':(0,-FB,0),'mixamorigRightForeArm':(0,FB,0)},0),
}
sel=sys.argv[1:] or list(poses)
N=360; out=Image.new('RGB',(N*3,N*len(sel)),(200,200,200))
for row,nm in enumerate(sel):
    P=posed(*poses[nm]); print(nm,'max disp from bind',np.abs(P-V).max().round(3) if nm=='bind' else '')
    for k,yaw in enumerate([0.5,np.pi/2,np.pi]):
        c,sn=np.cos(yaw),np.sin(yaw); Rm=np.array([[c,0,sn],[0,1,0],[-sn,0,c]]); Q=P@Rm.T
        s=N/1.95; xy=np.stack([N/2+Q[:,0]*s,N-8-Q[:,1]*s],-1)
        zb,fid,bar=raster(xy[F],Q[F][...,2],N)
        T=Q[F]; n=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-12
        L=np.array([0.3,0.4,0.85]); L/=np.linalg.norm(L); sh=np.abs(n@L)*0.7+0.4
        img=np.full((N,N,3),200.); m=fid>=0
        img[m]=(VC[F[fid[m]]]*bar[m][...,None]).sum(1)*sh[fid[m]][:,None]
        out.paste(Image.fromarray(img.clip(0,255).astype(np.uint8)),(k*N,row*N))
out.save('sim.png')
