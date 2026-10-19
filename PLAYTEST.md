# PLAYTEST NOW

Living log of what the human should feel-test at the end of each phase.
Run it with `npm run dev`, or install the TestFlight build. Phone: drag
anywhere with one thumb to steer, hold ¡DALE! (gas) or FRENO (brake) at the
bottom left with the other thumb, swipe up and hold for the trick (caballito
on the bikes, derrape in the Civic). Desktop: A/D or left/right to steer,
up/down for gas and brake, hold W or Space for the trick, P or Escape to
pause, M to mute.

## Ads for release 1.0 (build 11)

New since build 10: Google's consent message and the tracking prompt on the
title, "Dobla tus plátanos" on the game-over card, a banner on PAUSA and
on Los Mandaos, and Remove Ads ($1.99). Decisions:
`docs/audit/ADS-PLAN.md`. Until the real AdMob ids exist, test with
`npm run build:adtest` and `npx cap sync ios`, run from Xcode (RELEASE.md);
the title shows a red "ANUNCIOS DE PRUEBA" tag and every ad says "Test
mode".

**PLAYTEST NOW** (on the phone, test-ads build):

1. **First launch.** Delete the app, install, open. About a second after
   the title appears, the tracking prompt (and Google's message, if it
   shows) opens over the title, never over a run. Does it feel abrupt?
2. **The card offer.** Collect a few plátanos and crash. The gold ×2
   button fades in on the plátanos row a beat after the card lands. Hammer
   the screen right at the crash: you restart, never open a video.
3. **The video.** Tap ×2 and watch to the end: the music stops while it
   plays, comes back after, and "+N plátanos" counts up to double. Close a
   video early: nothing is added, and the button may come back.
4. **Banner.** Pause: a banner sits at the bottom, everything else moves
   up and stays clear of it. SEGUIR: the banner is gone before the 3, 2, 1.
   Open Los Mandaos on the title: the banner shows there too.
5. **Remove Ads.** From the AD chip under the sound chip, or "Quitar
   anuncios" on PAUSA: the price, what goes and what stays. Buy with a
   Sandbox account: the banner is gone at once and the chip disappears.
   Delete and reinstall, then Restaurar compras: it comes back.
6. **Offline.** Airplane mode, then play: no button, no banner, no error,
   and the game plays exactly as before.

## Next-level pass (build 10)

New since build 9: two pedals with el freno caliente, near-misses that need
a real dodge, Los Mandaos, records that each mean one thing, new screens and
HUD, new music and sounds, a new crash, the iPhone share sheet, and a backup
of your saves. The decisions are in `docs/audit/PLAN.md`.

**PLAYTEST NOW** (on the phone, build 10):

1. **Pedals.** Hold ¡DALE! with the left thumb and steer with the right.
   Within a moment the km/h turns gold and x1.5 shows. Slide the same thumb
   onto FRENO without lifting: it brakes at once, shows x0.5 and lights the
   tail light.
2. **Freno caliente.** Hold FRENO for more than 2 s. The pedal fills, turns
   orange with a flame and ¡CALIENTE!, and the brake lets go. Short taps and
   1 s holds brake fully every time. Does the fade feel fair?
3. **Near-miss needs a dodge.** Ride on the dashed line without dodging: no
   ¡Cerquita!. Sit in a car's line and swerve out late: ¡Cerquita! and the
   combo climbs. Do near-misses feel earned or too rare?
4. **Por un pelito.** Squeeze past a car on purpose. The gold ¡Por un
   pelito! (x2) should come only when you really went close, about 1 in 6
   casual dodges.
5. **Opening.** Start 5 runs. Plátanos come in the first 2 s, you pass slow
   cars at about 5, 9 and 14 s, and a Bendición around 14 s saves your first
   hit.
6. **Set pieces.** Past 500 m and 1200 m, "¡La calle se puso brava!" shows.
   ¡TAPÓN!, ¡CARAVANA! and the other named moments always leave a way
   through.
