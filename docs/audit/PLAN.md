# Next-level pass: plan (2026-09-29)

This file is the single source of truth for the pass Adelson asked for on
2026-09-29: "take this to the next level: fun, replayable, high quality,
polished, close to delivery; add the acceleration with a pedal; use Subway
Surfers and Temple Run as the bar." CLAUDE.md stays the canon brief. Where
this plan and CLAUDE.md disagree, this plan records the owner's newer
request and the decision taken.

## Inputs

- Raw findings (gitignored, local only): `docs/audit/raw/`
  - `audit-feel.json` (15), `audit-traffic.json` (16), `audit-ui.json` (15),
    `audit-retention.json` (17), `audit-art.json` (23), `art-critique.json`
    (24), `audit-ship.json` (16): code audits, each finding with files,
    evidence and a concrete proposal.
  - `research-subway.json`, `research-temple.json`, `research-traffic.json`,
    `research-juice.json`: genre research mapped to this game.
  - `harness/`: the auditors' headless harnesses. `harness/traffic-lane/`
    runs the real Traffic class in node (harness.ts, exp1..exp11.ts);
    `harness/sim.ts`, `stubs.ts`, `opening.ts`, `records.ts` run Traffic and
    Score with a human-calibrated bot.
- Baseline screenshots (gitignored): `docs/shots/baseline/`, produced by
  `node tools/shots.mjs --out docs/shots/baseline`.
- Refer to a finding as `feel[3]`, `art[0]`, `critique[9]` (zero-based index
  into the `findings` or `mechanics` array of that file).

## Owner-level decisions taken in this pass

1. **El pedal.** Two on-screen pedals in one cluster at the bottom left, laid
   out like a car: FRENO on the left (smaller), GAS on the right (bigger,
   labeled `¡DALE!` in ES and `GAS` in EN). Hold to act, release to cruise.
   The dominant thumb keeps drag-anywhere steering; the other thumb works the
   pedals. A pointer that lands on a pedal is reserved: it never steers, never
   feeds the caballito swipe, and is released on pointerup, pointercancel,
   lostpointercapture, pause, crash, blur and visibilitychange. The
   finger-height throttle is deleted (code and CONFIG keys). ArrowUp and
   ArrowDown stay for desktop. The game stays fully playable with one thumb
   at cruise. `// DECISION:` comments carry this in code.
2. **Risk and reward of speed.** Gas: speed x1.3, capped by a new SACRED
   `gasMaxMps` so the telegraph rule holds at the readable fog distance of the
   worst tramo; ALL points x1.5 while a fondo, gated on the speed the player
   actually feels (not the raw input). Brake: speed floor x0.75, bites faster
   than gas rises (`brakeResponse` 6 vs `gasResponse` 3.5), and ALL points
   x0.5 while braking, so braking is safe and slow to score, never dominant.
   Same-direction traffic behind a braking rider follows the rider and honks
   instead of rear-ending them.
   Added after wave 1 (bots that brake all the time survived about 50%
   longer than cruise once the brake really worked): **freno caliente**.
   About 2 s of full brake overheats the pads; the brake fades and stays off
   until it cools. Taps and short holds work fully, so braking stays a
   tactical tool, not a way to ride slow all run.
3. **Los Mandaos.** Mission sets of three with levels and a points-only
   "multiplicador del barrio" (+0.25 per level, cap x3), plus one daily
   mandao with a streak. The brief's "no meta-systems in v1" rule is lifted
   by the owner's explicit Subway Surfers request. Record chasing stays the
   center: mandaos never touch distance, La Cinta or per-vehicle distance
   records.
4. **Records mean one thing each.** `¡NUEVO RÉCORD!` / `NEW RECORD!` always
   means the points record: the banner fires mid-run when points pass the
   record the run started with. La Cinta del Récord is the distance record;
   bursting it says `¡MÁS LEJOS QUE NUNCA!` / `FARTHEST EVER!`. A vehicle with
   no distance record gets a `LA META` / `GOAL` tape at 400 m. Records are
   snapshotted at run start, so a mid-run persist (pause, backgrounding) can
   never fake a record.
