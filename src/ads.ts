// ads.ts: Google AdMob for El Corre Corre (docs/audit/ADS-PLAN.md). Three
// pieces, all plain logic over an AdsPort so the tests drive every branch
// with a fake plugin:
//
//   runConsentFlow  consent (Google UMP), then App Tracking Transparency,
//                   then the SDK start. It follows the two App Review lessons
//                   of the owner's other apps: a bounded wait for the app to
//                   be in front, and an explicit tracking request whenever
//                   the status is still undecided, because the consent step
//                   alone shows nothing on US devices. Every step is bounded
//                   except the player's own answer. An explicit "no" keeps
//                   ads dark; a consent step that breaks fails open to
//                   non-personalized ads.
//   RewardedOffer   "Dobla tus plátanos": one preloaded rewarded video, and
//                   at most one reward per run.
//   BannerSlot      the one anchored adaptive banner of the pause screen and
//                   the Los Mandaos sheet: shown only while wanted, its
//                   height reported so the page reserves space only for a
//                   banner that is really there, failed loads retried a few
//                   times with backoff and then left alone.
//
// Ads can fail forever and the game stays fully playable offline: nothing
// here is awaited by the game, and the web build has no port at all.

import { CONFIG } from './config';
import { withTimeout } from './bounded';

export type AttStatus = 'authorized' | 'denied' | 'notDetermined' | 'restricted';

export interface ConsentInfo {
  status: 'REQUIRED' | 'NOT_REQUIRED' | 'OBTAINED' | 'UNKNOWN';
  isConsentFormAvailable?: boolean;
  canRequestAds: boolean;
  privacyOptionsRequirementStatus?: 'REQUIRED' | 'NOT_REQUIRED' | 'UNKNOWN';
}

export type RewardedEvent = 'showed' | 'rewarded' | 'dismissed' | 'failedToShow';
export type BannerEvent = { kind: 'size'; height: number } | { kind: 'failed' };

