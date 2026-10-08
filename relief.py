"""
3D relief pozemku a aplikace s vestavěným projektem (soukromé sestavení pro jeden konkrétní pozemek)

Údaje o pozemku jsou jen v lokální konfiguraci private/site.json (vzor: site.example.json).
Složka private/ je v .gitignore – konfigurace, LAZ i všechny výstupy s polohou zůstávají jen na tomto počítači.

Zdroje (vše ČÚZK, open data):
  * hranice parcely  - WFS INSPIRE Cadastral Parcels  (services.cuzk.cz)
  * výšky terénu     - DMR 5G, LAZ mapový list (S-JTSK / Bpv), TIN
  * ortofoto         - WMS ORTOFOTO (ags.cuzk.gov.cz)

Výstupy (do složky private/output):
  site.html            aplikace s vestavěným projektem (plán, 3D, návrh zahradní železnice) –
                       sestavuje se ze souborů ve složce ./app (viz build.py)
  parcel.geojson       hranice parcely (WGS84) + budova
  relief.png           statický náhled (mapa vrstevnic + 3D pohled)
  relief_1x.stl        tisknutelný model 1:1000 (1 jednotka = 1 m), bez převýšení
  relief_3x.stl        totéž s 3x převýšením
  dem.asc (+ .prj)     výškový grid 0,25 m (ESRI ASCII, S-JTSK) pro QGIS apod.
  dmr5g_points.csv     původní body DMR 5G v okolí parcely
  orthophoto.png       ortofoto okolí
  stats.json           statistika terénu
"""
from __future__ import annotations

import base64
import io
import json
import os
import struct
import sys
import xml.etree.ElementTree as ET

import laspy
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import requests
from matplotlib.colors import LightSource
from matplotlib.path import Path as MplPath
from PIL import Image
from pyproj import Transformer
from scipy.interpolate import LinearNDInterpolator
from shapely.geometry import Polygon

from build import build_html

HERE = os.path.dirname(os.path.abspath(__file__))
PRIVATE = os.path.join(HERE, "private")
CONFIG = os.path.join(PRIVATE, "site.json")
OUT = os.path.join(PRIVATE, "output")

if not os.path.exists(CONFIG):
    sys.exit(f"Chybí {CONFIG}. Zkopírujte site.example.json do private/site.json a vyplňte svůj pozemek.")
with open(CONFIG, encoding="utf-8") as f:
    SITE = json.load(f)
os.makedirs(OUT, exist_ok=True)

PARCEL_LABEL = SITE["parcel"]                      # číslo parcely v katastru, např. „123/4“
BUILDING_LABEL = SITE.get("building")              # stavební parcela s domem uvnitř, např. „st. 56“ (nebo null)
KU = f"{SITE.get('ku', '')} ({SITE.get('ku_code', '')})".strip(" ()")
LAZ = os.path.join(PRIVATE, SITE["laz"])
RES = 0.25          # krok gridu [m]
CONTEXT = 10.0      # okolí parcely zobrazené v 3D [m]
BASE = 2.0          # tloušťka podstavy STL pod nejnižším bodem [m]

NS = {
    "gml": "http://www.opengis.net/gml/3.2",
    "cp": "http://inspire.ec.europa.eu/schemas/cp/4.0",
    "wfs": "http://www.opengis.net/wfs/2.0",
}


# --------------------------------------------------------------------------- #
# 1) Hranice parcely z WFS ČÚZK
# --------------------------------------------------------------------------- #
def ring(el) -> np.ndarray:
    v = np.array(el.find(".//gml:posList", NS).text.split(), dtype=float)
    return v.reshape(-1, 2)


