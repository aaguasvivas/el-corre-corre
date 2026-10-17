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

## Owner steps (only Adelson)

1. AdMob: add the iOS app "El Corre Corre" (it can be linked to the store
   listing after release), create one banner unit and one rewarded unit, and
   send the app id (`ca-app-pub-...~...`) and both unit ids.
2. AdMob > Privacy & messaging: publish a GDPR message and an IDFA explainer
   message for this app.
3. app-ads.txt: AdMob checks `https://<developer website domain>/app-ads.txt`
   with the line for pub-4879291425090726. The store listing's marketing URL
   decides the domain (choose where to host it).
4. App Store Connect: create the non-consumable `elcorrecorre.remove_ads`
   (or the id you prefer) at $1.99 with ES and EN names, then answer App
   Privacy for advertising data, and set Age Rating > Advertising to Yes.
