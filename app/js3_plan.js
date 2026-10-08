/* ===================== 3) plán – vykreslení a nástroje ===================== */
const cv = $('plan'), ctx = cv.getContext('2d');
let VW = {cx: XMAX / 2, cy: YMAX / 2, sc: 10}, CW = 0, CH = 0;
const w2s = (x, y) => [CW / 2 + (x - VW.cx) * VW.sc, CH / 2 - (y - VW.cy) * VW.sc];
const s2w = (px, py) => [VW.cx + (px - CW / 2) / VW.sc, VW.cy - (py - CH / 2) / VW.sc];
const DPR = () => window.devicePixelRatio || 1;
function setWorld() { const d = DPR(); ctx.setTransform(d * VW.sc, 0, 0, -d * VW.sc, d * (CW / 2 - VW.cx * VW.sc), d * (CH / 2 + VW.cy * VW.sc)); }
function setScreen() { const d = DPR(); ctx.setTransform(d, 0, 0, d, 0, 0); }

const IMG = {ortho: new Image(), relief: new Image()};
IMG.ortho.onload = IMG.relief.onload = () => { drawPlan(); if (tab === '3d') build3D(); };
IMG.ortho.src = D.ortho; IMG.relief.src = D.relief;

const PATH = (() => {
  const poly = (pts, P = new Path2D()) => { pts.forEach((q, i) => i ? P.lineTo(q[0], q[1]) : P.moveTo(q[0], q[1])); P.closePath(); return P; };
  const area = new Path2D(); for (const r of AREA) poly(r, area);
  const bld = BUILDINGS.length ? new Path2D() : null; for (const b of BUILDINGS) poly(b, bld);
  if (!D.contours) return Object.assign({parcel: area, building: bld}, contourPaths(DEM));   // nový projekt: vrstevnice z terénu
  const minor = new Path2D(), major = new Path2D(), labels = [];
  for (const c of D.contours) {
    const P = c.major ? major : minor;
    for (const ln of c.lines) {
      for (let i = 0; i < ln.length; i += 2) i ? P.lineTo(ln[i], ln[i + 1]) : P.moveTo(ln[i], ln[i + 1]);
      if (c.major && ln.length > 40) { const m = Math.floor(ln.length / 4) * 2; labels.push({x: ln[m], y: ln[m + 1], z: c.z}); }
    }
  }
  return {parcel: area, building: bld, minor, major, labels};
})();

function resizePlan() {
  const r = cv.getBoundingClientRect(); CW = r.width; CH = r.height;
  cv.width = Math.max(1, Math.round(CW * DPR())); cv.height = Math.max(1, Math.round(CH * DPR()));
  drawPlan();
}
function fitView() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  VW.cx = (x0 + x1) / 2; VW.cy = (y0 + y1) / 2;
  VW.sc = Math.min(CW / (x1 - x0 + 6), CH / (y1 - y0 + 6)) || 10;
}

const LV_COL = ['', 'rgba(245,159,0,.55)', 'rgba(224,49,49,.6)'];
let mouse = {px: 0, py: 0, wx: 0, wy: 0, inside: false, shift: false, ctrl: false};
let startDraft = null, flexFrom = null, branchFrom = null, preview = null, profCursor = null, hoverHit = null;

function drawPlan() {
  if (!CW || !CH) return;
  setScreen();
  ctx.fillStyle = '#e9ecef'; ctx.fillRect(0, 0, CW, CH);
  const bg = $('bg').value, img = bg === 'ortho' ? IMG.ortho : bg === 'relief' ? IMG.relief : null;
  if (img && img.complete && img.naturalWidth) {
    const [x0, y0] = w2s(-RES / 2, YMAX + RES / 2);
    ctx.drawImage(img, x0, y0, (XMAX + RES) * VW.sc, (YMAX + RES) * VW.sc);
  }
  setWorld();
  const px = 1 / VW.sc;
  if ($('lyCont').checked) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = bg === 'ortho' ? 'rgba(255,255,255,.45)' : 'rgba(70,50,30,.35)'; ctx.lineWidth = .7 * px; ctx.stroke(PATH.minor);
    ctx.strokeStyle = bg === 'ortho' ? 'rgba(255,236,170,.9)' : 'rgba(70,50,30,.8)'; ctx.lineWidth = 1.4 * px; ctx.stroke(PATH.major);
  }
  ctx.strokeStyle = '#e03131'; ctx.lineWidth = 2.5 * px; ctx.stroke(PATH.parcel);
  if (PATH.building) { ctx.strokeStyle = '#f2c200'; ctx.lineWidth = 2 * px; ctx.setLineDash([6 * px, 4 * px]); ctx.stroke(PATH.building); ctx.setLineDash([]); }
  if (NET) { if ($('lyEarth').checked) drawEarth(); drawTracks(px); }
  drawPreview(px);
  setScreen();
  drawOverlay();
}

