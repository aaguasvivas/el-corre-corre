#!/usr/bin/env python3
"""Builds docs/release-1.0-checklist.html, the step-by-step release page.

Every long paste value comes straight from STORE.md and RELEASE.md, so the
page never drifts from the runbook. Run after editing either file:

    python3 tools/build-release-checklist.py
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORE = (ROOT / "STORE.md").read_text()
RELEASE = (ROOT / "RELEASE.md").read_text()
OUT = ROOT / "docs" / "release-1.0-checklist.html"


def section(text, heading):
    start = text.index(heading)
    nxt = text.find("\n## ", start + len(heading))
    nxt3 = text.find("\n### ", start + len(heading))
    ends = [e for e in (nxt, nxt3) if e != -1]
    return text[start:min(ends) if ends else len(text)]


def fence(block):
    m = re.search(r"```[a-z]*\n(.*?)\n```", block, re.S)
    if not m:
        raise SystemExit("no code block found")
    return m.group(1)


def tick(block, label):
    m = re.search(r"- " + label + r": `([^`]+)`", block)
    if not m:
        raise SystemExit(f"value {label} not found")
    return m.group(1)


desc_es = fence(section(STORE, "## Description, ES"))
desc_en = fence(section(STORE, "## Description, EN"))
promo = section(STORE, "## Promotional text")
promo_es, promo_en = tick(promo, "ES"), tick(promo, "EN")
sub = section(STORE, "## Subtitle")
sub_es, sub_en = tick(sub, "ES"), tick(sub, "EN")
kw = section(STORE, "## Keywords")
kw_es, kw_en = tick(kw, "ES"), tick(kw, "EN")

wtt = section(RELEASE, "### What to Test, build 11")
wtt_blocks = re.findall(r"```\n(.*?)\n```", wtt, re.S)
wtt_es, wtt_en = wtt_blocks[0], wtt_blocks[1]
review_note = fence(section(RELEASE, "### App Review note"))
iap = section(RELEASE, "## In-app purchase: Remove Ads")
iap_notes = re.search(r"Review Notes:\n\s+`([^`]+)`", iap).group(1)

privacy_rows = []
answers = section(RELEASE, "## App Privacy answers")
table = answers[answers.index("| Data type | Collected by"):]
for line in table.splitlines()[2:]:
    if not line.startswith("|"):
        break
    cells = [c.strip().replace("**", "") for c in line.strip("|").split("|")]
    privacy_rows.append(cells)

PRIVACY_URL = "https://aaguasvivas.github.io/el-corre-corre-site/privacy.html"
SITE_URL = "https://aaguasvivas.github.io/el-corre-corre-site/"
ARCHIVE = "~/Desktop/personal/el-corre-corre/ios/App/build-archive/App11.xcarchive"
SHOTS = "~/Desktop/personal/el-corre-corre/docs/store/screenshots"
IAP_SHOT = "~/Desktop/personal/el-corre-corre/docs/store/iap-review/remove-ads-es-iphone69.png"


def esc(s):
    return html.escape(s, quote=True)


def copyrow(label, value, big=False):
    cls = "val big" if big else "val"
    return (f'<div class="copyrow"><span class="clabel">{esc(label)}</span>'
            f'<div class="{cls}"><pre>{esc(value)}</pre>'
            f'<button type="button" class="cbtn" data-copy="{esc(value)}">Copy</button></div></div>')


def mini(value):
    return f'<code>{esc(value)}</code> <button type="button" class="mini" data-copy="{esc(value)}">Copy</button>'


steps = []  # (part, id, title, where, body_html, done)


def step(part, sid, title, where, body, done):
    steps.append((part, sid, title, where, body, done))


P1 = ("Accounts and AdMob", "Do these first. Step 4 is the only thing that blocks build 11.")
P2 = ("Build 11 to TestFlight", "Claude builds and checks the archive; you upload it.")
P3 = ("Test on your iPhone", "On build 11 from TestFlight. If anything fails, stop and send Claude a screenshot.")
P4 = ("App Store Connect: version 1.0", "Locale menu at the top of each page: Spanish (Mexico) first, then English (U.S.).")
P5 = ("After approval", "Once the app is live on the App Store.")

step(P1, "agree", "Check your Apple agreements",
     "developer.apple.com/account, then App Store Connect &gt; Business",
     "<p>Sign in as the Account Holder. If an updated Apple Developer Program License Agreement waits (Apple posted one on October 13), accept it. In Business, the Paid Apps agreement should already be Active from Capi; confirm it and accept anything marked pending. Without Paid Apps, Remove Ads cannot be bought, even in TestFlight.</p>",
     "No agreement waits for you, and Paid Apps says Active.")

step(P1, "admob-app", "Add El Corre Corre to AdMob",
     "AdMob &gt; Apps &gt; Add app",
     "<p>Platform: <strong>iOS</strong>. When AdMob asks if the app is listed on a supported app store, answer <strong>No</strong>: it is not live yet, and you link it after approval (step 26). App name:</p>"
     + copyrow("App name", "El Corre Corre")
     + "<p>Then open the new app &gt; Blocking controls &gt; Ad content rating: turn off <q>Match account-level setting</q> and choose <strong>PG</strong>. The game already asks Google for PG ads only, which fits the expected 9+ rating.</p>",
     "El Corre Corre is listed in AdMob with ad content rating PG.")

step(P1, "admob-units", "Create the two ad units",
     "AdMob &gt; Apps &gt; El Corre Corre &gt; Ad units &gt; Add ad unit",
     "<p>First a <strong>Banner</strong> unit (it serves the anchored adaptive banner on the pause screen and Los Mandaos). Leave the advanced settings as they are.</p>"
     + copyrow("Banner unit name", "Banner pausa y mandaos")
     + "<p>Then a <strong>Rewarded</strong> unit. Reward amount <strong>1</strong>, reward item below. The game ignores these two values: it doubles the run’s plátanos by itself.</p>"
     + copyrow("Rewarded unit name", "Rewarded duplica platanos")
     + copyrow("Reward item", "platanos"),
     "The app shows two ad units: one Banner, one Rewarded.")

step(P1, "admob-send", "Send Claude the three AdMob ids",
     "AdMob &gt; Apps &gt; El Corre Corre &gt; App settings, then each ad unit",
     "<p>App settings shows the <strong>App ID</strong>, shaped <code>ca-app-pub-4879291425090726~0000000000</code> (with a <strong>~</strong>). Each ad unit shows its <strong>ad unit ID</strong>, shaped <code>ca-app-pub-4879291425090726/0000000000</code> (with a <strong>/</strong>). Paste all three in the chat with Claude, labeled app, banner and rewarded. Claude puts them in <code>src/adIds.ts</code>; the release build refuses to run until they are there, so test ads can never ship.</p>",
     "Claude confirms the ids are in and the release build passes.")

step(P1, "admob-privacy", "Publish the consent messages",
     "AdMob &gt; Privacy &amp; messaging",
     "<p><strong>European regulations (GDPR)</strong>: create a message for El Corre Corre, languages Spanish and English, and press <strong>Publish</strong>. <strong>IDFA explainer</strong>: create one for El Corre Corre and press <strong>Publish</strong>. A US state regulations message is optional. Unpublished messages never show: players in the EU and UK would then get no ads.</p>",
     "Both messages show Published for El Corre Corre.")

iap_table = (
    '<div class="tablewrap"><table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>'
    f'<tr><td>Type</td><td>Non-Consumable</td></tr>'
    f'<tr><td>Reference Name</td><td>{mini("Remove Ads")}</td></tr>'
    f'<tr><td>Product ID</td><td>{mini("elcorrecorre.remove_ads")}<br><span class="sub">Permanent: it can never be changed or reused. A different id means Claude changes it in the code first.</span></td></tr>'
    f'<tr><td>Price</td><td>USD 1.99 (Apple fills the other storefronts)</td></tr>'
    f'<tr><td>Spanish (Mexico)</td><td>{mini("Quitar anuncios")}<br>{mini("Quita los banners de la pausa y Los Mandaos.")}</td></tr>'
    f'<tr><td>English (U.S.)</td><td>{mini("Remove Ads")}<br>{mini("Removes the banners on pause and missions.")}</td></tr>'
    f'<tr><td>Review screenshot</td><td><code>{esc(IAP_SHOT)}</code></td></tr>'
    '</tbody></table></div>')
step(P1, "iap", "Create the Remove Ads purchase",
     "App Store Connect &gt; Apps &gt; El Corre Corre &gt; Monetization &gt; In-App Purchases &gt; (+)",
     "<p>Create it, then on its page: Availability &gt; all countries and regions &gt; Save. Price Schedule &gt; USD 1.99 &gt; Save. App Store Localization &gt; add both languages &gt; Save each. Review Information &gt; the screenshot and the notes &gt; Save. Tax category: leave the default. Family Sharing: your call (it cannot be turned off once on).</p>"
     + iap_table + copyrow("Review Notes", iap_notes, big=True),
     "Remove Ads shows Ready to Submit. It goes out together with version 1.0.")

step(P2, "build", "Claude archives build 11",
     "Chat with Claude",
     "<p>After step 4, tell Claude <q>archive build 11</q>. Claude runs the release build, checks the archive (build number 11, your real AdMob app id, the 50 ad network ids, the 5 privacy manifests, and the web bundle) and opens it in the Xcode Organizer.</p>",
     "Claude reports the archive checks passed, and Organizer shows El Corre Corre 1.0 (11).")

step(P2, "upload", "Upload build 11",
     "Xcode &gt; Window &gt; Organizer &gt; Archives",
     "<p>If Organizer did not open, run this in Terminal:</p>"
     + copyrow("Terminal", f"open {ARCHIVE}")
     + "<p>Select El Corre Corre 1.0 (11) &gt; <strong>Distribute App</strong> &gt; App Store Connect &gt; Upload, keep the defaults. Wait for Apple’s <q>completed processing</q> email. Then search your email for <q>ITMS-91053</q> and <q>ITMS-91061</q>: any hit, stop and send it to Claude.</p>",
     "Build 11 shows under TestFlight &gt; iOS Builds, with no ITMS warning email.")

step(P2, "testflight", "Set up TestFlight for build 11",
     "App Store Connect &gt; TestFlight &gt; iOS Builds &gt; 11 &gt; Test Details",
     copyrow("What to Test, Spanish", wtt_es, big=True)
     + copyrow("What to Test, English", wtt_en, big=True)
     + "<p>Save. Then the Familia group &gt; Builds: if build 11 is not listed, (+) &gt; build 11 &gt; Submit for Review.</p>",
     "Build 11 is available to you and to Familia.")

step(P3, "t-first", "First launch: the tracking prompt",
     "Your iPhone, TestFlight &gt; El Corre Corre",
     "<p>Delete El Corre Corre, install build 11 from TestFlight, and open it. About a second after the title appears, the iOS tracking prompt shows over the title (after Google’s message, if your region gets one). It never opens during a run. Tap <q>Ask App Not to Track</q>: ads still work, just not personalized.</p>",
     "The prompt showed once, over the title screen.")

step(P3, "t-ads", "Ads where they belong",
     "In the game",
     "<p>Pause a run: a banner sits at the bottom with every control clear above it. Open MANDAOS on the title: banner there too. The title, the run, the crash and the game-over card have no banner. Collect plátanos and crash: the <strong>×2 ANUNCIO</strong> button appears on the plátanos row about a second after the card lands. Watch the video to the end: the plátanos double once and the music comes back. Close one early on another run: nothing is added. Tap the AdChoices icon on an ad and note what it offers.</p>",
     "Banner only on pause and Los Mandaos; the video doubles plátanos once.")

step(P3, "t-buy", "Buy and restore Remove Ads",
     "Title screen &gt; AD button under the sound button",
     "<p>The sheet shows the App Store price. Buy it (TestFlight purchases charge nothing): <q>¡Listo! Se fueron los banners.</q> The pause banner is gone at once, the AD button disappears, and the ×2 video still works. Delete the app, reinstall from TestFlight, open the sheet from PAUSA &gt; Quitar anuncios, tap <strong>Restaurar compras</strong>: <q>Compra restaurada</q>, and the banners stay gone.</p>",
     "Bought, banners gone, restored after a reinstall.")

step(P3, "t-offline", "Offline still plays",
     "Control Center &gt; Airplane mode",
     "<p>Turn on Airplane mode, close the app fully, and open it. No ×2 button, no banner, no error, and the game plays as before. Turn Airplane mode off.</p>",
     "A full run works in Airplane mode.")

step(P3, "t-share", "Share and saves",
     "Game-over card &gt; COMPARTIR",
     "<p>Share a card to WhatsApp and to Messages, then <q>Guardar imagen</q>: the Spanish photo prompt shows and the card lands in Fotos. Then play 2 runs, buy a pintura, force-quit the app, and reopen: plátanos, the pintura, your records and Remove Ads are all still there.</p>",
     "Shares work, and nothing is lost after a force-quit.")

step(P3, "t-feel", "Pedals, sound and calls",
     "In the game",
     "<p>Swipe up from the FRENO and ¡DALE! area: the first swipe only shows the home bar. Sound starts after the first tap; you feel taps on near-misses, pickups and crashes. Take a phone call mid-run: the game pauses, and the 3, 2, 1 countdown resumes it.</p>",
     "Pedals, sound, haptics and pause all behave.")

age_list = ("<ul class='plain'>"
            "<li>In-App Controls: Parental Controls <strong>No</strong>, Age Assurance <strong>No</strong></li>"
            "<li>Capabilities: Unrestricted Web Access No, User-Generated Content No, Social Media No, Messaging and Chat No, <strong>Advertising Yes</strong></li>"
            "<li>Violence: Cartoon or Fantasy Violence <strong>Infrequent</strong> (comedic crash tumbles; people and animals are never hit). Realistic Violence, Guns or Other Weapons: None</li>"
            "<li>Chance-Based Activities: Gambling No, Simulated Gambling None (the BANCA DE LOTERÍA sign is scenery), Loot Boxes No</li>"
            "<li>Contests: your call. Apple counts personal goals, which Los Mandaos are. None and Infrequent both keep 9+; Frequent would make it 13+</li>"
            "<li>Everything else: None or No. On the last screen keep <q>Not Applicable</q>, never Made for Kids</li></ul>")

step(P4, "info", "App Information",
     "App Store Connect &gt; El Corre Corre &gt; App Information",
     "<p>Name: El Corre Corre. Category: Games &gt; Racing, secondary Games &gt; Arcade. Content Rights: no third-party content.</p>"
     + copyrow("Subtitle, Spanish (Mexico)", sub_es)
     + copyrow("Subtitle, English (U.S.)", sub_en)
     + copyrow("Privacy Policy URL (both languages)", PRIVACY_URL),
     "Both languages saved.")

step(P4, "age", "Age Rating",
     "App Information &gt; Age Ratings &gt; Edit",
     age_list + "<p>Advertising does not raise the rating. Expected result: <strong>9+</strong>. Tell Claude the rating you get so the runbook records it (if it comes out 4+, Claude lowers the ad cap from PG to G).</p>",
     "The rating shows 9+.")

step(P4, "pricing", "Pricing and Availability",
     "App Store Connect &gt; El Corre Corre &gt; Pricing and Availability",
     "<p>Price: <strong>Free</strong>. Availability: all countries and regions. Save.</p>",
     "Free, everywhere.")

priv_table = ('<div class="tablewrap"><table><thead><tr><th>Data type</th><th>Linked</th><th>Tracking</th><th>Purposes</th></tr></thead><tbody>'
              + "".join(f"<tr><td>{esc(r[0])}</td><td>{esc(r[2])}</td><td>{esc(r[3])}</td><td>{esc(r[4])}</td></tr>" for r in privacy_rows)
              + "</tbody></table></div>")
step(P4, "privacy", "App Privacy, then Publish",
     "App Store Connect &gt; El Corre Corre &gt; App Privacy &gt; Edit",
     "<p>Answer <strong>Yes</strong>, you or your partners collect data (Google’s ads SDK does). Tick exactly these seven types; leave everything else unticked, Purchases included (Apple handles the payment).</p>"
     + priv_table + copyrow("Privacy Policy URL", PRIVACY_URL)
     + "<p class='warn'>Press <strong>Publish</strong> at the top of the App Privacy page. Until then the answers stay a draft and the store keeps showing <q>Data Not Collected</q>.</p>",
     "The label reads: Data Used to Track You: Identifiers. Linked: Location, Identifiers, Usage Data. Not Linked: Diagnostics.")

step(P4, "dsa", "Digital Services Act status",
     "App Store Connect &gt; Business &gt; Digital Services Act",
     "<p>This is set once for your account. If you already declared it for Anota and Capi, it covers El Corre Corre: check that it shows as complete. If not, choose trader or non-trader. Without it the app is not offered in EU storefronts.</p>",
     "The status is complete.")

step(P4, "version-text", "Version 1.0 text and screenshots",
     "App Store Connect &gt; El Corre Corre &gt; iOS App 1.0",
     "<p>Screenshots: drag in the 8 PNGs from the folder below, in file order: <code>store-gas-cv</code>, <code>store-leyenda</code>, <code>store-puerta</code>, <code>tramo-campo</code>, <code>crash</code>, <code>gameover-levelup</code>, <code>store-record</code>, <code>title-rich</code>. Spanish uses <code>/es</code>, English uses <code>/en</code>. All 16 are 1320x2868 with no alpha.</p>"
     + copyrow("Screenshots folder", SHOTS)
     + copyrow("Promotional Text, Spanish", promo_es)
     + copyrow("Description, Spanish", desc_es, big=True)
     + copyrow("Keywords, Spanish", kw_es)
     + copyrow("Promotional Text, English", promo_en)
     + copyrow("Description, English", desc_en, big=True)
     + copyrow("Keywords, English", kw_en)
     + copyrow("Support URL", SITE_URL)
     + copyrow("Marketing URL", SITE_URL),
     "Both languages saved with 8 screenshots each.")

step(P4, "version-build", "Copyright, build 11 and the purchase",
     "Same page, further down",
     copyrow("Copyright", "2026 Adelson Aguasvivas")
     + "<p>Build &gt; (+) &gt; <strong>build 11</strong> (never 9 or 10) &gt; Done. In-App Purchases and Subscriptions &gt; (+) &gt; Remove Ads &gt; Done. Save at the top right.</p>",
     "The version page lists build 11 and Remove Ads.")

step(P4, "review-info", "App Review Information",
     "Same page &gt; App Review Information",
     "<p>Sign-in required: off. Contact: your name, phone in international form (+1 and the number) and email.</p>"
     + copyrow("Notes", review_note, big=True),
     "Saved, with the notes pasted.")

step(P4, "release-mode", "Version Release",
     "Same page &gt; Version Release",
     "<p>Your call: <strong>Manually release this version</strong> lets you pick launch day after approval; <strong>Automatically</strong> releases it as soon as Apple approves. Save.</p>",
     "One option chosen and saved.")

step(P4, "submit", "Submit for review",
     "Same page &gt; Add for Review &gt; Submit to App Review",
     "<p>The submission carries version 1.0 and Remove Ads together. Review usually takes 1 to 3 days. Until approval, leave the AdMob app, its two units and its consent messages as they are, and send Claude any message from App Review.</p>",
     "Status reads Waiting for Review.")

step(P5, "link-admob", "Link AdMob to the live listing",
     "AdMob &gt; Apps &gt; El Corre Corre &gt; App settings &gt; App store details",
     "<p>Choose <strong>Add</strong> (or Link), search for El Corre Corre on the App Store, and confirm. AdMob then checks your app-ads.txt, which is already live at <code>aaguasvivas.github.io/app-ads.txt</code>. Verification can take a day.</p>",
     "AdMob shows the app linked, and app-ads.txt as verified.")

step(P5, "expire9", "Retire build 9 (optional)",
     "App Store Connect &gt; TestFlight &gt; iOS Builds &gt; 9",
     "<p>After Erickson has build 11: Expire Build. It cannot be undone.</p>",
     "Build 9 shows Expired.")

DONE_ITEMS = [
    "Ads, Remove Ads and Capacitor 8 built and tested on the simulator (163 tests, all probes pass)",
    "Main pushed to GitHub (<code>a63f87d</code>)",
    "Privacy page for 1.0 live: ads, tracking, consent, the purchase (checked against the repo on 2026-10-20)",
    "app-ads.txt already live on aaguasvivas.github.io, the same file Anota uses",
    "16 App Store screenshots (ES and EN) and the Remove Ads review screenshot, all 1320x2868 with no alpha",
    "Store text, App Privacy answers, age rating answers and the review note, all below and ready to copy",
]

# -------------------------------------------------------------- page
parts = []
seen = []
for p in steps:
    if p[0] not in seen:
        seen.append(p[0])
n = 0
for part in seen:
    items = []
    for (pp, sid, title, where, body, done) in steps:
        if pp != part:
            continue
        n += 1
        items.append(
            f'<li class="step" id="s-{sid}"><label class="check"><input type="checkbox" id="c-{sid}" data-step="{sid}">'
            f'<span class="box" aria-hidden="true"></span><span class="stitle"><span class="snum">{n}</span>{esc(title)}</span></label>'
            f'<div class="sbody"><p class="where">{where}</p>{body}<p class="done">Done when: {done}</p></div></li>')
    parts.append(f'<section class="part"><h2>{esc(part[0])}</h2><p class="psub">{esc(part[1])}</p><ol class="steps">{"".join(items)}</ol></section>')
TOTAL = n

page = f'''<title>El Corre Corre 1.0 Submission</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: one reading column under a sticky progress bar; each step is a checkable card with its console path, values to copy and a done-when line. Colors come from the game: flag navy and red, sea teal for done, golden-hour sand. */
:root {{
  --bg: #fbf3e4; --panel: #fffdf8; --ink: #10233f; --muted: #5b6474; --line: #e7dcc7;
  --red: #ce1126; --done: #0e7490; --done-soft: #e1f0f3; --path: #7a5600; --warn-bg: #fff0c2;
  --display: "Lilita One", "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif;
  --body: "Atkinson Hyperlegible", -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #0d1828; --panel: #152338; --ink: #f2ead9; --muted: #a9b3c4; --line: #273a57;
  --red: #ff6b7d; --done: #5cc8dc; --done-soft: #12313d; --path: #f4c430; --warn-bg: #3a3014; color-scheme: dark }} }}
:root[data-theme="dark"] {{
  --bg: #0d1828; --panel: #152338; --ink: #f2ead9; --muted: #a9b3c4; --line: #273a57;
  --red: #ff6b7d; --done: #5cc8dc; --done-soft: #12313d; --path: #f4c430; --warn-bg: #3a3014; color-scheme: dark }}
* {{ box-sizing: border-box }}
body {{ background: var(--bg); color: var(--ink); font: 16px/1.55 var(--body); }}
.wrap {{ max-width: 860px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 64px; }}
header .kicker {{ font: 700 .8rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--red); margin: 0 0 6px }}
header h1 {{ font: 400 clamp(2rem, 6vw, 3rem)/1.02 var(--display); font-style: italic; letter-spacing: .01em; margin: 0 0 12px; text-wrap: balance }}
.meta {{ color: var(--muted); margin: 0 0 4px; max-width: 68ch }}
code {{ font-family: var(--mono); font-size: .86em; overflow-wrap: anywhere }}
.donebox {{ background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; margin: 18px 0 0 }}
.donebox h2 {{ font: 700 .8rem var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--done); margin: 0 0 6px }}
.donebox ul {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 4px }}
.donebox li {{ display: flex; gap: 10px; align-items: baseline }}
.donebox li::before {{ content: "\\2713"; color: var(--done); font-weight: 700 }}
.bar {{ position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); padding: 12px 0; margin: 16px 0 8px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 12px; flex-wrap: wrap }}
.track {{ flex: 1 1 200px; height: 10px; border-radius: 99px; background: var(--line); overflow: hidden }}
.fill {{ height: 100%; width: 0; background: var(--done); transition: width .25s }}
.count {{ font: 600 .9rem var(--mono); font-variant-numeric: tabular-nums; color: var(--muted) }}
.reset {{ font: inherit; font-size: .85rem; background: none; border: 1px solid var(--line); color: var(--muted); border-radius: 8px; padding: 6px 10px; cursor: pointer; min-height: 36px }}
.part h2 {{ font: 400 1.5rem/1.15 var(--display); letter-spacing: .02em; margin: 34px 0 4px; text-wrap: balance }}
.psub {{ color: var(--muted); margin: 0 0 12px }}
.steps {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 12px }}
.step {{ background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; min-width: 0 }}
.step.is-done {{ border-color: var(--done); background: var(--done-soft) }}
.check {{ display: flex; align-items: flex-start; gap: 12px; cursor: pointer }}
.check input {{ position: absolute; opacity: 0; width: 1px; height: 1px }}
.box {{ flex: 0 0 26px; height: 26px; border: 2px solid var(--muted); border-radius: 7px; display: grid; place-items: center; margin-top: 1px }}
.check input:checked + .box {{ background: var(--done); border-color: var(--done) }}
.check input:checked + .box::after {{ content: ""; width: 7px; height: 13px; border: solid var(--panel); border-width: 0 3px 3px 0; transform: rotate(45deg) translate(-1px,-1px) }}
.check input:focus-visible + .box {{ outline: 3px solid var(--path); outline-offset: 2px }}
.stitle {{ font: 700 1.06rem/1.35 var(--body); display: flex; gap: 10px; align-items: baseline }}
.snum {{ font: 600 .85rem var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; min-width: 1.6em }}
.sbody {{ margin: 8px 0 0 38px; min-width: 0 }}
.step.is-done .sbody {{ display: none }}
.sbody p {{ margin: 6px 0; max-width: 68ch }}
.where {{ font: 600 .82rem var(--mono); color: var(--path); overflow-wrap: anywhere }}
.done {{ font-size: .92rem; color: var(--done); font-weight: 700 }}
.warn {{ background: var(--warn-bg); border-radius: 8px; padding: 8px 10px }}
ul.plain {{ margin: 6px 0; padding-left: 20px; max-width: 68ch }}
ul.plain li {{ margin: 3px 0 }}
q {{ quotes: "\\201C" "\\201D" }}
.copyrow {{ margin: 10px 0; min-width: 0 }}
.clabel {{ display: block; font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 4px }}
.val {{ display: flex; gap: 8px; align-items: flex-start; min-width: 0 }}
.val pre {{ flex: 1; min-width: 0; margin: 0; font: .85rem/1.5 var(--mono); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; overflow-wrap: anywhere }}
.val.big pre {{ max-height: 11.5em; overflow: auto }}
.cbtn, .mini {{ font: 700 .85rem var(--body); background: var(--ink); color: var(--bg); border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; min-height: 36px }}
.mini {{ padding: 2px 8px; min-height: 26px; font-size: .75rem; margin-left: 4px }}
.cbtn.ok, .mini.ok {{ background: var(--done) }}
.cbtn:focus-visible, .mini:focus-visible, .reset:focus-visible {{ outline: 3px solid var(--path); outline-offset: 2px }}
.tablewrap {{ overflow-x: auto; margin: 8px 0 }}
table {{ border-collapse: collapse; font-size: .88rem; min-width: 560px }}
th, td {{ text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top }}
th {{ font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted) }}
.sub {{ color: var(--muted); font-size: .85rem }}
@media (max-width: 480px) {{ .sbody {{ margin-left: 0 }} .val {{ flex-direction: column }} .cbtn {{ align-self: flex-end }} }}
@media (prefers-reduced-motion: reduce) {{ .fill {{ transition: none }} }}
</style>
<div class="wrap">
<header>
  <p class="kicker">App Store release</p>
  <h1>El Corre Corre 1.0, step by step</h1>
  <p class="meta">Build to submit: <strong>1.0 (11)</strong>, with ads and Remove Ads &middot; bundle <code>dev.elcorrecorre.app</code> &middot; team <code>JQ39X3L553</code></p>
  <p class="meta">Builds 9 and 10 are superseded: never select them. Every value to paste comes from <code>STORE.md</code> and <code>RELEASE.md</code> in the repo. Your ticks stay in this browser.</p>
  <div class="donebox"><h2>Already done</h2><ul>{"".join(f"<li><span>{d}</span></li>" for d in DONE_ITEMS)}</ul></div>
</header>
<div class="bar" role="status"><div class="track"><div class="fill" id="fill"></div></div><span class="count" id="count">0 of {TOTAL}</span><button type="button" class="reset" id="reset">Clear checks</button></div>
{"".join(parts)}
</div>
<script>
(function () {{
  var KEY = "ecc-10-release-v1";
  var boxes = Array.prototype.slice.call(document.querySelectorAll("input[data-step]"));
  var state = {{}};
  try {{ state = JSON.parse(localStorage.getItem(KEY) || "{{}}") || {{}}; }} catch (e) {{ state = {{}}; }}
  function save() {{ try {{ localStorage.setItem(KEY, JSON.stringify(state)); }} catch (e) {{}} }}
  function paint() {{
    var done = 0;
    boxes.forEach(function (b) {{
      var on = !!state[b.dataset.step]; b.checked = on;
      b.closest(".step").classList.toggle("is-done", on); if (on) done++;
    }});
    document.getElementById("count").textContent = done + " of " + boxes.length;
    document.getElementById("fill").style.width = (100 * done / boxes.length) + "%";
  }}
  boxes.forEach(function (b) {{ b.addEventListener("change", function () {{ state[b.dataset.step] = b.checked; save(); paint(); }}); }});
  var reset = document.getElementById("reset"), armed = false;
  reset.addEventListener("click", function () {{
    if (!armed) {{ armed = true; reset.textContent = "Tap again to clear"; setTimeout(function () {{ armed = false; reset.textContent = "Clear checks"; }}, 3000); return; }}
    state = {{}}; save(); paint(); armed = false; reset.textContent = "Clear checks";
  }});
  document.addEventListener("click", function (ev) {{
    var btn = ev.target.closest("[data-copy]"); if (!btn) return;
    var text = btn.getAttribute("data-copy");
    function ok() {{ var t = btn.textContent; btn.textContent = "Copied"; btn.classList.add("ok"); setTimeout(function () {{ btn.textContent = t; btn.classList.remove("ok"); }}, 1400); }}
    function fallback() {{
      var pre = btn.parentElement && btn.parentElement.querySelector("pre");
      if (pre) {{ var r = document.createRange(); r.selectNodeContents(pre); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Selected: press Cmd+C"; }}
    }}
    if (navigator.clipboard && navigator.clipboard.writeText) {{ navigator.clipboard.writeText(text).then(ok, fallback); }} else {{ fallback(); }}
  }});
  paint();
}})();
</script>
'''
OUT.write_text(page)
print(f"wrote {OUT} ({TOTAL} steps, {len(page):,} bytes)")
