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
  // Traffic paint. DECISION: hazards get their own saturated, mid-value set,
  // kept out of the pale band the building pastels live in, so a car pops off
  // a facade and off the dark asphalt in one glance. The one pale body is the
  // brief's beige carro publico, which carries a roof sign, a primer door and
  // lit lamps to read. Sky blue stays reserved for charcos and yellow-black
  // stripes for policias acostados: no vehicle wears them.
  publicoBeige: 0xd6ccc2,
  publicoDoors: [0xb5651d, 0x7a8c5b, 0x9aa0a6], // the mismatched door, in primer
  sedanPaints: [0xe63946, 0x2a9d8f, 0xff8c42, 0x3a6ea5, 0x9aa3ad],
  jeepetaPaints: [0x9aa3ad, 0xc1121f, 0x2a9d8f, 0x3a6ea5],
  motoPaints: [0xffd23f, 0xe63946, 0xff8c42, 0x2a9d8f],
  vestHiVis: 0xd4ff3a, // motoconchistas' chaleco; the player's is hazardOrange
  shirts: [0xe63946, 0xf4c430, 0x2a9d8f, 0xffffff],
  skinTones: [0x8d5524, 0xc68642, 0x5c3a1e, 0xa0673a],
  glass: 0x34414f, // windows: dark, a touch cool, so heads behind them read
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
  dogTan: 0xc8a06a,
  poleWood: 0x6e5d4e,
  wire: 0x1f1b19,
  obeliscoCream: 0xf5ecd9,
  // Phase 5
  pasolaMint: 0x7fd8c9,
  dust: 0xd9c7a7,
} as const;

export type VehicleId = 'pasola' | 'motor' | 'civic';

export interface VehicleDef {
  name: string;
  tagline: string; // DECISION: taglines stay in Spanish in both languages; they are flavor
  speedCap: number;
  speedMult: number;
  scoreMult: number;
  hitbox: number; // multiplier on the collision circle and edge width
  accelMult: number;
  dampMult: number;
  latMaxMult: number;
  leanMult: number;
  stats: { vel: number; man: number; agu: number }; // 1..5 display bars
}

// Stat gaps widened after the second feel test ("should be more noticeable").
export const VEHICLES: Record<VehicleId, VehicleDef> = {
  pasola: {
    name: 'LA PASOLA',
    tagline: 'Chiquita pero cumplidora.',
    speedCap: 34,
    speedMult: 1,
    scoreMult: 1,
    hitbox: 0.7,
    accelMult: 1.3,
    dampMult: 1.05,
    latMaxMult: 1.15,
    leanMult: 1.1,
    stats: { vel: 2, man: 5, agu: 3 },
  },
  motor: {
    name: 'EL MOTOR',
    tagline: 'El clásico del barrio.',
    speedCap: 42,
    speedMult: 1,
    scoreMult: 1,
    hitbox: 1,
    accelMult: 1,
    dampMult: 1,
    latMaxMult: 1,
    leanMult: 1,
    stats: { vel: 3, man: 3, agu: 3 },
  },
  civic: {
    name: 'EL CIVIC TUNEAO',
    tagline: 'Que se oiga.',
    speedCap: 42,
    speedMult: 1.22,
    scoreMult: 1.22,
    hitbox: 1.4,
    accelMult: 0.7,
    dampMult: 0.85,
    latMaxMult: 0.9,
    leanMult: 0.3,
    stats: { vel: 5, man: 2, agu: 4 },
  },
} as const;

// Las Pinturas: the platano wallet spends. Index 0 is the factory paint,
// always owned. Names stay Spanish in both languages, like the power-ups.
// Ownership is stored by index, so prices can move without touching saves.
// FEEL: prices from tools/economy-lab.ts (-- career: fresh saves, a mix of
// riding styles, Los Mandaos on). A median player earns about 55 plátanos a
// run from the road plus the mandao rewards, which front-load (both tutorial
// sets land in the first three runs): the first paint comes in run 3, the
// next two about 5 and 7 runs apart, and Oro Fino some 30 runs after that,
// a real flex. Re-run the lab after touching plátano placement, survival or
// any mandao reward.
export interface Pintura {
  name: string;
  hex: number;
  price: number;
}

export const PINTURAS: Record<VehicleId, ReadonlyArray<Pintura>> = {
  motor: [
    { name: 'Rojo del Barrio', hex: 0xce1126, price: 0 },
    { name: 'Negro Tinto', hex: 0x2b2f36, price: 500 },
    { name: 'Verde Colmado', hex: 0x27b598, price: 800 }, // shifted off the rider's shirt teal
    { name: 'Azul Marino', hex: 0x002d62, price: 1100 },
    { name: 'Oro Fino', hex: 0xf4c430, price: 3000 },
  ],
  pasola: [
    { name: 'Menta de Fábrica', hex: 0x7fd8c9, price: 0 },
    { name: 'Rosa Chicle', hex: 0xff8b94, price: 500 },
    { name: 'Cielo', hex: 0xb3d9ff, price: 800 },
    { name: 'Lila', hex: 0xcdb4db, price: 1100 },
    { name: 'Oro Fino', hex: 0xf4c430, price: 3000 },
  ],
  civic: [
    { name: 'Rojo Que Se Oiga', hex: 0xce1126, price: 0 },
    { name: 'Morado Neón', hex: 0x9d4edd, price: 500 },
    { name: 'Turquesa', hex: 0x17a2b8, price: 800 },
    { name: 'Negro Mate', hex: 0x24242a, price: 1100 },
    { name: 'Oro Fino', hex: 0xf4c430, price: 3000 },
  ],
} as const;

