# runs inside build.py after scaling; units cm, +y up, +z front, +x = character left
bodyT=np.array([[c[0] for c in t] for t in tri(body)])
VN=np.zeros_like(V);fn=np.cross(V[bodyT[:,1]]-V[bodyT[:,0]],V[bodyT[:,2]]-V[bodyT[:,0]])
for k in range(3): np.add.at(VN,bodyT[:,k],fn)
VN/=np.linalg.norm(VN,axis=1,keepdims=True)+1e-12
def ws(*ns): return Wm[:,[bi[n] for n in ns]].sum(1)
Hw=ws('Head');Nw=ws('Neck');HandW=ws('LeftHand','RightHand');FootW=ws('LeftFoot','RightFoot','LeftToeBase','RightToeBase')
ArmW=ws('LeftArm','RightArm','LeftForeArm','RightForeArm')
eyeL=jp('eye.L____head');eyeR=jp('eye.R____head');eyeC=(eyeL+eyeR)/2
def srgb2lin(c): c=np.asarray(c,float); return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
# ---- skin vertex colours: base tone, brows, lips, slight warmth on ears/nose/hands
col=np.tile(srgb2lin([0.86,0.70,0.58]),(NV,1))
for E in (eyeL,eyeR):
    d=V-E;ax=np.abs(d[:,0])
    arc=1.9+0.12*ax-0.05*np.sign(d[:,0]*np.sign(E[0]))*ax
    m=(np.abs(d[:,1]-arc)<0.55)&(ax<2.7)&(d[:,2]>-1.6)&(VN[:,2]>0.1)
    col[m]=col[m]*0.12+srgb2lin([0.06,0.045,0.035])*0.88
fz=(np.abs(V[:,0]-eyeC[0])<3)&(np.abs(V[:,1]-(eyeC[1]-7.0))<1.5)&(Hw>0.5)
My=eyeC[1]-7.0;Mz=V[fz,2].max() if fz.any() else eyeC[2]
lip=((V[:,0]/2.3)**2+((V[:,1]-My)/0.85)**2<1)&(V[:,2]>Mz-1.6)&(Hw>0.5)
col[lip]=col[lip]*0.6+srgb2lin([0.62,0.36,0.33])*0.4
legW=ws('LeftUpLeg','RightUpLeg','LeftLeg','RightLeg');col[(legW>0.35)&(ws('LeftFoot','RightFoot')<0.5)]=srgb2lin([0.05,0.06,0.11])
col[HandW>0.5]*=srgb2lin([0.98,0.93,0.9])/srgb2lin([1,1,1])
E=np.concatenate([bodyT[:,[0,1]],bodyT[:,[1,2]],bodyT[:,[2,0]]]);E=np.concatenate([E,E[:,::-1]])
def offset_faces(mask,off,smooth=0):
    Vx=V+VN*off[:,None]
    for it in range(smooth):
        acc=np.zeros_like(Vx);cnt=np.zeros(NV);np.add.at(acc,E[:,0],Vx[E[:,1]]);np.add.at(cnt,E[:,0],1)
        avg=acc/np.maximum(cnt,1)[:,None];Vx[mask]=Vx[mask]*0.4+avg[mask]*0.6
        dd=((Vx-V)*VN).sum(1);push=np.maximum(0,off*0.85-dd);Vx+=VN*push[:,None]
    return [f for f in body if all(mask[i] for i,_ in f)],Vx
prims=[addprim(prim(body,col=col),0)]
for grp,E0 in (('helper-l-eye',eyeL),('helper-r-eye',eyeR)):
    ev=np.array(sorted({i for f in F[grp] for i,_ in f}));ec=V[ev].mean(0);er=np.linalg.norm(V[ev]-ec,axis=1).mean()
    ep=[];ecol=[];NL,NA=22,28;rings=np.concatenate([np.linspace(0,0.42,10),np.linspace(0.46,np.pi,12)])
    for a in rings:
        for k in range(NA):
            b=k/NA*2*np.pi;ep.append(ec+er*np.array([np.sin(a)*np.cos(b),np.sin(a)*np.sin(b),np.cos(a)]))
            if a<0.17: c=[0.01,0.008,0.006]
            elif a<0.42: c=srgb2lin([0.78,0.56,0.16]) if a>0.22 else srgb2lin([0.55,0.36,0.08])
            else: c=[1,0,0] if __import__('os').environ.get('EYEDBG') else srgb2lin([0.86,0.84,0.8])
            ecol.append(c)
    ep=np.array(ep);I=[]
    for r in range(len(rings)-1):
        for k in range(NA):
            a0=r*NA+k;a1=r*NA+(k+1)%NA;I+=[[a0,a0+NA,a1],[a1,a0+NA,a1+NA]]
    I=np.array(I,dtype=np.uint32);n=(ep-ec)/er;w=np.zeros((len(ep),len(names)));w[:,bi['Head']]=1
    pr=pack(ep,n,np.zeros((len(ep),2)),w,I,np.array(ecol));prims.append(addprim(pr,1))
