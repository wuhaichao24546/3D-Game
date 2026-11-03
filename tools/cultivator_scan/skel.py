import json,struct,numpy as np
from scipy.spatial.transform import Rotation as R
def readglb(p):
    b=open(p,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+L])
    bin_=b[20+L+8:]; return j,bin_
def acc(j,bin_,i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
    dt={5126:np.float32,5123:np.uint16,5125:np.uint32,5121:np.uint8}[a['componentType']]
    n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    off=bv.get('byteOffset',0)+a.get('byteOffset',0)
    return np.frombuffer(bin_,dt,a['count']*n,off).reshape(a['count'],n) if n>1 else np.frombuffer(bin_,dt,a['count'],off)
def san(n): return n.replace(':','')
def armEuler(name,x,y,z):
    if name=='mixamorigLeftArm': return (-z,y,x)
    if name=='mixamorigRightArm': return (z,y,-x)
    if name in('mixamorigLeftForeArm','mixamorigRightForeArm'): return (x,0,z-y)
    import re
    if re.match(r'^mixamorig(Left|Right)(UpLeg|Leg)$',name): return (-x,y,z)
    return (x,y,z)
class Skel:
    def __init__(s,j):
        s.nodes=[dict(n) for n in j['nodes']]; s.par={}
        for i,n in enumerate(s.nodes):
            for c in n.get('children',[]): s.par[c]=i
        s.idx={san(n.get('name','')):i for i,n in enumerate(s.nodes)}
    def local(s,i,pose=None):
        n=s.nodes[i]; m=np.eye(4)
        q=n.get('rotation',[0,0,0,1]); r=R.from_quat(q)
        if pose and san(n.get('name','')) in pose:
            nm=san(n['name']); r=r*R.from_euler('XYZ',armEuler(nm,*pose[nm]))
        m[:3,:3]=r.as_matrix()*np.array(n.get('scale',[1,1,1]))
        m[:3,3]=n.get('translation',[0,0,0]); return m
    def world(s,i,pose=None):
        m=s.local(i,pose)
        while i in s.par: i=s.par[i]; m=s.local(i,pose)@m
        return m
