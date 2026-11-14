# Xoriguer On Sóc — guia

Ubicació compartida de la família + botó **SOS**. Tot el que va al servidor va **xifrat** amb el codi de la família
(AES-GCM, clau derivada del codi): el servidor només veu dades sense sentit i no sap ni noms ni llocs.

## 1. Pas imprescindible: obrir `onsoc` a Firebase (una sola vegada)

L'app fa servir la mateixa Realtime Database que la Botifarra i el Dòmino (projecte **botifarra-d71cc**).
Ara mateix les regles hi rebutgen `onsoc` (error 401), així que cal afegir-hi un bloc:

1. https://console.firebase.google.com → projecte **botifarra-d71cc**
2. **Compilación → Realtime Database** → pestanya **Reglas**
3. Dins de `"rules": { ... }`, **al costat** de `rooms`, `domino`, `paraules` (no esborris res), afegeix:

```json
    "onsoc": {
      "$fam": {
        ".read": "$fam.matches(/^[0-9a-f]{24}$/)",
        "m": {
          "$m": {
            ".write": "$fam.matches(/^[0-9a-f]{24}$/) && $m.matches(/^[0-9a-zA-Z]{6,32}$/)",
            ".validate": "newData.hasChildren(['iv', 'd', 't']) && newData.child('d').isString() && newData.child('d').val().length < 4000 && newData.child('t').val() <= now"
          }
        },
        "l": {
          ".write": "$fam.matches(/^[0-9a-f]{24}$/)",
          ".validate": "newData.hasChildren(['iv', 'd', 't']) && newData.child('d').isString() && newData.child('d').val().length < 30000 && newData.child('t').val() <= now"
        },
        "e": {
          "$e": {
            ".write": "$fam.matches(/^[0-9a-f]{24}$/)",
            ".validate": "newData.hasChildren(['iv', 'd', 't']) && newData.child('d').isString() && newData.child('d').val().length < 2000 && newData.child('t').val() <= now"
          }
        },
        "p": {
          ".write": "$fam.matches(/^[0-9a-f]{24}$/)",
          ".validate": "newData.hasChildren(['iv', 'd', 't']) && newData.child('d').isString() && newData.child('d').val().length < 2000 && newData.child('t').val() <= now"
        },
        "h": {
          "$m": {
            ".write": "$fam.matches(/^[0-9a-f]{24}$/) && !newData.exists()",
            "$dia": {
              ".write": "$fam.matches(/^[0-9a-f]{24}$/) && !newData.exists()",
              "$p": {
                ".write": "$fam.matches(/^[0-9a-f]{24}$/) && $dia.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)",
                ".validate": "newData.hasChildren(['iv', 'd', 't']) && newData.child('d').isString() && newData.child('d').val().length < 600 && newData.child('t').val() <= now"
              }
            }
          }
        }
      }
    }
```

