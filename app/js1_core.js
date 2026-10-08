'use strict';
/* ===================== 1) data, terén, nastavení, geometrie ===================== */
const $ = id => document.getElementById(id);
const errBox = $('err');
function showErr(m) { errBox.style.display = 'block'; errBox.textContent += m + '\n'; }
window.addEventListener('error', ev => showErr('Chyba: ' + ev.message + ' (ř. ' + ev.lineno + ')'));

/* data projektu připraví úvodní okno (js0_start.js) do window.PRJ = {id, name, data} */
const PRJ = window.PRJ || {id: 'projekt', name: 'Projekt', data: JSON.parse($('data').textContent)};
const D = PRJ.data, PMETA = D.project || {};
const RES = D.res, NX = D.nx, NY = D.ny, XMAX = (NX - 1) * RES, YMAX = (NY - 1) * RES;
const DEM = (() => {
  const b = atob(D.dem), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return new Float32Array(u.buffer);
})();
let DZMIN = Infinity, DZMAX = -Infinity;
for (const v of DEM) { if (v < DZMIN) DZMIN = v; if (v > DZMAX) DZMAX = v; }

function terrain(x, y) {
  let fx = x / RES, fy = y / RES;
  if (!(fx > 0)) fx = 0; if (!(fy > 0)) fy = 0;
  if (fx > NX - 1.000001) fx = NX - 1.000001;
  if (fy > NY - 1.000001) fy = NY - 1.000001;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, o = j * NX + i;
  return (DEM[o] * (1 - u) + DEM[o + 1] * u) * (1 - v) + (DEM[o + NX] * (1 - u) + DEM[o + NX + 1] * u) * v;
}
const AREA = D.rings && D.rings.length ? D.rings : [D.parcel];     // hranice pozemku (lokální m): vnější obrysy i otvory, sudo-liché pravidlo
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };   // > 0 proti směru hodin
const PARCEL = D.parcel || AREA.reduce((a, r) => Math.abs(ringArea(r)) > Math.abs(ringArea(a)) ? r : a);   // největší obrys (rozsah zobrazení)
const BUILDINGS = D.buildings || (D.building ? [D.building] : []);  // budovy (polygony)
const BUILDING = BUILDINGS[0] || null;
const ORIGIN = D.origin;          // [x0, y0] EPSG:5514
const AREA_LABEL = PMETA.areaLabel || '';                          // např. „123/4“
const FILE_ID = String(PRJ.id).replace(/[^\w.-]+/g, '_');         // do názvů exportovaných souborů

/* --- formátování --- */
const f = (v, d = 2) => (v == null || !isFinite(v)) ? '–' : v.toFixed(d).replace('.', ',');
const fs = (v, d = 2) => (v > 0 ? '+' : '') + f(v, d);
const TAU = 2 * Math.PI;
const n2pi = a => ((a % TAU) + TAU) % TAU;
const deg = r => r * 180 / Math.PI;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

/* --- předvolby rozchodů (orientační hodnoty, viz Nápověda) --- */
const PRESETS = {
  '3.5':  {gauge: .089, head: .008, rMin: 4.5, rRec: 7.5, gMax: 2, gRec: 1, gTurnout: 1, curveComp: .2, rvMin: 15, sMin: .75,
           vDesign: 5, cantMax: 5, aLat: .5, clearBound: .4, hConstr: .07, bForm: .35, mFill: 1.5, mCut: 1, warnEarth: .3,
           toR: 4.5, toRY: 9, toN: 5, toL: 1.3, xAng: 30, rFlex: 7.5, slLen: .18, slPitch: .11},
  '5':    {gauge: .127, head: .012, rMin: 6, rRec: 10, gMax: 2, gRec: 1, gTurnout: 1, curveComp: .2, rvMin: 20, sMin: 1,
           vDesign: 6, cantMax: 8, aLat: .5, clearBound: .5, hConstr: .10, bForm: .45, mFill: 1.5, mCut: 1, warnEarth: .4,
           toR: 6, toRY: 12, toN: 5, toL: 1.8, xAng: 30, rFlex: 10, slLen: .26, slPitch: .15},
  '7.25': {gauge: .184, head: .016, rMin: 9, rRec: 15, gMax: 2, gRec: 1, gTurnout: 1, curveComp: .2, rvMin: 30, sMin: 1.5,
           vDesign: 8, cantMax: 12, aLat: .5, clearBound: .6, hConstr: .15, bForm: .65, mFill: 1.5, mCut: 1, warnEarth: .5,
           toR: 10, toRY: 20, toN: 6, toL: 2.8, xAng: 30, rFlex: 15, slLen: .36, slPitch: .20},
};
PRESETS['7.5'] = Object.assign({}, PRESETS['7.25'], {gauge: .1905});

