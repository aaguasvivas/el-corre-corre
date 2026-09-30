# App Store listing kit

Everything App Store Connect asks for, drafted and ready to paste, for
version 1.0 with build 10. No em dashes anywhere. Character counts are
recomputed for this text, counted as Unicode characters. The console steps that use this file are in
[RELEASE.md](RELEASE.md).

## Identity

- **App name** (30 max): `El Corre Corre`
- **Bundle id**: `dev.elcorrecorre.app`
- **SKU**: `elcorrecorre-ios-v1`
- **Primary category**: Games > Racing. Secondary: Games > Arcade.
- **Price**: Free. No in-app purchases: pinturas cost plátanos earned in the
  game, never money.

## Subtitle (30 max, per locale)

- ES: `La corrida del Malecón` (22)
- EN: `Race down the Malecón` (21)

## Promotional text (170 max, editable without review)

- ES: `Dale al pedal, métete en contra vía y cumple los mandaos del barrio. ¿Hasta dónde llega tu récord por el Malecón?` (113)
- EN: `Hold the gas, ride against traffic, and finish missions for the barrio. How far down the Malecón can your record go?` (116)

## Description, ES (4000 max; this one is 1463)

```
Tú en un motor, el Malecón de Santo Domingo al atardecer, y el corre corre de siempre: guaguas, carros públicos, camiones de plátanos y motoconchos por todos lados.

Esquiva con un dedo, sin carriles: pasas por donde quepas. Con el otro dedo tienes los pedales. ¡DALE! acelera y todos los puntos valen x1.5. El FRENO te saca de un apuro, pero los puntos bajan a la mitad, y si lo aguantas mucho se calienta.

Métete en contra vía y todo paga x2. Pasa cerquita de los carros pa’ subir el combo, tira un caballito sobre los hoyos y agarra plátanos.

LOS MANDAOS
Tres encargos a la vez. Cúmplelos pa’ subir de nivel, de Novato a Leyenda del Malecón, y el multiplicador del barrio sube hasta x3. El mandao del día paga más si lo cumples varios días seguidos.

LOS RÉCORDS
Pasa tu récord de puntos y sale ¡NUEVO RÉCORD! en plena corrida. La cinta de tu mejor distancia te espera en la carretera: rómpela y cada metro después es territorio nuevo. Cada vehículo guarda sus propios récords.

EL RECORRIDO
El Malecón, La Zona Colonial y El Campo, un kilómetro cada uno. Una corrida larga le da la vuelta al país.

LOS MOTORES Y LAS PINTURAS
La Pasola, chiquita pero cumplidora. El Motor, el clásico del barrio. El Civic tuneao, que se oiga. Con tus plátanos compras pinturas nuevas pa’ cada uno.

Dembow de fondo, y cafecito, bendición e imán en la calle. Cuando chocas, OTRA VEZ te pone a correr de nuevo al instante.

Sin internet, sin cuentas, sin compras. Toca y dale.
```

## Description, EN (4000 max; this one is 1444)

```
You, a motorbike, the Malecón of Santo Domingo at golden hour, and the daily rush: guaguas, carros públicos, plantain trucks, and motoconchos everywhere.

Steer with one finger, no lanes: you go through any gap you fit. Your other thumb works the pedals. GAS speeds you up and every point counts x1.5. BRAKE gets you out of trouble, but points drop to half, and if you hold it too long it overheats.

Ride against traffic and everything pays x2. Pass close to cars to build your combo, pop a wheelie over potholes, and grab plantains.

MISSIONS
Three missions at a time. Finish them to level up, from Rookie to Legend of the Malecón, and the barrio multiplier climbs to x3. The daily mission pays more when you complete it several days in a row.

RECORDS
Beat your points record and NEW RECORD! shows mid-run. The tape at your best distance waits down the road: burst through it and every meter after is new territory. Each ride keeps its own records.

THE TOUR
The Malecón, the Colonial Zone, and the countryside, one kilometer each. A long run tours the whole country.

THE RIDES AND PAINT JOBS
La Pasola, small but mighty. El Motor, the neighborhood classic. And the Civic tuneao, loud on purpose. Spend your plantains on new paint jobs for each one.

Dembow in your ears, and cafecito, bendición and imán power-ups on the road. When you crash, AGAIN puts you back on the road right away.

No internet, no accounts, no purchases. Tap and go.
```

