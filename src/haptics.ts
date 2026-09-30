// haptics.ts: selection tick on a pedal engage, light on near-miss, medium
// on pickup, heavy on crash.
// Inside the Capacitor wrap this is the real Taptic Engine via the Haptics
// plugin. On the web it stays navigator.vibrate (Android; iOS Safari no-ops
// silently). Call sites never changed, exactly as planned in Phase 5.
// Every call is fire-and-forget: haptics must never stall the sim.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();

// The selection generator only exists after selectionStart; without it
// selectionChanged is a silent no-op on iOS. Started once, on first use.
let selectionReady = false;

function vib(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // no haptics here, no problem
  }
}

export const haptics = {
  // The lightest click there is: a pedal engaging. Lighter than the
  // near-miss tick, so a control press never reads as an event.
  tick(): void {
    if (native) {
      if (!selectionReady) {
        selectionReady = true;
        void Haptics.selectionStart().catch(() => {});
      }
      void Haptics.selectionChanged().catch(() => {});
    } else vib(8);
  },
  light(): void {
    if (native) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    else vib(12);
  },
  medium(): void {
    if (native) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    else vib(28);
  },
  heavy(): void {
    if (native) void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    else vib([30, 30, 60]);
  },
};
