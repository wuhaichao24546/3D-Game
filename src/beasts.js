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

// ---------- 千年玄蛟 Boss：深潭巨蛟（程序化蛇身+龙首） ----------
const JIAO_WATER_Y = 2.1; // 灵湖水面高度
function buildJiao() {
  const g = new THREE.Group();
  const scaleMat = new THREE.MeshStandardMaterial({
    color: 0x1d3d38, roughness: 0.5, metalness: 0.35,
    emissive: 0x0a1a16, emissiveIntensity: 0.8,
  });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xd8d4b8, roughness: 0.7 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 0.55 });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x2a6a58, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    emissive: 0x134a3c, emissiveIntensity: 0.9, roughness: 0.6,
  });
  const segs = [];
  for (let i = 0; i < 13; i++) {
    const r = i < 3 ? 0.9 + i * 0.28 : Math.max(0.3, 1.45 - (i - 2) * 0.11);
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), scaleMat);
    s.position.set(0, 0.4, -i * 1.35);
    s.userData.i = i;
    // 腹甲
    const belly = new THREE.Mesh(new THREE.SphereGeometry(r * 0.72, 10, 8), bellyMat);
    belly.position.set(0, -r * 0.5, 0);
    belly.scale.set(0.85, 0.5, 1);
    s.add(belly);
    // 背棘
    if (i > 1 && i % 2 === 0) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 5), finMat);
      fin.position.set(0, r * 0.95, 0);
      s.add(fin);
    }
    g.add(s);
    segs.push(s);
  }
  // 龙首
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), scaleMat);
  skull.scale.set(1.0, 0.95, 1.3);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), scaleMat);
  snout.position.set(0, -0.12, 1.35); snout.scale.set(0.75, 0.55, 1.2);
  head.add(skull, snout);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd84a }));
    eye.position.set(sx * 0.55, 0.28, 0.95); head.add(eye);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.5, 6), hornMat);
    horn.position.set(sx * 0.55, 0.85, -0.3); horn.rotation.x = -0.9; head.add(horn);
    // 蛟须
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.015, 2.6, 5), hornMat);
    wh.position.set(sx * 0.5, -0.15, 1.7); wh.rotation.set(0.9, 0, sx * 0.55); head.add(wh);
  }
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), finMat);
  crest.position.set(0, 0.9, 0.1); crest.scale.set(0.4, 1, 1.4); head.add(crest);
  head.position.set(0, 0.9, 0.9);
  head.scale.setScalar(1.35);
  g.add(head);
  g.userData = { segs, head };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return g;
}

