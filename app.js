/* Gorin — journal des cinq anneaux
 * Tout tourne côté navigateur : données en localStorage, synchro optionnelle
 * vers un fichier JSON d'un dépôt GitHub via l'API Contents.
 */
'use strict';

/* ============================================================
 * 1. Les cinq anneaux et leurs métriques
 * ============================================================ */
const RINGS = [
  {
    id: 'terre', kanji: '地', name: 'Terre', book: 'Chi no maki',
    sub: 'Fondations — sommeil & travail',
    lore: "Le livre de la Terre compare la stratégie au métier de charpentier : des bases solides, un travail régulier.",
    metrics: [
      { k: 'sleep_h', label: 'Sommeil (nuit dernière)', short: 'Sommeil', unit: 'h', type: 'num', step: 0.25, max: 14, target: 8 },
      { k: 'sleep_q', label: 'Qualité du sommeil', short: 'Qualité du sommeil', type: 'scale' },
      { k: 'work_h', label: 'Travail profond', short: 'Travail profond', unit: 'h', type: 'num', step: 0.25, max: 16, target: 6 },
      { k: 'work_focus', label: 'Concentration', short: 'Concentration', type: 'scale' },
    ],
  },
  {
    id: 'eau', kanji: '水', name: 'Eau', book: 'Sui no maki',
    sub: 'Fluidité — lecture & apprentissage',
    lore: "L'eau prend la forme du récipient : apprendre sans relâche, s'adapter à tout.",
    metrics: [
      { k: 'reading_pages', label: 'Lecture', short: 'Lecture', unit: 'pages', type: 'num', step: 1, max: 1000, target: 30 },
      { k: 'learn_min', label: 'Apprentissage / étude', short: 'Étude', unit: 'min', type: 'num', step: 5, max: 600, target: 30 },
    ],
  },
  {
    id: 'feu', kanji: '火', name: 'Feu', book: 'Ka no maki',
    sub: 'Combat — sport & force',
    lore: "Le livre du Feu traite de l'affrontement : intensité, timing, prendre l'initiative.",
    metrics: [
      { k: 'sport_min', label: 'Sport', short: 'Sport', unit: 'min', type: 'num', step: 5, max: 600, target: 45 },
      { k: 'sport_type', label: 'Discipline', short: 'Discipline', type: 'select', noScore: true,
        options: ['', 'Musculation', 'Course', 'Arts martiaux', 'Vélo', 'Natation', 'Mobilité', 'Autre'] },
      { k: 'bench_kg', label: 'Bench — charge', short: 'Bench', unit: 'kg', type: 'num', step: 2.5, max: 400, bench: true },
      { k: 'bench_reps', label: 'Bench — reps', short: 'Reps', unit: 'reps', type: 'num', step: 1, max: 50, noScore: true },
    ],
  },
  {
    id: 'vent', kanji: '風', name: 'Vent', book: 'Fū no maki',
    sub: 'Les autres — socialisation',
    lore: "Le livre du Vent étudie les autres écoles : on se connaît en connaissant les autres.",
    metrics: [
      { k: 'social_h', label: 'Temps social', short: 'Temps social', unit: 'h', type: 'num', step: 0.25, max: 24, target: 2 },
      { k: 'social_q', label: 'Qualité des échanges', short: 'Qualité des échanges', type: 'scale' },
    ],
  },
  {
    id: 'vide', kanji: '空', name: 'Vide', book: 'Kū no maki',
    sub: 'Esprit — clarté, humeur, énergie',
    lore: "Le Vide est l'esprit dégagé de toute confusion, là où la Voie devient naturelle.",
    metrics: [
      { k: 'meditation_min', label: 'Méditation', short: 'Méditation', unit: 'min', type: 'num', step: 1, max: 300, target: 10 },
      { k: 'mood', label: 'Humeur', short: 'Humeur', type: 'scale' },
      { k: 'energy', label: 'Énergie', short: 'Énergie', type: 'scale' },
    ],
  },
];
const RING_BY_ID = Object.fromEntries(RINGS.map(r => [r.id, r]));
let FIELDS = RINGS.flatMap(r => r.metrics.map(m => ({ ...m, ring: r.id })));
let FIELD_BY_K = Object.fromEntries(FIELDS.map(f => [f.k, f]));
// Métrique virtuelle : 1RM estimé
FIELD_BY_K.bench_e1rm = { k: 'bench_e1rm', short: '1RM estimé (bench)', label: '1RM estimé (bench)', unit: 'kg', ring: 'feu', type: 'num' };

const MAXIMS = [
  'Ne nourris pas de pensées tortueuses.',
  'La Voie se trouve dans la pratique.',
  'Touche à tous les arts.',
  'Apprends la Voie de tous les métiers.',
  'Distingue le gain de la perte en toute chose.',
  'Développe un jugement intuitif.',
  'Perçois ce qui ne se voit pas.',
  'Prête attention même aux petites choses.',
  'Ne fais rien d’inutile.',
];

/* ============================================================
 * 2. Utilitaires
 * ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isNum = v => typeof v === 'number' && isFinite(v);
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ringColor = id => `var(--${id})`;

const isoOf = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayISO = () => isoOf(new Date());
const parseISO = s => new Date(s + 'T12:00:00');
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoOf(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const dow = s => (parseISO(s).getDay() + 6) % 7; // 0 = lundi
const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const fmtDay = (s, opts = { day: 'numeric', month: 'short' }) => parseISO(s).toLocaleDateString('fr-FR', opts);
const fmtLong = s => parseISO(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const nf = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + nf(Math.abs(v), d);

function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Stockage local indisponible'); } }

/* ============================================================
 * 3. État
 * ============================================================ */
const LS_E = 'gorin.entries.v1', LS_S = 'gorin.settings.v1';
let entries = lsGet(LS_E, {});
let settings = Object.assign(
  { targets: {}, autoSync: true, lastSync: null, period: 30,
    gh: { owner: '', repo: '', branch: 'main', path: 'gorin/journal.json', token: '' } },
  lsGet(LS_S, {}));
settings.gh = Object.assign({ owner: '', repo: '', branch: 'main', path: 'gorin/journal.json', token: '' }, settings.gh);

const saveEntries = () => { lsSet(LS_E, entries); _scores = null; };
const saveSettings = () => lsSet(LS_S, settings);
const target = k => isNum(settings.targets[k]) ? settings.targets[k] : FIELD_BY_K[k]?.target;
const live = () => Object.keys(entries).filter(d => !entries[d].deleted).sort();
const get = d => (entries[d] && !entries[d].deleted) ? entries[d] : null;

/* ============================================================
 * 4. Scores
 * ============================================================ */
function e1rm(e) {
  if (!e || !isNum(e.bench_kg) || e.bench_kg <= 0) return null;
  const r = isNum(e.bench_reps) && e.bench_reps > 0 ? e.bench_reps : 1;
  return r === 1 ? e.bench_kg : e.bench_kg * (1 + r / 30); // Epley
}
function fieldVal(e, k) { if (!e) return null; if (k === 'bench_e1rm') return e1rm(e); const v = e[k]; return isNum(v) ? v : null; }

function metricScore(m, e, best) {
  if (m.noScore) return null;
  if (m.bench) { const x = e1rm(e); return x && best ? x / best : null; }
  const v = e[m.k]; if (!isNum(v)) return null;
  if (m.type === 'check') return v ? 1 : 0;
  if (m.type === 'scale') return (v - 1) / 4;
  const t = target(m.k); return t > 0 ? Math.min(1, v / t) : null;
}
function scoreEntry(e, best, date) {
  const s = {}, hs = date ? habitsOn(date) : [];
  for (const r of RINGS) {
    const vals = r.metrics.map(m => metricScore(m, e, best)).filter(isNum);
    for (const h of hs) if (h.ring === r.id) vals.push(Math.min(1, (e.done && e.done[h.id]) || 0));
    s[r.id] = vals.length ? Math.round(mean(vals) * 100) : null;
  }
  // global : les anneaux absents comptent pour 0 — on récompense l'équilibre
  s.overall = Math.round(RINGS.reduce((a, r) => a + (s[r.id] || 0), 0) / RINGS.length);
  return s;
}
let _scores = null;
function scores() {
  if (_scores) return _scores;
  const out = {}; let best = 0;
  for (const d of live()) {
    const e = entries[d]; const x = e1rm(e); if (x) best = Math.max(best, x);
    out[d] = scoreEntry(e, best, d);
  }
  return (_scores = out);
}
function bestE1rmBefore(date) {
  let b = 0; for (const d of live()) { if (d > date) break; const x = e1rm(entries[d]); if (x) b = Math.max(b, x); } return b;
}

/* ============================================================
 * 5. Routage
 * ============================================================ */
