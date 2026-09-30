# El Corre Corre: release runbook

The path from this repo to TestFlight and the App Store. The project is raw
Capacitor 6 (no Expo or EAS): builds go through xcodebuild, uploads through
the Xcode Organizer. Run every command here from the main checkout,
`~/Desktop/personal/el-corre-corre`, never from a worktree.

## Status (2026-09-30)

- Apple Developer Program: active, team `JQ39X3L553`. Signing: automatic.
- App Store Connect record: created. Name El Corre Corre, bundle id
  `dev.elcorrecorre.app`, SKU `elcorrecorre-ios-v1`, primary language
  Spanish (Mexico). Builds 1 to 9 are uploaded.
- Site: live at https://aaguasvivas.github.io/el-corre-corre-site/ (public
  repo `el-corre-corre-site`, GitHub Pages). It matches `site/` byte for
  byte.
- TestFlight: internal group (Adelson) and external group Familia
  (Erickson).
- Next: build 10 to TestFlight and the iPhone, then App Store review for
  version 1.0 with build 10.

## Builds (version 1.0)

| Build | Commit | Date | State |
|---|---|---|---|
| 4 | `4103cd2` | 2026-08-05 | Approved for external testing (Familia) |
| 5 to 8 | `515411a` to `929ee3e` | 2026-08-08 to 2026-09-01 | Superseded |
| 9 | `ad436cf` | 2026-09-01 | On TestFlight. Superseded by build 10: no pedals, no Los Mandaos, the old records, no native share, no save backup. Never select build 9 for App Store review. |
| 10 | not built yet | | Build from a commit that meets "Before build 10". Upload, test on the iPhone, then submit this build. |

Rule: any change to `src/`, `index.html`, `public/` or `ios/` after a build is
uploaded makes that build stale. The commit that bumps
`CURRENT_PROJECT_VERSION` also adds a row here.

## Before build 10

The store audit of `eb676ef` (2026-09-30) found these. Each one lands in a
commit before the archive, with the check that proves it.

1. **Photo-library purpose string.** COMPARTIR opens the iOS share sheet with
   an image, and its "Save Image" action writes to Photos. Without
   `NSPhotoLibraryAddUsageDescription`, iOS terminates the app on that tap.
   - `ios/App/App/Info.plist`: add the key with the ES string
     `El juego guarda en Fotos la tarjeta de tu corrida solo cuando tú lo pides.`
   - New `ios/App/App/es.lproj/InfoPlist.strings` with the same ES string
     and `ios/App/App/en.lproj/InfoPlist.strings` with
     `The game saves your run card to Photos only when you ask.`
   - `project.pbxproj`: an `InfoPlist.strings` variant group (en, es) in the
     App target's resources, `developmentRegion = es`, and
     `knownRegions = (es, en, Base)`. In Xcode this is InfoPlist.strings >
     File inspector > Localize.
   - Check in a Release build: `plutil -p App.app/Info.plist | grep NSPhotoLibraryAdd`
     prints the ES string, and `App.app/es.lproj` and `App.app/en.lproj`
     each hold `InfoPlist.strings`.
   - App Privacy stays "Data Not Collected": saving an image the player
     chose is not collection.
2. **Build number 10.** Set `CURRENT_PROJECT_VERSION = 10` in both the Debug
   and Release blocks of `ios/App/App.xcodeproj/project.pbxproj`.
   `MARKETING_VERSION` stays 1.0. App Store Connect refuses a second upload
   of 1.0 (9).
3. **Archive folder (one time).** `npx cap sync ios` ends with
   `xcodebuild clean`, which fails with exit 65 while `ios/App/build` holds
   archives Xcode did not create. Move them (ignored files, nothing is
   deleted):
   ```bash
   cd ~/Desktop/personal/el-corre-corre/ios/App
   mkdir -p build-archive
   mv build/App.xcarchive build-archive/App7.xcarchive
   mv build/App8.xcarchive build/App9.xcarchive build-archive/
   rmdir build
   ```
   The existing ignore rule `App/build-*/` in `ios/.gitignore` covers
   `build-archive/`. Check: `npx cap sync ios; echo $?` prints 0 and the log
   ends with "Sync finished".
4. **Gate the test rig.** `window.__ecc` (god mode, score and record
   setters) ships in the release bundle. Wrap the block in `src/main.ts` in
   `if (import.meta.env.DEV || new URLSearchParams(location.search).has('ecc'))`.
   `tools/shots.mjs` uses the dev server, so it keeps working; probes against
   `vite preview` add `?ecc`. Check: after `npm run build`,
   `grep -c __ecc dist/assets/index-*.js` prints 0.
5. **Privacy page.** `site/privacy.html` still describes the August game.
   Add pinturas, mandaos and the streak to "Lo que se queda en tu teléfono" /
   "What stays on your phone", add a "Compartir" / "Sharing" section (the
   card goes only to the app the player picks; saving to Fotos only adds that
   image and never reads photos), and update both dates. Publishing is a push
   to the public `el-corre-corre-site` repo: ask Adelson first, then fetch
   the live URL and diff it against `site/privacy.html`.
