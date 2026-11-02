import * as THREE from 'three';
import { ITEMS } from './items.js';

const _v = new THREE.Vector3();

export class HUD {
  constructor() {
    this.realmEl = document.getElementById('realm-name');
    this.expBar = document.getElementById('exp-bar');
    this.expText = document.getElementById('exp-text');
    this.stonesEl = document.getElementById('spirit-stones');
    this.timeEl = document.getElementById('time-of-day');
    this.banner = document.getElementById('banner');
    this.lockTip = document.getElementById('lock-tip');
    this.linggenEl = document.getElementById('linggen-tag');
    this.hpBar = document.getElementById('hp-bar');
    this.hpText = document.getElementById('hp-text');
    this.manaBar = document.getElementById('mana-bar');
    this.manaText = document.getElementById('mana-text');
    this.quickbar = document.getElementById('quickbar');
    this.beastOverlay = document.getElementById('beast-overlay');
    this.floaters = document.getElementById('floaters');
    this.hurtVignette = document.getElementById('hurt-vignette');
    this.invPanel = document.getElementById('inventory');
    this.invGrid = document.getElementById('inv-grid');
    this._bannerTimer = null;
    this._lastShichen = -1;
    this._beastTags = new Map(); // beast -> {el,hpFill}
    this._toasts = [];
    this._qbSlots = null;
    this._invOpen = false;
  }

  update(cult) {
    const r = cult.realm;
    this.realmEl.textContent = cult.isMax
      ? `${r.name} · 圆满`
      : `${r.name} · 第${['一', '二', '三', '四', '五', '六', '七', '八', '九'][Math.min(8, Math.floor(cult.progress() * 9))]}层`;
    this.expBar.style.width = `${(cult.progress() * 100).toFixed(1)}%`;
    this.expText.textContent = cult.isMax
      ? '已至化境'
      : `${Math.floor(cult.exp)} / ${r.need} 修为`;
    this.stonesEl.textContent = `灵石 × ${cult.spiritStones}`;
  }

  setTimeOfDay(t, shichen, day = 1) {
    const idx = Math.floor(t * 12 + 0.5) % 12;
    const text = `${day > 0.3 ? '☀' : '☾'} ${shichen[idx]}时`;
    if (text === this._lastTime) return;
    this._lastTime = text;
    this.timeEl.textContent = text;
  }

  setVitals(hp, maxHp, mana, maxMana) {
    const hpP = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    this.hpBar.style.width = `${(hpP * 100).toFixed(1)}%`;
    this.hpText.textContent = `气血 ${Math.ceil(hp)}/${maxHp}`;
    const mp = Math.max(0, Math.min(1, mana / Math.max(1, maxMana)));
    this.manaBar.style.width = `${(mp * 100).toFixed(1)}%`;
    this.manaText.textContent = `真元 ${Math.ceil(mana)}/${maxMana}`;
  }

  setLinggen(key, name) {
    this.linggenEl.textContent = name || '';
  }

  // ---------- 快捷栏 ----------
  buildQuickbar(defs, getCount) {
    this.quickbar.innerHTML = '';
    this._qbSlots = defs.map((d, i) => {
      const el = document.createElement('div');
      el.className = 'qb-slot';
      el.innerHTML = `<span class="qb-key">${d.key}</span><span class="qb-name">${d.name}</span>` +
        (d.cost ? `<span class="qb-cost">${d.cost} 真元</span>` : '') +
        `<span class="qb-count"></span><div class="qb-cd"></div>`;
      this.quickbar.appendChild(el);
      return { el, cdEl: el.querySelector('.qb-cd'), countEl: el.querySelector('.qb-count'), def: d };
    });
    this._getCount = getCount;
  }