7. **Records and the tape.** Chase your Motor record: gold FALTAN from 75%,
   ¡Ya casi el récord! near 90%, and ¡NUEVO RÉCORD! with confetti when your
   points pass it. Bursting La Cinta says ¡MÁS LEJOS QUE NUNCA!, never NUEVO
   RÉCORD. A ride with no record gets LA META at 400 m.
8. **Mandaos.** On a fresh install the first set (10 plátanos, 2 cerquitas,
   300 m) gets done in the first run or two. ¡MANDAO HECHO! is readable
   mid-ride without hiding traffic, and the card stamps ¡HECHO!. Is the
   first paint (500 plátanos) in reach around run 3?
9. **Crash and OTRA VEZ.** Crash a few times. The white flash, the rider
   flying off under the stars and the bike sliding away should be funny. The
   tumble stays visible between the card and OTRA VEZ, and a tap on OTRA VEZ
   half a second after the hit starts a new run.
10. **Audio by ear.** Near-miss whooshes rise with the combo, plátano
    strings climb in pitch, a crash slows the band down, the title and card
    play a muffled radio, and La Zona and El Campo change the music. Nothing
    is harsh on the phone speaker.
11. **Art on the phone.** Sun over a turquoise sea, veleros, cars in their
    real colors, white head lamps on oncoming cars and red tail lamps ahead.
    Pasacalles and laundry fade out before they cross the score.
12. **Share and saves.** COMPARTIR opens the iPhone share sheet with a photo
    of your crash. Send it to WhatsApp and Messages. Guardar imagen asks for
    permission in Spanish and the card lands in Fotos. Close the sheet
    without choosing: nothing breaks. Force-quit and reopen: plátanos, paints
    and records are still there.
13. **Wave 4 polish.** On the title, pick the Civic and tap to start: does
    the camera push-in at run start feel good? Hold FRENO until it overheats
    once on a fresh install: does the one-time hot-brake hint help, and does
    it leave once the brake cools? Are the ¡HECHO! thump and tap satisfying
    and not buzzy? Do popups beside the rider still read at a glance? On a
    big record, is the shrunk points number still the hero of the card?

## El acelerador + art round 3 (build 9; the finger-height throttle is gone since build 10)

1. **Gas and brake.** Phone: hold your thumb above where it landed for gas,
   below it for brake; the dead zone is 30 px so a dodge is still a dodge.
   A flick up is still the caballito, and flick-up-and-hold is gas AND
   caballito. Desktop: up/down arrows. Gas is 1.3x speed and pays
   "¡A FONDO! x1.25" on everything; brake is 0.7x speed with no score
   penalty beyond the meters you are not covering. The cafecito overrides
   the throttle. Feel-test: does the trade read in the hands (gas in gaps,
   brake into walls)? Does the dead zone feel right, or does gas kick in
   while you are just dodging? Is x1.25 worth the risk?
2. **Speed lines** past ~60% of top speed, full a fondo. Too much?
3. **Art round 3**: veleros far out on the sea, tinacos and antennas on the
   rooftops. Charm check: do you notice them without being told?
4. **Robustness**: steering math is NaN-proof now (a zero-width viewport
   during a rotation could previously blank the world until relaunch).

## Deep audit pass

Four things you will notice, all verified live:

1. **Every run starts at home.** The tour is measured from the start of
   THIS run: die in el campo, tap OTRA VEZ, and you ride out of the
   countryside into the Malecón within a few hundred meters, then La Zona
   arrives at 1 km like it should. The title screen no longer drifts the
   tour while you sit on it. Before, the country was on a lifetime
   odometer, so runs began wherever the last one ended.
2. **The game-over card knows the tour.** "Llegaste hasta EL CAMPO" when
   you got somewhere, or "LA ZONA COLONIAL a 340 m" when you didn't, the
   tour's own close-call line. The share card says "hasta El Campo" too.
3. **The combo has a visible fuse.** A gold bar drains under the combo
   pill over the 4 s decay, and the pill now hides when the chain times
   out (it used to linger until the next near-miss).
4. **Traffic breathes.** A follower that got held behind a slower car now
   eases back to its own speed once the road opens, so the pack keeps
   overtaking itself instead of settling into one slow parade.

