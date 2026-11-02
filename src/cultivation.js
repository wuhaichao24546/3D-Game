// 境界系统：修为积累与突破
export const REALMS = [
  { name: '练气期', need: 100, aura: 0x7ff5c8 },
  { name: '筑基期', need: 300, aura: 0x6fd8ff },
  { name: '金丹期', need: 800, aura: 0xffd97a },
  { name: '元婴期', need: 1800, aura: 0xff9de2 },
  { name: '化神期', need: 4000, aura: 0xb49aff },
  { name: '合体期', need: 9000, aura: 0x8affde },
  { name: '渡劫期', need: 20000, aura: 0xffb46a },
  { name: '大乘期', need: Infinity, aura: 0xfff3a0 },
];

// 灵根被动加成
export const LINGGEN = {
  metal: { name: '金', swordMult: 1.2, spellMult: 1, pillMult: 1, meditateMult: 1, defenseMult: 1, desc: '剑术伤害 +20%' },
  wood: { name: '木', swordMult: 1, spellMult: 1, pillMult: 1, meditateMult: 1.15, defenseMult: 1, desc: '打坐效率 +15%' },
  water: { name: '水', swordMult: 1, spellMult: 1, pillMult: 1.3, meditateMult: 1, defenseMult: 1, desc: '丹药效果 +30%' },
  fire: { name: '火', swordMult: 1, spellMult: 1.15, pillMult: 1, meditateMult: 1, defenseMult: 1, desc: '术法伤害 +15%' },
  earth: { name: '土', swordMult: 1, spellMult: 1, pillMult: 1, meditateMult: 1, defenseMult: 0.85, desc: '受伤 -15%' },
};

export class Cultivation {
  constructor() {
    this.realmIndex = 0;
    this.exp = 0;          // exp within current realm
    this.spiritStones = 0;
    this.meditateRate = 12; // 修为/秒
    this.linggen = null;   // LINGGEN 键
  }

  get linggenMods() { return LINGGEN[this.linggen] || LINGGEN.metal; }

  get realm() { return REALMS[this.realmIndex]; }
  get isMax() { return this.realmIndex === REALMS.length - 1; }

  // returns breakthrough realm name(s) or null
  addExp(n) {
    if (this.isMax) { this.exp = 0; return null; }
    this.exp += n;
    const broke = [];
    while (!this.isMax && this.exp >= this.realm.need) {
      this.exp -= this.realm.need;
      this.realmIndex++;
      broke.push(this.realm.name);
      if (this.isMax) { this.exp = 0; break; }
    }
    return broke.length ? broke : null;
  }

  meditateTick(dt) {
    return this.addExp(this.meditateRate * dt * (1 + this.realmIndex * 0.4) * this.linggenMods.meditateMult);
  }

  progress() {
    if (this.isMax) return 1;
    return this.exp / this.realm.need;
  }
}
