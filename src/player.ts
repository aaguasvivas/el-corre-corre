// player.ts: input, continuous steering physics, the held caballito, airtime,
// edge scrape, power-up states, the three rides, and the crash tumble.
// Steering is a velocity-target model: input sets a desired lateral velocity,
// acceleration chases it, damping glides it out. Continuous across the full
// road width, never lane-snapped.
//
// El caballito (redesigned after the Phase 4 feel test): HOLD W/Space, or
// swipe up and keep the finger down, to ride the wheelie as long as you dare.
// Steering authority decays the longer you hold and the bike starts to
// wobble; all points multiply while it lasts. Swipe down or release to drop.
//
// Screen note: the camera looks down +z, so world +x renders on screen LEFT.
// Input is handled in screen space and flipped once here.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, PALETTE, ROAD, VEHICLES, type VehicleId } from './config';
import { toonMaterial, worldMaterial } from './world';

const DEG = Math.PI / 180;
const START_X = -3.4; // middle of your half of the road

export interface PlayerCallbacks {
  isSteeringActive: () => boolean;
  onScrape: () => void;
  onWheelieEnd: () => void;
  onLand: () => void;
}

type FxKind = 'spark' | 'splash' | 'trail' | 'dust';

interface Rig {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  wheelRadius: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  grow: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Player {
  x = START_X;
  velX = 0;
  vehicle: VehicleId = 'motor';

  private root = new THREE.Group();
  private leanGroup = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private wheelRadius = 0.32;
  private rigs: Partial<Record<VehicleId, Rig>> = {};
  private buildTarget!: THREE.Group;
  private aura!: THREE.Mesh;
  private glowShell!: THREE.Mesh;
  private glowMat!: THREE.MeshBasicMaterial;
  private stars!: THREE.Group;
  private leanVis = 0;
  private wheelieVis = 0;
  private time = 0;
  private edgeMax = ROAD.edgeX - CONFIG.playerHalfWidth;
  private wheelieAngleMax = 0.5;
  private wheelieLift = 0.62;

  private keys = new Set<string>();
  private wheelieKeys = new Set<string>();
  private touchActive = false;
  private touchWheelieHold = false;
  private touchTargetX = START_X;
  private pointerId: number | null = null;
  private lastPointerX = 0;
  private swipeRefY = 0;
  private swipeRefT = 0;

  private scrapeCooldown = 0;

  // el caballito
  private wheelieActive = false;
  private wheelieT = 0;
  private wheelieCooldownT = 0;
  private wheelieLatch = false; // must release before the next one arms
  private driftYawVis = 0;
  private driftSign = 1;

  // airtime
  private airborne = false;
  private airY = 0;
  private airVy = 0;

  // effects on handling
  private charcoT = 0;

  // power-ups
  private shielded = false;
  private glowOn = false;
  private trailAcc = 0;
  private dustAcc = 0;

  private tumbling = false;
  private settling = false;
  private tumbleVy = 0;
  private tumbleVz = 0;
  private spinX = 0;
  private spinZ = 0;

  private particles: Particle[] = [];
  private fxMats!: Record<FxKind, THREE.MeshBasicMaterial>;
  private readonly cb: PlayerCallbacks;

  constructor(scene: THREE.Scene, cb: PlayerCallbacks) {
    this.cb = cb;
    this.buildShared();
    this.setVehicle('motor');
    this.root.position.set(START_X, 0, 0);
    this.root.add(this.leanGroup);
    scene.add(this.root);
    this.buildFx(scene);
    this.bindInput();
  }

  get velXNorm(): number {
    return this.velX / (CONFIG.lateralMaxSpeed * VEHICLES[this.vehicle].latMaxMult);
  }

  get y(): number {
    return this.airY;
  }

  get isAirborne(): boolean {
    return this.airborne;
  }

  get isWheelie(): boolean {
    return this.wheelieActive;
  }

  // Caballitos float over hoyos; el derrape keeps all four wheels down.
  get clearsGroundHazards(): boolean {
    return this.wheelieActive && this.vehicle !== 'civic';
  }

  get hasShield(): boolean {
    return this.shielded;
  }

  get radius(): number {
    const base = CONFIG.playerRadius * VEHICLES[this.vehicle].hitbox;
    // Sideways is wide: the drift needs room. That is the trade.
    return this.vehicle === 'civic' && this.wheelieActive ? base * CONFIG.driftHitboxMult : base;
  }

