extends Node3D
## 主场景：地形、水面、天空与昼夜循环、玩家。
## 调试参数（命令行）：
##   --shot=<路径.png>  运行约 2 秒后截图并退出
##   --day=<0..1>       指定一天中的时间（0.25 日出 / 0.5 正午 / 0.75 日落）
##   --probe            输出若干点的碰撞/高度采样后退出

const WATER_LEVEL := 2.1
const DAY_SECONDS := 480.0
const HEIGHTMAP_N := 381
const HEIGHTMAP_HALF := 190.0

var day_time := 0.32
var heights := PackedFloat32Array()
var sun: DirectionalLight3D
var world_env: WorldEnvironment
var env: Environment
var sky_mat: ProceduralSkyMaterial
var water_mat: ShaderMaterial
var player: CharacterBody3D

var shot_path := ""
var shot_frames := 0
var probe := false
var probe_frames := 0
var day_override := -1.0
var cam_dist_override := -1.0
var start_meditating := false

func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			shot_path = arg.trim_prefix("--shot=")
		elif arg.begins_with("--day="):
			day_override = arg.trim_prefix("--day=").to_float()
		elif arg.begins_with("--camdist="):
			cam_dist_override = arg.trim_prefix("--camdist=").to_float()
		elif arg == "--probe":
			probe = true
		elif arg == "--meditate":
			start_meditating = true
	if day_override >= 0.0:
		day_time = day_override
	_load_heights()
	_build_environment()
	_build_terrain()
	_build_water()
	_build_player()
	if cam_dist_override > 0.0:
		player.cam_dist = cam_dist_override
		player._update_camera()
	player.meditating = start_meditating
	_update_day_night()

func _process(delta: float) -> void:
	day_time = fmod(day_time + delta / DAY_SECONDS, 1.0)
	_update_day_night()
	if shot_path != "":
		shot_frames += 1
		if shot_frames >= 40:
			var img := get_viewport().get_texture().get_image()
			var err := img.save_png(shot_path)
			print("screenshot saved: ", shot_path, " err=", err)
			get_tree().quit()
	if probe:
		probe_frames += 1
		if probe_frames >= 90:
			_run_probe()
			get_tree().quit()

# ---------------------------------------------------------------- 高度数据

func _load_heights() -> void:
	var f := FileAccess.open("res://assets/terrain/heights_1m.f32", FileAccess.READ)
	if f == null:
		push_error("无法打开 heights_1m.f32")
		return
	heights = f.get_buffer(f.get_length()).to_float32_array()
	print("heights loaded: ", heights.size())

## 双线性采样地形高度（与碰撞高度图同一数据，误差 < 1cm）
func terrain_height_at(x: float, z: float) -> float:
	var fx := clampf(x + HEIGHTMAP_HALF, 0.0, HEIGHTMAP_N - 1.001)
	var fz := clampf(z + HEIGHTMAP_HALF, 0.0, HEIGHTMAP_N - 1.001)
	var ix := int(fx)
	var iz := int(fz)
	var tx := fx - ix
	var tz := fz - iz
	var i00 := iz * HEIGHTMAP_N + ix
	var h00 := heights[i00]
	var h10 := heights[i00 + 1]
	var h01 := heights[i00 + HEIGHTMAP_N]
	var h11 := heights[i00 + HEIGHTMAP_N + 1]
	return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)

# ---------------------------------------------------------------- 场景搭建

func _build_environment() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	sky_mat = ProceduralSkyMaterial.new()
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.6
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.0
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_density = 0.002
	env.fog_light_color = Color.html("b9d3cd")
	env.fog_sky_affect = 0.6
	env.glow_enabled = true
	env.glow_intensity = 0.3
	env.glow_bloom = 0.02
	world_env = WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 220.0
	sun.directional_shadow_pancake_size = 40.0
	add_child(sun)

func _build_terrain() -> void:
	var mesh: Mesh = load("res://assets/terrain/terrain.obj")
	if mesh == null:
		push_error("地形 OBJ 加载失败")
		return
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	var mat := ShaderMaterial.new()
	mat.shader = load("res://scripts/terrain.gdshader")
	mat.set_shader_parameter("water_level", WATER_LEVEL)
	var tex_dir := "res://assets/textures/ground/"
	mat.set_shader_parameter("grass_diff", load(tex_dir + "leafy_grass_diff.jpg"))
	mat.set_shader_parameter("forest_diff", load(tex_dir + "forrest_ground_01_diff.jpg"))
	mat.set_shader_parameter("sand_diff", load(tex_dir + "coast_sand_01_diff.jpg"))
	mat.set_shader_parameter("rock_diff", load(tex_dir + "rock_face_diff.jpg"))
	mat.set_shader_parameter("grass_rough", load(tex_dir + "leafy_grass_rough.jpg"))
	mat.set_shader_parameter("rock_rough", load(tex_dir + "rock_face_rough.jpg"))
	mi.material_override = mat
	add_child(mi)

	# 碰撞：1m 间距高度图（与渲染网格同一高度函数）
	var body := StaticBody3D.new()
	var hm := HeightMapShape3D.new()
	hm.map_width = HEIGHTMAP_N
	hm.map_depth = HEIGHTMAP_N
	hm.map_data = heights
	var col := CollisionShape3D.new()
	col.shape = hm
	body.add_child(col)
	add_child(body)

