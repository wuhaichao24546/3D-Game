import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
function loadGLB(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}

const furTex = (() => {
  const t = new THREE.TextureLoader().load('textures/fur.jpg');
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

// ---------- 程序化灵兽（毛皮材质版） ----------
function buildBeastBody(kind) {
  const g = new THREE.Group();
  const fur = (c) => new THREE.MeshStandardMaterial({ map: furTex, color: c, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 1 });

  if (kind === 'fox') {
    const mat = fur(0xf4f6f8);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.75, 4, 10), mat);
    body.rotation.x = Math.PI / 2; body.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat);
    head.position.set(0, 0.72, 0.6);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 8), mat);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.7, 0.88);
    const ear = new THREE.ConeGeometry(0.08, 0.24, 6);
    const earL = new THREE.Mesh(ear, dark); earL.position.set(-0.14, 0.95, 0.55);
    const earR = new THREE.Mesh(ear, dark); earR.position.set(0.14, 0.95, 0.55);
    // 九尾：三束尾羽
    for (const off of [-0.15, 0, 0.15]) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.9, 7), mat);
      tail.rotation.x = -Math.PI / 2.3;
      tail.rotation.y = off;
      tail.position.set(off, 0.65, -0.8);
      g.add(tail);
    }
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x66e0ff }));
    eyeL.position.set(-0.09, 0.76, 0.8);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.09;
    g.add(body, head, snout, earL, earR, eyeL, eyeR);
  } else if (kind === 'wolf') {
    const mat = fur(0xa6452e);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 10), mat);
    body.rotation.x = Math.PI / 2; body.position.y = 0.62;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat);
    head.position.set(0, 0.86, 0.72);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 8), mat);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.82, 1.0);
    const ear = new THREE.ConeGeometry(0.08, 0.22, 6);
    const earL = new THREE.Mesh(ear, mat); earL.position.set(-0.15, 1.05, 0.68);
    const earR = new THREE.Mesh(ear, mat); earR.position.set(0.15, 1.05, 0.68);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.8, 7), mat);
    tail.rotation.x = -Math.PI / 2.5; tail.position.set(0, 0.7, -0.95);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    eyeL.position.set(-0.1, 0.9, 0.9);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.1;
    g.add(body, head, snout, earL, earR, tail, eyeL, eyeR);
  } else { // turtle 玄龟
    const shellMat = new THREE.MeshStandardMaterial({ map: furTex, color: 0x4a5d42, roughness: 1 });
    const skinMat = new THREE.MeshStandardMaterial({ map: furTex, color: 0x6d7d63, roughness: 1 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
    shell.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMat);
    head.position.set(0, 0.35, 0.65);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.4, 8), skinMat);
    neck.rotation.x = Math.PI / 2.6; neck.position.set(0, 0.3, 0.45);
    for (const [x, z] of [[-0.35, 0.3], [0.35, 0.3], [-0.35, -0.3], [0.35, -0.3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 6), skinMat);
      leg.position.set(x, 0.15, z);
      g.add(leg);
    }
    g.add(shell, head, neck);
  }
  return g;
}

const GROUND_DEFS = [
  { name: '灵狐', kind: 'fox', exp: 40, stones: 2 },
  { name: '玄龟', kind: 'turtle', exp: 60, stones: 3 },
  { name: '赤焰狼', kind: 'wolf', exp: 80, stones: 5 },
];

export class BeastManager {
  static async create(scene, terrainHeight, count = 12) {
    const [horse, parrot] = await Promise.all([
      loadGLB('models/Horse.glb'),
      loadGLB('models/Parrot.glb'),
    ]);
    const bm = new BeastManager(scene, terrainHeight, count);
    bm.horseProto = horse;
    bm.parrotProto = parrot;
    return bm;
  }

  constructor(scene, terrainHeight, count) {
    this.scene = scene;
    this.terrainHeight = terrainHeight;
    this.beasts = [];
    this.count = count;
  }

  findLand(cx, cz, range = 160) {
    let x = cx, z = cz, h = this.terrainHeight(x, z);
    for (let i = 0; i < 60 && h < 2.6; i++) {
      x = cx + (Math.random() - 0.5) * range;
      z = cz + (Math.random() - 0.5) * range;
      h = this.terrainHeight(x, z);
    }
    return { x, z, h };
  }

