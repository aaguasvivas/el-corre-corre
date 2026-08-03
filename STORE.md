# App Store listing kit

Everything App Store Connect will ask for, drafted and ready to paste. No em
dashes anywhere. Fill the two TODO decisions before submitting.

## Identity

- **App name** (30 max): `El Corre Corre`
- **Bundle id**: `dev.elcorrecorre.app` (already in the project)
- **SKU suggestion**: `elcorrecorre-ios-v1`
- **Primary category**: Games / Racing. Secondary: Games / Arcade.
- **Price**: Free (no purchases in v1, so no IAP setup needed)

## Subtitle (30 chars max, per locale)

- ES: `La corrida del Malecón` (22)
- EN: `Race down the Malecón` (21)

## Promotional text (170 max, editable without review)

- ES: `Esquiva guaguas, tira caballitos y corre en contra vía por el Malecón. ¿Cuánto aguanta tu récord?` (97)
- EN: `Weave through guaguas, pop wheelies, and ride against traffic down the Malecón. How long can your record last?` (110)

## Description, ES

```
Tú en un motor, el Malecón de Santo Domingo al atardecer, y el corre corre de
siempre: guaguas, carros públicos, camiones de plátanos y motoconchos por
todos lados.

Esquiva el tráfico con el dedo. El manejo es libre, sin carriles: tú carveas
por donde quepas. Tira un caballito pa' saltar los hoyos, agarra plátanos,
y si te atreves, métete en contra vía: todos los puntos x2 mientras los
carros te pasan pitando.

La cinta con tu récord te espera en la carretera. Rómpela y sigue, que cada
metro después es territorio nuevo.

EL RECORRIDO
El Malecón, La Zona Colonial y El Campo. La corrida da la vuelta al país y
nunca se detiene.

LOS MOTORES
La Pasola, chiquita pero cumplidora. El Motor, el clásico del barrio. Y el
Civic tuneao, que se oiga.

Dembow de fondo, cerquitas que suman combo, gallinas que se apartan, y un
solo botón que importa: OTRA VEZ.

Sin internet, sin cuentas, sin relajo. Toca y dale.
```

## Description, EN

```
You, a motorbike, the Malecón of Santo Domingo at golden hour, and the daily
rush: guaguas, carros públicos, plantain trucks, and motoconchos everywhere.

Steer with your finger. No lanes, no snapping: you carve through whatever
gap you fit. Pop a wheelie over potholes, collect plantains, and if you
dare, ride against traffic: every point counts double while cars scream
past.

A finish tape with your record waits down the road. Burst through it and
keep going. Every meter after is new territory.

THE TOUR
The Malecón, the Colonial Zone, and the countryside. The run circles the
country and never stops.

THE RIDES
La Pasola, small but mighty. El Motor, the neighborhood classic. And the
Civic tuneao, loud on purpose.

Dembow in your ears, near misses that build your combo, chickens that
scatter, and the only button that matters: AGAIN.

No internet, no accounts, no fuss. Tap and go.
```

## Keywords (100 chars max, no spaces after commas)

- ES: `dominicana,malecon,motoconcho,carrera,moto,dembow,platano,guagua,arcade,runner` (79)
- EN: `dominican,malecon,motorbike,racing,runner,arcade,dembow,plantain,santo domingo` (79)

## Ratings questionnaire

Expect **9+** for Infrequent/Mild Cartoon or Fantasy Violence (comedic crash
tumbles, stars, no people or animals ever hit). Everything else: None.

## Privacy

The game makes zero network requests and collects nothing. Privacy label:
**Data Not Collected** (the Anota answer, and it is true here too).

Pages live in `site/` (bilingual, game palette), following the Anota
GitHub Pages pattern:

- Privacy policy URL: `https://aaguasvivas.github.io/el-corre-corre-site/privacy.html`
- Support / marketing URL: `https://aaguasvivas.github.io/el-corre-corre-site/`

Publishing step: create the public `el-corre-corre-site` repo, push
`site/`, enable Pages (needs Adelson's go, then it is one command).

## Screenshots (I generate these when you say go)

Required: 6.9" (iPhone 17 Pro Max) and 6.5" sets, portrait. Plan, one per
beat: title card, contra vía with the x2 pill, caballito over a hoyo, La
Zona Colonial, El Campo with gallinas, game over card with COMPARTIR.

## TODO decisions (yours)

1. Say go on publishing the `el-corre-corre-site` repo (URLs above), or
   name a domain if you want the Capi treatment instead.
