import * as THREE from 'three';
import { glowTexture } from './world.js';
import { calcDamage } from './combat.js';

const GLOW = glowTexture();
const ADD = (color, opacity = 0.85) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending,
  depthWrite: false, side: THREE.DoubleSide,
});

// ---------- 技能系统：真元、冷却、快捷栏 1~6 ----------
// ctx: {player, camera, scene, beasts, bursts, inventory, cult, linggen, terrainHeight, hud, pickups}
export const SKILL_DEFS = [
  { key: '1', name: '剑雨', cost: 30, cd: 8 },
  { key: '2', name: '雷符', cost: 25, cd: 6 },
  { key: '3', name: '罡气', cost: 20, cd: 12 },
  { key: '4', name: '遁光', cost: 15, cd: 4 },
  { key: '5', name: '回春散', item: 'pill_heal' },
  { key: '6', name: '聚灵丹', item: 'pill_exp' },
];

export class Skills {
  constructor() {
    this.mana = 100;
    this.maxMana = 100;
    this.regen = 7;          // 真元/秒
    this.cooldowns = {};     // idx -> remaining
    this.fx = [];            // 瞬时特效对象 {update(dt)->bool}
    this.fury = 0;           // 战意 0~100
    this.lastCombat = -99;   // 上次造成/受到伤害的时间
    this.casting = null;     // {name, t, dur, done} 吟唱状态
    this.ultActive = false;  // 大招进行中（子弹时间/运镜）
    this.ultCam = 0;         // >0 时相机拉近
    this.domain = null;      // 灵压阵 {x,z,r,mesh}（域内攻+30%、回蓝×2、敌减速）
    this.player = null;      // use() 时记住玩家引用
    this.sealOrb = null;     // 结印掌心符文球
  }

  // 灵压阵内判定 + 攻力加成
  inDomain(pos) {
    return !!(this.domain && pos && Math.hypot(pos.x - this.domain.x, pos.z - this.domain.z) < this.domain.r);
  }
  atkBuff(ctx) { return this.inDomain(ctx.player?.position) ? 1.3 : 1; }

  addFury(n, ctx) {
    this.fury = Math.min(100, this.fury + n);
    this.lastCombat = performance.now() / 1000;
  }

  // 被打断（由 main 在玩家受击时调用）：吟唱中断只耗蓝不耗 CD；大招起手返 40% 战意
  interrupt(ctx) {
    if (this.casting) {
      ctx.hud.showBanner(`施法被打断 · ${this.casting.name}`, 1300);
      if (this.casting.orb) ctx.scene.remove(this.casting.orb);
      this.casting = null;
      ctx.hud.castBar(null);
      if (ctx.player) { ctx.player.slowFactor = 1; ctx.player.casting = false; }
    }
    if (this.ultRefund) { this.fury = Math.min(100, this.fury + 40); this.ultRefund = false; }
  }

  use(idx, ctx) {
    const def = SKILL_DEFS[idx];
    if (!def || (this.cooldowns[idx] || 0) > 0) return null;
    if (this.casting || this.ultActive) return null; // 吟唱/大招中不能施法

    // 丹药槽：不耗真元，走背包
    if (def.item) {
      const used = ctx.inventory.use(def.item, {
        heal: (n) => ctx.player.heal(n),
        addExp: (n) => ctx.addExp(n),
        pillMult: ctx.linggen.pillMult,
      });
      if (!used) { ctx.hud.showBanner(`${def.name}已用尽`, 1200); return false; }
      ctx.hud.showBanner(`服${used}`, 1200);
      return true;
    }

    if (this.mana < def.cost) { ctx.hud.showBanner('真元不足', 1000); return false; }
    this.mana -= def.cost;
    this.cooldowns[idx] = def.cd;
    this.player = ctx.player;
    this[`cast${idx + 1}`](ctx);
    ctx.hud.showBanner(`施法 · ${def.name}`, 1100);
    return true;
  }

