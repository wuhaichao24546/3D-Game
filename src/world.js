import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { Sky } from 'three/addons/objects/Sky.js';

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

// Single source of truth for ground height.
export const WORLD_RADIUS = 190;
export const WATER_LEVEL = 2.1;

export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = 4 + fbm(x * 0.012, z * 0.012, 4) * 14;
  // gentle rolling mid-field
  h += fbm(x * 0.045 + 99, z * 0.045 - 99, 3) * 2.2;
  // ring of high mountains toward the edge
  const ring = Math.max(0, (d - 130) / 60);
  h += ring * ring * 22;
  // keep a mild basin around the center so a lake can form
  h -= Math.max(0, 1 - d / 70) * 5;
  return h;
}

// --------------------------------------------------------------------------
export function buildWorld(scene) {
  const updaters = [];

  scene.fog = new THREE.Fog(0xbfd9d4, 90, 420);

  // --- lighting ---
  const sun = new THREE.DirectionalLight(0xfff2d5, 2.6);
  sun.position.set(-80, 120, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x2e4d3a, 0.9));

  // --- sky ---
  const sky = new Sky();
  sky.scale.setScalar(2000);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 2.2;
  u.mieCoefficient.value = 0.008;
  u.mieDirectionalG.value = 0.85;
  const sunPos = new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(140)
  );
  u.sunPosition.value.copy(sunPos);
  scene.add(sky);

  // --- terrain ---
  const SIZE = WORLD_RADIUS * 2, SEG = 160;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x4c9a5f);
  const cHigh = new THREE.Color(0x8a9a8f);   // rocky peaks
  const cLow = new THREE.Color(0x3d7a52);
  const cSand = new THREE.Color(0x9c8f6a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    if (h < WATER_LEVEL + 0.6) tmp.copy(cSand);
    else if (h > 18) tmp.copy(cHigh);
    else tmp.lerpColors(cLow, cGrass, THREE.MathUtils.clamp((h - WATER_LEVEL) / 10, 0, 1));
    // slight hue variation
    tmp.offsetHSL(0, 0, (mulberry32(i)() - 0.5) * 0.03);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })
  );
  scene.add(terrain);

  // --- water ---
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS, 64).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: 0x2e7f86, transparent: true, opacity: 0.78,
      roughness: 0.15, metalness: 0.1,
    })
  );
  water.position.y = WATER_LEVEL;
  scene.add(water);
  updaters.push((dt, t) => {
    water.position.y = WATER_LEVEL + Math.sin(t * 0.4) * 0.05;
  });

  // --- trees (instanced) ---
  const rng = mulberry32(2024);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.6, 5);
  const canopyGeo = new THREE.ConeGeometry(1.5, 3.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f7d4f, flatShading: true });
  const MAX_TREES = 350;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, MAX_TREES);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, MAX_TREES);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let ti = 0;
  for (let i = 0; i < 3000 && ti < MAX_TREES; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 15);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.8 || h > 17) continue;
    const sc = 0.8 + rng() * 1.4;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.setScalar(sc);
    m.compose(new THREE.Vector3(x, h + 1.3 * sc, z), q, s);
    trunks.setMatrixAt(ti, m);
    m.compose(new THREE.Vector3(x, h + (2.6 + 1.6) * sc, z), q, s);
    canopies.setMatrixAt(ti, m);
    ti++;
  }
  trunks.count = canopies.count = ti;
  scene.add(trunks, canopies);

  // --- rocks ---
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d8a86, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 160);
  let ri = 0;
  for (let i = 0; i < 800 && ri < 160; i++) {
    const x = (rng() * 2 - 1) * (WORLD_RADIUS - 10);
    const z = (rng() * 2 - 1) * (WORLD_RADIUS - 10);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL) continue;
    s.set(0.5 + rng() * 1.6, 0.4 + rng() * 1.1, 0.5 + rng() * 1.6);
    q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    m.compose(new THREE.Vector3(x, h + 0.1, z), q, s);
    rocks.setMatrixAt(ri++, m);
  }
  rocks.count = ri;
  scene.add(rocks);

  // --- floating immortal islands ---
  const islandGroup = new THREE.Group();
  const islandTop = new THREE.MeshStandardMaterial({ color: 0x53a06b, flatShading: true });
  const islandRock = new THREE.MeshStandardMaterial({ color: 0x8d8577, flatShading: true });
  const islandDefs = [
    { x: 40, z: -60, y: 46, r: 11 },
    { x: -70, z: -30, y: 60, r: 14 },
    { x: 70, z: 50, y: 55, r: 9 },
    { x: -30, z: 80, y: 70, r: 12 },
    { x: 10, z: -110, y: 66, r: 10 },
  ];
  const waterfalls = [];
  for (const def of islandDefs) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(def.r, def.r * 0.8, 3, 8), islandTop);
    const bottom = new THREE.Mesh(new THREE.ConeGeometry(def.r * 0.82, def.r * 2.2, 8), islandRock);
    bottom.rotation.x = Math.PI;
    bottom.position.y = -(1.5 + def.r * 1.1);
    g.add(top, bottom);
    // a tree + a small pavilion-ish rock on top
    const t = new THREE.Mesh(canopyGeo, canopyMat);
    t.position.set(def.r * 0.3, 3.6, def.r * 0.2);
    g.add(t);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.setScalar(2);
    rock.position.set(-def.r * 0.35, 2.2, -def.r * 0.3);
    g.add(rock);
    g.position.set(def.x, def.y, def.z);
    islandGroup.add(g);
    updaters.push((dt, t2) => {
      g.position.y = def.y + Math.sin(t2 * 0.3 + def.x) * 1.2;
      g.rotation.y += dt * 0.02;
    });

    // waterfall: falling particle column
    const N = 60;
    const wgeo = new THREE.BufferGeometry();
    const wpos = new Float32Array(N * 3);
    const wseed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      wpos[i * 3] = def.x + def.r * 0.7;
      wpos[i * 3 + 1] = def.y - i * 0.8;
      wpos[i * 3 + 2] = def.z;
      wseed[i] = i * 0.8;
    }
    wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    const wmat = new THREE.PointsMaterial({ color: 0xbfeaff, size: 0.5, transparent: true, opacity: 0.7 });
    const wf = new THREE.Points(wgeo, wmat);
    scene.add(wf);
    waterfalls.push({ wf, baseY: def.y, x: def.x + def.r * 0.7, z: def.z, span: def.y - WATER_LEVEL });
  }
  scene.add(islandGroup);
  updaters.push((dt, t) => {
    for (const w of waterfalls) {
      const p = w.wf.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 12;
        if (y < WATER_LEVEL) y = w.baseY - Math.random() * 2;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
  });

  // --- drifting clouds ---
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.82, flatShading: true, roughness: 1,
  });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 70);
  const cloudData = [];
  for (let i = 0; i < 70; i++) {
    cloudData.push({
      x: (rng() * 2 - 1) * 260, z: (rng() * 2 - 1) * 260,
      y: 30 + rng() * 60, sx: 6 + rng() * 12, sy: 1.6 + rng() * 2.2, sz: 4 + rng() * 8,
      speed: 0.8 + rng() * 1.6,
    });
  }
  scene.add(clouds);
  updaters.push((dt) => {
    for (let i = 0; i < cloudData.length; i++) {
      const c = cloudData[i];
      c.x += dt * c.speed;
      if (c.x > 280) c.x = -280;
      m.compose(
        new THREE.Vector3(c.x, c.y, c.z),
        q.identity(),
        s.set(c.sx, c.sy, c.sz)
      );
      clouds.setMatrixAt(i, m);
    }
    clouds.instanceMatrix.needsUpdate = true;
  });

  // --- ambient spirit motes (灵气) ---
  const MOTES = 500;
  const moteGeo = new THREE.BufferGeometry();
  const mpos = new Float32Array(MOTES * 3);
  const mphase = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    const x = (rng() * 2 - 1) * WORLD_RADIUS;
    const z = (rng() * 2 - 1) * WORLD_RADIUS;
    mpos[i * 3] = x;
    mpos[i * 3 + 1] = terrainHeight(x, z) + 0.5 + rng() * 6;
    mpos[i * 3 + 2] = z;
    mphase[i] = rng() * Math.PI * 2;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xaef0c8, size: 0.35, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(motes);
  const moteBase = mpos.slice();
  updaters.push((dt, t) => {
    const p = moteGeo.attributes.position;
    for (let i = 0; i < MOTES; i++) {
      p.array[i * 3 + 1] = moteBase[i * 3 + 1] + Math.sin(t * 0.8 + mphase[i]) * 0.8;
    }
    p.needsUpdate = true;
  });

  return {
    terrainHeight,
    update(dt, t) { for (const f of updaters) f(dt, t); },
  };
}
