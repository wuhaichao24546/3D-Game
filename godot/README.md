# 修仙世界 · Godot 4 版

从 Three.js 网页版迁移到 Godot 4.5 的 3D 修仙开放世界。这是当前开发主线，Three.js 版本保留在仓库根目录作为对照。

## 运行

1. 下载 Godot 4.5.x 标准版（约 60MB）：<https://godotengine.org/download>（Linux 选标准版，不是 .NET 版），解压后得到 `Godot_v4.5-stable_linux.x86_64`。
2. 打开项目：

```bash
godot --path godot/
```

首次打开会自动导入资源（地形 OBJ 约 30MB，需要一点时间）。

## 操作

| 按键 | 功能 |
|---|---|
| 点击画面 | 锁定鼠标 |
| WASD | 移动 |
| Shift | 疾跑 |
| 空格 | 跳跃 |
| F | 打坐 / 起身 |
| 鼠标 | 旋转视角 |
| 滚轮 | 调整镜头距离 |
| Esc | 释放鼠标 |

## 当前进度（竖切片）

- 地形：与网页版相同的高度函数（`tools/godot_export/export_terrain.mjs`，种子 1337 的 simplex 噪声），380m × 380m，灵河、村庄/洞府/祭坛/神树/虎穴平整地块；PBR 四层混合材质（Poly Haven 扫描贴图：草地/林地/沙滩/岩壁），HeightMapShape3D 碰撞
- 水面：灵湖/灵河水面，随昼夜变化
- 天空与昼夜：8 分钟一昼夜，日出/正午/黄昏/夜晚，太阳/月光切换、雾、ACES 色调映射、辉光
- 角色：`CultivatorScan.glb`（Hunyuan3D 三视图生成，许可见 `public/models/CULTIVATOR_SOURCES.md`），1.78m 归一化，站立呼吸、走跑摆臂摆腿、F 键打坐（程序化骨骼动画，移植自网页版）
- 第三人称相机：鼠标轨道、滚轮缩放

## 尚未迁移

村庄建筑、灵兽/神兽、NPC、技能特效、灵气粒子、云、草地、道具、UI、存档等。后续按竖切片逐步补齐。

## 调试参数

运行游戏时在命令行 `--` 后加：

```bash
godot --path godot/ -- --shot=/tmp/shot.png --day=0.5 --camdist=5
godot --path godot/ -- --probe          # 输出地形高度/碰撞检测
godot --path godot/ -- --meditate       # 出生即打坐
```

- `--shot=<png>`：约 2 秒后截图并退出
- `--day=<0..1>`：指定时间（0.25 日出 / 0.5 正午 / 0.75 日落 / 0.95 夜晚）
- `--camdist=<米>`：初始镜头距离

## 无 GPU 环境验证

本项目可在没有显卡的 Linux 机器上用软件渲染截图验证（需要 Mesa 的 lavapipe 和 llvmpipe）：

```bash
# Vulkan 软渲染（Forward+）
DISPLAY=:0 godot --rendering-driver vulkan --audio-driver Dummy --path godot/ -- --shot=/tmp/a.png
# OpenGL 软渲染（兼容渲染器，截图更快；项目本身是 Forward+）
DISPLAY=:0 godot --rendering-driver opengl3 --rendering-method gl_compatibility --audio-driver Dummy --path godot/ -- --shot=/tmp/b.png
```

## 目录

- `project.godot`：工程配置（Forward+ 渲染，1280×720）
- `scenes/`：主场景、玩家场景
- `scripts/`：`main.gd`（环境/地形/水/昼夜）、`player.gd`（控制器/动画）、`terrain.gdshader`、`water.gdshader`
- `assets/terrain/`：`terrain.obj`、`heights.f32`、`heights_1m.f32`（由 `tools/godot_export/export_terrain.mjs` 生成，已入库）
- `assets/textures/ground/`：Poly Haven CC0 扫描材质
- `assets/models/CultivatorScan.glb`：主角模型
- `assets/kloofendal_48d_partly_cloudy_puresky_1k.hdr`：Poly Haven CC0 HDRI（尚未接入）
