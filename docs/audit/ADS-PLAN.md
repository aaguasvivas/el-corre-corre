# Ads, Remove Ads and release 1.0 (2026-10-17)

Owner decisions (Adelson, 2026-10-17), added to docs/audit/PLAN.md:

1. **Ads ship in the first App Store release (1.0).** Build 10 (no ads) is
   superseded and is never submitted. 1.0 ships as build 11 or later.
2. **Formats: rewarded plus a small banner.**
   - Rewarded video, opt-in only: "Dobla tus plátanos" / "Double your
     plantains" on the game-over card doubles the plátanos earned in that
     run. It never blocks OTRA VEZ, never plays unless tapped, and never
     touches points, distance or records.
   - One anchored adaptive banner on calm screens only: the pause screen and
     the Los Mandaos sheet. Never on the title, never during play, the
     countdown, the crash or the game-over card. Those screens are
     tap-anywhere, and AdMob flags banners next to game controls.
   - No interstitials, no app-open ads.
3. **Remove Ads, $1.99, non-consumable.** Candidate product id from this
   project: `elcorrecorre.remove_ads` (Adelson confirms it when creating the
   product in App Store Connect; it is a durable identifier). Owning it
   removes the banners. The rewarded button stays available because it only
   plays when the player taps it; the purchase sheet says so in ES and EN.
   Restore Purchases is required and lives in the same sheet.

## Engineering decisions

- **Capacitor 6 to 8.** The AdMob plugin line for Capacitor 6
  (@capacitor-community/admob 6.2.0) pins Google-Mobile-Ads-SDK 11.3.0; the
  current line (8.x) pins SDK 13.x plus UserMessagingPlatform 3.x and needs
  Capacitor 8 (Node 22, installed through nvm). All Capacitor plugins move to
  their v8 releases. iOS deployment target stays 15.0. CocoaPods stays.
- **Purchases:** a Capacitor 8 StoreKit 2 plugin with no backend (candidate
  @capgo/native-purchases 8.x; compare with cordova-plugin-purchase 13.x
  before choosing). No RevenueCat account.
- **Consent and ATT** follow Anota's two App Review lessons
  (anota/src/ads/ads.ts): a bounded wait for the foreground, UMP consent with
  a 15 s timeout, then an explicit ATT request whenever the status is still
  not determined (UMP alone shows nothing on US devices), then initialize. An
  explicit "no" stays dark; a broken consent flow fails open to
  non-personalized ads. Every step is bounded; ads can fail forever and the
  game stays fully playable offline.
- **When the prompts appear:** once, on the title screen shortly after the
  first launch, never during a run. Ad-free buyers skip nothing they need:
  the rewarded path still needs the SDK, so consent runs for everyone.
- **Ids:** Google's public test ids in dev and on simulators. Release builds
  read the real AdMob app id and unit ids from one config file, and the
  production build fails if those ids are still the test ids or empty.
- **The brief's offline rule** ("zero runtime network fetches") now has one
  exception: the ad SDK. Nothing else fetches, and the game never waits on it.

## Built on branch ads-1.0 (2026-10-18)

- **Where the ids live:** `src/adIds.ts`, the one place. `RELEASE_ADS` (the
  AdMob app id and the two unit ids) is empty until owner step 1;
  `REMOVE_ADS_PRODUCT_ID` holds the candidate `elcorrecorre.remove_ads`.
  `vite.config.ts` gives each bundle one id set: dev, `npm run build:probe`
  and `npm run build:adtest` get Google's public test ids; `npm run build`
  gets `RELEASE_ADS` and fails, naming this file's owner step 1, while they
  are empty, malformed or Google's test ids.
- **Native app id:** `tools/ios-ads-plist.mjs` runs after every
  `npx cap copy` or `npx cap sync` (the `capacitor:copy:after` hook) and
  writes the bundle's app id into `GADApplicationIdentifier`. An Xcode
  archive whose bundle or Info.plist carries Google's test ids fails in the
  "[ECC] No test ads in an archive" build phase, so a `build:adtest`
  bundle can never become the App Store build.
