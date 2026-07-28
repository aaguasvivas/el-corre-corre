# PLAYTEST NOW

Living log of what the human should feel-test at the end of each phase.
Run it with `npm run dev` and play on both desktop (A/D or arrows, W or Space
for the wheelie) and a phone-sized window (drag to steer, swipe up to wheelie).

## Phase 4: el sonido del barrio (current) - NEEDS YOUR EARS

I cannot hear anything from this environment. Everything below is synthesized
to spec and verified not to crash, but whether it GROOVES is 100% on you.

1. **Does the dembow gallop?** Start a run. Kick on the downbeats, that
   signature syncopated snare (steps 3, 6, 11, 14). If the tempo feels off,
   `audioBpm` in [src/config.ts](src/config.ts).
2. **Do the layers swell?** Chain near-misses: hats should bloom in at combo
   3, the bass pulse at combo 5, and an extra metallic percussion layer the
   moment you cross en contra vía. It should feel like the barrio hyping you
   up, never like a switch flipping.
3. **The engine.** Does the hum track your speed without droning? Does the
   caballito rev feel like a rev?
4. **The world.** Bocinazos every so often (panned to where cars are, with a
   doppler dip), the sea washing quietly underneath, marimba on plátanos, the
   whoosh on near-misses, the bell when la Bendición lands, the crash.
5. **Balance and mute.** Anything too loud or grating? The knobs are
   `musicVolume`, `sfxVolume`, `engineVolume`, `washVolume`. Mute chip on the
   title (or press M): does it persist after a reload?
6. **iOS check when you can.** Sound must start on the first tap, never
   before, and pause when you background the app.

## Phase 3: El Malecón (passed: "the world looks amazing")

1. **The poster test.** Pause at any random moment. Does the frame look like a
   place, not a tech demo? Would a Dominican friend recognize home?
2. **The curve.** Ride a couple of minutes. The road should breathe through
   long lazy S-curves without ever feeling like it is steering for you or
   hiding traffic unfairly. Too swervy? Lower `curveAmp1` in
   [src/config.ts](src/config.ts). Too flat? Raise it.
3. **Details at speed.** Colmado signs, the Av. George Washington plaque, the
   domino table, flags, the chichigua over the seawall: do they register as
   you fly past, or does anything read as visual noise where you dodge?
4. **El Obelisco.** Around every 800 m mark. Does spotting it far ahead feel
   like a milestone?
5. **La viralata.** When the street dog darts at the road, does your stomach
   drop for a second even though it always stops short? That flinch is the
   point. (It can never be hit.)
6. **Phone check.** Portrait on the phone: does it still hold 60fps with the
   full world? If it stutters, tell me what device so I budget the Phase 6
   audit against it.

## Phase 2: risk and reward (passed pending your notes)

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
