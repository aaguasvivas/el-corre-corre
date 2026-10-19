// admobPort.ts: the AdsPort over @capacitor-community/admob (Google Mobile
// Ads SDK 13 and UMP 3 on iOS). Native only; main.ts never builds it on the
// web. The plugin presents its consent form, tracking prompt and videos
// from the scene's root view controller, which is Capacitor's own
// GameViewController (Main.storyboard), so they sit over the game.

import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import type { BundleAds } from './adIds';
import type { AdsPort, ConsentInfo } from './ads';

export function admobPort(ids: BundleAds): AdsPort {
  return {
    isIOS: Capacitor.getPlatform() === 'ios',
    requestConsentInfo: () => AdMob.requestConsentInfo() as Promise<ConsentInfo>,
    showConsentForm: () => AdMob.showConsentForm() as Promise<ConsentInfo>,
    showPrivacyOptionsForm: () => AdMob.showPrivacyOptionsForm(),
    trackingStatus: async () => (await AdMob.trackingAuthorizationStatus()).status,
    requestTracking: () => AdMob.requestTrackingAuthorization(),
    // DECISION: ads no stronger than PG. The game is a cartoon racer rated
    // for kids and families; a mature ad on its pause screen would be the
    // wrong neighbor.
    initialize: () => AdMob.initialize({ maxAdContentRating: MaxAdContentRating.ParentalGuidance }),
    setMuted: (muted) => AdMob.setApplicationMuted({ muted }),
    loadRewarded: async (npa) => {
      await AdMob.prepareRewardVideoAd({ adId: ids.rewardedUnitId, npa });
    },
    showRewarded: () => AdMob.showRewardVideoAd(),
    onRewarded: (cb) => {
      void AdMob.addListener(RewardAdPluginEvents.Showed, () => cb('showed'));
      void AdMob.addListener(RewardAdPluginEvents.Rewarded, () => cb('rewarded'));
      void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => cb('dismissed'));
      void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => cb('failedToShow'));
    },
    showBanner: (npa) =>
      AdMob.showBanner({
        adId: ids.bannerUnitId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0, // on the safe area's bottom edge; the page keeps its controls above it
        npa,
      }),
    hideBanner: () => AdMob.hideBanner(),
    resumeBanner: () => AdMob.resumeBanner(),
    removeBanner: () => AdMob.removeBanner(),
    onBanner: (cb) => {
      void AdMob.addListener(BannerAdPluginEvents.SizeChanged, (s) => cb({ kind: 'size', height: s.height }));
      void AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => cb({ kind: 'failed' }));
    },
  };
}