const FIELDS = [
  ['lim', 'rMin', 'Min. poloměr oblouku', 'm', .5],
  ['lim', 'rRec', 'Doporučený min. poloměr', 'm', .5],
  ['lim', 'gMax', 'Max. stoupání', '%', .1],
  ['lim', 'gRec', 'Doporučené stoupání', '%', .1],
  ['lim', 'gTurnout', 'Max. sklon ve výhybce', '%', .1],
  ['lim', 'curveComp', 'Kompenzace stoupání v oblouku c', '·G/R', .05],
  ['lim', 'rvMin', 'Min. poloměr výškového zakružení', 'm', 1],
  ['lim', 'sMin', 'Min. přímá mezi protisměrnými oblouky', 'm', .25],
  ['lim', 'vDesign', 'Návrhová rychlost', 'km/h', .5],
  ['lim', 'cantMax', 'Max. převýšení koleje', 'mm', 1],
  ['lim', 'aLat', 'Max. nevyrovnané boční zrychlení', 'm/s²', .05],
  ['lim', 'clearBound', 'Min. odstup osy od hranice', 'm', .05],
  ['lim', 'xAng', 'Min. úhel křížení X', '°', 1],
  ['stav', 'hConstr', 'Konstrukční výška (TK nad plání)', 'm', .01],
  ['stav', 'bForm', 'Šířka pláně', 'm', .05],
  ['stav', 'mFill', 'Svah násypu 1 :', '', .1],
  ['stav', 'mCut', 'Svah zářezu 1 :', '', .1],
  ['stav', 'warnEarth', 'Upozornit na násyp/zářez nad', 'm', .05],
  ['vys', 'offset', 'Cílová výška pláně nad terénem', 'm', .01],
  ['vys', 'smooth', 'Vyhlazení nivelety (0–1)', '', .05],
  ['vyh', 'toR', 'Poloměr odbočné větve', 'm', .5],
  ['vyh', 'toRY', 'Poloměr větví Y výhybky', 'm', .5],
  ['vyh', 'toN', 'Úhel odbočení 1 :', '', .5],
  ['vyh', 'toL', 'Délka výhybky', 'm', .05],
  ['zem', 'kUse', 'Z 1 m³ výkopu hutněného násypu', 'm³', .05],
  ['zem', 'kSwell', 'Nakypření zeminy (odvoz / dovoz)', '×', .05],
  ['mer', 'svLen', 'Dosah vlivu bodu (korelační délka)', 'm', .5],
  ['mer', 'svNoise', 'Přesnost bodu (laser + umístění)', 'm', .01],
];

