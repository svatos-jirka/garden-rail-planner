/* ===================== 0) úvodní okno: projekty, import, nový projekt (stažení dat ČÚZK) =====================
   Běží před aplikací. Vybraný projekt předá jako window.PRJ = {id, name, data} a pak spustí kód aplikace (#appjs).
   Vše je uvnitř funkce, ven jde jen objekt window.ZZ (aby se jména nepletla s aplikací). */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const fm = (v, d = 1) => (v == null || !isFinite(v)) ? '–' : v.toFixed(d).replace('.', ',');
const fmInt = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'projekt';
const FORMAT = 'zahradni-zeleznice-projekt';
const RUIAN = 'https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer';
const TINQ = 'https://ags.cuzk.gov.cz/arcgis2/rest/services/INSPIRE_Nadmorska_vyska_TIN/MapServer/0/query';
const ORTO = 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer/export';
const DRUH = {2: 'orná půda', 3: 'chmelnice', 4: 'vinice', 5: 'zahrada', 6: 'ovocný sad', 7: 'trvalý travní porost',
              10: 'lesní pozemek', 11: 'vodní plocha', 13: 'zastavěná plocha a nádvoří', 14: 'ostatní plocha'};
const lsDesign = id => `zeleznice_${id}_v1`, lsSurvey = id => `mereni_${id}_v1`;
const isTest = location.hash.startsWith('#selftest');

/* --- projekt vestavěný v HTML (sestaveném skriptem relief.py) --- */
let EMB = null;
try {
  const t = $('data').textContent.trim();
  if (t && t[0] === '{') {
    const d = JSON.parse(t), p = d.project || {};
    EMB = {id: p.id || 'embedded', name: p.name || 'Vestavěný projekt', meta: p, data: d};
  }
} catch (e) { console.error(e); }

/* --- IndexedDB: projects = popis, pdata = data terénu (velká) --- */
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('prohlížeč nemá IndexedDB')); return; }
    const tm = setTimeout(() => rej(new Error('úložiště prohlížeče neodpovídá')), 5000);
    let r;
    try { r = indexedDB.open('zahradni_zeleznice', 1); } catch (e) { clearTimeout(tm); rej(e); return; }
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('projects', {keyPath: 'id'}); d.createObjectStore('pdata'); };
    r.onsuccess = () => { clearTimeout(tm); res(r.result); };
    r.onerror = () => { clearTimeout(tm); rej(r.error || new Error('IndexedDB nejde otevřít')); };
    r.onblocked = () => { clearTimeout(tm); rej(new Error('úložiště je zablokované jiným oknem – zavřete ostatní okna aplikace')); };
  });
  return dbP;
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function dbList() { const d = await db(); return req(d.transaction('projects').objectStore('projects').getAll()); }
async function dbData(id) { const d = await db(); return req(d.transaction('pdata').objectStore('pdata').get(id)); }
async function dbPut(meta, data) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(['projects', 'pdata'], 'readwrite');
    t.objectStore('projects').put(meta);
    if (data) t.objectStore('pdata').put(data, meta.id);
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(t.error || new Error('uložení selhalo (plné úložiště?)'));
  });
}
async function dbDel(id) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(['projects', 'pdata'], 'readwrite');
    t.objectStore('projects').delete(id); t.objectStore('pdata').delete(id);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
