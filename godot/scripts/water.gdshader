shader_type spatial;
render_mode blend_mix, depth_draw_never, specular_schlick_ggx;

// 灵湖/灵河水面：随昼夜变化的半透明水面，带视角相关的菲涅尔反射与波动高光。

uniform float day_factor = 1.0;

varying vec3 v_wp;

void vertex() {
	v_wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float w1 = sin(v_wp.x * 0.8 + TIME * 1.3) * cos(v_wp.z * 0.7 + TIME * 1.1);
	float w2 = sin((v_wp.x + v_wp.z) * 0.35 - TIME * 0.7);
	vec3 day_col = mix(vec3(0.02, 0.06, 0.11), vec3(0.16, 0.5, 0.44), 0.4 + 0.3 * w2);
	vec3 base = mix(day_col * vec3(0.08, 0.12, 0.18), day_col, day_factor);
	float ndv = clamp(dot(normalize(NORMAL), normalize(-VERTEX)), 0.0, 1.0);
	float fres = pow(1.0 - ndv, 3.0);
	vec3 sky_ref = mix(vec3(0.02, 0.03, 0.06), vec3(0.72, 0.82, 0.88), day_factor);
	vec3 col = mix(base, sky_ref, fres * 0.55 + 0.04 * w1);
	ALBEDO = col;
	ALPHA = 0.88;
	ROUGHNESS = 0.15;
	SPECULAR = 0.5;
}