/* --- předpoklad ceny: výchozí ceny (Kč vč. DPH) – jen hrubý odhad pro ukázku, přepište podle nabídek --- */
const COST_G = {          // podle rozchodu
  '3.5':  {rail: 110, ready: 700,  sleeper: 12, fix: 3, joint: 40,  to: 4500,  toY: 5000,  toC: 6000,  cross: 3500,  buffer: 400,  railLen: 2, tBal: .04},
  '5':    {rail: 190, ready: 1300, sleeper: 25, fix: 4, joint: 70,  to: 9000,  toY: 10000, toC: 12000, cross: 8000,  buffer: 800,  railLen: 3, tBal: .06},
  '7.25': {rail: 320, ready: 2600, sleeper: 60, fix: 6, joint: 120, to: 28000, toY: 30000, toC: 35000, cross: 25000, buffer: 1500, railLen: 3, tBal: .08},
};
COST_G['7.5'] = Object.assign({}, COST_G['7.25']);
const COST_C = {mode: 'parts', ballast: 700, rho: 1.6, geo: 25, dig: 350, fill: 150, haul: 500, imp: 450, other: 0, reserve: 10};
const costG = () => Object.assign({}, COST_G[S.gaugeKey] || COST_G['5'], (S.costG || {})[S.gaugeKey]);
const costC = () => Object.assign({}, COST_C, S.costC);

/* --- stav --- */
const LS_KEY = `zeleznice_${PRJ.id}_v1`;
let S = Object.assign({gaugeKey: '5', step: .25, gDesignMode: 'rec', offset: 0, smooth: .3, strictR: true, rCircle: null, kUse: .85, kSwell: 1.25, svLen: 3, svNoise: .05}, PRESETS['5']);
let M = {elements: [], pins: {}, nextId: 1};
let undoS = [], redoS = [];
let sel = null;          // id vybraného prvku
let tool = 'select';
let NET = null;          // výsledky výpočtu

/* --- geometrie: úsek konstantní křivosti {x,y,h,k,L} --- */
function segAt(g, s) {
  const th = g.h + g.k * s;
  if (Math.abs(g.k) < 1e-9) return {x: g.x + s * Math.cos(g.h), y: g.y + s * Math.sin(g.h), th};
  return {x: g.x + (Math.sin(th) - Math.sin(g.h)) / g.k, y: g.y - (Math.cos(th) - Math.cos(g.h)) / g.k, th};
}
function subSeg(g, s0, s1) { const p = segAt(g, s0); return {x: p.x, y: p.y, h: p.th, k: g.k, L: s1 - s0}; }