  // ---- 1 剑雨：目标点范围落剑 ----
  cast1(ctx) {
    const target = aimPoint(ctx, 34);
    const dmg = ctx.stats.atk * this.atkBuff(ctx) * 1.6 * ctx.linggen.swordMult;
    const group = new THREE.Group();
    const blades = [];
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.12), ADD(0x9fe8ff, 0.9));
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4;
      b.position.set(target.x + Math.cos(a) * r, target.y + 14 + Math.random() * 6, target.z + Math.sin(a) * r);
      b.rotation.x = Math.PI;
      group.add(b);
      blades.push(b);
    }
    ctx.scene.add(group);
    let t = 0, hit = false;
    this.fx.push({
      update: (dt) => {
        t += dt;
        for (const b of blades) {
          b.position.y -= dt * 26;
          if (b.position.y < target.y + 0.3) b.visible = false;
        }
        if (t > 0.55 && !hit) {
          hit = true;
          ctx.bursts.spawn(new THREE.Vector3(target.x, target.y + 0.5, target.z), 0x9fe8ff, 60, 9);
          damageArea(ctx, target, 6, dmg, '剑雨');
        }
        if (t > 0.9) { ctx.scene.remove(group); return false; }
        return true;
      },
    });
  }

  // ---- 2 雷符：1.2s 吟唱后天降雷柱（受击打断） ----
  cast2(ctx) {
    const target = aimPoint(ctx, 36);
    this.casting = {
      name: '雷符', t: 1.2, dur: 1.2,
      done: () => this.boltAt(ctx, target),
    };
    ctx.player.slowFactor = 0.3; // 吟唱中移动迟缓
    ctx.player.casting = true;   // 结印手势
    this.startCasting(ctx);
    // 掌心符文光球随读条变大
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), ADD(0xffd97a, 0.9));
    orb.position.copy(ctx.player.position).add(new THREE.Vector3(0, 1.35, 0.5));
    ctx.scene.add(orb);
    this.sealOrb = orb;
    this.casting.orb = orb;
    ctx.hud.castBar(0, '雷符');
  }

  boltAt(ctx, target) {
    const dmg = ctx.stats.sp * this.atkBuff(ctx) * 1.5 * ctx.linggen.spellMult;
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.3, 24, 6, 1, true),
      ADD(0xd8e8ff, 0.9));
    bolt.position.set(target.x, target.y + 12.5, target.z);
    ctx.scene.add(bolt);
    const flash = new THREE.PointLight(0xcfe4ff, 60, 26);
    flash.position.set(target.x, target.y + 4, target.z);
    ctx.scene.add(flash);
    let t = 0, hit = false;
    this.fx.push({
      update: (dt) => {
        t += dt;
        bolt.material.opacity = Math.max(0, 0.9 - t * 2.4);
        flash.intensity = Math.max(0, 60 - t * 240);
        if (t > 0.12 && !hit) {
          hit = true;
          ctx.bursts.spawn(new THREE.Vector3(target.x, target.y + 0.6, target.z), 0xd8e8ff, 80, 12);
          damageArea(ctx, target, 5.5, dmg, '雷符');
        }
        if (t > 0.5) { ctx.scene.remove(bolt); ctx.scene.remove(flash); return false; }
        return true;
      },
    });
  }

  // ---- 3 护体罡气：5 秒吸收伤害 ----
  cast3(ctx) {
    ctx.player.shield = { until: performance.now() / 1000 + 5, absorb: 80 };
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 20, 14),
      ADD(0x7fd8c8, 0.16));
    shell.position.copy(ctx.player.position).y += 1.0;
    ctx.scene.add(shell);
    let t = 0;
    this.fx.push({
      update: (dt) => {
        t += dt;
        shell.position.copy(ctx.player.position).y += 1.0;
        shell.material.opacity = 0.16 + Math.sin(t * 8) * 0.05;
        shell.rotation.y += dt * 0.8;
        if (!ctx.player.shield || performance.now() / 1000 > ctx.player.shield.until || t > 5.2) {
          ctx.scene.remove(shell);
          return false;
        }
        return true;
      },
    });
  }

  // ---- 4 遁光：视向突进 + 0.25s 无敌帧 + 残影 ----
  cast4(ctx) {
    ctx.player.invulnT = Math.max(ctx.player.invulnT, performance.now() / 1000 + 0.25);
    const dir = new THREE.Vector3();
    ctx.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(Math.sin(ctx.player.yaw), 0, Math.cos(ctx.player.yaw));
    dir.normalize();
    const p = ctx.player.position;
    const start = p.clone();
    const dist = 9;
    const end = p.clone().addScaledVector(dir, dist);
    end.y = ctx.terrainHeight(end.x, end.z) + (ctx.player.flying ? Math.max(p.y - ctx.terrainHeight(end.x, end.z), 1) : 0);
    // 遁光拖尾 + 残影
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, dist), ADD(0x8af0e8, 0.5));
    const ghost = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), ADD(0x8af0e8, 0.35));
    ghost.position.copy(start).y += 0.9;
    ctx.scene.add(ghost);
    let ghostT = 0;
    this.fx.push({ update: (d) => {
      ghostT += d;
      ghost.material.opacity = Math.max(0, 0.35 - ghostT * 1.2);
      if (ghostT > 0.35) { ctx.scene.remove(ghost); return false; }
      return true;
    } });
    trail.position.copy(start.clone().lerp(end, 0.5)).y += 1.0;
    trail.lookAt(end.x, start.y + 1, end.z);
    ctx.scene.add(trail);
    const t0 = start.clone();
    let t = 0;
    this.fx.push({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / 0.12);
        p.copy(t0).lerp(end, k);
        if (!ctx.player.flying) {
          const g = ctx.terrainHeight(p.x, p.z);
          if (p.y < g) p.y = g;
        }
        trail.material.opacity = Math.max(0, 0.5 - t * 2.2);
        if (t > 0.3) { ctx.scene.remove(trail); return false; }
        return true;
      },
    });
  }

  // ================= 大招「万剑归宗」 =================
  // 分镜：0.4s 起手(子弹时间+运镜+浮空) → 0.8s 剑轮展开 → 1.2s 剑雨洗地+裂纹+震屏 → 0.8s 收尾
  castUlt(ctx) {
    if (this.fury < 100 || this.ultActive || this.casting) {
      if (this.fury < 100) ctx.hud.showBanner(`战意不足 ${Math.floor(this.fury)}/100`, 1200);
      return false;
    }
    this.fury = 0;
    this.ultActive = true;
    this.ultRefund = true;        // 起手被打断返还 40 战意
    this.ultCam = 1;
    ctx.setTimeScale(0.3);
    ctx.hud.ultVignette(true);
    ctx.hud.showBanner('万剑归宗', 1800);
    const target = aimPoint(ctx, 30);
    const player = ctx.player;
    const baseY = player.position.y;

    // 36 柄实体灵剑（InstancedMesh）
    const N = 36;
    const swordGeo = new THREE.BoxGeometry(0.07, 1.5, 0.13);
    swordGeo.translate(0, 0.75, 0);
    const swordMat = new THREE.MeshStandardMaterial({
      color: 0xffe9a8, metalness: 0.9, roughness: 0.25,
      emissive: 0xd8a83e, emissiveIntensity: 1.6,
    });
    const wheel = new THREE.InstancedMesh(swordGeo, swordMat, N);
    wheel.frustumCulled = false;
    ctx.scene.add(wheel);
    // 每柄剑的状态：展开角/半径 → 爆发时目标点
    const st = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const ta = Math.random() * Math.PI * 2, tr = Math.random() * 10;
      st.push({
        a, r: 0.2,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(target.x + Math.cos(ta) * tr, ctx.terrainHeight(target.x + Math.cos(ta) * tr, target.z + Math.sin(ta) * tr) + 0.4, target.z + Math.sin(ta) * tr),
        delay: 0.9 + (i % 9) * 0.09, dur: 0.35, launched: false,
      });
    }
    const dummy = new THREE.Object3D();
    // 地面裂纹 + 震屏 + 伤害，爆发时触发
    let blasted = false;
    let t = 0;
    this.fx.push({
      update: (dt) => {
        t += dt;
        // —— 阶段演出 ——
        if (t < 0.4) {
          // 起手：角色浮空
          player.position.y = baseY + (t / 0.4) * 1.4;
          this.ultCam = 1;
        } else if (t < 1.2) {
          const k = (t - 0.4) / 0.8;
          player.position.y = baseY + 1.4 + Math.sin(k * Math.PI) * 0.3;
          for (const s of st) s.r = 0.2 + k * 2.6;
          ctx.setTimeScale(0.3 + k * 0.4);
        } else {
          if (!blasted) {
            blasted = true;
            this.ultRefund = false;
            ctx.setTimeScale(1);
            ctx.shake(0.55);
            const dmg = ctx.stats.atk * this.atkBuff(ctx) * 4.5 * ctx.linggen.swordMult;
            damageArea(ctx, target, 12, dmg, '万剑归宗');
            ctx.bursts.spawn(new THREE.Vector3(target.x, target.y + 1, target.z), 0xffd97a, 140, 14);
            ctx.bursts.spawn(new THREE.Vector3(player.position.x, player.position.y + 1, player.position.z), 0xfff3c8, 80, 10);
            this.spawnCracks(ctx, target, 5);
          }
          // 收尾镜头回位
          this.ultCam = Math.max(0, this.ultCam - dt * 0.9);
          ctx.hud.ultVignette(this.ultCam > 0.1);
        }
        // —— 剑位置矩阵 ——
        for (let i = 0; i < N; i++) {
          const s = st[i];
          dummy.position.set(0, -99, 0); // 默认藏
          if (!s.launched) {
            if (t >= s.delay) {
              s.launched = true;
              const pa = s.a + t * 1.6;
              s.from.set(player.position.x + Math.cos(pa) * s.r, player.position.y + 1.2 + Math.sin(s.a * 2) * 0.5, player.position.z + Math.sin(pa) * s.r);
            } else {
              const pa = s.a + t * 1.6;
              dummy.position.set(player.position.x + Math.cos(pa) * s.r, player.position.y + 1.0 + Math.sin(t * 3 + i) * 0.25 + s.r * 0.28, player.position.z + Math.sin(pa) * s.r);
              dummy.rotation.set(Math.PI / 2 - 0.4, -pa, 0);
            }
          }
          if (s.launched) {
            const k = Math.min(1, (t - s.delay) / s.dur);
            dummy.position.copy(s.from).lerp(s.to, k * k);
            dummy.lookAt(s.to.x, s.to.y - 3, s.to.z);
            dummy.rotation.x -= Math.PI / 2;
            if (k >= 1) dummy.position.set(0, -99, 0);
          }
          dummy.updateMatrix();
          wheel.setMatrixAt(i, dummy.matrix);
        }
        wheel.instanceMatrix.needsUpdate = true;
        if (t > 2.6) {
          ctx.scene.remove(wheel);
          player.position.y = Math.max(ctx.terrainHeight(player.position.x, player.position.z), player.position.y - 0.5);
          this.ultActive = false;
          this.ultCam = 0;
          ctx.setTimeScale(1);
          ctx.hud.ultVignette(false);
          return false;
        }
        return true;
      },
    });
    return true;
  }

  // ---- T 灵压阵：脚下金纹法阵，12s 领域（攻+30%、回蓝×2、敌减速40%） ----
  castDomain(ctx) {
    if (this.casting || this.ultActive) return false;
    if (this.mana < 40) { ctx.hud.showBanner('真元不足', 1000); return false; }
    if ((this.cooldowns.domain || 0) > 0) { ctx.hud.showBanner('灵压阵调息中', 1000); return false; }
    this.mana -= 40;
    this.cooldowns.domain = 30;
    this.player = ctx.player;
    const c = ctx.player.position.clone();
    const y = ctx.terrainHeight(c.x, c.z) + 0.08;

    const g = new THREE.Group();
    // 主阵纹（双环 + 旋转符文环）
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(9.6, 10, 64), ADD(0xffd97a, 0.7));
    ring1.rotation.x = -Math.PI / 2;
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(7.4, 7.6, 64), ADD(0xffe9a8, 0.45));
    ring2.rotation.x = -Math.PI / 2;
    const runeRing = new THREE.Mesh(new THREE.RingGeometry(8.0, 9.4, 64), ADD(0xffcf6a, 0.35));
    runeRing.rotation.x = -Math.PI / 2;
    g.add(ring1, ring2, runeRing);
    // 内圈阵眼
    const eye = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.6, 40), ADD(0xfff3c8, 0.8));
    eye.rotation.x = -Math.PI / 2;
    g.add(eye);
    // 边界光柱
    const pillars = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 4.5, 6, 1, true), ADD(0xffd97a, 0.4));
      pl.position.set(Math.cos(a) * 10, 2.2, Math.sin(a) * 10);
      g.add(pl);
      pillars.push(pl);
    }
    g.position.set(c.x, y, c.z);
    ctx.scene.add(g);
    this.domain = { x: c.x, z: c.z, r: 10, group: g };
    ctx.hud.showBanner('法域 · 灵压阵', 1600);

    let t = 0;
    this.fx.push({
      update: (dt) => {
        t += dt;
        runeRing.rotation.z += dt * 0.6;
        eye.rotation.z -= dt * 1.2;
        const pulse = 0.55 + Math.sin(t * 4) * 0.15;
        ring1.material.opacity = pulse;
        for (const pl of pillars) pl.material.opacity = 0.3 + Math.sin(t * 4 + pl.position.x) * 0.12;
        if (t > 12 || (this.player && this.inDomain(this.player.position) === false && t > 0.5)) {
          // 离开领域或超时 → 收回法阵
          ctx.scene.remove(g);
          this.domain = null;
          return false;
        }
        return true;
      },
    });
    return true;
  }

  // 地面裂纹贴花（程序化裂纹纹理）
  spawnCracks(ctx, center, n) {
    const tex = crackTexture();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const r = 1.5 + Math.random() * 6;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2 + Math.random() * 2.4, 2.2 + Math.random() * 2.4),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * Math.PI * 2;
      m.position.set(x, ctx.terrainHeight(x, z) + 0.06, z);
      ctx.scene.add(m);
      let lt = 0;
      this.fx.push({ update: (d) => {
        lt += d;
        m.material.opacity = Math.max(0, 0.85 - lt * 0.35);
        if (lt > 2.6) { ctx.scene.remove(m); return false; }
        return true;
      } });
    }
  }

  update(dt) {
    const manaRegen = this.regen * (this.inDomain(this.player?.position) ? 2 : 1);
    this.mana = Math.min(this.maxMana, this.mana + manaRegen * dt);
    for (const k in this.cooldowns) {
      this.cooldowns[k] -= dt;
      if (this.cooldowns[k] <= 0) delete this.cooldowns[k];
    }
    // 战意脱战衰减
    if (performance.now() / 1000 - this.lastCombat > 8 && this.fury > 0) {
      this.fury = Math.max(0, this.fury - 5 * dt);
    }
    // 吟唱推进
    if (this.casting) {
      this.casting.t -= dt;
      const frac = 1 - this.casting.t / this.casting.dur;
      if (this.casting.orb) {
        const p = this._lastCastCtx?.player?.position;
        if (p) this.casting.orb.position.set(p.x, p.y + 1.35, p.z).add(
          new THREE.Vector3(Math.sin(this._lastCastCtx.player.yaw || 0) * 0.5, 0, Math.cos(this._lastCastCtx.player.yaw || 0) * 0.5));
        this.casting.orb.scale.setScalar(0.6 + frac * 1.6);
      }
      if (this.casting.t <= 0) {
        const done = this.casting.done;
        this.casting = null;
        this._lastCastCtx?.hud.castBar(null);
        if (this._lastCastCtx?.player) { this._lastCastCtx.player.slowFactor = 1; this._lastCastCtx.player.casting = false; }
        done();
      } else {
        this._lastCastCtx?.hud.castBar(frac, this.casting.name);
      }
    }
    this.fx = this.fx.filter((f) => f.update(dt));
  }
}

