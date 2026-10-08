/* ===================== 4) profil, panely, 3D, export, start ===================== */
let tab = 'plan', dirty3 = true, ROUTE = null, recTimer = null, profDrag = null, profFreeze = null;

function recompute(save = true) {
  try {
    NET = solve(); evaluate(NET); runChecks(NET);
    if (SVR && SVR.active && !(drag && (drag.mv || drag.svp))) svCompare();
  } catch (err) { showErr('Výpočet: ' + err.message); console.error(err); }
  ROUTE = buildRoute();
  updatePreview();
  renderProps(); renderSummary(); renderEarth(); renderCost(); renderWarnings(); renderPins(); svRenderSum();
  drawPlan(); drawProfile();
  dirty3 = true; if (tab === '3d') build3D();
  if (save) try { localStorage.setItem(LS_KEY, JSON.stringify({S, M})); } catch (e) { /* plný localStorage */ }
}
function settingsChanged() {
  if (S.strictR && S.rFlex < S.rMin) { S.rFlex = S.rMin; $('rFlex').value = S.rFlex; }
  syncCircle();
  if (SV.pts.length) svApply();
  clearTimeout(recTimer); recTimer = setTimeout(() => recompute(), 60);
}

/* --- panel vybraného prvku --- */
function kv(rows) { return '<table class="kv">' + rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') + '</table>'; }
/* --- výškové body: jedno místo na trati může mít klíč u více prvků (konec přímé = začátek oblouku = vstupní bod) --- */
function pinKeysAt(key) {                  // všechny výškové body ve stejném uzlu jako konec key
  const ni = NET ? NET.portNode.get(key) : undefined;
  if (ni === undefined) return M.pins[key] ? [key] : [];
  return Object.keys(M.pins).filter(k => NET.portNode.get(k) === ni);
}
const pinKeyAt = key => { const ks = pinKeysAt(key); return ks.length ? ks[ks.length - 1] : null; };   // platný = poslední
function delPinsAt(key) { const ks = pinKeysAt(key); for (const k of ks) delete M.pins[k]; return ks.length; }
function pinRow(e, i) {
  const key = e.id + ':' + i, pk = pinKeyAt(key), pin = pk ? M.pins[pk] : null, ni = NET.portNode.get(key);
  const hh = ni !== undefined ? NET.h[ni] : null, tt = ni !== undefined ? NET.nodes[ni].t : null;
  const mode = pin ? pin.mode : 'auto';
  const val = pin ? pin.v : (mode === 'abs' ? hh : 0);
  return `<div class="pin"><span>${portLabel(e, i)}: TK <b>${f(hh, 2)}</b> <span class="small">(terén ${f(tt, 2)})</span></span>
    <select data-pin="${key}"><option value="auto"${mode === 'auto' ? ' selected' : ''}>auto</option>
    <option value="ter"${mode === 'ter' ? ' selected' : ''}>pláň nad terénem</option>
    <option value="abs"${mode === 'abs' ? ' selected' : ''}>TK pevně [m n.m.]</option></select>
    <input type="number" step="0.01" data-pinv="${key}" value="${pin ? (+val).toFixed(3) : ''}" ${pin ? '' : 'disabled'}></div>`;
}
function renderProps() {
  const box = $('props'), e = sel != null ? elById(sel) : null;
  if (!e || !NET) { box.innerHTML = '<span class="small">Nic není vybráno. Nástrojem Výběr klikněte na kolej nebo vstupní bod.</span>'; return; }
  const es = NET.elStats.get(e.id) || {};
  let h = `<b>${elName(e)}</b>`;
  if (e.type === 'start') {
    const az = n2pi(Math.PI / 2 - e.h);
    h += kv([['Poloha (lokálně)', `${f(e.x, 2)} / ${f(e.y, 2)} m`], ['S-JTSK (EPSG:5514)', `${f(ORIGIN[0] + e.x, 2)} / ${f(ORIGIN[1] + e.y, 2)}`],
             ['Směr (od severu mřížky)', `${f(deg(az), 1)}°`], ['Terén', `${f(terrain(e.x, e.y), 2)} m n.m.`]]);
    h += `<div class="edit"><label>x [m]</label><input id="ed_x" type="number" step="${S.step}" value="${e.x.toFixed(3)}"></div>
          <div class="edit"><label>y [m]</label><input id="ed_y" type="number" step="${S.step}" value="${e.y.toFixed(3)}"></div>
          <div class="edit"><label>směr [° od severu, po směru hod.]</label><input id="ed_az" type="number" step="1" value="${deg(az).toFixed(2)}"></div>
          <button id="ed_apply">Použít (posune celý připojený návrh)</button>`;
    if (NET.startAt.has(e.id)) h += pinRow(e, 0);
    else h += '<div class="small">Výšku lze zafixovat, až bude na bod napojena kolej.</div>';
  } else if (e.type === 'track') {
    const arc = Math.abs(e.k) > 1e-9, R = arc ? 1 / Math.abs(e.k) : null;
    const rows = [['Délka', `${f(e.L, 3)} m`]];
    if (arc) {
      const ci = cantInfo(R);
      rows.push(['Poloměr', `<span class="${R < S.rMin ? 'bad' : R < S.rRec ? 'mid' : 'ok'}">${f(R, 2)} m ${e.k > 0 ? 'vlevo' : 'vpravo'}</span>`],
        ['Úhel', `${f(deg(Math.abs(e.k) * e.L), 1)}°`],
        ['Převýšení doporučené', `${f(ci.c, 1)} mm${ci.ceq > ci.c + .05 ? ` (rovnováha ${f(ci.ceq, 1)} mm)` : ''}`],
        ['Max. rychlost v oblouku', `${f(ci.vmax, 1)} km/h`], ['Vzestupnice (1:200) min.', `${f(ci.ramp, 2)} m`]);
    }
    rows.push(['Max. sklon / ekvivalentní', `${f(es.gMax * 100, 2)} / ${f(es.gEq * 100, 2)} %`],
      ['Max. násyp / zářez', `${f(es.fill, 2)} / ${f(es.cut, 2)} m`], ['Kubatura násyp / výkop (podle osy)', `${f(es.vFill, 2)} / ${f(es.vCut, 2)} m³`]);
    h += kv(rows);
    h += `<div class="edit"><label>délka [m]</label><input id="ed_L" type="number" step="${S.step}" value="${e.L.toFixed(3)}"></div>`;
    if (arc) h += `<div class="edit"><label>poloměr [m]</label><input id="ed_R" type="number" step="0.5" value="${R.toFixed(3)}"></div>
                   <div class="edit"><label>směr oblouku</label><select id="ed_dir"><option value="1"${e.k > 0 ? ' selected' : ''}>vlevo</option><option value="-1"${e.k < 0 ? ' selected' : ''}>vpravo</option></select></div>`;
    if (isFullCircle(e)) h += `<div class="small">Celý kruh – změna poloměru zachová střed. Kratší délka z něj udělá oblouk s volnými konci.</div>`;
    h += `<button id="ed_apply">Použít${isFullCircle(e) ? '' : ' (navazující kolej se posune)'}</button>
          <div class="edit" style="margin-top:4px"><label>max. sklon prvku [%] (prázdné = globální)</label><input id="ed_g" type="number" step="0.1" value="${e.gMax != null ? e.gMax : ''}"></div>
          <button id="ed_level">Vodorovně (stanice)</button> <button id="ed_gclr">Globální limit</button>`;
    h += pinRow(e, 0) + pinRow(e, 1);
  } else if (e.type === 'cross') {
    const ci = NET.crossInfo.get(e.id) || {};
    h += kv([['Úhel křížení', ci.ang != null ? `<span class="${ci.ok ? 'ok' : 'bad'}">${f(ci.ang, 1)}°</span> (min. ${f(S.xAng, 0)}°)` : '<span class="bad">chybí koleje</span>'],
             ['Koleje v bodě', (ci.ids || []).map(id => '#' + id).join(', ') || '–'], ['Terén', `${f(terrain(e.x, e.y), 2)} m n.m.`]]);
    h += '<div class="small">Obě koleje mají v bodě křížení stejnou výšku TK. Výšku lze zafixovat:</div>' + pinRow(e, 0);
  } else if (e.type === 'turnout') {
    const g = turnoutGeom(e), Y = e.kind === 'Y', rD = turnoutDivR(e);
    const off = Math.abs((g.C.x - g.B.x) * -Math.sin(g.B.th) + (g.C.y - g.B.y) * Math.cos(g.B.th));   // odsazení konce odbočky od hlavní větve
    const rCls = r => r < S.rMin - 1e-6 ? 'bad' : r < S.rRec - 1e-6 ? 'mid' : 'ok';
    h += kv([['Typ', Y ? 'Y – symetrická' : `${g.curved ? 'oblouková ' : ''}${e.side > 0 ? 'levá' : 'pravá'}`],
             ...(e.follow ? [['Vložena do oblouku', `${Y ? (e.follow === 'B' ? 'levá' : 'pravá') + ' větev' : 'odbočka'} = oblouk koleje, ${Y ? 'druhá větev ven' : 'přímá větev tečně ven'}`]] : []),
             ...(g.curved ? [['Hlavní větev (oblouk koleje)', `R ${f(1 / Math.abs(g.km), 2)} m`],
                             ['Výsledný poloměr odbočky', `<span class="${rCls(rD)}">${rD > 999 ? 'přímá' : f(rD, 2) + ' m'}${g.kd * g.km < 0 ? ' (opačně)' : ''}</span>`]] : []),
             [Y ? 'Poloměr větví' : g.curved ? 'Poloměr výhybky (vůči oblouku)' : 'Poloměr odbočky', `<span class="${g.curved ? '' : rCls(e.R)}">${f(e.R, 2)} m</span>`],
             ['Úhel', `1:${f(e.n, 1)} (${f(deg(g.al), 2)}°${Y ? ', každá větev polovinu' : ''})`],
             [Y ? 'Délka vlevo / vpravo' : 'Délka přímo / odbočka', `${f(g.Lmain, 2)} / ${f(g.Ldiv, 2)} m`],
             [Y ? 'Odsazení konců od osy' : 'Odsazení konce odbočky', `${f(off, 3)} m`], ['Max. sklon', `${f(es.gMax * 100, 2)} %`],
             ['Max. násyp / zářez', `${f(es.fill, 2)} / ${f(es.cut, 2)} m`]]);
    h += `<div class="small" style="margin-top:4px"><b>Úprava výhybky</b> (napojené koleje se posunou s ní)</div>
      <div class="edit"><label>${Y ? 'poloměr větví' : 'poloměr odbočky'} [m]</label><input id="to_R" type="number" step="0.5" min="1" value="${(+e.R).toFixed(3)}"></div>
      <div class="edit"><label>úhel odbočení 1 :</label><input id="to_n" type="number" step="0.5" min="1" value="${(+e.n).toFixed(2)}"></div>
      <div class="edit"><label>délka výhybky [m]</label><input id="to_L" type="number" step="0.05" min="0.2" value="${(+e.L).toFixed(3)}"></div>
      <button id="to_apply">Použít</button> <button id="to_def" title="Hodnoty ze sekce Výhybky (pro nově vkládané)">Výchozí hodnoty</button>`;
    h += `<div class="edit" style="margin-top:4px"><label>větev pro podélný profil</label><select id="ed_route"><option value="B"${e.route !== 'C' ? ' selected' : ''}>${Y ? 'vlevo (B)' : 'přímo'}</option><option value="C"${e.route === 'C' ? ' selected' : ''}>${Y ? 'vpravo (C)' : 'do odbočky'}</option></select></div>`;
    h += pinRow(e, 0) + pinRow(e, 1) + '<div class="small">B a C mají vždy stejnou výšku.</div>';
  }
  if (e.type === 'track' || e.type === 'turnout') {
    h += `<div class="small" style="margin-top:6px"><b>Přesun / otočení</b> (také tažením myší, Shift = skupina)</div>
      <div class="edit"><label>posun Δx – východ [m]</label><input id="mv_dx" type="number" step="${S.step}" value="0"></div>
      <div class="edit"><label>posun Δy – sever [m]</label><input id="mv_dy" type="number" step="${S.step}" value="0"></div>
      <div class="edit"><label>otočit o [°] (+ vlevo) kolem začátku</label><input id="mv_rot" type="number" step="1" value="0"></div>
      <div class="edit"><label>celá připojená skupina</label><input id="mv_grp" type="checkbox" style="width:auto;justify-self:start"></div>
      <button id="mv_apply">Přesunout</button>`;
  }
  h += `<div style="margin-top:4px"><button id="ed_del">Smazat prvek</button></div>`;
  box.innerHTML = h;
  const mvb = $('mv_apply');
  if (mvb) mvb.addEventListener('click', () => {
    const dx = parseFloat($('mv_dx').value) || 0, dy = parseFloat($('mv_dy').value) || 0, rot = (parseFloat($('mv_rot').value) || 0) * Math.PI / 180;
    if (!dx && !dy && !rot) return;
    pushUndo();
    const cx = e.x, cy = e.y;
    for (const id of moveSetFor(e, $('mv_grp').checked)) rigid(elById(id), cx, cy, rot, dx, dy);
    recompute();
  });
  // události
  box.querySelectorAll('select[data-pin]').forEach(s => s.addEventListener('change', () => {
    const key = s.dataset.pin; pushUndo();
    const ni = NET.portNode.get(key), pk = pinKeyAt(key);
    if (s.value === 'auto') delPinsAt(key);
    else {
      const v = s.value === 'abs' ? +(NET.h[ni] || 0).toFixed(3) : +(NET.h[ni] - S.hConstr - NET.nodes[ni].t).toFixed(3);
      for (const k of pinKeysAt(key)) if (k !== pk) delete M.pins[k];
      M.pins[pk || key] = {mode: s.value, v};
    }
    recompute();
  }));
  box.querySelectorAll('input[data-pinv]').forEach(inp => inp.addEventListener('change', () => {
    const pk = pinKeyAt(inp.dataset.pinv), v = parseFloat(inp.value);
    if (!pk || !isFinite(v)) return;
    pushUndo(); M.pins[pk].v = v; recompute();
  }));
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'click', fn); };
  on('ed_del', () => deleteEl(e));
  on('ed_route', () => { pushUndo(); e.route = $('ed_route').value; recompute(); });
  on('to_apply', () => editTurnout(e, parseFloat($('to_R').value), parseFloat($('to_n').value), parseFloat($('to_L').value)));
  on('to_def', () => editTurnout(e, e.kind === 'Y' ? S.toRY : S.toR, S.toN, S.toL));
  for (const id of ['to_R', 'to_n', 'to_L']) { const el = $(id); if (el) el.addEventListener('keydown', ev => { if (ev.key === 'Enter') $('to_apply').click(); }); }
  on('ed_level', () => { pushUndo(); e.gMax = 0; recompute(); });
  on('ed_gclr', () => { pushUndo(); e.gMax = null; recompute(); });
  const gIn = $('ed_g'); if (gIn) gIn.addEventListener('change', () => { pushUndo(); const v = parseFloat(gIn.value); e.gMax = isFinite(v) ? Math.max(0, v) : null; recompute(); });
  on('ed_apply', () => {
    if (e.type === 'start') {
      const x = parseFloat($('ed_x').value), y = parseFloat($('ed_y').value), az = parseFloat($('ed_az').value);
      if (![x, y, az].every(isFinite)) return;
      pushUndo();
      const comp = startComponent(e), h2 = Math.PI / 2 - az * Math.PI / 180, dth = h2 - e.h, ox = e.x, oy = e.y;
      for (const id of comp) rigid(elById(id), ox, oy, dth, x - ox, y - oy);
      recompute();
    } else if (e.type === 'track') {
      const L = parseFloat($('ed_L').value);
      let k = e.k;
      if ($('ed_R')) {
        const R = parseFloat($('ed_R').value); if (!(R > .5)) return;
        if (S.strictR && R < S.rMin - 1e-6) { hint(`Poloměr ${f(R, 2)} m je menší než min. ${f(S.rMin, 1)} m – zakázáno (lze vypnout v Limitech).`, true); $('ed_R').value = (1 / Math.abs(e.k)).toFixed(3); return; }
        k = (+$('ed_dir').value) / R;
      }
      if (!(L > .01)) return;
      if (isFullCircle(e) && Math.abs(Math.abs(k) - Math.abs(e.k)) > 1e-12) {   // celý kruh: nový poloměr, stejný střed
        pushUndo();
        const cxc = e.x - Math.sin(e.h) / e.k, cyc = e.y + Math.cos(e.h) / e.k;
        e.k = k; e.x = cxc + Math.sin(e.h) / k; e.y = cyc - Math.cos(e.h) / k; e.L = TAU / Math.abs(k);
        recompute(); return;
      }
      editTrack(e, L, k);
    }
  });
}
function editTurnout(e, R, n, L) {        // změna poloměru / úhlu / délky výhybky, napojené koleje se posunou s ní
  if (!(R > .5) || !(n >= 1) || !(L > .1)) { hint('Neplatná hodnota (poloměr > 0,5 m, úhel 1:n s n ≥ 1, délka > 0,1 m).', true); return; }
  if (S.strictR) {
    const rD = turnoutDivR(Object.assign({}, e, {R, n, L}));
    if (rD < S.rMin - 1e-6) { hint(`Poloměr odbočky by byl ${f(rD, 2)} m, menší než min. ${f(S.rMin, 1)} m – zakázáno (lze vypnout v Limitech).`, true); renderProps(); return; }
  }
  pushUndo();
  const oldP = ports(e), moves = [];
  let looped = false;
  for (const idx of [1, 2]) {
    const nb = NET.conn.get(e.id + ':' + idx);
    if (!nb) continue;
    const comp = componentFrom(nb.e, e.id);
    const others = [0, 1, 2].filter(i => i !== idx).map(i => NET.conn.get(e.id + ':' + i)).filter(Boolean);
    if (others.some(o => comp.has(o.e.id))) { looped = true; continue; }     // smyčka zpět k výhybce – nelze posunout
    moves.push({idx, comp});
  }
  Object.assign(e, {R, n, L});
  const newP = ports(e);
  for (const mv of moves) {
    const o = oldP[mv.idx], nw = newP[mv.idx], dth = nw.a - o.a;
    if (Math.hypot(nw.x - o.x, nw.y - o.y) < 1e-9 && Math.abs(dth) < 1e-12) continue;
    for (const id of mv.comp) rigid(elById(id), o.x, o.y, dth, nw.x - o.x, nw.y - o.y);
    for (const s of M.elements) if (s.type === 'start' && !mv.comp.has(s.id)) {
      const hh = NET.startAt.get(s.id); if (hh && mv.comp.has(hh.e.id)) rigid(s, o.x, o.y, dth, nw.x - o.x, nw.y - o.y);
    }
  }
  recompute();
  if (looped) hint('Koleje za výhybkou tvoří smyčku zpět k ní – neposunuly se a spoj se rozpojil. Napojte ho znovu flexi kolejí na volný konec.', true);
}
function editTrack(e, L, k) {
  pushUndo();
  const old = segAt(e, e.L), nb = NET.conn.get(e.id + ':1'), nb0 = NET.conn.get(e.id + ':0');
  let comp = null;
  if (nb) { comp = componentFrom(nb.e, e.id); if (nb0 && comp.has(nb0.e.id)) { comp = null; hint('Prvek je ve smyčce – navazující kolej se neposune a spoj se rozpojí.', true); } }
  e.L = L; e.k = k;
  const nw = segAt(e, e.L);
  if (comp) {
    for (const id of comp) rigid(elById(id), old.x, old.y, nw.th - old.th, nw.x - old.x, nw.y - old.y);
    for (const s of M.elements) if (s.type === 'start' && !comp.has(s.id)) {
      const hit = NET.startAt.get(s.id); if (hit && comp.has(hit.e.id)) rigid(s, old.x, old.y, nw.th - old.th, nw.x - old.x, nw.y - old.y);
    }
  }
  recompute();
}

