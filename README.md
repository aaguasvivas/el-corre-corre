# El Corre Corre

A one-thumb Dominican arcade runner. You are on a motor flying down the
Malecón of Santo Domingo at golden hour, weaving through guaguas, carros
públicos and camiones de plátanos, riding en contra vía for double points,
and chasing your own récord across the country: El Malecón, La Zona
Colonial, El Campo, and around again.

Vite + TypeScript (strict) + three.js. No other runtime frameworks, no
physics engine, no network: everything ships in the bundle and the iOS app
runs fully offline through Capacitor.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

Desktop: A/D or arrows steer, hold W or Space for the caballito (derrape in
the Civic), M mutes. Phone: drag to steer, swipe up and hold for the trick.

## Verify it

```bash
npm test           # vitest: scoring model, tour math, the brief's invariants
npm run check      # typecheck + tests
```

The invariant tests encode the rules the brief calls sacred (the telegraph
window, same-direction traffic slower than the rider, the tour and Obelisco
cadence, the pintura catalog). If a feel-tuning round breaks one, `npm test`
says so before a playtest does.

Everything else is verified live: the game exposes `window.__ecc` with
state probes, deterministic spawns and a `tick(sec)` that advances the
fixed-step sim without requestAnimationFrame. HANDOFF.md section 4 has the
recipes.

## Ship it

- `RELEASE.md`: the TestFlight and App Store runbook (Capacitor, xcodebuild,
  Organizer upload).
- `STORE.md`: the listing kit, both locales.
- `site/`: the public landing and privacy pages (GitHub Pages).

## Read first

- `CLAUDE.md`: the canon brief. Vision, spec, exact copy, palette, tuning
  guide. It overrides everything.
- `HANDOFF.md`: architecture map, invariants, testing infrastructure,
  feel-tuning playbook.
- `PLAYTEST.md`: the feel-test log and open verdicts.
- `src/config.ts`: the only tuning surface. Every feel-critical number
  lives there with a `FEEL:` comment.
