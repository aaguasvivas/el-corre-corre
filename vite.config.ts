import { defineConfig, type Plugin } from 'vitest/config';
import { bundleAdsFor } from './src/adIds';

// The ads ids a bundle carries, chosen by the Vite mode (see src/adIds.ts).
// `npm run build` (mode production) throws here while the release ids are
// missing or still Google's test ids, so the App Store bundle can never ship
// test ads or no ads at all. The ids also land in ads-ids.json next to the
// bundle: the Capacitor copy hook (tools/ios-ads-plist.mjs) writes its app id
// into Info.plist, and an Xcode archive refuses a test bundle.
function adsIds(): Plugin {
  let ads: ReturnType<typeof bundleAdsFor>;
  let mode = 'development';
  return {
    name: 'ecc-ads-ids',
    config(_cfg, env) {
      mode = env.mode;
      ads = bundleAdsFor(env.mode, env.command);
      return { define: { __ECC_ADS__: JSON.stringify(ads) } };
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'ads-ids.json',
        source: `${JSON.stringify({ mode, test: ads.test, appId: ads.appId }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  base: './', // Capacitor-ready: relative asset paths
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
  plugins: [adsIds()],
  // Only the game's own tests; audit harness copies under docs/ must never run.
  test: { include: ['src/**/*.test.ts'] },
});
