import numpy as np, json, struct, io, sys
from PIL import Image
f=json.load(open('fit.json')); d=np.load('fitted.npz'); b=np.load('baked.npz')
V=d['V']*100; N=b['N']; UV=d['UV'].copy(); F=d['F']; PW=d['PW']; W4=np.load('W4.npy')
UV[:,1]=1-UV[:,1]
o=np.argsort(-W4,1)[:,:4]; J=o.astype(np.uint8); WW=np.take_along_axis(W4,o,1).astype(np.float32); WW/=WW.sum(1,keepdims=True)
D=np.diag([0.01,0.01,0.01,1]); IBM=np.array([np.linalg.inv(p)@D for p in PW])
buf=io.BytesIO(); views=[]; accs=[]
def add(arr,comp,typ,target=None,mm=False):
    arr=np.ascontiguousarray(arr); off=buf.tell(); buf.write(arr.tobytes())
    while buf.tell()%4: buf.write(b'\0')
    v={'buffer':0,'byteOffset':off,'byteLength':arr.nbytes}
    if target: v['target']=target
    views.append(v); a={'bufferView':len(views)-1,'componentType':comp,'count':len(arr),'type':typ}
    if mm: a['min']=arr.min(0).tolist(); a['max']=arr.max(0).tolist()
    accs.append(a); return len(accs)-1
pos=add(V.astype(np.float32),5126,'VEC3',34962,True); nor=add(N.astype(np.float32),5126,'VEC3',34962)
uv=add(UV.astype(np.float32),5126,'VEC2',34962); jo=add(J,5121,'VEC4',34962); we=add(WW,5126,'VEC4',34962)
ind=add(F.astype(np.uint16).reshape(-1),5123,'SCALAR',34963)
ibm=add(IBM.transpose(0,2,1).reshape(-1,16).astype(np.float32),5126,'MAT4')
jb=io.BytesIO(); Image.open('tex.png').convert('RGB').save(jb,'JPEG',quality=88); jb=jb.getvalue()
off=buf.tell(); buf.write(jb)
while buf.tell()%4: buf.write(b'\0')
views.append({'buffer':0,'byteOffset':off,'byteLength':len(jb)})
nodes=f['nodes']
for n in nodes:
    if 'mesh' in n: n['name']='CultivatorScan'
gl={'asset':{'version':'2.0','generator':'3D-Game tools/cultivator_scan'},'scene':0,'scenes':[{'nodes':[i for i,n in enumerate(nodes) if n.get('name')=='Character']}],
 'nodes':nodes,'meshes':[{'name':'CultivatorScan','primitives':[{'attributes':{'POSITION':pos,'NORMAL':nor,'TEXCOORD_0':uv,'JOINTS_0':jo,'WEIGHTS_0':we},'indices':ind,'material':0}]}],
 'skins':[{'joints':f['joints'],'inverseBindMatrices':ibm}],
 'materials':[{'name':'Scan','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':0.85},'doubleSided':True}],
 'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],
 'images':[{'bufferView':len(views)-1,'mimeType':'image/jpeg'}],
 'buffers':[{'byteLength':buf.tell()}],'bufferViews':views,'accessors':accs}
js=json.dumps(gl,separators=(',',':')).encode()
while len(js)%4: js+=b' '
bin_=buf.getvalue()
out=sys.argv[1]
with open(out,'wb') as fo:
    fo.write(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bin_)))
    fo.write(struct.pack('<II',len(js),0x4E4F534A)); fo.write(js)
    fo.write(struct.pack('<II',len(bin_),0x004E4942)); fo.write(bin_)
print('wrote',out,12+16+len(js)+len(bin_),'bytes; tex',len(jb))