func _build_water() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(380, 380)
	var mi := MeshInstance3D.new()
	mi.mesh = plane
	mi.position.y = WATER_LEVEL
	water_mat = ShaderMaterial.new()
	water_mat.shader = load("res://scripts/water.gdshader")
	mi.material_override = water_mat
	add_child(mi)

func _build_player() -> void:
	player = load("res://scenes/player.tscn").instantiate()
	player.position = Vector3(40, 10, 72)
	add_child(player)

# ---------------------------------------------------------------- 昼夜循环
# 移植自 src/world.js updateDayNight：8 分钟一昼夜，0.25 日出 / 0.5 正午 / 0.75 日落。

func _sstep(x: float, a: float, b: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

func _update_day_night() -> void:
	var a := (day_time - 0.25) * TAU
	var sun_alt := sin(a)
	var sun_dir := Vector3(cos(a) * 0.55, sun_alt, cos(a) * 0.55 + 0.4).normalized()
	var day := _sstep(sun_alt, -0.04, 0.18)
	var dusk := maxf(0.0, 1.0 - absf(sun_alt) / 0.22) * day
	var night := 1.0 - day

	# 平行光：白天是太阳，夜里切换成月光（方向相反、颜色变蓝）
	var moon_dir := -sun_dir
	var light_dir := sun_dir if sun_alt > -0.05 else moon_dir
	sun.global_transform.basis = Basis.looking_at(-light_dir, Vector3.UP)
	if sun_alt > -0.05:
		sun.light_color = Color.html("ff9440").lerp(Color.html("fff2d5"), day)
		sun.light_energy = 0.15 + day * 1.05
	else:
		sun.light_color = Color.html("9db8ff")
		sun.light_energy = 0.3

	# 天空
	var top_day := Color.html("2e6cc4")
	var top_night := Color.html("030509")
	var hor_day := Color.html("bcd2dc")
	var hor_night := Color.html("0a1420")
	var dusk_col := Color.html("e8a56b")
	var top := top_night.lerp(top_day, day)
	var hor := hor_night.lerp(hor_day, day).lerp(dusk_col, dusk * 0.6)
	sky_mat.sky_top_color = top
	sky_mat.sky_horizon_color = hor
	sky_mat.ground_bottom_color = Color.html("05070c").lerp(Color.html("3d4a3a"), day)
	sky_mat.ground_horizon_color = hor_night.lerp(Color.html("8fae9f"), day)
	sky_mat.sky_energy_multiplier = 0.4 + day * 0.6
	sky_mat.ground_energy_multiplier = 0.15 + day * 0.45

	# 环境光 / 曝光 / 雾（数值与网页版一致）
	env.ambient_light_energy = 0.15 + day * 0.3
	env.tonemap_exposure = 0.6 + day * 0.25
	env.fog_light_color = Color.html("0a1420").lerp(Color.html("b9d3cd"), day).lerp(Color.html("cf9d76"), dusk * 0.7)
	env.fog_density = 0.0032 - night * 0.0016
	if water_mat:
		water_mat.set_shader_parameter("day_factor", day)

# ---------------------------------------------------------------- 调试

func _run_probe() -> void:
	print("== probe ==")
	for p in [Vector2(40, 72), Vector2(120, 90), Vector2(-130, -40), Vector2(0, 0), Vector2(130, -130)]:
		var hm := terrain_height_at(p.x, p.y)
		print("point (", p.x, ",", p.y, ") heightmap=", snappedf(hm, 0.01))
	var space := get_world_3d().direct_space_state
	for p in [Vector2(40, 72), Vector2(120, 90), Vector2(-130, -40)]:
		var from := Vector3(p.x, 80.0, p.y)
		var to := Vector3(p.x, -30.0, p.y)
		var q := PhysicsRayQueryParameters3D.create(from, to)
		var hit := space.intersect_ray(q)
		if hit.is_empty():
			print("raycast (", p.x, ",", p.y, ") -> MISS")
		else:
			print("raycast (", p.x, ",", p.y, ") -> y=", snappedf(hit.position.y, 0.01))
