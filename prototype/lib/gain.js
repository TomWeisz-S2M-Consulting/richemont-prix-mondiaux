// Gain chiffré : seuil d'équivalence et trois scénarios d'hypothèses nommées. Module pur.
// Aucune courbe d'élasticité : l'occupation à chaque prix est POSÉE (hypothèse), la sensibilité au prix n'est pas mesurée.
import { nuits as compterNuits } from './dates.js';
import { netHote, prixRetenusDefaut, prixRetenuDe } from './prix.js';

const SAISON = { hiver: ['automne26', 'preouv', 'fetes', 'janv', 'mondiaux', 'fevrier', 'mars'], ete: ['printemps', 'ete', 'oem', 'automne27'] };
const liste = (p) => (Array.isArray(p) ? p : (p && p.periodes) || []);
const arrondi2 = (x) => Math.round(x * 100) / 100;

/** Part d'occupation à partir de laquelle le prix cible rapporte autant que le plancher à 100 % (280 / 465 = 0,60). */
export const seuilEquivalence = (plancher, cible, hyp, scenario = 'central', canalPlancher = 'immocrans', canalCible = 'immocrans') => {
  const brut = plancher / cible;
  if (!hyp) return brut; // appel historique : brut seul
  const net = netHote(plancher, canalPlancher, hyp, scenario) / netHote(cible, canalCible, hyp, scenario);
  return { brut, net, canalPlancher, canalCible };
};

/** Net moyen pondéré par les parts de canaux (immocrans / plateformes / direct). */
export function netMoyen(parts, hyp, scenario) {
  const c = hyp.commissions;
  return parts.immocrans * (1 - c.immocrans[scenario]) + parts.plateformes * (1 - c.airbnb.valeur) + parts.direct * (1 - c.directFrais.valeur);
}

/**
 * Revenu net d'une période = (nuits − nuits propriétaire au prorata) × occupation × prix × net moyen.
 * `periode.horizonNuits` (nuits de l'horizon) sert au prorata ; absent → aucune nuit propriétaire retirée.
 */
export function revenuPeriode(periode, prixNuit, occupation, parts, hyp, scenario, voyageur = false) {
  const n = compterNuits(periode.debut, periode.fin);
  const prop = periode.horizonNuits ? hyp.scenarios[scenario].nuitsProprietaire * n / periode.horizonNuits : 0;
  // voyageur = true : montant payé par les voyageurs (avant commissions) ; sinon net hôte.
  return arrondi2((n - prop) * occupation * prixNuit * (voyageur ? 1 : netMoyen(parts, hyp, scenario)));
}

/**
 * base = plancher à plat, occupation « plancher » ; reco = prix retenu par période (défaut : monter à la cible
 * ou garder le plancher), occupation « cible » si le prix retenu dépasse le plancher, sinon celle du plancher
 * (même prix, même occupation : delta 0, décision « garder »).
 * Un scénario décrit la demande (occupations posées), pas le gain.
 */
export function comparer(cal, periodes, hyp, prixRetenus = prixRetenusDefaut(cal)) {
  const ps = liste(periodes);
  const horizonNuits = ps.length ? compterNuits(ps[0].debut, ps[ps.length - 1].fin) : 0;
  const plancher = hyp.prixPlancherNuit.valeur;
  const scenarios = {};
  for (const nom of Object.keys(hyp.scenarios)) {
    const sc = hyp.scenarios[nom];
    const parPeriode = liste(cal).map((c) => {
      const occ = sc.occupation[c.id];
      const per = { debut: c.debut, fin: c.fin, horizonNuits };
      const base = { voyageur: revenuPeriode(per, plancher, occ.plancher, sc.parts, hyp, nom, true), net: revenuPeriode(per, plancher, occ.plancher, sc.parts, hyp, nom) };
      if (c.statut !== 'ok') return { id: c.id, base, reco: null, delta: null, seuil: null, decision: 'aucune', prixRetenu: null };
      const prix = prixRetenuDe(c, prixRetenus);
      const garder = prix <= plancher;
      const occReco = prix === plancher ? occ.plancher : occ.cible;
      const reco = garder && prix === plancher ? { ...base } : { voyageur: revenuPeriode(per, prix, occReco, sc.parts, hyp, nom, true), net: revenuPeriode(per, prix, occReco, sc.parts, hyp, nom) };
      const sq = seuilEquivalence(plancher, prix, hyp, nom, 'immocrans', 'immocrans');
      return { id: c.id, base, reco, delta: arrondi2(reco.net - base.net), seuil: { brut: arrondi2(sq.brut), net: arrondi2(sq.net) },
        decision: garder ? 'garder' : 'monter', prixRetenu: prix };
    });
    // Agrégats : base et reco ne portent que sur les périodes comparables (reco connue) ; le reste est signalé.
    const somme = (ids) => {
      const l = parPeriode.filter((x) => !ids || ids.includes(x.id));
      const ok = l.filter((x) => x.reco !== null);
      // base, reco, delta = net hôte ; baseVoyageur, recoVoyageur = montants payés par les voyageurs.
      const base = arrondi2(ok.reduce((s, x) => s + x.base.net, 0));
      const reco = arrondi2(ok.reduce((s, x) => s + x.reco.net, 0));
      return { base, reco, delta: arrondi2(reco - base), nPeriodes: ok.length, nInsuffisantes: l.length - ok.length,
        baseVoyageur: arrondi2(ok.reduce((s, x) => s + x.base.voyageur, 0)), recoVoyageur: arrondi2(ok.reduce((s, x) => s + x.reco.voyageur, 0)),
        baseInsuffisantes: arrondi2(l.filter((x) => x.reco === null).reduce((s, x) => s + x.base.net, 0)) };
    };
    scenarios[nom] = { nom: sc.nom || { fr: nom }, parPeriode, parSaison: { hiver: somme(SAISON.hiver), ete: somme(SAISON.ete) }, total: somme(null) };
  }
  return { scenarios, noteScenarios: hyp.noteScenarios, invalidations: hyp.invalidations, note: 'sensibilité au prix non mesurée', regleComparaison: hyp.regleComparaison };
}
