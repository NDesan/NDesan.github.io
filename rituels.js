/* Gorin — rituels quotidiens, tâches du jour, objectifs à long terme et métriques personnalisables.
 * Chargé après app.js : utilise ses utilitaires ($, esc, entries, settings…) au moment des appels.
 */
'use strict';

const ANCHOR_DAYS = 66;           // Lally et al. (2009) : 66 jours en moyenne pour qu'un geste devienne automatique
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MOMENTS = [['matin', 'Matin'], ['journee', 'Journée'], ['soir', 'Soir']];
const DOMAINS = [
  ['Carrière', 'terre'], ['Projet perso', 'terre'], ['Santé & forme', 'feu'], ['Savoir & compétences', 'eau'],
  ['Relations', 'vent'], ['Finances', 'terre'], ['Esprit & équilibre', 'vide'], ['Autre', null],
];
const HABIT_IDEAS = {
  terre: [
    { name: 'Bloc de travail profond (90 min)', cue: 'mon premier café', tiny: '15 min sans notifications', days: [0, 1, 2, 3, 4] },
    { name: 'Planifier demain (5 min)', cue: 'la fin de ma journée de travail', tiny: 'noter la priorité n°1' },
    { name: 'Avancer sur un projet carrière (30 min)', cue: 'le déjeuner', tiny: 'ouvrir le projet et écrire une ligne' },
    { name: 'Coucher avant 23 h', cue: 'le dîner', tiny: 'écrans coupés à 22 h 30', moment: 'soir' },
  ],
  eau: [
    { name: 'Lire 20 pages', cue: 'me mettre au lit', tiny: 'lire 1 page', moment: 'soir' },
    { name: 'Apprendre 20 min (cours, langue)', cue: 'mon trajet', tiny: 'une leçon de 5 min' },
    { name: 'Veille métier (15 min)', cue: 'mon café de l’après-midi', tiny: 'lire un article' },
    { name: 'Noter une chose apprise', cue: 'fermer mon ordinateur', tiny: 'une phrase', moment: 'soir' },
  ],
  feu: [
    { name: 'Séance de sport', cue: 'la fin du travail', tiny: 'mettre ma tenue et bouger 5 min', days: [0, 2, 4, 5], moment: 'soir' },
    { name: '20 pompes au réveil', cue: 'me lever', tiny: '5 pompes', moment: 'matin' },
    { name: 'Marcher 8 000 pas', cue: 'le déjeuner', tiny: '10 min de marche' },
    { name: 'Étirements / mobilité', cue: 'ma douche du soir', tiny: '2 min', moment: 'soir' },
  ],
  vent: [
    { name: 'Écrire à un proche', cue: 'le déjeuner', tiny: 'un message court' },
    { name: 'Une vraie conversation sans téléphone', cue: 'le dîner', tiny: 'poser une question et écouter', moment: 'soir' },
    { name: 'Contacter une personne de mon réseau pro', cue: 'ma pause du vendredi', tiny: 'un commentaire sincère sur son travail', days: [4] },
    { name: 'Remercier quelqu’un précisément', cue: 'ma dernière réunion', tiny: 'un merci d’une ligne' },
  ],
  vide: [
    { name: 'Méditer 10 min', cue: 'me brosser les dents le matin', tiny: '3 respirations profondes', moment: 'matin' },
    { name: 'Journal du soir : 3 lignes', cue: 'me mettre au lit', tiny: 'une ligne', moment: 'soir' },
    { name: 'Pas d’écran 30 min avant de dormir', cue: 'brancher mon téléphone hors de la chambre', tiny: '10 min', moment: 'soir' },
    { name: 'Marche sans téléphone', cue: 'le déjeuner', tiny: '5 min dehors' },
  ],
};
const DEFAULT_METRICS = Object.fromEntries(RINGS.map(r => [r.id, r.metrics.map(m => ({ ...m }))]));
const DEFAULT_SUBS = Object.fromEntries(RINGS.map(r => [r.id, r.sub]));
const CHECK_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7"/></svg>';

const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const C = () => settings.cfg;
const lc = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : '';
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

/* ------------------------------------------------------------
 * Configuration (synchronisée avec GitHub)
 * ------------------------------------------------------------ */
function cfgInit() {
  settings.cfg = Object.assign({ habits: [], goals: [], reviews: {}, vision: {}, metrics: null, metricsAt: 0, subs: {} }, settings.cfg || {});
  applyMetrics();
}
function applyMetrics() {
  const cm = C().metrics;
  for (const r of RINGS) {
    r.metrics = (cm && Array.isArray(cm[r.id]) ? cm[r.id] : DEFAULT_METRICS[r.id]).map(m => ({ ...m }));
    r.sub = (C().subs && C().subs[r.id]) || DEFAULT_SUBS[r.id];
  }
  FIELDS = RINGS.flatMap(r => r.metrics.map(m => ({ ...m, ring: r.id })));
  FIELD_BY_K = Object.fromEntries(FIELDS.map(f => [f.k, f]));
  FIELD_BY_K.bench_e1rm = { k: 'bench_e1rm', short: '1RM estimé (bench)', label: '1RM estimé (bench)', unit: 'kg', ring: 'feu', type: 'num' };
  _scores = null;
}
function touchCfg() { settings.cfgAt = Date.now(); saveSettings(); _scores = null; autoSync(); }
function exportCfg() {
  const c = C();
  return { habits: c.habits, goals: c.goals, reviews: c.reviews, vision: c.vision, metrics: c.metrics, metricsAt: c.metricsAt, subs: c.subs };
}
function mergeCfg(rc) {
  if (!rc || typeof rc !== 'object') return;
  const c = C();
  const byId = (loc, rem) => {
    const m = new Map((loc || []).map(x => [x.id, x]));
    for (const x of rem || []) { if (!x || !x.id) continue; const l = m.get(x.id); if (!l || (x.updatedAt || 0) > (l.updatedAt || 0)) m.set(x.id, x); }
    return [...m.values()];
  };
  c.habits = byId(c.habits, rc.habits);
  c.goals = byId(c.goals, rc.goals);
  for (const [k, v] of Object.entries(rc.reviews || {})) if (!c.reviews[k] || (v.updatedAt || 0) > (c.reviews[k].updatedAt || 0)) c.reviews[k] = v;
  if (rc.vision && (rc.vision.updatedAt || 0) > ((c.vision && c.vision.updatedAt) || 0)) c.vision = rc.vision;
  if ((rc.metricsAt || 0) > (c.metricsAt || 0)) { c.metrics = rc.metrics; c.subs = rc.subs || {}; c.metricsAt = rc.metricsAt; applyMetrics(); }
  saveSettings();
}

/* ------------------------------------------------------------
 * Rituels : planification et statistiques
 * ------------------------------------------------------------ */
const HABITS = () => C().habits.filter(h => !h.deleted);
const goals = () => C().goals.filter(g => !g.deleted);
const goalOf = h => h.goalId ? goals().find(g => g.id === h.goalId) : null;
function scheduled(h, d) {
  return !h.deleted && (h.start || '0000') <= d && (!h.archivedAt || d < h.archivedAt) && (h.days || ALL_DAYS).includes(dow(d));
}
function habitsOn(d) { return HABITS().filter(h => scheduled(h, d)).sort(byOrder); }
function doneVal(h, d) { const e = entries[d]; return e && !e.deleted && e.done ? (e.done[h.id] || 0) : 0; }
function hStreak(h) {
  let d = todayISO(), n = 0, guard = 0;
  if (!doneVal(h, d)) d = addDays(d, -1);
  while (d >= (h.start || d) && guard++ < 4000) {
    if (scheduled(h, d)) { if (doneVal(h, d) > 0) n++; else break; }
    d = addDays(d, -1);
  }
  return n;
}
function hRate(h, n = 30) {
  let s = 0, c = 0; const t = todayISO();
  for (let i = 0; i < n; i++) {
    const d = addDays(t, -i); if (d < (h.start || d)) break;
    if (!scheduled(h, d)) continue;
    const v = doneVal(h, d); if (i === 0 && !v) continue;   // aujourd'hui n'est pas encore un échec
    c++; if (v > 0) s++;
  }
  return c ? s / c : null;
}
function missedLast(h) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(todayISO(), -i); if (d < (h.start || d)) return false;
    if (scheduled(h, d)) return !doneVal(h, d);
  }
  return false;
}
const anchorDay = h => Math.max(0, daysBetween(h.start || todayISO(), todayISO()) + 1);
function daysTxt(days) {
  const d = [...(days || ALL_DAYS)].sort().join('');
  if (d === '0123456') return 'chaque jour';
  if (d === '01234') return 'en semaine';
  if (d === '56') return 'le week-end';
  return (days || []).slice().sort().map(i => DOW[i].toLowerCase()).join(', ') || 'aucun jour';
}
function cueLine(h) {
  return `${h.cue ? `Après ${esc(lc(h.cue))} → ` : ''}<b>${esc(lc(h.name))}</b>${h.tiny ? ` <span class="tiny">· minimum : ${esc(lc(h.tiny))}</span>` : ''}`;
}

