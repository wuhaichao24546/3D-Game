import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

export function terrainHeight(x, z) {
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
  scene.add(sun);
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

  const terrainMat = new THREE.MeshStandardMaterial({
    map: grassTex, roughness: 1, metalness: 0,
  });
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.tRock = { value: rockTex };
    shader.uniforms.tDirt = { value: dirtTex };
    shader.uniforms.tSand = { value: sandTex };
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
        uniform sampler2D tRock;
        uniform sampler2D tDirt;
        uniform sampler2D tSand;
        uniform float uWater;`)
      .replace('#include <map_fragment>', `
        vec2 tuv = vWPos.xz * 0.12;
        vec3 cGrass = texture2D(map, tuv).rgb;
        vec3 cRock = texture2D(tRock, tuv * 0.6).rgb;
        vec3 cSand = texture2D(tSand, tuv * 1.8).rgb;
        vec3 cDirt = texture2D(tDirt, tuv * 1.3).rgb;
        float slope = 1.0 - vWNormal.y;
        float rockW = smoothstep(0.32, 0.6, slope + smoothstep(14.0, 30.0, vWPos.y) * 0.5);
        float sandW = smoothstep(uWater + 1.1, uWater + 0.15, vWPos.y);
        float dirtW = smoothstep(0.10, 0.3, slope) * (1.0 - rockW) * 0.6;
        vec3 terr = mix(mix(mix(cGrass, cDirt, dirtW), cSand, sandW), cRock, rockW);
        // 大尺度明暗变化，打破贴图重复感
        float macro = 0.9 + 0.2 * sin(vWPos.x * 0.013 + vWPos.z * 0.017) * sin(vWPos.x * 0.007 - vWPos.z * 0.011);
        diffuseColor.rgb = terr * macro * 1.05;
      `);
  };
  const terrain = new THREE.Mesh(geo, terrainMat);
  scene.add(terrain);

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
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 3.2, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 1 });
  // canopy: 三段锥体叠成的松树冠
  const canopyGeo = mergeGeometries([
    new THREE.ConeGeometry(1.9, 2.6, 8).translate(0, 3.4, 0),
    new THREE.ConeGeometry(1.45, 2.2, 8).translate(0, 4.9, 0),
    new THREE.ConeGeometry(0.95, 1.7, 8).translate(0, 6.2, 0),
  ]);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x35714a, roughness: 1 });
  const MAX_TREES = 380;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, MAX_TREES);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, MAX_TREES);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const cTint = new THREE.Color();
  let ti = 0;
  for (let i = 0; i < 3200 && ti < MAX_TREES; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.8 || h > 17) continue;
    const sc = 0.7 + rng() * 1.5;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.setScalar(sc);
    m.compose(new THREE.Vector3(x, h + 1.5 * sc, z), q, s);
    trunks.setMatrixAt(ti, m);
    m.compose(new THREE.Vector3(x, h, z), q, s);
    canopies.setMatrixAt(ti, m);
    canopies.setColorAt(ti, cTint.setHSL(0.34 + rng() * 0.05, 0.45, 0.34 + rng() * 0.14));
    ti++;
  }
  trunks.count = canopies.count = ti;
  scene.add(trunks, canopies);

  // ---------- rocks ----------
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1 });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 200);
  let ri = 0;
  for (let i = 0; i < 900 && ri < 200; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 10);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 10);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL) continue;
    s.set(0.5 + rng() * 1.8, 0.4 + rng() * 1.2, 0.5 + rng() * 1.8);
    q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    m.compose(new THREE.Vector3(x, h + 0.1, z), q, s);
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
  const TUFTS = 2500;
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
  scene.add(tufts);

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
    if (h < WATER_LEVEL + 0.5 || h > 13 || riverDist(x, z) < 10) continue;
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
  const blossomMat = new THREE.MeshStandardMaterial({ color: 0xe8a8c8, roughness: 1 });
  const BLOSSOM = 90;
  const btrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, BLOSSOM);
  const bcanopies = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1.9, 8, 6).translate(0, 4.6, 0), blossomMat, BLOSSOM);
  let bli = 0;
  for (let i = 0; i < 4000 && bli < BLOSSOM; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const rd = riverDist(x, z);
    if (rd > 30 || rd < 9) continue;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.4 || h > 13) continue;
    const sc = 0.6 + rng() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.setScalar(sc);
    m.compose(new THREE.Vector3(x, h + 1.5 * sc, z), q, s);
    btrunks.setMatrixAt(bli, m);
    m.compose(new THREE.Vector3(x, h, z), q, s);
    bcanopies.setMatrixAt(bli, m);
    bcanopies.setColorAt(bli, cTint.setHSL(0.85 + rng() * 0.12, 0.55, 0.6 + rng() * 0.15));
    bli++;
  }
  btrunks.count = bcanopies.count = bli;
  scene.add(btrunks, bcanopies);

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
    const t = new THREE.Mesh(canopyGeo, canopyMat);
    t.position.set(def.r * 0.35, 1.5, def.r * 0.25);
    t.scale.setScalar(0.6);
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

    // sun / moon 位置与光照
    const moonDir = sunDir.clone().negate();
    if (sunAlt > -0.05) {
      sun.position.copy(sunDir).multiplyScalar(180);
      sun.color.lerpColors(sunDusk, sunDay, day);
      sun.intensity = 0.3 + day * 2.7;
    } else {
      sun.position.copy(moonDir).multiplyScalar(180);
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
    mistMat.opacity = 0.08 + day * 0.34;
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

    window.__setDay = (v) => { dayTime = v; };
    return { dayTime, night, day, dusk, sunAlt };
  }

  return {
    terrainHeight,
    update(dt, t) {
      for (const f of updaters) f(dt, t);
      return updateDayNight(dt);
    },
  };
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
