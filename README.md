# Garden Rail Planner – návrh zahradní železnice na terénu

Webová aplikace pro **návrh zahradní železnice** (3½", 5", 7¼", 7½") na skutečném terénu
pozemku. **Projekt se založí podle adresy (obec + číslo popisné)**. Aplikace sama stáhne z otevřených dat ČÚZK:
- body terénu **DMR 5G**;
- ortofoto;
- hranice parcel a budovy.

Pak počítá výšky koleje (niveletu), **násypy a zářezy**, hlídá limity (poloměry, stoupání, převýšení…) a exportuje vytyčovací tabulku.
Pro vlastní pozemek jde lokálně sestavit i verzi s vestavěným projektem a výstupy samotného reliéfu (3D tisk STL, rastr, PNG),
viz [Soukromé sestavení pro vlastní pozemek](#soukromé-sestavení-pro-vlastní-pozemek).

## Rychlý start

**Online:** <https://svatos-jirka.github.io/garden-rail-planner/>
(GitHub Pages, stačí otevřít odkaz)

**Lokálně:** otevřete v prohlížeči (Edge / Chrome / Firefox) soubor `output/garden-rail-planner.html`.
Je to celá aplikace v jednom souboru, bez vestavěných dat – projekty se zakládají podle adresy nebo importem ze souboru.

Po otevření se ukáže **úvodní okno**:
- **Nový projekt**: napíšete obec a číslo popisné (např. „Lhota 12“) a vyberete adresu. Na mapě s ortofotem klikem
  označíte parcely zahrady. Aplikace stáhne body DMR 5G (přes INSPIRE TIN – tytéž body jako soubory LAZ) a spočítá
  z nich terén po 0,25 m. Pak stáhne ortofoto a budovy z RÚIAN. Trvá to pár sekund a nic se neinstaluje, potřeba je jen internet.
- **Uložené projekty**: otevřít, uložit do souboru, přejmenovat, smazat. Projekty jsou uložené v prohlížeči (IndexedDB),
  návrh trati a kontrolní body zvlášť pro každý projekt.
- **Importovat projekt ze souboru**: přenos na jiný počítač. Soubor `*.garden-rail.json` obsahuje terén, ortofoto,
  hranice, návrh i kontrolní body.

## Co aplikace umí

**Kreslení trati (plán s ortofotem / reliéfem a vrstevnicemi)**
- Vstupní bod, **flexi kolej** (oblouk zadaného poloměru + přímá, Shift = oblouk přes kurzor, Ctrl = přímá),
  napojení dvěma oblouky na volný konec (uzavření okruhu), **kruh** o zvoleném poloměru (pak rozdělit a části smazat).
- **Výhybky** L / P (do přímé koleje i **obloukové** do oblouku nebo kruhu) a **Y** (symetrická).
  Úprava poloměru, úhlu 1:n a délky hotové výhybky (napojené koleje se posunou s ní).
- **Asistent**: při dotyku jiné koleje nabídne napojení výhybkou (sám najde místo, stranu a přípojné oblouky
  nad min. poloměrem), při překřížení nabídne **křížení X**. Tab přepíná možnosti.
- **Pravý klik** na kolej: nabídka výhybek s náhledem, odbočka, rozdělení, výškový bod, smazání.
- Přesouvání a otáčení hotových prvků (s přichycením konců), rozdělení, mazání, zpět/znovu.
- Volitelně **zákaz poloměru pod minimem** (výchozí zapnuto).

**Výškové řešení**
- Niveleta (výška temene kolejnice, TK) se počítá automaticky po 0,25 m co nejblíž terénu v rámci limitů:
  stoupání (v oblouku snížené o c·G/R), sklon ve výhybce, výškové zakružení.
- **Výškové body**: dvojklik do podélného profilu, tažení myší, přesné zadání čísla, pravý klik = zrušit.
- Podélný profil absolutně (m n.m.) nebo **relativně ke vstupnímu bodu**, diagram „násyp ↑ / zářez ↓“, pásmo sklonu.

**Kontrola návrhu**: poloměry, sklony, převýšení koleje a max. rychlost v oblouku, protisměrné oblouky,
velké násypy/zářezy, kolej mimo parcelu / přes dům / u hranice, křížení bez křížení X, úhel křížení,
nesplnitelné výškové body. Klik na upozornění ukáže místo v plánu.

**3D**: ortofoto přes terén (0,25 m), **terén po stavbě** s vymodelovanými násypy a zářezy, převýšení 1–5×.

**Kontrolní body (zpřesnění terénu laserem)**:
- tabulka bodů s odečty z rotačního laseru (nebo s výškami od geodeta či z RTK);
- body podél trasy po zvoleném kroku, nebo klikem do plánu;
- výška přístroje se dopočítá;
- terén se opraví krigingem rozdílů k DMR a změnu ukazují vrstevnice, profil, kubatury i 3D;
- porovnání výkopu a násypu „jen DMR“ a „s měřením“, import a export CSV.

**Zemní práce**:
- výkop a násyp počítané z terénu po stavbě, včetně příčného sklonu terénu;
- bilance se součinitelem využití výkopu a nakypřením, odvoz nebo dovoz zeminy;
- tlačítko **Vyrovnat bilanci**: posune niveletu tak, aby byl návrh neutrální.

**Předpoklad ceny**:
- kolej z dílů (kolejnice, pražce, upevnění) nebo hotová pole;
- spojky, výhybky podle typu, křížení, zarážedla, štěrk v tunách, geotextilie;
- zemní práce, rezerva, cena za 1 m trati, export do CSV.

Ceny zadává uživatel, výchozí hodnoty jsou jen hrubý odhad.

**Export**: vytyčovací tabulka trasy po 0,25 m (CSV, souřadnice S-JTSK, TK, pláň, násyp/zářez, sklon,
výšky relativně ke vstupu), souhrn prvků (CSV), rozpočet (CSV), návrh (JSON).

## Výchozí limity (orientační, vše lze upravit v aplikaci)

| | 3½" | 5" | 7¼" / 7½" |
|---|---|---|---|
| Min. / doporučený poloměr | 4,5 / 7,5 m | 6 / 10 m | 9 / 15 m |
| Stoupání doporučené / max. | 1 % / 2 % | 1 % / 2 % | 1 % / 2 % |
| Výškové zakružení | ≥ 15 m | ≥ 20 m | ≥ 30 m |
| Max. převýšení koleje | 5 mm | 8 mm | 12 mm |
| Výhybka (R / 1:n / délka) | 4,5 m / 1:5 / 1,3 m | 6 m / 1:5 / 1,8 m | 10 m / 1:6 / 2,8 m |

Jsou to běžná doporučení z praxe klubů a výrobců, **ne norma**. Rozhoduje minimální poloměr udávaný výrobcem
lokomotivy a délka vozů.

## Struktura projektu

| Soubor / složka | Popis |
|---|---|
| `app/` | Zdroj aplikace: `app.html` (kostra), `style.css`, `help.html` (nápověda), `js0_start.js` (úvodní okno, projekty, nový projekt podle adresy – stažení a výpočet terénu), `js1_core.js` (data, geometrie), `js2_solve.js` (niveleta, kontroly, kubatury), `js3_plan.js` (plán, nástroje, asistent), `js4_ui.js` (profil, panely, 3D, cena, export), `js5_survey.js` (kontrolní body, zpřesnění terénu, testy) |
| `build.py` | Sestaví aplikaci do jednoho souboru `output/garden-rail-planner.html` (bez dat) |
| `output/garden-rail-planner.html` | Sestavená aplikace (GitHub Pages i lokální použití) |
| `relief.py` | Soukromé sestavení pro jeden pozemek podle `private/site.json`: hranice parcely, terén z LAZ, ortofoto, aplikace s vestavěným projektem a výstupy reliéfu (PNG, STL, ASC, GeoJSON, CSV) do `private/output/` |
| `site.example.json` | Vzor konfigurace pozemku pro `relief.py` |
| `find_tile.py` | Najde mapový list DMR 5G (LAZ) pro zadanou souřadnici WGS84 |
| `compare_density.py` | Porovnání hustoty bodů DMR 5G a DMP 1G v parcele ze `private/` |
| `test_solver.js` | Test výpočetního jádra (Node.js) |
| `make_zip.py` | Zabalí projekt pro přenos (včetně `private/`) |
| `index.html`, `.nojekyll` | Pro GitHub Pages: přesměrování z kořene webu na aplikaci, vypnutí zpracování Jekyllem |
| `NOTES.md` | Podrobné poznámky k vývoji, rozhodnutím a omezením |
| `private/` | **Jen lokálně, je v `.gitignore`**: `site.json`, soubory LAZ, výstupy `relief.py` |

## Sestavení a testy

Aplikace bez dat (stačí Python 3 a plotly):

```
py -m pip install --user plotly
py build.py
```

Test jádra výpočtu: `node test_solver.js`. Bez `private/` běží na umělém svahu, se soukromým sestavením na terénu pozemku
(`--synthetic` vynutí umělý svah). Testy ovládání v prohlížeči (`#selftestclick`, `#selftestassist`, `#selftestcircle`,
`#selftestpin`, `#selftestctx`, …) potřebují vestavěný projekt, tj. `private/output/site.html` (viz `NOTES.md`).

## Soukromé sestavení pro vlastní pozemek

`relief.py` počítá terén přímo z LAZ (DMR 5G) a vytvoří i výstupy pro 3D tisk a GIS. Údaje o pozemku jsou jen
v lokální složce `private/`, která je v `.gitignore` a do repozitáře se nedostane.

1. `py find_tile.py <šířka> <délka>` najde mapový list DMR 5G. LAZ stáhněte do `private/data/`.
2. Zkopírujte `site.example.json` do `private/site.json` a vyplňte parcelu, katastrální území, malý výřez
   kolem pozemku ve WGS84 (`bbox_wgs84`) a cestu k LAZ.
3. Spusťte (vyžaduje internet: WFS katastru a WMS ortofota ČÚZK):

```
py -m pip install --user requests numpy shapely pyproj matplotlib plotly scipy pillow laspy[lazrs]
py relief.py
```

Výstupy jsou v `private/output/`: `site.html` (aplikace s vestavěným projektem, funguje i offline), `relief.png`,
`relief_1x.stl` / `relief_3x.stl` (model 1:1000), `dem.asc` + `dem.prj` (rastr S-JTSK pro QGIS), `parcel.geojson`,
`dmr5g_points.csv`, `orthophoto.png`, `stats.json`.

## Data a jejich přesnost

**Nové projekty (v prohlížeči, služby ArcGIS ČÚZK):**
- adresa: RÚIAN, adresní místa;
- parcely a budovy: RÚIAN, parcely a stavební objekty;
- terén: vrstva `EL_TIN` služby INSPIRE Nadmořská výška – TIN. Jsou to **tytéž body DMR 5G jako v souborech LAZ**.
  Ověřeno na zkušební parcele: v parcele tytéž body jako v LAZ, terén proti výpočtu z LAZ RMS 6 mm.
  Triangulace (Delaunay) a mřížka 0,25 m se počítají v prohlížeči;
- ortofoto: ORTOFOTO MapServer.

**Soukromé sestavení (`relief.py`):**
- hranice parcely: WFS INSPIRE katastrální parcely, ČÚZK;
- terén: **DMR 5G**, ČÚZK (LAZ, S-JTSK / Bpv), skenováno v letech 2009–2013 podle oblasti. Na zkušební parcele
  asi 1 bod na 6 m² (průměrná rozteč 2,5 m). Mřížka 0,25 m je interpolace (TIN). Přesnost ±0,18 m v odkrytém terénu;
- ortofoto: WMS ORTOFOTO, ČÚZK.

Data ČÚZK jsou poskytována pod licencí **CC BY 4.0** (© ČÚZK).

Změny terénu po skenování (jezírko, terasy, navážky) v datech nejsou. Před stavbou je potřeba výšky
ověřit nivelací nebo geodetickým zaměřením. V aplikaci k tomu slouží kontrolní body.

