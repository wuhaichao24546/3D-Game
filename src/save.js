// ---------- localStorage 存档 ----------
const KEY = 'yunxi_save_v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    return s;
  } catch { return null; }
}

export function hasSave() { return loadSave() !== null; }

export function clearSave() { localStorage.removeItem(KEY); }

// data: {realmIndex, exp, spiritStones, hp, mana, linggen, inventory, pos, dayTime, seenLandmarks, username}
export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now(), ...data }));
  } catch { /* 存储满则忽略 */ }
}
