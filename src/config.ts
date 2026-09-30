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

// Las Pinturas: the platano wallet finally spends. Index 0 is the factory
// paint, always owned. Prices tuned to the earn rate (a decent run banks
// 20-60 platanos): first unlock inside a session or two, the gold one a flex.
export interface Pintura {
  hex: number;
  price: number;
}

export const PINTURAS: Record<VehicleId, ReadonlyArray<Pintura>> = {
  motor: [
    { hex: 0xce1126, price: 0 }, // rojo del barrio
    { hex: 0x2b2f36, price: 400 }, // negro tinto
    { hex: 0x27b598, price: 900 }, // verde colmado (shifted off the rider's shirt teal)
    { hex: 0x002d62, price: 1600 }, // azul marino
    { hex: 0xf4c430, price: 3000 }, // oro fino
  ],
  pasola: [
    { hex: 0x7fd8c9, price: 0 }, // menta de fabrica
    { hex: 0xff8b94, price: 400 }, // rosa chicle
    { hex: 0xb3d9ff, price: 900 }, // cielo
    { hex: 0xcdb4db, price: 1600 }, // lila
    { hex: 0xf4c430, price: 3000 }, // oro fino
  ],
  civic: [
    { hex: 0xce1126, price: 0 }, // rojo que se oiga
    { hex: 0x9d4edd, price: 400 }, // morado neon
    { hex: 0x17a2b8, price: 900 }, // turquesa
    { hex: 0x24242a, price: 1600 }, // negro mate
    { hex: 0xf4c430, price: 3000 }, // oro fino
  ],
} as const;

export const CONFIG = {
  // Simulation
  fixedDt: 1 / 120, // fixed sim step; feel is framerate-independent
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
  // front wheel and the headlight clear the rider's gorra and the rider
  // visibly sits back.
  wheeliePitchRad: 0.74,
  wheelieDustEverySec: 0.06, // FEEL: the rear tire kicks up a puff this often while the front is up
  wheelieCooldownBase: 1.1, // FEEL: cooldown = base + held seconds * perSec
  wheelieCooldownPerSec: 0.65,
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
  imanSec: 8,
  imanRadius: 6,
  imanPullSpeed: 15,
  shieldGraceSec: 0.9, // brief invulnerability after the Bendicion absorbs a hit

  // Crash and restart. FEEL: this loop is the whole game
  crashSlowmoSec: 0.5, // real seconds of slow motion before the card appears
  crashTimeScale: 0.2, // sim speed during the slow-mo
  // FEEL: the brief wants OTRA VEZ responsive within 0.5 s of the crash. The
  // card lands at crashSlowmoSec; this guard only has to outlast the stray
  // pointerup from the finger that was still steering.
  restartDebounceSec: 0.15, // ignore taps this long after the card shows
  closeCallShare: 0.15, // FEEL: "te quedaste a N" shows when within this fraction of the record

  // Juice
  shakeHoyo: 0.22, // FEEL: camera jolt when you eat a pothole
  shakeShield: 0.3,
  shakeCrash: 0.5,
  dustMinVelX: 4.2, // FEEL: how hard you must carve before tire dust kicks up

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
