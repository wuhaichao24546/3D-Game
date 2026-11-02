import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRealm } from './realm.js';
import { Forest, buildGrass, foliageUniforms } from './foliage.js';

// ---- seeded rng + noise --------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const simplex = new SimplexNoise({ random: mulberry32(1337) });

function fbm(x, z, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * simplex.noise(x * freq, z * freq);
    amp *= 0.5; freq *= 2.1;
  }
  return sum;
}

export const WORLD_RADIUS = 190;
export const WATER_LEVEL = 2.1;

// 蜿蜒灵河：一条过湖心的正弦河道，过弯处略有抖动
export function riverX(z) {
  return Math.sin(z * 0.011) * 34 + Math.sin(z * 0.031 + 1.7) * 10;
}
export function riverDist(x, z) {
  return Math.abs(x - riverX(z));
}

// 建筑/祭坛所在处的平整地块：{x,z,r,h}，h 为空则取原地形高度
export const SITES = {
  village: { x: 40, z: 72, r: 24 },
  hut: { x: -75, z: 90, r: 11 },
  altar: { x: -130, z: -40, r: 17 },
  tree: { x: 120, z: 90, r: 15 },
  tiger: { x: 130, z: -130, r: 7 },
};
for (const k in SITES) {
  const s = SITES[k];
  s.h = Math.max(WATER_LEVEL + 1.6, baseHeight(s.x, s.z));
}

export function terrainHeight(x, z) {
  let h = baseHeight(x, z);
  for (const k in SITES) {
    const s = SITES[k];
    const dd = Math.hypot(x - s.x, z - s.z);
    if (dd < s.r * 1.6) {
      const w = THREE.MathUtils.smoothstep(s.r * 1.6 - dd, 0, s.r * 0.6)
        * THREE.MathUtils.smoothstep(riverDist(x, z), 10, 18);
      h = h * (1 - w) + s.h * w;
    }
  }
  return h;
}

export function inSite(x, z, pad = 1) {
  for (const k in SITES) {
    const s = SITES[k];
    if (Math.hypot(x - s.x, z - s.z) < s.r * pad) return true;
  }
  return false;
}

function baseHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = 4 + fbm(x * 0.012, z * 0.012, 4) * 14;
  h += fbm(x * 0.045 + 99, z * 0.045 - 99, 3) * 2.2;
  const ring = Math.max(0, (d - 130) / 60);
  h += ring * ring * 22;
  h -= Math.max(0, 1 - d / 70) * 5;
  // 河道下切：中心低于水位，两边平滑抬起
  const rd = riverDist(x, z);
  const channel = Math.max(0, 1 - rd / 9);
  h = h * (1 - channel * 0.85) + channel * (WATER_LEVEL - 1.4) + Math.max(0, 1 - rd / 16) * 0.9;
  return h;
}

const DAY_SECONDS = 480; // 8 分钟一昼夜

