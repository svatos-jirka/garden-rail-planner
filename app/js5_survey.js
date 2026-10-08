/* ===================== 5) kontrolní body: odečty z laseru → zpřesnění terénu ===================== */
/* Bod: {id, n název, x, y (lokálně m), t typ, v hodnota, st stanovisko, k známá výška}
   t = 'lat'  odečet na lati od rotačního laseru [m]: výška = H_stanoviska − odečet (větší odečet = níž)
       'rel'  relativní výška [m] (+ nahoru) v rámci stanoviska: výška = C_stanoviska + hodnota
       'abs'  výška terénu v m n.m. (Bpv), např. od geodeta nebo z RTK GNSS
   Horizont stanoviska (H / C) se bere ze „známé výšky“ bodů stanoviska (průměr), jinak se dopočítá
   tak, aby body seděly na DMR (medián) – tvar terénu se zpřesní, celková výška zůstane podle DMR.
   Rozdíly měření − DMR se proloží plochou (jednoduchý kriging, Gaussova kovariance s dosahem svLen),
   která v bodech sedí na měření (s přesností svNoise) a dál od bodů se vrací k DMR. */
const SV_KEY = `mereni_${PRJ.id}_v1`, SV_SIG = .2;      // SV_SIG = očekávaná odchylka DMR 5G od skutečnosti [m]
const DEM0 = Float32Array.from(DEM);                   // původní DMR (DEM se přepisuje opraveným terénem)
const CORR = new Float32Array(NX * NY);
const PATH0 = {minor: PATH.minor, major: PATH.major, labels: PATH.labels};
let SV = {use: true, pts: [], nextId: 1, defT: 'lat', defSt: '1', open: false, selId: null};
let SVR = null;

