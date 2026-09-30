// brakeHeat.ts: el freno caliente. The pads heat while the brake bites, in
// proportion to how hard, and cool while it does not. About
// CONFIG.brakeHeatMaxSec of full brake overheats them: the brake fades to
// nothing over brakeFadeSec and stays dead until the heat falls under
// brakeResumeHeat, then fades back in. Taps and short holds never get near
// it, so the brake stays a tactical tool instead of a way to ride slow.
//
// Pure state and math, no DOM or three.js: main.ts and the traffic lab bots
// run this same class, so the lab measures the brake the player has.

import { CONFIG } from './config';

export class BrakeHeat {
  heat = 0; // 0 cold .. 1 overheated
  hot = false; // overheated: the pedal does nothing until the pads cool
  auth = 1; // how much of the brake still bites, 0..1, eased over brakeFadeSec

  // press: brake depth this step, 0 (pedal up) .. 1 (full brake). Returns
  // the brake authority to multiply the press by.
  step(dt: number, press: number): number {
    const k = dt / CONFIG.brakeFadeSec;
    this.auth = this.hot ? Math.max(0, this.auth - k) : Math.min(1, this.auth + k);
    if (!this.hot && press > 0) {
      this.heat += ((press * this.auth) / CONFIG.brakeHeatMaxSec) * dt;
      if (this.heat >= 1) {
        this.heat = 1;
        this.hot = true;
      }
    } else {
      // A dead pedal still held cools slower: letting go is the fix.
      const rate = this.hot && press > 0 ? CONFIG.brakeHotHoldCool : 1;
      this.heat = Math.max(0, this.heat - (rate / CONFIG.brakeCoolSec) * dt);
      if (this.hot && this.heat < CONFIG.brakeResumeHeat) this.hot = false;
    }
    return this.auth;
  }

  reset(): void {
    this.heat = 0;
    this.hot = false;
    this.auth = 1;
  }
}
