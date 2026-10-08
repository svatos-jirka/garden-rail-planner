"""Zabalí projekt pro přenos na jiný počítač (bez pomocných a dočasných souborů).

Do ZIPu přidá i soukromou složku private/ (konfigurace, LAZ, výstupy) – ZIP proto nikam nezveřejňujte.
"""
import os
import zipfile

SRC = os.path.dirname(os.path.abspath(__file__))
ZIP = os.path.join(os.path.dirname(SRC), "garden-rail-planner_transfer.zip")
FILES = ["README.md", "NOTES.md", ".gitignore", "build.py", "relief.py", "find_tile.py", "compare_density.py",
         "make_zip.py", "test_solver.js", "site.example.json", "index.html", ".nojekyll"]
DIRS = ["app", "output", "private"]

with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in FILES:
        z.write(os.path.join(SRC, f), f"garden-rail-planner/{f}")
    for d in DIRS:
        for root, _, names in os.walk(os.path.join(SRC, d)):
            for n in sorted(names):
                p = os.path.join(root, n)
                z.write(p, "garden-rail-planner/" + os.path.relpath(p, SRC).replace(os.sep, "/"))

with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
    assert z.testzip() is None
print(f"{len(names)} souborů, {os.path.getsize(ZIP) / 1e6:.1f} MB -> {ZIP}")
for n in names:
    print("  ", n)