  spawnOne(center) {
    // 30% 真实模型灵驹，其余毛皮灵兽
    if (Math.random() < 0.3) {
      const mesh = skeletonClone(this.horseProto.scene);
      const bb = new THREE.Box3().setFromObject(mesh);
      const bh = bb.max.y - bb.min.y;
      const s = (bh > 0.01 && isFinite(bh)) ? 1.4 / bh : 1;
      mesh.scale.setScalar(Math.min(s, 20));
      const { x, z, h } = this.findLand(center.x, center.z);
      mesh.position.set(x, h, z);
      mesh.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      this.scene.add(mesh);
      const mixer = new THREE.AnimationMixer(mesh);
      if (this.horseProto.animations.length) mixer.clipAction(this.horseProto.animations[0]).play();
      this.beasts.push({
        mesh, mixer, def: { name: '灵驹', exp: 70, stones: 4 },
        alive: true, radius: 1.6, heading: Math.random() * Math.PI * 2,
        timer: Math.random() * 4, speed: 1.5, bob: Math.random() * 10, flyers: false,
      });
      return;
    }
    const def = GROUND_DEFS[Math.floor(Math.random() * GROUND_DEFS.length)];
    const mesh = buildBeastBody(def.kind);
    const { x, z, h } = this.findLand(center.x, center.z);
    mesh.position.set(x, h, z);
    this.scene.add(mesh);
    this.beasts.push({
      mesh, def, alive: true, radius: 1.3,
      heading: Math.random() * Math.PI * 2, timer: Math.random() * 4,
      speed: 1.2 + Math.random(), bob: Math.random() * 10, flyers: false,
    });
  }

  // 青鸾：环湖飞行的灵鸟
  spawnBird(cx, cz) {
    const mesh = skeletonClone(this.parrotProto.scene);
    const bb = new THREE.Box3().setFromObject(mesh);
    const bh = bb.max.y - bb.min.y;
    const s = (bh > 0.01 && isFinite(bh)) ? 0.9 / bh : 1;
    mesh.scale.setScalar(Math.min(s, 20));
    mesh.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.color?.lerp(new THREE.Color(0x66d8ff), 0.5);
      }
      if (o.isMesh) o.frustumCulled = false;
    });
    this.scene.add(mesh);
    const mixer = new THREE.AnimationMixer(mesh);
    if (this.parrotProto.animations.length) mixer.clipAction(this.parrotProto.animations[0]).play();
    this.beasts.push({
      mesh, mixer, def: { name: '青鸾', exp: 90, stones: 6 },
      alive: true, radius: 1.4, flyers: true,
      circle: { x: cx, z: cz, r: 30 + Math.random() * 25, y: 12 + Math.random() * 10, w: (0.15 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1) },
      a: Math.random() * Math.PI * 2, bob: Math.random() * 10,
    });
  }

  populate(center) {
    for (let i = 0; i < this.count; i++) this.spawnOne(center);
    for (let i = 0; i < 3; i++) this.spawnBird(0, 0);
  }

  update(dt, playerPos, t) {
    for (const b of this.beasts) {
      if (!b.alive) continue;
      b.mixer?.update(dt);
      const p = b.mesh.position;

      if (b.flyers) {
        const c = b.circle;
        b.a += c.w * dt;
        p.set(c.x + Math.cos(b.a) * c.r, c.y + Math.sin(t + b.bob) * 1.5, c.z + Math.sin(b.a) * c.r);
        b.mesh.rotation.y = -b.a + (c.w > 0 ? Math.PI / 2 : -Math.PI / 2);
        continue;
      }

      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      b.timer -= dt;
      if (dist < 7) {
        b.heading = Math.atan2(dx, dz);
        b.speed = 4.5;
      } else {
        b.speed = 1.2;
        if (b.timer <= 0) {
          b.heading += (Math.random() - 0.5) * 1.8;
          b.timer = 2 + Math.random() * 4;
        }
      }
      p.x += Math.sin(b.heading) * b.speed * dt;
      p.z += Math.cos(b.heading) * b.speed * dt;
      const h = this.terrainHeight(p.x, p.z);
      if (h < 2.4) b.heading += Math.PI / 2;
      p.y = h + 0.05 + Math.abs(Math.sin(t * 6 + b.bob)) * 0.06;
      b.mesh.rotation.y = b.heading;
    }
  }

  kill(b) {
    if (!b.alive) return null;
    b.alive = false;
    this.scene.remove(b.mesh);
    setTimeout(() => {
      this.beasts = this.beasts.filter(x => x !== b);
      this.spawnOne(b.mesh.position);
    }, 6000);
    return b.def;
  }

  get targets() { return this.beasts; }
}
