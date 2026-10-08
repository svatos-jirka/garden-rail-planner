"""Najde mapový list SM5 (DMR 5G LAZ) obsahující bod a vypíše odkazy ke stažení.

Použití:  py find_tile.py <zem. šířka> <zem. délka>      (WGS84, např. py find_tile.py 50.08 14.42)
"""
import re
import sys
import xml.etree.ElementTree as ET

import requests

if len(sys.argv) != 3:
    sys.exit(__doc__)
LAT, LON = float(sys.argv[1]), float(sys.argv[2])
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "georss": "http://www.georss.org/georss",
}

tree = ET.ElementTree(ET.fromstring(
    requests.get("https://atom.cuzk.gov.cz/DMR5G-SJTSK/DMR5G-SJTSK.xml", timeout=300).content))
hits = []
for entry in tree.getroot().findall("a:entry", NS):
    poly = entry.find("georss:polygon", NS).text.split()
    lats = [float(v) for v in poly[0::2]]
    lons = [float(v) for v in poly[1::2]]
    if min(lats) <= LAT <= max(lats) and min(lons) <= LON <= max(lons):
        title = entry.find("a:title", NS).text
        feed = entry.find("a:link[@rel='alternate']", NS).get("href")
        hits.append((title, feed))

for title, feed in hits:
    print(title.encode("ascii", "replace").decode(), feed)
    r = requests.get(feed, timeout=60)
    for m in re.finditer(r'href="([^"]+\.zip)"', r.text):
        print("   ZIP:", m.group(1))