async function allProjects() {
  let list = [], err = null;
  try { list = await dbList(); } catch (e) { err = e; }
  list.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const out = EMB ? [Object.assign({}, EMB.meta, {id: EMB.id, name: EMB.name, embedded: true})] : [];
  for (const p of list) if (!EMB || p.id !== EMB.id) out.push(p);
  return {list: out, err};
}
async function uniqueId(base) {
  const {list} = await allProjects(), ids = new Set(list.map(p => p.id));
  let id = base, k = 2; while (ids.has(id)) id = `${base}-${k++}`;
  return id;
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const msg = (t, bad) => { const m = $('stMsg'); m.textContent = t || ''; m.className = 'small' + (bad ? ' bad' : ''); };

/* --- seznam projektů --- */
async function renderList() {
  const {list, err} = await allProjects(), box = $('stList'), last = localStorage.getItem('zz_last');
  if (!list.length) {
    box.innerHTML = `<div class="small" style="padding:8px 2px">Zatím žádný projekt – vytvořte nový podle adresy, nebo importujte soubor projektu.</div>`;
  } else {
    box.innerHTML = list.map(p => {
      let des = null, sv = null;
      try { des = JSON.parse(localStorage.getItem(lsDesign(p.id)) || 'null'); sv = JSON.parse(localStorage.getItem(lsSurvey(p.id)) || 'null'); } catch (e) { /* */ }
      const nEl = des && des.M ? des.M.elements.filter(e => e.type === 'track' || e.type === 'turnout').length : 0;
      const nSv = sv && sv.pts ? sv.pts.length : 0;
      const info = [p.ku ? 'k.ú. ' + p.ku : '', p.areaLabel ? 'parc. ' + p.areaLabel : '', p.area ? fmInt(p.area) + ' m²' : '',
                    p.created ? 'vytvořen ' + new Date(p.created).toLocaleDateString('cs-CZ') : '',
                    nEl ? `návrh: ${nEl} prvků` : 'bez návrhu', nSv ? `${nSv} kontr. bodů` : ''].filter(Boolean).join(' · ');
      return `<div class="stItem${p.id === last ? ' last' : ''}" data-id="${esc(p.id)}">
        <div class="nm">${esc(p.name)}${p.embedded ? ' <span class="small">(vestavěný v tomto souboru)</span>' : ''}</div>
        <div class="small">${esc(p.address || '')}${p.address ? ' · ' : ''}${esc(info)}</div>
        <div class="btns"><button data-a="open" class="pri">Otevřít</button><button data-a="exp" title="Celý projekt do jednoho souboru (terén, ortofoto, návrh, kontrolní body)">Uložit do souboru</button>
        ${p.embedded ? '' : '<button data-a="ren">Přejmenovat</button><button data-a="del">Smazat</button>'}</div></div>`;
    }).join('');
  }
  if (err) msg(`Úložiště projektů v prohlížeči není dostupné (${err.message}) – nové projekty si hned uložte do souboru.`, true);
}
async function onListClick(ev) {
  const b = ev.target.closest('button[data-a]'), it = ev.target.closest('.stItem'); if (!b || !it) return;
  const id = it.dataset.id, a = b.dataset.a;
  try {
    if (a === 'open') await openProject(id);
    else if (a === 'exp') await exportProject(id);
    else if (a === 'ren') {
      const p = (await dbList()).find(q => q.id === id), nm = prompt('Nový název projektu:', p.name);
      if (nm && nm.trim()) { p.name = nm.trim(); p.updated = Date.now(); await dbPut(p); renderList(); }
    } else if (a === 'del') {
      const p = (await dbList()).find(q => q.id === id);
      if (!confirm(`Smazat projekt „${p.name}“ včetně návrhu trati a kontrolních bodů?\n(Doporučení: nejdřív „Uložit do souboru“.)`)) return;
      await dbDel(id); localStorage.removeItem(lsDesign(id)); localStorage.removeItem(lsSurvey(id));
      if (localStorage.getItem('zz_last') === id) localStorage.removeItem('zz_last');
      renderList(); msg(`Projekt „${p.name}“ smazán.`);
    }
  } catch (e) { msg('Chyba: ' + e.message, true); console.error(e); }
}

/* --- otevření projektu = spuštění aplikace --- */
async function projectById(id) {
  if (EMB && id === EMB.id) return {id, name: EMB.name, meta: EMB.meta, data: EMB.data};
  const meta = (await dbList()).find(p => p.id === id);
  if (!meta) throw new Error('projekt nenalezen');
  const data = await dbData(id);
  if (!data) throw new Error('chybí data projektu');
  return {id, name: meta.name, meta, data};
}
async function openProject(id) { startApp(await projectById(id)); }
function startApp(prj) {
  if (window.PRJ) return;                                    // aplikace už běží (spouští se jen jednou za načtení stránky)
  const code = $('appjs');
  if (!code) { msg('Stránka není kompletní – chybí kód aplikace.', true); return; }
  try { sessionStorage.setItem('zz_open', prj.id); localStorage.setItem('zz_last', prj.id); } catch (e) { /* */ }
  window.PRJ = {id: prj.id, name: prj.name, data: prj.data};
  $('start').classList.add('hidden');
  document.body.classList.add('appOn');
  const s = document.createElement('script');
  s.textContent = code.textContent;
  document.body.appendChild(s);
}
function backToStart() {
  try { sessionStorage.removeItem('zz_open'); } catch (e) { /* */ }
  location.replace(location.pathname + location.search);
}

/* --- export / import celého projektu --- */
async function projectFile(id) {
  const p = await projectById(id);
  let design = null, survey = null;
  try { design = JSON.parse(localStorage.getItem(lsDesign(id)) || 'null'); survey = JSON.parse(localStorage.getItem(lsSurvey(id)) || 'null'); } catch (e) { /* */ }
  const meta = Object.assign({}, p.meta); delete meta.embedded;
  return {format: FORMAT, version: 1, id, name: p.name, meta, exported: new Date().toISOString(), data: p.data, design, survey};
}
async function exportProject(id) {
  const o = await projectFile(id);
  download(`${slug(o.name)}.garden-rail.json`, JSON.stringify(o), 'application/json');
}
async function importObject(o, ask = true) {
  if (o.format !== FORMAT || !o.data || !o.data.dem) {
    if (o.M && o.M.elements) throw new Error('Soubor obsahuje jen návrh trati bez terénu. Otevřete projekt a v něm dejte Soubory a export → Načíst návrh.');
    throw new Error('Tohle není soubor projektu zahradní železnice.');
  }
  let id = o.id || slug(o.name), name = o.name || 'Projekt';
  const {list} = await allProjects();
  if (list.some(p => p.id === id)) {
    const over = ask ? confirm(`Projekt „${name}“ už v seznamu je.\nOK = přepsat ho (včetně návrhu trati a kontrolních bodů)\nZrušit = uložit jako kopii`) : false;
    if (!over) { id = await uniqueId(id); name += ' (kopie)'; }
  }
  if (!(EMB && id === EMB.id)) {
    const meta = Object.assign({}, o.meta || {}, {id, name, updated: Date.now()});
    meta.created = meta.created || Date.now();
    o.data.project = Object.assign({}, o.data.project || {}, {id, name});
    await dbPut(meta, o.data);
  }
  if (o.design) localStorage.setItem(lsDesign(id), JSON.stringify(o.design)); else localStorage.removeItem(lsDesign(id));
  if (o.survey) localStorage.setItem(lsSurvey(id), JSON.stringify(o.survey)); else localStorage.removeItem(lsSurvey(id));
  return {id, name};
}

/* ===================== průvodce novým projektem ===================== */
async function getJSON(url, params) {
  const r = await fetch(url + '?' + new URLSearchParams(params));
  if (!r.ok) throw new Error(`služba ČÚZK vrátila chybu HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`služba ČÚZK: ${j.error.message || 'chyba'}`);
  return j;
}
const query = (layer, params) => getJSON(`${RUIAN}/${layer}/query`, Object.assign({outSR: 5514, f: 'json'}, params));
const envQ = e => ({geometry: JSON.stringify(e), geometryType: 'esriGeometryEnvelope', inSR: 5514, spatialRel: 'esriSpatialRelIntersects', where: '1=1'});
const blobToURL = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
async function orthoURL(env, w, h) {
  const r = await fetch(ORTO + '?' + new URLSearchParams({bbox: [env.xmin, env.ymin, env.xmax, env.ymax].join(','), bboxSR: 5514, imageSR: 5514,
    size: `${w},${h}`, format: 'jpg', f: 'image'}));
  if (!r.ok) throw new Error(`ortofoto: HTTP ${r.status}`);
  return blobToURL(await r.blob());
}
function pipRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const pipRings = (x, y, rings) => rings.reduce((c, r) => pipRing(x, y, r) ? !c : c, false);
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };
const outerRing = rings => rings.reduce((a, r) => Math.abs(ringArea(r)) > Math.abs(ringArea(a)) ? r : a);
function centroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const k = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k; }
  return Math.abs(a) < 1e-9 ? {x: r[0][0], y: r[0][1]} : {x: cx / (3 * a), y: cy / (3 * a)};
}

let W = null;          // stav průvodce
function wizStep(n) {
  $('stMain').classList.toggle('hidden', n > 0);
  $('stWiz').classList.toggle('hidden', n === 0);
  for (const k of [1, 2, 3]) $('wz' + k).classList.toggle('hidden', k !== n);
}
function newWizard() {
  W = {addr: null, pt: null, half: 70, parcels: [], blds: [], sel: new Set(), img: null, env: null};
  $('wzRes').innerHTML = ''; wizStep(1);
  setTimeout(() => $('wzAddr').focus(), 0);
}

/* krok 1: adresa → adresní místo RÚIAN */
function parseAddr(s) {
  s = String(s || '').replace(/č\.\s*p\.|čp\.?|č\.\s*ev\./gi, ' ');
  let cp = null;
  const m1 = s.match(/(\d{1,4})\s*\/\s*\d{1,4}\s*[a-z]?/i);            // „12/5“ = č.p./č.o.
  if (m1) { cp = +m1[1]; s = s.replace(m1[0], ' '); }
  else {
    const nums = [...s.matchAll(/\b(\d{1,4})\b/g)];
    if (nums.length) { const m = nums[nums.length - 1]; cp = +m[1]; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); }
  }
  s = s.replace(/\b\d{3}\s?\d{2}\b/g, ' ');                              // PSČ pryč
  const words = s.split(/[\s,;]+/).map(w => w.trim()).filter(w => w.length >= 2);
  return {cp, words};
}
async function findAddress(text) {
  const {cp, words} = parseAddr(text);
  if (!cp) throw new Error('Chybí číslo popisné – napište např. „Lhota 12“.');
  if (!words.length) throw new Error('Chybí obec – napište např. „Lhota 12“.');
  const like = words.map(w => `UPPER(adresa) LIKE '%${w.toUpperCase().replace(/'/g, "''")}%'`).join(' AND ');
  let j = await query(1, {where: `cislodomovni=${cp} AND ${like}`, outFields: 'kod,adresa,stavebniobjekt', returnGeometry: true, resultRecordCount: 50});
  let F = j.features || [];
  if (!F.length) {                      // bez diakritiky / jiné psaní: všechna místa s tímto č.p. a filtr tady
    j = await query(1, {where: `cislodomovni=${cp}`, outFields: 'kod,adresa,stavebniobjekt', returnGeometry: true});
    const ws = words.map(norm);
    F = (j.features || []).filter(f => { const a = norm(f.attributes.adresa); return ws.every(w => a.includes(w)); });
  }
  return F.slice(0, 40).map(f => ({kod: f.attributes.kod, adresa: f.attributes.adresa, so: f.attributes.stavebniobjekt, x: f.geometry.x, y: f.geometry.y}));
}
async function onFind() {
  const box = $('wzRes'); box.innerHTML = '<span class="small">Hledám…</span>';
  try {
    const R = await findAddress($('wzAddr').value);
    W.found = R;
    if (!R.length) { box.innerHTML = '<span class="small bad">Adresa nenalezena. Zkontrolujte obec a číslo popisné.</span>'; return R; }
    box.innerHTML = R.map((a, i) => `<button class="wzAddr" data-i="${i}">${esc(a.adresa)}</button>`).join('') +
      (R.length > 1 ? '<div class="small">Vyberte správnou adresu.</div>' : '');
    return R;
  } catch (e) { box.innerHTML = `<span class="small bad">${esc(e.message)}</span>`; throw e; }
}
function defaultName(adresa) {
  const parts = String(adresa).split(',').map(s => s.trim());
  const obec = (parts[parts.length - 1] || '').replace(/^\d{3}\s?\d{2}\s*/, '');
  return parts.length > 1 ? `${obec} ${parts[0]}` : adresa;
}

