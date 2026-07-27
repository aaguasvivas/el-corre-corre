// EL CORRE CORRE
// CONFIG is the ONLY tuning surface. Every feel-critical number lives here.
// Comments marked FEEL explain what turning the knob changes in the hands.

export const PALETTE = {
  skyTop: 0x6ec6e6,
  skyHorizon: 0xffd9a0, // also the fog color: the road fades into peach
  sunGlow: 0xfff3c4,
  seaNear: 0x17a2b8,
  seaDeep: 0x0e7490,
  asphalt: 0x3e3a38,
  asphaltShoulder: 0x4a4442,
  centerLine: 0xf4c430,
  laneDash: 0xf2e9dc,
  sidewalk: 0xd9c7a7,
  groundFar: 0xc7ae8c, // DECISION: warm dirt beyond the far sidewalk until Phase 3 facades arrive
  buildingPastels: [0xa8e6cf, 0xffd3b6, 0xff8b94, 0xffeaa7, 0xb3d9ff, 0xcdb4db],
  colmadoRed: 0xe63946,
  colmadoTeal: 0x2a9d8f,
  palmTrunk: 0x8d6e63,
  palmFronds: 0x43a047,
  platano: 0x7cb342,
  flagBlue: 0x002d62,
  flagRed: 0xce1126,
  flagWhite: 0xffffff,
  carPaints: [0xd6ccc2, 0xb3d9ff, 0xf2e9dc, 0xa8e6cf, 0xff8b94, 0xffeaa7, 0xcdb4db],
  civicPaints: [0xe63946, 0x2a9d8f, 0xf4c430], // loud, que se oiga
  guaguaYellow: 0xf4c430,
  camionOlive: 0x708238,
  darkParts: 0x2a2624,
  skin: 0x8d5524,
  charco: 0x4db6c9,
  gold: 0xffd54f,
  hazardOrange: 0xff8c42,
  underglow: 0x2ee6d6,
  // Phase 3: el mundo
  seawallCream: 0xefe6d4,
  mountainHaze: 0xc9a48e,
  dogTan: 0xc8a06a,
  poleWood: 0x6e5d4e,
  wire: 0x1f1b19,
  obeliscoCream: 0xf5ecd9,
} as const;