Under the hood: `npm test` now encodes the brief's invariants (telegraph
window, speeds vs the ramp, tour cadence, pinturas), and it already caught
one: the Civic's top speed had outrun the base speed after the feel round
(harmless thanks to the unlock timing, now tested against the ramp).

Feel-test: does OTRA VEZ still feel instant with the tour reset? Does the
combo bar read at a glance without pulling your eyes down?

## Look pass round 2: the professional-polish pass

Round 2 targets the specific amateur tells, Subway Surfers polish as the
bar:

1. **Soft edges everywhere it matters**: player rigs and all car bodies
   are beveled now, no more sharp-cornered slabs.
2. **Deeper toon ramp**: the shadow step is darker, so every object has
   sculpted form instead of flat fills.
3. **Baked AO**: buildings darken toward their feet; a contact-shadow
   strip runs along building fronts and the seawall. Things sit ON the
   street now instead of floating.
4. **Lived-in road**: tire-wear tracks in every lane.
5. **Lit windows**: a third of facade windows glow warm at golden hour.
6. **Layered sun glow** with a horizon flare.

Feel-test: 1) blind test with Erickson again: does it read "legit
professional game" now? 2) FPS on both phones, draw calls peaked at 171
in testing (was ~148). 3) Any surface that looks muddy or too dark in
the deeper ramp?

## Look pass round 1: Erickson's "love the feel, not the look"

Four changes, all code, zero new assets, same palette:

1. **Golden rim light** on every toon surface: silhouettes catch the low
   sun. This is the single biggest "colored boxes" to "low-poly at
   sunset" move.
2. **The air changes per tramo**: peach haze on the Malecon, rosier and
   closer inside the colonial canyon, dusty gold and more open in el
   campo. Fog, sun, ambient and rim all glide at the border.
3. **Clouds** drifting high over the sea.
4. **A quiet vignette** over the frame (DOM, zero GPU cost).

Feel-test: 1) show Erickson WITHOUT saying what changed; ask him to rate
the look again. 2) Any frame that reads worse or noisy? 3) FPS still
smooth on both phones? Round 2 candidates if the direction is right:
beveled vehicle silhouettes, warm window glow at dusk, baked corner
shading on buildings, speed-line particles.

## Tramo pacing, tuned to a 2000 m run

Tramos are 1000 m now, tuned against Adelson's stated ~2000 m average:
under a kilometer you stay home on the Malecón (so the first crossing is
earned), a decent run reaches La Zona, a good one makes El Campo, and the
full national lap is 3 km. Arriving now gets its own announcement,
"LLEGASTE A / LA ZONA COLONIAL" on a flag-blue plate, not the red record
banner. El Obelisco stands exactly once per lap, 500 m into each Malecón.

Feel-test: 1) does reaching a new tramo land as an achievement now? 2) is
one crossing per ~1000 m the right rhythm, or still too often / too rare?
3) does the arrival card read without stealing your eyes from traffic?

## Los Tramos, for real this time

The tramos were changing every 600 m the whole time. The problem was that
the sea, the seawall and the palms filled the left half of the screen in
ALL THREE, so only the right-side buildings changed and no crossing ever
registered. Now each tramo owns the whole frame:

- **El Malecón**: sea, seawall, palms, city on the right. Unchanged.
- **La Zona Colonial**: colonial fronts on BOTH sides, a narrow cobbled
  canyon. No sea at all.
- **El Campo**: the water itself drains to farmland over ~1.5 s at the
  border, plátano rows and campo houses on both shoulders, wooden fence
  posts instead of balusters.

Feel-test: 1) does a crossing now read instantly, without looking at the
popup? 2) the change completes over about 130 m (belts dress in 120 m
blocks), does that land as arriving somewhere or as popping? 3) does el
campo feel like the carretera, or do you miss the sea?

## Las Pinturas + traffic honesty

1. **Las Pinturas**: your lifetime plátanos are a wallet now (the banana
   chip on the title screen; your collected total carries over). Five
   paints per vehicle on the selected card: tap to equip, tap a locked one
   to buy (400 / 900 / 1600 / 3000). Does buying feel earned at the
   current earn rate, or too grindy? Is the gold one tempting?