function drawEarth() {
  for (const set of NET.sets) {
    const P = set.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], dm = (a.d + b.d) / 2;
      if (Math.abs(dm) < .01) continue;
      const wa = S.bForm / 2 + (a.d > 0 ? S.mFill : S.mCut) * Math.abs(a.d), wb = S.bForm / 2 + (b.d > 0 ? S.mFill : S.mCut) * Math.abs(b.d);
      const na = [-Math.sin(a.th), Math.cos(a.th)], nb = [-Math.sin(b.th), Math.cos(b.th)];
      const al = .18 + .5 * Math.min(1, Math.abs(dm) / .5);
      ctx.fillStyle = dm > 0 ? `rgba(232,131,58,${al})` : `rgba(58,123,232,${al})`;
      ctx.beginPath();
      ctx.moveTo(a.x + na[0] * wa, a.y + na[1] * wa); ctx.lineTo(b.x + nb[0] * wb, b.y + nb[1] * wb);
      ctx.lineTo(b.x - nb[0] * wb, b.y - nb[1] * wb); ctx.lineTo(a.x - na[0] * wa, a.y - na[1] * wa);
      ctx.closePath(); ctx.fill();
    }
  }
}
function polyOffset(P, off) { ctx.beginPath(); P.forEach((p, i) => { const x = p.x - Math.sin(p.th) * off, y = p.y + Math.cos(p.th) * off; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); }
function drawTrackPts(P, px, opts = {}) {
  const G = S.gauge, sc = VW.sc;
  if (opts.halo) { ctx.strokeStyle = opts.halo; ctx.lineWidth = Math.max(10 * px, G * 3.2); polyOffset(P, 0); ctx.stroke(); }
  if (sc < 22) {
    ctx.strokeStyle = opts.col || '#3b2a1a'; ctx.lineWidth = Math.max(2.5 * px, G * 1.3); polyOffset(P, 0); ctx.stroke();
    return;
  }
  // pražce
  ctx.strokeStyle = opts.col ? opts.col : '#7a5230'; ctx.lineWidth = Math.max(px, S.slPitch * .35);
  ctx.beginPath();
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], ds = Math.hypot(b.x - a.x, b.y - a.y);
    while (acc <= ds) {
      const t = ds ? acc / ds : 0, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, th = a.th, hl = S.slLen / 2;
      ctx.moveTo(x + Math.sin(th) * hl, y - Math.cos(th) * hl); ctx.lineTo(x - Math.sin(th) * hl, y + Math.cos(th) * hl);
      acc += S.slPitch;
    }
    acc -= ds;
  }
  ctx.stroke();
  ctx.strokeStyle = opts.col ? opts.col : '#4a4f55'; ctx.lineWidth = Math.max(1.2 * px, .018);
  polyOffset(P, G / 2); ctx.stroke(); polyOffset(P, -G / 2); ctx.stroke();
}
function drawTracks(px) {
  for (const set of NET.sets) {
    const lv = NET.elStat.get(set.e.id) || 0;
    const halo = set.e.id === sel ? 'rgba(9,105,218,.55)' : (lv ? LV_COL[lv] : null);
    drawTrackPts(set.pts, px, {halo});
  }
}
function radCol(R) { return R >= S.rRec - 1e-6 ? '#2f9e44' : R >= S.rMin - 1e-6 ? '#f08c00' : '#e03131'; }
function segPts(g) { const n = Math.max(2, Math.ceil(g.L / .1)), out = []; for (let i = 0; i <= n; i++) { const p = segAt(g, g.L * i / n); out.push({x: p.x, y: p.y, th: p.th}); } return out; }
function drawPreview(px) {
  if (tool === 'start' && startDraft) {
    const a = Math.atan2(mouse.wy - startDraft.y, mouse.wx - startDraft.x);
    ctx.strokeStyle = '#0969da'; ctx.lineWidth = 3 * px;
    ctx.beginPath(); ctx.moveTo(startDraft.x, startDraft.y); ctx.lineTo(startDraft.x + Math.cos(a) * 3, startDraft.y + Math.sin(a) * 3); ctx.stroke();
  }
  if (!preview) return;
  if (preview.segs) for (const g of preview.segs) {
    const col = Math.abs(g.k) < 1e-9 ? '#2f9e44' : radCol(1 / Math.abs(g.k));
    drawTrackPts(segPts(g), px, {halo: col + '88', col});
  }
  if (preview.turnout) {
    const g = turnoutGeom(preview.turnout), col = preview.bad ? '#e03131' : '#0969da';
    drawTrackPts(segPts(g.main[0]), px, {halo: col + '55', col});
    for (const s of g.main.slice(1)) drawTrackPts(segPts(s), px, {halo: col + '55', col});
    for (const s of g.div) drawTrackPts(segPts(s), px, {col});
  }
}
function drawOverlay() {
  const sc = VW.sc;
  ctx.font = '11px Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
  if ($('lyCont').checked && sc > 9) {
    ctx.fillStyle = $('bg').value === 'ortho' ? '#fff3bf' : '#5c3d1e';
    for (const l of PATH.labels) { const [x, y] = w2s(l.x, l.y); if (x > 0 && y > 0 && x < CW && y < CH) ctx.fillText(f(l.z, 0), x + 2, y); }
  }
  if (NET) {
    // popisky prvků
    if ($('lyLab').checked && sc > 7) {
      for (const e of M.elements) {
        if (e.type !== 'track' || e.L * sc < 40) continue;
        const m = segAt(e, e.L / 2), es = NET.elStats.get(e.id);
        const txt = (Math.abs(e.k) > 1e-9 ? `R ${f(1 / Math.abs(e.k), 1)} · ` : '') + `${f(e.L, 2)} m · ${f((es ? es.gMax : 0) * 100, 1)} %`;
        const off = (Math.abs(e.k) > 1e-9 ? -Math.sign(e.k) : 1) * (S.gauge * 2 + 14 / sc);
        const [x, y] = w2s(m.x - Math.sin(m.th) * off, m.y + Math.cos(m.th) * off);
        label(txt, x, y);
      }
    }
    // body: volné konce, vstupy, zafixované výšky
    for (const p of NET.open) {
      if (p.e.type === 'start') continue;
      const [x, y] = w2s(p.x, p.y);
      ctx.strokeStyle = '#2f9e44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(p.a) * 14, y - Math.sin(p.a) * 14); ctx.stroke();
      ctx.fillStyle = '#2f9e44'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    for (const e of M.elements) if (e.type === 'start') {
      const [x, y] = w2s(e.x, e.y);
      ctx.fillStyle = e.id === sel ? '#0969da' : '#1c7ed6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(e.h) * 14, y - Math.sin(e.h) * 14);
      ctx.lineTo(x + Math.cos(e.h + 2.5) * 8, y - Math.sin(e.h + 2.5) * 8); ctx.lineTo(x + Math.cos(e.h - 2.5) * 8, y - Math.sin(e.h - 2.5) * 8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); ctx.stroke();
    }
    for (const k of Object.keys(M.pins)) {
      const ni = NET.portNode.get(k); if (ni === undefined) continue;
      const n = NET.nodes[ni], [x, y] = w2s(n.x, n.y);
      ctx.fillStyle = '#9c36b5'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeStyle = '#fff'; ctx.strokeRect(x - 4, y - 4, 8, 8);
      label(`TK ${f(NET.h[ni], 2)}`, x + 8, y - 10, '#9c36b5');
    }
  }
  if (flexFrom) { const [x, y] = w2s(flexFrom.x, flexFrom.y); ctx.strokeStyle = '#0969da'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.stroke(); }
  if (branchFrom) { const e = elById(branchFrom.id); if (e) { const p = segAt(e, branchFrom.s), [x, y] = w2s(p.x, p.y); ctx.strokeStyle = '#0969da'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.stroke(); } }
  // křížení X (hotová i v náhledu)
  const xMark = (x, y, col, txt) => {
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke();
    if (txt) label(txt, x + 13, y - 12, col);
  };
  if (NET && NET.crossInfo) for (const e of M.elements) if (e.type === 'cross') {
    const ci = NET.crossInfo.get(e.id) || {}, [x, y] = w2s(e.x, e.y);
    xMark(x, y, e.id === sel ? '#0969da' : ci.ok ? '#5f3dc4' : '#e03131', `X ${ci.ang != null ? f(ci.ang, 0) + '°' : '?'}`);
  }
  if (preview && preview.cross) { const [x, y] = w2s(preview.cross.x, preview.cross.y); xMark(x, y, preview.bad ? '#e03131' : '#5f3dc4', ''); }
  if (preview && preview.snap) { const [x, y] = w2s(preview.snap.x, preview.snap.y); ctx.strokeStyle = '#2f9e44'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.stroke(); }
  if (drag && drag.mv) {      // při přesunu: místa, kam se lze přichytit
    for (const t of drag.mv.targets) { const [x, y] = w2s(t.x, t.y); ctx.strokeStyle = 'rgba(47,158,68,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke(); }
    if (drag.mv.snapTo) { const [x, y] = w2s(drag.mv.snapTo.x, drag.mv.snapTo.y); ctx.strokeStyle = '#2f9e44'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke(); }
  }
  if (preview && preview.center) {
    const [x, y] = w2s(preview.center.x, preview.center.y);
    ctx.strokeStyle = '#0969da'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
  }
  if (preview && preview.text) label(preview.text, mouse.px + 14, mouse.py + 16, preview.bad ? '#e03131' : '#0b3d91');
  if (profCursor) {
    const [x, y] = w2s(profCursor.x, profCursor.y);
    ctx.strokeStyle = '#d6336c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
  }
  svDraw();
  // měřítko
  const target = 120 / sc, nice = [.5, 1, 2, 5, 10, 20, 50].find(v => v >= target) || 50, wpx = nice * sc;
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(CW - wpx - 24, 8, wpx + 16, 24);
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CW - wpx - 16, 24); ctx.lineTo(CW - 16, 24); ctx.stroke();
  ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.fillText(`${f(nice, nice < 1 ? 1 : 0)} m`, CW - 16 - wpx / 2, 15); ctx.textAlign = 'left';
}
function label(txt, x, y, col = '#1f2328') {
  const w = ctx.measureText(txt).width;
  ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(x - 3, y - 8, w + 6, 16);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}

/* --- hit-testy --- */
function hitTrack(wx, wy, tol) {
  let best = null;
  if (!NET) return null;
  for (const set of NET.sets) {
    const P = set.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      let t = l2 ? ((wx - a.x) * dx + (wy - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const x = a.x + t * dx, y = a.y + t * dy, d = Math.hypot(wx - x, wy - y);
      if (d < tol && (!best || d < best.d)) {
        const pt = {}; for (const k of ['s', 'x', 'y', 't', 'h', 'f', 'd']) pt[k] = a[k] + (b[k] - a[k]) * t;
        pt.k = a.k; pt.th = a.th; pt.g = l2 ? (b.h - a.h) / (b.s - a.s) : 0;
        best = {d, set, s: pt.s, pt};
      }
    }
  }
  return best;
}
function nearestOpen(wx, wy, tol, excl) {
  let best = null, bd = tol;
  for (const p of NET.open) {
    if (excl && Math.hypot(p.x - excl.x, p.y - excl.y) < 1e-3) continue;
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function hitStart(wx, wy, tol) {
  let best = null, bd = tol;
  for (const e of M.elements) if (e.type === 'start') { const d = Math.hypot(e.x - wx, e.y - wy); if (d < bd) { bd = d; best = e; } }
  return best;
}
function hitCross(wx, wy, tol) {
  let best = null, bd = tol;
  for (const e of M.elements) if (e.type === 'cross') { const d = Math.hypot(e.x - wx, e.y - wy); if (d < bd) { bd = d; best = e; } }
  return best;
}
const snapStep = v => Math.round(v / S.step) * S.step;

/* --- asistent flexi koleje: první křížení s existující kolejí, napojení výhybkou --- */
let assistIdx = 0, assistKey = '';
function firstCrossing(segs) {
  const Q = []; let acc = 0;
  for (const g of segs) {
    const n = Math.max(2, Math.ceil(g.L / .1));
    for (let i = Q.length ? 1 : 0; i <= n; i++) { const s = g.L * i / n, p = segAt(g, s); Q.push({x: p.x, y: p.y, th: p.th, d: acc + s}); }
    acc += g.L;
  }
  let best = null;
  for (const set of NET.sets) {
    const P = set.pts;
    for (let i = 0; i < Q.length - 1; i++) {
      if (Q[i + 1].d < .3) continue;                        // začátek (navazující kolej) vynechat
      const q1 = Q[i], q2 = Q[i + 1];
      for (let j = 0; j < P.length - 1; j++) {
        const r = segInter(q1.x, q1.y, q2.x, q2.y, P[j].x, P[j].y, P[j + 1].x, P[j + 1].y);
        if (!r) continue;
        const d = q1.d + r.t * (q2.d - q1.d);
        if (best && d >= best.d) continue;
        const dth = Math.abs(((q1.th - P[j].th) % Math.PI + Math.PI) % Math.PI);
        best = {d, set, x: q1.x + r.t * (q2.x - q1.x), y: q1.y + r.t * (q2.y - q1.y),
                se: P[j].s + r.u * (P[j + 1].s - P[j].s), ang: deg(Math.min(dth, Math.PI - dth))};
      }
    }
  }
  return best;
}
function joinCandidate(E, s0, P, full = false) {   // napojit kolej z P výhybkou do koleje E (přímé i oblouku) poblíž s0 (full = celá kolej)
  if (E.type !== 'track') return {bad: true, text: `Napojit jde jen do koleje, ne do výhybky (${elName(E)})`};
  const p0 = segAt(E, s0), side0 = Math.sign(Math.cos(p0.th) * (P.y - p0.y) - Math.sin(p0.th) * (P.x - p0.x)) || 1;
  const arc = Math.abs(E.k) > 1e-9, step = Math.max(S.step, .25);
  const sFrom = full ? 0 : Math.max(0, s0 - 8), sTo = full ? E.L : Math.min(E.L, s0 + 8);
  let best = null, why = '';
  for (const o of [1, -1]) for (let s1 = snapStep(sFrom); s1 <= sTo + 1e-9; s1 += step) {
    const cands = [turnoutAt(E, s1, side0 * o, o < 0, S.toR, 'curved')];
    if (arc) cands.push(turnoutAt(E, s1, 0, o < 0, 0, 'tangent'), turnoutAt(E, s1, 0, o < 0, 0, 'Y'));
    for (const T of cands) {
      if (!T || Math.abs(T.s - s1) > 1e-6) continue;             // mimo kolej (u konce by se výhybka posunula)
      if (S.strictR && T.rDiv < S.rMin - 1e-6) { why = `odbočka výhybky by měla R ${f(T.rDiv, 1)} m`; continue; }
      const fp = freePortOf(T.t), b = biarc(P, P.a, fp, fp.th + Math.PI);
      if (!b) continue;
      const mr = minRad(b), turn = b.reduce((a, q) => a + Math.abs(q.k * q.L), 0), len = b.reduce((a, q) => a + q.L, 0);
      if (S.strictR && mr < S.rMin - 1e-6) { why = why || `přípojný oblouk by měl R ${f(mr, 1)} m`; continue; }
      if (turn > Math.PI * 1.2) continue;
      const rNew = T.kind === 'tangent' ? 50 : T.rDiv;            // u výhybky v poloměru oblouku je nová větev přímá
      const score = Math.min(mr, 50, rNew) - .8 * Math.abs(s1 - s0) - .1 * len - .5 * turn;
      if (!best || score > best.score) best = {score, segs: b, turnout: T.t, e: E, s: T.s, rev: T.rev, mr, rDiv: T.rDiv, T};
    }
  }
  if (!best) return {bad: true, text: `Napojit výhybkou do ${elName(E)} tady nejde${why ? ` (${why}, min. ${f(S.rMin, 1)} m)` : ''} – přibližte se pod menším úhlem nebo z větší dálky`};
  return best;
}
function joinOption(J, E) {
  if (J.bad) return {kind: 'join', bad: true, block: true, segs: null, text: J.text};
  const rs = J.segs.filter(g => Math.abs(g.k) > 1e-9).map(g => `R ${f(1 / Math.abs(g.k), 1)}`).join(' + ');
  const L = J.segs.reduce((a, g) => a + g.L, 0);
  return {kind: 'join', segs: J.segs, turnout: J.turnout, action: J, bad: false,
          text: `Napojit do ${elName(E)}: ${turnoutLabel(J.T)}, přípojka ${f(L, 2)} m${rs ? ` (${rs})` : ' rovně'}`};
}

/* --- náhledy nástrojů --- */
const minRad = segs => segs.reduce((m, g) => Math.abs(g.k) > 1e-9 ? Math.min(m, 1 / Math.abs(g.k)) : m, Infinity);
const tooTight = segs => minRad(segs) < S.rMin - 1e-6;
function flexPreview(P = flexFrom, noAssist = false) {
  const a = P.a, Q = {x: mouse.wx, y: mouse.wy};
  const tgt = nearestOpen(Q.x, Q.y, 15 / VW.sc, P);
  if (tgt) {
    const b = biarc(P, a, tgt, tgt.a + Math.PI);
    if (b) {
      const txt = 'napojit: ' + b.map(g => Math.abs(g.k) > 1e-9 ? `R ${f(1 / Math.abs(g.k), 1)}` : 'přímá').join(' + ');
      if (S.strictR && tooTight(b)) return {segs: b, snap: tgt, bad: true, block: true, text: `${txt} – NELZE, poloměr pod min. ${f(S.rMin, 1)} m`};
      return {segs: b, snap: tgt, text: txt, bad: tooTight(b)};
    }
  }
  const Rf = S.strictR ? Math.max(S.rFlex, S.rMin) : S.rFlex;
  let segs = null, block = false, why = '';
  if (mouse.ctrl) { const L = (Q.x - P.x) * Math.cos(a) + (Q.y - P.y) * Math.sin(a); segs = L > 1e-3 ? [{x: P.x, y: P.y, h: a, k: 0, L}] : null; }
  else if (mouse.shift) { const g = arcThrough(P, a, Q); segs = g ? [g] : null; }
  else {
    segs = arcThenLine(P, a, Q, Rf);
    if (!segs) { const g = arcThrough(P, a, Q); segs = g ? [g] : null; if (S.strictR) why = ' – kurzor je uvnitř oblouku R ' + f(Rf, 1) + ' m, oddalte ho'; }
  }
  if (!segs) return null;
  const last = segs[segs.length - 1];
  const Lr = Math.round(last.L / S.step) * S.step;
  if (Lr >= S.step - 1e-9) last.L = Lr; else if (segs.length > 1) segs.pop(); else last.L = S.step;
  let txt = segs.map(g => Math.abs(g.k) > 1e-9 ? `oblouk R ${f(1 / Math.abs(g.k), 2)} m, ${f(g.L, 2)} m` : `přímá ${f(g.L, 2)} m`).join(' + ');
  const bad = tooTight(segs);
  if (bad && S.strictR) { block = true; txt += ` – NELZE, poloměr pod min. ${f(S.rMin, 1)} m${why}`; }
  const base = {segs, text: txt, bad, block};
  if (noAssist) return base;
  // asistent: dotyk koleje → napojení výhybkou; překřížení koleje → křížení X (nebo napojení)
  const opts = []; let key = '';
  const near = hitTrack(Q.x, Q.y, 15 / VW.sc);
  if (near && near.d > 1e-6 && Math.hypot(near.pt.x - P.x, near.pt.y - P.y) > .5) {
    key = 'j' + near.set.e.id;
    if (near.set.e.type === 'turnout') opts.push({kind: 'join', bad: true, block: true, segs: null, text: 'Do výhybky nelze napojit – veďte kolej k přímé koleji'});
    else opts.push(joinOption(joinCandidate(near.set.e, near.s, P), near.set.e));
  } else {
    const X = firstCrossing(segs);
    if (X) {
      key = 'x' + X.set.e.id;
      if (X.set.e.type === 'turnout') opts.push(Object.assign({}, base, {kind: 'cross', bad: true, block: true, cross: X, text: `Kolej by křížila výhybku ${elName(X.set.e)} – to nejde, veďte ji jinudy`}));
      else {
        const lowA = X.ang < S.xAng - 1e-6;
        opts.push(Object.assign({}, base, {kind: 'cross', cross: X, bad: base.bad || lowA,
          text: `Křížení X s ${elName(X.set.e)} pod úhlem ${f(X.ang, 0)}°${lowA ? ` – POD MIN. ${f(S.xAng, 0)}°` : ''}`}));
        const J = joinCandidate(X.set.e, X.se, P);
        if (!J.bad) opts.push(joinOption(J, X.set.e));
      }
    }
  }
  if (!opts.length) return base;
  opts.push(Object.assign({}, base, {kind: 'plain', text: base.text + ' – jen kolej, bez napojení'}));
  if (key !== assistKey) { assistKey = key; assistIdx = 0; }
  const o = Object.assign({}, opts[assistIdx % opts.length]);
  o.text += `   [Tab = další možnost ${assistIdx % opts.length + 1}/${opts.length}]`;
  return o;
}
function branchTurnout(e, s0, wx, wy) {   // výhybka do koleje e (přímá i oblouk) v místě s0, strana a směr podle kurzoru
  const p0 = segAt(e, s0), ex = Math.cos(p0.th), ey = Math.sin(p0.th);
  const along = (wx - p0.x) * ex + (wy - p0.y) * ey, side = Math.sign(ex * (wy - p0.y) - ey * (wx - p0.x)) || 1;
  const o = along >= 0 ? 1 : -1, T = turnoutAt(e, s0, side * o, o < 0);
  return T ? {t: T.t, s: T.s, rev: T.rev, e, rDiv: T.rDiv, T} : null;
}
function branchPreview() {
  const e = elById(branchFrom.id);
  if (!e || e.type !== 'track') { branchFrom = null; return null; }
  const bt = branchTurnout(e, branchFrom.s, mouse.wx, mouse.wy);
  if (!bt) return {bad: true, block: true, text: `Kolej ${elName(e)} je na výhybku krátká`};
  if (S.strictR && bt.rDiv < S.rMin - 1e-6)
    return {bad: true, block: true, turnout: bt.t, text: `Odbočka by měla poloměr ${f(bt.rDiv, 1)} m < min. ${f(S.rMin, 1)} m – táhněte na druhou stranu (ven z oblouku)`};
  const C = freePortOf(bt.t);
  const far = Math.hypot(mouse.wx - C.x, mouse.wy - C.y) > .5 && (mouse.wx - C.x) * Math.cos(C.a) + (mouse.wy - C.y) * Math.sin(C.a) > 0;
  const fp = far ? (flexPreview(C, true) || {segs: []}) : {segs: []};
  return Object.assign({}, fp, {turnout: bt.t, branch: bt,
    text: `odbočka: ${turnoutLabel(bt.T)}${bt.rev ? ' (proti směru koleje)' : ''}${fp.text ? ' + ' + fp.text : ''}`});
}
function turnoutPreview() {
  const Y = tool === 'toY', side = tool === 'toL' ? 1 : tool === 'toR' ? -1 : 0, R = Y ? S.toRY : S.toR, nm = Y ? 'Y' : side > 0 ? 'L' : 'P';
  const base = {type: 'turnout', side, R, n: S.toN, L: S.toL, route: 'B'};
  if (Y) base.kind = 'Y';
  const op = nearestOpen(mouse.wx, mouse.wy, 15 / VW.sc, null);
  if (op) {
    if (S.strictR && R < S.rMin - 1e-6)
      return {bad: true, text: `Poloměr ${Y ? 'větví Y výhybky' : 'odbočky výhybky'} ${f(R, 1)} m je menší než min. ${f(S.rMin, 1)} m – upravte v sekci Výhybky, nebo vypněte omezení`};
    return {kind: 'port', turnout: Object.assign({}, base, {x: op.x, y: op.y, h: op.a}), text: `výhybka ${nm} na volný konec`};
  }
  const hit = hitTrack(mouse.wx, mouse.wy, 12 / VW.sc);
  if (!hit || hit.set.e.type !== 'track') return null;
  const e = hit.set.e, rev = $('toRev').checked, arc = Math.abs(e.k) > 1e-9;
  if (Y && !arc) return {bad: true, text: 'Y výhybku nejde vložit do přímé koleje – jen do oblouku / kruhu (jedna větev pokračuje obloukem) nebo na volný konec.'};
  const T = Y ? turnoutAt(e, hit.s, 0, rev, 0, 'Y') : turnoutAt(e, hit.s, side, rev, R);
  if (!T) return {bad: true, text: `Kolej ${elName(e)} je na výhybku krátká`};
  if (S.strictR && T.rDiv < S.rMin - 1e-6)
    return {bad: true, turnout: T.t, text: `Odbočka by měla poloměr ${f(T.rDiv, 1)} m < min. ${f(S.rMin, 1)} m – zkuste druhou stranu nebo větší poloměr výhybky`};
  return {kind: 'insert', e, s: T.s, rev, turnout: T.t, text: `vložit ${turnoutLabel(T)} v ${f(T.s, 2)} m${rev ? ' (proti směru)' : ''}`};
}
const circleAuto = () => !(S.rCircle > 0);
const circleR = () => { const R = circleAuto() ? S.rRec : S.rCircle; return S.strictR ? Math.max(R, S.rMin) : R; };
function circlePreview() {
  const R = circleR(), cx = snapStep(mouse.wx), cy = snapStep(mouse.wy);
  const seg = {x: cx + R, y: cy, h: Math.PI / 2, k: 1 / R, L: TAU * R};
  return {segs: [seg], center: {x: cx, y: cy}, bad: R < S.rMin - 1e-6,
          text: `kruh R ${f(R, 2)} m${circleAuto() ? ' (doporučený)' : ''}, obvod ${f(seg.L, 2)} m – klik = vložit`};
}
function updatePreview() {
  preview = null;
  if (!NET) return;
  if (tool === 'flex' && branchFrom) preview = branchPreview();
  else if (tool === 'flex' && flexFrom) preview = flexPreview();
  else if (tool === 'toL' || tool === 'toR' || tool === 'toY') preview = turnoutPreview();
  else if (tool === 'circle' && mouse.inside) preview = circlePreview();
}

/* --- akce --- */
function addTrack(g) { const e = {type: 'track', id: M.nextId++, x: g.x, y: g.y, h: g.h, k: g.k, L: g.L, gMax: null}; M.elements.push(e); return e; }
function splitTrackAt(e, s) {            // rozdělí kolej v s, vrátí druhý díl (nebo null u konce)
  if (s <= 1e-3 || s >= e.L - 1e-3) return null;
  const p2 = addTrack(subSeg(e, s, e.L)); p2.gMax = e.gMax;
  movePin(e.id + ':1', p2.id + ':1');
  e.L = s;
  return p2;
}
function insertTurnoutInto(e, s, rev, tp) {   // vloží výhybku do koleje e (A v místě s); v koleji pokračuje větev t.follow (výchozí B)
  const t = Object.assign({}, tp, {id: M.nextId++}), Lm = occupiedLen(t), L0 = e.L;
  const [a0, a1, b0, b1] = rev ? [0, s - Lm, s, L0] : [0, s, s + Lm, L0];
  if (b1 - b0 > 1e-3) { const p2 = addTrack(subSeg(e, b0, b1)); p2.gMax = e.gMax; movePin(e.id + ':1', p2.id + ':1'); }
  else delete M.pins[e.id + ':1'];
  if (a1 - a0 > 1e-3) Object.assign(e, subSeg(e, a0, a1));
  else { M.elements = M.elements.filter(x => x !== e); delPins(e.id); }
  M.elements.push(t);
  return t;
}
function commitCross(X, added) {         // křížení X: rozdělit obě koleje v průsečíku + bod křížení
  let acc = 0;
  for (const e of added) { if (X.d <= acc + e.L + 1e-9) { splitTrackAt(e, X.d - acc); break; } acc += e.L; }
  splitTrackAt(X.set.e, X.se);
  const c = {type: 'cross', id: M.nextId++, x: X.x, y: X.y, h: 0};
  M.elements.push(c);
  return c;
}
function clickAt(wx, wy, ev) {
  const tolPx = 12 / VW.sc;
  if (tool === 'svpt') {
    if (!svIn(wx, wy)) { hint('Bod musí ležet na území mapy.', true); return; }
    const p = svAdd(wx, wy); svChanged(); svSelect(p.id, true);
    hint(`Kontrolní bod ${p.n} – zapište odečet z laseru do tabulky (Enter = další řádek).`);
    return;
  }
  if (tool === 'select') {
    const st = hitStart(wx, wy, tolPx) || hitCross(wx, wy, tolPx);
    const hit = st ? null : hitTrack(wx, wy, tolPx);
    sel = st ? st.id : hit ? hit.set.e.id : null;
    recompute(false);
  } else if (tool === 'start') {
    if (!startDraft) { startDraft = {x: snapStep(wx), y: snapStep(wy)}; }
    else {
      let a = Math.atan2(wy - startDraft.y, wx - startDraft.x);
      if (ev.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      pushUndo();
      const e = {type: 'start', id: M.nextId++, x: startDraft.x, y: startDraft.y, h: a};
      M.elements.push(e); startDraft = null; sel = e.id;
      M.pins[e.id + ':0'] = {mode: 'ter', v: 0};      // vstupní bod: pláň na terénu (lze změnit)
      setTool('flex'); flexFrom = {x: e.x, y: e.y, a: e.h};
      recompute();
    }
  } else if (tool === 'flex') {
    if (!flexFrom && !branchFrom) {
      const op = nearestOpen(wx, wy, 15 / VW.sc, null);
      if (op) { flexFrom = {x: op.x, y: op.y, a: op.a}; return; }
      const hit = hitTrack(wx, wy, tolPx);                  // klik do existující koleje = odbočka s výhybkou
      if (hit && hit.set.e.type === 'track') {
        branchFrom = {id: hit.set.e.id, s: snapStep(hit.s)};
        hint('Odbočka: táhněte na stranu, kam má nová kolej vést (strana a směr výhybky se zvolí podle kurzoru). Klik = položit, Esc = zrušit.');
        updatePreview(); drawPlan(); return;
      }
      if (hit) hint('Z výhybky nelze odbočit – klikněte na kolej nebo volný konec.', true);
      else hint('Klikněte na volný konec koleje (zelený bod), do přímé koleje (odbočka) nebo vytvořte vstupní bod (S).', true);
    } else if (preview && preview.block) {
      hint(preview.text, true);
    } else if (branchFrom && preview && preview.branch) {
      pushUndo();
      const B = preview.branch, t = insertTurnoutInto(B.e, B.s, B.rev, B.t);
      let last = null;
      for (const g of preview.segs || []) if (g.L > 1e-4) last = addTrack(g);
      const p = last ? segAt(last, last.L) : freePortOf(t);
      branchFrom = null; flexFrom = preview.snap ? null : {x: p.x, y: p.y, a: p.th};
      sel = t.id;
      recompute();
    } else if (preview && preview.kind === 'join') {
      pushUndo();
      const J = preview.action, t = insertTurnoutInto(J.e, J.s, J.rev, J.turnout);
      for (const g of preview.segs) if (g.L > 1e-4) addTrack(g);
      flexFrom = null; sel = t.id;
      recompute();
      hint(`Napojeno výhybkou #${t.id} do koleje.`);
    } else if (preview && preview.segs) {
      pushUndo();
      const added = [];
      for (const g of preview.segs) if (g.L > 1e-4) added.push(addTrack(g));
      const last = added[added.length - 1], endP = last ? segAt(last, last.L) : null;
      let cr = null;
      if (preview.kind === 'cross') cr = commitCross(preview.cross, added);
      if (preview.snap || !last) flexFrom = null; else flexFrom = {x: endP.x, y: endP.y, a: endP.th};
      if (last) sel = last.id;
      recompute();
      if (cr) hint(`Vloženo ${elName(cr)} – obě koleje jsou v bodě křížení ve stejné výšce.`);
    }
  } else if (tool === 'toL' || tool === 'toR' || tool === 'toY') {
    const pv = turnoutPreview();
    if (!pv || pv.bad) { if (pv) hint(pv.text, true); return; }
    pushUndo();
    let t;
    if (pv.kind === 'insert') t = insertTurnoutInto(pv.e, pv.s, pv.rev, pv.turnout);
    else { t = Object.assign({}, pv.turnout, {id: M.nextId++}); M.elements.push(t); }
    sel = t.id;
    recompute();
  } else if (tool === 'circle') {
    mouse.wx = wx; mouse.wy = wy;
    const pv = circlePreview();
    pushUndo();
    const e = addTrack(pv.segs[0]); sel = e.id;
    recompute(); setTool('select');
    hint(`Kruh #${e.id} vložen (R ${f(1 / e.k, 2)} m). Táhnutím ho posuňte, R = otočit, nástrojem Rozdělit (D) nařežte a nepotřebné části smažte (X).`);
  } else if (tool === 'split') {
    const hit = hitTrack(wx, wy, tolPx);
    if (!hit || hit.set.e.type !== 'track') return;
    const e = hit.set.e, s = snapStep(hit.s);
    if (s <= 1e-3 || s >= e.L - 1e-3) { hint('Příliš blízko konce prvku.', true); return; }
    pushUndo();
    sel = splitTrackAt(e, s).id;
    recompute();
  } else if (tool === 'del') {
    const st = hitStart(wx, wy, tolPx) || hitCross(wx, wy, tolPx), hit = st ? null : hitTrack(wx, wy, tolPx), e = st || (hit && hit.set.e);
    if (e) deleteEl(e);
  }
}
function deleteEl(e) {
  pushUndo();
  M.elements = M.elements.filter(x => x !== e); delPins(e.id);
  if (sel === e.id) sel = null;
  flexFrom = null;
  recompute();
}
function setTool(t) {
  tool = t; startDraft = null; preview = null; branchFrom = null;
  if (t !== 'flex') flexFrom = null;
  document.querySelectorAll('button.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  const H = {
    select: 'Výběr: klik = vlastnosti · táhnout prvek = přesun (odpojí se, u volného konce se přichytí) · Shift+táhnout = celá připojená skupina · R = otočit · šipky = posun o krok.',
    start: 'Vstupní bod: klikněte na místo, kde trať začíná.',
    flex: 'Flexi kolej: klik na volný konec (zelený bod) a táhněte, nebo klik do přímé koleje = odbočka s výhybkou. Shift = oblouk přes kurzor, Ctrl = přímá. Při dotyku či překřížení jiné koleje asistent nabídne napojení výhybkou / křížení X (Tab = další možnost). Esc = konec.',
    circle: 'Kruh: klik = střed celého kruhu o poloměru „R kruhu“ (výchozí = doporučený min. poloměr). Potom ho přetáhněte (Výběr), rozdělte (Rozdělit) a nepotřebné části smažte.',
    toL: 'Výhybka levá: klik na volný konec nebo do přímé koleje.',
    toR: 'Výhybka pravá: klik na volný konec nebo do přímé koleje.',
    toY: 'Výhybka Y (symetrická): klik na volný konec koleje. Kterýkoli její konec lze pak přetáhnout na jiný volný konec.',
    split: 'Rozdělit: klik na kolej (bod se zaokrouhlí na krok).',
    del: 'Smazat: klik na prvek.',
    svpt: 'Kontrolní bod: klik = nový bod v místě, kde stála lať (podle ortofota), pak do tabulky zapište odečet z laseru · táhnout bod = přesun · klik na bod = najít v tabulce · pravý klik = smazat.',
  };
  hint(H[t]);
  drawPlan();
}
let hintTimer = null;
function hint(t, warn) {
  const el = $('hint'); el.textContent = t || ''; el.style.color = warn ? '#cf222e' : '';
  clearTimeout(hintTimer);
  if (warn) hintTimer = setTimeout(() => setTool(tool), 3500);
}

/* --- přesun hotových prvků --- */
// množina přesouvaných prvků: jen prvek, nebo celá připojená skupina (vstupní bod vždy se skupinou)
function moveSetFor(e, group) {
  if (e.type === 'start') return startComponent(e);
  if (!group) return new Set([e.id]);
  const ids = componentFrom(e, -1);
  for (const s of M.elements) if (s.type === 'start') { const h = NET.startAt.get(s.id); if (h && ids.has(h.e.id)) ids.add(s.id); }
  return ids;
}
function beginMove(e, group, wx, wy) {
  const ids = moveSetFor(e, group), orig = new Map(), targets = [], movers = [];
  for (const id of ids) { const el = elById(id); orig.set(id, {x: el.x, y: el.y, h: el.h}); }
  for (const p of NET.all) {
    const q = NET.conn.get(p.key);
    if (ids.has(p.e.id)) { if (!q || !ids.has(q.e.id)) movers.push({id: p.e.id, i: p.i}); }
    else if (!q || ids.has(q.e.id)) targets.push({x: p.x, y: p.y, a: p.a});
  }
  return {ids, orig, targets, movers, gx: wx, gy: wy, rot: 0, snap: JSON.stringify(M), snapTo: null, n: ids.size};
}
function applyMove(mv, wx, wy) {
  const dx = snapStep(wx - mv.gx), dy = snapStep(wy - mv.gy);
  for (const [id, o] of mv.orig) { const el = elById(id); Object.assign(el, o); rigid(el, mv.gx, mv.gy, mv.rot, dx, dy); }
  // přichycení volného konce k volnému konci jiné koleje (poloha i směr)
  mv.snapTo = null;
  let best = null, bd = 15 / VW.sc;
  for (const m of mv.movers) {
    const p = ports(elById(m.id))[m.i];
    for (const t of mv.targets) {
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d < bd && Math.cos(p.a - t.a) < -.5) { bd = d; best = {p, t}; }
    }
  }
  if (best) {
    const dth = best.t.a + Math.PI - best.p.a;
    for (const id of mv.ids) rigid(elById(id), best.p.x, best.p.y, dth, best.t.x - best.p.x, best.t.y - best.p.y);
    mv.snapTo = best.t;
  }
}
function moveHint(mv) {
  hint(`Přesun: ${mv.n === 1 ? 'jen prvek' : `skupina ${mv.n} prvků`}${mv.rot ? `, otočeno o ${f(deg(mv.rot), 0)}°` : ''}` +
       (mv.snapTo ? ' – PŘICHYCENO k volnému konci' : ' – R / Shift+R otočit o 15°, konec u volného konce se přichytí'));
}

/* --- kontextová nabídka: pravý klik na kolej / volný konec / křížení --- */
let ctxMenu = null;
function closeCtx() {
  const m = $('ctxMenu'); m.classList.add('hidden'); m.innerHTML = '';
  if (ctxMenu) { ctxMenu = null; preview = null; drawPlan(); }
}
/* Výhybka do koleje e poblíž s0 (posunutá, aby se vešla). mode:
   'auto'    – v oblouku: strana = strana oblouku → výhybka v poloměru oblouku (tečná), jinak oblouková ven; v přímé běžná
   'tangent' – běžná výhybka s poloměrem odbočky = poloměr oblouku: odbočka pokračuje obloukem, přímá větev vyjede tečně ven
   'Y'       – Y výhybka s poloměrem větví = poloměr oblouku: jedna větev pokračuje obloukem, druhá vyjede ven
   'curved'  – oblouková výhybka (hlavní větev = oblouk koleje, odbočka o 1/R výhybky) */
function fitTurnout(R, kRel, Y) {          // výhybka „v poloměru oblouku“ – větev po oblouku je čistý oblouk (bez přímé za ním)
  const al = Math.atan(1 / S.toN), sk = Math.sign(kRel) || 1;
  return Y ? {type: 'turnout', kind: 'Y', side: 0, R, n: S.toN, L: R * Math.sin(al / 2) * (1 - 1e-9), follow: sk > 0 ? 'B' : 'C'}
           : {type: 'turnout', side: sk, R, n: S.toN, L: R * Math.sin(al) * (1 - 1e-9), follow: 'C'};
}
const occupiedLen = t => { const g = turnoutGeom(t); return t.follow === 'C' ? g.Ldiv : g.Lmain; };   // délka koleje, kterou výhybka nahradí
function freePortOf(t) {                  // konec výhybky, ze kterého vede nová kolej (ne ten, který pokračuje v původní koleji)
  const g = turnoutGeom(t), p = t.follow === 'C' ? g.B : g.C;
  return {x: p.x, y: p.y, th: p.th, a: p.th};
}
function turnoutAt(e, s0, side, rev, R = S.toR, mode = 'auto') {
  const arc = Math.abs(e.k) > 1e-9, kRel = rev ? -e.k : e.k, sk = Math.sign(kRel);
  let t;
  if (arc && (mode === 'tangent' || mode === 'Y' || (mode === 'auto' && side === sk))) t = fitTurnout(1 / Math.abs(e.k), kRel, mode === 'Y');
  else if (mode === 'tangent' || mode === 'Y') return null;
  else { t = {type: 'turnout', side, R, n: S.toN, L: S.toL}; if (arc) t.km = kRel; }
  Object.assign(t, {route: t.follow || 'B', x: 0, y: 0, h: 0});
  const Lm = occupiedLen(t);
  let s = snapStep(s0);
  s = rev ? Math.max(s, Lm) : Math.min(s, e.L - Lm);
  if (s < -1e-6 || s > e.L + 1e-6) return null;
  const p = segAt(e, s);
  Object.assign(t, {x: p.x, y: p.y, h: rev ? p.th + Math.PI : p.th});
  return {e, s, rev, t, rDiv: turnoutDivR(t), fit: !!t.follow, kind: t.follow ? (t.kind === 'Y' ? 'Y' : 'tangent') : (arc ? 'curved' : 'straight')};
}
function turnoutLabel(T) {                // krátký popis výhybky pro nápovědy
  if (!T) return '';
  if (T.kind === 'tangent') return `výhybka v poloměru oblouku R ${f(T.t.R, 1)} m (přímá větev tečně ven)`;
  if (T.kind === 'Y') return `výhybka Y v poloměru oblouku R ${f(T.t.R, 1)} m (druhá větev ven)`;
  if (T.kind === 'curved') return `oblouková výhybka ${T.t.side > 0 ? 'L' : 'P'} (R odbočky ${T.rDiv > 999 ? '∞' : f(T.rDiv, 1)} m)`;
  return `výhybka ${T.t.side > 0 ? 'L' : 'P'}`;
}
function trackNearestS(E, P) {             // nejbližší místo na koleji E k bodu P
  let best = 0, bd = Infinity;
  const n = Math.max(2, Math.ceil(E.L / .25));
  for (let i = 0; i <= n; i++) { const s = E.L * i / n, p = segAt(E, s), d = Math.hypot(p.x - P.x, p.y - P.y); if (d < bd) { bd = d; best = s; } }
  return best;
}
function autoJoin(P, excludeId) {          // pomocník: nejlepší napojení volného konce P výhybkou na libovolnou kolej
  let best = null;
  for (const E of M.elements) {
    if (E.type !== 'track' || E.id === excludeId) continue;
    const J = joinCandidate(E, trackNearestS(E, P), P, true);
    if (!J.bad && (!best || J.score > best.score)) best = J;
  }
  return best;
}
function openCtx(px, py, wx, wy) {
  const tol = 12 / VW.sc, rOk = R => !(S.strictR && R < S.rMin - 1e-6);
  const op = nearestOpen(wx, wy, 15 / VW.sc, null), cr = hitCross(wx, wy, tol), st = hitStart(wx, wy, tol);
  const hit = (op || cr || st) ? null : hitTrack(wx, wy, tol);
  const items = [], sp = svHit(wx, wy, 10 / VW.sc);
  if (sp) {
    items.push({head: `Kontrolní bod ${sp.n}`},
      {label: 'Najít v tabulce / zapsat odečet', run: () => svSelect(sp.id, true)},
      {label: 'Smazat bod', run: () => svDelete(sp.id)});
  } else if (op) {
    const mk = (side, kind) => Object.assign({type: 'turnout', side, R: kind ? S.toRY : S.toR, n: S.toN, L: S.toL, route: 'B', x: op.x, y: op.y, h: op.a}, kind ? {kind} : {});
    const place = t => () => { pushUndo(); const tt = Object.assign({}, t, {id: M.nextId++}); M.elements.push(tt); sel = tt.id; recompute(); };
    items.push({head: `Volný konec – ${elName(op.e)}`});
    // pomocník: napojit tento konec výhybkou na jinou kolej (nejlepší místo a typ výhybky)
    const J = op.e.type !== 'turnout' ? autoJoin({x: op.x, y: op.y, a: op.a}, op.e.id) : null;
    items.push({label: 'Pomocník: napojit výhybkou na kolej', pv: J ? {turnout: J.turnout, segs: J.segs} : null, disabled: !J,
                note: J ? `${elName(J.e)}: ${turnoutLabel(J.T)}, přípojka ${f(J.segs.reduce((a, g) => a + g.L, 0), 2)} m` : 'žádné vhodné napojení v limitech',
                run: () => {
                  pushUndo();
                  const t = insertTurnoutInto(J.e, J.s, J.rev, J.turnout);
                  for (const g of J.segs) if (g.L > 1e-4) addTrack(g);
                  sel = t.id; recompute();
                  hint(`Napojeno: ${turnoutLabel(J.T)} do ${elName(J.e)}. Výhybku lze dál upravit v panelu Vybraný prvek.`);
                }});
    items.push({sep: true});
    // konec oblouku: výhybka v poloměru oblouku (větev pokračuje obloukem)
    if (op.e.type === 'track' && Math.abs(op.e.k) > 1e-9) {
      const kRel = op.i === 1 ? op.e.k : -op.e.k, Rc = 1 / Math.abs(op.e.k);
      for (const [lab, Y] of [[`Výhybka v poloměru oblouku R ${f(Rc, 1)} m na konec (odbočka pokračuje obloukem, přímá rovně)`, false],
                              [`Výhybka Y v poloměru oblouku R ${f(Rc, 1)} m na konec (jedna větev obloukem, druhá ven)`, true]]) {
        const t = Object.assign(fitTurnout(Rc, kRel, Y), {x: op.x, y: op.y, h: op.a});
        t.route = t.follow;
        items.push({label: lab, prev: t, run: place(t)});
      }
    }
    for (const [lab, t] of [['Výhybka L na konec', mk(1)], ['Výhybka P na konec', mk(-1)], ['Výhybka Y na konec', mk(0, 'Y')]])
      items.push({label: lab, prev: t, disabled: !rOk(t.R), note: rOk(t.R) ? '' : 'poloměr pod min.', run: place(t)});
    items.push({label: 'Pokračovat flexi kolejí', run: () => { setTool('flex'); flexFrom = {x: op.x, y: op.y, a: op.a}; updatePreview(); drawPlan(); }});
    if (op.e.type !== 'start') items.push({sep: true}, {label: 'Vlastnosti', run: () => { sel = op.e.id; recompute(false); }});
  } else if (cr || st) {
    const e = cr || st;
    items.push({head: elName(e)}, {label: 'Vlastnosti', run: () => { sel = e.id; recompute(false); }}, {label: 'Smazat', run: () => deleteEl(e)});
  } else if (hit) {
    const e = hit.set.e, s = hit.s;
    items.push({head: `${elName(e)}${e.type === 'track' ? ` – ${f(snapStep(s), 2)} m od začátku` : ''}`});
    if (e.type === 'track') {
      const straight = Math.abs(e.k) < 1e-9, Rc = straight ? 0 : 1 / Math.abs(e.k);
      // varianty: [popisek, strana vůči směru výhybky, proti směru koleje, režim]
      const inner = Math.sign(e.k) || 1;
      const variants = straight
        ? [['Výhybka L – odbočka ve směru koleje', 1, false, 'auto'], ['Výhybka P – odbočka ve směru koleje', -1, false, 'auto'],
           ['Výhybka L – odbočka proti směru koleje', 1, true, 'auto'], ['Výhybka P – odbočka proti směru koleje', -1, true, 'auto']]
        : [[`Výhybka v poloměru oblouku (R ${f(Rc, 1)} m) – přímá větev tečně ven, ve směru koleje`, 0, false, 'tangent'],
           [`Výhybka v poloměru oblouku (R ${f(Rc, 1)} m) – přímá větev tečně ven, proti směru koleje`, 0, true, 'tangent'],
           [`Výhybka Y v poloměru oblouku – druhá větev ven, ve směru koleje`, 0, false, 'Y'],
           [`Výhybka Y v poloměru oblouku – druhá větev ven, proti směru koleje`, 0, true, 'Y'],
           ['Oblouková výhybka – odbočka ven, ve směru koleje', -inner, false, 'curved'],
           ['Oblouková výhybka – odbočka ven, proti směru koleje', inner, true, 'curved']];
      for (const [lab, side, rev, mode] of variants) {
        const T = turnoutAt(e, s, side, rev, S.toR, mode), ok = T && rOk(T.rDiv);
        const note = !T ? 'kolej je krátká' : !ok ? `R odbočky ${f(T.rDiv, 1)} m – pod min. ${f(S.rMin, 1)} m`
          : T.fit ? `zabere ${f(occupiedLen(T.t), 2)} m kruhu` : T.kind === 'curved' ? (T.rDiv > 999 ? 'odbočka přímá' : `R odbočky ${f(T.rDiv, 1)} m`) : '';
        items.push({label: lab, prev: T && T.t, disabled: !ok, note,
                    run: () => { pushUndo(); const t = insertTurnoutInto(T.e, T.s, T.rev, T.t); sel = t.id; recompute(); }});
      }
      items.push({label: 'Odbočka s flexi kolejí odsud…', note: 'strana podle kurzoru',
                  run: () => { setTool('flex'); branchFrom = {id: e.id, s: snapStep(s)}; mouse.wx = wx; mouse.wy = wy;
                               hint('Odbočka: táhněte na stranu, kam má nová kolej vést. Klik = položit, Esc = zrušit.'); updatePreview(); drawPlan(); }});
      items.push({sep: true});
      items.push({label: 'Rozdělit zde', run: () => {
        const ss = snapStep(s); if (ss <= 1e-3 || ss >= e.L - 1e-3) { hint('Příliš blízko konce prvku.', true); return; }
        pushUndo(); sel = splitTrackAt(e, ss).id; recompute(); }});
      items.push({label: 'Výškový bod zde (zafixovat výšku TK)', run: () => {
        pushUndo();
        const ss = snapStep(s), tk = Math.round(hit.pt.h * 100) / 100;
        let key;
        if (ss <= 1e-3) key = e.id + ':0'; else if (ss >= e.L - 1e-3) key = e.id + ':1'; else { splitTrackAt(e, ss); key = e.id + ':1'; }
        const ex = (ss <= 1e-3 || ss >= e.L - 1e-3) ? pinKeyAt(key) : null;     // v místě už bod je (u sousedního prvku)
        if (ex) key = ex;
        else if (!M.pins[key]) M.pins[key] = {mode: 'abs', v: tk};
        sel = e.id; recompute();
        hint(`Výškový bod TK ${f(tk, 2)} m n.m. – výšku změníte v profilu (táhnout / dvojklik) nebo v panelu Vybraný prvek.`);
      }});
    }
    if (e.type === 'turnout') items.push({label: `Upravit ${e.kind === 'Y' ? 'poloměr větví' : 'poloměr odbočky'} / úhel…`, run: () => {
      sel = e.id; recompute(false);
      const i = $('to_R'); if (i) { i.closest('details').open = true; i.scrollIntoView({block: 'center'}); i.focus(); i.select(); }
    }});
    items.push({sep: true}, {label: 'Vlastnosti', run: () => { sel = e.id; recompute(false); }}, {label: 'Smazat prvek', run: () => deleteEl(e)});
  } else return false;
  const m = $('ctxMenu'); m.innerHTML = '';
  for (const it of items) {
    if (it.head) { const d = document.createElement('div'); d.className = 'cm-head'; d.textContent = it.head; m.appendChild(d); continue; }
    if (it.sep) { m.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.className = 'cm-item'; b.disabled = !!it.disabled;
    b.innerHTML = esc(it.label) + (it.note ? ` <span class="small">(${esc(it.note)})</span>` : '');
    b.addEventListener('mouseenter', () => { preview = it.pv || (it.prev ? {turnout: it.prev} : null); drawPlan(); });
    b.addEventListener('mouseleave', () => { preview = null; drawPlan(); });
    b.addEventListener('click', ev => { ev.stopPropagation(); closeCtx(); it.run(); });
    m.appendChild(b);
  }
  m.classList.remove('hidden');
  m.style.left = Math.max(2, Math.min(px + 2, CW - m.offsetWidth - 4)) + 'px';
  m.style.top = Math.max(2, Math.min(py + 2, CH - m.offsetHeight - 4)) + 'px';
  ctxMenu = {wx, wy};
  return true;
}
window.addEventListener('mousedown', ev => { if (ctxMenu && !$('ctxMenu').contains(ev.target) && ev.target !== cv) closeCtx(); }, true);

/* --- myš a klávesnice --- */
let drag = null;
cv.addEventListener('contextmenu', ev => ev.preventDefault());
cv.addEventListener('mousedown', ev => {
  const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, [wx, wy] = s2w(px, py);
  if (ctxMenu) { closeCtx(); if (ev.button === 0) { drag = null; return; } }
  drag = {btn: ev.button, px, py, cx: VW.cx, cy: VW.cy, moved: false, elem: null, mv: null};
  if (ev.button === 0 && (tool === 'svpt' || tool === 'select')) {
    const sp = svHit(wx, wy, 10 / VW.sc);
    if (sp) { drag.svp = sp; return; }
  }
  if (ev.button === 0 && tool === 'select' && NET) {
    const st = hitStart(wx, wy, 10 / VW.sc), hit = st ? null : hitTrack(wx, wy, 12 / VW.sc);
    const e = st || (hit && hit.set.e);
    if (e) { drag.elem = e; drag.group = ev.shiftKey; drag.wx = wx; drag.wy = wy; }
  }
});
window.addEventListener('mousemove', ev => {
  const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
  mouse.px = px; mouse.py = py; [mouse.wx, mouse.wy] = s2w(px, py); mouse.shift = ev.shiftKey; mouse.ctrl = ev.ctrlKey;
  mouse.inside = px >= 0 && py >= 0 && px <= CW && py <= CH;
  if (ctxMenu) return;                       // otevřená nabídka: náhled řídí položky nabídky
  if (drag) {
    if (Math.hypot(px - drag.px, py - drag.py) > 4) drag.moved = true;
    if (drag.moved && drag.svp) {               // přesun kontrolního bodu
      drag.svp.x = +mouse.wx.toFixed(3); drag.svp.y = +mouse.wy.toFixed(3); SV.selId = drag.svp.id;
      cv.style.cursor = 'grabbing'; hint(`Kontrolní bod ${drag.svp.n}: x ${f(drag.svp.x, 2)} y ${f(drag.svp.y, 2)} m`);
      drawPlan(); return;
    }
    if (drag.moved && drag.elem) {
      if (!drag.mv) { drag.mv = beginMove(drag.elem, drag.group, drag.wx, drag.wy); sel = drag.elem.id; cv.style.cursor = 'grabbing'; }
      applyMove(drag.mv, mouse.wx, mouse.wy);
      recompute(false); moveHint(drag.mv);
      return;
    }
    if (drag.moved) {
      VW.cx = drag.cx - (px - drag.px) / VW.sc; VW.cy = drag.cy + (py - drag.py) / VW.sc;
      drawPlan(); return;
    }
  }
  if (!mouse.inside || tab !== 'plan') return;
  updatePreview();
  hoverHit = NET ? hitTrack(mouse.wx, mouse.wy, 12 / VW.sc) : null;
  if (tool === 'select') cv.style.cursor = (hoverHit || (NET && hitStart(mouse.wx, mouse.wy, 10 / VW.sc)) || svHit(mouse.wx, mouse.wy, 10 / VW.sc)) ? 'move' : 'default';
  else if (tool === 'svpt') cv.style.cursor = svHit(mouse.wx, mouse.wy, 10 / VW.sc) ? 'move' : 'crosshair';
  else cv.style.cursor = 'crosshair';
  updateStatus();
  drawPlan();
});
window.addEventListener('mouseup', ev => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.svp) { if (d.moved) { svChanged(); cv.style.cursor = 'move'; } else svSelect(d.svp.id, true); return; }
  if (d.mv) {
    cv.style.cursor = 'move';
    if (JSON.stringify(M) !== d.mv.snap) { undoS.push(d.mv.snap); if (undoS.length > 300) undoS.shift(); redoS = []; }
    recompute(); setTool('select'); return;
  }
  if (d.moved) return;
  if (d.btn === 2) {
    if (flexFrom || startDraft || branchFrom) { flexFrom = null; startDraft = null; branchFrom = null; preview = null; drawPlan(); }
    else if (tab === 'plan' && NET) openCtx(d.px, d.py, ...s2w(d.px, d.py));
    return;
  }
  if (d.btn === 0) clickAt(...s2w(d.px, d.py), ev);
});
cv.addEventListener('wheel', ev => {
  ev.preventDefault();
  if (ctxMenu) closeCtx();
  const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, [wx, wy] = s2w(px, py);
  VW.sc = Math.min(400, Math.max(2, VW.sc * Math.pow(1.0015, -ev.deltaY)));
  VW.cx = wx - (px - CW / 2) / VW.sc; VW.cy = wy + (py - CH / 2) / VW.sc;
  [mouse.wx, mouse.wy] = s2w(px, py);
  updatePreview(); drawPlan();
}, {passive: false});
window.addEventListener('keydown', ev => {
  if (ev.target.matches('input, select, textarea')) return;
  const k = ev.key.toLowerCase();
  if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); undo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); redo(); return; }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) { mouse.ctrl = ev.ctrlKey; updatePreview(); drawPlan(); return; }
  if (k === 'tab' && tool === 'flex' && flexFrom) { ev.preventDefault(); assistIdx++; updatePreview(); drawPlan(); return; }
  if (k === 'r' && drag && drag.mv) {          // otočení během tažení
    drag.mv.rot += (ev.shiftKey ? -1 : 1) * Math.PI / 12;
    applyMove(drag.mv, mouse.wx, mouse.wy); recompute(false); moveHint(drag.mv); return;
  }
  if (k.startsWith('arrow') && sel != null && !drag) {   // posun vybraného prvku o krok (Shift = skupina)
    const e = elById(sel); if (!e || !NET) return;
    ev.preventDefault();
    const d = S.step, dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowdown' ? -d : k === 'arrowup' ? d : 0;
    pushUndo();
    for (const id of moveSetFor(e, ev.shiftKey)) { const el = elById(id); el.x += dx; el.y += dy; }
    recompute(); return;
  }
  if (k === 'escape' && ctxMenu) { closeCtx(); return; }
  if (k === 'escape') { if (flexFrom || startDraft || branchFrom) { flexFrom = null; startDraft = null; branchFrom = null; preview = null; drawPlan(); } else setTool('select'); }
  else if (k === 'v') setTool('select'); else if (k === 's') setTool('start'); else if (k === 'f') setTool('flex'); else if (k === 'k') setTool('circle');
  else if (k === 'l') setTool('toL'); else if (k === 'p') setTool('toR'); else if (k === 'y') setTool('toY'); else if (k === 'd') setTool('split'); else if (k === 'x') setTool('del');
  else if (k === 'm') setTool('svpt');
  else if (k === 'o') { $('toRev').checked = !$('toRev').checked; updatePreview(); drawPlan(); }
  else if (k === 'delete' && sel != null) { const e = elById(sel); if (e) deleteEl(e); }
  else if (k === 'shift') { mouse.shift = true; updatePreview(); drawPlan(); }
});
window.addEventListener('keyup', ev => { if (ev.key === 'Shift' || ev.key === 'Control') { mouse.shift = ev.shiftKey; mouse.ctrl = ev.ctrlKey; updatePreview(); drawPlan(); } });

function updateStatus() {
  const x = mouse.wx, y = mouse.wy;
  let t = `x ${f(x, 2)}  y ${f(y, 2)} m  ·  terén ${f(terrain(x, y), 2)} m n.m.`;
  if (SVR && SVR.active) { const c = terrain(x, y) - terrain0(x, y); if (Math.abs(c) >= .005) t += ` (DMR ${f(terrain0(x, y), 2)}, měřením ${fs(c, 2)})`; }
  if (hoverHit) {
    const p = hoverHit.pt, e = hoverHit.set.e;
    t += `  ·  ${elName(e)}${hoverHit.set.route === 'C' ? ' (odbočka)' : ''} s=${f(p.s, 2)} m  TK ${f(p.h, 2)}  pláň ${f(p.f, 2)}  ${p.d >= 0 ? 'násyp' : 'zářez'} ${f(Math.abs(p.d), 2)} m  sklon ${fs(p.g * 100, 2)} %`;
  }
  $('status').textContent = t;
}
