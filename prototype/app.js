// Richemont 3B · démo « Réserver en direct ». Aucune dépendance. Tout texte issu de données ou de saisies passe par textContent.
import { numeroJour, nuits as compterNuits, ajouter, plage, formatCourt, moisGrille } from './lib/dates.js';
import { parseIcs, nuitsPrises, estLibre } from './lib/ical.js';
import { estimer } from './lib/tarifs.js';
import { valider, creerMagasin } from './lib/demandes.js';
import { brouillon, prixAdmisPour } from './lib/reponse.js';
import { verifier, controlerCanaux } from './lib/verifier.js';
import { evenement } from './lib/mesure.js';
import { textes } from './lib/i18n.js';
import { calendrier as calPrix, prixSejour, tarifsHoteDepuisCalendrier, canal as canalDe, netHote, propositionImmoCrans } from './lib/prix.js';
import * as GN from './lib/gain.js';
import { demarrerScene } from './scene.js';

/* ---------- Textes d'interface : data/ui.json (clés absentes de lib/i18n.js ou reformulées ; le reste vient de t()) ---------- */
let texteUI = {};
const MOIS_LONG = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};
const MOIS_GEN = { ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'] };
const MOIS_COURT = {
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
};

/* ---------- État ---------- */
const DATE_DEMO = '2026-11-05';
const aujourdhui = (() => {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return iso > DATE_DEMO ? iso : DATE_DEMO;
})();
const etat = {
  langue: 'fr', mode: 'apres', page: 'accueil', vue: 'accueil', panneau: false, etape: 'dates',
  arrivee: null, depart: null, voyageurs: 4, langueDemande: 'fr', demandeCourante: null, tarifsHote: null, retenus: {}, utilise: false, ouvert: null,
  moisAn: 2026, moisM: 12, focusIso: null, refocus: null,
  form: { prenom: '', email: '', message: '' }, envoiFait: false, doublon: null, doublons: [],
  rep: { texte: '', source: 'correct' }, faqOuvert: new Set(), opener: null, estimVue: false, estimCle: '', prixEvt: false,
};
let sourisReelle = false, souris = null, ancreSouris = null, entreePrix = 0; // infobulle : jamais sans vrai mouvement de souris
let D = null; // données chargées
let CX = null; // lib/canaux.js, si présent
let magasin = null;
const $ = (s, r = document) => r.querySelector(s);

/* ---------- Outils ---------- */
function T(cle, params = {}) {
  const lire = (o) => cle.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const l = etat.langue;
  const brut = lire(texteUI[l]) ?? lire(textes[l]) ?? lire(texteUI.fr) ?? lire(textes.fr) ?? cle;
  return typeof brut === 'string' ? brut.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : brut;
}
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
const NS = 'http://www.w3.org/2000/svg';
const ICONES = {
  gauche: 'M224 128a8 8 0 0 1-8 8H59.3l58.4 58.3a8 8 0 0 1-11.4 11.4l-72-72a8 8 0 0 1 0-11.4l72-72a8 8 0 0 1 11.4 11.4L59.3 120H216a8 8 0 0 1 8 8Z',
  droite: 'M221.7 133.7l-72 72a8 8 0 0 1-11.4-11.4L196.7 136H40a8 8 0 0 1 0-16h156.7l-58.4-58.3a8 8 0 0 1 11.4-11.4l72 72a8 8 0 0 1 0 11.4Z',
  sortant: 'M200 64v104a8 8 0 0 1-16 0V83.3L69.7 197.7a8 8 0 0 1-11.4-11.4L172.7 72H88a8 8 0 0 1 0-16h104a8 8 0 0 1 8 8Z',
  copier: 'M216 32H88a8 8 0 0 0-8 8v40H40a8 8 0 0 0-8 8v128a8 8 0 0 0 8 8h128a8 8 0 0 0 8-8v-40h40a8 8 0 0 0 8-8V40a8 8 0 0 0-8-8Zm-56 176H48V96h112Zm48-48h-32V88a8 8 0 0 0-8-8H96V48h112Z',
};
function ico(nom, taille = 20) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 256 256'); s.setAttribute('width', taille); s.setAttribute('height', taille);
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', ICONES[nom]); p.setAttribute('fill', 'currentColor');
  s.append(p);
  return s;
}
const chf = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
/* Formes plurielles : '1' (un), 'F' (russe 2 à 4), 'N' (autres). */
function forme(n) {
  if (etat.langue === 'ru') { const d = n % 10, c = n % 100; return d === 1 && c !== 11 ? '1' : (d >= 2 && d <= 4 && (c < 12 || c > 14) ? 'F' : 'N'); }
  return n === 1 ? '1' : 'N';
}
const nuitsTxt = (n) => { const f = forme(n); return T(f === '1' ? 'nuit1' : f === 'F' ? 'nuitsF' : 'nuitsN', { n }); };
const persTxt = (n) => { const f = forme(n); return T(f === '1' ? 'pers1' : f === 'F' ? 'persF' : 'persN', { n }); };
const plurielT = (base, n) => T(`${base}${forme(n)}`, { n });
function dateLongue(iso) { // « samedi 19 décembre 2026 » dans la langue d'interface
  if (etat.langue === 'fr' || etat.langue === 'en') return formatCourt(iso, etat.langue);
  const [a, m, j] = iso.split('-').map(Number);
  const js = (new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7;
  const jour = T('jsem_long')[js]; const mois = (MOIS_GEN[etat.langue] || MOIS_LONG[etat.langue])[m - 1];
  return etat.langue === 'de' ? `${jour}, ${j}. ${mois} ${a}` : `${jour} ${j} ${mois} ${a}`;
}
const sansAnnee = (iso) => dateLongue(iso).replace(/ \d{4}$/, '');
const jm = (iso) => { const [, m, j] = iso.split('-').map(Number); return `${j} ${MOIS_COURT[etat.langue][m - 1]}`; };
function plageTxt(a, d) {
  const [ya, ma, ja] = a.split('-').map(Number); const [yd, md, jd] = d.split('-').map(Number);
  const mc = MOIS_COURT[etat.langue];
  if (ya === yd && ma === md) return `${ja} → ${jd} ${mc[md - 1]} ${yd}`;
  return `${ja} ${mc[ma - 1]} → ${jd} ${mc[md - 1]} ${yd}`;
}
function plageCourte(a, d) {
  const [, ma, ja] = a.split('-').map(Number); const [, md, jd] = d.split('-').map(Number);
  const mc = MOIS_COURT[etat.langue]; const mot = T('plage_mot');
  return (ma === md ? `${ja} ${mot} ${jd} ${mc[md - 1]}` : `${ja} ${mc[ma - 1]} ${mot} ${jd} ${mc[md - 1]}`).replace(/\.$/, '');
}
const dateFr = (iso) => iso.split('-').reverse().join('/');
function quand(isoComplet) {
  const d = new Date(isoComplet); const p = (n) => String(n).padStart(2, '0');
  return { date: `${p(d.getDate())}/${p(d.getMonth() + 1)}`, heure: `${p(d.getHours())} h ${p(d.getMinutes())}` };
}
function hoteSource(src) { try { return new URL(src).host.replace(/^www\./, ''); } catch { return src || ''; } }
function tarifsEff() { return { ...D.tarifs, tarifsHote: etat.tarifsHote }; }
function estimation() {
  if (!etat.arrivee || !etat.depart) return null;
  return estimer({ arrivee: etat.arrivee, depart: etat.depart, voyageurs: etat.voyageurs }, tarifsEff(), D.fiche, { aujourdhui });
}
const capacite = () => D.fiche.champs.capacite.valeur;
const fiche = () => D.fiche.champs;
function pousser(nom, donnees) { try { evenement(nom, donnees); } catch { /* mesure facultative */ } }
async function copier(texte, bouton) {
  let ok = false;
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(texte); ok = true; } } catch { ok = false; }
  if (!ok) {
    const z = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-999px;top:0' }); z.value = texte;
    document.body.append(z); z.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    z.remove();
  }
  if (ok && bouton) {
    const av = bouton.textContent; bouton.textContent = T('copie');
    setTimeout(() => { bouton.textContent = av; }, 1600);
  }
}

/* ---------- Pastille démo (≤ 480 px) ---------- */
{
  const bascule = $('#demo-bascule'), demo = $('#demo');
  const regler = (ouvert) => { demo.classList.toggle('ouvert', ouvert); bascule.setAttribute('aria-expanded', String(ouvert)); };
  bascule.addEventListener('click', () => regler(!demo.classList.contains('ouvert')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && demo.classList.contains('ouvert')) regler(false); });
}

/* ---------- Page : texte statique ---------- */
function majStatique() {
  document.documentElement.lang = etat.langue;
  document.title = T('titre_doc');
  $('#evitement').textContent = T('aller_contenu');
  $('#marque-lieu').textContent = T('lieu');
  $('.langues').setAttribute('aria-label', T('langue'));
  document.querySelectorAll('.langue').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langue === etat.langue)));
  $('#bt-reserver').textContent = T('reserver');
  $('#bt-prix').textContent = T('nav_prix_c'); $('#bt-prix').setAttribute('aria-label', T('nav_prix'));
  $('#bt-verif').textContent = T('nav_verif'); $('#bt-verif').title = T('verif_aide');
  $('#bt-appart').textContent = T('nav_appart');
  $('#bt-voir').textContent = T('voir_prix');
  $('#bt-verif2').textContent = T('verif_lien'); $('#bt-verif2').title = T('verif_aide');
  majTitre(); majNuit(); majRail(); majPreuve(); majGraphe(); majVignette(); majBandeau();
  $('#demo-avant').textContent = T('demo_avant'); $('#demo-avant').hidden = etat.mode !== 'avant';
  $('#langue-select').value = etat.langue; $('#langue-select').setAttribute('aria-label', T('langue'));
  $('#demo-note').textContent = T('demo_note'); $('#demo-titre').textContent = T('demo_titre');
  $('#demo-groupe').setAttribute('aria-label', T('demo_groupe')); $('#demo-bascule').textContent = T('demo_court');
  document.querySelectorAll('.demo-choix').forEach((b) => { const m = b.dataset.mode || b.dataset.mode2; b.textContent = T(m); b.setAttribute('aria-checked', String(m === etat.mode)); });
  if (etat.page === 'methode') rendreMethode();
  $('#p-fermer-txt').textContent = T('fermer');
  $('#bt-retour-rep').textContent = T('retour_accueil'); $('#bt-retour-hote').textContent = T('retour_accueil');
  $('#bt-vers-hote').textContent = T('vers_hote'); $('#bt-vers-rep').textContent = T('vers_rep');
  $('#bt-methode').textContent = T('methode_lien'); $('#menu').setAttribute('aria-label', T('menu_aria'));
  $('#bt-retour-met').textContent = T('retour_accueil'); $('#bt-met-prix').textContent = T('vers_prix');
  $('#bt-retour-prix').textContent = T('retour_accueil'); $('#bt-prix-hote').textContent = T('vers_fiche'); $('#bt-hote-prix').textContent = T('vers_prix');
}