export const CONFIG = {
  // Simulation
  fixedDt: 1 / 120, // fixed sim step; feel is framerate-independent
  maxFrameDt: 0.1, // clamp huge frame gaps (tab switches) so nothing teleports

  // Forward motion. Tuned up after the Phase 1 feel test ("difficulty is low").
  baseSpeed: 18,
  maxSpeed: 42,
  speedRampPerSec: 0.085, // FEEL: how fast a run escalates; linear m/s gained per second

  // Steering. FEEL: drifty-smooth, not twitchy. Signed off in the Phase 1 test.
  lateralMaxSpeed: 9, // FEEL: top carving speed across the road
  lateralAccel: 38, // FEEL: how fast you reach carving speed; lower = driftier
  lateralDamping: 6.5, // FEEL: glide after releasing input; higher = stops sooner
  steerLeanMaxDeg: 22, // FEEL: rider lean at full carve
  cameraRollMaxDeg: 4, // FEEL: camera roll with carve; too high = nausea
  leanResponse: 9, // FEEL: how quickly the visual lean catches up to steering
  touchSteerScale: 1.15, // FEEL: a full-screen drag moves you this many road widths
  touchServoGain: 9, // FEEL: how hard the bike chases your finger target
  playerHalfWidth: 0.45, // visual half width, used for edge clamping

  // Road: 4 lanes, +x = oncoming side (the sea side; DR drives on the right)
  laneWidth: 3.4,
  lanesSame: 2,
  lanesOncoming: 2,
  shoulderWidth: 1.6,

  // Camera
  camBack: 6.2,
  camUp: 2.8,
  camLookAhead: 8,
  fovMobile: 68,
  fovDesktop: 60,
  camDamping: 6, // FEEL: camera lag chasing the player laterally
  camXFollow: 0.72, // FEEL: fraction of player x the camera follows; <1 keeps edges in view
  fovSpeedKick: 6, // reserved for the Phase 5 juice pass

  // Atmosphere
  fogNear: 60,
  fogFar: 140,

  // Spawning. Density bumped after the Phase 1 feel test.
  spawnAhead: 150,
  despawnBehind: 15,
  telegraphMinSec: 1.5, // sacred: min seconds between a threat appearing and reaching you
  trafficDensityStart: 0.45,
  trafficDensityMax: 1.0,
  densityRampSec: 110,
  gentleStartSec: 12,
  spawnsPerSecAtFull: 1.3, // FEEL: filler spawn attempts per second at full density
  gentleSpawnFactor: 0.55, // FEEL: spawn rate multiplier during the gentle window
  oncomingUnlockSec: 6, // DECISION: no oncoming traffic in the very first seconds of a run
  trafficMaxActive: 20, // FEEL: hard cap of vehicles on the road at once
  sameLaneGapM: 16, // min same-lane spacing at spawn; keeps convoys threadable
  antiWallWindowM: 14, // z window in which all 4 lanes must never be occupied at once
  fillerPatternShare: 0.4, // FEEL: filler singles rate multiplier once patterns are running

  // Wave patterns
  patternIntervalMin: 3.6, // FEEL: seconds between authored waves (scaled by density)
  patternIntervalMax: 6.8,

  // Traffic speeds (m/s) per archetype: [min, max]
  vehicleSpeeds: {
    sedan: [9, 14],
    guagua: [8, 11],
    camion: [8, 10],
    civic: [15, 17], // fast enough to be a rolling chicane, still slower than you
    motoconcho: [10, 13],
  },
  // FEEL: relative spawn weights for filler traffic
  vehicleWeights: { sedan: 32, motoconcho: 22, guagua: 16, camion: 12, civic: 18 },
  civicUnlockSec: 22,
  bigVehicleUnlockSec: 16, // guaguas y camiones enter after the opening moments

  // Hitboxes
  vehicleHitboxScale: 0.9, // FEEL: forgiveness; the killer box is smaller than the visual box
  playerRadius: 0.5, // FEEL: player collision circle; smaller = more forgiving

  // Near-miss and combo
  nearMissRadius: 1.2,
  nearMissPoints: 25,
  comboDecaySec: 4,

  // Contra via. The signature: riding the oncoming lanes doubles everything.
  contraViaMultiplier: 2,
  contraViaMinX: 0.25, // FEEL: how far past the center line before it counts

  // Wheelie (el caballito)
  wheelieDurationSec: 0.8,
  wheelieCooldownSec: 2.5,
  wheelieSteerFactor: 0.6, // steering authority while the front wheel is up
  wheeliePointsPerSec: 5,
  swipeUpPx: 48, // FEEL: upward swipe distance that triggers a wheelie

  // Airtime
  airtimePointsPerSec: 15,
  policiaLaunchVy: 0.16, // FEEL: launch vy = forward speed * this
  jumpGravity: 20, // FEEL: heavier = snappier hops

  // Obstacles
  potholeSpeedLoss: 0.3,
  hoyoRecoverSec: 1.4,
  charcoSteerFactor: 0.5,
  charcoSec: 0.4,
  scrapeSpeedLoss: 0.2, // FEEL: fraction of speed lost after grinding the edge
  scrapeSlowSec: 1.0,
  scrapeCooldownSec: 0.35,
  // Obstacle cadence: [minSec, maxSec] between spawns, once unlocked
  hoyoEvery: [8, 14],
  policiaEvery: [14, 24],
  charcoEvery: [16, 26],
  cartEvery: [18, 30],
  hoyoUnlockSec: 18,
  policiaUnlockSec: 14,
  charcoUnlockSec: 24,
  cartUnlockSec: 16,

  // Pickups
  platanoPoints: 10,
  platanoRadius: 0.95, // FEEL: collection reach; generous feels better
  platanoYTolerance: 0.55, // arc platanos need a jump to grab
  powerupEvery: [18, 30],
  powerupUnlockSec: 20,
  cafecitoSec: 5,
  cafecitoBoost: 1.35, // FEEL: cafecito speed multiplier
  imanSec: 8,
  imanRadius: 6,
  imanPullSpeed: 15,
  shieldGraceSec: 0.9, // brief invulnerability after the Bendicion absorbs a hit

  // Crash and restart. FEEL: this loop is the whole game
  crashSlowmoSec: 0.5, // real seconds of slow motion before the card appears
  crashTimeScale: 0.2, // sim speed during the slow-mo
  restartDebounceSec: 0.25, // ignore taps this long after the card shows

  // Juice (minimal here; the real pass is Phase 5)
  shakeHoyo: 0.22, // FEEL: camera jolt when you eat a pothole
  shakeShield: 0.3,

  // Phase 3: el Malecon
  // DECISION: the S-curve is a visual bend field applied in the vertex shader.
  // Gameplay space stays straight (lateral x relative to the road), so spawn
  // validation and collisions remain exact under any curve. The road breathes,
  // the math never lies.
  curveAmp1: 3.2, // FEEL: main S-curve swing in meters; breathe, never slalom
  curveLen1: 240, // FEEL: meters per main curve cycle
  curveAmp2: 1.8, // FEEL: secondary wave layered in for variety
  curveLen2: 111,
  worldDrop: 0.00013, // FEEL: how much the distant road curls below the horizon
  beltLen: 120, // scenery recycles in two alternating belts of this length
  obeliscoEveryM: 800,
  viralataEvery: [24, 44], // FEEL: seconds between street-dog cameos
} as const;

// Derived road geometry, shared everywhere
export const ROAD = {
  halfRoad: ((CONFIG.lanesSame + CONFIG.lanesOncoming) * CONFIG.laneWidth) / 2, // 6.8
  fullWidth:
    (CONFIG.lanesSame + CONFIG.lanesOncoming) * CONFIG.laneWidth + CONFIG.shoulderWidth * 2, // 16.8
  edgeX:
    ((CONFIG.lanesSame + CONFIG.lanesOncoming) * CONFIG.laneWidth) / 2 + CONFIG.shoulderWidth, // 8.4
  // Lane centers: index 0-1 yours (screen right), 2-3 oncoming (sea side, screen left)
  laneCenters: [-5.1, -1.7, 1.7, 5.1] as const,
  shoulderCenters: [-7.5, 7.5] as const, // parked guaguas and vendor carts live here
} as const;
