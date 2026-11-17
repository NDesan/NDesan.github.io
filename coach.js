/* Gorin — le maître (conseils tirés de tes données) et la séance (minuteur de concentration).
 * Chargé après rituels.js. Le coach n'invente rien : chaque conseil s'appuie sur tes chiffres.
 */
'use strict';

/* ------------------------------------------------------------
 * Conseils du jour
 * ------------------------------------------------------------ */
const LS_DISMISS = 'gorin.coach.dismiss.v1';
function dismissed() { const x = lsGet(LS_DISMISS, {}); return x.d === todayISO() ? x.ids || [] : []; }
function dismiss(id) { const ids = dismissed(); ids.push(id); lsSet(LS_DISMISS, { d: todayISO(), ids }); }

const pct = x => Math.round(x * 100) + ' %';
function lastDays(n, from = todayISO()) { const out = []; for (let i = n; i >= 1; i--) out.push(addDays(from, -i)); return out; }

function advice() {
  const t = todayISO(), out = [];
  const add = (id, p, o) => out.push({ id, p, ...o });
  const gs = goals(), active = gs.filter(g => g.status === 'actif'), hs = HABITS().filter(h => !h.archivedAt);
  const logged = live().filter(d => d < t);

  // 1. Les fondations : pas d'objectif, pas de rituel, pas de vision
  if (!active.length) add('nogoal', 90, { ring: 'terre', title: 'Fixe un cap', text: 'Sans objectif, chaque journée se décide au hasard. Choisis un cap à 6 mois ou 1 an et découpe-le en 3 à 5 étapes.', href: '#objectifs/new', cta: 'Fixer un objectif' });
  if (!hs.length) add('nohabit', 88, { ring: 'vide', title: 'Commence par un seul rituel', text: 'Le progrès vient de ce que tu fais chaque jour, pas de ce que tu fais une fois. Un rituel minuscule, accroché à une habitude existante, suffit pour commencer.', href: '#rituels/new', cta: 'Créer un rituel' });
  if (active.length && !(C().vision && C().vision.text)) add('novision', 40, { ring: 'vide', title: 'Écris ta vision', text: 'Qui veux-tu être dans 3 à 5 ans ? Deux phrases suffisent. Elles servent de boussole les jours où la motivation manque.', href: '#objectifs', cta: 'Écrire ma vision' });

  // 2. Étapes en retard : la plus en retard d'abord
  const late = active.flatMap(g => (g.milestones || []).filter(m => !m.done && m.due && m.due < t).map(m => ({ g, m })))
    .sort((a, b) => a.m.due.localeCompare(b.m.due));
  if (late.length) {
    const { g, m } = late[0];
    add('late:' + m.id, 80, { ring: g.ring || 'terre', title: `Étape en retard de ${daysBetween(m.due, t)} j`,
      text: `« ${esc(m.t)} » (${esc(g.title)}). Ne la porte pas en entier : fais-en l'essentiel du jour et avance d'un pas concret aujourd'hui.${late.length > 1 ? ` ${late.length - 1} autre${late.length > 2 ? 's' : ''} étape${late.length > 2 ? 's' : ''} en retard.` : ''}`,
      act: 'intent', arg: m.t, cta: "En faire l'essentiel du jour" });
  }

  // 3. Objectif actif sans rituel
  const orphan = active.find(g => !hs.some(h => h.goalId === g.id));
  if (orphan) add('orphan:' + orphan.id, 66, { ring: orphan.ring || 'terre', title: 'Un objectif sans rituel reste un souhait',
    text: `« ${esc(orphan.title)} » n'a aucune action quotidienne. Quel geste de 15 minutes, répété, le rendrait inévitable ?`, href: '#rituels/new/' + orphan.id, cta: 'Lier un rituel' });

  // 4. Rituel qui ne prend pas : réduire plutôt qu'abandonner
  const weak = hs.filter(h => anchorDay(h) >= 14).map(h => ({ h, r: hRate(h, 30) })).filter(x => x.r != null && x.r < .5).sort((a, b) => a.r - b.r)[0];
  if (weak) add('weak:' + weak.h.id, 68, { ring: weak.h.ring, title: `« ${esc(weak.h.name)} » ne tient qu'à ${pct(weak.r)}`,
    text: weak.h.tiny ? `Ce n'est pas un manque de volonté, c'est un rituel trop lourd. Pendant 7 jours, vise seulement la version minimale : « ${esc(weak.h.tiny)} ». Tenir la chaîne compte plus que l'intensité.`
      : "Ce n'est pas un manque de volonté, c'est un rituel trop lourd. Donne-lui une version de 2 minutes et un déclencheur précis (« après mon café… »).",
    href: '#rituels/edit/' + weak.h.id, cta: 'Ajuster le rituel' });

  // 5. Revue de la semaine
  const mon = addDays(t, -dow(t)), rv = C().reviews || {};
  const filled = r => r && (r.win || r.lesson || r.next);
  if (dow(t) >= 5 && !filled(rv[mon])) add('review', 72, { ring: 'vide', title: 'Fais ta revue de la semaine', text: "Cinq minutes : une victoire, ce qui a coincé, le cap de la semaine prochaine. C'est le moment où l'on corrige la trajectoire.", href: '#objectifs', cta: 'Faire ma revue' });
  else if (dow(t) <= 1 && !filled(rv[addDays(mon, -7)]) && logged.length >= 5) add('review', 60, { ring: 'vide', title: 'La revue de la semaine passée manque', text: "Avant de repartir, regarde la semaine écoulée : qu'est-ce qui a marché, qu'est-ce que tu changes ?", href: '#objectifs', cta: 'Faire ma revue' });

  // 6. Hier non consigné
  const y = addDays(t, -1);
  if (!get(y) && logged.length >= 3) add('yesterday', 62, { ring: 'terre', title: "Hier n'est pas consigné", text: "Note-le tant que c'est frais : sans données, le coach et les insights sont aveugles. Deux minutes suffisent.", href: '#saisie/' + y, cta: 'Consigner hier' });

  // 7. Dette de sommeil
  if (FIELD_BY_K.sleep_h && target('sleep_h')) {
    const s = lastDays(7).map(d => fieldVal(get(d), 'sleep_h')).filter(isNum);
    const gap = target('sleep_h') - (mean(s) || 0);
    if (s.length >= 4 && gap >= .75) {
      const c = correlations(lastDays(60)).find(x => x.a === 'sleep_h' && Math.abs(x.r) >= .3);
      add('sleep', 64, { ring: 'terre', title: `Dette de sommeil : ${fmtHours(gap)} par nuit`,
        text: `Tu dors ${nf(mean(s))} h en moyenne cette semaine pour un objectif de ${nf(target('sleep_h'))} h.${c ? ' ' + corrSentence(c) : ''} Ce soir, fixe une heure d'écrans coupés.` });
    }
  }

  // 8. L'anneau le plus faible sur 14 jours
  const d14 = lastDays(14).filter(d => get(d));
  if (d14.length >= 5) {
    const rs = RINGS.map(r => ({ r, v: avgRing(d14, r.id) })).filter(x => isNum(x.v));
    if (rs.length >= 3) {
      const avg = mean(rs.map(x => x.v)), low = rs.sort((a, b) => a.v - b.v)[0];
      if (low.v < 55 && avg - low.v >= 12) {
        const idea = (HABIT_IDEAS[low.r.id] || []).find(i => !hs.some(h => h.name === i.name));
        add('ring:' + low.r.id, 52, { ring: low.r.id, title: `${low.r.kanji} ${low.r.name} est ton anneau le plus faible (${Math.round(low.v)}/100)`,
          text: `Sur 14 jours, les autres anneaux sont à ${Math.round(avg)} en moyenne. La force d'un guerrier, c'est l'équilibre.${idea ? ` Idée : « ${esc(idea.name)} », après ${esc(lc(idea.cue))}.` : ''}`,
          ...(idea ? { act: 'idea', arg: low.r.id + '|' + idea.name, cta: 'Ajouter ce rituel' } : {}) });
      }
    }
  }

  // 9. Élan : comparaison 7 j vs 7 j précédents
  const cur = avgOverall(lastDays(7)), prev = avgOverall(lastDays(7, addDays(t, -7)));
  if (cur != null && prev != null) {
    if (cur - prev >= 5) add('up', 34, { ring: 'vent', title: `En progrès : +${Math.round(cur - prev)} points d'équilibre`, text: `${Math.round(cur)}/100 sur 7 jours contre ${Math.round(prev)} la semaine d'avant. Note dans ta revue ce qui a fait la différence, pour le refaire.` });
    else if (prev - cur >= 8) add('down', 58, { ring: 'feu', title: `Baisse de régime : −${Math.round(prev - cur)} points`, text: `${Math.round(cur)}/100 sur 7 jours contre ${Math.round(prev)} avant. Ne cherche pas à tout rattraper : reviens aux versions minimales de tes rituels et protège ton sommeil.` });
  }

  // 10. Ce que disent tes données
  const c = correlations(lastDays(90)).find(x => Math.abs(x.r) >= .35 && x.n >= 14);
  if (c) add('corr:' + c.a + c.b, 30, { ring: FIELD_BY_K[c.a].ring, title: 'Ce que disent tes données', text: `${corrSentence(c)} (sur ${c.n} jours). Sers-t'en : c'est ton levier personnel.`, href: '#insights', cta: 'Voir les insights' });

  const dis = dismissed();
  return out.filter(a => !dis.includes(a.id)).sort((a, b) => b.p - a.p);
}