/* ---------- Accueil : titre, rail de chiffres, preuve, graphe du calendrier ---------- */
/** Coupe le titre en 3 lignes de longueur proche (masque ligne à ligne). */
function lignesTitre(txt) {
  const mots = txt.split(' '); const cible = Math.ceil(txt.length / 3) + 2; const out = [];
  let cur = '';
  for (const m of mots) {
    if (cur && out.length < 2 && (cur + ' ' + m).length > cible) { out.push(cur); cur = m; } else cur = cur ? `${cur} ${m}` : m;
  }
  out.push(cur);
  return out;
}
function majTitre() {
  const h1 = $('#titre-accueil'); const lignes = lignesTitre(T('hero_titre'));
  const actuel = [...h1.querySelectorAll('.g-ligne > span')].map((x) => x.textContent);
  if (actuel.join('|') !== lignes.join('|')) {
    h1.replaceChildren(...lignes.map((l) => h('span', { class: 'g-ligne' }, h('span', { text: l }))));
    h1.classList.add('sans-entree'); // changement de langue : pas de nouvelle entrée
  }
  $('#lede').textContent = T('hero_lede', { date: dateFr(D.comparables.releve_le) });
}
/** Scène de nuit : étiquette du pic et légende, lues dans D.cal (lib/prix.js calendrier) et hypotheses.json. */
function majNuit() {
  const m = D.cal.find((p) => p.id === 'mondiaux' && p.statut === 'ok');
  $('#pic').hidden = !m;
  if (m) { $('#pic-v').textContent = `CHF ${m.cible}`; $('#pic-s').textContent = T('nuit_pic_s'); $('#pic-i').textContent = T('nuit_pic_i'); }
  const mc = MOIS_COURT[etat.langue] || MOIS_COURT.en, an = (iso) => `${mc[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  const de = an(D.cal[0].debut), a = an(D.cal[D.cal.length - 1].fin);
  $('#nuit-leg').replaceChildren(h('b', { text: T('nuit_leg_b', { de: de.charAt(0).toUpperCase() + de.slice(1), a }) }), ` · ${T('nuit_leg', { p: plancher(), date: dateFr(D.comparables.releve_le) })}`);
}
/** En-tête transparent, texte ivoire, tant qu'il survole la scène de nuit. */
function majSurNuit() {
  const n = $('#nuit'), e = $('#entete');
  const sur = etat.page === 'accueil' && n && n.offsetParent !== null && n.getBoundingClientRect().bottom > e.getBoundingClientRect().height;
  document.body.classList.toggle('sur-nuit', !!sur);
}
/** Rail de chiffres : lus dans data/fiche.json (champs), jamais en dur. */
function majRail() {
  const c = fiche(); const r = $('#faits-fiche');
  r.setAttribute('aria-label', T('rail_aria'));
  const cell = (v, u, lab) => h('div', null, h('b', { class: 'num' }, String(v), u ? h('span', { class: 'rail-u', text: u }) : null), h('small', { text: lab }));
  r.replaceChildren(cell(c.surface_utile_m2.valeur, ' m²', T('rail_m2')), cell(c.chambres.valeur, '', T('rail_ch')), cell(c.salles_eau.valeur, '', T('rail_sde')),
    cell(c.capacite.valeur, '', T('rail_pers')), cell(c.garage ? 1 : 0, '', T('rail_garage')));
}
/** Encart « La preuve derrière » : textes de data/canaux.json, marques posées par verifier() (faits déjà calculés dans D.canaux). */
function marquer(texte, faits) {
  const out = []; let pos = 0;
  for (const q of [...faits].sort((x, y) => x.debut - y.debut)) {
    if (q.debut < pos) continue;
    if (q.debut > pos) out.push(texte.slice(pos, q.debut));
    const cls = q.statut === 'contredit' || q.statut === 'absent' ? 'ko' : q.statut === 'confirme' ? 'ok' : '';
    out.push(cls ? h('mark', { class: cls, text: texte.slice(q.debut, q.fin) }) : texte.slice(q.debut, q.fin));
    pos = q.fin;
  }
  if (pos < texte.length) out.push(texte.slice(pos));
  return out;
}
/** Extrait du titre autour du fait contredit (« Richemont 3 chambres • Ski à 3 min • … ») : un seul surlignage, ni coche ni souligné ; le titre complet annoté reste dans la vue Vérifier. */
function extraitTitre(a) {
  const segs = a.texte.split(' • ');
  const coupe = segs.length > 2 ? `${segs.slice(0, 2).join(' • ')} • …` : a.texte;
  const fin = segs.length > 2 ? segs.slice(0, 2).join(' • ').length : a.texte.length;
  const mal = a.faits.filter((f) => (f.statut === 'contredit' || f.statut === 'absent') && f.fin <= fin);
  return marquer(coupe, mal.length ? [mal[0]] : []);
}
function majPreuve() {
  const cadre = $('#preuve'); cadre.replaceChildren();
  const a = canalTexte('airbnb', 'titre'), o = canalTexte('airbnb', 'og_title');
  if (!a || !o) { cadre.hidden = true; return; }
  cadre.hidden = false;
  const c = fiche().chambres;
  const mal = a.faits.find((f) => f.statut === 'contredit' || f.statut === 'absent');
  const verdict = mal
    ? `${T('m_contredit').replace(/^./, (x) => x.toUpperCase())} : « ${mal.extrait} ». ${messageFait(mal)} ${T('preuve_bloque')}`
    : T('preuve_ok');
  const ligne = (lab, ...kids) => h('div', null, h('em', { text: lab }), h('span', null, ...kids));
  cadre.append(
    h('div', { class: 'cmp-h' }, h('b', { text: T('preuve_titre') }), ` · ${T('preuve_sous', { date: dateFr(a.date) })}`),
    ligne(T('champ_titre'), ...extraitTitre(a)),
    ligne('og:title', marquer(o.texte, o.faits)),
    ligne(T('preuve_fiche'), h('mark', { class: 'ok', text: T('fait_chambres', { n: c.valeur }) }), ` · ${hoteSource(c.source)}, ${dateFr(c.date)}`),
    ligne(T('preuve_verdict'), verdict));
}
/** Graphe du calendrier (SVG) sur l'axe du temps : largeur de chaque barre = durée de la période (debut, fin), hauteur = cible,
 *  le tout lu dans lib/prix.js calendrier() (D.cal) ; jamais de chiffre en dur. Axe : de la 1re date à la dernière date de D.cal. */
let grapheDessine = false, grapheLarg = 0, grapheCtx = null, grapheFontes = false;
const CLIC_MS = 50; // la barre cliquée se surligne, puis la vue calendrier s'ouvre
const COURTS = ['fetes', 'fevrier', 'ete', 'oem']; // noms courts sous l'axe (ui.json gr_c_<id>), par priorité ; les autres : infobulle
const sv = (tag, props, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(props || {})) { if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c) e.append(c);
  return e;
};
/** Rend « mot *en italique* » en texte + <em> (createElement, jamais innerHTML). */
function baliser(el, txt) {
  const parts = String(txt).split(/\*([^*]+)\*/);
  el.replaceChildren(...parts.map((s, i) => (i % 2 ? h('em', { text: s }) : document.createTextNode(s))));
}
/** Hauteur réelle de l'en-tête fixe (menu mobile compris) : alimente scroll-margin-top de toutes les cibles de défilement (style.css). */
function majHEnt() {
  const e = document.getElementById('entete'), r = document.documentElement.style; if (e) r.setProperty('--h-ent', `${Math.round(e.getBoundingClientRect().height)}px`);
  const bd = document.getElementById('bandeau-ia'), n = document.getElementById('nuit');
  if (e && n) { // en-tête + bandeau : la scène de nuit passe dessous, le titre garde son air
    const hh = Math.round(e.getBoundingClientRect().height + (bd && !bd.hidden ? bd.getBoundingClientRect().height : 0));
    n.style.marginTop = `${-hh}px`; n.style.paddingTop = `${hh + (window.innerWidth <= 640 ? 28 : Math.round(Math.min(64, Math.max(36, window.innerHeight * .06))))}px`;
  }
  const a = document.querySelector('#prix-contenu .axe'); if (a && a.offsetHeight) r.setProperty('--h-axe', `${Math.round(a.getBoundingClientRect().height)}px`); // axe collant du calendrier : pris en compte dans scroll-margin-top
}
function majGraphe() {
  const plot = $('#plot');
  if (!D.cal || !D.cal.length) { plot.replaceChildren(); $('#graphe').hidden = true; return; }
  $('#graphe').hidden = false;
  baliser($('#graphe-t'), T('gr_titre')); $('#graphe-sous').textContent = T('gr_sous'); $('#graphe-leg').textContent = T('gr_leg');
  dessinerGraphe();
}
function dessinerGraphe() {
  const plot = $('#plot'); const W = Math.round(plot.clientWidth);
  if (!D.cal || !D.cal.length || W < 200) { grapheLarg = 0; return; } // vue non affichée : redessiné à l'affichage
  plot.replaceChildren(); grapheLarg = W;
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mob = W < 640;
  const ok = D.cal.filter((p) => p.statut === 'ok');
  const pl = plancher(), cmax = Math.max(...ok.map((p) => p.cible));
  const max = Math.ceil((cmax + 25) / 10) * 10;
  const plotH = mob ? 140 : 150;
  const padT = mob ? 28 : 34, y0 = padT + plotH, H = y0 + 44;
  const t0 = Date.parse(D.cal[0].debut), t1 = Date.parse(D.cal[D.cal.length - 1].fin);
  const x = (iso) => (Date.parse(iso) - t0) / (t1 - t0) * W;
  const y = (v) => padT + plotH * (1 - v / max);
  const mc = MOIS_COURT[lv()];
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: grapheDessine || reduit ? 'g-fait' : 'g-att', role: 'group', 'aria-label': T('gr_graphe') });
  // Axe des mois : un repère au 1er de chaque mois, le nom centré sur le mois (déc. … nov.)
  const axe = sv('g', { class: 'g-axe', 'aria-hidden': 'true' }, sv('line', { x1: 0, y1: y0, x2: W, y2: y0 }));
  const d0 = new Date(t0); let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1));
  while (m.getTime() < t1) {
    const suiv = Math.min(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1), t1);
    const xm = (m.getTime() - t0) / (t1 - t0) * W, xc = ((m.getTime() + suiv) / 2 - t0) / (t1 - t0) * W;
    axe.append(sv('line', { x1: xm, y1: y0, x2: xm, y2: y0 + 5 }), sv('text', { class: 'g-mois', x: xc, y: y0 + 19, 'text-anchor': 'middle', text: mc[m.getUTCMonth()] }));
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
  }
  svg.append(axe);
  const iM = D.cal.findIndex((q) => q.id === 'mondiaux'); let rg = 0;
  const rangs = D.cal.map((q, i) => (i === iM ? D.cal.length - 1 : rg++)); // une barre après l'autre, les Mondiaux en dernier
  const pers = D.cal.map((p, i) => {
    const bon = p.statut === 'ok', xa = x(p.debut), xb = x(p.fin), w = Math.max(5, xb - xa - 3), x0 = xa + 1.5;
    const nom = nomP(p), dates = datesP(p), haut = bon ? y(p.cible) : y0 - Math.max(26, plotH * .13);
    const g = sv('g', { class: `g-col${bon ? '' : ' g-ins'}${p.id === 'mondiaux' ? ' g-mond' : ''}`, 'data-id': p.id, style: `--i:${i};--r:${rangs[i]}`, tabindex: 0, role: 'button',
      'aria-label': bon ? TC('gr_aria', { nom, dates, cible: p.cible }) : TC('gr_aria_ins', { nom, dates }) });
    if (bon && p.id === 'mondiaux') g.append(sv('rect', { class: 'g-halo', x: x0 - 2, y: haut, width: w + 4, height: y0 - haut, rx: 8, 'aria-hidden': 'true' }));
    g.append(sv('rect', { class: 'g-b', x: x0, y: haut, width: w, height: y0 - haut, rx: 3 }));
    if (bon) {
      g.append(sv('text', { class: `g-v num${p.id === 'mondiaux' ? ' g-v-m' : ''}`, x: x0 + w / 2, y: haut - 7, 'text-anchor': 'middle', 'data-top': haut, 'data-x': x0, 'data-w': w, 'aria-hidden': 'true' },
        p.id === 'mondiaux' ? [`${T('gr_mond_l')} · `, 'CHF ', sv('tspan', { class: 'g-n', text: String(p.cible) })].filter((s) => s !== '').map((s) => (typeof s === 'string' ? document.createTextNode(s) : s))
          : [document.createTextNode(String(p.cible))]));
    } else g.append(sv('text', { class: 'g-it', x: x0 + w / 2, y: haut - 7, 'text-anchor': 'middle', 'aria-hidden': 'true', text: T('gr_insuff'), 'data-w': w }));
    g.append(sv('rect', { class: 'g-hit', x: xa, y: 0, width: Math.max(8, xb - xa), height: y0 + 28 }));
    g.addEventListener('click', () => {
      svg.classList.add('g-choisie'); g.classList.add('g-choisi');
      const ouvrir = () => { svg.classList.remove('g-choisie'); g.classList.remove('g-choisi'); ouvrirCal(p.id); };
      if (reduit) ouvrir(); else setTimeout(ouvrir, CLIC_MS);
    });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.dispatchEvent(new MouseEvent('click')); } });
    g.addEventListener('pointerenter', () => bulleGraphe(p, g, haut, xa + (xb - xa) / 2)); g.addEventListener('focus', () => bulleGraphe(p, g, haut, xa + (xb - xa) / 2));
    g.addEventListener('pointerleave', () => cacherBulle()); g.addEventListener('blur', () => cacherBulle());
    svg.append(g);
    return { p, xc: (xa + xb) / 2 };
  });
  // Noms courts sous l'axe (priorité COURTS ; ceux qui ne tiennent pas restent en infobulle)
  for (const id of COURTS) {
    const e = pers.find((q) => q.p.id === id); if (!e) continue;
    svg.append(sv('text', { class: `g-nm${id === 'mondiaux' ? ' g-nm-m' : ''}`, 'data-xc': e.xc, x: e.xc + (mob ? (id === 'ete' ? -7 : id === 'oem' ? 7 : 0) : 0), y: y0 + 38, 'text-anchor': 'middle', 'aria-hidden': 'true', style: `--i:${D.cal.indexOf(e.p)};--r:${rangs[D.cal.indexOf(e.p)]}`, text: mob && id === 'oem' ? T('gr_c_oem_c') : T(`gr_c_${id}`) }));
  }
  // Plancher public (hypothèses.json) : ligne pointillée tracée de gauche à droite, libellé posé dessus (ancré à droite)
  const yp = y(pl);
  // Le libellé se pose dans une zone libre (période sans prix recommandé, aucune barre ni valeur au-dessus : avril-juin), jamais contre la valeur d'une barre ; sinon à droite.
  const libres = D.cal.filter((p) => p.statut !== 'ok').map((p) => ({ a: x(p.debut), b: x(p.fin) })).sort((u, v) => Math.abs((u.a + u.b) / 2 - W / 2) - Math.abs((v.a + v.b) / 2 - W / 2)); // la plus proche du centre : avril-juin
  const lpl = sv('text', { class: 'g-pl-t', x: W - 2, y: yp - 7, 'text-anchor': 'end', 'aria-hidden': 'true', text: mob ? T('gr_plancher_c', { p: pl }) : T('gr_plancher', { p: pl }) });
  if (libres.length) lpl.dataset.libre = `${libres[0].a},${libres[0].b}`;
  svg.append(sv('line', { class: 'g-pl', x1: 0, y1: yp, x2: W, y2: yp }), lpl);
  plot.append(svg, h('div', { class: 'g-bulle', id: 'g-bulle', role: 'tooltip', hidden: true }));
  plot.dataset.yp = String(yp);
  grapheCtx = { W, H, y0, yp, mob }; placerGraphe(svg, grapheCtx);
  if (!grapheFontes && document.fonts && document.fonts.ready) { grapheFontes = true; document.fonts.ready.then(() => { const s = $('#plot svg'); if (s && grapheCtx && $('#plot').clientWidth === grapheCtx.W) placerGraphe(s, grapheCtx); }); }
  // Départ au premier affichage du graphe (après `load`) : les animations CSS (animation-delay) sont suspendues (.g-att) jusqu'à ce que la page soit chargée.
  // Les Mondiaux, dernière barre, comptent de 280 (prix public) à 465 (recommandé) pendant leur montée (860 → 1340 ms, comme le CSS).
  const vm = svg.querySelector('.g-mond .g-n'), mo = ok.find((p) => p.id === 'mondiaux');
  if (vm && mo && !grapheDessine && !reduit) vm.textContent = String(pl);
  if (!grapheDessine && !reduit) {
    const partir = () => {
      if (!svg.isConnected) return;
      svg.classList.remove('g-att'); svg.classList.add('g-go');
      if (vm && mo) {
        const ta = performance.now() + 860, D_ = 480;
        const pas = (now) => { const k = Math.min(1, Math.max(0, (now - ta) / D_)); const e = 1 - (1 - k) ** 3; vm.textContent = String(Math.round(pl + (mo.cible - pl) * e)); if (k < 1) requestAnimationFrame(pas); };
        requestAnimationFrame(pas);
      }
    };
    // Le graphe est sous la scène de nuit : ses barres montent quand il entre à l'écran (premier défilement), après `load`.
    const quandVisible = () => {
      if (!('IntersectionObserver' in window)) { requestAnimationFrame(partir); return; }
      const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); requestAnimationFrame(partir); } }, { threshold: 0.35 });
      io.observe($('#graphe'));
    };
    if (document.readyState === 'complete') quandVisible(); else window.addEventListener('load', quandVisible, { once: true });
  }
  grapheDessine = true;
}
/** Positions qui dépendent des largeurs de texte : mois, noms courts, libellés de barres. Rejouable sans redessiner (polices chargées). */
function placerGraphe(svg, c) {
  if (!svg) return;
  const { W, y0, yp, mob } = c;
  const ch = (a, b, gap = 6) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x;
  // mois : tous si leurs noms tiennent, sinon un sur deux, sinon un sur trois
  const mois = [...svg.querySelectorAll('.g-mois')]; mois.forEach((t) => { t.style.display = ''; });
  const boites = mois.map((t) => t.getBBox());
  for (const pas of [1, 2, 3]) {
    const gardes = boites.map((b, i) => [b, i]).filter(([, i]) => i % pas === 0);
    if (gardes.every(([b], i) => !i || !ch(b, gardes[i - 1][0], 4)) || pas === 3) { mois.forEach((t, i) => { t.style.display = i % pas === 0 ? '' : 'none'; }); break; }
  }
  // noms courts : ligne 1, sinon ligne 2 (grand écran), sinon masqué (reste en infobulle)
  const lignes = [[], []]; let deux = false;
  svg.querySelectorAll('.g-nm').forEach((t) => {
    t.style.display = ''; const w = t.getBBox().width, xc = Number(t.dataset.xc), x = Math.max(w / 2, Math.min(W - w / 2, xc));
    t.setAttribute('x', x);
    for (let r = 0; r < 2; r++) {
      t.setAttribute('y', y0 + 38 + r * 17); const b = t.getBBox();
      if (!lignes[r].some((o) => ch(b, o, 8))) { lignes[r].push(b); if (r) deux = true; return; }
    }
    t.style.display = 'none';
  });
  const H = y0 + 44 + (deux ? 17 : 0);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H);
  // libellé des Mondiaux : centré sur la barre, rabattu dans le cadre
  // valeurs des autres barres : jamais masquées si on peut les poser. Essais : au-dessus de la barre, tout contre la barre, au-dessus de la ligne pointillée, dans la barre (papier) ;
  // chacun centré, puis décalé à droite / à gauche si une barre voisine plus haute gêne. Jamais sur la ligne pointillée ni sur le libellé « prix public ».
  const barres = [...svg.querySelectorAll('.g-v')].map((t) => ({ t, top: Number(t.dataset.top), x: Number(t.dataset.x), w: Number(t.dataset.w) }));
  const lp = svg.querySelector('.g-pl-t');
  if (lp) { // zone libre : centré sur la période sans barre s'il y tient, sinon ancré à droite
    lp.setAttribute('x', W - 2); lp.setAttribute('text-anchor', 'end');
    const [za, zb] = (lp.dataset.libre || '').split(',').map(Number), lw = lp.getBBox().width;
    if (Number.isFinite(za) && zb - za >= lw + 16) { lp.setAttribute('x', (za + zb) / 2); lp.setAttribute('text-anchor', 'middle'); }
  }
  const bl = lp ? lp.getBBox() : null;
  const poser = (t, xv, ancre, yv, dans) => { t.removeAttribute('transform'); t.setAttribute('x', xv); t.setAttribute('text-anchor', ancre); t.setAttribute('y', yv); t.classList.toggle('g-v-dans', !!dans); return t.getBBox(); };
  const croise = (b, yv, t) => { const fs = parseFloat(getComputedStyle(t).fontSize) || 14; return yp > yv - .74 * fs - 2 && yp < yv + .04 * fs + 2; };
  const gene = (t, b) => b.x < 0 || b.x + b.width > W || barres.some((o) => o.t !== t && b.x < o.x + o.w + 1 && b.x + b.width > o.x - 1 && o.top < b.y + b.height - 1)
    || (bl && b.x < bl.x + bl.width + 4 && b.x + b.width + 4 > bl.x && b.y < bl.y + bl.height && b.y + b.height > bl.y);
  barres.forEach(({ t, top, x, w }) => {
    t.style.display = ''; poser(t, x + w / 2, 'middle', top - 7, false);
    if (t.classList.contains('g-v-m')) { // libellé des Mondiaux : aligné à gauche sur la barre (jamais centré : il couvrirait la valeur de la barre voisine), rabattu dans le cadre
      const w = t.getBBox().width; poser(t, Math.max(0, Math.min(W - w, x)), 'start', top - 7, false); return;
    }
    const bw = t.getBBox().width;
    const hors = [[x + w / 2, 'middle'], [x, 'start'], [x + w, 'end']];
    const verts = [top - 7, top - 3, yp - 7];
    for (const yv of verts.slice(0, 2)) for (const [xv, an] of hors) {
      const b = poser(t, xv, an, yv, false);
      if (!croise(b, yv, t) && !gene(t, b)) return;
    }
    if (!mob) for (const yv of verts.slice(2)) for (const [xv, an] of hors) { // sur mobile, jamais une valeur détachée de sa barre (au-dessus de la ligne pointillée) : masquée, reste en infobulle
      const b = poser(t, xv, an, yv, false);
      if (!croise(b, yv, t) && !gene(t, b)) return;
    }
    if (y0 - top > 30 && bw <= w + 2) { const b = poser(t, x + w / 2, 'middle', top + 19, true); if (!croise(b, top + 19, t)) return; }
    poser(t, x + w / 2, 'middle', top - 7, false); t.style.display = 'none';
  });
  // Jamais de chevauchement ni de rotation : de la barre la plus haute à la plus basse, une valeur qui en croise une déjà posée est masquée (elle reste en infobulle et dans l'aria-label).
  const gardees = [];
  [...barres].sort((a, b) => a.top - b.top).forEach(({ t }) => {
    if (t.style.display === 'none') return;
    const b = t.getBBox();
    if (gardees.some((o) => b.x < o.x + o.width + 3 && b.x + b.width + 3 > o.x && b.y < o.y + o.height + 2 && b.y + b.height + 2 > o.y)) { t.style.display = 'none'; return; }
    gardees.push(b);
  });
  // « relevé insuffisant » : dans le cadre pointillé, seulement s'il tient dans la largeur de la période
  svg.querySelectorAll('.g-it').forEach((t) => { t.style.display = ''; t.style.display = t.getBBox().width + 8 <= Number(t.dataset.w) ? '' : 'none'; });
  void mob;
}
function cacherBulle() { const b = $('#g-bulle'); if (b) b.hidden = true; }
/** Infobulle (survol / focus) : basse / cible / haute, n annonces, nuits min — champs de calendrier(). */
function bulleGraphe(p, g, haut, xc) {
  const b = $('#g-bulle'), plot = $('#plot'); if (!b) return;
  const trio = (k, v, cls) => h('span', { class: `bu-c ${cls || ''}` }, h('small', { text: TC(`bulle_${k}`) }), h('b', { class: 'num', text: String(v) }));
  if (p.statut === 'ok') {
    b.replaceChildren(h('span', { class: 'bu-t', text: nomP(p) }), h('span', { class: 'bu-d', text: datesP(p) }),
      h('span', { class: 'bu-r' }, trio('basse', p.basse), trio('cible', p.cible, 'bu-cible'), trio('haute', p.haute), h('span', { class: 'bu-u', text: TC('bulle_u') })),
      h('span', { class: 'bu-m num', text: [TC('bulle_n', { n: p.n }), TC('bulle_min', { n: p.nuitsMin })].join(' · ') }));
  } else {
    b.replaceChildren(h('span', { class: 'bu-t', text: nomP(p) }), h('span', { class: 'bu-d', text: datesP(p) }),
      h('span', { class: 'bu-m', text: `${T('gr_insuff')} · ${TC('bulle_min', { n: p.nuitsMin })}` }));
  }
  b.hidden = false;
  const W = plot.clientWidth, w = b.offsetWidth, hb = b.offsetHeight;
  b.style.left = `${Math.max(0, Math.min(W - w, xc - w / 2))}px`;
  const top = haut - hb - 10;
  if (top >= 0) b.style.top = `${top}px`;
  else { b.style.left = `${Math.max(0, Math.min(W - w, xc + 30))}px`; b.style.top = `${Math.max(0, Math.min(haut, $('#plot svg').clientHeight - hb))}px`; } // pas de place au-dessus : à côté de la barre
  void g;
}

/* ---------- Vignette du premier écran : textes de canaux.json, marques posées par verifier() ---------- */
function ouvrirTitreAirbnb() {
  const a = canalTexte('airbnb', 'titre'); if (!a) return;
  etat.rep.texte = a.texte; etat.rep.source = 'airbnb'; montrer('reponse');
}
/* ---------- Vignette d'accueil : la légende de la barre Mondiaux (lib/prix.js calendrier) ---------- */
function majVignette() {
  const v = $('#vignette'); v.replaceChildren();
  const m = D.cal && D.cal.find((x) => x.id === 'mondiaux');
  if (!m || m.statut !== 'ok') { v.hidden = true; return; }
  v.hidden = false; v.classList.add('pret');
  const f = (D.comparables.periodes || []).find((x) => x.id === (m.fenetres || [])[0]);
  const dates = f ? enLangue(() => plageTxt(f.arrivee, f.depart)) : datesP(m);
  const cn = canalDe(m.nuitsMin, m.id, null, D.hyp).canal; const dx = deux(m.cible, cn);
  v.append(h('button', { type: 'button', class: 'vi-plein vi-ligne', onclick: () => ouvrirCal('mondiaux') },
    h('span', { class: 'vi-t', text: T('vi_titre', { nom: nomP(m), dates }) }),
    h('span', { class: 'vi-reco num', text: T('vi_reco', { cible: m.cible }) }),
    h('span', { class: 'vi-net num', text: T('vi_reco_net', { net: chf(Math.round(dx.net)), canal: T(`can_${cn}`) }) }),
    h('span', { class: 'vi-sous num', text: `${T('vi_marche', { basse: m.basse, haute: m.haute })} · ${T('vi_plancher', { p: plancher() })} · ${T('vi_hote')}` }),
    h('span', { class: 'vi-sous num' }, `${T('vi_n', { n: m.n, date: dateFr(m.releveLe) })} · `, h('u', { text: `${T('vi_lien')} →` }))));
}


function majBandeau() {
  const b = $('#bandeau-ia'); let vu = false;
  try { vu = sessionStorage.getItem('r3b_ia_ok') === '1'; } catch { vu = !!etat.iaOk; }
  const txt = texteUI[etat.langue] && texteUI[etat.langue].trad_auto;
  b.hidden = !(txt && !vu && !etat.iaOk); majHEnt();
  if (b.hidden) return;
  $('#bandeau-txt').textContent = txt; $('#bandeau-ok').textContent = T('ok_court');
}

/* ---------- Panneau ---------- */
const VUE_ETAPE = { dates: 'panneau', avant: 'panneau', form: 'formulaire', relecture: 'confirmation', accuse: 'accuse' };
function definirVue() { etat.vue = etat.panneau ? VUE_ETAPE[etat.etape] : etat.page; }
let minutCascade = null;
function ouvrirPanneau(etape, opener) {
  etat.etape = etape; etat.panneau = true; definirVue();
  if (opener) etat.opener = opener;
  etat.prixEvt = false;
  const p = $('#panneau');
  rendrePanneau();
  const nouveau = p.hidden;
  p.hidden = false; $('#voile').hidden = false;
  for (const s of ['#entete', '#principal', '#demo']) $(s).inert = true;
  document.documentElement.style.overflow = 'hidden';
  p.classList.remove('ferme');
  if (nouveau) void p.offsetWidth;
  if (nouveau) { p.classList.add('cascade'); clearTimeout(minutCascade); minutCascade = setTimeout(() => p.classList.remove('cascade'), 760); }
  p.classList.add('ouvert'); $('#voile').classList.add('ouvert');
  $('#p-titre').focus({ preventScroll: true });
}
function fermerPanneau(rendreFocus = true) {
  if (!etat.panneau) return;
  etat.panneau = false; definirVue();
  const p = $('#panneau');
  p.classList.remove('ouvert'); p.classList.add('ferme'); $('#voile').classList.remove('ouvert');
  for (const s of ['#entete', '#principal', '#demo']) $(s).inert = false;
  document.documentElement.style.overflow = '';
  setTimeout(() => { if (!etat.panneau) { p.hidden = true; $('#voile').hidden = true; p.classList.remove('ferme'); } }, 190);
  if (rendreFocus && etat.opener && document.contains(etat.opener)) etat.opener.focus();
}
function aller(etape) {
  etat.etape = etape; definirVue();
  if (etape === 'relecture') etat.envoiFait = false;
  rendrePanneau();
  $('#p-corps').scrollTop = 0;
  $('#p-titre').focus({ preventScroll: true });
}
function reserver(opener) {
  pousser('r3b_reserver_clic', { mode: etat.mode });
  ouvrirPanneau(etat.mode === 'avant' ? 'avant' : 'dates', opener);
}
function rendrePanneau() {
  const corps = $('#p-corps'), act = $('#p-action');
  const haut = corps.scrollTop;
  corps.replaceChildren(); act.replaceChildren();
  const f = { avant: etapeAvant, dates: etapeDates, form: etapeForm, relecture: etapeRelecture, accuse: etapeAccuse }[etat.etape];
  f(corps, act);
  corps.scrollTop = haut;
  if (etat.refocus) { const el = corps.querySelector(etat.refocus) || act.querySelector(etat.refocus); etat.refocus = null; if (el) el.focus({ preventScroll: false }); }
}
function lienExt(href, texte, classe) {
  return h('a', { href, target: '_blank', rel: 'noopener', class: classe || 'lien-ext' }, texte, ico('sortant', 16), h('span', { class: 'sr', style: 'position:absolute;left:-9999px', text: T('lien_sortant') }));
}

function etapeAvant(corps) {
  $('#p-titre').textContent = T('avant_titre');
  const L = D.tarifs.liens;
  corps.append(
    h('p', { class: 'etiquette', text: T('avant_cite') }),
    h('p', { text: T('avant_phrase') }),
    h('ul', { class: 'canaux' },
      h('li', null, lienExt(L.immocrans, T('avant_immo'))),
      h('li', null, lienExt(L.airbnb, T('avant_airbnb'))),
      h('li', null, lienExt(L.booking, T('avant_booking')))),
  );
}

function titreMois() { return `${MOIS_LONG[etat.langue][etat.moisM - 1]} ${etat.moisAn}`; }
function changerMois(delta, refocus) {
  let m = etat.moisM + delta, a = etat.moisAn;
  if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; }
  etat.moisM = m; etat.moisAn = a; etat.refocus = refocus || null; rendrePanneau();
}
const isoMois = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

function clicJour(iso) {
  const pris = D.prises.has(iso);
  if (iso < aujourdhui) return;
  const departPossible = pris && etat.arrivee && !etat.depart && iso > etat.arrivee && estLibre(D.plages, etat.arrivee, iso).libre;
  if (pris && !departPossible) return;
  if (!etat.arrivee || (etat.arrivee && etat.depart)) { etat.arrivee = iso; etat.depart = null; }
  else if (iso === etat.arrivee) return;
  else if (iso < etat.arrivee) { etat.depart = etat.arrivee; etat.arrivee = iso; }
  else etat.depart = iso;
  etat.focusIso = iso; etat.refocus = `[data-iso="${iso}"]`;
  rendrePanneau();
}
function clavierJour(e, iso) {
  const pas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  let cible = null;
  if (pas) cible = ajouter(iso, pas);
  else if (e.key === 'PageDown' || e.key === 'PageUp') {
    const [a, m, j] = iso.split('-').map(Number); const d = e.key === 'PageDown' ? 1 : -1;
    let mm = m + d, aa = a; if (mm < 1) { mm = 12; aa--; } if (mm > 12) { mm = 1; aa++; }
    cible = isoMois(aa, mm, Math.min(j, moisGrille(aa, mm).nbJours));
  }
  if (!cible) return;
  e.preventDefault();
  const [a, m] = cible.split('-').map(Number);
  etat.moisAn = a; etat.moisM = m; etat.focusIso = cible; etat.refocus = `[data-iso="${cible}"]`;
  rendrePanneau();
}

function calendrier() {
  const g = moisGrille(etat.moisAn, etat.moisM);
  const debutMois = isoMois(g.annee, g.mois, 1);
  const precedentOk = isoMois(g.annee, g.mois, g.nbJours) >= aujourdhui && (g.annee > Number(aujourdhui.slice(0, 4)) || g.mois > Number(aujourdhui.slice(5, 7)));
  const suivant = h('button', { type: 'button', class: 'cal-btn', 'aria-label': T('mois_suivant'), 'data-nav': 'suivant', onclick: () => changerMois(1, '[data-nav="suivant"]') }, ico('droite'));
  const prec = h('button', { type: 'button', class: 'cal-btn', 'aria-label': T('mois_precedent'), 'data-nav': 'precedent', disabled: !precedentOk, onclick: () => changerMois(-1, '[data-nav="precedent"]') }, ico('gauche'));
  const racine = h('div', null, h('div', { class: 'cal-tete' }, h('h3', { text: titreMois() }), h('div', { class: 'cal-nav' }, prec, suivant)));

  let libres = 0;
  for (let j = 1; j <= g.nbJours; j++) { const iso = isoMois(g.annee, g.mois, j); if (iso >= aujourdhui && !D.prises.has(iso)) libres++; }
  if (libres === 0) racine.append(h('p', { class: 'statut-ko', role: 'status', text: T('mois_plein', { mois: titreMois() }) }));

  const grille = h('div', { class: 'cal-grille', role: 'grid', 'aria-label': titreMois() });
  const entete = h('div', { class: 'cal-ligne', role: 'row' });
  T('jsem').forEach((l, i) => entete.append(h('div', { class: 'cal-jsem', role: 'columnheader', 'aria-label': T('jsem_long')[i], text: l })));
  grille.append(entete);

  const a = etat.arrivee, d = etat.depart;
  let tabbable = etat.focusIso && etat.focusIso.slice(0, 7) === debutMois.slice(0, 7) ? etat.focusIso : null;
  if (!tabbable) for (let j = 1; j <= g.nbJours; j++) { const iso = isoMois(g.annee, g.mois, j); if (iso >= aujourdhui && !D.prises.has(iso)) { tabbable = iso; break; } }
  if (!tabbable) tabbable = debutMois;
  let ligneEl = null;
  const total = g.premierJourSemaine + g.nbJours;
  for (let i = 0; i < Math.ceil(total / 7) * 7; i++) {
    if (i % 7 === 0) { ligneEl = h('div', { class: 'cal-ligne', role: 'row' }); grille.append(ligneEl); }
    const j = i - g.premierJourSemaine + 1;
    if (j < 1 || j > g.nbJours) { ligneEl.append(h('div', { class: 'jour-vide', role: 'gridcell' })); continue; }
    const iso = isoMois(g.annee, g.mois, j);
    const pris = D.prises.has(iso), passe = iso < aujourdhui;
    const departPossible = pris && !passe && a && !d && iso > a && estLibre(D.plages, a, iso).libre;
    const sel = iso === a || iso === d;
    const entre = a && d && iso > a && iso < d;
    const cls = ['jour', pris && !departPossible ? 'pris' : '', pris && departPossible ? 'pris depart-possible' : '', passe ? 'passe' : '', sel ? 'sel' : '', entre ? 'entre' : ''].filter(Boolean).join(' ');
    const etatTxt = departPossible ? T('depart_possible') : pris ? T('pris') : passe ? T('pris') : T('libre');
    const label = `${j} ${(MOIS_GEN[etat.langue] || MOIS_LONG[etat.langue])[g.mois - 1]} ${g.annee}, ${etatTxt}`;
    const bouton = h('button', {
      type: 'button', class: cls, 'data-iso': iso, text: String(j), 'aria-label': label,
      'aria-disabled': (pris && !departPossible) || passe ? 'true' : null, 'aria-pressed': sel ? 'true' : null,
      tabindex: iso === tabbable ? '0' : '-1', style: `--i:${j - 1}`,
      onclick: () => clicJour(iso), onkeydown: (e) => clavierJour(e, iso),
    });
    ligneEl.append(h('div', { role: 'gridcell' }, bouton));
  }
  racine.append(grille);
  return racine;
}

function etapeDates(corps, act) {
  $('#p-titre').textContent = T('vos_dates');
  const c = fiche();
  if (!etat.prixEvt) { etat.prixEvt = true; pousser('r3b_prix_public_affiche', {}); }
  const prixSem = chf(c.prix_semaine_public_chf.valeur);
  corps.append(h('div', { class: 'prix-carte' }, h('b', { class: 'num', text: T('prix_des', { prix: prixSem }) }), h('small', { text: T('prix_source', { date: dateFr(c.prix_semaine_public_chf.date) }) })));
  const L0 = D.tarifs.liens;
  const note = (k, p) => h('span', { class: 'cn-note', text: T(k, p) });
  corps.append(h('ul', { class: 'canaux-lignes' },
    h('li', null, lienExt(L0.immocrans, T('canal_immocrans_c')), note('cn_immocrans', { prix: prixSem })),
    h('li', null, lienExt(L0.airbnb, T('canal_airbnb')), note('cn_airbnb')),
    h('li', null, lienExt(L0.booking, T('canal_booking')), note('cn_booking')),
    D.tarifs.canalDirect !== false ? h('li', null, h('span', { class: 'cn-nom', text: T('cn_direct_nom') }), note('cn_direct')) : null));
  const bd = h('div', { class: 'dates-bloc', id: 'dates-bloc', hidden: etat.datesReplie });
  corps.append(h('button', { type: 'button', class: 'bouton bouton-contour bt-choisir', id: 'bt-choisir', 'aria-expanded': String(!etat.datesReplie), 'aria-controls': 'dates-bloc',
    onclick: () => { etat.datesReplie = !etat.datesReplie; etat.refocus = '#bt-choisir'; rendrePanneau(); } },
  T('choisir_mes_dates')), bd);
  bd.append(h('p', { class: 'etiquette', text: T('cal_synth') }));

  if (D.erreurIcs) bd.append(h('p', { class: 'statut-ko', role: 'alert', text: T('cal_indispo') }));
  else bd.append(calendrier());

  const a = etat.arrivee, d = etat.depart;
  bd.append(h('p', { class: 'resume', 'aria-live': 'polite', text: a && d ? T('resume', { a: sansAnnee(a), d: sansAnnee(d), n: nuitsTxt(compterNuits(a, d)) }) : a ? T('resume', { a: sansAnnee(a), d: '…', n: '…' }) : T('choisir_arrivee') }));

  const moins = h('button', { type: 'button', class: 'pas-btn', 'aria-label': T('moins'), disabled: etat.voyageurs <= 1, 'data-pas': 'moins', onclick: () => { etat.voyageurs--; etat.refocus = '[data-pas="moins"]'; rendrePanneau(); } }, '−');
  const plus = h('button', { type: 'button', class: 'pas-btn', 'aria-label': T('plus'), disabled: etat.voyageurs >= capacite(), 'data-pas': 'plus', onclick: () => { etat.voyageurs++; etat.refocus = '[data-pas="plus"]'; rendrePanneau(); } }, '+');
  const lg = (code) => h('button', { type: 'button', 'aria-pressed': String(etat.langueDemande === code), text: code.toUpperCase(), 'data-ld': code, onclick: () => { etat.langueDemande = code; etat.refocus = `[data-ld="${code}"]`; rendrePanneau(); } });
  bd.append(...[
    h('div', { class: 'rang' }, h('span', { id: 'lab-voy', text: T('voyageurs') }),
      h('div', { class: 'pas', role: 'group', 'aria-labelledby': 'lab-voy' }, moins, h('span', { class: 'pas-val', 'aria-live': 'polite', text: String(etat.voyageurs) }), plus)),
    etat.voyageurs >= capacite() ? h('p', { class: 'source', text: T('voyageurs_max') }) : null,
    h('div', { class: 'rang' }, h('span', { id: 'lab-ld', text: T('langue_demande') }), h('div', { class: 'choix2', role: 'group', 'aria-labelledby': 'lab-ld' }, ['fr', 'en', 'de', 'it', 'ru'].map(lg)))].filter(Boolean));

  // Bloc dates
  let est = null, lib = null, bloc = null, sej = null, court = false, collant = null;
  if (a && d && !D.erreurIcs) {
    lib = estLibre(D.plages, a, d); est = estimation();
    const n = est.nuits;
    sej = prixSejour(a, d, D.cal, marcheObj());
    court = !!(lib.libre && !est.erreurs.length && sej.nuitsMin && n < sej.nuitsMin);
    const interne = h('div');
    if (!lib.libre) {
      interne.append(h('p', { class: 'statut-ko', text: T('conflit', { p: plageCourte(lib.conflit.debut, lib.conflit.fin) }) }));
    } else if (est.erreurs.length || court) {
      for (const code of est.erreurs) interne.append(h('p', { class: 'statut-ko', text: code === 'nuits_min' ? T('nuits_min_detail', { n: est.nuitsMin }) : T(`erreurs.${code}`) }));
      if (court) interne.append(h('p', { class: 'statut-ko', text: T('nuits_min_detail', { n: sej.nuitsMin }) }));
    } else {
      interne.append(h('p', { class: 'statut-ok', 'aria-live': 'polite', text: T('libre_nuits', { n: nuitsTxt(n) }) }));
      interne.append(...prixPanneau(sej, n).filter(Boolean));
      if (sej.total != null) {
        const immo = n >= (D.hyp.seuilImmoCrans || 7);
        collant = h('div', { class: 'pn-collant', 'aria-hidden': 'true' },
          h('span', { class: 'pn-c1 num', text: immo ? T('pn_immo_titre', { prix: chf(c.prix_semaine_public_chf.valeur) }) : totalTxt(sej, n) }),
          immo ? h('span', { class: 'pn-c2 pn-repere num', text: repereTxt(sej, n) }) : null);
      }

      interne.append(h('p', { class: 'source' }, T('taxe', { chf: D.tarifs.taxeSejour.chfAdulteNuit }).replace(/\)$/, ') '), lienExt(D.tarifs.taxeSejour.lien, T('reglement'))));
      const cle = `${a}|${d}|${etat.voyageurs}|${!!etat.tarifsHote}`;
      if (etat.estimCle !== cle) { etat.estimCle = cle; pousser('r3b_estimation_affichee', { nuits: n, total: sej.total, exemple: false }); }
    }
    const nouveau = !etat.estimVue; etat.estimVue = true;
    bloc = h('div', { class: `bloc${nouveau ? ' nouveau' : ''}` }, interne);
    corps.append(bloc);
  } else etat.estimVue = false;

  // Choix : les trois canaux toujours visibles ; ImmoCrans « 7 nuits et plus » seulement s'il convient, sinon en dernier et sans cette mention
  const L = D.tarifs.liens;
  const nChoisies = a && d ? compterNuits(a, d) : null;
  const courtSej = nChoisies != null && nChoisies < (D.hyp.seuilImmoCrans || 7);
  const liImmo = h('li', null, lienExt(L.immocrans, T(courtSej ? 'canal_immocrans_c' : 'canal_immocrans')));
  const liAbnb = h('li', null, lienExt(L.airbnb, T('canal_airbnb'))), liBk = h('li', null, lienExt(L.booking, T('canal_booking')));
  void liImmo; void liAbnb; void liBk; void courtSej;

  if (collant) act.append(collant);
  const pret = est && lib && lib.libre && est.ok && !court;
  if (pret && est.aiguillage === 'immocrans') {
    const recapTxt = `${plageTxt(a, d)} · ${persTxt(etat.voyageurs)} · Richemont 3B`;
    const bc = h('button', { type: 'button', class: 'bouton bouton-contour', onclick: (e) => copier(recapTxt, e.currentTarget), text: T('copier') });
    corps.append(h('div', { class: 'carte-aig' }, h('p', { text: T('aig_immocrans') }), h('div', { class: 'recap' }, h('span', { text: recapTxt }), bc)));
    if (etat.aigEvt !== `${a}|${d}`) { etat.aigEvt = `${a}|${d}`; pousser('r3b_aiguillage_immocrans', { nuits: est.nuits }); }
    act.append(h('a', { class: 'bouton bouton-plein', href: L.immocrans, target: '_blank', rel: 'noopener', id: 'bt-immocrans' }, T('continuer_immocrans'), ico('sortant', 18)));
  } else if (pret && est.aiguillage === 'direct') {
    act.append(h('button', { type: 'button', class: 'bouton bouton-plein', id: 'bt-direct', onclick: () => aller('form') }, T('demander_hote')));
  } else if (D.tarifs.canalDirect !== false) {
    act.append(h('button', { type: 'button', class: 'bouton bouton-plein', disabled: true, text: pret ? T('demander_hote') : (a && d ? T('demander_hote') : T('choisir_dates')) }));
  }

  const faq = sectionFaq(); if (faq) corps.append(faq);

  corps.append(h('div', { class: 'p-pied' },
    h('button', { type: 'button', class: 'bouton bouton-texte', onclick: () => { fermerPanneau(false); montrer('hote'); }, text: T('vue_hote') })));
}

/* ---------- FAQ invité sourcée (./data/faq.json, facultative) ---------- */
const FLECHE = 'M213.7 101.7l-80 80a8 8 0 0 1-11.4 0l-80-80a8 8 0 0 1 11.4-11.4L128 164.7l74.3-74.4a8 8 0 0 1 11.4 11.4Z';
function sectionFaq() {
  if (!D.faq || !D.faq.length) return null;
  const lg = etat.langue;
  const items = D.faq.map((q) => {
    const question = (q.question && (q.question[lg] || q.question.fr)) || '';
    const reponse = (q.reponse && (q.reponse[lg] || q.reponse.fr)) || '';
    const fleche = document.createElementNS(NS, 'svg');
    fleche.setAttribute('viewBox', '0 0 256 256'); fleche.setAttribute('width', '18'); fleche.setAttribute('height', '18');
    fleche.setAttribute('aria-hidden', 'true'); fleche.setAttribute('focusable', 'false'); fleche.setAttribute('class', 'faq-fleche');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', FLECHE); p.setAttribute('fill', 'currentColor'); fleche.append(p);
    const src = h('p', { class: 'faq-source' }, T('faq_source', { src: hoteSource(q.source), date: q.date ? dateFr(q.date) : '' }),
      q.statut === 'H' ? h('span', { class: 'etiquette faq-h', text: T('faq_a_confirmer') }) : null);
    const det = h('details', { class: 'faq-q', 'data-faq': String(q.id), open: etat.faqOuvert.has(String(q.id)) },
      h('summary', null, h('span', { class: 'faq-question', text: question }), fleche),
      h('div', { class: 'faq-corps' }, h('p', { class: 'faq-reponse', text: reponse }), src));
    det.addEventListener('toggle', () => { if (det.open) etat.faqOuvert.add(String(q.id)); else etat.faqOuvert.delete(String(q.id)); });
    return det;
  });
  return h('section', { class: 'faq', 'aria-labelledby': 'faq-titre' }, h('h3', { id: 'faq-titre', text: T('faq_titre') }), items);
}
function ligneFaqHote() {
  if (!D.faq || !D.faq.length) return null;
  const langues = ['fr', 'en', 'de', 'it', 'ru'].filter((l) => D.faq.some((q) => q.reponse && q.reponse[l]));
  const bloques = []; // la taxe de séjour (tarifs.json, statut H) est un montant sourcé : admis comme prix
  for (const q of D.faq) for (const l of langues) {
    const txt = q.reponse && q.reponse[l];
    if (txt && verifier(txt, D.fiche, { prixAdmis: [D.tarifs.taxeSejour.chfAdulteNuit] }).verdict === 'bloque') bloques.push(`${q.id}/${l}`);
  }
  const ok = !bloques.length;
  return h('p', { class: `faq-hote ${ok ? 'c-ok' : 'c-ko'}`, id: 'faq-hote', text: ok ? T('faq_hote', { n: D.faq.length, l: langues.length }) : T('faq_hote_ko', { b: bloques.length, t: D.faq.length * langues.length, ids: bloques.join(', ') }) });
}

/* ---------- Formulaire, relecture, accusé ---------- */
const CHAMP_DE_CODE = { prenom_vide: 'prenom', email_invalide: 'email', message_trop_long: 'message' };
function demandeSaisie() {
  return { prenom: etat.form.prenom, email: etat.form.email, message: etat.form.message, arrivee: etat.arrivee, depart: etat.depart, voyageurs: etat.voyageurs, langue: etat.langueDemande, canal: 'direct' };
}
function codesDemande() { return valider(demandeSaisie(), D.fiche, { aujourdhui, tarifs: tarifsEff() }); }
function montrerErreur(champ, codes) {
  const code = codes.find((c) => CHAMP_DE_CODE[c] === champ);
  const err = $(`#err-${champ}`), inp = $(`#f-${champ}`);
  if (!err || !inp) return false;
  err.textContent = code ? T(`erreurs.${code}`) : '';
  inp.setAttribute('aria-invalid', code ? 'true' : 'false');
  return !!code;
}
function etapeForm(corps, act) {
  $('#p-titre').textContent = T('form_titre');
  const champ = (id, label, ctrl) => h('div', { class: 'champ' }, h('label', { for: `f-${id}`, text: label }), ctrl, h('p', { class: 'erreur', id: `err-${id}` }));
  const prenom = h('input', { id: 'f-prenom', name: 'prenom', type: 'text', autocomplete: 'off', 'aria-describedby': 'err-prenom', 'aria-invalid': 'false', onblur: () => montrerErreur('prenom', codesDemande()), oninput: (e) => { etat.form.prenom = e.target.value; } });
  const email = h('input', { id: 'f-email', name: 'email', type: 'email', autocomplete: 'off', inputmode: 'email', 'aria-describedby': 'err-email', 'aria-invalid': 'false', onblur: () => montrerErreur('email', codesDemande()), oninput: (e) => { etat.form.email = e.target.value; } });
  const message = h('textarea', { id: 'f-message', name: 'message', maxlength: '500', 'aria-describedby': 'err-message cpt', 'aria-invalid': 'false', onblur: () => montrerErreur('message', codesDemande()),
    oninput: (e) => { etat.form.message = e.target.value; $('#cpt').textContent = T('compteur', { n: e.target.value.length }); } });
  prenom.value = etat.form.prenom; email.value = etat.form.email; message.value = etat.form.message;
  const form = h('form', { id: 'f-demande', novalidate: true, class: 'p-corps-form', style: 'display:flex;flex-direction:column;gap:20px',
    onsubmit: (e) => { e.preventDefault(); relire(); } },
  champ('prenom', T('prenom'), prenom), champ('email', T('email'), email),
  champ('message', T('message'), message), h('p', { class: 'compteur', id: 'cpt', text: T('compteur', { n: etat.form.message.length }) }),
  h('p', { class: 'source', text: T('confidentialite') }));
  corps.append(form);
  act.append(h('button', { type: 'submit', form: 'f-demande', class: 'bouton bouton-plein', text: T('relire') }),
    h('button', { type: 'button', class: 'bouton bouton-texte', onclick: () => aller('dates'), text: T('retour_dates') }));
}
function relire() {
  const codes = codesDemande();
  const champs = ['prenom', 'email', 'message'].filter((c) => montrerErreur(c, codes));
  if (champs.length) { $(`#f-${champs[0]}`).focus(); return; }
  if (codes.length) { const e = $('#err-prenom'); e.textContent = codes.map((c) => T(`erreurs.${c}`)).join(' '); return; }
  aller('relecture');
}
function etapeRelecture(corps, act) {
  $('#p-titre').textContent = T('relisez');
  const est = estimation(); const c = fiche();
  const prix = est && est.total != null ? T('prix_estim_rel', { total: chf(est.total) }) : T('prix_public_rel', { prix: chf(c.prix_semaine_public_chf.valeur) });
  const dl = h('dl', { class: 'recap-liste' });
  const ligneDl = (k, v) => dl.append(h('dt', { text: k }), h('dd', { text: v }));
  ligneDl(T('rel_dates'), plageTxt(etat.arrivee, etat.depart)); ligneDl(T('rel_nuits'), String(est.nuits));
  ligneDl(T('rel_pers'), String(etat.voyageurs)); ligneDl(T('rel_langue'), T(`langue_${etat.langueDemande}`));
  ligneDl(T('rel_prix'), prix); ligneDl(T('rel_prenom'), etat.form.prenom.trim()); ligneDl(T('rel_email'), etat.form.email.trim());
  ligneDl(T('rel_message'), etat.form.message.trim() || T('aucun_message'));
  corps.append(dl);
  act.append(h('button', { type: 'button', class: 'bouton bouton-plein', id: 'bt-envoyer', onclick: (e) => envoyer(e.currentTarget), text: T('envoyer') }),
    h('button', { type: 'button', class: 'bouton bouton-texte', onclick: () => aller('form'), text: T('modifier') }));
}
function envoyer(bouton) {
  bouton.disabled = true; // synchrone, avant tout autre traitement
  if (etat.envoiFait) return;
  etat.envoiFait = true;
  bouton.textContent = T('envoi');
  const r = magasin.ajouter(demandeSaisie());
  etat.demandeCourante = r.demande; etat.doublon = r.doublon ? r : null;
  if (r.doublon) { etat.doublons.push({ de: r.id, quand: new Date().toISOString() }); pousser('r3b_doublon_bloque', { id: r.id }); }
  else pousser('r3b_demande_envoyee', { id: r.id, nuits: compterNuits(r.demande.arrivee, r.demande.depart) });
  aller('accuse');
}
function etapeAccuse(corps, act) {
  const r = etat.doublon, dem = etat.demandeCourante;
  $('#p-titre').textContent = r ? T('deja_titre') : T('recue_titre');
  const bloc = h('div', { class: 'recu', 'aria-live': 'polite' });
  if (r) {
    const q = quand(r.recueLe || dem.recueLe);
    bloc.append(h('p', { class: 'encart', text: T('doublon_txt', { id: r.id, date: q.date, heure: q.heure }) }));
  } else {
    bloc.append(h('p', { class: 'numero' }, h('span', { text: T('numero', { id: dem.id }) }),
      h('button', { type: 'button', class: 'bouton bouton-contour', onclick: (e) => copier(dem.id, e.currentTarget) }, ico('copier', 18), T('copier'))));
  }
  if (!r) {
    const rl = h('dl', { class: 'recap-liste' });
    const ln = (k, v) => rl.append(h('dt', { text: k }), h('dd', { text: v }));
    ln(T('rel_dates'), plageTxt(dem.arrivee, dem.depart)); ln(T('rel_nuits'), String(compterNuits(dem.arrivee, dem.depart)));
    ln(T('rel_pers'), String(dem.voyageurs)); ln(T('rel_langue'), T(`langue_${dem.langue}`)); ln(T('rel_canal'), T('canal_direct'));
    const est = estimation(); const pr = est && est.total != null ? T('prix_estim_rel', { total: chf(est.total) }) : T('prix_public_rel', { prix: chf(fiche().prix_semaine_public_chf.valeur) });
    ln(T('rel_prix'), pr);
    bloc.append(rl);
  }
  bloc.append(h('p', { text: T('reponse_a', { email: dem.email }) }));
  if (!r) bloc.append(h('p', { class: 'suite', text: T('suite_txt') }));
  if (magasin.avertissement) bloc.append(h('p', { class: 'source', text: T('stockage_indisponible') }));
  corps.append(bloc);
  act.classList.add('attente'); setTimeout(() => act.classList.remove('attente'), 500); // un double clic ne doit pas tomber sur un nouveau bouton
  act.append(h('button', { type: 'button', class: 'bouton bouton-plein', onclick: () => { fermerPanneau(false); montrer('reponse'); }, text: T('voir_reponse') }),
    h('button', { type: 'button', class: 'bouton bouton-contour', onclick: () => { fermerPanneau(false); montrer('hote'); }, text: T('vue_hote') }),
    h('button', { type: 'button', class: 'bouton bouton-texte', onclick: () => { etat.doublon = null; aller('dates'); }, text: T('retour_dates') }));
}