/* ------------------------------------------------------------
 * Aujourd'hui : enregistrement immédiat (sans bouton)
 * ------------------------------------------------------------ */
function patchEntry(date, mut) {
  const e = get(date) ? entries[date] : (entries[date] = {});
  mut(e);
  if (e.done && !Object.keys(e.done).length) delete e.done;
  if (e.todos && !e.todos.length) delete e.todos;
  e.updatedAt = Date.now();
  if (!Object.keys(e).some(k => k !== 'updatedAt' && k !== 'demo')) entries[date] = { deleted: true, updatedAt: e.updatedAt };
  saveEntries(); autoSync();
  if (date === editDate) for (const k of ['done', 'todos', 'intention', 'intention_done']) { if (e[k] === undefined) delete draft[k]; else draft[k] = e[k]; }
}

function todayTopHTML(d) {
  const e = get(d);
  return `<div class="grid top2">
    <div class="card essentiel">
      <h2>L'essentiel du jour</h2>
      <p class="sub">La seule chose qui ferait de cette journée une réussite</p>
      <div class="intent ${e && e.intention_done ? 'on' : ''}" id="intentRow">
        <button type="button" class="hb-check" id="intentChk" aria-pressed="${!!(e && e.intention_done)}" aria-label="Essentiel accompli">${CHECK_SVG}</button>
        <input type="text" id="intentInp" maxlength="140" value="${esc((e && e.intention) || '')}" placeholder="Ex. : finir la première version de mon portfolio">
      </div>
      <div class="mini-h">Tâches du jour</div>
      <div id="todoBox">${todosHTML(d)}</div>
    </div>
    <div class="card capside" id="capBox">${capSideHTML(d)}</div>
  </div>`;
}
function todosHTML(d) {
  const e = get(d), list = (e && e.todos) || [];
  const y = get(addDays(d, -1));
  const carry = d === todayISO() && y ? (y.todos || []).filter(t => !t.done && !t.moved) : [];
  return `<ul class="todo-list">${list.map(t => `<li class="td ${t.done ? 'on' : ''} ${t.moved ? 'moved' : ''}" data-t="${t.id}">
      <button type="button" class="hb-check sm" data-tact="toggle" aria-pressed="${!!t.done}" aria-label="Fait">${CHECK_SVG}</button>
      ${t.ring ? `<i class="rdot" style="background:${ringColor(t.ring)}" title="${RING_BY_ID[t.ring] ? RING_BY_ID[t.ring].name : ''}"></i>` : ''}
      <input type="text" class="td-text" data-tact="edit" value="${esc(t.t)}" maxlength="140" aria-label="Tâche">
      ${t.moved ? '<span class="tag">reportée</span>' : ''}
      <button type="button" class="x" data-tact="del" aria-label="Supprimer">×</button></li>`).join('')}</ul>
    ${carry.length ? `<button type="button" class="btn sm ghost carry" data-tact="carry">↪ Reporter ${carry.length} tâche${carry.length > 1 ? 's' : ''} non faite${carry.length > 1 ? 's' : ''} d'hier</button>` : ''}
    <div class="td-add">
      <select data-tact="ring" aria-label="Anneau"><option value="">—</option>${RINGS.map(r => `<option value="${r.id}">${r.kanji} ${r.name}</option>`).join('')}</select>
      <input type="text" data-tact="new" maxlength="140" placeholder="+ Une tâche pour ce jour">
      <button type="button" class="btn sm" data-tact="add">Ajouter</button>
    </div>`;
}
function nextSteps(n) {
  return goals().filter(g => g.status === 'actif')
    .map(g => ({ g, m: (g.milestones || []).find(m => !m.done) })).filter(x => x.m)
    .sort((a, b) => ((a.m.due || '9999') < (b.m.due || '9999') ? -1 : 1)).slice(0, n);
}
function dueTxt(due) {
  if (!due) return '';
  const n = daysBetween(todayISO(), due);
  return n < 0 ? `en retard de ${-n} j` : n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${n} j`;
}
function capSideHTML(d) {
  const hs = habitsOn(d), done = hs.filter(h => doneVal(h, d) > 0).length, pct = hs.length ? done / hs.length : 0;
  const warn = d === todayISO() ? hs.filter(h => !doneVal(h, d) && missedLast(h)) : [];
  const steps = nextSteps(3);
  return `<h2>Cap</h2><p class="sub">Tes rituels du jour et les prochaines étapes de tes objectifs</p>
    <div class="rt-sum"><div class="rt-n"><b>${done}</b> / ${hs.length}<small> rituel${hs.length > 1 ? 's' : ''} ${d === todayISO() ? "aujourd'hui" : 'ce jour'}</small></div><div class="tbar"><i style="width:${pct * 100}%"></i></div></div>
    ${hs.length ? '' : `<p class="fine">Aucun rituel prévu. <a href="#rituels/new">Crée ton premier rituel</a>, ou ajoute-en un directement dans un anneau plus bas.</p>`}
    ${warn.length ? `<div class="warnbox"><b>Ne manque jamais deux fois.</b> La dernière fois, tu as sauté : ${warn.map(h => `<span>${esc(h.name)}</span>`).join(', ')}. Aujourd'hui, même la version minimale suffit.</div>` : ''}
    ${hs.length && done === hs.length ? '<div class="okbox">Tous les rituels du jour sont faits. La Voie est dans la pratique.</div>' : ''}
    <div class="mini-h">Prochaines étapes</div>
    ${steps.length ? `<ul class="steps">${steps.map(({ g, m }) => `<li class="step ${m.due && m.due < todayISO() ? 'late' : ''}" style="--ring:${ringColor(g.ring || 'terre')}">
        <button type="button" class="hb-check sm" data-mdone="${g.id}|${m.id}" aria-label="Étape franchie">${CHECK_SVG}</button>
        <div><div class="st-t">${esc(m.t)}</div><div class="st-g"><a href="#objectifs">${esc(g.title)}</a>${m.due ? ` · <span class="due">${dueTxt(m.due)}</span>` : ''}</div></div></li>`).join('')}</ul>`
      : `<p class="fine">Aucun objectif actif. <a href="#objectifs/new">Fixe un cap à long terme</a> et découpe-le en étapes.</p>`}`;
}
function ritualsBlockHTML(rid, d) {
  const hs = habitsOn(d).filter(h => h.ring === rid), r = RING_BY_ID[rid];
  const done = hs.filter(h => doneVal(h, d) > 0).length;
  return `<div class="rituals" data-ring="${rid}">
    ${hs.length ? `<div class="rt-head"><span>Rituels</span><em>${done} / ${hs.length}</em></div>
      <ul class="hb-list">${hs.map(h => habitRowHTML(h, d)).join('')}</ul>` : ''}
    <div class="hb-add"><input type="text" data-add-ring="${rid}" maxlength="80" placeholder="+ Rituel quotidien ${r.name.startsWith('E') ? "de l'" : 'du '}${r.name}" aria-label="Nouveau rituel"><button type="button" class="btn sm ghost" data-add-btn="${rid}">Ajouter</button></div>
  </div>`;
}
function habitRowHTML(h, d) {
  const v = doneVal(h, d), isToday = d === todayISO();
  const warn = isToday && !v && missedLast(h), s = hStreak(h), ad = anchorDay(h);
  const meta = [h.cue ? `après ${esc(lc(h.cue))}` : '', s ? `série ${s} j` : '', ad < ANCHOR_DAYS ? `ancrage ${ad}/${ANCHOR_DAYS}` : 'ancré'].filter(Boolean).join(' · ');
  return `<li class="hb ${v >= 1 ? 'on' : v > 0 ? 'half' : ''}" data-h="${h.id}">
    <button type="button" class="hb-check" data-act="full" aria-pressed="${v >= 1}" aria-label="Fait : ${esc(h.name)}">${CHECK_SVG}</button>
    <div class="hb-main">
      <div class="hb-name">${esc(h.name)}${warn ? '<span class="tag warn">ne manque pas deux fois</span>' : ''}</div>
      <div class="hb-meta">${meta}</div>
    </div>
    ${h.tiny ? `<button type="button" class="hb-tiny" data-act="tiny" aria-pressed="${v > 0 && v < 1}" title="Version minimale : ${esc(h.tiny)}">min.</button>` : ''}
    <a class="hb-edit" href="#rituels/edit/${h.id}" title="Modifier le rituel" aria-label="Modifier">✎</a>
  </li>`;
}

function bindToday(el) {
  const form = el.querySelector('#entryForm');
  if (form) form.addEventListener('submit', e => e.preventDefault());
  if (el._todayBound) return;
  el._todayBound = true;
  el.addEventListener('click', onTodayClick);
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t.dataset.addRing) { e.preventDefault(); quickAddHabit(t.dataset.addRing, t.value); }
    else if (t.dataset.tact === 'new') { e.preventDefault(); addTodo(); }
    else if (t.id === 'intentInp' || t.dataset.tact === 'edit') { e.preventDefault(); t.blur(); }
  });
  el.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'intentInp') patchEntry(editDate, x => { const v = t.value.trim(); if (v) x.intention = v; else delete x.intention; });
    else if (t.dataset.tact === 'edit') {
      const id = t.closest('[data-t]').dataset.t;
      patchEntry(editDate, x => { x.todos = (x.todos || []).map(o => o.id === id ? { ...o, t: t.value.trim() || o.t } : o); });
    }
  });
}
function onTodayClick(ev) {
  const t = ev.target.closest('button'); if (!t) return;
  const li = t.closest('.hb');
  if (li && t.dataset.act) {
    const h = HABITS().find(x => x.id === li.dataset.h); if (!h) return;
    const cur = doneVal(h, editDate), want = t.dataset.act === 'tiny' ? .5 : 1;
    setDone(h, cur === want ? 0 : want);
    return;
  }
  if (t.dataset.addBtn) { const inp = $(`[data-add-ring="${t.dataset.addBtn}"]`); quickAddHabit(t.dataset.addBtn, inp && inp.value); return; }
  if (t.id === 'intentChk') {
    patchEntry(editDate, x => { if (x.intention_done) delete x.intention_done; else x.intention_done = true; });
    const e = get(editDate), on = !!(e && e.intention_done);
    $('#intentRow').classList.toggle('on', on); t.setAttribute('aria-pressed', on);
    if (on) toast("L'essentiel est fait. Le reste est un bonus.");
    return;
  }
  if (t.dataset.mdone) { const [gid, mid] = t.dataset.mdone.split('|'); toggleMilestone(gid, mid); refreshCap(); return; }
  const tact = t.dataset.tact;
  if (tact === 'add') addTodo();
  else if (tact === 'carry') carryTodos();
  else if (tact === 'toggle' || tact === 'del') {
    const id = t.closest('[data-t]').dataset.t;
    patchEntry(editDate, x => {
      x.todos = (x.todos || []).map(o => ({ ...o }));
      const i = x.todos.findIndex(o => o.id === id); if (i < 0) return;
      if (tact === 'del') x.todos.splice(i, 1); else x.todos[i].done = !x.todos[i].done;
    });
    refreshTodos();
  }
}
function setDone(h, v) {
  patchEntry(editDate, x => { x.done = { ...(x.done || {}) }; if (v) x.done[h.id] = v; else delete x.done[h.id]; });
  refreshRituals(h.ring); refreshCap(); updateLive();
  if (v && editDate === todayISO()) {
    const s = hStreak(h);
    if ([7, 14, 21, 30, 50, 66, 100, 200, 365].includes(s)) toast(`${s} jours d'affilée : ${h.name}`, 3000);
    else if (v < 1) toast('Version minimale comptée. La chaîne tient.');
  }
}
function refreshRituals(rid) { const b = $(`.rituals[data-ring="${rid}"]`); if (b) b.outerHTML = ritualsBlockHTML(rid, editDate); }
function refreshCap() { const b = $('#capBox'); if (b) b.innerHTML = capSideHTML(editDate); }
function refreshTodos() { const b = $('#todoBox'); if (b) b.innerHTML = todosHTML(editDate); }
function quickAddHabit(rid, name) {
  name = (name || '').trim(); if (!name) return;
  C().habits.push({ id: uid('h'), ring: rid, name, cue: '', tiny: '', days: [...ALL_DAYS], moment: 'journee', goalId: '', start: editDate, order: HABITS().length, updatedAt: Date.now() });
  touchCfg(); refreshRituals(rid); refreshCap(); updateLive();
  toast('Rituel ajouté. Donne-lui un déclencheur et une version minimale avec ✎', 3200);
  const inp = $(`[data-add-ring="${rid}"]`); if (inp) inp.focus();
}
function addTodo() {
  const inp = $('[data-tact="new"]'), sel = $('[data-tact="ring"]'), t = inp.value.trim(), ring = sel.value;
  if (!t) return;
  patchEntry(editDate, x => { x.todos = [...(x.todos || []), { id: uid('t'), t, done: false, ...(ring ? { ring } : {}) }]; });
  refreshTodos();
  $('[data-tact="ring"]').value = ring; $('[data-tact="new"]').focus();
}
function carryTodos() {
  const y = addDays(editDate, -1), ye = get(y); if (!ye) return;
  const moving = (ye.todos || []).filter(o => !o.done && !o.moved);
  if (!moving.length) return;
  patchEntry(y, x => { x.todos = (x.todos || []).map(o => (!o.done && !o.moved) ? { ...o, moved: true } : o); });
  patchEntry(editDate, x => { x.todos = [...(x.todos || []), ...moving.map(o => ({ id: uid('t'), t: o.t, done: false, ...(o.ring ? { ring: o.ring } : {}) }))]; });
  refreshTodos(); toast(`${moving.length} tâche${moving.length > 1 ? 's' : ''} reportée${moving.length > 1 ? 's' : ''}`);
}
function toggleMilestone(gid, mid) {
  const g = C().goals.find(x => x.id === gid), m = g && (g.milestones || []).find(x => x.id === mid);
  if (!m) return;
  m.done = !m.done;
  if (m.done) m.doneAt = todayISO(); else delete m.doneAt;
  g.updatedAt = Date.now(); touchCfg();
  if (m.done) {
    const left = g.milestones.filter(x => !x.done).length;
    toast(left ? `Étape franchie. Encore ${left} avant « ${g.title} »` : `Toutes les étapes sont franchies : « ${g.title} ». Marque-le comme atteint.`, 3200);
  }
}