function arcThrough(P, a, Q) {          // oblouk tečný ke směru a v P, procházející Q
  const cx = Q.x - P.x, cy = Q.y - P.y, tx = Math.cos(a), ty = Math.sin(a);
  const cr = tx * cy - ty * cx, dt = tx * cx + ty * cy, c2 = cx * cx + cy * cy;
  if (c2 < 1e-8) return null;
  const k = 2 * cr / c2;
  if (Math.abs(k) < 1e-7) return dt > 1e-4 ? {x: P.x, y: P.y, h: a, k: 0, L: dt} : null;
  const phi = 2 * Math.atan2(cr, dt);
  return {x: P.x, y: P.y, h: a, k, L: phi / k};
}
function arcThenLine(P, a, Q, R) {     // oblouk R k tečně a pak přímá do Q
  const tx = Math.cos(a), ty = Math.sin(a), dx = Q.x - P.x, dy = Q.y - P.y;
  const cr = tx * dy - ty * dx, dt = tx * dx + ty * dy;
  if (Math.abs(cr) < 1e-6 * Math.hypot(dx, dy) && dt > 0) return [{x: P.x, y: P.y, h: a, k: 0, L: dt}];
  const sg = cr >= 0 ? 1 : -1, nx = -ty * sg, ny = tx * sg;
  const C = {x: P.x + nx * R, y: P.y + ny * R};
  const mx = Q.x - C.x, my = Q.y - C.y, d = Math.hypot(mx, my);
  if (d < R * 1.0001) return null;
  const beta = Math.atan2(my, mx), a0 = Math.atan2(P.y - C.y, P.x - C.x), ac = Math.acos(R / d);
  let sweep = sg > 0 ? n2pi(beta - ac - a0) : n2pi(a0 - beta - ac);
  if (sweep > TAU - 1e-6) sweep = 0;
  const arc = {x: P.x, y: P.y, h: a, k: sg / R, L: R * sweep};
  const T = segAt(arc, arc.L), Ls = Math.sqrt(d * d - R * R), out = [];
  if (arc.L > 1e-4) out.push(arc);
  if (Ls > 1e-4) out.push({x: T.x, y: T.y, h: T.th, k: 0, L: Ls});
  return out.length ? out : null;
}
function biarc(P, a1, Q, a2) {          // dva oblouky z (P,a1) do (Q,a2)
  const t1 = [Math.cos(a1), Math.sin(a1)], t2 = [Math.cos(a2), Math.sin(a2)];
  const v = [Q.x - P.x, Q.y - P.y], t = [t1[0] + t2[0], t1[1] + t2[1]];
  const c = t1[0] * t2[0] + t1[1] * t2[1], vt = v[0] * t[0] + v[1] * t[1], vv = v[0] * v[0] + v[1] * v[1];
  let d;
  if (1 - c < 1e-9) { const vt1 = v[0] * t1[0] + v[1] * t1[1]; if (vt1 <= 1e-9) return null; d = vv / (4 * vt1); }
  else d = (-vt + Math.sqrt(vt * vt + 2 * (1 - c) * vv)) / (2 * (1 - c));
  if (!(d > 1e-6)) return null;
  const q1 = [P.x + d * t1[0], P.y + d * t1[1]], q2 = [Q.x - d * t2[0], Q.y - d * t2[1]];
  const J = {x: (q1[0] + q2[0]) / 2, y: (q1[1] + q2[1]) / 2};
  const g1 = arcThrough(P, a1, J);
  const aJ = Math.atan2(q2[1] - q1[1], q2[0] - q1[0]);
  const g2 = arcThrough(J, aJ, Q);
  const out = [g1, g2].filter(g => g && g.L > 1e-4);
  if (!out.length) return null;
  const last = out[out.length - 1], e = segAt(last, last.L);
  if (Math.hypot(e.x - Q.x, e.y - Q.y) > 0.005) return null;
  return out;
}

