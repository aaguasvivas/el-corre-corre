// audio.ts: el sonido del barrio. 100% WebAudio synthesis, zero assets, zero
// network. Dembow sequencer with beat-quantized intensity layers tied to the
// combo, contra vía and the gas, a color per tramo (güira and requinto in la
// Zona, perico ripiao in el Campo), a low-passed idle groove between runs and
// a tape-stop on the crash, an engine that tracks speed and answers el pedal,
// bocinazos with a doppler bend, a quiet wave wash, and the full SFX set, all
// through one master limiter.
//
// The AudioContext is created and resumed on the first user gesture (iOS
// unlock). Every public call is safe to make before that: it just no-ops or
// stores state for later.

import { CONFIG } from './config';
import type { Tramo } from './tour';

const MUTE_KEY = 'ecc.v1.muted';

const KICK_STEPS = [0, 4, 8, 12];
const SNARE_STEPS = [3, 6, 11, 14]; // that syncopation IS the dembow gallop
const PERC_STEPS = [2, 5, 10, 13]; // extra layer en contra via
const BASS_PATTERN: Record<number, number> = { 0: 55, 4: 55, 7: 65.41, 8: 55, 12: 55, 14: 49 };

// Long runs need the beat to move: a pluck riff cycling Am G F E every two
// bars, kick variant every 8, a snare roll into every 4th bar, and one
// stripped breakdown bar every 16.
const CHORDS = [
  [220, 261.63, 329.63], // Am
  [196, 246.94, 293.66], // G
  [174.61, 220, 261.63], // F
  [164.81, 207.65, 246.94], // E
];
const RIFF_PATTERNS: Array<Record<number, number>> = [
  { 0: 0, 3: 1, 6: 2, 10: 1, 12: 0, 14: 2 },
  { 2: 0, 5: 2, 8: 1, 11: 0, 14: 1 },
];

// The near-miss pluck climbs the A minor pentatonic, the riff's key, from A4
// to A6 (degrees 0 3 5 7 10 12 15 17 19 22 24): every dodge is a note that
// fits whatever chord the band is on.
const PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

// Intensity layers. Entries wait for the next beat, exits for the end of the
// bar plus one bar, so a combo that flickers never chops a phrase.
const L_HAT = 0;
const L_BASS = 1;
const L_PERC = 2;
const L_GAS = 3;
const DYN_OFF = [0.3, 0, 0, 0]; // the hats keep a quiet floor under everything

// Tramo color layers: güira, requinto lick, accordion, tambora.
const T_GUIRA = 0;
const T_LICK = 1;
const T_ACC = 2;
const T_TAMB = 3;
const TRAMO_MIX: Record<Tramo, readonly number[]> = {
  malecon: [0, 0, 0, 0], // the base dembow: home
  zona: [1, 1, 0, 0], // bachata colors: güira scrape and a requinto answering the riff
  // DECISION: a perico ripiao is accordion, güira and tambora, so the güira
  // stays for el Campo too; its merengue pattern (below) is what tells the
  // two apart, together with the accordion and the tambora.
  campo: [1, 0, 1, 1],
};
// Güira per step: 0 rest, 1 short scrape, 2 long scrape on the beat.
const GUIRA_ZONA = [2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1]; // bachata: chaa, chi-ki
const GUIRA_CAMPO = [2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1]; // merengue: chaa-chi-ki-chi, nonstop
// The requinto answers the riff in its off bar, an octave above it.
const LICK: Record<number, number> = { 8: 2, 9: 1, 10: 0, 11: 1, 12: 2, 14: 0 };
// The accordion's típico tag at the end of the off bar, climbing the chord.
const ACC_TAG: Record<number, number> = { 12: 0, 13: 1, 14: 2, 15: 3 };

// The level-up marimba run: A minor up to the high C.
const LEVEL_RUN = [440, 523.25, 659.25, 880, 1046.5];

type MusicMode = 'idle' | 'run' | 'tapestop';

export interface AudioUpdateCtx {
  running: boolean;
  speedNorm: number;
  combo: number;
  contraVia: boolean;
  wheelie: boolean;
  gas: number; // 0..1, how far into the gas the felt speed is (not the raw press)
  brake: number; // 0..1, how far into the brake the felt speed is
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
  private limiter!: DynamicsCompressorNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;

  private layerKick!: GainNode;
  private layerSnare!: GainNode;
  private layerRiff!: GainNode;
  private dyn: GainNode[] = [];
  private tLayer: GainNode[] = [];
  private bar = 0;

  private engineOsc!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;

  private mutedFlag = readMute();
  private mode: MusicMode = 'idle';
  private idleAt = 0; // ctx time the idle groove may play from (after the crash gap)
  private tapeT0 = 0; // ctx time the crash tape-stop started
  private pm = 1; // pitch and tape speed of the music voices (the tape-stop drags it down)
  private step = 0;
  private nextStepAt = 0;
  private wheeliePrev = false;
  private revBlipUntil = 0; // a short over-rev on the gas engage, then the engine settles
  private nextHornAt = 0;
  private resumeCooldown = 0;

