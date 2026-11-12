// Tableau des canaux (fiche × site / Airbnb / ImmoCrans / Booking) CALCULÉ, jamais codé en dur :
// chaque cellule vient des faits que `verifier()` extrait des textes réels de canaux.json.
// API :
//   tableauCanaux(fiche, canaux) -> { lignes: [{ champ, libelle_cle, fiche:{valeur,source,date}, parCanal:{ site, airbnb, immocrans, booking } }] }
//     cellule = { valeur, statut:'confirme'|'contredit'|'precision'|'non_mentionne', extrait, source, date, code, valeurs:[{valeur,statut,extrait,origine}], detail }
//     `valeurs` garde toutes les valeurs distinctes (ex. Airbnb chambres : 3 contredit ET 2 confirmé) ; `detail` = « <title> 3 / og:title 2 ».
//   corrigerTexte(texte, faits, fiche) -> { texte_corrige, corrections:[{extrait, remplacement, raison}] }
//     raisons : 'valeur_fiche' (nombre remplacé), 'lieu_fiche' (lieu remplacé), 'a_retirer' (équipement ou prix sans valeur de remplacement).
//   CHAMPS : liste ordonnée des champs ; CANAUX : ['site','airbnb','immocrans','booking'].
import { verifier, PIECES_IMMOCRANS, MOTS_NOMBRES, NUM, plier } from './verifier.js';

export const CANAUX = ['site', 'airbnb', 'immocrans', 'booking'];
export const CHAMPS = ['chambres', 'salles_eau', 'capacite', 'surface', 'etage', 'localisation', 'prix', 'distance_ski', 'garage', 'renovation', 'pieces'];

