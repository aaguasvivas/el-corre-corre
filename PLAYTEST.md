# PLAYTEST NOW

Living log of what the human should feel-test at the end of each phase.
Run it with `npm run dev` and play on both desktop (A/D or arrows, Space to start)
and a phone-sized window (drag anywhere to steer).

## Phase 1: the spine (current)

1. **Carve, don't snap.** Hold a drag and draw S-curves across all four lanes.
   It should feel drifty-smooth but land exactly where you aim. Twitchy? Lower
   `lateralAccel` in [src/config.ts](src/config.ts). Floaty? Raise it or lower
   `lateralDamping`.
2. **Thread a gap.** Chase two same-direction cars and slip between them. Does
   passing close feel exciting already, even before near-miss scoring exists?
3. **Crash on purpose.** Slow-mo should read instantly, the card should appear
   in half a second, and OTRA VEZ should have you riding again in under a
   second. Any friction there is a bug, not a tuning issue.
4. **Watch your deaths.** Every one should be visible at least 1.5 seconds
   ahead. If anything ever materializes on top of you, note what and where.
5. **Feel the ramp.** Play 3 runs. Does speed creep up enough that minute two
   has real tension? Did you take one more run without deciding to? That is the
   Phase 1 done criterion.

Also worth a glance: edge scrape (grind the shoulder edge: sparks plus a brief
slow, never death), the EN chip on the title screen, and the record surviving a
page reload.

## Phase 0: scaffold (passed)

Golden-hour world, scrolling road, 60fps, clean console.
