# Cultivator.glb（主角写实修士模型）来源

- 人体基础网格、骨骼关节定义、蒙皮权重、形态目标（asian-male-young 等）：MakeHuman 1.x
  （base.obj / default.mhskel / default_weights.mhw / targets.npz），CC0 1.0 公共领域许可，
  版权方 Data Collection AB、Joel Palmius、Jonas Hauquier，https://github.com/makehumancommunity/makehuman
- 骨骼重命名为 Mixamo 命名（mixamorig:*），骨骼朝向参考原 Michelle.glb，以复用 player.js 程序化动作。
- 汉服外袍、内衬领、腰封、下摆、发型壳、眼球、鞋：由 tools/cultivator/build.py + extras.py 程序化生成，无第三方资源。
- 生成：`python3 tools/cultivator/build.py 1e-3 public/models/Cultivator.glb`（需 MakeHuman 数据文件，见脚本中路径）。
