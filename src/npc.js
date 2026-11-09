import * as THREE from 'three';
import { canvasTex, mulberry } from './tex.js';
import { humanBase, makeHuman } from './humans.js';

// ---------- NPC：程序化道装人物 + 头顶名牌 + 交互 ----------
function nameSprite(text, color = '#ffe9a8') {
  const t = canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = '28px "STKaiti","KaiTi",serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 6;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
  }, false);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(2.4, 0.6, 1);
  return s;
}

// 道装人物：锥形道袍+头+发髻+广袖；掌门加冠
export function buildNpcFigure({ robe = 0x3a4d6e, trim = 0xd8b96a, hat = 'bun', skin = 0xe8c9a8 } = {}) {
  const g = new THREE.Group();
  const robeMat = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, metalness: 0.6, roughness: 0.4 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.7 });
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.15, 12, 1, true), robeMat);
  skirt.geometry.translate(0, -0.575, 0); skirt.position.y = 1.32;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.55, 10), robeMat);
  torso.position.y = 1.34;
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 6, 16), trimMat);
  sash.rotation.x = Math.PI / 2; sash.position.y = 1.14;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), skinMat);
  head.position.y = 1.78; head.scale.y = 1.12;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, 1.6), hairMat);
  hairCap.position.y = 1.8;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.55, 8), robeMat);
  armL.position.set(-0.24, 1.32, 0.02); armL.rotation.z = 0.35; armL.rotation.x = -0.15;
  const armR = armL.clone(); armR.position.x = 0.24; armR.rotation.z = -0.35;
  g.add(skirt, torso, sash, head, hairCap, armL, armR);
  if (hat === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), hairMat);
    bun.position.y = 1.93;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 5), trimMat);
    pin.rotation.z = Math.PI / 2; pin.position.y = 1.93;
    g.add(bun, pin);
  } else if (hat === 'crown') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), hairMat);
    bun.position.y = 1.92;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 8, 1, true), trimMat);
    crown.position.y = 1.97;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.03), trimMat);
    wing.position.y = 1.99;
    g.add(bun, crown, wing);
  } else if (hat === 'straw') {
    const hatM = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a7648, roughness: 0.9 }));
    hatM.position.y = 1.9;
    g.add(hatM);
  }
  return g;
}

export class NPCManager {
  constructor(scene, terrainHeight) {
    this.scene = scene;
    this.terrainHeight = terrainHeight;
    this.npcs = [];
  }

  // def: {id,name,x,z,robe,trim,hat,tag,tags?,patrol?}
  add(def) {
    const mesh = new THREE.Group();
    const fig = buildNpcFigure(def);
    mesh.add(fig);
    // 写实人体加载后替换程序化人物
    humanBase().then((base) => {
      if (!base) return;
      mesh.remove(fig);
      mesh.add(makeHuman(base, { robe: def.robe, trim: def.trim, hat: def.hat || 'bun' }));
    });
    const y = this.terrainHeight(def.x, def.z);
    mesh.position.set(def.x, y, def.z);
    const tag = nameSprite(def.name);
    tag.position.y = 2.25;
    mesh.add(tag);
    this.scene.add(mesh);
    const n = { ...def, mesh, bob: Math.random() * 9, talk: def.talk };
    this.npcs.push(n);
    return n;
  }

  nearest(pos, r = 4) {
    let best = null, bd = r;
    for (const n of this.npcs) {
      const d = Math.hypot(pos.x - n.mesh.position.x, pos.z - n.mesh.position.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  update(dt, playerPos, t) {
    for (const n of this.npcs) {
      const p = n.mesh.position;
      p.y = this.terrainHeight(p.x, p.z);
      n.mesh.position.y = p.y + Math.sin(t * 1.6 + n.bob) * 0.02;
      // 靠近时转身面向玩家
      const dx = playerPos.x - p.x, dz = playerPos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 6) {
        const target = Math.atan2(dx, dz);
        let dy = target - n.mesh.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        n.mesh.rotation.y += dy * Math.min(1, dt * 6);
      }
    }
  }
}
