import * as THREE from 'three';
import {
  scaleTex, tigerTex, runeLinesTex, deerTex, flameFeatherTex, flameTex,
  talismanTex, runeCircleTex, mulberry, phoenixFeatherTex,
} from './tex.js';

export const furTex = (() => {
  const t = new THREE.TextureLoader().load('textures/fur.jpg');
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tube = (pts, r, seg = 24, rs = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs, false);
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
const additive = (opts) => new THREE.MeshBasicMaterial({
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...opts,
});

let _flame;
const flameT = () => (_flame ||= flameTex());
let _feather;
const featherT = () => (_feather ||= flameFeatherTex());

// 鹿角/龙角：主干 + 分叉
function antler(mat, side, len = 1, tines = 3) {
  const g = new THREE.Group();
  const s = side;
  const main = [V(0, 0, 0), V(0.15 * s * len, 0.45 * len, -0.1 * len), V(0.35 * s * len, 0.9 * len, -0.35 * len), V(0.45 * s * len, 1.35 * len, -0.75 * len)];
  g.add(new THREE.Mesh(tube(main, 0.05 * len + 0.02, 16, 6), mat));
  const curve = new THREE.CatmullRomCurve3(main);
  for (let i = 1; i <= tines; i++) {
    const p = curve.getPoint(i / (tines + 1));
    const tip = p.clone().add(V(0.25 * s * len, 0.4 * len, 0.18 * len));
    g.add(new THREE.Mesh(tube([p, p.clone().lerp(tip, 0.5).add(V(0, 0.05, 0)), tip], 0.03 * len + 0.01, 8, 5), mat));
  }
  return g;
}

// ============ 青龙（白玉鳞，绕仙山盘旋，雷光环绕） ============
export function buildDragon(scene, { center = V(0, 0, 0), radius = 130, height = 78 } = {}) {
  const N = 72;
  const bodyMat = new THREE.MeshStandardMaterial({
    map: scaleTex('#cfeee2', '#5fa892', '#ffffff'), roughness: 0.42, metalness: 0.2,
    emissive: 0x0c2a22, emissiveIntensity: 0.6,
  });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.5 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xeef6f2, roughness: 0.8, emissive: 0x223330 });
  const segGeo = new THREE.SphereGeometry(1, 16, 12);
  const segs = new THREE.InstancedMesh(segGeo, bodyMat, N);
  const finGeo = new THREE.ConeGeometry(0.35, 1.4, 5).translate(0, 0.7, 0);
  const fins = new THREE.InstancedMesh(finGeo, hairMat, N);
  segs.frustumCulled = fins.frustumCulled = false;
  scene.add(segs, fins);
  const radiusAt = (i) => {
    const t = i / (N - 1);
    return 0.6 + 2.0 * Math.sin(Math.min(1, t * 3.2 + 0.25) * Math.PI * 0.5) * (1 - t * 0.82);
  };

  // 龙首
  const head = new THREE.Group();
  const skull = mesh(new THREE.SphereGeometry(1, 18, 14), bodyMat); skull.scale.set(1.45, 1.2, 1.7);
  const snout = mesh(new THREE.SphereGeometry(1, 16, 12), bodyMat, 0, -0.15, 2.0); snout.scale.set(0.95, 0.7, 1.7);
  const nose = mesh(new THREE.SphereGeometry(0.35, 10, 8), bodyMat, 0, 0.15, 3.5); nose.scale.set(1.6, 0.8, 1);
  const jaw = mesh(new THREE.SphereGeometry(1, 14, 10), bodyMat, 0, -0.9, 1.7); jaw.scale.set(0.8, 0.35, 1.6); jaw.rotation.x = 0.35;
  head.add(skull, snout, nose, jaw);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const tooth = mesh(new THREE.ConeGeometry(0.08, 0.35, 5), ivory, sx * (0.55 - k * 0.06), -0.6, 2.4 + k * 0.3);
      tooth.rotation.x = Math.PI;
      head.add(tooth);
    }
    const eye = mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a3a }), sx * 0.95, 0.45, 1.2);
    head.add(eye);
    const brow = mesh(new THREE.ConeGeometry(0.25, 0.9, 6), hairMat, sx * 0.9, 0.85, 0.9); brow.rotation.x = -1.2;
    head.add(brow);
    const horn = antler(ivory, sx, 2.6, 2);
    horn.position.set(sx * 0.6, 0.9, -0.4);
    horn.rotation.x = -0.5;
    head.add(horn);
    // 长须
    const wh = tube([V(sx * 0.6, 0, 3.3), V(sx * 1.8, 0.4, 3.0), V(sx * 3.2, 0.2, 1.2), V(sx * 4.2, -0.8, -1.5), V(sx * 4.6, -1.8, -3.5)], 0.045, 30, 5);
    head.add(new THREE.Mesh(wh, ivory));
  }
  for (let k = 0; k < 18; k++) { // 鬃毛
    const a = (k / 17 - 0.5) * 2.6;
    const c = mesh(new THREE.ConeGeometry(0.28, 2.2 + (k % 3) * 0.6, 5), hairMat, Math.sin(a) * 1.25, Math.cos(a) * 0.9 - 0.1, -0.8);
    c.rotation.x = -1.9; c.rotation.z = -a * 0.5;
    head.add(c);
  }
  for (let k = 0; k < 6; k++) { // 龙须髯
    const c = mesh(new THREE.ConeGeometry(0.16, 1.4, 5), hairMat, (k - 2.5) * 0.25, -1.2, 1.5 + (k % 2) * 0.2);
    c.rotation.x = Math.PI - 0.5;
    head.add(c);
  }
  head.scale.setScalar(1.15);
  scene.add(head);

  // 四爪
  const legs = [];
  for (const [si, side] of [[9, 1], [9, -1], [30, 1], [30, -1]]) {
    const leg = new THREE.Group();
    leg.add(new THREE.Mesh(tube([V(0, 0, 0), V(0.9, -0.9, 0.4), V(1.3, -2.1, 1.2), V(1.4, -2.8, 1.8)], 0.38, 12, 8), bodyMat));
    for (let c = 0; c < 4; c++) {
      const claw = mesh(new THREE.ConeGeometry(0.12, 0.8, 5), ivory, 1.4 + (c - 1.5) * 0.25, -3.1, 2.1);
      claw.rotation.x = 1.9; claw.rotation.z = (c - 1.5) * 0.25;
      leg.add(claw);
    }
    leg.userData = { si, side };
    if (side < 0) leg.scale.x = -1;
    scene.add(leg);
    legs.push(leg);
  }

  // 环绕光环
  const halo = mesh(new THREE.TorusGeometry(24, 0.22, 8, 120), additive({ color: 0x9fdcff, opacity: 0.55 }));
  scene.add(halo);
  // 闪电
  const bolts = [];
  for (let b = 0; b < 3; b++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xdff0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false;
    scene.add(line);
    bolts.push({ line, timer: Math.random() * 3 });
  }

  const pathAt = (u, out) => out.set(
    center.x + Math.cos(u) * radius + Math.sin(u * 3) * 14,
    height + Math.sin(u * 2) * 10 + Math.sin(u * 5) * 4,
    center.z + Math.sin(u) * radius * 0.8 + Math.cos(u * 2) * 10);
  const dummy = new THREE.Object3D();
  const pts = Array.from({ length: N + 1 }, () => new THREE.Vector3());
  const quats = Array.from({ length: N }, () => new THREE.Quaternion());
  let u0 = 0;
  const SP = 0.0072;
  return {
    head,
    update(dt, t, env) {
      u0 += dt * 0.028;
      for (let i = 0; i <= N; i++) pathAt(u0 - i * SP + Math.sin(t * 1.3 - i * 0.22) * 0.0009, pts[i]);
      for (let i = 0; i < N; i++) {
        const r = radiusAt(i);
        dummy.position.copy(pts[i]);
        dummy.lookAt(i === 0 ? pts[0].clone().multiplyScalar(2).sub(pts[1]) : pts[i - 1]);
        quats[i].copy(dummy.quaternion);
        dummy.scale.set(r, r, r * 1.45);
        dummy.updateMatrix();
        segs.setMatrixAt(i, dummy.matrix);
        dummy.translateY(r * 0.82);
        dummy.scale.setScalar(i % 2 ? 0 : r * 0.55);
        dummy.updateMatrix();
        fins.setMatrixAt(i, dummy.matrix);
      }
      segs.instanceMatrix.needsUpdate = fins.instanceMatrix.needsUpdate = true;
      head.position.copy(pts[0]).add(V(0, 0.6, 0));
      head.lookAt(pts[0].clone().multiplyScalar(2).sub(pts[2]).add(V(0, 0.6, 0)));
      head.translateZ(1.2);
      for (const leg of legs) {
        const { si, side } = leg.userData;
        const r = radiusAt(si);
        leg.position.copy(pts[si]);
        leg.quaternion.copy(quats[si]);
        leg.translateX(side * r * 0.8);
        leg.translateY(-r * 0.3);
        leg.rotateZ(Math.sin(t * 2 + si) * 0.15 * side);
      }
      halo.position.copy(pts[16]);
      halo.quaternion.copy(quats[16]);
      halo.material.opacity = 0.3 + env.night * 0.4 + Math.sin(t * 2) * 0.08;
      for (const b of bolts) {
        b.timer -= dt;
        const m = b.line.material;
        if (b.timer <= 0) {
          b.timer = 1.5 + Math.random() * 3.5;
          const p = b.line.geometry.attributes.position;
          const from = pts[(Math.random() * N) | 0];
          const dir = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          for (let k = 0; k < 14; k++) {
            const q = from.clone().addScaledVector(dir, k * 2.2).add(V((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2));
            p.setXYZ(k, q.x, q.y, q.z);
          }
          p.needsUpdate = true;
          m.opacity = 1;
        }
        m.opacity = Math.max(0, m.opacity - dt * 5);
      }
    },
  };
}