function bilin(A, x, y) {
  let fx = x / RES, fy = y / RES;
  if (!(fx > 0)) fx = 0; if (!(fy > 0)) fy = 0;
  if (fx > NX - 1.000001) fx = NX - 1.000001;
  if (fy > NY - 1.000001) fy = NY - 1.000001;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, o = j * NX + i;
  return (A[o] * (1 - u) + A[o + 1] * u) * (1 - v) + (A[o + NX] * (1 - u) + A[o + NX + 1] * u) * v;
}
const terrain0 = (x, y) => bilin(DEM0, x, y);
const svIn = (x, y) => isFinite(x) && isFinite(y) && x >= 0 && y >= 0 && x <= XMAX && y <= YMAX;
const svNum = v => (v === '' || v == null) ? NaN : typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
const svMedian = a => { const b = a.slice().sort((p, q) => p - q), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const svStKey = p => p.t + ':' + (String(p.st == null ? '' : p.st).trim() || '1');
const svById = id => SV.pts.find(p => p.id === id);
const fs2 = v => Math.abs(v) < .005 ? '0,00' : fs(v, 2);      // bez záporné nuly

/* --- výpočet: výšky bodů, stanoviska, kriging rozdílů k DMR --- */
function svCompute() {
  const meas = SV.pts.filter(p => svIn(p.x, p.y) && isFinite(svNum(p.v)));
  const st = new Map();
  for (const p of meas) if (p.t !== 'abs') {
    const key = svStKey(p);
    if (!st.has(key)) st.set(key, {key, t: p.t, name: key.split(':')[1], pts: [], sg: p.t === 'lat' ? -1 : 1});
    st.get(key).pts.push(p);
  }
  for (const s of st.values()) {
    const kn = s.pts.filter(p => isFinite(svNum(p.k)));
    if (kn.length) { s.C = kn.reduce((a, p) => a + svNum(p.k) - s.sg * svNum(p.v), 0) / kn.length; s.how = 'known'; }
    else { s.C = svMedian(s.pts.map(p => terrain0(p.x, p.y) - s.sg * svNum(p.v))); s.how = 'dmr'; }
    s.weak = s.how === 'dmr' && s.pts.length < 3;       // 1–2 body navázané na DMR tvar terénu skoro neupřesní
  }
  const R = meas.map(p => {
    const z0 = terrain0(p.x, p.y), s = p.t === 'abs' ? null : st.get(svStKey(p));
    const z = s ? s.C + s.sg * svNum(p.v) : svNum(p.v);
    return {p, z, z0, r: z - z0, s};
  });
  const use = R.filter(q => !(q.s && q.s.how === 'dmr' && q.s.pts.length < 2));
  const n = use.length, l2 = 2 * Math.max(.25, S.svLen) ** 2, s2 = SV_SIG ** 2, nn = Math.max(.005, S.svNoise) ** 2;
  const out = {R, st, use, alpha: [], looRms: null};
  if (!n) return out;
  const A = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    const d2 = (use[i].p.x - use[j].p.x) ** 2 + (use[i].p.y - use[j].p.y) ** 2;
    A[i * n + j] = A[j * n + i] = s2 * Math.exp(-d2 / l2) + (i === j ? nn : 0);
  }
  for (let j = 0; j < n; j++) {                       // Cholesky A = L·Lᵀ (dolní trojúhelník na místě)
    let s = A[j * n + j];
    for (let k = 0; k < j; k++) s -= A[j * n + k] ** 2;
    const d = Math.sqrt(Math.max(s, 1e-12)); A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) { let t = A[i * n + j]; for (let k = 0; k < j; k++) t -= A[i * n + k] * A[j * n + k]; A[i * n + j] = t / d; }
  }
  const y = new Float64Array(n), al = new Float64Array(n);
  for (let i = 0; i < n; i++) { let t = use[i].r; for (let k = 0; k < i; k++) t -= A[i * n + k] * y[k]; y[i] = t / A[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let t = y[i]; for (let k = i + 1; k < n; k++) t -= A[k * n + i] * al[k]; al[i] = t / A[i * n + i]; }
  out.alpha = Array.from(al);
  if (n >= 3 && n <= 400) {                           // křížová kontrola (leave-one-out): r_i − odhad bez bodu i = α_i / (K⁻¹)_ii
    const Li = new Float64Array(n * n);               // L⁻¹ (dolní trojúhelník)
    for (let j = 0; j < n; j++) {
      Li[j * n + j] = 1 / A[j * n + j];
      for (let i = j + 1; i < n; i++) { let t = 0; for (let k = j; k < i; k++) t -= A[i * n + k] * Li[k * n + j]; Li[i * n + j] = t / A[i * n + i]; }
    }
    let ss = 0;
    for (let i = 0; i < n; i++) {
      let dg = 0; for (let k = i; k < n; k++) dg += Li[k * n + i] ** 2;
      const e = al[i] / dg; use[i].loo = e; ss += e * e;
    }
    out.looRms = Math.sqrt(ss / n);
  }
  return out;
}
function svApply() {                                   // přepočet opraveného terénu (DEM), vrstevnic a mezí
  SVR = svCompute();
  CORR.fill(0);
  const act = SV.use && SVR.use.length > 0;
  if (act) {
    const L = Math.max(.25, S.svLen), l2 = 2 * L * L, s2 = SV_SIG ** 2, w = 3.5 * L;
    SVR.use.forEach((q, k) => {
      const a = SVR.alpha[k] * s2, px = q.p.x, py = q.p.y;
      const i0 = Math.max(0, Math.floor((px - w) / RES)), i1 = Math.min(NX - 1, Math.ceil((px + w) / RES));
      const j0 = Math.max(0, Math.floor((py - w) / RES)), j1 = Math.min(NY - 1, Math.ceil((py + w) / RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d2 = (i * RES - px) ** 2 + (j * RES - py) ** 2;
        if (d2 < w * w) CORR[j * NX + i] += a * Math.exp(-d2 / l2);
      }
    });
  }
  let cmin = 0, cmax = 0, area = 0;
  DZMIN = Infinity; DZMAX = -Infinity;
  for (let o = 0; o < DEM.length; o++) {
    const c = act ? CORR[o] : 0;
    DEM[o] = DEM0[o] + c;
    if (Math.abs(c) > .01) { area++; if (c < cmin) cmin = c; if (c > cmax) cmax = c; }
    if (DEM[o] < DZMIN) DZMIN = DEM[o]; if (DEM[o] > DZMAX) DZMAX = DEM[o];
  }
  Object.assign(SVR, {active: act, cmin, cmax, area: area * RES * RES, cmp: null});
  Object.assign(PATH, act ? contourPaths(DEM) : PATH0);
  dirty3 = true;
}
function svCompare() {                                 // kubatury stejného návrhu jen podle DMR (pro porovnání)
  if (!SVR || !SVR.active) return;
  const keep = Float32Array.from(DEM);
  try { DEM.set(DEM0); const N = solve(); evaluate(N); const e = earthGrid(N); SVR.cmp = {cut: e.vCut, fill: e.vFill}; }
  catch (err) { SVR.cmp = null; }
  finally { DEM.set(keep); }
}

/* vrstevnice po 0,25 m z (opraveného) terénu – marching squares */
function contourPaths(Z) {
  const minor = new Path2D(), major = new Path2D(), labels = [], cnt = new Map();
  const seg = (P, ax, ay, bx, by, k) => {
    P.moveTo(ax, ay); P.lineTo(bx, by);
    if (k % 4 === 0) { const c = (cnt.get(k) || 0) + 1; cnt.set(k, c); if (c % 160 === 40) labels.push({x: ax, y: ay, z: k / 4}); }
  };
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const o = j * NX + i, z00 = Z[o], z10 = Z[o + 1], z01 = Z[o + NX], z11 = Z[o + NX + 1];
    if (!(isFinite(z00) && isFinite(z10) && isFinite(z01) && isFinite(z11))) continue;
    const lo = Math.min(z00, z10, z01, z11), hi = Math.max(z00, z10, z01, z11);
    const x0 = i * RES, y0 = j * RES, x1 = x0 + RES, y1 = y0 + RES;
    for (let k = Math.ceil(lo * 4); k <= Math.floor(hi * 4); k++) {
      const L = k / 4, pts = [];
      const ed = (za, zb, ax, ay, bx, by) => { if ((za < L) !== (zb < L)) { const t = (L - za) / (zb - za); pts.push(ax + (bx - ax) * t, ay + (by - ay) * t); } };
      ed(z00, z10, x0, y0, x1, y0); ed(z10, z11, x1, y0, x1, y1); ed(z11, z01, x1, y1, x0, y1); ed(z01, z00, x0, y1, x0, y0);
      const P = k % 4 === 0 ? major : minor;
      if (pts.length >= 4) seg(P, pts[0], pts[1], pts[2], pts[3], k);
      if (pts.length === 8) seg(P, pts[4], pts[5], pts[6], pts[7], k);
    }
  }
  return {minor, major, labels};
}