const VIEWS = ['saisie', 'objectifs', 'rituels', 'voie', 'insights', 'journal', 'reglages'];
let editDate = todayISO();
function route() {
  let [v, arg] = (location.hash.slice(1) || 'saisie').split('/');
  if (!VIEWS.includes(v)) v = 'saisie';
  if (v === 'saisie' && arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) editDate = arg;
  VIEWS.forEach(x => { $('#view-' + x).hidden = x !== v; });
  $$('.tabs a').forEach(a => { if (a.dataset.tab === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  ({ saisie: renderSaisie, objectifs: renderObjectifs, rituels: renderRituels, voie: renderVoie, insights: renderInsights, journal: renderJournal, reglages: renderReglages })[v]();
  window.scrollTo({ top: 0 });
}

/* ============================================================
 * 6. Ensō (anneau de progression)
 * ============================================================ */
function ensoSVG(ring, score, size = 120) {
  const R = 44, C = 2 * Math.PI * R, p = score == null ? 0 : clamp(score, 0, 100) / 100;
  return `<svg viewBox="0 0 120 120" width="${size}" role="img" aria-label="${ring.name} ${score ?? 'non renseigné'}">
    <circle class="track" cx="60" cy="60" r="${R}" fill="none" stroke-width="9"/>
    <circle class="arc" cx="60" cy="60" r="${R}" fill="none" stroke="${ringColor(ring.id)}" stroke-width="10"
      stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-100 60 60)"
      ${score == null ? 'opacity="0"' : ''}/>
    <text class="k" x="60" y="61" text-anchor="middle" dominant-baseline="central" font-size="34">${ring.kanji}</text>
  </svg>`;
}
function ensoRow(sc) {
  return `<div class="enso-row">${RINGS.map(r => `
    <div class="enso" data-ring="${r.id}">${ensoSVG(r, sc?.[r.id])}
      <div class="enso-name">${r.name}</div>
      <div class="enso-score">${sc?.[r.id] == null ? '—' : sc[r.id] + '<small> / 100</small>'}</div>
    </div>`).join('')}</div>`;
}

/* ============================================================
 * 7. Vue : saisie
 * ============================================================ */
let draft = {};
function renderSaisie() {
  const el = $('#view-saisie');
  const existing = get(editDate);
  draft = existing ? { ...existing } : {};
  const isToday = editDate === todayISO();
  const pIdx = isNum(draft.principle) ? draft.principle : principleIdx(editDate), pr = PRINCIPLES[pIdx];
  const qIdx = promptIdx(editDate);

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1>${isToday ? "Aujourd'hui" : esc(fmtDay(editDate, { weekday: 'long', day: 'numeric', month: 'long' }))}</h1>
        <p>${esc(fmtLong(editDate))}${existing ? ' · déjà consigné' : ''}</p>
      </div>
      <div class="day-nav">
        <button class="btn icon-btn" id="prevDay" aria-label="Jour précédent">‹</button>
        <input type="date" id="dayPick" value="${editDate}" max="${todayISO()}">
        <button class="btn icon-btn" id="nextDay" aria-label="Jour suivant" ${isToday ? 'disabled' : ''}>›</button>
      </div>
    </div>

    ${todayTopHTML(editDate)}

    <div class="card hero">
      <div class="hero-top">
        <h2>Le gorintō du jour</h2>
        <div class="total">équilibre <b id="totalScore">—</b> / 100</div>
      </div>
      <div class="hero-grid">
        <div class="gorinto" id="heroRings">${gorintoSVG(null, 'gday')}</div>
        <div class="principle">
          <div class="pr-head"><span class="pr-k">${pr.k}</span>
            <div><div class="pr-n">Principe ${pIdx + 1} / 9 · livre de la Terre</div><h3>${esc(pr.t)}</h3><div class="pr-jp">${pr.jp}</div></div></div>
          <p>${esc(pr.d)}</p>
          <p class="pr-q">${esc(pr.q)}</p>
          <div class="f-lbl">As-tu honoré ce principe aujourd'hui ? <em>1–5</em></div>
          <div class="scale" data-k="principle_s" style="--ring:var(--shu)">${[1, 2, 3, 4, 5].map(v => `<button type="button" data-v="${v}" aria-label="Principe ${v}">${v}</button>`).join('')}</div>
        </div>
      </div>
    </div>

    <form id="entryForm" autocomplete="off">
      <div class="ring-cards">
        ${RINGS.map(r => `
          <section class="card ring-card" style="--ring:${ringColor(r.id)}">
            <header>
              <span class="kanji">${r.kanji}</span>
              <div><h3>${r.name} <small style="font-family:var(--sans);font-weight:400;font-size:12px;color:var(--ink-3)">· ${r.book}</small></h3><p>${esc(r.sub)}</p></div>
              <span class="mini" data-mini="${r.id}"><b>—</b></span>
            </header>
            <p class="teach">${esc(MUSASHI[r.id].teach)}</p>
            ${ritualsBlockHTML(r.id, editDate)}
            <div class="fields">${r.metrics.map(fieldHTML).join('')}
              ${r.id === 'feu' ? '<div class="e1rm" id="e1rmLine"></div>' : ''}
              <label class="f full refl"><span>${esc(MUSASHI[r.id].prompts[qIdx])} <em>réflexion</em></span>
                <input type="text" name="refl_${r.id}" maxlength="280" placeholder="Une ligne suffit…"></label>
            </div>
          </section>`).join('')}
      </div>
      <div class="card note-card">
        <label class="f"><span>Note du jour <em>réflexion, victoire, leçon</em></span>
          <textarea name="note" placeholder="Ce que la journée m'a appris…">${esc(draft.note || '')}</textarea></label>
      </div>
    </form>

    <div class="savebar">
      <span class="state" id="saveState">${existing ? 'Déjà consigné · aucune modification' : 'Nouvelle journée'}</span>
      ${existing ? '<button class="btn ghost danger" id="delBtn" type="button">Supprimer</button>' : ''}
      <button class="btn primary" id="saveBtn" type="button">Enregistrer</button>
    </div>`;

  // remplir les valeurs
  for (const f of FIELDS) {
    if (f.type === 'scale' || f.type === 'check') paintScale(f.k);
    else { const inp = el.querySelector(`[name="${f.k}"]`); if (inp && draft[f.k] != null) inp.value = draft[f.k]; }
  }
  paintScale('principle_s');
  RINGS.forEach(r => { const inp = el.querySelector(`[name="refl_${r.id}"]`); if (inp && draft['refl_' + r.id]) inp.value = draft['refl_' + r.id]; });

  el.querySelector('#prevDay').onclick = () => goDay(addDays(editDate, -1));
  el.querySelector('#nextDay').onclick = () => goDay(addDays(editDate, 1));
  el.querySelector('#dayPick').onchange = e => e.target.value && goDay(e.target.value);
  el.querySelector('#entryForm').addEventListener('input', onFormInput);
  el.querySelectorAll('.scale').forEach(s => s.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = s.dataset.k, v = +b.dataset.v;
    draft[k] = draft[k] === v ? null : v; paintScale(k); markDirty(); updateLive();
  }));
  el.querySelector('#saveBtn').onclick = saveDay;
  const del = el.querySelector('#delBtn');
  if (del) del.onclick = () => {
    if (!confirm(`Supprimer la journée du ${fmtLong(editDate)} ?`)) return;
    entries[editDate] = { deleted: true, updatedAt: Date.now() }; saveEntries(); toast('Journée supprimée');
    autoSync(); renderSaisie();
  };
  bindToday(el);
  updateLive();
}
function fieldHTML(m) {
  const L = esc(m.label);
  if (m.type === 'scale') {
    return `<div class="f"><div class="f-lbl">${L} <em>1–5</em></div>
      <div class="scale" data-k="${m.k}">${[1, 2, 3, 4, 5].map(v => `<button type="button" data-v="${v}" aria-label="${L} ${v}">${v}</button>`).join('')}</div></div>`;
  }
  if (m.type === 'check') {
    return `<div class="f"><div class="f-lbl">${L} <em>oui / non</em></div>
      <div class="scale two" data-k="${m.k}"><button type="button" data-v="0">Non</button><button type="button" data-v="1">Oui</button></div></div>`;
  }
  if (m.type === 'select') {
    return `<label class="f"><span>${L}</span><select name="${m.k}">${(m.options || ['']).map(o => `<option value="${esc(o)}" ${draft[m.k] === o ? 'selected' : ''}>${esc(o) || '—'}</option>`).join('')}</select></label>`;
  }
  if (m.type === 'text') return `<label class="f full"><span>${L}</span><input type="text" name="${m.k}" maxlength="200" placeholder="—"></label>`;
  const tv = target(m.k), t = isNum(tv) && !m.bench && !m.noScore ? `objectif ${nf(tv)} ${m.unit || ''}` : (m.unit || '');
  return `<label class="f"><span>${L} <em>${esc(t.trim())}</em></span>
    <input type="number" name="${m.k}" inputmode="decimal" min="0" max="${m.max || 100000}" step="${m.step || 'any'}" placeholder="—"></label>`;
}
function paintScale(k) {
  const s = $(`.scale[data-k="${k}"]`); if (!s) return; const v = draft[k];
  s.querySelectorAll('button').forEach(b => { const x = +b.dataset.v; b.classList.toggle('on', x === v); b.classList.toggle('in', v != null && x < v && !s.classList.contains('two')); b.setAttribute('aria-pressed', x === v); });
}
function onFormInput(e) {
  const t = e.target; if (!t.name) return;
  const ff = FIELD_BY_K[t.name];
  if (t.name === 'note' || t.name.startsWith('refl_') || (ff && (ff.type === 'select' || ff.type === 'text'))) draft[t.name] = t.value || null;
  else { const v = t.value === '' ? null : parseFloat(t.value.replace(',', '.')); draft[t.name] = isNum(v) ? v : null; }
  markDirty(); updateLive();
}
function markDirty() { const s = $('#saveState'); if (s) s.textContent = 'Modifications non enregistrées'; }
function updateLive() {
  const best = Math.max(bestE1rmBefore(addDays(editDate, -1)), e1rm(draft) || 0);
  const sc = scoreEntry(draft, best, editDate);
  updateGorinto($('#heroRings'), sc);
  $('#totalScore').textContent = Object.values(draft).some(v => v != null && v !== '') ? sc.overall : '—';
  RINGS.forEach(r => { const m = $(`[data-mini="${r.id}"]`); if (m) m.innerHTML = `<b>${sc[r.id] ?? '—'}</b>`; });
  const line = $('#e1rmLine'); const x = e1rm(draft);
  if (line) {
    const prev = bestE1rmBefore(addDays(editDate, -1));
    line.innerHTML = x ? `1RM estimé <b>${nf(x)} kg</b>${prev ? (x > prev ? ' · nouveau record 🔥' : ` · record ${nf(prev)} kg`) : ''}` : (prev ? `Record actuel : ${nf(prev)} kg (1RM estimé)` : '');
  }
}
function saveDay() {
  const clean = {}, ex = get(editDate) || {};
  const own = ['note', 'updatedAt', 'demo', 'deleted', 'principle', 'principle_s', 'done', 'todos', 'intention', 'intention_done'];
  for (const k in ex) if (!FIELD_BY_K[k] && !own.includes(k) && !k.startsWith('refl_')) clean[k] = ex[k];   // métriques retirées : on garde l'historique
  for (const k of ['done', 'todos', 'intention', 'intention_done']) if (draft[k] != null) clean[k] = draft[k];
  for (const f of FIELDS) { const v = draft[f.k]; if (v != null && v !== '') clean[f.k] = v; }
  if (draft.note && draft.note.trim()) clean.note = draft.note.trim();
  if (isNum(draft.principle_s)) { clean.principle_s = draft.principle_s; clean.principle = isNum(draft.principle) ? draft.principle : principleIdx(editDate); }
  for (const r of RINGS) { const v = draft['refl_' + r.id]; if (v && v.trim()) clean['refl_' + r.id] = v.trim(); }
  if (!Object.keys(clean).length) { toast('Rien à enregistrer pour ce jour'); return; }
  clean.updatedAt = Date.now();
  entries[editDate] = clean; saveEntries();
  toast(`Journée enregistrée · équilibre ${scores()[editDate].overall}/100`);
  $('#saveState').textContent = 'Enregistré'; autoSync();
  if (!$('#delBtn')) renderSaisie();
}
function goDay(d) { if (d > todayISO()) return; location.hash = 'saisie/' + d; }

/* ============================================================
 * 8. Graphiques SVG
 * ============================================================ */
const chartData = new WeakMap();
function lineChart(el, { labels, series, yMin = 0, yMax = null, h = 230, unit = '', fmt = v => nf(v) }) {
  const W = Math.max(300, Math.round(el.clientWidth || 680)), H = h, pl = 38, pr = 10, pt = 10, pb = 26;
  const all = series.flatMap(s => s.values.filter(isNum));
  const mx = all.length ? Math.max(...all) : 1, mn = all.length ? Math.min(...all) : 0;
  if (yMin === 'auto' || yMax == null) {
    const lo = yMin === 'auto' ? mn : yMin, step = niceMax(Math.max(mx - lo, 1) / 4);
    if (yMin === 'auto') yMin = Math.max(0, Math.floor(lo / step) * step);
    if (yMax == null) yMax = Math.ceil(mx * 1.02 / step) * step;
  }
  if (yMax <= yMin) yMax = yMin + 1;
  const n = labels.length;
  const X = i => pl + (n <= 1 ? 0.5 : i / (n - 1)) * (W - pl - pr);
  const Y = v => pt + (1 - (v - yMin) / (yMax - yMin)) * (H - pt - pb);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * i / 4, y = Y(v);
    g += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" ${i ? 'stroke-dasharray="2 4"' : ''}/><text class="ax" x="${pl - 6}" y="${y + 3.5}" text-anchor="end">${nf(v, v < 10 ? 1 : 0)}</text>`;
  }
  const ticks = Math.min(W < 460 ? 4 : 6, n);
  for (let t = 0; t < ticks; t++) {
    const i = ticks === 1 ? 0 : Math.round(t * (n - 1) / (ticks - 1));
    g += `<text class="ax" x="${X(i)}" y="${H - 6}" text-anchor="${t === 0 ? 'start' : t === ticks - 1 ? 'end' : 'middle'}">${esc(fmtDay(labels[i]))}</text>`;
  }
  let paths = '';
  for (const s of series) {
    if (s.hidden) continue;
    if (s.dots) paths += s.values.map((v, i) => isNum(v) ? `<circle cx="${X(i)}" cy="${Y(v)}" r="${n > 60 ? 2 : 3}" fill="${s.color}" opacity="${s.line === false ? .9 : .28}"/>` : '').join('');
    if (s.line !== false) {
      let d = '', pen = false;
      s.values.forEach((v, i) => { if (isNum(v)) { d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; } else if (!s.bridge) pen = false; });
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
    }
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${g}${paths}<line class="cursor" x1="0" x2="0" y1="${pt}" y2="${H - pb}" stroke="var(--ink-3)" stroke-dasharray="3 3" opacity="0"/></svg>`;
  chartData.set(el, { labels, series, X, W, pl, pr, fmt, unit });
  if (!el._hover) {
    el._hover = true;
    el.addEventListener('pointermove', chartHover); el.addEventListener('pointerleave', () => { $('#tip').hidden = true; const c = el.querySelector('.cursor'); if (c) c.setAttribute('opacity', 0); });
  }
}
function chartHover(ev) {
  const el = ev.currentTarget, cd = chartData.get(el); if (!cd) return;
  const svg = el.querySelector('svg'), rect = svg.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / rect.width * cd.W;
  const n = cd.labels.length, i = clamp(Math.round((x - cd.pl) / (cd.W - cd.pl - cd.pr) * (n - 1)), 0, n - 1);
  const rows = cd.series.filter(s => !s.hidden && isNum(s.values[i]) && !s.noTip).map(s => `<div><i style="background:${s.color}"></i>${esc(s.name)} <b>${cd.fmt(s.values[i])}${cd.unit ? ' ' + cd.unit : ''}</b></div>`);
  const tip = $('#tip');
  if (!rows.length) { tip.hidden = true; return; }
  tip.innerHTML = `<div style="opacity:.7;margin-bottom:3px">${esc(fmtDay(cd.labels[i], { weekday: 'short', day: 'numeric', month: 'short' }))}</div>${rows.join('')}`;
  tip.hidden = false;
  const tw = tip.offsetWidth, px = ev.clientX + 14 + tw > innerWidth ? ev.clientX - tw - 14 : ev.clientX + 14;
  tip.style.left = px + 'px'; tip.style.top = (ev.clientY - 10) + 'px';
  const c = el.querySelector('.cursor'); c.setAttribute('x1', cd.X(i)); c.setAttribute('x2', cd.X(i)); c.setAttribute('opacity', .6);
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
function rolling(vals, w = 7, pre = []) {
  const all = [...pre, ...vals], o = pre.length;
  return vals.map((_, i) => { const j = i + o, win = all.slice(Math.max(0, j - w + 1), j + 1).filter(isNum); return win.length >= 2 ? mean(win) : null; });
}

function radarSVG(cur, prev) {
  const cx = 170, cy = 165, R = 118, N = 5;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  let g = '';
  [.25, .5, .75, 1].forEach(l => { g += `<polygon points="${RINGS.map((_, i) => pt(i, l).join(',')).join(' ')}" fill="none" stroke="var(--line)" ${l < 1 ? 'stroke-dasharray="2 4"' : ''}/>`; });
  RINGS.forEach((r, i) => {
    const [x, y] = pt(i, 1); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)"/>`;
    const [lx, ly] = pt(i, 1.2);
    g += `<text class="lbl" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central"><tspan fill="${ringColor(r.id)}">${r.kanji}</tspan> ${r.name}</text>`;
    g += `<text class="num" x="${lx}" y="${ly + 15}" text-anchor="middle">${cur[i] == null ? '—' : cur[i]}</text>`;
  });
  const poly = (vals, attrs) => `<polygon points="${vals.map((v, i) => pt(i, (v || 0) / 100).join(',')).join(' ')}" ${attrs}/>`;
  if (prev && prev.some(isNum)) g += poly(prev, 'fill="none" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="4 4"');
  g += poly(cur, 'fill="color-mix(in srgb, var(--shu) 16%, transparent)" stroke="var(--shu)" stroke-width="2.2" stroke-linejoin="round" filter="url(#ink)"');
  cur.forEach((v, i) => { if (isNum(v)) { const [x, y] = pt(i, v / 100); g += `<circle cx="${x}" cy="${y}" r="4" fill="${ringColor(RINGS[i].id)}" stroke="var(--paper)" stroke-width="2"/>`; } });
  return `<svg viewBox="0 0 340 340" role="img" aria-label="Radar des cinq anneaux">${g}</svg>`;
}

function heatmapSVG(weeks = 26) {
  const sc = scores(), end = todayISO();
  const start = addDays(end, -(weeks * 7 - 1) - dow(addDays(end, -(weeks * 7 - 1))));
  const cs = 13, gap = 3, left = 28, top = 18;
  const cols = Math.ceil((daysBetween(start, end) + 1) / 7);
  let g = '', lastMonth = -1;
  for (let i = 0; i <= daysBetween(start, end); i++) {
    const d = addDays(start, i), c = Math.floor(i / 7), r = dow(d);
    const v = sc[d]?.overall;
    const x = left + c * (cs + gap), y = top + r * (cs + gap);
    const fill = v == null ? 'var(--line)' : `color-mix(in srgb, var(--shu) ${Math.round(15 + v * .85)}%, var(--paper))`;
    g += `<rect x="${x}" y="${y}" width="${cs}" height="${cs}" rx="3" fill="${fill}"><title>${fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })} — ${v == null ? 'non consigné' : 'équilibre ' + v}</title></rect>`;
    const m = parseISO(d).getMonth();
    if (r === 0 && m !== lastMonth) { g += `<text class="dl" x="${x}" y="11">${parseISO(d).toLocaleDateString('fr-FR', { month: 'short' })}</text>`; lastMonth = m; }
  }
  [0, 2, 4, 6].forEach(r => { g += `<text class="dl" x="0" y="${top + r * (cs + gap) + 10}">${DOW[r]}</text>`; });
  const W = left + cols * (cs + gap), H = top + 7 * (cs + gap);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
}

/* ============================================================
 * 9. Statistiques
 * ============================================================ */
function rangeDates(n) { const end = todayISO(); const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i)); return out; }
function periodDates(p) {
  if (p === 'all') { const l = live(); if (!l.length) return [todayISO()]; return rangeDates(daysBetween(l[0], todayISO()) + 1); }
  return rangeDates(p);
}
function prevDates(dates) { const n = dates.length; return dates.map(d => addDays(d, -n)); }
function avgField(dates, k) { return mean(dates.map(d => fieldVal(get(d), k)).filter(isNum)); }
function avgRing(dates, id) { const sc = scores(); return mean(dates.map(d => sc[d]?.[id]).filter(isNum)); }
function avgOverall(dates) { const sc = scores(); return mean(dates.filter(d => sc[d]).map(d => sc[d].overall)); }
function slopePerWeek(dates, getter) {
  const pts = dates.map((d, i) => [i, getter(d)]).filter(p => isNum(p[1]));
  if (pts.length < 5) return null;
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  let num = 0, den = 0; for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den ? num / den * 7 : null;
}
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = mean(xs), my = mean(ys); let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; a += dx * dy; b += dx * dx; c += dy * dy; }
  return b && c ? a / Math.sqrt(b * c) : null;
}
function streak() {
  let d = todayISO(); if (!get(d)) d = addDays(d, -1);
  let n = 0; while (get(d)) { n++; d = addDays(d, -1); } return n;
}
function longestStreak() {
  const l = live(); let best = 0, cur = 0, prev = null;
  for (const d of l) { cur = prev && daysBetween(prev, d) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d; } return best;
}

