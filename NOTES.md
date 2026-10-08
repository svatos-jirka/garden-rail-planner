# Poznámky k vývoji

Poznámky AI asistenta (OpenCode) k tomu, co a proč v projektu vzniklo, jaká padla technická rozhodnutí,
jak se testovalo a co zbývá. Projekt vznikal postupně podle požadavků uživatele (říjen 2026).

> **Repozitář je veřejný.** Do souborů v gitu (kód, komentáře, testy, dokumentace, sestavené HTML) nepatří žádné údaje
> o konkrétním pozemku: adresa, číslo parcely, katastrální území, souřadnice, mapový list, ortofoto, LAZ ani výstupy z nich.
> Patří jen do `private/` (v `.gitignore`): `private/site.json` čte `relief.py`, `compare_density.py` i test průvodce (`search`).
> V příkladech používejte smyšlené údaje („Lhota 12“, parcela „123/4“).

## 1. Průběh práce (chronologicky)

1. **Parcela z katastru → 3D relief.** Zkušební parcela (s domem na stavební parcele uvnitř) se dohledala přes WFS ČÚZK.
   Terén je z DMR 5G (LAZ mapový list přes ATOM službu), ortofoto z WMS.
   Výstupy: interaktivní 3D (Plotly), PNG s vrstevnicemi a spádem, STL 1:1000 (1× a 3× převýšení, ověřeno
   jako vodotěsné těleso), ASC rastr, GeoJSON, CSV bodů.
2. **Editor zahradní železnice** do HTML: flexi kolej, výhybky, limity 5" / 7¼" / 7½", násypy a zářezy,
   podélný profil, 3D, export vytyčení. Výpočet i krok kreslení po **0,25 m** (požadavek uživatele).
3. **Oprava výpočtu nivelety.** První iterační metoda (relaxace) nekonvergovala a nechávala sklony až 6 %.
   Nahrazena přesnou metodou obálek (viz kap. 3).
4. **Profil relativně ke vstupnímu bodu** (výšky i staničení od vstupu), vstupní bod ve výchozím stavu
   „pláň na terénu“.
5. **Zákaz poloměru pod minimem** (zatržítko, výchozí zapnuto).
6. **Přesun hotových prvků** (tažení, Shift = skupina, R = otočit, šipky, přesné zadání, přichycení konců).
7. **Kruh** (celý kruh flexi, pak rozdělit a části smazat), **R kruhu** s výchozí hodnotou = doporučený poloměr,
   změna poloměru kruhu se zachováním středu.
8. **Výškové body v profilu** (dvojklik, tažení, zadání čísla, pravý klik = zrušit). Nesplnitelné body už
   nedělají v profilu skok, úsek mezi nimi se vede rovnoměrným sklonem a hlásí se jako chyba.
9. **Rozchod 3½"**.
10. **Y výhybka**, **asistent** (napojení výhybkou / křížení X / jen kolej, Tab), **odbočka** klikem do koleje,
    **křížení X** jako prvek s vazbou výšek, kontrola kolejí křížících se bez křížení.
11. **Diagram „násyp ↑ / zářez ↓“** v profilu (uživatel očekával zářez kreslený dolů; řez zůstal fyzikálně
    správně: zářez = zemina nad kolejí).
12. **Pravý klik = kontextová nabídka** s náhledem výhybek.
13. **Úprava poloměru / úhlu / délky výhybky**, napojené koleje se posunou.
14. **Obloukové výhybky** (do kruhu / oblouku) a **napojení asistentem do oblouku**.
15. **3D s ortofotem** (0,25 m) a **terén po stavbě** (vymodelované násypy a zářezy místo průhledných těles).
16. Ověření, zda existují podrobnější data (kap. 6), balík pro přenos (`make_zip.py`), tento repozitář.
17. **Výhybka v poloměru oblouku** (běžná i Y) a **pomocník napojení**. Uživatel správně upozornil, že do kruhu
    se v praxi dává běžná výhybka s poloměrem odbočky = poloměr kruhu: odbočka tvoří kus kruhu, přímá větev
    vyjede tečně. Původní „oblouková výhybka“ (hlavní větev v oblouku) je jiný, méně běžný typ a zůstala jako možnost.
    Pomocník (pravý klik na volný konec) hledá napojení výhybkou po celé délce okolních kolejí.