5. **Pinturas economy.** Prices become [0, 250, 600, 1200, 2500] per vehicle,
   each paint gets a Spanish name, and the plátano income rises (trails and
   authored lines). Owned paints stay owned; storage keys do not change.
6. **Not in this pass** (roadmap): revive ring, pursuer (Doña Tatica or AMET),
   night mode, weather, word of the day, mystery box, borrowed rides, Modo
   Paseo, character unlocks, medal lines, rival tapes.
8. **Ads in release 1.0 (decided 2026-10-17).** Rewarded "Dobla tus
   plátanos" on the game-over card, a small banner on the pause screen and
   the Los Mandaos sheet only, and a $1.99 Remove Ads purchase. Full
   decisions and owner steps: docs/audit/ADS-PLAN.md. This replaces the
   "no ads" line of the brief and of decision 6.
7. Canon strings from CLAUDE.md stay. Fix grammar where the code composes
   strings (`LLEGASTE A EL CAMPO`). No em dashes in any user-facing text.

## Waves and work packages

Each package lists the files it owns. Other files may get only the small
wiring edits named. Wave N starts after wave N-1 is merged into `main`,
type-checks, tests green and renders.

### Wave 1 (parallel)

**WP-A: El pedal, speed and camera.** Owns: `src/player.ts` input code (not
the mesh builders), `src/main.ts` throttle, speed and `updateCamera`,
`src/score.ts` gas and brake multipliers, the engine and throttle SFX in
`src/audio.ts`, `src/haptics.ts`, a pedal block in `src/ui.ts` and
`src/style.css`, native iOS edge-gesture deferral under `ios/App/App/`,
throttle and camera keys in `src/config.ts`, the telegraph tests in
`src/__tests__/config.test.ts`.
Findings: feel[0], feel[1], feel[2], feel[4], feel[5], feel[10],
traffic[2] (scoring only; see decision 2), traffic[8], ui[0] (functional
pedal; styling may be refined in WP-E), retention[6], art[3], critique[1],
art[20] (rider lean and tail light for gas and brake), ship[0], ship[2],
ship[8], research-traffic[1], [2], [5], [6] (speed readout at the pedal,
km/h), [11], research-juice[8].

**WP-B: Traffic, pacing and fairness.** Owns: `src/traffic.ts` spawning,
patterns, car-following, near-miss, pickups placement (not vehicle or
pickup mesh builders), traffic keys in `src/config.ts`, wiring hooks in
`src/main.ts` (opening seed, rebase horn, cafecito grace, jump arc,
set-piece popups), new `src/__tests__/traffic.test.ts`.
Findings: traffic[0], [1], [3], [4], [5], [6], [7], [9], [10], [11], [12],
[13], [14], [15]; feel[3]; retention[0]; research-juice[9] (first-run
teaching through the road), [10] (breathers); research-temple[3] (ease
around control changes), [6] (anti-idle); research-subway[12] (cafecito
plátano river). The near-miss event passes the clearance
(`onNearMiss(x, z, clearance)`) for WP-D's razor scoring.

**WP-C: Art and world.** Owns: `src/world.ts`, `src/flag.ts`, the mesh
builders in `src/traffic.ts` (vehicles, pickups, obstacles) and in
`src/player.ts` (rider and rides), rendering and palette-adjacent keys in
`src/config.ts`.
Findings: art[0], [1], [2], [4] (vehicle fog readability), [5], [7], [8],
[9], [10], [11], [12], [13], [14], [15], [16], [17], [18], [19], [21],
[22]; critique[0], [2], [3], [4], [5], [6], [9], [10], [11], [12], [13]
(road detail), [14], [15], [16], [17], [18]; research-subway[6];
research-juice[6] (tape flutter), [14] (skid marks, optional).
World API for WP-D: `world.startRun(tapeAtM, tapeLabel)` so the tape can read
`TU RÉCORD · 1,234 m` or `LA META`.

