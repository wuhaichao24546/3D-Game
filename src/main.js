import * as THREE from 'three';
import { DefaultLoadingManager } from 'three';
import './style.css';
import { buildWorld, terrainHeight, WATER_LEVEL, SHICHEN, applyShadowFlags } from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Player } from './player.js';
import { Cultivation, LINGGEN } from './cultivation.js';
import { BeastManager } from './beasts.js';
import { Projectiles, Bursts, MeditationAura, BreakthroughRing, MeridianGlow } from './effects.js';
import { HUD } from './hud.js';
import { Inventory, Pickups, ITEMS } from './items.js';
import { Skills, SKILL_DEFS } from './skills.js';
import { loadSave, hasSave, clearSave, writeSave } from './save.js';
import { daoLevel, playerStats, calcDamage } from './combat.js';
import { Gear, GRADES } from './gear.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 4000);

const hud = new HUD();
const loadingEl = document.getElementById('loading');
// 加载进度
// 加载页进度
const loadScr = document.getElementById('loading-screen');
const loadFill = document.getElementById('loading-bar-fill');
const loadPct = document.getElementById('loading-pct');
function setLoadPct(p) {
  loadFill.style.width = p + '%';
  loadPct.textContent = Math.round(p) + '%';
}
DefaultLoadingManager.onProgress = (_u, done, total) => {
  setLoadPct(Math.min(95, done / Math.max(total, 1) * 100));
};

// 登录页：提交后才进入加载
const loginScr = document.getElementById('login-screen');
let loginResolve;
const loginDone = new Promise((r) => { loginResolve = r; });

// 灵根选择 / 存档分支
let chosenLinggen = ['metal', 'wood', 'water', 'fire', 'earth'][Math.floor(Math.random() * 5)];
let startMode = 'new'; // 'new' | 'continue'
const linggenRow = document.getElementById('linggen-row');
const saveRow = document.getElementById('login-save');
const submitBtn = document.getElementById('login-btn');
function refreshLinggenSel() {
  linggenRow.querySelectorAll('.lg-pick').forEach(b =>
    b.classList.toggle('sel', b.dataset.g === chosenLinggen));
}
linggenRow.querySelectorAll('.lg-pick').forEach(b =>
  b.addEventListener('click', () => { chosenLinggen = b.dataset.g; refreshLinggenSel(); }));
refreshLinggenSel();

if (hasSave()) {
  const s = loadSave();
  saveRow.classList.remove('hidden');
  submitBtn.classList.add('hidden');
  linggenRow.classList.add('hidden');
  document.getElementById('login-continue').textContent = `继续修行 · ${s?.name || '散修'}`;
}
document.getElementById('login-continue').addEventListener('click', () => {
  startMode = 'continue';
  const s = loadSave();
  if (s?.linggen) chosenLinggen = s.linggen;
  if (s?.name) sessionStorage.setItem('yunxi_name', s.name);
  doLogin();
});
document.getElementById('login-rebirth').addEventListener('click', () => {
  clearSave();
  startMode = 'new';
  saveRow.classList.add('hidden');
  submitBtn.classList.remove('hidden');
  linggenRow.classList.remove('hidden');
});

function doLogin() {
  loginScr.classList.add('hidden');
  setLoadPct(2);
  loginResolve();
}
document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();
  const err = document.getElementById('login-err');
  if (!u || !p) { err.textContent = '请输入道号与密令'; return; }
  sessionStorage.setItem('yunxi_name', u.slice(0, 12));
  doLogin();
});
document.querySelector('.login-enter').addEventListener('click', doLogin);