// ============ 火凤凰（写实火鸟：层叠飞羽，掠过灵湖） ============
let _phoenixFeather;
const phoenixFeatherT = () => (_phoenixFeather ||= phoenixFeatherTex());

// 让羽片按指定方向平铺（+Y=羽向、面法线朝上），roll 绕羽轴扭转
const _featherM4 = new THREE.Matrix4();
const _featherUp = V(0, 1, 0);
function placeFeather(f, attach, dir, roll = 0) {
  const D = dir.clone().normalize();
  const X = new THREE.Vector3().crossVectors(D, _featherUp);
  if (X.lengthSq() < 1e-6) X.set(1, 0, 0); else X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, D);
  _featherM4.makeBasis(X, D, Z);
  f.quaternion.setFromRotationMatrix(_featherM4);
  if (roll) f.rotateY(roll);
  f.position.copy(attach);
}
const featherGeo = (len, w) => new THREE.PlaneGeometry(w, len).translate(0, len / 2, 0);

export function buildPhoenix(scene, { center = V(0, 0, 0), radius = 60, height = 26 } = {}) {
  const root = new THREE.Group();
  // 身体：绯红羽身压低 emissive，腹部鎏金
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xc83c14, emissive: 0x8a1c06, emissiveIntensity: 0.55, roughness: 0.62 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xe8a03c, emissive: 0x7a4408, emissiveIntensity: 0.6, metalness: 0.35, roughness: 0.45 });
  const body = mesh(new THREE.SphereGeometry(1, 18, 14), coreMat); body.scale.set(1.15, 1.05, 2.3);
  const belly = mesh(new THREE.SphereGeometry(0.95, 16, 12), goldMat, 0, -0.3, 0.4); belly.scale.set(0.9, 0.75, 2.0);
  const neck = new THREE.Mesh(tube([V(0, 0.3, 1.8), V(0, 1.3, 2.7), V(0, 2.3, 3.15)], 0.4, 10, 8), coreMat);
  const headM = mesh(new THREE.SphereGeometry(0.5, 16, 12), coreMat, 0, 2.55, 3.4); headM.scale.set(0.85, 0.85, 1.25);
  const beak = mesh(new THREE.ConeGeometry(0.15, 0.85, 7), goldMat, 0, 2.45, 4.15); beak.rotation.x = Math.PI / 2 + 0.28;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe890 });
  root.add(body, belly, neck, headM, beak,
    mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat, 0.3, 2.68, 3.7),
    mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat, -0.3, 2.68, 3.7));

  // 羽毛材质：实体羽形（alphaTest），仅微光 —— 不再整片发光
  const featherMat = (color, emissive, ei) => new THREE.MeshStandardMaterial({
    map: phoenixFeatherT(), color, alphaTest: 0.32, side: THREE.DoubleSide,
    emissiveMap: phoenixFeatherT(), emissive, emissiveIntensity: ei,
    roughness: 0.72, metalness: 0.12,
  });
  const covertMat = featherMat(0xa82a0e, 0x581004, 0.5);  // 覆羽·深绯
  const flightMat = featherMat(0xffffff, 0x7a2808, 0.45); // 飞羽·渐金
  const crestMat = featherMat(0xffc860, 0x8a4a08, 0.8);   // 冠羽·鎏金
  const tailMat = featherMat(0xffd8a8, 0x9a3808, 0.6);    // 尾羽·金橙

  const feather = (len, w, mat) => new THREE.Mesh(featherGeo(len, w), mat);

  for (let k = 0; k < 4; k++) { // 冠羽：后掠小簇
    const f = feather(1.1 + k * 0.3, 0.3 + k * 0.06, crestMat);
    placeFeather(f, V(0, 2.85 + k * 0.08, 3.35), V((k - 1.5) * 0.12, 0.9 - k * 0.15, -0.55));
    root.add(f);
  }

  // 翅膀：翼臂 + 覆羽 + 次级飞羽 + 腕部初级飞羽扇
  const wings = [];
  for (const side of [1, -1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.75, 0.7, 0.3);
    wing.scale.x = side;
    // 翼臂（肩→腕），覆羽贴覆其上
    wing.add(new THREE.Mesh(tube([V(0, 0, 0.55), V(2.1, 0.22, -0.05), V(4.3, 0.08, -1.3)], 0.36, 12, 8), coreMat));
    // 覆羽 2 排：短圆羽压住翼根
    for (let k = 0; k < 11; k++) {
      const u = k / 10;
      const len = 1.1 + u * 1.0;
      const f = feather(len, len * 0.44, covertMat);
      placeFeather(f, V(0.45 + u * 3.5, 0.12, 0.3 - u * 1.3), V(0.22 + u * 0.3, 0.03, -1));
      wing.add(f);
    }
    for (let k = 0; k < 8; k++) {
      const u = k / 7;
      const len = 0.8 + u * 0.7;
      const f = feather(len, len * 0.46, covertMat);
      placeFeather(f, V(0.35 + u * 3.0, 0.2, 0.55 - u * 1.0), V(0.15 + u * 0.25, 0.06, -1));
      wing.add(f);
    }
    // 次级飞羽：沿前臂排开、斜向后方
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      const len = 2.4 + u * 1.5;
      const f = feather(len, len * 0.2, flightMat);
      placeFeather(f, V(1.7 + u * 2.5, 0.05, -0.3 - u * 1.1), V(0.24 + u * 0.34, 0, -1));
      wing.add(f);
    }
    // 初级飞羽：腕部扇形分开、逐根外张
    for (let k = 0; k < 6; k++) {
      const u = k / 5;
      const len = 3.4 + u * 2.4;
      const f = feather(len, len * 0.16, flightMat);
      placeFeather(f, V(4.2 + u * 1.0, 0, -1.25 - u * 0.6), V(0.42 + u * 0.55, -0.02, -1), (u - 0.5) * 0.35);
      wing.add(f);
    }
    root.add(wing);
    wings.push({ wing, side });
  }

  // 尾羽：7 根流线金翎，轻扇开
  const tails = [];
  for (let k = 0; k < 7; k++) {
    const u = (k - 3) / 3; // -1..1
    const len = 8.5 - Math.abs(u) * 3.2;
    const f = feather(len, len * 0.15, tailMat);
    f.userData = {
      pos: V(u * 0.4, 0.15, -1.7),
      dir: V(u * 0.38, 0.2 + Math.abs(u) * 0.04, -1),
      ph: Math.random() * 6,
    };
    placeFeather(f, f.userData.pos, f.userData.dir);
    root.add(f);
    tails.push(f);
  }

  const light = new THREE.PointLight(0xff8a30, 4.5, 60, 1);
  root.add(light);
  root.scale.setScalar(1.25);
  scene.add(root);

  // 余烬粒子
  const EM = 220;
  const eGeo = new THREE.BufferGeometry();
  const ePos = new Float32Array(EM * 3), eCol = new Float32Array(EM * 3);
  const eLife = new Float32Array(EM), eVel = new Float32Array(EM * 3);
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({
    size: 0.6, map: flameT(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  embers.frustumCulled = false;
  scene.add(embers);
  let ei = 0;
  const tmp = new THREE.Vector3();
  let a = 0;
  return {
    root,
    update(dt, t) {
      a += dt * 0.16;
      const p = (u) => V(center.x + Math.cos(u) * radius, height + Math.sin(u * 3) * 5, center.z + Math.sin(u) * radius);
      const pos = p(a);
      root.position.copy(pos);
      root.lookAt(p(a + 0.05));
      root.rotateZ(-0.35);
      const flap = Math.sin(t * 2.6);
      for (const { wing, side } of wings) wing.rotation.z = side * flap * 0.55;
      root.position.y += -flap * 0.4;
      for (const f of tails) {
        const d = f.userData;
        placeFeather(f, d.pos, V(
          d.dir.x + Math.sin(t * 1.2 + d.ph) * 0.07,
          d.dir.y + Math.sin(t * 1.6 + d.ph) * 0.1,
          d.dir.z));
      }
      light.intensity = 4.2 + Math.sin(t * 9) * 1.0;
      for (let k = 0; k < 4; k++) {
        const i = ei; ei = (ei + 1) % EM;
        tmp.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 2, -Math.random() * 18);
        root.localToWorld(tmp);
        ePos[i * 3] = tmp.x; ePos[i * 3 + 1] = tmp.y; ePos[i * 3 + 2] = tmp.z;
        eVel[i * 3] = (Math.random() - 0.5) * 1.5; eVel[i * 3 + 1] = -0.5 - Math.random() * 1.5; eVel[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
        eLife[i] = 1;
      }
      for (let i = 0; i < EM; i++) {
        if (eLife[i] <= 0) { eCol[i * 3] = eCol[i * 3 + 1] = eCol[i * 3 + 2] = 0; continue; }
        eLife[i] -= dt * 0.55;
        ePos[i * 3] += eVel[i * 3] * dt; ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt; ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
        const l = Math.max(0, eLife[i]);
        eCol[i * 3] = l; eCol[i * 3 + 1] = l * 0.55; eCol[i * 3 + 2] = l * 0.15;
      }
      eGeo.attributes.position.needsUpdate = eGeo.attributes.color.needsUpdate = true;
    },
  };
}

// ============ 白虎（金纹双翼，月下踞岩） ============
export function buildTiger() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({
    map: tigerTex(), roughness: 0.9, emissiveMap: runeLinesTex(), emissive: 0xffc050, emissiveIntensity: 0.9,
  });
  const plain = new THREE.MeshStandardMaterial({ map: furTex, color: 0xf4f1ea, roughness: 1 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xd99a9a, roughness: 0.7 });
  const body = mesh(new THREE.CapsuleGeometry(0.85, 1.7, 6, 14), fur, 0, 1.05, -0.3); body.rotation.x = Math.PI / 2 - 0.25;
  const chest = mesh(new THREE.SphereGeometry(0.95, 16, 12), fur, 0, 1.55, 0.95); chest.scale.set(1, 1.1, 0.95);
  const head = new THREE.Group(); head.position.set(0, 2.55, 1.55);
  const skull = mesh(new THREE.SphereGeometry(0.72, 18, 14), fur); skull.scale.set(1.05, 0.92, 1);
  const muzzle = mesh(new THREE.SphereGeometry(0.4, 14, 10), plain, 0, -0.22, 0.6); muzzle.scale.set(1.05, 0.72, 1.0);
  const nose = mesh(new THREE.SphereGeometry(0.11, 8, 6), pink, 0, -0.08, 0.98); nose.scale.set(1.4, 0.8, 1);
  head.add(skull, muzzle, nose);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffc23a });
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.085, 10, 8), eyeMat, sx * 0.28, 0.12, 0.62));
    const ear = mesh(new THREE.SphereGeometry(0.24, 10, 8), fur, sx * 0.5, 0.62, -0.05); ear.scale.set(1, 1.1, 0.45);
    const earIn = mesh(new THREE.SphereGeometry(0.15, 8, 6), pink, sx * 0.5, 0.6, 0.03); earIn.scale.set(1, 1.1, 0.3);
    head.add(ear, earIn);
    for (let k = 0; k < 4; k++) { // 颊毛
      const ruff = mesh(new THREE.ConeGeometry(0.14, 0.6, 5), plain, sx * (0.68 + k * 0.03), -0.25 - k * 0.1, 0.05 - k * 0.05);
      ruff.rotation.z = sx * (1.9 + k * 0.15);
      head.add(ruff);
    }
  }
  const mark = mesh(new THREE.PlaneGeometry(0.42, 0.55), additive({ map: flameT(), color: 0xffc040, opacity: 0.95 }), 0, 0.42, 0.62);
  mark.rotation.x = -0.35;
  head.add(mark);
  g.add(body, chest, head);
  // 前腿
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.5, 10), fur, sx * 0.5, 0.8, 1.45));
    const paw = mesh(new THREE.SphereGeometry(0.34, 12, 8), plain, sx * 0.5, 0.15, 1.65); paw.scale.set(1, 0.55, 1.3);
    const haunch = mesh(new THREE.SphereGeometry(0.8, 14, 10), fur, sx * 0.72, 0.85, -1.15); haunch.scale.set(0.75, 1, 1.1);
    const hpaw = mesh(new THREE.SphereGeometry(0.34, 12, 8), plain, sx * 0.85, 0.15, -0.45); hpaw.scale.set(1, 0.55, 1.5);
    g.add(paw, haunch, hpaw);
  }
  // 尾巴
  const tail = new THREE.Group(); tail.position.set(0, 0.6, -1.9);
  tail.add(new THREE.Mesh(tube([V(0, 0, 0), V(-0.6, -0.4, -0.6), V(-1.6, -0.45, -0.3), V(-2.1, -0.3, 0.6), V(-2.0, 0.1, 1.2)], 0.17, 24, 8), fur));
  tail.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a24 }), -2.0, 0.15, 1.25));
  g.add(tail);
  // 双翼
  const wingMat = new THREE.MeshStandardMaterial({
    map: featherT(), color: 0xffffff, emissive: 0xffd880, emissiveMap: featherT(), emissiveIntensity: 0.8,
    transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: false,
  });
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(sx * 0.55, 2.0, 0.4);
    for (let k = 0; k < 10; k++) {
      const len = 1.4 + Math.sin((k / 9) * Math.PI) * 1.4 + k * 0.08;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, len).translate(0, len / 2, 0), wingMat);
      f.rotation.order = 'YZX';
      f.rotation.z = -sx * (0.25 + k * 0.13);
      f.rotation.x = -0.5 - k * 0.07;
      f.rotation.y = sx * 0.6;
      w.add(f);
    }
    g.add(w); wings.push({ w, sx });
  }
  // 环绕符环
  const ring = new THREE.Group();
  ring.add(new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.035, 6, 140), additive({ color: 0xffcc66, opacity: 0.7 })));
  const ringDisc = mesh(new THREE.RingGeometry(4.15, 4.65, 96, 1), additive({ map: runeCircleTex(7), color: 0xffc860, opacity: 0.85 }));
  ring.add(ringDisc);
  ring.position.set(0, 2.4, 0.2);
  ring.rotation.set(0.15, 0.9, 0.2);
  g.add(ring);
  g.scale.setScalar(1.35);
  return {
    group: g,
    update(dt, t, env) {
      body.scale.y = 1 + Math.sin(t * 1.4) * 0.025;
      head.rotation.y = Math.sin(t * 0.25) * 0.35;
      head.rotation.x = Math.sin(t * 0.4) * 0.05;
      tail.rotation.y = Math.sin(t * 0.9) * 0.25;
      for (const { w, sx } of wings) w.rotation.z = sx * Math.sin(t * 1.2) * 0.1;
      ringDisc.rotation.z += dt * 0.12;
      fur.emissiveIntensity = 0.5 + env.night * 0.9 + Math.sin(t * 2) * 0.12;
      eyeMat.color.setHSL(0.11, 1, 0.5 + env.night * 0.2);
    },
  };
}