// What the ads need from the AdMob plugin: src/admobPort.ts on iOS,
// src/simAds.ts in a dev page opened with ?ads=sim, a fake in the tests.
export interface AdsPort {
  readonly isIOS: boolean;
  requestConsentInfo(): Promise<ConsentInfo>;
  showConsentForm(): Promise<ConsentInfo>;
  showPrivacyOptionsForm(): Promise<void>;
  trackingStatus(): Promise<AttStatus>;
  requestTracking(): Promise<void>; // resolves once the player has answered
  initialize(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  loadRewarded(npa: boolean): Promise<void>; // resolves loaded, rejects on failure
  // Asks the SDK to present the loaded video. What happens next arrives
  // through onRewarded; this promise may never settle (the plugin resolves
  // it only on a reward), so nothing waits on it except a rejection.
  showRewarded(): Promise<unknown>;
  onRewarded(cb: (e: RewardedEvent) => void): void;
  showBanner(npa: boolean): Promise<void>; // creates and loads it; it appears when loaded
  hideBanner(): Promise<void>;
  resumeBanner(): Promise<void>;
  removeBanner(): Promise<void>;
  onBanner(cb: (e: BannerEvent) => void): void;
}

// What the flow needs from the game.
export interface FlowEnv {
  isForeground(): boolean;
  onForeground(cb: () => void): () => void; // returns its own unsubscribe
  // Resolves when a prompt may open: the title is up and the app is in
  // front. Never during a run, the countdown or a crash.
  whenCalm(): Promise<void>;
}

export interface FlowTiming {
  adsForegroundWaitMs: number;
  adsConsentTimeoutMs: number;
  adsConsentFormMaxMs: number;
  adsStepTimeoutMs: number;
  adsInitTimeoutMs: number;
}

// ok: consent fine, SDK started. failedOpen: the consent step broke (offline,
// blocked, timed out), the SDK started non-personalized. declined: the
// consent answer says no ads, so ads stay dark. initFailed: the SDK did not
// start; a later title visit may try again.
export type FlowOutcome = 'ok' | 'failedOpen' | 'declined' | 'initFailed';

export interface ConsentResult {
  outcome: FlowOutcome;
  ads: boolean; // ads may be requested
  npa: boolean; // request non-personalized ads
  privacyOptions: boolean; // the consent rules ask for an in-app way back to the choices
}

// Resolves once the app is in front, or after maxMs, whichever is first. A
// tracking request made while iOS still has the app in the background is
// dropped without a prompt; but a visibility signal that never arrives must
// not hold the flow either (iOS presents a queued request once active).
export function waitForeground(env: FlowEnv, maxMs: number): Promise<void> {
  if (env.isForeground()) return Promise.resolve();
  return new Promise((resolve) => {
    let off: () => void = () => {};
    const done = (): void => {
      clearTimeout(killer);
      clearInterval(poll);
      off();
      resolve();
    };
    const killer = setTimeout(done, maxMs);
    const poll = setInterval(() => {
      if (env.isForeground()) done();
    }, 250);
    off = env.onForeground(done);
  });
}

export async function runConsentFlow(port: AdsPort, env: FlowEnv, t: FlowTiming = CONFIG): Promise<ConsentResult> {
  await waitForeground(env, t.adsForegroundWaitMs);

  // 1. Consent (UMP). On filtered or slow networks (review environments
  // included) this can stall; a stall must not stop the tracking prompt.
  let errored = false;
  let info: ConsentInfo | null = null;
  try {
    info = await withTimeout(port.requestConsentInfo(), t.adsConsentTimeoutMs);
  } catch {
    errored = true;
  }
  if (info && info.status === 'REQUIRED' && info.isConsentFormAvailable) {
    await env.whenCalm();
    try {
      info = await withTimeout(port.showConsentForm(), t.adsConsentFormMaxMs);
    } catch {
      errored = true; // the form never loaded or could not show
    }
  }
  const privacyOptions = info?.privacyOptionsRequirementStatus === 'REQUIRED';
  // An explicit "no" stays dark: the consent step answered and says ads may
  // not be requested. Only a step that broke before answering fails open.
  if (!errored && info && !info.canRequestAds) return { outcome: 'declined', ads: false, npa: true, privacyOptions };

  // 2. App Tracking Transparency, asked explicitly whenever it is still
  // undecided. If the consent step already asked (an IDFA message), the
  // status is decided and this is a no-op.
  let att: AttStatus = 'authorized'; // no tracking prompt off iOS
  if (port.isIOS) {
    try {
      await waitForeground(env, t.adsForegroundWaitMs);
      att = await withTimeout(port.trackingStatus(), t.adsStepTimeoutMs);
      if (att === 'notDetermined') {
        await env.whenCalm();
        await port.requestTracking(); // the player's answer: no deadline
        att = await withTimeout(port.trackingStatus(), t.adsStepTimeoutMs);
      }
    } catch {
      att = 'denied'; // tracking unavailable: ads go non-personalized
    }
  }

  // DECISION: non-personalized unless the player allowed tracking and the
  // consent step answered. A broken consent step or a "no" to tracking
  // still gets ads (outside the EEA they need no consent), just never
  // personalized ones.
  const npa = errored || att !== 'authorized';

  // 3. Start the SDK.
  try {
    await withTimeout(port.initialize(), t.adsInitTimeoutMs);
  } catch {
    return { outcome: 'initFailed', ads: false, npa, privacyOptions };
  }
  return { outcome: errored ? 'failedOpen' : 'ok', ads: true, npa, privacyOptions };
}

// ---------------------------------------------------------------------------
// "Dobla tus plátanos": the rewarded video's bookkeeping. No plugin calls.
// ---------------------------------------------------------------------------

export type RewardedPhase = 'idle' | 'loading' | 'loaded' | 'showing';

export class RewardedOffer {
  phase: RewardedPhase = 'idle';
  private run = 0; // the current run, counted from 1
  private paidRun = -1; // the run whose reward was granted
  private shown: { run: number; amount: number } | null = null; // the last video put on screen
  private loadedAt = 0;

  runStarted(): void {
    this.run++;
  }

  // A video should be loading now: none is held, or the one held is about
  // to expire. A video on screen is never replaced.
  wantsLoad(nowSec: number): boolean {
    if (this.phase === 'idle') return true;
    return this.phase === 'loaded' && nowSec - this.loadedAt > CONFIG.rewardedMaxAgeSec;
  }

  loading(): void {
    this.phase = 'loading';
  }

  loaded(nowSec: number): void {
    if (this.phase !== 'loading') return;
    this.phase = 'loaded';
    this.loadedAt = nowSec;
  }

  loadFailed(): void {
    if (this.phase === 'loading') this.phase = 'idle';
  }

  // The card may offer the video: one is loaded, the run earned at least one
  // plátano, and this run has not been paid yet.
  canOffer(earned: number): boolean {
    return this.phase === 'loaded' && Math.floor(earned) >= 1 && this.paidRun !== this.run;
  }

  // The player tapped: the video goes up for this run's amount.
  begin(earned: number): boolean {
    if (!this.canOffer(earned)) return false;
    this.phase = 'showing';
    this.shown = { run: this.run, amount: Math.floor(earned) };
    return true;
  }

  // The SDK says the reward was earned. Returns the plátanos to add, once
  // per run at most (0 for a repeat or a stray event).
  reward(): number {
    const s = this.shown;
    if (!s || this.paidRun === s.run) return 0;
    this.paidRun = s.run;
    return s.amount;
  }