/* ---------- Pages ---------- */
/** Défilement doux (420 ms, courbe du site) vers la période ouverte : cible = haut de la ligne moins en-tête + axe collant (scroll-margin-top, style.css). Mouvement réduit : saut direct (appelant). */
let defilId = 0;
function defilerVers(id) {
  const cible = () => { const l = document.querySelector(`.per[data-id="${id}"]`); if (!l) return null; const m = parseFloat(getComputedStyle(l).scrollMarginTop) || 0; return Math.max(0, Math.round(l.getBoundingClientRect().top + window.scrollY - m)); };
  const jeton = ++defilId, t0 = performance.now(), de = window.scrollY, DUREE = 420;
  const courbe = (k) => 1 - (1 - k) ** 4; // proche de --out (cubic-bezier .22, 1, .36, 1)
  const pas = (now) => {
    if (jeton !== defilId) return;
    const a = cible(); if (a == null) return;
    const k = Math.min(1, (now - t0) / DUREE);
    window.scrollTo(0, Math.round(de + (a - de) * courbe(k)));
    if (k < 1) requestAnimationFrame(pas); else setTimeout(() => { if (jeton === defilId) { const b = cible(); if (b != null && Math.abs(window.scrollY - b) > 1) window.scrollTo(0, b); } }, 120);
  };
  requestAnimationFrame(pas);
}
for (const ev of ['wheel', 'touchstart', 'keydown']) window.addEventListener(ev, () => { defilId++; }, { passive: true });
function montrer(page) {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); // même image que le basculement de vue, avant l'animation d'entrée : l'en-tête reste à y = 0
  etat.page = page; definirVue();
  $('#demo').hidden = page !== 'accueil';
  $('#v-accueil').hidden = page !== 'accueil'; $('#v-reponse').hidden = page !== 'reponse'; $('#v-hote').hidden = page !== 'hote'; $('#v-prix').hidden = page !== 'prix'; $('#v-methode').hidden = page !== 'methode';
  if (page === 'reponse') rendreReponse();
  if (page === 'hote') rendreHote();
  if (page === 'methode') rendreMethode();
  if (page === 'prix') { sourisReelle = false; ancreSouris = souris; entreePrix = performance.now(); const b = $('#bulle'); if (b) b.hidden = true; rendrePrix(); }
  const courant = { prix: 'bt-prix', reponse: 'bt-verif', hote: 'bt-appart' }[page];
  document.querySelectorAll('.menu-lien').forEach((b) => { if (b.id === courant) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); majHEnt(); majSurNuit();
  const cible = { accueil: '#titre-accueil', reponse: '#titre-reponse', hote: '#titre-hote', prix: '#titre-prix', methode: '#titre-methode' }[page];
  const el = $(cible); if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
  if (page === 'accueil' && $('#plot').clientWidth !== grapheLarg) dessinerGraphe();
  // Période ouverte : défilement APRÈS la mise en page du détail ; scroll-margin-top (style.css) laisse l'en-tête et l'axe fixés visibles.
  if (page === 'prix' && etat.ouvert) {
    const aller = () => { const l = document.querySelector(`.per[data-id="${etat.ouvert}"]`); if (l) l.scrollIntoView({ block: 'start' }); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(() => { aller(); requestAnimationFrame(aller); });
      setTimeout(aller, 260); // après l'entrée animée de la vue (translation de 12 px)
    } else requestAnimationFrame(() => defilerVers(etat.ouvert));
  }
}