  // ---------------- visuals ----------------

  private buildShared(): void {
    // Bendicion aura, hidden until earned
    const auraGeo = new THREE.TorusGeometry(0.8, 0.05, 8, 24);
    auraGeo.rotateX(Math.PI / 2);
    this.aura = new THREE.Mesh(
      auraGeo,
      worldMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.9 })),
    );
    this.aura.position.y = 0.5;
    this.aura.visible = false;
    this.root.add(this.aura);

    // Cafecito invincibility glow
    this.glowMat = worldMaterial(
      new THREE.MeshBasicMaterial({
        color: PALETTE.gold,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    this.glowShell = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), this.glowMat);
    this.glowShell.scale.y = 0.9;
    this.glowShell.position.y = 0.85;
    this.glowShell.visible = false;
    this.root.add(this.glowShell);

    // Cartoon stars for the tumble
    this.stars = new THREE.Group();
    const starGeo = mergeGeometries([
      new THREE.BoxGeometry(0.3, 0.07, 0.02),
      new THREE.BoxGeometry(0.07, 0.3, 0.02),
    ])!;
    const starMat = worldMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.gold }));
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(starGeo, starMat);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      this.stars.add(s);
    }
    this.stars.position.y = 1.1;
    this.stars.visible = false;
    this.root.add(this.stars);
  }

  // Rigs are built once and kept: swapping rides on the title screen is a
  // visibility flip, not a rebuild, so there is no hitch and nothing to dispose.
  setVehicle(id: VehicleId): void {
    this.vehicle = id;
    const v = VEHICLES[id];
    this.edgeMax = ROAD.edgeX - CONFIG.playerHalfWidth * v.hitbox;
    this.wheelieAngleMax = id === 'civic' ? 0.3 : 0.5;
    this.wheelieLift = id === 'civic' ? 0.42 : 0.62;

    let rig = this.rigs[id];
    if (!rig) {
      const group = new THREE.Group();
      this.buildTarget = group;
      this.wheels = [];
      if (id === 'pasola') this.buildPasola();
      else if (id === 'civic') this.buildCivic();
      else this.buildMoto();
      rig = { group, wheels: this.wheels, wheelRadius: this.wheelRadius };
      this.rigs[id] = rig;
      this.leanGroup.add(group);
    }
    for (const key of Object.keys(this.rigs) as VehicleId[]) {
      const r = this.rigs[key];
      if (r) r.group.visible = key === id;
    }
    this.wheels = rig.wheels;
    this.wheelRadius = rig.wheelRadius;
  }

  private add(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    rz = 0,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    m.castShadow = true;
    this.buildTarget.add(m);
    return m;
  }

  private buildRider(upright: boolean): void {
    const shirt = toonMaterial(PALETTE.colmadoTeal);
    const skin = toonMaterial(PALETTE.skin);
    const jeans = toonMaterial(0x2f4a6f);
    const blue = toonMaterial(PALETTE.flagBlue);
    const tilt = upright ? 0.08 : 0.3;
    this.add(new THREE.BoxGeometry(0.36, 0.5, 0.26), shirt, 0, 1.24, -0.14, tilt);
    this.add(new THREE.SphereGeometry(0.17, 12, 10), skin, 0, 1.62, 0);
    this.add(new THREE.CylinderGeometry(0.185, 0.185, 0.1, 12), blue, 0, 1.72, 0);
    this.add(new THREE.BoxGeometry(0.26, 0.035, 0.16), blue, 0, 1.69, 0.16);
    this.add(new THREE.BoxGeometry(0.09, 0.44, 0.09), shirt, 0.25, 1.28, 0.18, -0.7);
    this.add(new THREE.BoxGeometry(0.09, 0.44, 0.09), shirt, -0.25, 1.28, 0.18, -0.7);
    this.add(new THREE.BoxGeometry(0.11, 0.42, 0.15), jeans, 0.17, 0.62, -0.2, 0.55);
    this.add(new THREE.BoxGeometry(0.11, 0.42, 0.15), jeans, -0.17, 0.62, -0.2, 0.55);
  }

  private buildMoto(): void {
    const red = toonMaterial(PALETTE.flagRed);
    const dark = toonMaterial(PALETTE.darkParts);
    const chrome = toonMaterial(0xd9d9d9);
    const glow = worldMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.sunGlow }));

    this.wheelRadius = 0.32;
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheels.push(this.add(wheelGeo, dark, 0, 0.32, -0.62));
    this.wheels.push(this.add(wheelGeo.clone(), dark, 0, 0.32, 0.72));

    this.add(new THREE.BoxGeometry(0.42, 0.34, 1.3), red, 0, 0.62, 0.02);
    this.add(new THREE.BoxGeometry(0.3, 0.2, 0.52), red, 0, 0.84, 0.3);
    this.add(new THREE.BoxGeometry(0.34, 0.12, 0.56), dark, 0, 0.8, -0.34);
    this.add(new THREE.BoxGeometry(0.07, 0.52, 0.07), chrome, 0.1, 0.55, 0.66, -0.25);
    this.add(new THREE.BoxGeometry(0.07, 0.52, 0.07), chrome, -0.1, 0.55, 0.66, -0.25);
    const barGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8);
    barGeo.rotateZ(Math.PI / 2);
    this.add(barGeo, chrome, 0, 1.04, 0.58);
    this.add(new THREE.SphereGeometry(0.07, 10, 8), glow, 0, 0.9, 0.8);
    const pipeGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8);
    pipeGeo.rotateX(Math.PI / 2);
    this.add(pipeGeo, chrome, 0.16, 0.4, -0.45);
    this.buildRider(false);
  }

  private buildPasola(): void {
    const mint = toonMaterial(PALETTE.pasolaMint);
    const dark = toonMaterial(PALETTE.darkParts);
    const cream = toonMaterial(PALETTE.laneDash);
    const chrome = toonMaterial(0xd9d9d9);
    const glow = worldMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.sunGlow }));

    this.wheelRadius = 0.26;
    const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheels.push(this.add(wheelGeo, dark, 0, 0.26, -0.55));
    this.wheels.push(this.add(wheelGeo.clone(), dark, 0, 0.26, 0.62));

    this.add(new THREE.BoxGeometry(0.34, 0.09, 0.85), mint, 0, 0.36, 0.02); // step-through floor
    this.add(new THREE.BoxGeometry(0.38, 0.4, 0.5), mint, 0, 0.55, -0.42); // tail
    this.add(new THREE.BoxGeometry(0.34, 0.12, 0.5), dark, 0, 0.82, -0.42); // seat
    const shield = new THREE.BoxGeometry(0.38, 0.62, 0.1);
    shield.rotateX(-0.18);
    this.add(shield, mint, 0, 0.72, 0.52);
    this.add(new THREE.BoxGeometry(0.3, 0.16, 0.2), cream, 0, 1.06, 0.6); // front rack
    const barGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.52, 8);
    barGeo.rotateZ(Math.PI / 2);
    this.add(barGeo, chrome, 0, 1.06, 0.5);
    this.add(new THREE.SphereGeometry(0.06, 10, 8), glow, 0, 0.92, 0.68);
    this.buildRider(true);
  }

  private buildCivic(): void {
    const red = toonMaterial(PALETTE.flagRed);
    const dark = toonMaterial(PALETTE.darkParts);
    const white = toonMaterial(PALETTE.flagWhite);
    const skin = toonMaterial(PALETTE.skin);
    const blue = toonMaterial(PALETTE.flagBlue);

    this.wheelRadius = 0.3;
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const sz of [-1.28, 1.28]) {
      for (const sx of [-0.76, 0.76]) {
        this.wheels.push(this.add(wheelGeo.clone(), dark, sx, 0.3, sz));
      }
    }

    this.add(new THREE.BoxGeometry(1.7, 0.42, 3.9), red, 0, 0.45, 0);
    this.add(new THREE.BoxGeometry(1.42, 0.36, 1.8), red, 0, 0.82, -0.15);
    this.add(new THREE.BoxGeometry(0.3, 0.03, 3.92), white, 0, 0.67, 0); // racing stripe
    const wind = new THREE.BoxGeometry(1.25, 0.32, 0.07);
    wind.rotateX(-0.22);
    this.add(wind, dark, 0, 0.84, 0.62);
    this.add(new THREE.BoxGeometry(1.55, 0.07, 0.38), red, 0, 1.0, -1.85); // el aleron
    this.add(new THREE.BoxGeometry(0.08, 0.24, 0.08), dark, -0.55, 0.84, -1.83);
    this.add(new THREE.BoxGeometry(0.08, 0.24, 0.08), dark, 0.55, 0.84, -1.83);
    // el tiguere, head out the sunroof
    this.add(new THREE.SphereGeometry(0.16, 12, 10), skin, 0, 1.12, -0.15);
    this.add(new THREE.CylinderGeometry(0.175, 0.175, 0.09, 12), blue, 0, 1.22, -0.15);
    this.add(new THREE.BoxGeometry(0.25, 0.03, 0.15), blue, 0, 1.19, 0.01);
    // underglow, que se vea
    const glowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 4.3),
      worldMaterial(
        new THREE.MeshBasicMaterial({ color: PALETTE.underglow, transparent: true, opacity: 0.5 }),
      ),
    );
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.position.y = 0.05;
    this.buildTarget.add(glowPlane);
  }

  private buildFx(scene: THREE.Scene): void {
    this.fxMats = {
      spark: worldMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.centerLine })),
      splash: worldMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.charco })),
      trail: worldMaterial(
        new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.85 }),
      ),
      dust: worldMaterial(
        new THREE.MeshBasicMaterial({ color: PALETTE.dust, transparent: true, opacity: 0.55 }),
      ),
    };
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(geo, this.fxMats.spark);
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, grow: false });
    }
  }

  // ---------------- input ----------------

  private bindInput(): void {
    const STEER_KEYS = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];
    const WHEELIE_KEYS = ['KeyW', 'Space', 'ArrowUp'];
    window.addEventListener('keydown', (e) => {
      if (STEER_KEYS.includes(e.code)) {
        this.keys.add(e.code);
        e.preventDefault();
      } else if (WHEELIE_KEYS.includes(e.code) && this.cb.isSteeringActive()) {
        this.wheelieKeys.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.wheelieKeys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.wheelieKeys.clear();
      this.endTouch();
    });

    window.addEventListener('pointerdown', (e) => {
      if (!this.cb.isSteeringActive() || this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.lastPointerX = e.clientX;
      this.touchActive = true;
      this.touchTargetX = this.x;
      this.swipeRefY = e.clientY;
      this.swipeRefT = e.timeStamp;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.touchActive || e.pointerId !== this.pointerId) return;
      const dx = e.clientX - this.lastPointerX;
      this.lastPointerX = e.clientX;
      // Screen right is world -x, so the drag flips sign here.
      this.touchTargetX = clamp(
        this.touchTargetX - (dx / window.innerWidth) * ROAD.fullWidth * CONFIG.touchSteerScale,
        -this.edgeMax,
        this.edgeMax,
      );
      // Swipe up starts the caballito, swipe down drops it
      if (e.timeStamp - this.swipeRefT > 200) {
        this.swipeRefT = e.timeStamp;
        this.swipeRefY = e.clientY;
      } else if (this.swipeRefY - e.clientY > CONFIG.swipeUpPx) {
        this.swipeRefY = e.clientY;
        this.touchWheelieHold = true;
      } else if (e.clientY - this.swipeRefY > CONFIG.swipeDownPx) {
        this.swipeRefY = e.clientY;
        this.touchWheelieHold = false;
      }
    });
    const up = (e: PointerEvent): void => {
      if (e.pointerId === this.pointerId) this.endTouch();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private endTouch(): void {
    this.touchActive = false;
    this.touchWheelieHold = false;
    this.pointerId = null;
  }

  launch(vy: number): void {
    if (this.airborne) return;
    this.airborne = true;
    this.airVy = vy;
    if (this.wheelieActive) this.endWheelie(); // the bump ends any caballito
  }

  private endWheelie(): void {
    this.wheelieActive = false;
    this.wheelieCooldownT = CONFIG.wheelieCooldownBase + this.wheelieT * CONFIG.wheelieCooldownPerSec;
    this.cb.onWheelieEnd();
  }

  applyCharco(): void {
    this.charcoT = CONFIG.charcoSec;
    this.emit('splash', 9, this.x, 0.15, 0.3, 2.6);
  }

  setShield(on: boolean): void {
    this.shielded = on;
    this.aura.visible = on;
  }

  useShield(): void {
    this.shielded = false;
    this.aura.visible = false;
    this.emit('trail', 14, this.x, 0.9, 0, 4);
  }

  setGlow(on: boolean): void {
    this.glowOn = on;
    this.glowShell.visible = on;
  }

  // ---------------- simulation ----------------

  step(dt: number, speed: number): void {
    this.time += dt;
    const veh = VEHICLES[this.vehicle];
    const latMax = CONFIG.lateralMaxSpeed * veh.latMaxMult;

    let desired = 0;
    let hasInput = false;
    if (this.touchActive) {
      desired = clamp((this.touchTargetX - this.x) * CONFIG.touchServoGain, -latMax, latMax);
      hasInput = true;
    } else {
      const axis =
        (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
        (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      if (axis !== 0) {
        desired = -axis * latMax; // screen right = world -x
        hasInput = true;
      }
    }

    // El caballito: hold to keep it up, authority decays while you do
    const held = this.wheelieKeys.size > 0 || this.touchWheelieHold;
    if (!held) this.wheelieLatch = false;
    if (
      !this.wheelieActive &&
      held &&
      !this.wheelieLatch &&
      this.wheelieCooldownT <= 0 &&
      !this.airborne &&
      !this.tumbling
    ) {
      this.wheelieActive = true;
      this.wheelieLatch = true;
      this.wheelieT = 0;
    }
    let wheelieDecay = 0;
    if (this.wheelieActive) {
      this.wheelieT += dt;
      wheelieDecay = Math.min(1, this.wheelieT / CONFIG.wheelieMaxSec);
      if (!held || this.wheelieT >= CONFIG.wheelieMaxSec) this.endWheelie();
    }
    if (this.wheelieCooldownT > 0) this.wheelieCooldownT -= dt;

    let authority = 1;
    if (this.wheelieActive) {
      authority *=
        this.vehicle === 'civic'
          ? CONFIG.driftSteerFactor
          : lerp(CONFIG.wheelieSteerFactorStart, CONFIG.wheelieSteerFactorEnd, wheelieDecay);
    }
    if (this.charcoT > 0) {
      authority *= CONFIG.charcoSteerFactor;
      this.charcoT -= dt;
    }

    if (hasInput) {
      const maxDv = CONFIG.lateralAccel * veh.accelMult * authority * dt;
      this.velX += clamp(desired * authority - this.velX, -maxDv, maxDv);
    } else {
      this.velX *= Math.exp(-CONFIG.lateralDamping * veh.dampMult * dt);
    }
    this.x += this.velX * dt;

    if (this.scrapeCooldown > 0) this.scrapeCooldown -= dt;
    const over = this.x > this.edgeMax ? 1 : this.x < -this.edgeMax ? -1 : 0;
    if (over !== 0) {
      this.x = over * this.edgeMax;
      if (Math.abs(this.velX) > 1.2 && this.scrapeCooldown <= 0) {
        this.scrapeCooldown = CONFIG.scrapeCooldownSec;
        this.emit('spark', 6, this.x + over * 0.5, 0.3, 0, 3, -over);
        this.cb.onScrape();
      }
      this.velX = 0;
    }

    // Airtime
    if (this.airborne) {
      this.airY += this.airVy * dt;
      this.airVy -= CONFIG.jumpGravity * dt;
      if (this.airY <= 0) {
        this.airY = 0;
        this.airborne = false;
        this.cb.onLand();
      }
    }

    // Tire dust when carving hard, and constantly while sideways
    const drifting = this.wheelieActive && this.vehicle === 'civic';
    if (!this.airborne && (Math.abs(this.velX) > CONFIG.dustMinVelX || drifting)) {
      this.dustAcc += dt * (drifting ? 1.7 : 1);
      while (this.dustAcc > 0.055) {
        this.dustAcc -= 0.055;
        this.emit('dust', 1, this.x - Math.sign(this.velX || 1) * 0.3, 0.12, drifting ? -1.4 : -0.6, 1.2);
      }
    }

    // Cafecito trail
    if (this.glowOn) {
      this.trailAcc += dt;
      while (this.trailAcc > 0.04) {
        this.trailAcc -= 0.04;
        this.emit('trail', 1, this.x + (Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.4, -0.7, 1.2);
      }
      this.glowMat.opacity = 0.16 + 0.08 * (1 + Math.sin(this.time * 12)) * 0.5;
    }
    if (this.aura.visible) {
      this.aura.rotation.z += dt * 1.5;
      this.aura.position.y = 0.5 + Math.sin(this.time * 4) * 0.08;
    }

    // Visuals: lean, wheelie pitch (bikes) or drift yaw (civic), wobble deep in a hold
    const wobble =
      this.wheelieActive && this.vehicle !== 'civic'
        ? Math.sin(this.time * 13) * CONFIG.wheelieWobble * wheelieDecay
        : 0;
    const leanTarget = -this.velXNorm * CONFIG.steerLeanMaxDeg * DEG * veh.leanMult;
    this.leanVis += (leanTarget - this.leanVis) * Math.min(1, CONFIG.leanResponse * dt);
    this.leanGroup.rotation.z = this.leanVis + wobble;
    const wheelieTarget = this.wheelieActive && this.vehicle !== 'civic' ? this.wheelieAngleMax : 0;
    this.wheelieVis += (wheelieTarget - this.wheelieVis) * Math.min(1, 11 * dt);
    this.leanGroup.rotation.x = -this.wheelieVis;
    this.leanGroup.position.y = Math.sin(this.wheelieVis) * this.wheelieLift;
    if (Math.abs(this.velX) > 0.6) this.driftSign = this.velX > 0 ? 1 : -1;
    const driftTarget = drifting ? this.driftSign * CONFIG.driftYaw : 0;
    this.driftYawVis += (driftTarget - this.driftYawVis) * Math.min(1, 9 * dt);
    this.root.rotation.y = this.velXNorm * 0.16 + this.driftYawVis; // nose into the carve, tail out in the derrape
    this.root.position.x = this.x;
    this.root.position.y = this.airY;

    const spin = (speed / this.wheelRadius) * dt;
    for (let i = 0; i < this.wheels.length; i++) {
      const isFront = this.vehicle === 'civic' ? i >= 2 : i === 1;
      this.wheels[i].rotation.x += isFront && this.wheelieActive ? spin * 0.35 : spin;
    }
  }

  private emit(
    kind: FxKind,
    count: number,
    x: number,
    y: number,
    z: number,
    power: number,
    dirX = 0,
  ): void {
    let n = 0;
    for (const p of this.particles) {
      if (p.life > 0) continue;
      p.life = 0.22 + Math.random() * 0.2;
      p.grow = kind === 'dust';
      p.mesh.material = this.fxMats[kind];
      p.mesh.visible = true;
      p.mesh.scale.setScalar(1);
      p.mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.25, z + (Math.random() - 0.5) * 0.6);
      const spread = kind === 'trail' ? 0.5 : 1;
      p.vx = (dirX !== 0 ? dirX * (1.5 + Math.random() * 2.5) : (Math.random() - 0.5) * 2 * spread) * (power / 3);
      p.vy = (kind === 'splash' ? 2.2 : kind === 'dust' ? 0.8 : 1.4) + Math.random() * (kind === 'dust' ? 0.6 : power);
      p.vz = kind === 'trail' ? -(4 + Math.random() * 3) : -(2 + Math.random() * power);
      if (++n >= count) break;
    }
  }

  updateFx(dt: number): void {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.grow) {
        p.mesh.scale.multiplyScalar(1 + 2.6 * dt);
        p.vy -= 2 * dt;
      } else {
        p.vy -= 18 * dt;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.life <= 0 || p.mesh.position.y < 0) {
        p.life = 0;
        p.mesh.visible = false;
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
    this.wheelieActive = false;
    this.airborne = false;
    this.setGlow(false);
    this.stars.visible = true;
  }

  // Comic tumble: exaggerated gravity, a bounce, then settle flat, with the
  // cartoon stars doing their orbit. No blood, ever.
  updateTumble(dt: number): void {
    if (!this.tumbling) return;
    this.stars.rotation.y += dt * 5;
    this.stars.position.y = 1.0 + Math.sin(this.time) * 0.05;
    this.time += dt;
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
    this.wheelieVis = 0;
    this.touchTargetX = START_X;
    this.endTouch();
    this.wheelieKeys.clear();
    this.tumbling = false;
    this.settling = false;
    this.scrapeCooldown = 0;
    this.wheelieActive = false;
    this.wheelieT = 0;
    this.wheelieCooldownT = 0;
    this.wheelieLatch = false;
    this.driftYawVis = 0;
    this.driftSign = 1;
    this.airborne = false;
    this.airY = 0;
    this.airVy = 0;
    this.charcoT = 0;
    this.dustAcc = 0;
    this.setShield(false);
    this.setGlow(false);
    this.stars.visible = false;
    this.root.position.set(START_X, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.leanGroup.rotation.set(0, 0, 0);
    this.leanGroup.position.y = 0;
  }
}