const PAIRS = [
  ['sleep_h', 'mood', 0], ['sleep_h', 'energy', 0], ['sleep_h', 'work_focus', 0], ['sleep_h', 'work_h', 0],
  ['sleep_q', 'mood', 0], ['sleep_h', 'bench_e1rm', 0], ['sport_min', 'energy', 0], ['sport_min', 'mood', 0],
  ['sport_min', 'sleep_q', 1], ['social_h', 'mood', 0], ['social_q', 'mood', 0], ['meditation_min', 'work_focus', 0],
  ['meditation_min', 'mood', 0], ['reading_pages', 'sleep_q', 1], ['work_h', 'mood', 0], ['work_h', 'social_h', 0],
  ['energy', 'work_h', 0], ['learn_min', 'work_focus', 0],
];
function correlations(dates) {
  const out = [];
  for (const [a, b, lag] of PAIRS) {
    if (!FIELD_BY_K[a] || !FIELD_BY_K[b]) continue;
    const xs = [], ys = [];
    for (const d of dates) {
      const x = fieldVal(get(d), a), y = fieldVal(get(addDays(d, lag)), b);
      if (isNum(x) && isNum(y)) { xs.push(x); ys.push(y); }
    }
    if (xs.length < 8) continue;
    const r = pearson(xs, ys); if (r == null) continue;
    out.push({ a, b, lag, r, n: xs.length });
  }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
}
function corrSentence({ a, b, lag, r }) {
  const A = FIELD_BY_K[a].short.toLowerCase(), B = FIELD_BY_K[b].short.toLowerCase();
  const when = lag ? `le lendemain` : `le même jour`;
  const strength = Math.abs(r) >= .5 ? 'nettement' : Math.abs(r) >= .3 ? '' : 'légèrement';
  const de = w => /^[aeiouyéèêh]/i.test(w) ? `d'${w}` : `de ${w}`;
  return `Plus ${de(A)} va avec ${strength ? strength + ' ' : ''}${r > 0 ? 'plus' : 'moins'} ${de(B)} ${when}.`;
}

