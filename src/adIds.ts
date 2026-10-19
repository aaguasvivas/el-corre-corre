// adIds.ts: every ads and store identifier the game uses, in one place, and
// the guard that keeps Google's test ids out of the App Store build.
//
// Which set a bundle carries is decided at build time (vite.config.ts injects
// it as __ECC_ADS__), so a bundle only ever holds one set:
//   npm run dev, npm run build:probe   Google's public test ids
//   npm run build:adtest               Google's public test ids, plus an
//                                      on-screen AD TEST tag; an Xcode
//                                      archive refuses it (RELEASE.md)
//   npm run build                      RELEASE_ADS below; the build fails
//                                      while they are empty or test ids
//
// Pure data and functions: vite.config.ts, the sync hook and the tests all
// read it.

export interface AdIds {
  appId: string; // ca-app-pub-<16 digits>~<10 digits>, from AdMob > Apps
  bannerUnitId: string; // ca-app-pub-<16 digits>/<10 digits>
  rewardedUnitId: string; // ca-app-pub-<16 digits>/<10 digits>
}

// The App Store build's AdMob ids. They stay empty until Adelson creates the
// app and its two units in AdMob: docs/audit/ADS-PLAN.md, owner step 1
// (one anchored adaptive banner unit, one rewarded unit). Paste the three
// ids here; `npm run build` refuses to run without them.
export const RELEASE_ADS: AdIds = {
  appId: '',
  bannerUnitId: '',
  rewardedUnitId: '',
};

// The Remove Ads non-consumable ($1.99). Candidate id from this project;
// Adelson confirms or changes it when he creates the product in App Store
// Connect (docs/audit/ADS-PLAN.md, owner step 4). ios/App/App/Products.storekit
// must use the same id for simulator purchases.
export const REMOVE_ADS_PRODUCT_ID = 'elcorrecorre.remove_ads';

// Google's public demo ids for iOS (developers.google.com/admob/ios/test-ads
// and the quick start's sample app id). They always serve test creatives and
// never pay.
export const GOOGLE_TEST_PUBLISHER = 'ca-app-pub-3940256099942544';
export const TEST_ADS: AdIds = {
  appId: `${GOOGLE_TEST_PUBLISHER}~1458002511`,
  bannerUnitId: `${GOOGLE_TEST_PUBLISHER}/2435281174`, // anchored adaptive banner
  rewardedUnitId: `${GOOGLE_TEST_PUBLISHER}/1712485313`,
};

// What the bundle is told at build time (see vite.config.ts).
export interface BundleAds extends AdIds {
  test: boolean; // Google's test ids (dev, probe, adtest)
  tag: boolean; // show the AD TEST tag (adtest only)
  productId: string;
}

export const OWNER_STEP = 'docs/audit/ADS-PLAN.md, owner step 1';

const APP_ID_RE = /^ca-app-pub-\d{16}~\d{10}$/;
const UNIT_ID_RE = /^ca-app-pub-\d{16}\/\d{10}$/;

// Why these ids cannot ship, one line each; empty when they can.
export function releaseIdProblems(ids: AdIds): string[] {
  const out: string[] = [];
  const check = (name: keyof AdIds, re: RegExp, shape: string): void => {
    const v = ids[name].trim();
    if (!v) out.push(`${name} is empty`);
    else if (v.startsWith(GOOGLE_TEST_PUBLISHER)) out.push(`${name} is Google's test id (${v})`);
    else if (!re.test(v)) out.push(`${name} "${v}" is not shaped like ${shape}`);
  };
  check('appId', APP_ID_RE, 'ca-app-pub-0000000000000000~0000000000');
  check('bannerUnitId', UNIT_ID_RE, 'ca-app-pub-0000000000000000/0000000000');
  check('rewardedUnitId', UNIT_ID_RE, 'ca-app-pub-0000000000000000/0000000000');
  const pubs = new Set([ids.appId, ids.bannerUnitId, ids.rewardedUnitId].map((v) => v.trim().slice(0, 27)));
  if (out.length === 0 && pubs.size !== 1) out.push('the app id and the unit ids belong to different AdMob accounts');
  if (!REMOVE_ADS_PRODUCT_ID.trim()) out.push('REMOVE_ADS_PRODUCT_ID is empty');
  return out;
}

// The ids for a Vite mode. Only 'production' (npm run build) ships, so only
// it reads RELEASE_ADS, and it throws when they are not ready. `release` is
// a parameter so the tests can hand in their own set.
export function bundleAdsFor(mode: string, command: 'build' | 'serve', release: AdIds = RELEASE_ADS): BundleAds {
  if (command === 'build' && mode === 'production') {
    const problems = releaseIdProblems(release);
    if (problems.length > 0) {
      throw new Error(
        [
          'The App Store build needs the real AdMob ids:',
          ...problems.map((p) => `  - ${p}`),
          `Fill RELEASE_ADS in src/adIds.ts (${OWNER_STEP}).`,
          'For a device test build with Google’s test ads, run npm run build:adtest (never for the App Store).',
        ].join('\n'),
      );
    }
    return { ...release, test: false, tag: false, productId: REMOVE_ADS_PRODUCT_ID };
  }
  return { ...TEST_ADS, test: true, tag: mode === 'adtest', productId: REMOVE_ADS_PRODUCT_ID };
}