function weekCap() {
  const t = todayISO(), mon = addDays(t, -dow(t)), rv = C().reviews || {};
  return (rv[addDays(mon, -7)] || {}).next || '';
}

function adviceHTML(a) {
  return `<li class="adv" style="--ring:${ringColor(a.ring || 'terre')}" data-adv="${esc(a.id)}">
    <div class="adv-t">${a.title}</div>
    <p>${a.text}</p>
    <div class="adv-a">
      ${a.href ? `<a class="btn sm" href="${a.href}">${a.cta}</a>` : a.act ? `<button type="button" class="btn sm" data-cact="${a.act}" data-arg="${esc(a.arg)}">${a.cta}</button>` : ''}
      <button type="button" class="btn sm ghost" data-cact="dismiss">Plus tard</button>
    </div></li>`;
}
function coachInnerHTML() {
  const list = advice(), top = list.slice(0, 3), rest = list.slice(3), cap = weekCap();
  return `<h2><span style="color:var(--shu)">師</span> Le maître</h2>
    <p class="sub">Trois conseils pour aujourd'hui, tirés de tes données</p>
    ${cap ? `<div class="wcap"><span>Cap de la semaine</span>${esc(cap)}</div>` : ''}
    ${top.length ? `<ul class="advs">${top.map(adviceHTML).join('')}</ul>` : '<div class="okbox">Rien à corriger aujourd\'hui. Pratique, simplement.</div>'}
    ${rest.length ? `<details class="adv-more"><summary>${rest.length} autre${rest.length > 1 ? 's' : ''} conseil${rest.length > 1 ? 's' : ''}</summary><ul class="advs">${rest.map(adviceHTML).join('')}</ul></details>` : ''}`;
}