const texLoader = new THREE.TextureLoader();
function loadTex(url, repeat = true) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --------------------------------------------------------------------------
export function buildWorld(scene, renderer) {
  const updaters = [];

  // ---------- lighting ----------
  const sun = new THREE.DirectionalLight(0xfff2d5, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shCam = sun.shadow.camera;
  shCam.left = shCam.bottom = -95;
  shCam.right = shCam.top = 95;
  shCam.near = 10; shCam.far = 560;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 1.2;
  scene.add(sun, sun.target);
  const focus = new THREE.Vector3();
  const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x2e4d3a, 1.0);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.16);
  scene.add(amb);

  // ---------- sky ----------
  const sky = new Sky();
  sky.scale.setScalar(3000);
  const u = sky.material.uniforms;
  u.turbidity.value = 5;
  u.rayleigh.value = 1.8;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.85;
  scene.add(sky);

  scene.fog = new THREE.Fog(0xbfd9d4, 90, 950);

  // ---------- stars & moon ----------
  const starGeo = new THREE.BufferGeometry();
  const SN = 2200;
  const sp = new Float32Array(SN * 3);
  const sRng = mulberry32(7);
  for (let i = 0; i < SN; i++) {
    const a = sRng() * Math.PI * 2, b = Math.acos(sRng() * 0.95);
    const r = 1200;
    sp[i * 3] = Math.sin(b) * Math.cos(a) * r;
    sp[i * 3 + 1] = Math.cos(b) * r * 0.9 + 50;
    sp[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const glowTex = glowTexture();
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, map: glowTex,
    transparent: true, opacity: 0, fog: false, depthWrite: false,
  }));
  scene.add(stars);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(42, 24, 24),
    new THREE.MeshBasicMaterial({ map: loadTex('textures/moon.jpg', false), fog: false })
  );
  scene.add(moon);
  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, fog: false, depthWrite: false })
  );
  moon.add(moonGlow);

  // ---------- terrain ----------
  const SIZE = WORLD_RADIUS * 2, SEG = 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const grassTex = loadTex('textures/grass.jpg');
  const rockTex = loadTex('textures/rock.jpg');
  const dirtTex = loadTex('textures/dirt.jpg');
  const sandTex = loadTex('textures/sand.jpg');
  grassTex.repeat.set(1, 1);

  // 写实地表：Poly Haven 扫描 PBR（草地/林地泥土/沙滩/岩壁），按坡度/高度/噪声混合，带法线与粗糙度
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const groundTex = (n, srgb = true) => {
    const t = loadTex(`textures/ground/${n}.jpg`);
    if (!srgb) t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };
  const tU = {};
  ['leafy_grass', 'forrest_ground_01', 'coast_sand_01', 'rock_face'].forEach((n, i) => {
    tU['tD' + i] = { value: groundTex(n + '_diff') };
    tU['tN' + i] = { value: groundTex(n + '_nor', false) };
  });
  tU.tR0 = { value: groundTex('leafy_grass_rough', false) };
  tU.tR3 = { value: groundTex('rock_face_rough', false) };
  const terrainMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  terrainMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, tU);
    shader.uniforms.uWater = { value: WATER_LEVEL };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;
        uniform sampler2D tD0, tD1, tD2, tD3, tN0, tN1, tN2, tN3, tR0, tR3;
        uniform float uWater;
        vec3 tnrm(sampler2D t, vec2 uv) { return texture2D(t, uv).xyz * 2.0 - 1.0; }
        float th12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tvn(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(th12(i), th12(i + vec2(1, 0)), f.x), mix(th12(i + vec2(0, 1)), th12(i + vec2(1, 1)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `
        vec2 wuv = vWPos.xz;
        float nz = tvn(wuv * 0.045) * 0.6 + tvn(wuv * 0.14) * 0.4;
        vec2 uvG = wuv * 0.22;
        vec2 uvG2 = mat2(0.8, -0.6, 0.6, 0.8) * wuv * 0.063;
        vec2 uvD = wuv * 0.19;
        vec2 uvS = wuv * 0.24;
        vec2 uvR = wuv * 0.085;
        vec3 an = abs(normalize(vWNormal));
        vec2 uvRs = (an.x > an.z ? vWPos.zy : vWPos.xy) * 0.085;
        float sideW = smoothstep(0.5, 0.8, 1.0 - an.y);
        vec3 cG = mix(texture2D(tD0, uvG).rgb, texture2D(tD0, uvG2).rgb, 0.4);
        vec3 cD = texture2D(tD1, uvD).rgb;
        vec3 cS = texture2D(tD2, uvS).rgb;
        vec3 cR = mix(texture2D(tD3, uvR).rgb, texture2D(tD3, uvRs).rgb, sideW);
        cR = mix(cR, vec3(dot(cR, vec3(0.33))) * vec3(0.95, 0.98, 1.04), 0.55);
        float slope = 1.0 - vWNormal.y;
        float w3 = smoothstep(0.30, 0.55, slope + smoothstep(14.0, 30.0, vWPos.y) * 0.45 + (nz - 0.5) * 0.12);
        float sandW = smoothstep(uWater + 1.2, uWater + 0.2, vWPos.y + (nz - 0.5) * 0.6);
        float w2 = sandW * (1.0 - w3);
        float rest = (1.0 - sandW) * (1.0 - w3);
        float dd = clamp(smoothstep(0.10, 0.28, slope) * 0.7 + smoothstep(0.66, 0.86, nz) * 0.55, 0.0, 1.0);
        float w1 = dd * rest;
        float w0 = (1.0 - dd) * rest;
        vec3 terr = cG * w0 + cD * w1 + cS * w2 + cR * w3;
        terr *= mix(0.84, 1.1, nz);
        terr = mix(terr, terr * vec3(1.08, 1.0, 0.8), smoothstep(0.45, 0.8, tvn(wuv * 0.02)) * w0 * 0.45);
        diffuseColor.rgb = terr;
        float tRough = texture2D(tR0, uvG).r * w0 + 0.95 * w1 + 0.88 * w2 + texture2D(tR3, uvR).r * w3;
        vec3 tN = tnrm(tN0, uvG) * w0 + tnrm(tN1, uvD) * w1 + tnrm(tN2, uvS) * w2 + mix(tnrm(tN3, uvR), tnrm(tN3, uvRs), sideW) * w3;
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(tRough, 0.45, 1.0);')
      .replace('#include <normal_fragment_maps>', `{
          vec3 Nw = normalize(vWNormal);
          vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
          vec3 Bw = cross(Tw, Nw);
          vec3 pn = normalize(vec3(tN.xy * 1.25, max(tN.z, 0.2)));
          normal = normalize((viewMatrix * vec4(Tw * pn.x + Bw * pn.y + Nw * pn.z, 0.0)).xyz);
        }`);
  };
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true;
  terrain.userData.noShadowCast = true;
  scene.add(terrain);

  // 地形高度/草密度烘焙贴图（与地形网格顶点一一对应），驱动 GPU 密草场
  const HN = SEG + 1;
  const hData = new Uint16Array(HN * HN * 4);
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const ix = Math.round((x + SIZE / 2) / SIZE * SEG), iz = Math.round((z + SIZE / 2) / SIZE * SEG);
    const ok = y > WATER_LEVEL + 0.55 && y < 16 && nrm.getY(i) > 0.82 && !inSite(x, z, 1.05);
    const o = (iz * HN + ix) * 4;
    hData[o] = THREE.DataUtils.toHalfFloat(y);
    hData[o + 1] = THREE.DataUtils.toHalfFloat(ok ? 1 : 0);
    hData[o + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const heightTex = new THREE.DataTexture(hData, HN, HN, THREE.RGBAFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  const cell = SIZE / SEG;
  const grass = buildGrass(scene, {
    heightTex,
    mapMin: new THREE.Vector2(-SIZE / 2 - cell / 2, -SIZE / 2 - cell / 2),
    mapSize: new THREE.Vector2(cell * HN, cell * HN),
  });
  updaters.push(() => grass.update(focus));

  // ---------- water（真实反射水面） ----------
  const waterNormals = loadTex('textures/waternormals.jpg');
  const water = new Water(
    new THREE.PlaneGeometry(SIZE, SIZE),
    {
      textureWidth: 512, textureHeight: 512,
      waterNormals,
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xffffff,
      waterColor: 0x0d3841,
      distortionScale: 2.2,
      fog: true,
    }
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  scene.add(water);

  // ---------- trees ----------
  const barkTex = loadTex('textures/bark.jpg');
  const rng = mulberry32(2024);
  // 写实大树：程序化分枝（树皮 PBR + 叶片贴图 + 风动），近处高模、远处低模
  const forest = new Forest(scene, { nearDist: 60 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const cTint = new THREE.Color();
  const MAX_TREES = 300;
  let ti = 0;
  for (let i = 0; i < 3200 && ti < MAX_TREES; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.8 || h > 19 || inSite(x, z, 1.5)) continue;
    const r = rng();
    const kind = h > 11 ? (r < 0.75 ? 'pine' : 'ash') : (r < 0.3 ? 'pine' : r < 0.65 ? 'oak' : 'ash');
    forest.add(kind, x, h, z, rng);
    ti++;
  }

  // ---------- rocks ----------
  // 写实岩块：高细分 + 多频噪声位移（不规则棱角）+ 岩壁扫描 PBR
  const rockGeo = new THREE.IcosahedronGeometry(1, 4);
  {
    const rp = rockGeo.attributes.position, v = new THREE.Vector3();
    const rn = (x, y, z) => Math.sin(x * 1.7 + y * 2.3) * Math.cos(z * 1.9 - x * 1.1) * 0.5 + Math.sin(x * 4.1 - z * 3.7 + y * 2.9) * 0.18 + Math.sin(y * 7.3 + z * 6.1) * 0.06;
    for (let i = 0; i < rp.count; i++) {
      v.fromBufferAttribute(rp, i);
      const d = 1 + rn(v.x, v.y, v.z) * 0.35;
      v.multiplyScalar(d);
      if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
      rp.setXYZ(i, v.x, v.y, v.z);
    }
    rockGeo.computeVertexNormals();
  }
  const rTex = (n, srgb) => {
    const t = loadTex(`textures/ground/rock_face_${n}.jpg`);
    if (!srgb) t.colorSpace = THREE.NoColorSpace;
    t.repeat.set(2, 1);
    return t;
  };
  const rockMat = new THREE.MeshStandardMaterial({
    map: rTex('diff', true), normalMap: rTex('nor', false), roughnessMap: rTex('rough', false),
    color: 0xb4b4ac, roughness: 1,
  });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 200);
  let ri = 0;
  for (let i = 0; i < 900 && ri < 200; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 10);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 10);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL || inSite(x, z, 1.3)) continue;
    s.set(0.5 + rng() * 1.8, 0.4 + rng() * 1.2, 0.5 + rng() * 1.8);
    q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.5, rng() * 6.3, (rng() - 0.5) * 0.5));
    m.compose(new THREE.Vector3(x, h - 0.1, z), q, s);
    rocks.setMatrixAt(ri++, m);
  }
  rocks.count = ri;
  scene.add(rocks);

  // ---------- grass tufts (instanced cross quads) ----------
  const tuftGeo = mergeGeometries([
    new THREE.PlaneGeometry(0.7, 0.55).translate(0, 0.27, 0),
    new THREE.PlaneGeometry(0.7, 0.55).rotateY(Math.PI / 2).translate(0, 0.27, 0),
  ]);
  const bladeCanvas = document.createElement('canvas');
  bladeCanvas.width = bladeCanvas.height = 64;
  const bc = bladeCanvas.getContext('2d');
  const bRng = mulberry32(11);
  for (let i = 0; i < 9; i++) {
    const bx = 6 + i * 6.4 + bRng() * 3;
    const bh = 18 + bRng() * 40;
    const lean = (bRng() - 0.5) * 14;
    bc.fillStyle = `hsl(${100 + bRng() * 30},${40 + bRng() * 20}%,${26 + bRng() * 18}%)`;
    bc.beginPath();
    bc.moveTo(bx - 1.8, 64);
    bc.quadraticCurveTo(bx - 2 + lean * 0.4, 64 - bh * 0.6, bx + lean, 64 - bh);
    bc.quadraticCurveTo(bx + 2 + lean * 0.4, 64 - bh * 0.6, bx + 2.2, 64);
    bc.closePath();
    bc.fill();
  }
  const bladeTex = new THREE.CanvasTexture(bladeCanvas);
  bladeTex.colorSpace = THREE.SRGBColorSpace;
  const tuftMat = new THREE.MeshStandardMaterial({
    map: bladeTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1,
  });
  const TUFTS = 0; // 旧十字面草丛已由 GPU 密草场替代
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
  let gi = 0;
  for (let i = 0; i < 12000 && gi < TUFTS; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 20);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 20);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.4 || h > 14) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    s.setScalar(0.7 + rng() * 1.1);
    m.compose(new THREE.Vector3(x, h, z), q, s);
    tufts.setMatrixAt(gi, m);
    tufts.setColorAt(gi, cTint.setHSL(0.28 + rng() * 0.08, 0.55, 0.45 + rng() * 0.2));
    gi++;
  }
  tufts.count = gi;

  // ---------- 青竹幽谷（西南区竹林） ----------
  const bambooStalk = new THREE.CylinderGeometry(0.05, 0.07, 7.5, 5);
  bambooStalk.translate(0, 3.75, 0);
  const bambooLeaf = mergeGeometries([
    new THREE.ConeGeometry(0.7, 1.6, 5).translate(0, 6.9, 0),
    new THREE.ConeGeometry(0.5, 1.2, 5).translate(0, 7.8, 0),
  ]);
  const bambooMat = new THREE.MeshStandardMaterial({ color: 0x5d9153, roughness: 0.9 });
  const BAMBOO = 600;
  const stalks = new THREE.InstancedMesh(bambooStalk, bambooMat, BAMBOO);
  const bleaves = new THREE.InstancedMesh(bambooLeaf, bambooMat, BAMBOO);
  let bi = 0;
  for (let i = 0; i < 6000 && bi < BAMBOO; i++) {
    const x = -60 - rng() * 55, z = 40 + rng() * 55;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.5 || h > 13 || riverDist(x, z) < 10 || inSite(x, z, 1.4)) continue;
    const sc = 0.7 + rng() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.setScalar(sc);
    m.compose(new THREE.Vector3(x, h, z), q, s);
    stalks.setMatrixAt(bi, m);
    bleaves.setMatrixAt(bi, m);
    stalks.setColorAt(bi, cTint.setHSL(0.26 + rng() * 0.06, 0.4, 0.32 + rng() * 0.14));
    bleaves.setColorAt(bi, cTint.setHSL(0.3 + rng() * 0.05, 0.5, 0.35 + rng() * 0.15));
    bi++;
  }
  stalks.count = bleaves.count = bi;
  scene.add(stalks, bleaves);

  // ---------- 石质道宫（东北山脊） ----------
  const palace = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ map: rockTex, color: 0xb8b4aa, roughness: 1 });
  const darkRoof = new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.65 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0x8c2f24, roughness: 0.8 });
  const plat = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 11), stoneMat);
  plat.position.y = 0.6;
  palace.add(plat);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 6.5), stoneMat);
  hall.position.y = 2.8;
  palace.add(hall);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.3), redMat);
  door.position.set(0, 2.4, 3.3);
  palace.add(door);
  for (const px of [-3.6, 3.6]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.2, 8), redMat);
    col.position.set(px, 2.8, 3.4);
    palace.add(col);
  }
  // 双层歇山顶（简化）
  const roofA = new THREE.Mesh(new THREE.ConeGeometry(8.2, 2.4, 4), darkRoof);
  roofA.rotation.y = Math.PI / 4;
  roofA.position.y = 5.6;
  roofA.scale.set(1, 1, 0.78);
  const roofB = new THREE.Mesh(new THREE.ConeGeometry(5.4, 1.7, 4), darkRoof);
  roofB.rotation.y = Math.PI / 4;
  roofB.position.y = 7.2;
  roofB.scale.set(1, 1, 0.78);
  palace.add(roofA, roofB);
  // 挑檐翘角
  for (const [ex, ez] of [[-5.6, -4.4], [5.6, -4.4], [-5.6, 4.4], [5.6, 4.4]]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 1.6), darkRoof);
    tip.position.set(ex, 5.2, ez);
    tip.rotation.z = ex > 0 ? -0.35 : 0.35;
    tip.rotation.x = ez > 0 ? 0.35 : -0.35;
    palace.add(tip);
  }
  // 台阶
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 1), stoneMat);
    step.position.set(0, 0.15 + i * 0.3, 6.2 - i * 0.9);
    palace.add(step);
  }
  const palacePos = new THREE.Vector3(96, 0, -96);
  palacePos.y = terrainHeight(palacePos.x, palacePos.z) - 0.3;
  palace.position.copy(palacePos);
  palace.rotation.y = -0.7;
  scene.add(palace);

  // ---------- 秘境洞府入口（正东岩壁） ----------
  const cave = new THREE.Group();
  const caveX = 150, caveZ = 20;
  const caveY = terrainHeight(caveX, caveZ);
  // 崖壁拱卫巨石
  for (const [ox, oy, oz, sc] of [[-3.2, 1.6, 0, 3.4], [3.2, 1.6, 0, 3.4], [0, 4.6, -0.5, 3.8], [-4.6, 0.8, 1, 2.2], [4.6, 0.8, 1, 2.2]]) {
    const r = new THREE.Mesh(rockGeo, rockMat);
    r.position.set(ox, oy, oz);
    r.scale.setScalar(sc);
    cave.add(r);
  }
  // 幽暗洞口
  const caveMouth = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), new THREE.MeshBasicMaterial({ color: 0x030507 }));
  caveMouth.position.set(0, 1.4, -1.2);
  caveMouth.scale.set(1, 1.15, 0.6);
  cave.add(caveMouth);
  // 洞口灵光
  const caveGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x6fd8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  caveGlow.scale.setScalar(5.5);
  caveGlow.position.set(0, 1.6, 0.4);
  cave.add(caveGlow);
  cave.position.set(caveX, caveY - 0.5, caveZ);
  cave.rotation.y = -Math.PI / 2;
  scene.add(cave);

  // ---------- 发光灵草 ----------
  const HERB = 220;
  const herbs = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({
    map: bladeTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6,
    emissive: 0x36e0a8, emissiveIntensity: 0.55, color: 0x8fe8c8,
  }), HERB);
  let hi = 0;
  for (let i = 0; i < 4000 && hi < HERB; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 20);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 20);
    const rd = riverDist(x, z);
    if (rd > 26 || rd < 8) continue;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.3 || h > 12) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    s.setScalar(0.5 + rng() * 0.7);
    m.compose(new THREE.Vector3(x, h, z), q, s);
    herbs.setMatrixAt(hi++, m);
  }
  herbs.count = hi;
  scene.add(herbs);

  // ---------- 粉紫花树（灵桃/樱花点缀水岸） ----------
  const BLOSSOM = 70;
  let bli = 0;
  for (let i = 0; i < 4000 && bli < BLOSSOM; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const rd = riverDist(x, z);
    if (rd > 30 || rd < 9) continue;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.4 || h > 13 || inSite(x, z, 1.35)) continue;
    forest.add('blossom', x, h, z, rng);
    bli++;
  }
  forest.finalize();
  updaters.push(() => forest.update(focus));

  // ---------- 苔石（河岸苔藓覆盖的圆石） ----------
  const mossMat = new THREE.MeshStandardMaterial({ map: rockTex, color: 0x7fa87a, roughness: 1 });
  const moss = new THREE.InstancedMesh(rockGeo, mossMat, 120);
  let mi = 0;
  for (let i = 0; i < 3000 && mi < 120; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const rd = riverDist(x, z);
    if (rd > 18 || rd < 4) continue;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL - 0.6 || h > WATER_LEVEL + 2.5) continue;
    s.set(0.4 + rng() * 1.4, 0.35 + rng() * 0.9, 0.4 + rng() * 1.4);
    q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    m.compose(new THREE.Vector3(x, h + 0.15, z), q, s);
    moss.setMatrixAt(mi++, m);
  }
  moss.count = mi;
  scene.add(moss);

  // ---------- 发光灵荷（浮在河面的灵光花朵） ----------
  const lotusMat = new THREE.MeshStandardMaterial({
    color: 0xffe8f4, emissive: 0x66f0d8, emissiveIntensity: 0.9, roughness: 0.4,
  });
  const lotusGeo = new THREE.SphereGeometry(0.16, 6, 5).scale(1, 0.55, 1);
  const LOTUS = 90;
  const lotus = new THREE.InstancedMesh(lotusGeo, lotusMat, LOTUS);
  const lotusPos = [];
  let li = 0;
  for (let i = 0; i < 3000 && li < LOTUS; i++) {
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 30);
    const x = riverX(z) + (rng() - 0.5) * 10;
    lotusPos.push({ x, z, ph: rng() * 6.3 });
    q.identity(); s.setScalar(0.7 + rng() * 1.1);
    m.compose(new THREE.Vector3(x, WATER_LEVEL + 0.06, z), q, s);
    lotus.setMatrixAt(li++, m);
  }
  lotus.count = li;
  scene.add(lotus);
  updaters.push((dt, t) => {
    for (let i = 0; i < lotusPos.length; i++) {
      const L = lotusPos[i];
      m.makeTranslation(L.x, WATER_LEVEL + 0.06 + Math.sin(t * 1.1 + L.ph) * 0.08, L.z);
      lotus.setMatrixAt(i, m);
    }
    lotus.instanceMatrix.needsUpdate = true;
  });

  // ---------- 灵蝶（发光小蝶绕花飞舞） ----------
  const flySprites = [];
  const flyColors = [0x8fffe0, 0xa8d8ff, 0xffe8f8, 0xd8ffb0];
  for (let i = 0; i < 26; i++) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: flyColors[i % 4], transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const x = (rng() * 2 - 1) * 120, z = (rng() * 2 - 1) * 120;
    f.userData = { cx: x, cz: z, cy: terrainHeight(x, z) + 1.5 + rng() * 3, ph: rng() * 6.3, r: 3 + rng() * 6, w: 0.6 + rng() * 0.8 };
    f.scale.setScalar(0.28 + rng() * 0.3);
    scene.add(f);
    flySprites.push(f);
  }
  updaters.push((dt, t) => {
    for (const f of flySprites) {
      const u = f.userData;
      f.position.set(
        u.cx + Math.cos(t * u.w + u.ph) * u.r,
        u.cy + Math.sin(t * 1.7 + u.ph) * 0.8,
        u.cz + Math.sin(t * u.w + u.ph) * u.r);
    }
  });

  // ---------- 谷地浓雾层（水面与谷底的流动雾团） ----------
  const mistMat = new THREE.MeshBasicMaterial({
    map: glowTex, color: 0xeef6f4, transparent: true, opacity: 0.2,
    depthWrite: false,
  });
  const mistGeo = new THREE.PlaneGeometry(1, 1);
  const MIST = 60;
  const mists = new THREE.InstancedMesh(mistGeo, mistMat, MIST);
  const mistData = [];
  for (let i = 0; i < MIST; i++) {
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 20);
    const x = riverX(z) + (rng() - 0.5) * 46;
    mistData.push({ x, z, w: 26 + rng() * 40, hgt: 5 + rng() * 8, ph: rng() * 6.3, sp: 0.5 + rng() });
  }
  scene.add(mists);
  updaters.push((dt, t) => {
    for (let i = 0; i < MIST; i++) {
      const c = mistData[i];
      const mx = c.x + Math.sin(t * 0.05 * c.sp + c.ph) * 8;
      m.compose(
        new THREE.Vector3(mx, WATER_LEVEL + 1.5 + Math.sin(t * 0.2 + c.ph), c.z),
        q.identity(),
        s.set(c.w, c.hgt, 1));
      mists.setMatrixAt(i, m);
    }
    mists.instanceMatrix.needsUpdate = true;
  });

  // ---------- 远处群山剪影（多圈层叠，雾化淡出） ----------
  const farMat = new THREE.MeshBasicMaterial({ color: 0x8fa8bc, fog: true });
  for (const [dist, n, rh, rw] of [[320, 14, 90, 160], [430, 11, 130, 230], [560, 8, 175, 300]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.4;
      const mt = new THREE.Mesh(new THREE.ConeGeometry(rw * (0.7 + rng() * 0.5), rh * (0.7 + rng() * 0.6), 6), farMat);
      mt.position.set(Math.cos(a) * dist, rh * 0.3, Math.sin(a) * dist);
      scene.add(mt);
    }
  }

  // ---------- floating islands + 殿阁 ----------
  const islandTop = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
  const islandRock = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: 0.7 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5d3a26, roughness: 0.9 });
  const islandDefs = [
    { x: 40, z: -60, y: 46, r: 11 },
    { x: -70, z: -30, y: 60, r: 14 },
    { x: 70, z: 50, y: 55, r: 9 },
    { x: -30, z: 80, y: 70, r: 12 },
    { x: 10, z: -110, y: 66, r: 10 },
  ];
  const waterfalls = [];
  function buildPavilion(size) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(size, size * 1.1, size * 0.25, 6), islandRock);
    base.position.y = size * 0.12;
    g.add(base);
    for (const [px, pz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.06, size * 0.06, size * 0.9, 5), pillarMat);
      p.position.set(px * size, size * 0.7, pz * size);
      g.add(p);
    }
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(size * 1.25, size * 0.45, 4), roofMat);
    roof1.position.y = size * 1.35;
    roof1.rotation.y = Math.PI / 4;
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(size * 0.7, size * 0.4, 4), roofMat);
    roof2.position.y = size * 1.72;
    roof2.rotation.y = Math.PI / 4;
    g.add(roof1, roof2);
    return g;
  }
  for (const def of islandDefs) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(def.r, def.r * 0.8, 3, 10), islandTop);
    const bottom = new THREE.Mesh(new THREE.ConeGeometry(def.r * 0.82, def.r * 2.2, 8), islandRock);
    bottom.rotation.x = Math.PI;
    bottom.position.y = -(1.5 + def.r * 1.1);
    g.add(top, bottom);
    const t = forest.single(def.r > 11 ? 'pine' : 'blossom', def.r * 0.75);
    t.position.set(def.r * 0.35, 1.4, def.r * 0.25);
    g.add(t);
    g.add(buildPavilion(Math.min(4, def.r * 0.4)).translateX(-def.r * 0.3).translateZ(-def.r * 0.2).translateY(1.5));
    g.position.set(def.x, def.y, def.z);
    scene.add(g);
    updaters.push((dt, t2) => {
      g.position.y = def.y + Math.sin(t2 * 0.3 + def.x) * 1.2;
      g.rotation.y += dt * 0.02;
    });

    const N = 80;
    const wgeo = new THREE.BufferGeometry();
    const wpos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      wpos[i * 3] = def.x + def.r * 0.7 + (Math.random() - 0.5);
      wpos[i * 3 + 1] = def.y - i * 0.6;
      wpos[i * 3 + 2] = def.z + (Math.random() - 0.5);
    }
    wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    const wf = new THREE.Points(wgeo, new THREE.PointsMaterial({
      color: 0xcfeaff, size: 0.45, transparent: true, opacity: 0.75,
      map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(wf);
    waterfalls.push({ wf, baseY: def.y, x: def.x + def.r * 0.7, z: def.z });
  }
  // ---------- 水岸小亭（参考图的散落亭阁） ----------
  for (const [px, pz] of [[-52, 58], [62, 30], [-20, -95], [85, -60]]) {
    const h = terrainHeight(px, pz);
    if (h < WATER_LEVEL + 0.4) continue;
    const pv = buildPavilion(2.6 + rng() * 1.2);
    pv.position.set(px, h, pz);
    pv.rotation.y = rng() * Math.PI * 2;
    scene.add(pv);
  }

  // ---------- 村落 / 祭坛 / 神树 / 神兽（参考图补充） ----------
  const env = { day: 1, night: 0, dusk: 0, sunAlt: 0 };
  const realm = buildRealm(scene, {
    terrainHeight, SITES, riverX, WATER_LEVEL, rockTex, barkTex, glowTex,
    lake: { x: -24, z: -16, r: 30 },
  });
  updaters.push((dt, t) => realm.update(dt, t, env));

  updaters.push((dt) => {
    for (const w of waterfalls) {
      const p = w.wf.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 13;
        if (y < WATER_LEVEL) y = w.baseY - Math.random() * 2;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
  });

  // ---------- clouds ----------
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.65, roughness: 1,
  });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 70);
  const cloudData = [];
  for (let i = 0; i < 70; i++) {
    cloudData.push({
      x: (rng() * 2 - 1) * 260, z: (rng() * 2 - 1) * 260,
      y: 30 + rng() * 60, sx: 7 + rng() * 14, sy: 1.5 + rng() * 2, sz: 5 + rng() * 9,
      speed: 0.8 + rng() * 1.6,
    });
  }
  scene.add(clouds);
  updaters.push((dt) => {
    for (let i = 0; i < cloudData.length; i++) {
      const c = cloudData[i];
      c.x += dt * c.speed;
      if (c.x > 280) c.x = -280;
      m.compose(new THREE.Vector3(c.x, c.y, c.z), q.identity(), s.set(c.sx, c.sy, c.sz));
      clouds.setMatrixAt(i, m);
    }
    clouds.instanceMatrix.needsUpdate = true;
  });

  // ---------- 谷地流云（低空流动雾团） ----------
  const vCloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const vCloudMat = new THREE.MeshStandardMaterial({
    color: 0xf2f6f7, transparent: true, opacity: 0.4, roughness: 1, depthWrite: false,
  });
  const VCLOUDS = 36;
  const vclouds = new THREE.InstancedMesh(vCloudGeo, vCloudMat, VCLOUDS);
  const vcd = [];
  for (let i = 0; i < VCLOUDS; i++) {
    const x = (rng() * 2 - 1) * 200, z = (rng() * 2 - 1) * 200;
    vcd.push({ x, z, y: terrainHeight(x, z) + 4 + rng() * 10, sx: 10 + rng() * 18, sy: 1.6 + rng() * 1.6, sz: 6 + rng() * 10, speed: 0.9 + rng() * 1.4, ph: rng() * 6 });
  }
  scene.add(vclouds);
  updaters.push((dt, t) => {
    for (let i = 0; i < VCLOUDS; i++) {
      const c = vcd[i];
      c.x += dt * c.speed;
      if (c.x > 240) c.x = -240;
      m.compose(new THREE.Vector3(c.x, c.y + Math.sin(t * 0.4 + c.ph) * 1.5, c.z), q.identity(), s.set(c.sx, c.sy, c.sz));
      vclouds.setMatrixAt(i, m);
    }
    vclouds.instanceMatrix.needsUpdate = true;
  });

  // ---------- 丁达尔光束（云隙阳光光柱，随太阳方向） ----------
  const shaftTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 64;
    const g2 = c.getContext('2d');
    const gr = g2.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,246,220,0.85)');
    gr.addColorStop(0.6, 'rgba(255,246,220,0.25)');
    gr.addColorStop(1, 'rgba(255,246,220,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const shafts = new THREE.Group();
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaftTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 6; i++) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(6 + rng() * 9, 160), shaftMat);
    sh.position.set(-80 + rng() * 160, 70 + rng() * 30, -80 + rng() * 160);
    sh.rotation.y = rng() * Math.PI;
    shafts.add(sh);
  }
  scene.add(shafts);

  // ---------- 空中灵纹（漂浮发光符文） ----------
  const runeTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g2 = c.getContext('2d');
    g2.strokeStyle = '#ffffff'; g2.lineWidth = 3; g2.lineCap = 'round';
    const r2 = mulberry32(5);
    for (let i = 0; i < 4; i++) {
      g2.beginPath();
      g2.moveTo(8 + r2() * 32, 8 + r2() * 32);
      g2.quadraticCurveTo(8 + r2() * 32, 8 + r2() * 32, 8 + r2() * 32, 8 + r2() * 32);
      g2.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const runes = [];
  const runeColors = [0x7fe8c0, 0x9fd0ff, 0xffe9a8];
  for (let i = 0; i < 42; i++) {
    const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: runeTex, color: runeColors[i % 3], transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const x = (rng() * 2 - 1) * WORLD_RADIUS, z = (rng() * 2 - 1) * WORLD_RADIUS;
    sp2.position.set(x, terrainHeight(x, z) + 2 + rng() * 14, z);
    sp2.scale.setScalar(0.5 + rng() * 0.9);
    sp2.userData = { ph: rng() * 6.3, y0: sp2.position.y, rot: (rng() - 0.5) * 0.8 };
    scene.add(sp2);
    runes.push(sp2);
  }
  updaters.push((dt, t) => {
    for (const sp2 of runes) {
      sp2.position.y = sp2.userData.y0 + Math.sin(t * 0.5 + sp2.userData.ph) * 1.2;
      sp2.material.rotation += dt * sp2.userData.rot;
    }
  });

  // ---------- 灵气粒子 ----------
  const MOTES = 600;
  const moteGeo = new THREE.BufferGeometry();
  const mpos = new Float32Array(MOTES * 3);
  const mphase = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    const x = (rng() * 2 - 1) * WORLD_RADIUS;
    const z = (rng() * 2 - 1) * WORLD_RADIUS;
    mpos[i * 3] = x;
    mpos[i * 3 + 1] = terrainHeight(x, z) + 0.5 + rng() * 7;
    mpos[i * 3 + 2] = z;
    mphase[i] = rng() * Math.PI * 2;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xaef0c8, size: 0.35, transparent: true, opacity: 0.85,
    map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);
  const moteBase = mpos.slice();
  updaters.push((dt, t) => {
    const p = moteGeo.attributes.position;
    for (let i = 0; i < MOTES; i++) {
      p.array[i * 3 + 1] = moteBase[i * 3 + 1] + Math.sin(t * 0.8 + mphase[i]) * 0.8;
    }
    p.needsUpdate = true;
  });

  // ---------- 昼夜循环 ----------
  let dayTime = 0.32; // 清晨
  const sunDir = new THREE.Vector3();
  const shadowAnchor = new THREE.Vector3();
  const fogDay = new THREE.Color(0xb9d3cd);
  const fogDusk = new THREE.Color(0xcf9d76);
  const fogNight = new THREE.Color(0x0a1420);
  const sunDay = new THREE.Color(0xfff2d5);
  const sunDusk = new THREE.Color(0xff9440);
  const moonLight = new THREE.Color(0x9db8ff);
  const tmpC = new THREE.Color();

  function updateDayNight(dt) {
    dayTime = (dayTime + dt / DAY_SECONDS) % 1;
    const a = (dayTime - 0.25) * Math.PI * 2;          // 0.25 日出, 0.5 正午
    const sunAlt = Math.sin(a);                        // -1..1
    sunDir.set(Math.cos(a) * 0.55, sunAlt, Math.cos(a) * 0.55 + 0.4).normalize();

    const day = THREE.MathUtils.smoothstep(sunAlt, -0.04, 0.18);
    const dusk = Math.max(0, 1 - Math.abs(sunAlt) / 0.22) * day;
    const night = 1 - day;

    // sun / moon 位置与光照（光源跟随玩家锚点，阴影只算近场）
    const moonDir = sunDir.clone().negate();
    const lightDir = sunAlt > -0.05 ? sunDir : moonDir;
    sun.position.copy(shadowAnchor).addScaledVector(lightDir, 180);
    sun.target.position.copy(shadowAnchor);
    if (sunAlt > -0.05) {
      sun.color.lerpColors(sunDusk, sunDay, day);
      sun.intensity = 0.3 + day * 2.7;
    } else {
      sun.color.copy(moonLight);
      sun.intensity = 0.35;
    }
    hemi.intensity = 0.25 + day * 0.9;
    hemi.color.lerpColors(new THREE.Color(0x223a66), new THREE.Color(0xbfe6ff), day);
    hemi.groundColor.lerpColors(new THREE.Color(0x0a0f1a), new THREE.Color(0x2e4d3a), day);

    // sky
    u.sunPosition.value.copy(sunDir);
    u.rayleigh.value = 1.8 - night * 1.2;
    u.mieCoefficient.value = 0.006 + dusk * 0.03;

    // moon & stars
    moon.position.copy(moonDir).multiplyScalar(1100);
    moon.material.opacity = 1;
    moonGlow.material.opacity = night * 0.5;
    stars.material.opacity = night * 0.95;

    // fog / exposure / clouds
    tmpC.copy(fogNight).lerp(fogDay, day).lerp(fogDusk, dusk * 0.7);
    scene.fog.color.copy(tmpC);
    scene.fog.near = 90 - night * 30;
    scene.fog.far = 950 - night * 300;
    renderer.toneMappingExposure = 0.62 + day * 0.55;
    cloudMat.color.setScalar(0.25 + day * 0.75);
    // 谷地浓雾（参考图的水面雾层）：白天浓、夜里淡
    mistMat.opacity = 0.06 + day * 0.2;
    // 灵蝶白天飞舞（夜里收拢变暗）
    for (const b of flySprites) b.material.opacity = 0.15 + day * 0.6;

    // water
    water.material.uniforms.sunDirection.value.copy(sunDir);
    water.material.uniforms.sunColor.value.lerpColors(
      new THREE.Color(0x1a2433), new THREE.Color(0xffffff), day);
    water.material.uniforms.waterColor.value.lerpColors(
      new THREE.Color(0x04101c), new THREE.Color(0x2e8f7d), day);
    water.material.uniforms.time.value += dt;

    // 灵气夜间更亮
    moteMat.size = 0.35 + night * 0.2;
    moteMat.opacity = 0.6 + night * 0.4;

    // 丁达尔光束：白天可见，随太阳角度偏向
    shaftMat.opacity = day * 0.22 * Math.max(0, sunAlt);
    // 灵纹：昼夜皆可，夜间更亮
    for (const sp2 of runes) sp2.material.opacity = 0.25 + night * 0.55;
    // 谷地流云夜间变淡
    vCloudMat.opacity = 0.12 + day * 0.3;
    // 洞府灵光夜间更亮
    caveGlow.material.opacity = 0.35 + night * 0.45;
    env.day = day; env.night = night; env.dusk = dusk; env.sunAlt = sunAlt;

    window.__setDay = (v) => { dayTime = v; };
    return { dayTime, night, day, dusk, sunAlt };
  }

  forest.update(focus, true);

  return {
    terrainHeight,
    forest,
    setFocus(v) { focus.copy(v); },
    landmarks: realm.landmarks,
    dragon: realm.dragon,
    phoenix: realm.phoenix,
    sun,
    setShadowAnchor(v) { shadowAnchor.copy(v); },
    setShadowMapSize(n) {
      sun.castShadow = n > 0;
      if (n > 0) {
        sun.shadow.mapSize.set(n, n);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
    },
    update(dt, t) {
      foliageUniforms.uTime.value = t;
      for (const f of updaters) f(dt, t);
      return updateDayNight(dt);
    },
  };
}

// 批量标记阴影：受光照实体网格才投影；发光/透明体不投影
export function applyShadowFlags(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const lit = mats.some((m) => m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial));
    const glow = mats.some((m) => m && (m.transparent || m.blending === THREE.AdditiveBlending));
    o.castShadow = lit && !glow && !o.userData.noShadowCast;
    if (lit) o.receiveShadow = true;
  });
}

// 圆形径向渐变光点贴图（粒子用）
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
