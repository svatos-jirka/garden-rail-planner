/* ===================== 2) výpočet nivelety, vyhodnocení, kontroly ===================== */
function trackLim(e, gDes) {
  const base = (e.gMax != null && e.gMax !== '' && isFinite(e.gMax)) ? e.gMax / 100 : gDes;
  return Math.max(0, base - S.curveComp * S.gauge * Math.abs(e.k));
}

function solve() {
  const st = Math.max(.05, S.step);
  const C = buildConn();
  const {all, conn, startAt} = C;
  const par = new Map();
  const find = k => { let r = k; while (par.get(r) !== r) r = par.get(r); let c = k; while (par.get(c) !== r) { const n = par.get(c); par.set(c, r); c = n; } return r; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
  for (const p of all) par.set(p.key, p.key);
  for (const [k, q] of conn) union(k, q.key);
  for (const e of M.elements) if (e.type === 'turnout') union(e.id + ':1', e.id + ':2');   // B a C ve stejné výšce
  for (const list of C.crossPorts.values()) for (const q of list) union(list[0].key, q.key);   // křížení X: obě koleje stejně vysoko

  const nodes = [], rootIdx = new Map(), portNode = new Map();
  for (const p of all) {
    const r = find(p.key);
    let ni = rootIdx.get(r);
    if (ni === undefined) { ni = nodes.length; rootIdx.set(r, ni); nodes.push({x: 0, y: 0, c: 0, fixed: null}); }
    const n = nodes[ni]; n.x += p.x; n.y += p.y; n.c++;
    portNode.set(p.key, ni);
  }
  for (const n of nodes) { n.x /= n.c; n.y /= n.c; }
  for (const [sid, p] of startAt) portNode.set(sid + ':0', portNode.get(p.key));
  for (const [cid, list] of C.crossPorts) if (list.length) portNode.set(cid + ':0', portNode.get(list[0].key));

  const gDes = (S.gDesignMode === 'max' ? S.gMax : S.gRec) / 100;
  const edges = [], trips = [], portEdges = new Map(), elData = new Map();
  for (const e of M.elements) {
    if (e.type === 'track') {
      const n = Math.max(1, Math.round(e.L / st)), ds = e.L / n;
      const list = [portNode.get(e.id + ':0')];
      for (let i = 1; i < n; i++) { const p = segAt(e, i * ds); list.push(nodes.length); nodes.push({x: p.x, y: p.y, c: 1, fixed: null}); }
      list.push(portNode.get(e.id + ':1'));
      const lim = trackLim(e, gDes);
      for (let i = 0; i < n; i++) edges.push({a: list[i], b: list[i + 1], len: ds, lim});
      for (let i = 1; i < n; i++) trips.push([list[i - 1], list[i], list[i + 1], ds, ds]);
      portEdges.set(e.id + ':0', [{o: list[1], len: ds}]);
      portEdges.set(e.id + ':1', [{o: list[n - 1], len: ds}]);
      elData.set(e.id, {list, ds, n});
    } else if (e.type === 'turnout') {
      const g = turnoutGeom(e), A = portNode.get(e.id + ':0'), B = portNode.get(e.id + ':1');
      const lim = Math.min(gDes, S.gTurnout / 100), cG = S.curveComp * S.gauge;
      edges.push({a: A, b: B, len: g.Lmain, lim: Math.max(0, lim - cG * g.kMainAbs)});
      edges.push({a: A, b: B, len: g.Ldiv, lim: Math.max(0, lim - cG * g.kDivAbs)});
      portEdges.set(e.id + ':0', [{o: B, len: g.Lmain}]);
      portEdges.set(e.id + ':1', [{o: A, len: g.Lmain}]);
      portEdges.set(e.id + ':2', [{o: A, len: g.Ldiv}]);
      elData.set(e.id, {A, B, g});
    }
  }
  for (const [k, q] of conn) {
    if (k > q.key) continue;
    const node = portNode.get(k);
    for (const e1 of portEdges.get(k) || []) for (const e2 of portEdges.get(q.key) || []) trips.push([e1.o, node, e2.o, e1.len, e2.len]);
  }
  const shift = +M.hShift || 0;     // posun nivelety (vyrovnání bilance zeminy) – platí i pro body „pláň nad terénem“
  for (const n of nodes) { n.t = terrain(n.x, n.y); n.T = n.t + S.hConstr + S.offset + shift; }
  for (const [k, pin] of Object.entries(M.pins)) {
    const ni = portNode.get(k);
    if (ni === undefined) continue;
    const n = nodes[ni];
    n.fixed = pin.mode === 'abs' ? +pin.v : n.t + S.hConstr + (+pin.v) + shift;
  }
  const h = relax(nodes, edges, trips);
  return Object.assign(C, {nodes, edges, trips, portNode, elData, h, gDes});
}

/* Niveleta: h musí splnit |h_b − h_a| ≤ lim·len na každé hraně (sklon) a pevné body.
   Horní obálka U_i = min_j (T_j + D_ij), dolní L_i = max_j (T_j − D_ij), kde D je nejkratší
   „výšková vzdálenost“ (součet lim·len). Střed (U+L)/2 sklon vždy splní a minimalizuje největší
   násyp/zářez. Potom volitelné vyhlazení (Laplace) a zakružení, vždy znovu promítnuté do limitu sklonu. */
function heapPQ() {
  const H = [];
  return {
    size: () => H.length,
    push(val, i) {
      H.push([val, i]); let c = H.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (H[p][0] <= H[c][0]) break; const t = H[p]; H[p] = H[c]; H[c] = t; c = p; }
    },
    pop() {
      const top = H[0], last = H.pop();
      if (H.length) {
        H[0] = last; let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1; let m = c;
          if (l < H.length && H[l][0] < H[m][0]) m = l;
          if (r < H.length && H[r][0] < H[m][0]) m = r;
          if (m === c) break; const t = H[m]; H[m] = H[c]; H[c] = t; c = m;
        }
      }
      return top;
    },
  };
}
// v_i = min_j (a_j + D_ij); adj[i] = [j, edgeIdx, ...], W[edgeIdx] = povolený výškový rozdíl hrany
function minPlus(a, adj, W) {
  const N = a.length, v = Float64Array.from(a), H = heapPQ();
  for (let i = 0; i < N; i++) if (isFinite(v[i])) H.push(v[i], i);
  while (H.size()) {
    const [val, i] = H.pop();
    if (val > v[i]) continue;
    const A = adj[i];
    for (let k = 0; k < A.length; k += 2) { const j = A[k], nv = val + W[A[k + 1]]; if (nv < v[j] - 1e-12) { v[j] = nv; H.push(nv, j); } }
  }
  return v;
}
function sssp(src, adj, W, N) {      // nejkratší cesty z jednoho bodu (s předchůdci)
  const dist = new Float64Array(N).fill(Infinity), pe = new Int32Array(N).fill(-1), pn = new Int32Array(N).fill(-1), H = heapPQ();
  dist[src] = 0; H.push(0, src);
  while (H.size()) {
    const [val, i] = H.pop();
    if (val > dist[i]) continue;
    const A = adj[i];
    for (let k = 0; k < A.length; k += 2) { const j = A[k], nv = val + W[A[k + 1]]; if (nv < dist[j] - 1e-12) { dist[j] = nv; pe[j] = A[k + 1]; pn[j] = i; H.push(nv, j); } }
  }
  return {dist, pe, pn};
}
function relax(nodes, edges, trips) {
  const N = nodes.length, T = new Float64Array(N), F = new Float64Array(N), fx = new Uint8Array(N), pins = [];
  for (let i = 0; i < N; i++) {
    const n = nodes[i]; T[i] = n.T;
    if (n.fixed != null && isFinite(n.fixed)) { fx[i] = 1; F[i] = n.fixed; pins.push(i); }
  }
  const W = Float64Array.from(edges, e => Math.max(0, e.lim) * e.len);
  const adj = Array.from({length: N}, () => []);
  edges.forEach((e, ei) => { adj[e.a].push(e.b, ei); adj[e.b].push(e.a, ei); });
  // nesplnitelné pevné body: mezi nimi se povolí potřebný sklon (rovnoměrně po nejkratší cestě),
  // takže niveleta vede plynule a úsek se v kontrole označí jako překročení sklonu
  let conflict = 0;
  for (let pass = 0; pass < 8 && pins.length > 1; pass++) {
    let changed = false;
    for (const p of pins) {
      const {dist, pe, pn} = sssp(p, adj, W, N);
      for (const q of pins) {
        if (q <= p || !isFinite(dist[q])) continue;
        const need = Math.abs(F[q] - F[p]);
        if (need <= dist[q] + 1e-6) continue;
        const path = []; let pathLen = 0;
        for (let v = q; v !== p && pe[v] >= 0; v = pn[v]) { path.push(pe[v]); pathLen += edges[pe[v]].len; }
        if (!path.length) continue;
        if (dist[q] > 1e-9) { const fac = need / dist[q] * (1 + 1e-9); for (const ei of path) W[ei] *= fac; }
        else for (const ei of path) W[ei] = Math.max(W[ei], need * edges[ei].len / pathLen * (1 + 1e-9));
        if (pass === 0) conflict++;
        changed = true;
      }
    }
    if (!changed) break;
  }
  let Up = null, Lp = null;
  if (pins.length) {
    Up = minPlus(Float64Array.from(F, (v, i) => fx[i] ? v : Infinity), adj, W);
    Lp = minPlus(Float64Array.from(F, (v, i) => fx[i] ? -v : Infinity), adj, W).map(v => -v);
  }
  const clampPins = t => {
    if (!pins.length) return t;
    const o = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      if (fx[i]) { o[i] = F[i]; continue; }
      const lo = Math.min(Lp[i], Up[i]), hi = Math.max(Lp[i], Up[i]);
      o[i] = Math.min(hi, Math.max(lo, t[i]));
    }
    return o;
  };
  const mid = t => {
    const tt = clampPins(t), U = minPlus(tt, adj, W), Ln = minPlus(tt.map(v => -v), adj, W), h = new Float64Array(N);
    for (let i = 0; i < N; i++) h[i] = fx[i] ? F[i] : (U[i] - Ln[i]) / 2;
    return h;
  };
  let h = mid(T);
  // vyhlazení nivelety
  const sm = Math.min(1, Math.max(0, S.smooth)), K = Math.round(sm * sm * 400);
  for (let it = 0; it < K; it++) {
    const h2 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      if (fx[i]) { h2[i] = F[i]; continue; }
      const A = adj[i]; let s = 0, ws = 0;
      for (let k = 0; k < A.length; k += 2) { const ww = 1 / Math.max(1e-3, edges[A[k + 1]].len); s += h[A[k]] * ww; ws += ww; }
      h2[i] = ws ? .5 * h[i] + .5 * s / ws : h[i];
    }
    h = (it % 5 === 4 || it === K - 1) ? mid(h2) : h2;
  }
  // výškové zakružení (poloměr), poté znovu limit sklonu
  const Rv = Math.max(1, S.rvMin);
  for (let p = 0; p < 30; p++) {
    let mv = 0;
    for (const t of trips) {
      const a = t[0], b = t[1], c = t[2], l1 = t[3], l2 = t[4];
      if (a === b || b === c || a === c) continue;
      const Cv = (h[c] - h[b]) / l2 - (h[b] - h[a]) / l1, lim = (l1 + l2) / 2 / Rv;
      let ex; if (Cv > lim) ex = Cv - lim; else if (Cv < -lim) ex = Cv + lim; else continue;
      const ga = 1 / l1, gb = -(1 / l1 + 1 / l2), gc = 1 / l2, wa = fx[a] ? 0 : 1, wb = fx[b] ? 0 : 1, wc = fx[c] ? 0 : 1;
      const den = wa * ga * ga + wb * gb * gb + wc * gc * gc;
      if (!den) continue;
      const lam = ex / den;
      h[a] -= wa * ga * lam; h[b] -= wb * gb * lam; h[c] -= wc * gc * lam;
      mv = Math.max(mv, Math.abs(ex));
    }
    if (mv < 1e-6) break;
  }
  h = mid(h);
  h.conflict = conflict;
  return h;
}