def fetch_parcels() -> dict[str, dict]:
    bbox = ",".join(f"{v:.5f}" for v in SITE["bbox_wgs84"])      # lat_min, lon_min, lat_max, lon_max
    url = (
        "https://services.cuzk.cz/wfs/inspire-cp-wfs.asp?service=WFS&version=2.0.0"
        "&request=GetFeature&typeNames=CP:CadastralParcel"
        "&srsName=urn:ogc:def:crs:EPSG::5514"
        f"&bbox={bbox},urn:ogc:def:crs:EPSG::4326"
    )
    root = ET.fromstring(requests.get(url, timeout=60).content)
    res = {}
    for p in root.iter(f"{{{NS['cp']}}}CadastralParcel"):
        label = p.find("cp:label", NS).text
        geom = p.find("cp:geometry/gml:Polygon", NS)
        res[label] = {
            "ref": p.find("cp:nationalCadastralReference", NS).text,
            "area": float(p.find("cp:areaValue", NS).text),
            "exterior": ring(geom.find("gml:exterior", NS)),
            "interiors": [ring(i) for i in geom.findall("gml:interior", NS)],
        }
    return res


parcels = fetch_parcels()
par = parcels[PARCEL_LABEL]
bld = parcels.get(BUILDING_LABEL) if BUILDING_LABEL else None
ext = par["exterior"]                       # vnější hranice (vč. stavební parcely uvnitř)
poly = Polygon(ext, par["interiors"])       # přesná parcela (s dírou)
outer = Polygon(ext)
print(f"Parcela {par['ref']}: výměra KN {par['area']:.0f} m2, "
      f"geometrie {poly.area:.1f} m2, vnější obrys {outer.area:.1f} m2")

# GeoJSON ve WGS84
to_wgs = Transformer.from_crs("EPSG:5514", "EPSG:4326", always_xy=True)


def to_lonlat(arr):
    lon, lat = to_wgs.transform(arr[:, 0], arr[:, 1])
    return np.column_stack([lon, lat]).round(8).tolist()


features = [{
    "type": "Feature",
    "properties": {"parcela": PARCEL_LABEL, "ku": KU, "vymera_m2": par["area"]},
    "geometry": {"type": "Polygon",
                 "coordinates": [to_lonlat(ext)] + [to_lonlat(i) for i in par["interiors"]]},
}]
if bld:
    features.append({
        "type": "Feature",
        "properties": {"parcela": BUILDING_LABEL, "ku": KU, "vymera_m2": bld["area"]},
        "geometry": {"type": "Polygon", "coordinates": [to_lonlat(bld["exterior"])]},
    })
