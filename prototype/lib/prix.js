// Prix recommandé par période : filtre, quartiles (type 7), calendrier, séjour, canal, net hôte.
// Module pur : ni réseau, ni DOM. Chaque chiffre vient d'annonces datées de comparables.json.
// Un champ absent du relevé (capture_pleine, frais, capture_partielle) est toléré.
import { nuits as compterNuits, plage, valide } from './dates.js';

const liste = (p) => (Array.isArray(p) ? p : (p && p.periodes) || []);
// nMin ≤ 0 ou non numérique → garde-fou : au moins 1 annonce (jamais de bornes sans relevé).
const nMinDe = (hyp) => {
  const v = Number(hyp && hyp.nMin ? hyp.nMin.valeur ?? hyp.nMin : 5);
  return Number.isFinite(v) ? Math.max(1, v) : 5;
};
const plancherDe = (hyp) => (hyp && hyp.prixPlancherNuit && Number.isFinite(hyp.prixPlancherNuit.valeur) ? hyp.prixPlancherNuit.valeur : 280);

/** Décision par période : monter à la cible si le marché dépasse le plancher public, sinon garder le plancher. */
function decisionDe(cible, plancher) {
  return cible > plancher
    ? { action: 'monter', prixRetenuDefaut: cible, raison: { code: 'decision_monter', params: { cible, plancher } } }
    : { action: 'garder', prixRetenuDefaut: plancher, raison: { code: 'decision_garder', params: { cible, plancher } } };
}
const DECISION_AUCUNE = () => ({ action: 'aucune', prixRetenuDefaut: null, raison: { code: 'decision_aucune' } });

// Prix retenu saisi : nombre fini > 0 (ou texte numérique) ; sinon ignoré (undefined).
function prixValide(x) {
  if (typeof x === 'string' && x.trim() !== '') x = Number(x);
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined;
}
const defautDe = (p) => (p.decision && p.decision.prixRetenuDefaut != null ? p.decision.prixRetenuDefaut : p.cible);
/** Prix retenu d'une période du calendrier : saisie valide, sinon prix retenu par défaut. */
export function prixRetenuDe(p, prixRetenu = 'cible') {
  if (typeof prixRetenu === 'object' && prixRetenu !== null) return prixValide(prixRetenu[p.id]) ?? defautDe(p);
  return ['basse', 'haute'].includes(prixRetenu) ? p[prixRetenu] ?? p.cible : p.cible;
}
export { prixValide as _prixValide };

/** `{ periodeId: prix }` des prix retenus par défaut (périodes avec relevé suffisant). */
export function prixRetenusDefaut(cal) {
  const o = {};
  for (const p of liste(cal)) if (p.decision && p.decision.prixRetenuDefaut != null) o[p.id] = p.decision.prixRetenuDefaut;
  return o;
}
const pasDe = (hyp) => (hyp && hyp.arrondi) || 5;

/** Quartile (ou centile) p dans [0,1], interpolation linéaire « type 7 » (= Excel QUARTILE.INC). */
export function quartile(xs, p) {
  const t = [...xs].sort((a, b) => a - b);
  if (!t.length) return null;
  const h = (t.length - 1) * p;
  const i = Math.floor(h);
  const f = h - i;
  return i + 1 < t.length ? t[i] + f * (t[i + 1] - t[i]) : t[i];
}

/** Arrondi au multiple de 5 le plus proche (moitié vers le haut). */
export const arrondi5 = (x, pas = 5) => Math.floor(x / pas + 0.5) * pas;

// --- Filtre ------------------------------------------------------------------------------
/**
 * @param {object} comparables contenu de comparables.json
 * @param {string} fenetreId   P1…P8, C1, C2
 * @returns {{retenues: object[], exclues: {annonceId:string, motif:string}[]}}
 */
