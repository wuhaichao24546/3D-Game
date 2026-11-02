import * as THREE from 'three';
import { Tree } from './vendor/ez-tree/tree.js';
import { loadPreset } from './vendor/ez-tree/presets/index.js';

// 写实植被：程序化分枝大树（真实树皮 PBR + 叶片贴图 + 风动）+ 跟随玩家的密草场
const tl = new THREE.TextureLoader();
function tex(url, { srgb = true, rx = 1, ry = 1 } = {}) {
  const t = tl.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

export const foliageUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
};

const barkCache = {};
function barkMaps(type, scale) {
  const key = `${type}_${scale.x}_${scale.y}`;
  if (barkCache[key]) return barkCache[key];
  const o = { rx: scale.x, ry: 1 / scale.y };
  return (barkCache[key] = {
    map: tex(`textures/trees/bark_${type}_color.jpg`, o),
    normalMap: tex(`textures/trees/bark_${type}_normal.jpg`, { ...o, srgb: false }),
    roughnessMap: tex(`textures/trees/bark_${type}_roughness.jpg`, { ...o, srgb: false }),
  });
}
const leafCache = {};
function leafMap(type) {
  return leafCache[type] || (leafCache[type] = tex(`textures/trees/leaf_${type}.png`));
}

// 树干弯曲 + 叶片抖动（支持 InstancedMesh）
function addWind(mat, height, leaf) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = foliageUniforms.uTime;
    sh.uniforms.uWind = foliageUniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = instanceMatrix[3].xyz;
          #else
            vec3 ip = vec3(0.0);
          #endif
          float ph = ip.x * 0.37 + ip.z * 0.23;
          float hN = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.4);
          float bend = hN * hN * uWind * ${(height * 0.012).toFixed(3)};
          transformed.x += bend * (sin(uTime * 0.8 + ph) + 0.35 * sin(uTime * 1.9 + ph * 1.7));
          transformed.z += bend * 0.7 * sin(uTime * 0.65 + ph * 1.3);
          ${leaf ? `float fl = uWind * hN * ${(height * 0.004).toFixed(3)};
          transformed += fl * vec3(sin(uTime * 3.7 + position.x * 0.9 + ph), 0.5 * sin(uTime * 4.9 + position.y * 0.7), cos(uTime * 4.3 + position.z * 0.9));` : ''}
        }`);
    if (leaf) {
      // 双面叶片不翻转法线（避免背光面发黑），并加一点透光感
      sh.fragmentShader = sh.fragmentShader
        .replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * 0.06;`);
    }
  };
  mat.customProgramCacheKey = () => `${leaf ? 'leaf' : 'bark'}_${height.toFixed(1)}`;
}

// 叶片法线指向树冠外侧（体积感光照，避免一片片的“纸片”感）
function sphericalLeafNormals(geo) {
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  const p = geo.attributes.position, n = geo.attributes.normal;
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c).normalize();
    nn.fromBufferAttribute(n, i);
    if (nn.dot(v) < 0) nn.negate();
    nn.lerp(v, 0.75).normalize();
    n.setXYZ(i, nn.x, nn.y, nn.z);
  }
}

function lowDetail(json) {
  const o = structuredClone(json);
  for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(2, Math.round(o.branch.sections[k] * (k === '0' ? 0.5 : 0.35)));
  for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = k === '0' ? Math.max(4, Math.round(o.branch.segments[k] * 0.5)) : 3;
  o.leaves.count = Math.max(2, Math.round(o.leaves.count * 0.3));
  o.leaves.size *= 1.7;
  o.leaves.billboard = 'single';
  return o;
}

function generate(json) {
  const t = new Tree();
  t.loadFromJson(json);
  return { branches: t.branchesMesh.geometry, leaves: t.leavesMesh.geometry };
}

// 品种定义：preset + 改造
export const TREE_KINDS = {
  oak: { preset: 'Oak Medium', leaf: 'oak', leafTint: 0xc9dcb0, barkTint: 0xd8cfc0, height: [10, 15] },
  ash: { preset: 'Ash Medium', leaf: 'ash', leafTint: 0xd2e2b8, barkTint: 0xd8d2c6, height: [11, 16] },
  pine: { preset: 'Pine Medium', leaf: 'pine', leafTint: 0xb8cfa8, barkTint: 0xcfc4b6, height: [13, 19] },
  blossom: { preset: 'Aspen Medium', leaf: 'blossom', leafTint: 0xffffff, barkTint: 0x9a8a80, height: [6.5, 9.5], seed: 911 },
};

