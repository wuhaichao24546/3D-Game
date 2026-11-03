import numpy as np, trimesh, xatlas, sys
from PIL import Image
from scipy import ndimage
sys.path.insert(0,'/home/ubuntu/tripo'); from raster import raster
D='/home/ubuntu/tripo/'; TS=int(sys.argv[1]) if len(sys.argv)>1 else 2048
m=trimesh.load(D+'work.ply',process=False)
V=m.vertices.astype(np.float64); F=m.faces
vm,F2,UV=xatlas.parametrize(V.astype(np.float32),F.astype(np.uint32))
V2=V[vm]; N2=trimesh.Trimesh(V,F,process=False).vertex_normals[vm]
print('uv verts',len(V2),'faces',len(F2))
# ---- reference images (defog lower robe)
def load(n, flip=False):
    im=np.array(Image.open(D+n+'_rgba.png')).astype(np.float32)
    rgb,a=im[...,:3],im[...,3]/255
    H=rgb.shape[0]; ys=np.arange(H)[:,None]
    lum=rgb@[0.299,0.587,0.114]
    sel=(a>0.9)&(ys>600)&(ys<900)&(rgb[...,2]>rgb[...,0]+15)
    ref=np.median(rgb[sel],0); lref=ref@[0.299,0.587,0.114]; fog=np.array([212,212,218.]); lf=fog@[0.299,0.587,0.114]
    ramp=np.clip((ys-950)/250,0,1)
    al=np.clip((lum-lref)/(lf-lref),0,0.8)*ramp
    # only defog blue-ish/grey pixels (keep saturated gold embroidery, skin)
    sat=rgb.max(-1)-rgb.min(-1); al*=(sat<60)
    rec=np.clip((rgb-al[...,None]*fog)/(1-al[...,None]),0,255)
    if flip: rec=rec[:,::-1]; a=a[:,::-1]
    rows=np.where(a.max(1)>0.5)[0]; cols=np.where(a.max(0)>0.5)[0]
    return dict(rgb=rec,a=a,top=rows.min(),bot=rows.max(),H=H)
# view: (name, image, u-axis vector, depth axis vector toward camera, weight)
views=[('front',load('front'),np.array([1,0,0.]),np.array([0,0,1.]),1.0),
       ('back',load('back'),np.array([-1,0,0.]),np.array([0,0,-1.]),1.0),
       ('left',load('side'),np.array([0,0,-1.]),np.array([1,0,0.]),0.8),
       ('right',load('side',True),np.array([0,0,1.]),np.array([-1,0,0.]),0.55)]
ymin,ymax=V[:,1].min(),V[:,1].max()
Ft=V[F]
proj={}
for name,im,u,dv,wt in views:
    k=(im['bot']-im['top'])/(ymax-ymin)
    best=None
    pu=V@u
    for dx in range(-60,61,4):
        cx=im['H']/2+dx
        xy=np.stack([cx+(pu-pu.mean())*k, im['top']+(ymax-V[:,1])*k],-1)
        # silhouette IoU at quarter res via vertex splat of faces
        s=4; N=im['H']//s
        zb,_,_=raster(xy[F][:, :, :]/s, (V@dv)[F], N) if dx==-60 or best is None or True else None
        sil=zb>-1e8; am=im['a'][::s,::s]>0.5
        iou=(sil&am).sum()/(sil|am).sum()
        if best is None or iou>best[0]: best=(iou,dx)
        if dx==-60: pass
    iou,dx=best; print(name,'k',k,'dx',dx,'iou',round(iou,3))
    cx=im['H']/2+dx
    proj[name]=(k,cx,pu.mean())
    xy=np.stack([cx+(pu-pu.mean())*k, im['top']+(ymax-V[:,1])*k],-1)
    zb,_,_=raster(xy[F],(V@dv)[F],im['H'])
    im['zb']=zb; im['k']=k; im['cx']=cx; im['pm']=pu.mean()
# ---- UV raster
uvp=np.stack([UV[:,0]*TS,(1-UV[:,1])*TS],-1)
_,fid,bar=raster(uvp[F2],np.zeros((len(F2),3)),TS)
cov=fid>=0; f=fid[cov]; b=bar[cov]
P=(V2[F2[f]]*b[...,None]).sum(1); Nn=(N2[F2[f]]*b[...,None]).sum(1); Nn/=np.linalg.norm(Nn,axis=1,keepdims=True)+1e-9
acc=np.zeros((len(P),3)); wsum=np.zeros(len(P))
def bil(img,x,y):
    x=np.clip(x,0,img.shape[1]-1.001); y=np.clip(y,0,img.shape[0]-1.001); x0=x.astype(int); y0=y.astype(int); fx=(x-x0)[:,None] if img.ndim==3 else x-x0; fy=(y-y0)[:,None] if img.ndim==3 else y-y0
    return img[y0,x0]*(1-fx)*(1-fy)+img[y0,x0+1]*fx*(1-fy)+img[y0+1,x0]*(1-fx)*fy+img[y0+1,x0+1]*fx*fy
for name,im,u,dv,wt in views:
    px=im['cx']+(P@u-im['pm'])*im['k']; py=im['top']+(ymax-P[:,1])*im['k']
    zi=np.clip(py.astype(int),0,im['H']-1); xi=np.clip(px.astype(int),0,im['H']-1)
    zmax=ndimage.maximum_filter(im['zb'],3)[zi,xi]
    vis=(P@dv)>=zmax-0.012
    al=bil(im['a'],px,py)
    w=np.clip(Nn@dv,0,1)**4*vis*(al>0.5)*wt
    acc+=bil(im['rgb'],px,py)*w[:,None]; wsum+=w
    print(name,'covered',(w>0).mean().round(3))
col=np.zeros((TS,TS,3)); have=np.zeros((TS,TS),bool)
ok=wsum>1e-4
cc=np.zeros((len(P),3)); cc[ok]=acc[ok]/wsum[ok,None]
col[cov]=cc; have[cov]=ok
print('texels covered',cov.sum(),'colored',have.sum())
# fill unseen texels: nearest colored texel (in 3D would be better; texture-space nearest + dilation)
# 3D nearest for uncolored covered texels
from scipy.spatial import cKDTree
Pc=P[ok]; tr=cKDTree(Pc); _,ii=tr.query(P[~ok]); cc[~ok]=cc[ok][ii]; col[cov]=cc
idx=ndimage.distance_transform_edt(~cov,return_distances=False,return_indices=True)
col=col[idx[0],idx[1]]
Image.fromarray(col.clip(0,255).astype(np.uint8)).save(D+'tex.png')
# vertex colors for preview
vc=bil(col,uvp[:,0],uvp[:,1])
np.savez(D+'baked.npz',V=V2,N=N2,F=F2,UV=UV,VC=vc,vm=vm)
print('done')
