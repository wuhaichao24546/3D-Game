import * as THREE from 'three';

const WALK = 6, RUN = 11, FLY_SPEED = 20;
const GRAVITY = 26, JUMP_V = 9.5;

function buildCultivator() {
  const g = new THREE.Group();
  const robe = new THREE.MeshStandardMaterial({ color: 0x2e6f5e, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a20, flatShading: true });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd8c17c, flatShading: true, emissive: 0x332a10 });

  // body robe
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 8), robe);
  body.position.y = 1.05;
  g.add(body);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.35, 3, 8), robe);
  chest.position.y = 1.75;
  g.add(chest);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 12), trim);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.35;
  g.add(belt);

  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 2.35;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), dark);
  hair.scale.set(1, 0.75, 1);
  hair.position.y = 2.48;
  g.add(hair);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), dark);
  bun.position.y = 2.75;
  g.add(bun);

  // arms
  const armGeo = new THREE.CapsuleGeometry(0.09, 0.55, 3, 6);
  const armL = new THREE.Mesh(armGeo, robe);
  armL.position.set(-0.44, 1.72, 0); armL.rotation.z = 0.18;
  const armR = new THREE.Mesh(armGeo, robe);
  armR.position.set(0.44, 1.72, 0); armR.rotation.z = -0.18;
  g.add(armL, armR);

  // legs
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.6, 3, 6);
  const legL = new THREE.Mesh(legGeo, dark);
  legL.position.set(-0.18, 0.45, 0);
  const legR = new THREE.Mesh(legGeo, dark);
  legR.position.set(0.18, 0.45, 0);
  g.add(legL, legR);

  // sword on the back
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.25, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xbfd6d2, metalness: 0.8, roughness: 0.3 }));
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), trim);
  guard.position.y = -0.62;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 6), dark);
  grip.position.y = -0.78;
  sword.add(blade, guard, grip);
  sword.position.set(0.1, 1.8, -0.4);
  sword.rotation.z = 0.5;
  g.add(sword);

  return { group: g, armL, armR, legL, legR, body, sword };
}

function buildFlyingSword() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.06, 2.6),
    new THREE.MeshStandardMaterial({
      color: 0x9fe0e8, metalness: 0.7, roughness: 0.25,
      emissive: 0x1b5a66, emissiveIntensity: 0.8,
    })
  );
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.27, 0.5, 4),
    blade.material
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 1.55;
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.02, 2.7),
    new THREE.MeshBasicMaterial({ color: 0x7ff5ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
  );
  glow.position.y = -0.05;
  g.add(blade, tip, glow);
  return g;
}

export class Player {
  constructor(scene, terrainHeight, spawn) {
    this.terrainHeight = terrainHeight;
    const parts = buildCultivator();
    this.parts = parts;
    this.mesh = parts.group;
    this.mesh.position.copy(spawn);
    scene.add(this.mesh);

    this.flySword = buildFlyingSword();
    this.flySword.visible = false;
    scene.add(this.flySword);

    // aura light, color set by cultivation realm
    this.aura = new THREE.PointLight(0x7ff5c8, 0, 8);
    this.mesh.add(this.aura);

    this.vel = new THREE.Vector3();
    this.yaw = 0;            // facing
    this.grounded = true;
    this.flying = false;
    this.meditating = false;
    this.walkPhase = 0;
    this.spawn = spawn.clone();
  }

  get position() { return this.mesh.position; }

  toggleFly() {
    this.flying = !this.flying;
    if (this.flying) { this.meditating = false; this.vel.y = Math.max(this.vel.y, 3); }
    this.flySword.visible = this.flying;
    this.parts.sword.visible = !this.flying;
  }

  toggleMeditate() {
    if (this.flying) return;
    this.meditating = !this.meditating;
  }

