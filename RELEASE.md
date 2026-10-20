# El Corre Corre: release runbook

The path from this repo to TestFlight and the App Store. The project is raw
Capacitor 8 (no Expo or EAS) on CocoaPods: builds go through xcodebuild,
uploads through the Xcode Organizer. Capacitor 8 needs Node 22 (nvm; put
`~/.nvm/versions/node/v22.23.1/bin` first on PATH) and Xcode 26 or later.
Run every command here from the main checkout,
`~/Desktop/personal/el-corre-corre`, never from a worktree.

## Status (2026-10-19)

- Apple Developer Program: active, team `JQ39X3L553`. Signing: automatic.
- App Store Connect record: created. Name El Corre Corre, bundle id
  `dev.elcorrecorre.app`, SKU `elcorrecorre-ios-v1`, primary language
  Spanish (Mexico). Builds 1 to 9 are uploaded.
- Site: live at https://aaguasvivas.github.io/el-corre-corre-site/ (public
  repo `el-corre-corre-site`, GitHub Pages). `site/privacy.html` has the
  release 1.0 update (ads, tracking, consent, the purchase; dated October
  19, 2026) and is not pushed. The live page still says "no ads, no
  tracking", which is false for build 11: publish it before the App Privacy
  answers and before Submit (owner step 5).
- TestFlight: internal group (Adelson) and external group Familia
  (Erickson).
- Release 1.0 ships with ads, Remove Ads and Capacitor 8 as build 11
  (branch `ads-1.0`, docs/audit/ADS-PLAN.md). `CURRENT_PROJECT_VERSION` is
  11. Build 10 is superseded and is never uploaded or submitted.
- Ads gate: `npm run build` fails until the real AdMob ids are in
  `src/adIds.ts` (owner step 2). For device tests before then, use the
  test-ads build ("Ads and Remove Ads" below).
