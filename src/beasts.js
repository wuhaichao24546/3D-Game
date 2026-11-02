import * as THREE from 'three';

function buildFox(color) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, flatShading: true });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 3, 8), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), fur);
  head.position.set(0, 0.75, 0.62);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 6), fur);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.72, 0.92);
  const earGeo = new THREE.ConeGeometry(0.09, 0.28, 4);
  const earL = new THREE.Mesh(earGeo, dark); earL.position.set(-0.15, 1.0, 0.55);
  const earR = new THREE.Mesh(earGeo, dark); earR.position.set(0.15, 1.0, 0.55);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), fur);
  tail.rotation.x = -Math.PI / 2.4;
  tail.position.set(0, 0.7, -0.75);
  const legGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.45, 5);
  for (const [x, z] of [[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.35], [0.2, -0.35]]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(x, 0.22, z);
    g.add(leg);
  }
  g.add(body, head, snout, earL, earR, tail);
  return g;
}

const BEAST_DEFS = [
  { name: '灵狐', color: 0xe8f4ff, exp: 40, stones: 2 },
  { name: '玄龟', color: 0x5a7a5f, exp: 60, stones: 3 },
  { name: '赤焰狼', color: 0xc96a4a, exp: 80, stones: 5 },
];

export class BeastManager {
  constructor(scene, terrainHeight, count = 12) {
    this.scene = scene;
    this.terrainHeight = terrainHeight;
    this.beasts = [];
    this.count = count;
  }

  spawnOne(center) {
    const def = BEAST_DEFS[Math.floor(Math.random() * BEAST_DEFS.length)];
    const mesh = buildFox(def.color);
    // find land
    let x = center.x, z = center.z, h = this.terrainHeight(x, z);
    for (let i = 0; i < 60 && h < 2.6; i++) {
      x = center.x + (Math.random() - 0.5) * 160;
      z = center.z + (Math.random() - 0.5) * 160;
      h = this.terrainHeight(x, z);
    }
    mesh.position.set(x, h, z);
    this.scene.add(mesh);
    this.beasts.push({
      mesh, def, alive: true, radius: 1.3,
      heading: Math.random() * Math.PI * 2,
      timer: Math.random() * 4,
      speed: 1.2 + Math.random(),
      bob: Math.random() * 10,
    });
  }

  populate(center) {
    for (let i = 0; i < this.count; i++) this.spawnOne(center);
  }

  update(dt, playerPos, t) {
    for (const b of this.beasts) {
      if (!b.alive) continue;
      const p = b.mesh.position;
      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      const dist = Math.hypot(dx, dz);

      b.timer -= dt;
      if (dist < 7) {
        // flee
        b.heading = Math.atan2(dx, dz);
        b.speed = 4.5;
      } else {
        b.speed = 1.2;
        if (b.timer <= 0) {
          b.heading += (Math.random() - 0.5) * 1.8;
          b.timer = 2 + Math.random() * 4;
        }
      }
      p.x += Math.sin(b.heading) * b.speed * dt;
      p.z += Math.cos(b.heading) * b.speed * dt;
      const h = this.terrainHeight(p.x, p.z);
      if (h < 2.4) { b.heading += Math.PI / 2; } // avoid water
      p.y = h + 0.05 + Math.abs(Math.sin(t * 6 + b.bob)) * 0.08;
      b.mesh.rotation.y = b.heading;
    }
  }

  // returns defs of killed beasts
  kill(b) {
    if (!b.alive) return null;
    b.alive = false;
    this.scene.remove(b.mesh);
    // respawn later elsewhere
    setTimeout(() => {
      this.beasts = this.beasts.filter(x => x !== b);
      this.spawnOne(b.mesh.position);
    }, 6000);
    return b.def;
  }

  get targets() { return this.beasts; }
}
