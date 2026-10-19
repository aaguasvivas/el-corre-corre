# El Corre Corre: release runbook

The path from this repo to TestFlight and the App Store. The project is raw
Capacitor 8 (no Expo or EAS) on CocoaPods: builds go through xcodebuild,
uploads through the Xcode Organizer. Capacitor 8 needs Node 22 (nvm; put
`~/.nvm/versions/node/v22.23.1/bin` first on PATH) and Xcode 26 or later.
Run every command here from the main checkout,
`~/Desktop/personal/el-corre-corre`, never from a worktree.

## Status (2026-09-30)

- Apple Developer Program: active, team `JQ39X3L553`. Signing: automatic.
- App Store Connect record: created. Name El Corre Corre, bundle id
  `dev.elcorrecorre.app`, SKU `elcorrecorre-ios-v1`, primary language
  Spanish (Mexico). Builds 1 to 9 are uploaded.
- Site: live at https://aaguasvivas.github.io/el-corre-corre-site/ (public
  repo `el-corre-corre-site`, GitHub Pages). `site/privacy.html` has the
  build-10 update (`59b540e`) and is not pushed, so the live privacy page is
  behind `site/` until Adelson publishes it.
- TestFlight: internal group (Adelson) and external group Familia
  (Erickson).
- Build 10 is archived at `ios/App/build-archive/App10.xcarchive` and not
  uploaded. Next: upload it, run "Device checks for build 10", then App
  Store review for version 1.0 with build 10.

## Builds (version 1.0)

| Build | Commit | Date | State |
|---|---|---|---|
| 4 | `4103cd2` | 2026-08-05 | Approved for external testing (Familia) |
| 5 to 8 | `515411a` to `929ee3e` | 2026-08-08 to 2026-09-01 | Superseded |
| 9 | `ad436cf` | 2026-09-01 | On TestFlight. Superseded by build 10: no pedals, no Los Mandaos, the old records, no native share, no save backup. Never select build 9 for App Store review. |
| 10 | `b5b9019` (app code as of `8a85b45`) | 2026-09-30 | Archived at `ios/App/build-archive/App10.xcarchive`: CFBundleVersion 10, MinimumOSVersion 15.0, main JS identical to `dist/`, PrivacyInfo.xcprivacy in the app. Installed on Adelson's iPhone from the archive; the launch check did not run because the iPhone was locked. Not uploaded. Upload, test on the iPhone, then submit this build. |

Rule: any change to `src/`, `index.html`, `public/` or `ios/` after a build is
uploaded makes that build stale. The commit that bumps
`CURRENT_PROJECT_VERSION` also adds a row here.

## Before build 10

The store audit of `eb676ef` (2026-09-30) found these. Items 1 to 4 and 7
are done in wave 4; 5 and 6 are still open.

1. **Photo-library purpose string.** Done (`68fc5c6`).
   `NSPhotoLibraryAddUsageDescription` is in `Info.plist` (ES), with
   `es.lproj` and `en.lproj` `InfoPlist.strings`; `developmentRegion = es`,
   `knownRegions = (es, en, Base)`. Checked in the build 10 archive. The
   prompt follows the device language, not the in-game EN toggle.
2. **Build number 10.** Done: `CURRENT_PROJECT_VERSION = 10` in Debug and
   Release, `MARKETING_VERSION` 1.0.
3. **Archive folder.** Done: builds 7, 8 and 9 are
   `ios/App/build-archive/App7.xcarchive`, `App8` and `App9` (ignored by
   `App/build-*/` in `ios/.gitignore`). `npx cap sync ios` exits 0. Archive
   only into `build-archive/`: an archive in `ios/App/build` makes the
   sync's `xcodebuild clean` exit 65 again.
4. **Test rig gate.** Done: `window.__ecc` exists only when
   `import.meta.env.DEV` or the `probe` mode is set (`npm run build:probe`,
   into the ignored `dist-probe/`). Check: after `npm run build`,
   `grep -c __ecc dist/assets/index-*.js` prints 0.
5. **Privacy page.** Updated in `site/privacy.html` (`59b540e`: pinturas,
   mandaos, the streak, a Compartir / Sharing section, dated September 30,
   2026). Not published. Publishing is a push to the public
   `el-corre-corre-site` repo: ask Adelson first, then fetch the live URL and
   diff it against `site/privacy.html`.
6. **In-app privacy link.** Done: PAUSA ends with a "Privacidad" / "Privacy"
   link that opens the privacy URL in Safari (Capacitor hands `window.open`
   to the system).
7. **Icon alpha.** Done: `tools/make-icons.mjs` writes RGB and stops on any
   non-opaque pixel; `sips -g hasAlpha` prints no for the icons and splash.

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
   a machine path into `Podfile` and `Podfile.lock`; never commit those. If
   pod install says it cannot find a pod version (the Filesystem plugin pulls
   `IONFilesystemLib` from the CocoaPods CDN), run
   `pod install --repo-update` in `ios/App` once, then sync again.
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
   ls $A/PrivacyInfo.xcprivacy $A/Frameworks   # 7 frameworks since Capacitor 8: CapacitorShare and IONFilesystemLib among them
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
   The photo prompt follows the device language, not the in-game EN toggle:
   to see the English prompt, set the iPhone language to English.
4. **Save mirror:** play 2 runs, buy a paint, force-quit, reopen. The
   plátanos, the paint and the records are still there.
5. **Pedals near the bottom edge:** slide up from the FRENO/¡DALE! area. The
   first swipe only shows the home indicator; a second swipe goes home.
6. **Sound and haptics:** sound after the first tap; haptics on near-miss,
   pickup and crash; the ringer switch; a phone call mid-run pauses the game
   and the countdown resumes it.
7. **App Store Connect:** no ITMS-91053 or ITMS-91061 email. Check whether
   the build page lists Spanish and English.
8. **VoiceOver:** double-tap MANDAOS, EN, a ride tab, a paint, SEGUIR, MENÚ
   and COMPARTIR; each acts once.

## App Store submission (version 1.0)

Needs: build 10 checked on the iPhone, the privacy page published and
current, the screenshots made.

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
6. iOS App 1.0, es-MX then en-US: screenshots (the 8 PNGs in
   `docs/store/screenshots/es` and `/en`, in the STORE.md order), Promotional Text,
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
The privacy policy link is on the pause screen: start a run, tap the pause button at the top left, then Privacy.
```

## Open decisions (Adelson)

1. **Digital Services Act:** trader or non-trader (step 5 above).
2. **Version release:** manual or automatic (step 9 above).
3. **Share link:** `SHARE_URL` in `src/ui.ts` is empty, so the share card
   has no URL footer.

## After launch (roadmap lives in CLAUDE.md and docs/audit/PLAN.md)

Game Center leaderboards behind the existing hook in `src/leaderboard.ts`,
the Carrera del Malecón weekly event, and the items in PLAN.md decision 6.
None of it blocks v1.