function buildKind(kind, def) {
  const json = loadPreset(def.preset);
  if (def.seed) json.seed = def.seed;
  const hi = generate(json);
  const lo = generate(lowDetail(json));
  sphericalLeafNormals(hi.leaves);
  sphericalLeafNormals(lo.leaves);
  hi.branches.computeBoundingBox();
  hi.leaves.computeBoundingBox();
  const bb = hi.branches.boundingBox.clone().union(hi.leaves.boundingBox);
  const localH = bb.max.y - bb.min.y;
  const barkMat = new THREE.MeshStandardMaterial({
    color: def.barkTint, roughness: 1, metalness: 0,
    ...barkMaps(json.bark.type, json.bark.textureScale),
  });
  barkMat.normalScale.set(1.4, 1.4);
  addWind(barkMat, localH, false);
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafMap(def.leaf), color: def.leafTint, side: THREE.DoubleSide,
    alphaTest: json.leaves.alphaTest ?? 0.5, roughness: 0.85, metalness: 0,
  });
  addWind(leafMat, localH, true);
  return { kind, def, hi, lo, localH, barkMat, leafMat };
}

// 带两级 LOD 的森林：近处高模+投影，远处低模
export class Forest {
  constructor(scene, { nearDist = 60, farDist = 240 } = {}) {
    this.scene = scene;
    this.near2 = nearDist * nearDist;
    this.far2 = farDist * farDist;
    this.kinds = {};
    this.items = {};
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.stats = { tris: {} };
  }

  kind(name) {
    if (!this.kinds[name]) this.kinds[name] = buildKind(name, TREE_KINDS[name]);
    return this.kinds[name];
  }

