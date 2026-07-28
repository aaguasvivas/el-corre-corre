// audio.ts: el sonido del barrio. 100% WebAudio synthesis, zero assets, zero
// network. Dembow sequencer with intensity layers tied to combo and contra
// via, an engine that tracks speed and revs on the caballito, bocinazos with
// a doppler bend, a quiet wave wash, and the full SFX set.
//
// The AudioContext is created and resumed on the first user gesture (iOS
// unlock). Every public call is safe to make before that: it just no-ops.

import { CONFIG } from './config';

const MUTE_KEY = 'ecc.v1.muted';

const KICK_STEPS = [0, 4, 8, 12];
const SNARE_STEPS = [3, 6, 11, 14]; // that syncopation IS the dembow gallop
const PERC_STEPS = [2, 5, 10, 13]; // extra layer en contra via
const BASS_PATTERN: Record<number, number> = { 0: 55, 4: 55, 7: 65.41, 8: 55, 12: 55, 14: 49 };

export interface AudioUpdateCtx {
  running: boolean;
  speedNorm: number;
  combo: number;
  contraVia: boolean;
  wheelie: boolean;
}

function readMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;

  private layerKick!: GainNode;
  private layerSnare!: GainNode;
  private layerHat!: GainNode;
  private layerBass!: GainNode;
  private layerPerc!: GainNode;

  private engineOsc!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;

  private mutedFlag = readMute();
  private running = false;
  private step = 0;
  private nextStepAt = 0;
  private wheeliePrev = false;
  private nextHornAt = 0;

  constructor() {
    const unlock = (): void => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get ctxState(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  setMuted(m: boolean): void {
    this.mutedFlag = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // fine
    }
    if (this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
    }
  }

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildGraph();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.mutedFlag ? 0 : 1;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = CONFIG.musicVolume;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = CONFIG.sfxVolume;
    this.sfxBus.connect(this.master);

    const len = Math.floor(ctx.sampleRate * 1.2);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const mkLayer = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.musicBus);
      return g;
    };
    this.layerKick = mkLayer(1);
    this.layerSnare = mkLayer(1);
    this.layerHat = mkLayer(0.3);
    this.layerBass = mkLayer(0);
    this.layerPerc = mkLayer(0);

    // Engine: filtered sawtooth, always alive, gain gated by the run
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 58;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 380;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // The sea, breathing quietly under everything
    const wash = ctx.createBufferSource();
    wash.buffer = this.noiseBuf;
    wash.loop = true;
    const washFilter = ctx.createBiquadFilter();
    washFilter.type = 'lowpass';
    washFilter.frequency.value = 460;
    const washGain = ctx.createGain();
    washGain.gain.value = CONFIG.washVolume;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = CONFIG.washVolume * 0.55;
    lfo.connect(lfoDepth).connect(washGain.gain);
    wash.connect(washFilter).connect(washGain).connect(this.master);
    wash.start();
    lfo.start();

    this.nextHornAt = ctx.currentTime + 6;
  }

  // ---------------- run lifecycle ----------------

  startRun(): void {
    this.unlock();
    this.running = true;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.step = 0;
    this.nextStepAt = now + 0.06;
    this.engineGain.gain.setTargetAtTime(0.05, now, 0.2);
  }

  stopRun(crashed: boolean): void {
    this.running = false;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0, now, crashed ? 0.05 : 0.15);
    if (crashed) this.crashSfx();
  }

  update(dt: number, u: AudioUpdateCtx): void {
    void dt;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    if (this.running && u.running) {
      // Layers swell with the run; ~0.3 s fades, never a pop
      this.layerHat.gain.setTargetAtTime(u.combo >= CONFIG.comboHatsAt ? 0.85 : 0.3, now, 0.1);
      this.layerBass.gain.setTargetAtTime(u.combo >= CONFIG.comboBassAt ? 0.9 : 0, now, 0.1);
      this.layerPerc.gain.setTargetAtTime(u.contraVia ? 0.8 : 0, now, 0.1);

      const stepDur = 60 / CONFIG.audioBpm / 4;
      if (this.nextStepAt < now - 0.35) this.nextStepAt = now + 0.05; // resync after a stall
      while (this.nextStepAt < now + 0.15) {
        this.scheduleStep(this.step, this.nextStepAt);
        this.step = (this.step + 1) % 16;
        this.nextStepAt += stepDur;
      }

      // Engine tracks speed; revs on the caballito
      const baseF = 58 + 74 * u.speedNorm;
      const targetF = baseF * (u.wheelie ? 1.5 : 1);
      const quick = u.wheelie && !this.wheeliePrev;
      this.engineOsc.frequency.setTargetAtTime(targetF, now, quick ? 0.03 : 0.12);
      this.engineFilter.frequency.setTargetAtTime(380 + 680 * u.speedNorm, now, 0.15);
      this.engineGain.gain.setTargetAtTime(
        (0.055 + (CONFIG.engineVolume - 0.055) * u.speedNorm) * (u.wheelie ? 1.3 : 1),
        now,
        0.15,
      );

      // Someone always leans on the horn somewhere
      if (now >= this.nextHornAt) {
        this.horn((Math.random() - 0.5) * 1.6, 0.92 + Math.random() * 0.16);
        this.nextHornAt = now + CONFIG.hornEvery[0] + Math.random() * (CONFIG.hornEvery[1] - CONFIG.hornEvery[0]);
      }
    }
    this.wheeliePrev = u.wheelie;
  }

  // ---------------- the dembow ----------------

  private scheduleStep(s: number, t: number): void {
    if (KICK_STEPS.includes(s)) this.kick(t);
    if (SNARE_STEPS.includes(s)) this.snare(t);
    if (s % 2 === 0) this.hat(t, false);
    if (s === 7 || s === 15) this.hat(t, true);
    const bassF = BASS_PATTERN[s];
    if (bassF !== undefined) this.bassNote(t, bassF);
    if (PERC_STEPS.includes(s)) this.perc(t);
  }

  private env(g: GainNode, t: number, peak: number, decay: number, attack = 0.004): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseHit(
    t: number,
    dest: AudioNode,
    peak: number,
    decay: number,
    filterType: BiquadFilterType,
    freq: number,
    q = 1,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopStart = Math.random() * 0.8;
    src.loopEnd = src.loopStart + 0.35;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, src.loopStart);
    src.stop(t + decay + 0.1);
  }

  private tone(
    t: number,
    dest: AudioNode,
    type: OscillatorType,
    f0: number,
    f1: number | null,
    peak: number,
    decay: number,
    attack = 0.004,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + decay);
    const g = ctx.createGain();
    this.env(g, t, peak, decay, attack);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.1);
  }

  private kick(t: number): void {
    this.tone(t, this.layerKick, 'sine', 150, 50, 0.95, 0.16);
    this.noiseHit(t, this.layerKick, 0.22, 0.015, 'highpass', 2000);
  }

  private snare(t: number): void {
    this.noiseHit(t, this.layerSnare, 0.5, 0.09, 'bandpass', 1900, 1.1);
    this.tone(t, this.layerSnare, 'sine', 190, 130, 0.2, 0.05);
  }

  private hat(t: number, open: boolean): void {
    this.noiseHit(t, this.layerHat, open ? 0.32 : 0.26, open ? 0.16 : 0.045, 'highpass', 6800);
  }

  private bassNote(t: number, f: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    const g = ctx.createGain();
    this.env(g, t, 0.55, 0.17, 0.008);
    o.connect(lp).connect(g).connect(this.layerBass);
    o.start(t);
    o.stop(t + 0.3);
  }

  private perc(t: number): void {
    this.tone(t, this.layerPerc, 'square', 880, null, 0.12, 0.025);
    this.noiseHit(t, this.layerPerc, 0.2, 0.03, 'highpass', 3400);
  }

  // ---------------- SFX ----------------

  private panner(pan: number): StereoPannerNode | GainNode {
    const ctx = this.ctx!;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.sfxBus);
      return p;
    }
    const g = ctx.createGain();
    g.connect(this.sfxBus);
    return g;
  }

  platano(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const det = 1 + (Math.random() - 0.5) * 0.006;
      this.tone(t + i * 0.055, this.sfxBus, 'sine', f * det, null, 0.3, 0.22, 0.003);
      this.tone(t + i * 0.055, this.sfxBus, 'triangle', f * det * 2, null, 0.08, 0.1, 0.003);
    });
  }

  powerup(kind: 'cafecito' | 'iman'): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const notes = kind === 'cafecito' ? [523.25, 659.25, 783.99, 1046.5] : [783.99, 659.25, 523.25];
    notes.forEach((f, i) => {
      this.tone(t + i * 0.05, this.sfxBus, 'sine', f, null, 0.28, 0.2, 0.003);
    });
  }

  bell(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const partials: Array<[number, number]> = [
      [659.25, 0.35],
      [987.77, 0.22],
      [1567.98, 0.1],
    ];
    for (const [f, p] of partials) this.tone(t, this.sfxBus, 'sine', f, null, p, 1.1, 0.006);
  }

  nearMiss(pan: number): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dest = this.panner(pan);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(450, t);
    f.frequency.exponentialRampToValueAtTime(2700, t + 0.16);
    const g = ctx.createGain();
    this.env(g, t, 0.42, 0.17);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.6);
    src.stop(t + 0.3);
  }

  horn(pan: number, pitchMul: number): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dest = this.panner(pan);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2300;
    lp.connect(dest);
    for (const f of [466.16, 587.33]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f * pitchMul * 1.04, t);
      o.frequency.exponentialRampToValueAtTime(f * pitchMul * 0.92, t + 0.3); // doppler
      const g = ctx.createGain();
      this.env(g, t, 0.085, 0.28, 0.02);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + 0.42);
    }
  }

  scrape(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.28);
    const g = ctx.createGain();
    this.env(g, t, 0.4, 0.28);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.6);
    src.stop(t + 0.4);
  }

  hoyo(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(t, this.sfxBus, 'sine', 95, 42, 0.55, 0.13);
    this.noiseHit(t, this.sfxBus, 0.3, 0.05, 'lowpass', 320);
  }

  land(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(t, this.sfxBus, 'sine', 72, 40, 0.3, 0.09);
  }

  launch(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
    const g = ctx.createGain();
    this.env(g, t, 0.26, 0.22);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.6);
    src.stop(t + 0.35);
  }

  splash(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, this.sfxBus, 0.32, 0.22, 'lowpass', 850);
    this.noiseHit(t + 0.02, this.sfxBus, 0.12, 0.12, 'highpass', 3000);
  }

  private crashSfx(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(280, t + 0.5);
    const g = ctx.createGain();
    this.env(g, t, 0.75, 0.5);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.65);
    this.tone(t + 0.03, this.sfxBus, 'sawtooth', 420, 55, 0.32, 0.6, 0.01);
  }

  recordBreak(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.bell();
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone(t + 0.1 + i * 0.05, this.sfxBus, 'sine', f, null, 0.26, 0.22, 0.003);
    });
  }

  click(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(t, this.sfxBus, 'square', 1100, null, 0.12, 0.03, 0.002);
  }

  private ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }
}
