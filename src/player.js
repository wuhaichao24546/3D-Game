import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const WALK = 6, RUN = 11, FLY_SPEED = 20;
const GRAVITY = 26, JUMP_V = 9.5;
const loader = new GLTFLoader();
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('draco/'));

function loadGLB(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}


function buildFlySword() {
  const g = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xb8ccd4, metalness: 0.85, roughness: 0.2,
    emissive: 0x1b5a66, emissiveIntensity: 0.7,
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 2.7), bladeMat);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.55, 4), bladeMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 1.62;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 3.4),
    new THREE.MeshBasicMaterial({ color: 0x6ff2ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.04;
  g.add(blade, tip, glow);
  return g;
}

// 姿态欧拉约定：手臂 x=前后摆(负为后)、z=下垂；前臂 y=屈肘；腿 x 负为前抬、小腿 x 正为屈膝；映射到 Mixamo T-pose 骨骼局部轴
function armEuler(name, x, y, z) {
  if (name === 'mixamorigLeftArm') return new THREE.Euler(-z, y, x);
  if (name === 'mixamorigRightArm') return new THREE.Euler(z, y, -x);
  if (name === 'mixamorigLeftForeArm' || name === 'mixamorigRightForeArm') return new THREE.Euler(x, 0, z - y);
  if (/^mixamorig(Left|Right)(UpLeg|Leg)$/.test(name)) return new THREE.Euler(-x, y, z);
  return new THREE.Euler(x, y, z);
}

function hairStrandTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) {
    const px = 4 + Math.random() * 56, w = 0.6 + Math.random() * 1.4, l = 150 + Math.random() * 106;
    const v = 30 + Math.random() * 60;
    x.strokeStyle = `rgba(${v},${v * 0.85},${v * 0.7},${0.6 + Math.random() * 0.4})`;
    x.lineWidth = w;
    x.beginPath(); x.moveTo(px, 0); x.quadraticCurveTo(px + (Math.random() - 0.5) * 6, l / 2, px + (Math.random() - 0.5) * 8, l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildAccessories(robeMat, builtinRobe = false) {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b96a, metalness: 0.7, roughness: 0.3 });
  const jade = new THREE.MeshStandardMaterial({ color: 0x9fd8bb, roughness: 0.4, emissive: 0x1d3a2a, emissiveIntensity: 0.4 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x0d0b08, roughness: 0.55 });

  if (!builtinRobe) {
  // 道袍下摆（宽袍大裙，及踝）
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.25, 18, 1, true), robeMat);
    skirt.geometry.translate(0, -0.625, 0);
    skirt.position.y = 1.06;
    skirt.scale.set(1.2, 1, 1.1);
    g.add(skirt);
    // 外袍披幅（背后垂下的袍角）
    const train = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.95), robeMat);
    train.position.set(0, 0.62, -0.16);
    train.rotation.x = 0.12;
    g.add(train);

    // 腰封 + 玉带钩（深色腰封配金边、碧玉）
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.14, 18, 1, true), robeMat);
    sash.position.y = 1.03;
    g.add(sash);
    const sashTrim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 24), gold);
    sashTrim.rotation.x = Math.PI / 2;
    sashTrim.position.y = 1.09;
    g.add(sashTrim);
    const jadeDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), jade);
    jadeDisc.rotation.x = Math.PI / 2;
    jadeDisc.position.set(0, 1.0, 0.31);
    g.add(jadeDisc);
  }

  // 高髻 + 黑金发冠 + 横穿玉簪 + 后披长发
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), hairMat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.09, 8, 1, true), gold);
  crown.position.y = 0.06;
  const crownGem = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), jade);
  crownGem.position.set(0, 0.08, 0.05);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 6), jade);
  pin.rotation.z = Math.PI / 2;
  pin.position.x = 0.02;
  pin.position.y = 0.03;
  const pinTip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), jade);
  pinTip.position.set(-0.17, 0.03, 0);
  const bunGroup = new THREE.Group();
  if (builtinRobe) {
    // 小发髻 + 横插碧玉簪（无金冠）
    bun.scale.set(0.8, 0.75, 0.8);
    jade.color.set(0x2f8f5c); jade.emissive.set(0x0a2416);
    const pinHead = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10), jade);
    pinHead.rotation.z = Math.PI / 2;
    pinHead.position.set(0.17, 0.03, 0);
    bunGroup.add(bun, pin, pinTip, pinHead);
  } else bunGroup.add(bun, crown, crownGem, pin, pinTip);
  // 后披长发：写实模型用发片（alpha 发丝贴图），旧模型保留三缕
  const hairGroup = new THREE.Group();
  if (builtinRobe) {
    const cardMat = new THREE.MeshStandardMaterial({ map: hairStrandTexture(), color: 0x2a2420, roughness: 0.42, alphaTest: 0.35, side: THREE.DoubleSide });
    for (let i = 0; i < 34; i++) {
      const f = i / 33 - 0.5;
      const len = 0.5 + 0.12 * Math.cos(f * Math.PI) + Math.random() * 0.06;
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.055, len, 1, 6), cardMat);
      card.geometry.translate(0, -len / 2, 0);
      const pa = card.geometry.attributes.position;
      for (let k = 0; k < pa.count; k++) { const y = Math.max(0, -pa.getY(k)); pa.setZ(k, -0.06 * Math.pow(y / len, 1.6) - 0.15 * y * y); }
      card.geometry.computeVertexNormals();
      const ang = f * 2.2;
      card.position.set(Math.sin(ang) * 0.085, -Math.abs(f) * 0.05, -Math.cos(ang) * 0.075 + 0.02);
      card.rotation.y = ang * 0.9;
      card.rotation.z = -f * 0.25;
      hairGroup.add(card);
    }
  } else {
    for (const [hx, hw, hl] of [[0, 0.09, 0.62], [-0.055, 0.05, 0.52], [0.055, 0.05, 0.52]]) {
      const strand = new THREE.Mesh(new THREE.ConeGeometry(hw, hl, 6), hairMat);
      strand.geometry.translate(0, -hl / 2, 0);
      strand.position.set(hx, -0.02, -0.075);
      strand.rotation.x = 0.18;
      hairGroup.add(strand);
    }
    bunGroup.add(hairGroup);
  }

  // 背负长剑
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.3, 0.016),
    new THREE.MeshStandardMaterial({ color: 0xbfd6d2, metalness: 0.9, roughness: 0.25 }));
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.05), gold);
  guard.position.y = -0.65;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 0.9 }));
  grip.position.y = -0.79;
  sword.add(blade, guard, grip);
  sword.rotation.z = 0.6;

  return { group: g, bunGroup, hairGroup, sword, gold };
}

