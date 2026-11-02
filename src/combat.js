// ---------- 战斗数值引擎：道行、面板、伤害公式 ----------
import { REALMS } from './cultivation.js';

// 道行 = 境界序*9 + 层(1~9)；大乘圆满封顶 73
export function daoLevel(cult) {
  if (cult.isMax) return 73;
  return cult.realmIndex * 9 + Math.min(9, Math.floor(cult.progress() * 9) + 1);
}

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
// 怪/人 Lv → 境界描述（练气三层 等）
export function levelName(lv) {
  if (lv >= 73) return '大乘圆满';
  const r = Math.min(7, Math.floor((lv - 1) / 9));
  const layer = Math.min(9, lv - r * 9);
  return `${REALMS[r].name.replace('期', '')}${CN[layer - 1]}层`;
}

// 玩家面板汇总（gear 来自 Gear.totals()）
export function playerStats(lv, gear = {}, linggen = {}) {
  const atk = 22 + lv * 3 + (gear.atk || 0);
  const sp = 30 + lv * 4 + (gear.sp || 0);
  const def = 8 + lv * 2 + (gear.def || 0);
  const maxHp = 100 + lv * 12 + (gear.hp || 0);
  const maxMana = 100 + lv * 5 + (gear.mana || 0);
  const crit = 0.05 + (gear.crit || 0);
  const expMult = 1 + (gear.expMult || 0);
  return {
    atk: atk * (1 + (gear.atkPct || 0)),
    sp: sp * (1 + (gear.atkPct || 0)),
    def: def * (1 + (gear.defPct || 0)),
    maxHp: Math.round(maxHp),
    maxMana: Math.round(maxMana),
    crit, expMult,
    swordMult: linggen.swordMult || 1,
    spellMult: linggen.spellMult || 1,
    hurtMult: (linggen.defenseMult || 1) * (1 - Math.min(0.5, (gear.defPct || 0) * 0.5)),
  };
}

// 怪物数值随级缩放（基准定在 Lv5）
export function beastStats(def, lv) {
  const k = lv / 5;
  return {
    hp: Math.round(def.hp * k),
    atk: def.atk * k,
    def: lv * 2,
    exp: Math.round(def.exp * k),
    stones: Math.max(1, Math.round(def.stones * k)),
  };
}

// 伤害引擎：raw 过防御，再按道行差修正
// atkLv/defLv 为双方道行；返回 {dealt, note, crit}
export function calcDamage(raw, atkLv, defLv, targetDef = 0, critRate = 0) {
  const gap = defLv - atkLv; // 守方高多少
  let mult = 1, note = null;
  if (gap >= 18) { mult = 0.15; note = 'block'; }
  else if (gap >= 9) { mult = 0.5; note = 'resist'; }
  else if (gap <= -18) { mult = 1.8; note = 'crush'; }
  let dmg = raw * (100 / (100 + targetDef)) * mult;
  let crit = false;
  if (Math.random() < critRate) { dmg *= 1.5; crit = true; }
  return { dealt: Math.max(1, Math.round(dmg)), note, crit };
}