/* --- úpravy bodů --- */
function svSave() { try { localStorage.setItem(SV_KEY, JSON.stringify(SV)); } catch (e) { /* */ } }
function svChanged() { svApply(); svSave(); recompute(); svRender(); }
function svAdd(x, y, extra = {}) {
  const id = SV.nextId++;
  const p = Object.assign({id, n: 'P' + id, x: +x.toFixed(3), y: +y.toFixed(3), t: SV.defT, v: '', st: SV.defSt, k: ''}, extra);
  SV.pts.push(p);
  return p;
}
function svAlong(step) {                               // body podél trasy (kolej vybraná pro profil) po step m
  if (!ROUTE || ROUTE.pts.length < 2) { hint('Nejdřív vyberte kolej – body se rozmístí podél trasy podélného profilu.', true); return 0; }
  const P = ROUTE.pts; let k = 0, n = 0;
  for (let s = 0; s <= ROUTE.L + 1e-6; s += step) {
    while (k < P.length - 2 && P[k + 1].st < s) k++;
    const a = P[k], b = P[k + 1], t = b.st > a.st ? Math.min(1, Math.max(0, (s - a.st) / (b.st - a.st))) : 0;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (SV.pts.some(p => Math.hypot(p.x - x, p.y - y) < .2)) continue;
    svAdd(x, y, {n: 'T' + String(+s.toFixed(2)).replace('.', ',')}); n++;
  }
  return n;
}
function svHit(wx, wy, tol) {
  if (!svVisible()) return null;
  let best = null, bd = tol;
  for (const p of SV.pts) { const d = Math.hypot(p.x - wx, p.y - wy); if (d < bd) { bd = d; best = p; } }
  return best;
}
function svVisible() { return SV.pts.length > 0 && ($('lySv').checked || tool === 'svpt' || SV.open); }
function svSelect(id, focus) {
  SV.selId = id; SV.open = true; svRender();
  const tr = document.querySelector(`#svBody tr[data-id="${id}"]`);
  if (tr) { tr.scrollIntoView({block: 'nearest'}); if (focus) { const i = tr.querySelector('[data-k="v"]'); i.focus(); i.select(); } }
  drawPlan();
}
function svDelete(id) {
  SV.pts = SV.pts.filter(p => p.id !== id);
  if (SV.selId === id) SV.selId = null;
  svChanged();
}