// 水龙卷：扭曲水柱 + 上升水雾
function buildTornado(x, y, z) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.5, 2.0, 9, 10, 12, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const yy = pos.getY(i);
    const tw = (yy + 4.5) * 0.55;
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const a = Math.atan2(pos.getZ(i), pos.getX(i)) + tw;
    pos.setX(i, Math.cos(a) * r);
    pos.setZ(i, Math.sin(a) * r);
  }
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9fd8e8, transparent: true, opacity: 0.5,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const col = new THREE.Mesh(geo, mat);
  col.position.y = 4.5;
  g.add(col);
  g.position.set(x, y, z);
  return g;
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
  if (b.boss) {
    out.push({ equip: genEquip(b.lv, 4) });  // Boss 保底天品
    out.push({ equip: genEquip(b.lv, 3) });  // +一件地品
    for (const [id, p] of b.def.drops || []) if (Math.random() < p) out.push({ item: id });
    return out;
  }
  for (const [id, p] of b.def.drops || []) if (Math.random() < p) out.push({ item: id });
  if (b.elite) out.push({ equip: genEquip(b.lv, 1) });          // 精英必掉灵品+
  else if (Math.random() < 0.35) out.push({ equip: genEquip(b.lv) }); // 装备爆率 35%
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
    this.domain = null;         // 灵压阵 {x,z,r}（域内敌人减速）
    this.boss = null;           // 千年玄蛟引用
  }

  rollLevel() {
    return Math.max(1, this.playerLevel() + Math.floor(Math.random() * 8) - 3);
  }

  // 精英凶兽：8% 概率，Lv+6、体型×1.4、必掉装备
  rollElite(lv) {
    return Math.random() < 0.08 ? { lv: lv + 6, elite: true } : { lv, elite: false };
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
      const er = this.rollElite(this.rollLevel());
      if (er.elite) mesh.scale.multiplyScalar(1.4);
      const lv = er.lv;
      const stats = beastStats(HORSE_DEF, lv);
      this.beasts.push({
        mesh, mixer, def: HORSE_DEF, lv, stats, elite: er.elite,
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
    const er = this.rollElite(this.rollLevel());
    if (er.elite) mesh.scale.setScalar(mesh.scale.x * 1.4 || 1.4);
    const lv = er.lv;
    const stats = beastStats(def, lv);
    this.beasts.push({
      mesh, def, lv, stats, elite: er.elite, alive: true, radius: 1.3,
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
    const er = this.rollElite(this.rollLevel());
    if (er.elite) mesh.scale.multiplyScalar(1.4);
    const lv = er.lv;
    const stats = beastStats(BIRD_DEF, lv);
    this.beasts.push({
      mesh, mixer, def: BIRD_DEF, lv, stats, elite: er.elite,
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

  // ---------- 千年玄蛟 Boss：盘踞灵湖，三阶段 ----------
  spawnBoss(cx, cz) {
    const def = { name: '千年玄蛟', boss: true, hp: 400, exp: 80, stones: 12, atk: 14, fleeAt: 0, speed: 5.5,
      drops: [['mat_jiao_scale', 1]] };
    const lv = this.playerLevel() + 9;
    const st = { ...beastStats(def, lv) };
    st.hp *= 20; st.atk *= 3; st.def *= 4; st.exp *= 20; st.stones *= 20;
    const mesh = buildJiao();
    mesh.position.set(cx, JIAO_WATER_Y + 0.4, cz);
    this.scene.add(mesh);
    const b = {
      mesh, def, lv, stats: st, boss: true, alive: true, radius: 4,
      home: { x: cx, z: cz }, heading: 0, state: 'wander', attackT: 0, lastHit: -99,
      hp: st.hp, maxHp: st.hp, phase: 1, aoeT: 5, castT: 11, wave: null,
      segs: mesh.userData.segs, head: mesh.userData.head, fx: [], bob: Math.random() * 10,
      enraged: false,
    };
    this.beasts.push(b);
    this.boss = b;
    return b;
  }

  updateBoss(b, dt, playerPos, t, onPlayerHit) {
    const p = b.mesh.position;
    const dx = playerPos.x - p.x, dz = playerPos.z - p.z;
    const dist = Math.hypot(dx, dz);
    const frac = b.hp / b.maxHp;
    b.phase = frac < 0.25 ? 3 : frac < 0.6 ? 2 : 1;
    // 狂暴：鳞片泛红
    if (b.phase === 3 && !b.enraged) {
      b.enraged = true;
      b.mesh.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material.emissive.setHex(0x5a1208); o.material.emissiveIntensity = 1.2; } });
    }
    // 蛇身游动波动
    for (const s of b.segs) {
      s.position.x = Math.sin(t * 2.6 - s.userData.i * 0.5) * s.userData.i * 0.09;
      s.position.y = 0.4 + Math.sin(t * 3.1 - s.userData.i * 0.4) * 0.12;
    }
    b.head.position.y = 0.9 + Math.sin(t * 2.2) * 0.25;

    // 觉醒：玩家近湖或被击
    const aggro = dist < 26 || performance.now() / 1000 - b.lastHit < 10;
    const spd = b.def.speed * (b.phase === 3 ? 1.5 : 1);
    if (aggro && dist > 4.5) {
      b.heading = Math.atan2(dx, dz);
      p.x += Math.sin(b.heading) * spd * dt;
      p.z += Math.cos(b.heading) * spd * dt;
    } else if (!aggro) {
      // 环湖巡游
      b.heading += dt * 0.25;
      p.x += Math.sin(b.heading) * 1.6 * dt;
      p.z += Math.cos(b.heading) * 1.6 * dt;
      const hd = Math.hypot(p.x - b.home.x, p.z - b.home.z);
      if (hd > 24) b.heading = Math.atan2(b.home.x - p.x, b.home.z - p.z);
    }
    const h = this.terrainHeight(p.x, p.z);
    p.y = Math.max(h + 0.5, JIAO_WATER_Y + 0.3) + Math.sin(t * 1.8 + b.bob) * 0.15;
    b.mesh.rotation.y = b.heading;

    // 近战扑咬
    b.attackT -= dt;
    if (aggro && dist < 5 && b.attackT <= 0) {
      b.attackT = b.phase === 3 ? 0.9 : 1.4;
      onPlayerHit?.(b.stats.atk, b);
    }

    if (b.phase >= 2) {
      // 水龙卷：3 柱持续 AoE
      b.aoeT -= dt;
      if (b.aoeT <= 0) {
        b.aoeT = b.phase === 3 ? 7 : 9;
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
          const tx = playerPos.x + Math.cos(a) * r, tz = playerPos.z + Math.sin(a) * r;
          const ty = Math.max(this.terrainHeight(tx, tz), JIAO_WATER_Y - 0.5);
          const m = buildTornado(tx, ty, tz);
          this.scene.add(m);
          b.fx.push({ mesh: m, until: 6, tick: 0, kind: 'tornado' });
        }
      }
      // 蛟吟：1.5s 读条圈 → 环形冲击波
      b.castT -= dt;
      if (b.castT <= 0 && !b.wave) {
        b.castT = b.phase === 3 ? 9 : 13;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.4, 0.7, 40),
          new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
        ring.position.copy(b.head.getWorldPosition(new THREE.Vector3()));
        this.scene.add(ring);
        b.wave = { ring, t: 0, r: 0, torus: null, hitDone: false };
        this.onBossCast?.('蛟吟'); // 顶部读条提示
      }
    }
    // 推进蛟吟波
    if (b.wave) {
      const w = b.wave;
      w.t += dt;
      if (w.t < 1.5) {
        const k = w.t / 1.5;
        w.ring.scale.setScalar(1 + k * 5);
        w.ring.material.opacity = 0.9 - k * 0.4;
        w.ring.position.copy(b.head.getWorldPosition(new THREE.Vector3()));
      } else {
        if (!w.torus) {
          this.scene.remove(w.ring);
          w.torus = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.7, 8, 60),
            new THREE.MeshBasicMaterial({ color: 0x7ae0ff, transparent: true, opacity: 0.75, depthWrite: false }));
          w.torus.rotation.x = Math.PI / 2;
          w.torus.position.copy(b.head.getWorldPosition(new THREE.Vector3()));
          this.scene.add(w.torus);
        }
        w.r += dt * 16;
        w.torus.scale.set(w.r, w.r, 1);
        w.torus.material.opacity = Math.max(0, 0.75 - w.r * 0.025);
        const wd = Math.hypot(playerPos.x - w.torus.position.x, playerPos.z - w.torus.position.z);
        if (!w.hitDone && Math.abs(wd - w.r) < 1.6 && Math.abs(playerPos.y - w.torus.position.y) < 4) {
          w.hitDone = true;
          onPlayerHit?.(b.stats.atk * 1.4, b);
        }
        if (w.r > 30) { this.scene.remove(w.torus); b.wave = null; }
      }
    }
    // 推进 AoE 特效
    for (let i = b.fx.length - 1; i >= 0; i--) {
      const f = b.fx[i];
      f.until -= dt; f.tick -= dt;
      f.mesh.rotation.y += dt * 6;
      if (f.kind === 'tornado' && f.tick <= 0) {
        f.tick = 0.6;
        const d2 = Math.hypot(playerPos.x - f.mesh.position.x, playerPos.z - f.mesh.position.z);
        if (d2 < 2.6 && Math.abs(playerPos.y - f.mesh.position.y) < 9) onPlayerHit?.(b.stats.atk * 0.4, b);
      }
      if (f.until <= 0) { this.scene.remove(f.mesh); b.fx.splice(i, 1); }
    }
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
      if (b.boss) {
        if (this.boss === b) this.boss = null;
        for (const f of b.fx || []) this.scene.remove(f.mesh);
        if (b.wave) { if (b.wave.ring) this.scene.remove(b.wave.ring); if (b.wave.torus) this.scene.remove(b.wave.torus); }
        this.beasts = this.beasts.filter(x => x !== b);
        // 玄蛟 120 秒后重归深潭
        setTimeout(() => { if (!this.boss) this.spawnBoss(b.home.x, b.home.z); }, 120000);
      } else {
        setTimeout(() => {
          this.beasts = this.beasts.filter(x => x !== b);
          this.spawnOne(b.mesh.position);
        }, 6000);
      }
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

      if (b.boss) { this.updateBoss(b, dt, playerPos, t, onPlayerHit); continue; }

      // 灵压阵：域内敌人减速 40%
      const dslow = this.domain && Math.hypot(p.x - this.domain.x, p.z - this.domain.z) < this.domain.r ? 0.6 : 1;

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
            p.addScaledVector(to, Math.min(b.def.speed * dslow * dt, d));
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
      p.x += Math.sin(b.heading) * b.speed * dslow * dt;
      p.z += Math.cos(b.heading) * b.speed * dslow * dt;
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