/* --- prvky --- */
// běžná výhybka: přímá větev A→B + odbočka A→C (oblouk R, úhel atan(1/n), pak přímá)
// Y výhybka (kind 'Y'): dvě symetrické větve vlevo (B) a vpravo (C), každá oblouk R o úhlu atan(1/n)/2
function turnoutGeom(e) {
  const al = Math.atan(1 / e.n);
  const branch = (k, ang) => {
    const R = 1 / Math.abs(k), xa = R * Math.sin(ang);
    const tail = Math.max(0, (e.L - xa) / Math.cos(ang));
    const arc = {x: e.x, y: e.y, h: e.h, k, L: R * ang};
    const pa = segAt(arc, arc.L), segs = [arc];
    if (tail > 1e-6) segs.push({x: pa.x, y: pa.y, h: pa.th, k: 0, L: tail});
    const last = segs[segs.length - 1];
    return {segs, end: segAt(last, last.L), L: arc.L + tail, xa};
  };
  if (e.kind === 'Y') {
    const l = branch(1 / e.R, al / 2), r = branch(-1 / e.R, al / 2);
    return {Y: true, main: l.segs, div: r.segs, B: l.end, C: r.end, Lmain: l.L, Ldiv: r.L, al, Lx: Math.max(e.L, l.xa), kMainAbs: 1 / e.R, kDivAbs: 1 / e.R};
  }
  const km = e.km || 0;
  if (Math.abs(km) > 1e-9) {        // oblouková výhybka: hlavní větev po oblouku km, odbočka o úhel al od ní (1/Rd ≈ km + side/R)
    const kd = km + e.side / e.R, Ld = e.R * al, Lmain = Math.max(e.L, Ld);
    const main = {x: e.x, y: e.y, h: e.h, k: km, L: Lmain};
    const arc = {x: e.x, y: e.y, h: e.h, k: kd, L: Ld}, pa = segAt(arc, Ld), div = [arc];
    if (Lmain - Ld > 1e-6) div.push({x: pa.x, y: pa.y, h: pa.th, k: km, L: Lmain - Ld});
    const last = div[div.length - 1];
    return {curved: true, main: [main], div, B: segAt(main, Lmain), C: segAt(last, last.L), Lmain, Ldiv: Lmain, al, Lx: Lmain,
            km, kd, kMainAbs: Math.abs(km), kDivAbs: Math.max(Math.abs(kd), Math.abs(km))};
  }
  const d = branch(e.side / e.R, al), Lmain = Math.max(e.L, d.xa);
  const main = {x: e.x, y: e.y, h: e.h, k: 0, L: Lmain};
  return {main: [main], div: d.segs, B: segAt(main, Lmain), C: d.end, Lmain, Ldiv: d.L, al, Lx: Lmain, kMainAbs: 0, kDivAbs: 1 / e.R};
}
const turnoutDivR = t => 1 / Math.max(1e-12, turnoutGeom(Object.assign({x: 0, y: 0, h: 0}, t)).kDivAbs);   // nejmenší poloměr odbočky
function ports(e) {   // a = směr ven z prvku
  if (e.type === 'start') return [{x: e.x, y: e.y, a: e.h}];
  if (e.type === 'cross') return [];
  if (e.type === 'track') { const p = segAt(e, e.L); return [{x: e.x, y: e.y, a: e.h + Math.PI}, {x: p.x, y: p.y, a: p.th}]; }
  const g = turnoutGeom(e);
  return [{x: e.x, y: e.y, a: e.h + Math.PI}, {x: g.B.x, y: g.B.y, a: g.B.th}, {x: g.C.x, y: g.C.y, a: g.C.th}];
}
const elById = id => M.elements.find(e => e.id === id);
const isFullCircle = e => e && e.type === 'track' && Math.abs(e.k) > 1e-9 && Math.abs(Math.abs(e.k) * e.L - TAU) < 1e-6;
function elName(e) {
  if (!e) return '?';
  if (e.type === 'start') return `Vstupní bod #${e.id}`;
  if (e.type === 'cross') return `Křížení X #${e.id}`;
  if (e.type === 'turnout') return e.kind === 'Y' ? `Výhybka Y #${e.id}` : `${Math.abs(e.km || 0) > 1e-9 ? 'Oblouková výhybka' : 'Výhybka'} ${e.side > 0 ? 'L' : 'P'} #${e.id}`;
  if (isFullCircle(e)) return `Kruh #${e.id}`;
  return Math.abs(e.k) < 1e-9 ? `Přímá #${e.id}` : `Oblouk #${e.id}`;
}
const portLabel = (e, i) => e.type === 'turnout' ? (e.kind === 'Y' ? ['A (hrot)', 'B (vlevo)', 'C (vpravo)'] : ['A (hrot)', 'B (přímo)', 'C (odbočka)'])[i]
  : (e.type === 'start' || e.type === 'cross') ? 'bod' : ['začátek', 'konec'][i];
function pinName(key) {                 // čitelný název výškového bodu podle klíče „id:konec“
  const [id, i] = key.split(':').map(Number), e = M.elements.find(x => x.id === id);
  if (!e) return `#${id} (prvek neexistuje)`;
  return e.type === 'start' || e.type === 'cross' ? elName(e) : `${elName(e)} – ${portLabel(e, i) || 'konec ' + i}`;
}