### Wave 2 (parallel)

**WP-D: Records, Los Mandaos and the economy (data layer).** Owns:
`src/score.ts`, new `src/missions.ts`, `PINTURAS` in `src/config.ts`, record
and mandao wiring in `src/main.ts`, `src/__tests__/score.test.ts`, new
`src/__tests__/missions.test.ts`. Exposes clean data for WP-E (no layout
work beyond what is needed to see it working).
Findings: retention[1], [2], [3], [4], [7], [8], [9], [10], [14], [16];
ui[5] (data), ui[12] (data); research-juice[4], [5]; research-temple[0],
[1], [5]; research-subway[3], [13].

**WP-F: Audio.** Owns: `src/audio.ts` (except what WP-A added), audio wiring
in `src/main.ts`.
Findings: retention[5] (sound part), [11], [12], [13], [15];
research-juice[1], [11]; research-subway[7a] (per-tramo dembow color),
[15].

**WP-G: Feel, juice and the crash.** Owns: the loop and crash code in
`src/main.ts`, crash and trick code in `src/player.ts`, `src/haptics.ts`
mapping.
Findings: feel[6] (resume countdown: state and a minimal element), feel[7]
(real-time tumble, hit flash; card anchoring goes to WP-E), feel[8], [9],
[11], [13], [14]; ui[6], ui[14]; art[6]; critique[21];
research-juice[0], [2], [3], [7]; research-subway[8] (Bendición shove).

**WP-C3: Art touch-ups after wave 1.** The Bendición aura (it read as a flat
lasso), a compact plátano rack, a caballito that reads from the raised
camera, the cobrador's fog, a thinner rama, plus defects found in the wave-1
gallery.

### Wave 3 (parallel)

**WP-E: UI overhaul.** Owns: `src/ui.ts`, `src/style.css`, `index.html`.
Findings: ui[1], [2], [3], [4], [5], [7], [8], [9], [10], [11] (canvas
card), [12], [13]; retention[5] (popup aggregation), [9] (render);
critique[7], [8], [19], [20], [22]; research-juice[5], [6] (approach chip),
[12], [13]; research-temple[1], [2]; the Mandaos UI (title chip, pause
list, game-over rows with stamp slams, mid-run toast, daily row); pedal
visual polish.

**WP-S1: Native and storage.** Owns: `ios/`, `capacitor.config.json`, new
`src/storage.ts` (localStorage plus a Capacitor Preferences mirror).
Findings: ship[1], [6], [7], [14], [15].

### Wave 4: ship

QA with the ship-audit skill, bot baselines, 10-minute soak, draw calls,
docs (HANDOFF, PLAYTEST, README, RELEASE, STORE), App Store screenshot set
(critique[23]), build 10 on the device and archived for Organizer.
Findings: ship[5], [9], [10], [11], [12], [13].

## Rules for every package

- Read CLAUDE.md, HANDOFF.md section 2 and 4, and your findings in full.
  The findings are proposals from read-only auditors: verify each against
  the current code before applying it, and adapt where this plan's
  decisions differ.
- `src/config.ts` stays the only tuning surface. Every new feel number gets
  a `// FEEL:` comment; judgment calls get `// DECISION:`.
- Zero per-frame allocations in hot loops. Pool everything that spawns.
- Every user-facing string exists in ES and EN, Dominican Spanish first, no
  em dashes, apostrophes as U+2019 in new strings.
- Done means verified: `npm run check` and `npm run build` clean, the
  relevant `node tools/shots.mjs --scenes ...` images looked at, and
  `window.__ecc` probes for behavior. Report what was not verified.
- Commit on your branch with a clear message and the co-author line.