  updateQuickbar(cooldowns, mana, defs) {
    if (!this._qbSlots) return;
    for (const s of this._qbSlots) {
      const cd = cooldowns[this._qbSlots.indexOf(s)] || 0;
      const d = s.def;
      s.cdEl.style.height = cd > 0 ? `${Math.min(100, cd / d.cd * 100)}%` : '0%';
      const afford = !d.cost || mana >= d.cost;
      const hasItem = !d.item || (this._getCount?.(d.item) || 0) > 0;
      s.el.classList.toggle('ready', cd <= 0 && afford && hasItem);
      s.el.classList.toggle('empty', !hasItem);
      s.countEl.textContent = d.item ? `×${this._getCount?.(d.item) || 0}` : '';
    }
  }

  // ---------- 灵兽血条 ----------
  updateBeastBars(beasts, camera) {
    const seen = new Set();
    for (const b of beasts) {
      if (!b.alive || (b.state === 'wander' && performance.now() / 1000 - (b.lastHit || -99) > 9)) continue;
      seen.add(b);
      let tag = this._beastTags.get(b);
      if (!tag) {
        const el = document.createElement('div');
        el.className = 'beast-tag';
        el.innerHTML = `<span class="b-name"></span><span class="b-hp"><i></i></span>`;
        el.querySelector('.b-name').textContent = b.def.name;
        this.beastOverlay.appendChild(el);
        tag = { el, fill: el.querySelector('.b-hp i') };
        this._beastTags.set(b, tag);
      }
      _v.copy(b.mesh.position).y += (b.def.kind === 'turtle' ? 1.0 : 1.5);
      _v.project(camera);
      if (_v.z > 1) { tag.el.style.display = 'none'; continue; }
      const x = (_v.x * 0.5 + 0.5) * innerWidth;
      const y = (-_v.y * 0.5 + 0.5) * innerHeight;
      tag.el.style.display = 'flex';
      tag.el.style.left = `${x}px`;
      tag.el.style.top = `${y}px`;
      tag.fill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
    }
    for (const [b, tag] of this._beastTags) {
      if (!seen.has(b)) { tag.el.remove(); this._beastTags.delete(b); }
    }
  }

  // ---------- 飘字 ----------
  floater(worldPos, text, kind = 'hit') {
    _v.copy(worldPos).y += 1.4;
    _v.project(window.__game.camera);
    if (_v.z > 1) return;
    const el = document.createElement('div');
    el.className = `floater ${kind}`;
    el.textContent = text;
    el.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 40}px`;
    el.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
    this.floaters.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  hurt() {
    this.hurtVignette.classList.add('show');
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => this.hurtVignette.classList.remove('show'), 180);
  }

  // ---------- 背包 ----------
  toggleInventory(inv, onUse) {
    this._invOpen = !this._invOpen;
    this.invPanel.classList.toggle('hidden', !this._invOpen);
    if (this._invOpen) this.renderInventory(inv, onUse);
    return this._invOpen;
  }
  get invOpen() { return this._invOpen; }

  renderInventory(inv, onUse) {
    this.invGrid.innerHTML = '';
    const list = inv.list();
    if (!list.length) {
      this.invGrid.innerHTML = '<div class="inv-empty">行囊空空如也 —— 猎兽、采集可获材料与丹药</div>';
      return;
    }
    const kindName = { pill: '丹药', material: '材料' };
    for (const { id, def, n } of list) {
      const cell = document.createElement('div');
      cell.className = `inv-cell ${def.kind}`;
      cell.innerHTML = `<span class="ic-n">×${n}</span><div class="ic-name">${def.name}</div><div class="ic-kind">${kindName[def.kind] || def.kind}</div>`;
      cell.title = def.desc || '';
      if (def.kind === 'pill') cell.addEventListener('click', () => onUse(id));
      this.invGrid.appendChild(cell);
    }
  }

  showBanner(text, ms = 2600) {
    this.banner.textContent = text;
    this.banner.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.banner.classList.remove('show'), ms);
  }

  setLocked(locked) {
    this.lockTip.classList.toggle('hidden', locked);
  }
}