// ============ 麒麟（金鳞焰身，镇守祭坛） ============
export function buildQilin() {
  const g = new THREE.Group();
  const scale = new THREE.MeshStandardMaterial({
    map: scaleTex('#c9a24a', '#5b4316', '#f6e3a0'), metalness: 0.55, roughness: 0.38,
    emissive: 0x2a1c04, emissiveIntensity: 1,
  });
  const mane = new THREE.MeshStandardMaterial({ color: 0xe9c47a, roughness: 0.7, emissive: 0x6a3a08, emissiveIntensity: 0.6 });
  const horn = new THREE.MeshStandardMaterial({ color: 0xd8b058, metalness: 0.8, roughness: 0.25 });
  const body = mesh(new THREE.CapsuleGeometry(0.72, 1.9, 6, 14), scale, 0, 2.15, 0); body.rotation.x = Math.PI / 2;
  const chest = mesh(new THREE.SphereGeometry(0.85, 16, 12), scale, 0, 2.35, 1.1);
  const neck = new THREE.Mesh(tube([V(0, 2.6, 1.3), V(0, 3.3, 1.75), V(0, 3.85, 2.0)], 0.42, 12, 10), scale);
  g.add(body, chest, neck);
  const head = new THREE.Group(); head.position.set(0, 4.0, 2.2);
  const skull = mesh(new THREE.SphereGeometry(0.5, 16, 12), scale); skull.scale.set(1, 0.92, 1.2);
  const snout = mesh(new THREE.SphereGeometry(0.36, 14, 10), scale, 0, -0.12, 0.62); snout.scale.set(1.05, 0.7, 1.3);
  const jaw = mesh(new THREE.SphereGeometry(0.3, 12, 8), scale, 0, -0.42, 0.5); jaw.scale.set(0.95, 0.4, 1.3); jaw.rotation.x = 0.3;
  head.add(skull, snout, jaw);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd040 });
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), eyeMat, sx * 0.33, 0.12, 0.5));
    const h = antler(horn, sx, 1.1, 2); h.position.set(sx * 0.22, 0.35, -0.1); h.rotation.x = -0.25;
    head.add(h);
    head.add(new THREE.Mesh(tube([V(sx * 0.3, -0.15, 1.05), V(sx * 0.9, -0.1, 0.9), V(sx * 1.4, -0.4, 0.4), V(sx * 1.6, -0.9, -0.2)], 0.025, 16, 4), horn));
    for (let k = 0; k < 4; k++) {
      const tooth = mesh(new THREE.ConeGeometry(0.035, 0.14, 4), new THREE.MeshStandardMaterial({ color: 0xfff6e0 }), sx * (0.2 - k * 0.03), -0.3, 0.8 + k * 0.08);
      tooth.rotation.x = Math.PI;
      head.add(tooth);
    }
  }
  for (let k = 0; k < 7; k++) { // 胡须
    const c = mesh(new THREE.ConeGeometry(0.08, 0.6, 5), mane, (k - 3) * 0.08, -0.6, 0.45);
    c.rotation.x = Math.PI - 0.4;
    head.add(c);
  }
  g.add(head);
  for (let k = 0; k < 22; k++) { // 鬃毛顺着颈背
    const t = k / 21;
    const c = mesh(new THREE.ConeGeometry(0.16, 0.9 + Math.random() * 0.6, 5), mane,
      (Math.random() - 0.5) * 0.5, 4.2 - t * 1.7, 2.0 - t * 1.0);
    c.rotation.x = -1.3 - Math.random() * 0.4; c.rotation.z = (Math.random() - 0.5) * 0.8;
    g.add(c);
  }
  for (const [x, z] of [[-0.45, 1.1], [0.45, 1.1], [-0.45, -1.0], [0.45, -1.0]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.15, 10), scale, x, 1.45, z));
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.0, 8), scale, x, 0.55, z + 0.05));
    g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0x3a3630, metalness: 0.4 }), x, 0.09, z + 0.07));
    for (let k = 0; k < 3; k++) {
      const tuft = mesh(new THREE.ConeGeometry(0.08, 0.4, 4), mane, x + (k - 1) * 0.08, 0.35, z - 0.12);
      tuft.rotation.x = -2.2;
      g.add(tuft);
    }
  }
  const tail = new THREE.Mesh(tube([V(0, 2.4, -1.6), V(0, 2.9, -2.2), V(0, 3.8, -2.3), V(0, 4.3, -1.7)], 0.13, 16, 6), scale);
  g.add(tail);
  // 焰光
  const flames = [];
  const flameMatGold = additive({ map: flameT(), color: 0xffc040, opacity: 0.85 });
  const flameMatJade = additive({ map: flameT(), color: 0x4ff0c8, opacity: 0.75 });
  const anchors = [V(0, 4.4, -1.6), V(0, 3, 1.5), V(0, 2.9, 0.4), V(0, 2.8, -0.6)];
  for (let k = 0; k < 34; k++) {
    const sp = new THREE.Sprite(k % 4 === 0 ? flameMatJade.clone() : flameMatGold.clone());
    const base = k < anchors.length ? anchors[k] : V((Math.random() - 0.5) * 1.6, 0.3 + Math.random() * 3.6, (Math.random() - 0.5) * 3.2);
    sp.userData = { base, ph: Math.random() * 6, s: 0.5 + Math.random() * 0.9 };
    g.add(sp);
    flames.push(sp);
  }
  const light = new THREE.PointLight(0xffb040, 4, 26, 1);
  light.position.set(0, 3, 0);
  g.add(light);
  return {
    group: g,
    update(dt, t, env) {
      head.rotation.x = Math.sin(t * 0.7) * 0.06;
      head.rotation.y = Math.sin(t * 0.3) * 0.25;
      for (const f of flames) {
        const u = f.userData;
        const k = (t * 0.9 + u.ph) % 1;
        f.position.copy(u.base).add(V(0, k * 0.9, 0));
        f.scale.set(u.s * 0.6 * (1 - k * 0.5), u.s * (1.2 - k * 0.6), 1);
        f.material.opacity = (1 - k) * 0.9;
      }
      light.intensity = 3 + env.night * 4 + Math.sin(t * 11) * 0.6;
    },
  };
}