/* krok 2: parcely a budovy v okolí, výběr klikem */
async function chooseAddress(a) {
  W.addr = a; W.pt = {x: a.x, y: a.y}; W.sel = new Set(); W.parcels = [];
  $('wzAddrSel').textContent = a.adresa;
  $('wzName').value = defaultName(a.adresa);
  wizStep(2);
  await loadArea(true);
}
async function loadArea(first) {
  const rc = $('wzMap').getBoundingClientRect(), ar = rc.width > 50 && rc.height > 50 ? rc.width / rc.height : 1.4;
  const {x, y} = W.pt, h = W.half, env = {xmin: x - h * ar, ymin: y - h, xmax: x + h * ar, ymax: y + h};
  W.env = env; $('wzSel').textContent = 'Načítám parcely a ortofoto…';
  const pw = Math.round(Math.min(1600, h * 2 * ar * 4)), ph = Math.round(pw / ar);
  const [pj, bj, img] = await Promise.all([
    query(5, Object.assign(envQ(env), {outFields: 'id,cisloparcely,druhcislovanikod,druhpozemkukod,vymeraparcely,katastralniuzemi', returnGeometry: true})),
    query(3, Object.assign(envQ(env), {outFields: 'kod,cisladomovni,zastavenaplocha', returnGeometry: true})),
    orthoURL(env, pw, ph).catch(() => null)]);
  W.parcels = (pj.features || []).filter(f => f.geometry && f.geometry.rings).map(f => {
    const a = f.attributes, rings = f.geometry.rings.map(r => r.slice(0, r.length - (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? 1 : 0)));
    return {id: a.id, label: (a.druhcislovanikod === 1 ? 'st. ' : '') + a.cisloparcely, st: a.druhcislovanikod === 1, druh: a.druhpozemkukod,
            vym: a.vymeraparcely, ku: a.katastralniuzemi, rings, area: Math.abs(ringArea(outerRing(rings)))};
  });
  W.blds = (bj.features || []).filter(f => f.geometry && f.geometry.rings).map(f => ({cd: f.attributes.cisladomovni, rings: f.geometry.rings}));
  if (first) for (const p of W.parcels) if (pipRing(x, y, outerRing(p.rings))) W.sel.add(p.id);   // parcela s domem + zahrada, která ho obklopuje
  W.img = null;
  if (img) { const im = new Image(); im.onload = () => { W.img = im; drawMap(); }; im.src = img; }
  drawMap(); selInfo();
}
function mapTf() {
  const cv = $('wzMap'), r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const e = W.env, sc = Math.min(r.width / (e.xmax - e.xmin), r.height / (e.ymax - e.ymin));
  return {cv, dpr, sc, r, X: x => (x - e.xmin) * sc, Y: y => r.height - (y - e.ymin) * sc,
          inv: (px, py) => [e.xmin + px / sc, e.ymin + (r.height - py) / sc]};
}
function drawMap() {
  if (!W || !W.env) return;
  const T = mapTf(), c = T.cv.getContext('2d'), e = W.env;
  c.setTransform(T.dpr, 0, 0, T.dpr, 0, 0);
  c.fillStyle = '#dde3e8'; c.fillRect(0, 0, T.r.width, T.r.height);
  if (W.img) c.drawImage(W.img, T.X(e.xmin), T.Y(e.ymax), (e.xmax - e.xmin) * T.sc, (e.ymax - e.ymin) * T.sc);
  const path = rings => { c.beginPath(); for (const r of rings) r.forEach((p, i) => i ? c.lineTo(T.X(p[0]), T.Y(p[1])) : c.moveTo(T.X(p[0]), T.Y(p[1]))); c.closePath(); };
  for (const p of W.parcels) {
    path(p.rings);
    const on = W.sel.has(p.id), hov = W.hover === p.id;
    if (on || hov) { c.fillStyle = on ? 'rgba(232,89,12,.38)' : 'rgba(255,255,255,.25)'; c.fill('evenodd'); }
    c.strokeStyle = on ? '#ff922b' : 'rgba(255,255,255,.85)'; c.lineWidth = on ? 2.5 : 1; c.stroke();
  }
  c.setLineDash([5, 3]); c.strokeStyle = '#ffd43b'; c.lineWidth = 1.5;
  for (const b of W.blds) { path(b.rings); c.stroke(); }
  c.setLineDash([]);
  c.font = '11px Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const p of W.parcels) {
    if (p.area * T.sc * T.sc < 900 && !W.sel.has(p.id)) continue;
    const ce = centroid(outerRing(p.rings)), x = T.X(ce.x), y = T.Y(ce.y), w = c.measureText(p.label).width;
    c.fillStyle = W.sel.has(p.id) ? 'rgba(255,146,43,.92)' : 'rgba(0,0,0,.55)'; c.fillRect(x - w / 2 - 3, y - 8, w + 6, 15);
    c.fillStyle = '#fff'; c.fillText(p.label, x, y);
  }
  const ax = T.X(W.pt.x), ay = T.Y(W.pt.y);
  c.fillStyle = '#e03131'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(ax, ay, 6, 0, 2 * Math.PI); c.fill(); c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}
