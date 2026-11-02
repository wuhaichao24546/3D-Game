import * as THREE from 'three';
import { glowTexture } from './world.js';
import { GRADES } from './gear.js';

const GLOW = glowTexture();

// ---------- 物品注册表 ----------
export const ITEMS = {
  pill_heal: { name: '回春散', kind: 'pill', desc: '回复气血 40', heal: 40, stack: 99 },
  pill_exp: { name: '聚灵丹', kind: 'pill', desc: '修为 +25', exp: 25, stack: 99 },
  mat_fox_core: { name: '灵狐内丹', kind: 'material', desc: '灵狐内蕴丹元，可炼器', stack: 50 },
  mat_fox_fur: { name: '灵狐皮毛', kind: 'material', desc: '霜白狐毛，炼衣材料', stack: 50 },
  mat_deer_antler: { name: '鹿灵角', kind: 'material', desc: '白鹿灵角，蕴木灵之气', stack: 50 },
  mat_turtle_shell: { name: '玄龟甲', kind: 'material', desc: '玄龟背甲，炼器良材', stack: 50 },
  mat_wolf_core: { name: '焰狼内丹', kind: 'material', desc: '焰狼内丹，火气逼人', stack: 50 },
  mat_wolf_fang: { name: '焰狼牙', kind: 'material', desc: '焰狼利齿，嵌刃之物', stack: 50 },
  mat_horse_mane: { name: '骏灵鬃', kind: 'material', desc: '灵驹鬃毛，踏风而行', stack: 50 },
  mat_bird_feather: { name: '鸾羽', kind: 'material', desc: '青鸾翎羽，轻灵之物', stack: 50 },
};

// ---------- 背包 ----------
export class Inventory {
  constructor() { this.slots = {}; }

  add(id, n = 1) {
    const def = ITEMS[id];
    if (!def) return 0;
    this.slots[id] = Math.min(def.stack, (this.slots[id] || 0) + n);
    return this.slots[id];
  }

  count(id) { return this.slots[id] || 0; }

  remove(id, n = 1) {
    if (!this.slots[id]) return false;
    this.slots[id] -= n;
    if (this.slots[id] <= 0) delete this.slots[id];
    return true;
  }

  // 使用丹药；ctx 提供 heal()/addExp()。返回使用的物品名或 null
  use(id, ctx) {
    const def = ITEMS[id];
    if (!def || def.kind !== 'pill' || !this.count(id)) return null;
    if (def.heal && ctx.heal) ctx.heal(def.heal * (ctx.pillMult || 1));
    if (def.exp && ctx.addExp) ctx.addExp(def.exp);
    this.remove(id, 1);
    return def.name;
  }

  list() {
    return Object.keys(this.slots)
      .map((id) => ({ id, def: ITEMS[id], n: this.slots[id] }))
      .filter((e) => e.def);
  }

  toJSON() { return { ...this.slots }; }
  fromJSON(o) { this.slots = { ...(o || {}) }; }
}

// ---------- 掉落拾取物 ----------
const DROP_COLORS = { pill: 0x9fe8a0, material: 0x8af0e0, stones: 0x8ac8ff };

export class Pickups {
  constructor(scene, terrainHeight) {
    this.scene = scene;
    this.terrainHeight = terrainHeight;
    this.items = [];
    this.geo = new THREE.OctahedronGeometry(0.22, 0);
  }

  // drop: {item: id} / {stones: n} / {equip: eq}
  spawn(pos, drop) {
    const kind = drop.item ? ITEMS[drop.item].kind : (drop.equip ? 'equip' : 'stones');
    const color = drop.equip ? GRADES[drop.equip.grade].color : (DROP_COLORS[kind] || 0xffffff);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(this.geo, mat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW, color, transparent: true, opacity: drop.equip ? 0.75 : 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(drop.equip ? 1.3 : 0.9);
    m.add(halo);
    m.position.set(
      pos.x + (Math.random() - 0.5) * 1.6,
      pos.y + 0.7 + Math.random() * 0.4,
      pos.z + (Math.random() - 0.5) * 1.6);
    this.scene.add(m);
    this.items.push({ mesh: m, drop, born: 0 });
  }

  spawnDrops(pos, drops) {
    for (const d of drops) this.spawn(pos, d);
  }

  // 靠近自动拾取；onCollect(drop) 由调用方计入背包/灵石
  update(dt, playerPos, onCollect) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.born += dt;
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.position.y += Math.sin(p.born * 3) * 0.003;
      // 过期 120s
      if (p.born > 120) { this.scene.remove(p.mesh); this.items.splice(i, 1); continue; }
      const d = p.mesh.position.distanceTo(playerPos);
      if (d < 1.8 && p.born > 0.6) {
        onCollect(p.drop);
        this.scene.remove(p.mesh);
        this.items.splice(i, 1);
      } else if (d < 4.5 && p.born > 0.6) {
        // 轻微吸附
        p.mesh.position.lerp(playerPos.clone().setY(playerPos.y + 0.9), dt * 2.2);
      }
    }
  }
}
