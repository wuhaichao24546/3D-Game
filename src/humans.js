import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { armEuler, loadGLB } from './player.js';

// ---------- 写实人物（NPC/村民）：复用 MakeHuman 写实人体 Cultivator.glb，按角色换衣色与头饰 ----------
let basePromise = null;
export function humanBase() {
  if (!basePromise) basePromise = loadGLB('models/Cultivator.glb').then((g) => g.scene).catch((e) => { console.warn('NPC 写实人体加载失败，保留程序化人物', e); return null; });
  return basePromise;
}

const tl = new THREE.TextureLoader();
let clothTex = null;
function cloth() {
  if (clothTex) return clothTex;
  const t = (n, srgb) => {
    const x = tl.load(`textures/cloth/linen_${n}.jpg`);
    if (srgb) x.colorSpace = THREE.SRGBColorSpace;
    x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(3, 3); x.anisotropy = 8;
    return x;
  };
  clothTex = { map: t('diff', true), normalMap: t('nor', false), roughnessMap: t('rough', false) };
  return clothTex;
}
const shared = {};
function sharedMats() {
  if (shared.Skin) return shared;
  shared.Skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffb59a) });
  shared.Eye = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  shared.Hair = new THREE.MeshPhysicalMaterial({ color: 0x0d0a08, roughness: 0.4, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x5a4a40) });
  shared.Shoe = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.85 });
  return shared;
}
function robeMat(color, sheen) {
  const c = cloth();
  const m = new THREE.MeshPhysicalMaterial({ ...c, color, roughness: 1, metalness: 0, side: THREE.DoubleSide, sheen: 0.7, sheenRoughness: 0.75, sheenColor: new THREE.Color(sheen ?? color).lerp(new THREE.Color(0xffffff), 0.4) });
  m.normalScale.set(1.2, 1.2);
  return m;
}

// opts: { robe, inner, sash, trim, hat:'bun'|'crown'|'straw'|null, height }
export function makeHuman(base, opts = {}) {
  const model = cloneSkinned(base);
  const S = sharedMats();
  const mats = {
    ...S,
    Robe: robeMat(opts.robe ?? 0x3a4d6e),
    RobeInner: robeMat(opts.inner ?? 0xeeebe2, 0xffffff),
    Sash: robeMat(opts.sash ?? new THREE.Color(opts.robe ?? 0x3a4d6e).multiplyScalar(0.6).getHex()),
  };
  model.traverse((o) => {
    if (o.isMesh) {
      if (mats[o.material?.name]) o.material = mats[o.material.name];
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    }
  });
  const bb = new THREE.Box3().setFromObject(model);
  const s = (opts.height ?? 1.74) / (bb.max.y - bb.min.y);
  model.scale.setScalar(s);
  model.position.y = -bb.min.y * s;

  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name.replace(':', '')] = { bone: o, rest: o.quaternion.clone() }; });
  const pose = (name, x, y, z) => {
    const r = bones[name]; if (!r) return;
    r.bone.quaternion.copy(r.rest).multiply(new THREE.Quaternion().setFromEuler(armEuler(name, x, y, z)));
  };
  // 站姿：手臂下垂、微屈肘，双手拢于身前
  pose('mixamorigLeftArm', 0.12, 0, -1.15);
  pose('mixamorigRightArm', 0.12, 0, 1.15);
  pose('mixamorigLeftForeArm', -0.35, 0, 0);
  pose('mixamorigRightForeArm', -0.35, 0, 0);
  pose('mixamorigLeftUpLeg', 0, 0, 0.05);
  pose('mixamorigRightUpLeg', 0, 0, -0.05);

  // 头饰（挂头骨；骨骼空间是厘米，几何按米建再放大 100）
  const head = bones.mixamorigHead?.bone;
  const trim = new THREE.MeshStandardMaterial({ color: opts.trim ?? 0xd8b96a, metalness: 0.7, roughness: 0.35 });
  if (head && opts.hat) {
    // 头骨空间单位随模型而异：用头骨世界缩放换算，附件几何按米建
    head.updateWorldMatrix(true, false);
    const k = head.getWorldScale(new THREE.Vector3()).x / 0.0099; // 玩家 Cultivator 头骨 ≈0.01，附件基准缩放 100
    const g = new THREE.Group(); g.scale.setScalar(100 / k); g.position.set(0, 17 / k, -1 / k);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), S.Hair); bun.scale.y = 0.85;
    if (opts.hat === 'bun' || opts.hat === 'crown') g.add(bun);
    if (opts.hat === 'bun') {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), new THREE.MeshPhysicalMaterial({ color: 0x3f9b72, roughness: 0.15, clearcoat: 1 }));
      pin.rotation.z = Math.PI / 2; pin.position.y = 0.01; g.add(pin);
    } else if (opts.hat === 'crown') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.075, 16, 1, true), trim);
      crown.position.y = 0.035; const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.15, 6), trim);
      pin.rotation.z = Math.PI / 2; pin.position.y = 0.045; g.add(crown, pin);
    } else if (opts.hat === 'straw') {
      // 斗笠：竹篾编织感（径向条纹贴图）
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'); x.fillStyle = '#9c8452'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 256; i += 3) { x.fillStyle = `rgba(${60 + (i * 7) % 40},${45 + (i * 5) % 30},20,0.35)`; x.fillRect(i, 0, 1, 256); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1);
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.13, 40, 3, true), new THREE.MeshStandardMaterial({ map: t, roughness: 1, side: THREE.DoubleSide }));
      hat.position.y = 0.0; g.add(hat);
    }
    head.add(g);
  }
  if (head) {
    // 发盖：贴合头骨的深色头发（身体模型本身没有头发几何）
    head.updateWorldMatrix(true, false);
    const k2 = head.getWorldScale(new THREE.Vector3()).x / 0.0099;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const cap = new THREE.Group();
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    cap.scale.setScalar(100 / k2);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), S.Hair);
    hair.scale.set(0.95, 1.05, 1.0); hair.position.y = 0.012;
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), S.Hair);
    fringe.scale.set(0.95, 1.05, 1.0); fringe.position.set(0, 0.012, 0.012); fringe.rotation.x = 0.35;
    cap.add(hair, fringe);
    head.add(cap);
  }
  const root = new THREE.Group();
  root.add(model);
  root.userData.bones = bones;
  root.userData.pose = pose;
  return root;
}
