// haptics.ts: the haptic budget. Inside the Capacitor wrap this is the real
// Taptic Engine via the Haptics plugin; on the web it stays navigator.vibrate
// (Android; iOS Safari no-ops silently). Every call is fire-and-forget:
// haptics must never stall the sim.
//
// The map, after Apple's HIG (one meaning per pattern, intensity matching
// what you see, and never so often that it turns into a buzz):
//   tick     el pedal engaging, the resume countdown beats (selection)
//   light    a near-miss, the resume ¡DALE!
//   platano  light, at most one per hapticPlatanoGapMs, every Nth medium
//   medium   power-ups, hoyo, edge scrape, the Bendición save, a combo ladder
//            tier, the razor pass, the multiplier, a pintura, hot brakes
//   ladder   medium, plus a light echo on the big tiers (7 and up)
//   success  bursting La Cinta (a notification: its documented meaning is
//            "a task completed"); a short double buzz on the web
//   heavy    the crash, which always goes through the budget
// Budget: one haptic per CONFIG.hapticFloorMs, whatever asked for it.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { CONFIG } from './config';

const native = Capacitor.isNativePlatform();

// The selection generator only exists after selectionStart; without it
// selectionChanged is a silent no-op on iOS. Started once, on first use.
let selectionReady = false;
let lastAt = -Infinity; // performance.now() of the last haptic that played
let lastPlatanoAt = -Infinity;

function vib(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // no haptics here, no problem
  }
}

// The floor. `force` is for the crash: the one haptic that must never be
// swallowed because a plátano ticked a moment before.
function allow(force = false): boolean {
  const now = performance.now();
  if (!force && now - lastAt < CONFIG.hapticFloorMs) return false;
  lastAt = now;
  return true;
}

function impact(style: ImpactStyle, web: number | number[]): void {
  if (native) void Haptics.impact({ style }).catch(() => {});
  else vib(web);
}

export const haptics = {
  // The lightest click there is: a pedal engaging. Lighter than the
  // near-miss tick, so a control press never reads as an event.
  tick(): void {
    if (!allow()) return;
    if (native) {
      if (!selectionReady) {
        selectionReady = true;
        void Haptics.selectionStart().catch(() => {});
      }
      void Haptics.selectionChanged().catch(() => {});
    } else vib(8);
  },
  light(): void {
    if (allow()) impact(ImpactStyle.Light, 10);
  },
  medium(): void {
    if (allow()) impact(ImpactStyle.Medium, 20);
  },
  heavy(): void {
    allow(true);
    impact(ImpactStyle.Heavy, [30, 30, 60]);
  },
  // n: plátanos collected this run, counting this one. A string of them is
  // a patter of light taps, never one long buzz, and every Nth lands harder.
  platano(n: number): void {
    const now = performance.now();
    if (n > 0 && n % CONFIG.hapticPlatanoMediumEvery === 0) {
      lastPlatanoAt = now;
      haptics.medium();
      return;
    }
    if (now - lastPlatanoAt < CONFIG.hapticPlatanoGapMs) return;
    lastPlatanoAt = now;
    haptics.light();
  },
  // A combo ladder tier: medium, and the big ones echo.
  ladder(combo: number): void {
    haptics.medium();
    if (combo >= 7) setTimeout(() => haptics.light(), CONFIG.hapticFloorMs + 10);
  },
  success(): void {
    if (!allow()) return;
    if (native) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    else vib([12, 40, 24]);
  },
};