18. **Bilance zeminy a předpoklad ceny.**
    - Kubatury se počítají z mřížky terénu po stavbě (`earthGrid`). Dřív jen podle osy koleje: příčný sklon 15 % se
      neprojevil a souběžné koleje se započítaly dvakrát.
    - Přibyly součinitele zhutnění/využití výkopu a nakypření.
    - Tlačítko „Vyrovnat bilanci“ hledá půlením intervalu posun nivelety `M.hShift`, při kterém výkop × součinitel = násyp.
    - Panel „Předpoklad ceny“ obsahuje kolejivo, výhybky, štěrk, geotextilii a zemní práce. Má export do CSV.
19. **Kontrolní body z laseru** (`js5_survey.js`). Uživatel chtěl zadávat výšky ověřené laserem.
    - Mobilní aplikaci s GPS jsme zavrhli: poloha z telefonu má chybu 3–5 m, na svahu 15 % to dělá desítky cm výšky.
    - Body se umisťují podle ortofota nebo podél osy trasy (vytyčení pásmem).
    - Do tabulky se zapisují odečty na lati, výška stanoviska se dopočítá.
    - Terén se opraví krigingem rozdílů k DMR.
20. **Tabulka výškových bodů a oprava chyby, kvůli které nešel bod smazat.**
    - Výškový bod (`M.pins`) je uložený pod klíčem „prvek:konec“. Jedno místo na trati ale sdílí víc konců
      (konec přímé = začátek oblouku = vstupní bod).
    - Dvojklik v profilu a „Výškový bod zde“ uměly vytvořit na stejném místě druhý bod pod klíčem sousedního prvku.
      Pravý klik pak smazal jen jeden z nich a panel Vybraný prvek bod souseda neviděl.
    - Teď se s body pracuje podle místa (`pinKeysAt`, `pinKeyAt`, `delPinsAt`): nové body se na obsazeném místě nevytvoří,
      mazání v profilu smaže celé místo a panel prvku vidí bod souseda.
    - Tabulka ukazuje všechny body včetně duplicitních a neplatných. Kontrola návrhu na duplicity upozorní.
