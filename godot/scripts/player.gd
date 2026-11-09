extends CharacterBody3D
## 第三人称修士角色：WASD 移动、Shift 疾跑、空格跳跃、鼠标轨道视角。
## 角色模型 CultivatorScan.glb（与网页版主角相同，Mixamo 风格骨架）。

const WALK_SPEED := 4.0
const SPRINT_SPEED := 7.0
const JUMP_VELOCITY := 6.5
const GRAVITY := 20.0
const TARGET_HEIGHT := 1.78

var cam_yaw := 0.0
var cam_pitch := -0.35
var cam_dist := 5.5

var yaw_pivot: Node3D
var pitch_pivot: Node3D
var cam: Camera3D
var model_root: Node3D
var skeleton: Skeleton3D
var bones := {}
var rest_rot := {}
var anim_t := 0.0
var meditating := false
var meditate_k := 0.0
var hips_rest_pos := Vector3.ZERO

# CultivatorScan 站姿参数（与网页版 rig 一致）
const RIG := {"arm": 1.5, "fore": 0.24, "leg": -0.062, "walk_leg": -0.062, "walk_arm": 1.3}

func _ready() -> void:
	# 碰撞胶囊
	var cap := CapsuleShape3D.new()
	cap.radius = 0.35
	cap.height = 1.75
	var col := CollisionShape3D.new()
	col.shape = cap
	col.position.y = 0.875
	add_child(col)

	# 相机：yaw -> pitch -> camera，镜头在角色身后
	yaw_pivot = Node3D.new()
	yaw_pivot.position.y = 1.55
	add_child(yaw_pivot)
	pitch_pivot = Node3D.new()
	yaw_pivot.add_child(pitch_pivot)
	cam = Camera3D.new()
	cam.near = 0.1
	cam.far = 3000.0
	pitch_pivot.add_child(cam)
	_update_camera()

	# 角色模型
	model_root = Node3D.new()
	add_child(model_root)
	var glb: PackedScene = load("res://assets/models/CultivatorScan.glb")
	if glb == null:
		push_error("CultivatorScan.glb 加载失败")
		return
	var model := glb.instantiate()
	model_root.add_child(model)
	_normalize_model(model)
	_find_bones(model)

func _normalize_model(model: Node) -> void:
	# 归一化到真实身高（1.78m），脚底对齐 y=0（与网页版一致）
	var aabb := AABB()
	var first := true
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_inst: MeshInstance3D = mi
		var box: AABB = mesh_inst.get_aabb()
		var xf := model_root.global_transform.affine_inverse() * mesh_inst.global_transform
		box = xf * box
		if first:
			aabb = box
			first = false
		else:
			aabb = aabb.merge(box)
	if first:
		push_warning("模型没有 MeshInstance3D")
		return
	var s := TARGET_HEIGHT / aabb.size.y
	model_root.scale = Vector3.ONE * s
	model_root.position.y = -aabb.position.y * s
	print("model aabb size=", aabb.size, " scale=", s)

func _find_bones(model: Node) -> void:
	var found := model.find_children("*", "Skeleton3D", true, false)
	if found.is_empty():
		return
	skeleton = found[0]
	for i in skeleton.get_bone_count():
		# Godot 导入后骨骼名为 mixamorig_Xxx，统一成网页版的 mixamorigXxx
		var key := skeleton.get_bone_name(i).replace("_", "").replace(":", "")
		bones[key] = i
		rest_rot[key] = skeleton.get_bone_rest(i).basis.get_rotation_quaternion()
	if bones.has("mixamorigHips"):
		hips_rest_pos = skeleton.get_bone_rest(bones["mixamorigHips"]).origin
	print("skeleton bones: ", bones.size())

# 网页版 armEuler：把“直观”角度映射到 Mixamo 各骨骼局部轴
func _arm_euler(bone: String, x: float, y: float, z: float) -> Vector3:
	if bone == "mixamorigLeftArm":
		return Vector3(-z, y, x)
	if bone == "mixamorigRightArm":
		return Vector3(z, y, -x)
	if bone == "mixamorigLeftForeArm" or bone == "mixamorigRightForeArm":
		return Vector3(x, 0, z - y)
	if bone in ["mixamorigLeftUpLeg", "mixamorigRightUpLeg", "mixamorigLeftLeg", "mixamorigRightLeg"]:
		return Vector3(-x, y, z)
	return Vector3(x, y, z)

func _target(bone: String, x: float, y: float, z: float) -> Quaternion:
	var e := _arm_euler(bone, x, y, z)
	var q := Basis.from_euler(e, EULER_ORDER_XYZ).get_rotation_quaternion()
	return rest_rot[bone] * q

## 平滑过渡到目标姿态（k 为本帧插值系数）
func _pose(bone: String, x: float, y: float, z: float, k: float = 0.2) -> void:
	if not bones.has(bone):
		return
	var idx: int = bones[bone]
	var cur := skeleton.get_bone_pose_rotation(idx)
	skeleton.set_bone_pose_rotation(idx, cur.slerp(_target(bone, x, y, z), k))