/* ------------------------------------------------------------
 * La séance : minuteur de concentration qui remplit tes métriques
 * ------------------------------------------------------------ */
const LS_FOCUS = 'gorin.focus.v1';
let focus = lsGet(LS_FOCUS, { k: 'work_h', plan: 50, start: null });
let focusTick = null;
const timeFields = () => FIELDS.filter(f => f.type === 'num' && /^(min|h)$/i.test(f.unit || ''));
function saveFocus() { lsSet(LS_FOCUS, focus); }
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function focusElapsed() { return focus.start ? (Date.now() - focus.start) / 1000 : 0; }

function focusInnerHTML() {
  const fs = timeFields();
  if (!fs.length) return '<h2>Séance</h2><p class="fine">Ajoute une métrique en minutes ou en heures dans les réglages pour utiliser le minuteur.</p>';
  if (!fs.some(f => f.k === focus.k)) focus.k = fs[0].k;
  const run = !!focus.start, f = FIELD_BY_K[focus.k], el = focusElapsed(), left = focus.plan * 60 - el;
  const today = fieldVal(get(todayISO()), focus.k);
  const R = 52, Cc = 2 * Math.PI * R, p = run ? clamp(el / (focus.plan * 60), 0, 1) : 0;
  return `<h2>Séance</h2>
    <p class="sub">Une seule chose, sans interruption. Le temps est ajouté à ta journée.</p>
    <div class="focus ${run ? 'run' : ''}" style="--ring:${ringColor(f.ring)}">
      <svg viewBox="0 0 120 120" class="fz-dial" aria-hidden="true">
        <circle cx="60" cy="60" r="${R}" class="track" fill="none" stroke-width="7"/>
        <circle cx="60" cy="60" r="${R}" class="fz-arc" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="${Cc}" stroke-dashoffset="${Cc * (1 - p)}" transform="rotate(-90 60 60)"/>
      </svg>
      <div class="fz-time" id="fzTime">${run ? (left >= 0 ? mmss(left) : '+' + mmss(-left)) : mmss(focus.plan * 60)}</div>
      <div class="fz-lbl">${run ? (left >= 0 ? 'restant' : 'au-delà du plan') : 'prévu'}</div>
    </div>
    <div class="fz-ctl">
      <label class="f"><span>Pour</span><select id="fzK" ${run ? 'disabled' : ''}>${fs.map(x => `<option value="${x.k}" ${x.k === focus.k ? 'selected' : ''}>${RING_BY_ID[x.ring].kanji} ${esc(x.short || x.label)}</option>`).join('')}</select></label>
      <div class="chips fz-plan" ${run ? 'hidden' : ''}>${[10, 25, 50, 90].map(m => `<button type="button" class="chip" data-fplan="${m}" aria-pressed="${focus.plan === m}">${m} min</button>`).join('')}</div>
    </div>
    <div class="row fz-btns">
      ${run ? `<button type="button" class="btn primary" data-fz="stop">Terminer et ajouter</button><button type="button" class="btn ghost" data-fz="cancel">Annuler</button>`
        : `<button type="button" class="btn primary" data-fz="start">Commencer</button>`}
    </div>
    <p class="fine">Aujourd'hui : <b>${today == null ? '0' : nf(today, 2)} ${esc(f.unit)}</b>${target(f.k) ? ` sur ${nf(target(f.k))} ${esc(f.unit)}` : ''}.</p>`;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach(t0 => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(.0001, ctx.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(.25, ctx.currentTime + t0 + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t0 + .3);
      o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + .32);
    });
  } catch { /* pas de son */ }
}
function tickFocus() {
  if (!focus.start) { clearInterval(focusTick); focusTick = null; document.title = 'Gorin — Les cinq anneaux'; return; }
  const el = focusElapsed(), left = focus.plan * 60 - el;
  const tEl = $('#fzTime');
  if (tEl) {
    tEl.textContent = left >= 0 ? mmss(left) : '+' + mmss(-left);
    const arc = $('.fz-arc'); if (arc) { const Cc = 2 * Math.PI * 52; arc.style.strokeDashoffset = Cc * (1 - clamp(el / (focus.plan * 60), 0, 1)); }
  }
  document.title = `${left >= 0 ? mmss(left) : '+' + mmss(-left)} · Séance`;
  if (left <= 0 && !focus.rang) {
    focus.rang = true; saveFocus(); beep();
    toast('Séance terminée. Termine pour ajouter le temps à ta journée.', 5000);
    try { if (window.Notification && Notification.permission === 'granted') new Notification('Gorin · séance terminée', { body: `${focus.plan} min de ${FIELD_BY_K[focus.k]?.short || 'concentration'}. Prends une pause.` }); } catch { /* */ }
    const lbl = $('.fz-lbl'); if (lbl) lbl.textContent = 'au-delà du plan';
  }
}
function startFocusLoop() { if (!focusTick && focus.start) { focusTick = setInterval(tickFocus, 1000); tickFocus(); } }
function refreshFocus() { const b = $('#focusBox'); if (b) b.innerHTML = focusInnerHTML(); startFocusLoop(); }