export const CONFIG = {
  // Simulation
  // Max sim step (1/120 s). Every rendered frame advances exactly its real
  // dt, split into equal substeps no longer than this, so feel stays
  // framerate-independent without the judder of a fixed accumulator.
  fixedDt: 1 / 120,
  maxFrameDt: 0.1, // clamp huge frame gaps (tab switches) so nothing teleports

  // Forward motion. Phone feel test: "start off slow but pick up speed",
  // so the floor dropped and the ramp steepened again. Speed IS the fun.
  baseSpeed: 16,
  maxSpeed: 42,
  speedRampPerSec: 0.16, // FEEL: how fast a run escalates; linear m/s gained per second

  // Steering. FEEL: drifty-smooth, not twitchy. Signed off in the Phase 1 test.
  lateralMaxSpeed: 9, // FEEL: top carving speed across the road
  lateralAccel: 42, // FEEL: how fast you reach carving speed; lower = driftier
  lateralDamping: 6.5, // FEEL: glide after releasing input; higher = stops sooner
  steerLeanMaxDeg: 22, // FEEL: rider lean at full carve
  cameraRollMaxDeg: 4, // FEEL: camera roll with carve; too high = nausea
  leanResponse: 9, // FEEL: how quickly the visual lean catches up to steering
  touchSteerScale: 1.3, // FEEL: a full-screen drag moves you this many road widths
  touchServoGain: 13, // FEEL: how hard the bike chases your finger target; phone test said "almost there"
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
  camLookY: 1.1, // FEEL: height the camera aims at, landscape and desktop
  fovMobile: 68,
  fovDesktop: 60,
  // Portrait framing (a phone held upright). The landscape camera spent 41%
  // of a tall frame on sky and squeezed the whole road into a thin band.
  camUpPortrait: 3.6, // FEEL: camera height in portrait; higher = more road ahead, less sky
  camLookYPortrait: -0.2, // FEEL: aim point in portrait; lower = steeper view, the ride sits higher above the pedals
  camXFollowPortrait: 0.9, // FEEL: in a tall frame the ride must stay on screen at the kerb
  camDamping: 6, // FEEL: camera lag chasing the player laterally
  camXFollow: 0.72, // FEEL: fraction of player x the camera follows; <1 keeps edges in view
  fovSpeedKick: 6, // FEEL: extra FOV at top speed; speed you can feel in your stomach
  fovCafecito: 3, // FEEL: extra kick while the cafecito burns
  fovGasKick: 5, // FEEL: the stomach drop when you floor it, on top of the speed kick
  fovBrakeDip: 2, // FEEL: the frame tightens a little when you brake
  camGasPullBack: 0.45, // FEEL: metres the bike surges away from the lens a fondo
  // The title shows the ride between the ride picker and the paint tray. On
  // a short phone the chase framing put the Civic's tail (and a bike's rear
  // wheel) under the tray, so on the title the camera pulls back just enough
  // for the ride's rear edge to clear the tray; a tall phone needs little.
  // DECISION: solved from the camera and the tray's real position, not a
  // per-phone constant, so it holds at every size.
  titleRideGapPx: 6, // FEEL: clear space between the title ride and the paint tray
  titleCamPullMaxM: 2.5, // the most the title camera may pull back (m)
  titleCamEase: 3, // FEEL: per second; the push in when a run starts, the ease out on the menu

  // Atmosphere
  fogNear: 60,
  fogFar: 140,
  // FEEL: how far each tramo's haze reaches. SACRED floor: none of these may
  // sit below fogFar, or the reaction window the spawner promises sinks into
  // the fog (tested in config.test.ts).
  tramoFogFar: { malecon: 140, zona: 140, campo: 156 },
  seaFogFar: 400, // FEEL: how far out the Caribbean stays turquoise before the haze takes it
  rimStrength: 0.5, // FEEL: golden silhouette light on everything; 0 kills it
  // FEEL: overall scene brightness. three r155+ lights are physical (the
  // Lambert term divides by pi), and the old intensities rendered every lit
  // face at about 60% of its palette hex. At 1.5 a camera-facing face lands
  // near its hex and a sun-facing one a touch warmer. Scales sun, fill, sky.
  lightExposure: 1.5,
  // FEEL: shadowless camera-side fill. Lifts rider backs, car rears and
  // oncoming fronts out of the darkest toon step without flattening form.
  fillLight: 0.27,
  cintaShowM: 240, // FEEL: how far ahead La Cinta's arch starts rising out of the haze
  // Hazard fog. Traffic, obstacles and pickups fade on their own curve,
  // pow(smoothstep(fogNear, hazardFogFarM, depth), hazardFogPow): full color
  // deep into the haze, gone only at the spawn line, so a car reads before the
  // facade behind it does. The vitest check holds the telegraph rule on it.
  hazardFogFarM: 150, // FEEL: where hazards vanish; keep at or under spawnAhead or cars pop in
  hazardFogPow: 5, // FEEL: higher = hazards hold full color longer, then fade fast near the end
  lampGlow: 0.6, // FEEL: how hard traffic head and tail lamps glow through the golden hour

  // Spawning. Pressure raised after the Phase 4 feel test.
  spawnAhead: 150,
  despawnBehind: 15,
  telegraphMinSec: 1.5, // sacred: min seconds between a threat appearing and reaching you
  // Phone feel round 2: "starts chill so you can test the controls, then it
  // gets LIT". Ten gentle seconds, real density by about a minute, and a
  // full road at the top where finding space is the skill.
  trafficDensityStart: 0.4,
  trafficDensityMax: 1.0,
  densityRampSec: 50, // FEEL: seconds until the road is fully awake
  gentleStartSec: 10,
  spawnsPerSecAtFull: 2.35, // FEEL: filler spawn attempts per second at full density
  gentleSpawnFactor: 0.55, // FEEL: spawn rate multiplier during the gentle window
  oncomingUnlockSec: 6, // DECISION: no oncoming traffic in the very first seconds of a run
  trafficMaxActive: 33, // FEEL: hard cap of vehicles on the road at once
  oncomingShare: 0.5, // FEEL: fraction of filler spawns that come at you
  // Contra via must be RISKIER than your own lane, not emptier. While you ride
  // the wrong way, oncoming filler aims for the lane you are actually in.
  cvTargetBias: 0.65, // FEEL: chance a CV-time oncoming spawn picks your lane
  antiWallWindowM: 14, // window (converted to arrival time) for the corridor check
  // FEEL / SACRED: the brief's rule. Never commit a spawn unless a continuous
  // gap of this many player widths survives across the whole road, shoulders
  // included. Lower it and the game starts walling you; raise it and traffic
  // thins out. Measure bot survival after changing it.
  minCorridorMult: 1.7,
  // FEEL: how far off its lane center a car may ride. Every car still stays
  // inside its own lane (the cap shrinks for wide types), but at 0.7 the
  // lane lines stop being a safe place to park: a car hugging its line
  // reaches a rider parked on it. The audit bot measured the old 0.4.
  laneJitterM: 0.7,
  laneDriftM: 0.3, // FEEL: max slow lateral sway (Dominican lane discipline), inside the same lane budget
  // FEEL: share of motoconchos that ride the dashed lines instead of a lane.
  // They lane-split in the DR, and it takes away the last safe parking spot.
  motoLineShare: 0.5,
  // FEEL: chance a car spawning in a lane beside a rider parked between two
  // lanes (a dashed line or the seam) rides the edge of its lane nearest
  // the rider. Between the lanes must never be safer than in one.
  lineCampLean: 0.5,
  fillerPatternShare: 0.4, // FEEL: filler singles rate multiplier once patterns are running
  // El rebase: every so often a vehicle swings onto the center seam to
  // overtake, the most Dominican move on the road and the reason parking on
  // the yellow line is not a free ride. Phone test found the seam exploit.
  overtakeEvery: [4, 8], // FEEL: seconds between overtake swings at full density
  overtakeSec: 2.6, // FEEL: how long the swing holds the seam
  overtakeUnlockSec: 12, // no seam pressure during the gentle open
  // SACRED: a swing only starts on a car that will reach you in this window
  // (seconds), picked by arrival time rather than distance. The swing peaks
  // at overtakeSec / 2, so the car is still on the seam when it arrives, and
  // it has been visibly moving (with its bocinazo) for at least the minimum.
  rebaseLeadSec: [1.7, 2.2],
  // FEEL: a rider parked on the seam (|x| under seamBandM) gets swings this
  // much more often. The seam belongs to whoever is overtaking, so it must
  // never be safer than a real lane.
  seamBandM: 0.9,
  seamRebaseMult: 0.5,
  // FEEL: a same-direction car catching a slower rider (brake, hoyo, scrape)
  // matches the rider's speed minus this and leans on the horn instead of
  // rear-ending an off-screen rider.
  riderLeadMarginMps: 0.5,
  // FEEL: civics only join the filler once the rider closes on them at least
  // this fast, so they never idle in the fog early or arrive in a blink.
  civicMinClosing: 7,
  convoyGapM: 6, // min bumper gap a convoy spawn may keep; car-following holds it after
  // Shoulder anti-camping: ride the shoulder this long and a cart or a parked
  // guagua is sent onto it, far enough out to read. It never kills on its
  // own, it only takes the safe line away.
  shoulderCampSec: 2.5, // FEEL: seconds on a shoulder before the road answers
  shoulderCampCooldown: [5, 8], // FEEL: seconds between two answers

  // The opening: gentle means no threats, not no content. A plátano weave
  // from the start line pays out inside 2 s, and three slow cars are seeded
  // on your side so the first passes land around 5, 9 and 14 s.
  openingSec: 20, // FEEL: early same-direction filler closes at openingClosing so the stream keeps coming
  openingClosing: [7, 9], // m/s the rider closes on early same-direction filler
  // [type, lane, z, speed]: seeded at the start of every run on lane centers
  openingCars: [
    ['guagua', 1, 34, 9],
    ['sedan', 0, 58, 10],
    ['motoconcho', 1, 100, 10.5],
  ],
  openingTrailCount: 10, // plátanos in the opening weave
  openingTrailStartZ: 32, // FEEL: the first one is about 2 s out
  openingTrailSpacingM: 3.2,
  openingTrailAmpM: 1.7, // FEEL: how far the weave swings toward lane 0 and back

  // Escalation rides the distance tiers the HUD already shows
  // (distMultTiers), so "it pays more" reads as "it got harder". spawn
  // multiplies the filler rate, pattern the gaps between waves, rebase the
  // gaps between seam swings, and gapM is the minimum spacing between cars
  // sharing a line, so the extra rate actually lands. Tested for walls.
  escalation: [
    { atM: 0, spawn: 1, pattern: 1, rebase: 1, gapM: 16 },
    { atM: 500, spawn: 1.15, pattern: 0.88, rebase: 0.85, gapM: 14 },
    { atM: 1200, spawn: 1.3, pattern: 0.76, rebase: 0.7, gapM: 13 },
    { atM: 2200, spawn: 1.45, pattern: 0.66, rebase: 0.6, gapM: 12 },
  ],

  // Wave patterns
  patternIntervalMin: 2.2, // FEEL: seconds between authored waves (scaled by density)
  patternIntervalMax: 3.8,
  // The wave director: a run is a string of sets. Each set builds with
  // regular patterns, peaks with one set piece from the current escalation
  // tier (and tramo), then pays off with a breather. Pressure, then rest.
  setBuildPatterns: 2, // FEEL: regular patterns before each set piece
  setPeakSec: 4, // FEEL: seconds the set piece owns before the breather
  setBreatherSec: 4.5, // FEEL: seconds of breather before the next build
  setPieceUnlockSec: 20, // DECISION: before this only la guagua lenta may peak; a new player learns first
  breatherDip: 0.4, // FEEL: filler rate drops this fraction after a breather...
  breatherRecoverSec: 8, // ...and climbs back over this many seconds (the sawtooth)
  breatherPowerupChance: 0.35, // FEEL: chance a breather also hands out a power-up
  guaguaLentaMps: 6, // FEEL: la guagua lenta crawls; the plátano line runs past it on the seam
  taponMps: 7, // FEEL: el tapón's speed
  taponSpacingM: 11,
  camionPlatanosMps: 8,
  camionDropEveryM: 6, // FEEL: el camión drops a plátano every this many meters it travels
  camionDropZ: [28, 135], // m: it drops only while this far ahead, so no drop lands on your nose
  horaPicoSec: 8, // FEEL: hora pico lasts this long...
  horaPicoSpawnMult: 1.4, // ...at this filler rate

  // Traffic speeds (m/s) per archetype: [min, max]
  vehicleSpeeds: {
    sedan: [9, 14],
    guagua: [8, 11],
    camion: [8, 10],
    civic: [15, 17], // a rolling chicane; slower than you by civicUnlockSec (the ramp covers it, tested)
    motoconcho: [10, 14],
  },
  // FEEL: relative spawn weights for filler traffic
  vehicleWeights: { sedan: 32, motoconcho: 22, guagua: 16, camion: 12, civic: 18 },
  civicUnlockSec: 18,
  bigVehicleUnlockSec: 16, // guaguas y camiones enter after the opening moments

  // Hitboxes
  vehicleHitboxScale: 0.9, // FEEL: forgiveness; the killer box is smaller than the visual box
  playerRadius: 0.5, // FEEL: base player collision circle, scaled per vehicle

  // Near-miss and combo. A near-miss has to be a dodge: the rider must have
  // been on the vehicle's line within nearMissThreatSec of the pass and then
  // moved out of it. Parking beside traffic pays nothing.
  nearMissRadius: 1.4, // FEEL: clearance (m) that still counts as close; feel beats realism
  nearMissThreatSec: 1.0, // FEEL: how late the collision course may be and still count as a dodge
  nearMissDodgeM: 0.2, // min lateral move (m) between the collision course and the pass
  nearMissPoints: 25,
  comboDecaySec: 4,
  // El pelito: a pass this tight (m between the rider's circle and the
  // vehicle's hitbox) reads ¡Por un pelito! and pays razorMissMult on top of
  // everything else. The rest of the near-miss band reads ¡Cerquita!.
  razorMissM: 0.35, // FEEL: lower = rarer and prouder. tools/economy-lab.ts: a dodge that does not aim for it lands here about 1 in 6 (0.45 m would be 1 in 4)
  razorMissMult: 2, // FEEL: what daring that close is worth

  // Contra via. The signature: riding the oncoming lanes doubles everything.
  contraViaMultiplier: 2,
  contraViaMinX: 0.25, // FEEL: how far past the center line before it counts

  // El caballito. Redesigned after the Phase 4 feel test: HOLD the wheelie as
  // long as you dare. Steering decays the longer you hold, points multiply.
  wheelieMaxSec: 4.5, // FEEL: hard cap on one caballito
  wheelieMultiplier: 1.5, // FEEL: ALL points x this while the front wheel is up
  wheelieSteerFactorStart: 0.68, // FEEL: steering authority at wheelie start...
  wheelieSteerFactorEnd: 0.38, // FEEL: ...decaying to this at max hold. The risk.
  wheelieWobble: 0.09, // FEEL: how shaky the bike gets deep into a hold
  // FEEL: how far the bikes rear up on the model (radians, pivoting on the
  // rear axle). Looks only: timing and hitbox never read it. At 0.5 the raised
  // portrait camera saw little more than a shorter bike; from about 0.7 the
  // headlight clears the rider's gorra, and at about 0.85 the bike stands
  // up like a real caballito with the rider sitting well back.
  wheeliePitchRad: 0.86,
  // FEEL: the bike angles this far (radians) toward the last carve while the
  // front is up. Looks only. Straight from behind, the rider's back hides the
  // raised front wheel; a small angle shows the bike in profile, front wheel
  // in the air, from the chase camera.
  wheelieYawRad: 0.24,
  wheelieDustEverySec: 0.06, // FEEL: the rear tire kicks up a puff this often while the front is up
  wheelieCooldownBase: 1.1, // FEEL: cooldown = base + held seconds * perSec
  wheelieCooldownPerSec: 0.65,
  // FEEL: a flick up this early before the cooldown ends still fires when it
  // ends; an older one is dropped, so a caballito never starts by itself
  // seconds later in the middle of a dodge. A held W or Space still fires.
  trickBufferSec: 0.2,
  wheeliePointsPerSec: 5,
  swipeUpPx: 48, // FEEL: upward swipe distance that starts a caballito
  swipeDownPx: 42, // FEEL: downward swipe that drops it early
  // FEEL: how much more vertical than horizontal a swipe must be to count as
  // a trick. Raise it if dodging keeps firing accidental caballitos.
  swipeDominance: 1.2,
  // El derrape: the Civic cannot wheelie, so its trick is a held drift. Same
  // multiplier, different risk: the car goes sideways and needs more room.
  driftHitboxMult: 1.35, // FEEL: collision circle grows this much mid-drift
  driftSteerFactor: 0.8, // FEEL: steering authority while sideways
  driftYaw: 0.5, // how far the car angles, radians

  // Score momentum: surviving deep multiplies EVERYTHING. The record chase is
  // about depth, not grinding. [meters, multiplier]
  distMultTiers: [
    [500, 2],
    [1200, 3],
    [2200, 4],
  ], // FEEL: when the run starts printing points

  // Airtime
  airtimePointsPerSec: 15,
  airLandBonus: 40, // FEEL: flat points (x the live multiplier) for landing a real jump off a policía
  airLandMinSec: 0.25, // a hop shorter than this is a bump, not a jump: no landing bonus
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
  // Plátanos trace the racing line: patterns lay them beside their own cars,
  // right where you pass them, so the coin line whispers "acércate más".
  platanoLineGapM: 0.35, // FEEL: gap between a car's hitbox and the rider's circle along a line
  platanoLineSpacingM: 3.2,
  platanoLayZ: 125, // m: lines appear once their car is this close (in the fog), so nothing pops in
  platanoTrailEvery: [4, 6.5], // FEEL: seconds between drought-filling trails...
  platanoTrailUnlockSec: 3,
  platanoTrailDroughtSec: 6, // ...which only come when no plátano spawned for this long
  platanoTrailLen: 5,
  policiaLeadIn: 3, // ground plátanos leading into a bump; the arc itself follows the real jump
  jumpArcCount: 6, // plátanos laid along the launched rider's own parabola
  rackTiers: [10, 25, 50], // FEEL: platanos this run that stack each bunch tier on the ride's rack
  powerupEvery: [18, 30],
  powerupUnlockSec: 20,
  // DECISION: every run's first power-up is a Bendición arriving about this
  // many seconds in, on the rider's line, so a new player's first mistake
  // becomes a golden save instead of a game over.
  firstPowerupSec: 14,
  cafecitoSec: 5,
  cafecitoBoost: 1.35, // FEEL: cafecito speed multiplier
  // FEEL: after the cafecito ends the rider stays ghosted this long, blinking,
  // so plowing through a car on the last tick is never a death. Speed eases
  // back through cafecitoEaseSec instead of snapping.
  cafecitoGraceSec: 1.0,
  cafecitoBlinkHz: 8,
  cafecitoEaseSec: 0.6,
  cafecitoRiverSpacingM: 7, // FEEL: el río de plátanos laid along the free path while it burns
  cafecitoRiverFromZ: 36, // m: where the river starts ahead of the rider

  // El pedal. Speed is the risk dial: hold ¡DALE! and the ride surges and
  // pays, hold FRENO and it slows to a floor, never to a stop (el corre corre
  // never stops). Release both and it cruises. Gas does not stack with the
  // cafecito.
  // DECISION: two on-screen pedals, bottom left, for the non-dominant thumb;
  // the dominant thumb keeps drag-anywhere steering. A finger that lands on
  // the pedals never steers. The finger-height throttle is gone.
  gasSpeedMult: 1.3, // FEEL: speed multiplier at full gas, before the ceiling below
  brakeSpeedMult: 0.75, // FEEL: speed floor at full brake
  gasResponse: 3.5, // FEEL: how fast speed rises toward the gas target, per second
  brakeResponse: 6, // FEEL: how fast speed drops (brake or gas release); the brake must bite
  // SACRED: gas and the cafecito never lift the rider past this (or past the
  // ride's own cruise speed, if that is higher). It keeps the telegraph rule:
  // at the 70% fog line (104 m ahead of the rider with the gas pull-back) a
  // car closing at 52 + 17 m/s gives 1.51 s. config.test.ts derives it.
  gasMaxMps: 52,
  gasScoreMult: 1.5, // FEEL: ALL points x this while a fondo (felt speed, not the raw press)
  brakeScoreMult: 0.5, // FEEL: ALL points x this while braking: safe, slow to score
  gasEngageAt: 0.5, // |throttle| past this is "a fondo" (gas) or "frenando" (brake)
  gasSpeedLines: 1, // FEEL: speed-line strength while floored, 0..1, at any speed
  gasPitchRad: 0.06, // FEEL: the rider tucks forward this much on gas (the Civic squats instead)
  brakePitchRad: 0.05, // FEEL: the rider sits back this much on the brake (the Civic dives)
  pedalPitchResponse: 12, // FEEL: how fast the ride answers the pedal visually; it should feel instant
  // El freno caliente. Bots that braked all run long outlived the ones that
  // cruised, which made the brake the dominant way to play. Heat rises while
  // the brake bites (in proportion to how hard) and falls while it does not.
  // About two seconds of full brake overheat the pads: the brake fades to
  // nothing and stays off until the heat drops under brakeResumeHeat. Taps
  // and 1 to 2 s holds work fully, so braking stays a tactical tool.
  brakeHeatMaxSec: 2.0, // FEEL: seconds of full brake before the pads overheat
  brakeCoolSec: 3.0, // FEEL: seconds for fully hot pads to cool to cold with the pedal up
  brakeResumeHeat: 0.35, // FEEL: overheated pads bite again below this heat (0..1); the hysteresis
  brakeFadeSec: 0.25, // FEEL: an overheating brake fades out over this long, and a cooled one comes back as fast
  // FEEL: cooling rate while the pedal stays down on overheated pads. Under 1,
  // holding a dead brake keeps it dead longer: let go and it recovers sooner.
  brakeHotHoldCool: 0.5,
  brakeSmokeEvery: 0.07, // FEEL: seconds between smoke puffs at the rear wheel while the pads are hot
  imanSec: 8,
  imanRadius: 6,
  imanPullSpeed: 15,
  shieldGraceSec: 0.9, // brief invulnerability after the Bendicion absorbs a hit
  // La Bendición's second half, like a hoverboard save: the car it took is
  // shoved aside with a spin and a bocinazo, and every car on your line in
  // the next shoveClearM is eased out of the way, so a save never becomes a
  // second crash. Cars slide there, they never teleport.
  shoveClearM: 15, // FEEL: how far ahead the save clears your line
  shoveMarginM: 1.0, // FEEL: side gap a shoved car leaves between its hitbox and your circle
  shoveRate: 9, // FEEL: how fast a shoved car slides over, per second (eased)
  shoveSpinSec: 0.6, // FEEL: how long the hit car takes to spin once around

  // Crash and restart. FEEL: this loop is the whole game
  // FEEL: real seconds from the impact to the card. Covers the impact frame,
  // the flip and the first ground contact of the tumble.
  crashSlowmoSec: 0.41,
  crashTimeScale: 0.2, // FEEL: sim speed during the slow-mo (traffic crawls)
  crashImpactSec: 0.07, // FEEL: the impact frame: the sim holds still this long before the slow-mo
  crashFlashAlpha: 0.35, // FEEL: white flash over the screen at the impact...
  crashFlashMs: 150, // ...fading out over this long
  // FEEL: the road scroll stops this fast (real seconds, time constant) once
  // you are down, so the car that hit you stays in frame instead of rolling
  // over the tumble.
  crashScrollTau: 0.08,
  killerFlash: 0.6, // FEEL: white rim on the vehicle that hit you...
  killerFlashSec: 0.25, // ...fading out over this long
  crashCamToKiller: 0.15, // FEEL: how far the camera's aim eases toward what hit you...
  crashCamEaseSec: 0.25, // ...and how long that look takes (real seconds, easeOutQuad)
  // The tumble runs in real time while the world crawls: the rider flies
  // off the ride toward the lens, flips, bounces and lies there under the
  // stars, and the ride slides out from under.
  tumbleLaunchVy: 5, // FEEL: how high the rider pops (m/s up)
  tumbleBackVz: -1.5, // FEEL: m/s toward the camera; keeps the tumble in the lower half of the frame
  tumbleGravity: 26, // FEEL: cartoon gravity; the first bounce lands as the card does
  tumbleSpinX: 9, // FEEL: flip speed, rad/s
  tumbleSpinZ: 4, // FEEL: max sideways spin, rad/s
  rideSlideVx: 3, // FEEL: m/s the ride slides out sideways...
  rideSlideDecay: 4, // ...and how fast that slide dies, per second
  // FEEL: OTRA VEZ is live this long after the card shows. The restart
  // listens on pointerdown, so a lifting finger can never trigger it; this
  // only swallows a tap in the same frame as the card. Card plus guard is
  // the brief's 0.5 s from crash to a tappable OTRA VEZ.
  restartDebounceSec: 0.08,
  // FEEL: after SEGUIR (and the pause a phone call or an app switch forces)
  // the world stays frozen for a 3, 2, 1 before ¡DALE!, so the thumbs can
  // find the glass again. The steering finger may pre-aim meanwhile.
  resumeCountdownSec: 1.5,

  // Records. Each means one thing: ¡NUEVO RÉCORD! is always the points
  // record, La Cinta is always the distance record, and both are the values
  // the run STARTED with, so a mid-run save can never fake one.
  recordNudgeAt: 0.9, // FEEL: once per run, "¡Ya casi el récord!" at this share of the points record
  recordNudgeFrom: 0.75, // FEEL: from this share on, the HUD record label counts down "FALTAN n"
  // DECISION: a ride with no distance record yet still gets a finish line,
  // LA META, so the very first run has a target to burst through.
  goalTapeM: 400, // FEEL: where LA META stands on a ride's first runs
  // The game-over card's distance bar toward La Cinta (or LA META). The
  // "¡Te quedaste a N m!" line shows only when the tape was really close:
  // within this share of it, or within soCloseMinM, whichever is more.
  soCloseShare: 0.3, // FEEL: higher = the "so close" line shows on more runs
  soCloseMinM: 50, // FEEL: a short record still gets the line this near
  countUpMs: 600, // FEEL: how long the card's points take to count up (OTRA VEZ is live throughout)
  // ¡HECHO!: the stamps slam onto the card's finished mandaos one by one,
  // each with a soft thump and a light tap on its impact.
  stampFirstSec: 0.5, // FEEL: from the card landing to the first stamp's slam
  stampStepSec: 0.14, // FEEL: the stagger between stamps
  stampLandSec: 0.12, // FEEL: from a stamp's slam to its impact (the dust ring, the thump, the tap)
  shareFailedMs: 2200, // FEEL: how long COMPARTIR reads ¡NO SE PUDO! after a share nothing could take

  // Ads (docs/audit/ADS-PLAN.md). Every wait on the ad SDK or StoreKit is
  // bounded except the player's own answer to a prompt or a purchase sheet,
  // and the game never waits on any of it.
  // DECISION: the consent and tracking prompts open on the title only,
  // after the title has been up this long, on every launch (a fresh install
  // and later launches alike). Never during a run, the countdown or a crash.
  adsStartDelaySec: 1, // FEEL: title time before the consent and tracking prompts may open
  adsForegroundWaitMs: 8000, // the most the flow waits for the app to be in front
  adsConsentTimeoutMs: 15000, // Google's consent check (UMP); past it the flow fails open
  // A consent form that never loads must not hold the tracking prompt
  // forever; a real player answers well inside this.
  adsConsentFormMaxMs: 300000,
  adsStepTimeoutMs: 5000, // reading the tracking status
  adsInitTimeoutMs: 15000, // starting the ad SDK
  adsLoadTimeoutMs: 30000, // one ad load; past it the slot counts as failed
  // AdMob drops a rewarded ad an hour after it loaded; one held this long is
  // replaced at the next run start.
  rewardedMaxAgeSec: 3300,
  // FEEL: "Dobla tus plátanos" on the game-over card takes taps only after
  // the card has been up this long. Before that a tap on it is a tap on the
  // card, so OTRA VEZ, so a player hammering the screen to restart never
  // opens a video by accident.
  rewardArmSec: 0.9,
  rewardShowGuardMs: 8000, // a video that never comes up releases the game after this
  rewardCountUpMs: 700, // FEEL: the card's plátanos counting up to the doubled total
  // The pause and Los Mandaos banner: failed loads retry after these waits
  // (seconds), then the slot stays empty for the session.
  bannerRetrySec: [30, 90, 240],
  bannerGapPx: 24, // clear space between the banner and the nearest control
  storeTimeoutMs: 10000, // a StoreKit read (price, what you own)

  // Los Mandaos: three small goals at a time; finish all three and you level
  // up. Positive goals only. Every "Run" kind must happen inside one run;
  // platanosTotal is the one that keeps counting across runs.
  // DECISION: the owner lifted the brief's "no meta in v1" rule for this pass
  // (docs/audit/PLAN.md decision 3). Mandaos never touch distance, La Cinta
  // or the distance records; the barrio multiplier pays points only.
  // The two tutorial sets come first, in order, and teach the verbs.
  mandaoTutorial: [
    [['platanosRun', 10], ['nearMissRun', 2], ['distRun', 300]], // doable in run one
    [['cvMetersRun', 100], ['trickHold', 2], ['gasSecRun', 5]], // contra vía, the caballito, el pedal
  ],
  // After the tutorials, three distinct kinds are drawn per set. Targets by
  // tier [0, 1, 2]. FEEL: raise a target and that goal takes more runs.
  // Tuned with tools/economy-lab.ts (-- kinds): for the riding style that
  // chases it, the lab's human-ish bot meets a tier-0 target in roughly a
  // third or more of its runs, tier 1 in one run of five or better, tier 2
  // in a few percent up to a third. The bot near-misses far less than a
  // player who aims, so the near-miss family sits lower than it feels.
  mandaoPool: {
    platanosRun: [40, 70, 110],
    nearMissRun: [5, 9, 15],
    razorRun: [1, 2, 4],
    comboReach: [3, 5, 7], // ¡Duro!, ¡Diache!, ¡Tú ta' loco!
    cvMetersRun: [300, 700, 1400],
    cvNearMissRun: [2, 4, 8],
    trickSecRun: [8, 16, 28],
    gasSecRun: [20, 40, 70],
    airRun: [2, 3, 5],
    reachTramo: [1000, 2000, 3000], // La Zona, El Campo, the whole lap
    pointsRun: [5000, 15000, 40000], // the barrio multiplier has grown by each tier
    cleanMeters: [600, 1200, 2000],
    pasolaMeters: [800, 1500, 2500],
    civicMeters: [800, 1500, 2500],
    platanosTotal: [150, 400, 800],
  },
  mandaoTierEvery: 2, // FEEL: levels spent on each tier before the targets step up
  mandaoTutorialReward: 40, // plátanos per tutorial mandao
  mandaoReward: [60, 100, 150], // FEEL: plátanos per mandao by tier
  mandaoSetBonus: 100, // FEEL: plátanos on top for finishing a whole set (a level up)
  // El multiplicador del barrio: +barrioMultStep on ALL points per level,
  // capped. Earned only, never bought.
  barrioMultStep: 0.25,
  barrioMultMax: 3,
  // El Mandao del Día: one date-seeded goal at the tier-1 target. The reward
  // grows with the streak of days in a row, capped. A missed day quietly
  // restarts the streak; the game never says it was lost.
  dailyReward: 120, // FEEL: plátanos for the daily at a 1-day streak
  streakStep: 0.25,
  streakMax: 2.5,
  mandaoSampleSec: 0.25, // how often (sim seconds) mandao progress is re-read mid-run

  // Juice
  // Trauma camera shake: each event adds trauma (0..1), trauma decays in a
  // straight line, and the shake is trauma squared, so small hits stay
  // subtle and a crash spikes. The shake is a rotation driven by smooth
  // noise on real time, so it keeps its rate through the slow-mo.
  traumaHoyo: 0.35, // FEEL: a pothole jolt
  traumaShield: 0.45, // FEEL: the Bendición taking a hit
  traumaScrape: 0.2, // FEEL: grinding the edge
  traumaCrashMin: 0.55, // FEEL: a crash at low closing speed...
  traumaCrashMax: 0.95, // ...and at high closing speed
  traumaCrashSpeed: [10, 60], // m/s closing speed mapped onto traumaCrashMin..Max
  traumaDecayPerSec: 1.4, // FEEL: how fast the shake dies
  shakeYawDeg: 1.5, // FEEL: max yaw at full trauma
  shakePitchDeg: 1.2, // FEEL: max pitch at full trauma
  shakeRollDeg: 2.5, // FEEL: max roll at full trauma
  shakeMoveM: 0.04, // FEEL: max camera translation at full trauma; rotation reads, translation smears
  // FEEL: under the system's reduced-motion setting, shake, FOV kicks and the
  // steering roll run at this fraction.
  reducedMotionScale: 0.3,
  // Micro time-dip: a skill peak (ladder tier 5 and up, La Cinta, WP-D's
  // razor pass) slows the sim for a blink, a soft hit-stop. It only slows
  // time, so the telegraph rule can only gain.
  dipScale: 0.3, // FEEL: sim speed at the bottom of a dip
  dipHoldMs: 45, // FEEL: how long it holds there...
  dipReturnMs: 110, // ...and how long it eases back (easeOutQuad)
  dipRecordHoldMs: 90, // FEEL: bursting La Cinta holds longer
  dipMinGapMs: 400, // FEEL: never two dips closer than this
  dipMinRunSec: 15, // DECISION: no dips in the first 15 s; the opening teaches, it does not stutter
  // Haptics budget (Apple HIG: a haptic that is fine now and then tires
  // when frequent). One haptic per floor, crash always goes through.
  hapticFloorMs: 60, // FEEL: minimum gap between any two haptics
  hapticPlatanoGapMs: 120, // FEEL: plátanos tick at most this often...
  hapticPlatanoMediumEvery: 10, // ...and every Nth plátano of the run lands medium
  dustMinVelX: 4.2, // FEEL: how hard you must carve before tire dust kicks up

  // The in-run HUD. Popups are the constant small rewards; the announcement
  // lane is the one slot for the big words (records, places, mandaos, set
  // pieces), so two of them never overlap.
  popupMax: 4, // FEEL: popups on screen at once; a fifth retires the oldest
  popupSec: 1.0, // FEEL: a popup's life: pop in, hold, rise and fade
  popupBigSec: 1.25, // FEEL: the same for the big ones (power-ups, the trick, airtime)
  popupRisePx: 36, // FEEL: how far a popup drifts up as it fades
  popupFloorShare: 0.7, // FEEL: popups end above this share of the screen height; lower, the steering thumb covers them
  // The rider's head and shoulders stay clear: a popup that would land on
  // them (a plátano grabbed at the handlebars, the crash) moves beside the
  // rider, to the side it came from. The box around the middle of the head:
  popupRiderHalfWM: 0.5, // FEEL: m either side of the head
  popupRiderAboveM: 0.35, // FEEL: m above the middle of the head (the gorra)
  popupRiderBelowM: 0.8, // FEEL: m below it (the shoulders and the chest)
  platanoAggSec: 0.35, // FEEL: plátanos closer than this in time add up into one "+N"
  scoreRollSec: 0.18, // FEEL: the score rolls up to a gain over this long instead of jumping
  scorePunchAt: 25, // FEEL: a gain this big at once also punches the score
  // Each announcement: [priority, minSec, showSec, ttlSec]. A higher
  // priority cuts the one on screen short once it has had minSec; a queued
  // one that waited ttlSec is dropped (a set piece's name is stale by then).
  // FEEL: showSec is how long each big word stays up.
  announce: {
    record: [5, 1.2, 2.0, 6],
    shield: [4, 0.8, 1.5, 1.5],
    tramo: [3, 1.6, 2.6, 8],
    mult: [3, 1.0, 1.9, 4],
    levelUp: [3, 1.4, 2.4, 20],
    mandao: [2, 1.3, 2.2, 20],
    setPiece: [2, 0.9, 1.6, 2.5],
    streetWild: [2, 0.9, 1.6, 3],
    nudge: [2, 0.9, 1.8, 4],
    landmark: [1, 0.9, 1.6, 3],
  } satisfies Record<string, readonly [number, number, number, number]>,
  announceOutSec: 0.18, // FEEL: the gap between two announcements, for the exit
  // The horizon: the lane's cards end above this share of the screen height
  // (a long one shrinks to), so a card never hides traffic as it first shows.
  laneHorizonShare: 0.335,
  tapeApproachM: 200, // FEEL: La Cinta's "Faltan n m" chip shows this close to the tape...
  tapeApproachStepM: 10, // ...counting down in steps this big, with a punch on each
  // Coach chips: one contextual hint at a time, only until the move has been
  // done once, ever (ecc.v1.learned). Steer, contra vía, the trick, the gas.
  coachStartSec: 1.5, // FEEL: the first hint of a run, never sooner
  coachGapSec: 4.5, // FEEL: from one hint appearing to the next
  coachShowSec: 4, // FEEL: a hint leaves after this long even if unanswered
  coachSteerM: 1, // how far the rider must steer (m) to count as steering

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
  // Overhead spans (pasacalles, banderitas, laundry) fade out as they climb
  // toward the HUD, so none sweeps behind the score, the combo or its tier.
  // Measured where the span's top edge lands on screen, as a fraction of
  // the frame from the top, so it holds at any camera height, fov or aspect.
  // DECISION: the full top band (score, ×n, the tier text and its fuse) has
  // no plate and ends at 0.19 of the height on the SE (0.15 on the 6.9-inch
  // phone), so a span is gone by the time its top edge reaches it. The pills
  // below have solid plates.
  overheadFadeFrom: 0.27, // FEEL: a span starts to fade here; higher = it fades farther away
  overheadFadeGone: 0.17, // FEEL: and is gone here; keep it below the combo tier's fuse
  // The Obelisco stands once per national lap, this far into each Malecon
  // stretch. It is one monument, so it must not appear twice in a lap, and
  // being reachable early is what makes it a landmark instead of a rumor.
  // Keep below tramoLengthM so it always lands inside the Malecon.
  obeliscoOffsetM: 500,
  // La Puerta del Conde: the Zona's landmark, a gate the road passes
  // through, once per lap this far into the Zona stretch. Keep below
  // tramoLengthM so it always stands in the Zona (tested).
  puertaOffsetM: 420,
  viralataEvery: [24, 44], // FEEL: seconds between street-dog cameos

  // Phase 7: Los Tramos. The world cycles Malecon -> Zona Colonial -> Campo,
  // one palette-and-scenery shift per stretch on the same chunk system.
  // FEEL: meters per themed stretch, tuned against a ~2000 m average run.
  // At 600 the country flew past often enough to stop being an event. At
  // 1000 a decent run reaches La Zona, a good one makes El Campo, and the
  // full national lap is 3 km, so arriving somewhere new stays an
  // achievement instead of scenery. Runs under a kilometer stay home on the
  // Malecon, which is what makes the first crossing land.
  tramoLengthM: 1000,
  // FEEL: traffic personality per tramo. Zona runs on carros publicos and
  // motoconchos; el campo belongs to camiones and motoconchos.
  tramoVehicleWeights: {
    malecon: { sedan: 32, motoconcho: 22, guagua: 16, camion: 12, civic: 18 },
    zona: { sedan: 40, motoconcho: 26, guagua: 10, camion: 5, civic: 19 },
    campo: { sedan: 16, motoconcho: 30, guagua: 14, camion: 32, civic: 8 },
  },

  // Phase 4: el sonido del barrio (100% WebAudio synthesis)
  audioBpm: 120, // FEEL: dembow drives; 108 read as reggaeton in the feel test
  musicVolume: 0.5, // FEEL: music bus level
  sfxVolume: 0.75, // FEEL: effects bus level
  engineVolume: 0.085, // FEEL: engine loudness at max speed; it hums, never drones
  engineGasRev: 0.28, // FEEL: engine pitch rise a fondo, even at the speed cap
  engineBrakeDrop: 0.16, // FEEL: engine pitch drop on the brake
  pedalSfxVolume: 0.18, // FEEL: the turbo whoosh on gas and the tire chirp on the brake
  washVolume: 0.026, // FEEL: the sea, barely there
  comboHatsAt: 3, // hats swell in at this combo
  comboBassAt: 5, // bass pulse joins at this combo
  hornEvery: [7, 16], // FEEL: seconds between ambient bocinazos
  riffVolume: 0.15, // FEEL: the melodic pluck riding over the dembow

  // The master limiter: every sound leaves through one compressor, so a
  // near-miss, a plátano, a horn and a bell over the full dembow never clip.
  limiterThresholdDb: -8, // FEEL: where the limiter starts to hold the mix down
  limiterKneeDb: 6,
  limiterRatio: 8,
  limiterAttackSec: 0.002,
  limiterReleaseSec: 0.12,
  // DECISION: the compressor adds an automatic makeup gain: +3.0 dB (x1.414)
  // at these settings, measured offline (tools/audio-lab.mjs) and matching
  // the WebKit/Chromium kernel, (1 / gain at 0 dBFS)^0.6 with the soft knee.
  // The trim takes it back out, so everything under the threshold plays
  // exactly as loud as before. Retune it with the lab if a limiter key moves.
  masterTrim: 0.707,
  musicDuckLevel: 0.55, // FEEL: music level under a big stinger (record, mandao, tramo)

  // Music between runs and at the crash. FEEL: the colmado radio on the
  // title and the game-over card, and a tape-stop instead of a hard cut.
  idleMusicHz: 700, // FEEL: the idle groove's low-pass; lower sounds further away
  idleMusicLevel: 0.8, // FEEL: idle groove bus level, relative to musicVolume
  idleKickGain: 0.45,
  idleRiffGain: 0.6,
  idleMusicDelaySec: 0.6, // FEEL: the quiet beat between the tape-stop and the idle groove
  tapeStopHz: 350, // FEEL: where the crash sweeps the band's low-pass down to
  tapeStopOctaves: 1, // FEEL: how far the tape drags pitch and tempo down over the slow-mo

  // Intensity layers. FEEL: they enter on the next beat and leave at the end
  // of the bar plus one bar, so a flickering combo never chops a phrase.
  layerInSec: 0.3, // fade-in of a layer entry
  layerOutSec: 1.2, // fade-out of a layer exit
  musicRunHz: 9000, // FEEL: the band's low-pass at cruise; the gas opens it all the way
  musicOpenHz: 18000,
  gasLayerAt: 0.5, // the gas layer (open hats) joins this far into the felt gas; matches the ×1.5 gate
  gasLayerVolume: 0.7, // FEEL: open hats a fondo
  comboBreakDipHz: 900, // FEEL: a broken chain dips the band's low-pass here...
  comboBreakDipSec: 0.35, // ...and back, over this long
  tramoColorVolume: 0.8, // FEEL: the tramo instruments (güira, requinto, accordion, tambora) against the dembow

  // Rewards you can hear
  // FEEL: the big moments against everything else (ladder stabs, the
  // multiplier arpeggio, the tramo fanfare, the Obelisco, the shield break,
  // the record and farthest stingers, the mandao jingles). They ride inside
  // sfxVolume; raise this if they get lost under the dembow.
  stingerVolume: 1,
  nearMissPluckVolume: 0.12, // FEEL: the pentatonic pluck that climbs with the combo
  platanoStreakSec: 0.45, // FEEL: pickups closer than this are one string, rising a semitone each
  platanoStreakMax: 12, // semitones a string may climb
  tapeRiserM: 60, // FEEL: the snare roll starts this many meters before La Cinta
  cafecitoTicks: 3, // warning ticks in the cafecito's last second
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
