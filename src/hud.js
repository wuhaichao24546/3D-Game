export class HUD {
  constructor() {
    this.realmEl = document.getElementById('realm-name');
    this.expBar = document.getElementById('exp-bar');
    this.expText = document.getElementById('exp-text');
    this.stonesEl = document.getElementById('spirit-stones');
    this.banner = document.getElementById('banner');
    this.lockTip = document.getElementById('lock-tip');
    this._bannerTimer = null;
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