- Simulator check of the test-ads build (2026-10-19, Release build, iPhone
  17 Pro Max and iPhone SE simulators): Google's consent message and the
  tracking prompt on the title of a fresh install, both answers; a run to
  the card; a Google test video that doubled the card's plátanos once
  (+44 to +88, wallet 92 after the next run); the test banner on PAUSA and
  the MANDAOS sheet only; the Remove Ads sheet without StoreKit (not
  available, restore cancel). Not covered there: a StoreKit purchase (only
  an Xcode run or the sandbox on the phone), an offline launch (the
  simulator shares the Mac's network) and the phone itself ("Device checks
  for build 11").

## Builds (version 1.0)

| Build | Commit | Date | State |
|---|---|---|---|
| 4 | `4103cd2` | 2026-08-05 | Approved for external testing (Familia) |
| 5 to 8 | `515411a` to `929ee3e` | 2026-08-08 to 2026-09-01 | Superseded |
| 9 | `ad436cf` | 2026-09-01 | On TestFlight. Superseded: no pedals, no Los Mandaos, the old records, no native share, no save backup, no ads. Never select build 9 for App Store review. |
| 10 | `b5b9019` (app code as of `8a85b45`) | 2026-09-30 | Superseded by build 11 (owner decision of 2026-10-17: ads ship in 1.0). Archived at `ios/App/build-archive/App10.xcarchive`, never uploaded. Never upload or submit it. |
| 11 | branch `ads-1.0` (write the archive commit here) | not archived | The 1.0 build: ads, Remove Ads, Capacitor 8. Archive it after owner step 2 (the real AdMob ids), upload, run "Device checks for build 11", then submit this build. No test-ads archive exists for TestFlight: the archive guard refuses one on purpose, so test ads run only from Xcode or the device commands in "Test-ads build on the iPhone". |

Rule: any change to `src/`, `index.html`, `public/` or `ios/` after a build is
uploaded makes that build stale. The commit that bumps
`CURRENT_PROJECT_VERSION` also adds a row here.

## Owner steps for release 1.0 (only Adelson, in this order)

Each step names the record it needs first and the button that commits it.
Details for each step are in the sections below.

1. **Agreements.** developer.apple.com/account: accept the updated Apple
   Developer Program License Agreement (Apple news, October 13, 2026).
   App Store Connect > Business: the Paid Apps Agreement must be Active,
   with banking and tax forms done. Without it the Remove Ads purchase
   cannot be sold or tested in TestFlight, and a pending agreement can block
   submission.
2. **AdMob app and units** (ADS-PLAN.md owner step 1). AdMob > Apps > Add
   app: iOS, "El Corre Corre" (link it to the store listing after release).
   Then Ad units: one Banner unit (it serves anchored adaptive banners) and
   one Rewarded unit. Send the three ids (or paste them into `RELEASE_ADS`
   in `src/adIds.ts`):
   - app id, shaped `ca-app-pub-0000000000000000~0000000000`
   - banner unit id, shaped `ca-app-pub-0000000000000000/0000000000`
   - rewarded unit id, same shape as the banner id
   All three must belong to the account pub-4879291425090726; the build
   checks that they share one publisher id.
3. **Build 11.** With the ids in place: "Build and upload" below, then
   "TestFlight" and "Device checks for build 11".
4. **AdMob Privacy & messaging** (ADS-PLAN.md owner step 2). Create and
   publish, for this app: a European regulations (GDPR) message and an IDFA
   explainer message. Optional: a US state regulations message. Unpublished
   messages never show; the game then asks for tracking with the bare iOS
   prompt and shows no consent form.
5. **Privacy page.** Approve the push of `site/privacy.html` to the public
   `el-corre-corre-site` repo (a push needs your yes). Then fetch the live
   URL and diff it against `site/privacy.html`.
6. **app-ads.txt:** done. `https://aaguasvivas.github.io/app-ads.txt` is
   live (checked 2026-10-20) with
   `google.com, pub-4879291425090726, DIRECT, f08c47fec0942fa0`, the same
   file Anota uses. The marketing URL
   `https://aaguasvivas.github.io/el-corre-corre-site/` is on that domain,
   so nothing else is needed. AdMob verifies it after the app is linked to
   the live store listing.
7. **In-app purchase** (ADS-PLAN.md owner step 4). Create Remove Ads in App
   Store Connect ("In-app purchase: Remove Ads" below). If you choose a
   product id other than `elcorrecorre.remove_ads`, change
   `REMOVE_ADS_PRODUCT_ID` in `src/adIds.ts` and `productID` in
   `ios/App/App/Products.storekit` before archiving build 11.
8. **App Privacy.** Enter the "App Privacy answers" table below, then
   Publish. "Data Not Collected" is no longer true.
9. **Age rating.** "App Store submission" step 2.
10. **Submit.** "App Store submission" steps 3 to 10, with build 11, the
    Remove Ads purchase attached to the version, and the review note below.

## Before build 10 (store audit of `eb676ef`, 2026-09-30)

1. **Photo-library purpose string.** Done (`68fc5c6`).
   `NSPhotoLibraryAddUsageDescription` is in `Info.plist` (ES), with
   `es.lproj` and `en.lproj` `InfoPlist.strings`; `developmentRegion = es`,
   `knownRegions = (es, en, Base)`. The prompt follows the device language,
   not the in-game EN toggle.
2. **Build number.** Now 11 (see Builds).
3. **Archive folder.** Done: builds 7 to 10 are in
   `ios/App/build-archive/` (ignored by `App/build-*/` in `ios/.gitignore`).
   `npx cap sync ios` exits 0. Archive only into `build-archive/`: an
   archive in `ios/App/build` makes the sync's `xcodebuild clean` exit 65
   again.
4. **Test rig gate.** Done: `window.__ecc` exists only when
   `import.meta.env.DEV` or the `probe` mode is set (`npm run build:probe`,
   into the ignored `dist-probe/`). Check: after `npm run build`,
   `grep -c __ecc dist/assets/index-*.js` prints 0.
5. **Privacy page.** Rewritten for release 1.0 in `site/privacy.html`
   (2026-10-19). Not published: owner step 5.
6. **In-app privacy link.** Done: PAUSA has a "Privacidad" / "Privacy" link
   that opens the privacy URL in Safari (Capacitor hands `window.open` to
   the system).
7. **Icon alpha.** Done: `tools/make-icons.mjs` writes RGB and stops on any
   non-opaque pixel; `sips -g hasAlpha` prints no for the icons and splash.

## Ads and Remove Ads (release 1.0)

- **Ids:** `src/adIds.ts` is the one place. `npm run build` (the App Store
  bundle) carries `RELEASE_ADS` and refuses to run while they are empty,
  malformed or Google's test ids. `dist/ads-ids.json` says which set a
  bundle carries.
- **Info.plist app id:** every `npx cap copy ios` or `npx cap sync ios`
  runs `tools/ios-ads-plist.mjs`, which writes the bundle's app id into
  `GADApplicationIdentifier` and prints which set it is. Commit that
  Info.plist change with the real id.
- **Test-ads build for a device (never the App Store):**
  ```bash
  npm run build:adtest && npx cap sync ios
  ```
  Then run from Xcode on the iPhone. The title shows a red "ANUNCIOS DE
  PRUEBA" / "TEST ADS" tag and Google's ads say "Test mode". An archive of
  this bundle fails on purpose in the "[ECC] No test ads in an archive"
  build phase. Before archiving, run `npm run build` and sync again.
- **Purchases in the simulator:** run the App scheme from Xcode; its Run
  action uses `ios/App/App/Products.storekit` (Remove Ads at 1.99 USD).
  Check Product > Scheme > Edit Scheme > Run > Options > StoreKit
  Configuration shows Products.storekit (set it there if it does not).
  `xcrun simctl launch` does not use it: the sheet then says the store is
  not available, which is the right offline behavior, and RESTAURAR
  COMPRAS opens Apple's "Sign in to Apple Account" sheet (cancel it: the
  sheet says "No se pudo restaurar. Intenta otra vez." and nothing
  changes). On a device, use a Sandbox Apple Account (Settings >
  Developer).
