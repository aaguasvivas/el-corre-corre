# EL CORRE CORRE — Build Brief & Phased Plan
> Drop this file in the repo root as `CLAUDE.md` (or `AGENTS.md`). It is the living source of truth: vision, spec, phase plan, and quality bar. Build the phases **in order**. The game must run and be playable at the end of every phase.
---
## The vision
**El Corre Corre** — you're on a motor flying down the Malecón of Santo Domingo at golden hour, weaving through Caribbean traffic. Overtake guaguas, thread the gap between a carro público and a plátano truck, swing into the oncoming lane because that's how it's done, pop a wheelie over a pothole, collect plátanos, and chase your récord while a dembow beat pumps.
**Cultural grounding (commit to it):** "El corre corre" is Dominican slang for the daily hustle — the rush, the beautiful chaos. The game must radiate *dominicanidad*: pastel colonial facades, colmados with hand-painted signs, guaguas with roof racks and "Dios es mi guía" windshield banners, motoconchos, the turquoise Caribbean on the left, palms, tangled power lines, flags, and UI copy in Dominican Spanish. This is not a generic city runner with a palm tree.
**Success is three things:**
1. **Fun in 10 seconds** — no tutorial, no menus in the way. Tap, ride, dodge, grin.
2. **Addictive** — the one-more-run loop of Subway Surfers / Temple Run: die, laugh, instantly restart, beat your récord.
3. **Proudly Dominican** — a Dominican player smiles in the first 30 seconds because they recognize home; everyone else falls in love with a place.
**Feel references:** Subway Surfers' score-chasing pull + Alto's Adventure's visual serenity — but Caribbean, warm, loud, and funny. **Critically: NOT lane-based.** Steering is continuous across the full road width. The player *carves* through traffic like an open-terrain snowboarding game; they never snap between lanes.
**The signature mechanic — En Contra Vía:** deliberately riding in the oncoming lanes doubles all points while cars scream past. Risk = score. Mechanically it's the risk/reward hook every great runner needs; culturally it's the most Dominican thing a driving game could do.
---
## What makes this addictive (design north stars)
These principles outrank any individual feature. When in doubt, decide in their favor.
1. **Every death is the player's fault.** Telegraph invariant: the player always has ≥ 1.5 seconds to react to anything that can kill them. Derive spawn distance and fog from max closing speed (player max + oncoming speed) so this holds even late-game. A death that feels unfair ends the session; a death that feels earned starts the next run.
2. **Restart friction ≈ zero.** Crash → slow-mo → game-over card with a big **OTRA VEZ** button reachable and responsive within 0.5s. One tap, new run, instantly. This single interaction is worth more than any feature.
3. **Variable reward every few seconds.** Near-miss combos with an escalating slang ladder are the dopamine tick. The game should celebrate the player constantly for skilled play.
4. **Visible progress against yourself — La Cinta del Récord.** A finish-line tape stretched across the road at your all-time best distance, visible from afar ("TU RÉCORD" printed on it). Bursting through it = flag-color confetti + **"¡NUEVO RÉCORD!"** — and every meter after is new territory. Racing your own ghost line is the core retention loop.
5. **Session shape.** A brand-new player's first run lasts ≥ 20s (gentle first 15 seconds). Skilled runs settle around 2–4 minutes at ramped difficulty. Tune the difficulty curve to that shape.
6. **Risk = score, everywhere.** Contra vía ×2, near-misses, wheelies, airtime. Safe play survives; brave play scores. The scoring system should constantly whisper *"acércate más."*
---
## Ground rules
1. **Stack:** Vite + TypeScript (strict) + Three.js (npm). No other frameworks, no physics engine. UI is a DOM/CSS overlay above the WebGL canvas.
2. **Offline-first, procedural-first — but not procedural-only.** The one hard rule: zero runtime network fetches; everything ships in the bundle so the Capacitor build works fully offline. Default to procedural (primitive geometry, locked palette, canvas-drawn textures, WebAudio synthesis) because it's fast and visually coherent — the locked palette is what makes procedural look *intentional*. But upgrade with **bundled local assets** wherever they raise quality: vendor an OFL-licensed heavy display font into `public/fonts/` for the logo and HUD (typography carries the game's personality — pick something with Caribbean poster energy; system stack as fallback), and swap in real models, textures, or audio later without touching systems. Procedural is the floor, not the ceiling.
3. **Performance:** 60fps on a mid-range phone. Object pooling for everything that spawns. `InstancedMesh` for repeated scenery. `renderer.setPixelRatio` capped at 2. One shadow-casting directional light (1024 map) — or fake blob shadows under vehicles if the budget demands. Zero per-frame allocations in hot loops; reuse vectors.
4. **Capacitor-ready for iOS from day one:** `base: './'` in `vite.config.ts`, resize/orientation handling, `touch-action: none` + no scroll/bounce on the canvas, `env(safe-area-inset-*)` in HUD CSS, pause game + audio on `visibilitychange`, AudioContext unlock on first gesture.
5. **Spanish-first.** All visible text in Dominican Spanish, have English too, you can flip back and forth (exact strings in the spec).
6. **World-moves architecture:** player stays near origin; the world scrolls toward them (no float drift on long runs).
7. **Rating-friendly:** crashes are cartoon-comedic (tumble + stars, no blood). People and animals can never be hit — only vehicles and road hazards collide.
---
## Working agreement (how to build)
- Build phases **in order**; the game runs and is playable at the end of every phase. Commit per phase.
- `src/config.ts` exports `CONFIG` — the **only** tuning surface. Every feel-critical number lives there with a `// FEEL:` comment explaining what it changes.
- When a design question is ambiguous, decide in the spirit of the vision, leave a `// DECISION:` comment, and keep moving. Don't stop to ask.
- End every phase by writing a short **PLAYTEST NOW** note (3–5 specific things the human should feel-test before the next phase begins).
- Don't build ahead of the current phase (no audio in Phase 1, no menus in Phase 2). Depth over breadth: a smaller game that feels incredible beats a feature-complete game that feels okay.
- Fixed-timestep simulation with interpolated rendering (or at minimum clamp `dt`) so feel is framerate-independent.
**Architecture:**
```
src/
  main.ts      // bootstrap, resize, loop, state machine (title/playing/paused/gameover)
  config.ts    // CONFIG — every tunable
  world.ts     // road chunks, scenery instancing, recycling, landmarks, record tape
  traffic.ts   // vehicle archetypes, obstacles, wave patterns, survivable-path validation
  player.ts    // input, steering physics, wheelie, collisions, crash sequence
  score.ts     // scoring, combo, contra vía, popups, records, persistence
  audio.ts     // dembow sequencer, engine, bocinas, sfx, intensity layers
  ui.ts        // DOM screens, HUD, copy strings, share card
```
---
## The phases
### Phase 0 — Scaffold
Vite + TS strict + Three.js. Render loop, state machine, resize/orientation, canvas + DOM overlay shell, `CONFIG` in place, golden-hour directional light + fog + gradient sky.
**Done when:** a colored world with a road plane scrolling under the camera, 60fps, no console noise.
### Phase 1 — The spine (core feel) ⭐ the most important phase of the project
The road (4 lanes + shoulders), automatic forward motion with speed ramp, **continuous lateral steering** (touch drag + A/D) with rider lean and slight camera roll, edge scrape (clamp + sparks + speed penalty — edges never kill), one generic traffic sedan in both directions, circle-vs-rect collision in the (x,z) plane, crash → 0.5s slow-mo → game-over card → instant **OTRA VEZ**, score = distance, récord in `localStorage`, minimal HUD.
**Done when:** *you catch yourself taking one more run during testing.* If steering doesn't feel drifty-smooth-precise, stop and tune `CONFIG` before proceeding — nothing built later can compensate for a core that doesn't feel right.
**PLAYTEST NOW:** twitchy or floaty? any death feel cheap? does dodging feel like *carving*? does the speed ramp create tension?
### Phase 2 — Risk & reward systems
All vehicle archetypes (guagua, carro público, camión de plátanos, civic tuneado, motoconchos, stopped guagua on shoulder). Wave-pattern spawner with survivable-path validation and the telegraph invariant. Near-miss detection + combo + slang popups. **EN CONTRA VÍA ×2** with pulsing indicator, breathing red vignette. Obstacles: hoyos, policías acostados (airtime!), charcos, vendor carts. Wheelie (clears ground hazards, style points, cooldown). Plátanos in strings and arcs. Power-ups: Cafecito, Bendición, Imán. Full scoring model. **La Cinta del Récord** in-world.
**Done when:** the risk/reward loop is complete — brave play visibly and dramatically outscores safe play.
### Phase 3 — El Malecón (world & dominicanidad)
Sea with wave shimmer and sun glints, seawall, leaning palms, pastel colonial facades, colmados with canvas-drawn signs, tangled power lines, the Obelisco every ~800m, distant mountains, Dominican flags. Ambient sidewalk life (never collidable): domino table, fruit vendor with umbrella, kids flying a chichigua, pelicans, and the viralata that darts toward the road but always stops short. All instanced/pooled. **Gentle long S-curves** via a lateral spline on road chunks — traffic follows lane splines, and the spawner's gap validation becomes curve-aware. Keep it subtle: the road should breathe, not slalom. If that lands cleanly, add a soft world-bend vertex shader (the distant road curls below the horizon) for that alive, endless feel.
**Done when:** a screenshot at any random moment looks like a poster, and a Dominican player recognizes home instantly.
### Phase 4 — El sonido del barrio
Dembow sequencer (grid in the spec) with intensity layers tied to combo and contra vía. Engine sawtooth tracking speed, rev on wheelie. Traffic bocinazos with pass-by pitch bend. Full SFX set. Quiet wave wash. Mute persisted; iOS audio unlock.
**Done when:** playing with sound is clearly more fun than muted, and the music visibly swells with your combos.
### Phase 5 — Juice, vehicles & retention
Full juice pass: eased popups, tire-dust when carving, splashes, sparks, shake scaled to severity, FOV speed kick, confetti, and **haptics** via the Capacitor Haptics plugin (light tick on near-miss, medium on pickup, heavy on crash — graceful no-op on web). The three vehicles with real handling differences + stat cards + **per-vehicle récords**. Final title / pause / game-over screens with the exact copy below. **Share card:** canvas-rendered image (score, distance, vehicle, logo, flag colors) via Web Share API with download fallback — built for the group chat.
**Done when:** it feels like a 4.8-star game, and someone would share their card unprompted.
### Phase 6 — Ship prep
Performance audit (pooling coverage, zero hot-loop allocations, instancing, shadow budget). 10-minute soak run: no leaks, no drift, no GC hitches. Capacitor readiness verified (relative base, safe-area, visibility pause, touch behavior, haptics wired). Leave a clean hook for Game Center leaderboards (Capacitor plugin after the iOS wrap; web falls back to local records). Full QA checklist below, every box.
### Phase 7 (optional for v1 — otherwise first post-launch) — Los Tramos
Route variety: the world transitions every ~1.2km between themed *tramos*, each a palette-and-scenery shift on the same chunk system. **El Malecón** (default — sea, palms, Obelisco) → **La Zona** (colonial: narrower feel, cobble-toned asphalt, balconied facades, wrought-iron lamps) → **El Campo** (carretera: plátano fields, brightly painted wooden campo houses, roadside frituras, chickens that scatter safely off-road). Architecture note: make theme a parameter on chunk generation from day one, so this phase is content, not surgery.
**Done when:** a 3-minute run tours the country, and each tramo is recognizable at a glance.
---
# Design spec (reference)
## Art direction
**Look:** chunky low-poly, flat or toon shading (`MeshToonMaterial` with a 3-step gradient map, or flat-shaded Lambert). No PBR, no default-gray materials anywhere — every object gets a deliberate color. Golden hour: warm sun low over the sea, long soft shadows, warm fog fading the road into a peach horizon.
**Palette (locked — tune only if cohesion demands):**
| Element | Hex |
|---|---|
| Sky top | `#6EC6E6` |
| Sky horizon / fog | `#FFD9A0` |
| Sun glow | `#FFF3C4` |
| Sea near / deep | `#17A2B8` / `#0E7490` |
| Asphalt | `#3E3A38` |
| Center line (yellow, DR roads) | `#F4C430` |
| Lane dashes | `#F2E9DC` |
| Sidewalk / seawall | `#D9C7A7` |
| Building pastels | `#A8E6CF` `#FFD3B6` `#FF8B94` `#FFEAA7` `#B3D9FF` `#CDB4DB` |
| Colmado accents | `#E63946` `#2A9D8F` |
| Palm trunk / fronds | `#8D6E63` / `#43A047` |
| Plátano green | `#7CB342` |
| Flag accents (flags, confetti, logo) | `#002D62` `#CE1126` `#FFFFFF` |
**Scene layout (left → right):** sea with animated glint → seawall with posts → leaning palms → sidewalk with ambient life → **road: 2 lanes yours + 2 oncoming** → far sidewalk → pastel facades and colmados → power lines → mountain silhouette in haze.
**Vehicles are boxes and cylinders with personality:** guagua (yellow `#F4C430`, roof rack, slight lean, hazard blink when stopped, "Dios es mi guía" banner), carro público (beat-up beige `#D6CCC2` Corolla shape, mismatched door, taxi sign), camión de plátanos (olive flatbed stacked with instanced `#7CB342` bunches), civic tuneado (low, wide, big spoiler, loud color, glowing underglow), motoconchos (sometimes with a side-saddle passenger). Wheels spin, vehicles bob, drivers are capsule head+torso. The player rider leans into turns, lifts the front wheel on wheelies, tumbles comically on crashes (cartoon stars).
## Mechanics detail
- **Movement:** forward speed automatic (ramps per CONFIG), no brakes — el corre corre never stops. Lateral steering = velocity-target model with acceleration and damping (drifty-smooth). Touch: horizontal drag anywhere maps to lateral target. Desktop: A/D or arrows.
- **Edges:** clamp with scrape — sparks, harsh grind, 20% speed penalty 1s, combo reset. No edge deaths.
- **Wheelie:** swipe up / W / Space. 0.8s, 2.5s cooldown. Immune to potholes and speed bumps, steering authority −40%, +style points.
- **Collisions:** player circle vs vehicle rects in (x,z). Height ignored except airborne (airtime clears ground hazards only, never vehicles). Vehicle hit = crash unless a Bendición shield absorbs it (golden flash).
- **Near-miss:** pass within `nearMissRadius` of a vehicle without touching → popup ("¡Cerquita!" / "¡Por un pelito!" alternating), +points, combo +1. Combo decays after 4s without a near-miss.
- **En Contra Vía:** while player x is inside oncoming lanes → all points ×2, indicator pulses, red vignette breathes, extra percussion layer. 
- **Obstacles:** hoyos (jolt, −30% speed, shake, combo reset — unless wheelieing), policías acostados (launch → airtime points), charcos (splash + steering −50% for 0.4s), vendor carts narrowing shoulders.
- **Power-ups (bobbing pickups):** Cafecito — 5s speed boost + invincibility glow + golden trail. Bendición — one-hit shield aura, lasts until used, warm bell chord on pickup. Imán — 8s plátano magnet.
- **Traffic behavior:** same-direction slower than you (always overtaking); oncoming at genuine closing speed but telegraphed per the invariant. Lane drift within lanes (Dominican lane discipline), never unfair teleports or turns.
## Scoring & the slang ladder
- Distance +1/m · plátano +10 · near-miss +25 × combo · airtime +15/s · wheelie +5/s — **everything ×2 en contra vía.**
- Floating popups at event locations (world→screen projected), eased, staggered so they never stack unreadably.
- **Combo ladder** (popup text at these counts, size/energy escalate): 2 **"¡Eso!"** · 3 **"¡Duro!"** · 5 **"¡Diablo!"** · 7 **"¡Tú ta' loco!"** · 10 **"¡ETE E' UN LOCO!"** · 15 **"¡LEYENDA DEL MALECÓN!"**
- Game over: Puntos (big), Récord, Distancia, Plátanos. All-time + per-vehicle records persist in `localStorage`.
- New record: burst through La Cinta del Récord → flag-color confetti + **"¡NUEVO RÉCORD!"**
## Difficulty & spawning
- Speed: base 18 m/s → cap 42, ramp per CONFIG. Traffic density on its own curve. First 15 seconds gentle.
- **Pattern-based waves, never pure random** — runs should feel authored: `convoy`, `zigzag`, `guaguaStop`, `oncomingSwarm` (contra-vía bait), `breather` (light traffic + plátano arcs), `hoyoField`.
- **Sacred rule:** before committing a wave, validate a continuous gap ≥ 1.7× player collision width. Never spawn an unavoidable wall.
- Telegraph invariant check: `spawnAhead / (playerMax + oncomingSpeed) ≥ 1.5s` — if the ramp breaks this, extend spawn distance dynamically.
## CONFIG starting values
```ts
export const CONFIG = {
  // Forward motion
  baseSpeed: 18, maxSpeed: 42, speedRampPerSec: 0.07,
  // Steering — FEEL: drifty-smooth, not twitchy
  lateralMaxSpeed: 9, lateralAccel: 38, lateralDamping: 6.5,
  steerLeanMaxDeg: 22, cameraRollMaxDeg: 4,
  // Road: 4 lanes, +x = oncoming side
  laneWidth: 3.4, lanesSame: 2, lanesOncoming: 2, shoulderWidth: 1.6,
  // Camera
  camBack: 6.2, camUp: 2.8, camLookAhead: 8, fovMobile: 68, fovDesktop: 60,
  camDamping: 6, fovSpeedKick: 6,
  // Atmosphere
  fogNear: 60, fogFar: 140,
  // Spawning
  spawnAhead: 150, despawnBehind: 15, telegraphMinSec: 1.5,
  trafficDensityStart: 0.35, trafficDensityMax: 1.0, densityRampSec: 120,
  gentleStartSec: 15,
  // Mechanics
  nearMissRadius: 1.2, comboDecaySec: 4,
  wheelieDurationSec: 0.8, wheelieCooldownSec: 2.5,
  potholeSpeedLoss: 0.3, scrapeSpeedLoss: 0.2, contraViaMultiplier: 2,
  // Power-ups
  cafecitoSec: 5, imanSec: 8, imanRadius: 6,
} as const;
```
## Audio spec (100% WebAudio synthesis)
- **Dembow, ~108 BPM, 16-step bar:** kick (sine drop 150→50Hz) on steps `0, 4, 8, 12`; rimshot/snare (bandpassed noise) on `3, 6, 11, 14` — that syncopation IS the dembow gallop; quiet closed hats on even steps.
- **Intensity layers:** hats at combo ≥ 3, bass pulse at combo ≥ 5, extra percussion en contra vía. Layers fade over ~0.3s, never pop.
- **Engine:** filtered sawtooth, pitch/gain track speed; rev flourish on wheelie.
- **World:** occasional two-tone bocinazos with pitch bent by relative speed on pass; very quiet pink-noise wave wash.
- **SFX:** plátano = 3-note marimba run up · near-miss whoosh · scrape grind · crash = noise burst + falling tone · UI click · bendición bell chord.
- Mute toggle persisted. AudioContext resumes on first tap.
## UI copy — exact strings
- **Title:** logo **EL CORRE CORRE** (stacked, chunky, slight italic lean, flag-color accent bar) · subtitle *"¡Dale, que vamo' tarde!"* · **"TOCA PA' EMPEZAR"** (desktop: "DALE A ESPACIO") · Récord · mute.
- **Vehicle cards** (all unlocked, stat bars Velocidad / Manejo / Aguante):
  - **LA PASOLA** — hitbox −25%, best handling, speed cap 36. *"Chiquita pero cumplidora."*
  - **EL MOTOR** (default) — balanced. *"El clásico del barrio."*
  - **EL CIVIC TUNEAO** — +15% speed & score, hitbox +40%, heavier steering, underglow. *"Que se oiga."*