export function filtrer(comparables, fenetreId, { chambres = 2 } = {}) {
  const fen = (comparables.periodes || []).find((f) => f.id === fenetreId);
  const retenues = [];
  const exclues = [];
  for (const a of comparables.annonces || []) {
    if (a.source === 'immocrans') { exclues.push({ annonceId: a.id, motif: 'source ImmoCrans = prix catalogue' }); continue; }
    if (a.chambres !== chambres) { exclues.push({ annonceId: a.id, motif: `chambres ≠ ${chambres}` }); continue; }
    const p = (a.prix || []).find((x) => x.periode === fenetreId);
    if (!p || !fen || typeof p.total_chf !== 'number') { exclues.push({ annonceId: a.id, motif: 'pas de prix pour cette fenêtre' }); continue; }
    const r = {
      annonceId: a.id, titre: a.titre, url: a.url, total: p.total_chf, nuits: fen.nuits,
      nuit: p.total_chf / fen.nuits, avis: a.avis ?? 0, note: a.note ?? null, capture: p.capture ?? null,
      lu_le: p.lu_le ?? comparables.releve_le ?? null,
      fraisInclus: p.frais ?? a.frais ?? 'non vérifié',
    };
    if (p.sha256) r.sha256 = p.sha256;
    if (p.sha256_pleine) r.sha256Pleine = p.sha256_pleine;
    const pleine = p.capture_pleine ?? a.capture_pleine;
    if (pleine !== undefined) r.capturePleine = pleine;
    const part = p.capture_partielle ?? a.capture_partielle;
    if (part !== undefined) r.capturePartielle = part;
    retenues.push(r);
  }
  return { retenues, exclues };
}

// Statistiques d'un échantillon de nuits (arrondi au pas).
function stats(xs, pas) {
  return { basse: arrondi5(quartile(xs, 0.25), pas), cible: arrondi5(quartile(xs, 0.5), pas), haute: arrondi5(quartile(xs, 0.75), pas) };
}

// Biais du relevé : texte FR + clé i18n et paramètres (l'interface traduit par la clé).
const BIAIS_FR = (d) => `Prix demandés par des annonces encore libres le ${d} ; les annonces déjà réservées, souvent les mieux placées, ne sont pas visibles.`;
const jm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
function biaisReleve(iso) {
  const date = iso ? iso.slice(0, 10).split('-').reverse().join('/') : 'n/d';
  return { code: 'biais_releve', date, texte: BIAIS_FR(date) };
}

// Couverture : nuits relevées (fenêtres du relevé) contre nuits de la période ; extrapolé si moins.
function couverture(comparables, fenetres, portee) {
  const fens = fenetres.map((id) => (comparables.periodes || []).find((f) => f.id === id)).filter(Boolean);
  const nuitsRelevees = fens.reduce((s, f) => s + f.nuits, 0);
  const nuitsPeriode = portee ? compterNuits(portee.debut, portee.fin) : nuitsRelevees;
  const extrapole = nuitsRelevees < nuitsPeriode;
  const c = { nuitsRelevees, nuitsPeriode, fenetres: fens.map((f) => ({ id: f.id, arrivee: f.arrivee, depart: f.depart })), extrapole };
  if (extrapole) {
    const fenetresTexte = fens.map((f) => `${jm(f.arrivee)} → ${jm(f.depart)}`).join(', ');
    c.message = { code: 'extrapole_periode', nuitsRelevees, fenetres: fenetresTexte, nuitsPeriode,
      texte: `Relevé sur ${nuitsRelevees} nuits (${fenetresTexte}) ; appliqué à toute la période (${nuitsPeriode} nuits).` };
  }
  return c;
}

// Bornes d'un ensemble de fenêtres.
function bornesDe(comparables, fenetres, hyp, portee) {
  const vues = new Map(); // une annonce compte une fois par période
  for (const f of fenetres) {
    for (const r of filtrer(comparables, f).retenues) if (!vues.has(r.annonceId)) vues.set(r.annonceId, { ...r, fenetre: f });
  }
  const annonces = [...vues.values()];
  const n = annonces.length;
  if (n < nMinDe(hyp) || n < 1) return { statut: 'insuffisant', n, annonces, decision: DECISION_AUCUNE() };
  const pas = pasDe(hyp);
  const nuitsAnn = annonces.map((a) => a.nuit);
  const avecAvis = annonces.filter((a) => a.avis > 0).map((a) => a.nuit);
  const verifiees = annonces.filter((a) => a.fraisInclus && typeof a.fraisInclus === 'object').length;
  const dates = annonces.map((a) => a.lu_le).filter(Boolean).sort();
  const releveLe = dates.length ? dates[dates.length - 1] : comparables.releve_le ?? null;
  const partielles = annonces.filter((a) => a.capturePartielle === true).length;
  const st = stats(nuitsAnn, pas);
  return {
    statut: 'ok', n, ...st, decision: decisionDe(st.cible, plancherDe(hyp)),
    releveLe,
    preuves: { verifiees, sur: n, partielles },
    biais: biaisReleve(releveLe),
    couverture: couverture(comparables, fenetres, portee),
    annonces,
    sansAvis: avecAvis.length >= 2 ? { n: avecAvis.length, ...stats(avecAvis, pas) } : null,
    fraisInclus: verifiees ? { verifiees, sur: n } : 'non vérifié',
  };
}