/* --- vzorky podél prvků --- */
function mkPt(s, p, k, hh) {
  const t = terrain(p.x, p.y), fl = hh - S.hConstr;
  return {s, x: p.x, y: p.y, th: p.th, k, t, h: hh, f: fl, d: fl - t};
}
function samplePath(segs, hA, hB) {
  const Lt = segs.reduce((a, g) => a + g.L, 0), n = Math.max(1, Math.round(Lt / Math.max(.05, S.step))), ds = Lt / n, pts = [];
  for (let i = 0; i <= n; i++) {
    const s = i * ds; let acc = 0, gi = 0;
    while (gi < segs.length - 1 && s > acc + segs[gi].L + 1e-9) { acc += segs[gi].L; gi++; }
    pts.push(mkPt(s, segAt(segs[gi], Math.min(s - acc, segs[gi].L)), segs[gi].k, hA + (hB - hA) * s / Lt));
  }
  return pts;
}
function evaluate(N) {
  const sets = [];
  for (const e of M.elements) {
    if (e.type === 'track') {
      const ed = N.elData.get(e.id), pts = [];
      for (let i = 0; i <= ed.n; i++) pts.push(mkPt(i * ed.ds, segAt(e, i * ed.ds), e.k, N.h[ed.list[i]]));
      sets.push({e, route: null, pts, L: e.L});
    } else if (e.type === 'turnout') {
      const ed = N.elData.get(e.id), hA = N.h[ed.A], hB = N.h[ed.B];
      sets.push({e, route: 'B', pts: samplePath(ed.g.main, hA, hB), L: ed.g.Lmain});
      sets.push({e, route: 'C', pts: samplePath(ed.g.div, hA, hB), L: ed.g.Ldiv});
    }
  }
  N.sets = sets;
}
const earthArea = d => d > 0 ? S.bForm * d + S.mFill * d * d : S.bForm * -d + S.mCut * d * d;
/* Terén po stavbě na mřížce 0,25 m: pláň (šířka bForm) + svahy násypů 1:m a zářezů 1:n kolem všech kolejí.
   Pro každou buňku: F = nejvyšší „kužel násypu“, C = nejnižší „kužel zářezu“, nový terén = min(max(terén, F), C).
   Nezávisí na pořadí kolejí, zahrnuje příčný sklon terénu a překryvy souběžných kolejí / výhybek.
   Kubatury = součet rozdílů výšek × plocha buňky. full = vrátit i celou mřížku (pro 3D). */
