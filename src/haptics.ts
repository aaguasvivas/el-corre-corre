// haptics.ts: light tick on near-miss, medium on pickup, heavy on crash.
// DECISION: web build uses navigator.vibrate (Android; iOS Safari no-ops
// silently). The Capacitor Haptics plugin drops into these three functions at
// the Phase 6 iOS wrap without touching call sites.

function vib(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // no haptics here, no problem
  }
}

export const haptics = {
  light(): void {
    vib(12);
  },
  medium(): void {
    vib(28);
  },
  heavy(): void {
    vib([30, 30, 60]);
  },
};