// ============ 白鹿（鹿角挂灵符，湖边饮水） ============
export function buildDeer({ tags = true, scale = 1 } = {}) {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ map: deerTex(), roughness: 0.85, emissive: 0x101818 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.6 });
  const body = mesh(new THREE.CapsuleGeometry(0.4, 1.05, 6, 12), coat, 0, 1.35, 0); body.rotation.x = Math.PI / 2;
  g.add(body);
  for (const [x, z] of [[-0.22, 0.55], [0.22, 0.55], [-0.22, -0.55], [0.22, -0.55]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.05, 1.15, 8), coat, x, 0.6, z));
    g.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0x4a4038 }), x, 0.04, z));
  }
  g.add(mesh(new THREE.ConeGeometry(0.1, 0.25, 6), coat, 0, 1.5, -0.85).rotateX(-2.4));
  const neck = new THREE.Group(); neck.position.set(0, 1.5, 0.6);
  neck.add(new THREE.Mesh(tube([V(0, 0, 0), V(0, -0.2, 0.35), V(0, -0.55, 0.6)], 0.17, 10, 8), coat));
  const head = new THREE.Group(); head.position.set(0, -0.65, 0.7);
  const skull = mesh(new THREE.SphereGeometry(0.2, 14, 10), coat); skull.scale.set(1, 1, 1.5);
  const snout = mesh(new THREE.SphereGeometry(0.12, 10, 8), coat, 0, -0.08, 0.3); snout.scale.set(1, 0.85, 1.3);
  head.add(skull, snout, mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshStandardMaterial({ color: 0x2a2020 }), 0, -0.07, 0.45));
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }), sx * 0.14, 0.05, 0.12));
    const ear = mesh(new THREE.SphereGeometry(0.1, 8, 6), coat, sx * 0.2, 0.12, -0.12); ear.scale.set(1.6, 0.5, 0.7);
    head.add(ear);
    const ant = antler(ivory, sx, 1.1 * (tags ? 1.1 : 0.6), 3);
    ant.position.set(sx * 0.09, 0.15, -0.05);
    ant.rotation.x = 1.2; // 低头饮水时鹿角向前上方
    head.add(ant);
    if (tags) {
      const vine = new THREE.MeshStandardMaterial({ color: 0x4f9a3a, roughness: 0.8 });
      ant.add(new THREE.Mesh(tube([V(0, 0.1, 0), V(0.25 * sx, 0.6, -0.2), V(0.4 * sx, 1.1, -0.5), V(0.5 * sx, 1.4, -0.8)], 0.022, 16, 4), vine));
      const tagMat = new THREE.MeshStandardMaterial({
        map: talismanTex('#b8f2c4', '#2f7a4a'), emissive: 0x6cffa0, emissiveIntensity: 0.4, side: THREE.DoubleSide, transparent: true,
      });
      for (let k = 0; k < 4; k++) {
        const tg = mesh(new THREE.PlaneGeometry(0.11, 0.32), tagMat, (0.15 + k * 0.1) * sx, 0.35 + k * 0.28, -0.12 - k * 0.17);
        tg.rotation.x = -1.2;
        ant.add(tg);
      }
    }
  }
  neck.add(head);
  g.add(neck);
  g.scale.setScalar(scale);
  return {
    group: g,
    update(dt, t) {
      neck.rotation.x = Math.sin(t * 0.8) * 0.12 + 0.05;
      head.rotation.x = Math.sin(t * 1.6) * 0.08;
    },
  };
}

