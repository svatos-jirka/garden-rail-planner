// Test výpočetního jádra (js1 + js2) v Node bez prohlížeče
// Terén: private/output/site.html (soukromé sestavení relief.py), jinak umělý svah – repozitář data pozemku neobsahuje.
// Vynutit umělý svah:  node test_solver.js --synthetic
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'app');
const site = path.join(__dirname, 'private', 'output', 'site.html');
let data;
if (fs.existsSync(site) && !process.argv.includes('--synthetic')) {
  const m = fs.readFileSync(site, 'utf8').match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/);
  data = JSON.parse(m[1]);
  console.log('terén: private/output/site.html');
} else {
  data = syntheticData();
  console.log('terén: umělý svah');
}
function syntheticData() {             // svah ~7 % k SV s vlnami ±0,4 m, parcela 35,5 × 65 m s domem
  const res = .25, nx = 222, ny = 341, z = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * res, y = j * res;
    z[j * nx + i] = 390 - .05 * x - .05 * y + .4 * Math.sin(x / 6) * Math.cos(y / 9);
  }
  return {res, nx, ny, origin: [0, 0], dem: Buffer.from(z.buffer).toString('base64'),
    parcel: [[10, 10], [45.5, 10], [45.5, 75], [10, 75], [10, 10]],
    building: [[20, 18], [32, 18], [32, 28], [20, 28], [20, 18]],
    contours: [], stats: {}, project: {id: 'synthetic', name: 'Umělý svah'}};
}
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.window = {addEventListener() {}, PRJ: {id: 'test', name: 'test', data}};
global.document = {getElementById: id => id === 'data' ? {textContent: JSON.stringify(data)} : {style: {}, textContent: ''}};
const code = fs.readFileSync(path.join(dir, 'js1_core.js'), 'utf8') + '\n' + fs.readFileSync(path.join(dir, 'js2_solve.js'), 'utf8') + `
// --- ukázka: ovál R10 + výhybka ---
function addTrack(g) { const e = {type: 'track', id: M.nextId++, x: g.x, y: g.y, h: g.h, k: g.k, L: g.L, gMax: null}; M.elements.push(e); return e; }
const snapStep = v => Math.round(v / S.step) * S.step;
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
const R = 10, Ls = 4, ax = 98.5 * Math.PI / 180, C = {x: (x0 + x1) / 2 - 2, y: (y0 + y1) / 2 + 12.5};
const tx = Math.cos(ax), ty = Math.sin(ax), rx = Math.sin(ax), ry = -Math.cos(ax);
const P0 = {x: snapStep(C.x + rx * R - tx * Ls / 2), y: snapStep(C.y + ry * R - ty * Ls / 2)};
M.elements.push({type: 'start', id: M.nextId++, x: P0.x, y: P0.y, h: ax});
let cur = {x: P0.x, y: P0.y, h: ax};
const go = (k, L) => { const e = addTrack({x: cur.x, y: cur.y, h: cur.h, k, L}); const p = segAt(e, L); cur = {x: p.x, y: p.y, h: p.th}; return e; };
go(0, Ls); go(1 / R, Math.PI * R); const west = go(0, Ls); go(1 / R, Math.PI * R); const tL = {type: 'turnout', side: 1, R: S.toR, n: S.toN, L: S.toL, route: 'B'}, Lm = turnoutGeom(tL).Lmain; { const s = .25, p = segAt(west, s); const t = Object.assign(tL, {id: M.nextId++, x: p.x, y: p.y, h: p.th}); addTrack(subSeg(west, s + Lm, west.L)); Object.assign(west, subSeg(west, 0, s)); M.elements.push(t); const g = turnoutGeom(t); addTrack({x: g.C.x, y: g.C.y, h: g.C.th, k: 0, L: 3}); }
const t0 = Date.now();
NET = solve(); evaluate(NET); runChecks(NET);
console.log('čas ms', Date.now() - t0, 'uzlů', NET.nodes.length, 'hran', NET.edges.length, 'trojic', NET.trips.length, 'spojů', NET.conn.size / 2);
let worst = 0, wi = null;
for (const e of NET.edges) { const g = Math.abs(NET.h[e.b] - NET.h[e.a]) / e.len; if (g - e.lim > worst) { worst = g - e.lim; wi = e; } }
console.log('max překročení sklonu hrany', worst, wi && {lim: wi.lim, len: wi.len, a: wi.a, b: wi.b, ha: NET.h[wi.a], hb: NET.h[wi.b]});
console.log('souhrn', NET.sum);
console.log('varování', NET.warn.map(w => w.lvl + ' ' + w.msg));
const set = NET.sets[1]; console.log('oblouk h[0..8]', set.pts.slice(0, 8).map(p => p.h.toFixed(4)).join(' '));
`;
eval(code);