/* ============================================================
 * 10. Vue : insights
 * ============================================================ */
let hiddenSeries = new Set();
let explorerKey = 'sleep_h';
function renderInsights() {
  const el = $('#view-insights');
  const l = live();
  if (l.length < 2) {
    el.innerHTML = `<div class="view-head"><div><h1>Insights</h1><p>Tes progrès, anneau par anneau.</p></div></div>
      <div class="card empty"><div class="k">空</div><h2>Le vide, pour l'instant</h2>
      <p>Consigne quelques journées pour voir apparaître tendances, corrélations et records. Tu peux aussi charger 75 jours de données de démonstration pour explorer.</p>
      <div class="row" style="justify-content:center"><a class="btn primary" href="#saisie">Saisir aujourd'hui</a><button class="btn" id="demoBtn">Charger la démo</button></div></div>`;
    $('#demoBtn').onclick = () => { loadDemo(); renderInsights(); };
    return;
  }
  const P = settings.period;
  if (!FIELD_BY_K[explorerKey]) explorerKey = (FIELDS.find(f => ['num', 'scale', 'check'].includes(f.type)) || { k: 'sleep_h' }).k;
  const dates = periodDates(P), prev = prevDates(dates);
  const sc = scores();
  const logged = dates.filter(d => get(d)).length;
  const curR = RINGS.map(r => { const v = avgRing(dates, r.id); return v == null ? null : Math.round(v); });
  const prevR = RINGS.map(r => { const v = avgRing(prev, r.id); return v == null ? null : Math.round(v); });
  const ov = avgOverall(dates), ovp = avgOverall(prev);
  const bestIdx = curR.reduce((bi, v, i) => (isNum(v) && (bi < 0 || v > curR[bi]) ? i : bi), -1);
  const periodLbl = P === 'all' ? 'depuis le début' : `sur ${P} jours`;

  el.innerHTML = `
    <div class="view-head">
      <div><h1>Insights</h1><p>Lecture de ta pratique ${periodLbl}, comparée à la période précédente.</p></div>
      <div class="chips" id="periodChips">${[[7, '7 j'], [30, '30 j'], [90, '90 j'], ['all', 'Tout']].map(([v, t]) => `<button class="chip" data-p="${v}" aria-pressed="${String(P) === String(v)}">${t}</button>`).join('')}</div>
    </div>

    <div class="grid g4">
      ${kpi('Jours consignés', `${logged}<small> / ${dates.length}</small>`, `${Math.round(logged / dates.length * 100)} % de régularité`)}
      ${kpi('Série en cours', `${streak()}<small> j</small>`, `record ${longestStreak()} j`)}
      ${kpi('Équilibre moyen', `${ov == null ? '—' : Math.round(ov)}<small> / 100</small>`, deltaHTML(ov, ovp, ' pts'))}
      ${kpi('Anneau le plus fort', bestIdx < 0 ? '—' : `<span style="color:${ringColor(RINGS[bestIdx].id)}">${RINGS[bestIdx].kanji}</span> ${RINGS[bestIdx].name}`, bestIdx < 0 ? '' : `${curR[bestIdx]} / 100`)}
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Équilibre des anneaux</h2><p class="sub">Moyenne ${periodLbl} · pointillés : période précédente</p>
        <div class="radar-wrap">${radarSVG(curR, prevR)}</div></div>
      <div class="card"><h2>Lectures</h2><p class="sub">Ce que disent tes données</p><ul class="reads">${readings(dates, prev, curR, prevR).join('')}</ul></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h2>Trajectoire des anneaux</h2><p class="sub">Score quotidien lissé sur 7 jours</p>
      <div class="chart" id="ringChart"></div>
      <div class="legend" id="ringLegend">${RINGS.map(r => `<button data-r="${r.id}" aria-pressed="${!hiddenSeries.has(r.id)}" style="--c:${ringColor(r.id)}"><i></i>${r.kanji} ${r.name}</button>`).join('')}
        <button data-r="overall" aria-pressed="${!hiddenSeries.has('overall')}" style="--c:var(--ink)"><i></i>Équilibre</button></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h2>Constance</h2><p class="sub">26 dernières semaines · intensité = équilibre du jour</p>
      <div class="heat" id="heatBox">${heatmapSVG()}</div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Explorer une métrique</h2>
        <select id="explorerSel" style="margin:6px 0 12px">${RINGS.map(r => `<optgroup label="${r.kanji} ${r.name}">${r.metrics.filter(m => !['select', 'text'].includes(m.type) && m.k !== 'bench_reps').map(m => `<option value="${m.k}" ${m.k === explorerKey ? 'selected' : ''}>${m.short}</option>`).join('')}${r.id === 'feu' ? `<option value="bench_e1rm" ${explorerKey === 'bench_e1rm' ? 'selected' : ''}>1RM estimé (bench)</option>` : ''}</optgroup>`).join('')}</select>
        <div id="explorer"></div></div>
      <div class="card" style="--ring:var(--feu)"><h2><span style="color:var(--feu)">火</span> Bench press</h2><p class="sub">1RM estimé (formule d'Epley) sur tout l'historique</p><div id="benchBox"></div></div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Liens entre tes domaines</h2><p class="sub">Corrélations ${periodLbl} (au moins 8 jours communs)</p><div id="corrBox"></div></div>
      <div class="card"><h2>Ta semaine type</h2><p class="sub">Score moyen par jour de la semaine ${periodLbl}</p><div id="wkBox"></div></div>
    </div>`;

  { const hb = $('#heatBox'); hb.scrollLeft = hb.scrollWidth; }
  $('#periodChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; settings.period = b.dataset.p === 'all' ? 'all' : +b.dataset.p; saveSettings(); renderInsights(); };

  // trajectoire
  const pre = [6, 5, 4, 3, 2, 1].map(n => addDays(dates[0], -n));
  const drawRings = () => lineChart($('#ringChart'), {
    labels: dates, yMax: 100, fmt: v => Math.round(v),
    series: [
      ...RINGS.map(r => ({ name: r.name, color: ringColor(r.id), values: rolling(dates.map(d => sc[d]?.[r.id] ?? null), 7, pre.map(d => sc[d]?.[r.id] ?? null)), hidden: hiddenSeries.has(r.id), bridge: true })),
      { name: 'Équilibre', color: 'var(--ink)', values: rolling(dates.map(d => sc[d]?.overall ?? null), 7, pre.map(d => sc[d]?.overall ?? null)), hidden: hiddenSeries.has('overall'), width: 3, dash: '1 0', bridge: true },
    ],
  });
  drawRings();
  $('#ringLegend').onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.r; hiddenSeries.has(k) ? hiddenSeries.delete(k) : hiddenSeries.add(k); b.setAttribute('aria-pressed', !hiddenSeries.has(k)); drawRings(); };

  // explorer
  const drawExplorer = () => {
    const f = FIELD_BY_K[explorerKey], vals = dates.map(d => fieldVal(get(d), explorerKey));
    const nums = vals.filter(isNum), pv = prev.map(d => fieldVal(get(d), explorerKey)).filter(isNum);
    const sl = slopePerWeek(dates, d => fieldVal(get(d), explorerKey));
    const u = f.unit || (f.type === 'scale' ? '/5' : ''), dg = f.unit === 'h' ? 2 : 1;
    const box = $('#explorer');
    if (!nums.length) { box.innerHTML = `<p class="fine">Aucune donnée ${periodLbl} pour cette métrique.</p>`; return; }
    box.innerHTML = `<div class="stats">
      <div>Moyenne<b>${nf(mean(nums), dg)} ${u}</b></div>
      <div>vs avant<b class="delta ${mean(nums) - (mean(pv) ?? mean(nums)) >= 0 ? 'up' : 'down'}">${pv.length ? signed(mean(nums) - mean(pv), dg) : '—'}</b></div>
      <div>Tendance<b>${sl == null ? '—' : signed(sl, dg) + '/sem'}</b></div>
      <div>Max<b>${nf(Math.max(...nums), dg)}</b></div>
      ${f.unit && f.unit !== 'h' && f.k !== 'bench_kg' && f.k !== 'bench_e1rm' ? `<div>Total<b>${nf(nums.reduce((a, b) => a + b, 0), 0)}</b></div>` : ''}
    </div><div class="chart" id="exChart"></div>`;
    const col = ringColor(f.ring);
    const series = [{ name: f.short, color: col, values: vals, dots: true, line: false }, { name: 'moy. 7 j', color: col, values: rolling(vals, 7, [6, 5, 4, 3, 2, 1].map(n => fieldVal(get(addDays(dates[0], -n)), explorerKey))), bridge: true }];
    if (isNum(target(f.k))) series.push({ name: 'objectif', color: 'var(--ink-3)', values: dates.map(() => target(f.k)), dash: '4 4', width: 1.2, noTip: true });
    lineChart($('#exChart'), { labels: dates, series, h: 200, unit: f.unit || '', yMin: f.type === 'scale' ? 1 : (f.k.startsWith('bench') ? 'auto' : 0), yMax: f.type === 'scale' ? 5 : null, fmt: v => nf(v, dg) });
  };
  $('#explorerSel').onchange = e => { explorerKey = e.target.value; drawExplorer(); };
  drawExplorer();

  // bench
  const benchDays = l.filter(d => e1rm(entries[d]));
  const bb = $('#benchBox');
  if (!benchDays.length) bb.innerHTML = `<p class="fine">Renseigne une charge et des répétitions au bench dans l'anneau du Feu pour suivre ta force.</p>`;
  else {
    let best = 0, prDay = null; const runBest = [];
    benchDays.forEach(d => { const x = e1rm(entries[d]); if (x > best) { best = x; prDay = d; } runBest.push(best); });
    const first = e1rm(entries[benchDays[0]]), last = e1rm(entries[benchDays.at(-1)]);
    const days = daysBetween(benchDays[0], benchDays.at(-1)) || 1;
    const top = entries[prDay];
    bb.innerHTML = `<div class="stats">
      <div>Record<b>${nf(best)} kg</b></div>
      <div>Meilleure série<b>${nf(top.bench_kg)} × ${top.bench_reps || 1}</b></div>
      <div>Progression<b class="delta ${last - first >= 0 ? 'up' : 'down'}">${signed(last - first)} kg</b></div>
      <div>Rythme<b>${signed((last - first) / days * 30)} kg/mois</b></div>
      <div>Séances<b>${benchDays.length}</b></div></div><div class="chart" id="benchChart"></div>`;
    lineChart($('#benchChart'), {
      labels: benchDays, h: 200, unit: 'kg', yMin: 'auto',
      series: [{ name: '1RM estimé', color: 'var(--feu)', values: benchDays.map(d => e1rm(entries[d])), dots: true },
               { name: 'record', color: 'var(--ink-3)', values: runBest, dash: '3 4', width: 1.4 }],
    });
  }

  // corrélations
  const cor = correlations(dates).filter(c => Math.abs(c.r) >= .2).slice(0, 6);
  $('#corrBox').innerHTML = cor.length ? `<ul class="corr">${cor.map(c => {
    const w = Math.abs(c.r) * 50, col = c.r > 0 ? 'var(--vent)' : 'var(--shu)';
    return `<li><span>${esc(corrSentence(c))}</span><span class="r">r = ${nf(c.r, 2)} · ${c.n} j</span>
      <span class="bar"><i style="background:${col};${c.r > 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`}"></i></span></li>`;
  }).join('')}</ul><p class="fine">Corrélation n'est pas causalité — mais c'est un bon point de départ pour expérimenter.</p>`
    : `<p class="fine">Pas encore assez de jours avec des données croisées ${periodLbl}. Élargis la période ou continue à consigner.</p>`;

  // semaine type
  const wkDates = dates.filter(d => get(d)).length >= 14 ? dates : l;
  const cell = v => v == null ? '<td style="color:var(--ink-3)">—</td>' : `<td style="background:color-mix(in srgb, var(--shu) ${Math.round(v * .55)}%, transparent)">${Math.round(v)}</td>`;
  const rowsW = [...RINGS.map(r => ({ id: r.id, name: `<span style="color:${ringColor(r.id)}">${r.kanji}</span> ${r.name}` })), { id: 'overall', name: 'Équilibre' }];
  const byDow = id => DOW.map((_, k) => mean(wkDates.filter(d => dow(d) === k && sc[d]).map(d => sc[d][id]).filter(isNum)));
  const ovw = byDow('overall');
  const bestD = ovw.indexOf(Math.max(...ovw.filter(isNum))), worstD = ovw.indexOf(Math.min(...ovw.filter(isNum)));
  $('#wkBox').innerHTML = `<table class="wk"><thead><tr><th></th>${DOW.map(d => `<th>${d}</th>`).join('')}</tr></thead>
    <tbody>${rowsW.map(r => `<tr><td class="rn">${r.name}</td>${byDow(r.id).map(cell).join('')}</tr>`).join('')}</tbody></table>
    ${bestD >= 0 ? `<p class="fine">Ton meilleur jour : <b>${['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][bestD]}</b> · le plus fragile : <b>${['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][worstD]}</b>.</p>` : ''}`;
}
function kpi(l, v, foot) { return `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="fine" style="margin-top:4px">${foot}</div></div>`; }
function deltaHTML(a, b, suf = '') { if (a == null || b == null) return 'pas de période précédente'; const d = a - b; return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${signed(d, 0)}${suf}</span> vs période précédente`; }

function readings(dates, prev, curR, prevR) {
  const out = [], li = (c, k, html, small) => `<li><span class="mk" style="--c:${c}">${k}</span><p>${html}${small ? `<small>${small}</small>` : ''}</p></li>`;
  // progression / régression par anneau
  const deltas = RINGS.map((r, i) => ({ r, d: isNum(curR[i]) && isNum(prevR[i]) ? curR[i] - prevR[i] : null })).filter(x => x.d != null);
  if (deltas.length) {
    const up = deltas.reduce((a, b) => b.d > a.d ? b : a), dn = deltas.reduce((a, b) => b.d < a.d ? b : a);
    if (up.d >= 2) out.push(li(ringColor(up.r.id), up.r.kanji, `L'anneau ${up.r.name.startsWith('E') ? "de l'" : 'du '}${up.r.name} progresse : <b>${signed(up.d, 0)} pts</b>.`, up.r.sub));
    if (dn.d <= -2 && dn.r !== up.r) out.push(li(ringColor(dn.r.id), dn.r.kanji, `L'anneau ${dn.r.name.startsWith('E') ? "de l'" : 'du '}${dn.r.name} recule : <b>${signed(dn.d, 0)} pts</b>.`, 'À surveiller cette semaine.'));
  }
  // anneau le plus faible
  const wi = curR.reduce((bi, v, i) => (isNum(v) && (bi < 0 || v < curR[bi]) ? i : bi), -1);
  if (wi >= 0) out.push(li(ringColor(RINGS[wi].id), RINGS[wi].kanji, `Ton anneau le plus faible est ${RINGS[wi].name.startsWith('E') ? "l'" : 'le '}<b>${RINGS[wi].name}</b> (${curR[wi]}/100).`, RINGS[wi].lore));
  // sommeil
  const s = avgField(dates, 'sleep_h'), sp = avgField(prev, 'sleep_h');
  if (s != null) out.push(li('var(--terre)', '眠', `Sommeil moyen : <b>${fmtHours(s)}</b>${sp != null ? ` (${signed((s - sp) * 60, 0)} min vs avant)` : ''}.`,
    s < target('sleep_h') - .5 ? `Il te manque environ ${fmtHours(target('sleep_h') - s)} par nuit pour atteindre ton objectif.` : 'Tu es proche de ton objectif.'));
  // lecture
  const pages = dates.map(d => fieldVal(get(d), 'reading_pages')).filter(isNum);
  if (pages.length) { const tot = pages.reduce((a, b) => a + b, 0); out.push(li('var(--eau)', '書', `<b>${nf(tot, 0)} pages</b> lues sur la période.`, `Soit environ ${nf(tot / 300, 1)} livre${tot / 300 >= 2 ? 's' : ''} de 300 pages, ${nf(tot / dates.length, 0)} pages/jour en moyenne.`)); }
  // sport
  const ses = dates.filter(d => (fieldVal(get(d), 'sport_min') || 0) > 0).length, sesP = prev.filter(d => (fieldVal(get(d), 'sport_min') || 0) > 0).length;
  if (ses) out.push(li('var(--feu)', '武', `<b>${ses} séance${ses > 1 ? 's' : ''}</b> de sport (${nf(ses / dates.length * 7, 1)}/semaine).`, sesP ? `Période précédente : ${sesP}.` : ''));
  // records bench
  const all = live(), inP = new Set(dates); let best = 0, prs = 0;
  for (const d of all) { const x = e1rm(entries[d]); if (x && x > best) { if (inP.has(d) && best > 0) prs++; best = x; } }
  if (prs) out.push(li('var(--feu)', '力', `<b>${prs} record${prs > 1 ? 's' : ''}</b> au bench sur la période.`, `1RM estimé actuel : ${nf(best)} kg.`));
  // corrélation la plus forte
  const c = correlations(dates)[0];
  if (c && Math.abs(c.r) >= .35) out.push(li('var(--vide)', '空', esc(corrSentence(c)), `Le lien le plus fort repéré (r = ${nf(c.r, 2)}).`));
  return [...musashiReads(curR, li), ...out].slice(0, 7);
}
function fmtHours(h) { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; }

