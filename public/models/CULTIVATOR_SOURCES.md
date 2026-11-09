# Cultivator.glb（主角写实修士模型）来源

- 人体基础网格、骨骼关节定义、蒙皮权重、形态目标（asian-male-young 等）：MakeHuman 1.x
  （base.obj / default.mhskel / default_weights.mhw / targets.npz），CC0 1.0 公共领域许可，
  版权方 Data Collection AB、Joel Palmius、Jonas Hauquier，https://github.com/makehumancommunity/makehuman
- 骨骼重命名为 Mixamo 命名（mixamorig:*），骨骼朝向参考原 Michelle.glb，以复用 player.js 程序化动作。
- 汉服外袍、内衬领、腰封、下摆、发型壳、眼球、鞋：由 tools/cultivator/build.py + extras.py 程序化生成，无第三方资源。
- 生成：`python3 tools/cultivator/build.py 1e-3 public/models/Cultivator.glb`（需 MakeHuman 数据文件，见脚本中路径）。

# CultivatorScan.glb（当前主角，三视图生成）来源

- 外形：用户提供的「年轻男修士角色三视图」，经腾讯混元 Hunyuan3D-2mv（Hugging Face 免费演示 tencent/Hunyuan3D-2mv）多视图生成白模。
  许可：Tencent Hunyuan 3D 2.0 Community License。腾讯不主张对生成结果（Outputs）的权利；但该许可**不适用于欧盟、英国、韩国**，
  且月活超过 100 万的产品需另行向腾讯申请授权。不是 CC0。
- 贴图：由三视图原图投影烘焙（tools/cultivator_scan/bake.py），无第三方素材。
- 骨架：复用 Cultivator.glb 的 Mixamo 骨架（MakeHuman CC0 关节），Blender 3.6 自动权重。
- 生成流程见 tools/cultivator_scan/README.md。加载失败时依次回退 Cultivator.glb、Michelle.glb。

## HDRI 天空光照

`public/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr`：Poly Haven（polyhaven.com，CC0）"Kloofendal 48d Partly Cloudy (Pure Sky)" 1k HDR，用作场景环境光（IBL 反射/漫反射），强度随昼夜变化。