/** Bornes d'une période (agrège ses fenêtres). `periode.fenetres` vide → insuffisant, n = 0. */
export function bornes(comparables, periode, hyp) {
  return bornesDe(comparables, periode.fenetres || [], hyp, { debut: periode.debut, fin: periode.fin });
}

/** Les périodes (et leurs sous-lignes) avec leurs bornes, dans l'ordre chronologique. */
export function calendrier(comparables, periodes, hyp) {
  return liste(periodes).map((p) => ({
    id: p.id, nom: p.nom, debut: p.debut, fin: p.fin, nuitsMin: p.nuitsMin,
    source: p.source, statutSource: p.statut, moteur: p.moteur, fenetres: p.fenetres || [],
    ...bornes(comparables, p, hyp),
    sousLignes: (p.sousLignes || []).map((s) => ({
      id: s.id, nom: s.nom, nuitsMin: s.nuitsMin ?? p.nuitsMin, fenetres: s.fenetres || [],
      ...bornesDe(comparables, s.fenetres || [], hyp, { debut: p.debut, fin: p.fin }),
    })),
  }));
}

/** Période (de `periodes` ou d'un calendrier) qui contient la date : debut <= iso < fin. */
export function periodeDe(iso, periodes) {
  return liste(periodes).find((p) => p.debut <= iso && iso < p.fin) || null;
}

/** Aucun trou, aucun recouvrement entre le début de la 1re période et la fin de la dernière. */
export function couvertureOk(periodes) {
  const l = [...liste(periodes)].sort((a, b) => (a.debut < b.debut ? -1 : 1));
  if (!l.length) return false;
  return l.every((p, i) => p.debut < p.fin && (i === 0 || l[i - 1].fin === p.debut));
}

/**
 * Prix d'un séjour : chaque nuit prend le prix de sa période.
 * @param prixRetenu 'cible' (défaut) | 'basse' | 'haute' | { [periodeId]: prix }
 */
export function prixSejour(arrivee, depart, cal, prixRetenu = 'cible') {
  const res = { nuits: 0, total: null, lignes: [], nuitsMin: null, periodes: [], insuffisant: false };
  if (!valide(arrivee) || !valide(depart)) { res.insuffisant = true; return res; }
  res.nuits = compterNuits(arrivee, depart);
  const touche = new Map();
  for (const nuit of plage(arrivee, depart)) {
    const p = periodeDe(nuit, cal);
    let prix = null;
    if (p && p.statut === 'ok') prix = prixRetenuDe(p, prixRetenu);
    if (prix == null) res.insuffisant = true;
    res.lignes.push({ nuit, prix, periode: p ? p.id : null });
    if (p) touche.set(p.id, p);
  }
  res.periodes = [...touche.keys()];
  res.nuitsMin = touche.size ? Math.max(...[...touche.values()].map((p) => p.nuitsMin)) : null;
  res.total = res.insuffisant || !res.lignes.length ? null : res.lignes.reduce((s, l) => s + l.prix, 0);
  return res;
}

/** Objet compatible tarifs.estimer : périodes insuffisantes omises (nuit non couverte → total null). */
export function tarifsHoteDepuisCalendrier(cal, prixRetenu = 'cible') {
  const l = liste(cal);
  return {
    prixNuitDefaut: null,
    periodes: l.filter((p) => p.statut === 'ok').map((p) => ({
      nom: (p.nom && p.nom.fr) || p.id, debut: p.debut, fin: p.fin,
      prixNuit: prixRetenuDe(p, prixRetenu),
      nuitsMin: p.nuitsMin,
    })),
    nuitsMinDefaut: l.length ? Math.min(...l.map((p) => p.nuitsMin)) : null,
  };
}