// 结印/吟唱用的 ctx 记忆（update 内驱动读条）
Skills.prototype.startCasting = function (ctx) { this._lastCastCtx = ctx; };

// 程序化地面裂纹纹理
let _crackTex = null;
function crackTexture() {
  if (_crackTex) return _crackTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(20,12,6,0.95)';
  g.lineCap = 'round';
  for (let b = 0; b < 7; b++) {
    g.lineWidth = 2.5 + Math.random() * 2;
    g.beginPath();
    let x = 64, y = 64, a = (b / 7) * Math.PI * 2 + Math.random() * 0.7;
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      a += (Math.random() - 0.5) * 0.9;
      const len = 8 + Math.random() * 14;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  _crackTex = new THREE.CanvasTexture(c);
  return _crackTex;
}

// ---------- 目标点：视心射线打最近灵兽，否则视距落点 ----------
function aimPoint(ctx, range = 34) {
  const dir = new THREE.Vector3();
  ctx.camera.getWorldDirection(dir);
  const origin = ctx.camera.position;
  let best = null, bestA = 0.2; // ~11.5° 视锥
  for (const b of ctx.beasts.targets) {
    if (!b.alive) continue;
    const to = b.mesh.position.clone().sub(origin);
    const d = to.length();
    if (d > range) continue;
    to.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(to.dot(dir), -1, 1));
    if (ang < bestA) { bestA = ang; best = b; }
  }
  if (best) return best.mesh.position.clone();
  // 视锥外：优先打玩家近旁已被激怒的灵兽（贴身怪不在视锥内）
  let near = null, nearD = 15;
  for (const b of ctx.beasts.targets) {
    if (!b.alive || (b.state !== 'chase' && b.state !== 'attack' && b.state !== 'flee')) continue;
    const d = b.mesh.position.distanceTo(ctx.player.position);
    if (d < nearD) { nearD = d; near = b; }
  }
  if (near) return near.mesh.position.clone();
  return origin.clone().addScaledVector(dir, Math.min(range, 20));
}

// ---------- 范围伤害（过防御 + 道行差 + 暴击） ----------
function damageArea(ctx, center, radius, raw, tag) {
  for (const b of ctx.beasts.targets) {
    if (!b.alive) continue;
    const d = b.mesh.position.distanceTo(center);
    if (d > radius + b.radius) continue;
    const c = calcDamage(raw, ctx.lv(), b.lv, b.stats.def, ctx.stats.crit);
    const res = ctx.beasts.damage(b, c.dealt, tag);
    if (res) {
      ctx.addFury?.(6); // 命中攒战意
      if (res.killed) ctx.addFury?.(20);
      if (c.note === 'block') ctx.hud.floater(b.mesh.position, `无法破防 -${res.amount}`, 'block');
      else if (c.note === 'resist') ctx.hud.floater(b.mesh.position, `-${res.amount} 护体`, 'resist');
      else ctx.hud.floater(b.mesh.position, `-${res.amount}`, c.crit ? 'crit' : 'hit');
      if (res.killed) ctx.onKill(b, res);
    }
  }
}
