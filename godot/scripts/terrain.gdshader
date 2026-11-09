shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

// 移植自网页版 src/world.js 的地形材质：
// Poly Haven 扫描 PBR 四层混合（草地/林地/沙滩/岩壁），按坡度、高度与噪声权重混合。

uniform sampler2D grass_diff : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D forest_diff : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D sand_diff : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_diff : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D grass_rough : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_rough : filter_linear_mipmap_anisotropic, repeat_enable;
uniform float water_level = 2.1;

varying vec3 v_wp;
varying vec3 v_wn;

float th12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tvn(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(th12(i), th12(i + vec2(1, 0)), f.x), mix(th12(i + vec2(0, 1)), th12(i + vec2(1, 1)), f.x), f.y);
}

void vertex() {
	v_wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec2 wuv = v_wp.xz;
	float nz = tvn(wuv * 0.045) * 0.6 + tvn(wuv * 0.14) * 0.4;
	vec2 uvG = wuv * 0.22;
	vec2 uvG2 = vec2(wuv.x * 0.8 + wuv.y * 0.6, -wuv.x * 0.6 + wuv.y * 0.8) * 0.063;
	vec2 uvD = wuv * 0.19;
	vec2 uvS = wuv * 0.24;
	vec2 uvR = wuv * 0.085;
	vec3 an = abs(v_wn);
	vec2 uvRs = (an.x > an.z ? v_wp.zy : v_wp.xy) * 0.085;
	float sideW = smoothstep(0.5, 0.8, 1.0 - an.y);
	vec3 cG = mix(texture(grass_diff, uvG).rgb, texture(grass_diff, uvG2).rgb, 0.4);
	cG *= vec3(0.82, 0.98, 0.62);
	vec3 cD = texture(forest_diff, uvD).rgb;
	vec3 cS = texture(sand_diff, uvS).rgb;
	vec3 cR = mix(texture(rock_diff, uvR).rgb, texture(rock_diff, uvRs).rgb, sideW);
	cR = mix(cR, vec3(dot(cR, vec3(0.33))) * vec3(0.95, 0.98, 1.04), 0.55);
	float slope = 1.0 - v_wn.y;
	float w3 = smoothstep(0.30, 0.55, slope + smoothstep(14.0, 30.0, v_wp.y) * 0.45 + (nz - 0.5) * 0.12);
	float sandW = smoothstep(water_level + 1.2, water_level + 0.2, v_wp.y + (nz - 0.5) * 0.6);
	float w2 = sandW * (1.0 - w3);
	float rest = (1.0 - sandW) * (1.0 - w3);
	float dd = clamp(smoothstep(0.10, 0.28, slope) * 0.7 + smoothstep(0.66, 0.86, nz) * 0.55, 0.0, 1.0);
	float w1 = dd * rest;
	float w0 = (1.0 - dd) * rest;
	vec3 terr = cG * w0 + cD * w1 + cS * w2 + cR * w3;
	terr *= mix(0.84, 1.1, nz);
	terr = mix(terr, terr * vec3(1.08, 1.0, 0.8), smoothstep(0.45, 0.8, tvn(wuv * 0.02)) * w0 * 0.45);
	ALBEDO = terr;
	float tRough = texture(grass_rough, uvG).r * w0 + 0.95 * w1 + 0.88 * w2 + texture(rock_rough, uvR).r * w3;
	ROUGHNESS = clamp(tRough, 0.45, 1.0);
}