let EG_BUF = null;
function earthGrid(N, full = false) {
  if (!EG_BUF) EG_BUF = {F: new Float32Array(NX * NY), C: new Float32Array(NX * NY), mark: new Uint8Array(NX * NY)};
  const {F, C, mark} = EG_BUF, touched = [], hb = S.bForm / 2, mM = Math.max(S.mFill, S.mCut);
  for (const set of (N && N.sets) || []) for (const p of set.pts) {
    const w = Math.min(8, hb + 2 * mM * (Math.abs(p.d) + .3 * hb) + 2 * RES);
    const i0 = Math.max(0, Math.floor((p.x - w) / RES)), i1 = Math.min(NX - 1, Math.ceil((p.x + w) / RES));
    const j0 = Math.max(0, Math.floor((p.y - w) / RES)), j1 = Math.min(NY - 1, Math.ceil((p.y + w) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const o = j * NX + i, dist = Math.max(0, Math.hypot(i * RES - p.x, j * RES - p.y) - hb);
      if (dist > w) continue;
      if (!mark[o]) { mark[o] = 1; F[o] = -Infinity; C[o] = Infinity; touched.push(o); }
      const sf = p.f - dist / S.mFill, sc = p.f + dist / S.mCut;
      if (sf > F[o]) F[o] = sf;
      if (sc < C[o]) C[o] = sc;
    }
  }
  const Z = full ? Float32Array.from(DEM) : null, tint = full ? new Int8Array(NX * NY) : null;
  let vF = 0, vC = 0, aF = 0, aC = 0;
  for (const o of touched) {
    mark[o] = 0;
    const z0 = DEM[o], dz = Math.min(Math.max(z0, F[o]), C[o]) - z0;
    if (dz > 5e-4) { vF += dz; aF++; } else if (dz < -5e-4) { vC -= dz; aC++; }
    if (full && Math.abs(dz) > .005) { Z[o] = z0 + dz; tint[o] = dz > 0 ? 1 : -1; }
  }
  const A = RES * RES;
  return {vFill: vF * A, vCut: vC * A, aFill: aF * A, aCut: aC * A, Z, tint};
}
/* Bilance zeminy: kUse = m³ hutněného násypu z 1 m³ výkopu (zhutnění, ornice/drn nevhodné do násypu),
   kSwell = nakypření při odvozu / dovozu. surplus > 0 = přebytek výkopu (m³ rostlé zeminy). */
function earthBalance(vCut, vFill) {
  const kU = S.kUse > 0 ? S.kUse : 1, kS = S.kSwell > 0 ? S.kSwell : 1;
  const surplus = vCut - vFill / kU;
  return {surplus, haul: surplus > 0 ? surplus * kS : 0, import: surplus < 0 ? -surplus * kU * kS : 0,
          ratio: vFill > 1e-9 ? vCut * kU / vFill : (vCut > 1e-9 ? Infinity : 1)};
}
function cantInfo(R) {
  const Gc = S.gauge + S.head, v = S.vDesign / 3.6, g = 9.81;
  const ceq = Gc * v * v / (g * R), c = Math.min(S.cantMax / 1000, ceq);
  const vmax = Math.sqrt(R * (S.aLat + g * c / Gc)) * 3.6;
  const aUn = v * v / R - g * c / Gc;
  return {ceq: ceq * 1000, c: c * 1000, vmax, aUn, ramp: c * 200};
}

/* --- kontroly --- */
function runChecks(N) {
  const W = [], st = new Map(), ES = new Map();
  const add = (lvl, msg, x, y, id) => W.push({lvl, msg, x, y, id});
  const bump = (id, l) => st.set(id, Math.max(st.get(id) || 0, l));
  const gRec = S.gRec / 100, gMax = S.gMax / 100, comp = S.curveComp * S.gauge;
  // poloměry
  for (const e of M.elements) {
    if (e.type === 'track' && Math.abs(e.k) > 1e-9) {
      const R = 1 / Math.abs(e.k), m = segAt(e, e.L / 2);
      if (R < S.rMin - 1e-6) { add('err', `${elName(e)}: R ${f(R, 1)} m je menší než min. ${f(S.rMin, 1)} m`, m.x, m.y, e.id); bump(e.id, 2); }
      else if (R < S.rRec - 1e-6) { add('wrn', `${elName(e)}: R ${f(R, 1)} m je pod doporučením ${f(S.rRec, 1)} m`, m.x, m.y, e.id); bump(e.id, 1); }
      const ci = cantInfo(R);
      if (ci.vmax < S.vDesign) { add('wrn', `${elName(e)}: v oblouku max. ${f(ci.vmax, 1)} km/h (při převýšení ${f(ci.c, 0)} mm)`, m.x, m.y, e.id); bump(e.id, 1); }
    }
    if (e.type === 'turnout') {
      const rD = turnoutDivR(e);
      if (rD < S.rMin - 1e-6) { add(S.strictR ? 'err' : 'wrn', `${elName(e)}: poloměr odbočky ${f(rD, 1)} m je menší než min. poloměr trati ${f(S.rMin, 1)} m`, e.x, e.y, e.id); bump(e.id, S.strictR ? 2 : 1); }
    }
  }
  // sklony, zemní práce, poloha
  let vFill = 0, vCut = 0, maxFill = 0, maxCut = 0, maxG = 0;
  for (const set of N.sets) {
    const e = set.e, P = set.pts;
    const es = ES.get(e.id) || {gMax: 0, gEq: 0, fill: 0, cut: 0, vFill: 0, vCut: 0};
    let worst = 0, at = null, gw = 0, outP = null, bldP = null, nearP = null, nearD = 1e9, eW = null;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.d > es.fill) es.fill = p.d;
      if (-p.d > es.cut) es.cut = -p.d;
      if (Math.abs(p.d) > S.warnEarth && (!eW || Math.abs(p.d) > Math.abs(eW.d))) eW = p;
      if (!inArea(p.x, p.y)) { if (!outP) outP = p; }
      else { const dd = distArea(p.x, p.y); if (dd < S.clearBound && dd < nearD) { nearD = dd; nearP = p; } }
      if (BUILDINGS.length && inBuilding(p.x, p.y) && !bldP) bldP = p;
      if (i < P.length - 1) {
        const q = P[i + 1], ds = q.s - p.s;
        if (ds <= 0) continue;
        const g = Math.abs(q.h - p.h) / ds, geq = g + comp * Math.abs(p.k);
        es.gMax = Math.max(es.gMax, g); es.gEq = Math.max(es.gEq, geq);
        let limM = gMax, limR = gRec;
        if (e.type === 'turnout') { limM = Math.min(gMax, S.gTurnout / 100); limR = Math.min(gRec, limM); }
        if (e.type === 'track' && e.gMax != null && e.gMax !== '' && isFinite(e.gMax)) { limM = Math.min(limM, e.gMax / 100 + comp * Math.abs(e.k)); limR = Math.min(limR, limM); }
        const lv = geq > limM + 2e-4 ? 2 : geq > limR + 2e-4 ? 1 : 0;
        if (lv > worst || (lv === worst && lv && geq > gw)) { worst = lv; at = p; gw = geq; }
        if (!(e.type === 'turnout' && set.route === 'C')) {
          const v = (earthArea(p.d) + earthArea(q.d)) / 2 * ds;
          if ((p.d + q.d) > 0) es.vFill += v; else es.vCut += v;
        }
      }
    }
    ES.set(e.id, es);
    maxG = Math.max(maxG, es.gEq);
    if (worst) { add(worst === 2 ? 'err' : 'wrn', `${elName(e)}: sklon ${f(gw * 100, 2)} % (ekviv.) ${worst === 2 ? 'překračuje maximum' : 'je nad doporučením'}`, at.x, at.y, e.id); bump(e.id, worst); }
    if (eW) { add('wrn', `${elName(e)}: ${eW.d > 0 ? 'násyp' : 'zářez'} ${f(Math.abs(eW.d), 2)} m`, eW.x, eW.y, e.id); bump(e.id, 1); }
    if (outP) { add('err', `${elName(e)}: kolej vede mimo pozemek${AREA_LABEL ? ' ' + AREA_LABEL : ''}`, outP.x, outP.y, e.id); bump(e.id, 2); }
    if (bldP) { add('err', `${elName(e)}: kolej vede přes budovu${PMETA.buildingLabel ? ' (' + PMETA.buildingLabel + ')' : ''}`, bldP.x, bldP.y, e.id); bump(e.id, 2); }
    if (nearP) { add('wrn', `${elName(e)}: osa jen ${f(nearD, 2)} m od hranice pozemku`, nearP.x, nearP.y, e.id); bump(e.id, 1); }
  }
  for (const es of ES.values()) { vFill += es.vFill; vCut += es.vCut; maxFill = Math.max(maxFill, es.fill); maxCut = Math.max(maxCut, es.cut); }
  // výškové zakružení
  let rvBad = 0, rvWorst = null;
  for (const t of N.trips) {
    const [a, b, c, l1, l2] = t;
    const dg = Math.abs((N.h[c] - N.h[b]) / l2 - (N.h[b] - N.h[a]) / l1);
    if (dg < 1e-9) continue;
    const rv = (l1 + l2) / 2 / dg;
    if (rv < S.rvMin * .97) { rvBad++; if (!rvWorst || rv < rvWorst.rv) rvWorst = {rv, n: N.nodes[b]}; }
  }
  if (rvWorst) add('wrn', `Výškové zakružení R ${f(rvWorst.rv, 1)} m < ${f(S.rvMin, 0)} m (${rvBad}× – zkontrolujte zafixované výšky)`, rvWorst.n.x, rvWorst.n.y, null);
  // protisměrné oblouky
  const sgOut = p => p.e.type === 'track' ? Math.sign(p.e.k) * (p.i === 1 ? 1 : -1) : 0;
  const sgIn = p => p.e.type === 'track' ? Math.sign(p.e.k) * (p.i === 0 ? 1 : -1) : 0;
  if (S.sMin > 0) for (const [k, q] of N.conn) {
    const p = N.all.find(x => x.key === k);
    if (!p || k > q.key || p.e.type !== 'track' || q.e.type !== 'track') continue;
    if (Math.abs(p.e.k) > 1e-9 && Math.abs(q.e.k) > 1e-9 && sgOut(p) * sgIn(q) < 0) {
      add('wrn', `Protisměrné oblouky #${p.e.id}/#${q.e.id} bez mezipřímé (doporučeno ≥ ${f(S.sMin, 2)} m)`, p.x, p.y, p.e.id); bump(p.e.id, 1); bump(q.e.id, 1);
    }
  }
  for (const e of M.elements) {
    if (e.type !== 'track' || Math.abs(e.k) > 1e-9 || e.L >= S.sMin) continue;
    const q0 = N.conn.get(e.id + ':0'), q1 = N.conn.get(e.id + ':1');
    if (q0 && q1 && sgOut(q0) * sgIn(q1) < 0) { const m = segAt(e, e.L / 2); add('wrn', `Mezipřímá #${e.id} mezi protisměrnými oblouky má jen ${f(e.L, 2)} m`, m.x, m.y, e.id); bump(e.id, 1); }
  }
  // křížení X: úhel a úplnost
  N.crossInfo = new Map();
  for (const e of M.elements) {
    if (e.type !== 'cross') continue;
    const list = N.crossPorts.get(e.id) || [], dirs = [];
    for (const p of list) {
      const a = ((p.a % Math.PI) + Math.PI) % Math.PI;
      if (!dirs.some(d => { const x = Math.abs(d - a); return Math.min(x, Math.PI - x) < 5 * Math.PI / 180; })) dirs.push(a);
    }
    let ang = null;
    if (dirs.length >= 2) { const x = Math.abs(dirs[0] - dirs[1]); ang = deg(Math.min(x, Math.PI - x)); }
    const ok = ang != null && ang >= S.xAng - 1e-6;
    N.crossInfo.set(e.id, {ang, ok, n: list.length, ids: [...new Set(list.map(p => p.e.id))]});
    if (ang == null) { add('wrn', `${elName(e)}: v bodě nejsou dvě koleje (po přesunu nebo smazání) – křížení smažte, nebo koleje vraťte`, e.x, e.y, e.id); bump(e.id, 1); }
    else if (!ok) { add('err', `${elName(e)}: úhel křížení ${f(ang, 0)}° je menší než min. ${f(S.xAng, 0)}°`, e.x, e.y, e.id); bump(e.id, 2); }
  }
  // koleje, které se kříží bez křížení X
  const BB = N.sets.map(set => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of set.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return {P: set.pts, e: set.e, x0, y0, x1, y1};
  });
  const reported = new Set();
  for (let a = 0; a < BB.length; a++) for (let b = a + 1; b < BB.length; b++) {
    const A = BB[a], B = BB[b];
    if (A.e === B.e || A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
    const pk = Math.min(A.e.id, B.e.id) + '-' + Math.max(A.e.id, B.e.id);
    if (reported.has(pk)) continue;
    const ends = ports(A.e).concat(ports(B.e));
    let hitP = null;
    for (let i = 0; i < A.P.length - 1 && !hitP; i++) {
      const p1 = A.P[i], p2 = A.P[i + 1];
      const sx0 = Math.min(p1.x, p2.x), sx1 = Math.max(p1.x, p2.x), sy0 = Math.min(p1.y, p2.y), sy1 = Math.max(p1.y, p2.y);
      for (let j = 0; j < B.P.length - 1; j++) {
        const q1 = B.P[j], q2 = B.P[j + 1];
        if (Math.max(q1.x, q2.x) < sx0 || Math.min(q1.x, q2.x) > sx1 || Math.max(q1.y, q2.y) < sy0 || Math.min(q1.y, q2.y) > sy1) continue;
        const r = segInter(p1.x, p1.y, p2.x, p2.y, q1.x, q1.y, q2.x, q2.y);
        if (!r) continue;
        const x = p1.x + r.t * (p2.x - p1.x), y = p1.y + r.t * (p2.y - p1.y);
        if (ends.some(q => Math.hypot(q.x - x, q.y - y) < .05)) continue;
        hitP = {x, y}; break;
      }
    }
    if (hitP) {
      reported.add(pk);
      add('err', `${elName(A.e)} a ${elName(B.e)} se kříží bez křížení X – veďte přes ně flexi znovu (asistent nabídne křížení), nebo jinudy`, hitP.x, hitP.y, A.e.id);
      bump(A.e.id, 2); bump(B.e.id, 2);
    }
  }
  if (N.h.conflict) add('err', `Výškové body nejdou propojit v limitu sklonu (${N.h.conflict}×) – úsek mezi nimi má větší sklon (červeně v profilu); upravte výšku bodu nebo některý zrušte`, null, null, null);
  // výškové body zadané vícekrát na stejném místě (pod klíči sousedních prvků) – platí poslední
  const pinGroups = new Map();
  for (const k of Object.keys(M.pins)) { const ni = N.portNode.get(k); if (ni === undefined) continue; if (!pinGroups.has(ni)) pinGroups.set(ni, []); pinGroups.get(ni).push(k); }
  N.pinDup = 0;
  for (const [ni, ks] of pinGroups) if (ks.length > 1) {
    N.pinDup += ks.length - 1;
    add('wrn', `Výškový bod je na jednom místě zadán ${ks.length}× (${ks.map(pinName).join(', ')}) – platí poslední; přebytečné smažte v tabulce Výškové body`, N.nodes[ni].x, N.nodes[ni].y, null);
  }
  const nOpen = N.open.filter(p => p.e.type !== 'start').length;
  if (nOpen) add('inf', `Volné konce koleje: ${nOpen}`, null, null, null);
  N.warn = W; N.elStat = st; N.elStats = ES;
  let Ltr = 0, nTo = 0, rmin = Infinity;
  for (const e of M.elements) {
    if (e.type === 'track') { Ltr += e.L; if (Math.abs(e.k) > 1e-9) rmin = Math.min(rmin, 1 / Math.abs(e.k)); }
    if (e.type === 'turnout') { Ltr += turnoutGeom(e).Lmain; nTo++; }
  }
  N.sum = {Ltr, nTo, rmin, maxG, maxFill, maxCut, vFill, vCut, nOpen};
  const eg = earthGrid(N);
  Object.assign(N.sum, {gFill: eg.vFill, gCut: eg.vCut, aFill: eg.aFill, aCut: eg.aCut});
}
function segInter(ax, ay, bx, by, cx, cy, dx, dy) {     // průsečík úseček AB a CD (parametry t, u)
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = cx - ax, qy = cy - ay, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? {t, u} : null;
}
function pip(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inArea(x, y) { let c = false; for (const r of AREA) if (pip(x, y, r)) c = !c; return c; }      // uvnitř pozemku (otvory = ven)
const inBuilding = (x, y) => BUILDINGS.some(b => pip(x, y, b));
const distArea = (x, y) => AREA.reduce((m, r) => Math.min(m, distPoly(x, y, r)), Infinity);
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function distPoly(x, y, poly) {
  let b = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) b = Math.min(b, distSeg(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  return b;
}

/* --- trasa pro podélný profil --- */
function exitOf(e, from) {
  if (e.type === 'track') return from === 0 ? 1 : 0;
  if (e.type === 'turnout') return from === 0 ? (e.route === 'C' ? 2 : 1) : 0;
  return null;
}
function buildRoute() {
  if (!NET || !NET.sets.length) return null;
  let e0 = null, from = 0;
  let se = sel != null ? elById(sel) : null;
  if (se && se.type === 'cross') { const l = NET.crossPorts.get(se.id); se = l && l.length ? l[0].e : null; }   // křížení → trasa přes první kolej
  if (se && se.type !== 'start') e0 = se;
  else {
    const stEl = se || M.elements.find(e => e.type === 'start' && NET.startAt.has(e.id));
    const q = stEl && NET.startAt.get(stEl.id);
    if (q) { e0 = q.e; from = q.i === 0 ? 0 : (q.e.type === 'track' ? 1 : q.i); }
    else e0 = M.elements.find(e => e.type === 'track' || e.type === 'turnout');
  }
  if (!e0) return null;
  let to = exitOf(e0, from);
  if (to == null) return null;
  const first = {e: e0, from, to}, items = [first], seen = new Set([e0.id]);
  let cur = first, loop = false;
  for (;;) {
    const q = NET.conn.get(cur.e.id + ':' + cur.to);
    if (!q) break;
    if (seen.has(q.e.id)) { loop = q.e.id === e0.id; break; }
    const t2 = exitOf(q.e, q.i); if (t2 == null) break;
    seen.add(q.e.id); cur = {e: q.e, from: q.i, to: t2}; items.push(cur);
  }
  const back = [];
  cur = first;
  if (!loop) for (;;) {
    const q = NET.conn.get(cur.e.id + ':' + cur.from);
    if (!q || seen.has(q.e.id)) break;
    const fr = exitOf(q.e, q.i); if (fr == null) break;
    seen.add(q.e.id); cur = {e: q.e, from: fr, to: q.i}; back.push(cur);
  }
  const list = back.reverse().concat(items);
  const pts = [], bounds = [];
  let st0 = 0;
  for (const it of list) {
    const route = it.e.type === 'turnout' ? ((it.from === 2 || it.to === 2) ? 'C' : 'B') : null;
    const set = NET.sets.find(s => s.e === it.e && s.route === route);
    if (!set) continue;
    const fwd = it.from === 0;
    const P = fwd ? set.pts : set.pts.slice().reverse();
    bounds.push({st: st0, e: it.e, fwd, L: set.L});
    P.forEach((p, i) => { if (i === 0 && pts.length) return; pts.push(Object.assign({}, p, {st: st0 + (fwd ? p.s : set.L - p.s), e: it.e, fwd})); });
    st0 += set.L;
  }
  return {pts, bounds, L: st0, loop};
}
