# HANDOFF: continuation plan for El Corre Corre

> **Who this is for.** Any model or engineer continuing this project. Fable 5
> built phases 0 to 7 with Adelson signing off phase by phase. The next-level
> pass of 2026-09-29/30 (pedals, Los Mandaos, records, UI, audio, feel, art,
> native share and save backup) was built in parallel work packages and
> merged in waves. This file is the execution-grade map of the game as it is
> now and of what is left.
>
> **Read order at session start:** [CLAUDE.md](CLAUDE.md) (the canon brief:
> vision, spec, exact copy, palette), then
> [docs/audit/PLAN.md](docs/audit/PLAN.md) (the owner decisions of the
> next-level pass; where it and CLAUDE.md disagree, PLAN.md is the newer
> decision), then this file, then [PLAYTEST.md](PLAYTEST.md) (feel-test log
> and open verdicts), then [RELEASE.md](RELEASE.md), then
> `git log --oneline`.

---

## 1. Current state (2026-09-30)

**Main holds wave 4** (fixes `5b5bc39` to `8a85b45`, these docs, the store
screenshots), ahead of `origin/main` (`ad436cf`, build 9) and not pushed.
`npm run check` is clean: 11 test files, 108 tests.

**On TestFlight:** build 9 (`ad436cf`, 2026-09-01), with the internal group
and the external group Familia (Adelson's brother Erickson). Build 9 has none
of the next-level pass. Build 10 is archived from wave 4 at
`ios/App/build-archive/App10.xcarchive` and not uploaded yet; RELEASE.md has
the state and the runbook.

**The next-level pass** (the owner asked on 2026-09-29 for "fun, replayable,
high quality, polished, close to delivery" with a gas pedal, using Subway
Surfers and Temple Run as the bar). Decisions are in PLAN.md. Merged work:

- **Wave 1.** El pedal: two on-screen pedals (FRENO and ¡DALE!/GAS), gas x1.5
  and brake x0.5 on all points, the sacred `gasMaxMps` ceiling, a km/h
  readout, a higher portrait camera, and an iOS view controller that defers
  the bottom screen edge. Traffic: a seeded opening (plátanos in 2 s, slow
  cars at about 5, 9 and 14 s, a Bendición at about 14 s), near-misses that
  need a real dodge, el rebase picked by arrival time, cars that follow a
  braking rider and honk, convoys of 3 to 4, a wave director with seven set
  pieces, escalation on the distance tiers, plátanos on the racing line, and
  a cafecito grace second. Art: sky dome with sun and cel clouds, turquoise
  sea with veleros, La Cinta as a finish arch, road detail, pasacalles,
  banderitas and laundry, walkers, La Puerta del Conde, lit lamps on traffic,
  a hazard fog curve for traffic, the rider's orange chaleco, the plátano
  rack.
- **Wave 2.** Records mean one thing each (section 3.2). Los Mandaos with
  levels, the barrio multiplier and the daily (section 3.4). Pintura prices
  from the economy lab. Audio: a master limiter, a combo-scaled near-miss
  whoosh and pluck, ladder stabs, a rising plátano streak, the idle radio
  between runs, the crash tape-stop, per-tramo music color, and new stingers.
  Feel: el freno caliente (section 3.3), the crash impact freeze and a
  real-time tumble, OTRA VEZ live 0.5 s after impact, capped variable
  substeps in place of the fixed accumulator, a 3-2-1 resume countdown,
  trauma shake, micro time-dips, a haptics budget, and the Bendición shove.
- **Wave 3.** Screens: title with ride tabs and a paint tray, the mandao
  sheet, pause, a top-anchored game-over card with OTRA VEZ docked at the
  bottom, and a share card with a photo of the crash. In-run HUD: one top
  band, one announcement lane (`src/announce.ts`), clamped popups
  (`src/popups.ts`), first-time coach chips (`src/coach.ts`), polished pedal
  states. Native: the Preferences save mirror (`src/storage.ts`), the native
  share sheet (`src/share.ts`), overhead spans that fade before they cross
  the HUD, `CFBundleLocalizations` es and en, the sky color behind the web
  view, pods at iOS 15.0, and the app privacy manifest.

**Verified at `eb676ef`** (wave 3 integration report): tsc clean, 105 tests,
build clean (843 kB JS, 239 kB gzip, 43 kB CSS; the chunk-size warning is
accepted), `tools/feel-probe.mjs` 50 PASS, `tools/audio-probe.mjs` 26/26,
`tools/screens-probe.mjs` 212 PASS, `tools/hud-probe.mjs` 111 PASS. Every
tappable on title, sheet, HUD, pause and card is at least 44x44 at 375x667 in
ES and EN.

**Not verified anywhere yet:** anything on a device (native share to
Messages and WhatsApp, the save mirror after a real eviction, the pedals under
real multi-touch, haptics, audio by ear, frame rate, cold-launch color),
VoiceOver, iPad compatibility mode, and a 10-minute soak of this build.

**Wave 4 (ship) landed.** The store lens items at `eb676ef` are fixed:
the photo purpose string in ES and EN (`68fc5c6`), build number 10, the old
archives moved to `ios/App/build-archive/` so `npx cap sync ios` exits 0, the
`__ecc` rig gated out of the release bundle (section 4.1), the privacy page
updated in `site/` (not pushed yet), opaque RGB icons, and the 6.9-inch
screenshot sets in `docs/store/screenshots/{es,en}`, and the in-app privacy
link (a "Privacidad" / "Privacy" link at the bottom of PAUSA that opens the
site page in Safari). Still open: publishing the privacy page.

**Ads for release 1.0 (branch `ads-1.0`, 2026-10-18).** Capacitor 8,
then the ads: the consent and tracking flow, "Dobla tus plátanos" on the
card, one banner on PAUSA and the mandao sheet, and the $1.99 Remove Ads
purchase. Decisions, what was built and the owner steps:
[docs/audit/ADS-PLAN.md](docs/audit/ADS-PLAN.md). `npm run build` fails
until the real AdMob ids are in `src/adIds.ts`; use
`npm run build:adtest` for device tests (RELEASE.md). Checked on the
iPhone 14 Plus simulator with Google's test ads: the consent message and
the ATT prompt on the title, a test banner on PAUSA with the page moved
clear of it, the banner gone in play, a test rewarded video that doubled
the card's plátanos, and the Remove Ads sheet degrading to "not
available" without a StoreKit product.

---

## 2. Working agreement (how Adelson works, non-negotiable)

1. Phases in order; the game runs and is playable after every unit of work.
   Commit per phase or per coherent feature round; push to origin main when
   Adelson says so.
2. `src/config.ts` `CONFIG` is the ONLY tuning surface. Every feel-critical
   number lives there with a `// FEEL:` comment. Ambiguous design calls: decide
   in the spirit of the vision, leave `// DECISION:` comments, keep moving.
3. **Nothing is "done" until verified where Adelson will see it**: run it in
   the browser, drive it with the `__ecc` hooks, screenshot the proof, keep the
   console clean, and `npm run build` clean. Committed is not done.
4. End every phase with a short PLAYTEST NOW note (3 to 12 specific checks)
   in PLAYTEST.md, and keep that file's history of passed phases.
5. All user-facing text: Spanish-first with full EN parity for gameplay copy
   (section 8). Never use em dashes in any user-facing text. UI must be
   polished at phone size: no overlaps, no clipped text.
6. Before calling the game release-ready, run the `ship-audit` skill
   (Adelson's global rule) and the full QA checklist in CLAUDE.md.
7. Heavy commands (headless Chrome, `npm run build`, xcodebuild, the labs)
   go through `sh tools/heavy.sh ...` (section 4.4).
8. Keep auto-memory current (section 10) so the next session starts warm.

---

## 3. Architecture map

Stack: Vite 6 + TypeScript strict (TS 7 npm package) + three.js r185. Runtime
dependencies beyond three.js: the bundled Lilita One font and the Capacitor 8
plugins (haptics, preferences, share, filesystem). Capacitor 8 needs Node 22
(`.nvmrc` and `engines` say so): it is installed through nvm, so put
`~/.nvm/versions/node/v22.23.1/bin` first on PATH for every node, npm and npx
command. Capacitor 8 also needs Xcode 26 or later (Xcode 27.1 here), iOS 15.0
stays the floor, and the pods stay on CocoaPods. `npm run dev` (port 5173),
`npm run build` (tsc --noEmit + vite build), `npm run preview` (port 4173),
`npm test` (vitest), `npm run check` (tsc + vitest).

| File | Owns |
|---|---|
| `src/main.ts` | Bootstrap (awaits the save restore first), state machine (`title/playing/paused/countdown/crashing/gameover`), the loop (capped variable substeps), speed, pedal gating, camera, FOV, trauma shake, time-dips, crash sequence, run moments (records, La Cinta), event wiring between all systems, pinturas and ride selection, `__ecc` test hooks |
| `src/config.ts` | `PALETTE`, `VEHICLES`, `PINTURAS`, `CONFIG` (the tuning surface), `ROAD` derived geometry |
| `src/world.ts` | Bend-field shader, `worldMaterial()`, `toonMaterial()`, `textTexture()`, sky dome, sun, lights, sea, road chunks, mountain backdrop, three scenery belts per tramo, overhead spans, walkers, critters, Obelisco, La Puerta del Conde, La Cinta arch and confetti |
| `src/traffic.ts` | Vehicle archetypes and pools, hazard fog material, the opening, wave director and set pieces, escalation, filler spawner, anti-wall validation, car-following, el rebase, obstacles, pickups and plátano lines, near-miss detection (with clearance), collision query, the Bendición shove |
| `src/player.ts` | Input (keys, pointers, pedals, swipes), steering physics, caballito/derrape, airtime, edge scrape, ride rigs and paints, plátano rack, particles, Bendición aura, crash tumble and stars |
| `src/score.ts` | Points math with the multiplier stack, combo, razor pass, per-vehicle records with the run-start snapshot, wallet and lifetime plátano total, run counters for mandaos |
| `src/missions.ts` | Los Mandaos: tutorial sets, pool sets by tier, levels, barrio multiplier, the daily and streak. Pure logic, no DOM |
| `src/brakeHeat.ts` | El freno caliente, shared by `main.ts` and the traffic lab bots |
| `src/audio.ts` | WebAudio graph with a master limiter, dembow sequencer with layers and per-tramo color, engine, horns, stingers, all SFX, mute, iOS unlock |
| `src/ui.ts` | DOM screens and HUD, `STRINGS` es/en, the share card drawing |
| `src/announce.ts`, `src/popups.ts`, `src/coach.ts` | The announcement lane, clamped popups, first-time coach chips |
| `src/hud.css`, `src/style.css` | In-run HUD styles; screen styles and tokens |
| `src/storage.ts` | Capacitor Preferences mirror of every `ecc.v1.*` key (native only) |
| `src/share.ts` | `shareImage()`: native share sheet, Web Share, or a download |
| `src/haptics.ts` | Capacitor Haptics with a web fallback, and the haptics budget |
| `src/tour.ts` | Los Tramos as pure math (run-relative) |
| `src/flag.ts` | La bandera dominicana with el escudo, drawn once |
| `src/leaderboard.ts` | The Game Center hook (`submitScore`), a no-op until the plugin lands |
| `src/adIds.ts` | The one place for the AdMob ids and the Remove Ads product id, and the build guard (`releaseIdProblems`, `bundleAdsFor`) that `vite.config.ts` runs |
| `src/ads.ts` | The consent and tracking flow (`runConsentFlow`), the rewarded video's once-per-run bookkeeping (`RewardedOffer`), the banner slot (`BannerSlot`) and the `Ads` controller, all over an `AdsPort` |
| `src/purchases.ts` | Remove Ads: the `Entitlements` over a `StorePort`, cached as `ecc.v1.adFree` |
| `src/admobPort.ts`, `src/storePort.ts` | The two ports over @capacitor-community/admob and @capgo/native-purchases (native only) |
| `src/simAds.ts` | Stand-ins for both plugins in a dev or probe page opened with `?ads=sim` (`window.__eccSim` knobs); never in a release bundle |
| `src/bounded.ts` | `withTimeout` for every native call that waits on the network or StoreKit |
| `tools/ios-ads-plist.mjs` | The `capacitor:copy:after` hook: writes the bundle's AdMob app id into Info.plist |
| `ios/App/App/GameViewController.swift` | Defers the bottom screen edge. The home indicator auto-hides through Capacitor 8's SystemBars plugin (`plugins.SystemBars.hidden` in `capacitor.config.json`), which owns `prefersHomeIndicatorAutoHidden` and also keeps the status bar hidden |
| `ios/App/App/SceneDelegate.swift` | The UIScene life cycle that Xcode 27 builds require (Capacitor 8.5). The Info.plist scene manifest loads `Main.storyboard`, whose root is GameViewController; the delegate only forwards events to Capacitor's `SceneDelegateProxy`. The AppDelegate no longer gets foreground, background or open-URL events |
| `ios/App/App/PrivacyInfo.xcprivacy` | Required-reason APIs: UserDefaults CA92.1, FileTimestamp C617.1; no data collected, no tracking |

### Invariants you MUST internalize before editing

- **Axes.** Forward is +z. The world scrolls toward -z (world-moves; player z
  is always 0, x is lateral). +x is the oncoming/sea side. The camera looks
  down +z, therefore **world +x renders on screen LEFT**. Keyboard D and
  rightward drags map to world -x (the sign flip lives once, in player input).
  Lane centers `[-5.1, -1.7, 1.7, 5.1]`; indexes 0-1 yours, 2-3 oncoming;
  shoulders at ±7.5; drivable clamp is `ROAD.edgeX (8.4)` minus per-vehicle
  half width. Contra vía = `x > CONFIG.contraViaMinX (0.25) && x < 6.8`.
- **The bend field.** S-curves and the world-drop are a vertex-shader illusion
  (`world.ts` BEND_CHUNK). Gameplay space stays straight, so collision and
  spawn validation are curve-independent; keep it that way. EVERY world-space
  material must be wrapped with `worldMaterial()` (`toonMaterial()` does it
  internally). Traffic and pickups use `hazardMaterial()` in `traffic.ts`
  (world wrap plus the hazard fog curve). Never wrap the sky dome.
- **The loop.** Every rendered frame advances exactly its real dt, split into
  equal substeps of at most `CONFIG.fixedDt` (1/120 s); frame gaps clamp at
  `maxFrameDt` (0.1 s). The crash slow-mo and the time-dips scale the sim dt.
  Never use raw frame dt in gameplay math.
- **Pooling.** Everything that spawns is pooled (vehicles per type, obstacles,
  pickups, particles, popups, confetti). No allocations in hot loops; reuse
  vectors. Scenery lives in 3 recycling 120 m belts.
- **Random streams.** three.js draws `Math.random` for every uuid at build
  time, so any art edit reshuffles seeded scenes. Gameplay values drawn at
  construction must not come from that stream (traffic drift phases come from
  the pool slot for this reason), and screenshot scenes that stage cars pass
  each car's speed explicitly. Probe checks that depend on seeded traffic
  wait for their own event (the hud-probe lane check waits for its card).
- **Materials.** Every instanced mesh on the belt's vertex-color material
  (`vcMat`) carries an `instanceColor`, white when untinted; the belt palms
  have their own `palmMat`. A shared material seen with and without that
  attribute makes three.js re-derive program parameters every frame, and a
  shadow caster that gains it flips the shadow depth material too. Count
  `getParameters` calls per pass after any material change.
- **Tricks.** One shared state machine (hold to sustain, `wheelieMaxSec` 4.5,
  cooldown grows with the hold, release to re-arm, a 0.2 s input buffer).
  Bikes pitch up on the rear axle and clear ground hazards; the Civic drifts
  sideways instead, gains x1.35 collision radius while held, and does NOT
  clear ground hazards (`player.clearsGroundHazards` vs `player.isWheelie`).
- **Order-sensitive wiring in main.ts.** `ui`, `traffic`, `player` closures
  reference each other across declaration order (safe only because callbacks
  fire later). Keep new cross-references inside callbacks. The save restore
  is a top-level await in `main.ts`, and it runs after the top-level code of
  every imported module: no module may read localStorage at import time.
- **Telegraph invariant is sacred.** The rider never passes
  `CONFIG.gasMaxMps` (52 m/s) with gas or the cafecito. At the 70% fog line
  (about 104 m ahead with the gas pull-back) a car closing at 52 + 17 m/s
  gives 1.51 s. `config.test.ts` derives this from `fogNear`, `fogFar`,
  `camBack` and `camGasPullBack`, and `hazardfog.test.ts` checks that a car
  is half visible 1.506 s before impact. Raising any vehicle top speed,
  raising `fogNear`, lowering `fogFar` or raising `gasMaxMps` fails a test.

### 3.1 Score multiplier stack

Every point source (distance, plátanos, near-misses, airtime, the landing
bonus, wheelie time) goes through one product in `score.ts` `mult()`:

```
mult = contraVia (x2)
     x trick     (x1.5 while the caballito or derrape is held)
     x gas       (x1.5 while a fondo)
     x brake     (x0.5 while braking)
     x ride      (VEHICLES.scoreMult: Pasola 1, Motor 1, Civic 1.22)
     x distance tier (x1, x2 at 500 m, x3 at 1200 m, x4 at 2200 m)
     x barrio    (1 + 0.25 x mandao level, capped at x3)
```

- A near-miss pays `25 x combo x mult`, and x2 more when it is a razor pass
  (`clearance <= razorMissM`, 0.35 m, shown as ¡Por un pelito!).
- Gas pays only on the speed the rider feels: `gasOn` needs the eased speed
  factor at least halfway to the gas target, so a tap never pays. Brake x0.5
  needs the ride at least 1% under cruise, so a dead (overheated) pedal
  stops charging. The cafecito pays neither.
- The barrio multiplier applies to points only, never to distance. La Cinta
  and the distance records stay a pure skill line.
- `score.liveMult` is the same product; the HUD chip shows it (hidden at x1,
  gold from x3, red with a glow from x6).
- `submitScore` and the share card receive points that include the barrio
  multiplier (owner decision pending, section 11).

### 3.2 Records: what each one means

- **Points record** (`ecc.v1.record.{ride}`). `¡NUEVO RÉCORD!` /
  `NEW RECORD!` always means this one. It fires once, mid-run, when points
  pass the record the run started with (only when that record is above 0),
  with confetti, the record stinger and a success haptic.
- **Distance record** (`ecc.v1.recordDist.{ride}`) is La Cinta del Récord,
  an arch at that distance reading `TU RÉCORD · 1,234 m` /
  `YOUR RECORD · 1,234 m`. Bursting it says `¡MÁS LEJOS QUE NUNCA!` /
  `FARTHEST EVER!`. A ride with no distance record gets a `LA META` / `GOAL`
  tape at `goalTapeM` (400 m), and bursting it says `¡LLEGASTE A LA META!` /
  `GOAL REACHED!`.
- Both records are snapshotted at run start (`prevRecord`,
  `prevRecordDist`). Every in-run moment and the game-over card compare
  against the snapshot, so a mid-run persist (pause, backgrounding) can never
  fake a record.
- Near the points record: from 75% (`recordNudgeFrom`) the HUD label counts
  down `FALTAN n` in gold, and at 90% (`recordNudgeAt`) `¡Ya casi el récord!`
  pops once. Within 200 m of the tape a `Faltan n m` chip counts down in 10 m
  steps.
- Records are per ride. Mandaos never touch distance, La Cinta or the
  distance records.

### 3.3 El pedal and el freno caliente

- Two pedals at the bottom left: FRENO (left, smaller) and ¡DALE! / GAS
  (right, bigger), with the km/h readout beside GAS. The whole cluster is one
  hit zone. A pointer that lands on it is reserved until it lifts: it never
  steers and never feeds the caballito swipe. The pedal releases on
  pointerup, pointercancel, lostpointercapture, pause, crash, blur and
  visibilitychange. ArrowUp and ArrowDown press the same pedals on desktop.
- Gas: target speed x1.3 (`gasSpeedMult`), rising at `gasResponse` 3.5/s,
  capped by `gasMaxMps` 52. Brake: speed floor x0.75 (`brakeSpeedMult`),
  biting at `brakeResponse` 6/s. The cafecito adds its boost above the pedal
  under the same ceiling; gas and the cafecito never stack.
- **El freno caliente** (`src/brakeHeat.ts`): heat rises with brake depth and
  falls when the pedal is up. About `brakeHeatMaxSec` (2.0 s) of full brake
  overheats the pads. The brake then fades out over `brakeFadeSec` (0.25 s)
  and stays off until heat falls under `brakeResumeHeat` (0.35). Cooling from
  hot to cold takes `brakeCoolSec` (3.0 s) with the pedal up, and runs at
  half rate (`brakeHotHoldCool` 0.5) while a dead pedal is still held. Taps
  and holds under about 1.5 s keep full authority. The pedal shows the heat
  as a fill, then turns orange with a flame and a `¡CALIENTE!` / `HOT!` tag,
  with smoke at the rear wheel.
- Why: once the brake really worked (wave 1), bots that braked all run
  outlived cruise by about 50%. With the heat, brake-always loses to cruise
  (section 4.5).

### 3.4 Los Mandaos and the plátano economy

- Three mandaos are active at a time; finishing all three levels you up and
  pays `mandaoSetBonus` (100 plátanos). Two tutorial sets come first:
  10 plátanos, 2 cerquitas, 300 m; then 100 m en contra vía, a 2 s
  caballito, 5 s a fondo. Each tutorial mandao pays 40.
- After the tutorials, three distinct kinds are drawn per set from 15 kinds
  in `CONFIG.mandaoPool`, with targets by tier (the tier steps up every
  `mandaoTierEvery` = 2 levels) and rewards `mandaoReward` [60, 100, 150].
- Level names: Novato, Pasajero, Motoconchista, Tíguere, Tíguere de Verdad,
  Jefe del Malecón, Leyenda del Malecón (EN: Rookie ... Legend of the
  Malecón). The name stops at level 6; the barrio multiplier keeps rising to
  its cap of x3 at level 8.
- El Mandao del Día: one date-seeded goal at the tier-1 target, local time.
  It pays `dailyReward` (120) x the streak multiplier
  (1 + 0.25 x (days - 1), capped at x2.5). A missed day restarts the streak
  without a message.
- Mandao rewards go into the wallet at once. Progress is sampled on events
  and every 0.25 s of sim time with zero allocations; pause saves it.
- Pinturas: 5 per ride, index 0 is the factory paint. The four to buy cost
  500, 800, 1100 and 3000 plátanos on every ride (PLAN decision 5 proposed
  another row; the economy lab retuned it in wave 2). Names stay Spanish in
  EN. Ownership is stored by index, so prices can move without touching
  saves. Economy lab career (wave 2 merge): first paint at median run 3, then
  runs 7, 17 and 41.
- `missions.test.ts` hardcodes lab medians (about 53 road plátanos per run;
  tutorial sets done by runs 1 and 3). If plátano income, survival or the
  opening changes, re-run `sh tools/heavy.sh npx vite-node tools/economy-lab.ts -- career`
  and update those constants and the prices.

### 3.5 Save data: localStorage schema and the Preferences mirror

Every save is a localStorage key under `ecc.v1.`. Every read is guarded
(private mode, corrupt JSON and a throwing storage read as missing).

| Key | Holds | Written by |
|---|---|---|
| `ecc.v1.record.{pasola,motor,civic}` | Points record per ride | `score.ts` |
| `ecc.v1.recordDist.{pasola,motor,civic}` | Distance record per ride (La Cinta) | `score.ts` |
| `ecc.v1.platanosLifetime` | The spendable wallet (the name predates the store; a purchase lowers it) | `score.ts` |
| `ecc.v1.platanosTotal` | Every plátano ever earned; never decreases; seeded from the wallet once | `score.ts` |
| `ecc.v1.pinturas.{ride}` | Owned paint indexes, comma-separated (0 is implied) | `main.ts` |
| `ecc.v1.pintura.{ride}` | Equipped paint index | `main.ts` |
| `ecc.v1.vehicle` | Selected ride | `main.ts` |
| `ecc.v1.mandaos` | JSON `{v: 1, level, set: [...]}` | `missions.ts` |
| `ecc.v1.daily` | JSON `{day: 'YYYY-MM-DD', ...mandao}` | `missions.ts` |
| `ecc.v1.streak` | JSON `{last: 'YYYY-MM-DD', n}` | `missions.ts` |
| `ecc.v1.lang` | `'es'` or `'en'` | `ui.ts` |
| `ecc.v1.muted` | `'1'` or `'0'` | `audio.ts` |
| `ecc.v1.pedalSeen` | `'1'` once GAS was pressed, ever (stops the GAS breathe hint; counts as the gas coach bit) | `ui.ts` |
| `ecc.v1.learned` | Coach bitmask: 1 steer, 2 contra vía, 4 trick, 8 gas, 16 el freno caliente | `coach.ts` |
| `ecc.v1.adFree` | `'1'` while Remove Ads is owned (StoreKit re-checks it at launch and on every transaction update; absent otherwise) | `purchases.ts` |

Legacy unsuffixed `ecc.v1.record` and `ecc.v1.recordDist` migrate to the
Motor once, in `score.ts`.

**The Preferences mirror** (`src/storage.ts`, native only). One Capacitor
Preferences entry, `ecc.backup`, holds JSON `{v: 1, saves: {...}}` with every
`ecc.v1.*` key. It is written at game over, on pause, on the menu, when the
app goes to the background outside a run (during the crash slow-mo it first
persists the run's records and mandaos), and once at boot when saves
already exist. At boot, if localStorage has no `ecc.v1.*` key, the mirror
refills it before the game reads anything. Saves already in localStorage
always win. If the bridge does not answer in 1.5 s the game boots anyway and
that session never writes the mirror. An empty set is never written. The web
build never touches Preferences.

---

## 4. Testing infrastructure (how quality was kept; use it)

Headless browsers and the embedded pane often freeze requestAnimationFrame.
The game exposes `window.__ecc`, so everything is testable deterministically
anyway. `tick(sec)` advances the sim in 1/60 s steps, runs the camera and the
HUD clock per step, updates audio and renders once. All headless tests are
`dispatch input -> tick -> assert`.

### 4.1 `__ecc` hooks (all of them, at `eb676ef`)

`window.__ecc` exists only in the dev server and in `npm run build:probe`
(which writes `dist-probe/`, ignored). The release bundle has none of it:
`grep -c __ecc dist/assets/index-*.js` prints 0. A probe that needs a
production-like bundle serves `dist-probe/`.

- **State:** `state() score() record() x() y() speed() effSpeed() throttle()
  cars() combo() platanos() cv() wheelie() airborne() powerups() worldDist()
  runDist() vehicle() distMult() radius() fov() fps() info() bank()`.
  `powerups()` returns `{cafecitoT, cafGraceT, imanT, shielded, invincibleT}`;
  `info()` returns draw calls and triangles.
- **El pedal:** `pedal(v)` holds -1 (FRENO), 0 or 1 (¡DALE!); `gas()` returns
  `{gasOn, brakeOn, gasK, brakeK, throttleMult, kmh}`; `brakeHeat()` returns
  `{heat, hot, auth}`.
- **Records and mandaos:** `records()` returns `{record, prevRecord,
  prevRecordDist, tapeAt, tapeGoal, recordFired, recordNudged}`;
  `liveMult()`; `runStats()`; `lastRun()`; `mandaos()` (the missions view);
  `nearMiss(clearance)` runs a near-miss through the real handler.
- **World:** `tramo() obelisco() belts() overlaps() dog() confetti()
  burstTape() overhead(z, kind)`.
- **Audio:** `audio()` returns `{unlocked, muted, ctx, layers, music}`.
- **Feel and crash:** `dip() triggerDip(holdMs?) trauma() countdown() crashT()
  killer() simT() motion()`.
- **HUD:** `hud()` (lane, coach and learned state); `announce(kind, text,
  kicker?)`.
- **Ads and Remove Ads:** `ads()` returns `{enabled, ready, outcome, npa,
  rewarded, paid, offer, banner, hold}`; `store()` returns `{available,
  adFree, price, priceState, open}`; `reward()` taps "Dobla tus plátanos".
  They do something only on a page opened with `?ads=sim`, whose stand-ins
  are steered through `window.__eccSim` (see `src/simAds.ts`).
- **Actions:** `start() crash() pause() resume() menu() selectVehicle(id)
  share()`. `god(on)` skips vehicle collisions for long rides;
  `touching(margin)` says whether a car is inside the rider's circle plus a
  margin. `wheelieNow()` is an empty stub (dispatch Space instead).
- **Staging:** `spawnVehicle(type, lane, z, dir, exactX?, speed?)`,
  `spawnObstacle(kind, x, z)`, `spawnPickup(kind, x, z, y?)`,
  `clearTraffic()`, `setPiece(kind)`, `ahead()` (next vehicle's x and
  arrival time), `setRecordDist(m)` (moves this run's tape),
  `setDistance(m)` (jumps the distance tiers).

### 4.2 Input and harness gotchas

- Input: dispatch real `KeyboardEvent` and `PointerEvent` on window between
  ticks. Steering KeyA/KeyD/ArrowLeft/ArrowRight; pedals ArrowUp/ArrowDown or
  `__ecc.pedal`; trick hold Space/KeyW; Space/Enter menus; KeyM mute; P or
  Escape pause; title ArrowLeft/Right ride select. Key auto-repeat is ignored
  for start, restart, ride select, mute and trick arming.
- A synthetic `pointerdown` on OTRA VEZ bubbles to window after the restart,
  so the player adopts that pointer as the steering finger. Use
  `__ecc.start()` to restart, or dispatch a pointerup for pointerId 0.
- The game-over card swallows a tap in the same frame it lands
  (`restartDebounceSec`); time windows like this must be measured inside
  the page, never with test-runner sleeps.
- After `pause()`, the run resumes only after the 1.5 s countdown; tick
  through it.
- `__ecc.speed()` returns the BASE ramp speed. `effSpeed()` is what the rider
  does (pedal, cafecito, hoyo, scrape). To measure felt speed from distance,
  difference `worldDist()` over at least 0.5 s (it is integer-quantized).
- A near-miss now needs a dodge: the rider must be on the car's line within
  `nearMissThreatSec` and move at least `nearMissDodgeM`. Parking beside a car
  pays nothing. For scoring tests use `__ecc.nearMiss(clearance)`; for a real
  dodge use the `dodgeChain` helper in `tools/shots.mjs`.
- There is no safe parking spot: the opening seeds cars on the lane centers
  and shoulders get parked guaguas and carts. Design tests to restart on
  `state() !== 'playing'`, or use `god(true)`.
- Screenshot scenes start with every coach move learned (`ecc.v1.learned` =
  31). A scene passes `coach: <bits>` (`?coach=n`) to show a first launch.

### 4.3 Tools

| Tool | What it does | Run |
|---|---|---|
| `tools/shots.mjs` | Headless gallery: 51 scenes (the 7 ads scenes run with `?ads=sim`: gameover-reward, gameover-reward-done, pause-banner, mandaos-banner, title-noads, store-sheet, store-bought) (the three `store-*` scenes run at `iphone69` only), seeded `Math.random`, frozen rAF, suspended audio. Presets `iphone69` (440x956 at 3x = 1320x2868, the App Store 6.9-inch size) and `se` (375x667 at 2x), or `WxH@scale`. Exit 1 on a page error, blank WebGL, a flat frame or a failed scene | `sh tools/heavy.sh node tools/shots.mjs --scenes title,contravia --viewports se --out docs/shots/x` (`--lang en`, `--seed 11`, `--gl swiftshader`, `--list`) |
| `tools/feel-probe.mjs` | Crash, judder, countdown, brake, dip, keys, trick, shield, motion and draws probes | `sh tools/heavy.sh node tools/feel-probe.mjs [probe ...]` |
| `tools/screens-probe.mjs` | Title, sheet, pause, card and share layout and flows at SE, 6.9-inch and landscape, ES and EN; `ads` checks the offer, the banner gaps and Remove Ads with the stand-ins | `sh tools/heavy.sh node tools/screens-probe.mjs [layout flow buy card ads motion share]` |
| `tools/hud-probe.mjs` | Top band, popups, lane, cards, coach, contrast, reduced motion, pause freeze, duplicate ids | `sh tools/heavy.sh node tools/hud-probe.mjs [probe ...]` |
| `tools/audio-probe.mjs` | The live game's audio wiring with a running AudioContext | `sh tools/heavy.sh node tools/audio-probe.mjs` |
| `tools/audio-lab.mjs` | Offline renders of the real AudioEngine: limiter, layers, tape, duck, fuzz, sfx | `sh tools/heavy.sh node tools/audio-lab.mjs [--suites limiter,layers]` |
| `tools/traffic-lab/lab.ts` | The real Traffic class with a human-calibrated bot: parked, bot, opening, platanos, convoy, rebase, walls, brake, cafecito, policia, pacing | `sh tools/heavy.sh npx vite-node tools/traffic-lab/lab.ts -- bot` (`N=48`, `HEAT=0`, `TH=cruise,tactical`, `TDANGER=150`) |
| `tools/traffic-lab/browser-probe.mjs` | Draw calls over a god-mode ride and live traffic probes | `sh tools/heavy.sh node tools/traffic-lab/browser-probe.mjs [--root <repo>] [--only drawcalls]` |
| `tools/economy-lab.ts` | Real Traffic, Score and Missions: styles, razor, kinds, career | `sh tools/heavy.sh npx vite-node tools/economy-lab.ts -- career` (`PRICES=0,500,...`, `ALT=...`) |
| `tools/make-icons.mjs` | Regenerates the app icons from the palette | `node tools/make-icons.mjs` |

### 4.4 `tools/heavy.sh` and the 8 GB rule

The dev Mac has 8 GB of RAM. Parallel agents that each started a headless
Chrome ran it out of memory. Every heavy command in every checkout
(headless Chrome, `npm run build`, xcodebuild, the labs, vitest by
convention) goes through `sh tools/heavy.sh <command>`, which takes a
machine-wide lock at `/private/tmp/ecc-heavy.lock` so heavy jobs queue. A
lock whose owner process died is reclaimed. Disk is also short (about 2 GB
free on 2026-09-30): delete DerivedData and scratch screenshots after use.

Worktree rules learned in this pass:
- Check the base commit first (`git merge --ff-only main`); worktrees have
  started two commits behind.
- A symlinked `node_modules` is not matched by the `node_modules/` ignore
  rule. Never `git add -A`; stage paths by name.
- A package that adds npm dependencies must install in the main checkout
  after the merge; a symlinked lane cannot install into it.
- `npx cap sync ios` in a worktree with a symlinked `node_modules` writes
  machine paths into `Podfile` and `Podfile.lock`. Never commit those; sync
  from the main checkout only.
- `tools/shots.mjs` adds the real path of `node_modules` to Vite's
  `fs.allow`, so the Lilita font loads from a symlinked install. Other
  scratch scripts need the same, or the HUD renders in a fallback font.

### 4.5 Baselines to preserve (re-measure after tuning, flag regressions)

- **Tests:** 14 files, 163 tests on `ads-1.0` (11 files, 105 tests at
  `eb676ef`).
- **Build:** 874 kB JS (249 kB gzip) for `npm run build:adtest` on
  `ads-1.0` (843 kB, 239 kB gzip at `eb676ef`); the chunk-size warning is
  accepted. `npm run build` needs the real AdMob ids first.
- **Probes on `ads-1.0`:** feel 50, screens 384 (212 plus 172 in `ads`),
  hud 111, audio 26/26.
- **Draw calls**, god-mode ride from 0 to 3300 m at 440x956, seed 7,
  median / p90 / max (wave 2 merge, `a900ef6`): Malecón 106 / 123 / 131,
  Zona 108 / 118 / 121, Campo 96 / 104 / 117. Feel-probe draws at 375x667
  (`eb676ef`): 87 and 93 riding, 98 in the tumble, 97 on the card.
- **Bot survival**, traffic lab, N=48, distance medians (wave 2 merge):
  human-ish bot cruise 1729 m, brake-always 730 m, smart brake 961 m,
  tactical 2012 m; skilled bot cruise 3914 m, brake-always 2664 m, smart
  3325 m, tactical 5302 m. Brake-always must keep losing to cruise. The lab
  cannot show that tactical braking helps: it sits inside a ±15% noise band
  around cruise.
- **Parked rider:** 0 near-misses over 60 s at the start line (seeds 7, 11,
  23). Parked survival by spot, measured without the opening at WP-B
  (`4b4a8c3`): lane centers 19.7 to 20.1 s, dashed line 23.0 s, seam 19.4 s,
  CV lane 15.1 s, CV line 17.4 s, shoulder 11.8 s. The seam must never be
  safer than a real lane, and contra vía must stay deadlier than your own
  lane.
- **Opening:** first plátano about 2 s, first own-side car about 4 to 5 s,
  first power-up a Bendición at about 14 s.
- **Crash to OTRA VEZ:** the card lands 0.417 s after impact; the first
  accepted tap restarts 0.500 s after impact.
- **Brake heat:** full brake overheats at about 2.0 s; 1 s taps 3 s apart
  never overheat; 1 s on and 1 s off overheats on tap 5.
- **Audio:** worst limited peak 0.833 in the extreme stack; the mix alone
  peaks at 0.73 to 0.75.
- **Economy:** first paint at median run 3 (section 3.4).
- **Soak:** last run in Phase 6 (20+ minutes of sim, 300+ runs, DOM node
  count flat, heap without trend, correct rendering past 30 km). Not re-run
  on this build.
- Zero console errors or warnings, ever (three.js deprecations count).

### 4.6 Per-change verification ritual

`npx tsc --noEmit` -> the relevant probe or `npm test` -> scripted `__ecc`
asserts for the changed behavior -> `tools/shots.mjs` for anything visual
(SE and 6.9-inch, ES and EN when copy changed), and look at every image ->
`sh tools/heavy.sh npm run build` (or `npm run build:adtest` until the
real AdMob ids exist) -> commit with a descriptive message
ending in the standard co-author line.

---

## 5. Phase 6 and the iOS wrap (done)

The perf pass, the soak, the runtime QA checklist, the Game Center hook
(`src/leaderboard.ts`) and the app icon were done in Phase 6. The Capacitor
wrap followed: bundle id `dev.elcorrecorre.app` (chosen by Adelson on
2026-07-29; never change it without him), Capacitor 6 (8 since 2026-10-18),
haptics through the plugin, portrait only, status bar hidden, builds 1 to 9
uploaded to App Store Connect. The release runbook, build ledger and console
steps live in RELEASE.md. `node tools/make-icons.mjs` regenerates `public/icon-1024.png`
and `public/icon-180.png`; the icons are RGBA with every pixel opaque, which
nine uploads have accepted.

## 6. Phase 7: Los Tramos (done)

El Malecón, La Zona Colonial and El Campo, 1 km each (`tramoLengthM`),
measured from the start of each run (`src/tour.ts`). Each tramo owns the
whole frame (both roadsides, the road texture, fog, light and music color).
El Obelisco stands 500 m into each Malecón and La Puerta del Conde 420 m into
each Zona. The tramo arrival is a green road sign in the announcement lane.

---

## 7. Feel-tuning playbook (Adelson's verdicts -> knobs)

Adelson speaks in feel; translate through CLAUDE.md's tuning guide plus these
knobs (all in `src/config.ts`, current values in parentheses):

| Verdict | Knobs |
|---|---|
| "still too easy / too hard" | `speedRampPerSec` (0.16), `trafficDensityStart` (0.4), `densityRampSec` (50), `spawnsPerSecAtFull` (2.35), `trafficMaxActive` (33), `escalation` rows, `patternIntervalMin/Max` (2.2 / 3.8) |
| "the start is boring / too busy" | `openingCars`, `openingTrail*`, `openingSec` (20), `firstPowerupSec` (14), `gentleStartSec` (10) |
| "set pieces feel like walls" | `setBuildPatterns` (2), `setPeakSec` (4), `setBreatherSec` (4.5), `setPieceUnlockSec` (20), per-piece speeds |
| "contra vía not risky enough / too brutal" | `oncomingShare` (0.5), `cvTargetBias` (0.65), `vehicleSpeeds` |
| "near-misses too rare / too easy" | `nearMissRadius` (1.4), `nearMissThreatSec` (1.0), `nearMissDodgeM` (0.2), `razorMissM` (0.35) |
| "gas not worth it / too strong" | `gasScoreMult` (1.5), `gasSpeedMult` (1.3), `gasResponse` (3.5). `gasMaxMps` (52) is SACRED: tests fail above it |
| "brake too safe / useless" | `brakeScoreMult` (0.5), `brakeSpeedMult` (0.75), `brakeResponse` (6), `brakeHeatMaxSec` (2.0), `brakeCoolSec` (3.0), `brakeResumeHeat` (0.35) |
| "trick too strong / weak" | `wheelieMultiplier` (1.5), `wheelieMaxSec` (4.5), `driftHitboxMult` (1.35), `wheeliePitchRad` (0.86) |
| "runs pay too little / too much late" | `distMultTiers` |
| "mandaos too slow / too easy" | `mandaoPool` targets, `mandaoReward`, `mandaoSetBonus`, `mandaoTierEvery`, `barrioMultStep` (0.25), `barrioMultMax` (3), `dailyReward` (120) |
| "paints too cheap / too far" | `PINTURAS` prices; re-run the economy lab career section |
| "crash or restart feels slow" | `crashSlowmoSec` (0.41), `crashImpactSec`, `restartDebounceSec` (0.08), `countUpMs` (600), `resumeCountdownSec` (1.5) |
| "beat feels X" | `audioBpm` (120), `riffVolume` (0.15), `comboHatsAt` (3) / `comboBassAt` (5), `stingerVolume` (1), pattern arrays in audio.ts |
| "speed doesn't thrill" | `fovSpeedKick` (6), `fovGasKick` (5), `camGasPullBack` (0.45), `gasSpeedLines` |
| "the HUD is busy" | `popupMax` (4), `coachStartSec` / `coachGapSec` / `coachShowSec`, `announce` priorities, `overheadFadeFrom` / `overheadFadeGone` |
| Ride identity | `VEHICLES` (speedCap, speedMult, scoreMult, hitbox, accelMult, dampMult, latMaxMult, leanMult) |

After ANY tuning round: re-run the traffic lab bots and the feel probe, and
re-run the economy lab when plátano income, survival or a mandao changes
(section 3.4). Update section 4.5 when a change is intentional.

---

## 8. Copy and localization rules

- `STRINGS` lives in `ui.ts` with es/en tables and is exported; `t()` picks
  by the persisted language. Everything gameplay-facing exists in both
  (popups, pills, ladder, labels, buttons, lane cards, coach chips, mandao
  templates, share card). `hud.test.ts` checks that both languages have the
  same keys and that no string contains an em dash.
- La Cinta's label is localized: `TU RÉCORD · 1,234 m` /
  `YOUR RECORD · 1,234 m`, `LA META` / `GOAL`.
- These stay Spanish in EN mode on purpose: the logo, colmado and shop
  signs, the guagua banner (DIOS ES MI GUÍA), the cobrador's ¡SÚBETE!, the
  power-up names (Cafecito, Bendición, Imán), ride names and taglines, and
  pintura names. The slang ladder and level names translate.
- Exact copy strings for screens are canon in CLAUDE.md; do not restyle them.
- No em dashes anywhere user-facing. New strings use U+2019 for apostrophes.
  Numbers group by language (es-DO and en-US both print 1,234). Spanish uses
  inverted punctuation. Keep the Dominican voice (vamo’, pa’, tíguere).

---

## 9. Known accepted quirks (do not "fix" without cause)

- The shadow pass does not follow the bend field; offsets are imperceptible.
- The mountain backdrop and the sun do not parallax (intended).
- The vite chunk-size warning (three.js in one chunk) is accepted for v1.
- `fps()` in a hidden pane is a stale average; trust it only when visible.
- The very first tap's audio may be silent (context resume race). Remove
  this line only after a real iPhone Safari check.
- Traffic wheels are baked into each vehicle's merged geometry and do not
  spin.
- At the speed cap the Civic's gas adds about 1.5% speed (51.24 to 52 m/s)
  and still pays x1.5 (owner question from wave 1, not answered).
- A few popups can sit close to the rider's helmet; the HUD probe shows them
  inside their band.
- On the iPhone SE the Civic overlaps the paint tray by a few pixels on the
  title.
- Headless captures have zero safe-area insets, so the HUD sits a little
  higher than on a real notched phone. In the app the top inset is 0 because
  the status bar is hidden.
- Landscape is web only; the iOS app is portrait only.
- Mandao near-miss targets were tuned against a bot that near-misses less
  than a human; skilled players may find them easy.

---

## 10. Memory + session ritual

Auto-memory lives at
`~/.claude/projects/-Users-Adelson-Desktop-personal-el-corre-corre/memory/`
(`MEMORY.md` index + `el-corre-corre-status.md`). Update the status file at
the end of every session: what shipped (commit hash), what verdicts are
pending, what is next. Keep the `__ecc`/rAF-freeze note there; it is the key
to testing in this environment.

Session start: read the docs in the order given at the top of this file,
start the dev server, run a 30-second smoke via `__ecc` (start, tick, spawn,
crash, restart, check console). Session end: typecheck, build, verify,
commit, update PLAYTEST.md and memory, push when Adelson says so.

---

## 11. Open items after the next-level pass

Owner decisions (Adelson):
0. The ads owner steps in docs/audit/ADS-PLAN.md: the AdMob ids into
   `src/adIds.ts`, the consent and IDFA messages, app-ads.txt, the Remove
   Ads product, App Privacy and the age rating.
1. `SHARE_URL` in `ui.ts` is empty, so the share card has no URL footer.
   Natural choice once the game is live: the App Store link.
2. Whether the leaderboard and the share card show points with the barrio
   multiplier (they do now; the share card prints the level line).
3. The Digital Services Act trader status and the new age-rating answers in
   App Store Connect.

Done in wave 4 (formerly open): the ¡HECHO! stamp plays a soft thump and a
light haptic; the title camera pulls back per ride so the ride clears the
paint tray; the in-app privacy link; the 10-minute soak (heap +0.37 MB over
9 min, DOM and listeners flat, 0 errors); the 6.9-inch store screenshots.

Engineering still open: the device checks in RELEASE.md (launch alive with
the console, share sheet, save mirror, edge deferral, haptics, audio by
ear) and a VoiceOver pass. Post-launch roadmap:
CLAUDE.md, plus PLAN.md decision 6 (revive ring, pursuer, night mode,
weather and the rest).

## 12. Note for the next model

Spend multi-agent orchestration where it compounds: read-only auditors
before big refactors, adversarial checks of perf and balance claims
(before/after numbers from `__ecc.info()` and the labs), and cold reviews of
your own diffs. Do not spend it re-deriving context that is already in this
file, CLAUDE.md, PLAN.md or PLAYTEST.md. Keep mechanical edits single-agent.
An integration merge must re-measure each package's headline effect in the
running build: in wave 1 a keep-both merge silently disabled the brake while
every test stayed green. Respect the per-change verification ritual (section
4.6). When Adelson gives a feel verdict in plain words, translate through
section 7 and change CONFIG only.