6. **In-app privacy link.** Owner decision, needed before App Store review
   (not before TestFlight). See "Open decisions".
7. Optional: the app icon PNGs are RGBA with every pixel opaque. Nine
   uploads accepted them. To remove the alpha channel, make
   `tools/make-icons.mjs` write color type 2 (RGB), run it, and check that
   `sips -g hasAlpha` prints no for all three icons.

## Assets and values (copy from here)

- Privacy policy URL: https://aaguasvivas.github.io/el-corre-corre-site/privacy.html
- Support and marketing URL: https://aaguasvivas.github.io/el-corre-corre-site/
- Listing copy (ES and EN), subtitle, keywords, promo text, screenshot plan:
  [STORE.md](STORE.md)
- Privacy answer: **Data Not Collected**. Checked on the `eb676ef` build:
  the app, Capacitor and Cordova privacy manifests list no collected data and
  no tracking, and the web bundle calls no server.
- Encryption: `ITSAppUsesNonExemptEncryption` is false in Info.plist, so
  there is no export question per build.
- Category: Games > Racing, secondary Games > Arcade. Device: iPhone only
  (`TARGETED_DEVICE_FAMILY = 1`), portrait only.
- Screenshots: the 6.9-inch set, 1320x2868 PNG with no alpha, one set per
  localization (STORE.md).

## Build and upload (per build)

1. Bump `CURRENT_PROJECT_VERSION` in both blocks of
   `ios/App/App.xcodeproj/project.pbxproj` and add a row to the Builds
   table. Commit.
2. `npm run check && sh tools/heavy.sh npm run build`
3. `npx cap sync ios` (main checkout only). It must end with "Sync
   finished". In a worktree with a symlinked `node_modules`, cap sync writes
   a machine path into `Podfile` and `Podfile.lock`; never commit those.
4. Archive:
   ```bash
   cd ~/Desktop/personal/el-corre-corre/ios/App
   sh ../../tools/heavy.sh xcodebuild -workspace App.xcworkspace -scheme App \
     -configuration Release -destination 'generic/platform=iOS' \
     -allowProvisioningUpdates -archivePath build-archive/App10.xcarchive archive
   ```
5. Check the archive:
   ```bash
   A=build-archive/App10.xcarchive/Products/Applications/App.app
   /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' $A/Info.plist   # 10
   /usr/libexec/PlistBuddy -c 'Print :NSPhotoLibraryAddUsageDescription' $A/Info.plist
   ls $A/PrivacyInfo.xcprivacy $A/Frameworks   # 6 frameworks, CapacitorShare among them
   diff -rq ../../dist $A/public   # only cordova.js and cordova_plugins.js differ
   ```
6. Upload: `open build-archive/App10.xcarchive` > Distribute App > App Store
   Connect > Upload. Wait for the "completed processing" email, and read any
   ITMS warning email (ITMS-91053 or ITMS-91061) before going on.
   CLI alternative after a first success:
   `xcodebuild -exportArchive -archivePath build-archive/App10.xcarchive -exportOptionsPlist exportOptions.plist -exportPath build-archive/export10 -allowProvisioningUpdates`,
   then upload the .ipa with Transporter.

## TestFlight (per build)

Needs: the build shows under TestFlight > iOS Builds.

1. iOS Builds > 10 > Test Details: paste "What to Test" (ES and EN, below).
   Save.
2. Familia group > Builds: build 10 is listed. If not: + > build 10 >
   Submit for Review.
3. Install build 10 from TestFlight on the iPhone and run "Device checks for
   build 10".
4. Optional, after Erickson has build 10: iOS Builds > 9 > Expire Build.
   This cannot be undone.

### What to Test, build 10

ES:
```
Build 10, la actualización grande.
Pedales abajo a la izquierda: ¡DALE! acelera y paga x1.5. FRENO paga x0.5 y se calienta si lo aguantas.
Los Mandaos: tres encargos a la vez, niveles y el mandao del día.
¡NUEVO RÉCORD! es de puntos. La cinta es de distancia.
Prueba: juega 5 corridas, comparte una tarjeta por WhatsApp, cierra la app y ábrela. Tus plátanos y récords tienen que seguir ahí.
```

EN:
```
Build 10, the big update.
Pedals at the bottom left: GAS speeds you up and pays x1.5. BRAKE pays x0.5 and overheats if you hold it.
Missions: three goals at a time, levels, and a daily mission.
NEW RECORD! is for points. The tape is for distance.
Try: play 5 runs, share a card to WhatsApp, close the app and open it again. Your plantains and records should still be there.
```

## Device checks for build 10

Build 10 is the first binary with CapacitorFilesystem, CapacitorPreferences,
CapacitorShare, GameViewController and the app privacy manifest. No earlier
device test covers them. On Adelson's iPhone:

1. **Launch alive:** `xcrun devicectl device process launch --console --terminate-existing --device <UDID> dev.elcorrecorre.app`,
   wait 20 s, then `xcrun devicectl device info processes --device <UDID> | grep App`.
   Pass: no crash text, and the process is listed.
2. **Cold start:** tap to title in about 3 s or less, sky color, no white or
   black flash.
3. **COMPARTIR:** share to WhatsApp and to Messages, then Guardar imagen
   (Spanish permission prompt, the image lands in Fotos), then Copiar and
   Guardar en Archivos. Close the sheet without a choice: nothing happens.
   Switch to EN and repeat Save Image: English prompt.
4. **Save mirror:** play 2 runs, buy a paint, force-quit, reopen. The
   plátanos, the paint and the records are still there.
5. **Pedals near the bottom edge:** slide up from the FRENO/¡DALE! area. The
   first swipe only shows the home indicator; a second swipe goes home.
6. **Sound and haptics:** sound after the first tap; haptics on near-miss,
   pickup and crash; the ringer switch; a phone call mid-run pauses the game
   and the countdown resumes it.
7. **App Store Connect:** no ITMS-91053 or ITMS-91061 email. Check whether
   the build page lists Spanish and English.

## App Store submission (version 1.0)

Needs: build 10 checked on the iPhone, the privacy page current, the in-app
privacy link decided, the screenshots made.

1. App Information, es-MX then en-US: Name, Subtitle, Privacy Policy URL.
   Category Games > Racing, secondary Games > Arcade. Content Rights: no
   third-party content. Save.
2. Age Rating > Edit: Cartoon or Fantasy Violence = Infrequent/Mild; every
   other answer None or No (no web access, no user content, no chat, no ads,
   no gambling, no contests, no loot boxes). The "BANCA DE LOTERÍA" sign is
   scenery with no betting, so Gambling and Simulated Gambling stay No. Save.
   The old estimate was 9+; write the rating the questionnaire gives into
   this file.
3. Pricing and Availability: Free, all countries and regions. Save.
4. App Privacy: Get Started > "No, we do not collect data from this app" >
   Save, then Publish. The answer stays a draft until Publish.
5. Business > Digital Services Act: declare trader or non-trader status.
   Without it the app is not offered in EU storefronts. A trader's address,
   phone and email show on the EU product page.
6. iOS App 1.0, es-MX then en-US: screenshots, Promotional Text,
   Description, Keywords, Support URL, Marketing URL. Save each
   localization.
7. Same page: Copyright `2026 Adelson Aguasvivas`. Build > + > build 10
   (never 9) > Done. Save.
8. App Review Information: sign-in not required; contact name, phone and
   email; paste the review note below. Save.
9. Version Release: "Manually release this version" or "Automatically".
   Save.
10. Add for Review > Submit to App Review. Review usually takes 1 to 3 days.

### App Review note (paste in English)

```
El Corre Corre is an offline arcade game. There is no account, no login, no server, no ads and no purchases. Tap the road on the title screen (it reads TOCA PA’ EMPEZAR in Spanish) to start a run.
Controls: drag anywhere to steer. The two pedals at the bottom left are GAS (faster, points x1.5) and BRAKE (slower, points x0.5; it overheats if held for about 2 seconds). Swipe up and hold for a wheelie. Riding in the oncoming lanes doubles points.
Missions (Los Mandaos) are in-game goals in sets of three, plus one daily goal. Paint jobs are bought only with plantains collected in runs or earned from missions. There is no real money anywhere.
SHARE on the game-over card opens the iOS share sheet with an image of the run. The game sends nothing by itself.
Spanish is the default. Tap EN at the top right of the title screen for English.
```

If the in-app privacy link ships, add one line that says where it is.

## Open decisions (Adelson)

1. **In-app privacy link** (Guideline 5.1.1(i): "within the app in an easily
   accessible manner"). Both options keep the game offline:
   - (A) A "Privacidad" / "Privacy" text link in the title footer or on the
     pause screen that opens the privacy URL in Safari. It needs a
     connection, and a `target=_blank` link must be checked to leave the
     Capacitor web view.
   - (B) An offline privacy card from the same spot with the policy's short
     ES and EN paragraphs and the URL as text. It works in airplane mode and
     adds one screen to keep in step with the site.
   Either way: ES and EN strings, a 44x44 tap target, no overlap at 375x667.
2. **Digital Services Act:** trader or non-trader (step 5 above).
3. **Version release:** manual or automatic (step 9 above).
4. **Share link:** `SHARE_URL` in `src/ui.ts` is empty, so the share card
   has no URL footer.

## After launch (roadmap lives in CLAUDE.md and docs/audit/PLAN.md)

Game Center leaderboards behind the existing hook in `src/leaderboard.ts`,
the Carrera del Malecón weekly event, and the items in PLAN.md decision 6.
None of it blocks v1.