Every claim above matches the code at `eb676ef`: gas x1.5 and brake x0.5 on
all points (`gasScoreMult`, `brakeScoreMult`), the brake overheats after
about 2 s (`brakeHeatMaxSec`), contra vía x2, three mandaos per set, seven
level names from Novato to Leyenda del Malecón, the barrio multiplier capped
at x3 (`barrioMultMax`), the daily streak bonus, per-ride points and distance
records, three tramos of 1000 m (`tramoLengthM`), four paints to buy per ride,
and OTRA VEZ live 0.5 s after the crash.

## Keywords (100 max, no spaces after commas)

- ES: `dominicana,malecon,motoconcho,carrera,moto,dembow,platano,guagua,arcade,runner` (78)
- EN: `dominican,malecon,motorbike,racing,runner,arcade,dembow,plantain,santo domingo` (78)

## TestFlight "What to Test"

The build 10 text (ES and EN) is in RELEASE.md > TestFlight.

## Age rating

Apple's current questionnaire asks about in-app controls, capabilities (web
access, user content, messaging, advertising), mature themes, medical or
wellness topics, sexuality or nudity, violence, and chance-based activities.
Answers: Cartoon or Fantasy Violence = Infrequent/Mild (comedic crash
tumbles with stars; people and animals are never hit). Everything else None
or No. The "BANCA DE LOTERÍA" storefront is scenery with no betting, so
Gambling and Simulated Gambling are No. The old estimate was 9+; RELEASE.md
records the rating the questionnaire gives.

## Privacy

The game makes zero network requests and collects nothing. Privacy label:
**Data Not Collected**. The build carries three privacy manifests (the app,
Capacitor and Cordova), and none lists collected data or tracking. The app
manifest declares UserDefaults (CA92.1, the save backup) and file timestamps
(C617.1, the share card file).

Pages live in `site/` (bilingual, game palette) and are published at:

- Privacy policy URL: `https://aaguasvivas.github.io/el-corre-corre-site/privacy.html`
- Support and marketing URL: `https://aaguasvivas.github.io/el-corre-corre-site/`

The pages are live (GitHub Pages repo `el-corre-corre-site`). Changes to
`site/` go live only after a push to that repo, with Adelson's go. Before
build 10 goes to review, the privacy page needs the update in RELEASE.md
"Before build 10", step 5 (pinturas, mandaos, the streak, and sharing).

## Screenshots

Required: one 6.9-inch set per localization (es-MX and en-US), portrait
1320x2868 PNG with no alpha channel, 1 to 10 images. The 6.5-inch set is
required only when no 6.9-inch set exists, so it is not needed. Show the game
in use: at most one title shot.

`tools/shots.mjs` renders the `iphone69` viewport at exactly 1320x2868 with
no alpha.

| # | Shot | Scene in `tools/shots.mjs` |
|---|---|---|
| 1 | A fondo en contra vía: ¡DALE! pressed, the x2 pill, the x1.5 tag, a near-miss popup | `store-gas-cv` (to add; `store-contravia` does not hold the gas) |
| 2 | A near-miss chain up to ¡LEYENDA DEL MALECÓN! | `store-leyenda` (to add; `hud-max` fakes the count) |
| 3 | La Zona with La Puerta del Conde and a caballito | `store-zona` (check that the gate is in frame) |
| 4 | El Campo with the green road sign | `tramo-campo` |
| 5 | The crash with the stars | `crash` |
| 6 | Game over with the mandao stamps and a level up | `gameover-levelup` |
| 7 | Bursting La Cinta with confetti | `store-record` |
| 8 | Title with the ride tabs and the paint tray | `title-rich` |

Capture both locales into the ignored `docs/shots/` folder:

```bash
S=store-gas-cv,store-leyenda,store-zona,tramo-campo,crash,gameover-levelup,store-record,title-rich
sh tools/heavy.sh node tools/shots.mjs --scenes $S --viewports iphone69 --out docs/shots/store/es
sh tools/heavy.sh node tools/shots.mjs --scenes $S --viewports iphone69 --lang en --out docs/shots/store/en
for f in docs/shots/store/*/*.png; do sips -g pixelWidth -g pixelHeight -g hasAlpha "$f"; done
```

Every file must print 1320, 2868 and `hasAlpha: no`. Look at every image
before upload. Headless captures have zero safe-area insets, so the HUD sits
a little higher than on a real 6.9-inch phone; without a device frame that
is acceptable.

## Open decisions (Adelson)

1. The in-app privacy link (RELEASE.md, "Open decisions", options A and B).
2. The Digital Services Act trader or non-trader status for EU storefronts.