# ---- hair cap: smooth parametric shell projected on the skull
hp=V[(Hw>0.5)];hc=hp[hp[:,1]>eyeC[1]-3].mean(0);hc[0]=0;rel=hp-hc;rl=np.linalg.norm(rel,axis=1)
def dirv(th,ph): return np.array([np.cos(ph)*np.sin(th),np.sin(ph),np.cos(ph)*np.cos(th)])
def rad(d):
    c=(rel@d)/rl;m=c>0.97
    return (rel[m]@d).max() if m.any() else (rel@d).max()
def ymin(th):
    a=abs(np.degrees(np.angle(np.exp(1j*th))))
    if a<30: return 4.8
    if a<75: return 4.8+(1.8-4.8)*(a-30)/45
    if a<118: return 2.2
    return 2.2+(-9.5-2.2)*min(1,(a-118)/40)
NT,NP=96,22;TH=[];PH=np.zeros((NT,NP));RR=np.zeros((NT,NP))
for i in range(NT):
    th=i/NT*2*np.pi;yt=eyeC[1]+ymin(th)
    phs=np.radians(np.linspace(-70,88,160));ph0=phs[-1]
    for ph in phs:
        d=dirv(th,ph)
        if hc[1]+d[1]*rad(d)>=yt: ph0=ph;break
    TH.append(ph0)
TH=np.array(TH)
for it in range(6): TH=(TH+np.roll(TH,1)+np.roll(TH,-1))/3
for i in range(NT):
    for j in range(NP):
        ph=TH[i]+(np.radians(88)-TH[i])*j/(NP-1);PH[i,j]=ph;RR[i,j]=rad(dirv(i/NT*2*np.pi,ph))
for it in range(5):
    Rp=np.pad(RR,((0,0),(1,1)),mode='edge');RR=(RR+np.roll(RR,1,0)+np.roll(RR,-1,0)+Rp[:,:-2]+Rp[:,2:])/5
pos=[];uv=[];wr=[]
for i in range(NT):
    for j in range(NP):
        d=dirv(i/NT*2*np.pi,PH[i,j]);off=0.3+0.35*j/(NP-1);p=hc+d*(RR[i,j]+off);pos.append(p);uv.append([i/NT*12,j/(NP-1)])
        w=np.zeros(len(names));k=np.clip((eyeC[1]-4-p[1])/6,0,0.6);w[bi['Head']]=1-k;w[bi['Neck']]=k;wr.append(w)
pos=np.array(pos);I=[]
for i in range(NT):
    for j in range(NP-1):
        a0=i*NP+j;a1=((i+1)%NT)*NP+j;I+=[[a0,a1,a0+1],[a1,a1+1,a0+1]]
I=np.array(I,dtype=np.uint32);n=finish(pos,None,None,I);n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-12
prims.append(addprim(pack(pos,n,np.array(uv),np.array(wr),I),2))
# ---- shoes
shoe=(FootW>0.35)|((V[:,1]<10)&(Hw<0.1))
fs,Vx=offset_faces(shoe,np.full(NV,0.45));prims.append(addprim(prim(fs,Vx),3))
# ---- upper robe (outer navy + white inner collar)
hipY=P['Hips'][1][1];waistY=hipY+7
s2=P['Spine2'][1];vy=s2[1]+2
torso=(Hw+Nw<0.3)&(HandW<0.25)&(V[:,1]>waistY-4)
front=(VN[:,2]>0.15)&(V[:,2]>s2[2]-2)
offO=1.3+1.6*ArmW+0.8*np.clip((V[:,1]-waistY)/20,0,1)*(1-ArmW)
fs,Vx=offset_faces(torso,offO,12);prims.append(addprim(prim(fs,Vx),4))
robeV=Vx;rmask=torso
nk=P['Neck'][1];nby=nk[1]-1.5
nsel=(np.abs(V[:,1]-nby)<1.0)&(Nw>0.4)
rn=np.hypot(V[nsel,0],V[nsel,2]-nk[2]).max()
def band(path,width,mat,lift=0.5):
    path=np.array(path,float);pts=[];nrm=[];wr=[]
    for i,(x,y) in enumerate(path):
        tg=path[min(i+1,len(path)-1)]-path[max(i-1,0)];tg/=np.linalg.norm(tg);pr=np.array([-tg[1],tg[0]])
        for sgn in (-1,1):
            q=np.array([x,y])+pr*width*0.5*sgn
            c=rmask&(np.hypot(robeV[:,0]-q[0],robeV[:,1]-q[1])<2.4)&(VN[:,2]>0)
            j=np.where(c)[0]
            if len(j)==0:
                cand=np.where(rmask&(VN[:,2]>0))[0];dd=np.hypot(robeV[cand,0]-q[0],robeV[cand,1]-q[1]);j=cand[np.argsort(dd)[:6]]
            j=j[np.argmax(robeV[j,2])]
            pts.append([q[0],q[1],robeV[j,2]+lift]);nrm.append(VN[j]);wr.append(Wm[j])
    n=len(path);I=[]
    for i in range(n-1):
        a0=2*i;I+=[[a0,a0+1,a0+2],[a0+1,a0+3,a0+2]]
    uvb=np.array([[i%2,k/n*4] for k in range(n) for i in range(2)])
    prims.append(addprim(pack(np.array(pts),np.array(nrm),uvb,np.array(wr),np.array(I,dtype=np.uint32)),mat))