21. **Projekty a nový projekt podle adresy** (`js0_start.js`). Úvodní okno nabízí uložené projekty, import souboru, nebo nový projekt.
    Nový projekt se zakládá z obce a čísla popisného.
    - Prověřené zdroje (CORS z `file://` posílá `Origin: null`, ArcGIS ČÚZK ho vrací v `Access-Control-Allow-Origin`, z github.io taky):
      - RÚIAN MapServer: vrstvy 1 adresní místa, 3 stavební objekty, 5 parcely (s otvory), 7 k.ú.;
      - ORTOFOTO `export`;
      - **INSPIRE_Nadmorska_vyska_TIN, vrstva 0 `EL_TIN`**: multipointy po 3 500 bodech se Z. Jsou to tytéž body jako LAZ DMR 5G
        (v parcele 214/214, nejbližší bod 0 m) a TIN z nich se od TIN z LAZ liší o RMS 6 mm.
    - Zavržené zdroje:
      - zip LAZ z `openzu.cuzk.gov.cz` nemá CORS;
      - ImageServer `dmr5g` je rastr 2 m a proti TIN z bodů se liší o 13 cm RMS (max 0,55 m), protože vyhlazuje hrany.
    - Hledání adresy: `cislodomovni=N AND UPPER(adresa) LIKE …`. Když se nic nenajde (bez diakritiky), stáhnou se všechna
      místa s daným č.p. (~3 600, 2 s) a filtrují se bez diakritiky v prohlížeči.
    - Předvýběr parcel: parcely, jejichž vnější obrys obsahuje adresní bod. To je parcela s domem a zahrada, která má dům jako otvor.
    - Sjednocení parcel: vyrušení protisměrných hran (s rozdělením hran v T-spojích), zřetězení na obrysy.
    - Terén: Bowyer–Watson s postupem po x, rastrování trojúhelníků, mřížka stejná jako v `relief.py` (okolí 10 m).
      Nad 260 000 uzlů se použije krok 0,5 m.
    - Stínovaný reliéf a vrstevnice (marching squares, `contourPaths`) se počítají v prohlížeči.
    - Úložiště:
      - IndexedDB `zahradni_zeleznice` (`projects` = popis, `pdata` = data); otevření má limit 5 s;
      - návrh a kontrolní body v localStorage pod klíči podle id projektu (`zeleznice_<id>_v1`, `mereni_<id>_v1`).
        Vestavěný projekt má id podle `id` v `private/site.json`, takže dřívější uložení zůstává pod stejným klíčem.
    - Kód aplikace je v HTML jako `<script type="text/plain" id="appjs">` a spustí se až po výběru projektu (`window.PRJ`).
      Start čeká na `DOMContentLoaded`, protože `#appjs` je v HTML až za úvodním skriptem.
    - Aplikace je zobecněná: `AREA` (všechny obrysy, sudo-liché pravidlo), `BUILDINGS` (seznam), názvy souborů a texty podle projektu.
      Návrh z jiného projektu se při načtení posune o rozdíl počátků.
22. **Zveřejnění repozitáře.** Údaje o pozemku přesunuty do `private/` (v `.gitignore`), historie gitu začíná znovu.
    - `build.py` sestaví aplikaci bez dat do `output/garden-rail-planner.html` (GitHub Pages: `index.html` přesměruje).
    - `relief.py` čte `private/site.json` (vzor `site.example.json`) a vše zapisuje do `private/output/` (`site.html` = aplikace s vestavěným projektem).
    - `test_solver.js` bez `private/` počítá na umělém svahu.
    - Názvy souborů anglicky, i exporty z aplikace (`route_stakeout_*.csv`, `track_elements_*.csv`, `cost_estimate_*.csv`,
      `track_design_*.json`, `survey_points_*.csv`, projekt `*.garden-rail.json`). Import projektu poznává soubor podle obsahu (`format`), ne podle jména.

## 2. Architektura

- `relief.py` vše počítá v **S-JTSK (EPSG:5514)**, lokální počátek = levý dolní roh mřížky. Osa x = východ, y = sever.
- Terén: body DMR 5G v okolí → Delaunay TIN (`LinearNDInterpolator`) → mřížka **0,25 m** (okolí parcely 10 m).
- HTML aplikace se skládá ze souborů v `app/` (`build.py`). Python do kostry `app.html` vloží CSS, nápovědu, JS
  a Plotly.js. Soukromé sestavení (`relief.py`) přidá data (JSON: výškový grid jako base64 Float32, ortofoto a stínovaný
  reliéf jako PNG data URL, vrstevnice po 0,25 m, hranice parcely a domu). Vznikne jeden offline soubor (~5–6 MB).
- Návrh (`M`) = seznam prvků + výškové body (`pins`). Nastavení (`S`) = limity a parametry. Obojí se ukládá
  do localStorage a exportuje jako JSON.

### Geometrický model

- Každá kolej je **úsek konstantní křivosti** `{x, y, h, k, L}` (přímá k = 0, oblouk k = ±1/R).
  Poloha v délce s: `segAt()`.
- Prvky mají **porty** (konce) s polohou a směrem „ven“. Spojení se nehledá z uložených vazeb, ale
  **podle polohy** (do 1 cm, opačné směry). Díky tomu je mazání, dělení i přesun robustní.
