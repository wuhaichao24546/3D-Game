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

export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = 4 + fbm(x * 0.012, z * 0.012, 4) * 14;
  h += fbm(x * 0.045 + 99, z * 0.045 - 99, 3) * 2.2;
  const ring = Math.max(0, (d - 130) / 60);
  h += ring * ring * 22;
  h -= Math.max(0, 1 - d / 70) * 5;
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

  scene.fog = new THREE.Fog(0xbfd9d4, 80, 500);

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
    scene.fog.near = 80 - night * 30;
    scene.fog.far = 500 - night * 180;
    renderer.toneMappingExposure = 0.55 + day * 0.45;
    cloudMat.color.setScalar(0.25 + day * 0.75);

    // water
    water.material.uniforms.sunDirection.value.copy(sunDir);
    water.material.uniforms.sunColor.value.lerpColors(
      new THREE.Color(0x1a2433), new THREE.Color(0xffffff), day);
    water.material.uniforms.waterColor.value.lerpColors(
      new THREE.Color(0x04101c), new THREE.Color(0x0d3841), day);
    water.material.uniforms.time.value += dt;

    // 灵气夜间更亮
    moteMat.size = 0.35 + night * 0.2;
    moteMat.opacity = 0.6 + night * 0.4;

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