/* ------------------------------------------------------------
 * Vue : Rituels
 * ------------------------------------------------------------ */
let hf = null;   // rituel en cours d'édition
function renderRituels() {
  const el = $('#view-rituels');
  const [, sub, arg] = location.hash.slice(1).split('/');
  hf = null;
  if (sub === 'edit') { const h = HABITS().find(x => x.id === arg); if (h) hf = { ...h, days: [...(h.days || ALL_DAYS)] }; }
  else if (sub === 'new') {
    const g = arg ? goals().find(x => x.id === arg) : null;
    hf = { id: null, ring: (g && g.ring) || 'terre', name: '', cue: '', tiny: '', days: [...ALL_DAYS], moment: 'matin', goalId: g ? g.id : '', start: todayISO() };
  }
  const active = HABITS().filter(h => !h.archivedAt).sort(byOrder), archived = HABITS().filter(h => h.archivedAt);
  const anch = active.filter(h => anchorDay(h) < ANCHOR_DAYS).length;

  el.innerHTML = `
    <div class="view-head"><div><h1>Rituels</h1><p>Les petites actions quotidiennes qui te rapprochent de tes objectifs. Ici, la régularité compte plus que l'intensité.</p></div>
      ${hf ? '' : '<a class="btn primary" href="#rituels/new">Nouveau rituel</a>'}</div>
    ${hf ? habitFormHTML(anch) : ''}
    <details class="card guide" ${HABITS().length && !hf ? '' : 'open'}>
      <summary><h2>Comment ancrer un rituel</h2><span class="fine">Cinq règles tirées de la recherche sur les habitudes, lues avec Musashi</span></summary>
      <ol class="rules">
        <li><b>Commence minuscule.</b> Chaque rituel a une version minimale de deux minutes. Les jours difficiles, fais-la : elle compte, et c'est elle qui maintient la chaîne. <em>La Voie est dans la pratique.</em></li>
        <li><b>Accroche-le à une habitude existante.</b> « Après mon café, je lis 20 pages. » Un déclencheur précis vaut mieux que la volonté du moment.</li>
        <li><b>Un ou deux à la fois.</b> Garde au plus deux rituels en phase d'ancrage. Musashi reproche aux écoles de multiplier les techniques : garde l'essentiel.</li>
        <li><b>Ne manque jamais deux fois.</b> Rater un jour n'efface rien. Rater deux jours de suite, c'est commencer une autre habitude : celle de ne pas le faire.</li>
        <li><b>Compte en jours, pas en efforts.</b> Il faut en moyenne 66 jours pour qu'un geste devienne automatique, de 18 à 254 selon les personnes (Lally et al., 2009). La barre d'ancrage suit ce chemin.</li>
      </ol>
    </details>
    ${active.length ? RINGS.map(r => {
      const list = active.filter(h => h.ring === r.id); if (!list.length) return '';
      return `<section class="hgroup" style="--ring:${ringColor(r.id)}"><h2 class="sec-r"><span>${r.kanji}</span> ${r.name}<small>${list.length} rituel${list.length > 1 ? 's' : ''}</small></h2>
        <ul class="hlist">${list.map(habitCardHTML).join('')}</ul></section>`;
    }).join('') : (hf ? '' : `<div class="card empty"><div class="k">習</div><h2>Aucun rituel pour l'instant</h2><p>Commence par un seul. Choisis-le minuscule, accroche-le à ce que tu fais déjà, et ne le lâche plus pendant 66 jours.</p><a class="btn primary" href="#rituels/new">Créer mon premier rituel</a></div>`)}
    ${archived.length ? `<details class="card arch"><summary>Rituels archivés (${archived.length})</summary><ul class="hlist">${archived.map(habitCardHTML).join('')}</ul></details>` : ''}`;

  if (!el._bound) { el._bound = true; bindRituels(el); }
  if (hf) { const n = $('#hfName'); if (n && !n.value) n.focus(); }
}
function habitCardHTML(h) {
  const s = hStreak(h), rate = hRate(h, 30), ad = anchorDay(h), g = goalOf(h), t = todayISO();
  const strip = Array.from({ length: 28 }, (_, i) => {
    const d = addDays(t, i - 27); let c = 'off';
    if (scheduled(h, d)) { const v = doneVal(h, d); c = v >= 1 ? 'on' : v > 0 ? 'half' : d === t ? 'todo' : 'miss'; }
    return `<i class="${c}" title="${esc(fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' }))}"></i>`;
  }).join('');
  return `<li class="hcard" data-h="${h.id}" style="--ring:${ringColor(h.ring)}">
    <div class="hc-main">
      <div class="hc-title"><b>${esc(h.name)}</b>${g ? `<a class="gchip" href="#objectifs">→ ${esc(g.title)}</a>` : ''}</div>
      <div class="hc-sent">${h.cue ? `Après ${esc(lc(h.cue))}` : '<span class="nocue">Sans déclencheur : ajoute « après… » pour l’ancrer</span>'}${h.tiny ? ` · minimum : ${esc(lc(h.tiny))}` : ''} · ${daysTxt(h.days)}</div>
      <div class="strip" aria-label="28 derniers jours">${strip}</div>
    </div>
    <div class="hc-stats">
      <div><b>${s}</b><small>série</small></div>
      <div><b>${rate == null ? '—' : Math.round(rate * 100) + ' %'}</b><small>30 j</small></div>
      <div class="anc">${h.archivedAt ? '<small>archivé</small>' : ad >= ANCHOR_DAYS ? '<span class="tag ok">ancré</span>' : `<small>ancrage ${ad}/${ANCHOR_DAYS}</small><div class="tbar"><i style="width:${ad / ANCHOR_DAYS * 100}%"></i></div>`}</div>
    </div>
    <div class="hc-act"><a class="btn sm" href="#rituels/edit/${h.id}">Modifier</a>${h.archivedAt ? '' : `<button type="button" class="btn sm ghost" data-hmove="-1" aria-label="Monter">↑</button><button type="button" class="btn sm ghost" data-hmove="1" aria-label="Descendre">↓</button>`}</div>
  </li>`;
}
function habitFormHTML(anch) {
  const isNew = !hf.id, gs = goals().filter(g => g.status !== 'atteint');
  return `<div class="card hform" id="hform" style="--ring:${ringColor(hf.ring)}">
    <h2>${isNew ? 'Nouveau rituel' : 'Modifier le rituel'}</h2>
    ${isNew && anch >= 2 ? `<div class="warnbox">Tu as déjà <b>${anch} rituels en ancrage</b>. « Ne fais rien d'inutile » : un rituel de plus dilue ton attention. Envisage d'attendre que l'un d'eux soit ancré.</div>` : ''}
    <div class="hf-grid">
      <label class="f full"><span>Rituel <em>une action concrète</em></span><input type="text" id="hfName" maxlength="80" value="${esc(hf.name)}" placeholder="Ex. : lire 20 pages"></label>
      <div class="f full"><div class="f-lbl">Anneau</div><div class="chips" id="hfRing">${RINGS.map(r => `<button type="button" class="chip" data-v="${r.id}" aria-pressed="${hf.ring === r.id}">${r.kanji} ${r.name}</button>`).join('')}</div></div>
      <label class="f"><span>Après… <em>déclencheur existant</em></span><input type="text" id="hfCue" maxlength="80" value="${esc(hf.cue || '')}" placeholder="Ex. : mon café du matin"></label>
      <label class="f"><span>Version minimale <em>2 minutes</em></span><input type="text" id="hfTiny" maxlength="80" value="${esc(hf.tiny || '')}" placeholder="Ex. : lire 1 page"></label>
      <div class="f"><div class="f-lbl">Moment</div><div class="chips" id="hfMoment">${MOMENTS.map(([v, t]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${hf.moment === v}">${t}</button>`).join('')}</div></div>
      <div class="f"><div class="f-lbl">Jours <em id="hfDaysTxt">${daysTxt(hf.days)}</em></div><div class="chips days" id="hfDays">${DOW.map((t, i) => `<button type="button" class="chip" data-v="${i}" aria-pressed="${hf.days.includes(i)}">${t.slice(0, 2)}</button>`).join('')}</div></div>
      <label class="f"><span>Au service de l'objectif</span><select id="hfGoal"><option value="">— aucun —</option>${gs.map(g => `<option value="${g.id}" ${hf.goalId === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>
      <label class="f"><span>Début</span><input type="date" id="hfStart" value="${hf.start || todayISO()}"></label>
    </div>
    <div class="ideas"><div class="f-lbl">Idées pour cet anneau</div><div class="chips" id="hfIdeas">${ideasHTML()}</div></div>
    <p class="hf-preview" id="hfPreview">${previewTxt()}</p>
    <div class="row"><button class="btn primary" id="hfSave" type="button">Enregistrer</button><a class="btn ghost" href="#rituels">Annuler</a>
      ${isNew ? '' : `<span class="grow"></span><button class="btn ghost" id="hfArchive" type="button">${hf.archivedAt ? 'Réactiver' : 'Archiver'}</button><button class="btn ghost danger" id="hfDel" type="button">Supprimer</button>`}</div>
  </div>`;
}
const ideasHTML = () => (HABIT_IDEAS[hf.ring] || []).map((x, i) => `<button type="button" class="chip idea" data-i="${i}">${esc(x.name)}</button>`).join('');
function previewTxt() {
  const n = (hf.name || '').trim(), c = (hf.cue || '').trim(), t = (hf.tiny || '').trim();
  if (!n) return 'Formule ton intention : <b>après</b> [ce que tu fais déjà], <b>je</b> [ton rituel].';
  return `Intention : ${c ? `après ${esc(lc(c))}, ` : ''}je m'engage à <b>${esc(lc(n))}</b>, ${daysTxt(hf.days)}.${t ? ` Les jours difficiles : ${esc(lc(t))}.` : ''}`;
}
function bindRituels(el) {
  el.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const grp = b.parentElement && b.parentElement.id;
    if (hf && grp === 'hfRing') { hf.ring = b.dataset.v; $$('#hfRing .chip').forEach(c => c.setAttribute('aria-pressed', c === b)); $('#hform').style.setProperty('--ring', ringColor(hf.ring)); $('#hfIdeas').innerHTML = ideasHTML(); return; }
    if (hf && grp === 'hfMoment') { hf.moment = b.dataset.v; $$('#hfMoment .chip').forEach(c => c.setAttribute('aria-pressed', c === b)); return; }
    if (hf && grp === 'hfDays') {
      const i = +b.dataset.v; hf.days = hf.days.includes(i) ? hf.days.filter(x => x !== i) : [...hf.days, i].sort();
      b.setAttribute('aria-pressed', hf.days.includes(i)); $('#hfDaysTxt').textContent = daysTxt(hf.days); $('#hfPreview').innerHTML = previewTxt(); return;
    }
    if (hf && grp === 'hfIdeas') {
      const x = HABIT_IDEAS[hf.ring][+b.dataset.i];
      Object.assign(hf, { name: x.name, cue: x.cue, tiny: x.tiny, days: [...(x.days || ALL_DAYS)], moment: x.moment || hf.moment });
      $('#hfName').value = hf.name; $('#hfCue').value = hf.cue; $('#hfTiny').value = hf.tiny;
      $$('#hfDays .chip').forEach(c => c.setAttribute('aria-pressed', hf.days.includes(+c.dataset.v)));
      $$('#hfMoment .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.v === hf.moment));
      $('#hfDaysTxt').textContent = daysTxt(hf.days); $('#hfPreview').innerHTML = previewTxt(); return;
    }
    if (b.id === 'hfSave') return saveHabit();
    if (b.id === 'hfArchive') {
      const h = C().habits.find(x => x.id === hf.id); if (!h) return;
      if (h.archivedAt) delete h.archivedAt; else h.archivedAt = todayISO();
      h.updatedAt = Date.now(); touchCfg(); toast(h.archivedAt ? 'Rituel archivé. Son historique est conservé.' : 'Rituel réactivé'); location.hash = 'rituels'; return;
    }
    if (b.id === 'hfDel') {
      if (!confirm(`Supprimer définitivement « ${hf.name} » ? Archiver conserve son historique.`)) return;
      const h = C().habits.find(x => x.id === hf.id); if (h) Object.assign(h, { deleted: true, updatedAt: Date.now() });
      touchCfg(); toast('Rituel supprimé'); location.hash = 'rituels'; return;
    }
    if (b.dataset.hmove) {
      const id = b.closest('[data-h]').dataset.h, h = C().habits.find(x => x.id === id); if (!h) return;
      const list = HABITS().filter(x => !x.archivedAt && x.ring === h.ring).sort(byOrder);
      list.forEach((x, i) => { x.order = i; });
      const i = list.indexOf(h), j = i + +b.dataset.hmove; if (j < 0 || j >= list.length) return;
      [list[i].order, list[j].order] = [list[j].order, list[i].order];
      list[i].updatedAt = list[j].updatedAt = Date.now(); touchCfg(); renderRituels();
    }
  });
  el.addEventListener('input', ev => {
    if (!hf) return; const t = ev.target;
    const map = { hfName: 'name', hfCue: 'cue', hfTiny: 'tiny' };
    if (map[t.id]) { hf[map[t.id]] = t.value; $('#hfPreview').innerHTML = previewTxt(); }
  });
  el.addEventListener('change', ev => {
    if (!hf) return; const t = ev.target;
    if (t.id === 'hfGoal') hf.goalId = t.value;
    if (t.id === 'hfStart') hf.start = t.value || todayISO();
  });
  el.addEventListener('keydown', ev => { if (ev.key === 'Enter' && hf && ev.target.matches('#hform input[type="text"]')) { ev.preventDefault(); saveHabit(); } });
}
function saveHabit() {
  if (!hf.name.trim()) { toast('Donne un nom à ton rituel'); $('#hfName').focus(); return; }
  if (!hf.days.length) { toast('Choisis au moins un jour'); return; }
  const rec = {
    id: hf.id || uid('h'), ring: hf.ring, name: hf.name.trim(), cue: (hf.cue || '').trim(), tiny: (hf.tiny || '').trim(),
    days: [...hf.days].sort(), moment: hf.moment || 'journee', goalId: hf.goalId || '', start: hf.start || todayISO(),
    order: hf.order ?? HABITS().length, updatedAt: Date.now(),
  };
  if (hf.archivedAt) rec.archivedAt = hf.archivedAt;
  if (hf.demo) rec.demo = true;
  const i = C().habits.findIndex(h => h.id === rec.id);
  if (i >= 0) C().habits[i] = rec; else C().habits.push(rec);
  touchCfg(); toast(hf.id ? 'Rituel mis à jour' : 'Rituel créé. Il apparaît dans l’anneau du jour.');
  location.hash = 'rituels';
}

/* ------------------------------------------------------------
 * Vue : Objectifs (vision, revue hebdo, objectifs et étapes)
 * ------------------------------------------------------------ */
let gf = null;   // objectif en cours d'édition
function renderObjectifs() {
  const el = $('#view-objectifs');
  const [, sub, arg] = location.hash.slice(1).split('/');
  gf = null;
  if (sub === 'new') gf = { id: null, title: '', domain: 'Carrière', ring: 'terre', deadline: addDays(todayISO(), 365), why: '', ringSet: false };
  if (sub === 'edit') { const g = goals().find(x => x.id === arg); if (g) gf = { ...g, ringSet: true }; }
  const gs = goals();
  const rank = g => g.status === 'actif' ? 0 : 1;
  const active = gs.filter(g => g.status !== 'atteint').sort((a, b) => rank(a) - rank(b) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const achieved = gs.filter(g => g.status === 'atteint');
  const nMs = active.reduce((a, g) => a + (g.milestones || []).filter(m => !m.done).length, 0);
  const nH = HABITS().filter(h => !h.archivedAt && h.goalId && active.some(g => g.id === h.goalId)).length;

  el.innerHTML = `
    <div class="view-head"><div><h1>Objectifs</h1><p>Un cap lointain, des étapes intermédiaires, des rituels quotidiens. Connais le petit pour connaître le grand.</p></div>
      ${gf ? '' : '<a class="btn primary" href="#objectifs/new">Nouvel objectif</a>'}</div>
    ${gf ? goalFormHTML() : ''}
    <div class="ladder card">
      <div><span class="lk">道</span><b>Vision</b><small>3 à 5 ans</small></div><i>→</i>
      <div><span class="lk">目</span><b>${active.length} objectif${active.length > 1 ? 's' : ''}</b><small>6 mois à 3 ans</small></div><i>→</i>
      <div><span class="lk">段</span><b>${nMs} étape${nMs > 1 ? 's' : ''}</b><small>semaines, mois</small></div><i>→</i>
      <div><span class="lk">習</span><b>${nH} rituel${nH > 1 ? 's' : ''} liés</b><small>chaque jour</small></div>
    </div>
    ${active.length ? `<div class="goals">${active.map(goalCardHTML).join('')}</div>`
      : (gf ? '' : `<div class="card empty"><div class="k">目</div><h2>Aucun objectif pour l'instant</h2><p>Choisis un cap à 1 ou 3 ans, par exemple pour ta carrière. Découpe-le en 3 à 6 étapes, puis relie-le à un rituel quotidien.</p><a class="btn primary" href="#objectifs/new">Fixer mon premier objectif</a></div>`)}
    <div class="grid g2 obj-top">${visionHTML()}${reviewHTML()}</div>
    ${achieved.length ? `<details class="card arch"><summary>Objectifs atteints (${achieved.length})</summary><div class="goals">${achieved.map(goalCardHTML).join('')}</div></details>` : ''}`;

  if (!el._bound) { el._bound = true; bindObjectifs(el); }
  if (gf && !gf.id) { const t = $('#gfTitle'); if (t) t.focus(); }
}
function goalFormHTML() {
  const isNew = !gf.id;
  return `<div class="card gform" id="gform" style="--ring:${ringColor(gf.ring || 'terre')}">
    <h2>${isNew ? 'Nouvel objectif' : 'Modifier l’objectif'}</h2>
    <div class="hf-grid">
      <label class="f full"><span>Objectif <em>précis et vérifiable</em></span><input type="text" id="gfTitle" maxlength="120" value="${esc(gf.title)}" placeholder="Ex. : décrocher un poste de data scientist senior"></label>
      <label class="f"><span>Axe</span><select id="gfDomain">${DOMAINS.map(([d]) => `<option ${gf.domain === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="f"><span>Échéance</span><input type="date" id="gfDeadline" value="${gf.deadline || ''}"></label>
      <div class="f full"><div class="f-lbl">Anneau</div><div class="chips" id="gfRing">${RINGS.map(r => `<button type="button" class="chip" data-v="${r.id}" aria-pressed="${gf.ring === r.id}">${r.kanji} ${r.name}</button>`).join('')}</div></div>
      <label class="f full"><span>Pourquoi <em>ce qui te fera tenir les jours sans</em></span><textarea id="gfWhy" rows="2" maxlength="400" placeholder="Ex. : travailler sur des sujets qui me passionnent, avec plus d'autonomie">${esc(gf.why || '')}</textarea></label>
      ${isNew ? `<label class="f full"><span>Étapes intermédiaires <em>une par ligne, dans l'ordre</em></span><textarea id="gfSteps" rows="5" placeholder="Terminer la certification en machine learning&#10;Publier 3 projets sur GitHub&#10;Refaire mon CV et mon LinkedIn&#10;Postuler à 10 offres ciblées&#10;Passer les entretiens"></textarea></label>
      <label class="check full"><input type="checkbox" id="gfSpread" checked> Répartir les échéances des étapes jusqu'à la date de l'objectif</label>` : ''}
    </div>
    <div class="row"><button class="btn primary" id="gfSave" type="button">${isNew ? 'Créer l’objectif' : 'Enregistrer'}</button><a class="btn ghost" href="#objectifs">Annuler</a></div>
  </div>`;
}
function goalCardHTML(g) {
  const t = todayISO(), ms = g.milestones || [], dn = ms.filter(m => m.done).length;
  const pct = ms.length ? dn / ms.length : (g.status === 'atteint' ? 1 : 0);
  const tp = g.deadline && g.start ? clamp(daysBetween(g.start, t) / Math.max(1, daysBetween(g.start, g.deadline)), 0, 1) : null;
  const late = ms.filter(m => !m.done && m.due && m.due < t), next = ms.find(m => !m.done);
  const hs = HABITS().filter(h => h.goalId === g.id && !h.archivedAt);
  const left = g.deadline ? daysBetween(t, g.deadline) : null;
  let pace = '';
  if (g.status === 'atteint') pace = `<span class="tag ok">atteint${g.doneAt ? ' le ' + esc(fmtDay(g.doneAt, { day: 'numeric', month: 'long', year: 'numeric' })) : ''}</span>`;
  else if (g.status === 'pause') pace = '<span class="tag">en pause</span>';
  else if (tp != null && ms.length) pace = pct + .05 >= tp ? '<span class="tag ok">dans les temps</span>' : '<span class="tag warn">en retard sur le rythme</span>';
  const r = RING_BY_ID[g.ring];
  return `<article class="card goal ${g.status}" data-g="${g.id}" style="--ring:${ringColor(g.ring || 'terre')}">
    <header>
      <span class="kanji">${r ? r.kanji : '目'}</span>
      <div class="g-h"><div class="g-dom">${esc(g.domain || '')}</div><h3>${esc(g.title)}</h3></div>
      <div class="g-act">
        <a class="btn sm ghost" href="#objectifs/edit/${g.id}">Modifier</a>
        ${g.status === 'atteint' ? '<button type="button" class="btn sm ghost" data-gact="reopen">Rouvrir</button>'
          : `<button type="button" class="btn sm ghost" data-gact="${g.status === 'pause' ? 'resume' : 'pause'}">${g.status === 'pause' ? 'Reprendre' : 'Pause'}</button><button type="button" class="btn sm" data-gact="achieve">Atteint</button>`}
        <button type="button" class="btn sm ghost danger" data-gact="del" aria-label="Supprimer l'objectif">×</button>
      </div>
    </header>
    ${g.why ? `<p class="why">${esc(g.why)}</p>` : ''}
    <div class="g-prog">
      <div class="gbar"><i style="width:${pct * 100}%"></i>${tp != null && g.status === 'actif' ? `<span class="tick" style="left:${tp * 100}%" title="Temps écoulé : ${Math.round(tp * 100)} %"></span>` : ''}</div>
      <div class="g-meta"><span><b>${dn} / ${ms.length}</b> étape${ms.length > 1 ? 's' : ''} · ${Math.round(pct * 100)} %</span>
        ${g.deadline ? `<span>échéance ${esc(fmtDay(g.deadline, { day: 'numeric', month: 'short', year: 'numeric' }))}${left != null && g.status !== 'atteint' ? ` · ${left >= 0 ? `J−${left}` : `dépassée de ${-left} j`}` : ''}</span>` : ''}
        ${pace}</div>
    </div>
    ${late.length && g.status === 'actif' ? `<div class="warnbox"><b>Montagne et mer.</b> ${late.length} étape${late.length > 1 ? 's' : ''} en retard. Quand une approche a échoué deux fois, change-la plutôt que d'insister : découpe l'étape, change de méthode ou décale l'échéance.</div>` : ''}
    <ol class="ms">${ms.map(m => msHTML(m, m === next && g.status === 'actif')).join('')}</ol>
    ${g.status !== 'atteint' ? `<div class="ms-add"><input type="text" data-msnew maxlength="140" placeholder="+ Ajouter une étape" aria-label="Nouvelle étape"><input type="date" data-msdue aria-label="Échéance de l'étape"><button type="button" class="btn sm" data-gact="msadd">Ajouter</button></div>` : ''}
    <div class="g-links"><div class="f-lbl">Rituels au service de cet objectif</div>
      <div class="chips">${hs.map(h => { const rr = hRate(h, 30); return `<a class="chip" href="#rituels/edit/${h.id}">${RING_BY_ID[h.ring].kanji} ${esc(h.name)} · ${rr == null ? '—' : Math.round(rr * 100) + ' %'}</a>`; }).join('')}
        ${g.status !== 'atteint' ? `<a class="chip add" href="#rituels/new/${g.id}">+ Rituel quotidien</a>` : ''}</div>
      ${!hs.length && g.status === 'actif' ? '<p class="fine">Un objectif sans rituel reste un souhait. Quelle petite action, chaque jour, le rapprocherait ?</p>' : ''}</div>
  </article>`;
}
function msHTML(m, isNext) {
  const late = !m.done && m.due && m.due < todayISO();
  return `<li class="m ${m.done ? 'on' : ''} ${late ? 'late' : ''} ${isNext ? 'next' : ''}" data-m="${m.id}">
    <button type="button" class="hb-check sm" data-gact="mtoggle" aria-pressed="${!!m.done}" aria-label="Étape franchie">${CHECK_SVG}</button>
    <input type="text" class="m-t" data-gedit="t" value="${esc(m.t)}" maxlength="140" aria-label="Étape">
    ${isNext ? '<span class="tag now">prochaine</span>' : ''}${late ? '<span class="tag warn">en retard</span>' : ''}
    <input type="date" class="m-d" data-gedit="due" value="${m.due || ''}" aria-label="Échéance">
    <span class="m-tools"><button type="button" class="x" data-gact="mup" aria-label="Monter">↑</button><button type="button" class="x" data-gact="mdel" aria-label="Supprimer l'étape">×</button></span>
  </li>`;
}
function visionHTML() {
  const v = C().vision || {};
  return `<div class="card vision"><h2><span style="color:var(--shu)">道</span> Ma Voie</h2>
    <p class="sub">Qui veux-tu devenir dans trois à cinq ans ? Tes objectifs en découlent.</p>
    <label class="f"><span>Vision</span><textarea data-vis="text" rows="3" maxlength="800" placeholder="Ex. : data scientist reconnu, en forme, entouré, qui lit beaucoup et termine ce qu'il commence.">${esc(v.text || '')}</textarea></label>
    <label class="f" style="margin-top:10px"><span>Je deviens quelqu'un qui… <em>identité</em></span><textarea data-vis="identity" rows="2" maxlength="400" placeholder="…ne rate jamais deux séances, apprend chaque jour, écoute avant de parler.">${esc(v.identity || '')}</textarea></label>
    <p class="fine">Chaque rituel coché est un vote pour cette personne.</p></div>`;
}
function reviewHTML() {
  const t = todayISO(), mon = addDays(t, -dow(t)), r = C().reviews[mon] || {};
  const days = []; for (let d = mon; d <= t; d = addDays(d, 1)) days.push(d);
  let sch = 0, dn = 0;
  for (const d of days) for (const h of habitsOn(d)) { if (d === t && !doneVal(h, d)) continue; sch++; if (doneVal(h, d) > 0) dn++; }
  const ms = goals().flatMap(g => g.milestones || []).filter(m => m.done && m.doneAt >= mon).length;
  const logged = days.filter(d => get(d)).length;
  const past = Object.entries(C().reviews).filter(([k, v]) => k < mon && (v.win || v.lesson || v.next)).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8);
  return `<div class="card review"><h2>Revue de la semaine</h2>
    <p class="sub">Semaine du ${esc(fmtDay(mon, { day: 'numeric', month: 'long' }))}. Le dimanche soir, prends cinq minutes.</p>
    <div class="stats"><div>Rituels tenus<b>${sch ? Math.round(dn / sch * 100) + ' %' : '—'}</b></div><div>Étapes franchies<b>${ms}</b></div><div>Jours consignés<b>${logged} / ${days.length}</b></div></div>
    ${[['win', 'Ma victoire de la semaine'], ['lesson', 'Ce qui a coincé, et pourquoi'], ['next', 'Mon cap pour la semaine prochaine']].map(([k, l]) =>
      `<label class="f rv"><span>${l}</span><textarea rows="2" maxlength="600" data-rev="${k}" data-week="${mon}">${esc(r[k] || '')}</textarea></label>`).join('')}
    ${past.length ? `<details class="past"><summary>Revues précédentes (${past.length})</summary>${past.map(([k, v]) => `<div class="pr-item"><div class="pr-n">Semaine du ${esc(fmtDay(k, { day: 'numeric', month: 'long' }))}</div>
      ${v.win ? `<p><b>Victoire :</b> ${esc(v.win)}</p>` : ''}${v.lesson ? `<p><b>Leçon :</b> ${esc(v.lesson)}</p>` : ''}${v.next ? `<p><b>Cap :</b> ${esc(v.next)}</p>` : ''}</div>`).join('')}</details>` : ''}
  </div>`;
}
let textT = null;
function bindObjectifs(el) {
  el.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (gf && b.parentElement && b.parentElement.id === 'gfRing') {
      gf.ring = b.dataset.v; gf.ringSet = true;
      $$('#gfRing .chip').forEach(c => c.setAttribute('aria-pressed', c === b)); $('#gform').style.setProperty('--ring', ringColor(gf.ring)); return;
    }
    if (b.id === 'gfSave') return saveGoal();
    const act = b.dataset.gact; if (!act) return;
    const card = b.closest('[data-g]'), g = card && C().goals.find(x => x.id === card.dataset.g); if (!g) return;
    const mid = b.closest('[data-m]') && b.closest('[data-m]').dataset.m, ms = g.milestones || (g.milestones = []);
    if (act === 'mtoggle') { toggleMilestone(g.id, mid); return renderObjectifs(); }
    if (act === 'pause') g.status = 'pause';
    else if (act === 'resume' || act === 'reopen') { g.status = 'actif'; delete g.doneAt; }
    else if (act === 'achieve') { g.status = 'atteint'; g.doneAt = todayISO(); toast('Objectif atteint. Prends le temps de le célébrer, puis fixe le suivant.', 3500); }
    else if (act === 'del') { if (!confirm(`Supprimer l'objectif « ${g.title} » et ses étapes ?`)) return; g.deleted = true; }
    else if (act === 'mdel') { const i = ms.findIndex(m => m.id === mid); if (i >= 0) ms.splice(i, 1); }
    else if (act === 'mup') { const i = ms.findIndex(m => m.id === mid); if (i > 0) [ms[i - 1], ms[i]] = [ms[i], ms[i - 1]]; }
    else if (act === 'msadd') {
      const inp = card.querySelector('[data-msnew]'), due = card.querySelector('[data-msdue]').value, txt = inp.value.trim();
      if (!txt) { inp.focus(); return; }
      ms.push({ id: uid('m'), t: txt, done: false, ...(due ? { due } : {}) });
    } else return;
    g.updatedAt = Date.now(); touchCfg(); renderObjectifs();
    if (act === 'msadd') { const c = $(`[data-g="${g.id}"] [data-msnew]`); if (c) c.focus(); }
  });
  el.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return; const t = ev.target;
    if (t.matches('[data-msnew]')) { ev.preventDefault(); t.closest('[data-g]').querySelector('[data-gact="msadd"]').click(); }
    else if (t.matches('[data-gedit="t"]')) { ev.preventDefault(); t.blur(); }
    else if (gf && t.id === 'gfTitle') { ev.preventDefault(); saveGoal(); }
  });
  el.addEventListener('change', ev => {
    const t = ev.target;
    if (gf && t.id === 'gfDomain' && !gf.ringSet) {
      const rid = (DOMAINS.find(d => d[0] === t.value) || [])[1];
      if (rid) { gf.ring = rid; $$('#gfRing .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.v === rid)); $('#gform').style.setProperty('--ring', ringColor(rid)); }
      return;
    }
    if (t.dataset.gedit) {
      const g = C().goals.find(x => x.id === t.closest('[data-g]').dataset.g), m = g && (g.milestones || []).find(x => x.id === t.closest('[data-m]').dataset.m);
      if (!m) return;
      if (t.dataset.gedit === 't') m.t = t.value.trim() || m.t;
      else if (t.value) m.due = t.value; else delete m.due;
      g.updatedAt = Date.now(); touchCfg();
      if (t.dataset.gedit === 'due') renderObjectifs();
      return;
    }
    if (t.dataset.vis || t.dataset.rev) saveText(t);
  });
  el.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.vis || t.dataset.rev) { clearTimeout(textT); textT = setTimeout(() => saveText(t), 700); }
  });
}
function saveText(t) {
  if (t.dataset.vis) { C().vision = { ...(C().vision || {}), [t.dataset.vis]: t.value.trim(), updatedAt: Date.now() }; }
  else { const w = t.dataset.week; C().reviews[w] = { ...(C().reviews[w] || {}), [t.dataset.rev]: t.value.trim(), updatedAt: Date.now() }; }
  touchCfg();
}
function saveGoal() {
  const title = $('#gfTitle').value.trim();
  if (!title) { toast("Donne un titre à l'objectif"); $('#gfTitle').focus(); return; }
  const now = Date.now(), deadline = $('#gfDeadline').value || '', domain = $('#gfDomain').value, why = $('#gfWhy').value.trim();
  if (gf.id) {
    const g = C().goals.find(x => x.id === gf.id);
    Object.assign(g, { title, domain, ring: gf.ring, deadline, why, updatedAt: now });
    toast('Objectif mis à jour');
  } else {
    const lines = $('#gfSteps').value.split('\n').map(s => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);
    const start = todayISO(), spread = $('#gfSpread').checked && deadline > start, span = spread ? daysBetween(start, deadline) : 0;
    const milestones = lines.map((t, i) => ({ id: uid('m'), t, done: false, ...(spread ? { due: addDays(start, Math.round(span * (i + 1) / lines.length)) } : {}) }));
    C().goals.push({ id: uid('g'), title, domain, ring: gf.ring, deadline, why, status: 'actif', start, milestones, updatedAt: now });
    toast(milestones.length ? `Objectif créé avec ${milestones.length} étape${milestones.length > 1 ? 's' : ''}. Relie-le maintenant à un rituel.` : 'Objectif créé. Ajoute ses étapes intermédiaires.', 3500);
  }
  touchCfg(); location.hash = 'objectifs';
}