- Flexi kolej: `arcThenLine` (oblouk R ke směru kurzoru + přímá), `arcThrough` (oblouk přes bod),
  `biarc` (dva oblouky mezi dvěma porty pro uzavření okruhu a napojení).
- **Výhybka**: porty A (hrot), B (přímo), C (odbočka). Odbočka = oblouk R o úhel atan(1/n) + přímá do délky výhybky.
  B a C mají vždy stejnou výšku.
  - **Y**: dvě symetrické větve, každá o úhel atan(1/n)/2 s poloměrem R.
  - **Oblouková**: hlavní větev sleduje oblouk koleje (k_m). Odbočka má křivost k_m + side/R, tedy přibližně
    1/R_odb ≈ 1/R_oblouku ± 1/R_výhybky. Jde o plánovací aproximaci, skutečné obloukové výhybky výrobců mají
    vlastní geometrii.
  - **V poloměru oblouku** (`follow`): běžná výhybka s R = poloměr oblouku a délkou R·sin(α), takže odbočka je
    čistý oblouk o úhlu α a leží přesně na kruhu. V koleji pokračuje větev `follow` (C), přímá větev B vyjede tečně.
    Y obdobně (úhel α/2, `follow` = větev ve směru oblouku). `insertTurnoutInto` nahradí v koleji délku větve
    `follow`, nová kolej se napojuje na druhou větev (`freePortOf`).
- **Křížení X**: bodový prvek. Obě koleje se v průsečíku rozdělí. Výpočet výšek sjednotí jejich uzly
  (stejná TK), kontrola hlídá úhel (výchozí min. 30°).

## 3. Výpočet nivelety (výšky TK)

Uzly po ~0,25 m na všech kolejích, výhybka = hrany A–B (přímo) a A–C (odbočka) se společným uzlem B/C.
Cíl v uzlu: `T = terén + konstrukční výška + cílová výška pláně`.

1. **Limit sklonu** na hraně: |h_b − h_a| ≤ lim · délka. Lim = návrhové stoupání − c·G·|k| (kompenzace oblouku),
   ve výhybce min(návrh, sklon ve výhybce).
2. **Obálky** (McShane–Whitney): U_i = min_j (T_j + D_ij), L_i = max_j (T_j − D_ij), kde D je nejkratší
   „výšková vzdálenost“ (součet lim·délka) počítaná **Dijkstrou** z více zdrojů. Výsledek **h = (U + L)/2**
   vždy splní limit sklonu a minimalizuje **největší** násyp nebo zářez (L∞ optimum).
3. **Pevné body** (vstupní bod, výškové body, křížení) se promítnou do obálek. Pokud dva body nejde spojit,
   zvětší se povolený sklon rovnoměrně po nejkratší cestě mezi nimi. Niveleta tam vede přímkou a kontrola hlásí chybu.
4. **Vyhlazení** (Laplace, intenzita `smooth`²·400 iterací, každých 5 kroků znovu obálky) a **výškové zakružení**
   (projekce změny sklonu na trojicích uzlů), nakonec znovu obálky, aby limit sklonu platil přesně.

Předchozí verze (iterativní relaxace s rozdělením opravy na oba konce hrany) nekonvergovala: na okruhu zůstával
sklon až 6 %. Test v Node.js (`test_solver.js`) teď ukazuje překročení < 1e-12.

## 4. Kontroly a výpočty

- Poloměr (min / doporučený), výsledný poloměr odbočky výhybky.
- Ekvivalentní sklon (sklon + c·G/R), sklon ve výhybce, prvek s vlastním limitem (stanice = vodorovně).
- Převýšení koleje c = G·v²/(g·R), omezené maximem. Max. rychlost v oblouku pro boční zrychlení a_lim.
  Vzestupnice 1:200.
