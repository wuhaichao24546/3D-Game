import json, struct, numpy as np, sys
from scipy.spatial.transform import Rotation as Rot
W='/home/ubuntu/mhwork/'
TSCALE=float(sys.argv[1]) if len(sys.argv)>1 else 1e-3
OUT=sys.argv[2] if len(sys.argv)>2 else '/home/ubuntu/repos/3D-Game/public/models/Cultivator.glb'
# ---- OBJ ----
V=[];VT=[];F={}
g=None
for line in open(W+'base.obj'):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '): g=line.split()[1]
    elif line.startswith('f '):
        F.setdefault(g,[]).append([tuple(int(i)-1 for i in p.split('/')[:2]) for p in line.split()[1:]])
V=np.array(V);VT=np.array(VT)
z=np.load('/tmp/mhdl/mh/makehuman/data/targets.npz',allow_pickle=True)
def tgt(name,w):
    idx=z[f'targets/{name}.index'];vec=z[f'targets/{name}.vector'].astype(np.float64)*TSCALE
    V[idx]+=vec*w
print('bbox before',V.min(0).round(2),V.max(0).round(2))
tgt('macrodetails/asian-male-young',1.0)
tgt('macrodetails/universal-male-young-averagemuscle-minweight',0.35) if 'targets/macrodetails/universal-male-young-averagemuscle-minweight.index' in z else None
print('bbox after',V.min(0).round(2),V.max(0).round(2))
sk=json.load(open(W+'default.mhskel'));J=sk['joints']
def jp(n): return V[J[n]].mean(0)
# ---- mixamo rig definition: name -> (parent, position)
L={'L':'Left','R':'Right'}
P={'Hips':(None,jp('root____head')),'Spine':('Hips',jp('spine04____head')),'Spine1':('Spine',jp('spine02____head')),
   'Spine2':('Spine1',jp('spine01____head')),'Neck':('Spine2',jp('neck01____head')),'Head':('Neck',jp('head____head')),'HeadTop_End':('Head',jp('head____tail'))}
for s,S in L.items():
    P[S+'Shoulder']=('Spine2',jp(f'clavicle.{s}____head'));P[S+'Arm']=(S+'Shoulder',jp(f'upperarm01.{s}____head'))
    P[S+'ForeArm']=(S+'Arm',jp(f'lowerarm01.{s}____head'));P[S+'Hand']=(S+'ForeArm',jp(f'wrist.{s}____head'))
    P[S+'HandEnd']=(S+'Hand',jp(f'finger3-3.{s}____tail'))
    P[S+'UpLeg']=('Hips',jp(f'upperleg01.{s}____head'));P[S+'Leg']=(S+'UpLeg',jp(f'lowerleg01.{s}____head'))
    P[S+'Foot']=(S+'Leg',jp(f'foot.{s}____head'));P[S+'ToeBase']=(S+'Foot',jp(f'toe3-1.{s}____head'));P[S+'Toe_End']=(S+'ToeBase',jp(f'toe3-3.{s}____tail'))
P={k:(p,np.array(x,dtype=np.float64)) for k,(p,x) in P.items()}
def mmap(b):
    side=None
    if b.endswith('.L') or b.endswith('.R'): side=L[b[-1]]; b0=b[:-2]
    else: b0=b
    if b0 in ('root',) or b0=='pelvis' or b0=='spine05': return 'Hips'
    if b0 in ('spine04','spine03'): return 'Spine'
    if b0=='spine02': return 'Spine1'
    if b0 in ('spine01','breast'): return 'Spine2'
    if b0.startswith('neck'): return 'Neck'
    if b0=='clavicle': return side+'Shoulder'
    if b0 in ('shoulder01','upperarm01','upperarm02'): return side+'Arm'
    if b0.startswith('lowerarm'): return side+'ForeArm'
    if b0=='wrist' or b0.startswith('metacarpal') or b0.startswith('finger'): return side+'Hand'
    if b0.startswith('upperleg'): return side+'UpLeg'
    if b0.startswith('lowerleg'): return side+'Leg'
    if b0=='foot': return side+'Foot'
    if b0.startswith('toe'): return side+'ToeBase'
    return 'Head'