  // The video is gone (dismissed, or it never showed): the next may load.
  end(): void {
    if (this.phase === 'showing') this.phase = 'idle';
  }

  get paidThisRun(): boolean {
    return this.paidRun === this.run;
  }
}

// ---------------------------------------------------------------------------
// The banner slot.
// ---------------------------------------------------------------------------

export interface BannerPort {
  showBanner(npa: boolean): Promise<void>;
  hideBanner(): Promise<void>;
  resumeBanner(): Promise<void>;
  removeBanner(): Promise<void>;
}

// none: no banner exists. loading: asked for, not on screen yet. shown and
// hidden: loaded, on screen or tucked away for the next calm screen.
type BannerState = 'none' | 'loading' | 'shown' | 'hidden';

export class BannerSlot {
  private wanted = false;
  private ready = false;
  private adFree = false;
  private npa = true;
  private state: BannerState = 'none';
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private height = 0;

  constructor(
    private readonly port: BannerPort,
    private readonly onHeight: (h: number) => void,
    private readonly retrySec: readonly number[] = CONFIG.bannerRetrySec,
  ) {}

  // The screens that may carry it are up (the pause screen, the mandao sheet).
  setWanted(on: boolean): void {
    if (on === this.wanted) return;
    this.wanted = on;
    this.reconcile();
  }

  // The SDK has started (with these request options).
  setReady(on: boolean, npa: boolean): void {
    this.ready = on;
    this.npa = npa;
    this.reconcile();
  }

  // Remove Ads owned: the banner goes at once and never comes back.
  setAdFree(on: boolean): void {
    if (on === this.adFree) return;
    this.adFree = on;
    this.reconcile();
  }

  get gaveUp(): boolean {
    return this.failures > this.retrySec.length;
  }

  // For probes and tests.
  get view(): { state: BannerState; height: number; failures: number; retrying: boolean } {
    return { state: this.state, height: this.height, failures: this.failures, retrying: this.retryTimer !== null };
  }

  private get shouldShow(): boolean {
    return this.wanted && this.ready && !this.adFree;
  }

  private setHeight(h: number): void {
    if (h === this.height) return;
    this.height = h;
    this.onHeight(h);
  }

  private reconcile(): void {
    if (this.adFree) {
      this.clearRetry();
      this.setHeight(0);
      if (this.state !== 'none') {
        this.state = 'none';
        void this.port.removeBanner().catch(() => {});
      }
      return;
    }
    if (!this.shouldShow) {
      // The page gives the space back at once, not when the event arrives.
      this.setHeight(0);
      if (this.state === 'shown') {
        this.state = 'hidden';
        void this.port.hideBanner().catch(() => {});
      }
      // A banner still loading is hidden the moment it arrives (onSize).
      return;
    }
    if (this.state === 'none' && this.retryTimer === null && !this.gaveUp) {
      this.state = 'loading';
      this.port.showBanner(this.npa).catch(() => this.onFailed());
    } else if (this.state === 'hidden') {
      this.state = 'shown';
      // The size event that follows reserves the space. A banner the SDK
      // dropped meanwhile cannot resume: start over with a fresh load.
      this.port.resumeBanner().catch(() => {
        this.state = 'none';
        this.reconcile();
      });
    }
  }

  // The plugin's size event: a banner is on screen at this height, or gone.
  onSize(h: number): void {
    if (h <= 0) {
      if (this.state === 'shown' && this.shouldShow) this.setHeight(0);
      return;
    }
    if (this.state === 'none') return; // a stale event from a removed banner
    this.failures = 0;
    if (!this.shouldShow) {
      // It loaded after its screen closed: tuck it away at once.
      this.state = 'hidden';
      this.setHeight(0);
      void this.port.hideBanner().catch(() => {});
      return;
    }
    this.state = 'shown';
    this.setHeight(h);
  }

  // A load failed (the plugin already took the view down).
  onFailed(): void {
    this.state = 'none';
    this.setHeight(0);
    this.failures++;
    this.clearRetry();
    if (this.gaveUp) return; // stay quiet for the rest of the session
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.reconcile(); // loads again only if a calm screen is up
    }, this.retrySec[this.failures - 1] * 1000);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

// ---------------------------------------------------------------------------
// The game's ads: the flow, the rewarded video and the banner, wired to one
// port. Null port (the web build): every call is a no-op.
// ---------------------------------------------------------------------------

export type RewardedEnd = 'rewarded' | 'dismissed' | 'failed';

export class Ads {
  ready = false;
  npa = true;
  privacyOptions = false;
  outcome: FlowOutcome | null = null;
  readonly rewarded = new RewardedOffer();
  readonly banner: BannerSlot | null;
  // A rewarded video became available or went away (the card re-reads it).
  onRewardedChange: () => void = () => {};
  onReady: () => void = () => {};