- Protisměrné oblouky bez mezipřímé / s krátkou mezipřímou.
- Násyp / zářez nad prahem, kolej mimo parcelu, přes dům (budovy), u hranice.
- Koleje křížící se bez křížení X (průsečíky polylinií mimo konce prvků), úhel křížení.
- Kubatury: lichoběžníkový příčný řez (šířka pláně, svahy 1:m násyp, 1:n zářez) jen podle osy. Ukazuje se u jednotlivých prvků.
- **Terén po stavbě a celkové kubatury** (`earthGrid` v `js2_solve.js`): pro každou buňku mřížky
  F = max přes body koleje (pláň − vzdálenost/m), C = min (pláň + vzdálenost/n).
  Nový terén = min(max(terén, F), C). Výsledek nezávisí na pořadí a zahrnuje příčný sklon i překryvy.
  Výkop / násyp = součet záporných / kladných rozdílů × 0,0625 m². Stejná mřížka slouží pro 3D.
- **Bilance**: přebytek = výkop − násyp / kUse. Odvoz = přebytek × kSwell, dovoz = chybějící násyp × kSwell.
  Vyrovnání: funkce kUse·výkop(Δ) − násyp(Δ) s posunem nivelety Δ klesá. Interval se nejdřív rozšiřuje,
  pak se půlí (~20 výpočtů nivelety, na ukázce ~100 ms). Δ = `M.hShift` se přičte k cílovým výškám
  i k bodům „pláň nad terénem“, body „TK pevně“ se nemění.
- **Předpoklad ceny** (`costData` v `js4_ui.js`):
  - Výchozí ceny jsou v `COST_G` (podle rozchodu) a `COST_C` (společné). Uživatelské změny se ukládají v `S.costG[rozchod]` a `S.costC`.
  - Výchozí ceny jsou hrubý odhad, ne průzkum trhu.
- **Kontrolní body** (`js5_survey.js`):
  - Výška bodu: `abs` = hodnota; `lat` = H − odečet; `rel` = C + hodnota.
  - H nebo C stanoviska se spočítá z bodů se „známou výškou“ (průměr). Jinak jako medián (DMR − znaménko·hodnota). Robustní je až do 50 % změněných bodů.
  - Rozdíly r = z − DMR → jednoduchý kriging: Gaussova kovariance σ² = 0,2² m², dosah `S.svLen` (výchozí 3 m), šum `S.svNoise` (5 cm).
    α = (K + n²I)⁻¹ r přes Choleského rozklad. Oprava v buňce = Σ α_i σ² exp(−d²/2ℓ²), počítá se do 3,5ℓ.
  - Křížová kontrola (leave-one-out) se počítá pro n ≤ 400: e_i = α_i / (K⁻¹)_ii.
  - `DEM` se přepíše na DMR + oprava. Původní zůstává v `DEM0` a `terrain0()`. Vrstevnice se přepočtou (marching squares, `contourPaths`).
  - `svCompare` spočítá kubatury stejného návrhu jen nad DMR, pro porovnání.
  - Body jsou v localStorage `mereni_<id projektu>_v1` (zvlášť od návrhu) a v JSON exportu návrhu (`survey`).
  - `init()` se volá na konci `js5`, protože `js5` definuje stav (`SV`), který init potřebuje.
- 3D „terén po stavbě“: pro každý bod koleje se v okolí upraví mřížka na pláň + svahy
  (max pro násyp, min pro zářez).

## 5. Testování

- **Node.js** `test_solver.js`: jádro (`js1` + `js2`) na ukázkovém okruhu s výhybkou. Kontroluje dodržení sklonu,
  souhrn a varování.