(recorda la coma entre aquest bloc i l'anterior) → **Publicar**.

Què fan: només es pot llegir una família si ja se'n sap l'identificador (no es pot llistar `onsoc` sencer),
només s'hi poden escriure dades xifrades petites, i el recorregut només es pot afegir o esborrar (no reescriure).
`m` = membres, `l` = llocs, `e` = avisos (7 dies), `h` = recorregut (7 dies), `p` = enllaç temporal per a algú de fora
(va en una «família» pròpia amb id aleatori i clau pròpia, que només és a l'enllaç).

## 2. Android

`XoriguerOnSoc.apk` (a l'arrel del projecte). Passa'l al mòbil i instal·la'l
(Play Protect: «Més detalls → Instal·la igualment»).

Primer cop:
- **Ubicació → «Permet sempre»** (o «Mentre s'usa l'app»). Mentre comparteix, surt un avís fix a la barra: és el que
  deixa enviar la ubicació amb l'app tancada.
- **Bateria → Sense restriccions** (Configuració → Aplicacions → On Sóc → Bateria). Xiaomi/Huawei/Samsung tanquen
  apps si no.
- **Avisos**: permet-los (pestanya Família → Permet) per rebre l'avís d'SOS.
- **ntfy** (recomanat a tothom): instal·la l'app gratuïta ntfy i subscriu-te al tema de la família
  (pestanya Família → «obre'l a ntfy»). Així els avisos arriben encara que On Sóc estigui tancada.
- **Botó SOS a la persiana**: persiana → llapis ✎ → arrossega «SOS On Sóc». O mantén premuda la icona → SOS.

## Què fa (1.1)

| Funció | Com |
|---|---|
| Mapa de la família | Posició, «fa X min», bateria, «a Casa», ruta i trucar |
| **Llocs** (il·limitats) | Pestanya Llocs. Avís quan algú hi arriba o en surt (ho detecta el mòbil de qui es mou) |
| **Acompanya'm** | Tries destí i temps. Si no arribes ni dius res: avís als 0 min, **SOS automàtic** 2 min després. Si se t'apaga el mòbil, els altres veuen «no ha arribat» 5 min després de l'hora |
| **Estic bé** | Un toc i la família ho rep (amb el lloc si ets en un) |
| **Bateria baixa** | Avís automàtic a la família en baixar del 15 % |
| **Recorregut** | 7 dies, xifrat. Botó «Recorregut» de cada membre |
| **SOS** | Mantenir 2 s · persiana · drecera · franja vermella, 112, trucar · **SMS** opcional amb la ubicació (Android) |
| **Avisos amb l'app tancada** | ntfy: només nom i què ha passat, mai la ubicació |
| **«Fa massa que no en sabem res»** (1.2) | Pestanya Família: avís si algú porta 3/6/12/24 h sense senyals. Ho calcula el mòbil de qui mira (funciona encara que l'altre estigui apagat) |
| **On ets?** (1.2) | Botó a cada membre: el seu mòbil envia la posició al moment. Si no respon en 3 min, ho diu |
| **Enllaç temporal** (1.2) | Botó «Comparteix»: enllaç d'1, 8 o 24 h per a algú de fora (s'obre al navegador). La clau va darrere el `#` i el servidor no la veu. **Cal la web publicada** a `ONSOC_WEB` (config.js) |
| **Fitxa mèdica** (1.2) | Pestanya Família. Surt amb l'SOS (botó «Fitxa») i a cada membre, amb botó per trucar al contacte d'emergència |
| **Idiomes** (1.2) | Català, castellà, francès i anglès (automàtic o a la pestanya Família) |

## 3. iPhone — el que fem (decidit el 14/11/2026): web + ntfy + Google Maps

Gratis i sense res que caduqui. Cada iPhone:

1. Obre **https://xorigu3r.github.io/xoriguer-onsoc/** a Safari → Comparteix → «Afegeix a la pantalla d'inici».
   Entra a la família amb el codi.
2. Instal·la **ntfy** (App Store) i s'hi subscriu al tema de la família (pestanya Família). Així rep els avisos i l'SOS
   amb l'app tancada, i quan algú li demana «On ets?» li sona un avís: en tocar-lo s'obre On Sóc i envia on és.
3. A **Google Maps**: la seva foto → Compartir la ubicació → «Fins que ho desactivis» → compartir amb un enllaç → copiar-lo,
   i enganxar-lo a «Enllaç de Google Maps» del perfil d'On Sóc. La resta de la família hi veu un botó blau **Google Maps**
   per veure'l en directe encara que no hagi obert On Sóc.

Què canvia per als de la web: només envien la ubicació (i els llocs, l'acompanya'm, el recorregut) amb On Sóc obert;
no se'ls aplica l'avís de «fa massa que no en sabem res» (seria normal cada dia) i a la llista hi surt «📱 Fa servir la web».
SOS, «estic bé», fitxa mèdica, veure la família i rebre avisos: tot igual.

### Altres camins (si mai voleu l'app de veritat a l'iPhone)

Amb l'iPhone **no hi ha un «APK»** que es pugui enviar i instal·lar. Hi ha tres camins:

| Camí | Cost | Funciona amb l'app tancada? | Què cal |
|---|---|---|---|
| **Web (PWA)**: Safari → Comparteix → «Afegeix a la pantalla d'inici» | Gratis | **No**: només envia la ubicació mentre l'app és oberta. Sí que veu els altres i pot fer SOS. | Publicar `www/` a GitHub Pages com les altres apps |
| **App nativa amb Apple ID gratuït** | Gratis | Sí | L'IPA es compila en un Mac (o en un Mac al núvol de GitHub Actions) i cada iPhone la posa amb **SideStore/AltStore** des d'un PC Windows. **Caduca cada 7 dies** (SideStore la renova al mòbil). Màx. 3 apps per Apple ID. |
| **App nativa amb Apple Developer** | 99 $/any | Sí | Mac amb Xcode (o un Mac al núvol). S'envia a la família per **TestFlight** i ja està. |

La carpeta `ios/` ja està feta i configurada (permisos d'ubicació «sempre», mode segon pla). Al Mac:

```bash
npm install
npm run sync
npx cap open ios
```

A Xcode: Signing & Capabilities → tria el teu equip (Apple ID) → connecta l'iPhone → ▶.

Gratis i sense caducar **no es pot**: botigues de la UE, certificats «enterprise», TrollStore o jailbreak no serveixen
(cal el compte de 99 $, els anul·len, o només van en iOS antics).

## Límits (sincerament)

- **No és un servei d'emergències.** Per a una emergència de veritat: **112** (el botó hi és a l'alerta).
- Els avisos arriben amb l'app tancada **només amb ntfy**. Sense ntfy, cal que On Sóc estigui compartint (Android) o oberta.
  ntfy.sh és un servei públic: el tema és impossible d'endevinar, però el text de l'avís (nom i què ha passat) hi passa sense xifrar.
- Els llocs i l'acompanya'm els detecta el mòbil de qui es mou: en un iPhone amb la versió web només funcionen amb l'app oberta.
- L'SMS d'SOS va amb la ubicació en clar (és la idea) i fa servir el pla de SMS de qui el fa.
- Sense cobertura ni GPS, no hi ha ubicació nova: la família veu l'última i «fa X min» en gris.
- Qui té el **codi de la família** us veu a tots. Si es filtra: tothom «Surt de la família» i en creeu una de nova.

## Per desenvolupar

- `npm test` — proves de la lògica i del xifratge
- `node scripts/servidor-prova.mjs` → http://localhost:8797 — l'app amb un **servidor fals** en memòria
  (no toca Firebase). Dues pestanyes amb el mateix codi = dos membres.
- `npm run apk` — APK firmat (clau a `~/android-tools/claus/onsoc.properties`; **fes-ne còpia de seguretat**)
- `npm run icons` — torna a fer el logo i les icones (`eines/genera_logo.py`)
