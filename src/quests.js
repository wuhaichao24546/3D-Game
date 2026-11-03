// ---------- 任务主线：入门试炼 → 狼丹入药 → 精英之证 → 镇湖除蛟 ----------
// 顺序解锁；目标达成后回禀掌门交付领赏。
export const QUESTS = [
  {
    id: 'q1', title: '入门试炼',
    desc: '掌门有令：村外赤焰狼近来伤人，除三只以为试炼。',
    obj: { type: 'kill', name: '赤焰狼', need: 3 },
    rewardText: '修为+300，灵石×60',
  },
  {
    id: 'q2', title: '狼丹入药',
    desc: '炼丹房缺焰狼内丹。猎得三枚，交予掌门。',
    obj: { type: 'collect', item: 'mat_wolf_core', name: '焰狼内丹', need: 3 },
    rewardText: '修为+200，聚灵丹×2',
  },
  {
    id: 'q3', title: '精英之证',
    desc: '山野间有「凶兽」出没——红名巨怪，实力超伦。斩一只以证道心。',
    obj: { type: 'killElite', name: '精英凶兽', need: 1 },
    rewardText: '修为+400，玄品装备×1',
  },
  {
    id: 'q4', title: '镇湖除蛟',
    desc: '灵湖之下蛰伏千年玄蛟，湖水翻涌非吉兆。诛之，保一方平安。',
    obj: { type: 'killBoss', name: '千年玄蛟', need: 1 },
    rewardText: '修为+1000，灵石×2000，天品装备×1',
  },
];

export class QuestLog {
  constructor() {
    this.idx = 0;        // 当前任务序号；=QUESTS.length 表示全部完成
    this.progress = 0;   // 当前目标计数
    this.doneFlash = false;
  }

  get current() { return QUESTS[this.idx] || null; }

  toJSON() { return { idx: this.idx, progress: this.progress }; }
  fromJSON(s) { if (s) { this.idx = Math.min(s.idx | 0, QUESTS.length); this.progress = s.progress | 0; } }

  // 事件：击杀（def.name, elite, boss）
  onKill(def, { elite = false, boss = false } = {}) {
    const q = this.current;
    if (!q) return false;
    const o = q.obj;
    if (o.type === 'kill' && def.name === o.name) return this._bump();
    if (o.type === 'killElite' && elite) return this._bump();
    if (o.type === 'killBoss' && boss) return this._bump();
    return false;
  }

  _bump() {
    this.progress = Math.min(this.current.obj.need, this.progress + 1);
    return true;
  }

  // 是否可交付（杀怪类看进度；采集类看背包）
  ready(inventory) {
    const q = this.current;
    if (!q) return false;
    if (q.obj.type === 'collect') return inventory.count(q.obj.item) >= q.obj.need;
    return this.progress >= q.obj.need;
  }

  // 交付：消耗材料、推进链，返回奖励描述（奖励发放由 main 执行）
  turnIn(inventory) {
    const q = this.current;
    if (!q) return null;
    if (q.obj.type === 'collect') inventory.remove(q.obj.item, q.obj.need);
    this.idx += 1;
    this.progress = 0;
    return q;
  }

  trackerLines(inventory) {
    const q = this.current;
    if (!q) return ['主线已毕 · 逍遥云游'];
    const o = q.obj;
    const have = o.type === 'collect' ? inventory.count(o.item) : this.progress;
    return [
      `【${q.title}】`,
      q.desc,
      `目标：${o.name} ${have}/${o.need}`,
      this.ready(inventory) ? '✓ 已达成 · 回禀掌门' : '',
    ];
  }
}
