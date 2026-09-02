// tour.ts: Los Tramos as pure math. Where you are in the country is a
// function of how far THIS RUN has ridden, nothing else, so the same three
// functions drive the scenery belts, the road texture, the Obelisco, the
// arrival card and the game-over summary, and all of it is unit-testable
// without a renderer.

import { CONFIG } from './config';

export type Tramo = 'malecon' | 'zona' | 'campo';

// The national lap, in riding order. Every run starts at home on the Malecon.
export const TRAMO_ORDER: readonly Tramo[] = ['malecon', 'zona', 'campo'];

export function lapLength(): number {
  return CONFIG.tramoLengthM * TRAMO_ORDER.length;
}

export function tramoFor(runDistance: number): Tramo {
  const i = Math.floor(Math.max(0, runDistance) / CONFIG.tramoLengthM) % TRAMO_ORDER.length;
  return TRAMO_ORDER[i];
}

// Meters left until the next border. Powers the "La Zona a 340 m" line on
// the game-over card, the tour's answer to the close-call line.
export function nextBorderIn(runDistance: number): number {
  const d = Math.max(0, runDistance);
  return (Math.floor(d / CONFIG.tramoLengthM) + 1) * CONFIG.tramoLengthM - d;
}

export function nextTramoAfter(runDistance: number): Tramo {
  const i = (Math.floor(Math.max(0, runDistance) / CONFIG.tramoLengthM) + 1) % TRAMO_ORDER.length;
  return TRAMO_ORDER[i];
}

// The Obelisco stands once per lap, obeliscoOffsetM into each Malecon
// stretch. Given how far the run has gone, where is the next one?
export function nextObeliscoAfter(runDistance: number): number {
  const lap = lapLength();
  const at = Math.floor(Math.max(0, runDistance) / lap) * lap + CONFIG.obeliscoOffsetM;
  return at > runDistance ? at : at + lap;
}
