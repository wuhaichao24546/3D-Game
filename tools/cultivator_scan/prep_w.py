import numpy as np, json
f=json.load(open('fit.json')); d=np.load('fitted.npz'); b=np.load('baked.npz')
vm=b['vm']; V=d['V']; F=d['F']; n=vm.max()+1
Vw=np.zeros((n,3)); Vw[vm]=V; Fw=vm[F]
names=f['names']; PW=d['PW']; P=PW[:,:3,3]
main={'mixamorigHips':'mixamorigSpine','mixamorigSpine2':'mixamorigNeck'}
nodes=f['nodes']; idx=f['joints']
H=[];T=[];BN=[]
for k,nm in enumerate(names):
    ch=[c for c in nodes[idx[k]].get('children',[]) if c in idx]
    if not ch: continue
    c=names.index(main[nm]) if nm in main else idx.index(ch[0])
    H.append(P[k]); T.append(P[c]); BN.append(nm)
print(BN)
np.savez('wl_in.npz',V=Vw,F=Fw,heads=np.array(H),tails=np.array(T),names=np.array(BN))
