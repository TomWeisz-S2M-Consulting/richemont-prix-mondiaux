// Validation et enregistrement des demandes (local au navigateur dans la démo).
import { estimer } from './tarifs.js';
import { nuits } from './dates.js';

const CLE_STOCKAGE = 'r3b_demandes';
const TARIFS_NEUTRES = { seuilImmoCrans: 7, canalDirect: true, tarifsHote: null };

export const normaliserEmail = (e) => String(e ?? '').trim().toLowerCase();

/** Clé de doublon : même e-mail (normalisé) + mêmes dates. */
export const cle = (d) => `${normaliserEmail(d.email)}|${d.arrivee}|${d.depart}`;

/**
 * Codes d'erreur d'une demande. `ctx.tarifs` (facultatif) active aussi `nuits_min`.
 * Les dates et voyageurs sont contrôlés par estimer().
 */
export function valider(d, fiche, { aujourdhui, tarifs } = {}) {
  const codes = [];
  if (!String(d.prenom ?? '').trim()) codes.push('prenom_vide');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email ?? '').trim())) codes.push('email_invalide');
  if (String(d.message ?? '').length > 500) codes.push('message_trop_long');
  const est = estimer(d, tarifs || TARIFS_NEUTRES, fiche, { aujourdhui });
  return codes.concat(est.erreurs);
}

/**
 * Magasin de demandes. `stockage` facultatif (getItem/setItem, ex. localStorage) ;
 * si l'écriture échoue (mode privé), on continue en mémoire avec `avertissement`.
 */
export function creerMagasin(stockage, { maintenant = () => new Date().toISOString() } = {}) {
  let demandes = [];
  const magasin = { avertissement: null };
  try {
    const brut = stockage && stockage.getItem(CLE_STOCKAGE);
    if (brut) demandes = JSON.parse(brut);
  } catch { magasin.avertissement = 'stockage_indisponible'; }

  const sauver = () => {
    if (!stockage) return;
    try { stockage.setItem(CLE_STOCKAGE, JSON.stringify(demandes)); } catch { magasin.avertissement = 'stockage_indisponible'; }
  };

  magasin.liste = () => demandes.slice();
  magasin.trouver = (k) => demandes.find((x) => cle(x) === k) || null;
  // Synchrone, donc atomique : deux appels dans le même tick = un seul enregistrement.
  magasin.ajouter = (d) => {
    const existante = magasin.trouver(cle(d));
    if (existante) return { id: existante.id, doublon: true, demande: existante, recueLe: existante.recueLe };
    const compteur = String(demandes.length + 1).padStart(4, '0');
    const aamm = d.arrivee.slice(2, 4) + d.arrivee.slice(5, 7);
    const demande = {
      id: `R3B-${aamm}-${compteur}`,
      prenom: String(d.prenom).trim(), // jamais interprété comme HTML : l'affichage utilise textContent
      email: normaliserEmail(d.email),
      arrivee: d.arrivee, depart: d.depart, voyageurs: d.voyageurs,
      langue: d.langue || 'fr', message: d.message || '',
      canal: d.canal || (nuits(d.arrivee, d.depart) >= 7 ? 'immocrans' : 'direct'),
      recueLe: maintenant(),
    };
    demandes.push(demande);
    sauver();
    return { id: demande.id, doublon: false, demande };
  };
  return magasin;
}