- **HUD:** score top-center (big) · combo counter with slang tier · plátano count · **"¡EN CONTRA VÍA! ×2"** pulsing when active · pause.
- **Pause:** "PAUSA" — Seguir / Menú.
- **Game over:** rotate **"¡Te dieron, loco!"** / **"¡Diablo!"** / **"¡Eso tuvo feo!"** · breakdown · big **OTRA VEZ** · smaller **MENÚ** · Compartir (share card).
- **Share card text:** "EL CORRE CORRE" + score + "en {vehicle} por el Malecón" + subtle "¿Me lo puedes ganar?"
## Dominicanidad backlog (sprinkle wherever fitting)
Colmado name rotation: LA FE · EL PROGRESO · DOÑA TATICA · Banca de lotería storefront · "SE VENDE EMPANADA" sign · cobrador leaning out the stopped guagua ("¡SÚBETE!" speech bubble) · chimi/fritura cart with smoke wisps · plastic chairs on sidewalks · Av. George Washington street sign · DR license plates · chichigua (kite) over the seawall · motoconcho with umbrella rig · domino slam animation at the table · Presidente-green awning (no branding) · Obelisco distance banner.
## Tuning guide (feeling → knob)
| It feels... | Reach for |
|---|---|
| Twitchy | ↓ `lateralAccel` or ↑ `lateralDamping` |
| Sluggish / floaty | ↑ `lateralAccel`, ↓ `lateralDamping` |
| Deaths feel cheap | ↑ `spawnAhead` / `fogFar`, verify `telegraphMinSec`, slow oncoming |
| Boring early | ↑ `trafficDensityStart` or `speedRampPerSec`, shorten `gentleStartSec` |
| Runs end too fast late | ↑ `densityRampSec`, widen validated gap |
| Nauseating camera | ↓ `cameraRollMaxDeg`, ↓ `fovSpeedKick`, ↑ `camDamping` |
| Fast but doesn't *feel* fast | ↑ `fovSpeedKick`, denser lane dashes, speed-line particles |
| Near-misses rarely fire | ↑ `nearMissRadius` — feel beats realism |
## Quality bar — final QA checklist
- [ ] `npm run dev` and `npm run build && npm run preview` both clean, zero console errors/warnings
- [ ] Continuous steering with lean; no lane snapping anywhere; edge scrape works
- [ ] Three vehicles genuinely feel different; per-vehicle récords persist
- [ ] Near-miss combo + slang ladder fire reliably; contra vía ×2 with indicator + audio layer
- [ ] Wheelie clears ground hazards; cooldown enforced
- [ ] Spawner never walls you (watch 5+ min at max density); telegraph invariant holds at max speed
- [ ] Crash → OTRA VEZ restart in under a second, every time
- [ ] La Cinta del Récord appears at best distance; breaking it fires confetti + banner; records survive reload
- [ ] Audio unlocks on first gesture; layers swell with combo; mute persists
- [ ] Share card renders and shares/downloads correctly
- [ ] 10-min soak: stable memory, no drift, smooth with pixelRatio capped
- [ ] Every visible string Spanish; safe-areas respected; page never scrolls/bounces on touch
## Post-launch roadmap (design for it now, build it later)
None of this is v1 — but architect so none of it requires rewrites. **Misiones diarias** (3 rotating: "50 plátanos en una corrida", "10 cerquitas en contra vía", "rompe tu récord en La Pasola"). **Plátanos as soft currency** for *pinturas* — paint jobs and cosmetic trims per vehicle (`score.ts` already counts them; just persist the lifetime total). **More rides** (el camión de plátanos, la guagua as an absurd unlock). **Game Center leaderboards + a weekly Carrera del Malecón** event. **Characters** (el motoconchista, la doñita con su funda de pan). **EN/ES toggle** for the bilingual release. **Night mode** — the atardecer fades into neon night on long runs, Civic underglow finally popping. If Phase 7 didn't ship in v1, Los Tramos leads this list.
## What NOT to do
No lane-snapping. No gray default materials. No night scene by default. No runtime network fetches — everything ships in the bundle. No physics libraries. No login, settings bloat, or tutorials — the game teaches itself in 10 seconds. No hitting people or animals, ever; no blood. Don't build ahead of the current phase. And no meta-systems in v1 (missions, currencies, upgrades, skins) — **record-chasing IS the meta**; everything else lives in the roadmap above until the core is proven.