function addToMetric(k, minutes) {
  const f = FIELD_BY_K[k]; if (!f) return 0;
  const add = /^h$/i.test(f.unit) ? Math.round(minutes / 60 * 100) / 100 : Math.round(minutes);
  const d = todayISO();
  patchEntry(d, x => {
    x[k] = Math.round(((isNum(x[k]) ? x[k] : 0) + add) * 100) / 100;
    x.focus = [...(x.focus || []), { k, min: Math.round(minutes), at: Date.now() }];
  });
  if (editDate === d && !$('#view-saisie').hidden) {
    const e = get(d); draft[k] = e[k]; draft.focus = e.focus;
    const inp = $(`#entryForm [name="${k}"]`); if (inp) inp.value = e[k];
    updateLive();
  }
  return add;
}
function onFocusClick(ev) {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.dataset.fplan) { focus.plan = +b.dataset.fplan; saveFocus(); refreshFocus(); return; }
  const a = b.dataset.fz; if (!a) return;
  if (a === 'start') {
    const sel = $('#fzK'); if (sel) focus.k = sel.value;
    focus.start = Date.now(); focus.rang = false; saveFocus(); refreshFocus();
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch { /* */ }
  } else if (a === 'stop' || a === 'cancel') {
    const min = focusElapsed() / 60, k = focus.k;
    focus.start = null; saveFocus();
    if (a === 'stop') {
      if (min < 1) toast('Moins d’une minute : rien ajouté');
      else { const add = addToMetric(k, min); const f = FIELD_BY_K[k]; toast(`+${nf(add, 2)} ${f.unit} de ${(f.short || f.label).toLowerCase()} ajoutés à ta journée`, 3200); }
    }
    refreshFocus(); tickFocus();
  }
}