/* --- CSV --- */
function svToCSV() {
  const map = new Map((SVR ? SVR.R : []).map(q => [q.p.id, q])), T = {lat: 'laser', abs: 'vyska', rel: 'rel'};
  const rows = ['nazev;x_lok;y_lok;x_EPSG5514;y_EPSG5514;typ;odecet_nebo_vyska;stanovisko;znama_vyska;vyska_terenu;dmr;rozdil'];
  for (const p of SV.pts) {
    const q = map.get(p.id), v = svNum(p.v), k = svNum(p.k);
    rows.push([String(p.n).replace(/;/g, ','), n3(p.x), n3(p.y), n3(ORIGIN[0] + p.x), n3(ORIGIN[1] + p.y), T[p.t],
      isFinite(v) ? n3(v) : '', String(p.st).replace(/;/g, ','), isFinite(k) ? n3(k) : '', q ? n3(q.z) : '', n3(terrain0(p.x, p.y)), q ? n3(q.r) : ''].join(';'));
  }
  return '\ufeff' + rows.join('\r\n');
}
function svFromCSV(text, replace) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('soubor nemá žádná data');
  const dl = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const norm = s => String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/["']/g, '');
  const H = lines[0].split(dl).map(norm);
  const col = (...names) => { for (const nm of names) { const i = H.indexOf(nm); if (i >= 0) return i; } return -1; };
  const cN = col('nazev', 'bod', 'name', 'cislo', 'id'), cX = col('x_lok', 'x', 'x_local'), cY = col('y_lok', 'y', 'y_local');
  const cE = col('x_epsg5514'), cNo = col('y_epsg5514'), cT = col('typ', 'type'), cS = col('stanovisko', 'st', 'station'), cK = col('znama_vyska');
  const cV = col('odecet_nebo_vyska', 'odecet', 'cteni', 'hodnota', 'vyska', 'h', 'z');
  if (cV < 0) throw new Error('chybí sloupec s odečtem nebo výškou (odecet, cteni, vyska, h, z)');
  if ((cX < 0 || cY < 0) && (cE < 0 || cNo < 0)) throw new Error('chybí sloupce se souřadnicemi (x, y nebo x_EPSG5514, y_EPSG5514)');
  const add = [];
  for (const ln of lines.slice(1)) {
    const c = ln.split(dl);
    let x, y;
    if (cE >= 0 && cNo >= 0) { x = svNum(c[cE]) - ORIGIN[0]; y = svNum(c[cNo]) - ORIGIN[1]; }
    else {
      const a = svNum(c[cX]), b = svNum(c[cY]);
      if (Math.abs(a) > 1e5 && Math.abs(b) > 1e5) {     // S-JTSK: menší z čísel = Y (≈ 7xx xxx), větší = X (≈ 1 0xx xxx), EPSG:5514 = (−Y, −X)
        x = -Math.min(Math.abs(a), Math.abs(b)) - ORIGIN[0]; y = -Math.max(Math.abs(a), Math.abs(b)) - ORIGIN[1];
      } else { x = a; y = b; }
    }
    if (!isFinite(x) || !isFinite(y)) continue;
    const v = svNum(c[cV]), tt = cT >= 0 ? norm(c[cT]) : '';
    const t = /^(las|lat|ode|cte)/.test(tt) ? 'lat' : /^rel/.test(tt) ? 'rel' : /^(vys|abs|h$|z$)/.test(tt) ? 'abs' : (isFinite(v) && v > 100 ? 'abs' : 'lat');
    const k = cK >= 0 ? svNum(c[cK]) : NaN;
    add.push({n: cN >= 0 ? String(c[cN] || '').trim() : '', x: +x.toFixed(3), y: +y.toFixed(3), t, v: isFinite(v) ? v : '',
              st: cS >= 0 ? (String(c[cS] || '').trim() || '1') : '1', k: isFinite(k) ? k : ''});
  }
  if (replace) SV.pts = [];
  for (const p of add) { p.id = SV.nextId++; if (!p.n) p.n = 'P' + p.id; SV.pts.push(p); }
  return add.length;
}