- **Plugins:** `@capacitor-community/admob` 8.2.1 (Google Mobile Ads SDK
  13.11.0, UMP 3.1.0) and `@capgo/native-purchases` 8.9.6 (StoreKit 2; the
  comparison with cordova-plugin-purchase is the DECISION in
  `src/storePort.ts`).
- **Consent and tracking (`src/ads.ts`):** starts on the title 1 s after it
  comes up, on every launch, never during a run, the countdown or a crash
  (a prompt that is due waits for the title). Bounded foreground wait (8 s),
  UMP consent check (15 s), the consent form when required, then the ATT
  prompt whenever still undetermined, then the SDK start (15 s). An explicit
  "no" keeps ads dark; a consent step that breaks fails open. Ads are
  non-personalized unless the player allowed tracking and the consent step
  answered (DECISION). Ad content is capped at PG (DECISION).
- **Dobla tus plátanos:** a video preloads at SDK start and at every run
  start (and after each video). The card offers it only with a video loaded
  and at least 1 plátano earned; it arms 0.9 s after the card lands (a tap
  there before that is OTRA VEZ). The reward is the run's whole plátano take
  again (picked up plus mandao rewards, the "+N plátanos" on the card),
  banked at once, once per run (DECISION). Audio and the game hold while
  the video is up.
- **Banner:** one anchored adaptive banner, wanted only on PAUSA and the
  Los Mandaos sheet. The page reserves its height plus 24 pt only while it
  is on screen; failed loads retry after 30, 90 and 240 s, then stop.
- **Remove Ads:** an AD chip under the mute chip on the title and a
  "Quitar anuncios" / "Remove ads" link on PAUSA open a sheet with the
  StoreKit price, buy, restore and the privacy link. Owned is cached as
  `ecc.v1.adFree` (backed up by the Preferences mirror) and re-read from
  StoreKit at launch and on every transaction update. When Google's consent
  rules require it, PAUSA shows "Privacidad de anuncios" / "Ad privacy"
  right after "Privacidad"; it opens Google's privacy options form.
- **Simulator purchases:** `ios/App/App/Products.storekit` (the product at
  1.99 USD) is set on the Run action of the shared App scheme. It only works
  when the app is run from Xcode.

## Compliance (2026-10-19)

App Privacy answers from the built app's privacy manifests, the in-app
purchase setup, the age rating, the review note and the console-ordered
owner steps (with the agreements, the privacy page push and app-ads.txt
added) are in RELEASE.md. The privacy page for 1.0 is `site/privacy.html`,
not pushed.

## Owner steps (only Adelson)

1. AdMob: add the iOS app "El Corre Corre" (it can be linked to the store
   listing after release), create one banner unit (anchored adaptive) and
   one rewarded unit, and paste the app id (`ca-app-pub-...~...`) and both
   unit ids into `RELEASE_ADS` in `src/adIds.ts`. Until then
   `npm run build` stops with a message that points here.
2. AdMob > Privacy & messaging: publish a GDPR message and an IDFA explainer
   message for this app.
3. app-ads.txt: AdMob checks `https://<developer website domain>/app-ads.txt`
   with the line for pub-4879291425090726. The store listing's marketing URL
   decides the domain (choose where to host it).
4. App Store Connect: create the non-consumable `elcorrecorre.remove_ads`
   (or the id you prefer; then change `REMOVE_ADS_PRODUCT_ID` in
   `src/adIds.ts` and the `productID` in `ios/App/App/Products.storekit`)
   at $1.99 with ES ("Quitar anuncios") and EN ("Remove Ads") names and a
   review screenshot of the sheet, then answer App Privacy for the ad SDK's
   data (Google's iOS data disclosure guide lists it: device id and
   advertising data used for third-party advertising and tracking), and set
   Age Rating > Advertising to Yes. "Data Not Collected" is no longer true
   once ads ship.
