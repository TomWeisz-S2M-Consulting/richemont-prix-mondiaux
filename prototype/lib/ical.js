// Lecture d'un calendrier iCalendar (.ics) : plages de nuits prises. Aucune dépendance.
import { valide, ajouter, numeroJour } from './dates.js';

// "20261219", "20270305T150000" ou "...Z" -> "2026-12-19" (on ne garde que la date) ; sinon null.
function dateIcs(valeur) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valeur.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return valide(iso) ? iso : null;
}

/**
 * Parse un texte .ics.
 * @returns {{plages: {debut:string, fin:string, resume:string, uid:string}[], erreur: null|'vide'|'format'}}
 * `fin` est exclusive (la nuit `fin` n'est pas prise). L'appelant doit traiter `erreur`
 * (ne jamais afficher « libre » par défaut si le calendrier est illisible).
 */
export function parseIcs(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return { plages: [], erreur: 'vide' };
  const debutCal = texte.indexOf('BEGIN:VCALENDAR');
  if (debutCal < 0) return { plages: [], erreur: 'format' };

  // Dépliage RFC 5545 : une ligne qui commence par espace/tab prolonge la précédente.
  const lignes = texte.slice(debutCal).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const evenements = [];
  let courant = null;
  for (const ligne of lignes) {
    if (ligne === 'BEGIN:VEVENT') courant = {};
    else if (ligne === 'END:VEVENT') { if (courant) evenements.push(courant); courant = null; }
    else if (courant) {
      const i = ligne.indexOf(':');
      if (i < 0) continue;
      const nom = ligne.slice(0, i).split(';')[0].toUpperCase(); // on ignore VALUE=DATE, TZID=…
      const val = ligne.slice(i + 1);
      if (nom === 'DTSTART') courant.debut = dateIcs(val);
      else if (nom === 'DTEND') courant.fin = dateIcs(val);
      else if (nom === 'SUMMARY') courant.resume = val.replace(/\\,/g, ',');
      else if (nom === 'UID') courant.uid = val.trim();
    }
  }

  // Dédoublonnage (uid, sinon debut+fin), puis tri.
  const vus = new Set();
  const plages = [];
  for (const e of evenements) {
    if (!e.debut) continue; // sans DTSTART : ignoré
    let fin = e.fin || ajouter(e.debut, 1); // sans DTEND : une nuit
    if (numeroJour(fin) <= numeroJour(e.debut)) fin = ajouter(e.debut, 1);
    const cle = e.uid || `${e.debut}|${fin}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    plages.push({ debut: e.debut, fin, resume: e.resume || '', uid: e.uid || '' });
  }
  plages.sort((a, b) => numeroJour(a.debut) - numeroJour(b.debut));

  // Fusion des chevauchements stricts (deux séjours contigus restent distincts).
  const fusion = [];
  for (const p of plages) {
    const dernier = fusion[fusion.length - 1];
    if (dernier && numeroJour(p.debut) < numeroJour(dernier.fin)) {
      if (numeroJour(p.fin) > numeroJour(dernier.fin)) dernier.fin = p.fin;
    } else fusion.push({ ...p });
  }
  return { plages: fusion, erreur: null };
}

/** Ensemble des nuits prises (iso). */
export function nuitsPrises(plages) {
  const prises = new Set();
  for (const p of plages) {
    for (let n = p.debut; numeroJour(n) < numeroJour(p.fin); n = ajouter(n, 1)) prises.add(n);
  }
  return prises;
}

/** Séjour libre ? Arrivée le jour d'un `fin` ou départ le jour d'un `debut` = libre. */
export function estLibre(plages, arrivee, depart) {
  const a = numeroJour(arrivee);
  const d = numeroJour(depart);
  const conflit = plages.find((p) => numeroJour(p.debut) < d && numeroJour(p.fin) > a);
  return { libre: !conflit, conflit: conflit ? { debut: conflit.debut, fin: conflit.fin } : null };
}