/* ============================================================
 * 11. Vue : journal
 * ============================================================ */
function renderJournal() {
  const el = $('#view-journal'), l = live().reverse(), sc = scores();
  el.innerHTML = `<div class="view-head"><div><h1>Journal</h1><p>${l.length} journée${l.length > 1 ? 's' : ''} consignée${l.length > 1 ? 's' : ''}. Touche une journée pour la modifier.</p></div>
    <a class="btn primary" href="#saisie/${todayISO()}">Saisir aujourd'hui</a></div>
    <div class="card">${l.length ? `<ul class="jl">${l.map(d => `<li data-d="${d}">
      <div class="d">${esc(fmtDay(d))}<small>${esc(fmtDay(d, { weekday: 'long', year: 'numeric' }))}</small></div>
      <div style="display:flex;gap:14px;align-items:center;min-width:0"><div class="dots">${RINGS.map(r => `<span class="${sc[d][r.id] == null ? 'na' : ''}" style="--c:${ringColor(r.id)}" title="${r.name}">${sc[d][r.id] ?? r.kanji}</span>`).join('')}</div>
        <span class="nt">${esc(entries[d].note || RINGS.map(r => entries[d]['refl_' + r.id]).find(Boolean) || '')}</span></div>
      <div class="sc">${sc[d].overall}</div></li>`).join('')}</ul>` : `<div class="empty"><div class="k">地</div><p>Aucune journée pour l'instant. Tout commence par la Terre.</p></div>`}</div>`;
  el.querySelectorAll('.jl li').forEach(li => li.onclick = () => { location.hash = 'saisie/' + li.dataset.d; });
}