/* ------------------------------------------------------------
 * Intégration dans Aujourd'hui
 * ------------------------------------------------------------ */
function coachHTML(d) {
  if (d !== todayISO()) return '';
  return `<div class="grid top2 coach-row">
    <div class="card coach" id="coachBox">${coachInnerHTML()}</div>
    <div class="card focus-card" id="focusBox">${focusInnerHTML()}</div>
  </div>`;
}
function bindCoach() {
  const el = $('#view-saisie');
  startFocusLoop();
  if (el._coachBound) return;
  el._coachBound = true;
  el.addEventListener('click', ev => {
    if (ev.target.closest('#focusBox')) return onFocusClick(ev);
    const b = ev.target.closest('[data-cact]'); if (!b) return;
    const li = b.closest('[data-adv]'), act = b.dataset.cact;
    if (act === 'dismiss') { dismiss(li.dataset.adv); }
    else if (act === 'intent') {
      patchEntry(editDate, x => { x.intention = b.dataset.arg; delete x.intention_done; });
      const inp = $('#intentInp'); if (inp) inp.value = b.dataset.arg;
      $('#intentRow')?.classList.remove('on');
      dismiss(li.dataset.adv); toast("C'est l'essentiel du jour. Commence par lui.");
    } else if (act === 'idea') {
      const [rid, name] = b.dataset.arg.split('|'), i = (HABIT_IDEAS[rid] || []).find(x => x.name === name); if (!i) return;
      C().habits.push({ id: uid('h'), ring: rid, name: i.name, cue: i.cue || '', tiny: i.tiny || '', days: [...(i.days || ALL_DAYS)], moment: i.moment || 'journee', goalId: '', start: todayISO(), order: HABITS().length, updatedAt: Date.now() });
      touchCfg(); refreshRituals(rid); refreshCap(); updateLive(); toast('Rituel ajouté à ton anneau ' + RING_BY_ID[rid].name);
    }
    const box = $('#coachBox'); if (box) box.innerHTML = coachInnerHTML();
  });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickFocus(); });

/* ------------------------------------------------------------
 * Hors-ligne et installation (PWA)
 * ------------------------------------------------------------ */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