function parcelAt(px, py) {
  const T = mapTf(), [x, y] = T.inv(px, py);
  let best = null;
  for (const p of W.parcels) if (pipRings(x, y, p.rings) && (!best || p.area < best.area)) best = p;
  return best;
}
function selInfo() {
  const S = W.parcels.filter(p => W.sel.has(p.id));
  const area = S.reduce((a, p) => a + (p.vym || p.area), 0);
  $('wzSel').innerHTML = S.length ? `Vybráno: <b>${S.map(p => esc(p.label)).join(', ')}</b> – celkem ${fmInt(area)} m²`
    : '<span class="bad">Klikněte na parcely, které patří k pozemku.</span>';
  $('wzBuild').disabled = !S.length;
}
function onMapMove(ev) {
  if (!W || !W.parcels.length) return;
  const r = $('wzMap').getBoundingClientRect(), p = parcelAt(ev.clientX - r.left, ev.clientY - r.top), tip = $('wzTip');
  if ((p && p.id) !== W.hover) { W.hover = p && p.id; drawMap(); }
  if (!p) { tip.classList.add('hidden'); return; }
  tip.classList.remove('hidden');
  tip.innerHTML = `<b>${esc(p.label)}</b> · ${esc(DRUH[p.druh] || 'druh ' + p.druh)} · ${fmInt(p.vym || p.area)} m²<br><span class="small">klik = ${W.sel.has(p.id) ? 'odebrat' : 'přidat'}</span>`;
  tip.style.left = Math.min(r.width - 210, ev.clientX - r.left + 14) + 'px'; tip.style.top = (ev.clientY - r.top + 14) + 'px';
}
function onMapClick(ev) {
  const r = $('wzMap').getBoundingClientRect(), p = parcelAt(ev.clientX - r.left, ev.clientY - r.top);
  if (!p) return;
  if (W.sel.has(p.id)) W.sel.delete(p.id); else W.sel.add(p.id);
  drawMap(); selInfo(); onMapMove(ev);
}

/* ===================== krok 3: stažení dat a výpočet terénu ===================== */
/* Sjednocení parcel: společné hrany se vyruší (katastr má na společné hranici stejné lomové body;
   bod souseda ležící na mé hraně hranu nejdřív rozdělí). Zbude vnější obrys (+ otvory). */