- **Test-ads build on the iPhone (owner, phone unlocked and connected):**
  ```bash
  cd ~/Desktop/personal/el-corre-corre
  export PATH=~/.nvm/versions/node/v22.23.1/bin:$PATH
  npm run build:adtest && npx cap sync ios
  cd ios/App
  sh ../../tools/heavy.sh xcodebuild -workspace App.xcworkspace -scheme App \
    -configuration Debug -destination 'id=00008150-000E6D0E14C0401C' \
    -derivedDataPath /tmp/ecc-device-dd -allowProvisioningUpdates \
    -allowProvisioningDeviceRegistration build
  xcrun devicectl device install app --device 00008150-000E6D0E14C0401C \
    /tmp/ecc-device-dd/Build/Products/Debug-iphoneos/App.app
  xcrun devicectl device process launch --console --terminate-existing \
    --device 00008150-000E6D0E14C0401C dev.elcorrecorre.app
  ```
  Leave the console open for 20 seconds, then in a second terminal:
  `xcrun devicectl device info processes --device 00008150-000E6D0E14C0401C | grep App.app`.
  Pass: no crash text in the console, and the process is listed. Then run
  "Device checks for build 11" 2 to 14 on this build (the purchase uses the
  sandbox). Delete `/tmp/ecc-device-dd` after.
- **Ad privacy link:** where Google's consent rules require it (the UMP
  privacy options status is REQUIRED, for example in the EEA), PAUSA shows
  "Privacidad de anuncios" / "Ad privacy" right after "Privacidad"; it
  opens Google's privacy options form. Elsewhere it stays hidden.
- **Reporting ads (Guideline 2.5.18):** every Google ad carries the
  AdChoices icon, where the player can report it; the privacy page says so
  and gives the contact email.

## App Privacy answers (release 1.0, build 11)

How this was built, on 2026-10-19:

- Read live: Google's "App store data disclosure" page for the iOS Mobile
  Ads SDK (developers.google.com/admob/ios/privacy/data-disclosure, last
  updated 2026-10-16) and Apple's App Privacy Details page
  (developer.apple.com/app-store/app-privacy-details). Google's page lists
  the data and purposes but not the linked or tracking flags; it says the
  SDK's privacy manifest is the declaration to check, so the flags below
  come from the manifests in the built app.
