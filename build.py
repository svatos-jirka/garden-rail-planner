"""Sestaví aplikaci do jednoho HTML souboru bez vestavěných dat: output/garden-rail-planner.html

Projekty se v ní zakládají podle adresy (data ČÚZK se stáhnou v prohlížeči) nebo importem ze souboru.
Stačí Python 3 a balíček plotly (kvůli plotly.js):  py -m pip install --user plotly
Funkci build_html používá i relief.py pro sestavení aplikace s vestavěným projektem.
"""
from __future__ import annotations

import os

from plotly.offline import get_plotlyjs

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "app")
OUT = os.path.join(HERE, "output", "garden-rail-planner.html")
APP_JS = ("js1_core.js", "js2_solve.js", "js3_plan.js", "js4_ui.js", "js5_survey.js")


def _read(name: str) -> str:
    with open(os.path.join(APP, name), encoding="utf-8") as f:
        return f.read()


def build_html(data_json: str = "") -> str:
    """HTML aplikace; data_json = JSON vestavěného projektu, nebo "" (aplikace bez dat)."""
    return (_read("app.html").replace("@@CSS@@", _read("style.css"))
            .replace("@@HELP@@", _read("help.html"))
            .replace("@@START@@", _read("js0_start.js"))
            .replace("@@JS@@", "\n".join(_read(n) for n in APP_JS))
            .replace("/*@@PLOTLY@@*/", get_plotlyjs())
            .replace("@@DATA@@", data_json))      # data až nakonec (nesmí se v nich nic nahrazovat)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(build_html(""))
    print(f"HTML aplikace bez dat: {os.path.getsize(OUT) / 1e6:.1f} MB -> {OUT}")
