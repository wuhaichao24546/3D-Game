// ---------- 装备：品阶、生成、装备囊 ----------
export const GRADES = [
  { name: '凡品', color: 0xd8d8d0, css: '#cfcfc6', w: 40 },
  { name: '灵品', color: 0x9fe8a0, css: '#8fe89e', w: 30 },
  { name: '玄品', color: 0x6fb8ff, css: '#6fb8ff', w: 18 },
  { name: '地品', color: 0xc89fff, css: '#c89fff', w: 9 },
  { name: '天品', color: 0xffd97a, css: '#ffd97a', w: 3 },
];

const KINDS = {
  sword: { slot: '佩剑', mats: ['寒铁', '青钢', '玄冰', '雷纹', '曜金'], nouns: ['剑', '飞剑', '道剑'], main: 'atk', base: 6 },
  robe: { slot: '法袍', mats: ['麻布', '青绸', '云纹', '星纱', '天蚕'], nouns: ['袍', '法衣', '道袍'], main: 'def', base: 4 },
  charm: { slot: '玉佩', mats: ['青石', '白玉', '灵髓', '紫晶', '龙髓'], nouns: ['佩', '珏', '璧'], main: 'sp', base: 5 },
};

const AFFIX_POOL = [
  { k: 'atkPct', n: '攻力', fmt: (v) => `攻力 +${Math.round(v * 100)}%`, roll: () => 0.04 + Math.random() * 0.1 },
  { k: 'defPct', n: '防御', fmt: (v) => `防御 +${Math.round(v * 100)}%`, roll: () => 0.04 + Math.random() * 0.1 },
  { k: 'hp', n: '气血', fmt: (v) => `气血 +${Math.round(v)}`, roll: () => 15 + Math.random() * 45 },
  { k: 'mana', n: '真元', fmt: (v) => `真元 +${Math.round(v)}`, roll: () => 10 + Math.random() * 30 },
  { k: 'expMult', n: '聚灵', fmt: (v) => `修为获取 +${Math.round(v * 100)}%`, roll: () => 0.05 + Math.random() * 0.1 },
  { k: 'crit', n: '会心', fmt: (v) => `暴击 +${Math.round(v * 100)}%`, roll: () => 0.03 + Math.random() * 0.06 },
];

let _uid = 1;

// 品阶权重随掉落怪等级上调：lv>=30 才开天品，lv>=18 开地品
function rollGrade(lv) {
  const w = GRADES.map((g, i) => {
    if (i === 4 && lv < 30) return 0;
    if (i === 3 && lv < 18) return 0;
    return g.w * (1 + lv * 0.04 * i);
  });
  const tot = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (let i = w.length - 1; i >= 0; i--) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}

// 生成一件装备（lv = 掉落怪等级）
export function genEquip(lv) {
  const kindKey = ['sword', 'robe', 'charm'][Math.floor(Math.random() * 3)];
  const kind = KINDS[kindKey];
  const grade = rollGrade(lv);
  const g = GRADES[grade];
  const mainVal = Math.round(kind.base * (1 + lv * 0.5) * (1 + grade * 0.55) * (0.9 + Math.random() * 0.2));
  const affixes = [];
  const nAffix = 1 + (Math.random() < 0.25 + grade * 0.15 ? 1 : 0);
  const pool = [...AFFIX_POOL];
  for (let i = 0; i < nAffix && pool.length; i++) {
    const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    affixes.push({ k: a.k, v: +(a.roll() * (1 + grade * 0.3)).toFixed(3), text: '' });
  }
  for (const a of affixes) {
    const d = AFFIX_POOL.find(x => x.k === a.k);
    a.text = d.fmt(a.v);
  }
  const stat = { atk: 0, def: 0, sp: 0, hp: 0, mana: 0 };
  stat[kind.main] = mainVal;
  const name = `${g.name}·${kind.mats[grade]}${kind.nouns[Math.floor(Math.random() * kind.nouns.length)]}`;
  return {
    uid: `eq${_uid++}`, kind: 'equip', slot: kindKey, grade,
    name, ...stat, affixes,
    desc: `${kind.slot} · ${g.name} · 主属性 +${mainVal}` + (affixes.length ? '｜' + affixes.map(a => a.text).join('，') : ''),
  };
}

export class Gear {
  constructor() {
    this.bag = [];                    // 未装备
    this.slots = { sword: null, robe: null, charm: null };
  }

  add(eq) { this.bag.push(eq); }

  equip(uid) {
    const i = this.bag.findIndex(e => e.uid === uid);
    if (i < 0) return null;
    const eq = this.bag[i];
    const old = this.slots[eq.slot];
    this.bag.splice(i, 1);
    if (old) this.bag.push(old);
    this.slots[eq.slot] = eq;
    return eq;
  }

  unequip(slot) {
    const eq = this.slots[slot];
    if (!eq) return null;
    this.slots[slot] = null;
    this.bag.push(eq);
    return eq;
  }

  totals() {
    const t = { atk: 0, def: 0, sp: 0, hp: 0, mana: 0, crit: 0, expMult: 0, atkPct: 0, defPct: 0 };
    for (const eq of Object.values(this.slots)) {
      if (!eq) continue;
      t.atk += eq.atk; t.def += eq.def; t.sp += eq.sp; t.hp += eq.hp; t.mana += eq.mana;
      for (const a of eq.affixes) t[a.k] = (t[a.k] || 0) + a.v;
    }
    return t;
  }

  toJSON() { return { bag: this.bag, slots: this.slots }; }
  fromJSON(o) {
    if (!o) return;
    this.bag = o.bag || [];
    this.slots = { sword: null, robe: null, charm: null, ...(o.slots || {}) };
    const maxUid = Math.max(0, ...[...this.bag, ...Object.values(this.slots)].filter(Boolean)
      .map(e => parseInt((e.uid || '').replace('eq', '')) || 0));
    _uid = Math.max(_uid, maxUid + 1);
  }
}
