import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { BrakeHeat } from '../brakeHeat';

const H = CONFIG.fixedDt;

// Runs the pads for `sec` at a fixed pedal depth; returns the lowest
// authority seen and the first time (from the call) they overheated, or -1.
function run(b: BrakeHeat, sec: number, press: number): { minAuth: number; hotAt: number } {
  let minAuth = 1;
  let hotAt = -1;
  for (let t = 0; t < sec - 1e-9; t += H) {
    minAuth = Math.min(minAuth, b.step(H, press));
    if (hotAt < 0 && b.hot) hotAt = t + H;
  }
  return { minAuth, hotAt };
}

describe('el freno caliente', () => {
  it('taps and short holds always brake fully', () => {
    const b = new BrakeHeat();
    // 20 s of 0.3 s taps with 0.5 s between them
    for (let i = 0; i < 25; i++) {
      expect(run(b, 0.3, 1).minAuth).toBe(1);
      run(b, 0.5, 0);
    }
    expect(b.hot).toBe(false);
    // a 1.5 s hold from cold pads, then another 1 s hold after a 2 s rest
    const c = new BrakeHeat();
    expect(run(c, 1.5, 1).minAuth).toBe(1);
    run(c, 2, 0);
    expect(run(c, 1, 1).minAuth).toBe(1);
    expect(c.hot).toBe(false);
  });

  it('about brakeHeatMaxSec of full brake overheats, and the brake fades to nothing', () => {
    const b = new BrakeHeat();
    const { hotAt } = run(b, CONFIG.brakeHeatMaxSec + 0.1, 1);
    expect(hotAt).toBeGreaterThan(CONFIG.brakeHeatMaxSec - 0.05);
    expect(hotAt).toBeLessThan(CONFIG.brakeHeatMaxSec + 0.05);
    // gone within the fade, and dead while hot
    run(b, CONFIG.brakeFadeSec, 1);
    expect(b.auth).toBe(0);
    expect(b.hot).toBe(true);
  });

  it('half pressure takes twice as long to overheat', () => {
    const b = new BrakeHeat();
    const { hotAt } = run(b, CONFIG.brakeHeatMaxSec * 2 + 0.2, 0.5);
    expect(hotAt).toBeGreaterThan(CONFIG.brakeHeatMaxSec * 2 - 0.1);
    expect(hotAt).toBeLessThan(CONFIG.brakeHeatMaxSec * 2 + 0.1);
  });

  it('stays off until the heat falls under brakeResumeHeat, then bites again', () => {
    const b = new BrakeHeat();
    run(b, CONFIG.brakeHeatMaxSec + 0.05, 1);
    expect(b.hot).toBe(true);
    const expectCool = (1 - CONFIG.brakeResumeHeat) * CONFIG.brakeCoolSec;
    let t = 0;
    while (b.hot && t < 20) {
      b.step(H, 0);
      t += H;
    }
    expect(t).toBeGreaterThan(expectCool - 0.05);
    expect(t).toBeLessThan(expectCool + 0.05);
    run(b, CONFIG.brakeFadeSec + H, 0);
    expect(b.auth).toBe(1);
  });

  it('holding a dead pedal keeps it dead longer than letting go', () => {
    const held = new BrakeHeat();
    const freed = new BrakeHeat();
    run(held, CONFIG.brakeHeatMaxSec + 0.05, 1);
    run(freed, CONFIG.brakeHeatMaxSec + 0.05, 1);
    let tHeld = 0;
    while (held.hot && tHeld < 30) {
      held.step(H, 1);
      tHeld += H;
    }
    let tFreed = 0;
    while (freed.hot && tFreed < 30) {
      freed.step(H, 0);
      tFreed += H;
    }
    expect(tHeld).toBeGreaterThan(tFreed * 1.5);
  });

  it('a brake held all run bites well under half the time', () => {
    const b = new BrakeHeat();
    let biting = 0;
    const sec = 120;
    for (let t = 0; t < sec; t += H) if (b.step(H, 1) >= 0.5) biting += H;
    expect(biting / sec).toBeLessThan(0.45);
  });
});
