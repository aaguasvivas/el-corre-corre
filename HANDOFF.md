# HANDOFF: continuation plan for El Corre Corre

> **Who this is for.** Any model or engineer continuing this project (written so
> Opus 5 Ultracode can execute the remaining phases at full quality). Fable 5
> built phases 0 to 5 plus two feel-iteration rounds with Adelson signing off
> phase by phase. This file is the execution-grade map of everything left.
>
> **Read order at session start:** [CLAUDE.md](CLAUDE.md) (the canon brief:
> vision, spec, phase plan, exact copy, palette; it overrides everything),
> then this file, then [PLAYTEST.md](PLAYTEST.md) (feel-test log and open
> verdicts), then `git log --oneline`.

---

## 1. Current state (commit `a26eee8`)

Everything through **Phase 5 is built, verified, committed, and pushed** to
`github.com/aaguasvivas/el-corre-corre` (private). The game is fully playable:
continuous steering, all six traffic archetypes, wave spawner with anti-wall
validation, near-miss combos with the slang ladder, contra vía ×2 with
CV-targeted hostile spawns, held caballito (bikes) and derrape (Civic) at
×1.5, obstacles, power-ups, La Cinta del Récord, the full Malecón world with
bend-field S-curves, the 120 BPM dembow with phrase variation, complete SFX,
three vehicles with per-vehicle récords, distance multiplier tiers, share
card, close-call line, haptics wrapper, ES/EN toggle.

