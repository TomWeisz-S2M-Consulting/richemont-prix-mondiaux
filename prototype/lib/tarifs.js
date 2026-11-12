// Estimation d'un séjour et aiguillage (direct / ImmoCrans). Aucune taxe, aucun coefficient.
import { valide, nuits as compterNuits, plage } from './dates.js';

// Période applicable à une nuit : la DERNIÈRE qui contient la nuit (debut <= nuit < fin).
function periodeDe(nuit, periodes) {
  let trouvee = null;
  for (const p of periodes || []) if (p.debut <= nuit && nuit < p.fin) trouvee = p;
  return trouvee;
}

/**
 * @param {{arrivee:string, depart:string, voyageurs:number}} sejour
 * @param {object} tarifs  { seuilImmoCrans, canalDirect, prixSemainePublic:{chf}, tarifsHote|null }
 * @param {object} fiche   fiche.json
 * @param {{aujourdhui?:string}} ctx  date du jour injectée (iso)
 */
export function estimer({ arrivee, depart, voyageurs }, tarifs, fiche, { aujourdhui } = {}) {
  const erreurs = [];
  const hote = tarifs.tarifsHote || null;
  const resultat = {
    ok: false, erreurs, nuits: null, aiguillage: null,
    prixSemainePublic: tarifs.prixSemainePublic ? tarifs.prixSemainePublic.chf : null,
    total: null, lignes: [], nuitsMin: null, canalDirect: tarifs.canalDirect !== false,
  };

  const datesOk = valide(arrivee) && valide(depart);
  if (!datesOk) erreurs.push('dates_invalides');
  else {
    resultat.nuits = compterNuits(arrivee, depart);
    if (resultat.nuits <= 0) erreurs.push('dates_inversees');
    if (aujourdhui && arrivee < aujourdhui) erreurs.push('date_passee');
  }

  const capacite = fiche.champs.capacite.valeur;
  if (!Number.isInteger(voyageurs) || voyageurs < 1 || voyageurs > capacite) erreurs.push('voyageurs_invalides');

  if (datesOk && resultat.nuits > 0) {
    resultat.aiguillage = resultat.nuits >= tarifs.seuilImmoCrans ? 'immocrans' : 'direct';
    if (!resultat.canalDirect && resultat.aiguillage === 'direct') resultat.aiguillage = null;

    if (hote) {
      // Un montant par nuit ; le total est la somme entière.
      resultat.lignes = plage(arrivee, depart).map((nuit) => {
        const p = periodeDe(nuit, hote.periodes);
        return { nuit, prix: p ? p.prixNuit : (hote.prixNuitDefaut ?? null), periode: p ? p.nom : null };
      });
      // Une nuit sans prix (période insuffisante, prixNuitDefaut null) : pas de total, jamais un chiffre inventé.
      resultat.total = resultat.lignes.some((l) => l.prix == null) ? null : resultat.lignes.reduce((s, l) => s + l.prix, 0);
      const pArrivee = periodeDe(arrivee, hote.periodes);
      resultat.nuitsMin = pArrivee ? pArrivee.nuitsMin : hote.nuitsMinDefaut;
      if (resultat.nuits < resultat.nuitsMin) erreurs.push('nuits_min');
    }
  }
  resultat.ok = erreurs.length === 0;
  return resultat;
}
