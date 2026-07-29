// leaderboard.ts: the clean hook for Game Center, per the brief.
//
// v1 ships with local per-vehicle records only. This module is where the
// Capacitor Game Center plugin lands after the iOS wrap: keep these two
// functions, swap the internals, and every call site stays as it is. On the
// web it is a deliberate no-op, so nothing here ever touches the network.

import type { VehicleId } from './config';

// One board for the overall best, one per ride. Real identifiers get created in
// App Store Connect at wrap time; these strings are the contract.
export const BOARD_ALL = 'ecc.malecon.puntos';
export const boardFor = (vehicle: VehicleId): string => `ecc.malecon.puntos.${vehicle}`;

export function isAvailable(): boolean {
  // Becomes a Capacitor platform check (isNativePlatform + GC authenticated).
  return false;
}

export function submitScore(points: number, vehicle: VehicleId): void {
  if (!isAvailable() || points <= 0) return;
  // Native path, added at the wrap:
  //   GameCenter.submitScore({ leaderboardId: BOARD_ALL, score: points });
  //   GameCenter.submitScore({ leaderboardId: boardFor(vehicle), score: points });
  void vehicle;
}