function unionRings(polys) {
  const rings = [];
  for (const P of polys) {
    const big = outerRing(P);
    for (const r of P) { if (r.length < 3) continue; const ccw = ringArea(r) > 0, want = r === big; rings.push(ccw === want ? r.slice() : r.slice().reverse()); }
  }
  const allV = rings.flat();
  const split = r => {                   // vložit cizí lomové body ležící na hranách (T-spoje)
    const out = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      out.push(a);
      if (L2 < 1e-8) continue;
      const mid = [];
      for (const v of allV) {
        const t = ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / L2;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        const ex = a[0] + dx * t - v[0], ey = a[1] + dy * t - v[1];
        if (ex * ex + ey * ey < 4e-6) mid.push([t, v]);
      }
      mid.sort((p, q) => p[0] - q[0]).forEach(m => out.push(m[1]));
    }
    return out;
  };
  const K = p => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000), pts = new Map(), E = new Map();
  for (const r0 of rings) {
    const r = split(r0);
    for (let i = 0; i < r.length; i++) {
      const a = K(r[i]), b = K(r[(i + 1) % r.length]); if (a === b) continue;
      pts.set(a, r[i]);
      const back = b + '|' + a;
      if (E.get(back) > 0) { E.set(back, E.get(back) - 1); if (!E.get(back)) E.delete(back); }
      else E.set(a + '|' + b, (E.get(a + '|' + b) || 0) + 1);
    }
  }
  const next = new Map();
  for (const [k, n] of E) { const [a, b] = k.split('|'); for (let i = 0; i < n; i++) { if (!next.has(a)) next.set(a, []); next.get(a).push(b); } }
  const out = [];
  for (const start of [...next.keys()]) {
    while (next.get(start) && next.get(start).length) {
      const ring = []; let cur = start, guard = 0;
      do { ring.push(pts.get(cur)); const L = next.get(cur); const nx = L.pop(); if (!L.length) next.delete(cur); cur = nx; } while (cur !== start && next.has(cur) && guard++ < 1e6);
      if (ring.length >= 3 && Math.abs(ringArea(ring)) > .01) out.push(ring);
    }
  }
  return out;
}