- Built the Release configuration for the simulator from `95def25` (pods:
  Google-Mobile-Ads-SDK 13.11.0, GoogleUserMessagingPlatform 3.1.0,
  CapacitorCommunityAdmob 8.2.1, CapgoNativePurchases 8.9.6) and read
  every `PrivacyInfo.xcprivacy` in `App.app` with
  `plutil -convert json`.

Privacy manifests in the built app (5):

| Bundle | Tracking | Collected data types | Required-reason APIs |
|---|---|---|---|
| `App.app/PrivacyInfo.xcprivacy` (the game's own) | false, no domains | none | UserDefaults CA92.1, FileTimestamp C617.1 |
| `GoogleMobileAdsResources.bundle` | key absent, no domains | 7 (table below) | SystemBootTime 35F9.1, UserDefaults CA92.1, DiskSpace E174.1 |
| `UserMessagingPlatformResources.bundle` | key absent, no domains | Coarse Location, Performance Data, Product Interaction (not linked, not tracking, App Functionality) | UserDefaults CA92.1 |
| `Capacitor.framework/Capacitor.bundle` | false | none | none |
| `Cordova.framework/CapacitorCordova.bundle` | false | none | none |

The frameworks without a manifest (CapacitorFilesystem, CapacitorHaptics,
CapacitorPreferences, CapacitorShare, CapgoNativePurchases,
IONFilesystemLib) and the AdMob plugin (linked into the app binary)
collect nothing. Preferences uses UserDefaults and the filesystem code reads
file timestamps; the app's manifest declares both. The purchase plugin
makes no network call of its own (only StoreKit), has no manifest and uses
no required-reason API. The app's manifest declares no data and no
tracking because the game's own code collects nothing; Google's manifests
declare Google's data, and repeating it in the app's manifest would
double-declare it.

**The answers.** App Store Connect > App Privacy > "Do you or your
third-party partners collect data from this app?" Yes. Tick exactly these
seven types:

| Data type | Collected by | Linked to the user | Used for tracking | Purposes |
|---|---|---|---|---|
| Location > Coarse Location | Google Mobile Ads (from the IP address), UMP | Yes | No | Third-Party Advertising; Developer's Advertising or Marketing; Analytics; App Functionality |
| Identifiers > Device ID | Google Mobile Ads (the IDFA with ATT permission, or app- or developer-scoped ids) | Yes | **Yes** | Third-Party Advertising; Developer's Advertising or Marketing; Analytics |
| Usage Data > Product Interaction | Google Mobile Ads, UMP | Yes | No | Third-Party Advertising; Developer's Advertising or Marketing; Analytics; App Functionality |
| Usage Data > Advertising Data | Google Mobile Ads | Yes | No | Third-Party Advertising; Developer's Advertising or Marketing; Analytics |
| Diagnostics > Crash Data | Google Mobile Ads | No | No | Analytics |
| Diagnostics > Performance Data | Google Mobile Ads, UMP | No | No | Third-Party Advertising; Developer's Advertising or Marketing; Analytics; App Functionality |
| Diagnostics > Other Diagnostic Data | Google Mobile Ads | No | No | Third-Party Advertising; Developer's Advertising or Marketing; Analytics |

Rules used: a type collected by both SDKs gets the union of their purposes,
and it is linked if either manifest links it. The purposes are the ones the
manifests declare, including ones the game does not use itself, because
Apple asks for the practices of third-party partners too.

Not collected (leave unticked): Contact Info, Health and Fitness, Financial
Info, Precise Location, Sensitive Info, Contacts, User Content, Browsing
History, Search History, User ID, **Purchases**, Other Usage Data, Other
Data. Purchases: Apple processes the payment, the game never sees payment
details, and it stores only the `ecc.v1.adFree` flag on the device. Apple's
page: "You are not responsible for disclosing data collected by Apple." No
type qualifies for optional disclosure, since all of them are used for
advertising.

The label then reads: Data Used to Track You: Identifiers. Data Linked to
You: Location, Identifiers, Usage Data. Data Not Linked to You:
Diagnostics.

After the answers: Privacy Policy URL (below), then **Publish**. The answers
stay a draft until Publish. Recheck this table whenever the Google Mobile
Ads SDK or UMP version changes (read the manifests of the new build).

Info.plist purpose strings in the build: `NSUserTrackingUsageDescription`
and `NSPhotoLibraryAddUsageDescription`, in ES (`Info.plist`,
`es.lproj`) and EN (`en.lproj`). `SKAdNetworkItems` holds Google's 50 ids.

## In-app purchase: Remove Ads (App Store Connect)

Needs: owner step 1 (Paid Apps Agreement active). The first in-app purchase
of an app must be submitted with a new app version, so it goes out with
1.0.

1. App > Monetization > In-App Purchases > +. Type: **Non-Consumable**.
   Reference Name: `Remove Ads` (64 max, internal). Product ID:
   `elcorrecorre.remove_ads` (it can never be changed or reused). Create.
2. Availability: all countries and regions. Save.
3. Price Schedule: USD 1.99 (Apple fills the other storefronts). Save.
4. App Store Localization, add both:
   - Spanish (Mexico): Display Name `Quitar anuncios` (15 of 30), Description
     `Quita los banners de la pausa y Los Mandaos.` (44 of 45).
   - English (U.S.): Display Name `Remove Ads` (10 of 30), Description
     `Removes the banners on pause and missions.` (42 of 45).
   Save each.
5. Review Information: Screenshot
   `docs/store/iap-review/remove-ads-es-iphone69.png` (1320x2868, no alpha,
   the Remove Ads sheet; review only, never on the store). Review Notes:
   `Removes the banner ads (pause screen and missions list). The optional rewarded video stays available because it plays only when tapped. Open from the AD button under the sound button on the title screen, or "Quitar anuncios" on the pause screen. Restore Purchases is in the same sheet.`
   Save. The screenshot is a headless render with the store stand-in (its
   price reads US$1.99); a capture from the device's Sandbox sheet works
   too.
6. Tax category: leave the default. Family Sharing: your call (it cannot be
   turned off once on). Leave "promote" off.
7. The status turns to "Ready to Submit". Attach it on the version page
   ("App Store submission" step 7).

## Assets and values (copy from here)

- Privacy policy URL: https://aaguasvivas.github.io/el-corre-corre-site/privacy.html
- Support and marketing URL: https://aaguasvivas.github.io/el-corre-corre-site/
- Listing copy (ES and EN), subtitle, keywords, promo text, screenshot plan:
  [STORE.md](STORE.md)
- Privacy answers: "App Privacy answers" above.
- Encryption: `ITSAppUsesNonExemptEncryption` is false in Info.plist, so
  there is no export question per build.
- Category: Games > Racing, secondary Games > Arcade. Device: iPhone only
  (`TARGETED_DEVICE_FAMILY = 1`), portrait only.
- Screenshots: the 6.9-inch set, 1320x2868 PNG with no alpha, one set per
  localization (STORE.md). iPhone Duo screenshots become required in April
  2027 (Apple news, October 5, 2026), not for this submission.

## Build and upload (per build)

1. Bump `CURRENT_PROJECT_VERSION` in both blocks of
   `ios/App/App.xcodeproj/project.pbxproj` and add a row to the Builds
   table. Commit. (Build 11 is already set.)
2. `npm run check && sh tools/heavy.sh npm run build` (fails until the
   real AdMob ids are in `src/adIds.ts`). Then
   `grep -c 3940256099942544 dist/assets/index-*.js` prints 0 and
   `dist/ads-ids.json` says `"test": false`.
3. `npx cap sync ios` (main checkout only). It must print the
   `[ads] Info.plist GADApplicationIdentifier ... (release ids)` line and
   end with "Sync finished". In a worktree with a symlinked `node_modules`, cap sync writes
   a machine path into `Podfile` and `Podfile.lock`; never commit those. If
   pod install says it cannot find a pod version (the Filesystem plugin pulls
   `IONFilesystemLib` from the CocoaPods CDN), run
   `pod install --repo-update` in `ios/App` once, then sync again.
4. Archive:
   ```bash
   cd ~/Desktop/personal/el-corre-corre/ios/App
   sh ../../tools/heavy.sh xcodebuild -workspace App.xcworkspace -scheme App \
     -configuration Release -destination 'generic/platform=iOS' \
     -allowProvisioningUpdates -archivePath build-archive/App11.xcarchive archive
   ```
5. Check the archive:
   ```bash
   A=build-archive/App11.xcarchive/Products/Applications/App.app
   /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' $A/Info.plist   # 11
   /usr/libexec/PlistBuddy -c 'Print :GADApplicationIdentifier' $A/Info.plist   # the real app id, not 3940256099942544
   /usr/libexec/PlistBuddy -c 'Print :NSUserTrackingUsageDescription' $A/Info.plist
   /usr/libexec/PlistBuddy -c 'Print :SKAdNetworkItems' $A/Info.plist | grep -c SKAdNetworkIdentifier   # 50
   find $A -name PrivacyInfo.xcprivacy   # 5: the app, GoogleMobileAdsResources, UserMessagingPlatformResources, Capacitor, CapacitorCordova
   ls $A/Frameworks   # 8 frameworks, CapgoNativePurchases and IONFilesystemLib among them
   diff -rq ../../dist $A/public   # only cordova.js and cordova_plugins.js differ
   ```
   If the manifest list differs from "App Privacy answers", redo that table
   before submitting.
6. Upload: `open build-archive/App11.xcarchive` > Distribute App > App Store
   Connect > Upload. Wait for the "completed processing" email, and read any
   ITMS warning email (ITMS-91053 or ITMS-91061) before going on.
   CLI alternative after a first success:
   `xcodebuild -exportArchive -archivePath build-archive/App11.xcarchive -exportOptionsPlist exportOptions.plist -exportPath build-archive/export11 -allowProvisioningUpdates`,
   then upload the .ipa with Transporter.

## TestFlight (per build)

Needs: the build shows under TestFlight > iOS Builds.

1. iOS Builds > 11 > Test Details: paste "What to Test" (ES and EN, below).
   Save.
2. Familia group > Builds: build 11 is listed. If not: + > build 11 >
   Submit for Review.
3. Install build 11 from TestFlight on the iPhone and run "Device checks for
   build 11". TestFlight purchases use the sandbox and charge nothing.
4. Optional, after Erickson has build 11: iOS Builds > 9 > Expire Build.
   This cannot be undone.

### What to Test, build 11

ES:
```
Build 11: anuncios y Quitar anuncios.
Al abrir por primera vez, el juego pregunta por el rastreo en la pantalla de inicio, nunca en una corrida.
Choca con plátanos recogidos: el botón ×2 de la tarjeta pone un video y duplica los plátanos de esa corrida. Es opcional.
En la pausa y en Los Mandaos hay un banner pequeño. Nunca mientras corres.
Quitar anuncios (el botón AD debajo del sonido) quita los banners. En TestFlight la compra es de prueba y no cobra.
Prueba también sin internet: el juego tiene que funcionar igual, sin anuncios.
```

EN:
```
Build 11: ads and Remove Ads.
On first launch the game asks about tracking on the title screen, never during a run.
Crash after collecting plantains: the ×2 button on the card plays a video and doubles that run’s plantains. It is optional.
A small banner shows on the pause screen and on the missions list. Never while you ride.
Remove Ads (the AD button under the sound button) removes the banners. In TestFlight the purchase is a test and charges nothing.
Also try it offline: the game should play the same, with no ads.
```

## Device checks for build 11

Build 11 is the first binary with Google Mobile Ads, UMP, the purchase
plugin and Capacitor 8, and no device has run build 10's new native parts
either (Filesystem, Preferences, Share, GameViewController, the privacy
manifest). Use two Apple identities for the purchase checks: Sandbox tester
A on the iPhone, and a second device or Sandbox tester B for "not owned".

1. **Launch alive:** `xcrun devicectl device process launch --console --terminate-existing --device <UDID> dev.elcorrecorre.app`,
   wait 20 s, then `xcrun devicectl device info processes --device <UDID> | grep App`.
   Pass: no crash text, and the process is listed.
2. **Cold start:** tap to title in about 3 s or less, sky color, no white or
   black flash.
3. **First launch prompts:** delete the app, install, open. About a second
   after the title appears, the tracking prompt shows over the title (after
   Google's message, if AdMob shows one for your region), never over a run.
   Tap "Ask App Not to Track": a banner still shows on PAUSA
   (non-personalized). Reinstall and tap "Allow": ads still show.
4. **Banner:** on PAUSA and the MANDAOS sheet only, with every control
   clear above it; gone before the 3, 2, 1 after SEGUIR; never on the
   title, in play, on the crash or on the card.
5. **Rewarded video:** collect plátanos and crash. The ×2 "anuncio" button
   appears on the plátanos row about a second after the card lands; a tap
   right at the crash restarts instead. Watch to the end: the plátanos
   double once, the music pauses and comes back. Close one early: nothing
   is added.
6. **Report an ad:** tap the AdChoices icon on a banner and on a video.
   Write down what Google's menu offers (the review note says players can
   report an ad there).
7. **Remove Ads, tester A:** AD chip > the sheet shows the App Store price.
   Buy: "¡Listo! Se fueron los banners.", the banner on PAUSA is gone at once, the AD
   chip and "Quitar anuncios" disappear, the ×2 video still works. Delete
   the app, reinstall, open the sheet, Restaurar compras: "Compra
   restaurada", owned again.
8. **Remove Ads, tester B or a second device:** the item is not owned and
   the banner shows. Cancel Apple's purchase sheet: "Compra cancelada.",
   nothing changes.
9. **Offline:** airplane mode, cold start: no ×2 button, no banner, no
   error. The Remove Ads sheet shows COMPRAR with no price and a tap on it
   says it could not buy. The game plays as before.
10. **Ad privacy link:** on a US device, PAUSA shows Quitar anuncios and
    Privacidad only. (The EEA branch, with "Privacidad de anuncios", is
    covered by the screens probe's stand-in; a device check needs an EEA
    connection.)
11. **COMPARTIR:** share to WhatsApp and to Messages, then Guardar imagen
    (Spanish permission prompt, the image lands in Fotos), then Copiar and
    Guardar en Archivos. Close the sheet without a choice: nothing happens.
12. **Save mirror:** play 2 runs, buy a paint, force-quit, reopen. The
    plátanos, the paint, the records and Remove Ads are still there.
13. **Pedals near the bottom edge:** slide up from the FRENO/¡DALE! area.
    The first swipe only shows the home indicator; a second swipe goes home.
14. **Sound and haptics:** sound after the first tap; haptics on near-miss,
    pickup and crash; the ringer switch; a phone call mid-run pauses the
    game and the countdown resumes it.
15. **App Store Connect:** no ITMS-91053 or ITMS-91061 email. Check that the
    build page lists Spanish and English.
16. **VoiceOver:** double-tap MANDAOS, EN, the AD chip, a ride tab, a paint,
    SEGUIR, MENÚ, COMPARTIR and the ×2 button; each acts once.

## App Store submission (version 1.0)

Needs: owner steps 1 to 8 done, build 11 checked on the iPhone, the privacy
page published and current, the screenshots made.

1. App Information, es-MX then en-US: Name, Subtitle, Privacy Policy URL.
   Category Games > Racing, secondary Games > Arcade. Content Rights: no
   third-party content. Save.
2. Age Rating > Edit (questionnaire read live on 2026-10-19):
   - In-App Controls: Parental Controls No, Age Assurance No.
   - Capabilities: Unrestricted Web Access No, User-Generated Content No,
     Social Media No, Messaging and Chat No, **Advertising Yes**.
   - Violence: Cartoon or Fantasy Violence **Infrequent** (comedic crash
     tumbles with stars; people and animals are never hit). Realistic
     Violence, Guns or Other Weapons: None.
   - Chance-Based Activities: Gambling No, Simulated Gambling None (the
     "BANCA DE LOTERÍA" sign is scenery with no betting), Loot Boxes No.
     Contests: your call. Apple's definition includes "the achievement of
     personal goals", which Los Mandaos are; there is no competition
     between players. None and Infrequent both keep the rating; Frequent
     would raise it to 13+.
   - Everything else None or No.
   Advertising does not raise the rating; Infrequent cartoon violence makes
   it 9+. Save, and write the rating here. The ads are capped at PG
   (`src/admobPort.ts`); if the rating comes out 4+, lower that cap to G.
3. Pricing and Availability: Free, all countries and regions. Save.
4. App Privacy: the answers above, then Publish.
5. Business > Digital Services Act: declare trader or non-trader status.
   Without it the app is not offered in EU storefronts. A trader's address,
   phone and email show on the EU product page.
6. iOS App 1.0, es-MX then en-US: screenshots (the 8 PNGs in
   `docs/store/screenshots/es` and `/en`, in the STORE.md order),
   Promotional Text, Description (both changed for ads), Keywords, Support
   URL, Marketing URL. Save each localization.
7. Same page: Copyright `2026 Adelson Aguasvivas`. Build > + > build 11
   (never 9 or 10) > Done. In-App Purchases and Subscriptions > + > Remove
   Ads > Done. Save.
8. App Review Information: sign-in not required; contact name, phone and
   email; paste the review note below. Save.
9. Version Release: "Manually release this version" or "Automatically".
   Save.
10. Add for Review > Submit to App Review. Review usually takes 1 to 3 days.
    The submission carries the version and the Remove Ads purchase
    together.

Review window: the binary calls no server of ours. AdMob serving and
StoreKit are Google's and Apple's. Keep the AdMob app, its two units and
its Privacy & messaging messages unchanged until approval, and push no
change to the live privacy page after Submit unless it fixes a false
statement.

### App Review note (paste in English)

```
El Corre Corre is an arcade game that plays fully offline. There is no account, no login and no server of our own. Tap the road on the title screen (it reads TOCA PA’ EMPEZAR in Spanish) to start a run.
Tracking and consent: about one second after the title screen first appears, the App Tracking Transparency prompt shows over the title screen. Where Google’s consent rules apply (EEA, UK, Switzerland), Google’s consent message shows first. Prompts never open during a run. Ads work with either answer; without tracking permission the game requests non-personalized ads only.
Ads (Google AdMob): a small banner appears only on the pause screen and on the missions list (MANDAOS on the title screen). There are no interstitials and no ads during play. After a run that collected plantains, the game-over card offers an optional rewarded video: the ×2 button marked "anuncio" (Spanish for ad) on the plantains row. It plays only when tapped and doubles the plantains of that run. Every ad carries Google’s AdChoices icon, where players can report an ad; the privacy policy also gives a contact email for reports.
In-app purchase: Remove Ads ($1.99, non-consumable) removes the banners. The optional video stays because it plays only on request. Open it from the "AD" button under the sound button on the title screen, or from "Quitar anuncios" (Remove ads) on the pause screen. Restore Purchases is in the same sheet.
Pause screen: start a run and tap the pause button at the top left. It holds Remove ads, Privacy (the privacy policy) and, where Google’s consent rules apply, "Privacidad de anuncios" (Ad privacy), which reopens Google’s consent choices.
Controls: drag anywhere to steer. The two pedals at the bottom left are GAS (faster, points x1.5) and BRAKE (slower, points x0.5; it overheats if held for about 2 seconds). Swipe up and hold for a wheelie. Riding in the oncoming lanes doubles points.
Missions (Los Mandaos) are in-game goals in sets of three, plus one daily goal. Paint jobs are bought only with plantains collected in runs, earned from missions or doubled by the optional video. Plantains cannot be bought with money.
SHARE on the game-over card opens the iOS share sheet with an image of the run. The game sends nothing by itself.
Spanish is the default. Tap EN at the top right of the title screen for English.
```

The note is 2336 characters (the field allows 4000).

## Open decisions (Adelson)

1. **Digital Services Act:** trader or non-trader (submission step 5).
2. **Version release:** manual or automatic (submission step 9).
3. **Share link:** `SHARE_URL` in `src/ui.ts` is empty, so the share card
   has no URL footer.
4. **Contests answer** in the age rating (submission step 2).
5. **Family Sharing** for Remove Ads ("In-app purchase" step 6).

## After launch (roadmap lives in CLAUDE.md and docs/audit/PLAN.md)

Game Center leaderboards behind the existing hook in `src/leaderboard.ts`,
the Carrera del Malecón weekly event, and the items in PLAN.md decision 6.
None of it blocks v1. After approval, link the AdMob app to the live store
listing so app-ads.txt verification can run.
