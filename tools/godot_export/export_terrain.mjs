// 导出 Godot 用地形：terrain.obj（渲染网格）+ heights.f32（碰撞/查询用高度图）
// 高度函数与 src/world.js 完全一致（同一种子 simplex 噪声），保证两端地形一致。
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'godot', 'assets', 'terrain');
mkdirSync(OUT, { recursive: true });

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

const WORLD_RADIUS = 190;
const WATER_LEVEL = 2.1;

function riverX(z) { return Math.sin(z * 0.011) * 34 + Math.sin(z * 0.031 + 1.7) * 10; }
function riverDist(x, z) { return Math.abs(x - riverX(z)); }

const SITES = {
  village: { x: 40, z: 72, r: 24 },
  hut: { x: -75, z: 90, r: 11 },
  altar: { x: -130, z: -40, r: 17 },
  tree: { x: 120, z: 90, r: 15 },
  tiger: { x: 130, z: -130, r: 7 },
};
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function baseHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = 4 + fbm(x * 0.012, z * 0.012, 4) * 14;
  h += fbm(x * 0.045 + 99, z * 0.045 - 99, 3) * 2.2;
  const ring = Math.max(0, (d - 130) / 60);
  h += ring * ring * 22;
  h -= Math.max(0, 1 - d / 70) * 5;
  const rd = riverDist(x, z);
  const channel = Math.max(0, 1 - rd / 9);
  h = h * (1 - channel * 0.85) + channel * (WATER_LEVEL - 1.4) + Math.max(0, 1 - rd / 16) * 0.9;
  return h;
}
for (const k in SITES) {
  const s = SITES[k];
  s.h = Math.max(WATER_LEVEL + 1.6, baseHeight(s.x, s.z));
}
function terrainHeight(x, z) {
  let h = baseHeight(x, z);
  for (const k in SITES) {
    const s = SITES[k];
    const dd = Math.hypot(x - s.x, z - s.z);
    if (dd < s.r * 1.6) {
      const w = smoothstep(0, s.r * 0.6, s.r * 1.6 - dd) * smoothstep(10, 18, riverDist(x, z));
      h = h * (1 - w) + s.h * w;
    }
  }
  return h;
}

// ---- heights grid ----
const SIZE = WORLD_RADIUS * 2; // 380
const SEG = 400;               // ~0.95m 分辨率
const N = SEG + 1;
const step = SIZE / SEG;
const heights = new Float32Array(N * N);
let minH = Infinity, maxH = -Infinity;
for (let iz = 0; iz < N; iz++) {
  for (let ix = 0; ix < N; ix++) {
    const x = -WORLD_RADIUS + ix * step;
    const z = -WORLD_RADIUS + iz * step;
    const h = terrainHeight(x, z);
    heights[iz * N + ix] = h;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
}
console.log(`height range: ${minH.toFixed(2)} .. ${maxH.toFixed(2)}`);
for (const k in SITES) console.log(`site ${k}: h=${SITES[k].h.toFixed(2)} @(${SITES[k].x},${SITES[k].z})`);
console.log('spawn village ground:', terrainHeight(40, 72).toFixed(2));

// heights.f32：行主序 iz*N+ix，x/z 覆盖 [-190,190]，采样间距 0.95m
writeFileSync(join(OUT, 'heights.f32'), Buffer.from(heights.buffer));

// heights_1m.f32：381x381，间距正好 1m，供 Godot HeightMapShape3D 碰撞使用
const N1 = 381;
const h1 = new Float32Array(N1 * N1);
for (let iz = 0; iz < N1; iz++) {
  for (let ix = 0; ix < N1; ix++) {
    h1[iz * N1 + ix] = terrainHeight(-WORLD_RADIUS + ix, -WORLD_RADIUS + iz);
  }
}
writeFileSync(join(OUT, 'heights_1m.f32'), Buffer.from(h1.buffer));
console.log('heights_1m.f32 written:', N1, 'x', N1);

// ---- OBJ ----
const vid = (ix, iz) => iz * N + ix + 1;
const lines = [];
for (let iz = 0; iz < N; iz++) {
  for (let ix = 0; ix < N; ix++) {
    const x = -WORLD_RADIUS + ix * step;
    const z = -WORLD_RADIUS + iz * step;
    const h = heights[iz * N + ix];
    lines.push(`v ${x.toFixed(4)} ${h.toFixed(4)} ${z.toFixed(4)}`);
  }
}
// 顶点法线（按三角形面积加权累积）
const normals = new Float32Array(N * N * 3);
function accum(ix, iz, nx, ny, nz) {
  const i = (iz * N + ix) * 3;
  normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz;
}
for (let iz = 0; iz < SEG; iz++) {
  for (let ix = 0; ix < SEG; ix++) {
    const p00 = [ix, iz], p10 = [ix + 1, iz], p01 = [ix, iz + 1], p11 = [ix + 1, iz + 1];
    const H = (a, b) => heights[b * N + a];
    const X = (a) => -WORLD_RADIUS + a * step;
    const Z = (b) => -WORLD_RADIUS + b * step;
    // 两个三角形：(00,01,11) 与 (00,11,10)，保证法线朝 +Y
    for (const tri of [[p00, p01, p11], [p00, p11, p10]]) {
      const [a, b, c] = tri;
      const ax = X(a[0]), az = Z(a[1]), ah = H(a[0], a[1]);
      const bx = X(b[0]), bz = Z(b[1]), bh = H(b[0], b[1]);
      const cx = X(c[0]), cz = Z(c[1]), ch = H(c[0], c[1]);
      const ux = bx - ax, uy = bh - ah, uz = bz - az;
      const vx = cx - ax, vy = ch - ah, vz = cz - az;
      // cross(u, v)
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      for (const [px, pz] of tri) accum(px, pz, nx / l, ny / l, nz / l);
    }
  }
}
for (let i = 0; i < N * N; i++) {
  const l = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
  normals[i * 3] /= l; normals[i * 3 + 1] /= l; normals[i * 3 + 2] /= l;
}
for (let iz = 0; iz < N; iz++) {
  for (let ix = 0; ix < N; ix++) {
    const i = (iz * N + ix) * 3;
    lines.push(`vn ${normals[i].toFixed(4)} ${normals[i + 1].toFixed(4)} ${normals[i + 2].toFixed(4)}`);
  }
}
// UV（世界坐标 / 40，用于调试；着色器主要用世界坐标）
for (let iz = 0; iz < N; iz++) {
  for (let ix = 0; ix < N; ix++) {
    const u = ((-WORLD_RADIUS + ix * step) / SIZE + 0.5);
    const v = ((-WORLD_RADIUS + iz * step) / SIZE + 0.5);
    lines.push(`vt ${u.toFixed(5)} ${v.toFixed(5)}`);
  }
}
for (let iz = 0; iz < SEG; iz++) {
  for (let ix = 0; ix < SEG; ix++) {
    const a = vid(ix, iz), b = vid(ix, iz + 1), c = vid(ix + 1, iz + 1), d = vid(ix + 1, iz);
    lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    lines.push(`f ${a}/${a}/${a} ${c}/${c}/${c} ${d}/${d}/${d}`);
  }
}
writeFileSync(join(OUT, 'terrain.obj'), lines.join('\n') + '\n');
console.log('OBJ written:', lines.length, 'lines');
