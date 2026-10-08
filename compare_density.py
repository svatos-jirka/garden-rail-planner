"""Porovnání hustoty bodů DMR 5G a DMP 1G v parcele (pomocný skript).

Mapový list a cestu k LAZ bere z private/site.json, hranici parcely z private/output/parcel.geojson
(vytvoří ji relief.py). Stažený DMP 1G uloží do private/data/.
"""
import io
import json
import os
import re
import zipfile

import laspy
import numpy as np
import requests
from matplotlib.path import Path as MplPath
from pyproj import Transformer
from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
PRIVATE = os.path.join(HERE, "private")
with open(os.path.join(PRIVATE, "site.json"), encoding="utf-8") as f:
    SITE = json.load(f)
with open(os.path.join(PRIVATE, "output", "parcel.geojson"), encoding="utf-8") as f:
    lonlat = np.array(json.load(f)["features"][0]["geometry"]["coordinates"][0])
to_sjtsk = Transformer.from_crs("EPSG:4326", "EPSG:5514", always_xy=True)
ext = np.column_stack(to_sjtsk.transform(lonlat[:, 0], lonlat[:, 1]))      # vnější obrys parcely v S-JTSK
area = Polygon(ext).area
x0, y0 = ext.min(0) - 10
x1, y1 = ext.max(0) + 10

FEED = f"https://atom.cuzk.gov.cz/DMP1G-SJTSK/datasetFeeds/CZ-00025712-CUZK_DMP1G-SJTSK_{SITE['tile']}.xml"
r = requests.get(FEED, timeout=60)
urls = re.findall(r'href="([^"]+\.zip)"', r.text)
print("DMP 1G feed:", r.status_code, urls)
sub = re.search(r"<subtitle>(.*?)</subtitle>", r.text, re.S)
if sub:
    print(sub.group(1)[:500])
z = requests.get(urls[0], timeout=600).content
print("ZIP MB:", round(len(z) / 1e6, 1))
zf = zipfile.ZipFile(io.BytesIO(z))
name = [n for n in zf.namelist() if n.lower().endswith((".laz", ".las"))][0]
dmp = os.path.join(PRIVATE, "data", "dmp1g_" + name.split("/")[-1])
os.makedirs(os.path.dirname(dmp), exist_ok=True)
with open(dmp, "wb") as f:
    f.write(zf.read(name))
las = laspy.read(dmp)
x, y = np.asarray(las.x), np.asarray(las.y)
print("bodů v listu:", len(x), "třídy:", np.unique(np.asarray(las.classification), return_counts=True))

for nm, path in (("DMP 1G", dmp), ("DMR 5G", os.path.join(PRIVATE, SITE["laz"]))):
    l = laspy.read(path)
    X, Y = np.asarray(l.x), np.asarray(l.y)
    m = (X > x0) & (X < x1) & (Y > y0) & (Y < y1)
    inside = MplPath(ext).contains_points(np.column_stack([X[m], Y[m]]))
    n = int(inside.sum())
    print(f"{nm}: v parcele {n} bodů = {n / area:.2f} b/m², průměrná rozteč {np.sqrt(area / max(n, 1)):.2f} m")