export class Player {
  static async create(scene, terrainHeight, spawn) {
    // 写实修士（MakeHuman CC0 人体 + 汉服，Mixamo 骨架）；加载失败回退旧模型
    let gltf, realistic = true;
    try { gltf = await loadGLB('models/Cultivator.glb'); }
    catch (e) { console.warn('Cultivator.glb 加载失败，回退 Michelle', e); gltf = await loadGLB('models/Michelle.glb'); realistic = false; }
    return new Player(scene, terrainHeight, spawn, gltf, realistic);
  }

  constructor(scene, terrainHeight, spawn, michelle, realistic = false) {
    this.terrainHeight = terrainHeight;

    const model = michelle.scene;
    // 归一化到真实身高（男修 1.78，旧模型 1.72）
    const bb = new THREE.Box3().setFromObject(model);
    const h = bb.max.y - bb.min.y;
    const scale = (realistic ? 1.78 : 1.72) / h;
    model.scale.setScalar(scale);
    model.position.y = -bb.min.y * scale;

    this.mesh = new THREE.Group();
    this.inner = new THREE.Group();
    this.inner.add(model);
    this.mesh.add(this.inner);
    this.mesh.position.copy(spawn);
    scene.add(this.mesh);

    model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; } });

    // 程序化骨骼动画（两套骨架姿态不同，不引入外部动画）
    this.bones = {};
    model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = { bone: o, rest: o.quaternion.clone(), restPos: o.position.clone() };
    });
    this.animT = 0;

    // 汉服配饰
    // 道袍：扫描亚麻织物 PBR（颜色/法线/粗糙度）+ 织物光泽 sheen
    const tl = new THREE.TextureLoader();
    const cloth = (n, srgb) => {
      const t = tl.load(`textures/cloth/linen_${n}.jpg`);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 3);
      t.anisotropy = 8;
      return t;
    };
    const robeMat = new THREE.MeshPhysicalMaterial({
      map: cloth('diff', true), normalMap: cloth('nor', false), roughnessMap: cloth('rough', false),
      color: realistic ? 0x2c3b6e : 0x3a6070, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      sheen: 0.8, sheenRoughness: 0.75, sheenColor: new THREE.Color(realistic ? 0x8a9ccc : 0x9cc4c8),
    });
    robeMat.normalScale.set(1.2, 1.2);
    if (realistic) {
      const innerMat = new THREE.MeshPhysicalMaterial({ color: 0xf0eee8, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), normalMap: robeMat.normalMap, side: THREE.DoubleSide });
      const sashMat = robeMat.clone(); sashMat.color.set(0x1c2650);
      const mats = {
        Skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffb59a) }),
        Eye: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 }),
        Hair: new THREE.MeshPhysicalMaterial({ color: 0x0d0a08, roughness: 0.38, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x5a4a40) }),
        Shoe: new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.85 }),
        Robe: robeMat, RobeInner: innerMat, Sash: sashMat,
      };
      model.traverse((o) => { if (o.isMesh && mats[o.material?.name]) o.material = mats[o.material.name]; });
    }
    const acc = buildAccessories(robeMat, realistic);
    this.inner.add(acc.group);
    this.swordMesh = acc.sword;
    // 剑挂背后、发髻上头
    const spine = this.bones['mixamorigSpine2']?.bone;
    if (spine) { acc.sword.position.set(0.02, 0.18, -16); acc.sword.scale.setScalar(100); spine.add(acc.sword); }
    else this.inner.add(acc.sword.translateY(1.55));
    const head = this.bones['mixamorigHead']?.bone;
    if (head) {
      if (realistic) acc.bunGroup.position.set(0, 21, -3); else acc.bunGroup.position.set(0, 21, 3);
      acc.bunGroup.scale.setScalar(100); head.add(acc.bunGroup);
      if (realistic) { acc.hairGroup.position.set(0, 15, -8); acc.hairGroup.scale.setScalar(100); head.add(acc.hairGroup); }
    } else this.inner.add(acc.bunGroup.translateY(1.78));

    // 宽袖（挂在两个小臂骨骼上的喇叭袖）
    for (const side of ['Left', 'Right']) {
      const fore = this.bones[`mixamorig${side}ForeArm`]?.bone;
      if (!fore) continue;
      const sleeve = realistic
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.06, 0.4, 20, 4, true), robeMat)
        : new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 12, 1, true), robeMat);
      sleeve.geometry.translate(0, realistic ? 0.2 : 0.275, 0);
      if (realistic) {
        const trim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 6, 32), acc.gold);
        trim.rotation.x = Math.PI / 2; trim.position.y = 0.4; sleeve.add(trim);
      }
      sleeve.position.set(0, realistic ? 2 : 8, 0);
      sleeve.scale.setScalar(100);
      sleeve.rotation.x = realistic ? 0 : Math.PI;
      fore.add(sleeve);
    }

    this.flySword = buildFlySword();
    this.flySword.visible = false;
    scene.add(this.flySword);

    this.aura = new THREE.PointLight(0x7ff5c8, 0, 8);
    this.mesh.add(this.aura);

    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.flying = false;
    this.meditating = false;
    this.walkPhase = 0;
    this.spawn = spawn.clone();
    this.meditateT = 0;

    // 气血 / 护盾 / 受击
    this.maxHp = 100;
    this.hp = 100;
    this.hpRegen = 1.2;          // 气血/秒（缓回）
    this.shield = null;          // {until, absorb} 罡气
    this.invulnT = 0;            // 受击无敌帧
    this.lastHurt = -99;
    this.defenseMult = 1;        // 土灵根减伤
    this.slowFactor = 1;         // 吟唱减速 0.3
    this.casting = false;        // 结印施法中（覆盖手臂动画）
    this.onHurt = null;          // (dealt)=>void HUD 反馈
    this.onDeath = null;         // ()=>void 重伤遁返
  }

  get alive() { return this.hp > 0; }

  takeDamage(dmg) {
    const now = performance.now() / 1000;
    if (!this.alive || now < this.invulnT) return 0;
    if (this.shield && now < this.shield.until) {
      const absorbed = Math.min(this.shield.absorb, dmg);
      this.shield.absorb -= absorbed;
      dmg -= absorbed;
      if (this.shield.absorb <= 0) this.shield = null;
    }
    const dealt = Math.max(0, Math.round(dmg * this.defenseMult));
    if (dealt <= 0) { this.onHurt?.(0); return 0; }
    this.hp -= dealt;
    this.invulnT = now + 0.5;
    this.lastHurt = now;
    this.onHurt?.(dealt);
    if (this.hp <= 0) { this.hp = 0; this.onDeath?.(); }
    return dealt;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, Math.round(n)));
  }

  // 重伤遁返：回到出生点、部分恢复
  respawn() {
    this.mesh.position.copy(this.spawn);
    this.hp = Math.max(this.maxHp * 0.5, this.hp + 40);
    this.vel.set(0, 0, 0);
    this.flying = false;
    this.meditating = false;
    this.invulnT = performance.now() / 1000 + 3;
  }

  get position() { return this.mesh.position; }

  play(name, fade = 0.25) {
    const next = this.actions[name] || this.actions.Idle;
    if (!next || next === this.current) return;
    next.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  toggleFly() {
    this.flying = !this.flying;
    if (this.flying) { this.meditating = false; this.vel.y = Math.max(this.vel.y, 3); }
    this.flySword.visible = this.flying;
    this.swordMesh.visible = !this.flying;
  }

  toggleMeditate() {
    if (this.flying) return;
    this.meditating = !this.meditating;
  }

  applyMeditatePose(k) {
    // k: 0 站立 → 1 全打坐；盘腿、合臂、沉髋
    const b = this.bones;
    const set = (name, x, y, z) => {
      const ref = b[name];
      if (!ref) return;
      const target = ref.rest.clone().multiply(new THREE.Quaternion().setFromEuler(armEuler(name, x, y, z)));
      ref.bone.quaternion.slerpQuaternions(ref.rest, target, k);
    };
    set('mixamorigLeftUpLeg', -1.35, 0.35, 0.15);
    set('mixamorigRightUpLeg', -1.35, -0.35, -0.15);
    set('mixamorigLeftLeg', 2.2, 0, 0);
    set('mixamorigRightLeg', 2.2, 0, 0);
    set('mixamorigLeftArm', 0.4, 0, -0.9);
    set('mixamorigRightArm', 0.4, 0, 0.9);
    set('mixamorigLeftForeArm', 0, -1.1, 0);
    set('mixamorigRightForeArm', 0, 1.1, 0);
    const hips = b['mixamorigHips'];
    if (hips) hips.bone.position.y = THREE.MathUtils.lerp(hips.restPos.y, hips.restPos.y - 55, k);
  }

  // 行走/跑步：摆腿摆臂；站立：呼吸微动
  animate(dt, spd) {
    const b = this.bones;
    const set = (name, x, y, z) => {
      const ref = b[name];
      if (!ref) return;
      const target = new THREE.Quaternion().setFromEuler(armEuler(name, x, y, z));
      ref.bone.quaternion.slerp(ref.rest.clone().multiply(target), 0.2);
    };
    const runK = THREE.MathUtils.clamp(spd / RUN, 0, 1);
    if (this.casting) {
      // 结印：双手胸前合拢结咒印，前臂内旋、手指向上
      this.animT += dt * 2;
      set('mixamorigLeftArm', -0.55, 0.5, -0.7);
      set('mixamorigRightArm', -0.55, -0.5, 0.7);
      set('mixamorigLeftForeArm', -1.15, -0.35, 0.2);
      set('mixamorigRightForeArm', -1.15, 0.35, -0.2);
      set('mixamorigSpine1', 0.05, 0, 0);
      return;
    }
    if (spd > 0.5) {
      this.animT += dt * (4 + runK * 7);
      const s = Math.sin(this.animT), c = Math.cos(this.animT);
      const amp = 0.35 + runK * 0.35;
      set('mixamorigLeftUpLeg', s * amp, 0, 0.06);
      set('mixamorigRightUpLeg', -s * amp, 0, -0.06);
      set('mixamorigLeftLeg', Math.max(0, -c) * amp * 1.4 + 0.1, 0, 0);
      set('mixamorigRightLeg', Math.max(0, c) * amp * 1.4 + 0.1, 0, 0);
      set('mixamorigLeftArm', -s * amp * 0.55, 0, -0.95);
      set('mixamorigRightArm', s * amp * 0.55, 0, 0.95);
      set('mixamorigSpine1', runK * 0.12, s * 0.05, 0);
    } else {
      this.animT += dt * 1.4;
      const br = Math.sin(this.animT) * 0.03;
      set('mixamorigSpine1', br, 0, 0);
      set('mixamorigLeftArm', 0, 0, -1.15 + br);
      set('mixamorigRightArm', 0, 0, 1.15 - br);
      set('mixamorigLeftUpLeg', 0, 0, 0.05);
      set('mixamorigRightUpLeg', 0, 0, -0.05);
      set('mixamorigLeftLeg', 0.06, 0, 0);
      set('mixamorigRightLeg', 0.06, 0, 0);
    }
  }

  update(dt, input, camYaw) {
    const p = this.mesh.position;
    const ground = this.terrainHeight(p.x, p.z);

    // 气血缓回（不战斗时）
    if (this.alive && this.hp < this.maxHp && performance.now() / 1000 - this.lastHurt > 8) {
      this.hp = Math.min(this.maxHp, this.hp + this.hpRegen * dt);
    }
    if (this.shield && performance.now() / 1000 > this.shield.until) this.shield = null;

    if (this.meditating) {
      this.vel.set(0, 0, 0);
      p.y = Math.max(p.y, ground);
      this.meditateT = Math.min(1, this.meditateT + dt * 3);
      this.applyMeditatePose(this.meditateT);
      this.flySword.visible = false;
      return;
    }
    if (this.meditateT > 0) {
      this.meditateT = Math.max(0, this.meditateT - dt * 4);
      this.applyMeditatePose(this.meditateT);
    }

    const ix = (input.d ? 1 : 0) - (input.a ? 1 : 0);
    const iz = (input.s ? 1 : 0) - (input.w ? 1 : 0);
    const moving = ix !== 0 || iz !== 0;

    if (this.flying) {
      const speed = (input.shift ? FLY_SPEED * 1.6 : FLY_SPEED) * this.slowFactor;
      const dir = new THREE.Vector3(ix, 0, iz).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
      this.vel.x = dir.x * speed;
      this.vel.z = dir.z * speed;
      const vert = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
      this.vel.y = THREE.MathUtils.lerp(this.vel.y, vert * speed * 0.7, 0.15);
      p.addScaledVector(this.vel, dt);
      if (p.y < ground + 0.6) p.y = ground + 0.6;
      p.y = Math.min(p.y, 110);
      if (moving) this.yaw = Math.atan2(this.vel.x, this.vel.z);
      this.walkPhase += dt * 2;
      this.inner.rotation.x = THREE.MathUtils.lerp(this.inner.rotation.x, moving ? 0.18 : 0, 0.1);
      this.flySword.position.set(p.x, p.y + 0.02, p.z);
      this.flySword.rotation.y = this.yaw;
      this.flySword.rotation.x = THREE.MathUtils.lerp(this.flySword.rotation.x, moving ? 0.1 : 0, 0.1);
      this.flySword.rotation.z = Math.sin(this.walkPhase) * 0.05;
      this.animate(dt, 0);
      // 飞行时衣袂后扬：腿微分、手臂后展
      const fb = this.bones;
      const fset = (name, x, y, z) => {
        const ref = fb[name]; if (!ref) return;
        ref.bone.quaternion.copy(ref.rest).multiply(new THREE.Quaternion().setFromEuler(armEuler(name, x, y, z)));
      };
      fset('mixamorigLeftArm', -0.9, 0, -0.35);
      fset('mixamorigRightArm', -0.9, 0, 0.35);
      fset('mixamorigLeftUpLeg', 0.15, 0, 0.1);
      fset('mixamorigRightUpLeg', -0.1, 0, -0.1);
    } else {
      this.inner.rotation.x = 0;
      const speed = (input.shift ? RUN : WALK) * this.slowFactor;
      const dir = new THREE.Vector3(ix, 0, iz).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
      this.vel.x = THREE.MathUtils.lerp(this.vel.x, dir.x * speed * (moving ? 1 : 0), 0.2);
      this.vel.z = THREE.MathUtils.lerp(this.vel.z, dir.z * speed * (moving ? 1 : 0), 0.2);
      this.vel.y -= GRAVITY * dt;
      if (this.grounded && input.jump) { this.vel.y = JUMP_V; this.grounded = false; }
      p.addScaledVector(this.vel, dt);
      if (p.y <= ground) { p.y = ground; this.vel.y = 0; this.grounded = true; }
      else this.grounded = false;
      if (moving) this.yaw = Math.atan2(this.vel.x, this.vel.z);

      const spd = Math.hypot(this.vel.x, this.vel.z);
      this.animate(dt, spd);
    }

    const d = Math.hypot(p.x, p.z);
    if (d > 185) { p.x *= 185 / d; p.z *= 185 / d; }

    let dy = this.yaw - this.mesh.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.mesh.rotation.y += dy * 0.25;
  }
}
