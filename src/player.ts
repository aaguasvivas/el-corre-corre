// player.ts: input, continuous steering physics, edge scrape, crash tumble.
// Steering is a velocity-target model: input sets a desired lateral velocity,
// acceleration chases it, damping glides it out. Continuous across the full
// road width, never lane-snapped.
//
// Screen note: the camera looks down +z, so world +x renders on screen LEFT.
// Input is handled in screen space and flipped once here.

import * as THREE from 'three';
import { CONFIG, PALETTE, ROAD } from './config';
import { toonMaterial } from './world';

const DEG = Math.PI / 180;
const EDGE_MAX = ROAD.edgeX - CONFIG.playerHalfWidth; // shoulders are ridable, edges never kill
const START_X = -3.4; // middle of your half of the road

export interface PlayerCallbacks {
  isSteeringActive: () => boolean;
  onScrape: () => void;
}

interface Spark {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Player {
  x = START_X;
  velX = 0;

  private root = new THREE.Group();
  private leanGroup = new THREE.Group();
  private frontWheel!: THREE.Mesh;
  private rearWheel!: THREE.Mesh;
  private leanVis = 0;

  private keys = new Set<string>();
  private touchActive = false;
  private touchTargetX = START_X;
  private pointerId: number | null = null;
  private lastPointerX = 0;

  private scrapeCooldown = 0;

  private tumbling = false;
  private settling = false;
  private tumbleVy = 0;
  private tumbleVz = 0;
  private spinX = 0;
  private spinZ = 0;

  private sparks: Spark[] = [];
  private readonly cb: PlayerCallbacks;

  constructor(scene: THREE.Scene, cb: PlayerCallbacks) {
    this.cb = cb;
    this.buildMoto();
    this.root.position.set(START_X, 0, 0);
    this.root.add(this.leanGroup);
    scene.add(this.root);
    this.buildSparks(scene);
    this.bindInput();
  }

  get velXNorm(): number {
    return this.velX / CONFIG.lateralMaxSpeed;
  }

  private buildMoto(): void {
    const red = toonMaterial(PALETTE.flagRed);
    const dark = toonMaterial(PALETTE.darkParts);
    const chrome = toonMaterial(0xd9d9d9);
    const shirt = toonMaterial(PALETTE.colmadoTeal);
    const skin = toonMaterial(PALETTE.skin);
    const jeans = toonMaterial(0x2f4a6f); // DECISION: jean blue reads well against the red moto
    const glow = new THREE.MeshBasicMaterial({ color: PALETTE.sunGlow });

    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      rx = 0,
      rz = 0,
    ): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.rotation.z = rz;
      m.castShadow = true;
      this.leanGroup.add(m);
      return m;
    };

    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    this.rearWheel = add(wheelGeo, dark, 0, 0.32, -0.62);
    this.frontWheel = add(wheelGeo, dark, 0, 0.32, 0.72);