// --- Canal et net ------------------------------------------------------------------------
/** ImmoCrans dès le seuil de nuits (7) ; origine « site » → direct ; sinon plateforme. */
export function canal(nuits, periodeId, origine, hyp) {
  const seuil = (hyp && hyp.seuilImmoCrans) || 7;
  if (origine === 'site') return { canal: 'direct', raison: 'demande venue du site : pas de commission de plateforme' };
  if (nuits >= seuil) return { canal: 'immocrans', raison: `${seuil} nuits et plus : ImmoCrans (proposition à l'agence)` };
  return { canal: 'plateforme', raison: `moins de ${seuil} nuits : Airbnb ou Booking` };
}

/** Net hôte en CHF (2 décimales). plateforme = commission Airbnb (Booking non lisible). */
export function netHote(prix, canalNom, hyp, scenario = 'central') {
  const c = hyp.commissions;
  const taux = canalNom === 'immocrans' ? c.immocrans[scenario]
    : canalNom === 'direct' ? c.directFrais.valeur
      : c.airbnb.valeur;
  return Math.round(prix * (1 - taux) * 100) / 100;
}

/** Deux lignes à afficher partout : prix payé par le voyageur et net hôte du canal (commission en paramètre). */
export function deuxLignes(prixVoyageur, canalNom, hyp, scenario = 'central') {
  const c = hyp.commissions;
  const commission = canalNom === 'immocrans' ? c.immocrans[scenario] : canalNom === 'direct' ? c.directFrais.valeur : c.airbnb.valeur;
  return { voyageur: prixVoyageur, net: netHote(prixVoyageur, canalNom, hyp, scenario), commission };
}

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
const dateFr = (iso) => iso.split('-').reverse().join('/');

/** Texte FR prêt à copier : une ligne par période avec relevé suffisant, avec la décision (monter / garder) et le net. */
export function propositionImmoCrans(cal, hyp, prixRetenus) {
  const l = liste(cal);
  const ok = l.filter((p) => p.statut === 'ok');
  const rel = ok.map((p) => p.releveLe).filter(Boolean).sort().pop();
  const com = hyp && hyp.commissions ? hyp.commissions.immocrans.central : null;
  const plancher = plancherDe(hyp);
  const retenu = (p) => (typeof prixRetenus === 'object' && prixRetenus !== null ? prixValide(prixRetenus[p.id]) : undefined) ?? defautDe(p);
  const net = (prix) => (com === null ? '' : ` Net hôte estimé par nuit : CHF ${Math.round(prix * (1 - com) * 100) / 100} (commission ${Math.round(com * 100)} %, hypothèse, commission réelle inconnue).`);
  const lignes = ok.map((p) => {
    const prix = retenu(p);
    const verbe = prix > plancher ? `monter à ${prix}` : prix === plancher ? `garder ${plancher}` : `baisser à ${prix}`;
    const marche = p.cible <= plancher && prix === plancher ? ` Marché à ${p.cible}, sous le plancher public ${plancher} : baisser n'augmente pas le revenu à occupation égale.` : '';
    return `- ${p.nom.fr} (du ${dateFr(p.debut)} au ${dateFr(p.fin)} exclu) : ${verbe} (prix voyageur CHF ${prix} la nuit ; marché ${p.basse} à ${p.haute}), ${p.nuitsMin} nuits minimum, fondé sur ${p.n} annonces comparables.${marche}${net(prix)}`;
  });
  const sans = l.filter((p) => p.statut !== 'ok').map((p) => p.nom.fr);
  return [
    'Proposition de grille de prix pour Richemont 3B (prix par nuit, appartement entier, 2 chambres).',
    ...lignes,
    sans.length ? `Pas de recommandation, données insuffisantes : ${sans.join(', ')}.` : '',
    `Source : annonces publiques comparables à Crans-Montana, relevé du ${rel ? dateFr(rel) : 'n/d'} (prix demandés, pas réservés).`,
  ].filter(Boolean).join('\n');
}
export { fmt as _fmt };