  // Quantized layers: what the run asks for, what is sounding, and when a
  // layer that is on its way out may leave (a bar index, -1 = not leaving).
  private readonly dynWant = [false, false, false, false];
  private readonly dynOn = [false, false, false, false];
  private readonly dynExitBar = [-1, -1, -1, -1];
  private readonly dynLiveUntil = [0, 0, 0, 0]; // voices keep playing through a fade-out
  private readonly dynOnGain = [0.85, 0.9, 0.8, CONFIG.gasLayerVolume];

  private tramoWant: Tramo = 'malecon';
  private tramoCur: Tramo = 'malecon';
  private readonly tramoLiveUntil = [0, 0, 0, 0];

  private prevCombo = 0;
  private dipUntil = 0; // the combo-break low-pass dip
  private duckUntil = 0;
  private lastPlatanoAt = -1;
  private platanoStreak = 0;
  private riserOn = false;
  private riserStartAt = -1; // quantized start of the La Cinta snare roll, -1 = armed

  constructor() {
    const unlock = (): void => this.unlock();
    // pointerdown only counts as a user activation for a mouse; a touch
    // activates on pointerup and touchend, so mobile Safari needs those.
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('pointerup', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
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

  // Test probe: the intensity layers should visibly swell with the combo.
  get layerGains(): { hat: number; bass: number; perc: number; gas: number } {
    const g = (i: number): number => (this.ctx ? +this.dyn[i].gain.value.toFixed(2) : 0);
    return { hat: g(L_HAT), bass: g(L_BASS), perc: g(L_PERC), gas: g(L_GAS) };
  }

  // Test probe: where the music is (mode, tramo color, bus filter and level).
  get musicState(): { mode: MusicMode; tramo: Tramo; cutoff: number; level: number; riser: boolean; streak: number } {
    return {
      mode: this.mode,
      tramo: this.tramoCur,
      cutoff: this.ctx ? Math.round(this.musicFilter.frequency.value) : 0,
      level: this.ctx ? +this.musicBus.gain.value.toFixed(3) : 0,
      riser: this.riserOn,
      streak: this.platanoStreak,
    };
  }

  setMuted(m: boolean): void {
    this.mutedFlag = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // fine
    }
    if (this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : CONFIG.masterTrim, this.ctx.currentTime, 0.03);
    }
  }

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildGraph();
    }
    // iOS can leave the context 'suspended' OR, WebKit-only, 'interrupted'
    // (a call, Siri, another app taking the audio session; no
    // visibilitychange fires for those). Checking === 'suspended' missed
    // the interrupted case and the music never came back. Any non-running
    // state gets the resume nudge, and a user gesture is the most reliable
    // place to do it.
    if ((this.ctx.state as string) !== 'running') void this.ctx.resume();
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    // Everything meets in master (the mute) and leaves through one limiter,
    // so stacked rewards over a full dembow can never clip. The compressor
    // adds its own makeup gain; masterTrim takes it back out, so anything
    // under the threshold plays at the level the mix was tuned at.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = CONFIG.limiterThresholdDb;
    this.limiter.knee.value = CONFIG.limiterKneeDb;
    this.limiter.ratio.value = CONFIG.limiterRatio;
    this.limiter.attack.value = CONFIG.limiterAttackSec;
    this.limiter.release.value = CONFIG.limiterReleaseSec;
    this.limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.mutedFlag ? 0 : CONFIG.masterTrim;
    this.master.connect(this.limiter);

    // Music: layers -> bus (level, duck) -> low-pass (idle radio, gas,
    // combo-break dip, tape-stop) -> master.
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.Q.value = 0.7;
    this.musicFilter.frequency.value = CONFIG.idleMusicHz;
    this.musicFilter.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.musicFilter);
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
    const idle = this.mode === 'idle';
    this.layerKick = mkLayer(idle ? CONFIG.idleKickGain : 1);
    this.layerSnare = mkLayer(1);
    this.layerRiff = mkLayer(idle ? CONFIG.idleRiffGain : 1);
    for (let i = 0; i < 4; i++) this.dyn.push(mkLayer(DYN_OFF[i]));
    for (let i = 0; i < 4; i++) this.tLayer.push(mkLayer(TRAMO_MIX[this.tramoCur][i] * CONFIG.tramoColorVolume));

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
    this.nextStepAt = ctx.currentTime + 0.1;
  }

  // ---------------- run lifecycle ----------------

  // A new run: the tour starts at home on the Malecón, the phrase from bar 1.
  startRun(): void {
    this.unlock();
    this.tramoWant = 'malecon';
    this.tramoCur = 'malecon';
    this.prevCombo = 0;
    this.platanoStreak = 0;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.enterRun(now);
    this.step = 0;
    this.bar = 0;
    this.nextStepAt = now + 0.06;
    for (let i = 0; i < 4; i++) {
      this.tLayer[i].gain.setTargetAtTime(0, now, 0.03);
      this.tramoLiveUntil[i] = now + 0.2;
    }
  }

  // Back from PAUSA: same run, same tramo, the groove never lost its place.
  resumeRun(): void {
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.enterRun(now);
    if (this.nextStepAt < now) this.nextStepAt = now + 0.05;
  }

  private enterRun(now: number): void {
    this.mode = 'run';
    this.pm = 1;
    this.riserOn = false;
    this.riserStartAt = -1;
    this.holdParam(this.musicBus.gain, now);
    this.holdParam(this.musicFilter.frequency, now);
    this.layerKick.gain.setTargetAtTime(1, now, 0.05);
    this.layerRiff.gain.setTargetAtTime(1, now, 0.05);
    for (let i = 0; i < 4; i++) {
      this.dynWant[i] = false;
      this.dynOn[i] = false;
      this.dynExitBar[i] = -1;
      this.dynLiveUntil[i] = now + 0.2;
      this.dyn[i].gain.setTargetAtTime(DYN_OFF[i], now, 0.05);
    }
    this.engineGain.gain.setTargetAtTime(0.05, now, 0.2);
  }

  // Pause (crashed = false) drops straight to the idle groove; a crash
  // plays a tape-stop across the slow-mo, a beat of silence, then the idle
  // groove comes back under the game-over card.
  stopRun(crashed: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.riserOn = false;
    this.riserStartAt = -1;
    this.engineGain.gain.setTargetAtTime(0, now, crashed ? 0.05 : 0.15);
    if (!crashed) {
      this.enterIdle(now, now);
      return;
    }
    // The tape-stop: the band keeps playing while the slow-mo runs, but the
    // tape drags (tempo and pitch fall an octave, see update), the low-pass
    // closes and the bus ducks, then fades out as the card lands.
    const dur = CONFIG.crashSlowmoSec;
    this.mode = 'tapestop';
    this.tapeT0 = now;
    const f = this.holdParam(this.musicFilter.frequency, now);
    f.exponentialRampToValueAtTime(CONFIG.tapeStopHz, now + dur);
    const g = this.holdParam(this.musicBus.gain, now);
    g.linearRampToValueAtTime(CONFIG.musicVolume * CONFIG.musicDuckLevel, now + dur * 0.5);
    g.linearRampToValueAtTime(0, now + dur);
    this.engineOsc.frequency.setTargetAtTime(30, now, 0.2); // the motor dies with the tape
    this.crashSfx();
  }

  private enterIdle(now: number, playFrom: number): void {
    this.mode = 'idle';
    this.idleAt = playFrom;
    this.pm = 1;
    this.layerKick.gain.setTargetAtTime(CONFIG.idleKickGain, now, 0.1);
    this.layerRiff.gain.setTargetAtTime(CONFIG.idleRiffGain, now, 0.1);
  }

  // Freeze an AudioParam where it is right now, clearing any automation
  // still queued, so a new ramp starts from what is actually sounding.
  private holdParam(p: AudioParam, now: number): AudioParam {
    const v = p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
    return p;
  }

  // Los Tramos: the color changes at the next bar and crossfades over one.
  setTramo(t: Tramo): void {
    this.tramoWant = t;
  }

  // La Cinta is close (the last tapeRiserM meters): a snare roll that
  // builds for a bar, locked to the grid. Cheap to call every tick.
  tapeRiser(on: boolean): void {
    if (on === this.riserOn) return;
    this.riserOn = on;
    this.riserStartAt = -1;
  }

  // Duck the music under a big moment, then let it back up.
  musicDuck(ms: number): void {
    if (!this.ready()) return;
    this.duckUntil = Math.max(this.duckUntil, this.ctx!.currentTime + ms / 1000);
  }

  update(dt: number, u: AudioUpdateCtx): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.ready()) {
      // an interruption that ended without a gesture or visibility change:
      // keep nudging (throttled) so the music heals on its own
      this.resumeCooldown -= dt;
      if (this.resumeCooldown <= 0) {
        this.resumeCooldown = 2;
        void ctx.resume();
      }
      return;
    }
    const now = ctx.currentTime;

    // Whatever path got us into a live run, the dembow must be armed: a
    // quick restart that skipped startRun can never leave it silent.
    if (u.running && this.mode !== 'run') this.enterRun(now);

    const live = this.mode === 'run' && u.running;
    if (live) {
      this.dynWant[L_HAT] = u.combo >= CONFIG.comboHatsAt;
      this.dynWant[L_BASS] = u.combo >= CONFIG.comboBassAt;
      this.dynWant[L_PERC] = u.contraVia;
      this.dynWant[L_GAS] = u.gas >= CONFIG.gasLayerAt;
      // A chain that decays or breaks is heard: a falling minor third and
      // a quick dip of the band. A lone near-miss fading is not a chain.
      if (u.combo === 0 && this.prevCombo >= 2) this.comboBreak();
      this.prevCombo = u.combo;
    }

    if (this.mode === 'tapestop' && now >= this.tapeT0 + CONFIG.crashSlowmoSec) {
      this.enterIdle(now, this.tapeT0 + CONFIG.crashSlowmoSec + CONFIG.idleMusicDelaySec);
      this.step = 0;
      this.nextStepAt = this.idleAt;
    }

    // The bus: level (with the duck) and the low-pass. The tape-stop owns
    // both while it plays.
    if (this.mode !== 'tapestop') {
      const ducked = now < this.duckUntil;
      let level: number = CONFIG.musicVolume;
      let cutoff: number = CONFIG.idleMusicHz;
      let tau = 0.15;
      if (this.mode === 'run') {
        if (now < this.dipUntil) {
          cutoff = CONFIG.comboBreakDipHz;
          tau = 0.03;
        } else {
          const open = this.riserOn ? 1 : Math.min(1, u.gas);
          cutoff = CONFIG.musicRunHz + (CONFIG.musicOpenHz - CONFIG.musicRunHz) * open;
          tau = 0.06; // startRun opens the radio up in about 0.2 s
        }
      } else {
        level = now >= this.idleAt ? CONFIG.musicVolume * CONFIG.idleMusicLevel : 0;
      }
      if (ducked) level *= CONFIG.musicDuckLevel;
      this.musicBus.gain.setTargetAtTime(level, now, ducked ? 0.02 : 0.12);
      this.musicFilter.frequency.setTargetAtTime(cutoff, now, tau);
    }

    // The sequencer. It runs on the title and the game-over card too (the
    // idle groove), and through the crash (the tape-stop), just not in the
    // quiet beat between them.
    if (this.mode !== 'idle' || now >= this.idleAt - 0.15) {
      const stepDur = 60 / CONFIG.audioBpm / 4;
      if (this.nextStepAt < now - 0.35) this.nextStepAt = now + 0.05; // resync after a stall
      while (this.nextStepAt < now + 0.15) {
        const t = this.nextStepAt;
        this.pm = 1;
        if (this.mode === 'tapestop') {
          const p = Math.max(0, Math.min(1, (t - this.tapeT0) / CONFIG.crashSlowmoSec));
          this.pm = Math.pow(2, -CONFIG.tapeStopOctaves * p);
        }
        this.scheduleStep(this.step, t);
        this.step = (this.step + 1) % 16;
        this.nextStepAt += stepDur / this.pm; // a dragging tape is a slower tape
      }
    }

    if (live) {
      // Engine tracks speed; revs on the caballito. The pedal has its own
      // voice on top of speed, so gas still sounds like gas at the speed cap
      // and the brake is audible at the very start of a run.
      const baseF =
        (58 + 74 * u.speedNorm) * (1 + CONFIG.engineGasRev * u.gas) * (1 - CONFIG.engineBrakeDrop * u.brake);
      const blip = now < this.revBlipUntil;
      const targetF = baseF * (u.wheelie ? 1.5 : 1) * (blip ? 1.18 : 1);
      const quick = (u.wheelie && !this.wheeliePrev) || blip;
      this.engineOsc.frequency.setTargetAtTime(targetF, now, quick ? 0.03 : 0.12);
      this.engineFilter.frequency.setTargetAtTime(380 + 680 * u.speedNorm + 700 * u.gas - 120 * u.brake, now, 0.15);
      this.engineGain.gain.setTargetAtTime(
        (0.055 + (CONFIG.engineVolume - 0.055) * u.speedNorm) *
          (u.wheelie ? 1.3 : 1) *
          (1 + 0.35 * u.gas) *
          (1 - 0.2 * u.brake),
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

  private get barDur(): number {
    return (60 / CONFIG.audioBpm) * 4;
  }

  private chordNow(): number[] {
    return CHORDS[Math.floor(this.bar / 2) % CHORDS.length];
  }

  // Beat and bar edges, in audio time: intensity layers enter on the next
  // beat and leave at the end of the bar after next; the tramo color
  // crossfades over a bar from a downbeat; the La Cinta roll starts on a beat.
  private layerEdges(s: number, t: number): void {
    if (s % 4 !== 0) return;
    for (let i = 0; i < 4; i++) {
      if (this.dynWant[i]) {
        this.dynExitBar[i] = -1;
        if (!this.dynOn[i]) {
          this.dynOn[i] = true;
          this.dynLiveUntil[i] = Infinity;
          this.dyn[i].gain.setTargetAtTime(this.dynOnGain[i], t, CONFIG.layerInSec / 3);
        }
      } else if (this.dynOn[i]) {
        if (this.dynExitBar[i] < 0) {
          this.dynExitBar[i] = this.bar + 2; // out at the end of this bar, plus one bar of hysteresis
        } else if (s === 0 && this.bar >= this.dynExitBar[i]) {
          this.dynOn[i] = false;
          this.dynExitBar[i] = -1;
          this.dyn[i].gain.setTargetAtTime(DYN_OFF[i], t, CONFIG.layerOutSec / 3);
          this.dynLiveUntil[i] = t + CONFIG.layerOutSec * 1.2;
        }
      }
    }
    if (s === 0 && this.tramoWant !== this.tramoCur) {
      const was = TRAMO_MIX[this.tramoCur];
      this.tramoCur = this.tramoWant;
      const mix = TRAMO_MIX[this.tramoCur];
      for (let i = 0; i < 4; i++) {
        this.tLayer[i].gain.setTargetAtTime(mix[i] * CONFIG.tramoColorVolume, t, this.barDur / 3);
        if (mix[i] > 0) this.tramoLiveUntil[i] = Infinity;
        else if (was[i] > 0) this.tramoLiveUntil[i] = t + this.barDur * 1.5; // play on through the fade
      }
    }
    if (this.riserOn && this.riserStartAt < 0) this.riserStartAt = t;
  }

  // Dembow, not reggaeton: driving tempo, hats on every 16th, and the
  // ghost-snare doubles after 6 and 14 that give it the gallop. Phrase-level
  // variation keeps long runs alive without ever stopping the groove. Idle
  // (title and game over) is the colmado radio: kick and riff only.
  private scheduleStep(s: number, t: number): void {
    const idle = this.mode === 'idle';
    const bar = this.bar;
    const breakdown = !idle && bar % 16 === 11;
    if (!idle) this.layerEdges(s, t);
    const riser = !idle && this.riserOn && this.riserStartAt >= 0 && t >= this.riserStartAt;
    if (!breakdown && KICK_STEPS.includes(s)) this.kick(t);
    if (!idle) {
      if (!breakdown) {
        if (bar % 8 >= 4 && s === 10) this.kick(t); // variant B doubles the kick
        if (SNARE_STEPS.includes(s)) this.snare(t, false);
        if (s === 7 || s === 15) this.snare(t, true); // the "ra-ta"
      }
      if (riser) {
        // La Cinta is coming: a roll that swells over one bar, 16ths into 32nds
        const p = Math.min(1, (t - this.riserStartAt) / this.barDur);
        this.rollHit(t, p);
        if (p > 0.5) this.rollHit(t + 30 / CONFIG.audioBpm / 4, p);
      } else if (bar % 4 === 3 && s >= 12) {
        this.noiseHit(t, this.layerSnare, 0.18 + (s - 12) * 0.09, 0.05, 'bandpass', 1900 * this.pm, 1.1, 0.004, this.pm);
      }
      this.hat(t, false, s % 4 === 2);
      if (s === 7 || s === 15) this.hat(t, true, false);
      if (this.audible(L_BASS, t)) {
        const bassF = BASS_PATTERN[s];
        if (bassF !== undefined) this.bassNote(t, bassF);
      }
      if (this.audible(L_PERC, t) && PERC_STEPS.includes(s)) this.perc(t);
      // a fondo: open hats on the off-beat 8ths
      if (this.audible(L_GAS, t) && s % 4 === 2) this.openHat(t);
      this.tramoColor(s, t, bar);
    }
    if (!breakdown) {
      const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
      const pattern = RIFF_PATTERNS[Math.floor(bar / 8) % RIFF_PATTERNS.length];
      const noteIdx = pattern[s];
      if (noteIdx !== undefined) {
        this.pluck(t, chord[noteIdx] * 2);
        if (!idle && t < this.tramoLiveUntil[T_ACC]) this.accordion(t, chord[noteIdx] * 2, 0.16);
      }
    }
    if (s === 15) this.bar++;
  }

  private audible(layer: number, t: number): boolean {
    return this.dynOn[layer] || t < this.dynLiveUntil[layer];
  }

  // The tramo's own instruments on top of the dembow.
  private tramoColor(s: number, t: number, bar: number): void {
    const cur = this.tramoCur;
    if (t < this.tramoLiveUntil[T_GUIRA]) {
      const g = (cur === 'campo' ? GUIRA_CAMPO : GUIRA_ZONA)[s];
      if (g > 0) this.guira(t, g === 2, s % 4 === 2);
    }
    const offBar = bar % 2 === 1;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    if (offBar && t < this.tramoLiveUntil[T_LICK]) {
      const i = LICK[s];
      if (i !== undefined) this.requinto(t, chord[i] * 4);
    }
    if (offBar && t < this.tramoLiveUntil[T_ACC]) {
      const i = ACC_TAG[s];
      if (i !== undefined) this.accordion(t, (i === 3 ? chord[0] * 2 : chord[i]) * 2, 0.09);
    }
    if (t < this.tramoLiveUntil[T_TAMB]) {
      if (s === 4 || s === 5 || s === 12 || s === 13) this.tambora(t, false);
      else if (s === 7 || s === 15) this.tambora(t, true);
    }
  }

  private pluck(t: number, f: number): void {
    const pm = this.pm;
    this.tone(t, this.layerRiff, 'triangle', f * pm, null, CONFIG.riffVolume * 2, 0.16, 0.004);
    this.tone(t, this.layerRiff, 'sine', f * 2 * pm, null, CONFIG.riffVolume * 0.7, 0.1, 0.004);
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
    attack = 0.004,
    rate = 1,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopStart = Math.random() * 0.8;
    src.loopEnd = src.loopStart + 0.35;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, decay, attack);
    src.connect(f).connect(g).connect(dest);
    src.start(t, src.loopStart);
    src.stop(t + attack + decay + 0.1);
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
    const pm = this.pm;
    this.tone(t, this.layerKick, 'sine', 155 * pm, 52 * pm, 1.0, 0.12);
    this.noiseHit(t, this.layerKick, 0.28, 0.012, 'highpass', 2200 * pm, 1, 0.004, pm);
  }

  private snare(t: number, ghost: boolean): void {
    const pm = this.pm;
    this.noiseHit(t, this.layerSnare, ghost ? 0.26 : 0.52, ghost ? 0.06 : 0.09, 'bandpass', 1900 * pm, 1.1, 0.004, pm);
    if (!ghost) this.tone(t, this.layerSnare, 'sine', 190 * pm, 130 * pm, 0.2, 0.05);
  }

  private rollHit(t: number, p: number): void {
    this.noiseHit(t, this.layerSnare, 0.08 + 0.3 * p, 0.045, 'bandpass', 1700 + 1300 * p, 1.2);
  }

  private hat(t: number, open: boolean, accent: boolean): void {
    const peak = open ? 0.32 : accent ? 0.3 : 0.16;
    this.noiseHit(t, this.dyn[L_HAT], peak, open ? 0.15 : 0.04, 'highpass', 6800 * this.pm, 1, 0.004, this.pm);
  }

  private openHat(t: number): void {
    this.noiseHit(t, this.dyn[L_GAS], 0.24, 0.13, 'highpass', 7600 * this.pm, 1, 0.004, this.pm);
  }

  private bassNote(t: number, f: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f * this.pm;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    const g = ctx.createGain();
    this.env(g, t, 0.55, 0.17, 0.008);
    o.connect(lp).connect(g).connect(this.dyn[L_BASS]);
    o.start(t);
    o.stop(t + 0.3);
  }

  private perc(t: number): void {
    this.tone(t, this.dyn[L_PERC], 'square', 880 * this.pm, null, 0.12, 0.025);
    this.noiseHit(t, this.dyn[L_PERC], 0.2, 0.03, 'highpass', 3400 * this.pm, 1, 0.004, this.pm);
  }

  // La güira: a scraper dragged over ridged metal. Bright band-passed noise
  // with a soft attack; the long scrape sits on the beat.
  private guira(t: number, long: boolean, accent: boolean): void {
    const peak = long ? 0.3 : accent ? 0.2 : 0.13;
    this.noiseHit(t, this.tLayer[T_GUIRA], peak, long ? 0.11 : 0.035, 'bandpass', 6200 * this.pm, 1.4, long ? 0.035 : 0.008, this.pm);
  }

  // El requinto: the bachata lead guitar, a bright pick with a fast decay.
  private requinto(t: number, f: number): void {
    const pm = this.pm;
    this.tone(t, this.tLayer[T_LICK], 'triangle', f * pm * 1.012, f * pm, 0.2, 0.14, 0.003); // the finger lands a hair sharp
    this.tone(t, this.tLayer[T_LICK], 'sawtooth', f * pm, null, 0.03, 0.05, 0.002);
  }

  // The accordion: two square reeds a few cents apart through a warm
  // low-pass, a slower attack than any pluck.
  private accordion(t: number, f: number, len: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = ctx.createGain();
    this.env(g, t, 0.07, len, 0.012);
    lp.connect(g).connect(this.tLayer[T_ACC]);
    this.reed(t, f * this.pm, -9, lp, len);
    this.reed(t, f * this.pm, 9, lp, len);
  }

  private reed(t: number, f: number, cents: number, dest: AudioNode, len: number): void {
    const o = this.ctx!.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.detune.value = cents;
    o.connect(dest);
    o.start(t);
    o.stop(t + len + 0.12);
  }

  // La tambora: an open low tone and the slap on the other head.
  private tambora(t: number, open: boolean): void {
    const pm = this.pm;
    if (open) {
      this.tone(t, this.tLayer[T_TAMB], 'sine', 185 * pm, 105 * pm, 0.5, 0.16, 0.003);
      this.noiseHit(t, this.tLayer[T_TAMB], 0.08, 0.02, 'lowpass', 1200 * pm, 1, 0.002, pm);
    } else {
      this.noiseHit(t, this.tLayer[T_TAMB], 0.2, 0.03, 'bandpass', 950 * pm, 1.8, 0.002, pm);
      this.tone(t, this.tLayer[T_TAMB], 'sine', 320 * pm, 240 * pm, 0.1, 0.03);
    }
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

  // A marimba bar: the fundamental plus the fourth-harmonic ping that
  // dies first.
  private marimba(t: number, f: number, peak: number, decay: number): void {
    this.tone(t, this.sfxBus, 'sine', f, null, peak, decay, 0.003);
    this.tone(t, this.sfxBus, 'sine', f * 4, null, peak * 0.22, decay * 0.25, 0.002);
  }

  // A brassy note: a low-passed sawtooth with the square an octave down.
  private brass(t: number, f: number, peak: number, len: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(2800, t + 0.04);
    lp.connect(this.sfxBus);
    this.tone(t, lp, 'sawtooth', f, null, peak, len, 0.012);
    this.tone(t, lp, 'square', f / 2, null, peak * 0.35, len, 0.012);
  }

  private cymbal(t: number, peak: number, decay: number): void {
    this.noiseHit(t, this.sfxBus, peak, decay, 'highpass', 5200, 0.8, 0.003);
  }

  // Plátano: the 3-note run. Pickups less than platanoStreakSec apart are a
  // string, and every plátano in a string rises a semitone (capped), so a
  // long string is heard climbing. The run tightens inside a string so
  // back-to-back runs never smear into each other.
  platano(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    if (this.lastPlatanoAt >= 0 && t - this.lastPlatanoAt < CONFIG.platanoStreakSec) {
      this.platanoStreak = Math.min(CONFIG.platanoStreakMax, this.platanoStreak + 1);
    } else {
      this.platanoStreak = 0;
    }
    this.lastPlatanoAt = t;
    const up = Math.pow(2, this.platanoStreak / 12);
    const gap = this.platanoStreak > 0 ? 0.032 : 0.055;
    this.platanoNote(t, 523.25 * up);
    this.platanoNote(t + gap, 659.25 * up);
    this.platanoNote(t + gap * 2, 783.99 * up);
  }

  private platanoNote(t: number, f: number): void {
    const det = 1 + (Math.random() - 0.5) * 0.006;
    this.tone(t, this.sfxBus, 'sine', f * det, null, 0.3, 0.22, 0.003);
    this.tone(t, this.sfxBus, 'triangle', f * det * 2, null, 0.08, 0.1, 0.003);
  }

  powerup(kind: 'cafecito' | 'iman'): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const notes = kind === 'cafecito' ? [523.25, 659.25, 783.99, 1046.5] : [783.99, 659.25, 523.25];
    notes.forEach((f, i) => {
      this.tone(t + i * 0.05, this.sfxBus, 'sine', f, null, 0.28, 0.2, 0.003);
    });
  }

  // The bendición bell chord.
  bell(): void {
    if (!this.ready()) return;
    this.bellAt(this.ctx!.currentTime, 1, 1);
  }

  // El Obelisco: the same bell, a fourth lower and longer, like a big
  // church bell, so it never reads as a Bendición.
  obelisco(): void {
    if (!this.ready()) return;
    this.bellAt(this.ctx!.currentTime, 0.75, 1.1);
  }

  private bellAt(t: number, pitch: number, gain: number): void {
    this.tone(t, this.sfxBus, 'sine', 659.25 * pitch, null, 0.35 * gain, 1.1, 0.006);
    this.tone(t, this.sfxBus, 'sine', 987.77 * pitch, null, 0.22 * gain, 1.1, 0.006);
    this.tone(t, this.sfxBus, 'sine', 1567.98 * pitch, null, 0.1 * gain, 1.1, 0.006);
  }

  // Near-miss: the whoosh rises a semitone per combo step (k = combo - 1,
  // capped at 12) with a random +/-25 cents so it never grates, and a pluck
  // climbs the pentatonic on top. A razor pass is brighter: the whoosh +2
  // semitones, the pluck one scale step higher with a glassy octave.
  nearMiss(pan: number, combo: number, razor: boolean): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const k = Math.min(Math.max(combo, 1) - 1, 12) + (razor ? 2 : 0);
    const cents = (Math.random() - 0.5) * 50;
    const mul = Math.pow(2, (k * 100 + cents) / 1200);
    const dest = this.panner(pan);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = razor ? 2.2 : 1.6;
    f.frequency.setValueAtTime(450 * mul, t);
    f.frequency.exponentialRampToValueAtTime(2700 * mul, t + 0.16);
    const g = ctx.createGain();
    this.env(g, t, 0.36, 0.17);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.6);
    src.stop(t + 0.3);

    // DECISION: a razor pass steps one scale degree up instead of a flat +2
    // semitones, so the pluck stays in key; the whoosh carries the +2.
    let idx = Math.max(combo, 1) - 1 + (razor ? 1 : 0);
    if (idx > PENTA.length - 1) idx = PENTA.length - 1 - ((idx - (PENTA.length - 1)) % 2); // past the top: alternate the top two
    const pf = PENTA[idx];
    const pv = CONFIG.nearMissPluckVolume;
    this.tone(t + 0.02, this.sfxBus, 'triangle', pf, null, pv, 0.18, 0.006);
    this.tone(t + 0.02, this.sfxBus, 'sine', pf * 2, null, pv * (razor ? 0.7 : 0.35), razor ? 0.16 : 0.1, 0.006);
  }

  // A combo ladder tier (2/3/5/7/10/15): the band answers with a 3-note
  // arpeggio of the chord it is on; from ¡Tú ta' loco! up it adds the top
  // octave, and ¡ETE E' UN LOCO! and up get brass and a cymbal.
  ladder(combo: number): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime + 0.04;
    const c = this.chordNow();
    const pv = CONFIG.nearMissPluckVolume * 0.85;
    for (let i = 0; i < 3; i++) {
      this.tone(t + i * 0.045, this.sfxBus, 'triangle', c[i] * 2, null, pv, 0.4, 0.004);
      this.tone(t + i * 0.045, this.sfxBus, 'sine', c[i] * 4, null, pv * 0.4, 0.3, 0.004);
    }
    if (combo >= 7) this.tone(t + 0.135, this.sfxBus, 'triangle', c[0] * 8, null, pv * 0.8, 0.45, 0.004);
    if (combo >= 10) {
      this.brass(t + 0.135, c[0] * 2, 0.07, 0.35);
      this.cymbal(t + 0.135, 0.1, 0.5);
    }
  }

  // The chain decayed or broke: a falling minor third (C to A, in key) and
  // a 350 ms dip of the band's low-pass. A loss you hear, not a punishment.
  comboBreak(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const pv = CONFIG.nearMissPluckVolume * 0.5;
    this.tone(t, this.sfxBus, 'triangle', 523.25, null, pv, 0.11, 0.006);
    this.tone(t + 0.11, this.sfxBus, 'triangle', 440, null, pv, 0.16, 0.006);
    this.dipUntil = t + CONFIG.comboBreakDipSec * 0.45;
  }

  // The distance multiplier went up (x2, x3, x4): the riff chord climbing
  // in four notes, one octave higher per tier.
  multUp(tier: number): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const c = this.chordNow();
    const oct = Math.pow(2, Math.max(1, Math.min(4, tier)) - 1);
    const notes0 = c[0] * oct;
    for (let i = 0; i < 4; i++) {
      const f = i === 3 ? notes0 * 2 : c[i] * oct;
      this.tone(t + i * 0.065, this.sfxBus, 'triangle', f, null, 0.2, 0.2, 0.004);
      this.tone(t + i * 0.065, this.sfxBus, 'sine', f * 2, null, 0.06, 0.12, 0.004);
    }
    this.cymbal(t + 0.2, 0.07, 0.35);
  }

  // Arriving in a new tramo: a brassy ta-ra-rá with a güira shake under it,
  // the tramo card's own fanfare.
  tramo(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.brass(t, 523.25, 0.12, 0.1);
    this.brass(t + 0.12, 659.25, 0.12, 0.1);
    this.brass(t + 0.24, 783.99, 0.13, 0.45);
    this.noiseHit(t + 0.24, this.sfxBus, 0.12, 0.3, 'bandpass', 6200, 1.4, 0.06);
    this.musicDuck(700);
  }

  // The Bendición took the hit: a glassy crack, then its bell.
  shieldBreak(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, this.sfxBus, 0.3, 0.12, 'highpass', 5000, 1.5, 0.002);
    this.tone(t, this.sfxBus, 'sine', 2637, 2400, 0.07, 0.22, 0.002);
    this.tone(t, this.sfxBus, 'sine', 3765, 3500, 0.05, 0.18, 0.002);
    this.tone(t, this.sfxBus, 'sine', 4061, null, 0.04, 0.14, 0.002);
    this.bellAt(t + 0.09, 1, 0.9);
  }

  // The cafecito is running out: three ticks in its last second (left =
  // 3, 2, 1); the last one higher, like a countdown.
  cafecitoTick(left: number): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(t, this.sfxBus, 'square', left <= 1 ? 1320 : 1100, null, 0.12, left <= 1 ? 0.06 : 0.03, 0.002);
  }

  // The imán let go: a soft falling pair.
  imanEnd(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(t, this.sfxBus, 'sine', 659.25, null, 0.16, 0.16, 0.004);
    this.tone(t + 0.09, this.sfxBus, 'sine', 523.25, null, 0.16, 0.22, 0.004);
  }

  // A mandao done: three marimba notes up, then a bell.
  mandao(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.marimba(t, 659.25, 0.28, 0.3);
    this.marimba(t + 0.07, 783.99, 0.28, 0.3);
    this.marimba(t + 0.14, 1046.5, 0.3, 0.45);
    this.bellAt(t + 0.24, 1, 0.8);
    this.musicDuck(600);
  }

  // A mandao level up: a longer marimba run into a held brass chord, a
  // bell and a cymbal. Bigger than a single mandao on purpose.
  levelUp(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < LEVEL_RUN.length; i++) this.marimba(t + i * 0.055, LEVEL_RUN[i], 0.24, 0.25);
    const c = t + 0.3;
    this.brass(c, 880, 0.08, 0.6);
    this.brass(c, 1108.73, 0.07, 0.6);
    this.brass(c, 1318.51, 0.06, 0.6);
    this.cymbal(c, 0.12, 0.9);
    this.bellAt(c + 0.05, 1, 0.8);
    this.musicDuck(1200);
  }

  // ¡NUEVO RÉCORD! (the points record): a ta-ta-TAA fanfare leaping a
  // fourth, a cymbal and the bell.
  recordStinger(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.brass(t, 659.25, 0.13, 0.08);
    this.brass(t + 0.11, 659.25, 0.13, 0.08);
    this.brass(t + 0.22, 880, 0.15, 0.55);
    this.cymbal(t + 0.22, 0.14, 0.9);
    this.bellAt(t + 0.26, 1.5, 0.7);
    this.musicDuck(1400);
  }

  // Bursting La Cinta (¡MÁS LEJOS QUE NUNCA!): a party-popper pop, the riff
  // chord plucked up an octave, and the bell. It also ends the riser.
  farthest(): void {
    this.tapeRiser(false);
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, this.sfxBus, 0.4, 0.06, 'bandpass', 1800, 0.9, 0.002);
    const c = this.chordNow();
    for (let i = 0; i < 4; i++) {
      const f = (i === 3 ? c[0] * 2 : c[i]) * 4;
      this.tone(t + 0.05 + i * 0.045, this.sfxBus, 'triangle', f, null, 0.22, 0.3, 0.004);
      this.tone(t + 0.05 + i * 0.045, this.sfxBus, 'sine', f * 2, null, 0.06, 0.2, 0.004);
    }
    this.bellAt(t + 0.1, 1, 1);
    this.musicDuck(900);
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

  // El pedal. The press itself must sound at once, even though the speed
  // eases in behind it: a turbo whoosh and an over-rev on gas...
  turbo(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.revBlipUntil = t + 0.15;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    const g = ctx.createGain();
    this.env(g, t, CONFIG.pedalSfxVolume, 0.25, 0.02);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.6);
    src.stop(t + 0.35);
  }

  // ...and a tire chirp on the brake.
  brake(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    const g = ctx.createGain();
    this.env(g, t, CONFIG.pedalSfxVolume * 0.9, 0.2, 0.006);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.6);
    src.stop(t + 0.3);
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

  click(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(t, this.sfxBus, 'square', 1100, null, 0.12, 0.03, 0.002);
  }

  private ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }
}