  // 返回该棵树的世界尺度（height 米）
  add(name, x, y, z, rng) {
    const k = this.kind(name);
    const [h0, h1] = k.def.height;
    const h = h0 + rng() * (h1 - h0);
    const s = h / k.localH;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y - 0.15, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2),
      new THREE.Vector3(s * (0.9 + rng() * 0.2), s, s * (0.9 + rng() * 0.2)),
    );
    const c = new THREE.Color().setHSL(0, 0, 0.85 + rng() * 0.3);
    (this.items[name] ||= []).push({ m, x, z, c });
    return h;
  }

  // 单棵高模（用于浮岛等需要随父节点移动的场合）
  single(name, height) {
    const k = this.kind(name);
    const g = new THREE.Group();
    const b = new THREE.Mesh(k.hi.branches, k.barkMat);
    const l = new THREE.Mesh(k.hi.leaves, k.leafMat);
    b.castShadow = l.castShadow = true;
    b.receiveShadow = l.receiveShadow = true;
    g.add(b, l);
    g.scale.setScalar(height / k.localH);
    return g;
  }

  finalize() {
    for (const [name, list] of Object.entries(this.items)) {
      const k = this.kinds[name];
      const n = list.length;
      const mk = (geo, mat, shadow) => {
        const im = new THREE.InstancedMesh(geo, mat, n);
        im.castShadow = shadow;
        im.userData.noShadowCast = !shadow;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.count = 0;
        this.scene.add(im);
        return im;
      };
      k.ims = {
        hiB: mk(k.hi.branches, k.barkMat, true), hiL: mk(k.hi.leaves, k.leafMat, true),
        loB: mk(k.lo.branches, k.barkMat, false), loL: mk(k.lo.leaves, k.leafMat, false),
      };
      this.stats.tris[name] = {
        hi: (k.hi.branches.index.count + k.hi.leaves.index.count) / 3,
        lo: (k.lo.branches.index.count + k.lo.leaves.index.count) / 3,
        count: n,
      };
    }
  }

  update(camPos, force = false) {
    if (!force && camPos.distanceToSquared(this.lastCam) < 9) return;
    this.lastCam.copy(camPos);
    for (const [name, list] of Object.entries(this.items)) {
      const { ims } = this.kinds[name];
      let hi = 0, lo = 0;
      for (const it of list) {
        const dx = it.x - camPos.x, dz = it.z - camPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > this.far2) continue;
        if (d2 < this.near2) {
          ims.hiB.setMatrixAt(hi, it.m); ims.hiL.setMatrixAt(hi, it.m);
          ims.hiL.setColorAt(hi, it.c);
          hi++;
        } else {
          ims.loB.setMatrixAt(lo, it.m); ims.loL.setMatrixAt(lo, it.m);
          ims.loL.setColorAt(lo, it.c);
          lo++;
        }
      }
      for (const [im, c] of [[ims.hiB, hi], [ims.hiL, hi], [ims.loB, lo], [ims.loL, lo]]) {
        im.count = c;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 密草场：数万根带弯曲与风动的草叶，围绕玩家无缝平铺；高度/密度来自地形烘焙贴图
export function buildGrass(scene, { heightTex, mapMin, mapSize, count = 60000, radius = 30 }) {
  const SEG = 3;
  const base = new THREE.BufferGeometry();
  const pos = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const w = 0.5 * (1 - t * t * 0.92);
    pos.push(-w, t, 0, w, t, 0);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  base.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  base.setIndex(idx);

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.normal = base.attributes.normal;
  const off = new Float32Array(count * 3);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    off[i * 3] = (rnd() * 2 - 1) * radius;
    off[i * 3 + 1] = (rnd() * 2 - 1) * radius;
    off[i * 3 + 2] = rnd();
  }
  geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.instanceCount = count;

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const uniforms = {
    uCenter: { value: new THREE.Vector2() },
    uR: { value: radius },
    uHeight: { value: heightTex },
    uMapMin: { value: mapMin },
    uMapSize: { value: mapSize },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, foliageUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 iOffset;
        uniform vec2 uCenter; uniform float uR; uniform sampler2D uHeight;
        uniform vec2 uMapMin; uniform vec2 uMapSize;
        uniform float uTime; uniform float uWind;
        varying float vT; varying float vRnd;`)
      .replace('#include <beginnormal_vertex>', `
        float rnd = iOffset.z;
        vec2 rel = mod(iOffset.xy - uCenter + uR, 2.0 * uR) - uR;
        vec2 wp = uCenter + rel;
        vec4 hm = texture2D(uHeight, (wp - uMapMin) / uMapSize);
        float fade = smoothstep(uR, uR * 0.55, length(rel));
        float hgt = hm.g * fade * (0.28 + 0.55 * fract(rnd * 7.13));
        float ang = rnd * 6.2831 * 13.0;
        vec2 face = vec2(cos(ang), sin(ang));
        vec2 side = vec2(-face.y, face.x);
        vec3 objectNormal = normalize(vec3(face.x * 0.35, 1.0, face.y * 0.35));`)
      .replace('#include <begin_vertex>', `
        float t = position.y;
        float wv = sin(uTime * 1.7 + wp.x * 0.31 + wp.y * 0.17) * 0.6 + sin(uTime * 3.1 + wp.x * 0.83 - wp.y * 0.6) * 0.25;
        float lean = 0.18 + 0.32 * fract(rnd * 3.71);
        vec2 bend = face * lean + vec2(0.8, 0.4) * wv * 0.35 * uWind;
        float width = 0.055 * (0.7 + 0.6 * fract(rnd * 5.3));
        vec3 transformed = vec3(wp.x, hm.r - 0.05, wp.y);
        transformed.xz += side * position.x * width + bend * t * t * hgt;
        transformed.y += t * hgt * (1.0 - 0.25 * dot(bend, bend));
        vT = t; vRnd = rnd;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vT; varying float vRnd;')
      .replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gTip = mix(vec3(0.30, 0.42, 0.12), vec3(0.50, 0.52, 0.20), fract(vRnd * 11.7));
        vec3 gRoot = vec3(0.045, 0.085, 0.025);
        diffuseColor.rgb *= mix(gRoot, gTip, smoothstep(0.0, 1.0, vT));`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.noShadowCast = true;
  scene.add(mesh);
  return {
    mesh,
    update(center) { uniforms.uCenter.value.set(center.x, center.z); },
  };
}