L1=np.linspace([rn*0.95,nby-0.5],[-11,s2[1]-9],22);L2=np.linspace([-rn*0.95,nby-0.5],[-1,nby-12],10)
band(L2,3.6,5,0.3);band(L1,4.2,5,0.9);band(L1+[0,-2.6],1.2,4,1.0)
# ---- skirt: tube from waist to ankle, outside the body per angle
Mseg,Nr=56,30;yTop=waistY;yHem=4.0
legish=(ArmW+HandW<0.2)&(Hw<0.1)
cz=V[legish&(np.abs(V[:,1]-hipY)<4),2].mean()
ang=np.linspace(0,2*np.pi,Mseg,endpoint=False)
FL=[]
for r in range(Nr+1):
    t=r/Nr;y=yTop+(yHem-yTop)*t;pts=V[legish&(np.abs(V[:,1]-y)<2.5)]
    fl=np.array([13+11*t**0.9,11+8*t**0.9])
    if len(pts) and t<0.8: fl=fl*max(1,np.sqrt((pts[:,0]/fl[0])**2+((pts[:,2]-cz)/fl[1])**2).max()*1.08)
    FL.append(fl)
FL=np.maximum.accumulate(np.array(FL),axis=0)
for it in range(4): FL[1:-1]=np.maximum(FL[1:-1],(FL[:-2]+FL[1:-1]+FL[2:])/3)
pos=[];uv=[];wr=[]
for r in range(Nr+1):
    t=r/Nr;y=yTop+(yHem-yTop)*t
    sel=legish&(np.abs(V[:,1]-y)<2.5);pts=V[sel]
    a=np.arctan2(pts[:,0],pts[:,2]-cz);rad=np.hypot(pts[:,0],pts[:,2]-cz)
    flare=FL[r]
    for k,th in enumerate(ang):
        env=1/np.sqrt((np.sin(th)/flare[0])**2+(np.cos(th)/flare[1])**2)
        R=env*(1+t*(0.035*np.sin(9*th+1.3)+0.02*np.sin(17*th+0.4)))
        x=np.sin(th)*R;z=cz+np.cos(th)*R
        pos.append([x,y,z]);uv.append([k/Mseg*4,t*3])
        w=np.zeros(len(names));kk=0.8*np.clip(t*1.5,0,1)
        sl=np.clip(0.5+x/(R*0.9),0,1)
        w[bi['Hips']]=1-kk;w[bi['LeftUpLeg']]=kk*sl;w[bi['RightUpLeg']]=kk*(1-sl)
        wr.append(w)
pos=np.array(pos);uv=np.array(uv);wr=np.array(wr);I=[]
for r in range(Nr):
    for k in range(Mseg):
        a0=r*Mseg+k;a1=r*Mseg+(k+1)%Mseg;b0=a0+Mseg;b1=a1+Mseg
        I+=[[a0,b0,a1],[a1,b0,b1]]
I=np.array(I,dtype=np.uint32);n=finish(pos,uv,None,I);n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-12
prims.append(addprim(pack(pos,n,uv,wr,I),4))
# ---- sash (wide belt) around waist
ring0=pos[:Mseg];pos2=[];uv2=[];wr2=[]
for r,(dy,grow) in enumerate([(-2,1.6),(2,1.4),(6,1.5),(10,1.8)]):
    for k in range(Mseg):
        p0=ring0[k].copy();c=np.array([0,p0[1],cz]);dv=p0-c;dv[1]=0;dv/=np.linalg.norm(dv)+1e-9
        pos2.append(p0+dv*grow+[0,dy,0]);uv2.append([k/Mseg*6,r/3]);w=np.zeros(len(names));w[bi['Hips']]=0.6;w[bi['Spine']]=0.4;wr2.append(w)
pos2=np.array(pos2);I2=[]
for r in range(3):
    for k in range(Mseg):
        a0=r*Mseg+k;a1=r*Mseg+(k+1)%Mseg;I2+=[[a0,a0+Mseg,a1],[a1,a0+Mseg,a1+Mseg]]
I2=np.array(I2,dtype=np.uint32);n2=finish(pos2,None,None,I2);n2/=np.linalg.norm(n2,axis=1,keepdims=True)+1e-12
prims.append(addprim(pack(pos2,n2,np.array(uv2),np.array(wr2),I2),6))
MATS=[('Skin',[1,1,1],0.55,False),('Eye',[0.9,0.9,0.88],0.2,False),('Hair',[0.02,0.018,0.016],0.45,False),('Shoe',[0.03,0.03,0.035],0.8,False),
      ('Robe',[0.05,0.07,0.16],1.0,True),('RobeInner',[0.85,0.85,0.82],0.9,True),('Sash',[0.03,0.04,0.1],0.9,True)]
