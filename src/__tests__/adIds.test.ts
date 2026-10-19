// The build guard: the App Store build (vite mode production) refuses
// missing ids and Google's test ids, every other mode gets the test ids,
// and build:adtest is marked so it can never pass for the store build.
import { describe, expect, it } from 'vitest';
import { RELEASE_ADS, TEST_ADS, bundleAdsFor, releaseIdProblems, type AdIds } from '../adIds';

const REAL: AdIds = {
  appId: 'ca-app-pub-1234567890123456~1234567890',
  bannerUnitId: 'ca-app-pub-1234567890123456/2345678901',
  rewardedUnitId: 'ca-app-pub-1234567890123456/3456789012',
};

describe('the release ids guard', () => {
  it('real-looking ids pass', () => {
    expect(releaseIdProblems(REAL)).toEqual([]);
  });

  it('empty ids fail, one line each', () => {
    const p = releaseIdProblems({ appId: '', bannerUnitId: ' ', rewardedUnitId: '' });
    expect(p).toEqual(['appId is empty', 'bannerUnitId is empty', 'rewardedUnitId is empty']);
  });

  it("Google's test ids fail", () => {
    const p = releaseIdProblems(TEST_ADS);
    expect(p).toHaveLength(3);
    for (const line of p) expect(line).toMatch(/Google's test id/);
  });

  it('a unit id pasted as the app id, or a malformed one, fails', () => {
    expect(releaseIdProblems({ ...REAL, appId: REAL.bannerUnitId })[0]).toMatch(/not shaped like/);
    expect(releaseIdProblems({ ...REAL, rewardedUnitId: 'ca-app-pub-123/456' })[0]).toMatch(/not shaped like/);
  });

  it('ids from two AdMob accounts fail', () => {
    expect(releaseIdProblems({ ...REAL, bannerUnitId: 'ca-app-pub-9999999999999999/2345678901' })).toEqual([
      'the app id and the unit ids belong to different AdMob accounts',
    ]);
  });
});

describe('which ids a bundle carries', () => {
  it('npm run build (production) throws while the release ids are not ready, naming the owner step', () => {
    expect(() => bundleAdsFor('production', 'build', { appId: '', bannerUnitId: '', rewardedUnitId: '' })).toThrow(
      /docs\/audit\/ADS-PLAN\.md, owner step 1[\s\S]*npm run build:adtest/,
    );
    expect(() => bundleAdsFor('production', 'build', TEST_ADS)).toThrow(/Google's test id/);
  });

  it('npm run build with real ids carries them and nothing else', () => {
    const b = bundleAdsFor('production', 'build', REAL);
    expect(b).toMatchObject({ ...REAL, test: false, tag: false });
    expect(b.productId).toBe('elcorrecorre.remove_ads');
  });

  it('dev, probe and adtest carry the test ids; only adtest wears the tag', () => {
    expect(bundleAdsFor('development', 'serve')).toMatchObject({ ...TEST_ADS, test: true, tag: false });
    expect(bundleAdsFor('probe', 'build')).toMatchObject({ ...TEST_ADS, test: true, tag: false });
    expect(bundleAdsFor('adtest', 'build')).toMatchObject({ ...TEST_ADS, test: true, tag: true });
    // vitest serves the config too: it must never need the release ids
    expect(bundleAdsFor('test', 'serve').test).toBe(true);
  });

  it('the checked-in release ids are what the guard judges', () => {
    // Until owner step 1 fills them, the App Store build must fail.
    const ready = releaseIdProblems(RELEASE_ADS).length === 0;
    if (ready) expect(() => bundleAdsFor('production', 'build')).not.toThrow();
    else expect(() => bundleAdsFor('production', 'build')).toThrow();
  });
});
