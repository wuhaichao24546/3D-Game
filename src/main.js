import * as THREE from 'three';
import { DefaultLoadingManager } from 'three';
import './style.css';
import { buildWorld, terrainHeight, WATER_LEVEL, SHICHEN } from './world.js';
import { Player } from './player.js';
import { Cultivation } from './cultivation.js';
import { BeastManager } from './beasts.js';
import { Projectiles, Bursts, MeditationAura, BreakthroughRing } from './effects.js';
import { HUD } from './hud.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 4000);

const hud = new HUD();
const loadingEl = document.getElementById('loading');
// 加载进度
let progDone = 0, progTotal = 0;
DefaultLoadingManager.onProgress = (_u, done, total) => {
  progDone = done; progTotal = total;
  loadingEl.textContent = `仙气汇聚中 · ${Math.round(done / Math.max(total, 1) * 100)}%`;
};

async function start() {
  const world = buildWorld(scene, renderer);

  let spawn = new THREE.Vector3(0, 10, 8);
  for (let r = 6; r < 60 && spawn.y <= WATER_LEVEL + 0.8; r += 4) {
    for (let a = 0; a < Math.PI * 2; a += 0.6) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h > WATER_LEVEL + 0.8) { spawn.set(x, h, z); break; }
    }
  }

  // 分层加载：世界先渲染，主角就绪即开玩，灵兽后台加载
  loadingEl.textContent = '仙气汇聚中 · 载入修士…';
  const player = await Player.create(scene, terrainHeight, spawn);
  loadingEl.style.display = 'none';

  let beasts = null;
  BeastManager.create(scene, terrainHeight, 12).then((b) => {
    b.populate(spawn);
    beasts = b;
    if (window.__game) window.__game.beasts = b;
  });
  window.__game = { scene, camera, player, beasts: null, world, THREE };

  const cult = new Cultivation();
  const projectiles = new Projectiles(scene);
  const bursts = new Bursts(scene);
  const medAura = new MeditationAura(scene);
  const ring = new BreakthroughRing(scene);

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
    if (player.meditating) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(dir, 0.8);
    projectiles.fire(origin, dir);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
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
    ring.trigger(player.position);
    bursts.spawn(player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), cult.realm.aura, 90, 9);
    hud.showBanner(`突破 · ${realms[realms.length - 1]}！`, 3200);
  }

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    const dayNight = world.update(dt, t);
    player.update(dt, input, camYaw);
    beasts?.update(dt, player.position, t);
    projectiles.update(dt, beasts?.targets || [], (beast) => {
      const def = beasts.kill(beast);
      if (def) {
        cult.spiritStones += def.stones;
        const broke = cult.addExp(def.exp);
        bursts.spawn(beast.mesh.position, 0xaef0c8, 46, 7);
        hud.showBanner(`斩杀${def.name} · 修为 +${def.exp}`, 1400);
        if (broke) breakthrough(broke);
      }
    });
    bursts.update(dt);
    medAura.update(dt, player.meditating, player.position);
    ring.update(dt);

    if (player.meditating) {
      const broke = cult.meditateTick(dt);
      if (broke) breakthrough(broke);
    }

    player.aura.color.setHex(player.meditating ? cult.realm.aura : 0xffe9c8);
    player.aura.intensity = (player.meditating ? 2.5 : 0.45 + cult.realmIndex * 0.3) * (0.6 + dayNight.night * 0.8);

    hud.update(cult);
    hud.setTimeOfDay(dayNight.dayTime, SHICHEN, dayNight.day);

    updateCamera(dt);
    renderer.render(scene, camera);

    if (firstFrame) { firstFrame = false; hud.showBanner('云游修仙 · 入界', 2200); }
  }
  tick();
}

start().catch((e) => {
  loadingEl.textContent = '资源加载失败：' + e.message;
  console.error(e);
});
