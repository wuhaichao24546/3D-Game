import * as THREE from 'three';
import { glowTexture } from './world.js';

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
  }

  use(idx, ctx) {
    const def = SKILL_DEFS[idx];
    if (!def || (this.cooldowns[idx] || 0) > 0) return null;

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
    this[`cast${idx + 1}`](ctx);
    ctx.hud.showBanner(`施法 · ${def.name}`, 1100);
    return true;
  }

  // ---- 1 剑雨：目标点范围落剑 ----
  cast1(ctx) {
    const target = aimPoint(ctx, 34);
    const dmg = 46 * ctx.linggen.swordMult * ctx.linggen.spellMult;
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

  // ---- 2 雷符：天降雷柱 ----
  cast2(ctx) {
    const target = aimPoint(ctx, 36);
    const dmg = 58 * ctx.linggen.spellMult;
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

  // ---- 4 遁光：视向突进 ----
  cast4(ctx) {
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
    // 遁光拖尾
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, dist), ADD(0x8af0e8, 0.5));
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

  update(dt) {
    this.mana = Math.min(this.maxMana, this.mana + this.regen * dt);
    for (const k in this.cooldowns) {
      this.cooldowns[k] -= dt;
      if (this.cooldowns[k] <= 0) delete this.cooldowns[k];
    }
    this.fx = this.fx.filter((f) => f.update(dt));
  }
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

// ---------- 范围伤害 ----------
function damageArea(ctx, center, radius, dmg, tag) {
  for (const b of ctx.beasts.targets) {
    if (!b.alive) continue;
    const d = b.mesh.position.distanceTo(center);
    if (d > radius + b.radius) continue;
    const res = ctx.beasts.damage(b, dmg, tag);
    if (res) {
      ctx.hud.floater(b.mesh.position, `-${Math.round(res.amount)}`, 'hit');
      if (res.killed) ctx.onKill(b, res);
    }
  }
}
