import bpy, numpy as np, sys
a=sys.argv[sys.argv.index('--')+1:]
d=np.load(a[0]); V=d['V']; F=d['F']; H=d['heads']; T=d['tails']; names=[str(x) for x in d['names']]
bpy.ops.wm.read_factory_settings(use_empty=True)
me=bpy.data.meshes.new('m'); me.from_pydata(V.tolist(),[],F.tolist()); me.update()
ob=bpy.data.objects.new('m',me); bpy.context.scene.collection.objects.link(ob)
arm=bpy.data.armatures.new('a'); ao=bpy.data.objects.new('a',arm); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active=ao; bpy.ops.object.mode_set(mode='EDIT')
for n,h,t in zip(names,H,T):
    b=arm.edit_bones.new(n); b.head=tuple(h); b.tail=tuple(t)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active=ao
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
W=np.zeros((len(V),len(names)),np.float32); gi={g.index:names.index(g.name) for g in ob.vertex_groups}
for v in me.vertices:
    for g in v.groups: W[v.index,gi[g.group]]=g.weight
print('ZERO-WEIGHT VERTS',int((W.sum(1)==0).sum()),'of',len(V))
np.save(a[1],W)
