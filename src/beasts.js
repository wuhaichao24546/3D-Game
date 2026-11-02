import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { buildSpiritFox, buildDeer, furTex as sharedFur } from './divine.js';
import { beastStats } from './combat.js';
import { genEquip } from './gear.js';

const loader = new GLTFLoader();
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('draco/'));
function loadGLB(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}

const furTex = sharedFur;

// ---------- 程序化灵兽（毛皮材质版） ----------
function buildBeastBody(kind) {
  const g = new THREE.Group();
  const fur = (c) => new THREE.MeshStandardMaterial({ map: furTex, color: c, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 1 });

  if (kind === 'fox') return buildSpiritFox().group;
  if (kind === 'deer') {
    const d = buildDeer({ tags: false, scale: 0.75 });
    return d.group;
  }
  if (kind === 'wolf') {
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

// hp 气血 / atk 每次扑击对玩家的伤害 / speed 追击速度 / flee: 受击逃逸（被动兽）
const GROUND_DEFS = [
  { name: '灵狐', kind: 'fox', exp: 40, stones: 2, hp: 60, atk: 6, fleeAt: 0.3, speed: 4.2,
    drops: [['mat_fox_core', 0.6], ['mat_fox_fur', 0.4], ['pill_heal', 0.15]] },
  { name: '白鹿', kind: 'deer', exp: 70, stones: 3, hp: 80, atk: 5, fleeAt: 0.4, speed: 4.6,
    drops: [['mat_deer_antler', 0.55], ['pill_heal', 0.2]] },
  { name: '玄龟', kind: 'turtle', exp: 60, stones: 3, hp: 160, atk: 4, fleeAt: 0, speed: 2.2,
    drops: [['mat_turtle_shell', 0.7]] },
  { name: '赤焰狼', kind: 'wolf', exp: 80, stones: 5, hp: 110, atk: 12, fleeAt: 0, speed: 4.8,
    drops: [['mat_wolf_core', 0.65], ['mat_wolf_fang', 0.45], ['pill_exp', 0.15]] },
];

// 掉落表掷签：返回 [{item:id}|{equip}|{stones:n}]；数值随怪等级缩放
function rollDrops(b) {
  const out = [{ stones: b.stats.stones }];
  for (const [id, p] of b.def.drops || []) if (Math.random() < p) out.push({ item: id });
  if (Math.random() < 0.35) out.push({ equip: genEquip(b.lv) }); // 装备爆率 35%
  return out;
}

const HORSE_DEF = { name: '灵驹', exp: 70, stones: 4, hp: 80, atk: 5, fleeAt: 1, speed: 4.5, passive: true,
  drops: [['mat_horse_mane', 0.6], ['pill_exp', 0.2]] };
const BIRD_DEF = { name: '青鸾', exp: 90, stones: 6, hp: 70, atk: 8, fleeAt: 0, speed: 6,
  drops: [['mat_bird_feather', 0.65], ['pill_exp', 0.2]] };

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
    this.playerLevel = () => 5; // main 注入：怪物按玩家道行定级
  }

  rollLevel() {
    return Math.max(1, this.playerLevel() + Math.floor(Math.random() * 8) - 3);
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
      mesh.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        if (!ms.some((m) => m && m.transparent)) o.castShadow = true;
        o.receiveShadow = true;
      });
      this.scene.add(mesh);
      const mixer = new THREE.AnimationMixer(mesh);
      if (this.horseProto.animations.length) mixer.clipAction(this.horseProto.animations[0]).play();
      const lv = this.rollLevel();
      const stats = beastStats(HORSE_DEF, lv);
      this.beasts.push({
        mesh, mixer, def: HORSE_DEF, lv, stats,
        alive: true, radius: 1.6, heading: Math.random() * Math.PI * 2,
        timer: Math.random() * 4, speed: 1.5, bob: Math.random() * 10, flyers: false,
        hp: stats.hp, maxHp: stats.hp, state: 'wander', attackT: 0, lastHit: -99,
      });
      return;
    }
    const def = GROUND_DEFS[Math.floor(Math.random() * GROUND_DEFS.length)];
    const mesh = buildBeastBody(def.kind);
    const { x, z, h } = this.findLand(center.x, center.z);
    mesh.position.set(x, h, z);
    this.scene.add(mesh);
    const lv = this.rollLevel();
    const stats = beastStats(def, lv);
    this.beasts.push({
      mesh, def, lv, stats, alive: true, radius: 1.3,
      heading: Math.random() * Math.PI * 2, timer: Math.random() * 4,
      speed: 1.2 + Math.random(), bob: Math.random() * 10, flyers: false,
      hp: stats.hp, maxHp: stats.hp, state: 'wander', attackT: 0, lastHit: -99, fleeT: 0,
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
      if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; }
    });
    this.scene.add(mesh);
    const mixer = new THREE.AnimationMixer(mesh);
    if (this.parrotProto.animations.length) mixer.clipAction(this.parrotProto.animations[0]).play();
    const lv = this.rollLevel();
    const stats = beastStats(BIRD_DEF, lv);
    this.beasts.push({
      mesh, mixer, def: BIRD_DEF, lv, stats,
      alive: true, radius: 1.4, flyers: true,
      circle: { x: cx, z: cz, r: 30 + Math.random() * 25, y: 12 + Math.random() * 10, w: (0.15 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1) },
      a: Math.random() * Math.PI * 2, bob: Math.random() * 10,
      hp: stats.hp, maxHp: stats.hp, state: 'wander', attackT: 0, lastHit: -99,
    });
  }

  populate(center) {
    for (let i = 0; i < this.count; i++) this.spawnOne(center);
    for (let i = 0; i < 3; i++) this.spawnBird(0, 0);
  }

  // ---------- 受击：返回 {amount, killed, def, drops} ----------
  damage(b, amount, tag = '') {
    if (!b.alive) return null;
    const dealt = Math.min(b.hp, Math.max(1, Math.round(amount)));
    b.hp -= dealt;
    b.lastHit = performance.now() / 1000;
    if (b.hp <= 0) {
      const def = b.def;
      b.alive = false;
      this.scene.remove(b.mesh);
      setTimeout(() => {
        this.beasts = this.beasts.filter(x => x !== b);
        this.spawnOne(b.mesh.position);
      }, 6000);
      return { amount: dealt, killed: true, def, exp: b.stats.exp, drops: rollDrops(b) };
    }
    // 受击行为：被动/残血逃逸，否则追击
    if (b.def.passive || (b.def.fleeAt > 0 && b.hp / b.maxHp < b.def.fleeAt)) {
      b.state = 'flee';
      b.fleeT = 8;
    } else if (b.state === 'wander') {
      b.state = 'chase';
    }
    return { amount: dealt, killed: false, def: b.def, drops: [] };
  }

  update(dt, playerPos, t, onPlayerHit) {
    for (const b of this.beasts) {
      if (!b.alive) continue;
      b.mixer?.update(dt);
      const p = b.mesh.position;

      if (b.flyers) {
        const c = b.circle;
        // 青鸾被激怒时俯冲突袭
        if (b.state === 'chase') {
          b.attackT -= dt;
          const to = new THREE.Vector3(playerPos.x - p.x, playerPos.y + 1.2 - p.y, playerPos.z - p.z);
          const d = to.length();
          if (d > 50) { b.state = 'wander'; }
          else {
            to.normalize();
            p.addScaledVector(to, Math.min(b.def.speed * dt, d));
            if (d < 2.2 && b.attackT <= 0) {
              b.attackT = 1.6;
              onPlayerHit?.(b.stats.atk, b);
            }
            b.mesh.rotation.y = Math.atan2(to.x, to.z);
            continue;
          }
        } else if (b.state === 'flee') {
          b.fleeT -= dt;
          c.y += dt * 6;
          if (b.fleeT <= 0) b.state = 'wander';
        }
        b.a += c.w * dt;
        p.set(c.x + Math.cos(b.a) * c.r, c.y + Math.sin(t + b.bob) * 1.5, c.z + Math.sin(b.a) * c.r);
        b.mesh.rotation.y = -b.a + (c.w > 0 ? Math.PI / 2 : -Math.PI / 2);
        continue;
      }

      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      b.timer -= dt;
      b.attackT -= dt;

      if (b.state === 'flee') {
        // 逃逸：背向远离
        b.fleeT -= dt;
        b.heading = Math.atan2(dx, dz);
        b.speed = 4.5;
        if (b.fleeT <= 0 || dist > 45) { b.state = 'wander'; b.timer = 2; }
      } else if (b.state === 'chase' || b.state === 'attack') {
        // 追击/扑咬
        if (dist > 55) { b.state = 'wander'; b.timer = 1; }
        else {
          b.heading = Math.atan2(-dx, -dz);
          if (dist > 1.9) {
            b.state = 'chase';
            b.speed = b.def.speed;
          } else {
            b.state = 'attack';
            b.speed = 0;
            if (b.attackT <= 0) {
              b.attackT = 1.35;
              onPlayerHit?.(b.stats.atk, b);
            }
          }
        }
      } else if (dist < 7 && !b.def.passive) {
        // 被动/和平兽靠近时才逃，攻击性灵兽不主动袭击（狩猎玩法）
        b.speed = 1.2;
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
    return this.damage(b, b.hp || 1, 'kill')?.def ?? null;
  }

  get targets() { return this.beasts; }
}