/* --- vykreslení: plán, profil --- */
function svDraw() {
  if (!svVisible()) return;
  const map = new Map((SVR ? SVR.R : []).map(q => [q.p.id, q]));
  ctx.font = '11px Segoe UI, sans-serif';
  for (const p of SV.pts) {
    const [x, y] = w2s(p.x, p.y), q = map.get(p.id), on = p.id === SV.selId;
    if (x < -30 || y < -30 || x > CW + 30 || y > CH + 30) continue;
    ctx.beginPath(); ctx.arc(x, y, on ? 7 : 5, 0, TAU);
    ctx.fillStyle = !q ? '#fff' : q.r > .03 ? '#e8590c' : q.r < -.03 ? '#1971c2' : '#2f9e44';
    ctx.fill(); ctx.lineWidth = on ? 3 : 1.5; ctx.strokeStyle = on ? '#000' : q ? '#fff' : '#495057'; ctx.stroke();
    if (VW.sc > 14 || on) label(q ? `${p.n} ${fs2(q.r)}` : p.n, x + 8, y - 9, q ? '#1f2328' : '#57606a');
  }
}
function svProfile(c, P, xs, y) {
  if (!SVR) return;
  if (SVR.active) {
    c.strokeStyle = 'rgba(139,90,43,.7)'; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath();
    P.forEach((p, i) => { const X = xs(p), Y = y(terrain0(p.x, p.y)); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.stroke(); c.setLineDash([]);
  }
  for (const q of SVR.R) {
    let bi = -1, bd = .75;
    P.forEach((p, i) => { const d = Math.hypot(p.x - q.p.x, p.y - q.p.y); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0) continue;
    const X = xs(P[bi]), Y = y(q.z);
    c.fillStyle = q.p.id === SV.selId ? '#d6336c' : '#000';
    c.beginPath(); c.moveTo(X, Y - 5); c.lineTo(X + 4, Y); c.lineTo(X, Y + 5); c.lineTo(X - 4, Y); c.closePath(); c.fill();
  }
}

/* --- panel v levém sloupci a tabulka bodů --- */
function svRenderSum() {
  const box = $('svSum');
  if (!SV.pts.length) {
    box.innerHTML = '<span class="small">Zatím žádné body. Nástrojem <b>Kontrolní bod</b> (M) klikněte do plánu, kde stála lať, nebo v tabulce přidejte body podél trasy. Pak zapište odečty z laseru.</span>';
    return;
  }
  const R = SVR ? SVR.R : [], rows = [['Bodů', `${SV.pts.length} (změřeno ${R.length})`]];
  for (const s of (SVR ? SVR.st.values() : [])) {
    rows.push([`Stanovisko ${esc(s.name)} (${s.t === 'lat' ? 'laser' : 'rel.'})`,
      `${s.pts.length} b. · ${s.t === 'lat' ? 'horizont' : 'nula'} ${f(s.C, 3)} <span class="small">(${s.how === 'known' ? 'ze známé výšky' : 'medián k DMR'})</span>${s.weak ? ' <span class="bad">málo bodů</span>' : ''}`]);
  }
  if (R.length) {
    let ss = 0, sm = 0, mx = R[0];
    for (const q of R) { ss += q.r * q.r; sm += q.r; if (Math.abs(q.r) > Math.abs(mx.r)) mx = q; }
    rows.push(['Měření − DMR', `průměr ${fs(sm / R.length, 2)} · RMS ${f(Math.sqrt(ss / R.length), 2)} · max ${fs(mx.r, 2)} m <span class="small">(${esc(mx.p.n)})</span>`]);
  }
  if (SVR && SVR.looRms != null) rows.push(['Přesnost terénu mezi body', `± ${f(SVR.looRms, 2)} m <span class="small">(křížová kontrola)</span>`]);
  if (SVR && SVR.active) rows.push(['Oprava terénu', `${fs(SVR.cmin, 2)} … ${fs(SVR.cmax, 2)} m na ${f(SVR.area, 0)} m²`]);
  if (SVR && SVR.active && SVR.cmp && NET && NET.sum) {
    rows.push(['Výkop / násyp – jen DMR', `${f(SVR.cmp.cut, 2)} / ${f(SVR.cmp.fill, 2)} m³`],
              ['Výkop / násyp – s měřením', `<b>${f(NET.sum.gCut, 2)} / ${f(NET.sum.gFill, 2)} m³</b>`]);
  }
  const out = SV.pts.filter(p => !svIn(p.x, p.y)).length;
  box.innerHTML = kv(rows) + (out ? `<div class="small bad">${out} bodů leží mimo území mapy – nepoužijí se.</div>` : '')
    + (SV.use ? '' : '<div class="small mid">Měření je vypnuté – terén je podle DMR.</div>');
}
let SV_ROWS = '';
function svRender() {
  $('svPanel').classList.toggle('hidden', !SV.open);
  $('views').classList.toggle('svOpen', !!SV.open);
  svRenderSum();
  if (!SV.open) return;
  const body = $('svBody'), sig = SV.pts.map(p => p.id).join(',');
  if (sig !== SV_ROWS) {
    SV_ROWS = sig;
    body.innerHTML = SV.pts.map((p, i) => `<tr data-id="${p.id}">
      <td class="svi" title="Ukázat v plánu">${i + 1}</td>
      <td><input data-k="n" class="w5"></td><td><input data-k="x" class="w5 num"></td><td><input data-k="y" class="w5 num"></td>
      <td><select data-k="t"><option value="lat">laser</option><option value="abs">výška</option><option value="rel">rel.</option></select></td>
      <td><input data-k="v" class="w5 num" inputmode="decimal"></td><td><input data-k="st" class="w2"></td>
      <td><input data-k="k" class="w5 num" inputmode="decimal" placeholder="–"></td>
      <td class="c z"></td><td class="c z0"></td><td class="c r"></td><td><button class="svDel" title="Smazat bod">✕</button></td></tr>`).join('')
      || '<tr><td colspan="12" class="small" style="padding:8px">Žádné body – klikněte do plánu nástrojem Kontrolní bod, nebo přidejte body podél trasy.</td></tr>';
  }
  const map = new Map((SVR ? SVR.R : []).map(q => [q.p.id, q])), act = document.activeElement;
  const fmt = v => { const x = svNum(v); return isFinite(x) ? String(x).replace('.', ',') : ''; };
  for (const tr of body.querySelectorAll('tr[data-id]')) {
    const p = svById(+tr.dataset.id); if (!p) continue;
    const q = map.get(p.id), val = {n: p.n, x: f(p.x, 2), y: f(p.y, 2), t: p.t, v: fmt(p.v), st: p.st, k: fmt(p.k)};
    for (const el of tr.querySelectorAll('[data-k]')) if (el !== act) el.value = val[el.dataset.k];
    tr.querySelector('.z').textContent = q ? f(q.z, 3) : '–';
    tr.querySelector('.z0').textContent = svIn(p.x, p.y) ? f(terrain0(p.x, p.y), 2) : 'mimo';
    const rc = tr.querySelector('.r'); rc.textContent = q ? fs2(q.r) : '';
    rc.className = 'c r ' + (!q ? '' : Math.abs(q.r) > .1 ? 'bad' : Math.abs(q.r) > .03 ? 'mid' : 'ok');
    tr.classList.toggle('on', p.id === SV.selId);
  }
  $('svDefT').value = SV.defT; $('svDefSt').value = SV.defSt;
}
function svInit() {
  try { const o = JSON.parse(localStorage.getItem(SV_KEY) || 'null'); if (o && Array.isArray(o.pts)) SV = Object.assign(SV, o); } catch (e) { /* */ }
  $('svUse').checked = SV.use !== false;
  $('svUse').addEventListener('change', () => { SV.use = $('svUse').checked; svChanged(); });
  $('svOpen').addEventListener('click', () => { SV.open = !SV.open; svRender(); drawPlan(); });
  $('svClose').addEventListener('click', () => { SV.open = false; svRender(); drawPlan(); });
  $('svDefT').addEventListener('change', () => { SV.defT = $('svDefT').value; svSave(); });
  $('svDefSt').addEventListener('change', () => { SV.defSt = $('svDefSt').value.trim() || '1'; svSave(); });
  $('svAlong').addEventListener('click', () => {
    const st = svNum($('svStep').value); if (!(st >= .25)) { hint('Rozestup bodů musí být aspoň 0,25 m.', true); return; }
    const n = svAlong(st); if (n) { svChanged(); hint(`Přidáno ${n} bodů podél trasy po ${f(st, 2)} m (názvy T + staničení). Zapište k nim odečty z laseru.`); }
  });
  $('svExp').addEventListener('click', () => download(`survey_points_${FILE_ID}.csv`, svToCSV(), 'text/csv;charset=utf-8'));
  $('svExp2').addEventListener('click', () => $('svExp').click());
  $('svImp').addEventListener('click', () => $('svFile').click());
  $('svImp2').addEventListener('click', () => $('svFile').click());
  $('svFile').addEventListener('change', ev => {
    const file = ev.target.files[0]; if (!file) return;
    file.text().then(t => {
      const rep = SV.pts.length ? confirm('Nahradit stávající kontrolní body? (Zrušit = přidat k nim)') : true;
      const n = svFromCSV(t, rep); SV.open = true; svChanged(); hint(`Načteno ${n} bodů.`);
    }).catch(err => showErr('Import bodů: ' + err.message));
    ev.target.value = '';
  });
  $('svClr').addEventListener('click', () => { if (SV.pts.length && confirm('Smazat všechny kontrolní body?')) { SV.pts = []; SV.selId = null; svChanged(); } });
  const body = $('svBody');
  body.addEventListener('change', ev => {
    const tr = ev.target.closest('tr[data-id]'), k = ev.target.dataset.k; if (!tr || !k) return;
    const p = svById(+tr.dataset.id); if (!p) return;
    const raw = ev.target.value.trim();
    if (k === 'x' || k === 'y') { const v = svNum(raw); if (isFinite(v)) p[k] = v; }
    else if (k === 'v' || k === 'k') { const v = svNum(raw); p[k] = isFinite(v) ? v : ''; }
    else if (k === 'st') p.st = raw || '1';
    else p[k] = raw;
    svChanged();
  });
  body.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || !ev.target.dataset.k) return;
    ev.preventDefault();
    const tr = ev.target.closest('tr'), nx = tr.nextElementSibling && tr.nextElementSibling.querySelector(`[data-k="${ev.target.dataset.k}"]`);
    if (nx) { nx.focus(); if (nx.select) nx.select(); } else ev.target.blur();
  });
  body.addEventListener('focusin', ev => { const tr = ev.target.closest('tr[data-id]'); if (tr && SV.selId !== +tr.dataset.id) { SV.selId = +tr.dataset.id; body.querySelectorAll('tr').forEach(r => r.classList.toggle('on', r === tr)); drawPlan(); drawProfile(); } });
  body.addEventListener('click', ev => {
    const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
    const p = svById(+tr.dataset.id); if (!p) return;
    if (ev.target.classList.contains('svDel')) { svDelete(p.id); return; }
    if (ev.target.classList.contains('svi')) { VW.cx = p.x; VW.cy = p.y; VW.sc = Math.max(VW.sc, 25); SV.selId = p.id; svRender(); drawPlan(); }
  });
  svApply();
}