/* --- spojení portů (podle polohy) --- */
function buildConn() {
  const all = [];
  for (const e of M.elements) if (e.type === 'track' || e.type === 'turnout') ports(e).forEach((p, i) => all.push({e, i, x: p.x, y: p.y, a: p.a, key: e.id + ':' + i}));
  const cell = .05, grid = new Map();
  const ck = (gx, gy) => gx + ',' + gy;
  for (const p of all) {
    const k = ck(Math.floor(p.x / cell), Math.floor(p.y / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  const near = (x, y, tol, fn) => {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = grid.get(ck(gx + dx, gy + dy));
      if (arr) for (const q of arr) { const d = Math.hypot(q.x - x, q.y - y); if (d < tol) fn(q, d); }
    }
  };
  const conn = new Map();
  for (const p of all) {
    if (conn.has(p.key)) continue;
    let best = null, bd = 1;
    near(p.x, p.y, .01, (q, d) => {
      if (q.key === p.key || conn.has(q.key)) return;     // vlastní 2 konce = celý kruh (uzavřený)
      if (Math.cos(q.a - p.a) < -.98 && d < bd) { best = q; bd = d; }
    });
    if (best) { conn.set(p.key, best); conn.set(best.key, p); }
  }
  const startAt = new Map(), open = [];
  for (const p of all) if (!conn.has(p.key)) open.push(p);
  for (const e of M.elements) if (e.type === 'start') {
    let hit = null;
    near(e.x, e.y, .01, q => { if (!hit) hit = q; });
    if (hit) startAt.set(e.id, hit);
    else open.push({e, i: 0, x: e.x, y: e.y, a: e.h, key: e.id + ':0'});
  }
  // křížení X: všechny konce kolejí v bodě křížení (obě koleje jsou v něm rozdělené)
  const crossPorts = new Map(), portCross = new Map();
  for (const e of M.elements) if (e.type === 'cross') {
    const list = [];
    near(e.x, e.y, .02, q => list.push(q));
    crossPorts.set(e.id, list);
    for (const q of list) portCross.set(q.key, e.id);
  }
  return {all, conn, startAt, open, crossPorts, portCross};
}

/* --- historie --- */
function pushUndo() { undoS.push(JSON.stringify(M)); if (undoS.length > 300) undoS.shift(); redoS = []; }
function undo() { if (!undoS.length) return; redoS.push(JSON.stringify(M)); M = JSON.parse(undoS.pop()); afterModel(); }
function redo() { if (!redoS.length) return; undoS.push(JSON.stringify(M)); M = JSON.parse(redoS.pop()); afterModel(); }
function afterModel() { if (sel != null && !elById(sel)) sel = null; recompute(); }
function delPins(id) { for (const k of Object.keys(M.pins)) if (k.split(':')[0] === String(id)) delete M.pins[k]; }
function movePin(from, to) { if (M.pins[from]) { M.pins[to] = M.pins[from]; delete M.pins[from]; } }

/* --- tuhá transformace komponenty --- */
function rigid(e, cx, cy, dth, tx, ty) {
  const c = Math.cos(dth), s = Math.sin(dth), dx = e.x - cx, dy = e.y - cy;
  e.x = cx + c * dx - s * dy + tx; e.y = cy + s * dx + c * dy + ty; e.h += dth;
}
function componentFrom(e0, excludeId) {      // propojená skupina (přes spoje i přes křížení X)
  const seen = new Set([e0.id]), q = [e0];
  const add = el => { if (el && el.id !== excludeId && !seen.has(el.id)) { seen.add(el.id); q.push(el); } };
  while (q.length) {
    const e = q.pop();
    if (e.type === 'cross') { for (const p of NET.crossPorts.get(e.id) || []) add(p.e); continue; }
    ports(e).forEach((p, i) => {
      const key = e.id + ':' + i, n = NET.conn.get(key);
      if (n) add(n.e);
      const cid = NET.portCross.get(key);
      if (cid != null) { add(elById(cid)); for (const pp of NET.crossPorts.get(cid) || []) add(pp.e); }
    });
  }
  return seen;
}
function startComponent(st) {   // prvky připojené ke vstupnímu bodu (+ starty ležící na nich)
  const ids = new Set([st.id]);
  const hit = NET.startAt.get(st.id);
  if (hit) for (const id of componentFrom(hit.e, -1)) ids.add(id);
  for (const e of M.elements) if (e.type === 'start' && e !== st) {
    const h = NET.startAt.get(e.id); if (h && ids.has(h.e.id)) ids.add(e.id);
  }
  return ids;
}