/* ============================================================
 * 12. Vue : réglages (objectifs, GitHub, données)
 * ============================================================ */
function renderReglages() {
  const el = $('#view-reglages'), g = settings.gh;
  const tgt = FIELDS.filter(f => f.target != null);
  const hasDemo = Object.values(entries).some(e => e.demo && !e.deleted) || [...C().habits, ...C().goals].some(x => x.demo && !x.deleted);
  el.innerHTML = `<div class="view-head"><div><h1>Réglages</h1><p>Métriques, synchronisation GitHub et données.</p></div></div>
  <div class="stack">
    <div class="card" id="metricsEd"></div>

    <div class="card"><h2>Synchronisation GitHub</h2>
      <p class="sub">Tes journées sont écrites dans un fichier JSON d'un dépôt GitHub, pour les retrouver sur tous tes appareils et garder un historique versionné.</p>
      <div class="callout" style="margin-bottom:14px">Conseil : garde ce site dans un dépôt public (<b>pseudo.github.io</b>) et tes données dans un <b>dépôt privé séparé</b> (ex. <b>gorin-data</b>). Crée un <b>fine-grained token</b> limité à ce seul dépôt, avec la permission <b>Contents : Read and write</b>. Le token reste uniquement dans ce navigateur.</div>
      <div class="set-grid">
        <label class="f"><span>Propriétaire</span><input type="text" id="ghOwner" value="${esc(g.owner)}" placeholder="ton-pseudo"></label>
        <label class="f"><span>Dépôt</span><input type="text" id="ghRepo" value="${esc(g.repo)}" placeholder="gorin-data"></label>
        <label class="f"><span>Branche</span><input type="text" id="ghBranch" value="${esc(g.branch)}" placeholder="main"></label>
        <label class="f" style="grid-column:span 2"><span>Chemin du fichier</span><input type="text" id="ghPath" value="${esc(g.path)}" placeholder="gorin/journal.json"></label>
        <label class="f"><span>Token</span><input type="password" id="ghToken" value="${esc(g.token)}" placeholder="github_pat_…" autocomplete="off"></label>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" id="ghSave">Enregistrer & synchroniser</button>
        <button class="btn" id="ghSync" ${ghReady() ? '' : 'disabled'}>Synchroniser maintenant</button>
        <label class="check"><input type="checkbox" id="ghAuto" ${settings.autoSync ? 'checked' : ''}> Synchro auto à chaque enregistrement</label>
        <button class="btn ghost danger sm" id="ghForget" ${g.token ? '' : 'disabled'}>Oublier le token</button>
      </div>
      <p class="status-line" id="ghStatus" style="margin-top:10px">${settings.lastSync ? 'Dernière synchro : ' + new Date(settings.lastSync).toLocaleString('fr-FR') : 'Jamais synchronisé'}</p></div>

    <div class="card"><h2>Données</h2><p class="sub">${live().length} journées dans ce navigateur.</p>
      <div class="row">
        <button class="btn" id="exportBtn">Exporter (JSON)</button>
        <label class="btn" style="cursor:pointer">Importer (JSON)<input type="file" id="importInp" accept="application/json,.json" hidden></label>
        <button class="btn" id="exportCsv">Exporter (CSV)</button>
        ${hasDemo ? '<button class="btn" id="unDemo">Retirer les données de démo</button>' : '<button class="btn ghost" id="demoBtn2">Charger la démo</button>'}
        <button class="btn ghost danger" id="wipeBtn">Effacer les données locales</button>
      </div>
      <p class="fine">L'effacement ne touche que ce navigateur : si la synchro GitHub est active, tes données reviendront au prochain chargement.</p></div>

    <div class="card"><h2>Apparence</h2><div class="chips" id="themeChips">${[['auto', 'Système'], ['light', 'Washi (clair)'], ['dark', 'Sumi (sombre)']].map(([v, t]) => `<button class="chip" data-th="${v}" aria-pressed="${(settings.theme || 'auto') === v}">${t}</button>`).join('')}</div></div>
  </div>`;

  $('#ghSave').onclick = async () => {
    Object.assign(settings.gh, { owner: $('#ghOwner').value.trim(), repo: $('#ghRepo').value.trim(), branch: $('#ghBranch').value.trim() || 'main', path: $('#ghPath').value.trim().replace(/^\/+/, '') || 'gorin/journal.json', token: $('#ghToken').value.trim() });
    saveSettings(); if (!ghReady()) { toast('Renseigne propriétaire, dépôt et token'); return; }
    await sync(true); renderReglages();
  };
  $('#ghSync').onclick = async () => { await sync(true); renderReglages(); };
  $('#ghAuto').onchange = e => { settings.autoSync = e.target.checked; saveSettings(); };
  $('#ghForget').onclick = () => { settings.gh.token = ''; saveSettings(); setPill(); renderReglages(); toast('Token supprimé de ce navigateur'); };
  $('#exportBtn').onclick = () => download(`gorin-${todayISO()}.json`, JSON.stringify(bundle(), null, 2), 'application/json');
  $('#exportCsv').onclick = exportCSV;
  $('#importInp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); const n = mergeIn(data); saveEntries(); toast(`${n} journée(s) importée(s)`); autoSync(); renderReglages(); }
    catch { toast('Fichier invalide'); }
  };
  const ud = $('#unDemo'); if (ud) ud.onclick = () => { const t = Date.now(); for (const d in entries) if (entries[d].demo) entries[d] = { deleted: true, updatedAt: t };
    for (const x of [...C().habits, ...C().goals]) if (x.demo) Object.assign(x, { deleted: true, updatedAt: t });
    saveSettings(); saveEntries(); autoSync(); renderReglages(); toast('Données de démo retirées'); };
  const db = $('#demoBtn2'); if (db) db.onclick = () => { loadDemo(); renderReglages(); };
  $('#wipeBtn').onclick = () => { if (!confirm('Effacer toutes les journées de ce navigateur ?')) return; entries = {}; saveEntries(); renderReglages(); toast('Données locales effacées'); };
  $('#themeChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; settings.theme = b.dataset.th; saveSettings(); applyTheme(); renderReglages(); };
  renderMetricsEditor($('#metricsEd'));
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCSV() {
  const sc = scores(), cols = ['date', ...FIELDS.map(f => f.k), 'bench_e1rm', ...RINGS.map(r => 'score_' + r.id), 'score_equilibre', 'principe', 'principe_score', ...RINGS.map(r => 'refl_' + r.id), 'note'];
  const q = v => v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const rows = live().map(d => { const e = entries[d]; return [d, ...FIELDS.map(f => e[f.k]), e1rm(e) ? +e1rm(e).toFixed(1) : null, ...RINGS.map(r => sc[d][r.id]), sc[d].overall, isNum(e.principle) ? e.principle + 1 : null, e.principle_s, ...RINGS.map(r => e['refl_' + r.id]), e.note].map(q).join(','); });
  download(`gorin-${todayISO()}.csv`, [cols.join(','), ...rows].join('\n'), 'text/csv');
}
function applyTheme() { const t = settings.theme || 'auto'; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }

/* ============================================================
 * 13. Synchronisation GitHub (API Contents)
 * ============================================================ */
const ghReady = () => !!(settings.gh.owner && settings.gh.repo && settings.gh.token);
const b64enc = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));
function ghUrl() { const g = settings.gh; return `https://api.github.com/repos/${encodeURIComponent(g.owner)}/${encodeURIComponent(g.repo)}/contents/${g.path.split('/').map(encodeURIComponent).join('/')}`; }
function ghHeaders() { return { Authorization: `Bearer ${settings.gh.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
async function ghGet() {
  const r = await fetch(`${ghUrl()}?ref=${encodeURIComponent(settings.gh.branch)}&t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
  if (r.status === 404) return { data: null, sha: null };
  if (!r.ok) throw new Error(ghErr(r.status));
  const j = await r.json();
  let text = j.content ? b64dec(j.content) : null;
  if (text == null && j.download_url) text = await (await fetch(j.download_url, { headers: ghHeaders() })).text();
  return { data: text ? JSON.parse(text) : null, sha: j.sha };
}
async function ghPut(obj, sha) {
  const body = { message: `gorin: journal ${todayISO()}`, content: b64enc(JSON.stringify(obj, null, 1)), branch: settings.gh.branch };
  if (sha) body.sha = sha;
  const r = await fetch(ghUrl(), { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) { const e = new Error('conflict'); e.conflict = true; throw e; }
  if (!r.ok) throw new Error(ghErr(r.status));
  return (await r.json()).content.sha;
}
function ghErr(s) {
  return ({ 401: 'Token refusé (401) — vérifie-le ou régénère-le', 403: 'Accès interdit (403) — le token doit avoir Contents : Read and write sur ce dépôt', 404: 'Dépôt introuvable (404) — vérifie propriétaire, nom et accès du token' })[s] || `Erreur GitHub ${s}`;
}
function bundle() { return { app: 'gorin', version: 1, updatedAt: settings.targetsAt || 0, savedAt: Date.now(), targets: settings.targets, cfg: exportCfg(), entries }; }
function mergeIn(data) {
  if (!data) return 0; const src = data.entries || data; let n = 0;
  for (const [d, e] of Object.entries(src)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || typeof e !== 'object') continue;
    const mine = entries[d];
    if (!mine || (e.updatedAt || 0) > (mine.updatedAt || 0)) { entries[d] = e; n++; }
  }
  if (data.targets && typeof data.targets === 'object' && (data.updatedAt || 0) > (settings.targetsAt || 0)) { settings.targets = { ...data.targets }; saveSettings(); }
  if (data.cfg) mergeCfg(data.cfg);
  return n;
}
let syncing = false, syncAgain = false;
async function sync(loud = false) {
  if (!ghReady()) { setPill(); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true; setPill('busy');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, sha } = await ghGet();
      const snap = () => JSON.stringify(entries) + JSON.stringify(exportCfg());
      const before = snap();
      mergeIn(data);
      if (snap() !== before) { saveEntries(); rerenderCurrent(); }
      const remoteSame = data && JSON.stringify(data.entries) === JSON.stringify(entries) && JSON.stringify(data.targets || {}) === JSON.stringify(settings.targets)
        && JSON.stringify(data.cfg || null) === JSON.stringify(exportCfg());
      try { if (!remoteSame) await ghPut(bundle(), sha); break; }
      catch (e) { if (!e.conflict || attempt === 2) throw e; }
    }
    settings.lastSync = Date.now(); saveSettings(); setPill('ok');
    if (loud) toast('Synchronisé avec GitHub ✓');
  } catch (e) {
    setPill('err', e.message); if (loud) toast(e.message, 4000);
    const st = $('#ghStatus'); if (st) st.textContent = e.message;
  } finally {
    syncing = false; if (syncAgain) { syncAgain = false; sync(); }
  }
}
let autoT; function autoSync() { if (settings.autoSync && ghReady()) { clearTimeout(autoT); autoT = setTimeout(() => sync(), 800); } }
function setPill(state, msg) {
  const p = $('#syncPill'); const s = state || (ghReady() ? 'ok' : 'local');
  p.dataset.state = s;
  p.querySelector('.lbl').textContent = { local: 'Local', ok: 'GitHub', busy: 'Synchro…', err: 'Erreur' }[s];
  p.title = msg || (s === 'local' ? 'Données uniquement dans ce navigateur — configure GitHub dans les réglages' : `${settings.gh.owner}/${settings.gh.repo}`);
}
function rerenderCurrent() {
  const v = (location.hash.slice(1) || 'saisie').split('/')[0];
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('main')) return;   // ne pas couper une saisie en cours
  if (v === 'saisie') { if (!$('#saveState') || !/non enregistr/.test($('#saveState').textContent)) renderSaisie(); }
  else ({ objectifs: renderObjectifs, rituels: renderRituels, voie: renderVoie, insights: renderInsights, journal: renderJournal })[v]?.();
}