- **Headless Edge** se snímkem obrazovky a testovacími adresami (testy simulují klikání myší a výsledek vypíší do
  nápovědy v plánu):

  | Adresa | Co testuje |
  |---|---|
  | `#selftest`, `#selftest3d`, `#selftestflex`, `#selftestrel` | ukázkový návrh, 3D, náhled flexi, relativní profil |
  | `#selftestclick` | vstupní bod, flexi, výhybka, rozdělení, zákaz poloměru pod min. |
  | `#selftestcircle` | kruh, změna R se zachováním středu, přesun, řezy, mazání, přichycení |
  | `#selftestpin` | výškové body v profilu, Ctrl+Z, rozchod 3½" |
  | `#selftestassist` | křížení X, odbočka z koleje, napojení výhybkou, Y výhybka |
  | `#selftestctx` | kontextová nabídka a vložení výhybky |
  | `#selftestto` | úprava poloměru výhybky, posun napojené koleje |
  | `#selftestcurve`, `#selftestjoinarc` | oblouková výhybka do kruhu, napojení asistentem do oblouku |
  | `#selftestfit` | kruh + rovná trať: pomocník, výhybka v poloměru kruhu pravým klikem, Y do kruhu |
  | `#selftestcost` | kubatury z mřížky vs. podle osy, vyrovnání bilance, rozpočet (změna ceny, hotová kolej, rozchod, Ctrl+Z) |
  | `#selftestsurvey` | simulovaný laser nad terénem s vlnou +0,40 m: výška přístroje, oprava terénu, Enter v tabulce, klik/tažení bodu, CSV tam a zpět, vypnutí |
  | `#selftestpins` | výškové body: duplicita v jednom místě (varování, tabulka), pravý klik v profilu, Ctrl+Z, vyčištění, dvojklik na obsazeném místě, bod mimo trasu, neplatný bod, panel prvku s bodem souseda |
  | `#selftestnew` | nový projekt přes síť: hledání adresy z `?addr=…` (jinak `search` z `private/site.json`), předvýběr parcel, stažení a TIN, se soukromým sestavením porovnání s terénem z LAZ, uložení, otevření |
  | `#selftestwiz`, `#selftestimp` | mapa průvodce s parcelami; export vestavěného projektu do souboru a import jako kopie |

  Testy úvodního okna používají IndexedDB a síť. Režim `--virtual-time-budget` na ně nestačí (IndexedDB v něm neodpoví),
  proto se spouští přes DevTools protokol v reálném čase (Node skript s `--remote-debugging-port`, čekání na podmínku, snímek obrazovky).

  Spuštění, např.:
  `msedge --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1600,1000 --virtual-time-budget=25000 --screenshot=out.png "file:///…/private/output/site.html#selftestassist"`
  (vždy s novým `--user-data-dir`, jinak Edge vrací soubor z mezipaměti).

## 6. Data: rozlišení a stáří

Ověřeno přímo na datech ČÚZK pro zkušební parcelu:

| Zdroj | Body terénu v parcele | Rozteč | Poznámka |
|---|---|---|---|
| DMR 5G | 214 | 2,5 m | datum skenu je v GPS čase bodů LAZ |
| DMP 1G | 315 (+ 436 na budově) | 2,1 m | stejný sken, rozdíl k DMR 5G průměr 2,4 cm, sm. odch. 7 cm |
| DMR 4G | – | mřížka 5 m | hrubší |

Jemnější mřížka než 0,25 m nepřinese novou informaci. Skutečné zpřesnění dá jen vlastní zaměření
(geodet / GNSS RTK, dron s RTK, nivelace podél trati).

## 7. Omezení a nápady na další práci

- Bez přechodnic (oblouk navazuje přímo na přímou). Převýšení koleje se jen doporučuje, nemodeluje se.
- Oblouková a Y výhybka jsou geometrické aproximace. Pro stavbu je potřeba nahradit je rozměry výrobce.
- Asistent napojuje jen běžnými a obloukovými výhybkami (ne Y). Křížení X je jen úrovňové.
- Chybí kontrola osové vzdálenosti souběžných kolejí a průjezdného profilu.
- Navržené, ale neudělané:
  - **import vlastních naměřených bodů** – hotovo (kontrolní body, kap. 1 bod 19),
  - doplnění bodů terénu z DMP 1G,
  - nástroj „Výška“ přímo v plánu.
- Výchozí limity jsou orientační (praxe klubů a výrobců), nejsou normou.