// Lieux de la fiche qui ne sont pas une localisation (repères de proximité).
const REPERES = new Set(['mérignou', 'cry d\'er', 'coop', 'golf']);
// Mots-clés par champ : si un texte les contient sans fait extractible, la cellule est « mentionné sans valeur » (jamais « non mentionné »).
const MOTS_CLES = {
  chambres: /chambre|bedroom|schlafzimmer|camer[ae]|спальн/i, salles_eau: /salles? d['’]eau|salles? de bain|bathroom|badezimmer|bagni|ванн|санузел/i,
  capacite: /personne|voyageur|guest|couchage|capacit|personen|ospiti|человек/i, surface: /m²|m2|surface|quadratmeter|metri quadri/i,
  etage: /[ée]tage|floor|stockwerk|piano|этаж/i, localisation: /crans|montana|lens|valais|adresse|rue /i, prix: /chf|prix|tarif|franken|francs/i,
  distance_ski: /\bmin\b|minute/i, garage: /garage|box|parking|parkplatz|гараж/i, renovation: /r[ée]nov|renovier|ristruttur|renovated|ремонт/i, pieces: /pi[èe]ces|zimmer|locali|rooms/i,
};
const ORIGINE = { titre: '<title>', og_title: 'og:title', description: 'og:description', description_annonce: 'description' };
const RANG = { contredit: 3, precision: 2, confirme: 1 };

function champDuFait(f) {
  switch (f.type) {
    case 'chambres': return 'chambres';
    case 'salles_eau': return 'salles_eau';
    case 'personnes': return 'capacite';
    case 'surface': return 'surface';
    case 'etage': return 'etage';
    case 'prix': return 'prix';
    case 'renovation': return 'renovation';
    case 'pieces': return 'pieces';
    case 'distance': return f.cle === 'télécabine' ? 'distance_ski' : null;
    case 'equipement': return f.cle === 'garage' ? 'garage' : null;
    case 'lieu': return f.cle === 'lieu_autre' || !REPERES.has(String(f.valeur).toLowerCase()) ? 'localisation' : null;
    default: return null;
  }
}

function colonneFiche(fiche, champ) {
  const c = fiche.champs;
  const de = (x, valeur = x.valeur) => ({ valeur, source: x.source ?? null, date: x.date ?? null });
  switch (champ) {
    case 'chambres': return de(c.chambres);
    case 'salles_eau': return de(c.salles_eau);
    case 'capacite': return de(c.capacite);
    case 'surface': return de(c.surface_utile_m2);
    case 'etage': return de(c.etage);
    case 'localisation': return de(c.adresse);
    case 'prix': return de(c.prix_semaine_public_chf);
    case 'distance_ski': return de(fiche.distances.find((d) => d.vers === 'télécabine'), fiche.distances.find((d) => d.vers === 'télécabine').minutes);
    case 'garage': return de(c.garage);
    case 'renovation': return de(c.renovation_annee);
    case 'pieces': return de(c.surface_habitable_m2, PIECES_IMMOCRANS); // « 3.5 pièces » : ImmoCrans (même fiche source)
    default: return null;
  }
}

export function tableauCanaux(fiche, canaux) {
  const noms = [...new Set([...CANAUX, ...canaux.map((x) => x.canal)])];
  // faits[champ][canal] = [{ valeur, statut, extrait, source, date, code, origine }]
  const faits = {};
  const mentions = {};
  for (const t of canaux) {
    const r = verifier(t.texte, fiche);
    for (const f of r.faits) {
      const champ = champDuFait(f);
      if (!champ) continue;
      // surface : seules comptent les surfaces de l'appartement (utile, habitable), pas la terrasse ni le jardin
      if (champ === 'surface' && f.statut === 'confirme' && !/appartement|utile|habitable/.test(fiche.surfaces_connues_detail?.[f.valeur] ?? 'appartement')) continue;
      const statut = f.statut === 'absent' ? 'contredit' : f.statut;
      ((faits[champ] ??= {})[t.canal] ??= []).push({ valeur: f.valeur, statut, extrait: f.extrait, source: t.source, date: t.date, code: f.code, origine: ORIGINE[t.champ] ?? t.champ });
    }
    for (const champ of CHAMPS) {
      const m = t.texte.match(MOTS_CLES[champ]);
      if (m) { // extrait = le mot entier autour de la correspondance (ex. « rénové », pas « rénov »)
        const deb = t.texte.slice(0, m.index).search(/[\p{L}\p{N}'’-]+$/u), fin = t.texte.slice(m.index + m[0].length).search(/[^\p{L}\p{N}'’-]|$/u);
        const extrait = t.texte.slice(deb < 0 ? m.index : deb, m.index + m[0].length + Math.max(fin, 0));
        ((mentions[champ] ??= {})[t.canal] ??= []).push({ extrait, source: t.source, date: t.date, origine: ORIGINE[t.champ] ?? t.champ });
      }
    }
  }
  const lignes = CHAMPS.map((champ) => {
    const parCanal = {};
    for (const canal of noms) {
      const liste = faits[champ]?.[canal];
      if (liste?.length) {
        const principal = [...liste].sort((a, b) => RANG[b.statut] - RANG[a.statut])[0];
        const distincts = [];
        for (const x of liste) if (!distincts.some((d) => String(d.valeur) === String(x.valeur) && d.statut === x.statut)) distincts.push({ valeur: x.valeur, statut: x.statut, extrait: x.extrait, origine: x.origine });
        parCanal[canal] = { valeur: principal.valeur, statut: principal.statut, extrait: principal.extrait, source: principal.source, date: principal.date, code: principal.code,
          valeurs: distincts, detail: new Set(distincts.map((d) => d.statut)).size > 1 ? distincts.map((d) => `${d.origine} ${d.valeur}`).join(' / ') : null };
      } else if (mentions[champ]?.[canal]?.length) { // le mot est là, pas de valeur chiffrée (ex. « Entièrement rénové »)
        const m = mentions[champ][canal][0];
        parCanal[canal] = { valeur: null, statut: 'precision', extrait: m.extrait, source: m.source, date: m.date, code: 'mentionne_sans_valeur', valeurs: [], detail: null };
      } else {
        parCanal[canal] = { valeur: null, statut: 'non_mentionne', extrait: null, source: null, date: null, code: 'non_mentionne', valeurs: [], detail: null };
      }
    }
    return { champ, libelle_cle: `champ_${champ}`, fiche: colonneFiche(fiche, champ), parCanal };
  });
  return { lignes };
}

// --- Corrections proposées ---------------------------------------------------------------
const MOTS = Object.keys(MOTS_NOMBRES).join('|');
const JETON = new RegExp(`${NUM}|(?<![a-zа-я])(?:${MOTS})(?![a-zа-я])`, 'g');
const fmtMilliers = (modele, n) => (/'/.test(modele) ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'") : / /.test(modele) ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(n));

/** Remplace le(s) nombre(s) de `extrait` par `valeur` ; null si aucun nombre. Plage « 4 à 6 » : toute la plage. */
function remplacerNombre(extrait, valeur, plage) {
  const norm = plier(extrait);
  const chiffres = [...norm.matchAll(/\d[\d '.,]*\d|\d/g)];
  const jetons = chiffres.length ? chiffres : [...norm.matchAll(JETON)];
  if (!jetons.length) return null;
  const premier = jetons[0]; const dernier = plage ? jetons[jetons.length - 1] : premier;
  const a = premier.index; const b = dernier.index + dernier[0].length;
  const texteValeur = typeof valeur === 'number' && valeur >= 1000 ? fmtMilliers(extrait.slice(a, b), valeur) : String(valeur);
  return extrait.slice(0, a) + texteValeur + extrait.slice(b);
}

export function corrigerTexte(texte, faits, fiche) {
  const c = fiche.champs;
  const corrections = []; const remplacements = [];
  for (const f of faits) {
    if (f.statut !== 'contredit' && f.statut !== 'absent') continue;
    const retirer = () => corrections.push({ extrait: f.extrait, remplacement: null, raison: 'a_retirer' });
    if (f.type === 'equipement') { retirer(); continue; }
    if (f.type === 'lieu') { remplacements.push([f, 'Crans-Montana']); corrections.push({ extrait: f.extrait, remplacement: 'Crans-Montana', raison: 'lieu_fiche' }); continue; }
    let valeur = null;
    if (f.type === 'chambres') valeur = c.chambres.valeur;
    else if (f.type === 'salles_eau') valeur = c.salles_eau.valeur;
    else if (f.type === 'personnes') valeur = c.capacite.valeur;
    else if (f.type === 'surface') valeur = c.surface_utile_m2.valeur;
    else if (f.type === 'renovation') valeur = c.renovation_annee.valeur;
    else if (f.type === 'distance') valeur = f.attendu > 0 ? f.attendu : null;
    else if (f.type === 'prix') valeur = f.valeur >= 500 ? c.prix_semaine_public_chf.valeur : null; // un prix de semaine ; un petit montant (ménage…) reste à retirer
    const neuf = valeur == null ? null : remplacerNombre(f.extrait, valeur, typeof f.valeur === 'string');
    if (neuf == null) { retirer(); continue; }
    remplacements.push([f, neuf]);
    corrections.push({ extrait: f.extrait, remplacement: neuf, raison: 'valeur_fiche' });
  }
  let texte_corrige = texte;
  for (const [f, neuf] of remplacements.sort((x, y) => y[0].debut - x[0].debut)) texte_corrige = texte_corrige.slice(0, f.debut) + neuf + texte_corrige.slice(f.fin);
  return { texte_corrige, corrections };
}
