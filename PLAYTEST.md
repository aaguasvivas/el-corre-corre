# PLAYTEST NOW

Living log of what the human should feel-test at the end of each phase.
Run it with `npm run dev`. Desktop: A/D or arrows to steer, HOLD W or Space
for the trick (caballito on bikes, derrape in the Civic), M for mute. Touch:
drag to steer, swipe up and hold, swipe down to drop.

## Phase 6 (current): ship prep

Most of this phase is invisible if it worked. Four things you CAN feel:

1. **The spawner should never wall you.** The old rule only refused a spawn
   when all four driving lanes were taken inside a z window, which ignored the
   shoulders and treated oncoming and same-direction traffic as if they
   arrived together. It now measures the real continuous corridor across the
   whole road among the vehicles that reach you at the same moment. Ride 5+
   minutes at full density: does any death feel like there was nowhere to go?
   If traffic now feels too sparse, `minCorridorMult` (1.7) is the knob.
2. **Contra vía should still be the deadlier side.** Parked-bot survival over
   9 runs each with a 45 s cap: own lane 45 s median (6 of 9 reached the cap),
   contra vía 25.2 s median. Does that still match how it feels in the hands?
3. **OTRA VEZ is faster.** The card lands at 0.5 s and the tap guard dropped
   from 0.25 s to 0.15 s. Crash and hammer restart: does it ever swallow a tap?
4. **The title now tells you the controls**, and says the right thing for the
   device you are on. Phone: "Desliza arriba y aguanta: ¡CABALLITO!" Desktop:
   "Aguanta W". Would a first-timer find the caballito now?

Fixed this phase from the audit, worth a glance:
- COMPARTIR used to do nothing at all when iOS refused the share sheet. It now
  falls back to a download. Try it on your phone.
- Mute is reachable mid-run from the pause screen (it was keyboard-only).
- "¡NUEVO RÉCORD!" no longer runs off the edges of a phone screen.
- Popups near the kerb, the top of the slang ladder, the game-over stat row at
  a six-digit récord, and the HUD récord vs a six-digit score all fit now.
- A second thumb no longer kills steering, a hard dodge no longer fires an
  accidental caballito, and you can start a second caballito without lifting.

### Only you can do these
- A real iPhone pass: 60 fps, safe areas, the share sheet, haptics.
- Decide the bundle id before the Capacitor wrap. Personal pattern like
  anota's `dev.anota.app`; your call, nothing is preset.

### Evidence on file (all re-measured this phase)
- Draw calls: median 195 → 107, p90 218 → 125, max 230 → 139.
- Record burst: +46 draw calls → +3.
- Soak: 23 min of sim, 334 runs, 30.5 km. DOM flat at 150 nodes, heap
  sawtoothing 37 to 48 MB with no trend, draw calls 94 to 128, zero console
  errors, world and bend field correct at 30 km.
- Build clean, `tsc --noEmit` clean.

## Feel round 2 (passed into Phase 6; verdicts still welcome)

1. **El derrape.** The Civic no longer wheelies: hold the trick and it goes
   SIDEWAYS, same x1.5 pay, but the collision circle grows 35% while held and
   hoyos still hit you (no caballito immunity). Does drifting through a gap
   en contra via feel like the dumbest smartest thing you have ever done?
2. **Contra via is now hostile territory.** Half of ambient traffic comes at
   you, and while you ride the wrong way, oncoming spawns actively pick YOUR
   lane. A parked test bot now dies almost twice as fast over there. Does
   staying en contra via finally feel like a gamble you re-evaluate every few
   seconds, hunting open space?
3. **Difficulty.** Faster ramp (0.12/s), denser sooner, tighter waves, bigger
   late swarms. Where does it land now?
4. **The multiplier ladder.** x2 at 500 m, x3 at 1200 m, x4 at 2200 m,
   multiplying EVERYTHING (chip under the platano counter). Deep runs print
   points, so a long survival beats a lucky start. Does dying at 1100 m hurt
   in the way that makes you restart instantly?
5. **The beat.** Same dembow, now with a pluck riff cycling Am G F E, a
   doubled-kick variant every other phrase, a snare roll into every 4th bar,
   and one stripped-down breath bar every 16. Can you ride for 3 minutes
   without the loop wearing on you?
6. **Vehicle gaps widened.** Civic +22% speed and score with heavier
   steering; Pasola turns harder, darts quicker, caps at 34. Noticeable now?
7. **EN toggle.** Everything gameplay-facing translates (So close!, WRONG
   WAY!, DRIFT!, MULTIPLIER, ladder slang). The logo, colmado signs, and
   guagua banners stay Dominican on purpose.

## Phase 5 (passed: "much improved, trending upwards")

## Phases 0-4 (passed with notes folded in)