names=list(P.keys());bi={n:i for i,n in enumerate(names)}
NV=len(V);Wm=np.zeros((NV,len(names)))
for b,lst in json.load(open(W+'default_weights.mhw'))['weights'].items():
    k=bi[mmap(b)]
    for vi,w in lst: Wm[vi,k]+=w
s=Wm.sum(1);Wm[s>0]/=s[s>0,None];Wm[s==0,bi['Hips']]=1
# ---- A-pose -> T-pose (left = +x)
def rot_to(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);c=np.cross(a,b);d=np.dot(a,b)
    if np.linalg.norm(c)<1e-9: return np.eye(3)
    return Rot.from_rotvec(c/np.linalg.norm(c)*np.arccos(np.clip(d,-1,1))).as_matrix()
def desc(n):
    out=[n];ch=True
    while ch:
        ch=False
        for k in names:
            if k not in out and P[k][0] in out: out.append(k);ch=True
    return out
for S,sx in (('Left',1),('Right',-1)):
    for bone,child in ((S+'Arm',S+'ForeArm'),(S+'ForeArm',S+'Hand')):
        o=P[bone][1].copy();R=rot_to(P[child][1]-o,np.array([sx,0,0.0]))
        ds=desc(bone);w=Wm[:,[bi[d] for d in ds]].sum(1)
        newV=(V-o)@R.T+o;V=V+(newV-V)*w[:,None]
        for d in ds:
            if d!=bone: P[d]=(P[d][0],(P[d][1]-o)@R.T+o)
# ---- units: dm -> cm, height 178, feet at 0
body=[f for f in F['body']]
usedv=sorted({i for f in body for i,_ in f})
ymin=V[usedv,1].min();ymax=V[usedv,1].max();sc=178.0/(ymax-ymin)
V=(V-[0,ymin,0])*sc
P={k:(p,(x-[0,ymin,0])*sc) for k,(p,x) in P.items()}
print('scale',sc,'height cm',(ymax-ymin)*sc)
# ---- bone orientations copied from Michelle (world rest rotations)
mj=open('/home/ubuntu/repos/3D-Game/public/models/Michelle.glb','rb').read();ml=struct.unpack('<I',mj[12:16])[0];mj=json.loads(mj[20:20+ml])
mn=mj['nodes'];par={}
for i,n in enumerate(mn):
    for c in n.get('children',[]): par[c]=i
def wq(i):
    q=Rot.from_quat(mn[i].get('rotation',[0,0,0,1]))
    return wq(par[i])*q if i in par else q
mw={n['name'].replace('mixamorig:',''):wq(i) for i,n in enumerate(mn) if n.get('name','').startswith('mixamorig:')}
root=mw['Hips']  # express relative to Hips' parent frame chain -> make Hips world identity-based
Q={k:(root.inv()*mw[k] if k in mw else None) for k in names}
for k in names:
    if Q[k] is None: Q[k]=Q[P[k][0]]
# ---- write GLB
def tri(faces):
    out=[]
    for f in faces:
        for i in range(1,len(f)-1): out.append((f[0],f[i],f[i+1]))
    return out
def finish(p,u,vid_w,I,col=None):
    n=np.zeros_like(p);fn=np.cross(p[I[:,1]]-p[I[:,0]],p[I[:,2]]-p[I[:,0]])
    for k in range(3): np.add.at(n,I[:,k],fn)
    return n
def prim(faces,Vx=None,col=None):
    Vs=V if Vx is None else Vx
    t=tri(faces);key={};uv=[];vid=[];idx=[]
    for tr in t:
        for c in tr:
            if c not in key: key[c]=len(vid);vid.append(c[0]);uv.append(VT[c[1]])
            idx.append(key[c])
    vid=np.array(vid);p=Vs[vid].astype(np.float32);u=np.array(uv,dtype=np.float32);u[:,1]=1-u[:,1]
    I=np.array(idx,dtype=np.uint32).reshape(-1,3)
    n=finish(p,u,None,I)
    acc=np.zeros((NV,3));np.add.at(acc,vid,n);n=acc[vid];n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-12
    return pack(p,n,u,Wm[vid],I,None if col is None else col[vid])
