# PLAYTEST NOW

Living log of what the human should feel-test at the end of each phase.
Run it with `npm run dev` and play on both desktop (A/D or arrows, W or Space
for the wheelie) and a phone-sized window (drag to steer, swipe up to wheelie).

## Phase 2: risk and reward (current)

1. **Ride en contra vía on purpose.** Cross the yellow line and hold it while
   the indicator pulses and the vignette breathes. Does the doubled score plus
   the oncoming traffic make your shoulders tense? That tension is the game.
2. **Chain near-misses.** Thread close past cars until the slang ladder talks
   to you (2, 3, 5, 7...). Do the popups read clearly at speed without
   blocking your view of the road?
3. **Hit a policía acostado at full speed** (the yellow striped bump). The
   launch plus airtime points should feel like a reward, never a punishment.
   Then eat a hoyo and confirm it feels like YOUR mistake (visible from far).
4. **Wheelie over a hoyo.** Swipe up (or W/Space) right before a pothole and
   sail over it. Does the minus-40% steering during the caballito feel like a
   fair trade?
5. **Chase the tape.** Die once, restart, and race La Cinta del Récord. When
   you burst through it (confetti plus banner), do you immediately want the
   next run to push it further? That is the whole retention loop.

Difficulty was bumped after the Phase 1 note ("difficulty is low"): denser
traffic, faster ramp, oncoming up to 16 m/s. If it now feels unfair instead of
exciting, the knobs are `trafficDensityStart`, `spawnsPerSecAtFull`, and
`oncomingSpeedMax` in [src/config.ts](src/config.ts).

## Phase 1: the spine (passed)

Steering signed off: smooth and precise S-curves. Difficulty note folded into
Phase 2 tuning above.

## Phase 0: scaffold (passed)

Golden-hour world, scrolling road, 60fps, clean console.
