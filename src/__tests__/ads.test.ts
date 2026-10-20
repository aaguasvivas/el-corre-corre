// ads.ts against a fake AdMob plugin: every branch of the consent and
// tracking flow (timeouts and an explicit "no" included), the rewarded
// video's once-per-run rule, and the banner slot's show, hide, retry and
// give-up rules. Timers are faked, so the deadlines run in no time.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ads, BannerSlot, RewardedOffer, runConsentFlow, type AdsPort, type AttStatus, type BannerEvent, type ConsentInfo, type FlowEnv, type RewardedEvent } from '../ads';
import { CONFIG } from '../config';

const NOT_REQUIRED: ConsentInfo = { status: 'NOT_REQUIRED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };
const REQUIRED: ConsentInfo = { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' };
const OBTAINED: ConsentInfo = { status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' };
const DECLINED: ConsentInfo = { status: 'OBTAINED', canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' };

const never = <T>(): Promise<T> => new Promise<T>(() => {});

type Step<T> = T | 'reject' | 'hang';
function step<T>(s: Step<T>): Promise<T> {
  if (s === 'reject') return Promise.reject(new Error('nope'));
  if (s === 'hang') return never<T>();
  return Promise.resolve(s);
}

class FakePort implements AdsPort {
  isIOS = true;
  calls: string[] = [];
  consent: Step<ConsentInfo> = NOT_REQUIRED;
  form: Step<ConsentInfo> = OBTAINED;
  att: AttStatus = 'notDetermined';
  attAnswer: AttStatus = 'authorized';
  attRead: 'ok' | 'hang' = 'ok';
  init: Step<void> = undefined;
  load: Step<void> = undefined;
  show: 'ok' | 'reject' = 'ok';
  banner: 'ok' | 'reject' = 'ok';
  resume: 'ok' | 'reject' = 'ok';
  rewardedCb: (e: RewardedEvent) => void = () => {};
  bannerCb: (e: BannerEvent) => void = () => {};

  requestConsentInfo = (): Promise<ConsentInfo> => (this.calls.push('requestConsentInfo'), step(this.consent));
  showConsentForm = (): Promise<ConsentInfo> => (this.calls.push('showConsentForm'), step(this.form));
  showPrivacyOptionsForm = async (): Promise<void> => void this.calls.push('privacyOptions');
  trackingStatus = (): Promise<AttStatus> => (this.calls.push('trackingStatus'), this.attRead === 'hang' ? never() : Promise.resolve(this.att));
  requestTracking = async (): Promise<void> => {
    this.calls.push('requestTracking');
    this.att = this.attAnswer;
  };
  initialize = (): Promise<void> => (this.calls.push('initialize'), step(this.init));
  setMuted = async (m: boolean): Promise<void> => void this.calls.push(`setMuted ${m}`);
  loadRewarded = (npa: boolean): Promise<void> => (this.calls.push(`loadRewarded ${npa}`), step(this.load));
  showRewarded = (): Promise<unknown> => (this.calls.push('showRewarded'), this.show === 'reject' ? Promise.reject(new Error('not ready')) : never());
  onRewarded = (cb: (e: RewardedEvent) => void): void => {
    this.rewardedCb = cb;
  };
  showBanner = (npa: boolean): Promise<void> => (this.calls.push(`showBanner ${npa}`), this.banner === 'ok' ? Promise.resolve() : Promise.reject(new Error('x')));
  hideBanner = async (): Promise<void> => void this.calls.push('hideBanner');
  resumeBanner = (): Promise<void> => (this.calls.push('resumeBanner'), this.resume === 'ok' ? Promise.resolve() : Promise.reject(new Error('no view')));
  removeBanner = async (): Promise<void> => void this.calls.push('removeBanner');
  onBanner = (cb: (e: BannerEvent) => void): void => {
    this.bannerCb = cb;
  };
  count(name: string): number {
    return this.calls.filter((c) => c.startsWith(name)).length;
  }
}

// The game around the flow: in front or not, on the title or in a run.
class FakeEnv implements FlowEnv {
  fg = true;
  calm = true;
  private fgCbs: Array<() => void> = [];
  private calmCbs: Array<() => void> = [];
  isForeground = (): boolean => this.fg;
  onForeground = (cb: () => void): (() => void) => {
    this.fgCbs.push(cb);
    return () => {
      this.fgCbs = this.fgCbs.filter((c) => c !== cb);
    };
  };
  whenCalm = (): Promise<void> => (this.calm ? Promise.resolve() : new Promise<void>((r) => this.calmCbs.push(r)));
  foreground(): void {
    this.fg = true;
    for (const cb of [...this.fgCbs]) cb();
  }
  becomeCalm(): void {
    this.calm = true;
    for (const cb of this.calmCbs.splice(0)) cb();
  }
}

// Runs the flow with fake timers until it settles (or `ms` passes).
async function settle<T>(p: Promise<T>, ms = 0): Promise<T> {
  let done = false;
  let value: T;
  void p.then((v) => {
    done = true;
    value = v;
  });
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 50 && !done; i++) await vi.advanceTimersByTimeAsync(0);
  if (!done) throw new Error('did not settle');
  return value!;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the consent and tracking flow', () => {
  it('US launch: no consent form, the tracking prompt asked explicitly, then personalized ads', async () => {
    const port = new FakePort();
    const r = await settle(runConsentFlow(port, new FakeEnv()));
    expect(r).toEqual({ outcome: 'ok', ads: true, npa: false, privacyOptions: false });
    expect(port.calls).toEqual(['requestConsentInfo', 'trackingStatus', 'requestTracking', 'trackingStatus', 'initialize']);
  });

  it('a "no" to tracking still starts ads, never personalized', async () => {
    const port = new FakePort();
    port.attAnswer = 'denied';
    const r = await settle(runConsentFlow(port, new FakeEnv()));
    expect(r.outcome).toBe('ok');
    expect(r.ads).toBe(true);
    expect(r.npa).toBe(true);
  });

  it('a tracking answer from an earlier launch is not asked again', async () => {
    const port = new FakePort();
    port.att = 'authorized';
    await settle(runConsentFlow(port, new FakeEnv()));
    expect(port.count('requestTracking')).toBe(0);
    expect(port.count('initialize')).toBe(1);
  });

  it('EEA: the consent form, then the tracking prompt, then ads; the choices link is required', async () => {
    const port = new FakePort();
    port.consent = REQUIRED;
    const r = await settle(runConsentFlow(port, new FakeEnv()));
    expect(port.calls.slice(0, 3)).toEqual(['requestConsentInfo', 'showConsentForm', 'trackingStatus']);
    expect(r).toEqual({ outcome: 'ok', ads: true, npa: false, privacyOptions: true });
  });

  it('an explicit "no" in the consent form stays dark: no tracking prompt, no SDK start', async () => {
    const port = new FakePort();
    port.consent = REQUIRED;
    port.form = DECLINED;
    const r = await settle(runConsentFlow(port, new FakeEnv()));
    expect(r.outcome).toBe('declined');
    expect(r.ads).toBe(false);
    expect(port.count('requestTracking')).toBe(0);
    expect(port.count('initialize')).toBe(0);
  });

  it('a consent check that fails (offline) fails open: tracking still asked, ads non-personalized', async () => {
    const port = new FakePort();
    port.consent = 'reject';
    const r = await settle(runConsentFlow(port, new FakeEnv()));
    expect(r).toEqual({ outcome: 'failedOpen', ads: true, npa: true, privacyOptions: false });
    expect(port.count('requestTracking')).toBe(1);
    expect(port.count('initialize')).toBe(1);
  });

  it('a consent check that hangs times out at adsConsentTimeoutMs and fails open', async () => {
    const port = new FakePort();
    port.consent = 'hang';
    const flow = runConsentFlow(port, new FakeEnv());
    await vi.advanceTimersByTimeAsync(CONFIG.adsConsentTimeoutMs - 10);
    expect(port.count('trackingStatus')).toBe(0); // still waiting on the check
    const r = await settle(flow, 20);
    expect(r.outcome).toBe('failedOpen');
    expect(port.count('requestTracking')).toBe(1); // the hang did not cost the tracking prompt
  });

  it('a consent form that cannot show fails open', async () => {
    const port = new FakePort();
    port.consent = REQUIRED;
    port.form = 'reject';
    const r = await settle(runConsentFlow(port, new FakeEnv()));
    expect(r.outcome).toBe('failedOpen');
    expect(r.npa).toBe(true);
  });

  it('a consent form that never loads is cut off at adsConsentFormMaxMs', async () => {
    const port = new FakePort();
    port.consent = REQUIRED;
    port.form = 'hang';
    const r = await settle(runConsentFlow(port, new FakeEnv()), CONFIG.adsConsentFormMaxMs + 10);
    expect(r.outcome).toBe('failedOpen');
  });

  it('an SDK start that fails or hangs leaves ads dark for now', async () => {
    const port = new FakePort();
    port.init = 'reject';
    expect((await settle(runConsentFlow(port, new FakeEnv()))).outcome).toBe('initFailed');
    const port2 = new FakePort();
    port2.init = 'hang';
    const r = await settle(runConsentFlow(port2, new FakeEnv()), CONFIG.adsInitTimeoutMs + 10);
    expect(r).toMatchObject({ outcome: 'initFailed', ads: false });
  });

  it('a tracking status that never answers counts as no tracking after adsStepTimeoutMs', async () => {
    const port = new FakePort();
    port.attRead = 'hang';
    const r = await settle(runConsentFlow(port, new FakeEnv()), CONFIG.adsStepTimeoutMs + 10);
    expect(r).toMatchObject({ outcome: 'ok', ads: true, npa: true });
  });

  it('waits for the app to come to the front, but no longer than adsForegroundWaitMs', async () => {
    const port = new FakePort();
    const env = new FakeEnv();
    env.fg = false;
    const flow = runConsentFlow(port, env);
    await vi.advanceTimersByTimeAsync(1000);
    expect(port.calls).toEqual([]);
    env.foreground();
    await settle(flow);
    expect(port.count('requestConsentInfo')).toBe(1);

    const port2 = new FakePort();
    const env2 = new FakeEnv();
    env2.fg = false; // the signal never comes
    const r = await settle(runConsentFlow(port2, env2), 2 * CONFIG.adsForegroundWaitMs + 10);
    expect(r.outcome).toBe('ok');
  });

  it('no prompt opens until the game is calm (the title, not a run)', async () => {
    const port = new FakePort();
    port.consent = REQUIRED;
    const env = new FakeEnv();
    env.calm = false;
    const flow = runConsentFlow(port, env);
    await vi.advanceTimersByTimeAsync(60000);
    expect(port.calls).toEqual(['requestConsentInfo']); // the form waits
    env.becomeCalm();
    const r = await settle(flow);
    expect(port.count('showConsentForm')).toBe(1);
    expect(r.outcome).toBe('ok');
  });

  it('off iOS there is no tracking prompt', async () => {
    const port = new FakePort();
    port.isIOS = false;
    const r = await settle(runConsentFlow(port, new FakeEnv()));
    expect(port.count('trackingStatus')).toBe(0);
    expect(r.npa).toBe(false);
  });
});

describe('Ads: the flow runs once', () => {
  it('start() is idempotent, and an answered flow is never owed again', async () => {
    const port = new FakePort();
    const ads = new Ads(port, new FakeEnv(), () => {});
    expect(ads.pending).toBe(true);
    const a = ads.start();
    const b = ads.start();
    expect(a).toBe(b);
    await settle(a);
    expect(port.count('requestConsentInfo')).toBe(1);
    expect(ads.ready).toBe(true);
    expect(ads.pending).toBe(false);
  });

  it('an SDK start that failed is owed again (the next title visit); a "no" is not', async () => {
    const port = new FakePort();
    port.init = 'reject';
    const ads = new Ads(port, new FakeEnv(), () => {});
    await settle(ads.start());
    expect(ads.ready).toBe(false);
    expect(ads.pending).toBe(true);
    port.init = undefined;
    await settle(ads.start());
    expect(ads.ready).toBe(true);

    const p2 = new FakePort();
    p2.consent = REQUIRED;
    p2.form = DECLINED;
    const dark = new Ads(p2, new FakeEnv(), () => {});
    await settle(dark.start());
    expect(dark.ready).toBe(false);
    expect(dark.pending).toBe(false);
  });

  it('no port (the web build): everything is a no-op', async () => {
    const ads = new Ads(null, new FakeEnv(), () => {});
    expect(ads.enabled).toBe(false);
    expect(ads.pending).toBe(false);
    expect(await ads.start()).toBeNull();
    ads.runStarted();
    expect(ads.canOffer(50)).toBe(false);
    expect(await ads.showRewarded(50, () => {})).toBe('failed');
  });
});

describe('RewardedOffer: Duplica tus plátanos, once per run', () => {
  it('offers only a loaded video, for a run that earned at least one plátano', () => {
    const o = new RewardedOffer();
    o.runStarted();
    expect(o.canOffer(10)).toBe(false); // nothing loaded
    o.loading();
    o.loaded(0);
    expect(o.canOffer(0)).toBe(false);
    expect(o.canOffer(0.6)).toBe(false);
    expect(o.canOffer(1)).toBe(true);
  });

  it('pays once per run, whatever the SDK repeats, and offers again on the next run', () => {
    const o = new RewardedOffer();
    o.runStarted();
    o.loading();
    o.loaded(0);
    expect(o.begin(42)).toBe(true);
    expect(o.reward()).toBe(42);
    expect(o.reward()).toBe(0); // a duplicate grant event
    o.end();
    o.loading();
    o.loaded(1);
    expect(o.canOffer(42)).toBe(false); // same run, already paid
    expect(o.begin(42)).toBe(false);
    o.runStarted();
    expect(o.canOffer(30)).toBe(true);
  });

  it('a video closed early pays nothing and leaves the run payable', () => {
    const o = new RewardedOffer();
    o.runStarted();
    o.loading();
    o.loaded(0);
    o.begin(10);
    o.end();
    expect(o.paidThisRun).toBe(false);
    expect(o.wantsLoad(0)).toBe(true);
    o.loading();
    o.loaded(0);
    expect(o.canOffer(10)).toBe(true);
  });

  it('a failed load goes back to idle; a video held past rewardedMaxAgeSec is replaced', () => {
    const o = new RewardedOffer();
    o.loading();
    expect(o.wantsLoad(0)).toBe(false);
    o.loadFailed();
    expect(o.wantsLoad(0)).toBe(true);
    o.loading();
    o.loaded(100);
    expect(o.wantsLoad(100 + CONFIG.rewardedMaxAgeSec - 1)).toBe(false);
    expect(o.wantsLoad(100 + CONFIG.rewardedMaxAgeSec + 1)).toBe(true);
  });
});

describe('Ads: the rewarded video end to end', () => {
  async function readyAds(): Promise<{ ads: Ads; port: FakePort }> {
    const port = new FakePort();
    port.att = 'authorized';
    const ads = new Ads(port, new FakeEnv(), () => {});
    await settle(ads.start());
    ads.runStarted();
    await settle(Promise.resolve());
    return { ads, port };
  }

  it('preloads at the run start; the reward is granted once and the next video loads', async () => {
    const { ads, port } = await readyAds();
    expect(port.count('loadRewarded')).toBe(1);
    expect(ads.canOffer(25)).toBe(true);
    const grants: number[] = [];
    const end = ads.showRewarded(25, (n) => grants.push(n));
    port.rewardedCb('showed');
    port.rewardedCb('rewarded');
    port.rewardedCb('rewarded');
    port.rewardedCb('dismissed');
    expect(await settle(end)).toBe('rewarded');
    expect(grants).toEqual([25]);
    expect(port.count('loadRewarded')).toBe(2); // the next card's video
    await settle(Promise.resolve());
    expect(ads.canOffer(25)).toBe(false); // this run is paid
  });

  it('closed before the reward: nothing granted, the offer may come back', async () => {
    const { ads, port } = await readyAds();
    const grants: number[] = [];
    const end = ads.showRewarded(25, (n) => grants.push(n));
    port.rewardedCb('showed');
    port.rewardedCb('dismissed');
    expect(await settle(end)).toBe('dismissed');
    expect(grants).toEqual([]);
    await settle(Promise.resolve());
    expect(ads.canOffer(25)).toBe(true);
  });

  it('a video that fails to show, is refused, or never comes up ends quietly', async () => {
    const a = await readyAds();
    const e1 = a.ads.showRewarded(5, () => {});
    a.port.rewardedCb('failedToShow');
    expect(await settle(e1)).toBe('failed');

    const b = await readyAds();
    b.port.show = 'reject';
    expect(await settle(b.ads.showRewarded(5, () => {}))).toBe('failed');

    const c = await readyAds();
    const e3 = c.ads.showRewarded(5, () => {});
    expect(await settle(e3, CONFIG.rewardShowGuardMs + 10)).toBe('failed');
  });

  it('a reward that lands after its video closed still pays, once', async () => {
    const { ads, port } = await readyAds();
    const grants: number[] = [];
    const end = ads.showRewarded(7, (n) => grants.push(n));
    port.rewardedCb('showed');
    port.rewardedCb('dismissed');
    await settle(end);
    port.rewardedCb('rewarded');
    port.rewardedCb('rewarded');
    expect(grants).toEqual([7]);
  });

  it('an offline load fails silently and the next run start tries again', async () => {
    const port = new FakePort();
    port.att = 'authorized';
    port.load = 'reject';
    const ads = new Ads(port, new FakeEnv(), () => {});
    await settle(ads.start());
    await settle(Promise.resolve());
    expect(ads.rewarded.phase).toBe('idle');
    ads.runStarted();
    expect(port.count('loadRewarded')).toBe(2);
  });
});

describe('BannerSlot', () => {
  function slot(retry = [30, 90, 240]): { s: BannerSlot; port: FakePort; heights: number[] } {
    const port = new FakePort();
    const heights: number[] = [];
    const s = new BannerSlot(port, (h) => heights.push(h), retry);
    return { s, port, heights };
  }

  it('loads only on a calm screen once ads are ready, and reserves space only when it is on screen', async () => {
    const { s, port, heights } = slot();
    s.setWanted(true);
    expect(port.count('showBanner')).toBe(0); // the SDK has not started
    s.setReady(true, true);
    expect(port.calls).toEqual(['showBanner true']);
    expect(heights).toEqual([]); // nothing reserved while it loads
    s.onSize(58);
    expect(heights).toEqual([58]);
    s.setWanted(false);
    expect(heights).toEqual([58, 0]); // the space comes back at once
    expect(port.count('hideBanner')).toBe(1);
    s.setWanted(true);
    expect(port.count('resumeBanner')).toBe(1);
    expect(port.count('showBanner')).toBe(1); // the loaded banner is reused
    s.onSize(58);
    expect(heights).toEqual([58, 0, 58]);
  });

  it('a banner that arrives after its screen closed is tucked away at once', () => {
    const { s, port, heights } = slot();
    s.setReady(true, false);
    s.setWanted(true);
    s.setWanted(false); // SEGUIR before the load finished
    s.onSize(58);
    expect(port.count('hideBanner')).toBe(1);
    expect(heights).toEqual([]);
    expect(s.view.state).toBe('hidden');
  });

  it('retries a failed load with backoff, only while wanted, then stays quiet', async () => {
    const { s, port } = slot([30, 90]);
    s.setReady(true, false);
    s.setWanted(true);
    s.onFailed();
    expect(port.count('showBanner')).toBe(1);
    s.setWanted(false);
    s.setWanted(true); // reopening the pause does not skip the wait
    expect(port.count('showBanner')).toBe(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(port.count('showBanner')).toBe(2);
    s.onFailed();
    s.setWanted(false);
    await vi.advanceTimersByTimeAsync(90000);
    expect(port.count('showBanner')).toBe(2); // not wanted when the wait ended
    s.setWanted(true);
    expect(port.count('showBanner')).toBe(3);
    s.onFailed(); // the third failure with two retries: give up
    await vi.advanceTimersByTimeAsync(600000);
    s.setWanted(false);
    s.setWanted(true);
    expect(port.count('showBanner')).toBe(3);
    expect(s.gaveUp).toBe(true);
  });

  it('a success resets the failure count', async () => {
    const { s, port } = slot([30]);
    s.setReady(true, false);
    s.setWanted(true);
    s.onFailed();
    await vi.advanceTimersByTimeAsync(30000);
    s.onSize(50);
    expect(s.view.failures).toBe(0);
    s.onFailed(); // a later refresh fails: one more retry is still allowed
    await vi.advanceTimersByTimeAsync(30000);
    expect(port.count('showBanner')).toBe(3);
  });

  it('Remove Ads takes the banner down at once and for good', () => {
    const { s, port, heights } = slot();
    s.setReady(true, false);
    s.setWanted(true);
    s.onSize(58);
    s.setAdFree(true);
    expect(port.count('removeBanner')).toBe(1);
    expect(heights.at(-1)).toBe(0);
    s.setWanted(false);
    s.setWanted(true);
    expect(port.count('showBanner')).toBe(1);
    s.onSize(58); // a stale event from the removed banner
    expect(heights.at(-1)).toBe(0);
  });

  it('a banner the SDK dropped cannot resume: a fresh load replaces it', async () => {
    const { s, port } = slot();
    s.setReady(true, false);
    s.setWanted(true);
    s.onSize(58);
    s.setWanted(false);
    port.resume = 'reject';
    s.setWanted(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(port.count('showBanner')).toBe(2);
  });
});