with open(os.path.join(OUT, "parcel.geojson"), "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, indent=1)

# --------------------------------------------------------------------------- #
# 2) Body DMR 5G a interpolace TIN -> grid
# --------------------------------------------------------------------------- #
x0, y0, x1, y1 = outer.bounds
gx0, gy0 = np.floor((x0 - CONTEXT) / RES) * RES, np.floor((y0 - CONTEXT) / RES) * RES
gx1, gy1 = np.ceil((x1 + CONTEXT) / RES) * RES, np.ceil((y1 + CONTEXT) / RES) * RES

las = laspy.read(LAZ)
X, Y, Z = np.asarray(las.x), np.asarray(las.y), np.asarray(las.z)
pad = CONTEXT + 40
sel = (X > gx0 - pad) & (X < gx1 + pad) & (Y > gy0 - pad) & (Y < gy1 + pad)
X, Y, Z = X[sel], Y[sel], Z[sel]
print(f"Bodů DMR 5G v okolí: {len(X)}, v parcele: "
      f"{MplPath(ext).contains_points(np.column_stack([X, Y])).sum()}")
np.savetxt(os.path.join(OUT, "dmr5g_points.csv"), np.column_stack([X, Y, Z]),
           delimiter=",", fmt="%.2f", header="x_sjtsk,y_sjtsk,h_bpv", comments="")

xs = np.arange(gx0, gx1 + RES / 2, RES)
ys = np.arange(gy0, gy1 + RES / 2, RES)
GX, GY = np.meshgrid(xs, ys)                      # řádky = y (jih -> sever)
interp = LinearNDInterpolator(np.column_stack([X, Y]), Z)   # = TIN DMR 5G
GZ = interp(GX, GY)

pts = np.column_stack([GX.ravel(), GY.ravel()])
in_outer = MplPath(ext).contains_points(pts).reshape(GX.shape)
in_parcel = in_outer.copy()
for hole in par["interiors"]:
    in_parcel &= ~MplPath(hole).contains_points(pts).reshape(GX.shape)

zp = GZ[in_parcel]
zmin, zmax = float(np.nanmin(GZ[in_outer])), float(np.nanmax(GZ[in_outer]))

# sklon (gradient)
dzdy, dzdx = np.gradient(GZ, RES)
slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
aspect = (np.degrees(np.arctan2(-dzdx, -dzdy)) + 360) % 360   # směr spádu (0 = sever)
mean_aspect = (np.degrees(np.arctan2(-np.nanmean(dzdx[in_parcel]),
                                     -np.nanmean(dzdy[in_parcel]))) + 360) % 360
dirs = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"]
stats = {
    "h_min": float(np.nanmin(zp)), "h_max": float(np.nanmax(zp)),
    "h_mean": float(np.nanmean(zp)),
    "slope_mean": float(np.nanmean(slope[in_parcel])),
    "slope_max": float(np.nanmax(slope[in_parcel])),
    "spad": dirs[int(((mean_aspect + 22.5) % 360) // 45)], "spad_deg": float(mean_aspect),
}
print("Statistika:", {k: (round(v, 2) if isinstance(v, float) else v) for k, v in stats.items()})

# ESRI ASCII grid (jen vnější obrys parcely, mimo = NoData)
asc = np.where(in_outer, GZ, -9999.0)
with open(os.path.join(OUT, "dem.asc"), "w") as f:
    f.write(f"ncols {len(xs)}\nnrows {len(ys)}\n"
            f"xllcenter {xs[0]:.3f}\nyllcenter {ys[0]:.3f}\n"
            f"cellsize {RES}\nNODATA_value -9999\n")
    np.savetxt(f, asc[::-1], fmt="%.3f")
with open(os.path.join(OUT, "dem.prj"), "w") as f:
    from pyproj import CRS
    f.write(CRS.from_epsg(5514).to_wkt("WKT1_ESRI"))

# --------------------------------------------------------------------------- #
# 3) Ortofoto (WMS ČÚZK) pro texturu
# --------------------------------------------------------------------------- #
ortho = None
try:
    w_px, h_px = len(xs) * 2, len(ys) * 2
    url = ("https://ags.cuzk.gov.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer?"
           "SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=0&STYLES=&CRS=EPSG:5514"
           f"&BBOX={gx0 - RES / 2},{gy0 - RES / 2},{gx1 + RES / 2},{gy1 + RES / 2}"
           f"&WIDTH={w_px}&HEIGHT={h_px}&FORMAT=image/png")
    img = Image.open(io.BytesIO(requests.get(url, timeout=60).content)).convert("RGB")
    img.save(os.path.join(OUT, "orthophoto.png"))
    arr = np.asarray(img)[::-1]                   # řádek 0 = jih
    ortho = arr[::2, ::2][: GX.shape[0], : GX.shape[1]] // 2 + arr[1::2, 1::2][: GX.shape[0], : GX.shape[1]] // 2
except Exception as e:  # noqa: BLE001
    print("Ortofoto se nepodařilo stáhnout:", e)

# --------------------------------------------------------------------------- #
# 4) Data aplikace (lokální souřadnice v metrech od levého dolního rohu mřížky)
# --------------------------------------------------------------------------- #
ox, oy = gx0, gy0
LX, LY = GX - ox, GY - oy


def drape(xy: np.ndarray, lift=0.08):
    """Přiloží linii na terén (zahustí body po 0.5 m)."""
    out = []
    for a, b in zip(xy[:-1], xy[1:]):
        n = max(2, int(np.hypot(*(b - a)) / 0.5))
        out.append(np.linspace(a, b, n, endpoint=False))
    out.append(xy[-1:])
    d = np.vstack(out)
    return d[:, 0] - ox, d[:, 1] - oy, interp(d[:, 0], d[:, 1]) + lift


def png_data_url(arr_u8: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(arr_u8).save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


g_min, g_max = float(np.nanmin(GZ)), float(np.nanmax(GZ))
ls_app = LightSource(azdeg=315, altdeg=45)
rel_rgb = ls_app.shade(GZ, cmap=plt.get_cmap("terrain"), vert_exag=3, blend_mode="soft",
                       vmin=g_min - 2, vmax=g_max + 1, dx=RES, dy=RES)
relief_url = png_data_url((rel_rgb[::-1, :, :3] * 255).astype(np.uint8))      # řádek 0 = sever
ortho_url = None
if os.path.exists(os.path.join(OUT, "orthophoto.png")):
    with open(os.path.join(OUT, "orthophoto.png"), "rb") as fimg:
        ortho_url = "data:image/png;base64," + base64.b64encode(fimg.read()).decode()

# vrstevnice po 0,25 m (hlavní po 1 m)
levels = np.arange(np.floor(g_min * 4) / 4, g_max + 0.25, 0.25)
fig_c = plt.figure()
cs_all = plt.contour(LX, LY, GZ, levels=levels)
contours = []
for z, segs in zip(cs_all.levels, cs_all.allsegs):
    lines = [np.round(s, 2).ravel().tolist() for s in segs if len(s) > 1]
    if lines:
        contours.append({"z": round(float(z), 2), "major": bool(abs(z - round(z)) < 1e-6), "lines": lines})
plt.close(fig_c)

app_data = {
    "res": RES, "nx": len(xs), "ny": len(ys), "origin": [float(ox), float(oy)],
    "dem": base64.b64encode(GZ.astype("<f4").tobytes()).decode(),
    "ortho": ortho_url, "relief": relief_url, "contours": contours,
    "parcel": np.round(ext - [ox, oy], 3).tolist(),
    "building": np.round(bld["exterior"] - [ox, oy], 3).tolist() if bld else None,
    "stats": stats,
    "project": {"id": SITE["id"], "name": SITE.get("name") or PARCEL_LABEL, "ku": SITE.get("ku", ""),
                "address": SITE.get("address", ""), "search": SITE.get("search", ""),
                "areaLabel": PARCEL_LABEL, "buildingLabel": BUILDING_LABEL, "parcels": [PARCEL_LABEL], "res": RES,
                "area": round(outer.area), "source": "ČÚZK: DMR 5G (LAZ, TIN), ortofoto WMS, WFS katastru"},
}
with open(os.path.join(OUT, "site.html"), "w", encoding="utf-8") as fh:
    fh.write(build_html(json.dumps(app_data, ensure_ascii=False, separators=(",", ":"))))
print(f"HTML aplikace: mřížka {len(xs)}x{len(ys)} po {RES} m, {len(contours)} vrstevnic")

# --------------------------------------------------------------------------- #
# 5) Statický náhled PNG
# --------------------------------------------------------------------------- #
fig2 = plt.figure(figsize=(21, 9), dpi=120)
ls = LightSource(azdeg=315, altdeg=45)
shade = ls.hillshade(np.nan_to_num(GZ, nan=zmin), vert_exag=3, dx=RES, dy=RES)
ext_img = [LX.min(), LX.max(), LY.min(), LY.max()]
levels = np.arange(np.floor(zmin), np.ceil(zmax) + 0.01, 0.25)
z_out = np.where(in_outer, GZ, np.nan)


def frame(a, title):
    a.plot(ext[:, 0] - ox, ext[:, 1] - oy, "r-", lw=2, label=PARCEL_LABEL)
    if bld:
        a.plot(bld["exterior"][:, 0] - ox, bld["exterior"][:, 1] - oy, color="gold", lw=2,
               label=f"{BUILDING_LABEL} (dům)")
    a.set_xlim(x0 - ox - 6, x1 - ox + 6)
    a.set_ylim(y0 - oy - 6, y1 - oy + 6)
    a.set_aspect("equal")
    a.set_title(title)
    a.set_xlabel("→ východ [m]")
    a.set_ylabel("→ sever [m]")
    a.legend(loc="lower left", fontsize=8)


# (a) výšková mapa + stínování + vrstevnice + spád
ax = fig2.add_subplot(1, 3, 1)
ax.imshow(shade, cmap="gray", origin="lower", extent=ext_img)
cf = ax.contourf(LX, LY, z_out, levels=40, cmap="terrain", alpha=0.6, vmin=zmin - 1.5, vmax=zmax + 0.5)
cs = ax.contour(LX, LY, z_out, levels=levels, colors="k", linewidths=0.4)
ax.clabel(cs, cs.levels[::4], fmt="%.0f", fontsize=7)
s = int(3 / RES)
qm = in_outer[::s, ::s]
ax.quiver(LX[::s, ::s][qm], LY[::s, ::s][qm], -dzdx[::s, ::s][qm], -dzdy[::s, ::s][qm],
          color="navy", scale=2.5, width=0.003)
frame(ax, "Výšky, vrstevnice po 0,25 m, šipky = spád")
plt.colorbar(cf, ax=ax, shrink=0.6, label="m n.m. (Bpv)")

# (b) ortofoto + vrstevnice
ax2 = fig2.add_subplot(1, 3, 2)
if ortho is not None:
    ax2.imshow(ortho, origin="lower", extent=ext_img)
cs2 = ax2.contour(LX, LY, z_out, levels=levels[::2], cmap="plasma", linewidths=1.0)
ax2.clabel(cs2, cs2.levels[::2], fmt="%.0f", fontsize=7, colors="w")
frame(ax2, "Ortofoto ČÚZK + vrstevnice po 0,5 m")

# (c) 3D pohled od severovýchodu
ax3 = fig2.add_subplot(1, 3, 3, projection="3d")
EX3 = 3
rgb = ls.shade(np.nan_to_num(z_out, nan=zmin), cmap=plt.get_cmap("terrain"), vert_exag=EX3,
               blend_mode="soft", vmin=zmin - 1.5, vmax=zmax + 0.5, dx=RES, dy=RES)
ax3.plot_surface(LX, LY, z_out, facecolors=rgb, rstride=1, cstride=1, linewidth=0,
                 antialiased=False, shade=False)
bx, by, bz = drape(ext, 0.05)
ax3.plot(bx, by, bz, "r-", lw=1.5)
if bld:
    bx, by, bz = drape(bld["exterior"], 0.05)
    ax3.plot(bx, by, bz, color="gold", lw=1.5)
ax3.set_xlim(x0 - ox, x1 - ox)
ax3.set_ylim(y0 - oy, y1 - oy)
ax3.set_zlim(zmin, zmax)
ax3.set_box_aspect((x1 - x0, y1 - y0, (zmax - zmin) * EX3))
ax3.view_init(elev=28, azim=35)
ax3.set_title(f"3D pohled od SV (převýšení {EX3}×)")
ax3.set_zlabel("m n.m.")
fig2.suptitle(f"{SITE.get('name') or PARCEL_LABEL} – DMR 5G (ČÚZK): "
              f"{stats['h_min']:.2f}–{stats['h_max']:.2f} m n.m., "
              f"Δh {stats['h_max'] - stats['h_min']:.2f} m, ø sklon {stats['slope_mean']:.1f}°, "
              f"spád k {stats['spad']}")
fig2.tight_layout()
fig2.savefig(os.path.join(OUT, "relief.png"))


# --------------------------------------------------------------------------- #
# 6) STL – vodotěsné těleso (terén + svislé stěny + podstava)
# --------------------------------------------------------------------------- #
def write_stl(path: str, exag: float):
    # buňka gridu je "uvnitř", pokud jsou uvnitř všechny 4 rohy (vnější obrys parcely)
    cell = in_outer[:-1, :-1] & in_outer[1:, :-1] & in_outer[:-1, 1:] & in_outer[1:, 1:]
    zbase = 0.0
    zt = (GZ - zmin) * exag + BASE        # výška nad podstavou, nejnižší bod = BASE
    lx, ly = LX - (x0 - ox), LY - (y0 - oy)
    tris = []
    rows, cols = np.nonzero(cell)
    for r, c in zip(rows, cols):
        p00 = (lx[r, c], ly[r, c]); p10 = (lx[r, c + 1], ly[r, c + 1])
        p01 = (lx[r + 1, c], ly[r + 1, c]); p11 = (lx[r + 1, c + 1], ly[r + 1, c + 1])
        z00, z10, z01, z11 = zt[r, c], zt[r, c + 1], zt[r + 1, c], zt[r + 1, c + 1]
        # horní plocha (normála nahoru: CCW při pohledu shora)
        tris.append(((*p00, z00), (*p10, z10), (*p11, z11)))
        tris.append(((*p00, z00), (*p11, z11), (*p01, z01)))
        # spodní plocha (normála dolů)
        tris.append(((*p00, zbase), (*p11, zbase), (*p10, zbase)))
        tris.append(((*p00, zbase), (*p01, zbase), (*p11, zbase)))
        # stěny tam, kde soused chybí
        def wall(a, za, b, zb_):
            tris.append(((*a, zbase), (*b, zbase), (*b, zb_)))
            tris.append(((*a, zbase), (*b, zb_), (*a, za)))
        if r == 0 or not cell[r - 1, c]:            # jižní hrana (p00 -> p10)
            wall(p00, z00, p10, z10)
        if r == cell.shape[0] - 1 or not cell[r + 1, c]:   # severní (p11 -> p01)
            wall(p11, z11, p01, z01)
        if c == 0 or not cell[r, c - 1]:            # západní (p01 -> p00)
            wall(p01, z01, p00, z00)
        if c == cell.shape[1] - 1 or not cell[r, c + 1]:   # východní (p10 -> p11)
            wall(p10, z10, p11, z11)
    t = np.asarray(tris, dtype=np.float32)
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    with open(path, "wb") as f:
        f.write(f"Garden relief DMR5G exag {exag}x, 1 unit = 1 m".encode().ljust(80, b" "))
        f.write(struct.pack("<I", len(t)))
        rec = np.zeros(len(t), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
        rec["n"], rec["v"] = n, t
        f.write(rec.tobytes())
    ext_ = t.reshape(-1, 3)
    return len(t), *(float(v) for v in ext_.max(0) - ext_.min(0))


for ex in (1, 3):
    nt, sx_, sy_, sz_ = write_stl(os.path.join(OUT, f"relief_{ex}x.stl"), ex)
    print(f"STL {ex}x: {nt} trojúhelníků, rozměr ~{sx_:.1f} x {sy_:.1f} x {sz_:.1f} (m = mm v 1:1000)")

with open(os.path.join(OUT, "stats.json"), "w", encoding="utf-8") as f:
    json.dump({"parcela": par["ref"], "vymera_KN_m2": par["area"], **stats,
               "zdroj": f"ČÚZK DMR 5G ({SITE.get('tile', 'LAZ')}), WFS CP, WMS ORTOFOTO",
               "vyskovy_system": "Bpv", "souradnice": "S-JTSK EPSG:5514"},
              f, ensure_ascii=False, indent=1)
print("Hotovo ->", OUT)