  update(dt, input, camYaw) {
    const p = this.mesh.position;
    const ground = this.terrainHeight(p.x, p.z);

    if (this.meditating) {
      this.vel.set(0, 0, 0);
      p.y = Math.max(p.y, ground);
      this.poseMeditate();
      this.flySword.visible = false;
      return;
    }

    const ix = (input.d ? 1 : 0) - (input.a ? 1 : 0);
    const iz = (input.s ? 1 : 0) - (input.w ? 1 : 0);
    const moving = ix !== 0 || iz !== 0;

    if (this.flying) {
      const speed = input.shift ? FLY_SPEED * 1.6 : FLY_SPEED;
      const dir = new THREE.Vector3(ix, 0, iz).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
      this.vel.x = dir.x * speed;
      this.vel.z = dir.z * speed;
      const vert = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
      this.vel.y = THREE.MathUtils.lerp(this.vel.y, vert * speed * 0.7, 0.15);
      p.addScaledVector(this.vel, dt);
      // stay above terrain
      if (p.y < ground + 0.6) p.y = ground + 0.6;
      p.y = Math.min(p.y, 110);
      if (moving) this.yaw = Math.atan2(this.vel.x, this.vel.z);
      this.walkPhase += dt * (moving ? 3 : 1);
      this.poseFly(vert, moving);
      this.flySword.position.set(p.x, p.y + 0.05, p.z);
      this.flySword.rotation.y = this.yaw;
      this.flySword.rotation.x = THREE.MathUtils.lerp(this.flySword.rotation.x, moving ? 0.12 : 0, 0.1);
      this.flySword.rotation.z = Math.sin(this.walkPhase) * 0.05;
    } else {
      const speed = input.shift ? RUN : WALK;
      const dir = new THREE.Vector3(ix, 0, iz).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
      this.vel.x = THREE.MathUtils.lerp(this.vel.x, dir.x * speed * (moving ? 1 : 0), 0.2);
      this.vel.z = THREE.MathUtils.lerp(this.vel.z, dir.z * speed * (moving ? 1 : 0), 0.2);
      this.vel.y -= GRAVITY * dt;
      if (this.grounded && input.jump) { this.vel.y = JUMP_V; this.grounded = false; }
      p.addScaledVector(this.vel, dt);
      if (p.y <= ground) { p.y = ground; this.vel.y = 0; this.grounded = true; }
      else this.grounded = false;
      if (moving) this.yaw = Math.atan2(this.vel.x, this.vel.z);
      this.walkPhase += dt * (moving ? speed * 1.1 : 0);
      this.poseWalk(moving);
    }

    // soft world bounds
    const d = Math.hypot(p.x, p.z);
    if (d > 185) { p.x *= 185 / d; p.z *= 185 / d; }

    // smooth facing
    let dy = this.yaw - this.mesh.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.mesh.rotation.y += dy * 0.25;
  }

  poseWalk(moving) {
    const { armL, armR, legL, legR, body } = this.parts;
    const s = Math.sin(this.walkPhase);
    if (moving) {
      legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7;
      armL.rotation.x = -s * 0.5; armR.rotation.x = s * 0.5;
      legL.visible = legR.visible = true;
      body.position.y = 1.05 + Math.abs(Math.sin(this.walkPhase)) * 0.05;
    } else {
      legL.rotation.x = legR.rotation.x = 0;
      armL.rotation.x = armR.rotation.x = 0;
      legL.visible = legR.visible = true;
      body.position.y = 1.05;
    }
    armL.rotation.z = 0.18; armR.rotation.z = -0.18;
    this.mesh.position.y += 0; // keep
    if (!legL.visible) { legL.visible = legR.visible = true; }
    this.mesh.scale.setScalar(1);
  }

  poseFly(vert, moving) {
    const { armL, armR, legL, legR } = this.parts;
    legL.visible = legR.visible = true;
    legL.rotation.x = legR.rotation.x = 0.15;
    armL.rotation.x = armR.rotation.x = -0.4;
    armL.rotation.z = 0.6; armR.rotation.z = -0.6;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, moving ? 0.15 : 0, 0.1);
    if (!this.flying) this.mesh.rotation.x = 0;
  }

  poseMeditate() {
    const { armL, armR, legL, legR } = this.parts;
    // cross-legged: hide lower legs, arms folded
    legL.visible = legR.visible = false;
    armL.rotation.x = armR.rotation.x = -1.2;
    armL.rotation.z = 0.9; armR.rotation.z = -0.9;
    this.mesh.rotation.x = 0;
  }
}