/* --- test: simulovaný laser nad terénem, který se od DMR liší vlnou 0,4 m --- */
function svSelftest() {
  demo(); SV.pts = []; SV.nextId = 1; SV.use = true; $('svUse').checked = true;
  sel = M.elements.find(e => e.type === 'track').id; recompute(false);
  const log = [], base = NET.sum, P = ROUTE.pts, pc = P[Math.floor(P.length / 3)], H = 390.5;
  const truth = (x, y) => terrain0(x, y) + .4 * Math.exp(-((x - pc.x) ** 2 + (y - pc.y) ** 2) / (2 * 3 * 3));
  let rnd = 7; const noise = () => { rnd = (rnd * 16807) % 2147483647; return (rnd / 2147483647 - .5) * .006; };
  log.push(`DMR: výkop ${f(base.gCut)} / násyp ${f(base.gFill)} m³`);
  SV.open = true; svRender();
  $('svStep').value = '2'; $('svAlong').click();
  log.push(`podél trasy ${SV.pts.length} bodů`);
  // první odečet „psaním“ do tabulky + Enter, ostatní přímo
  const inp = document.querySelector('#svBody tr[data-id] [data-k="v"]'), p1 = SV.pts[0];
  inp.focus(); inp.value = (H - truth(p1.x, p1.y) + noise()).toFixed(3).replace('.', ',');
  inp.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); inp.dispatchEvent(new Event('change', {bubbles: true}));
  log.push(`Enter → fokus ${document.activeElement && document.activeElement.dataset.k === 'v' && document.activeElement.closest('tr').dataset.id == SV.pts[1].id ? 'další řádek ✓' : 'NE'}`);
  for (const p of SV.pts.slice(1)) p.v = +(H - truth(p.x, p.y) + noise()).toFixed(3);
  svChanged();
  const s = [...SVR.st.values()][0];
  log.push(`horizont ${f(s.C, 3)} (skutečný ${f(H, 3)}), oprava v místě vlny ${fs(terrain(pc.x, pc.y) - terrain0(pc.x, pc.y), 3)} (skutečně +0,400), mimo vlnu ${fs(terrain(P[P.length - 3].x, P[P.length - 3].y) - terrain0(P[P.length - 3].x, P[P.length - 3].y), 3)}`);
  log.push(`LOO ±${f(SVR.looRms, 3)} m, s měřením: výkop ${f(NET.sum.gCut)} / násyp ${f(NET.sum.gFill)} m³, porovnání jen DMR ${SVR.cmp ? f(SVR.cmp.cut) + ' / ' + f(SVR.cmp.fill) : '–'}`);
  // nástroj Kontrolní bod: klik přidá bod, tažení ho posune
  const ev = (type, wx, wy) => { const [px, py] = w2s(wx, wy), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent(type, {clientX: r.left + px, clientY: r.top + py, button: 0, bubbles: true})); };
  setTool('svpt'); const n0 = SV.pts.length, qx = pc.x + 4, qy = pc.y + 4;
  ev('mousemove', qx, qy); ev('mousedown', qx, qy); ev('mouseup', qx, qy);
  const np = SV.pts[SV.pts.length - 1];
  ev('mousemove', qx, qy); ev('mousedown', qx, qy); ev('mousemove', qx + 1, qy); ev('mousemove', qx + 1.5, qy); ev('mouseup', qx + 1.5, qy);
  log.push(`klik: bodů ${n0}→${SV.pts.length}, fokus na odečet ${document.activeElement && document.activeElement.dataset.k === 'v' ? '✓' : 'NE'}, tažením x ${fs(np.x - qx, 2)} m`);
  svDelete(np.id);
  // CSV tam a zpět
  const csv = svToCSV(), cnt = SV.pts.length, first = {...SV.pts[0]};
  const n = svFromCSV(csv, true); svChanged();
  log.push(`CSV: ${n}/${cnt} bodů, 1. bod Δ ${f(Math.hypot(SV.pts[0].x - first.x, SV.pts[0].y - first.y), 3)} m, odečet ${SV.pts[0].v === first.v ? '✓' : 'NE'}`);
  $('svUse').checked = false; $('svUse').dispatchEvent(new Event('change'));
  log.push(`vypnuto: oprava ${f(terrain(pc.x, pc.y) - terrain0(pc.x, pc.y), 3)}`);
  $('svUse').checked = true; $('svUse').dispatchEvent(new Event('change'));
  SV.selId = SV.pts[Math.floor(SV.pts.length / 3)].id; setTool('select'); svRender();
  VW.cx = pc.x; VW.cy = pc.y; VW.sc = 18; drawPlan(); drawProfile();
  hint('TEST: ' + log.join(' | '));
}

init();