    // el motor
    add(new THREE.BoxGeometry(0.42, 0.34, 1.3), red, 0, 0.62, 0.02);
    add(new THREE.BoxGeometry(0.3, 0.2, 0.52), red, 0, 0.84, 0.3);
    add(new THREE.BoxGeometry(0.34, 0.12, 0.56), dark, 0, 0.8, -0.34);
    add(new THREE.BoxGeometry(0.07, 0.52, 0.07), chrome, 0.1, 0.55, 0.66, -0.25);
    add(new THREE.BoxGeometry(0.07, 0.52, 0.07), chrome, -0.1, 0.55, 0.66, -0.25);
    const barGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8);
    barGeo.rotateZ(Math.PI / 2);
    add(barGeo, chrome, 0, 1.04, 0.58);
    add(new THREE.SphereGeometry(0.07, 10, 8), glow, 0, 0.9, 0.8);
    const pipeGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8);
    pipeGeo.rotateX(Math.PI / 2);
    add(pipeGeo, chrome, 0.16, 0.4, -0.45);

    // el tiguere
    add(new THREE.BoxGeometry(0.36, 0.5, 0.26), shirt, 0, 1.24, -0.14, 0.3);
    add(new THREE.SphereGeometry(0.17, 12, 10), skin, 0, 1.62, 0);
    add(new THREE.CylinderGeometry(0.185, 0.185, 0.1, 12), toonMaterial(PALETTE.flagBlue), 0, 1.72, 0);
    add(new THREE.BoxGeometry(0.26, 0.035, 0.16), toonMaterial(PALETTE.flagBlue), 0, 1.69, 0.16);
    add(new THREE.BoxGeometry(0.09, 0.44, 0.09), shirt, 0.25, 1.28, 0.18, -0.7);
    add(new THREE.BoxGeometry(0.09, 0.44, 0.09), shirt, -0.25, 1.28, 0.18, -0.7);
    add(new THREE.BoxGeometry(0.11, 0.42, 0.15), jeans, 0.17, 0.62, -0.2, 0.55);
    add(new THREE.BoxGeometry(0.11, 0.42, 0.15), jeans, -0.17, 0.62, -0.2, 0.55);
  }

  private buildSparks(scene: THREE.Scene): void {
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.centerLine });
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0 });
    }
  }

  private bindInput(): void {
    const STEER_KEYS = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];
    window.addEventListener('keydown', (e) => {
      if (STEER_KEYS.includes(e.code)) {
        this.keys.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.endTouch();
    });

    window.addEventListener('pointerdown', (e) => {
      if (!this.cb.isSteeringActive() || this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.lastPointerX = e.clientX;
      this.touchActive = true;
      this.touchTargetX = this.x;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.touchActive || e.pointerId !== this.pointerId) return;
      const dx = e.clientX - this.lastPointerX;
      this.lastPointerX = e.clientX;
      // Screen right is world -x, so the drag flips sign here.
      this.touchTargetX = clamp(
        this.touchTargetX - (dx / window.innerWidth) * ROAD.fullWidth * CONFIG.touchSteerScale,
        -EDGE_MAX,
        EDGE_MAX,
      );
    });
    const up = (e: PointerEvent): void => {
      if (e.pointerId === this.pointerId) this.endTouch();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private endTouch(): void {
    this.touchActive = false;
    this.pointerId = null;
  }

  step(dt: number, speed: number): void {
    let desired = 0;
    let hasInput = false;
    if (this.touchActive) {
      desired = clamp(
        (this.touchTargetX - this.x) * CONFIG.touchServoGain,
        -CONFIG.lateralMaxSpeed,
        CONFIG.lateralMaxSpeed,
      );
      hasInput = true;
    } else {
      const axis =
        (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
        (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      if (axis !== 0) {
        desired = -axis * CONFIG.lateralMaxSpeed; // screen right = world -x
        hasInput = true;
      }
    }

    if (hasInput) {
      const maxDv = CONFIG.lateralAccel * dt;
      this.velX += clamp(desired - this.velX, -maxDv, maxDv);
    } else {
      this.velX *= Math.exp(-CONFIG.lateralDamping * dt);
    }
    this.x += this.velX * dt;

    if (this.scrapeCooldown > 0) this.scrapeCooldown -= dt;
    const over = this.x > EDGE_MAX ? 1 : this.x < -EDGE_MAX ? -1 : 0;
    if (over !== 0) {
      this.x = over * EDGE_MAX;
      if (Math.abs(this.velX) > 1.2 && this.scrapeCooldown <= 0) {
        this.scrapeCooldown = CONFIG.scrapeCooldownSec;
        this.emitSparks(over);
        this.cb.onScrape();
      }
      this.velX = 0;
    }

    const leanTarget = -this.velXNorm * CONFIG.steerLeanMaxDeg * DEG;
    this.leanVis += (leanTarget - this.leanVis) * Math.min(1, CONFIG.leanResponse * dt);
    this.leanGroup.rotation.z = this.leanVis;
    this.root.rotation.y = this.velXNorm * 0.16; // nose points into the carve
    this.root.position.x = this.x;

    const spin = (speed / 0.33) * dt;
    this.frontWheel.rotation.x += spin;
    this.rearWheel.rotation.x += spin;
  }

  private emitSparks(side: number): void {
    let n = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.life = 0.25 + Math.random() * 0.2;
      s.mesh.visible = true;
      s.mesh.position.set(this.x + side * 0.5, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.8);
      s.vx = -side * (1.5 + Math.random() * 2.5);
      s.vy = 1.5 + Math.random() * 3;
      s.vz = -(3 + Math.random() * 4);
      if (++n >= 6) break;
    }
  }

  updateSparks(dt: number): void {
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy -= 20 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.life <= 0 || s.mesh.position.y < 0) {
        s.life = 0;
        s.mesh.visible = false;
      }
    }
  }

  crash(): void {
    this.tumbling = true;
    this.settling = false;
    this.tumbleVy = 4.5;
    this.tumbleVz = 2.4;
    this.spinX = 8 + Math.random() * 5;
    this.spinZ = (Math.random() - 0.5) * 6;
  }

  // Comic tumble: exaggerated gravity, a bounce, then settle flat. No blood, ever.
  updateTumble(dt: number): void {
    if (!this.tumbling) return;
    if (!this.settling) {
      this.root.position.y += this.tumbleVy * dt;
      this.root.position.z += this.tumbleVz * dt;
      this.tumbleVy -= 22 * dt;
      this.leanGroup.rotation.x += this.spinX * dt;
      this.leanGroup.rotation.z += this.spinZ * dt;
      if (this.root.position.y <= 0 && this.tumbleVy < 0) {
        this.root.position.y = 0;
        if (Math.abs(this.tumbleVy) > 2.5) {
          this.tumbleVy = -this.tumbleVy * 0.4;
          this.spinX *= 0.6;
          this.spinZ *= 0.6;
        } else {
          this.settling = true;
        }
      }
    } else {
      const snap = (a: number, stepAngle: number): number => Math.round(a / stepAngle) * stepAngle;
      const rx = this.leanGroup.rotation.x;
      const rz = this.leanGroup.rotation.z;
      const k = Math.min(1, 10 * dt);
      this.leanGroup.rotation.x += (snap(rx, Math.PI) - rx) * k;
      this.leanGroup.rotation.z += (snap(rz, Math.PI / 2) - rz) * k;
    }
  }

  reset(): void {
    this.x = START_X;
    this.velX = 0;
    this.leanVis = 0;
    this.touchTargetX = START_X;
    this.endTouch();
    this.tumbling = false;
    this.settling = false;
    this.scrapeCooldown = 0;
    this.root.position.set(START_X, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.leanGroup.rotation.set(0, 0, 0);
  }
}