function renderSummary() {
  if (!NET || !NET.sum) { $('summary').innerHTML = ''; return; }
  const s = NET.sum;
  $('summary').innerHTML = kv([
    ['Délka koleje', `${f(s.Ltr, 2)} m`], ['Výhybek', s.nTo], ['Nejmenší poloměr', isFinite(s.rmin) ? `${f(s.rmin, 2)} m` : '–'],
    ['Max. sklon (ekvivalentní)', `${f(s.maxG * 100, 2)} %`], ['Max. násyp / zářez', `${f(s.maxFill, 2)} / ${f(s.maxCut, 2)} m`],
    ['Výkop / násyp', `${f(s.gCut, 2)} / ${f(s.gFill, 2)} m³`], ['Volné konce', s.nOpen],
  ]) + (ROUTE ? `<div class="small">Profil: trasa ${f(ROUTE.L, 2)} m${ROUTE.loop ? ' (uzavřený okruh)' : ''}</div>` : '');
}

/* --- zemní práce: bilance a vyrovnání posunem nivelety --- */
function renderEarth() {
  const box = $('earth');
  if (!NET || !NET.sum) { box.innerHTML = ''; return; }
  const s = NET.sum, b = earthBalance(s.gCut, s.gFill), sh = +M.hShift || 0, use = s.gCut * S.kUse;
  const big = Math.max(use, s.gFill), rel = big > 1e-9 ? Math.abs(use - s.gFill) / big : 0;
  const what = b.surplus > 0 ? 'přebytek zeminy' : 'nedostatek zeminy';
  const st = big < .05 ? '<span class="badge ok">téměř bez zemních prací</span>'
    : rel <= .1 ? '<span class="badge ok">vyrovnaná (neutrální)</span>'
    : `<span class="badge ${rel <= .3 ? 'mid' : 'bad'}">${what}</span>`;
  box.innerHTML = kv([
    ['Výkop (zářezy)', `${f(s.gCut, 2)} m³ <span class="small">· ${f(s.aCut, 1)} m²</span>`],
    ['Násyp (hutněný)', `${f(s.gFill, 2)} m³ <span class="small">· ${f(s.aFill, 1)} m²</span>`],
    [`Výkop použitelný do násypu (× ${f(S.kUse, 2)})`, `${f(use, 2)} m³`],
    ['Bilance', b.surplus >= 0 ? `<b>přebývá ${f(b.surplus, 2)} m³</b>` : `<b>chybí ${f(-b.surplus * S.kUse, 2)} m³</b>`],
    [b.surplus >= 0 ? `Odvoz / rozprostření (nakypřeno × ${f(S.kSwell, 2)})` : `Dovoz zeminy (nakypřeno × ${f(S.kSwell, 2)})`, `${f(b.surplus >= 0 ? b.haul : b.import, 2)} m³`],
    ['Stav', st],
    ['Posun nivelety', `${sh ? fs(sh, 3) + ' m' : '0'}`],
  ]) + `<div class="small">Počítáno z terénu po stavbě (pláň + svahy, vč. příčného sklonu terénu a překryvů kolejí).
     Jen podle osy koleje by vyšlo výkop ${f(s.vCut, 2)} / násyp ${f(s.vFill, 2)} m³.</div>`;
}
function earthAt(shift) {                  // kubatury pro zkusmý posun nivelety (model se nemění)
  const old = M.hShift;
  M.hShift = shift;
  try { const N = solve(); evaluate(N); return earthGrid(N); } finally { M.hShift = old; }
}
function balanceEarth() {
  if (!NET || !NET.sets || !NET.sets.length) { hint('Není co vyrovnávat – nakreslete trať.', true); return; }
  const g = d => { const e = earthAt(d); return S.kUse * e.vCut - e.vFill; };   // klesá s posunem nahoru
  const s0 = +M.hShift || 0;
  let lo = s0 - .5, hi = s0 + .5, glo = g(lo), ghi = g(hi), k = 0;
  while (glo < 0 && lo > -3 && k++ < 10) { hi = lo; ghi = glo; lo -= .75; glo = g(lo); }
  while (ghi > 0 && hi < 3 && k++ < 20) { lo = hi; glo = ghi; hi += .75; ghi = g(hi); }
  if (glo < 0 || ghi > 0) {
    hint('Bilanci nejde vyrovnat posunem nivelety do ±3 m – výšky nejspíš drží výškové body „TK pevně“. Uvolněte je, nebo změňte vedení trati.', true);
    return;
  }
  for (let i = 0; i < 18 && hi - lo > 5e-4; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
  const d = Math.round((lo + hi) / 2 * 1000) / 1000;
  pushUndo(); M.hShift = d; recompute();
  const s = NET.sum;
  hint(`Niveleta posunuta o ${fs(d, 3)} m: výkop ${f(s.gCut, 2)} m³ × ${f(S.kUse, 2)} ≈ násyp ${f(s.gFill, 2)} m³. Zpět: Ctrl+Z nebo „Zrušit posun“.`);
}
function renderWarnings() {
  const W = NET ? NET.warn : [];
  $('nwarn').textContent = W.filter(w => w.lvl !== 'inf').length;
  const order = {err: 0, wrn: 1, inf: 2};
  const box = $('warnings');
  box.innerHTML = W.length ? '' : '<span class="small ok">Bez problémů.</span>';
  W.slice().sort((a, b) => order[a.lvl] - order[b.lvl]).forEach(w => {
    const d = document.createElement('div'); d.className = 'warn ' + w.lvl; d.textContent = w.msg;
    d.addEventListener('click', () => {
      if (w.x != null) { VW.cx = w.x; VW.cy = w.y; VW.sc = Math.max(VW.sc, 25); profCursor = {x: w.x, y: w.y}; }
      if (w.id != null) { sel = w.id; recompute(false); } else drawPlan();
      if (tab !== 'plan') setTab('plan');
    });
    box.appendChild(d);
  });
}

/* --- podélný profil --- */
const pc = $('profile'), pctx = pc.getContext('2d');
let PW = 0, PH = 0, PG = null, profHover = null;
function resizeProfile() { const r = pc.getBoundingClientRect(); PW = r.width; PH = r.height; pc.width = Math.max(1, Math.round(PW * DPR())); pc.height = Math.max(1, Math.round(PH * DPR())); drawProfile(); }
/* reference pro relativní profil: vstupní bod ležící na trase, jinak začátek trasy */
function profRef() {
  if (!ROUTE || !NET || !ROUTE.pts.length) return null;
  let best = null, bd = Infinity;
  for (const s of M.elements) {
    if (s.type !== 'start') continue;
    for (const p of ROUTE.pts) { const d = Math.hypot(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; best = {s, p}; } }
  }
  if (best && bd < .05) {
    const ni = NET.portNode.get(best.s.id + ':0');
    return {st: best.p.st, tk: ni !== undefined ? NET.h[ni] : best.p.h, t: terrain(best.s.x, best.s.y), name: elName(best.s), isStart: true};
  }
  const p0 = ROUTE.pts[0];
  return {st: 0, tk: p0.h, t: p0.t, name: 'začátek trasy (vstupní bod na trase není)', isStart: false};
}
function profMode() {
  const mode = $('profMode').value, ref = profRef();
  if (mode === 'abs' || !ref) return {mode: 'abs', dz: 0, ds: 0, ref};
  return {mode, dz: mode === 'relTK' ? ref.tk : ref.t, ds: ref.st, ref};
}
function drawProfile() {
  if (!PW) return;
  const c = pctx; c.setTransform(DPR(), 0, 0, DPR(), 0, 0);
  c.fillStyle = '#fff'; c.fillRect(0, 0, PW, PH);
  c.font = '11px Segoe UI, sans-serif'; c.textBaseline = 'middle';
  const R = ROUTE;
  if (!R || R.pts.length < 2) { c.fillStyle = '#57606a'; c.fillText('Podélný profil: nakreslete kolej (Vstupní bod → Flexi kolej) a vyberte ji.', 12, PH / 2); PG = null; return; }
  const PM = profMode(), rel = PM.mode !== 'abs', DS = PM.ds;
  const DZ = profFreeze ? profFreeze.DZ : PM.dz;
  const P = R.pts, L = Math.max(R.L, .5), sMin = -DS, sMax = L - DS;
  let zmin = Infinity, zmax = -Infinity;
  for (const p of P) { zmin = Math.min(zmin, p.t, p.f); zmax = Math.max(zmax, p.t, p.h); }
  zmin = zmin - DZ - .15; zmax = zmax - DZ + .15;
  if (rel) { zmin = Math.min(zmin, -.05); zmax = Math.max(zmax, .05); }
  if (profFreeze) { zmin = profFreeze.zmin; zmax = profFreeze.zmax; }     // během tažení stálé měřítko
  const ml = 58, mr = 12, mt = 30, gH = 40, eH = 52, mb = 20, hTop = mt, g0 = PH - mb - gH, e0 = g0 - 8 - eH, hBot = e0 - 12;
  const X = s => ml + ((s - sMin) / (sMax - sMin)) * (PW - ml - mr), Y = z => hBot - (z - zmin) / (zmax - zmin) * (hBot - hTop);
  const xs = p => X(p.st - DS), y = v => Y(v - DZ);
  PG = {ml, mr, sMin, sMax, DS, DZ, X, Y, hTop, hBot, zmin, zmax, rel, handles: []};
  // výškové body (zafixované výšky) ležící na trase – jeden úchyt na místo (platný = poslední klíč v uzlu)
  const effPin = new Map();
  for (const key of Object.keys(M.pins)) { const ni = NET.portNode.get(key); if (ni !== undefined) effPin.set(ni, key); }
  for (const [ni, key] of effPin) {
    const n = NET.nodes[ni];
    P.forEach((p, i) => {
      if (Math.abs(p.x - n.x) < .02 && Math.abs(p.y - n.y) < .02 && !PG.handles.some(hd => hd.key === key && Math.abs(hd.st - p.st) < .01))
        PG.handles.push({key, st: p.st, h: NET.h[ni], i});
    });
  }
  // osy
  c.strokeStyle = '#eaeef2'; c.lineWidth = 1; c.fillStyle = '#57606a';
  const zs = [.1, .2, .25, .5, 1, 2].find(v => (zmax - zmin) / v <= 8) || 2;
  for (let z = Math.ceil(zmin / zs) * zs; z <= zmax + 1e-9; z += zs) {
    const yy = Y(z); c.beginPath(); c.moveTo(ml, yy); c.lineTo(PW - mr, yy); c.stroke();
    c.fillText(rel ? fs(Math.abs(z) < 1e-9 ? 0 : z, 2) : f(z, zs < 1 ? 2 : 0), 4, yy);
  }
  const ss = [1, 2, 5, 10, 20, 50].find(v => L / v <= 14) || 50;
  c.textAlign = 'center';
  for (let s = Math.ceil(sMin / ss) * ss; s <= sMax + 1e-9; s += ss) {
    const xx = X(s); c.beginPath(); c.moveTo(xx, hTop); c.lineTo(xx, PH - mb); c.stroke();
    c.fillText(f(Math.abs(s) < 1e-9 ? 0 : s, 0), xx, PH - 8);
  }
  c.textAlign = 'left';
  if (rel) { c.strokeStyle = '#495057'; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(ml, Y(0)); c.lineTo(PW - mr, Y(0)); c.stroke(); c.setLineDash([]); }
  // násyp / zářez
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dm = (a.d + b.d) / 2;
    if (Math.abs(dm) < .003) continue;
    c.fillStyle = dm > 0 ? 'rgba(232,131,58,.55)' : 'rgba(58,123,232,.45)';
    c.beginPath(); c.moveTo(xs(a), y(a.f)); c.lineTo(xs(b), y(b.f)); c.lineTo(xs(b), y(b.t)); c.lineTo(xs(a), y(a.t)); c.closePath(); c.fill();
  }
  const line = (key, col, w, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); P.forEach((p, i) => i ? c.lineTo(xs(p), y(p[key])) : c.moveTo(xs(p), y(p[key]))); c.stroke(); c.setLineDash([]); };
  line('t', '#8b5a2b', 2); line('f', '#555', 1, [4, 3]); line('h', '#111', 1.6);
  svProfile(c, P, xs, y);
  // hranice prvků
  c.fillStyle = '#1f2328';
  for (const b of R.bounds) {
    const xx = X(b.st - DS); c.strokeStyle = b.e.type === 'turnout' ? '#0969da' : '#adb5bd'; c.lineWidth = 1; c.beginPath(); c.moveTo(xx, hTop); c.lineTo(xx, hBot); c.stroke();
    const lab = b.e.type === 'turnout' ? `V${b.e.id}` : (Math.abs(b.e.k) > 1e-9 ? `R${f(1 / Math.abs(b.e.k), 1)}` : `#${b.e.id}`);
    if ((X(b.st + b.L - DS) - xx) > 30) c.fillText(lab, xx + 3, hTop - 7);
  }
  // vstupní bod
  if (PM.ref && PM.ref.isStart) {
    const xx = X(PM.ref.st - DS);
    c.strokeStyle = '#1c7ed6'; c.lineWidth = 2; c.setLineDash([5, 3]); c.beginPath(); c.moveTo(xx, hTop); c.lineTo(xx, PH - mb); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#1c7ed6'; c.beginPath(); c.arc(xx, y(PM.ref.tk), 4, 0, TAU); c.fill();
    const tl = `vstup: TK ${f(PM.ref.tk, 2)}, terén ${f(PM.ref.t, 2)} m n.m.`, tw = c.measureText(tl).width;
    const lx = xx + tw + 10 > PW - mr ? xx - tw - 6 : xx + 5;
    c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(lx - 2, hBot - 10, tw + 4, 14); c.fillStyle = '#1c7ed6'; c.fillText(tl, lx, hBot - 3);
  }
  // diagram zemních prací: násyp nahoru, zářez dolů (pláň − terén)
  {
    let dMax = Math.max(.1, S.warnEarth);
    for (const p of P) dMax = Math.max(dMax, Math.abs(p.d));
    const EY = d => e0 + eH / 2 - d / dMax * (eH / 2 - 2);
    c.fillStyle = '#fafbfc'; c.fillRect(ml, e0, PW - ml - mr, eH); c.strokeStyle = '#d0d7de'; c.strokeRect(ml, e0, PW - ml - mr, eH);
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], dm = (a.d + b.d) / 2;
      if (Math.abs(dm) < .003) continue;
      c.fillStyle = dm > 0 ? 'rgba(232,131,58,.85)' : 'rgba(58,123,232,.8)';
      c.beginPath(); c.moveTo(xs(a), EY(0)); c.lineTo(xs(a), EY(a.d)); c.lineTo(xs(b), EY(b.d)); c.lineTo(xs(b), EY(0)); c.closePath(); c.fill();
    }
    c.strokeStyle = '#495057'; c.lineWidth = 1; c.beginPath(); c.moveTo(ml, EY(0)); c.lineTo(PW - mr, EY(0)); c.stroke();
    for (const sg of [1, -1]) { c.strokeStyle = '#f08c00'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(ml, EY(sg * S.warnEarth)); c.lineTo(PW - mr, EY(sg * S.warnEarth)); c.stroke(); c.setLineDash([]); }
    let mf = 0, mc = 0; for (const p of P) { mf = Math.max(mf, p.d); mc = Math.max(mc, -p.d); }
    c.fillStyle = '#c05a14'; c.fillText(`násyp ↑ ${f(mf, 2)} m`, 4, e0 + 9);
    c.fillStyle = '#1c5fc4'; c.fillText(`zářez ↓ ${f(mc, 2)} m`, 4, e0 + eH - 8);
  }
  // křížení X na trase
  for (const e of M.elements) if (e.type === 'cross') {
    const p = P.find(q => Math.hypot(q.x - e.x, q.y - e.y) < .05);
    if (!p) continue;
    const xx = xs(p);
    c.strokeStyle = '#5f3dc4'; c.lineWidth = 1.5; c.setLineDash([3, 2]); c.beginPath(); c.moveTo(xx, hTop); c.lineTo(xx, e0 + eH); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#5f3dc4'; c.fillText(`X${e.id}`, xx + 3, hTop + 6);
  }
  // pásmo sklonu
  const gMx = Math.max(S.gMax, 1) * 1.25 / 100, GY = g => g0 + gH / 2 - Math.max(-gMx, Math.min(gMx, g)) / gMx * gH / 2;
  // výškové body – fialové čtverečky
  for (const hd of PG.handles) {
    const hx = X(hd.st - DS), hy = y(hd.h), act = profDrag && profDrag.key === hd.key;
    c.strokeStyle = 'rgba(156,54,181,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx, hTop); c.lineTo(hx, hBot); c.stroke();
    c.fillStyle = '#9c36b5'; c.fillRect(hx - 5, hy - 5, 10, 10); c.strokeStyle = act ? '#000' : '#fff'; c.lineWidth = act ? 2 : 1.5; c.strokeRect(hx - 5, hy - 5, 10, 10);
    const lab = rel ? `TK ${fs(hd.h - DZ, 2)} m` : `TK ${f(hd.h, 2)}`, lw = c.measureText(lab).width;
    c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(hx + 7, hy - 17, lw + 4, 13); c.fillStyle = '#9c36b5'; c.fillText(lab, hx + 9, hy - 10);
  }
  c.strokeStyle = '#d0d7de'; c.strokeRect(ml, g0, PW - ml - mr, gH);
  c.fillStyle = '#57606a'; c.fillText('sklon %', 4, g0 + gH / 2);
  for (const [g, col] of [[S.gRec, '#f08c00'], [S.gMax, '#e03131']]) for (const sg of [1, -1]) {
    c.strokeStyle = col; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(ml, GY(sg * g / 100)); c.lineTo(PW - mr, GY(sg * g / 100)); c.stroke(); c.setLineDash([]);
  }
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], ds = b.st - a.st; if (ds <= 0) continue;
    const g = (b.h - a.h) / ds, ge = Math.abs(g) + S.curveComp * S.gauge * Math.abs(a.k);
    c.strokeStyle = ge > S.gMax / 100 + 2e-4 ? '#e03131' : ge > S.gRec / 100 + 2e-4 ? '#f08c00' : '#2f9e44';
    c.lineWidth = 2; c.beginPath(); c.moveTo(xs(a), GY(g)); c.lineTo(xs(b), GY(g)); c.stroke();
  }
  c.fillStyle = '#1f2328';
  const head = rel ? `Profil relativně k ${PM.mode === 'relTK' ? 'TK' : 'terénu'} – ${PM.ref.name} = 0 m, staničení od vstupu`
                   : `Podélný profil (m n.m.)`;
  c.fillText(`${head} · ${f(L, 2)} m${R.loop ? ', okruh' : ''} · hnědá terén${SVR && SVR.active ? ' (zpřesněný, tečkovaně původní DMR, ◆ kontrolní body)' : ''}, čárkovaná pláň, černá TK · oranžová násyp, modrá zářez`, ml, 9);
  if (profHover != null) {
    const p = P[profHover], xx = xs(p);
    c.strokeStyle = '#d6336c'; c.lineWidth = 1; c.beginPath(); c.moveTo(xx, hTop); c.lineTo(xx, PH - mb); c.stroke();
    const q = P[Math.min(profHover + 1, P.length - 1)], pp = P[Math.max(profHover - 1, 0)];
    const g = (q.h - pp.h) / Math.max(1e-6, q.st - pp.st);
    const txt = rel
      ? [`od vstupu ${fs(p.st - DS, 2)} m (${elName(p.e)})`, `terén ${fs(p.t - DZ, 3)} m  (${f(p.t, 2)} m n.m.)`,
         `TK ${fs(p.h - DZ, 3)} m  (${f(p.h, 2)} m n.m.)`, `pláň ${fs(p.f - DZ, 3)} m`,
         `${p.d >= 0 ? 'násyp' : 'zářez'} ${f(Math.abs(p.d), 2)} m`, `sklon ${fs(g * 100, 2)} %`]
      : [`staničení ${f(p.st, 2)} m (${elName(p.e)})`, `terén ${f(p.t, 2)} m n.m.`, `TK ${f(p.h, 2)} · pláň ${f(p.f, 2)}`,
         `${p.d >= 0 ? 'násyp' : 'zářez'} ${f(Math.abs(p.d), 2)} m`, `sklon ${fs(g * 100, 2)} %`];
    const w = Math.max(...txt.map(t => c.measureText(t).width)) + 10, bx = xx + w + 12 > PW ? xx - w - 8 : xx + 8;
    c.fillStyle = 'rgba(255,255,255,.95)'; c.fillRect(bx, hTop + 2, w, txt.length * 14 + 6); c.strokeStyle = '#d0d7de'; c.strokeRect(bx, hTop + 2, w, txt.length * 14 + 6);
    c.fillStyle = '#1f2328'; txt.forEach((t, i) => c.fillText(t, bx + 5, hTop + 12 + i * 14));
  }
}
/* --- výškové body v profilu: dvojklik = nový, tažení = výška, dvojklik na bod = zadat, pravý klik = zrušit --- */
const profXY = ev => { const r = pc.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
function profIdxAt(x) {
  const s = PG.sMin + (x - PG.ml) / (PW - PG.ml - PG.mr) * (PG.sMax - PG.sMin) + PG.DS;
  let bi = 0, bd = Infinity;
  ROUTE.pts.forEach((p, i) => { const d = Math.abs(p.st - s); if (d < bd) { bd = d; bi = i; } });
  return bi;
}
function profHandleAt(x, y) {
  if (!PG || !PG.handles) return null;
  let best = null, bd = 9;
  for (const hd of PG.handles) { const d = Math.hypot(PG.X(hd.st - PG.DS) - x, PG.Y(hd.h - PG.DZ) - y); if (d < bd) { bd = d; best = hd; } }
  return best;
}
const profZ = y => PG.zmin + (PG.hBot - y) / (PG.hBot - PG.hTop) * (PG.zmax - PG.zmin) + PG.DZ;   // absolutní TK
function setPinTK(key, tk) {
  const pin = M.pins[key], ni = NET.portNode.get(key);
  if (!pin || ni === undefined) return;
  for (const k of pinKeysAt(key)) if (k !== key) delete M.pins[k];      // duplicitní body v tomtéž místě pryč
  tk = Math.round(tk * 100) / 100;
  if (pin.mode === 'ter') pin.v = +(tk - S.hConstr - NET.nodes[ni].t).toFixed(3); else { pin.mode = 'abs'; pin.v = tk; }
}
function addHeightPoint(i) {
  const p = ROUTE.pts[i], e = p.e;
  pushUndo();
  let key;
  if (e.type === 'track') {
    const s = snapStep(p.s);
    if (s <= 1e-3) key = e.id + ':0';
    else if (s >= e.L - 1e-3) key = e.id + ':1';
    else { const p2 = addTrack(subSeg(e, s, e.L)); p2.gMax = e.gMax; movePin(e.id + ':1', p2.id + ':1'); e.L = s; key = e.id + ':1'; }
  } else if (e.type === 'turnout') key = e.id + ':' + (p.s < turnoutGeom(e).Lmain / 2 ? 0 : 1);
  else return null;
  const ex = NET.portNode.get(key) !== undefined ? pinKeyAt(key) : null;    // v místě už bod je (pod klíčem souseda) → použít ho
  if (ex) key = ex;
  else if (!M.pins[key]) M.pins[key] = {mode: 'abs', v: Math.round(p.h * 100) / 100};
  sel = e.id;
  recompute();
  return key;
}
function openProfEdit(key) {
  const hd = PG && PG.handles.find(h => h.key === key); if (!hd) return;
  const box = $('profEdit'), inp = $('profEditVal');
  $('profEditLab').textContent = PG.rel ? 'TK relativně [m]' : 'TK [m n.m.]';
  inp.value = (hd.h - PG.DZ).toFixed(2);
  box.dataset.key = key; box.dataset.dz = PG.DZ;
  box.style.left = Math.min(PW - 230, PG.X(hd.st - PG.DS) + 12) + 'px';
  box.style.top = Math.max(2, Math.min(PH - 30, PG.Y(hd.h - PG.DZ) - 34)) + 'px';
  box.classList.remove('hidden'); inp.focus(); inp.select();
}
function applyProfEdit() {
  const box = $('profEdit'); if (box.classList.contains('hidden')) return;
  box.classList.add('hidden');
  const v = parseFloat($('profEditVal').value), key = box.dataset.key;
  if (!isFinite(v) || !M.pins[key]) return;
  pushUndo(); setPinTK(key, v + parseFloat(box.dataset.dz)); recompute();
}
$('profEditVal').addEventListener('keydown', ev => {
  if (ev.key === 'Enter') applyProfEdit();
  else if (ev.key === 'Escape') $('profEdit').classList.add('hidden');
  ev.stopPropagation();
});
$('profEditVal').addEventListener('blur', applyProfEdit);
$('profEditDel').addEventListener('mousedown', ev => {
  ev.preventDefault();
  const key = $('profEdit').dataset.key; $('profEdit').classList.add('hidden');
  if (pinKeysAt(key).length) { pushUndo(); delPinsAt(key); recompute(); }
});

pc.addEventListener('mousedown', ev => {
  if (!PG || !ROUTE) return;
  const [x, y] = profXY(ev), hd = profHandleAt(x, y);
  if (ev.button === 2) { if (hd) { pushUndo(); delPinsAt(hd.key); recompute(); hint('Výškový bod zrušen – výška se zase počítá automaticky.'); } return; }
  if (ev.button === 0 && hd) {
    profDrag = {key: hd.key, snap: JSON.stringify(M), moved: false};
    profFreeze = {zmin: PG.zmin, zmax: PG.zmax, DZ: PG.DZ};
    ev.preventDefault();
  }
});
pc.addEventListener('contextmenu', ev => ev.preventDefault());
pc.addEventListener('dblclick', ev => {
  if (!PG || !ROUTE) return;
  const [x, y] = profXY(ev), hd = profHandleAt(x, y);
  if (hd) { openProfEdit(hd.key); return; }
  if (x < PG.ml || y > PG.hBot + 4) return;
  const key = addHeightPoint(profIdxAt(x));
  if (key) openProfEdit(key);
});
window.addEventListener('mousemove', ev => {
  if (!profDrag || !PG) return;
  const [, y] = profXY(ev);
  setPinTK(profDrag.key, profZ(y)); profDrag.moved = true;
  recompute(false);
});
window.addEventListener('mouseup', () => {
  if (!profDrag) return;
  const d = profDrag; profDrag = null; profFreeze = null;
  if (d.moved && JSON.stringify(M) !== d.snap) { undoS.push(d.snap); if (undoS.length > 300) undoS.shift(); redoS = []; }
  recompute();
});
pc.addEventListener('mousemove', ev => {
  if (!PG || !ROUTE || profDrag) return;
  const [x, y] = profXY(ev), hd = profHandleAt(x, y);
  pc.style.cursor = hd ? 'ns-resize' : 'crosshair';
  pc.title = hd ? 'Výškový bod: táhnout = změnit výšku, dvojklik = zadat číslo, pravý klik = zrušit' : 'Dvojklik = nový výškový bod';
  const bi = profIdxAt(x);
  profHover = bi; profCursor = {x: ROUTE.pts[bi].x, y: ROUTE.pts[bi].y};
  drawProfile(); if (tab === 'plan') drawPlan();
});
$('profMode').addEventListener('change', () => { S.profMode = $('profMode').value; drawProfile(); try { localStorage.setItem(LS_KEY, JSON.stringify({S, M})); } catch (e) { /* */ } });
pc.addEventListener('mouseleave', () => { if (profDrag) return; profHover = null; profCursor = null; drawProfile(); drawPlan(); });
pc.addEventListener('click', ev => {
  if (profHover == null || ev.detail > 1) return;
  const p = ROUTE.pts[profHover]; VW.cx = p.x; VW.cy = p.y; drawPlan();
});

/* --- 3D --- */
let Z3 = null, ORTHO_RGB = null, MESH_IJK = null;
function orthoRGB() {                     // barva ortofota v každém bodě mřížky (0,25 m)
  if (ORTHO_RGB) return ORTHO_RGB;
  const img = IMG.ortho; if (!img.complete || !img.naturalWidth) return null;
  const cvs = document.createElement('canvas'); cvs.width = img.naturalWidth; cvs.height = img.naturalHeight;
  const c2 = cvs.getContext('2d'); c2.drawImage(img, 0, 0);
  const data = c2.getImageData(0, 0, cvs.width, cvs.height).data, sx = cvs.width / NX, sy = cvs.height / NY;
  const rgb = new Uint8Array(NX * NY * 3);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const px = Math.min(cvs.width - 1, Math.floor((i + .5) * sx)), py = Math.min(cvs.height - 1, Math.floor((NY - 1 - j + .5) * sy));
    const o = (py * cvs.width + px) * 4, q = (j * NX + i) * 3;
    rgb[q] = data[o]; rgb[q + 1] = data[o + 1]; rgb[q + 2] = data[o + 2];
  }
  return (ORTHO_RGB = rgb);
}
function builtDEM() {                     // terén po stavbě: pláň + svahy násypů (1:m) a zářezů (1:n) – viz earthGrid
  if (!NET) return {Z: Float32Array.from(DEM), tint: new Int8Array(NX * NY)};
  const g = earthGrid(NET, true);
  return {Z: g.Z, tint: g.tint};
}
function terrainMesh(Z, tint, op) {
  const rgb = orthoRGB(); if (!rgb) return null;
  const N = NX * NY, xs = new Array(N), ys = new Array(N), zs = new Array(N), col = new Array(N);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const o = j * NX + i; xs[o] = i * RES; ys[o] = j * RES; zs[o] = Z[o];
    let r = rgb[o * 3], g = rgb[o * 3 + 1], b = rgb[o * 3 + 2];
    if (tint && tint[o]) { const t = tint[o] > 0 ? [232, 131, 58] : [58, 123, 232]; r = r * .55 + t[0] * .45; g = g * .55 + t[1] * .45; b = b * .55 + t[2] * .45; }
    col[o] = `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  if (!MESH_IJK) {
    const I = [], J = [], K = [];
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1; I.push(a, b); J.push(b, d); K.push(c, c); }
    MESH_IJK = {I, J, K};
  }
  return {type: 'mesh3d', x: xs, y: ys, z: zs, i: MESH_IJK.I, j: MESH_IJK.J, k: MESH_IJK.K, vertexcolor: col, opacity: op, flatshading: false,
          lighting: {ambient: .72, diffuse: .45, specular: 0, roughness: 1, fresnel: 0}, lightposition: {x: -1e5, y: 1e5, z: 2e5},
          hoverinfo: 'skip', name: 'terén (ortofoto)', showlegend: false};
}
function build3D() {
  if (typeof Plotly === 'undefined') return;
  dirty3 = false;
  const ex = +$('ex3').value, op = +$('op3').value, tex = $('tex3').value, built = $('built3').checked && NET && NET.sets.length;
  const BT = built ? builtDEM() : {Z: DEM, tint: null};
  const tr = [];
  const tm = tex === 'o' ? terrainMesh(BT.Z, BT.tint, op) : null;
  if (tm) tr.push(tm);
  else {
    Z3 = []; for (let j = 0; j < NY; j++) Z3.push(Array.from(BT.Z.subarray(j * NX, (j + 1) * NX)));
    const xs = Array.from({length: NX}, (_, i) => i * RES), ys = Array.from({length: NY}, (_, j) => j * RES);
    tr.push({type: 'surface', x: xs, y: ys, z: Z3, opacity: op, showscale: false, cmin: DZMIN, cmax: DZMAX, hoverinfo: 'skip', name: 'terén',
             colorscale: [[0, '#1a9850'], [.3, '#a6d96a'], [.55, '#fee08b'], [.8, '#bf812d'], [1, '#f1e6d6']],
             contours: {z: {show: true, start: Math.floor(DZMIN), end: Math.ceil(DZMAX), size: .5, color: 'rgba(0,0,0,.3)'}},
             lighting: {ambient: .6, diffuse: .7, specular: .05, roughness: .9}});
  }
  const drape = (pts, lift, name, col, w) => {
    const X = [], Y = [], Z = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .5));
      for (let k = 0; k < n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n; X.push(x); Y.push(y); Z.push(terrain(x, y) + lift); }
    }
    X.push(X[0]); Y.push(Y[0]); Z.push(Z[0]);
    return {type: 'scatter3d', mode: 'lines', x: X, y: Y, z: Z, name, line: {color: col, width: w}, hoverinfo: 'name'};
  };
  AREA.forEach((r, i) => tr.push(Object.assign(drape(r, .08, AREA_LABEL ? 'hranice ' + AREA_LABEL : 'hranice pozemku', 'red', 5), {legendgroup: 'area', showlegend: !i})));
  BUILDINGS.forEach((b, i) => tr.push(Object.assign(drape(b, .08, PMETA.buildingLabel || 'budovy', '#f2c200', 4), {legendgroup: 'bld', showlegend: !i})));
  if (NET && NET.sets.length) {
    const rx = [], ry = [], rz = [], cx = [], cy = [], cz = [], ct = [];
    const V = {x: [], y: [], z: [], i: [], j: [], k: [], fc: []};
    for (const set of NET.sets) {
      for (const sgn of [1, -1]) { for (const p of set.pts) { rx.push(p.x - Math.sin(p.th) * S.gauge / 2 * sgn); ry.push(p.y + Math.cos(p.th) * S.gauge / 2 * sgn); rz.push(p.h); } rx.push(null); ry.push(null); rz.push(null); }
      for (const p of set.pts) { cx.push(p.x); cy.push(p.y); cz.push(p.h); ct.push(`${elName(set.e)} s=${f(p.s, 2)} m<br>TK ${f(p.h, 2)} · terén ${f(p.t, 2)}<br>${p.d >= 0 ? 'násyp' : 'zářez'} ${f(Math.abs(p.d), 2)} m`); }
      cx.push(null); cy.push(null); cz.push(null); ct.push('');
      if (set.e.type === 'turnout' && set.route === 'C') continue;
      const base = V.x.length;
      for (const p of set.pts) {
        const nx = -Math.sin(p.th), ny = Math.cos(p.th), hb = S.bForm / 2, w = hb + (p.d > 0 ? S.mFill : S.mCut) * Math.abs(p.d);
        const pts4 = [[p.x + nx * w, p.y + ny * w, null], [p.x + nx * hb, p.y + ny * hb, p.f], [p.x - nx * hb, p.y - ny * hb, p.f], [p.x - nx * w, p.y - ny * w, null]];
        for (const q of pts4) { V.x.push(q[0]); V.y.push(q[1]); V.z.push(q[2] == null ? terrain(q[0], q[1]) : q[2]); }
      }
      for (let i = 0; i < set.pts.length - 1; i++) {
        const a = base + i * 4, b = a + 4, col = (set.pts[i].d + set.pts[i + 1].d) > 0 ? '#e8833a' : '#3a7be8';
        for (let q = 0; q < 3; q++) { V.i.push(a + q, a + q + 1); V.j.push(a + q + 1, b + q + 1); V.k.push(b + q, b + q); V.fc.push(col, col); }
      }
    }
    if (!built) tr.push({type: 'mesh3d', x: V.x, y: V.y, z: V.z, i: V.i, j: V.j, k: V.k, facecolor: V.fc, opacity: .85, name: 'násyp / zářez', showlegend: true, hoverinfo: 'skip', flatshading: true});
    tr.push({type: 'scatter3d', mode: 'lines', x: rx, y: ry, z: rz, name: 'kolejnice (TK)', line: {color: '#222', width: 4}, hoverinfo: 'skip', connectgaps: false});
    tr.push({type: 'scatter3d', mode: 'lines', x: cx, y: cy, z: cz, name: 'osa koleje', line: {color: 'rgba(0,0,0,0)', width: 8}, text: ct, hovertemplate: '%{text}<extra></extra>', showlegend: false, connectgaps: false});
  }
  const m = Math.max(XMAX, YMAX), zr = DZMAX - DZMIN;
  const layout = {margin: {l: 0, r: 0, t: 0, b: 0}, showlegend: true, legend: {x: 0, y: 1}, uirevision: 'keep',
    scene: {aspectmode: 'manual', aspectratio: {x: XMAX / m, y: YMAX / m, z: zr * ex / m},
            xaxis: {title: {text: '→ východ [m]'}}, yaxis: {title: {text: '→ sever [m]'}}, zaxis: {title: {text: 'm n.m.'}},
            camera: {eye: {x: .75, y: .95, z: .65}, center: {x: 0, y: 0, z: -.1}}}};
  Plotly.react('view3d', tr, layout, {responsive: true, displaylogo: false});
}
['ex3', 'op3', 'tex3', 'built3'].forEach(id => $(id).addEventListener(id === 'built3' ? 'change' : 'input', () => build3D()));

function setTab(t) {
  tab = t;
  document.querySelectorAll('button.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('plan').classList.toggle('hidden', t !== 'plan'); $('view3d').classList.toggle('hidden', t !== '3d');
  $('tb-plan').classList.toggle('hidden', t !== 'plan'); $('tb-3d').classList.toggle('hidden', t !== '3d');
  ['hint', 'status', 'legend'].forEach(id => $(id).classList.toggle('hidden', t !== 'plan'));
  if (t === '3d') { build3D(); setTimeout(() => window.Plotly && Plotly.Plots.resize('view3d'), 50); }
  else resizePlan();
}

/* --- export --- */
function download(name, text, type) {
  const blob = new Blob([text], {type}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const n3 = v => (v == null || !isFinite(v)) ? '' : v.toFixed(3).replace('.', ',');
function csvRoute() {
  if (!ROUTE) { hint('Není co exportovat – nakreslete a vyberte kolej.', true); return; }
  const ref = profRef();
  const rows = ['staniceni_m;od_vstupu_m;prvek;x_lok;y_lok;x_EPSG5514;y_EPSG5514;Y_JTSK;X_JTSK;teren_m;TK_m;plan_m;nasyp(+)_zarez(-)_m;sklon_%;polomer_m;'
    + 'teren_rel_TKvstupu_m;TK_rel_TKvstupu_m;teren_rel_terenuvstupu_m;TK_rel_terenuvstupu_m'];
  const P = ROUTE.pts;
  P.forEach((p, i) => {
    const q = P[Math.min(i + 1, P.length - 1)], pp = P[Math.max(i - 1, 0)], g = (q.h - pp.h) / Math.max(1e-6, q.st - pp.st);
    const X5 = ORIGIN[0] + p.x, Y5 = ORIGIN[1] + p.y;
    rows.push([n3(p.st), n3(p.st - ref.st), elName(p.e), n3(p.x), n3(p.y), n3(X5), n3(Y5), n3(-X5), n3(-Y5), n3(p.t), n3(p.h), n3(p.f), n3(p.d), n3(g * 100),
      Math.abs(p.k) > 1e-9 ? n3(1 / Math.abs(p.k)) : '', n3(p.t - ref.tk), n3(p.h - ref.tk), n3(p.t - ref.t), n3(p.h - ref.t)].join(';'));
  });
  download(`route_stakeout_${FILE_ID}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}