  private flow: Promise<ConsentResult | null> | null = null;
  private onRewardedEvent: ((e: RewardedEvent) => void) | null = null;
  private lastGrant: ((n: number) => void) | null = null;

  constructor(
    private readonly port: AdsPort | null,
    private readonly env: FlowEnv,
    onBannerHeight: (h: number) => void,
    private readonly clock: () => number = () => performance.now() / 1000,
  ) {
    this.banner = port ? new BannerSlot(port, onBannerHeight) : null;
    if (!port) return;
    port.onBanner((e) => {
      if (e.kind === 'size') this.banner?.onSize(e.height);
      else this.banner?.onFailed();
    });
    port.onRewarded((e) => {
      if (this.onRewardedEvent) {
        this.onRewardedEvent(e);
        return;
      }
      // A reward that lands after its video was closed still pays.
      if (e === 'rewarded') {
        const n = this.rewarded.reward();
        if (n > 0) this.lastGrant?.(n);
      }
    });
  }

  get enabled(): boolean {
    return this.port !== null;
  }

  // The consent flow, once. A flow whose SDK start failed may run again on
  // a later title visit; an answered one never asks twice in a session.
  start(): Promise<ConsentResult | null> {
    if (!this.port) return Promise.resolve(null);
    if (!this.flow) {
      const port = this.port;
      this.flow = runConsentFlow(port, this.env).then(
        (r) => {
          this.outcome = r.outcome;
          this.npa = r.npa;
          this.privacyOptions = r.privacyOptions;
          if (r.outcome === 'initFailed') this.flow = null; // the next title visit tries again
          if (r.ads) {
            this.ready = true;
            this.banner?.setReady(true, r.npa);
            this.loadRewarded();
          }
          this.onReady();
          return r;
        },
        () => {
          this.flow = null;
          return null;
        },
      );
    }
    return this.flow;
  }

  // Is a flow still owed? (main starts it on the title.)
  get pending(): boolean {
    return this.port !== null && this.flow === null && this.outcome !== 'declined';
  }

  // A run started: make sure a video is waiting at its end.
  runStarted(): void {
    this.rewarded.runStarted();
    this.loadRewarded();
  }

  canOffer(earned: number): boolean {
    return this.ready && this.rewarded.canOffer(earned);
  }

  // Shows the video for `earned` plátanos. grant(n) runs on the reward,
  // once per run; the promise settles when the video is gone.
  showRewarded(earned: number, grant: (n: number) => void): Promise<RewardedEnd> {
    const port = this.port;
    if (!port || !this.ready || !this.rewarded.begin(earned)) return Promise.resolve('failed');
    this.lastGrant = grant;
    return new Promise<RewardedEnd>((resolve) => {
      let showed = false;
      let paid = false;
      let done = false;
      const finish = (r: RewardedEnd): void => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        this.onRewardedEvent = null;
        this.rewarded.end();
        this.onRewardedChange();
        resolve(r);
        this.loadRewarded(); // the next one, for the next card
      };
      // A video that never comes up must not hold the game.
      const guard = setTimeout(() => {
        if (!showed) finish('failed');
      }, CONFIG.rewardShowGuardMs);
      this.onRewardedEvent = (e) => {
        if (e === 'showed') showed = true;
        else if (e === 'rewarded') {
          const n = this.rewarded.reward();
          if (n > 0) {
            paid = true;
            grant(n);
          }
        } else if (e === 'dismissed') finish(paid ? 'rewarded' : 'dismissed');
        else finish('failed');
      };
      port.showRewarded().catch(() => {
        if (!showed) finish('failed');
      });
    });
  }

  private loadRewarded(): void {
    const port = this.port;
    if (!port || !this.ready || !this.rewarded.wantsLoad(this.clock())) return;
    this.rewarded.loading();
    this.onRewardedChange();
    withTimeout(port.loadRewarded(this.npa), CONFIG.adsLoadTimeoutMs).then(
      () => {
        this.rewarded.loaded(this.clock());
        this.onRewardedChange();
      },
      () => {
        this.rewarded.loadFailed(); // offline or no fill: the next run start tries again
        this.onRewardedChange();
      },
    );
  }

  setBannerWanted(on: boolean): void {
    this.banner?.setWanted(on);
  }

  setAdFree(on: boolean): void {
    this.banner?.setAdFree(on);
  }

  // The game's mute, told to the SDK so a video respects it.
  setMuted(muted: boolean): void {
    if (this.ready) void this.port?.setMuted(muted).catch(() => {});
  }

  // The consent choices again (the EEA asks for a way back to them).
  showPrivacyOptions(): Promise<void> {
    if (!this.port || !this.privacyOptions) return Promise.resolve();
    return this.port.showPrivacyOptionsForm().catch(() => {});
  }
}