def pack(p,n,u,w,I,col=None):
    top=np.argsort(-w,1)[:,:4];tw=np.take_along_axis(w,top,1);tw/=tw.sum(1,keepdims=True)
    d=dict(p=p.astype(np.float32),n=n.astype(np.float32),u=u.astype(np.float32),j=top.astype(np.uint16),w=tw.astype(np.float32),i=I.flatten().astype(np.uint32))
    if col is not None: d['c']=col.astype(np.float32)
    return d
bin_=bytearray();views=[];accs=[]
def add(arr,typ,comp,target=None,mm=False):
    while len(bin_)%4: bin_.append(0)
    off=len(bin_);b=arr.tobytes();bin_.extend(b)
    views.append(dict(buffer=0,byteOffset=off,byteLength=len(b),**({'target':target} if target else {})))
    a=dict(bufferView=len(views)-1,componentType=comp,count=len(arr),type=typ)
    if mm: a['min']=arr.min(0).tolist();a['max']=arr.max(0).tolist()
    accs.append(a);return len(accs)-1
def addprim(pr,mat):
    return dict(attributes=dict(POSITION=add(pr['p'],'VEC3',5126,34962,True),NORMAL=add(pr['n'],'VEC3',5126,34962),
        TEXCOORD_0=add(pr['u'],'VEC2',5126,34962),JOINTS_0=add(pr['j'],'VEC4',5123,34962),WEIGHTS_0=add(pr['w'],'VEC4',5126,34962),**({'COLOR_0':add(pr['c'],'VEC3',5126,34962)} if 'c' in pr else {})),
        **({} if 'c' not in pr else {}),indices=add(pr['i'],'SCALAR',5125,34963),material=mat)
exec(open(__file__.replace('build.py','extras.py')).read())
nodes=[{'name':'Character','scale':[0.01,0.01,0.01],'children':[1+len(names),1]}]
for k in names:
    p,x=P[k];Qp=Q[p] if p else Rot.identity();xp=P[p][1] if p else np.zeros(3)
    t=Qp.inv().apply(x-xp);r=(Qp.inv()*Q[k]).as_quat()
    nodes.append({'name':'mixamorig:'+k,'translation':t.tolist(),'rotation':r.tolist(),'children':[1+bi[c] for c in names if P[c][0]==k]})
nodes.append({'name':'CultivatorBody','mesh':0,'skin':0})
ibm=[]
for k in names:
    M=np.eye(4);M[:3,:3]=Q[k].as_matrix();M[:3,3]=P[k][1];ibm.append(np.linalg.inv(M).T.flatten())
ibmA=add(np.array(ibm,dtype=np.float32),'MAT4',5126)
gl=dict(asset=dict(version='2.0',generator='mh-cultivator build.py (MakeHuman CC0 base)'),scene=0,scenes=[dict(nodes=[0])],nodes=nodes,
    meshes=[dict(name='Cultivator',primitives=prims)],skins=[dict(joints=[1+i for i in range(len(names))],inverseBindMatrices=ibmA,skeleton=1)],
    materials=[dict(name=m,pbrMetallicRoughness=dict(baseColorFactor=c+[1],metallicFactor=0,roughnessFactor=r),doubleSided=ds) for m,c,r,ds in MATS],
    buffers=[dict(byteLength=len(bin_))],bufferViews=views,accessors=accs)
js=json.dumps(gl).encode();js+=b' '*((4-len(js)%4)%4)
while len(bin_)%4: bin_.append(0)
out=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bin_))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(bin_),0x004E4942)+bytes(bin_)
open(OUT,'wb').write(out);print('wrote',OUT,len(out),'verts',len(prims) and accs[prims[0]['attributes']['POSITION']]['count'])
