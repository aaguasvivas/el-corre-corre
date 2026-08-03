# El Corre Corre - Release Runbook

The line-by-line path to TestFlight and the App Store, in the Anota/Capi
runbook style. This project is raw Capacitor (no Expo/EAS), so builds go
through xcodebuild and uploads through Xcode.

## Status / prerequisites

- Apple Developer Program: ACTIVE, paid tier (confirmed 2026-08-03). Team `JQ39X3L553`.
- Signing: automatic, already working (dev build installed on Adelson's iPhone).
- App Store Connect record: NOT created yet (Adelson, see step 1).
- Site (privacy + support pages): built in `site/`, NOT published yet (needs Adelson's go).
- Always build from the repo root: `cd ~/Desktop/personal/el-corre-corre`.

## Assets and values (copy from here)

- Privacy policy URL: https://aaguasvivas.github.io/el-corre-corre-site/privacy.html
- Support / marketing URL: https://aaguasvivas.github.io/el-corre-corre-site/
- Listing copy (ES + EN), subtitle, keywords, promo text: [STORE.md](STORE.md)
- Bundle id: `dev.elcorrecorre.app` · SKU: `elcorrecorre-ios-v1`
- Privacy answers: **Data Not Collected** (offline game, zero requests; same
  answer as Anota and it is literally true here).
- Age rating: expect **9+** for Infrequent/Mild Cartoon or Fantasy Violence
  (comedic tumbles, stars, never people or animals). Everything else: None.
- Category: Games > Racing (secondary Arcade). Device: iPhone only
  (`TARGETED_DEVICE_FAMILY = 1`, set).
- Encryption: `ITSAppUsesNonExemptEncryption: false` in Info.plist (set), so
  no export-compliance question per build.
- Screenshots: 6.9" (1320x2868) required set, plan in STORE.md. Generate
  from the simulator with staged runs when listing time comes.

## One-time setup (Adelson)

1. **Publish the site**: say go, and the public repo `el-corre-corre-site`
   gets created from `site/` with Pages enabled. Verify both URLs load.
2. **Create the app record**: appstoreconnect.apple.com > My Apps > "+" >
   New App: platform iOS, name `El Corre Corre`, primary language Spanish
   (Mexico), bundle id `dev.elcorrecorre.app`, SKU `elcorrecorre-ios-v1`.

## Build + upload (repeatable, per release)

```bash
cd ~/Desktop/personal/el-corre-corre
npm run build && npx cap sync ios
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates \
  -archivePath build/App.xcarchive archive
```

Then upload, either way:

- **Xcode GUI (easiest first time)**: `open build/App.xcarchive` opens the
  Organizer; Distribute App > App Store Connect > Upload, all defaults.
- **CLI (after the first success)**: export with
  `xcodebuild -exportArchive -archivePath build/App.xcarchive -exportOptionsPlist exportOptions.plist -exportPath build/export -allowProvisioningUpdates`
  then upload the .ipa with Transporter or `xcrun altool --upload-app`
  (needs an app-specific password from appleid.apple.com, Adelson's step).

## App Store Connect (once the build lands)

1. Paste name, subtitle, promo text, description, keywords from STORE.md
   into the es-MX localization; add the English (U.S.) localization with
   the EN set.
2. Upload screenshots.
3. App Privacy: choose "Data Not Collected". Paste the privacy URL.
4. Age rating questionnaire per above; category; iPhone only shows
   automatically from the build.
5. App Review notes: fully offline arcade game, no accounts, no login, no
   server; reviewers just tap and play. Spanish-first UI with an EN toggle
   at the title screen (top right).
6. TestFlight: install on the real iPhone, one honest session (sound,
   haptics, safe areas, share card to the group chat), then Add for Review
   and Submit. Review is usually 1 to 3 days.

## After launch (roadmap lives in CLAUDE.md)

Game Center leaderboards behind the existing hook, Carrera del Malecón
weekly event, misiones diarias, pinturas. None of it blocks v1.