async function start() {
  const world = buildWorld(scene, renderer);
  applyShadowFlags(scene); // 静态场景批量投影标记
  await loginDone; // 等用户登录（世界已在后台渲染）
  let spawn = new THREE.Vector3(46, 10, 76); // 青溪村出生点
  for (let r = 6; r < 60 && spawn.y <= WATER_LEVEL + 0.8; r += 4) {
    for (let a = 0; a < Math.PI * 2; a += 0.6) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h > WATER_LEVEL + 0.8) { spawn.set(x, h, z); break; }
    }
  }

  // 分层加载：世界先渲染，主角就绪即开玩，灵兽后台加载
  document.getElementById('loading-tip').textContent = '凝聚修士元神…';
  const player = await Player.create(scene, terrainHeight, spawn);
  setLoadPct(100);
  loadScr.classList.add('hidden');
  loadingEl.style.display = 'none';

  let beasts = null;
  BeastManager.create(scene, terrainHeight, 12).then((b) => {
    b.playerLevel = () => lv;
    b.populate(spawn);
    beasts = b;
    if (window.__game) window.__game.beasts = b;
  });
  window.__game = { scene, camera, player, beasts: null, world, THREE, renderer };
  window.__setCam = (y, p) => { camYaw = y; if (p !== undefined) camPitch = p; };

  // ---------- 画质档：高(2x+2048阴影+泛光) 中(1.5x+1024阴影) 低(1x无阴影) ----------
  const QUALITY = {
    high: { name: '高', pr: 2, shadow: 2048, bloom: true },
    mid: { name: '中', pr: 1.5, shadow: 1024, bloom: false },
    low: { name: '低', pr: 1, shadow: 0, bloom: false },
  };
  let quality = localStorage.getItem('yunxi_quality') || 'high';
  if (!QUALITY[quality]) quality = 'high';
  let qualityManual = !!localStorage.getItem('yunxi_quality');
  let composer = null, bloomOn = false;
  const qBtn = document.getElementById('quality-btn');
  function ensureComposer() {
    if (composer) return;
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.55, 0.82));
    composer.addPass(new OutputPass());
  }
  function applyQuality() {
    const q = QUALITY[quality];
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
    renderer.setSize(innerWidth, innerHeight);
    world.setShadowMapSize(q.shadow);
    bloomOn = q.bloom;
    if (bloomOn) { ensureComposer(); composer.setPixelRatio(Math.min(devicePixelRatio, q.pr)); composer.setSize(innerWidth, innerHeight); }
    qBtn.textContent = `画质 · ${q.name}`;
  }
  qBtn.addEventListener('click', () => {
    quality = quality === 'high' ? 'mid' : quality === 'mid' ? 'low' : 'high';
    qualityManual = true;
    localStorage.setItem('yunxi_quality', quality);
    applyQuality();
    hud.floater(player.position, `画质 · ${QUALITY[quality].name}`, 'gain');
  });
  applyQuality();
  // 帧率过低自动降档（用户未手动选择时）
  let fpsT = 0, fpsN = 0;

  const cult = new Cultivation();
  cult.linggen = chosenLinggen;
  const projectiles = new Projectiles(scene);
  const bursts = new Bursts(scene);
  const medAura = new MeditationAura(scene);
  const meridian = new MeridianGlow(scene);
  const ring = new BreakthroughRing(scene);
  const inventory = new Inventory();
  const pickups = new Pickups(scene, terrainHeight);
  const skills = new Skills(scene);
  const gear = new Gear();

  // 面板重算：境界/装备变化后调用
  let lv = 1, stats = null;
  function recalc() {
    lv = daoLevel(cult);
    stats = playerStats(lv, gear.totals(), cult.linggenMods);
    const hpK = player.hp / player.maxHp;
    player.maxHp = stats.maxHp;
    player.hp = Math.max(1, Math.min(player.maxHp, Math.max(player.hp, Math.round(player.maxHp * hpK))));
    skills.maxMana = stats.maxMana;
    skills.mana = Math.min(skills.mana, skills.maxMana);
    player.defenseMult = stats.hurtMult;
  }

  // 灵根被动：土减伤（面板内已含）
  recalc();
  hud.setLinggen(cult.linggen, cult.linggenMods.name + '灵根 · ' + cult.linggenMods.desc);

  // 恢复存档
  if (startMode === 'continue') {
    const s = loadSave();
    if (s) {
      cult.realmIndex = Math.min(s.realmIndex | 0, 7);
      cult.exp = s.exp || 0;
      cult.spiritStones = s.spiritStones || 0;
      inventory.fromJSON(s.inv || []);
      gear.fromJSON(s.gear);
      recalc();
      player.hp = Math.max(1, Math.min(player.maxHp, s.hp || player.maxHp));
      skills.mana = Math.min(skills.maxMana, s.mana || skills.maxMana);
      if (s.pos) player.position.set(s.pos[0], s.pos[1], s.pos[2]);
    }
  } else {
    inventory.add('pill_heal', 3);
    inventory.add('pill_exp', 1);
  }
  window.__game.inventory = inventory;
  window.__game.skills = skills;
  window.__game.cult = cult;
  window.__game.gear = gear;
  window.__game.stats = () => stats;

  const pillCtx = {
    heal: (n) => player.heal(n),
    addExp: (n) => { const b = cult.addExp(n); if (b) breakthrough(b); },
    pillMult: cult.linggenMods.pillMult,
  };
  function usePill(id) {
    if (inventory.use(id, pillCtx)) {
      hud.showBanner('服下丹药', 1000);
      if (hud.invOpen) hud.renderInventory(inventory, usePill, gear, onGear);
    } else {
      hud.showBanner('行囊中没有此丹药', 1000);
    }
  }

  // 穿/卸装备
  function onGear(action, arg) {
    let eq = null;
    if (action === 'equip') eq = gear.equip(arg);
    else if (action === 'unequip') eq = gear.unequip(arg);
    if (!eq) return;
    recalc();
    refreshSwordLook();
    hud.showBanner(action === 'equip' ? `装备 · ${eq.name}` : `卸下 · ${eq.name}`, 1200);
    hud.renderInventory(inventory, usePill, gear, onGear);
  }

  // 背剑颜色随佩剑品阶
  function refreshSwordLook() {
    const blade = player.swordMesh?.children[0];
    if (!blade) return;
    const eq = gear.slots.sword;
    blade.material.color.setHex(eq ? GRADES[eq.grade].color : 0xbfd6d2);
    blade.material.emissive?.setHex(eq ? GRADES[eq.grade].color : 0x000000);
    if (blade.material.emissive) blade.material.emissiveIntensity = eq ? 0.25 + eq.grade * 0.18 : 0;
  }
  player.onHurt = () => hud.hurt();
  player.onDeath = () => {
    hud.showBanner('重伤遁返 · 道基受损', 2600);
    cult.spiritStones = Math.max(0, cult.spiritStones - 5);
    player.respawn();
  };

  function onBeastKilled(b, res) {
    const def = res.def;
    const broke = cult.addExp(Math.round(res.exp * stats.expMult));
    hud.floater(b.mesh.position, `+${Math.round(res.exp * stats.expMult)} 修为`, 'gain');
    bursts.spawn(b.mesh.position, 0xaef0c8, 40, 7);
    pickups.spawnDrops(b.mesh.position, res.drops);
    if (broke) breakthrough(broke);
  }

  const skillCtx = {
    scene, camera, player, hud, terrainHeight, bursts, inventory,
    linggen: cult.linggenMods,
    addExp: pillCtx.addExp,
    get stats() { return stats; },
    lv: () => lv,
    get beasts() { return beasts; },
    onKill: onBeastKilled,
  };
  hud.buildQuickbar(SKILL_DEFS, (id) => inventory.count(id));

  // 自动存档
  function persist() {
    writeSave({
      name: sessionStorage.getItem('yunxi_name') || '无名散修',
      linggen: cult.linggen,
      realmIndex: cult.realmIndex,
      exp: cult.exp,
      spiritStones: cult.spiritStones,
      hp: player.hp,
      mana: skills.mana,
      pos: [player.position.x, player.position.y, player.position.z],
      inv: inventory.toJSON(),
      gear: gear.toJSON(),
    });
  }
  setInterval(persist, 30000);
  addEventListener('beforeunload', persist);

  // ---------- input ----------
  const input = { w: false, a: false, s: false, d: false, shift: false, jump: false, down: false };
  let camYaw = Math.PI, camPitch = 0.32;

  const keymap = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    ShiftLeft: 'shift', ShiftRight: 'shift',
    Space: 'jump', KeyC: 'down', ControlLeft: 'down',
  };
  addEventListener('keydown', (e) => {
    if (keymap[e.code]) { input[keymap[e.code]] = true; e.preventDefault(); }
    else if (e.code === 'KeyF') { player.toggleFly(); hud.showBanner(player.flying ? '御剑而行' : '收剑而立', 1200); }
    else if (e.code === 'KeyZ') { player.toggleMeditate(); hud.showBanner(player.meditating ? '入定修炼' : '出定', 1200); }
    else if (e.code === 'KeyB') {
      const open = hud.toggleInventory(inventory, usePill, gear, onGear);
      if (open) document.exitPointerLock?.();
      else renderer.domElement.requestPointerLock?.();
    } else {
      const digit = 'Digit1 Digit2 Digit3 Digit4 Digit5 Digit6'.split(' ').indexOf(e.code);
      if (digit >= 0) {
        const d = SKILL_DEFS[digit];
        if (d.item) usePill(d.item);
        else skills.use(digit, skillCtx);
      }
    }
  });
  addEventListener('keyup', (e) => { if (keymap[e.code]) input[keymap[e.code]] = false; });

  renderer.domElement.addEventListener('click', () => {
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    hud.setLocked(document.pointerLockElement === renderer.domElement);
  });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    camYaw -= e.movementX * 0.0024;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.002, -0.55, 1.1);
  });
  addEventListener('mousedown', (e) => {
    if (e.button !== 0 || document.pointerLockElement !== renderer.domElement) return;
    if (player.meditating || !player.alive) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(dir, 0.8);
    projectiles.fire(origin, dir);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer?.setSize(innerWidth, innerHeight);
  });

  const camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    const p = player.position;
    const dist = player.flying ? 9 : 6;
    const offset = new THREE.Vector3(
      Math.sin(camYaw) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(camYaw) * Math.cos(camPitch)
    ).multiplyScalar(dist);
    camTarget.lerp(new THREE.Vector3(p.x, p.y + 1.6, p.z), 1 - Math.exp(-10 * dt));
    const desired = camTarget.clone().add(offset);
    const gh = terrainHeight(desired.x, desired.z) + 0.6;
    if (desired.y < gh) desired.y = gh;
    camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
    camera.lookAt(camTarget);
  }

  const clock = new THREE.Clock();
  let firstFrame = true;

  function breakthrough(realms) {
    recalc(); // 境界提升后面板重算
    ring.trigger(player.position);
    bursts.spawn(player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), cult.realm.aura, 90, 9);
    hud.showBanner(`突破 · ${realms[realms.length - 1]}！`, 3200);
  }

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    world.setFocus(player.position);
    const dayNight = world.update(dt, t);
    world.setShadowAnchor(player.position);
    // 帧率监控：连续 6 秒低于 40fps 自动降一档
    fpsT += dt; fpsN++;
    if (fpsT >= 6) {
      const avg = fpsN / fpsT;
      fpsT = 0; fpsN = 0;
      if (!qualityManual && avg < 40 && quality !== 'low') {
        quality = quality === 'high' ? 'mid' : 'low';
        applyQuality();
        hud.floater(player.position, `已自动调整画质 · ${QUALITY[quality].name}`, 'gain');
      }
    }
    player.update(dt, input, camYaw);
    beasts?.update(dt, player.position, t, (dmg, b) => {
      if (!player.alive) return;
      // 怪物攻击过伤害引擎：玩家防御 + 境界差（碾压/不破防）
      const c = calcDamage(dmg, b.lv, lv, stats.def, 0.03);
      const dealt = player.takeDamage(c.dealt);
      if (c.note === 'block') hud.floater(player.position, '妖兽无法破防', 'block');
      else if (c.note === 'crush') hud.floater(player.position, `境界碾压 -${dealt}`, 'crush');
      else if (dealt > 0) hud.floater(player.position, `-${dealt}`, 'hurt');
    });
    projectiles.update(dt, beasts?.targets || [], (beast) => {
      const c = calcDamage(stats.atk * stats.swordMult, lv, beast.lv, beast.stats.def, stats.crit);
      const res = beasts.damage(beast, c.dealt, '剑气');
      if (res) {
        if (c.note === 'block') hud.floater(beast.mesh.position, `无法破防 -${res.amount}`, 'block');
        else if (c.note === 'resist') hud.floater(beast.mesh.position, `-${res.amount} 护体`, 'resist');
        else hud.floater(beast.mesh.position, `-${res.amount}`, c.crit ? 'crit' : 'hit');
        if (res.killed) onBeastKilled(beast, res);
      }
    });
    bursts.update(dt);
    skills.update(dt);
    pickups.update(dt, player.position, (d) => {
      if (d.stones) {
        cult.spiritStones += d.stones;
        hud.floater(player.position, `灵石 +${d.stones}`, 'gain');
      } else if (d.item) {
        inventory.add(d.item, 1);
        hud.floater(player.position, `拾取 ${ITEMS[d.item].name}`, 'gain');
      } else if (d.equip) {
        gear.add(d.equip);
        hud.floater(player.position, `获得 ${d.equip.name}`, 'equip');
        if (hud.invOpen) hud.renderInventory(inventory, usePill, gear, onGear);
      }
    });
    medAura.update(dt, player.meditating, player.position);
    meridian.update(dt, player.meditating, player.position);
    ring.update(dt);

    if (player.meditating) {
      const broke = cult.meditateTick(dt);
      if (broke) breakthrough(broke);
    }

    player.aura.color.setHex(player.meditating ? cult.realm.aura : 0xffe9c8);
    player.aura.intensity = (player.meditating ? 2.5 : 0.45 + cult.realmIndex * 0.3) * (0.6 + dayNight.night * 0.8);

    hud.update(cult);
    hud.setVitals(player.hp, player.maxHp, skills.mana, skills.maxMana);
    hud.updateQuickbar(SKILL_DEFS.map((_, i) => skills.cooldowns[i] || 0), skills.mana, SKILL_DEFS);
    if (beasts) hud.updateBeastBars(beasts.targets, camera, lv);
    hud.setTimeOfDay(dayNight.dayTime, SHICHEN, dayNight.day);
    // 名胜发现提示
    if (world.landmarks && (tick._lmT = (tick._lmT || 0) - dt) <= 0) {
      tick._lmT = 0.5;
      for (const L of world.landmarks) {
        if (!L.seen && Math.hypot(player.position.x - L.x, player.position.z - L.z) < L.r) {
          L.seen = true;
          hud.showBanner(`发现 · ${L.name}`, 2400);
        }
      }
    }

    updateCamera(dt);
    if (bloomOn) composer.render(); else renderer.render(scene, camera);

    if (firstFrame) { firstFrame = false; hud.showBanner('云游修仙 · 入界', 2200); }
  }
  tick();
}

start().catch((e) => {
  loadingEl.textContent = '资源加载失败：' + e.message;
  console.error(e);
});