/* ============================================================
 * 14. Données de démonstration
 * ============================================================ */
function loadDemo(days = 75) {
  let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const r4 = v => Math.round(v * 4) / 4, sc5 = v => clamp(Math.round(v), 1, 5);
  let bench = 72.5, prevSport = 0, added = 0; const t = Date.now();
  const demoH = demoCfg(days);
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(todayISO(), -i); if (get(d)) continue;
    if (rnd() < .07) continue;
    const prog = 1 - i / days, wd = dow(d), we = wd >= 5;
    const sleep = clamp(r4(6.6 + prog * .8 + (we ? .5 : 0) + gauss() * .75), 4, 10);
    const sport = [0, 2, 4, 5].includes(wd) && rnd() > .18 ? Math.round((40 + rnd() * 40) / 5) * 5 : (rnd() < .12 ? 30 : 0);
    const type = sport ? ([0, 4].includes(wd) ? 'Musculation' : wd === 2 ? 'Arts martiaux' : 'Course') : '';
    const social = we ? r4(2 + rnd() * 3) : r4(Math.max(0, .3 + gauss() * .8 + rnd()));
    const med = rnd() < .35 + prog * .45 ? Math.round(8 + rnd() * 14) : 0;
    const e = {
      sleep_h: sleep, sleep_q: sc5(2.6 + (sleep - 6.8) * .9 + (prevSport ? .4 : 0) + gauss() * .6),
      work_h: we ? r4(rnd() * 2) : clamp(r4(4.2 + (sleep - 7) * .7 + gauss() * 1.1), 0, 10),
      work_focus: sc5(2.8 + (sleep - 7) * .7 + (med ? .5 : 0) + gauss() * .7),
      reading_pages: rnd() < .8 ? Math.round(clamp(12 + prog * 22 + gauss() * 10, 0, 90)) : 0,
      learn_min: we ? 0 : Math.round(clamp(20 + gauss() * 15, 0, 90) / 5) * 5,
      sport_min: sport, mood: sc5(2.7 + (sleep - 7) * .6 + social * .18 + (sport ? .35 : 0) + gauss() * .6),
      energy: sc5(2.6 + (sleep - 7) * .7 + (sport ? .5 : 0) + gauss() * .6),
      social_h: social, social_q: social ? sc5(3 + gauss() * .9) : null, meditation_min: med,
      note: rnd() < .12 ? ['Bonne séance, technique propre.', 'Journée dispersée, trop de notifications.', 'Longue discussion avec un ami, ça fait du bien.', 'Couché trop tard.', 'Fini un chapitre clé.'][Math.floor(rnd() * 5)] : undefined,
      demo: true, updatedAt: t,
    };
    if (type) e.sport_type = type;
    demoDone(e, d, rnd, prog, demoH);
    if (rnd() < .75) { e.principle = principleIdx(d); e.principle_s = sc5(2.8 + prog + (med ? .4 : 0) + gauss() * .8); }
    if (type === 'Musculation') { bench += .6 + gauss() * .4 + (sleep - 7) * .2; e.bench_kg = Math.round(bench / 2.5) * 2.5; e.bench_reps = 3 + Math.floor(rnd() * 5); }
    for (const k in e) if (e[k] == null) delete e[k];
    entries[d] = e; prevSport = sport; added++;
  }
  saveEntries(); toast(`${added} journées de démo chargées — retire-les dans les réglages`, 3500);
}

/* ============================================================
 * 14b. Gorintō, lectures de Musashi, vue « La Voie »
 * ============================================================ */
// Le gorintō : stèle bouddhique à cinq pierres, de bas en haut Terre (cube), Eau (sphère),
// Feu (toit), Vent (demi-lune), Vide (joyau). C'est elle qui donne son nom au Gorin no sho.
const GORINTO = {
  vide:  { d: 'M100 8 C112 22 130 34 130 50 C130 64 116 72 100 72 C84 72 70 64 70 50 C70 34 88 22 100 8 Z', top: 8, bot: 72, ky: 52, kr: 130, fs: 18 },
  vent:  { d: 'M52 76 L148 76 C148 96 126 110 100 110 C74 110 52 96 52 76 Z', top: 76, bot: 110, ky: 90, kr: 148, fs: 18 },
  feu:   { d: 'M86 114 L114 114 C130 132 150 140 172 146 L172 156 L28 156 L28 146 C50 140 70 132 86 114 Z', top: 114, bot: 156, ky: 141, kr: 172, fs: 17 },
  eau:   { d: 'M54 206 A46 46 0 1 0 146 206 A46 46 0 1 0 54 206 Z', top: 160, bot: 252, ky: 206, kr: 146, fs: 24 },
  terre: { d: 'M40 256 H160 V314 H40 Z', top: 256, bot: 314, ky: 285, kr: 160, fs: 24 },
};
function gorintoSVG(sc, uid = 'g') {
  let defs = '', body = '';
  for (const id of ['vide', 'vent', 'feu', 'eau', 'terre']) {
    const s = GORINTO[id], r = RING_BY_ID[id], v = sc?.[id], h = (s.bot - s.top) * (v == null ? 0 : clamp(v, 0, 100) / 100);
    defs += `<clipPath id="${uid}-${id}"><path d="${s.d}"/></clipPath>`;
    body += `<g data-g="${id}">
      <rect x="0" y="${s.top}" width="200" height="${s.bot - s.top}" fill="var(--line)" clip-path="url(#${uid}-${id})"/>
      <rect class="gfill" x="0" y="${s.bot - h}" width="200" height="${h}" fill="${ringColor(id)}" clip-path="url(#${uid}-${id})"/>
      <path d="${s.d}" fill="none" stroke="var(--ink)" stroke-opacity=".22" stroke-width="1.2"/>
      <text class="gk" x="100" y="${s.ky}" text-anchor="middle" dominant-baseline="central" font-size="${s.fs}">${r.kanji}</text>
      <line x1="${s.kr + 6}" x2="196" y1="${s.ky}" y2="${s.ky}" stroke="var(--line-2)" stroke-dasharray="2 3"/>
      <text class="gn" x="202" y="${s.ky - 4}">${r.name}</text>
      <text class="gs" x="202" y="${s.ky + 12}">${v == null ? '—' : v}</text>
    </g>`;
  }
  return `<svg viewBox="0 0 268 320" role="img" aria-label="Gorintō, les cinq pierres"><defs>${defs}</defs>${body}</svg>`;
}
function updateGorinto(el, sc) {
  if (!el) return;
  for (const id in GORINTO) {
    const s = GORINTO[id], g = el.querySelector(`[data-g="${id}"]`); if (!g) continue;
    const v = sc?.[id], h = (s.bot - s.top) * (v == null ? 0 : clamp(v, 0, 100) / 100);
    const f = g.querySelector('.gfill'); f.setAttribute('y', s.bot - h); f.setAttribute('height', h);
    g.querySelector('.gs').textContent = v == null ? '—' : v;
  }
}