/* Message d'un fait dans la langue d'interface : par `code` si la lib le fournit, sinon repli sur le texte français reconnu. */
function messageFait(f) {
  if (etat.langue === 'fr') return f.message;
  const u = D.fiche.champs.surface_utile_m2.valeur, hb = D.fiche.champs.surface_habitable_m2.valeur;
  const n = f.attendu != null && typeof f.attendu !== 'boolean' ? f.attendu : '';
  let code = f.code || null;
  if (!code) {
    const m = String(f.message || '');
    if (/^Confirmé/.test(m)) code = 'confirme';
    else if (/^La fiche l'annonce/.test(m)) code = 'annonce';
    else if (/^La fiche dit/.test(m)) code = 'fiche_dit';
    else if (/^Absent de la fiche/.test(m)) code = 'non_annonce';
    else if (/^Deux mesures/.test(m)) code = 'deux_mesures';
    else if (/^Le site dit/.test(m)) code = 'site_dit_min';
    else if (/^Prix hors fiche/.test(m)) code = 'prix_hors_fiche';
  }
  if (code === 'absent') code = 'non_annonce';
  if (code === 'fiche_dit' && f.type === 'surface') code = 'fiche_dit_surface';
  const cle = `msg_${code}`;
  if (!code || (texteUI[etat.langue] || {})[cle] == null) return f.message;
  return T(cle, { n, u, h: hb, periode: f.periodeNom, basse: f.basse, haute: f.haute, date: f.date ? dateFr(f.date) : '', liste: f.liste });
}

/* Réponse à l'invité */
const DEMO_DEMANDE = { prenom: 'Invité', email: 'invite@example.test', arrivee: '2026-12-12', depart: '2026-12-19', voyageurs: 4, langue: 'fr', message: '' };
const demandeRep = () => etat.demandeCourante || DEMO_DEMANDE;
function brouillonCorrect() {
  const d = demandeRep();
  const est = estimer(d, tarifsEff(), D.fiche, { aujourdhui });
  return brouillon(d, est, D.fiche, tarifsEff(), d.langue || etat.langue || 'fr').texte;
}
function textePiege() {
  const b = D.brouillons.find((x) => x.id === 'piege-02') || D.brouillons.find((x) => /^piege-/.test(x.id) && /piscine|pool/i.test(`${x.note || ''} ${x.texte}`));
  return b ? b.texte : '';
}
const canalTexte = (canal, champ) => D.canaux.find((x) => x.canal === canal && x.champ === champ);
let minuterie = null;

function rendreReponse() {
  const racine = $('#rep-grille'); racine.replaceChildren();
  const d = demandeRep();
  if (!etat.rep.texte) { etat.rep.texte = brouillonCorrect(); etat.rep.source = 'correct'; }
  const exemple = (cle, source, fn) => h('button', { type: 'button', class: 'bouton bouton-sec', text: T(cle), 'data-ex': source, onclick: () => {
    etat.rep.texte = fn(); etat.rep.source = source; $('#rep-texte').value = etat.rep.texte; verifRep();
  } });
  const ta = h('textarea', { id: 'rep-texte', 'aria-label': T('texte_a_verifier'), spellcheck: 'false', oninput: (e) => {
    etat.rep.texte = e.target.value; etat.rep.source = 'libre'; clearTimeout(minuterie); minuterie = setTimeout(verifRep, 150);
  } });
  ta.value = etat.rep.texte;
  racine.append(
    h('div', { class: 'rep-texte' },
      h('h1', { id: 'titre-reponse', tabindex: '-1', text: T('rep_titre', { prenom: d.prenom }) }),
      h('div', { class: 'exemples' }, exemple('ex_piege', 'piege', textePiege), exemple('ex_airbnb', 'airbnb', () => (canalTexte('airbnb', 'titre') || { texte: '' }).texte), exemple('ex_correct', 'correct', brouillonCorrect)),
      ta,
      h('p', { class: 'annote-titre', text: T('texte_annote') }),
      h('div', { class: 'annote', id: 'rep-annote' }),
      h('div', { class: 'envoi-ligne', id: 'rep-envoi' },
        h('button', { type: 'button', class: 'bouton bouton-plein', id: 'rep-envoyer', text: T('envoyer_invite'), onclick: () => { $('#rep-accuse').textContent = T('rep_prete'); } }),
        h('button', { type: 'button', class: 'bouton bouton-sec', id: 'rep-copier', onclick: (e) => copier(etat.rep.corrige || '', e.currentTarget) }),
        h('span', { class: 'raison', id: 'rep-raison' }), h('span', { class: 'accuse-rep', id: 'rep-accuse', role: 'status' }))),
    h('div', { class: 'rep-verdict' }, h('h2', { text: T('verif_titre') }), h('p', { class: 'verdict', id: 'rep-verdict', 'aria-live': 'polite' })),
    h('div', { class: 'rep-cartes', id: 'rep-cartes' }));
  verifRep();
}
/* Texte corrigé : lib/canaux.js si présent ; sinon repli sur les écarts numériques de verifier(). */
function corriger(texte, faits) {
  if (CX && CX.corrigerTexte) { try { return CX.corrigerTexte(texte, faits, D.fiche); } catch { /* repli */ } }
  let out = texte; const corrections = [];
  for (const f of faits.filter((q) => q.statut === 'contredit' && typeof q.attendu === 'number' && /\d+/.test(q.extrait)).sort((a, b) => b.debut - a.debut)) {
    const par = f.extrait.replace(/\d+/, String(f.attendu));
    out = out.slice(0, f.debut) + par + out.slice(f.fin); corrections.unshift({ extrait: f.extrait, remplacement: par, raison: f.message });
  }
  return { texte_corrige: out, corrections };
}
function verdictTexte(c) {
  const p = [];
  for (const k of ['contredit', 'absent', 'precision', 'confirme']) if (c[k]) p.push(plurielT(`v_${k}`, c[k]));
  return p.length ? p.join(', ') : T('v_vide');
}
function verifRep() {
  const texte = etat.rep.texte;
  const d = demandeRep();
  const est = estimer(d, tarifsEff(), D.fiche, { aujourdhui });
  const r = verifier(texte, D.fiche, { prixAdmis: prixAdmisPour(est, tarifsEff()), calendrier: D.cal });
  const bloque = r.verdict === 'bloque';
  const nb = r.compte.contredit + r.compte.absent;
  const v = $('#rep-verdict'); v.textContent = verdictTexte(r.compte); v.className = `verdict ${bloque ? 'ko' : 'ok'}`;
  $('#rep-accuse').textContent = '';

  // Texte annoté (construit avec createElement)
  const an = $('#rep-annote'); an.replaceChildren();
  let pos = 0;
  r.faits.forEach((f, i) => {
    if (f.debut > pos) an.append(texte.slice(pos, f.debut));
    const lab = f.statut === 'confirme' ? null : h('small', { text: `(${T(`m_${f.statut}`)})` });
    an.append(h('span', { class: `m m-${f.statut}`, tabindex: '0', 'data-fait': String(i) }, texte.slice(f.debut, f.fin), lab));
    pos = f.fin;
  });
  if (pos < texte.length) an.append(texte.slice(pos));

  // Cartes
  const col = $('#rep-cartes'); col.replaceChildren();
  if (etat.rep.source === 'airbnb') {
    const a = canalTexte('airbnb', 'titre'), o = canalTexte('airbnb', 'og_title');
    if (a && o && texte === a.texte) {
      const lg = (lab, txt) => h('div', null, h('em', { text: lab }), h('span', { text: `« ${txt} »` }));
      col.append(h('div', { class: 'preuve preuve-s' },
        h('div', { class: 'cmp-h' }, h('b', { text: T('balises_titre') }), ` · ${T('balises_txt', { date: dateFr(a.date) })}`),
        lg('<title>', a.texte), lg('og:title', o.texte),
        h('div', { class: 'cmp-h' }, T('balise_source', { url: a.source, date: dateFr(a.date) }))));
    }
  }
  const src = (f) => T('source_court', { src: hoteSource(f.source), date: f.date ? dateFr(f.date) : '' });
  r.faits.forEach((f, i) => {
    if (f.statut === 'confirme') return;
    const msg = f.statut === 'absent' ? T('absent_msg') : `${messageFait(f)} ${f.source ? src(f) : ''}`.trim();
    col.append(h('div', { class: `carte carte-${f.statut}`, tabindex: '0', 'data-fait': String(i) },
      h('span', { class: 'carte-t', text: `${f.extrait} (${T(`m_${f.statut}`)})` }), h('span', { class: 'carte-s', text: msg })));
  });
  const conf = r.faits.map((f, i) => [f, i]).filter(([f]) => f.statut === 'confirme');
  if (conf.length) {
    col.append(h('details', { class: 'confirmes' }, h('summary', { text: T('confirmes_voir', { n: conf.length }) }),
      conf.map(([f, i]) => h('div', { class: 'carte carte-confirme', tabindex: '0', 'data-fait': String(i) }, h('span', { class: 'carte-t', text: f.extrait }), h('span', { class: 'carte-s', text: f.source ? src(f) : messageFait(f) })))));
  }

  // Action selon la source : un titre d'annonce se copie (corrigé), une réponse à l'invité s'envoie.
  const titre = etat.rep.source === 'airbnb';
  const cor = corriger(texte, r.faits); etat.rep.corrige = cor.texte_corrige;
  const bc = $('#rep-copier'); bc.textContent = T(titre ? 'copier_titre_corrige' : 'copier_texte_corrige'); bc.disabled = !cor.corrections.length;
  bc.className = `bouton ${titre ? 'bouton-plein' : 'bouton-sec'}`; $('#rep-envoi').classList.toggle('mode-titre', titre);
  document.querySelectorAll('#v-reponse [data-ex]').forEach((b) => b.classList.toggle('chip-on', b.dataset.ex === etat.rep.source));
  const bt = $('#rep-envoyer'); bt.disabled = bloque || titre; bt.className = `bouton ${titre ? 'bouton-sec' : 'bouton-plein'}`;
  $('#rep-raison').textContent = titre ? T('titre_pas_invite') : bloque ? (forme(nb) === '1' ? T('point1', { n: nb }) : T(forme(nb) === 'F' ? 'points_a_corriger_F' : 'points_a_corriger', { n: nb })) : '';
  if (bloque && etat.dernierNb !== nb) pousser('r3b_brouillon_bloque', { nb });
  etat.dernierNb = bloque ? nb : null;
}
function lierFaits(e, actif) {
  const el = e.target.closest && e.target.closest('[data-fait]');
  if (!el) return;
  document.querySelectorAll(`#v-reponse [data-fait="${el.dataset.fait}"]`).forEach((x) => x.classList.toggle('actif', actif));
}

/* Vue hôte */
const CANAUX = ['site', 'airbnb', 'immocrans', 'booking'];
const TYPE_LIGNE = { chambres: 'chambres', salles_eau: 'salles_eau', capacite: 'personnes', surface: 'surface', etage: 'etage', lieu: 'lieu', prix: 'prix', distance: 'distance', garage: 'equipement', renovation: 'renovation' };
/* Repli si lib/canaux.js est absent : même forme que tableauCanaux(fiche, canaux), construite depuis les faits de verifier(). */
function tableauRepli() {
  const lignes = Object.keys(TYPE_LIGNE).map((champ) => {
    const parCanal = {};
    for (const k of CANAUX) {
      const f = (D.faitsCanaux[k] || []).find((q) => q.type === TYPE_LIGNE[champ]
        && !(champ === 'garage' && !/garage|box|parking/i.test(q.extrait)) && !(champ === 'lieu' && !/lens|crans|montana/i.test(q.extrait)));
      parCanal[k] = f ? { valeur: f.extrait, statut: f.statut === 'absent' ? 'contredit' : f.statut, extrait: f.extrait, source: f.source, date: f.date, code: f.code }
        : { valeur: null, statut: 'non_mentionne', extrait: '', source: '', date: '', code: 'non_mentionne' };
    }
    return { champ, fiche: { valeur: null, source: '', date: D.fiche.meta.date_releve }, parCanal };
  });
  return { lignes };
}
function tableau() {
  if (CX && CX.tableauCanaux) { try { return CX.tableauCanaux(D.fiche, D.canaux); } catch { /* repli */ } }
  return tableauRepli();
}
function celluleC(k, ligne) {
  const x = ligne.parCanal[k];
  const td = h('td', { 'data-label': T(`col_${k}`) });
  if (!x || x.statut === 'non_mentionne') { td.append(h('span', { class: 'c-vide', text: T('non_mentionne') })); return td; }
  const cls = { confirme: 'c-ok', precision: 'c-prec', contredit: 'c-ko' }[x.statut] || 'c-ok';
  const src = x.source ? `${hoteSource(x.source)}, ${x.date ? dateFr(x.date) : ''}` : null;
  const d = h('div', { class: cls, tabindex: src ? '0' : null, title: src }, String(x.extrait || x.valeur));
  if (x.statut === 'precision') d.append(h('span', { class: 'etq etq-prec', text: T('precision_court') }));
  if (x.statut === 'contredit') d.append(h('span', { class: 'etq etq-ko', text: T('m_contredit') }));
  if (x.detail) d.append(h('span', { class: 'c-detail', text: x.detail }));
  if (src && x.statut !== 'confirme') d.append(h('span', { class: 'c-src', text: src }));
  td.append(d);
  return td;
}
function texteCorrections() {
  const hote = hoteSource((D.canaux.find((x) => x.canal === 'site') || {}).source || 'richemont3b.ch'), date = dateFr(D.fiche.meta.date_releve);
  const out = [];
  for (const x of D.canaux) {
    if (x.canal === 'site' || !x.faits.some((f) => f.statut === 'contredit' || f.statut === 'precision')) continue;
    const base = { canal: T(`col_${x.canal}`), champ: T(`champ_${x.champ}`).replace(/^champ_.*/, T('champ_ligne')), src: hote, date };
    const cor = corriger(x.texte, x.faits).corrections;
    for (const c of cor) out.push(T('corr_ligne', { ...base, de: c.extrait, par: c.remplacement }));
    for (const f of x.faits.filter((q) => (q.statut === 'contredit' || q.statut === 'precision') && !cor.some((c) => c.extrait === q.extrait))) out.push(T('corr_ligne_sans', { ...base, de: f.extrait, msg: messageFait(f) }));
  }
  return out.length ? out.join('\n') : T('corr_vide');
}
function rendreHote() {
  const c = fiche(); const racine = $('#hote-contenu'); racine.replaceChildren();
  const valeurs = {
    chambres: T('f_chambres', { n: c.chambres.valeur }), salles_eau: T('f_salles_eau', { n: c.salles_eau.valeur }), capacite: T('f_capacite', { n: c.capacite.valeur }),
    surface: T('f_surface', { u: c.surface_utile_m2.valeur, h: c.surface_habitable_m2.valeur }), etage: T('f_etage', { n: c.etage.valeur }),
    lieu: T('f_lieu'), prix: T('f_prix', { prix: chf(c.prix_semaine_public_chf.valeur) }), distance: T('f_distance', { n: D.fiche.distances[0].minutes }),
    garage: c.garage.valeur, renovation: T('f_renovation', { n: c.renovation_annee.valeur }),
  };
  const ALIAS = { localisation: 'lieu', distance_ski: 'distance' };
  const corpsT = h('tbody');
  for (const l of tableau().lignes) {
    const cle = ALIAS[l.champ] || l.champ;
    if (l.champ === 'pieces') valeurs.pieces = T('f_pieces', { n: String(l.fiche.valeur).replace('.', ',') });
    corpsT.append(h('tr', null, h('th', { scope: 'row', text: valeurs[cle] != null ? T(`r_${cle}`) : String(l.champ) }),
      h('td', { 'data-label': T('col_fiche'), title: l.fiche && l.fiche.source ? `${hoteSource(l.fiche.source)}, ${dateFr(l.fiche.date || D.fiche.meta.date_releve)}` : null }, valeurs[cle] ?? String(l.fiche.valeur)),
      CANAUX.map((k) => celluleC(k, l))));
  }
  const table = h('table', { class: 'table-vrai' },
    h('thead', null, h('tr', null, h('th', { text: T('col_champ') }), h('th', { text: T('col_fiche') }), CANAUX.map((k) => h('th', { text: T(`col_${k}`) })))), corpsT);
  const ecarts = D.controle.reduce((s, x) => s + x.faits.length, 0);
  const liste = h('ul', { class: 'demandes' });
  const reqs = magasin.liste();
  if (!reqs.length && !etat.doublons.length) liste.append(h('li', { text: T('aucune_demande') }));
  for (const q of reqs.slice().reverse()) {
    const hh = quand(q.recueLe);
    liste.append(h('li', null, h('strong', { text: q.id }), h('span', { text: `${q.prenom} · ${plageTxt(q.arrivee, q.depart)} · ${persTxt(q.voyageurs)} · ${q.canal === 'immocrans' ? T('canal_vers') : T('canal_direct')} · ${hh.date} ${hh.heure}` })));
  }
  for (const dbl of etat.doublons) liste.append(h('li', null, h('span', { class: 'dbl', text: T('doublon_de', { id: dbl.de }) })));
  racine.append(h('h1', { id: 'titre-hote', text: T('hote_titre') }),
    h('div', null, table, h('div', { class: 'corr-ligne' }, h('button', { type: 'button', class: 'bouton bouton-sec', id: 'bt-corr', onclick: (e) => copier(texteCorrections(), e.currentTarget) }, T('corr_copier'))),
      h('p', { class: 'sources', text: `${T('sources_note', { date: dateFr(D.fiche.meta.date_releve), n: ecarts, m: D.canaux.length })} ${T('hote_aide')}` }), ligneFaqHote()),
    h('div', null, h('h2', { text: T('demandes_titre') }), liste));
}

/* ---------- Calendrier de prix (vue hôte principale ; FR et EN, les autres langues voient l'EN) ---------- */
const XMAX = 550;
const lv = () => (etat.langue === 'fr' ? 'fr' : 'en');
function enLangue(f) { const l = etat.langue; etat.langue = lv(); try { return f(); } finally { etat.langue = l; } }
const TC = (cle, p) => enLangue(() => T(cle, p));
const courtP = (p) => { const t = TC(`c_court.${p.id}`); return t.startsWith('c_court.') ? nomP(p).toLowerCase() : t; };
const nomP = (p) => (p.nom && (p.nom[lv()] || p.nom.fr)) || p.id;
const datesP = (p) => enLangue(() => plageTxt(p.debut, ajouter(p.fin, -1)));
const pct = (x) => String(Math.round(x * 1000) / 10).replace('.', etat.langue === 'fr' ? ',' : '.');
const plancher = () => D.hyp.prixPlancherNuit.valeur;
const signe = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${chf(Math.abs(Math.round(n)))}`;
const val = (x) => (x && typeof x === 'object' ? (x.net ?? x.voyageur) : x);
const svE = (tag, attrs, texte) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  if (texte != null) e.textContent = texte;
  return e;
};
function deux(prix, canalNom) {
  const d = GN.deuxLignes ? GN.deuxLignes(prix, canalNom, D.hyp, 'central') : null;
  if (d) return d;
  const taux = canalNom === 'immocrans' ? D.hyp.commissions.immocrans.central : canalNom === 'direct' ? D.hyp.commissions.directFrais.valeur : D.hyp.commissions.airbnb.valeur;
  return { voyageur: prix, net: netHote(prix, canalNom, D.hyp, 'central'), commission: taux };
}
function airbnbLu(p) {
  const l = (D.comparables.richemont3b && D.comparables.richemont3b.airbnb) || [];
  return l.filter((x) => typeof x.par_nuit_chf === 'number' && (p.fenetres || []).includes(x.periode)).map((x) => x.par_nuit_chf);
}
const nAnn = (n) => TC(n === 0 ? 'c_ann_0' : n === 1 ? 'c_ann_1' : 'c_ann_n', { n });
const nRel = (n) => TC(n === 0 ? 'c_rel_0' : n === 1 ? 'c_rel_1' : 'c_rel_n', { n });
const ariaP = (p) => (p.statut === 'ok'
  ? TC('c_aria', { nom: nomP(p), dates: datesP(p), basse: p.basse, haute: p.haute, cible: p.cible, n: p.n, p: plancher() })
  : TC('c_aria_insuff', { nom: nomP(p), dates: datesP(p), rel: nRel(p.n), min: D.hyp.nMin.valeur, p: plancher() }));

/** Barre basse–haute sur l'échelle commune 0-550 ; W en pixels réels (1 unité = 1 px), donc aucune déformation des marques. */
function barreSvg(p, W, H, o = {}) {
  const X = (v) => 6 + (v / XMAX) * (W - 12);
  const s = svE('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.aria || ariaP(p), focusable: 'false', class: p.id === 'mondiaux' ? 'b-mond' : '', style: `--i:${o.i || 0}` });
  const c = o.cy != null ? o.cy : H / 2 + 5 - (o.decale || 0);
  if (!o.sansGrille) for (const v of [0, 100, 200, 300, 400, 500]) s.append(svE('line', { x1: X(v), x2: X(v), y1: 0, y2: H, class: 'b-grille' }));
  s.append(svE('line', { x1: X(plancher()), x2: X(plancher()), y1: 0, y2: o.axeY != null ? o.axeY + 13 : o.etiquettePlancher ? H - 18 : H, class: 'b-plancher' }));
  if (o.axeY != null) {
    // mini-axe 0 / plancher / 550, même échelle que le calendrier
    s.append(svE('line', { x1: X(0), x2: X(XMAX), y1: o.axeY, y2: o.axeY, class: 'b-grille' }));
    for (const v of [0, XMAX]) s.append(svE('line', { x1: X(v), x2: X(v), y1: o.axeY - 4, y2: o.axeY + 4, class: 'b-grille' }));
    s.append(svE('text', { x: X(0), y: o.axeY + 22, class: 'b-axe', 'text-anchor': 'start' }, 0));
    s.append(svE('text', { x: X(XMAX), y: o.axeY + 22, class: 'b-axe', 'text-anchor': 'end' }, XMAX));
    if (o.etiquettePlancher) s.append(svE('text', { x: X(plancher()), y: o.axeY + 24, class: 'b-txt', 'text-anchor': 'middle' }, o.etiquettePlancher));
  } else if (o.etiquettePlancher) s.append(svE('text', { x: X(plancher()), y: H - 3, class: 'b-txt', 'text-anchor': 'middle' }, o.etiquettePlancher));
  if (p.statut === 'ok') {
    // plage de moins de 6 px : ni plage ni bornes, seulement le point cible
    if (X(p.haute) - X(p.basse) >= 6) {
      s.append(svE('rect', { x: X(p.basse), y: c - 6, width: X(p.haute) - X(p.basse), height: 12, rx: 4, class: 'plage', style: `--i:${o.i || 0}` }));
      for (const v of [p.basse, p.haute]) s.append(svE('line', { x1: X(v), x2: X(v), y1: c - 8, y2: c + 8, class: 'b-borne' }));
    }
    for (const v of airbnbLu(p)) {
      const x = X(v);
      s.append(svE('polygon', { points: `${x},${c - 6} ${x + 6},${c} ${x},${c + 6} ${x - 6},${c}`, class: 'b-losange' }));
      s.append(svE('text', { x: x + 10, y: c + 4, class: 'b-txt' }, TC('c_airbnb', { p: v })));
    }
    s.append(svE('circle', { cx: X(p.cible), cy: c, r: 6, class: 'b-point' }));
    s.append(svE('text', { x: X(p.cible), y: c - (o.cy != null ? 13 : 12), class: 'b-txt b-cible', 'text-anchor': 'middle' }, p.cible));
  } else {
    s.append(svE('line', { x1: X(0), x2: X(XMAX), y1: c, y2: c, class: 'b-insuff' }));
  }
  return s;
}
function axeSvg(W) {
  const X = (v) => 6 + (v / XMAX) * (W - 12);
  const s = svE('svg', { viewBox: `0 0 ${W} 30`, width: W, height: 30, 'aria-hidden': 'true', focusable: 'false' });
  for (const v of [0, 100, 200, 300, 400, 500]) {
    s.append(svE('line', { x1: X(v), x2: X(v), y1: 16, y2: 30, class: 'b-grille' }));
    s.append(svE('text', { x: X(v), y: 11, class: 'b-axe', 'text-anchor': v === 0 ? 'start' : 'middle' }, v));
  }
  s.append(svE('line', { x1: X(plancher()), x2: X(plancher()), y1: 16, y2: 30, class: 'b-plancher' }));
  return s;
}
function peindre() {
  const premiere = document.querySelector('#prix-contenu .barre');
  if (!premiere) return;
  const W = Math.floor(premiere.getBoundingClientRect().width);
  if (W < 100) return;
  const H = window.innerWidth <= 480 ? 40 : 46;
  document.querySelectorAll('#prix-contenu .barre[data-i]').forEach((el) => {
    const i = Number(el.dataset.i); const p = D.cal[i];
    const Hp = p.statut === 'ok' ? H : 28;
    el.replaceChildren(barreSvg(p, W, Hp, { i }));
    el.style.height = `${Hp}px`;
  });
  const axe = document.querySelector('#prix-contenu .axe-barre');
  if (axe) axe.replaceChildren(axeSvg(W));
}

function ligneNet(p) {
  const cn = canalDe(p.nuitsMin, p.id, null, D.hyp).canal;
  const d = deux(p.cible, cn);
  return [h('span', { class: 'd-long', text: TC('c_deux', { v: p.cible, net: chf(Math.round(d.net)), canal: TC(`can_${cn}`), c: pct(d.commission) }) }),
    h('span', { class: 'd-court', text: TC('c_deux_c', { net: chf(Math.round(d.net)), canal: TC(`can_${cn}`), c: pct(d.commission) }) })];
}
const jmLv = (iso) => enLangue(() => jm(iso));

function detailP(p) {
  const ok = p.statut === 'ok';
  const d = h('div', { class: 'per-detail', id: `d-${p.id}`, role: 'region', 'aria-labelledby': `dt-${p.id}`, hidden: etat.ouvert !== p.id });
  const ann = [...(p.annonces || [])].sort((a, b) => a.nuit - b.nuit);
  const gauche = h('div', { class: 'det-g' }, h('h3', { id: `dt-${p.id}`, tabindex: '-1', text: ann.length ? TC('d_titre', { n: ann.length }) : TC('d_titre_0') }));
  if (!ann.length) gauche.append(h('p', { class: 'note', text: TC('d_vide') }));
  else {
    gauche.append(h('ul', { class: 'ann' }, ann.map((a) => {
      const preuve = a.capturePartielle === true ? TC('d_cap_part') : a.capturePleine ? TC('d_cap_ok', { date: dateFr(a.lu_le || p.releveLe) }) : TC('d_cap_non');
      return h('li', null,
        h('span', { class: 'ann-t' }, a.url ? h('a', { href: a.url, target: '_blank', rel: 'noopener' }, a.titre, ico('sortant', 14)) : a.titre),
        h('span', { class: 'ann-m num' }, `${chf(a.total)} · ${chf(Math.round(a.nuit))} ${TC('c_nuit')} · ${a.avis > 0 ? TC('d_avis', { note: a.note != null ? String(a.note).replace('.', etat.langue === 'fr' ? ',' : '.') : '', n: a.avis }) : TC('d_sans_avis')}`),
        h('span', { class: 'ann-p', text: preuve }));
    })));
    // empreinte de la page de résultats : une seule fois par fenêtre (les annonces d'une même page partagent la même)
    const shas = [...new Set(ann.map((a) => a.sha256 || a.sha256Pleine).filter(Boolean))];
    for (const sha of shas) gauche.append(h('p', { class: 'note num', text: TC('d_sha_page', { sha: `${String(sha).slice(0, 4)}…${String(sha).slice(-4)}` }) }));
    gauche.append(h('p', { class: 'note', text: TC('d_pied') }));
    if (p.preuves) gauche.append(h('p', { class: 'note', text: TC('d_preuves', { v: p.preuves.verifiees, s: p.preuves.sur, p: p.preuves.partielles ? (p.preuves.partielles === 1 ? TC('d_preuves_p1') : TC('d_preuves_pn', { p: p.preuves.partielles })) : '' }) }));
  }
  if (ok) {
    gauche.append(h('p', { class: 'note', text: p.sansAvis ? TC('d_sens', { n: p.sansAvis.n, b: p.sansAvis.basse, c: p.sansAvis.cible, h: p.sansAvis.haute }) : TC('d_sens_non') }));
  } else {
    gauche.append(h('p', { class: 'note', text: TC('d_regle', { min: D.hyp.nMin.valeur }) }), h('p', { class: 'note', text: TC('d_permet') }));
  }
  const droite = h('div', { class: 'det-d' });
  if (ok) {
    const cn = canalDe(p.nuitsMin, p.id, null, D.hyp).canal;
    const tot = p.cible * 7;
    droite.append(h('div', { class: 'per-notes' }, h('p', { class: 'note-deux num' }, ligneNet(p))));
    droite.append(h('h3', { text: TC('d_canal') }), h('p', { text: TC('d_canal_phrase', { canal: TC(`can_${cn}`) }) }),
      h('p', { class: 'det-sous', text: TC('d_net_titre', { prix: p.cible, total: chf(tot) }) }),
      h('ul', { class: 'nets num' }, ['immocrans', 'plateforme', 'direct'].map((c) => { const x = deux(tot, c); return h('li', { text: TC('d_net_ligne', { canal: TC(`can_${c}`), c: pct(x.commission), net: chf(Math.round(x.net)) }) }); })));
  }
  const P0 = (D.periodes.periodes || []).find((x) => x.id === p.id) || {};
  droite.append(h('p', { text: TC(P0.nuitsMinStatut === 'H' ? 'd_minn' : 'd_minn_c', { n: p.nuitsMin }) }));
  if (p.source) droite.append(h('p', null, `${TC('d_source')} : `, lienExt(p.source, hoteSource(p.source)), P0.statut ? ` (${TC('d_source_statut', { s: P0.statut })})` : ''));
  d.append(gauche, droite);
  return d;
}

function basculer(id) {
  etat.ouvert = etat.ouvert === id ? null : id;
  document.querySelectorAll('#prix-contenu .per').forEach((el) => {
    const o = el.dataset.id === etat.ouvert;
    el.classList.toggle('ouvert', o);
    el.querySelector('.per-ligne').setAttribute('aria-expanded', String(o));
    el.querySelector('.per-detail').hidden = !o;
  });
  if (etat.ouvert) { const t = document.getElementById(`dt-${id}`); if (t) t.focus({ preventScroll: true }); }
}
function ligneP(p, i) {
  const ok = p.statut === 'ok'; const o = etat.ouvert === p.id;
  const dc = decisionDe(p);
  const decTxt = dc.action === 'monter' ? TC('dec_monter', { prix: dc.prix }) : TC('dec_garder', { prix: dc.prix, cible: p.cible });
  const btn = h('button', { type: 'button', class: 'per-ligne', 'aria-expanded': String(o), 'aria-controls': `d-${p.id}`, 'data-p': p.id, onclick: () => basculer(p.id) },
    h('span', { class: 'per-nom' }, h('span', { class: 'per-n', text: nomP(p) }), h('span', { class: 'per-d', text: TC('c_dates', { dates: datesP(p), n: p.nuitsMin }) })),
    h('span', { class: 'barre', 'data-i': String(i) }),
    ok ? h('span', { class: `per-dec dec-${dc.action}` }, h('span', { class: 'dec-t', text: decTxt.split(' · ')[0] }), decTxt.includes(' · ') ? h('span', { class: 'dec-m', text: decTxt.split(' · ').slice(1).join(' · ') }) : null)
      : h('span', { class: 'per-dec' }, h('span', { class: 'per-prix per-demande', text: TC('c_sur_demande') }), h('span', { class: 'per-meta num', text: TC('c_public', { prix: chf(D.tarifs.prixSemainePublic.chf) }) })));
  const notes = h('div', { class: 'per-notes' });
  if (ok) {
    const co = p.couverture;
    const dt = p.releveLe ? dateFr(p.releveLe).slice(0, 5) : ''; const ex = co && co.extrapole ? TC('c_etiq_ex', { n: co.nuitsRelevees, np: co.nuitsPeriode }) : '';
    notes.append(h('p', { class: 'note note-etiq num' }, h('span', { class: 'd-long', text: TC('c_note_l', { n: p.n, date: dt }) + ex }), h('span', { class: 'd-court', text: TC('c_note_c', { n: p.n, date: dt }) + ex })));
  } else notes.append(h('p', { class: 'note-insuff', text: TC('c_insuff', { rel: nRel(p.n), min: D.hyp.nMin.valeur }) }));
  const sous = (p.sousLignes || []).map((s) => h('p', { class: 'per-sous', text: s.statut === 'ok'
    ? TC('c_sous_ok', { nom: nomP(s), basse: s.basse, cible: s.cible, haute: s.haute, n: s.n })
    : TC('c_sous_insuff', { nom: nomP(s), ann: nAnn(s.n), min: D.hyp.nMin.valeur }) }));
  return h('div', { class: `per${o ? ' ouvert' : ''}${ok ? '' : ' per-vide'}`, 'data-id': p.id }, btn, notes, ...sous, detailP(p));
}

/** Une ligne de décision : « 2 périodes à monter (fêtes, Mondiaux), 6 à garder, 3 sans donnée ». */
function resumeDecision() {
  const par = (a) => D.cal.filter((p) => decisionDe(p).action === a);
  const mont = par('monter'), gard = par('garder'), aucun = par('aucune');
  const l = [];
  if (mont.length) l.push(TC(mont.length === 1 ? 'c_res_monter_1' : 'c_res_monter_n', { n: mont.length, liste: mont.map(courtP).join(', ') }));
  if (gard.length) l.push(TC('c_res_garder', { n: gard.length }));
  if (aucun.length) l.push(TC('c_res_aucune', { n: aucun.length }));
  return l.join(', ');
}

function phraseTitre() {
  const m = D.cal.find((x) => x.id === 'mondiaux');
  if (!m || m.statut !== 'ok') return null;
  const sq = GN.seuilEquivalence(plancher(), m.cible, D.hyp, 'central');
  const net = typeof sq === 'object' ? sq.net : sq;
  const seuil = Math.min(10, Math.max(1, Math.round(net * 10)));
  return TC('c_phrase', { seuil, cible: m.cible, plancher: plancher(), n: m.n });
}
/** Décision de prix d'une période : lue dans lib (`p.decision`), sinon repli sur la règle « monter si le marché dépasse le plancher, sinon garder le plancher ». */
function decisionDe(p) {
  if (p.statut !== 'ok') return { action: 'aucune', prix: null };
  const d = p.decision;
  if (d && d.action === 'aucune') return { action: 'aucune', prix: null };
  if (d && (d.action === 'monter' || d.action === 'garder')) return { action: d.action, prix: Number.isFinite(d.prixRetenuDefaut) ? d.prixRetenuDefaut : (d.action === 'garder' ? plancher() : p.cible) };
  const monte = p.cible > plancher();
  return { action: monte ? 'monter' : 'garder', prix: monte ? p.cible : plancher() };
}
const prixOk = (x) => Number.isFinite(x) && x > 0;
/** Prix retenus : saisie de l'hôte, sinon prix retenu par défaut de la décision (gain, proposition, bloc « Prix retenu »). */
function retenusObj() { const o = {}; for (const p of D.cal) if (p.statut === 'ok') o[p.id] = prixOk(etat.retenus[p.id]) ? etat.retenus[p.id] : decisionDe(p).prix; return o; }
/** Prix montrés au voyageur dans le panneau : repère de marché (cible), sauf prix retenu saisi par l'hôte. */
function marcheObj() { const o = {}; for (const p of D.cal) if (p.statut === 'ok') o[p.id] = prixOk(etat.retenus[p.id]) ? etat.retenus[p.id] : p.cible; return o; }
const marcheCibles = () => { const o = {}; for (const p of D.cal) if (p.statut === 'ok') o[p.id] = p.cible; return o; };
function appliquer() { etat.utilise = true; etat.tarifsHote = tarifsHoteDepuisCalendrier(D.cal, marcheObj()); }
/** Un prix retenu a changé : gain, proposition (lue au clic) et panneau (lu à l'ouverture) repartent des nouveaux prix. */
function recalculer() {
  try { D.cmp = GN.comparer(D.cal, D.periodes, D.hyp, retenusObj()); } catch { /* garde le calcul précédent */ }
  appliquer();
  const g = document.querySelector('#prix-contenu section.gain'); if (g) g.replaceWith(gainP());
  if (etat.panneau) rendrePanneau();
}

function gainP() {
  const sc = D.cmp.scenarios; const noms = Object.keys(sc);
  const lib = (n) => { const x = sc[n] && sc[n].nom; return (x && (x[lv()] || x.fr)) || TC(`g_sc_${n}`); };
  const seuils = (sc.central || sc[noms[0]]).parPeriode.filter((x) => x.seuil != null);
  const sect = h('section', { class: 'gain', 'aria-labelledby': 'g-titre' }, h('h2', { id: 'g-titre', text: TC('g_titre') }),
    h('p', { class: 'chapeau', text: TC('g_chapeau', { p: plancher() }) }), h('p', { class: 'note', text: TC('g_scen_note') }), h('p', { class: 'note', text: TC('g_h_legende') }));
  const sansObjet = [];
  const lis = [];
  for (const x of seuils) {
    const p = D.cal.find((c) => c.id === x.id); const s = x.seuil;
    const brut = typeof s === 'object' ? s.brut : s; const net = typeof s === 'object' ? s.net : null;
    if (x.decision === 'garder' || brut > 1 || (net != null && net > 1)) { sansObjet.push(courtP(p)); continue; }
    const meme = net == null || Math.round(brut * 100) === Math.round(net * 100);
    lis.push(h('li', { text: meme ? `${nomP(p)} : ${TC('g_meme_seuil', { p: Math.round(brut * 100) })}` : `${nomP(p)} : ${Math.round(brut * 100)} % ${TC('g_brut')} · ${Math.round(net * 100)} % ${TC('g_net')}` }));
  }
  sect.append(h('h3', { text: TC('g_seuils') }), h('p', { class: 'note', text: TC('g_seuils_txt', { p: plancher() }) }),
    h('ul', { class: 'seuils num' }, lis),
    sansObjet.length ? h('p', { class: 'note', text: TC(sansObjet.length === 1 ? 'g_sans_objet_1' : 'g_sans_objet_n', { n: sansObjet.length, liste: sansObjet.join(', ') }) }) : null);
  const cols = h('div', { class: 'sc-cols' });
  for (const n of noms) {
    const s = sc[n]; const hy = D.hyp.scenarios[n];
    const ligne = (cle, x) => h('p', { class: 'sc-l num' }, h('strong', { text: TC(cle) }), ' ',
      TC('g_ligne_c', { base: chf(Math.round(x.base)), reco: chf(Math.round(x.reco)), delta: signe(Math.round(x.delta)) }),
      Math.round(x.delta) < 0 ? ` (${TC('g_baisse')})` : '',
      x.nInsuffisantes ? h('span', { class: 'note', text: ` ${TC('g_excl', { n: x.nPeriodes, x: x.nInsuffisantes })}` }) : null);
    const total = Math.round(s.parSaison.hiver.delta + s.parSaison.ete.delta);
    const ligneT = (x) => { const p = D.cal.find((c) => c.id === x.id); return h('tr', null, h('th', { scope: 'row', text: nomP(p) }),
      h('td', { 'data-label': TC('g_col_base'), text: chf(Math.round(val(x.base))) }),
      h('td', { 'data-label': TC('g_col_reco'), text: x.reco == null ? TC('c_leg_insuff') : chf(Math.round(val(x.reco))) }),
      h('td', { 'data-label': TC('g_col_delta'), text: x.delta == null ? '' : signe(x.delta) })); };
    const tableau = (lignes) => h('table', { class: 'table-vrai tab-det num' }, h('thead', null, h('tr', null, ['g_col_per', 'g_col_base', 'g_col_reco', 'g_col_delta'].map((k) => h('th', { text: TC(k) })))),
      h('tbody', null, lignes.map(ligneT)));
    const bouge = s.parPeriode.filter((x) => x.delta != null && Math.round(x.delta) !== 0), fixe = s.parPeriode.filter((x) => x.delta != null && Math.round(x.delta) === 0);
    const det = [bouge.length ? tableau(bouge) : null,
      fixe.length ? h('details', { class: 'sc-det' }, h('summary', { text: TC('g_sans_change', { n: fixe.length }) }), tableau(fixe)) : null];
    cols.append(h('div', { class: 'sc-col' }, h('h3', { text: lib(n) }),
      h('p', { class: 'sc-delta num' }, h('span', { class: 'sc-gros', text: `${signe(total)} CHF` }), h('span', { class: 'sc-gros-l', text: TC('g_total') })),
      ligne('g_hiver', s.parSaison.hiver), ligne('g_ete', s.parSaison.ete),
      h('p', { class: 'note', text: TC('g_def', { c: pct(hy ? D.hyp.commissions.immocrans[n] : 0), np: hy.nuitsProprietaire }) }),
      D.cmpMarche && D.cmpMarche.scenarios[n] ? h('p', { class: 'note num', text: TC('g_marche', { h: signe(Math.round(D.cmpMarche.scenarios[n].parSaison.hiver.delta)), e: signe(Math.round(D.cmpMarche.scenarios[n].parSaison.ete.delta)) }) }) : null, ...det));
  }
  sect.append(cols);
  // Hypothèses dépliables
  const rows = [];
  const tag = (st) => `[${st || 'H'}]`;
  rows.push([TC('g_hyp_plancher'), noms.map(() => `CHF ${plancher()}`), D.hyp.prixPlancherNuit.statut]);
  rows.push([TC('g_hyp_nmin'), noms.map(() => String(D.hyp.nMin.valeur)), D.hyp.nMin.statut]);
  for (const p of D.cal) rows.push([TC('g_hyp_occ', { nom: nomP(p) }), noms.map((n) => { const o = D.hyp.scenarios[n].occupation[p.id]; return o ? `${pct(o.plancher)} % / ${pct(o.cible)} %` : ''; }), (D.hyp.scenarios[noms[0]].occupation[p.id] || {}).statut]);
  rows.push([TC('g_hyp_parts'), noms.map((n) => { const q = D.hyp.scenarios[n].parts; return `${pct(q.immocrans)} / ${pct(q.plateformes)} / ${pct(q.direct)} %`; }), D.hyp.scenarios[noms[0]].statut]);
  rows.push([TC('g_hyp_imm'), noms.map((n) => `${pct(D.hyp.commissions.immocrans[n])} %`), D.hyp.commissions.immocrans.statut]);
  rows.push([TC('g_hyp_abnb'), noms.map(() => `${pct(D.hyp.commissions.airbnb.valeur)} %`), D.hyp.commissions.airbnb.statut]);
  rows.push([TC('g_hyp_dir'), noms.map(() => `${pct(D.hyp.commissions.directFrais.valeur)} %`), D.hyp.commissions.directFrais.statut]);
  rows.push([TC('g_hyp_prop'), noms.map((n) => String(D.hyp.scenarios[n].nuitsProprietaire)), D.hyp.scenarios[noms[0]].statut]);
  rows.push([TC('g_hyp_sens'), noms.map(() => TC('g_hyp_sens_v')), 'H']);
  sect.append(h('details', { class: 'hyp' }, h('summary', { text: TC('g_hyp', { n: rows.length }) }),
    h('p', { class: 'note', text: D.hyp.occupation_note && etat.langue === 'fr' ? D.hyp.occupation_note : TC('g_hyp_def_occ') }),
    h('table', { class: 'table-vrai num' }, h('thead', null, h('tr', null, h('th', { text: TC('g_hyp_col') }), noms.map((n) => h('th', { text: lib(n) })))),
      h('tbody', null, rows.map(([lab, vs, st]) => h('tr', null, h('th', { scope: 'row', text: `${lab} ${tag(st)}` }), vs.map((v, k) => h('td', { 'data-label': lib(noms[k]), text: v }))))))));
  const inval = etat.langue === 'fr' ? D.hyp.invalidations : (Array.isArray(TC('inval')) ? TC('inval') : D.hyp.invalidations);
  sect.append(h('section', { class: 'inval', 'aria-labelledby': 'inval-t' }, h('h2', { id: 'inval-t', text: TC('g_inval') }), h('ul', null, (inval || []).map((t) => h('li', { text: t })))));
  return sect;
}

const leg = (svgKids, txt, court) => { const s = svE('svg', { viewBox: '0 0 24 16', width: 24, height: 16, 'aria-hidden': 'true', focusable: 'false' }); svgKids.forEach((k) => s.append(k)); return h('li', null, s, court ? [h('span', { class: 'd-long', text: txt }), h('span', { class: 'd-court', text: court })] : h('span', { text: txt })); };
/** Phrase du seuil en serif, un mot en italique (peak-design). */
function phraseItalique(txt) {
  const mot = TC('c_phrase_mot'); const i = mot && !mot.startsWith('c_') ? txt.indexOf(mot) : -1;
  return i < 0 ? [txt] : [txt.slice(0, i), h('em', { text: mot }), txt.slice(i + mot.length)];
}
function rendrePrix() {
  const racine = $('#prix-contenu'); racine.replaceChildren();
  if (!D.cal || !D.cal.length) { racine.append(h('p', { text: TC('c_vide') })); return; }
  const ok = D.cal.filter((p) => p.statut === 'ok');
  const rel = ok.map((p) => p.releveLe).filter(Boolean).sort().pop();
  const phrase = phraseTitre();
  const biaisDate = (ok.find((p) => p.biais && p.biais.date) || { biais: {} }).biais.date || '';
  // Premier écran : titre, phrase des Mondiaux, décision en une ligne ; légende courte (4 symboles) ; le reste sous « Méthode et limites ».
  racine.append(h('h1', { id: 'titre-prix', text: TC('c_titre') }),
    phrase ? h('p', { class: 'phrase' }, ...phraseItalique(phrase)) : null,
    h('p', { class: 'decision-resume num', text: resumeDecision() }),
    h('ul', { class: 'legende', 'aria-label': TC('c_leg') },
      leg([svE('rect', { x: 1, y: 4, width: 22, height: 8, rx: 3, class: 'plage' }), svE('line', { x1: 1, x2: 1, y1: 2, y2: 14, class: 'b-borne' }), svE('line', { x1: 23, x2: 23, y1: 2, y2: 14, class: 'b-borne' })], TC('c_leg_plage'), TC('c_leg_plage_c')),
      leg([svE('circle', { cx: 12, cy: 8, r: 6, class: 'b-point' })], TC('c_leg_cible'), TC('c_leg_cible_c')),
      leg([svE('line', { x1: 12, x2: 12, y1: 0, y2: 16, class: 'b-plancher' })], TC('c_leg_plancher', { p: plancher() }), TC('c_leg_plancher_c', { p: plancher() })),
      leg([svE('polygon', { points: '12,2 18,8 12,14 6,8', class: 'b-losange' })], TC('c_leg_airbnb'), TC('c_leg_airbnb_c'))));
  const grille = h('div', { class: 'grille' }, h('div', { class: 'axe' }, h('span', { class: 'axe-l', text: TC('c_axe') }), h('span', { class: 'axe-barre' })));
  D.cal.forEach((p, i) => grille.append(ligneP(p, i)));
  racine.append(grille);
  racine.append(h('details', { class: 'tableau-alt' }, h('summary', { text: TC('c_tableau') }),
    h('table', { class: 'table-vrai num' }, h('thead', null, h('tr', null, ['c_tab_per', 'c_tab_dates', 'c_tab_basse', 'c_tab_cible', 'c_tab_haute', 'c_tab_n', 'c_tab_date'].map((k) => h('th', { text: TC(k) })))),
      h('tbody', null, D.cal.map((p) => h('tr', null, h('th', { scope: 'row', text: nomP(p) }),
        h('td', { 'data-label': TC('c_tab_dates'), text: datesP(p) }),
        ...['basse', 'cible', 'haute'].map((k) => h('td', { 'data-label': TC(`c_tab_${k}`), text: p.statut === 'ok' ? String(p[k]) : TC('c_sur_demande') })),
        h('td', { 'data-label': TC('c_tab_n'), text: String(p.n) }), h('td', { 'data-label': TC('c_tab_date'), text: p.releveLe ? dateFr(p.releveLe) : '' })))))));
  // Prix retenus : partent de la décision ; toute modification met à jour le gain, la proposition et le panneau
  const ret = h('section', { class: 'retenus', 'aria-labelledby': 'ret-t' }, h('h2', { id: 'ret-t', text: TC('c_retenu_titre') }), h('p', { class: 'note', text: TC('c_retenu_aide') }));
  const champs = h('div', { class: 'ret-grille' });
  const msg = h('p', { class: 'ret-msg', role: 'status', 'aria-live': 'polite' });
  if (etat.utilise) msg.textContent = TC('c_applique');
  const retenus0 = retenusObj();
  for (const p of ok) {
    const id = `ret-${p.id}`;
    const inp = h('input', { type: 'number', id, min: '1', step: '5', inputmode: 'numeric', value: String(retenus0[p.id]), 'aria-label': TC('c_retenu_lab', { nom: nomP(p) }) });
    inp.addEventListener('change', () => { const v = Number(inp.value); if (prixOk(v)) etat.retenus[p.id] = v; else { delete etat.retenus[p.id]; inp.value = String(decisionDe(p).prix); } recalculer(); msg.textContent = TC('c_applique'); });
    const rz = h('button', { type: 'button', class: 'bouton bouton-texte', text: TC('c_remettre'), onclick: () => { delete etat.retenus[p.id]; inp.value = String(decisionDe(p).prix); recalculer(); msg.textContent = TC('c_applique'); } });
    champs.append(h('div', { class: 'ret-l' }, h('label', { for: id, text: nomP(p) }), inp, rz));
  }
  ret.append(champs);
  const prop = h('button', { type: 'button', class: 'bouton bouton-contour', text: TC('c_copier_prop'), onclick: (e) => copier(propositionImmoCrans(D.cal, D.hyp, retenusObj()), e.currentTarget) });
  const util = h('button', { type: 'button', class: 'bouton bouton-plein', text: TC('c_utiliser'), onclick: () => { appliquer(); msg.textContent = TC('c_applique'); } });
  ret.append(h('div', { class: 'ret-actions' }, util, prop, h('button', { type: 'button', class: 'bouton bouton-texte', 'data-action': 'hote', text: TC('vers_fiche') })), msg);
  racine.append(ret, gainP());
  peindre();
}
/* ---------- Page Méthode : bascule Avant / Après et « Méthode et limites » ---------- */
function rendreMethode() {
  const racine = $('#methode-contenu'); if (!racine) return; racine.replaceChildren();
  const ok = D.cal.filter((p) => p.statut === 'ok');
  const rel = ok.map((p) => p.releveLe).filter(Boolean).sort().pop();
  const biaisDate = (ok.find((p) => p.biais && p.biais.date) || { biais: {} }).biais.date || '';
  const choix = (m) => h('button', { type: 'button', role: 'radio', class: 'demo-choix', 'data-mode2': m, 'aria-checked': String(etat.mode === m), text: T(m) });
  racine.append(
    h('h1', { id: 'titre-methode', tabindex: '-1', text: T('methode_titre') }),
    h('p', { class: 'phrase' }, T('methode_sous')),
    h('section', { class: 'met-bloc', 'aria-labelledby': 'met-av' },
      h('h2', { id: 'met-av', text: T('methode_avant_t') }), h('p', { class: 'chapeau', text: T('methode_avant_p') }),
      h('div', { class: 'demo-pilule', role: 'radiogroup', 'aria-label': T('demo_groupe') }, h('span', { class: 'demo-titre', text: T('demo_titre') }), choix('avant'), choix('apres')),
      h('p', { class: 'met-cite' }, T('demo_avant')), h('p', { class: 'note', text: T('demo_note') })),
    h('section', { class: 'met-bloc', 'aria-labelledby': 'met-ml' },
      h('h2', { id: 'met-ml', text: TC('c_methode') }),
      h('p', { class: 'inconnu' }, h('strong', { text: `${TC('c_inconnu_titre')} : ` }), TC('c_inconnu')),
      h('p', { class: 'chapeau', text: TC('c_chapeau', { date: rel ? dateFr(rel) : '' }) }),
      h('p', { class: 'note leg-biais', text: TC('c_leg_biais', { date: biaisDate }) }),
      h('ul', { class: 'legende', 'aria-label': TC('c_leg') }, leg([svE('line', { x1: 0, x2: 24, y1: 8, y2: 8, class: 'b-insuff' })], TC('c_leg_insuff'))),
      h('p', { class: 'note', text: TC('c_syn_ok', { ok: ok.length, n: D.cal.length }) })));
}
function ouvrirCal(id) { if (id) etat.ouvert = id; montrer('prix'); }
function lierPrix() {
  const v = $('#v-prix'); const b = $('#bulle');
  // Mouvement réel : un pointermove à plus de 4 px de l'ancre posée à l'entrée de la vue (le clic qui ouvre la vue ne compte pas).
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    souris = { x: e.clientX, y: e.clientY };
    if (!ancreSouris) ancreSouris = souris;
    else if (Math.hypot(souris.x - ancreSouris.x, souris.y - ancreSouris.y) > 4) sourisReelle = true;
  }, true);
  const montrerBulle = (e) => {
    const clavier = e.type === 'focusin';
    if (clavier ? !(e.target.matches && e.target.matches(':focus-visible')) : !sourisReelle) return;
    if (performance.now() - entreePrix < 600) return;
    const l = e.target.closest && e.target.closest('.per-ligne'); if (!l) return;
    if (!b.hidden && b.dataset.p === l.dataset.p) return;
    const p = D.cal.find((x) => x.id === l.dataset.p); if (!p || p.statut !== 'ok') { b.hidden = true; return; }
    b.dataset.p = p.id;
    const trio = (k, v, cls) => h('span', { class: `bu-c ${cls || ''}` }, h('small', { text: TC(`bulle_${k}`) }), h('b', { class: 'num', text: String(v) }));
    b.replaceChildren(h('span', { class: 'bu-t', text: nomP(p) }), h('span', { class: 'bu-d', text: datesP(p) }),
      h('span', { class: 'bu-r' }, trio('basse', p.basse), trio('cible', p.cible, 'bu-cible'), trio('haute', p.haute), h('span', { class: 'bu-u', text: TC('bulle_u') })),
      h('span', { class: 'bu-m num', text: [TC('bulle_n', { n: p.n }), TC('bulle_min', { n: p.nuitsMin }), TC('bulle_rel', { date: dateFr(p.releveLe) })].join(' · ') }));
    b.hidden = false;
    const r = l.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 32);
    const x = souris && !clavier ? souris.x - 24 : r.left + 24;
    b.style.width = `${w}px`; b.style.left = `${Math.max(16, Math.min(x, window.innerWidth - w - 16))}px`;
    const haut = r.top - b.offsetHeight - 6;
    b.style.top = `${haut >= 8 ? haut : Math.min(window.innerHeight - b.offsetHeight - 8, r.bottom + 6)}px`;
  };
  const cacher = () => { b.hidden = true; };
  v.addEventListener('mouseover', montrerBulle); v.addEventListener('pointermove', montrerBulle); v.addEventListener('focusin', montrerBulle);
  v.addEventListener('mouseout', cacher); v.addEventListener('focusout', cacher);
  document.addEventListener('scroll', cacher, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || etat.page !== 'prix' || etat.panneau || !etat.ouvert) return;
    const id = etat.ouvert; basculer(id);
    const l = document.querySelector(`.per-ligne[data-p="${id}"]`); if (l) l.focus();
  });
  let t = null;
  majHEnt(); window.addEventListener('load', majHEnt); document.fonts && document.fonts.ready.then(majHEnt);
  window.addEventListener('resize', () => { majHEnt(); clearTimeout(t); t = setTimeout(() => { if (etat.page === 'prix') peindre(); if (etat.page === 'accueil' && $('#plot').clientWidth !== grapheLarg) dessinerGraphe(); }, 120); });
}

/* ---------- Prix du séjour dans le panneau ---------- */
function totalTxt(sej, n) {
  const prix = [...new Set(sej.lignes.map((l) => l.prix))];
  return T('pn_total', { total: chf(sej.total), n: nuitsTxt(n) }) + (prix.length === 1 ? T('pn_nuit', { nuit: chf(prix[0]) }) : '');
}
/** Séjour aiguillé vers ImmoCrans : repère de marché, jamais un prix vendu (l'agence confirme). */
function repereTxt(sej, n) {
  const prix = [...new Set(sej.lignes.map((l) => l.prix))];
  return prix.length === 1 ? T('pn_repere', { total: chf(sej.total), n: nuitsTxt(n), prix: chf(prix[0]) }) : T('pn_repere_n', { total: chf(sej.total), n: nuitsTxt(n) });
}
function prixPanneau(sej, n) {
  const hyp = D.hyp;
  if (sej.total == null) {
    const l = sej.lignes.find((x) => x.prix == null); const per = l && D.cal.find((c) => c.id === l.periode);
    return [h('p', { class: 'prix-ligne', 'aria-live': 'polite', text: T('pn_demande') }), h('p', { class: 'source', text: T('pn_demande_txt', { periode: per ? nomP(per) : T('pn_ces_dates') }) })];
  }
  const groupes = [];
  for (const l of sej.lignes) { const g = groupes[groupes.length - 1]; if (g && g.periode === l.periode && g.prix === l.prix) g.n++; else groupes.push({ periode: l.periode, prix: l.prix, n: 1 }); }
  const uniforme = new Set(groupes.map((g) => g.prix)).size === 1;
  const pers = sej.periodes.map((id) => D.cal.find((c) => c.id === id)).filter(Boolean);
  const date = pers.map((c) => c.releveLe).filter(Boolean).sort().pop();
  const lien = h('button', { type: 'button', class: 'lien-btn', text: T('pn_voir'), onclick: () => { fermerPanneau(false); ouvrirCal(sej.periodes[0]); } });
  const immo = n >= (hyp.seuilImmoCrans || 7);
  return [
    immo
      ? h('p', { class: 'prix-ligne pn-corps pn-immo', 'aria-live': 'polite', text: T('pn_immo_titre', { prix: chf(fiche().prix_semaine_public_chf.valeur) }) })
      : h('p', { class: 'prix-ligne pn-corps', 'aria-live': 'polite', text: totalTxt(sej, n) }),
    immo ? h('p', { class: 'pn-repere pn-corps num', text: repereTxt(sej, n) }) : null,
    uniforme ? null : h('p', { class: 'source', text: groupes.map((g) => T('pn_groupe', { n: nuitsTxt(g.n), nom: nomP(D.cal.find((c) => c.id === g.periode) || { id: '' }), prix: chf(g.prix) })).join(', ') }),
    h('p', { class: 'source num' }, `${T('pn_preuve', { n: pers.map((c) => c.n).join(' / '), date: date ? dateFr(date) : '' })} · `, lien),
    sej.nuitsMin ? h('p', { class: 'source', text: T('pn_min', { n: sej.nuitsMin }) }) : null,
  ];
}

/* ---------- Rendu global et événements ---------- */
function rendre() {
  majStatique();
  if (etat.panneau) { rendrePanneau(); }
  if (etat.page === 'reponse') { const t0 = etat.rep.source; rendreReponse(); void t0; }
  if (etat.page === 'hote') rendreHote();
  if (etat.page === 'prix') rendrePrix();
  if (etat.page === 'methode') rendreMethode();
}
function changerLangue(l) {
  if (!texteUI[l]) return;
  etat.langue = l; etat.langueDemande = l; if (etat.rep.source === 'correct') etat.rep.texte = ''; rendre();
}
function lier() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b) {
      const a = b.dataset.action;
      if (a === 'reserver') reserver(b);
      else if (a === 'fermer') fermerPanneau();
      else if (a === 'accueil') montrer('accueil');
      else if (a === 'hote') montrer('hote');
      else if (a === 'prix') montrer('prix');
      else if (a === 'methode') montrer('methode');
      else if (a === 'verif') { if (canalTexte('airbnb', 'titre')) ouvrirTitreAirbnb(); else montrer('reponse'); }
      else if (a === 'reponse') montrer('reponse');
      return;
    }
    const lg = e.target.closest('[data-langue]');
    if (lg) { changerLangue(lg.dataset.langue); return; }
    const m = e.target.closest('[data-mode], [data-mode2]');
    if (m) { etat.mode = m.dataset.mode || m.dataset.mode2; majStatique(); return; }
    if (e.target.closest('#bandeau-ok')) { etat.iaOk = true; try { sessionStorage.setItem('r3b_ia_ok', '1'); } catch { /* session seulement */ } majBandeau(); return; }
    if (e.target.id === 'voile') fermerPanneau();
    if (e.target.closest('#marque')) { e.preventDefault(); montrer('accueil'); }
  });
  document.addEventListener('keydown', (e) => {
    if (!etat.panneau) return;
    if (e.key === 'Escape') { e.preventDefault(); fermerPanneau(); return; }
    if (e.key !== 'Tab') return;
    const p = $('#panneau');
    const liste = [...p.querySelectorAll('button:not(:disabled), a[href], input, textarea, summary, [tabindex="0"]')].filter((x) => x.offsetParent !== null);
    if (!liste.length) return;
    const premier = liste[0], dernier = liste[liste.length - 1];
    if (e.shiftKey && (document.activeElement === premier || document.activeElement === $('#p-titre'))) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  });
  $('#langue-select').addEventListener('change', (e) => changerLangue(e.target.value));
  lierPrix();
  const rep = $('#v-reponse');
  rep.addEventListener('mouseover', (e) => lierFaits(e, true)); rep.addEventListener('mouseout', (e) => lierFaits(e, false));
  rep.addEventListener('focusin', (e) => lierFaits(e, true)); rep.addEventListener('focusout', (e) => lierFaits(e, false));
}

async function demarrer() {
  try {
    try { CX = await import('./lib/canaux.js'); } catch { CX = null; }
    texteUI = await fetch('./data/ui.json').then((r) => r.json());
    const [fiche_, tarifs, ics, canaux, brouillons, comparables, periodes, hyp] = await Promise.all([
      fetch('./data/fiche.json').then((r) => r.json()), fetch('./data/tarifs.json').then((r) => r.json()),
      fetch('./data/calendrier.ics').then((r) => r.text()),
      fetch('./data/canaux.json').then((r) => r.json()), fetch('./data/brouillons-test.json').then((r) => r.json()),
      fetch('./data/comparables.json').then((r) => r.json()), fetch('./data/periodes.json').then((r) => r.json()), fetch('./data/hypotheses.json').then((r) => r.json()),
    ]);
    const cal = parseIcs(ics);
    D = { fiche: fiche_, tarifs, comparables, periodes, hyp, plages: cal.plages, erreurIcs: cal.erreur, prises: nuitsPrises(cal.plages), canaux: [], brouillons };
    D.cal = calPrix(comparables, periodes, hyp);
    D.cmp = GN.comparer(D.cal, periodes, hyp, retenusObj());
    try { D.cmpMarche = GN.comparer(D.cal, periodes, hyp, marcheCibles()); } catch { D.cmpMarche = null; }
    D.faq = await fetch('./data/faq.json').then((r) => (r.ok ? r.json() : [])).then((j) => (Array.isArray(j) ? j : [])).catch(() => []);
    D.controle = controlerCanaux(canaux, fiche_);
    D.faitsCanaux = {};
    for (const x of canaux) {
      const faits = verifier(x.texte, fiche_).faits.map((f) => ({ ...f, source: f.source || x.source, date: f.date || x.date }));
      D.canaux.push({ ...x, faits }); (D.faitsCanaux[x.canal] ||= []).push(...faits);
    }
  } catch {
    $('#faits-fiche').textContent = (texteUI.fr && texteUI.fr.donnees_ko) || 'Données indisponibles.';
    return;
  }
  try { magasin = creerMagasin(window.localStorage); } catch { magasin = creerMagasin(null); magasin.avertissement = 'stockage_indisponible'; }
  const premier = aujourdhui > '2026-12-01' ? aujourdhui : '2026-12-01';
  etat.moisAn = Number(premier.slice(0, 4)); etat.moisM = Number(premier.slice(5, 7));
  lier(); majStatique();
  demarrerScene({ cal: D.cal });
  majSurNuit(); window.addEventListener('scroll', majSurNuit, { passive: true }); window.addEventListener('resize', majSurNuit, { passive: true });
}
demarrer();
