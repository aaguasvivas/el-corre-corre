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
  darkParts: 0x2a2624,
  skin: 0x8d5524,
} as const;

export const CONFIG = {
  // Simulation
  fixedDt: 1 / 120, // fixed sim step; feel is framerate-independent
  maxFrameDt: 0.1, // clamp huge frame gaps (tab switches) so nothing teleports

  // Forward motion
  baseSpeed: 18,
  maxSpeed: 42,
  speedRampPerSec: 0.07, // FEEL: how fast a run escalates; linear m/s gained per second

  // Steering. FEEL: drifty-smooth, not twitchy
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

  // Spawning
  spawnAhead: 150,
  despawnBehind: 15,
  telegraphMinSec: 1.5, // sacred: min seconds between a threat appearing and reaching you
  trafficDensityStart: 0.35,
  trafficDensityMax: 1.0,
  densityRampSec: 120,
  gentleStartSec: 15,
  spawnsPerSecAtFull: 1.05, // FEEL: spawn attempts per second once the density ramp completes
  gentleSpawnFactor: 0.55, // FEEL: spawn rate multiplier during the gentle window
  oncomingUnlockSec: 6, // DECISION: no oncoming traffic in the very first seconds of a run
  trafficMaxActive: 16, // FEEL: hard cap of cars on the road at once
  sameLaneGapM: 16, // min same-lane spacing at spawn; keeps convoys threadable
  antiWallWindowM: 14, // z window in which all 4 lanes must never be occupied at once

  // Traffic speeds (m/s)
  sameDirSpeedMin: 9,
  sameDirSpeedMax: 13, // always slower than you: overtaking is the game
  oncomingSpeedMin: 10,
  oncomingSpeedMax: 14,

  // Generic sedan dims
  carWidth: 1.9,
  carLength: 4.4,
  vehicleHitboxScale: 0.9, // FEEL: forgiveness; the killer box is smaller than the visual box

  // Mechanics
  playerRadius: 0.5, // FEEL: player collision circle; smaller = more forgiving
  nearMissRadius: 1.2,
  comboDecaySec: 4,
  wheelieDurationSec: 0.8,
  wheelieCooldownSec: 2.5,
  potholeSpeedLoss: 0.3,
  scrapeSpeedLoss: 0.2, // FEEL: fraction of speed lost after grinding the edge
  scrapeSlowSec: 1.0,
  scrapeCooldownSec: 0.35,
  contraViaMultiplier: 2,

  // Crash and restart. FEEL: this loop is the whole game
  crashSlowmoSec: 0.5, // real seconds of slow motion before the card appears
  crashTimeScale: 0.2, // sim speed during the slow-mo
  restartDebounceSec: 0.25, // ignore taps this long after the card shows

  // Power-ups
  cafecitoSec: 5,
  imanSec: 8,
  imanRadius: 6,
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
} as const;