/* Delaunayova triangulace (Bowyer–Watson s postupem po ose x) → trojúhelníky [i,j,k,…] */
function delaunay(X0, Y0) {
  const n = X0.length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, X0[i]); y0 = Math.min(y0, Y0[i]); x1 = Math.max(x1, X0[i]); y1 = Math.max(y1, Y0[i]); }
  const dm = Math.max(x1 - x0, y1 - y0, 1), xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  const X = new Float64Array(n + 3), Y = new Float64Array(n + 3);
  X.set(X0); Y.set(Y0);
  X[n] = xm - 20 * dm; Y[n] = ym - dm; X[n + 1] = xm; Y[n + 1] = ym + 20 * dm; X[n + 2] = xm + 20 * dm; Y[n + 2] = ym - dm;
  const mk = (a, b, c) => {
    const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return {a, b, c, cx: (ax + bx + cx) / 3, cy: (ay + by + cy) / 3, r2: Infinity};
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    return {a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2};
  };
  const order = Array.from({length: n}, (_, i) => i).sort((p, q) => X[p] - X[q] || Y[p] - Y[q]);
  let open = [mk(n, n + 1, n + 2)];
  const done = [];
  for (const i of order) {
    const x = X[i], y = Y[i], ed = [];
    for (let t = 0; t < open.length; t++) {
      const T = open[t], dx = x - T.cx;
      if (dx > 0 && dx * dx > T.r2) { done.push(T); open[t] = open[open.length - 1]; open.pop(); t--; continue; }
      const dy = y - T.cy;
      if (dx * dx + dy * dy <= T.r2) { ed.push(T.a, T.b, T.b, T.c, T.c, T.a); open[t] = open[open.length - 1]; open.pop(); t--; }
    }
    for (let p = 0; p < ed.length; p += 2) {                 // hrany dutiny = hrany, které jsou jen u jednoho trojúhelníku
      if (ed[p] < 0) continue;
      let dup = false;
      for (let q = p + 2; q < ed.length; q += 2) if (ed[q] >= 0 && ((ed[p] === ed[q] && ed[p + 1] === ed[q + 1]) || (ed[p] === ed[q + 1] && ed[p + 1] === ed[q]))) { ed[q] = ed[q + 1] = -1; dup = true; }
      if (!dup) open.push(mk(ed[p], ed[p + 1], i));
    }
  }
  const tri = [];
  for (const T of done.concat(open)) if (T.a < n && T.b < n && T.c < n) tri.push(T.a, T.b, T.c);
  return tri;
}
/* lineární interpolace z trojúhelníků na mřížku (= TIN, stejně jako v relief.py) */
function rasterTIN(px, py, pz, tri, nx, ny, res) {
  const Z = new Float32Array(nx * ny).fill(NaN);
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    const xa = px[a], ya = py[a], xb = px[b], yb = py[b], xc = px[c], yc = py[c];
    const det = (yb - yc) * (xa - xc) + (xc - xb) * (ya - yc); if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil(Math.min(xa, xb, xc) / res - 1e-9)), i1 = Math.min(nx - 1, Math.floor(Math.max(xa, xb, xc) / res + 1e-9));
    const j0 = Math.max(0, Math.ceil(Math.min(ya, yb, yc) / res - 1e-9)), j1 = Math.min(ny - 1, Math.floor(Math.max(ya, yb, yc) / res + 1e-9));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const o = j * nx + i; if (Z[o] === Z[o]) continue;
      const x = i * res, y = j * res;
      const l1 = ((yb - yc) * (x - xc) + (xc - xb) * (y - yc)) / det, l2 = ((yc - ya) * (x - xc) + (xa - xc) * (y - yc)) / det, l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) Z[o] = l1 * pz[a] + l2 * pz[b] + l3 * pz[c];
    }
  }
  let miss = 0;
  for (let it = 0; it < 400; it++) {                         // díry (mimo konvexní obal) doplnit sousedy
    miss = 0; const Z2 = Z.slice();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = j * nx + i; if (Z[o] === Z[o]) continue;
      let s = 0, k = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && Z[jj * nx + ii] === Z[jj * nx + ii]) { s += Z[jj * nx + ii]; k++; } }
      if (k) Z2[o] = s / k; else miss++;
    }
    Z.set(Z2); if (!miss) break;
  }
  return Z;
}
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
/* stínovaný reliéf (světlo od SZ, převýšení 3×, barvy jako „terrain“) → JPEG */
function reliefURL(Z, nx, ny, res) {
  let lo = Infinity, hi = -Infinity; for (const v of Z) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const vmin = lo - 2, vmax = hi + 1, stops = [[0, .2, .2, .6], [.15, 0, .6, 1], [.25, 0, .8, .4], [.5, 1, 1, .6], [.75, .5, .36, .33], [1, 1, 1, 1]];
  const cmap = t => { t = Math.max(0, Math.min(1, t)); let k = 1; while (k < stops.length - 1 && stops[k][0] < t) k++; const a = stops[k - 1], b = stops[k], u = (t - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(m => a[m + 1] + (b[m + 1] - a[m + 1]) * u); };
  const az = 315 * Math.PI / 180, al = 45 * Math.PI / 180, L = [Math.cos(al) * Math.sin(az), Math.cos(al) * Math.cos(az), Math.sin(al)];
  const cv = document.createElement('canvas'); cv.width = nx; cv.height = ny;
  const c = cv.getContext('2d'), im = c.createImageData(nx, ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const z = k => Z[Math.max(0, Math.min(ny - 1, j + (k === 'n' ? 1 : k === 's' ? -1 : 0))) * nx + Math.max(0, Math.min(nx - 1, i + (k === 'e' ? 1 : k === 'w' ? -1 : 0)))];
    const gx = 3 * (z('e') - z('w')) / (2 * res), gy = 3 * (z('n') - z('s')) / (2 * res), nn = Math.hypot(gx, gy, 1);
    const sh = Math.max(0, (-gx * L[0] - gy * L[1] + L[2]) / nn), col = cmap((Z[j * nx + i] - vmin) / (vmax - vmin));
    const o = ((ny - 1 - j) * nx + i) * 4, k = .35 + .75 * sh;
    im.data[o] = Math.min(255, col[0] * k * 255); im.data[o + 1] = Math.min(255, col[1] * k * 255); im.data[o + 2] = Math.min(255, col[2] * k * 255); im.data[o + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  return cv.toDataURL('image/jpeg', .9);
}

const CONTEXT = 10;           // okolí pozemku v mapě [m]
async function buildProject(log) {
  const sel = W.parcels.filter(p => W.sel.has(p.id));
  if (!sel.length) throw new Error('není vybrána žádná parcela');
  const t0 = performance.now();
  // hranice pozemku
  const rings = unionRings(sel.map(p => p.rings));
  if (!rings.length) throw new Error('hranici pozemku se nepodařilo sestavit');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  let RES = .25, gx0, gy0, nx, ny;
  for (const rr of [.25, .5]) {
    RES = rr; gx0 = Math.floor((x0 - CONTEXT) / RES) * RES; gy0 = Math.floor((y0 - CONTEXT) / RES) * RES;
    nx = Math.round((Math.ceil((x1 + CONTEXT) / RES) * RES - gx0) / RES) + 1; ny = Math.round((Math.ceil((y1 + CONTEXT) / RES) * RES - gy0) / RES) + 1;
    if (nx * ny <= 260000) break;
  }
  if (nx * ny > 260000) throw new Error(`pozemek je na podrobný model moc velký (${fmInt(x1 - x0)} × ${fmInt(y1 - y0)} m) – vyberte menší část`);
  const outer = rings.filter(r => ringArea(r) > 0), areaM2 = rings.reduce((a, r) => a + ringArea(r), 0);
  log(`Hranice: ${sel.map(p => p.label).join(', ')} → ${rings.length} obrys(y), ${fmInt(areaM2)} m². Mřížka ${nx} × ${ny} po ${fm(RES, 2)} m.`);
  // body DMR 5G (INSPIRE TIN = tytéž body jako LAZ DMR 5G)
  const pad = 25, env = {xmin: gx0 - pad, ymin: gy0 - pad, xmax: gx0 + (nx - 1) * RES + pad, ymax: gy0 + (ny - 1) * RES + pad};
  log('Stahuji body DMR 5G…');
  const tj = await getJSON(TINQ, Object.assign(envQ(env), {outFields: 'OID', returnGeometry: true, returnZ: true, outSR: 5514, f: 'json'}));
  const seen = new Set(), PX = [], PY = [], PZ = [];
  for (const f of tj.features || []) for (const p of (f.geometry && f.geometry.points) || []) {
    if (p[0] < env.xmin || p[0] > env.xmax || p[1] < env.ymin || p[1] > env.ymax || !(p[2] > -500)) continue;
    const k = Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100); if (seen.has(k)) continue; seen.add(k);
    PX.push(p[0] - gx0); PY.push(p[1] - gy0); PZ.push(p[2]);
  }
  if (PX.length < 10) throw new Error('v okolí nejsou body DMR 5G (mimo ČR?)');
  let nIn = 0; for (let i = 0; i < PX.length; i++) if (pipRings(PX[i] + gx0, PY[i] + gy0, rings)) nIn++;
  log(`Bodů DMR 5G: ${fmInt(PX.length)} v okolí, ${nIn} v pozemku (1 bod na ${fm(areaM2 / Math.max(1, nIn), 1)} m²). Počítám terén (TIN)…`);
  await new Promise(r => setTimeout(r, 0));
  const tri = delaunay(PX, PY), dem = rasterTIN(PX, PY, PZ, tri, nx, ny, RES);
  // ortofoto a budovy
  log('Stahuji ortofoto a budovy…');
  const ge = {xmin: gx0 - RES / 2, ymin: gy0 - RES / 2, xmax: gx0 + (nx - .5) * RES, ymax: gy0 + (ny - .5) * RES};
  const k = Math.min(2, 4096 / Math.max(nx, ny));
  const [ortho, bj, kj] = await Promise.all([
    orthoURL(ge, Math.round(nx * k), Math.round(ny * k)),
    query(3, Object.assign(envQ(ge), {outFields: 'kod,cisladomovni', returnGeometry: true})),
    query(7, {where: `kod IN (${[...new Set(sel.map(p => p.ku))].join(',')})`, outFields: 'kod,nazev', returnGeometry: false}).catch(() => ({features: []}))]);
  const inOuter = (x, y) => outer.some(r => pipRing(x, y, r));
  let blds = (bj.features || []).filter(f => f.geometry && f.geometry.rings).map(f => outerRing(f.geometry.rings)).filter(r => { const c = centroid(r); return inOuter(c.x, c.y); });
  if (!blds.length) blds = W.parcels.filter(p => p.st).map(p => outerRing(p.rings)).filter(r => { const c = centroid(r); return inOuter(c.x, c.y); });
  const ku = (kj.features || []).map(f => f.attributes.nazev).join(', ');
  // statistika terénu v pozemku
  let hmin = Infinity, hmax = -Infinity, hs = 0, n = 0, ss = 0, smax = 0, gxs = 0, gys = 0;
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    if (!pipRings(gx0 + i * RES, gy0 + j * RES, rings)) continue;
    const z = dem[j * nx + i], gx = (dem[j * nx + i + 1] - dem[j * nx + i - 1]) / (2 * RES), gy = (dem[(j + 1) * nx + i] - dem[(j - 1) * nx + i]) / (2 * RES);
    const s = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI;
    hmin = Math.min(hmin, z); hmax = Math.max(hmax, z); hs += z; ss += s; smax = Math.max(smax, s); gxs += gx; gys += gy; n++;
  }
  const asp = (Math.atan2(-gxs, -gys) * 180 / Math.PI + 360) % 360, dirs = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
  const stats = {h_min: hmin, h_max: hmax, h_mean: hs / n, slope_mean: ss / n, slope_max: smax, spad: dirs[Math.round(asp / 45) % 8], spad_deg: asp};
  log(`Terén v pozemku ${fm(hmin, 2)} – ${fm(hmax, 2)} m n.m. (převýšení ${fm(hmax - hmin, 2)} m), průměrný sklon ${fm(stats.slope_mean, 1)}°, spád k ${stats.spad}. Budov: ${blds.length}.`);
  const loc = r => r.map(([x, y]) => [Math.round((x - gx0) * 1000) / 1000, Math.round((y - gy0) * 1000) / 1000]);
  const name = ($('wzName').value || '').trim() || defaultName(W.addr.adresa);
  const id = await uniqueId(slug(name));
  const big = outerRing(outer.length ? outer : rings);
  const project = {id, name, ku, address: W.addr.adresa, areaLabel: sel.map(p => p.label).join(', '), parcels: sel.map(p => p.label),
                   area: Math.round(areaM2), nPts: PX.length, nPtsArea: nIn, created: Date.now(), res: RES,
                   source: 'ČÚZK: DMR 5G (body INSPIRE TIN), ortofoto, RÚIAN (parcely, stavební objekty)'};
  const data = {res: RES, nx, ny, origin: [gx0, gy0], dem: b64(new Uint8Array(dem.buffer)), ortho, relief: reliefURL(dem, nx, ny, RES),
                parcel: loc(big), rings: rings.map(loc), buildings: blds.map(loc), stats, project};
  log(`Hotovo za ${fm((performance.now() - t0) / 1000, 1)} s. Ukládám projekt…`);
  let saved = true;
  try { await dbPut(Object.assign({}, project, {updated: Date.now()}), data); }
  catch (e) { saved = false; log(`Projekt se nepodařilo uložit v prohlížeči (${e.message}) – po otevření ho uložte do souboru.`, true); }
  return {id, name, meta: project, data, saved, dem};
}
async function onBuild() {
  wizStep(3);
  const box = $('wzLog'); box.innerHTML = ''; $('wzBack3').classList.add('hidden');
  const log = (t, bad) => { const d = document.createElement('div'); d.textContent = t; if (bad) d.className = 'bad'; box.appendChild(d); };
  try {
    const P = await buildProject(log);
    W.built = P;
    if (!isTest) setTimeout(() => startApp(P), 400);
    return P;
  } catch (e) { log('Chyba: ' + e.message, true); $('wzBack3').classList.remove('hidden'); console.error(e); throw e; }
}

/* ===================== start ===================== */
function wire() {
  $('stList').addEventListener('click', onListClick);
  $('stNew').addEventListener('click', newWizard);
  $('stImp').addEventListener('click', () => $('stFile').click());
  $('stFile').addEventListener('change', async ev => {
    const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
    try { msg('Načítám…'); const r = await importObject(JSON.parse(await file.text())); await renderList(); msg(`Projekt „${r.name}“ importován – otevřete ho tlačítkem Otevřít.`); }
    catch (e) { msg('Import: ' + e.message, true); }
  });
  $('wzBack').addEventListener('click', () => { wizStep(0); renderList(); });
  $('wzBack2').addEventListener('click', () => wizStep(1));
  $('wzBack3').addEventListener('click', () => wizStep(2));
  $('wzFind').addEventListener('click', () => onFind().catch(() => {}));
  $('wzAddr').addEventListener('keydown', ev => { if (ev.key === 'Enter') onFind().catch(() => {}); });
  $('wzRes').addEventListener('click', ev => { const b = ev.target.closest('button[data-i]'); if (b) chooseAddress(W.found[+b.dataset.i]).catch(e => { $('wzSel').innerHTML = `<span class="bad">${esc(e.message)}</span>`; }); });
  $('wzMap').addEventListener('mousemove', onMapMove);
  $('wzMap').addEventListener('mouseleave', () => { $('wzTip').classList.add('hidden'); if (W) { W.hover = null; drawMap(); } });
  $('wzMap').addEventListener('click', onMapClick);
  $('wzWider').addEventListener('click', () => { if (W.half < 320) { W.half *= 2; loadArea(false).catch(e => { $('wzSel').innerHTML = `<span class="bad">${esc(e.message)}</span>`; }); } });
  $('wzBuild').addEventListener('click', () => onBuild().catch(() => {}));
  window.addEventListener('resize', () => { if (W && W.env && !$('wz2').classList.contains('hidden')) drawMap(); });
}
window.ZZ = {exportProject, backToStart, importObject, projectFile, renderList};

function boot() {                         // až je načtená celá stránka (kód aplikace #appjs je v HTML za tímto skriptem)
  wire();
  const hs = location.hash;
  if (isTest && hs !== '#selftestnew' && hs !== '#selftestwiz' && hs !== '#selftestimp') {
    if (EMB) startApp({id: EMB.id, name: EMB.name, data: EMB.data});               // testy aplikace: rovnou vestavěný projekt
  } else if (hs === '#selftestnew' || hs === '#selftestwiz' || hs === '#selftestimp') {
    selftest(hs);
  } else {
    let auto = null; try { auto = sessionStorage.getItem('zz_open'); } catch (e) { /* */ }
    renderList();
    if (auto) openProject(auto).catch(() => { try { sessionStorage.removeItem('zz_open'); } catch (e) { /* */ } });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

/* --- testy úvodního okna (síť ČÚZK) --- */
async function selftest(h) {
  const L = [], out = t => {
    L.push(t);
    let el = $('stTest'); if (!el) { el = document.createElement('div'); el.id = 'stTest'; $('start').querySelector('.stBox').prepend(el); }
    el.textContent = 'TEST: ' + L.join(' | ');
  };
  try {
    if (h === '#selftestimp') {
      await renderList();
      const f0 = await projectFile(EMB.id);
      const r1 = await importObject(JSON.parse(JSON.stringify(f0)), false);
      await renderList();
      out(`export vestavěného: ${fmInt(JSON.stringify(f0).length / 1024)} kB, import jako „${r1.name}“ (id ${r1.id}), v seznamu ${document.querySelectorAll('.stItem').length}`);
      const back = await projectById(r1.id);
      out(`data po importu: dem ${back.data.dem === f0.data.dem ? 'shodný ✓' : 'JINÝ'}, nx ${back.data.nx}×${back.data.ny}`);
      return;
    }
    newWizard();
    // testovací adresa: ?addr=… v URL, jinak „search“ vestavěného projektu (lokální private/site.json); v kódu žádná není
    const addr = new URLSearchParams(location.search).get('addr') || (EMB && EMB.meta.search) || '';
    if (!addr) throw new Error('chybí testovací adresa – otevřete stránku s ?addr=obec+č.p., např. ?addr=lhota%2012#selftestnew');
    $('wzAddr').value = addr;
    const R = await onFind();
    out(`hledání „${addr}“: ${R.length} → ${R[0] && R[0].adresa}`);
    await chooseAddress(R[0]);
    const S = W.parcels.filter(p => W.sel.has(p.id)).map(p => p.label);
    out(`parcel v okolí ${W.parcels.length}, budov ${W.blds.length}, předvybráno: ${S.join(', ')}`);
    await new Promise(r => setTimeout(r, 800)); drawMap();
    if (h === '#selftestwiz') { W.hover = (W.parcels.find(p => !W.sel.has(p.id)) || {}).id; drawMap(); return; }
    const P = await onBuild();
    out(`projekt ${P.id}: mřížka ${P.data.nx}×${P.data.ny}, počátek ${P.data.origin.map(v => fm(v, 2)).join(' / ')}, obrysů ${P.data.rings.length}, budov ${P.data.buildings.length}, bodů v pozemku ${P.meta.nPtsArea}, uloženo ${P.saved ? 'ano' : 'NE'}`);
    if (EMB) {                                                  // porovnání s terénem z LAZ (relief.py)
      const E = EMB.data, b = Uint8Array.from(atob(E.dem), c => c.charCodeAt(0)), Z0 = new Float32Array(b.buffer);
      const dx = Math.round((P.data.origin[0] - E.origin[0]) / E.res), dy = Math.round((P.data.origin[1] - E.origin[1]) / E.res);
      let s = 0, s2 = 0, mx = 0, n = 0;
      for (let j = 0; j < P.data.ny; j++) for (let i = 0; i < P.data.nx; i++) {
        const I = i + dx, J = j + dy; if (I < 0 || J < 0 || I >= E.nx || J >= E.ny) continue;
        if (!pipRing(i * P.data.res, j * P.data.res, P.data.parcel)) continue;
        const d = P.dem[j * P.data.nx + i] - Z0[J * E.nx + I]; s += d; s2 += d * d; mx = Math.max(mx, Math.abs(d)); n++;
      }
      out(`proti LAZ (relief.py) v pozemku: posun mřížky ${dx}/${dy}, n ${n}, průměr ${fm(s / n * 1000, 1)} mm, RMS ${fm(Math.sqrt(s2 / n) * 1000, 1)} mm, max ${fm(mx * 1000, 0)} mm`);
    }
    await renderList();
    out(`v seznamu projektů: ${document.querySelectorAll('.stItem').length}`);
    const txt = L.join(' | ');
    startApp(P);
    setTimeout(() => { const el = document.getElementById('hint'); if (el) el.textContent = `TEST: ${txt} | aplikace: ${document.title}, ${document.getElementById('prjSub').textContent}`; }, 2500);
  } catch (e) { out('CHYBA: ' + e.message); console.error(e); }
}
})();
