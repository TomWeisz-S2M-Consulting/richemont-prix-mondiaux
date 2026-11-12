// Dates "AAAA-MM-JJ" manipulées en entiers (aucun fuseau : calcul en UTC par Date.UTC).
const JOUR_MS = 86400000;

const JOURS = {
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const MOIS = {
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const deux = (n) => String(n).padStart(2, '0');

// Année bissextile grégorienne.
const bissextile = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** Vrai si `iso` est une vraie date du calendrier (jour réel, février bissextile compris). */
export function valide(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, j] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || j < 1) return false;
  const nbJours = [31, bissextile(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return j <= nbJours;
}

/** Nombre entier de jours depuis 1970-01-01 (Date.UTC : indépendant du fuseau). */
export function numeroJour(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, j) / JOUR_MS);
}

// Inverse de numeroJour : entier -> iso (lecture en UTC uniquement).
function depuisNumero(nj) {
  const d = new Date(nj * JOUR_MS);
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
}

/** Nombre de nuits entre arrivée et départ (peut être <= 0 : à l'appelant de décider). */
export const nuits = (arrivee, depart) => numeroJour(depart) - numeroJour(arrivee);

/** Ajoute n jours (n peut être négatif). */
export const ajouter = (iso, n) => depuisNumero(numeroJour(iso) + n);

/** Liste des nuits [arrivée … départ-1]. */
export function plage(arrivee, depart) {
  const n = nuits(arrivee, depart);
  return Array.from({ length: Math.max(n, 0) }, (_, i) => ajouter(arrivee, i));
}

// Jour de semaine, 0 = dimanche (1970-01-01 était un jeudi).
const jourSemaine = (iso) => (((numeroJour(iso) + 4) % 7) + 7) % 7;

/** « sam. 19 déc. 2026 » / « Sat 19 Dec 2026 », sans toLocale*. */
export function formatCourt(iso, langue = 'fr') {
  const l = langue === 'en' ? 'en' : 'fr';
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS[l][jourSemaine(iso)]} ${j} ${MOIS[l][m - 1]} ${a}`;
}

/** Données d'un mois pour la grille : premier jour (0 = lundi) et nombre de jours. */
export function moisGrille(annee, mois) {
  const premier = `${annee}-${deux(mois)}-01`;
  const suivant = mois === 12 ? `${annee + 1}-01-01` : `${annee}-${deux(mois + 1)}-01`;
  return {
    annee,
    mois,
    premierJourSemaine: (jourSemaine(premier) + 6) % 7,
    nbJours: nuits(premier, suivant),
  };
}
