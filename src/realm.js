import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  mulberry, woodTex, thatchTex, tileTex, wovenTex, latticeTex, talismanTex, runeCircleTex,
  glyphColumnTex, willowTex, reliefTex, columnGradTex, rainbowTex, flameTex,
} from './tex.js';
import { buildDragon, buildPhoenix, buildTiger, buildQilin, buildDeer, buildSpiritFox } from './divine.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
const additive = (o) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...o });

// 把静态组按材质合并成少量网格，大幅减少 draw call
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const keep = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material) || o.userData.dynamic) { keep.push(o); return; }
    const g = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const geo = g.index ? g : g;
    geo.clearGroups();
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo.index ? geo : geo);
  });
  const out = new THREE.Group();
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  for (const [mat, geos] of buckets) {
    const idx = geos.filter((g) => g.index), non = geos.filter((g) => !g.index);
    for (const list of [idx, non]) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      if (merged) out.add(new THREE.Mesh(merged, mat));
    }
  }
  for (const o of keep) {
    o.updateMatrixWorld(true);
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    o.removeFromParent();
    m.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

export function buildRealm(scene, ctx) {
  const { terrainHeight, SITES, riverX, WATER_LEVEL, rockTex, barkTex, glowTex, lake } = ctx;
  const rng = mulberry(4242);
  const updaters = [];
  const nightMats = []; // [material, base, nightBoost]
  const landmarks = [];

  // ---------- 材质 ----------
  const wt = woodTex(); wt.repeat.set(2, 1);
  const wood = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.95 });
  const darkWood = new THREE.MeshStandardMaterial({ map: wt, color: 0x6a5a4a, roughness: 0.95 });
  const tt = thatchTex(); tt.repeat.set(2, 1.5);
  const thatch = new THREE.MeshStandardMaterial({ map: tt, roughness: 1 });
  const tileT = tileTex(); tileT.repeat.set(3, 2);
  const tiles = new THREE.MeshStandardMaterial({ map: tileT, roughness: 0.75 });
  const wv = wovenTex(); wv.repeat.set(3, 2);
  const woven = new THREE.MeshStandardMaterial({ map: wv, roughness: 0.95 });
  const lattice = new THREE.MeshStandardMaterial({ map: latticeTex(), roughness: 1, emissive: 0x000000 });
  const stone = new THREE.MeshStandardMaterial({ map: rockTex, color: 0xa8a49a, roughness: 1 });
  const mossStone = new THREE.MeshStandardMaterial({ map: rockTex, color: 0x87987a, roughness: 1 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x3e2c1e, roughness: 1 });
  const crop = new THREE.MeshStandardMaterial({ color: 0x4f8f3c, roughness: 0.9 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x0b0806 });
  const bark = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x9a8a78, roughness: 1 });
  const bamboo = new THREE.MeshStandardMaterial({ color: 0x8aa858, roughness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 0.8, roughness: 0.35 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 0.3 });
  nightMats.push([lampMat, 0.3, 2.2], [lattice, 0, 0]);
  const flameT = flameTex();

  // 炊烟
  const smokeMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xdedede, transparent: true, opacity: 0.35, depthWrite: false });
  const smokes = [];
  function addSmoke(p) {
    for (let k = 0; k < 9; k++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.userData = { base: p.clone(), ph: k / 9 };
      scene.add(s); smokes.push(s);
    }
  }
  updaters.push((dt, t) => {
    for (const s of smokes) {
      const k = (t * 0.08 + s.userData.ph) % 1;
      s.position.copy(s.userData.base).add(V(Math.sin(k * 6 + s.userData.ph * 9) * 0.8 + k * 2.5, k * 13, k * 0.8));
      s.scale.setScalar(0.8 + k * 4.5);
      s.material.opacity = (1 - k) * 0.32;
    }
  });

  // 人字坡屋顶
  function gableRoof(g, w, d, h, mat, over = 0.8, pitch = 0.62) {
    const half = d / 2 + over;
    const rise = Math.tan(pitch) * half;
    const L = half / Math.cos(pitch);
    for (const s of [-1, 1]) {
      const slab = mesh(new THREE.BoxGeometry(w + over * 2, 0.28, L), mat, 0, h + rise / 2 - 0.1, s * half / 2);
      slab.rotation.x = s * pitch;
      g.add(slab);
    }
    const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, Math.tan(pitch) * d / 2)]);
    const triGeo = new THREE.ShapeGeometry(tri);
    for (const s of [-1, 1]) {
      const m = mesh(triGeo, wood, s * w / 2, h, 0);
      m.rotation.y = s * Math.PI / 2;
      m.material = wood;
      g.add(m);
      const back = mesh(triGeo, wood, s * w / 2 * 0.995, h, 0);
      back.rotation.y = -s * Math.PI / 2;
      g.add(back);
    }
    return rise;
  }

  // ---------- 茅草屋 ----------
  function thatchHouse(w = 6, d = 4.5, h = 2.8) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(w + 0.8, 0.45, d + 0.8), stone, 0, 0.22, 0));
    g.add(mesh(new THREE.BoxGeometry(w, h, d), wood, 0, 0.45 + h / 2, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.CylinderGeometry(0.14, 0.16, h + 0.2, 7), darkWood, x * w / 2, 0.45 + h / 2, z * d / 2));
    g.add(mesh(new THREE.BoxGeometry(1.1, 2.0, 0.1), dark, -w * 0.18, 1.45, d / 2 + 0.03));
    for (const x of [w * 0.22]) g.add(mesh(new THREE.PlaneGeometry(1.2, 0.9), lattice, x, 2.0, d / 2 + 0.06));
    g.add(mesh(new THREE.PlaneGeometry(0.9, 0.8), lattice, w / 2 + 0.06, 2.0, 0).rotateY(Math.PI / 2));
    // 前廊
    g.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.15, 1.5), darkWood, 0, 0.5, d / 2 + 0.75));
    for (const x of [-w / 2, w / 2]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, h, 6), darkWood, x, 0.45 + h / 2, d / 2 + 1.4));
    gableRoof(g, w, d + 1.6, h + 0.45, thatch, 0.7, 0.6);
    g.children[g.children.length - 1].position.z += 0; // keep
    const ridge = mesh(new THREE.CylinderGeometry(0.22, 0.22, w + 1.6, 8), thatch, 0, h + 0.45 + Math.tan(0.6) * ((d + 1.6) / 2 + 0.7) - 0.05, 0);
    ridge.rotation.z = Math.PI / 2;
    g.add(ridge);
    // 门口杂物：陶罐 / 竹篮 / 葫芦灯
    for (let k = 0; k < 3; k++) {
      const jar = mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.6 }), w * 0.3 + k * 0.6, 0.75, d / 2 + 1.1);
      jar.scale.y = 1.2;
      g.add(jar);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.4, 10, 1, true), woven, -w * 0.38, 0.78, d / 2 + 1.0));
    const lamp = mesh(new THREE.SphereGeometry(0.2, 10, 8), lampMat, -w * 0.18 + 0.9, 2.55, d / 2 + 1.3);
    lamp.scale.y = 1.3;
    g.add(lamp);
    const chimney = mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), stone, w * 0.25, h + 2.2, -d * 0.2);
    g.add(chimney);
    return { g, smoke: V(w * 0.25, h + 3, -d * 0.2) };
  }

  // ---------- 垂柳 ----------
  const wTex = willowTex();
  const willowMat = new THREE.MeshStandardMaterial({ map: wTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 });
  const willowMass = new THREE.MeshStandardMaterial({ color: 0x5e8a30, roughness: 1 });
  const willows = [];
  function willow(x, z, sc = 1) {
    const g = new THREE.Group();
    const y = terrainHeight(x, z);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, -0.5, 0), V(0.4, 2, 0.2), V(-0.2, 4, 0.5), V(0.3, 6.2, 0)]), 16, 0.55, 9), bark));
    for (const [bx, bz] of [[2.2, 0.5], [-2, 0.8], [0.4, -2.2], [-0.8, 2]]) {
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.2, 5.4, 0.1), V(bx * 0.5, 6.8, bz * 0.5), V(bx, 7.6, bz)]), 8, 0.2, 6), bark));
    }
    const mass = mesh(new THREE.SphereGeometry(3.4, 12, 9), willowMass, 0, 7.4, 0); mass.scale.set(1, 0.55, 1);
    g.add(mass);
    const strands = new THREE.Group();
    for (let k = 0; k < 46; k++) {
      const a = (k / 46) * Math.PI * 2 + rng() * 0.3, r = 1.2 + rng() * 2.8;
      const len = 4 + rng() * 3.5;
      const p = mesh(new THREE.PlaneGeometry(2.2, len).translate(0, -len / 2, 0), willowMat, Math.cos(a) * r, 8 - rng() * 0.6, Math.sin(a) * r);
      p.rotation.y = -a + Math.PI / 2 + (rng() - 0.5) * 0.6;
      strands.add(p);
    }
    g.add(strands);
    g.position.set(x, y, z);
    g.scale.setScalar(sc);
    scene.add(g);
    willows.push(strands);
  }
  updaters.push((dt, t) => {
    for (let i = 0; i < willows.length; i++) {
      const s = willows[i];
      for (let k = 0; k < s.children.length; k++) s.children[k].rotation.x = Math.sin(t * 1.1 + k * 0.7 + i) * 0.06;
    }
  });

  // ================= 青溪村 =================
  {
    const S = SITES.village;
    const village = new THREE.Group();
    const houses = [
      [38, 54, -1.75, 6.5, 4.6], [50, 56, -1.45, 5.6, 4.2], [60, 69, -1.6, 6.2, 4.4],
      [38, 92, -1.4, 6, 4.4], [52, 95, -1.75, 5.4, 4], [61, 84, -1.85, 6.6, 4.8],
    ];
    const smokePts = [];
    for (const [x, z, rot, w, d] of houses) {
      const { g, smoke } = thatchHouse(w, d, 2.7 + rng() * 0.4);
      g.position.set(x - S.x, terrainHeight(x, z) - S.h - 0.15, z - S.z);
      g.rotation.y = rot;
      village.add(g);
      g.updateMatrixWorld(true);
      smokePts.push(smoke.applyMatrix4(g.matrix).add(V(S.x, S.h, S.z)));
    }
    // 菜畦 + 竹篱
    const cropGeo = new THREE.IcosahedronGeometry(0.28, 0);
    const cropsIM = new THREE.InstancedMesh(cropGeo, crop, 420);
    let ci = 0;
    const m4 = new THREE.Matrix4();
    const plots = [[44, 66, 7, 4.5], [45, 78, 8, 4], [55, 76, 4.5, 6]];
    for (const [px, pz, pw, pd] of plots) {
      const lx = px - S.x, lz = pz - S.z;
      village.add(mesh(new THREE.BoxGeometry(pw, 0.25, pd), soil, lx, 0.1, lz));
      for (let r = 0; r < pd / 0.9 - 1; r++) for (let c = 0; c < pw / 0.7 - 1; c++) {
        if (ci >= 420) break;
        m4.compose(V(px - pw / 2 + 0.7 + c * 0.7, S.h + 0.35, pz - pd / 2 + 0.7 + r * 0.9), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng() * 3, 0)), V(1, 0.7 + rng() * 0.6, 1));
        cropsIM.setMatrixAt(ci, m4);
        cropsIM.setColorAt(ci++, new THREE.Color().setHSL(0.25 + rng() * 0.08, 0.5, 0.3 + rng() * 0.15));
      }
      // 篱笆
      const fx = pw / 2 + 0.5, fz = pd / 2 + 0.5;
      const edges = [[-fx, -fz, fx, -fz], [fx, -fz, fx, fz], [fx, fz, -fx, fz], [-fx, fz, -fx, -fz]];
      for (const [x0, z0, x1, z1] of edges) {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.ceil(len / 1.1);
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          village.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 5), darkWood, lx + x0 + (x1 - x0) * t, 0.55, lz + z0 + (z1 - z0) * t));
        }
        const panel = mesh(new THREE.BoxGeometry(len, 0.6, 0.06), woven, lx + (x0 + x1) / 2, 0.55, lz + (z0 + z1) / 2);
        panel.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        village.add(panel);
      }
    }
    cropsIM.count = ci;
    scene.add(cropsIM);
    // 石磨
    const mill = new THREE.Group();
    mill.add(mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.7, 20), stone, 0, 0.35, 0));
    const wheel = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.65, 20), stone, 0, 1.55, 0); wheel.rotation.z = Math.PI / 2;
    mill.add(wheel, mesh(new THREE.BoxGeometry(2.6, 0.12, 0.12), darkWood, 0, 1.55, 0));
    mill.position.set(53 - S.x, 0, 68 - S.z);
    village.add(mill);
    // 石板小径（从桥头通向村中）
    const pathGeo = new THREE.CylinderGeometry(0.5, 0.55, 0.12, 7);
    for (let k = 0; k < 26; k++) {
      const t = k / 25;
      const x = 30 + t * 18 + (rng() - 0.5) * 0.8, z = 72 + Math.sin(t * 3) * 2 + (rng() - 0.5) * 0.8;
      const st = mesh(pathGeo, stone, x - S.x, terrainHeight(x, z) - S.h + 0.04, z - S.z);
      st.rotation.y = rng() * 3; st.scale.set(0.8 + rng() * 0.5, 1, 0.8 + rng() * 0.5);
      village.add(st);
    }
    village.position.set(S.x, S.h, S.z);
    const baked = bake(village);
    scene.add(baked);
    for (const p of smokePts) addSmoke(p);

    // 木拱桥（横跨灵河）
    const bz = 72, rx = riverX(bz);
    const x0 = rx - 11, x1 = rx + 11;
    const y0 = terrainHeight(x0, bz), y1 = terrainHeight(x1, bz);
    const arch = (t) => V(x0 + (x1 - x0) * t, Math.max(y0, WATER_LEVEL + 0.4) * (1 - t) + Math.max(y1, WATER_LEVEL + 0.4) * t + Math.sin(Math.PI * t) * 2.2 + 0.3, bz);
    const bridge = new THREE.Group();
    const N = 34;
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N, p = arch(t), p2 = arch(t + 0.01);
      const plank = mesh(new THREE.BoxGeometry(0.62, 0.12, 2.6), wood, p.x, p.y, p.z);
      plank.rotation.z = Math.atan2(p2.y - p.y, p2.x - p.x);
      bridge.add(plank);
    }
    for (const side of [-1.25, 1.25]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const p = arch(k / 10); pts.push(p.clone().add(V(0, 0.95, side))); }
      bridge.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.07, 6), darkWood));
      for (let k = 0; k <= 10; k++) {
        const p = arch(k / 10);
        bridge.add(mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), darkWood, p.x, p.y + 0.48, p.z + side));
      }
    }
    for (const t of [0.3, 0.7]) { // 桥墩
      const p = arch(t);
      bridge.add(mesh(new THREE.BoxGeometry(0.6, p.y - (WATER_LEVEL - 1.5), 2.4), stone, p.x, (p.y + WATER_LEVEL - 1.5) / 2, p.z));
    }
    scene.add(bake(bridge));
    ctx.bridge = { x0, x1, z: bz, arch };

    // 垂柳
    willow(rx + 13, 58, 1.0);
    willow(rx + 14, 88, 1.15);
    willow(rx - 13, 80, 0.95);
    willow(66, 62, 0.9);

    // 村民（白衣农人）
    const robe = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9b08a, roughness: 0.8 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.8 });
    const hat = new THREE.MeshStandardMaterial({ map: tt, roughness: 1 });
    const folk = [];
    for (const [x, z, bend] of [[43, 66, 1], [46, 79, 1], [56, 75, 1], [50, 70, 0], [41, 74, 0], [58, 60, 0], [36, 82, 1]]) {
      const f = new THREE.Group();
      f.add(mesh(new THREE.ConeGeometry(0.38, 1.25, 10), robe, 0, 0.62, 0));
      const upper = new THREE.Group(); upper.position.y = 1.15;
      upper.add(mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.5, 8), robe, 0, 0.2, 0));
      upper.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), skin, 0, 0.6, 0.02));
      upper.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), hair, 0, 0.75, -0.06));
      if (rng() < 0.6) { const h = mesh(new THREE.ConeGeometry(0.42, 0.22, 12), hat, 0, 0.78, 0); upper.add(h); }
      if (bend) upper.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5), darkWood, 0.2, 0.0, 0.35).rotateX(0.9));
      f.add(upper);
      f.position.set(x, terrainHeight(x, z), z);
      f.rotation.y = rng() * 6.3;
      f.userData = { bend, ph: rng() * 6, upper };
      scene.add(f);
      folk.push(f);
    }
    updaters.push((dt, t) => {
      for (const f of folk) f.userData.upper.rotation.x = f.userData.bend ? 0.55 + Math.sin(t * 1.4 + f.userData.ph) * 0.25 : Math.sin(t * 0.5 + f.userData.ph) * 0.05;
    });
    landmarks.push({ name: '青溪村', x: S.x, z: S.z, r: 28 });
  }

  // ================= 山居草庐（青瓦木屋 + 红符铜铃） =================
  {
    const S = SITES.hut;
    const hut = new THREE.Group();
    const w = 7, d = 4.6, h = 3;
    hut.add(mesh(new THREE.BoxGeometry(w + 1.4, 0.5, d + 2.4), darkWood, 0, 0.25, 0.6));
    hut.add(mesh(new THREE.BoxGeometry(w, h, d), woven, 0, 0.5 + h / 2, 0));
    for (const x of [-w / 2, -w / 6, w / 6, w / 2]) {
      hut.add(mesh(new THREE.BoxGeometry(0.25, h + 0.3, 0.25), darkWood, x, 0.5 + h / 2, d / 2 + 0.05));
      hut.add(mesh(new THREE.BoxGeometry(0.25, h + 0.3, 0.25), darkWood, x, 0.5 + h / 2, -d / 2 - 0.05));
    }
    hut.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.25, 0.3), darkWood, 0, 0.5 + h, d / 2 + 0.05));
    hut.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.6, 0.06), wood, 0, 0.8, d / 2 + 0.08));
    hut.add(mesh(new THREE.BoxGeometry(1.6, 2.4, 0.06), dark, 0.6, 1.7, d / 2 + 0.06));
    hut.add(mesh(new THREE.PlaneGeometry(1.5, 1.3), lattice, -1.9, 2.0, d / 2 + 0.1));
    hut.add(mesh(new THREE.PlaneGeometry(1.0, 1.1), lattice, 2.6, 2.0, d / 2 + 0.1));
    const rise = gableRoof(hut, w + 0.4, d + 1.2, 0.5 + h, tiles, 1.0, 0.5);
    const ridgeY = 0.5 + h + rise;
    hut.add(mesh(new THREE.BoxGeometry(w + 2.6, 0.4, 0.45), tiles, 0, ridgeY, 0));
    for (const s of [-1, 1]) { // 翘脊
      const curl = mesh(new THREE.ConeGeometry(0.25, 1.1, 6), tiles, s * (w / 2 + 1.5), ridgeY + 0.35, 0);
      curl.rotation.z = -s * 0.9;
      hut.add(curl);
    }
    // 石灯笼
    function lantern(x, z) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.25, 0.7), stone, 0, 0.12, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.0, 8), stone, 0, 0.75, 0));
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.6), stone, 0, 1.3, 0));
      g.add(mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), lampMat, 0, 1.57, 0));
      const cap = mesh(new THREE.ConeGeometry(0.55, 0.45, 4), stone, 0, 2.0, 0); cap.rotation.y = Math.PI / 4;
      g.add(cap, mesh(new THREE.SphereGeometry(0.1, 6, 6), stone, 0, 2.3, 0));
      g.position.set(x, 0.5, z);
      hut.add(g);
    }
    lantern(-3.2, d / 2 + 1.6);
    lantern(3.4, d / 2 + 1.6);
    for (const [x, z] of [[-2.2, 3.4], [-1.4, 3.6], [-4.2, 1.6]]) {
      hut.add(mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 12, 1, true), woven, x, 0.8, z));
      hut.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 10), crop, x, 1.05, z));
    }
    // 竹晾架
    const rack = new THREE.Group();
    for (const [x, z] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) rack.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), bamboo, x, 1.2, z));
    for (const y of [0.8, 1.5]) {
      rack.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 14), woven, 0, y, 0));
      rack.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.07, 10), crop, 0, y + 0.05, 0));
    }
    rack.position.set(5.4, 0.5, 2.6);
    hut.add(rack);
    hut.position.set(S.x, S.h, S.z);
    hut.rotation.y = 0.5;
    const bakedHut = bake(hut);
    scene.add(bakedHut);
    // 檐下红符与铜铃（随风轻摆）
    const tagMat = new THREE.MeshStandardMaterial({ map: talismanTex('#b4221c', '#f4d070'), side: THREE.DoubleSide, roughness: 0.8, emissive: 0x400000, emissiveIntensity: 0.5 });
    nightMats.push([tagMat, 0.3, 0.6]);
    const swing = [];
    const eave = new THREE.Group();
    eave.position.copy(hut.position); eave.rotation.copy(hut.rotation);
    for (let k = 0; k < 16; k++) {
      const x = -w / 2 + 0.2 + k * (w - 0.4) / 15;
      const piv = new THREE.Group(); piv.position.set(x, 0.5 + h + 0.2, d / 2 + 1.25);
      const isBell = k % 3 === 1;
      const len = 0.4 + rng() * 0.5;
      piv.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 3), new THREE.MeshBasicMaterial({ color: 0xaa2222 }), 0, -len / 2, 0));
      if (isBell) {
        piv.add(mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.26, 10), brass, 0, -len - 0.13, 0));
        piv.add(mesh(new THREE.PlaneGeometry(0.1, 0.35), tagMat, 0, -len - 0.45, 0));
      } else {
        piv.add(mesh(new THREE.PlaneGeometry(0.22, 0.65), tagMat, 0, -len - 0.32, 0));
      }
      piv.userData.ph = rng() * 6;
      eave.add(piv); swing.push(piv);
    }
    scene.add(eave);
    updaters.push((dt, t) => { for (const p of swing) { p.rotation.x = Math.sin(t * 1.7 + p.userData.ph) * 0.12; p.rotation.z = Math.sin(t * 1.3 + p.userData.ph) * 0.06; } });
    const chim = V(1.6, 0.5 + h + rise + 0.4, -0.4).applyEuler(hut.rotation).add(hut.position);
    addSmoke(chim);
    landmarks.push({ name: '山居草庐', x: S.x, z: S.z, r: 16 });
  }

  // ================= 上古祭坛（麒麟镇守） =================
  {
    const S = SITES.altar;
    const altar = new THREE.Group();
    altar.add(mesh(new THREE.CylinderGeometry(14, 14.5, 0.5, 40), stone, 0, 0.1, 0));
    // 碎石铺地
    for (let k = 0; k < 60; k++) {
      const a = rng() * 6.3, r = 3 + rng() * 11;
      const slab = mesh(new THREE.BoxGeometry(1.2 + rng(), 0.18, 0.9 + rng()), rng() < 0.4 ? mossStone : stone, Math.cos(a) * r, 0.4, Math.sin(a) * r);
      slab.rotation.y = rng() * 3;
      altar.add(slab);
    }
    // 中央祭台
    altar.add(mesh(new THREE.BoxGeometry(7, 1.2, 5), stone, 0, 0.9, -6));
    altar.add(mesh(new THREE.BoxGeometry(5.4, 1.0, 3.6), mossStone, 0, 2.0, -6));
    altar.add(mesh(new THREE.BoxGeometry(5.8, 0.3, 4), stone, 0, 2.6, -6));
    for (let k = 0; k < 4; k++) altar.add(mesh(new THREE.BoxGeometry(3, 0.3, 0.7), stone, 0, 0.45 + k * 0.32, -3.2 + k * -0.55 + 0.6));
    // 石柱（两根立柱、一根倾斜）
    function pillar(x, z, tilt = 0, hgt = 9) {
      const p = new THREE.Group();
      p.add(mesh(new THREE.BoxGeometry(1.8, 0.6, 1.8), stone, 0, 0.3, 0));
      p.add(mesh(new THREE.CylinderGeometry(0.72, 0.8, hgt, 12), mossStone, 0, hgt / 2 + 0.6, 0));
      p.add(mesh(new THREE.BoxGeometry(1.9, 0.7, 1.9), stone, 0, hgt + 0.9, 0));
      p.position.set(x, 0.3, z);
      p.rotation.z = tilt;
      altar.add(p);
    }
    pillar(-6.5, -3.5); pillar(6.5, -3.5, -0.32, 8);
    // 浮雕墙
    const reliefMat = new THREE.MeshStandardMaterial({ map: reliefTex(), roughness: 1 });
    for (const s of [-1, 1]) {
      const wall = mesh(new THREE.BoxGeometry(11, 5.5, 1.2), stone, s * 11, 2.9, -4);
      wall.rotation.y = -s * 0.9;
      altar.add(wall);
      const face = mesh(new THREE.PlaneGeometry(10.6, 5.2), reliefMat, 0, 0, 0.61);
      wall.add(face);
    }
    // 石碑与插地古剑
    const blade = new THREE.MeshStandardMaterial({ color: 0x5a6470, metalness: 0.85, roughness: 0.35 });
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.15 + 0.7 * (k / 8)) + Math.PI, r = 11 + rng() * 2;
      const sw = new THREE.Group();
      sw.add(mesh(new THREE.BoxGeometry(0.18, 3.2, 0.05), blade, 0, 1.4, 0));
      sw.add(mesh(new THREE.BoxGeometry(0.9, 0.14, 0.18), brass, 0, 3.0, 0));
      sw.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), darkWood, 0, 3.45, 0));
      sw.position.set(Math.cos(a) * r, 0, Math.sin(a) * r + 2);
      sw.rotation.set((rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5);
      altar.add(sw);
    }
    for (const [x, z] of [[-9, 4], [-11, 0], [10, 3]]) {
      const st = mesh(new THREE.BoxGeometry(1.2, 2.6, 0.4), mossStone, x, 1.4, z);
      st.rotation.set(rng() * 0.2 - 0.1, rng() * 3, rng() * 0.2 - 0.1);
      altar.add(st);
    }
    altar.position.set(S.x, S.h, S.z);
    altar.rotation.y = Math.PI / 2 + 0.3; // 面向世界中心（东）
    scene.add(bake(altar));

    // 发光阵纹
    const arr = mesh(new THREE.CircleGeometry(9, 64), additive({ map: runeCircleTex(3), color: 0xffb84a, opacity: 0.9 }));
    arr.rotation.x = -Math.PI / 2;
    arr.position.set(S.x, S.h + 0.42, S.z);
    scene.add(arr);
    // 冲天符光
    const beam = new THREE.Group();
    const bMat = additive({ map: glyphColumnTex(), color: 0xffc860, opacity: 0.9 });
    for (let k = 0; k < 2; k++) {
      const p = mesh(new THREE.PlaneGeometry(2.6, 11), bMat, 0, 0, 0);
      p.rotation.y = k * Math.PI / 2;
      beam.add(p);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(6, 14, 1);
    beam.add(glow);
    const beamPos = V(0, 2.75 + 6, -6).applyEuler(altar.rotation).add(altar.position);
    beam.position.copy(beamPos);
    scene.add(beam);
    const altarLight = new THREE.PointLight(0xffb040, 3, 40, 1);
    altarLight.position.copy(beamPos);
    scene.add(altarLight);
    // 灵火萤光
    const sparks = [];
    for (let k = 0; k < 24; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: k % 2 ? 0x7fb8ff : 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.setScalar(0.35);
      sp.userData = { a: rng() * 6.3, r: 3 + rng() * 10, y: 0.5 + rng() * 5, ph: rng() * 6 };
      scene.add(sp); sparks.push(sp);
    }
    // 麒麟立于阵心
    const qilin = buildQilin();
    qilin.group.position.set(S.x, S.h + 0.45, S.z);
    qilin.group.rotation.y = altar.rotation.y + Math.PI - 0.5;
    scene.add(qilin.group);
    updaters.push((dt, t, env) => {
      arr.rotation.z += dt * 0.08;
      arr.material.opacity = 0.55 + env.night * 0.4 + Math.sin(t * 1.5) * 0.08;
      beam.rotation.y = Math.sin(t * 0.3) * 0.2;
      bMat.opacity = 0.6 + Math.sin(t * 3) * 0.15 + env.night * 0.3;
      altarLight.intensity = 2 + env.night * 5;
      for (const sp of sparks) {
        const u = sp.userData;
        sp.position.set(S.x + Math.cos(u.a + t * 0.1) * u.r, S.h + u.y + Math.sin(t + u.ph) * 0.5, S.z + Math.sin(u.a + t * 0.1) * u.r);
        sp.material.opacity = 0.5 + Math.sin(t * 2 + u.ph) * 0.4;
      }
      qilin.update(dt, t, env);
    });
    landmarks.push({ name: '上古祭坛 · 麒麟镇守', x: S.x, z: S.z, r: 22 });
  }

  // ================= 万年神树 =================
  {
    const S = SITES.tree;
    const tree = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x8a7a66, roughness: 1 });
    const mossMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x6f8f55, roughness: 1 });
    tree.add(mesh(new THREE.CylinderGeometry(2.1, 3.4, 18, 16), trunkMat, 0, 9, 0));
    for (let k = 0; k < 9; k++) { // 缠绕的树干束
      const a0 = (k / 9) * Math.PI * 2;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, a = a0 + t * 2.2, r = 3.0 - t * 1.0;
        pts.push(V(Math.cos(a) * r, t * 18, Math.sin(a) * r));
      }
      tree.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.75 - (k % 3) * 0.12, 8), k % 3 ? trunkMat : mossMat));
    }
    for (let k = 0; k < 11; k++) { // 板根
      const a = (k / 11) * Math.PI * 2 + rng() * 0.3, r = 7 + rng() * 4;
      tree.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(Math.cos(a) * 2, 3, Math.sin(a) * 2), V(Math.cos(a) * 4, 1.2, Math.sin(a) * 4), V(Math.cos(a) * r, -0.2, Math.sin(a) * r)]), 12, 0.65, 8), k % 2 ? mossMat : trunkMat));
    }
    const branchEnds = [];
    for (let k = 0; k < 8; k++) { // 主枝
      const a = (k / 8) * Math.PI * 2 + rng() * 0.4, r = 10 + rng() * 6, y = 22 + rng() * 5;
      const end = V(Math.cos(a) * r, y, Math.sin(a) * r);
      branchEnds.push(end);
      tree.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 15, 0), V(Math.cos(a) * r * 0.45, 19 + rng() * 2, Math.sin(a) * r * 0.45), end]), 16, 0.9, 8), trunkMat));
    }
    const leafMats = [0x3f7a34, 0x4f8f3c, 0x2f6a30].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let k = 0; k < 46; k++) {
      const e = branchEnds[k % branchEnds.length];
      const c = mesh(leafGeo, leafMats[k % 3], e.x * (0.55 + rng() * 0.6) + (rng() - 0.5) * 5, e.y + (rng() - 0.3) * 4, e.z * (0.55 + rng() * 0.6) + (rng() - 0.5) * 5);
      c.scale.set(4 + rng() * 3, 2.2 + rng() * 1.5, 4 + rng() * 3);
      tree.add(c);
    }
    tree.position.set(S.x, S.h - 0.2, S.z);
    scene.add(bake(tree));
    // 垂挂藤蔓 + 发光符牌
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x5a9a3a, roughness: 0.8 });
    const tagMat = new THREE.MeshStandardMaterial({ map: talismanTex('#c8ff9a', '#2f6a20'), emissive: 0xa8ff60, emissiveIntensity: 0.8, side: THREE.DoubleSide });
    nightMats.push([tagMat, 0.7, 1.6]);
    const tags = [];
    for (let k = 0; k < 24; k++) {
      const a = rng() * 6.3, r = 5 + rng() * 10, top = 18 + rng() * 4, len = 4 + rng() * 6;
      const piv = new THREE.Group();
      piv.position.set(S.x + Math.cos(a) * r, S.h + top, S.z + Math.sin(a) * r);
      piv.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), vineMat, 0, -len / 2, 0));
      for (let i = 0; i < 4; i++) piv.add(mesh(new THREE.PlaneGeometry(0.35, 0.22), vineMat, 0.1, -len * (0.2 + i * 0.2), 0).rotateZ(0.6));
      const tag = mesh(new THREE.PlaneGeometry(0.5, 1.4), tagMat, 0, -len - 0.7, 0);
      piv.add(tag);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xb8ff70, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      gl.scale.setScalar(2.2); gl.position.y = -len - 0.7;
      piv.add(gl);
      piv.userData.ph = rng() * 6;
      scene.add(piv); tags.push(piv);
    }
    // 树下灵气环
    const ring = mesh(new THREE.RingGeometry(8.4, 9.2, 96), additive({ color: 0x5fffd0, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(S.x, S.h + 0.3, S.z);
    const ring2 = mesh(new THREE.CircleGeometry(9.5, 64), additive({ map: runeCircleTex(5), color: 0x5fffd0, opacity: 0.35 }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.set(S.x, S.h + 0.25, S.z);
    scene.add(ring, ring2);
    // 萤火 / 落叶
    const flies = [];
    for (let k = 0; k < 30; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xd8ff8a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.setScalar(0.3);
      sp.userData = { a: rng() * 6.3, r: 4 + rng() * 12, y: 1 + rng() * 14, ph: rng() * 6 };
      scene.add(sp); flies.push(sp);
    }
    updaters.push((dt, t, env) => {
      for (const p of tags) p.rotation.z = Math.sin(t * 0.9 + p.userData.ph) * 0.05;
      ring2.rotation.z -= dt * 0.05;
      ring.material.opacity = 0.35 + env.night * 0.45 + Math.sin(t * 2) * 0.1;
      for (const sp of flies) {
        const u = sp.userData;
        sp.position.set(S.x + Math.cos(u.a + t * 0.08) * u.r, S.h + u.y + Math.sin(t * 0.7 + u.ph), S.z + Math.sin(u.a + t * 0.08) * u.r);
        sp.material.opacity = 0.3 + env.night * 0.6;
      }
    });
    landmarks.push({ name: '万年神树', x: S.x, z: S.z, r: 22 });
  }

  // ================= 灵湖阵眼（湖心法阵 + 灵泉水柱 + 彩虹） =================
  {
    const L = lake;
    const y = WATER_LEVEL + 0.06;
    const arr = mesh(new THREE.CircleGeometry(15, 64), additive({ map: runeCircleTex(11), color: 0x9ff6ff, opacity: 0.7 }));
    arr.rotation.x = -Math.PI / 2; arr.position.set(L.x, y, L.z);
    scene.add(arr);
    const ripples = [];
    for (let k = 0; k < 4; k++) {
      const r = mesh(new THREE.RingGeometry(0.94, 1, 96), additive({ color: 0xffffff, opacity: 0.6 }));
      r.rotation.x = -Math.PI / 2; r.position.set(L.x, y + 0.02, L.z);
      r.userData.ph = k / 4;
      scene.add(r); ripples.push(r);
    }
    const colTex = columnGradTex();
    const column = new THREE.Group();
    column.add(mesh(new THREE.CylinderGeometry(0.7, 1.3, 11, 20, 1, true), additive({ map: colTex, color: 0x9ff0ff, opacity: 0.55 }), 0, 5.5, 0));
    column.add(mesh(new THREE.CylinderGeometry(0.28, 0.5, 12, 12, 1, true), additive({ map: colTex, color: 0xffffff, opacity: 0.8 }), 0, 6, 0));
    const cg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xaef8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    cg.scale.set(5, 3, 1); cg.position.y = 0.8;
    column.add(cg);
    column.position.set(L.x, y, L.z);
    scene.add(column);
    // 喷泉水珠
    const DN = 160;
    const dGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(DN * 3), dVel = new Float32Array(DN * 3);
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    const drops = new THREE.Points(dGeo, new THREE.PointsMaterial({ map: glowTex, color: 0xd8fbff, size: 0.35, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    drops.frustumCulled = false;
    scene.add(drops);
    const resetDrop = (i) => {
      dPos[i * 3] = L.x; dPos[i * 3 + 1] = y + 10 + Math.random() * 2; dPos[i * 3 + 2] = L.z;
      const a = Math.random() * 6.3, sp = 1 + Math.random() * 2.5;
      dVel[i * 3] = Math.cos(a) * sp; dVel[i * 3 + 1] = 1 + Math.random() * 3; dVel[i * 3 + 2] = Math.sin(a) * sp;
    };
    for (let i = 0; i < DN; i++) { resetDrop(i); dPos[i * 3 + 1] -= Math.random() * 10; }
    const rainbow = mesh(new THREE.PlaneGeometry(90, 45), additive({ map: rainbowTex(), opacity: 0.4 }), L.x + 30, y + 4, L.z - 40);
    rainbow.rotation.y = -0.6;
    scene.add(rainbow);
    updaters.push((dt, t, env) => {
      arr.rotation.z += dt * 0.06;
      arr.material.opacity = 0.4 + env.night * 0.45 + Math.sin(t * 1.2) * 0.08;
      for (const r of ripples) {
        const k = (t * 0.12 + r.userData.ph) % 1;
        r.scale.setScalar(2 + k * 20);
        r.material.opacity = (1 - k) * 0.55;
        r.material.color.setHSL((k * 0.8 + t * 0.05) % 1, 0.7, 0.7);
      }
      const p = dGeo.attributes.position;
      for (let i = 0; i < DN; i++) {
        dVel[i * 3 + 1] -= 9.8 * dt;
        dPos[i * 3] += dVel[i * 3] * dt; dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt; dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
        if (dPos[i * 3 + 1] < y) resetDrop(i);
      }
      p.needsUpdate = true;
      rainbow.material.opacity = env.day * 0.35 * Math.max(0, env.sunAlt ?? 1);
    });
    landmarks.push({ name: '灵湖阵眼', x: L.x, z: L.z, r: 24 });

    // 湖畔白鹿与白灵狐
    let shore = null;
    for (let k = 0; k < 400 && !shore; k++) {
      const a = (k / 400) * Math.PI * 2 * 3, r = 16 + (k / 400) * 30;
      const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h > WATER_LEVEL + 0.2 && h < WATER_LEVEL + 1.2) shore = { x, z, a };
    }
    if (shore) {
      const deer = buildDeer();
      const inward = Math.atan2(L.x - shore.x, L.z - shore.z);
      deer.group.position.set(shore.x, terrainHeight(shore.x, shore.z), shore.z);
      deer.group.rotation.y = inward;
      scene.add(deer.group);
      const foxes = [];
      for (const off of [-1, 1]) {
        const f = buildSpiritFox();
        const fx = shore.x + Math.cos(inward) * off * 2.2 - Math.sin(inward) * 0.6;
        const fz = shore.z - Math.sin(inward) * off * 2.2 - Math.cos(inward) * 0.6;
        f.group.position.set(fx, terrainHeight(fx, fz), fz);
        f.group.rotation.y = inward - off * 1.3;
        f.group.scale.setScalar(1.3);
        scene.add(f.group);
        foxes.push(f);
      }
      const mouthRing = mesh(new THREE.RingGeometry(0.9, 1, 48), additive({ color: 0xffffff, opacity: 0.5 }));
      mouthRing.rotation.x = -Math.PI / 2;
      const mp = V(0, 0, 1.6).applyAxisAngle(V(0, 1, 0), inward).add(deer.group.position);
      mouthRing.position.set(mp.x, WATER_LEVEL + 0.05, mp.z);
      scene.add(mouthRing);
      updaters.push((dt, t) => {
        deer.update(dt, t);
        foxes.forEach((f, i) => f.update(dt, t, i * 2));
        const k = (t * 0.4) % 1;
        mouthRing.scale.setScalar(0.3 + k * 2.5);
        mouthRing.material.opacity = (1 - k) * 0.5;
      });
    }
  }

  // ================= 白虎崖 =================
  {
    const S = SITES.tiger;
    const rock = mesh(new THREE.IcosahedronGeometry(1, 2), stone, S.x, S.h + 0.8, S.z);
    rock.scale.set(5, 2.2, 4);
    scene.add(rock);
    const tiger = buildTiger();
    tiger.group.position.set(S.x, S.h + 2.6, S.z);
    tiger.group.rotation.y = Math.atan2(-S.x, -S.z);
    scene.add(tiger.group);
    updaters.push((dt, t, env) => tiger.update(dt, t, env));
    landmarks.push({ name: '白虎崖', x: S.x, z: S.z, r: 18 });
  }

  // ================= 天穹神兽：青龙、火凤 =================
  const dragon = buildDragon(scene, { center: V(0, 0, 0), radius: 135, height: 80 });
  const phoenix = buildPhoenix(scene, { center: V(lake.x, 0, lake.z), radius: 58, height: 28 });
  updaters.push((dt, t, env) => { dragon.update(dt, t, env); phoenix.update(dt, t, env); });

  return {
    landmarks,
    dragon, phoenix,
    update(dt, t, env) {
      for (const f of updaters) f(dt, t, env);
      for (const [m, base, boost] of nightMats) m.emissiveIntensity = base + env.night * boost;
    },
  };
}