function musashiReads(curR, li) {
  const out = [];
  const valid = curR.map((v, i) => [v, i]).filter(x => isNum(x[0]));
  if (valid.length >= 4) {
    const hi = valid.reduce((a, b) => b[0] > a[0] ? b : a), lo = valid.reduce((a, b) => b[0] < a[0] ? b : a);
    if (hi[0] - lo[0] >= 25) out.push(li('var(--shu)', '兵', `L'arme favorite : <b>${RINGS[hi[1]].name}</b> (${hi[0]}) écrase <b>${RINGS[lo[1]].name}</b> (${lo[0]}).`,
      "Musashi met en garde contre ceux qui ne cultivent qu'une seule arme. Rééquilibre ton gorintō."));
  }
  const last = rangeDates(21); let worst = null;
  for (const f of FIELDS.filter(f => f.type === 'num' && isNum(target(f.k)))) {
    const vals = last.map(d => fieldVal(get(d), f.k)).filter(isNum); if (vals.length < 10) continue;
    const m = mean(vals), t = target(f.k), sl = slopePerWeek(last, d => fieldVal(get(d), f.k));
    if (m < t * .8 && sl != null && Math.abs(sl) < t * .04) { const gap = 1 - m / t; if (!worst || gap > worst.gap) worst = { f, m, gap }; }
  }
  if (worst) out.push(li(ringColor(worst.f.ring), '山', `Montagne et mer : ${esc(worst.f.short.toLowerCase())} stagne depuis 3 semaines (${nf(worst.m)} ${worst.f.unit} pour un objectif de ${nf(target(worst.f.k))}).`,
    "Quand une tactique a échoué deux fois, Musashi conseille de ne pas la tenter une troisième : change d'approche."));
  const n = live().length;
  out.push(li('var(--eau)', '鍛', `Tanren : <b>${n} jour${n > 1 ? 's' : ''}</b> de pratique sur les 1 000 qui forgent.`,
    n >= 1000 ? `Le fer est forgé. Encore ${nf(10000 - n, 0)} jours pour le polir.` : `Encore ${nf(1000 - n, 0)} jours pour forger, 10 000 pour polir.`));
  return out;
}

function renderVoie() {
  const el = $('#view-voie'), l = live(), sc = scores(), today = todayISO();
  const d30 = rangeDates(30);
  const avg = Object.fromEntries(RINGS.map(r => { const v = avgRing(d30, r.id); return [r.id, v == null ? null : Math.round(v)]; }));
  const n = l.length, pT = principleIdx(today), dT = dokkodoIdx(today);
  const pStats = PRINCIPLES.map((_, i) => { const v = l.filter(d => entries[d].principle === i && isNum(entries[d].principle_s)).map(d => entries[d].principle_s); return { m: mean(v), n: v.length }; });
  const rated = pStats.filter(s => s.n);
  const strongP = rated.length >= 3 ? pStats.indexOf(rated.reduce((a, b) => b.m > a.m ? b : a)) : -1;
  const weakP = rated.length >= 3 ? pStats.indexOf(rated.reduce((a, b) => b.m < a.m ? b : a)) : -1;
  const bar = (v, max) => `<div class="tbar"><i style="width:${clamp(v / max * 100, 0, 100)}%"></i></div>`;

  el.innerHTML = `
    <div class="view-head"><div><h1><span style="color:var(--shu)">道</span> La Voie</h1>
      <p>Le Gorin no sho, écrit par Miyamoto Musashi en 1645 dans la grotte de Reigandō : cinq livres pour une seule Voie.</p></div></div>

    <div class="grid voie-top">
      <div class="card"><h2>Ton gorintō</h2><p class="sub">Les cinq pierres, remplies selon ta moyenne des 30 derniers jours</p>
        <div class="gorinto gorinto-lg">${gorintoSVG(avg, 'gvoie')}</div></div>
      <div class="card tanren"><h2><span style="color:var(--eau)">鍛錬</span> Tanren</h2>
        <p class="sub">« Mille jours d'entraînement pour forger, dix mille pour polir » (livre de l'Eau)</p>
        <div class="t-big">${nf(n, 0)}<small> jour${n > 1 ? 's' : ''} consigné${n > 1 ? 's' : ''}</small></div>
        <div class="t-row"><span>鍛 Forger</span><b>${nf(Math.min(n, 1000), 0)} / 1 000</b></div>${bar(n, 1000)}
        <div class="t-row"><span>錬 Polir</span><b>${nf(n, 0)} / 10 000</b></div>${bar(n, 10000)}
        <p class="fine">${n >= 1000 ? 'Le fer est forgé : chaque jour désormais le polit.' : `À ce rythme quotidien, le fer sera forgé le ${esc(fmtDay(addDays(today, 1000 - n), { day: 'numeric', month: 'long', year: 'numeric' }))}.`}
          Série en cours : <b>${streak()} j</b> · record : <b>${longestStreak()} j</b>.</p>
        <div class="dk-today"><div class="pr-n">Précepte du jour · Dokkōdō ${dT + 1} / 21</div><p>${esc(DOKKODO[dT])}</p></div>
      </div>
    </div>

    <h2 class="sec">Les cinq livres</h2>
    <div class="books">${RINGS.map(r => { const m = MUSASHI[r.id]; return `
      <article class="card book" style="--ring:${ringColor(r.id)}">
        <header><span class="kanji">${r.kanji}</span><div><h3>Livre ${r.name.startsWith('E') ? "de l'" : 'du '}${r.name}</h3><p>${r.book} · ${m.jp}</p></div>
          <span class="mini"><b>${avg[r.id] ?? '—'}</b><small>/100 · 30 j</small></span></header>
        <p>${esc(m.essence)}</p>
        <ul>${m.teachings.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="fine">Dans ton journal : ${r.metrics.map(x => x.short.toLowerCase()).join(', ')}.</p>
      </article>`; }).join('')}</div>

    <h2 class="sec">Les neuf principes</h2>
    <p class="sec-sub">Musashi clôt le livre de la Terre par neuf règles pour qui veut apprendre sa stratégie. Chaque jour, la saisie t'en propose une et te demande si tu l'as honorée.</p>
    <div class="card"><ol class="principles">${PRINCIPLES.map((p, i) => `
      <li class="${i === pT ? 'today' : ''}">
        <span class="pr-k">${p.k}</span>
        <div><div class="pr-n">${i + 1}. ${i === pT ? '<b>aujourd’hui</b> · ' : ''}${p.jp}</div><h3>${esc(p.t)}</h3><p>${esc(p.d)}</p></div>
        <div class="pr-stat">${pStats[i].n ? `<b>${nf(pStats[i].m, 1)}</b><small>/5 · ${pStats[i].n} j</small>${bar(pStats[i].m - 1, 4)}` : '<small>pas encore noté</small>'}</div>
      </li>`).join('')}</ol>
      ${strongP >= 0 && strongP !== weakP ? `<p class="fine">Ton principe le mieux tenu : <b>${esc(PRINCIPLES[strongP].t.toLowerCase())}</b>. Celui à travailler : <b>${esc(PRINCIPLES[weakP].t.toLowerCase())}</b>.</p>` : ''}</div>

    <h2 class="sec">Dokkōdō, la Voie de la solitude</h2>
    <p class="sec-sub">Vingt et un préceptes écrits par Musashi une semaine avant sa mort et remis à son disciple Terao Magonojō avec le Gorin no sho. Un précepte par jour apparaît en bas de chaque page.</p>
    <div class="card"><ol class="dokkodo">${DOKKODO.map((t, i) => `<li class="${i === dT ? 'today' : ''}"><span>${i + 1}</span>${esc(t)}</li>`).join('')}</ol>
      <p class="fine">Les textes sont des paraphrases en français des originaux japonais.</p></div>`;
}

/* ============================================================
 * 15. Démarrage
 * ============================================================ */
function init() {
  cfgInit();
  applyTheme();
  const dk = dokkodoIdx(todayISO());
  $('#maxim').textContent = DOKKODO[dk];
  $('#maximSrc').innerHTML = `<a href="#voie">Dokkōdō, précepte ${dk + 1} / 21</a>`;
  $('#syncPill').onclick = () => { location.hash = 'reglages'; };
  setPill();
  addEventListener('hashchange', route);
  route();
  if (ghReady()) sync();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!$('#view-insights').hidden) renderInsights(); }, 200); });
  addEventListener('beforeunload', e => { const s = $('#saveState'); if (s && /non enregistr/.test(s.textContent) && !$('#view-saisie').hidden) { e.preventDefault(); e.returnValue = ''; } });
}
document.addEventListener('DOMContentLoaded', init);