**Signed off by Adelson:** Phase 1 steering ("smooth and precise"), Phase 3
world ("looks amazing"), Phase 4/5 direction ("much improved, trending
upwards").

**Open verdicts (do not re-litigate, just await/collect):**
- Feel round 2: does contra vía now feel like a constant gamble; does dying
  deep (multiplier zone) trigger instant restart; does the derrape feel right;
  does the varied dembow survive 3-minute runs.
- Difficulty is a standing iteration thread across the whole project. Adelson
  gives verdicts in plain words; map them to CONFIG knobs (section 7).

**What remains:** Phase 6 (ship prep, section 5), the Capacitor iOS wrap
(section 5.4), optionally Phase 7 Los Tramos (section 6), then App Store prep
from the post-launch roadmap in CLAUDE.md.

---

## 2. Working agreement (how Adelson works, non-negotiable)

1. Phases in order; the game runs and is playable after every unit of work.
   Commit per phase or per coherent feature round; push to origin main.
2. `src/config.ts` `CONFIG` is the ONLY tuning surface. Every feel-critical
   number lives there with a `// FEEL:` comment. Ambiguous design calls: decide
   in the spirit of the vision, leave `// DECISION:` comments, keep moving.
3. **Nothing is "done" until verified where Adelson will see it**: run it in
   the browser, drive it with the `__ecc` hooks, screenshot the proof, keep the
   console clean, and `npm run build` clean. Committed is not done.
4. End every phase with a short PLAYTEST NOW note (3 to 5 feel checks) in
   PLAYTEST.md, and keep that file's history of passed phases.
5. All user-facing text: Spanish-first with full EN parity for gameplay copy
   (section 8). Never use em dashes in any user-facing text. UI must be
   polished at phone size: no overlaps, no clipped text.
6. Before calling the game release-ready, run the `ship-audit` skill
   (Adelson's global rule) and the full QA checklist in CLAUDE.md.
7. Keep auto-memory current (section 10) so the next session starts warm.

---

## 3. Architecture map

Stack: Vite 6 + TypeScript strict (TS 7 npm package) + three.js r185, no other
runtime deps except the bundled Lilita One font. Node 18 on this machine, so
do not bump Vite to 7. `npm run dev` (port 5173), `npm run build`
(tsc --noEmit + vite build), `npm run preview` (port 4173). Browser-pane
launch configs exist in `.claude/launch.json` ("dev", "preview").

| File | Owns |
|---|---|
| `src/main.ts` | Bootstrap, state machine (`title/playing/paused/crashing/gameover`), fixed-timestep loop, camera + FOV kick + shake, event wiring between all systems, vehicle selection state, `__ecc` test hooks |
| `src/config.ts` | `PALETTE`, `CONFIG` (the tuning surface), `VEHICLES`, `ROAD` derived geometry |
| `src/world.ts` | Bend-field shader + `worldMaterial()` + `toonMaterial()` + `textTexture()`, sky/sun/lights, sea + shimmer + glint, road chunks, mountains, seawall, 3 scenery belts (instanced facades, colmados, palms, posts, poles, flags, domino, fruit stand, chairs, street sign), obelisco, critters (viralata, chichiguas, pelicans), La Cinta tape + confetti |
| `src/traffic.ts` | Vehicle archetype pools, wave patterns, filler spawner with CV targeting, anti-wall validation, obstacles (hoyo/policia/charco), pickups (platanos/power-ups), near-miss detection, collision query |
| `src/player.ts` | Input (keys + pointer + swipes), steering physics, caballito/derrape state machine, airtime, edge scrape, per-vehicle visuals (moto/pasola/civic), particles (spark/splash/trail/dust), crash tumble + stars |
| `src/score.ts` | Points math with the multiplier stack, combo, per-vehicle records + persistence, distance tiers, close-call |
| `src/audio.ts` | WebAudio graph, dembow sequencer with phrase variation, engine, wash, horns, all SFX, mute persistence, iOS unlock |
| `src/ui.ts` | All DOM: HUD, pills, popups pool, title + vehicle cards, pause, game over, banner, STRINGS es/en, share card canvas |
| `src/haptics.ts` | light/medium/heavy wrapper (navigator.vibrate now, Capacitor Haptics later) |

### Invariants you MUST internalize before editing

- **Axes.** Forward is +z. The world scrolls toward -z (world-moves; player z
  is always 0, x is lateral). +x is the oncoming/sea side. The camera looks
  down +z, therefore **world +x renders on screen LEFT**. Keyboard D and
  rightward drags map to world -x (the sign flip lives once, in player input).
  Lane centers `[-5.1, -1.7, 1.7, 5.1]`; indexes 0-1 yours, 2-3 oncoming;
  shoulders at ±7.5; drivable clamp is `ROAD.edgeX (8.4)` minus per-vehicle
  half width. Contra vía = `x > 0.25 && x < 6.8`.
- **The bend field.** S-curves and the world-drop are a vertex-shader illusion
  (`world.ts` BEND_CHUNK). Gameplay space stays straight, so collision and
  spawn validation are curve-independent, keep it that way. EVERY world-space
  material must be wrapped with `worldMaterial()` (`toonMaterial()` does it
  internally). Never wrap the sun, halo, or sky. If you add any new mesh and
  it visually "detaches" from the road at distance, you forgot the wrap.
- **Fixed timestep.** Sim runs at 1/120 via an accumulator; crash slow-mo
  scales accumulator feed. Never use raw frame dt in gameplay math.
- **Pooling.** Everything that spawns is pooled (vehicles per type, obstacles,
  pickups, particles, popups DOM nodes, confetti). No allocations in hot
  loops; reuse vectors; scenery lives in 3 recycling 120 m belts that
  re-randomize on wrap (beyond fog, so no visible pop).
- **Score multiplier stack** (`score.ts`):
  `mult = (contraVia ? 2 : 1) x (trick ? 1.5 : 1) x vehicle.scoreMult x distTier`
  where distTier is 1/2/3/4 at 0/500/1200/2200 m. Everything routes through it.
- **Tricks.** One shared state machine (hold to sustain, max 4.5 s, cooldown
  = 1.1 + 0.65 x held, release-to-rearm latch). Bikes pitch up and clear
  ground hazards; the Civic yaws sideways instead, gains x1.35 collision
  radius while held, and does NOT clear ground hazards
  (`player.clearsGroundHazards` vs `player.isWheelie`, do not conflate).
- **localStorage schema** (all keys `ecc.v1.*`): `record.{pasola|motor|civic}`,
  `recordDist.{vehicle}`, `platanosLifetime`, `vehicle`, `lang`, `muted`.
  Legacy unsuffixed `record`/`recordDist` migrate to motor once in `score.ts`.
- **Order-sensitive wiring in main.ts.** `ui`, `traffic`, `player` closures
  reference each other across declaration order (safe only because callbacks
  fire later). Keep new cross-references inside callbacks, never at module
  evaluation time.
- **Telegraph invariant is sacred.** Any spawn-distance change must keep
  `visible reaction time >= 1.5 s` at max closing speed (Civic tops out at
  51.2 m/s player + 18 oncoming). `oncBase()` in traffic.ts computes this
  dynamically; do not hardcode.

---

## 4. Testing infrastructure (how quality was kept; use it)

The embedded browser pane often reports `document.hidden = true`, freezing
requestAnimationFrame. The game exposes `window.__ecc` so everything is
testable deterministically anyway:

- `tick(sec)` advances the fixed-step sim (and audio scheduler and one render)
  regardless of rAF. All headless tests are `dispatch input -> tick -> assert`.
- State probes: `state() score() record() x() y() speed() cars() combo()
  platanos() cv() wheelie() airborne() powerups() worldDist() vehicle()
  distMult() radius() fov() audio() info()` (info = draw calls + triangles).
- Actions: `start() crash() selectVehicle(id) share() dog()` (viralata now).
- Deterministic spawns: `spawnVehicle(type, lane, z, dir, exactX?)`,
  `spawnObstacle(kind, x, z)`, `spawnPickup(kind, x, z, y?)`. Pass `exactX` to
  kill lane jitter in tests.
- Test cheats: `setRecordDist(m)` (place La Cinta), `setDistance(m)` (jump the
  distance-multiplier tiers).
- Input in tests: dispatch real `KeyboardEvent`/`PointerEvent` on window
  between ticks (steering keys KeyA/KeyD/Arrows, trick hold Space/KeyW,
  Space/Enter menus, KeyM mute, title ArrowLeft/Right vehicle select).

**Recipes that already exist and work:**
- Steer to a lane: tap KeyA/KeyD in 0.06 s ticks until `|x - target| < 0.3`.
- Guaranteed near-miss: anchor at an edge, `spawnVehicle('sedan', 0, 40, -1,
  x_anchor + 1.85)` and tick ~2 s.
- IMPORTANT: there is no safe parking spot anymore (shoulders spawn parked
  guaguas/carts; both lane types get traffic). Test runs die; design tests to
  restart on `state() !== 'playing'`.

**Baselines to preserve (re-measure after perf work, flag regressions).**
Updated at the end of Phase 6; the older numbers below it are kept for history.
- Parked-bot survival, 9 runs each, 45 s cap: own lane median 45 s (6 of 9
  reach the cap), contra vía median 25.2 s. CV must stay clearly deadlier.
- Rendering: median ~107 draw calls, p90 ~125, max ~139, ~30 k triangles,
  pixelRatio capped at 2. The record-tape confetti burst adds +3, not +46.
- Soak: 20+ min of sim and 300+ runs with DOM node count flat, heap
  sawtoothing without trend, and correct rendering past 30 km.
- Build: clean tsc, single ~620 kB js chunk (~164 kB gzip; the vite chunk-size
  warning is accepted).
- Zero console errors or warnings ever (three.js deprecations count).
- Pre-Phase-6 history: draw calls were median 195 / p90 218 / max 230, and
  bot survival was measured with a different bot, so do not compare directly.

**Testing gotcha:** `__ecc.speed()` returns the BASE ramp speed, not the
effective speed. Pothole, scrape and cafecito modifiers apply to `effSpeed`.
To measure what the player actually feels, differentiate `worldDist()` over a
window of at least 0.5 s (it is integer-quantised, so single-tick deltas
alternate between 0 and full).

**Per-change verification ritual:** `npx tsc --noEmit` -> reload pane ->
scripted `__ecc` asserts for the changed behavior -> screenshot anything
visual (desktop + 375x812 portrait) -> `npm run build` -> commit with a
descriptive message ending in the standard Claude Code co-author line.

---

## 5. PHASE 6: Ship prep, done except the Capacitor wrap

Completed and pushed: the perf pass (5.1), the soak (5.2), the runtime half of
the QA checklist (5.3), the Game Center hook and the app icon (5.4 partial),
plus 30 findings from a five-dimension read-only audit. See PLAYTEST.md for
the evidence table and `git log` for the per-area commits.

**Still open in Phase 6:**
1. The Capacitor iOS wrap itself, 5.4 steps 1 to 5 and 7. Blocked only on
   Adelson confirming the bundle id.
2. The `ship-audit` skill run (5.5) before anyone says "release-ready".
3. Everything marked REAL DEVICE in 5.3.

`node tools/make-icons.mjs` regenerates `public/icon-1024.png` (the Capacitor
and App Store source) and `public/icon-180.png` (apple-touch-icon) from the
locked palette with no dependencies and no browser. Edit the draw calls in
that file to change the icon; it is deterministic.

### Original plan, kept for reference

Goal per CLAUDE.md: performance audit, 10-minute soak, Capacitor readiness,
full QA checklist, leaving a clean Game Center hook. Done when every box in
the CLAUDE.md quality bar is checked with evidence.

### 5.1 Performance audit targets

Work through these, measuring `__ecc.info()` + a 60 s `tick`-driven run
before/after each (see also the audit-findings appendix, section 11, for
file-precise targets):

1. **Critter draw-call consolidation.** Pelicans are ~7 meshes x 3, chichigua
   groups ~10+ meshes x 2, viralata ~12 meshes. Merge each critter's static
   parts into 1-2 vertex-colored geometries (pattern: `paint()` +
   `mergeGeometries` as used by belt variants), keeping only animated parts
   (tail, kite) separate. Target: 30+ fewer draw calls.
2. **Player vehicle rebuild hygiene.** `Player.setVehicle` disposes child
   geometries but rebuilds fresh ones each call; cache the three built
   visuals once and swap visibility instead (also kills a frame hitch on
   selection).
3. **Popup/DOM audit.** Popups are pooled; verify no layout thrash beyond the
   intended reflow trigger (`void offsetWidth`), and that `setScore` remains
   change-gated.
4. **Audio node churn.** Fire-and-forget nodes are fine, but confirm counts:
   at full intensity the sequencer + riff spawns ~20 nodes/s; verify no
   audible degradation over 10 minutes and that suspended contexts spawn
   nothing.
5. **Texture/material sweep.** Confirm every CanvasTexture is created once
   (none in hot paths), material caches are shared, and nothing sets
   `needsUpdate` per frame except shimmer offsets (which are cheap uniform
   updates, fine).
6. **Shadow budget.** One 1024 map, PCF. If phone profiling shows cost,
   fallback plan from the brief: blob shadows under vehicles; do not spend
   this unless a device test demands it.

### 5.2 Ten-minute soak

Scripted soak (bot + restarts) for 10 real minutes on the live rAF loop where
possible, else `tick`-driven: assert stable `info().calls`/`tris` envelope, no
listener growth, no detached DOM, flat JS heap trend (`performance.memory`
where available), records intact across many crash/restart cycles, no z/float
drift artifacts (world-moves architecture should make drift impossible; verify
`worldDist` > 15 km still renders correctly, especially the bend field, which
uses distance as phase: sin() of large numbers stays fine at these magnitudes,
but confirm visually at 20 km+).

### 5.3 Full QA checklist

Execute the CLAUDE.md "Quality bar" checklist top to bottom and record
evidence per item in PLAYTEST.md. Items needing REAL DEVICE (Adelson's phone):
60fps feel, safe-area insets on notched iPhone, touch steering + swipe
tricks, audio unlock on first tap, share sheet, haptics (Android web
vibrates; iOS web silently no-ops, correct).

### 5.4 Capacitor iOS wrap

1. `npm i @capacitor/core @capacitor/ios @capacitor/haptics && npm i -D @capacitor/cli`
2. `npx cap init "El Corre Corre" dev.coachable.elcorrecorre --web-dir dist`
   (confirm bundle id with Adelson first).
3. `npm run build && npx cap add ios && npx cap sync`.
4. Swap `src/haptics.ts` internals to the Capacitor Haptics plugin behind the
   same three functions with dynamic import + web fallback (the file was
   designed for exactly this).
5. Verify in the wrap: viewport-fit/safe-areas, no scroll bounce, audio
   unlock on first touch (WKWebView needs the same gesture rule), pause on
   `visibilitychange` (already wired), orientation behavior, status bar style.
6. Game Center: leave the clean hook only. Create `src/leaderboard.ts`
   exporting `submitScore(points, vehicle)` + `isAvailable()` that no-op on
   web; call `submitScore` in `finishRun` flow. Actual GC plugin wiring is
   post-wrap work per the brief.
7. Only Adelson can do: Apple accounts, signing, TestFlight, physical-device
   runs. Prepare everything up to `npx cap open ios`.

### 5.5 Release gate

Run the `ship-audit` skill against the built app + checklist evidence before
using the words "release-ready" anywhere. Fix what it finds, re-verify,
commit "Phase 6: ship prep" with the evidence summary, push.

---

## 6. PHASE 7: Los Tramos (optional for v1; decide with Adelson after Phase 6)

Route variety: theme transitions every ~1.2 km. The architecture is ready for
this: scenery belts re-randomize on recycle, so theme = a parameter consulted
during `Belt.fill()` + a palette/asset set per tramo.

Implementation sketch (content, not surgery):
1. `type Tramo = 'malecon' | 'zona' | 'campo'`; current theme derives from
   `world.distance` bands (like the obelisco milestone logic); belts capture
   the theme at fill time so transitions happen at belt seams (~120 m blend,
   reads as arriving somewhere).
2. Per-tramo deltas, all inside world.ts: **La Zona**: no sea/seawall side
   swap? No: keep the sea (the malecón borders the Zona anyway) but swap
   facades to balconied colonial variants, wrought-iron lamps instead of power
   poles, cobble-toned road texture variant (second CanvasTexture, swap
   chunk material map per theme), narrower feel via denser building fronts.
   **El Campo**: replace facades with wooden campo houses + plátano field
   rows (instanced), frituras stands, chickens as a new critter that scatters
   AWAY from the road (never collidable, same rule as the viralata).
3. Road texture per theme: prebuild 2-3 textures at boot; chunk material
   swaps at theme boundary (chunks recycle every 30 m, so swap on recycle for
   a clean seam).
4. Traffic/obstacle mix per tramo (config weights keyed by tramo).
5. Done when a 3-minute run tours all three and each is recognizable in one
   screenshot. Add a PLAYTEST NOW note.

---

## 7. Feel-tuning playbook (Adelson's verdicts -> knobs)

Adelson speaks in feel; translate via CLAUDE.md's tuning guide plus these
newer knobs (all in `src/config.ts`):

| Verdict | Knobs |
|---|---|
| "still too easy / too hard" | `speedRampPerSec` (0.12), `trafficDensityStart` (0.5), `densityRampSec` (70), `spawnsPerSecAtFull` (1.7), `trafficMaxActive` (27), pattern intervals |
| "contra vía not risky enough / too brutal" | `oncomingShare` (0.5), `cvTargetBias` (0.65), oncoming speed range |
| "trick too strong / weak" | `wheelieMultiplier` (1.5), `wheelieMaxSec`, steer factors, `driftHitboxMult` (1.35), cooldown pair |
| "runs pay too little / too much late" | `distMultTiers` |
| "beat feels X" | `audioBpm` (120), `riffVolume`, layer thresholds `comboHatsAt/comboBassAt`, pattern arrays in audio.ts |
| "speed doesn't thrill" | `fovSpeedKick` (6), `fovCafecito`, camera knobs |
| Vehicle identity | `VEHICLES` table (speedCap/speedMult/scoreMult/hitbox/accel/latMax) |

After ANY tuning round: re-run the baseline bots (section 4) and update the
baselines here if the change is intentional.

---

## 8. Copy and localization rules

- STRINGS lives in ui.ts with es/en tables; `t()` picks by persisted lang.
  Everything gameplay-facing must exist in both (popups, pills, ladder,
  labels, buttons, share card). The logo, colmado signs, guagua banner, tape
  texture, and power-up NAMES (Cafecito, Bendición, Imán) deliberately stay
  Spanish in EN mode; the slang ladder translates.
- Exact copy strings for screens are canon in CLAUDE.md; do not restyle them.
- No em dashes anywhere user-facing. Spanish uses inverted punctuation
  correctly. Keep the Dominican voice (vamo', pa', tíguere) in ES.

---

## 9. Known accepted quirks (do not "fix" without cause)

- Shadow pass does not follow the bend field (depth pass unbent): offsets are
  imperceptible at current amplitudes; accepted.
- Static mountains do not parallax (they read as infinitely far; intended).
- The vite chunk-size warning (three.js single chunk) is accepted for v1.
- `fps()` in the hidden pane is a stale EMA; only trust it when the pane is
  visible, or measure on device.
- Audio first-tap click may be silent (context resume race on the very first
  gesture); by design, harmless.
- Traffic wheels do not spin (DECISION comment in traffic.ts; revisit only if
  a close-up feature demands it).

## 10. Memory + session ritual

Auto-memory lives at
`~/.claude/projects/-Users-Adelson-Desktop-personal-el-corre-corre/memory/`
(`MEMORY.md` index + `el-corre-corre-status.md`). Update the status file at
the end of every session: what shipped (commit hash), what verdicts are
pending, what is next. Keep the `__ecc`/rAF-freeze note there forever; it is
the key to testing in this environment.

Session start: read the docs in the order given at the top of this file,
start the dev server, run a 30-second smoke via `__ecc` (start, tick, spawn,
crash, restart, check console). Session end: typecheck, build, verify,
commit, push, update PLAYTEST.md + memory.

## 11. Appendix: file-precise Phase 6 targets (author-verified at `a26eee8`)

Written by the model that authored the code; verify counts with
`__ecc.info()` before and after each change.

**Draw-call consolidation (biggest win, ~35 to 45 fewer calls):**
- `world.ts` `Pelican`: ~7 meshes each, 3 pooled. Merge body/head/beak/wings
  into one vertex-colored geometry (use `paint()` + `mergeGeometries` exactly
  like the belt variants); the glide animation only moves the group, so
  nothing needs to stay separate.
- `world.ts` `Chichigua`: 2 pooled groups of ~10 objects (2 kids = 4 meshes,
  kite sail + spar + 3 bows, line). Merge the kids into one geometry; merge
  sail + spar + bows into one kite geometry (it animates as a unit); keep the
  `THREE.Line` separate.
- `world.ts` `Viralata`: ~12 box meshes. Merge everything except the tail
  (which wags via its own rotation).
- `player.ts` particles: 30 meshes toggled by visibility; acceptable, but
  they render as separate draws when alive. Only revisit if device profiling
  demands it (an InstancedMesh port is straightforward).

**Correctness/hygiene:**
- `player.ts` `setVehicle`: disposes and rebuilds geometry every call. Build
  the three rigs once, parent-swap visibility. Kills a selection-time hitch
  and any dispose-order risk.
- `traffic.ts` pools build merged geometry per archetype at boot; correct.
  Do not per-frame anything there; the only per-frame work is position/blink.
- `audio.ts`: fire-and-forget node churn is ~20 nodes/s at full intensity,
  standard WebAudio practice; confirm no growth in a 10-minute soak (bar
  counter and layer gains are the only persistent state).
- `ui.ts` popups/score are pooled and change-gated; verified during
  development. The only intentional reflow is the `void offsetWidth`
  animation-restart trick.

**Capacitor readiness, current truth:**
- Already done in code: `base: './'` (vite.config.ts), viewport-fit=cover +
  user-scalable=no (index.html), `env(safe-area-inset-*)` throughout
  style.css, `touch-action: none` + overscroll containment, pause + persist
  on `visibilitychange` (main.ts + audio.ts suspend), AudioContext unlock on
  first gesture (audio.ts), relative asset bundling incl. the font (zero
  network at runtime), haptics behind `src/haptics.ts`.
- Not done (Phase 6 work): Capacitor packages/init/ios platform, the
  Haptics-plugin swap inside haptics.ts, `src/leaderboard.ts` Game Center
  no-op hook, app icons + splash (draw from the logo/palette on canvas,
  export PNGs), orientation decision (recommend portrait-primary lock),
  status-bar style, real-device passes.
- Only Adelson can do: Apple developer account, signing, TestFlight,
  physical-device feel test.

## 12. Note for Opus 5 Ultracode

You have standing multi-agent orchestration. Spend it where it compounds:
fan out read-only auditors before big refactors, adversarially verify perf
claims (before/after `__ecc.info()` numbers), and cold-review your own
diffs. Do NOT spend it re-deriving context that is already in this file,
CLAUDE.md, or PLAYTEST.md. Keep single-agent for mechanical edits. Respect
the per-change verification ritual (section 4) exactly; it is why quality
held through five phases. When Adelson gives a feel verdict in plain words,
translate through section 7 and change CONFIG only.