2. **Traffic never ghosts**: same-lane followers match the leader's speed
   instead of driving through, and el rebase only swings when the seam is
   clear. Watch a full run: do you ever see vehicles overlap now?
3. The music self-heals after calls, Siri, or app switches. If it ever
   stays silent more than a couple seconds, that is a new bug: report it.

## Phone feel round 2: "chill, then LIT"

1. **The arc**: ten gentle seconds to feel the controls, real density by
   about a minute (densityRampSec 95 to 50), and a fuller road at the top
   (spawn rate 1.85 to 2.35/s, cap 33, waves every 2.2 to 3.8 s, rebase
   every 4 to 8 s). Parked bots that used to idle 43 s die everywhere now;
   surviving means actively finding space. Question for your thumbs: does
   minute two feel hectic in the good way, or unfair?
2. **Plátanos are plátanos now**: curved, tapered, dark tips, spinning.
   Do they read instantly at speed?

## Phone feel round 1: your five notes, addressed

1. **The stray French flags are dead.** They were the Obelisco (three stacked
   blue/white/red bands read as a wrapped tricolor) and La Cinta (blue top
   stripe, red bottom stripe read as a horizontal one at speed). The Obelisco
   now wears mural-colored bands (teal, gold, coral, for the Mirabal mural)
   plus la bandera itself, escudo and all, facing the road. La Cinta is a
   white finish tape with gold edges. Flagpoles were already correct.
2. **Touch steering pushed toward crisp**: the bike chases your finger harder
   (touchServoGain 9 to 13), a full drag covers more road (1.15 to 1.3
   widths), carve accel 38 to 42. Tell me: smooth AND responsive now, or did
   any drift feel disappear?
3. **The yellow line is no longer free.** El rebase: every few seconds an
   inner-lane vehicle swings onto the center seam to overtake, both
   directions, eased in and out so it telegraphs. Measured with parked bots:
   own lane 43.6 s median, the seam 32.5 s, contra via 31.2 s. The seam is
   now as deadly as contra via but pays nothing, so the strategy is honest:
   safe in your lane, double en contra via, nothing on the line.
4. **Speed arc widened**: starts at 16 (was 18), ramps 0.16/s (was 0.12), so
   it is calmer for ten seconds and meaner sooner. Density opens at 0.4 and
   fills over 95 s with a higher late spawn rate. Does the escalation feel
   like the fun now?
5. **The tour never stagnates**: tramos are 1000 m now, so the full national
   lap (Malecon, Zona, Campo) is 3 km and repeats forever. A deep run laps
   the country twice.

## Phase 7: Los Tramos

The run now tours the country: EL MALECÓN, then LA ZONA COLONIAL at 1200 m,
then EL CAMPO at 2400 m, then back around. The place name pops at each border
with a bell. Feel for:

1. **Does each tramo read at a glance?** Zona: cobbled road, wall-to-wall
   colonial fronts, iron balconies and lamps. Campo: patched blacktop, dirt
   shoulders, zinc-roofed wooden houses, platano fields, gallinas that
   scatter away from the road. If you screenshot any moment, can a Dominican
   friend name where you are?
2. **Transitions happen at belt seams (~120 m).** Do they read as arriving
   somewhere, or do you catch scenery popping?
3. **Traffic personality per tramo**: more carros publicos y motoconchos in
   the Zona, camiones out in el campo. Noticeable over a long run?
4. **The palms.** Trunks now curve smoothly into their lean (they used to
   stair-step). Better?
5. **El Obelisco** only appears on Malecon stretches now. Does its return
   still land as a milestone?

## Phase 6: ship prep

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
- The wrap is built (`dev.elcorrecorre.app`, compiles for simulator). Open it
  with `npx cap open ios`, pick your signing team, run it on your iPhone.
- A real iPhone pass: 60 fps, safe areas, the share sheet, real haptics (the
  Taptic Engine is wired now; web vibrate remains the fallback).

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
