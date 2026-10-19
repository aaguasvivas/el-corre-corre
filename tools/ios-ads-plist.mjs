// Writes the web bundle's AdMob app id into ios/App/App/Info.plist
// (GADApplicationIdentifier), so the native SDK always starts with the same
// app id as the ad units in the bundle. Runs as the capacitor:copy:after hook
// (package.json): every `npx cap copy ios` and `npx cap sync ios`.
//
// The id comes from <webDir>/ads-ids.json, which vite.config.ts writes from
// src/adIds.ts: Google's sample app id for dev, probe and build:adtest
// bundles, the real one for `npm run build`. Plain node, no dependencies.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const platform = process.env.CAPACITOR_PLATFORM_NAME ?? 'ios';
if (platform !== 'ios') process.exit(0);

const root = process.env.CAPACITOR_ROOT_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = process.env.CAPACITOR_WEB_DIR ?? resolve(root, 'dist');
const idsFile = resolve(webDir, 'ads-ids.json');
const plistFile = resolve(root, 'ios/App/App/Info.plist');

function fail(msg) {
  console.error(`[ads] ${msg}`);
  process.exit(1);
}

if (!existsSync(idsFile)) {
  fail(`${idsFile} is missing: build the web bundle first (npm run build, or npm run build:adtest for a device test build).`);
}
const { appId, test, mode } = JSON.parse(readFileSync(idsFile, 'utf8'));
if (typeof appId !== 'string' || !/^ca-app-pub-\d{16}~\d{10}$/.test(appId)) {
  fail(`ads-ids.json has no valid AdMob app id (${appId}); see src/adIds.ts.`);
}

const plist = readFileSync(plistFile, 'utf8');
const re = /(<key>GADApplicationIdentifier<\/key>\s*<string>)([^<]*)(<\/string>)/;
if (!re.test(plist)) fail(`${plistFile} has no GADApplicationIdentifier entry to update.`);
const next = plist.replace(re, `$1${appId}$3`);
if (next !== plist) writeFileSync(plistFile, next);
console.log(
  `[ads] Info.plist GADApplicationIdentifier ${appId} (${test ? `Google's test ids, ${mode} bundle: never archive this for the App Store` : 'release ids'})`,
);
