# CultivatorScan.glb 生成流程（三视图 → 贴图 + Mixamo 骨架）

工作目录默认 `/home/ubuntu/tripo/`（脚本里写死，换机器请改路径）。

1. 白模：Hugging Face Space `tencent/Hunyuan3D-2mv`，`/shape_generation`，输入三视图的正/背/左视图（rembg 抠图），
   steps=5、octree_resolution=256、seed=1234。输出 GLB 有大量退化/重复三角形，先删除，再取最大连通体，
   用 `fast_simplification` 简化到约 4 万面，存为 `work.ply`。
2. `bake.py 2048`：xatlas 展 UV；把三视图（正/背/左/镜像右）按轮廓 IoU 对齐后正交投影，按法线朝向 + 深度可见性加权混合，
   去掉下摆的雾化背景，看不到的地方用 3D 最近邻补色 → `tex.png`、`baked.npz`。
3. `fit.py`：复制 `public/models/Cultivator.glb` 的 Mixamo 骨架（T-pose 静止姿态不变，player.js 动作代码直接复用），
   拟合手臂长度和下垂/屈肘角度、腿开合到模型上，得到绑定姿态 → `fit.json`、`fitted.npz`。
4. `prep_w.py` + `blender -b --python weights_bl.py -- wl_in.npz wl_out.npy`：Blender 3.6 热扩散自动权重。
5. `sim.py`：CPU 蒙皮预览 bind/idle/walk/meditate/fly 姿态 → `sim.png`。
6. `build_glb.py public/models/CultivatorScan.glb`：写出带骨骼、权重和 JPEG 贴图的 GLB。

player.js 里 `rig` 参数（arm 1.5 / fore 0.24 / leg -0.062）需与 fit.py 的绑定姿态保持一致，否则站立时袖子会变形。
