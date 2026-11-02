import * as THREE from 'three';

// ---- sword-qi projectiles -------------------------------------------------
export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.geo = new THREE.OctahedronGeometry(0.22, 0);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x8af5ff });
    this.trailMat = new THREE.MeshBasicMaterial({
      color: 0x57e6a9, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
    });
  }

  fire(origin, dir) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.geo, this.mat);
    core.scale.set(1, 1, 2.4);
    const trail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.6, 6), this.trailMat);
    trail.rotation.x = -Math.PI / 2;
    trail.position.z = -1;
    g.add(core, trail);
    g.position.copy(origin);
    g.lookAt(origin.clone().add(dir));
    this.scene.add(g);
    this.pool.push({ mesh: g, vel: dir.clone().multiplyScalar(38), life: 2.0 });
  }

  update(dt, targets, onHit) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      let dead = p.life <= 0;
      if (!dead) {
        for (const t of targets) {
          if (!t.alive) continue;
          if (p.mesh.position.distanceToSquared(t.mesh.position) < t.radius * t.radius) {
            onHit(t); dead = true; break;
          }
        }
      }
      if (dead) { this.scene.remove(p.mesh); this.pool.splice(i, 1); }
    }
  }
}

// ---- one-shot particle bursts ----------------------------------------------
export class Bursts {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn(pos, color = 0xaef0c8, n = 40, speed = 6) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI;
      vel.push(new THREE.Vector3(
        Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)
      ).multiplyScalar(speed * (0.4 + Math.random() * 0.6)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 0.45, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.items.push({ pts, vel, life: 1.2, max: 1.2 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const b = this.items[i];
      b.life -= dt;
      const p = b.pts.geometry.attributes.position;
      for (let j = 0; j < b.vel.length; j++) {
        p.array[j * 3] += b.vel[j].x * dt;
        p.array[j * 3 + 1] += b.vel[j].y * dt;
        p.array[j * 3 + 2] += b.vel[j].z * dt;
        b.vel[j].y -= dt * 4;
      }
      p.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) { this.scene.remove(b.pts); this.items.splice(i, 1); }
    }
  }
}

// ---- meditation aura (灵气汇聚) ---------------------------------------------
export class MeditationAura {
  constructor(scene) {
    const N = 120;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaef0c8, size: 0.3, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.pts.visible = false;
    scene.add(this.pts);
    this.N = N;
    this.t = 0;
  }

  update(dt, active, center) {
    this.pts.visible = active;
    if (!active) return;
    this.t += dt;
    const p = this.pts.geometry.attributes.position;
    for (let i = 0; i < this.N; i++) {
      const phase = (i / this.N) * Math.PI * 2 + this.t * 1.8;
      const r = 2.6 - ((i % 30) / 30) * 1.9 + Math.sin(this.t * 2 + i) * 0.15;
      const h = ((i * 7) % 40) / 40 * 2.4;
      p.array[i * 3] = center.x + Math.cos(phase) * r;
      p.array[i * 3 + 1] = center.y + 0.2 + h + Math.sin(this.t + i) * 0.1;
      p.array[i * 3 + 2] = center.z + Math.sin(phase) * r;
    }
    p.needsUpdate = true;
  }
}

// ---- breakthrough shockwave ring -------------------------------------------
export class BreakthroughRing {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.12, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.t = Infinity;
  }

  trigger(pos) {
    this.mesh.position.copy(pos).y += 0.3;
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt) {
    if (!this.mesh.visible) return;
    this.t += dt;
    const k = this.t / 1.6;
    if (k >= 1) { this.mesh.visible = false; return; }
    const s = 1 + k * 22;
    this.mesh.scale.set(s, s, s);
    this.mesh.material.opacity = 0.9 * (1 - k);
  }
}