// ============ 白灵狐（虹彩白毛、翠绿灵瞳） ============
export function buildSpiritFox() {
  const g = new THREE.Group();
  const furMat = new THREE.MeshPhysicalMaterial({
    map: furTex, color: 0xf8f9ff, roughness: 0.75, sheen: 1, sheenColor: new THREE.Color(0xbff0ff), sheenRoughness: 0.4,
    iridescence: 0.7, iridescenceIOR: 1.5,
  });
  const pink = new THREE.MeshStandardMaterial({ color: 0xe6b4be, roughness: 0.8 });
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 10), furMat, 0, 0.5, 0); body.rotation.x = Math.PI / 2;
  const chest = mesh(new THREE.SphereGeometry(0.22, 12, 10), furMat, 0, 0.58, 0.32);
  g.add(body, chest);
  const head = new THREE.Group(); head.position.set(0, 0.8, 0.55);
  const skull = mesh(new THREE.SphereGeometry(0.17, 14, 10), furMat); skull.scale.set(1.1, 0.95, 1.05);
  const snout = mesh(new THREE.ConeGeometry(0.09, 0.32, 10), furMat, 0, -0.04, 0.26); snout.rotation.x = Math.PI / 2;
  head.add(skull, snout, mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }), 0, -0.03, 0.42));
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3cffb0 });
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeMat, sx * 0.08, 0.04, 0.14));
    const ear = mesh(new THREE.ConeGeometry(0.075, 0.26, 6), furMat, sx * 0.1, 0.2, -0.02); ear.rotation.z = -sx * 0.2;
    const earIn = mesh(new THREE.ConeGeometry(0.045, 0.18, 6), pink, sx * 0.1, 0.19, 0.012); earIn.rotation.z = -sx * 0.2;
    head.add(ear, earIn);
  }
  g.add(head);
  for (const [x, z] of [[-0.11, 0.3], [0.11, 0.3], [-0.11, -0.28], [0.11, -0.28]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.42, 6), furMat, x, 0.21, z));
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.52, -0.4);
  const tailM = mesh(new THREE.SphereGeometry(0.17, 12, 10), furMat, 0, -0.05, -0.38); tailM.scale.set(1, 1, 2.8);
  tail.add(tailM);
  tail.rotation.x = 0.35;
  g.add(tail);
  return {
    group: g,
    eyeMat,
    update(dt, t, phase = 0) {
      tail.rotation.y = Math.sin(t * 2 + phase) * 0.35;
      head.rotation.y = Math.sin(t * 0.6 + phase) * 0.4;
    },
  };
}

// 随机种子（供外部复用）
export const divineRng = mulberry(99);
