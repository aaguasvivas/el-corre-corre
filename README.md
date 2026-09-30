# El Corre Corre

A Dominican arcade runner for the phone. You ride a motor down the Malecón
of Santo Domingo at golden hour, steer through guaguas, carros públicos,
camiones de plátanos and motoconchos, ride en contra vía for double points,
and chase your own récord across the country: El Malecón, La Zona Colonial,
El Campo, and around again.

Vite + TypeScript (strict) + three.js, wrapped for iOS with Capacitor 6. No
other runtime framework, no physics engine, no network: everything ships in
the bundle and the app runs offline.

## What is in the game

- **Steering without lanes.** Drag anywhere to steer; the ride carves across
  the whole road. The edges scrape and slow you, they never kill.
- **Two pedals.** ¡DALE! (GAS) and FRENO (BRAKE) sit at the bottom left for
  the other thumb. Gas is faster and pays x1.5 on all points; the brake is
  slower and pays x0.5, and about 2 s of full brake overheats it (el freno
  caliente).
- **Risk pays.** Contra vía x2, the caballito (derrape in the Civic) x1.5,
  near-misses that need a real dodge, a razor pass (¡Por un pelito!) x2,
  distance tiers up to x4 at 2200 m, and a combo with a slang ladder up to
  ¡LEYENDA DEL MALECÓN!.
- **Traffic with a plan.** A seeded opening, named set pieces (el tapón, la
  caravana, hora pico and more), a road that escalates at 500, 1200 and
  2200 m, and a spawner that never builds an unavoidable wall.
- **Records.** A points record (¡NUEVO RÉCORD! mid-run) and La Cinta del
  Récord, an arch on the road at your best distance. Every ride keeps its
  own records.
- **Los Mandaos.** Three goals at a time, seven levels from Novato to
  Leyenda del Malecón, a barrio multiplier up to x3, and a daily mandao
  with a streak.
- **Las Pinturas.** Four paints to buy per ride with the plátanos you
  collect and the mandao rewards.
- **Three rides.** La Pasola, El Motor and El Civic tuneao, each with its
  own handling and hitbox.
- **Los Tramos.** El Malecón, La Zona Colonial and El Campo, 1 km each,
  with their own scenery, light and music color.
- **Sound.** A synthesized dembow that grows with the combo, plus the
  engine, horns and every effect, all WebAudio.
- **Share.** COMPARTIR draws a card with a photo of your crash and opens
  the iPhone share sheet (Web Share or a download on the web).
- **Spanish first,** with a full English toggle on the title screen.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

Desktop: A/D or left/right to steer, up/down for gas and brake, hold W or
Space for the caballito (derrape in the Civic), P or Escape to pause, M to
mute. Phone: drag to steer with one thumb, hold ¡DALE! or FRENO with the
other, swipe up and hold for the trick.

## Test it

```bash
npm test           # vitest: 11 files, 108 tests
npm run check      # typecheck + tests
```

The unit tests encode the rules the brief calls sacred (the telegraph
window at the gas ceiling, the hazard fog, no unavoidable walls, no
near-miss for a parked rider) and the game systems (scoring, records, the
brake heat, Los Mandaos, the save backup, the share path, the HUD lane and
copy parity in ES and EN).

Everything else is verified live: the dev server (and `npm run build:probe`,
never the release build) exposes `window.__ecc` with state probes,
deterministic spawns and a `tick(sec)` that advances the sim without
requestAnimationFrame. HANDOFF.md section 4 lists every hook, and
these probes drive it in headless Chrome:

```bash
sh tools/heavy.sh node tools/feel-probe.mjs      # crash, countdown, brake, dips, keys, shield
sh tools/heavy.sh node tools/hud-probe.mjs       # top band, popups, lane, coach, contrast
sh tools/heavy.sh node tools/screens-probe.mjs   # title, sheet, pause, card, share
sh tools/heavy.sh node tools/audio-probe.mjs     # audio wiring in the live game
sh tools/heavy.sh npx vite-node tools/traffic-lab/lab.ts -- bot   # bot survival
sh tools/heavy.sh npx vite-node tools/economy-lab.ts -- career    # paint and mandao pacing
```

`tools/heavy.sh` holds a machine-wide lock so only one headless browser,
build or xcodebuild runs at a time (the dev Mac has 8 GB of RAM).

## Screenshot it

```bash
sh tools/heavy.sh node tools/shots.mjs                                  # all 44 scenes, both phones (store-* at iphone69 only)
sh tools/heavy.sh node tools/shots.mjs --scenes title,contravia --viewports se
sh tools/heavy.sh node tools/shots.mjs --lang en --out docs/shots/en
node tools/shots.mjs --list                                             # scene and viewport names
```

Images go to `docs/shots/latest/` by default (`docs/shots/` is not
tracked). The `iphone69` viewport renders at 1320x2868, the App Store
6.9-inch size. STORE.md has the App Store set.

## Ship it

- `RELEASE.md`: the build ledger, the build-10 prerequisites, and the
  TestFlight and App Store runbook (Capacitor, xcodebuild, Organizer).
- `STORE.md`: the listing kit in both locales, and the screenshot plan.
- `site/`: the public landing and privacy pages (GitHub Pages).

## Read first

- `CLAUDE.md`: the canon brief. Vision, spec, exact copy, palette, tuning
  guide.
- `docs/audit/PLAN.md`: the owner decisions of the 2026-09-29/30 pass
  (pedals, Los Mandaos, records, pinturas, el freno caliente). Where it and
  CLAUDE.md disagree, PLAN.md is the newer decision.
- `HANDOFF.md`: architecture, invariants, save schema, testing tools,
  baselines, feel-tuning playbook.
- `PLAYTEST.md`: the feel-test log and open verdicts.
- `src/config.ts`: the only tuning surface. Every feel-critical number
  lives there with a `FEEL:` comment.