/* ------------------------------------------------------------
 * Réglages : éditeur des anneaux et métriques
 * ------------------------------------------------------------ */
const MTYPES = [['num', 'Nombre'], ['scale', 'Échelle 1–5'], ['check', 'Oui / non'], ['select', 'Choix'], ['text', 'Texte']];
let mx = null;
function metricsDraft() {
  return Object.fromEntries(RINGS.map(r => [r.id, {
    sub: r.sub,
    list: r.metrics.map(m => ({ ...m, _t: isNum(target(m.k)) ? target(m.k) : null, _orig: m.label })),
  }]));
}
function renderMetricsEditor(box) {
  if (!box) return;
  mx = mx || metricsDraft();
  box.innerHTML = `<h2>Anneaux & métriques</h2>
    <p class="sub">Renomme, ajoute ou retire ce que tu mesures chaque jour, et règle tes objectifs. Atteindre l'objectif d'une métrique donne 100 %. Tes rituels comptent aussi dans le score de leur anneau.</p>
    <div class="me-row me-th" aria-hidden="true"><span>Métrique</span><span>Type</span><span>Unité</span><span>Objectif / jour</span><span></span></div>
    ${RINGS.map(r => `<div class="me-ring" style="--ring:${ringColor(r.id)}">
      <div class="me-head"><span class="kanji">${r.kanji}</span><b>${r.name}</b><input type="text" class="me-sub" data-sub="${r.id}" value="${esc(mx[r.id].sub)}" maxlength="80" aria-label="Description de l'anneau ${r.name}"></div>
      <div class="me-rows">${mx[r.id].list.map((m, i) => meRowHTML(r.id, m, i)).join('') || '<p class="fine">Aucune métrique : seuls les rituels comptent pour cet anneau.</p>'}</div>
      <button type="button" class="btn sm ghost" data-me="add" data-r="${r.id}">+ Ajouter une métrique</button>
    </div>`).join('')}
    <div class="row" style="margin-top:16px"><button type="button" class="btn primary" data-me="save">Enregistrer les métriques</button><button type="button" class="btn ghost" data-me="reset">Revenir aux métriques d'origine</button></div>
    <p class="fine">Retirer une métrique ne supprime pas tes données passées : elles réapparaissent si tu la rétablis.</p>`;
  if (box._bound) return;
  box._bound = true;
  box.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.sub) { mx[t.dataset.sub].sub = t.value; return; }
    const row = t.closest('.me-row'); if (!row || !t.dataset.f) return;
    const m = mx[row.dataset.r].list[+row.dataset.i];
    if (t.dataset.f === '_t') { const v = parseFloat(t.value.replace(',', '.')); m._t = isNum(v) ? v : null; }
    else if (t.dataset.f === 'options') m.options = t.value.split(',').map(s => s.trim());
    else if (t.dataset.f !== 'type') m[t.dataset.f] = t.value;
  });
  box.addEventListener('change', ev => {
    const t = ev.target; if (t.dataset.f !== 'type') return;
    const row = t.closest('.me-row'), m = mx[row.dataset.r].list[+row.dataset.i];
    m.type = t.value;
    if (m.type === 'num') { m.step = m.step || 'any'; m.max = m.max || 100000; }
    if (m.type === 'select' && !Array.isArray(m.options)) m.options = [];
    renderMetricsEditor(box);
  });
  box.addEventListener('click', ev => {
    const b = ev.target.closest('[data-me]'); if (!b) return;
    const act = b.dataset.me, row = b.closest('.me-row');
    if (act === 'add') {
      const k = uid('m_');
      mx[b.dataset.r].list.push({ k, label: 'Nouvelle métrique', short: 'Nouvelle métrique', type: 'num', unit: '', step: 'any', max: 100000, target: null, _t: null, _orig: 'Nouvelle métrique', custom: true });
      renderMetricsEditor(box);
      const rows = box.querySelectorAll(`.me-row[data-r="${b.dataset.r}"]`), inp = rows[rows.length - 1].querySelector('[data-f="label"]');
      inp.focus(); inp.select();
    } else if (act === 'del' || act === 'up') {
      const list = mx[row.dataset.r].list, i = +row.dataset.i;
      if (act === 'del') list.splice(i, 1); else if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      renderMetricsEditor(box);
    } else if (act === 'save') saveMetrics(box);
    else if (act === 'reset') {
      if (!confirm("Revenir aux métriques d'origine ? Tes données restent intactes.")) return;
      Object.assign(C(), { metrics: null, subs: {}, metricsAt: Date.now() });
      applyMetrics(); mx = null; touchCfg(); renderMetricsEditor(box); toast("Métriques d'origine rétablies");
    }
  });
}
function meRowHTML(rid, m, i) {
  const locked = m.bench || m.k === 'bench_reps';
  let extra;
  if (m.type === 'num') {
    extra = `<input type="text" data-f="unit" value="${esc(m.unit || '')}" placeholder="unité" maxlength="12" aria-label="Unité">
      ${m.bench ? '<span class="fine">noté vs record</span>' : m.noScore ? '<span class="fine">non noté</span>'
        : `<input type="number" data-f="_t" value="${m._t ?? ''}" placeholder="objectif" step="any" min="0" aria-label="Objectif quotidien">`}`;
  } else if (m.type === 'select') {
    extra = `<input type="text" class="span2" data-f="options" value="${esc((m.options || []).filter(Boolean).join(', '))}" placeholder="choix séparés par des virgules" aria-label="Choix">`;
  } else {
    extra = `<span class="span2 fine">${({ scale: 'noté de 1 à 5', check: 'oui = 100 %', text: 'non noté' })[m.type] || ''}</span>`;
  }
  return `<div class="me-row" data-r="${rid}" data-i="${i}">
    <input type="text" data-f="label" value="${esc(m.label)}" maxlength="60" aria-label="Nom de la métrique">
    <select data-f="type" ${locked ? 'disabled' : ''} aria-label="Type">${MTYPES.map(([v, t]) => `<option value="${v}" ${m.type === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${extra}
    <span class="me-tools"><button type="button" class="x" data-me="up" aria-label="Monter">↑</button><button type="button" class="x" data-me="del" aria-label="Retirer">×</button></span>
  </div>`;
}
function saveMetrics(box) {
  const metrics = {}, subs = {};
  for (const r of RINGS) {
    const s = (mx[r.id].sub || '').trim();
    if (s && s !== DEFAULT_SUBS[r.id]) subs[r.id] = s;
    metrics[r.id] = mx[r.id].list.map(m => {
      const { _t, _orig, ...rest } = m;
      rest.label = (rest.label || '').trim() || 'Sans nom';
      if (rest.label !== _orig || !rest.short) rest.short = rest.label;
      if (rest.type === 'num' && !rest.bench && !rest.noScore) {
        if (isNum(_t) && _t > 0) settings.targets[rest.k] = _t;
        else { delete settings.targets[rest.k]; rest.target = null; }
      }
      if (rest.type === 'select') rest.options = ['', ...(rest.options || []).filter(Boolean)];
      return rest;
    });
  }
  Object.assign(C(), { metrics, subs, metricsAt: Date.now() });
  settings.targetsAt = Date.now();
  applyMetrics(); mx = null; touchCfg(); renderMetricsEditor(box);
  toast('Métriques enregistrées');
}

/* ------------------------------------------------------------
 * Démo : rituels et objectifs d'exemple
 * ------------------------------------------------------------ */
function demoCfg(days) {
  const c = C(), T = todayISO(), start = addDays(T, -(days - 1)), now = Date.now();
  if (!c.habits.some(h => !h.deleted)) {
    const mk = (id, ring, name, cue, tiny, extra) => ({ id, ring, name, cue, tiny, days: [...ALL_DAYS], moment: 'matin', goalId: '', start, order: 0, demo: true, updatedAt: now, ...extra });
    c.habits.push(
      mk('demo_h1', 'terre', 'Bloc de travail profond (90 min)', 'mon premier café', '15 min sans notifications', { days: [0, 1, 2, 3, 4], goalId: 'demo_g1', _p: .62 }),
      mk('demo_h2', 'eau', 'Lire 20 pages', 'me mettre au lit', 'lire 1 page', { moment: 'soir', order: 1, goalId: 'demo_g3', _p: .58 }),
      mk('demo_h3', 'feu', 'Séance de sport', 'la fin du travail', 'mettre ma tenue et bouger 5 min', { days: [0, 2, 4, 5], goalId: 'demo_g2', moment: 'soir', _p: .66 }),
      mk('demo_h4', 'vide', 'Méditer 10 min', 'me brosser les dents le matin', '3 respirations profondes', { start: addDays(T, -40), _p: .5 }),
      mk('demo_h5', 'vent', 'Contacter une personne de mon réseau pro', 'ma pause du vendredi', 'un commentaire sincère', { days: [4], goalId: 'demo_g1', moment: 'journee', start: addDays(T, -20), _p: .7 }),
      mk('demo_h6', 'eau', 'Projet ML personnel (30 min)', 'le déjeuner', 'ouvrir le notebook', { days: [0, 1, 2, 3, 4, 5], goalId: 'demo_g1', moment: 'journee', start: addDays(T, -12), order: 2, _p: .55 }),
    );
  }
  if (!c.goals.some(g => !g.deleted)) {
    const ms = (t, due, done) => ({ id: uid('m'), t, due, done, ...(done ? { doneAt: addDays(due, -2) } : {}) });
    c.goals.push(
      { id: 'demo_g1', title: 'Décrocher un poste de data scientist senior', domain: 'Carrière', ring: 'terre', start: addDays(T, -60), deadline: addDays(T, 300), why: 'Travailler sur des problèmes qui me passionnent, avec plus d’autonomie.', status: 'actif', demo: true, updatedAt: now,
        milestones: [ms('Finir la certification Machine Learning', addDays(T, -30), true), ms('Publier 3 projets sur GitHub', addDays(T, -3), false), ms('Refaire mon CV et mon LinkedIn', addDays(T, 40), false), ms('Postuler à 10 offres ciblées', addDays(T, 150), false), ms('Passer les entretiens', addDays(T, 280), false)] },
      { id: 'demo_g2', title: 'Développer 100 kg au bench', domain: 'Santé & forme', ring: 'feu', start: addDays(T, -70), deadline: addDays(T, 120), why: 'Prouver que la régularité paie.', status: 'actif', demo: true, updatedAt: now,
        milestones: [ms('90 kg × 5', addDays(T, -20), true), ms('95 kg × 3', addDays(T, 30), false), ms('100 kg × 1', addDays(T, 110), false)] },
      { id: 'demo_g3', title: 'Lire 24 livres cette année', domain: 'Savoir & compétences', ring: 'eau', start: addDays(T, -300), deadline: addDays(T, 60), why: '', status: 'actif', demo: true, updatedAt: now,
        milestones: [ms('6 livres', addDays(T, -200), true), ms('12 livres', addDays(T, -110), true), ms('18 livres', addDays(T, -20), true), ms('24 livres', addDays(T, 55), false)] },
    );
  }
  saveSettings();
  return c.habits.filter(h => h.demo && !h.deleted);
}
function demoDone(e, d, rnd, prog, hs) {
  const done = {};
  for (const h of hs) {
    if (!scheduled(h, d)) continue;
    if (d === todayISO() && h.moment !== 'matin') continue;   // la journée n'est pas finie
    if (rnd() < (h._p || .6) + prog * .3) done[h.id] = h.tiny && rnd() < .15 ? .5 : 1;
  }
  if (Object.keys(done).length) e.done = done;
  if (rnd() < .5) {
    e.intention = ['Finir le notebook de clustering', 'Envoyer ma candidature', 'Séance jambes complète', 'Terminer le chapitre 4', 'Appeler mes parents', 'Préparer la démo du projet'][Math.floor(rnd() * 6)];
    if (rnd() < .7 && d !== todayISO()) e.intention_done = true;
  }
  if (d === todayISO()) {
    e.intention = 'Publier le deuxième projet sur GitHub';
    delete e.intention_done;
    e.todos = [{ id: uid('t'), t: 'Relire le README du projet', done: true, ring: 'terre' }, { id: uid('t'), t: 'Réserver le kiné', done: false }, { id: uid('t'), t: 'Répondre à Julie', done: false, ring: 'vent' }];
  }
}
