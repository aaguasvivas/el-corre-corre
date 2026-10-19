// simAds.ts: a stand-in for the AdMob plugin and StoreKit, so the ads UI
// can be driven and photographed in a browser. Only a dev server or a probe
// build opened with ?ads=sim builds it (main.ts); the release bundle has no
// trace of it. The "banner" is a plain white box where the native one would
// sit (on the safe area's bottom edge, like the real one), and its size
// event is what the real plugin sends.
//
// window.__eccSim exposes the knobs (tools/shots.mjs, tools/screens-probe.mjs):
//   rewarded: 'reward' | 'dismiss' | 'fail'   what the next video does
//   rewardedLoad: 'ok' | 'fail' | 'hold'       what a video load does
//   banner: 'ok' | 'fail' | 'hold'            what a banner load does
//   buy: 'success' | 'cancel' | 'pending' | 'fail'
//   owned: boolean                            what StoreKit says is owned
//   price: string | null                      the localized price (null: no product)

import type { AdsPort, AttStatus, BannerEvent, ConsentInfo, RewardedEvent } from './ads';
import type { StorePort } from './purchases';

export interface SimControls {
  rewarded: 'reward' | 'dismiss' | 'fail';
  rewardedLoad: 'ok' | 'fail' | 'hold';
  banner: 'ok' | 'fail' | 'hold';
  buy: 'success' | 'cancel' | 'pending' | 'fail';
  owned: boolean;
  price: string | null;
  att: AttStatus;
  log: string[]; // every plugin call, in order
}

// Google's anchored adaptive banner on a phone in portrait: about 15% of
// the width, between 50 and 90 points.
function adaptiveHeight(w: number): number {
  return Math.max(50, Math.min(90, Math.round(w * 0.155)));
}

export function simPortsFromUrl(productId: string): { ads: AdsPort; store: StorePort; controls: SimControls } | null {
  if (!/[?&]ads=sim\b/.test(location.search)) return null;
  const c: SimControls = {
    rewarded: 'reward',
    rewardedLoad: 'ok',
    banner: 'ok',
    buy: 'success',
    owned: false,
    price: 'US$1.99',
    att: 'notDetermined',
    log: [],
  };
  (window as unknown as { __eccSim: SimControls }).__eccSim = c;
  const later = (ms: number, f: () => void): void => {
    setTimeout(f, ms);
  };
  let onRewarded: (e: RewardedEvent) => void = () => {};
  let onBanner: (e: BannerEvent) => void = () => {};
  let box: HTMLElement | null = null;
  const consent: ConsentInfo = { status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };

  const drawBanner = (): HTMLElement => {
    const w = Math.min(window.innerWidth, 500);
    const h = adaptiveHeight(w);
    const el = document.createElement('div');
    el.id = 'sim-banner';
    el.textContent = `Test Ad · ${w}×${h}`;
    el.style.cssText = `position:fixed;left:50%;transform:translateX(-50%);bottom:var(--sab,0px);width:${w}px;height:${h}px;z-index:100;display:flex;align-items:center;justify-content:center;background:#fff;color:#5f6368;border-top:1px solid #dadce0;font:600 13px system-ui,sans-serif;pointer-events:auto`;
    document.body.appendChild(el);
    return el;
  };
  const size = (): number => (box && box.style.display !== 'none' ? box.offsetHeight : 0);

  const ads: AdsPort = {
    isIOS: true,
    requestConsentInfo: async () => (c.log.push('requestConsentInfo'), consent),
    showConsentForm: async () => (c.log.push('showConsentForm'), consent),
    showPrivacyOptionsForm: async () => void c.log.push('showPrivacyOptionsForm'),
    trackingStatus: async () => c.att,
    requestTracking: async () => {
      c.log.push('requestTracking');
      c.att = 'authorized';
    },
    initialize: async () => void c.log.push('initialize'),
    setMuted: async (m) => void c.log.push(`setMuted ${m}`),
    loadRewarded: (npa) =>
      new Promise<void>((resolve, reject) => {
        c.log.push(`loadRewarded npa=${npa}`);
        if (c.rewardedLoad === 'hold') return;
        later(30, () => (c.rewardedLoad === 'ok' ? resolve() : reject(new Error('No fill'))));
      }),
    showRewarded: () =>
      new Promise((resolve, reject) => {
        c.log.push('showRewarded');
        if (c.rewarded === 'fail') {
          later(30, () => onRewarded('failedToShow'));
          reject(new Error('Reward Video is Not Ready Yet'));
          return;
        }
        later(40, () => onRewarded('showed'));
        if (c.rewarded === 'reward') {
          later(120, () => {
            onRewarded('rewarded');
            resolve({ type: 'coins', amount: 1 });
          });
        }
        later(200, () => onRewarded('dismissed'));
      }),
    onRewarded: (cb) => {
      onRewarded = cb;
    },
    showBanner: async () => {
      c.log.push('showBanner');
      box?.remove();
      box = null;
      if (c.banner === 'hold') return;
      later(60, () => {
        if (c.banner === 'fail') {
          onBanner({ kind: 'size', height: 0 });
          onBanner({ kind: 'failed' });
          return;
        }
        box = drawBanner();
        onBanner({ kind: 'size', height: size() });
      });
    },
    hideBanner: async () => {
      c.log.push('hideBanner');
      if (box) box.style.display = 'none';
      onBanner({ kind: 'size', height: 0 });
    },
    resumeBanner: async () => {
      c.log.push('resumeBanner');
      if (!box) throw new Error('AdMob: not find subView for resumeBanner');
      box.style.display = 'flex';
      onBanner({ kind: 'size', height: size() });
    },
    removeBanner: async () => {
      c.log.push('removeBanner');
      box?.remove();
      box = null;
    },
    onBanner: (cb) => {
      onBanner = cb;
    },
  };

  let onUpdate: (id: string, revoked: boolean) => void = () => {};
  const store: StorePort = {
    price: async () => {
      await new Promise((r) => setTimeout(r, 30));
      return c.price;
    },
    buy: async (id) => {
      c.log.push(`buy ${id}`);
      await new Promise((r) => setTimeout(r, 60));
      if (c.buy === 'cancel') throw new Error('User cancelled');
      if (c.buy === 'pending') {
        // Ask to Buy: approved a moment later, through the update listener
        setTimeout(() => {
          c.owned = true;
          onUpdate(id, false);
        }, 1500);
        throw new Error('Transaction pending');
      }
      if (c.buy === 'fail') throw new Error('The operation could not be completed');
      c.owned = true;
    },
    restore: async () => {
      c.log.push('restore');
      await new Promise((r) => setTimeout(r, 60));
    },
    owned: async () => (c.owned ? [productId] : []),
    onUpdate: (cb) => {
      onUpdate = cb;
    },
  };
  return { ads, store, controls: c };
}