func _animate(delta: float, spd: float) -> void:
	if skeleton == null:
		return
	var run_k := clampf(spd / SPRINT_SPEED, 0.0, 1.0)
	if meditate_k > 0.01:
		var k := meditate_k
		_pose("mixamorigLeftUpLeg", -1.35, 0.35, 0.15, k)
		_pose("mixamorigRightUpLeg", -1.35, -0.35, -0.15, k)
		_pose("mixamorigLeftLeg", 2.2, 0, 0, k)
		_pose("mixamorigRightLeg", 2.2, 0, 0, k)
		_pose("mixamorigLeftArm", 0.4, 0, -0.9, k)
		_pose("mixamorigRightArm", 0.4, 0, 0.9, k)
		_pose("mixamorigLeftForeArm", 0, -1.1, 0, k)
		_pose("mixamorigRightForeArm", 0, 1.1, 0, k)
		if bones.has("mixamorigHips"):
			# 沉髋 0.55m（换算到骨架局部单位）
			var units_per_m := 1.0 / maxf(skeleton.global_transform.basis.get_scale().y, 0.0001)
			var p := hips_rest_pos
			p.y -= 0.55 * units_per_m * k
			skeleton.set_bone_pose_position(bones["mixamorigHips"], p)
		return
	_pose("mixamorigLeftForeArm", 0, -RIG.fore, 0)
	_pose("mixamorigRightForeArm", 0, RIG.fore, 0)
	if spd > 0.5:
		anim_t += delta * (4.0 + run_k * 7.0)
		var s := sin(anim_t)
		var c := cos(anim_t)
		var amp := 0.35 + run_k * 0.35
		_pose("mixamorigLeftUpLeg", s * amp, 0, RIG.walk_leg)
		_pose("mixamorigRightUpLeg", -s * amp, 0, -RIG.walk_leg)
		_pose("mixamorigLeftLeg", maxf(0.0, -c) * amp * 1.4 + 0.1, 0, 0)
		_pose("mixamorigRightLeg", maxf(0.0, c) * amp * 1.4 + 0.1, 0, 0)
		_pose("mixamorigLeftArm", -s * amp * 0.55, 0, -RIG.walk_arm)
		_pose("mixamorigRightArm", s * amp * 0.55, 0, RIG.walk_arm)
		_pose("mixamorigSpine1", run_k * 0.12, s * 0.05, 0)
	else:
		anim_t += delta * 1.4
		var br := sin(anim_t) * 0.03
		_pose("mixamorigSpine1", br, 0, 0)
		_pose("mixamorigLeftArm", 0, 0, -RIG.arm + br)
		_pose("mixamorigRightArm", 0, 0, RIG.arm - br)
		_pose("mixamorigLeftUpLeg", 0, 0, RIG.leg)
		_pose("mixamorigRightUpLeg", 0, 0, -RIG.leg)
		_pose("mixamorigLeftLeg", 0.06, 0, 0)
		_pose("mixamorigRightLeg", 0.06, 0, 0)

func _physics_process(delta: float) -> void:
	meditate_k = move_toward(meditate_k, 1.0 if meditating else 0.0, delta * 3.0)
	if meditating:
		velocity = Vector3(0, velocity.y - GRAVITY * delta, 0)
		move_and_slide()
		_animate(delta, 0.0)
		return
	if meditate_k <= 0.0 and bones.has("mixamorigHips"):
		skeleton.set_bone_pose_position(bones["mixamorigHips"], hips_rest_pos)
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	if Input.is_key_pressed(KEY_SPACE) and is_on_floor():
		velocity.y = JUMP_VELOCITY

	var b := yaw_pivot.global_transform.basis
	var fwd := Vector3(-b.z.x, 0.0, -b.z.z).normalized()
	var right := Vector3(b.x.x, 0.0, b.x.z).normalized()
	var wish := Vector3.ZERO
	if Input.is_key_pressed(KEY_W):
		wish += fwd
	if Input.is_key_pressed(KEY_S):
		wish -= fwd
	if Input.is_key_pressed(KEY_D):
		wish += right
	if Input.is_key_pressed(KEY_A):
		wish -= right
	var speed := SPRINT_SPEED if Input.is_key_pressed(KEY_SHIFT) else WALK_SPEED
	if wish.length_squared() > 0.001:
		wish = wish.normalized() * speed
		velocity.x = wish.x
		velocity.z = wish.z
	else:
		var damp := speed * 6.0 * delta
		velocity.x = move_toward(velocity.x, 0.0, damp)
		velocity.z = move_toward(velocity.z, 0.0, damp)
	move_and_slide()

	# 面向移动方向（模型正面为 +Z）
	if wish.length_squared() > 0.001:
		var target_yaw := atan2(wish.x, wish.z)
		model_root.rotation.y = lerp_angle(model_root.rotation.y, target_yaw, minf(1.0, delta * 10.0))
	_animate(delta, Vector2(velocity.x, velocity.z).length())

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		cam_yaw -= event.relative.x * 0.0026
		cam_pitch = clampf(cam_pitch - event.relative.y * 0.0026, -1.25, 0.6)
		_update_camera()
	elif event is InputEventMouseButton and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				cam_dist = maxf(2.2, cam_dist - 0.6)
				_update_camera()
			MOUSE_BUTTON_WHEEL_DOWN:
				cam_dist = minf(14.0, cam_dist + 0.6)
				_update_camera()
			MOUSE_BUTTON_LEFT:
				if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
					Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F:
		if is_on_floor():
			meditating = not meditating
	elif event.is_action_pressed("ui_cancel"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _update_camera() -> void:
	yaw_pivot.rotation.y = cam_yaw
	pitch_pivot.rotation.x = cam_pitch
	cam.position = Vector3(0, 0, cam_dist)