function csvElements() {
  const rows = ['prvek;typ;delka_m;polomer_m;smer;uhel_st;TK_zacatek;TK_konec;max_sklon_%;max_nasyp_m;max_zarez_m;nasyp_m3;vykop_m3;prevyseni_mm;vmax_kmh;x_zac_5514;y_zac_5514'];
  for (const e of M.elements) {
    if (e.type !== 'track' && e.type !== 'turnout') continue;
    const es = NET.elStats.get(e.id) || {}, set = NET.sets.find(s => s.e === e), P = set ? set.pts : [];
    const arc = e.type === 'track' && Math.abs(e.k) > 1e-9, R = arc ? 1 / Math.abs(e.k) : (e.type === 'turnout' ? e.R : null), ci = arc ? cantInfo(R) : null;
    const L = e.type === 'track' ? e.L : turnoutGeom(e).Lmain;
    rows.push([e.id, e.type === 'turnout' ? `vyhybka ${e.kind === 'Y' ? 'Y' : e.side > 0 ? 'L' : 'P'} 1:${e.n}` : (arc ? 'oblouk' : 'prima'), n3(L), n3(R),
      e.type === 'track' ? (arc ? (e.k > 0 ? 'vlevo' : 'vpravo') : '') : (e.kind === 'Y' ? 'symetricka' : e.side > 0 ? 'vlevo' : 'vpravo'),
      arc ? n3(deg(Math.abs(e.k) * e.L)) : '', n3(P.length ? P[0].h : null), n3(P.length ? P[P.length - 1].h : null),
      n3(es.gMax * 100), n3(es.fill), n3(es.cut), n3(es.vFill), n3(es.vCut), ci ? n3(ci.c) : '', ci ? n3(ci.vmax) : '',
      n3(ORIGIN[0] + e.x), n3(ORIGIN[1] + e.y)].join(';'));
  }
  download(`track_elements_${FILE_ID}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

/* --- předpoklad ceny --- */
const kc = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0Kč';
function setCost(sc, k, v) {
  if (sc === 'g') { S.costG = S.costG || {}; (S.costG[S.gaugeKey] = S.costG[S.gaugeKey] || {})[k] = v; }
  else { S.costC = S.costC || {}; S.costC[k] = v; }
}
function saveLS() { try { localStorage.setItem(LS_KEY, JSON.stringify({S, M})); } catch (e) { /* */ } }
function costData() {
  const g = costG(), c = costC(), s = NET && NET.sum ? NET.sum : null;
  let Ltr = 0, Lto = 0, nTo = 0, nY = 0, nC = 0, nX = 0;
  for (const e of M.elements) {
    if (e.type === 'track') Ltr += e.L;
    else if (e.type === 'turnout') {
      const tg = turnoutGeom(e);
      Lto += .75 * (tg.Lmain + tg.Ldiv);                       // lože výhybky (větve se u hrotu překrývají)
      if (e.kind === 'Y') nY++; else if (tg.curved) nC++; else nTo++;
    } else if (e.type === 'cross') nX++;
  }
  const nT = nTo + nY + nC, nOpen = s ? s.nOpen : 0;
  const nSl = Ltr > 0 ? Math.ceil(Ltr / S.slPitch) : 0;
  const nRail = Ltr > 0 ? Math.ceil(2 * Ltr / g.railLen) : 0;
  const nJ = nRail + 6 * nT + 8 * nX;
  const Lbed = Ltr + Lto, vBal = S.bForm * g.tBal * Lbed, tBal = vBal * c.rho, aGeo = S.bForm * Lbed;
  const cut = s ? s.gCut : 0, fill = s ? s.gFill : 0, b = earthBalance(cut, fill);
  const rows = [];
  const R = (id, sc, label, qty, unit, q) => rows.push({id, sc, pk: id, label, qty, unit, q, price: +(sc === 'g' ? g : c)[id] || 0});
  if (c.mode === 'ready') R('ready', 'g', 'Kolej hotová (pole s pražci)', Ltr, 'm', `${f(Ltr, 2)} m · ${Math.ceil(Ltr / g.railLen)} polí à ${f(g.railLen, 2)} m`);
  else {
    R('rail', 'g', 'Kolejnice', 2 * Ltr, 'm', `2 × ${f(Ltr, 2)} m = ${f(2 * Ltr, 2)} m · ${nRail} ks à ${f(g.railLen, 2)} m`);
    R('sleeper', 'g', 'Pražce', nSl, 'ks', `${nSl} ks · rozteč ${f(S.slPitch * 100, 0)} cm, délka ${f(S.slLen * 100, 0)} cm`);
    R('fix', 'g', 'Upevnění kolejnic (vruty / spony)', 4 * nSl, 'ks', `4 na pražec = ${4 * nSl} ks`);
  }
  R('joint', 'g', 'Spojky kolejnic', nJ, 'ks', `≈ ${nJ} ks (styky + napojení výhybek a křížení)`);
  if (nTo) R('to', 'g', 'Výhybky L / P', nTo, 'ks', `${nTo} ks`);
  if (nY) R('toY', 'g', 'Výhybky Y', nY, 'ks', `${nY} ks`);
  if (nC) R('toC', 'g', 'Výhybky obloukové', nC, 'ks', `${nC} ks`);
  if (nX) R('cross', 'g', 'Křížení X', nX, 'ks', `${nX} ks`);
  if (nOpen) R('buffer', 'g', 'Zarážedla (volné konce)', nOpen, 'ks', `${nOpen} ks`);
  R('ballast', 'c', 'Štěrkové lože', tBal, 't', `${f(vBal, 2)} m³ = ${f(tBal, 2)} t · ${f(S.bForm, 2)} × ${f(g.tBal, 2)} m × ${f(Lbed, 1)} m`);
  R('geo', 'c', 'Geotextilie pod lože', aGeo, 'm²', `${f(aGeo, 1)} m² (šířka pláně)`);
  if (cut > .005) R('dig', 'c', 'Výkop zeminy', cut, 'm³', `${f(cut, 2)} m³ rostlé zeminy`);
  if (fill > .005) R('fill', 'c', 'Násyp vč. hutnění', fill, 'm³', `${f(fill, 2)} m³${b.surplus >= 0 ? ' (z vlastního výkopu)' : ''}`);
  if (b.haul > .005) R('haul', 'c', 'Odvoz přebytku zeminy', b.haul, 'm³', `${f(b.haul, 2)} m³ nakypřeno (nebo rozprostřít na zahradě)`);
  if (b.import > .005) R('imp', 'c', 'Dovoz zeminy', b.import, 'm³', `${f(b.import, 2)} m³ nakypřeno`);
  R('other', 'c', 'Ostatní (doprava, nářadí, drobný materiál)', 1, 'paušál', '');
  return {rows, c, g, L: s ? s.Ltr : Ltr};
}
let COST_SIG = '';
function renderCost() {
  const d = costData(), box = $('cost'), sig = d.rows.map(r => r.id).join(',');
  if (sig !== COST_SIG || !box.firstChild) {
    COST_SIG = sig;
    box.innerHTML = d.rows.map(r => `<div class="crow"><span>${esc(r.label)}<span class="q" id="cq_${r.id}"></span></span>
        <input type="number" min="0" step="any" id="ci_${r.id}" data-sc="${r.sc}" data-pk="${r.pk}" value="${r.price}" title="cena za jednotku">
        <span class="u">${r.unit === 'paušál' ? 'Kč' : 'Kč/' + r.unit}</span><span class="t" id="ct_${r.id}"></span></div>`).join('')
      + `<div class="crow sum"><span>Mezisoučet</span><span></span><span></span><span class="t" id="ct__sub"></span></div>
         <div class="crow"><span>Rezerva <span class="q" id="cq__res"></span></span><span></span><span></span><span class="t" id="ct__res"></span></div>
         <div class="crow tot"><span>Celkem<span class="q" id="cq__tot"></span></span><span></span><span></span><span class="t" id="ct__tot"></span></div>`;
    box.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v) && v >= 0) { setCost(inp.dataset.sc, inp.dataset.pk, v); updateCost(); } });
      inp.addEventListener('change', saveLS);
    });
  }
  return updateCost(d);
}
function updateCost(d = costData()) {
  let sub = 0;
  for (const r of d.rows) {
    const t = r.qty * r.price; sub += t;
    const q = $('cq_' + r.id), ct = $('ct_' + r.id), inp = $('ci_' + r.id);
    if (q) q.textContent = r.q;
    if (ct) ct.textContent = kc(t);
    if (inp && document.activeElement !== inp && +inp.value !== r.price) inp.value = r.price;
  }
  const res = sub * (+d.c.reserve || 0) / 100, tot = sub + res;
  if ($('ct__sub')) {
    $('ct__sub').textContent = kc(sub);
    $('cq__res').textContent = `${f(+d.c.reserve || 0, 0)} %`; $('ct__res').textContent = kc(res);
    $('ct__tot').textContent = kc(tot);
    $('cq__tot').textContent = d.L > 0 ? `${kc(tot / d.L)} na 1 m trati (${f(d.L, 1)} m)` : '';
  }
  return {sub, res, tot};
}
function buildCostPar() {
  const P = [['slPitch', 's', 'Rozteč pražců', 'm', .01], ['railLen', 'g', 'Délka kolejnice / pole', 'm', .5],
             ['tBal', 'g', 'Tloušťka štěrkového lože', 'm', .01], ['rho', 'c', 'Objemová hmotnost štěrku', 't/m³', .1],
             ['reserve', 'c', 'Rezerva na nepředvídané', '%', 1]];
  for (const [k, sc, lab, u, st] of P) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label for="cp_${k}">${lab}</label><input type="number" id="cp_${k}" step="${st}" min="0" data-sc="${sc}"><span class="u">${u}</span>`;
    $('costPar').appendChild(row);
    row.querySelector('input').addEventListener('change', ev => {
      const v = parseFloat(ev.target.value);
      if (!(isFinite(v) && v >= 0) || (k !== 'reserve' && !(v > 0))) { syncCostPar(); return; }
      if (sc === 's') { S[k] = v; drawPlan(); } else setCost(sc, k, v);
      renderCost(); saveLS();
    });
  }
}
function syncCostPar() {
  const g = costG(), c = costC();
  $('cp_slPitch').value = +(+S.slPitch).toFixed(3); $('cp_railLen').value = g.railLen; $('cp_tBal').value = g.tBal;
  $('cp_rho').value = c.rho; $('cp_reserve').value = c.reserve; $('costMode').value = c.mode;
}
function csvCost() {
  const d = costData(), t = updateCost(d), n2 = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
  const rows = ['polozka;mnozstvi;jednotka;cena_za_jednotku_Kc;celkem_Kc;poznamka'];
  for (const r of d.rows) rows.push([r.label, n3(r.qty), r.unit, n2(r.price), n2(r.qty * r.price), r.q].join(';'));
  rows.push(['Mezisoučet', '', '', '', n2(t.sub), ''].join(';'), [`Rezerva ${d.c.reserve} %`, '', '', '', n2(t.res), ''].join(';'),
            ['CELKEM', '', '', '', n2(t.tot), `rozchod ${S.gaugeKey}", ${d.c.mode === 'ready' ? 'hotová kolej' : 'kolej z dílů'}`].join(';'));
  download(`cost_estimate_${FILE_ID}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

/* --- tabulka výškových bodů (všechny zafixované výšky TK) --- */
let PIN_SIG = '';
function pinInfo() {
  const keys = Object.keys(M.pins), groups = new Map(), rows = [], PM = ROUTE ? profMode() : null;
  for (const k of keys) { const ni = NET.portNode.get(k); if (ni !== undefined) { if (!groups.has(ni)) groups.set(ni, []); groups.get(ni).push(k); } }
  for (const k of keys) {
    const id = +k.split(':')[0], e = M.elements.find(x => x.id === id), ni = NET.portNode.get(k);
    const r = {key: k, pin: M.pins[k], name: pinName(k), e, ni, st: null, bad: '', dup: '', keep: false};
    if (ni === undefined) {
      r.keep = !!e && e.type === 'start';
      r.bad = !e ? 'prvek už neexistuje – bod se nepoužívá' : r.keep ? 'vstupní bod není napojen na kolej – použije se po napojení' : 'konec prvku neexistuje – bod se nepoužívá';
    } else {
      const n = NET.nodes[ni], g = groups.get(ni);
      Object.assign(r, {x: n.x, y: n.y, h: NET.h[ni], t: n.t});
      if (g.length > 1) r.dup = g[g.length - 1] === k ? `platí – v místě je ${g.length}× bod` : 'duplicitní – v místě neplatí, smažte';
      if (ROUTE) { const p = ROUTE.pts.find(q => Math.abs(q.x - n.x) < .02 && Math.abs(q.y - n.y) < .02); if (p) r.st = p.st - (PM ? PM.ds : 0); }
    }
    rows.push(r);
  }
  rows.sort((a, b) => (a.st == null) - (b.st == null) || (a.st || 0) - (b.st || 0));
  return rows;
}
const pinJunk = r => r.dup.startsWith('dupl') || (r.bad && !r.keep);
function renderPins() {
  const box = $('pins'); if (!NET) return;
  const rows = pinInfo(), sig = rows.map(r => r.key).join(',');
  $('npins').textContent = rows.length;
  if (sig !== PIN_SIG) {
    PIN_SIG = sig;
    box.innerHTML = rows.map(r => `<div class="pinr" data-key="${r.key}">
        <div class="l1"><span class="nm"></span><button class="pinGo" title="Ukázat v plánu a v profilu">⌖</button><button class="pinDel" title="Smazat výškový bod">✕</button></div>
        <div class="l2"><select data-k="mode"><option value="abs">TK pevně [m n.m.]</option><option value="ter">pláň nad terénem [m]</option></select>
          <input data-k="v" type="number" step="0.01"><span class="inf small"></span></div></div>`).join('')
      || '<span class="small">Žádné výškové body – výška TK se všude počítá automaticky.</span>';
  }
  const act = document.activeElement;
  for (const r of rows) {
    const d = box.querySelector(`.pinr[data-key="${r.key}"]`); if (!d) continue;
    d.querySelector('.nm').textContent = r.name;
    const sl = d.querySelector('[data-k="mode"]'), inp = d.querySelector('[data-k="v"]');
    if (sl !== act) sl.value = r.pin.mode === 'ter' ? 'ter' : 'abs';
    if (inp !== act) inp.value = (+r.pin.v).toFixed(3);
    d.querySelector('.inf').innerHTML = r.bad ? `<span class="${r.keep ? 'mid' : 'bad'}">${esc(r.bad)}</span>`
      : `TK ${f(r.h, 2)} · terén ${f(r.t, 2)}${r.st != null ? ` · st. ${f(r.st, 2)} m` : ' · mimo trasu profilu'}` +
        (r.dup ? ` · <span class="${r.dup.startsWith('dupl') ? 'bad' : 'mid'}">${esc(r.dup)}</span>` : '');
    d.classList.toggle('badr', pinJunk(r));
  }
  $('pinsClean').disabled = !rows.some(pinJunk);
  $('pinsClear').disabled = !rows.length;
}
function initPins() {
  const box = $('pins'), keyOf = el => { const d = el.closest('.pinr'); return d ? d.dataset.key : null; };
  box.addEventListener('change', ev => {
    const key = keyOf(ev.target), pin = key && M.pins[key]; if (!pin) return;
    const ni = NET.portNode.get(key);
    if (ev.target.dataset.k === 'mode') {
      const m = ev.target.value; if (m === pin.mode) return;
      pushUndo();
      if (ni !== undefined) pin.v = m === 'abs' ? +NET.h[ni].toFixed(3) : +(NET.h[ni] - S.hConstr - NET.nodes[ni].t).toFixed(3);
      pin.mode = m;
    } else {
      const v = parseFloat(ev.target.value); if (!isFinite(v)) { renderPins(); return; }
      pushUndo(); pin.v = v;
    }
    recompute();
  });
  box.addEventListener('click', ev => {
    const key = keyOf(ev.target); if (!key) return;
    if (ev.target.classList.contains('pinDel')) { pushUndo(); delete M.pins[key]; recompute(); hint(`Výškový bod ${pinName(key)} smazán.`); return; }
    if (ev.target.classList.contains('pinGo')) {
      const ni = NET.portNode.get(key), e = M.elements.find(x => x.id === +key.split(':')[0]);
      if (e && e.type !== 'start' && e.type !== 'cross') { sel = e.id; recompute(false); }
      const n = ni !== undefined ? NET.nodes[ni] : e;
      if (n) { VW.cx = n.x; VW.cy = n.y; VW.sc = Math.max(VW.sc, 25); profCursor = {x: n.x, y: n.y}; }
      setTab('plan'); drawPlan(); drawProfile();
    }
  });
  $('pinsClean').addEventListener('click', () => {
    const junk = pinInfo().filter(pinJunk); if (!junk.length) return;
    pushUndo(); for (const r of junk) delete M.pins[r.key]; recompute();
    hint(`Smazáno ${junk.length} duplicitních / neplatných výškových bodů.`);
  });
  $('pinsClear').addEventListener('click', () => {
    if (!Object.keys(M.pins).length || !confirm('Smazat všechny výškové body (i u vstupních bodů)? Výška TK se pak všude počítá automaticky.')) return;
    pushUndo(); M.pins = {}; recompute();
  });
}

/* --- ukázkový návrh --- */
function demo() {
  pushUndo();
  M = {elements: [], pins: {}, nextId: 1};
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const R = 10, Ls = 4, ax = 98.5 * Math.PI / 180, C = {x: (x0 + x1) / 2 - 2, y: (y0 + y1) / 2 + 12.5};
  const tx = Math.cos(ax), ty = Math.sin(ax), rx = Math.sin(ax), ry = -Math.cos(ax);
  const P0 = {x: snapStep(C.x + rx * R - tx * Ls / 2), y: snapStep(C.y + ry * R - ty * Ls / 2)};
  M.elements.push({type: 'start', id: M.nextId++, x: P0.x, y: P0.y, h: ax});
  M.pins['1:0'] = {mode: 'ter', v: 0};
  let cur = {x: P0.x, y: P0.y, h: ax};
  const go = (k, L) => { const e = addTrack({x: cur.x, y: cur.y, h: cur.h, k, L}); const p = segAt(e, L); cur = {x: p.x, y: p.y, h: p.th}; return e; };
  go(0, Ls); go(1 / R, Math.PI * R); const west = go(0, Ls); go(1 / R, Math.PI * R);
  // výhybka do západní přímé + krátká kolej dovnitř okruhu
  const tL = {type: 'turnout', side: 1, R: S.toR, n: S.toN, L: S.toL, route: 'B'}, Lm = turnoutGeom(tL).Lmain;
  if (west.L > Lm + .5) {
    const s = .25, p = segAt(west, s);
    const t = Object.assign(tL, {id: M.nextId++, x: p.x, y: p.y, h: p.th});
    const p2 = addTrack(subSeg(west, s + Lm, west.L));
    Object.assign(west, subSeg(west, 0, s));
    M.elements.push(t);
    const g = turnoutGeom(t);
    addTrack({x: g.C.x, y: g.C.y, h: g.C.th, k: 0, L: 3});
    void p2;
  }
  sel = null; setTool('select'); recompute();
}

/* --- nastavení UI --- */
function buildFields() {
  for (const [g, k, lab, u, st] of FIELDS) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label for="f_${k}">${lab}</label><input type="number" id="f_${k}" step="${st}"><span class="u">${u}</span>`;
    $('grp-' + g).appendChild(row);
    row.querySelector('input').addEventListener('change', ev => {
      const v = parseFloat(ev.target.value);
      if (isFinite(v)) { S[k] = v; settingsChanged(); } else ev.target.value = S[k];
    });
  }
}
function syncFields() {
  for (const [, k] of FIELDS) $('f_' + k).value = +(+S[k]).toFixed(4);
  $('gauge').value = S.gaugeKey; $('gDesignMode').value = S.gDesignMode; $('rFlex').value = S.rFlex; $('step').value = S.step;
  $('profMode').value = S.profMode || 'abs';
  $('strictR').checked = S.strictR !== false;
  syncCircle();
  syncCostPar();
}
function syncCircle() {
  const inp = $('rCircle');
  inp.value = +circleR().toFixed(3);
  inp.style.color = circleAuto() ? '#57606a' : '';
  inp.title = circleAuto() ? 'výchozí = doporučený min. poloměr' : 'zadáno ručně (↺ = doporučený)';
}
function init() {
  // titulek podle projektu
  document.title = `${PRJ.name} – zahradní železnice`;
  $('prjName').textContent = PRJ.name;
  $('prjSub').textContent = [PMETA.ku ? 'k.ú. ' + PMETA.ku : '', PMETA.address || '', 'terén DMR 5G (ČÚZK)', `mřížka ${f(RES, 2)} m`].filter(Boolean).join(' · ');
  $('lgArea').textContent = AREA_LABEL ? 'hranice ' + AREA_LABEL : 'hranice pozemku';
  $('lgBld').textContent = PMETA.buildingLabel || 'budovy';
  buildFields();
  buildCostPar();
  try {
    const sv = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (sv && sv.S && sv.M) {
      S = Object.assign({}, S, sv.S); M = sv.M;
      const pr = PRESETS[S.gaugeKey] || PRESETS['5'];
      for (const k of ['toRY', 'xAng']) if (sv.S[k] == null) S[k] = pr[k];   // nové parametry ve starém uložení
    }
  } catch (e) { /* ignorovat */ }
  syncFields();
  svInit();
  initPins();
  $('gauge').addEventListener('change', () => { S = Object.assign(S, PRESETS[$('gauge').value], {gaugeKey: $('gauge').value}); syncFields(); recompute(); });
  $('gDesignMode').addEventListener('change', () => { S.gDesignMode = $('gDesignMode').value; recompute(); });
  $('rFlex').addEventListener('change', () => {
    let v = parseFloat($('rFlex').value);
    if (!(v > .5)) { $('rFlex').value = S.rFlex; return; }
    if (S.strictR && v < S.rMin) { v = S.rMin; $('rFlex').value = v; hint(`R flexi nemůže být menší než min. poloměr ${f(S.rMin, 1)} m (omezení lze vypnout v Limitech).`, true); }
    S.rFlex = v; updatePreview(); drawPlan();
  });
  $('rCircle').addEventListener('change', () => {
    let v = parseFloat($('rCircle').value);
    if (!(v > .5)) { syncCircle(); return; }
    if (S.strictR && v < S.rMin) { v = S.rMin; hint(`R kruhu nemůže být menší než min. poloměr ${f(S.rMin, 1)} m (omezení lze vypnout v Limitech).`, true); }
    S.rCircle = Math.abs(v - S.rRec) < 1e-9 ? null : v;
    syncCircle(); updatePreview(); drawPlan();
    try { localStorage.setItem(LS_KEY, JSON.stringify({S, M})); } catch (e) { /* */ }
  });
  $('rCircleReset').addEventListener('click', () => { S.rCircle = null; syncCircle(); updatePreview(); drawPlan(); });
  $('strictR').addEventListener('change', () => {
    S.strictR = $('strictR').checked;
    if (S.strictR && S.rFlex < S.rMin) { S.rFlex = S.rMin; $('rFlex').value = S.rFlex; }
    syncCircle();
    recompute();
  });
  $('step').addEventListener('change', () => { const v = parseFloat($('step').value); if (v >= .05) { S.step = v; recompute(); } else $('step').value = S.step; });
  document.querySelectorAll('button.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  document.querySelectorAll('button.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  ['bg', 'lyCont', 'lyEarth', 'lyLab', 'lySv'].forEach(id => $(id).addEventListener('change', drawPlan));
  $('toRev').addEventListener('change', () => { updatePreview(); drawPlan(); });
  $('bUndo').addEventListener('click', undo); $('bRedo').addEventListener('click', redo);
  $('bSave').addEventListener('click', () => download(`track_design_${FILE_ID}.json`, JSON.stringify({version: 1, project: PRJ.id, origin: ORIGIN, S, M, survey: SV}, null, 1), 'application/json'));
  $('bLoad').addEventListener('click', () => $('fLoad').click());
  $('fLoad').addEventListener('change', ev => {
    const file = ev.target.files[0]; if (!file) return;
    file.text().then(t => {
      let o = JSON.parse(t);
      if (o.format === 'zahradni-zeleznice-projekt') o = Object.assign({}, o.design || {}, {survey: o.survey, origin: o.data && o.data.origin});
      if (!o.M || !o.M.elements) throw new Error('soubor neobsahuje návrh trati');
      // návrh z jiného projektu: posun o rozdíl počátků souřadnic (S-JTSK zůstane stejné)
      const dx = o.origin ? o.origin[0] - ORIGIN[0] : 0, dy = o.origin ? o.origin[1] - ORIGIN[1] : 0;
      if (dx || dy) {
        for (const e of o.M.elements) { e.x += dx; e.y += dy; }
        if (o.survey && o.survey.pts) for (const p of o.survey.pts) { p.x += dx; p.y += dy; }
      }
      pushUndo(); M = o.M; if (o.S) S = Object.assign({}, S, o.S); syncFields(); sel = null;
      if (o.survey && Array.isArray(o.survey.pts)) { SV = Object.assign(SV, o.survey); $('svUse').checked = SV.use !== false; svApply(); svSave(); svRender(); }
      recompute();
      if (dx || dy) hint(`Návrh z jiného projektu – posunut o ${f(dx, 2)} / ${f(dy, 2)} m, aby seděl na stejném místě v S-JTSK.`);
    }).catch(err => showErr('Načtení: ' + err.message));
    ev.target.value = '';
  });
  $('bPrjExport').addEventListener('click', () => window.ZZ && ZZ.exportProject(PRJ.id));
  $('bProjects').addEventListener('click', () => { if (window.ZZ) ZZ.backToStart(); });
  $('bCsvRoute').addEventListener('click', csvRoute); $('bCsvEl').addEventListener('click', csvElements);
  $('bCsvCost').addEventListener('click', csvCost);
  $('costMode').addEventListener('change', () => { setCost('c', 'mode', $('costMode').value); renderCost(); saveLS(); });
  $('bBalance').addEventListener('click', balanceEarth);
  $('bBalanceClr').addEventListener('click', () => { if (+M.hShift) { pushUndo(); M.hShift = 0; recompute(); hint('Posun nivelety zrušen.'); } });
  $('bDemo').addEventListener('click', demo);
  $('bClear').addEventListener('click', () => { if (!M.elements.length || confirm('Smazat celý návrh?')) { pushUndo(); M = {elements: [], pins: {}, nextId: 1}; sel = null; flexFrom = null; recompute(); } });
  window.addEventListener('resize', () => { resizePlan(); resizeProfile(); });
  resizePlan(); resizeProfile(); fitView();
  setTool('select');
  recompute(false);
  const hs = location.hash;
  if (hs === '#selftestsurvey') { svSelftest(); return; }
  if (hs === '#selftestpins') {            // test: výškové body – duplicita v jednom místě, mazání v profilu / tabulce / panelu
    demo(); const log = [], nP = () => Object.keys(M.pins).length;
    const tr = M.elements.find(e => e.type === 'track'), spur = M.elements.filter(e => e.type === 'track').pop();
    sel = tr.id; recompute(false);
    M.pins[tr.id + ':0'] = {mode: 'abs', v: 387.5}; recompute();          // stav ze starší verze: 2 body na místě vstupu
    log.push(`duplicita: bodů ${nP()}, varování ${NET.warn.some(w => w.msg.includes('zadán 2×')) ? 'ano' : 'NE'}, řádků ${$('pins').querySelectorAll('.pinr').length}, označeno ${$('pins').querySelectorAll('.pinr.badr').length}`);
    const hd = PG.handles.find(h => pinKeysAt(h.key).length === 2), rr = pc.getBoundingClientRect();
    log.push(`úchytů v profilu na místě ${PG.handles.filter(h => Math.abs(h.st - hd.st) < .01).length}`);
    pc.dispatchEvent(new MouseEvent('mousedown', {clientX: rr.left + PG.X(hd.st - PG.DS), clientY: rr.top + PG.Y(hd.h - PG.DZ), button: 2, bubbles: true}));
    log.push(`pravý klik v profilu: v místě zbylo ${pinKeysAt(tr.id + ':0').length}`);
    undo(); log.push(`Ctrl+Z → ${pinKeysAt(tr.id + ':0').length}`);
    $('pinsClean').click(); log.push(`„smazat duplicitní“ → zbylo ${nP()}: ${Object.keys(M.pins).map(pinName).join(', ')}`);
    const i0 = ROUTE.pts.findIndex(p => Math.hypot(p.x - NET.nodes[NET.portNode.get(tr.id + ':0')].x, p.y - NET.nodes[NET.portNode.get(tr.id + ':0')].y) < .02);
    addHeightPoint(i0); log.push(`dvojklik na místě s bodem: bodů ${nP()} (nepřibyl ${nP() === 1 ? '✓' : '✗'})`);
    pushUndo(); M.pins[spur.id + ':1'] = {mode: 'ter', v: .2}; M.pins['999:0'] = {mode: 'abs', v: 1}; recompute();
    const row = $('pins').querySelector(`.pinr[data-key="${spur.id}:1"]`);
    log.push(`bod mimo trasu: ${row ? row.querySelector('.inf').textContent : 'CHYBÍ'} | neplatný: ${$('pins').querySelector('.pinr[data-key="999:0"] .inf').textContent}`);
    const inp = row.querySelector('[data-k="v"]'); inp.value = '0.35'; inp.dispatchEvent(new Event('change', {bubbles: true}));
    log.push(`hodnota z tabulky: ${M.pins[spur.id + ':1'].v}`);
    $('pins').querySelector(`.pinr[data-key="${spur.id}:1"] .pinDel`).click();
    $('pinsClean').click(); log.push(`✕ + vyčistit → ${Object.keys(M.pins).map(pinName).join(', ')}`);
    const stId = M.elements.find(e => e.type === 'start').id;
    pushUndo(); M.pins = {[stId + ':0']: {mode: 'ter', v: 0}}; sel = tr.id; recompute(false);
    const ps = $('props').querySelector(`select[data-pin="${tr.id}:0"]`);
    log.push(`panel ${elName(tr)}, začátek (bod uložen u vstupního bodu): ${ps ? ps.value : '?'}`);
    ps.value = 'auto'; ps.dispatchEvent(new Event('change')); log.push(`→ auto: bodů ${nP()}`);
    undo(); M.pins[tr.id + ':0'] = {mode: 'abs', v: 387.5}; recompute();
    document.querySelectorAll('#side > details').forEach(d => { d.open = !!d.querySelector('#pins, #warnings'); });
    hint('TEST: ' + log.join(' | '));
    return;
  }
  if (hs === '#selftestcost') {            // test: kubatury z mřížky, vyrovnání bilance, předpoklad ceny
    demo();
    const log = [], s0 = NET.sum, tot0 = $('ct__tot').textContent;
    log.push(`osa: výkop ${f(s0.vCut)} / násyp ${f(s0.vFill)} m³ | mřížka: výkop ${f(s0.gCut)} / násyp ${f(s0.gFill)} m³`);
    log.push(`cena ${tot0}, položek ${$('cost').querySelectorAll('input').length}`);
    const t0 = performance.now(); $('bBalance').click(); const dt = performance.now() - t0;
    const s1 = NET.sum;
    log.push(`vyrovnání (${f(dt, 0)} ms): posun ${fs(+M.hShift, 3)} m, výkop ${f(s1.gCut)} × ${f(S.kUse)} = ${f(s1.gCut * S.kUse)} vs násyp ${f(s1.gFill)} m³, chyb ${NET.warn.filter(w => w.lvl === 'err').length}`);
    log.push(`cena po vyrovnání ${$('ct__tot').textContent}`);
    const inp = $('ci_rail'); inp.value = 1000; inp.dispatchEvent(new Event('input'));
    log.push(`kolejnice 1000 Kč/m → ${$('ct__tot').textContent}`);
    $('costMode').value = 'ready'; $('costMode').dispatchEvent(new Event('change'));
    log.push(`hotová kolej → ${$('ct__tot').textContent}`);
    $('gauge').value = '7.25'; $('gauge').dispatchEvent(new Event('change'));
    log.push(`7¼" → ${$('ct__tot').textContent}`);
    $('gauge').value = '5'; $('gauge').dispatchEvent(new Event('change'));
    log.push(`zpět 5" → kolejnice ${costG().rail} Kč/m (pamatuje)`);
    $('costMode').value = 'parts'; $('costMode').dispatchEvent(new Event('change'));
    undo(); log.push(`Ctrl+Z → posun ${fs(+M.hShift || 0, 3)}`);
    $('bBalance').click();
    document.querySelectorAll('#side > details').forEach(d => { d.open = !!d.querySelector(location.search.includes('earth') ? '#earth, #cost' : '#cost'); });
    hint('TEST: ' + log.join(' | '));
    return;
  }
  if (hs === '#selftestfit') {             // test: kruh + rovná trať → pomocník napojí výhybkou v poloměru kruhu
    M = {elements: [], pins: {}, nextId: 1}; sel = null; recompute(false);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = snapStep((x0 + x1) / 2 - 3), cy = snapStep((y0 + y1) / 2 + 14), log = [];
    const ev = (type, wx, wy, o = {}) => { const [px, py] = w2s(wx, wy), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent(type, Object.assign({clientX: r.left + px, clientY: r.top + py, button: 0, bubbles: true}, o))); };
    const click = (wx, wy, o) => { ev('mousemove', wx, wy, o); ev('mousedown', wx, wy, o); ev('mouseup', wx, wy, o); };
    const rclick = (wx, wy) => { for (const t of ['mousemove', 'mousedown', 'mouseup']) ev(t, wx, wy, {button: 2}); };
    setTool('circle'); click(cx, cy);
    const R = circleR(); VW.cx = cx + 2; VW.cy = cy - 4; VW.sc = 17; drawPlan();
    // rovná trať: jižně od kruhu, vede na sever, konec 4 m pod kruhem a 3 m vpravo od osy
    setTool('start'); click(cx + 6, cy - R - 12); click(cx + 6, cy - R - 9);
    click(cx + 6, cy - R - 4, {ctrlKey: true}); setTool('select');
    const nT = () => M.elements.filter(e => e.type === 'turnout').length;
    log.push(`kruh R ${f(R, 1)} + přímá, volných konců ${NET.sum.nOpen}`);
    rclick(cx + 6, cy - R - 4);
    const items = [...$('ctxMenu').querySelectorAll('.cm-item')], it = items.find(b => b.textContent.startsWith('Pomocník'));
    log.push(`pomocník: ${it ? (it.disabled ? 'NEDOSTUPNÝ' : it.textContent.replace('Pomocník: napojit výhybkou na kolej', '').trim()) : 'chybí'}`);
    if (it && !it.disabled) { it.dispatchEvent(new MouseEvent('mouseenter')); it.click(); }
    const t = M.elements.find(e => e.type === 'turnout');
    if (t) {
      const c0 = NET.conn.get(t.id + ':0'), c1 = NET.conn.get(t.id + ':1'), c2 = NET.conn.get(t.id + ':2');
      log.push(`po napojení: ${elName(t)} follow ${t.follow || '-'}, spoje A/B/C ${c0 ? '✓' : '✗'}/${c1 ? '✓' : '✗'}/${c2 ? '✓' : '✗'}, volných konců ${NET.sum.nOpen}, okruh ${ROUTE && ROUTE.loop ? 'ano' : 'ne'}, chyb ${NET.warn.filter(w => w.lvl === 'err').length}`);
    } else log.push('výhybka NEvložena');
    // druhá výhybka pravým klikem přímo do kruhu (sever) – přímá větev tečně ven
    rclick(cx, cy + R);
    const it2 = [...$('ctxMenu').querySelectorAll('.cm-item')].find(b => b.textContent.startsWith('Výhybka v poloměru oblouku') && b.textContent.includes('ve směru'));
    if (it2 && !it2.disabled) it2.click();
    const t2 = M.elements.filter(e => e.type === 'turnout')[1];
    if (t2) log.push(`v kruhu: ${elName(t2)} R ${f(t2.R, 1)}, spoje A/C ${NET.conn.get(t2.id + ':0') ? '✓' : '✗'}/${NET.conn.get(t2.id + ':2') ? '✓' : '✗'}, B volná ${NET.conn.get(t2.id + ':1') ? 'NE' : 'ano'}, výhybek ${nT()}`);
    // Y tlačítkem do kruhu (západ)
    setTool('toY'); click(cx - R, cy); setTool('select');
    log.push(`Y do kruhu: výhybek ${nT()}, volných konců ${NET.sum.nOpen}, chyby: ${NET.warn.filter(w => w.lvl === 'err').map(w => w.msg).join(' / ') || 'žádné'}`);
    hint('TEST: ' + log.join(' | '));
    return;
  }
  if (hs === '#selftestjoinarc') {         // test: napojení flexi koleje výhybkou do kruhu
    M = {elements: [], pins: {}, nextId: 1}; sel = null; recompute(false);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = snapStep((x0 + x1) / 2 - 4), cy = snapStep((y0 + y1) / 2 + 12), log = [];
    const ev = (type, wx, wy, o = {}) => { const [px, py] = w2s(wx, wy), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent(type, Object.assign({clientX: r.left + px, clientY: r.top + py, button: 0, bubbles: true}, o))); };
    const click = (wx, wy, o) => { ev('mousemove', wx, wy, o); ev('mousedown', wx, wy, o); ev('mouseup', wx, wy, o); };
    setTool('circle'); click(cx, cy);
    const R = circleR(); VW.cx = cx + 6; VW.cy = cy - 2; VW.sc = 18; drawPlan();
    setTool('start'); click(cx + 17, cy - 12); click(cx + 17, cy - 9);              // vstup jihovýchodně, směr sever
    const a = 20 * Math.PI / 180, tx = cx + R * Math.cos(a), ty = cy + R * Math.sin(a);
    ev('mousemove', tx, ty);
    log.push(`dotyk kruhu: ${preview && preview.kind}${preview && preview.block ? ' BLOK – ' + preview.text : ' – ' + (preview && preview.text)}`);
    click(tx, ty); setTool('select');
    const t = M.elements.find(e => e.type === 'turnout');
    log.push(t ? `vloženo: ${elName(t)}, R odbočky ${f(turnoutDivR(t), 1)} m, volných konců ${NET.sum.nOpen}, chyb ${NET.warn.filter(w => w.lvl === 'err').length}` : 'NEvloženo');
    hint('TEST: ' + log.join(' | '));
    return;
  }
  if (hs === '#selftestcurve') {           // test: výhybka do kruhu pravým klikem
    M = {elements: [], pins: {}, nextId: 1}; sel = null; recompute(false);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = snapStep((x0 + x1) / 2 - 2), cy = snapStep((y0 + y1) / 2 + 12), log = [];
    const ev = (type, wx, wy, o = {}) => { const [px, py] = w2s(wx, wy), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent(type, Object.assign({clientX: r.left + px, clientY: r.top + py, button: 0, bubbles: true}, o))); };
    setTool('circle'); ev('mousemove', cx, cy); ev('mousedown', cx, cy); ev('mouseup', cx, cy);
    const R = circleR(), c = M.elements.find(e => e.type === 'track');
    VW.cx = cx; VW.cy = cy - R; VW.sc = 30; drawPlan();
    for (const t of ['mousemove', 'mousedown', 'mouseup']) ev(t, cx, cy - R, {button: 2});
    const items = [...$('ctxMenu').querySelectorAll('.cm-item')];
    log.push(`kruh R ${f(R, 1)}: nabídka ${items.length} položek; ` + items.slice(0, 4).map(b => (b.disabled ? '✗ ' : '✓ ') + b.textContent.replace('Oblouková výhybka – odbočka ', '')).join('; '));
    const it = items.find(b => !b.disabled && b.textContent.includes('ven, ve směru'));
    if (it) { it.dispatchEvent(new MouseEvent('mouseenter')); it.click(); }
    const t = M.elements.find(e => e.type === 'turnout');
    log.push(t ? `vloženo: ${elName(t)}, R odbočky ${f(turnoutDivR(t), 1)} m, volných konců ${NET.sum.nOpen}, okruh ${ROUTE && ROUTE.loop ? 'zachován' : 'NE'}, chyb ${NET.warn.filter(w => w.lvl === 'err').length}` : 'výhybka NEvložena');
    hint('TEST: ' + log.join(' | '));
    if (t) { const g = turnoutGeom(t); VW.cx = g.B.x; VW.cy = g.B.y; drawPlan(); }
    return;
  }
  if (hs === '#selftestto') {              // test: úprava poloměru výhybky, napojená kolej se posune
    demo();
    const t = M.elements.find(x => x.type === 'turnout'), log = [], open0 = NET.sum.nOpen;
    sel = t.id; recompute(false);
    const Cold = ports(t)[2];
    $('to_R').value = '9'; $('to_n').value = '6'; $('to_apply').click();
    const t2 = elById(t.id), Cnew = ports(t2)[2], nbC = NET.conn.get(t.id + ':2');
    log.push(`R ${f(t2.R, 1)}, 1:${f(t2.n, 0)}, konec odbočky posunut o ${f(Math.hypot(Cnew.x - Cold.x, Cnew.y - Cold.y), 3)} m, odbočka napojena: ${nbC ? 'ano (#' + nbC.e.id + ')' : 'NE'}, volných konců ${open0}→${NET.sum.nOpen}`);
    $('to_R').value = '4'; $('to_apply').click();
    log.push(`R 4 m při min. ${f(S.rMin, 0)}: ${elById(t.id).R === 9 ? 'odmítnuto' : 'PŘIJATO'}`);
    undo(); log.push(`Ctrl+Z: R ${f(elById(t.id).R, 1)}`);
    const tr = elById(t.id), mm = turnoutGeom(tr).C; VW.cx = mm.x; VW.cy = mm.y; VW.sc = 30; drawPlan();
    hint('TEST: ' + log.join(' | '));
    return;
  }
  if (hs === '#selftestctx') {             // test: pravý klik → nabídka → výhybka
    demo();
    const e = M.elements.find(x => x.type === 'track' && Math.abs(x.k) < 1e-9 && x.L >= 4);
    const m0 = segAt(e, 2.5); VW.cx = m0.x; VW.cy = m0.y; VW.sc = 45; drawPlan();
    const m = segAt(e, 2.5), [px, py] = w2s(m.x, m.y), r = cv.getBoundingClientRect(), log = [];
    const ev = (type, o) => cv.dispatchEvent(new MouseEvent(type, Object.assign({clientX: r.left + px, clientY: r.top + py, button: 2, bubbles: true}, o)));
    const nT = () => M.elements.filter(x => x.type === 'turnout').length, n0 = nT();
    ev('mousemove'); ev('mousedown'); ev('mouseup');
    const items = [...$('ctxMenu').querySelectorAll('.cm-item')];
    log.push(`nabídka: ${$('ctxMenu').classList.contains('hidden') ? 'ne' : 'ano'}, položek ${items.length}, aktivních ${items.filter(b => !b.disabled).length}`);
    const it = items.find(b => b.textContent.startsWith('Výhybka P – odbočka ve směru'));
    it.dispatchEvent(new MouseEvent('mouseenter')); log.push(`náhled výhybky: ${preview && preview.turnout ? 'ano' : 'ne'}`);
    it.click();
    log.push(`po kliku: výhybek ${n0}→${nT()}, nabídka ${$('ctxMenu').classList.contains('hidden') ? 'zavřená' : 'otevřená'}, vybráno ${elName(elById(sel))}`);
    hint('TEST: ' + log.join(' | '));
    // nabídku nechat otevřenou pro snímek: znovu na stejné koleji o kus dál
    const m2 = segAt(e, Math.min(e.L - .3, 3.6)), [px2, py2] = w2s(m2.x, m2.y);
    for (const t of ['mousemove', 'mousedown', 'mouseup']) cv.dispatchEvent(new MouseEvent(t, {clientX: r.left + px2, clientY: r.top + py2, button: 2, bubbles: true}));
    return;
  }
  if (hs === '#selftestassist') {          // test: křížení X, odbočka z koleje, napojení výhybkou, Y výhybka
    M = {elements: [], pins: {}, nextId: 1}; sel = null; recompute(false);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = snapStep((x0 + x1) / 2 - 2), cy = snapStep((y0 + y1) / 2 + 10), log = [];
    VW.cx = cx; VW.cy = cy + 4; VW.sc = 22; drawPlan();
    const ev = (type, wx, wy, o = {}) => { const [px, py] = w2s(wx, wy), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent(type, Object.assign({clientX: r.left + px, clientY: r.top + py, button: 0, bubbles: true}, o))); };
    const click = (wx, wy, o) => { ev('mousemove', wx, wy, o); ev('mousedown', wx, wy, o); ev('mouseup', wx, wy, o); };
    const cnt = t => M.elements.filter(e => e.type === t).length;
    // kolej A: přímá na východ (22 m)
    setTool('start'); click(cx - 10, cy + 8); click(cx - 6, cy + 8); click(cx + 12, cy + 8, {ctrlKey: true}); setTool('select');
    // kolej B: přímá na sever přes A → křížení X
    setTool('start'); click(cx - 6, cy + 2); click(cx - 6, cy + 5);
    ev('mousemove', cx - 6, cy + 12, {ctrlKey: true}); log.push(`náhled: ${preview && preview.kind}`);
    click(cx - 6, cy + 12, {ctrlKey: true}); setTool('select');
    const X = M.elements.find(e => e.type === 'cross'), xi = X && NET.crossInfo.get(X.id), xn = X && NET.portNode.get(X.id + ':0');
    log.push(`křížení: ${cnt('cross')}, úhel ${xi ? f(xi.ang, 0) : '?'}°, kolejí v bodě ${xi ? xi.ids.length : 0}, TK ${xn != null ? f(NET.h[xn], 2) : '?'}`);
    // odbočka z koleje A (klik doprostřed západní části, tažení na jih)
    setTool('flex'); click(cx - 8.5, cy + 8); ev('mousemove', cx - 16, cy + 3);
    log.push(`odbočka náhled: ${preview && preview.branch ? 'výhybka ' + (preview.turnout.side > 0 ? 'L' : 'P') + (preview.block ? ' BLOK' : '') : 'ne'}`);
    click(cx - 16, cy + 3); setTool('select');
    log.push(`po odbočce: výhybek ${cnt('turnout')}`);
    // napojení výhybkou: nová kolej ze severu se dotkne východní části A
    setTool('start'); click(cx - 2, cy + 13); click(cx + 1, cy + 13);
    ev('mousemove', cx + 9, cy + 8.05);
    log.push(`dotyk: ${preview && preview.kind}${preview && preview.block ? ' (blok: ' + preview.text + ')' : ''}`);
    click(cx + 9, cy + 8.05); setTool('select');
    log.push(`po napojení: výhybek ${cnt('turnout')}, volných konců ${NET.sum.nOpen}`);
    // Y výhybka na volný konec koleje B (sever)
    setTool('toY'); click(cx - 6, cy + 12); setTool('select');
    log.push(`Y: ${M.elements.filter(e => e.kind === 'Y').length}`);
    const errs = NET.warn.filter(w => w.lvl === 'err').map(w => w.msg);
    log.push(`chyb ${errs.length}${errs.length ? ': ' + errs.slice(0, 3).join(' / ') : ''}`);
    hint('TEST: ' + log.join(' | '));
    return;
  }
  if (hs === '#selftestpin') {             // test: výškové body v profilu + rozchod 3½"
    demo();
    sel = M.elements.find(e => e.type === 'track').id; recompute(false);
    const log = [], rr = pc.getBoundingClientRect();
    const pe = (type, x, y, o = {}) => (type === 'mousemove' || type === 'mouseup' ? window : pc).dispatchEvent(new MouseEvent(type, Object.assign({clientX: rr.left + x, clientY: rr.top + y, button: 0, bubbles: true}, o)));
    const n0 = Object.keys(M.pins).length, i20 = profIdxAt(PG.X(20 - PG.DS));
    const p20 = ROUTE.pts[i20], x20 = PG.X(p20.st - PG.DS), y20 = PG.Y(p20.h - PG.DZ);
    pc.dispatchEvent(new MouseEvent('dblclick', {clientX: rr.left + x20, clientY: rr.top + y20 + 40, bubbles: true}));
    const key = Object.keys(M.pins).find(k => !(k in JSON.parse(undoS[undoS.length - 1]).pins));
    log.push(`dvojklik: bodů ${n0}→${Object.keys(M.pins).length}, editor ${$('profEdit').classList.contains('hidden') ? 'ne' : 'ano'}, TK ${f(M.pins[key].v, 2)}`);
    const tk0 = M.pins[key].v;
    $('profEditVal').value = (tk0 - PG.DZ + .30).toFixed(2);
    $('profEditVal').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    log.push(`zadáno +0,30: TK ${f(M.pins[key].v, 2)} (vypočteno ${f(NET.h[NET.portNode.get(key)], 2)})`);
    const hd = PG.handles.find(h => h.key === key), hx = PG.X(hd.st - PG.DS), hy = PG.Y(hd.h - PG.DZ);
    pe('mousedown', hx, hy); pe('mousemove', hx, hy - 20); pe('mousemove', hx, hy - 40); pe('mouseup', hx, hy - 40);
    log.push(`tažení: TK ${f(M.pins[key].v, 2)}, chyb ${NET.warn.filter(w => w.lvl === 'err').length}`);
    const hd2 = PG.handles.find(h => h.key === key);
    pe('mousedown', PG.X(hd2.st - PG.DS), PG.Y(hd2.h - PG.DZ), {button: 2});
    log.push(`pravý klik: bod ${M.pins[key] ? 'zůstal' : 'zrušen'}`);
    undo(); log.push(`Ctrl+Z: bod ${M.pins[key] ? 'zpět' : 'není'}`);
    $('gauge').value = '3.5'; $('gauge').dispatchEvent(new Event('change'));
    log.push(`3½": G ${S.gauge * 1000} mm, Rmin ${f(S.rMin, 1)}, Rdop ${f(S.rRec, 1)}, R kruhu ${f(circleR(), 1)}, výhybka R ${f(S.toR, 1)}`);
    hint('TEST: ' + log.join(' | '));
    return;
  }
  if (hs === '#selftestcircle') {          // test: kruh, přesun, rozdělení, smazání, přichycení
    M = {elements: [], pins: {}, nextId: 1}; sel = null; recompute(false);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2 - 3, cy = (y0 + y1) / 2 + 12, R = circleR(), log = [`R kruhu ${f(R, 2)} (doporučený ${f(S.rRec, 2)})`];
    const ev = (type, wx, wy, o = {}) => { const [px, py] = w2s(wx, wy), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent(type, Object.assign({clientX: r.left + px, clientY: r.top + py, button: 0, bubbles: true}, o))); };
    const click = (wx, wy, o) => { ev('mousemove', wx, wy, o); ev('mousedown', wx, wy, o); ev('mouseup', wx, wy, o); };
    const dragTo = (ax, ay, bx, by, o) => { ev('mousemove', ax, ay, o); ev('mousedown', ax, ay, o); ev('mousemove', (ax + bx) / 2, (ay + by) / 2, o); ev('mousemove', bx, by, o); ev('mouseup', bx, by, o); };
    const tr = () => M.elements.filter(e => e.type === 'track');
    setTool('circle'); click(cx, cy);
    log.push(`kruh: ${tr().length} prvek, volných ${NET.sum.nOpen}, okruh ${ROUTE && ROUTE.loop}`);
    {  // změna poloměru celého kruhu v panelu – střed zůstane
      const c = tr()[0], ccx = c.x - Math.sin(c.h) / c.k, ccy = c.y + Math.cos(c.h) / c.k;
      $('ed_R').value = '12'; $('ed_apply').click();
      const c2 = tr()[0], ncx = c2.x - Math.sin(c2.h) / c2.k, ncy = c2.y + Math.cos(c2.h) / c2.k;
      log.push(`R→12: ${elName(c2)} R ${f(1 / c2.k, 2)}, střed posunut o ${f(Math.hypot(ncx - ccx, ncy - ccy), 3)} m, volných ${NET.sum.nOpen}`);
      $('ed_R').value = String(R); $('ed_apply').click();
    }
    setTool('select'); dragTo(cx + R, cy, cx + R + 2, cy + 1);                  // posun celého kruhu
    const c0 = tr()[0]; log.push(`posun: začátek ${f(c0.x - (cx + R), 2)}/${f(c0.y - cy, 2)} m`);
    const X = cx + 2, Y = cy + 1;
    setTool('split'); click(X, Y + R); click(X - R, Y);                        // řez na severu a západě
    log.push(`po rozdělení: ${tr().length} prvky, volných ${NET.sum.nOpen}`);
    setTool('del'); click(X, Y - R);                                           // smazat jižní půlku
    log.push(`po smazání: ${tr().length} prvky, volných ${NET.sum.nOpen}`);
    const b = tr().find(e => Math.abs(segAt(e, e.L / 2).x - X) > R * .5);      // severozápadní čtvrtina
    const m = segAt(b, b.L / 2);
    setTool('select'); dragTo(m.x, m.y, m.x - 3, m.y + 2);                     // odtrhnout
    log.push(`odtrženo: volných ${NET.sum.nOpen}`);
    dragTo(m.x - 3, m.y + 2, m.x + .04, m.y - .03);                            // vrátit – přichytí se
    log.push(`přichyceno zpět: volných ${NET.sum.nOpen}`);
    hint('TEST: ' + log.join(' | '));
    return;
  }
  if (hs === '#selftestclick') {           // simulace klikání myší (test ovládání)
    M = {elements: [], pins: {}, nextId: 1}; sel = null; recompute(false);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of PARCEL) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ev = (type, wx, wy, o = {}) => { const [px, py] = w2s(wx, wy), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent(type, Object.assign({clientX: r.left + px, clientY: r.top + py, button: 0, bubbles: true}, o))); };
    const click = (wx, wy, o) => { ev('mousemove', wx, wy, o); ev('mousedown', wx, wy, o); ev('mouseup', wx, wy, o); };
    setTool('start'); click(cx - 4, cy + 4); click(cx - 4, cy + 9);
    click(cx - 4, cy + 10.1); click(cx + 6, cy + 24); click(cx + 14, cy + 22); click(cx + 9, cy + 25, {shiftKey: true});
    setTool('toR'); click(cx - 4, cy + 6.5);
    setTool('split'); click(cx - 4, cy + 4.6);
    setTool('select');
    const cnt = t => M.elements.filter(e => e.type === t).length;
    const tight = M.elements.filter(e => e.type === 'track' && Math.abs(e.k) > 1e-9 && 1 / Math.abs(e.k) < S.rMin - 1e-6).length;
    hint(`TEST: start ${cnt('start')}, kolejí ${cnt('track')}, výhybek ${cnt('turnout')}, volných konců ${NET.sum.nOpen}, chyb ${NET.warn.filter(w => w.lvl === 'err').length}, oblouků pod min. ${tight} (omezení ${S.strictR ? 'zapnuto' : 'vypnuto'})`);
    return;
  }
  if (hs.startsWith('#selftest')) {
    demo();
    const tr = M.elements.find(e => e.type === 'track');
    sel = tr ? tr.id : null; recompute(false);
    if (hs === '#selftest3d') setTab('3d');
    if (hs === '#selftestrel') { $('profMode').value = 'relTK'; S.profMode = 'relTK'; const p = ROUTE.pts[Math.floor(ROUTE.pts.length * .3)]; profHover = ROUTE.pts.indexOf(p); profCursor = {x: p.x, y: p.y}; drawProfile(); drawPlan(); }
    if (hs === '#selftestflex') {
      const stp = M.elements.find(e => e.type === 'turnout'); const g = turnoutGeom(stp);
      setTool('flex'); flexFrom = {x: g.C.x + Math.cos(g.C.th) * 3, y: g.C.y + Math.sin(g.C.th) * 3, a: g.C.th};
      const [px, py] = w2s(flexFrom.x + 3, flexFrom.y + 4); mouse.px = px; mouse.py = py; [mouse.wx, mouse.wy] = [flexFrom.x + 3, flexFrom.y + 4];
      updatePreview(); drawPlan();
    }
  }
}
