// Vérificateur de faits : n'extrait que des FAITS TYPÉS (nombre + mot-clé, équipement, lieu,
// distance connue). Années, codes postaux, heures, dates, « 24 h/24 » ne sont jamais des faits.
// Prix par période (contexte.calendrier) : unités nuit / semaine, dates du texte ou contexte.periode.
// Langues : FR, EN, DE, IT, RU (le russe est replié : « ё » devient « е »).
// Le niveau `precision` n'empêche pas l'envoi ; `contredit` et `absent` bloquent.

import { valide } from './dates.js';

// --- Normalisation sans changer la longueur (les positions restent valables) -------------
const REPLI = { 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'à': 'a', 'â': 'a', 'ä': 'a', 'î': 'i', 'ï': 'i',
  'ô': 'o', 'ö': 'o', 'ì': 'i', 'ò': 'o', 'í': 'i', 'ó': 'o', 'á': 'a', 'ú': 'u', 'ё': 'е', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ç': 'c', 'œ': 'o', 'ß': 's', '’': "'", '‘': "'",
  ' ': ' ', ' ': ' ' };
function plier(s) {
  let out = '';
  for (const c of String(s)) { // for…of itère par point de code : on garde 1 caractère = 1 caractère
    const m = c.toLowerCase();
    out += REPLI[m] ?? (m.length === 1 ? m : c);
  }
  return out;
}
// Lettres et chiffres (latin + cyrillique) pour les frontières de mot.
const LET = 'a-zа-я0-9';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- Nombres -----------------------------------------------------------------------------
const MOTS_NOMBRES = { un: 1, une: 1, one: 1, deux: 2, two: 2, trois: 3, three: 3, quatre: 4, four: 4,
  cinq: 5, five: 5, six: 6, sept: 7, seven: 7, huit: 8, eight: 8, neuf: 9, nine: 9, dix: 10, ten: 10,
  ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, // allemand (« fünf » replié)
  uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, // italien
  одна: 1, одну: 1, две: 2, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6 }; // russe
const ARTICLES = new Set(['un', 'une', 'one', 'ein', 'eine', 'uno', 'una', 'одна', 'одну']); // « une chambre double » n'est pas un fait
const NUM = "(?:\\d{1,3}(?:[ '](?=\\d{3}(?!\\d))\\d{3})+|\\d+)(?:[.,]\\d+)?";
const NB = `(?:${NUM}|(?<![${LET}])(?:${Object.keys(MOTS_NOMBRES).join('|')})(?![${LET}]))`;
const GARDE = '(?<![a-zа-я0-9.,])';
const nombre = (t) => (t in MOTS_NOMBRES ? MOTS_NOMBRES[t] : Number(t.replace(/[ ']/g, '').replace(',', '.')));
// « 1,960 » / « 1.960 » (3 chiffres après le séparateur) = milliers, seulement pour un prix.
const montant = (t) => (/^\d{1,3}[.,]\d{3}$/.test(t) ? Number(t.replace(/[.,]/g, '')) : nombre(t));

// Mois (DE/IT/RU/FR/EN) : un nombre suivi d'un mois est une date, jamais un fait.
const MOIS = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre',
  'january','february','march','april','may','june','july','august','september','october','december',
  'januar','februar','marz','juni','juli','dezember','gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','dicembre',
  'января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const SUIT_MOIS = new RegExp(`^\\.?\\s*(?:${MOIS.join('|')})(?![${LET}])`);
const estDate = (norm, finNombre) => SUIT_MOIS.test(norm.slice(finNombre, finNombre + 20));

// Nombre de pièces d'ImmoCrans (3,5 pièces, relevé ImmoCrans du 05/11/2026) : `N.5 Zimmer|pièces|locali|rooms`.
const PIECES_IMMOCRANS = 3.5;
const PIECES = new RegExp(`${'(?<![a-zа-я0-9.,])'}(\\d)[.,]5\\s*-?\\s*(?:zimmer|pieces?|locali|rooms?|комнат)(?![a-z0-9])`, 'g');

// Forme « libellé : nombre » (tableaux ImmoCrans, fiches) : « Chambres : 2 », « Chambres 2 » (sans deux-points,
// seulement si le libellé commence le segment et que le nombre le termine). Libellés déjà pliés.
const LIBELLES = {
  chambres: 'chambres?|bedrooms?|schlafzimmer|camere(?: da letto)?|спальн\\w*',
  salles_eau: "salles? de bains?|salles? d'eau|bathrooms?|badezimmer|bagni|ванн\\w*|санузл\\w*",
  personnes: 'personnes|voyageurs|guests|people|capacite(?: totale)?|capacity|kapazitat|capacita|personen|persone|ospiti|вместимость|человек',
  balcons: 'balcons|balconies|balkone|balconi|балкон\\w*',
};
const NB_DIGITS = '\\d+';
const CACHE_LIB = {};
const PLAGE_LIB = (lib) => (CACHE_LIB[lib] ??= new RegExp(`(?<![${LET}])(?:${lib})\\s*(?:([:：])\\s*|\\s+)(?:(${NB_DIGITS})\\s*(?:a|à|-|–|to|bis|до)\\s*)?(${NB_DIGITS})(?![${LET}.,]\\d)`, 'g'));
const DEBUT_SEGMENT = /(?:^|[.\n|•;]\s*)$/;
const FIN_SEGMENT = /^\s*(?:$|[.\n|•;,])/;

// Types « nombre + mot-clé » (mots-clés déjà pliés : sans accents).
const TYPES = [
  { type: 'chambres', champ: 'chambres', kw: 'chambres?|bedrooms?|camere da letto|camere|camera da letto|schlafzimmer|zimmer|спальн(?:я|и|ей)|комнат(?:а|ы)|ch\\.' },
  { type: 'salles_eau', champ: 'salles_eau', kw: "salles? d'eau|salles? de bains?|bathrooms?|sdb|badezimmer|bäder|bad|bagni|bagno|ванн(?:ая|ые|ых)|санузл(?:а|ов)|санузел" },
  { type: 'personnes', champ: 'capacite', kw: 'personnes?|voyageurs?|guests?|people|persons?|couchages?|lits?|beds?|pers\\.|personen|gäste|betten|schlafplätze|persone|ospiti|posti\\s+letto|letti|человек|гост(?:ей|я)|мест(?:а|о)?|кроват(?:и|ей)' },
  { type: 'balcons', champ: 'balcons', kw: 'balcons?|balconies|balcony|balkone?|balkons?|balconi|balcone|балкон(?:а|ов|ы)?' },
  { type: 'surface', champ: 'surface_utile_m2', kw: 'm2|m²|metres carres|square meters|sqm|quadratmeter|qm|metri quadri|mq|кв\\. ?м|м²|квадратн' },
].map((t) => ({ ...t, lib: LIBELLES[t.type] ?? null, re: new RegExp(`${GARDE}(?:(${NB})\\s*(?:a|to|ou|or|oder|bis|o|до|или|-|–)\\s*)?(${NB})\\s*-?\\s*(?:${plier(t.kw)})(?![a-z0-9])`, 'g') }));

const RENOVATION = new RegExp(`(?<![${LET}])(?:renovees?|renoves?|renovations?|renoviert|renovierung|ristrutturat[oa]|ristrutturazione|renovated|отремонтирован\\w*|ремонт\\w*)\\D{0,25}?(?<![0-9])(20\\d\\d)(?![0-9])`, 'g');
const PRIX = [`chf\\s*(${NUM})`, `(${NUM})\\s*chf(?![a-z])`, `(${NUM})\\.[-–—]`, `(${NUM})\\s*(?:francs?|franken|franchi|франк(?:ов|а|и)?)(?![a-zа-я])`, 'fr\\.\\s*(' + NUM + ')']
  .map((p) => new RegExp(`(?<![a-z0-9.,'])${p}`, 'g'));
const ETAGE = /(?<![a-zа-я0-9])(\d)(?:er|e|eme|nd|rd|th|st|\.|°|º|-?[а-я]{1,2})?\s*(?:etage|floor|stockwerk|stock|og|piano|этаж)(?![a-z])/g;
const NEGATION = new RegExp(`(?<![${LET}])(?:(?:sans|pas de|aucun|aucune|no|without|not|non|kein|keine|keinen|keiner|keinem|ohne|nicht|senza|nessun|nessuna|nessuno|без|нет|нету|не)(?![${LET}])|pas d')`);

// Mot russe = radical (« бассейн » couvre « бассейна », « бассейном ») ; autres langues : mot entier.
const CACHE_MOT = new Map(); // matchAll clone l'expression : sans risque de partager
const motRe = (m) => {
  if (!CACHE_MOT.has(m)) CACHE_MOT.set(m, motReNeuf(m));
  return CACHE_MOT.get(m);
};
const motReNeuf = (m) => {
  const p = plier(m);
  const cyr = /[а-я]/.test(p);
  const fin = cyr ? '(?![a-z0-9])' : `(?:e?s)?(?![${LET}])`; // pluriel FR/EN/IT/DE : chiens, dogs, piscines, boxes
  return new RegExp(`(?<![${LET}])${esc(p).replace(/ /g, '\\s+')}${fin}`, 'g');
};

// Exceptions : ces tournures contiennent un mot de négation mais ne nient rien (« not only », « sans supplément »…).
const PAS_NEGATION = new RegExp(`(?<![${LET}])(?:not only|nicht nur|non solo|pas seulement|не только|без доплаты|без дополнительной платы|sans supplement|sans frais|sans surcout|sans oublier|sans compter|ohne aufpreis|senza supplemento|senza costi extra|without extra|without additional|no extra|no additional|no problem|no worries|pas de souci|pas de probleme|aucun probleme|kein problem|nessun problema|без проблем)(?![${LET}])`, 'g');
// Négation APRÈS le mot (fenêtre de 6 mots, même proposition) : « le garage n'est plus disponible ».
const NEGATION_APRES = new RegExp(`(?<![${LET}])(?:n'est\\s+(?:\\w+\\s+)?(?:plus|pas)(?!\\s+(?:payant|facture|un probleme))|ne\\s+(?:\\w+\\s+)?(?:fonctionne|marche|fonctionnent|marchent)\\s+(?:plus\\s+|pas)|n'existe\\s+(?:plus|pas)|are not|aren't|are no longer|sont plus|sont pas|sind nicht|non sono|no longer|not available|not included|not working|isn't|is not|unavailable|doesn't work|nicht verfugbar|nicht mehr|nicht vorhanden|nicht inklusive|funktioniert nicht|ist nicht|non disponibile|non e(?![${LET}])|non funziona|недоступ\\S*|больше нет|не работает|не доступ\\S*)`);
// Négation : l'un des mots de négation dans les 3 mots précédents, ou une négation dans les 6 mots suivants.
function nie(norm, debut, fin = debut) {
  const avant = norm.slice(Math.max(0, debut - 50), debut).replace(PAS_NEGATION, ' ').split(/[.,;:!?\n•]/).pop();
  if (NEGATION.test(avant.trim().split(/\s+/).slice(-3).join(' '))) return true;
  return NEGATION_APRES.test(fenetre(norm, fin, 1, 6).split(',')[0]);
}

// Fenêtre de n mots (même phrase) avant ou après une position.
function fenetre(norm, pos, sens, n = 6) {
  if (sens < 0) {
    const s = norm.slice(Math.max(0, pos - 80), pos).split(/[.!?\n;]/).pop();
    const t = [...s.matchAll(/[a-zа-я0-9']+/g)];
    return t.length > n ? s.slice(t[t.length - n].index) : s;
  }
  const s = norm.slice(pos, pos + 80).split(/[.!?\n;]/)[0];
  const t = [...s.matchAll(/[a-zа-я0-9']+/g)];
  return t.length > n ? s.slice(0, t[n - 1].index + t[n - 1][0].length) : s;
}

// --- Prix par période (actif seulement avec contexte.calendrier) ---------------------------
// Total de séjour : « 3'255 pour 7 nuits », « 3'255 / 7 nuits », « for 7 nights », « für 7 Nächte »… (nuit = total ÷ N).
const U_NUITS_N = 'nuits?|nuitees?|nights?|nachte?|notti|notte|ночей|ночи|ночь';
const TOTAL_COEUR = `\\s*(?:/|(?:pour|for|fur|per|pro|sur|durant|en|a|за|на)\\s)\\s*(\\d{1,3})\\s*(?:${U_NUITS_N})(?![${LET}])`;
const TOTAL_SUITE = `(?:\\s*(?:chf|francs?)\\b)?${TOTAL_COEUR.replace('(\\d{1,3})', '\\d{1,3}')}`;
const TOTAL_APRES = new RegExp(`^${TOTAL_COEUR}`);
// Prix avec unité mais sans devise : « 300/nuit », « 1'960 / semaine ».
const U_NUIT = 'nuitees?|nuit|night|nacht|notte|ночь|ночью|ночи';
const U_SEM = 'semaine|week|wk|p\\.w\\.?|hebdomadaire|hebdo|woche|settimana|неделя|неделю|недели';
const PRIX_UNITE = [new RegExp(`(?<![a-z0-9.,'])(${NUM})(?=\\s*(?:/|(?:par|pro|per|a|la|au|each|chaque|в|за)\\s)\\s*(?:${U_NUIT}|${U_SEM})(?![${LET}]))`, 'g'),
  new RegExp(`(?<![a-z0-9.,'])(${NUM})(?=${TOTAL_SUITE})`, 'g')];
const UNITE_APRES = new RegExp(`^[\\s/.\\-]*(?:par |la |per |pro |a |au |chaque |each |the |в |за )?\\s*(${U_NUIT}|${U_SEM})(?![${LET}])`);
const UNITE_SEM = new RegExp(`^(?:${U_SEM})$`);
function nuitsTotal(norm, fin) {
  const m = TOTAL_APRES.exec(norm.slice(fin, fin + 30));
  return m ? Number(m[1]) : null;
}
function uniteApres(norm, fin) {
  const m = UNITE_APRES.exec(norm.slice(fin, fin + 24));
  if (!m) return null;
  return UNITE_SEM.test(m[1]) ? 'semaine' : 'nuit';
}

const NOMS_MOIS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, october: 10, december: 12,
  januar: 1, februar: 2, marz: 3, juni: 6, juli: 7, oktober: 10, dezember: 12,
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, dicembre: 12,
  'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
  'январе': 1, 'феврале': 2, 'марте': 3, 'апреле': 4, 'мае': 5, 'июне': 6, 'июле': 7, 'августе': 8, 'сентябре': 9, 'октябре': 10, 'ноябре': 11, 'декабре': 12,
};
const MM = Object.keys(NOMS_MOIS).sort((a, b) => b.length - a.length).join('|');
const SEP = '(?:au|a|-|–|—|to|bis|al|по|until|till)';
const RE_PLAGE = new RegExp(`(?<![0-9])(\\d{1,2})\\.?(?:\\s*(${MM})(?![${LET}]))?\\s*${SEP}\\s*(\\d{1,2})\\.?\\s*(${MM})(?![${LET}])(?:\\s*(20\\d\\d))?`, 'g');
const RE_JOUR = new RegExp(`(?<![0-9])(\\d{1,2})\\.?\\s*(${MM})(?![${LET}])(?:\\s*(20\\d\\d))?`, 'g');
const RE_ISO = /(?<![0-9])(20\d\d)-(\d\d)-(\d\d)(?![0-9])/g;
const RE_MOIS_SEUL = new RegExp(`(?<![${LET}])(?:en|in|im|durant|pendant|during|a|ad|в|во)\\s+(${MM})(?![${LET}])(?:\\s*(20\\d\\d))?`, 'g');
const p2 = (n) => String(n).padStart(2, '0');
const anneeDe = (mois) => (mois >= 11 ? 2026 : 2027); // horizon 14/11/2026 → 26/11/2027
const iso = (a, mo, j) => `${a}-${p2(mo)}-${p2(j)}`;

// Expressions de dates du texte : { debut, fin, arrivee, depart|null } ou { mois: {debut, fin} } pour « en mai ».
function datesDuTexte(norm) {
  const res = []; const pris = [];
  const libre = (d, f) => !pris.some(([a, b]) => d < b && a < f);
  const poser = (m, o) => { pris.push([m.index, m.index + m[0].length]); res.push({ debut: m.index, fin: m.index + m[0].length, ...o }); };
  for (const m of norm.matchAll(RE_PLAGE)) {
    const m2 = NOMS_MOIS[m[4]]; const m1 = m[2] ? NOMS_MOIS[m[2]] : m2;
    const a2 = m[5] ? Number(m[5]) : anneeDe(m2); const a1 = m1 > m2 ? a2 - 1 : a2;
    const arrivee = iso(a1, m1, Number(m[1])); const depart = iso(a2, m2, Number(m[3]));
    if (valide(arrivee) && valide(depart) && depart > arrivee) poser(m, { arrivee, depart });
  }
  for (const m of norm.matchAll(RE_ISO)) {
    const d = iso(m[1], m[2], m[3]);
    if (valide(d) && libre(m.index, m.index + m[0].length)) poser(m, { arrivee: d, depart: null });
  }
  for (const m of norm.matchAll(RE_JOUR)) {
    const mo = NOMS_MOIS[m[2]]; const d = iso(m[3] ? Number(m[3]) : anneeDe(mo), mo, Number(m[1]));
    if (valide(d) && libre(m.index, m.index + m[0].length)) poser(m, { arrivee: d, depart: null });
  }
  for (const m of norm.matchAll(RE_MOIS_SEUL)) {
    const mo = NOMS_MOIS[m[1]]; const a = m[2] ? Number(m[2]) : anneeDe(mo);
    if (!libre(m.index, m.index + m[0].length)) continue;
    poser(m, { mois: { debut: iso(a, mo, 1), fin: mo === 12 ? iso(a + 1, 1, 1) : iso(a, mo + 1, 1) } });
  }
  return res;
}

// Périodes (ids) touchées par une expression de dates.
function periodesTouchees(expr, cal) {
  const ids = new Set();
  if (expr.mois) {
    for (const p of cal) if (p.debut < expr.mois.fin && expr.mois.debut < p.fin) ids.add(p.id);
  } else {
    const fin = expr.depart || null;
    let j = expr.arrivee;
    for (let i = 0; i < 400 && (fin ? j < fin : i < 1); i++) {
      const p = cal.find((x) => x.debut <= j && j < x.fin);
      if (p) ids.add(p.id);
      const [a, mo, d] = j.split('-').map(Number);
      j = new Date(Date.UTC(a, mo - 1, d + 1)).toISOString().slice(0, 10);
    }
  }
  return [...ids];
}

const NET_AVANT = /(?<![a-zа-я0-9])(?:net|netto|netto|нетто|чист\w*)(?![a-zа-я0-9])/;
const dateFr = (d) => d.split('-').reverse().join('/');
// Périodes citées par leur nom, sans date (FR, EN, DE, IT, RU) : seulement Mondiaux (le seul nom sans équivoque).
const ALIAS_PERIODES = [['mondiaux', /(?<![a-zа-я0-9])(?:mondiaux|world (?:ski )?championships?|weltmeisterschaft\w*|\bwm\b|mondiali|чемпионат\w* мира)(?![a-zа-я0-9])/]];

// Évalue un prix avec unité contre le calendrier. Retourne { statut, message, extra }.
function prixCalendrier(v, unite, debut, fin, dates, cal, contexte, fiche, admis, totalSejour = null, norm = '') {
  const nuit = unite === 'semaine' ? v / 7 : v;
  const base = { unite, nuit: Math.round(nuit * 100) / 100 };
  const estPlancher = Math.abs(nuit - 280) < 0.5;
  const plancherPublic = () => ({ statut: 'confirme', message: 'Confirmé : prix plancher public (CHF 1\'960 / semaine), pas un prix recommandé.', extra: { ...base, code: 'prix_plancher_public' } });
  // Période : dates les plus proches dans le texte, sinon contexte.periode.
  let ids = [];
  const proche = [...dates].sort((a, b) => Math.min(Math.abs(a.debut - fin), Math.abs(a.fin - debut)) - Math.min(Math.abs(b.debut - fin), Math.abs(b.fin - debut)))[0];
  if (proche) ids = periodesTouchees(proche, cal);
  if (!ids.length) { // nom de période cité sans date (« aux Mondiaux »)
    const alias = ALIAS_PERIODES.find(([id, re]) => cal.some((p) => p.id === id) && re.test(norm.slice(Math.max(0, debut - 60), fin + 60)));
    if (alias) ids = [alias[0]];
  }
  if (!ids.length && contexte.periode) ids = cal.some((p) => p.id === contexte.periode) ? [contexte.periode] : [];
  const cands = ids.map((id) => cal.find((p) => p.id === id));
  if (cands.length === 1) {
    const p = cands[0]; const nom = p.nom && p.nom.fr ? p.nom.fr : p.id;
    if (p.statut !== 'ok') return estPlancher ? plancherPublic() : { statut: 'precision', message: `${nom} : donnée insuffisante, aucune borne de prix.`, extra: { ...base, code: 'periode_insuffisante', periode: p.id, periodeNom: nom } };
    const dedans = nuit >= p.basse && nuit <= p.haute;
    if (estPlancher && !dedans) {
      const dateP = p.releveLe ? dateFr(p.releveLe) : null;
      return { statut: 'precision', message: `280 est le plancher public ; le marché de ${nom} est à ${p.basse} – ${p.haute}`, extra: { ...base, code: 'plancher_hors_bornes', periode: p.id, periodeNom: nom, basse: p.basse, haute: p.haute, date: dateP } };
    }
    const ex = { ...base, periode: p.id, periodeNom: nom, basse: p.basse, haute: p.haute, date: p.releveLe ? dateFr(p.releveLe) : null };
    return dedans
      ? { statut: 'confirme', message: `Confirmé : dans les bornes de ${nom} (${p.basse} – ${p.haute} CHF/nuit).`, extra: { ...ex, code: 'dans_bornes' } }
      : { statut: 'precision', message: `Hors bornes de ${nom} : ${p.basse} – ${p.haute} CHF/nuit (relevé du ${ex.date}).`, extra: { ...ex, code: 'hors_bornes' } };
  }
  if (estPlancher) return plancherPublic(); // sans période connue : le plancher public reste confirmé
  // Période inconnue ou ambiguë : dans les bornes d'au moins une des périodes candidates.
  const pool = (cands.length ? cands : cal).filter((p) => p.statut === 'ok');
  const dedans = pool.filter((p) => nuit >= p.basse && nuit <= p.haute);
  if (dedans.length) {
    const liste = dedans.map((p) => (p.nom && p.nom.fr) || p.id);
    return { statut: 'precision', message: `Dans les bornes de : ${liste.join(', ')}. Préciser les dates.`, extra: { ...base, code: 'dans_bornes_de', periodes: dedans.map((p) => p.id), liste: liste.join(', ') } };
  }
  if (admis.some((p) => Math.abs(p - v) < 0.5)) return { statut: 'confirme', message: 'Confirmé.', extra: base };
  return { statut: 'contredit', message: 'Prix hors fiche.', extra: { ...base, code: 'prix_hors_fiche' } };
}

export { PIECES_IMMOCRANS, MOTS_NOMBRES, NUM, plier };

export function verifier(texte, fiche, contexte = {}) {
  const norm = plier(texte);
  const c = fiche.champs;
  const candidats = [];
  // `code` : identifiant stable du message (l'interface le traduit ; `message` reste en FR).
  const ajouter = (debut, fin, type, valeur, attendu, statut, message, champ, extra = {}) =>
    candidats.push({ type, extrait: texte.slice(debut, fin), debut, fin, valeur, attendu, statut, message,
      code: statut === 'confirme' ? 'confirme' : 'fiche_dit',
      source: champ?.source ?? null, date: champ?.date ?? null, ...extra });
  const dit = (v) => `La fiche dit ${v}.`;

  // 0) « 3.5 Zimmer / pièces / locali / rooms » : nombre de pièces, pas de chambres
  for (const m of norm.matchAll(PIECES)) {
    const v = Number(`${m[1]}.5`);
    const ok = v === PIECES_IMMOCRANS;
    ajouter(m.index, m.index + m[0].length, 'pieces', v, PIECES_IMMOCRANS, ok ? 'confirme' : 'precision',
      ok ? 'Confirmé.' : 'La fiche dit 3,5 pièces (ImmoCrans).', c.chambres);
  }

  // Traitement commun d'un fait « nombre + mot-clé » ou « libellé : nombre ».
  function traiter(t, d, f, bas, hautTexte) {
    const v = t.type === 'surface' ? montant(hautTexte) : nombre(hautTexte); // « 1,000 m² » = 1000
    const champ = c[t.champ];
    const att = champ.valeur;
    if (t.type === 'personnes') {
      const jusqua = /(?:jusqu'a|up to|maximum|max|bis zu|bis|hochstens|maximal|fino a|massimo|до|максимум|не более)\s*$/.test(norm.slice(Math.max(0, d - 12), d));
      if (bas) { // plage « 4 à 5 »
        const haut = Math.max(v, nombre(bas));
        const ok = haut <= att;
        ajouter(d, f, t.type, `${bas} à ${hautTexte}`, att, ok ? 'precision' : 'contredit', dit(att), champ, ok ? { code: 'plage_contient' } : {});
      } else if (v > att) ajouter(d, f, t.type, v, att, 'contredit', dit(att), champ);
      else if (jusqua && v < att) ajouter(d, f, t.type, v, att, 'precision', dit(att), champ);
      else ajouter(d, f, t.type, v, att, 'confirme', 'Confirmé.', champ);
    } else if (t.type === 'surface') {
      const hab = c.surface_habitable_m2.valeur;
      if (Math.abs(v - hab) <= 0.05) ajouter(d, f, t.type, v, att, 'precision', 'Deux mesures : 74 m² utiles / 68 m² habitables.', c.surface_habitable_m2, { code: 'deux_mesures' });
      else if (fiche.surfaces_connues_m2.some((k) => Math.abs(k - v) <= 0.05)) ajouter(d, f, t.type, v, att, 'confirme', 'Confirmé.', champ);
      else ajouter(d, f, t.type, v, att, 'contredit', `${dit(`${att} m² (ou ${hab} m² habitables)`)}`, champ);
    } else ajouter(d, f, t.type, v, att, v === att ? 'confirme' : 'contredit', v === att ? 'Confirmé.' : dit(att), champ);
  }

  // 0 bis) « Pièces 3.5 » / « Pièces : 3,5 » (libellé en début de segment)
  for (const m of norm.matchAll(/(?<![a-zа-я0-9])(?:pieces?|zimmer|locali|rooms?|комнат\w*)\s*[:：]?\s*(\d)[.,]5(?![\d])/g)) {
    if (!(DEBUT_SEGMENT.test(norm.slice(0, m.index)) && FIN_SEGMENT.test(norm.slice(m.index + m[0].length)))) continue;
    const v = Number(`${m[1]}.5`); const ok = v === PIECES_IMMOCRANS;
    ajouter(m.index, m.index + m[0].length, 'pieces', v, PIECES_IMMOCRANS, ok ? 'confirme' : 'precision',
      ok ? 'Confirmé.' : 'La fiche dit 3,5 pièces (ImmoCrans).', c.chambres);
  }

  // 1) nombre + mot-clé
  for (const t of TYPES) {
    for (const m of norm.matchAll(t.re)) {
      if (ARTICLES.has(m[2])) continue;
      if (estDate(norm, m.index + m[0].length)) continue;
      traiter(t, m.index, m.index + m[0].length, m[1], m[2]);
    }
  }

  // 1 bis) « libellé : nombre »
  for (const t of TYPES) {
    if (!t.lib) continue;
    for (const m of norm.matchAll(PLAGE_LIB(t.lib))) {
      const d = m.index; const f = d + m[0].length;
      const colon = !!m[1];
      if (/\d\s*$/.test(norm.slice(0, d))) continue; // « 3 chambres : 2 doubles » : c'est « 3 chambres » qui compte
      if (!colon && !(DEBUT_SEGMENT.test(norm.slice(0, d)) && FIN_SEGMENT.test(norm.slice(f)))) continue;
      if (estDate(norm, f)) continue;
      traiter(t, d, f, m[2], m[3]);
    }
  }

  // 2) prix
  const admis = [...fiche.prix_admis_chf, ...(contexte.prixAdmis || [])];
  const cal = Array.isArray(contexte.calendrier) && contexte.calendrier.length ? contexte.calendrier : null;
  const motifs = cal ? PRIX.concat(PRIX_UNITE) : PRIX;
  const dates = cal ? datesDuTexte(norm) : [];
  for (const re of motifs) {
    for (const m of norm.matchAll(re)) {
      const v = montant(m[1]);
      const fin = m.index + m[0].length;
      if (cal && NET_AVANT.test(norm.slice(Math.max(0, m.index - 45), m.index).split(/[.;\n]/).pop())) { // « net hôte estimé : CHF 372 » : calcul, pas un prix public
        ajouter(m.index, fin, 'prix', v, null, 'precision', "Net hôte calculé d'après une commission en hypothèse, pas un prix public.", c.prix_semaine_public_chf, { code: 'net_calcule' });
        continue;
      }
      const nTot = cal ? nuitsTotal(norm, fin) : null; // total de séjour : nuit = total ÷ N
      const unite = cal ? (nTot ? 'nuit' : uniteApres(norm, fin)) : null;
      if (cal && unite) {
        const r = prixCalendrier(nTot ? v / nTot : v, unite, m.index, fin, dates, cal, contexte, fiche, admis, nTot ? v : null, norm);
        ajouter(m.index, fin, 'prix', v, null, r.statut, r.message, c.prix_semaine_public_chf, r.extra);
        continue;
      }
      const ok = admis.some((p) => Math.abs(p - v) < 0.5);
      ajouter(m.index, fin, 'prix', v, null, ok ? 'confirme' : 'contredit',
        ok ? 'Confirmé.' : 'Prix hors fiche.', c.prix_semaine_public_chf, ok ? {} : { code: 'prix_hors_fiche' });
    }
  }

  // 3) étage (source unique : un écart est une précision)
  for (const m of norm.matchAll(ETAGE)) {
    const v = Number(m[1]);
    ajouter(m.index, m.index + m[0].length, 'etage', v, c.etage.valeur, v === c.etage.valeur ? 'confirme' : 'precision',
      v === c.etage.valeur ? 'Confirmé.' : dit(c.etage.valeur), c.etage, v === c.etage.valeur ? {} : { code: 'source_unique' });
  }

  // 4) équipements annoncés / non annoncés
  const listes = [[fiche.equipements, true], [fiche.absents, false]];
  for (const [liste, present] of listes) {
    for (const eq of liste) {
      for (const mot of eq.mots) {
        for (const m of norm.matchAll(motRe(mot))) {
          const d = m.index;
          const nieE = nie(norm, d, d + m[0].length);
          let statut; let msg;
          if (present) { statut = nieE ? 'contredit' : 'confirme'; msg = nieE ? "La fiche l'annonce." : 'Confirmé.'; }
          else if (nieE) { statut = 'confirme'; msg = 'Confirmé : non annoncé, et le texte le nie.'; }
          else { statut = 'absent'; msg = 'Absent de la fiche : non annoncé sur le site ni ImmoCrans, à retirer ou à sourcer.'; }
          ajouter(d, d + m[0].length, 'equipement', eq.cle, present, statut, msg, eq, { cle: eq.cle, code: present ? (nieE ? 'fiche_dit' : 'confirme') : (nieE ? 'confirme' : 'non_annonce') });
        }
      }
    }
  }

  // 5) lieux
  for (const l of fiche.lieux) {
    for (const m of norm.matchAll(motRe(l.nom))) {
      ajouter(m.index, m.index + m[0].length, 'lieu', l.nom, null, 'confirme', l.note ? `Confirmé : ${l.note}.` : 'Confirmé.', null);
    }
  }

  // 5 bis) lieux autres que Crans-Montana : l'appartement n'y est pas
  for (const nom of fiche.lieux_autres || []) {
    for (const m of norm.matchAll(motRe(nom))) {
      ajouter(m.index, m.index + m[0].length, 'lieu', nom, 'Crans-Montana', 'contredit', "L'appartement est à Crans-Montana (commune de Lens).", null, { code: 'lieu_autre', cle: 'lieu_autre' });
    }
  }

  // 5 ter) rénovation : année après « rénové / renoviert / ristrutturato / renovated / rénovation… »
  for (const m of norm.matchAll(RENOVATION)) {
    const v = Number(m[1]); const att = c.renovation_annee.valeur;
    ajouter(m.index, m.index + m[0].length, 'renovation', v, att, v === att ? 'confirme' : 'contredit',
      v === att ? 'Confirmé.' : dit(`rénové en ${att}`), c.renovation_annee);
  }

  // 6) distances : « N min » rattaché au mot connu le plus proche (6 mots), sinon ignoré
  for (const m of norm.matchAll(new RegExp(`${GARDE}(\\d+)\\s*(?:min|minutes?|mn|minuten|minuti|мин(?:ут[а-я]*)?)(?![a-zа-я])`, 'g'))) {
    if (estDate(norm, m.index + m[0].length)) continue;
    const avant = fenetre(norm, m.index, -1);
    const apres = fenetre(norm, m.index + m[0].length, 1);
    let meilleur = null;
    for (const dist of fiche.distances) {
      for (const mot of dist.mots) {
        const re = motRe(mot);
        for (const x of avant.matchAll(re)) {
          const ecart = avant.length - (x.index + x[0].length);
          if (!meilleur || ecart < meilleur.ecart) meilleur = { dist, ecart };
        }
        for (const x of apres.matchAll(re)) if (!meilleur || x.index < meilleur.ecart) meilleur = { dist, ecart: x.index };
      }
    }
    if (!meilleur) continue;
    const v = Number(m[1]);
    const att = meilleur.dist.minutes;
    const loin = att === 0 ? v >= 10 : v > 2 * att; // écart > 2× : contredit ; sinon simple précision
    const vers = meilleur.dist.vers;
    const msg = `Le site dit : ${vers} à ${att === 0 ? 'en face' : `${att} min`}`;
    ajouter(m.index, m.index + m[0].length, 'distance', v, att, v === att ? 'confirme' : loin ? 'contredit' : 'precision',
      v === att ? 'Confirmé.' : msg, meilleur.dist, { cle: vers, ...(v === att ? {} : loin ? { code: 'distance_ecart' } : { code: 'site_dit_min' }) });
  }

  // Un passage = un fait : le plus long l'emporte, puis ordre d'apparition.
  candidats.sort((a, b) => (b.fin - b.debut) - (a.fin - a.debut) || a.debut - b.debut);
  const faits = [];
  for (const f of candidats) if (!faits.some((g) => f.debut < g.fin && g.debut < f.fin)) faits.push(f);
  faits.sort((a, b) => a.debut - b.debut);

  const compte = { confirme: 0, contredit: 0, absent: 0, precision: 0 };
  for (const f of faits) compte[f.statut]++;
  return { verdict: compte.contredit > 0 || compte.absent > 0 ? 'bloque' : 'ok', faits, compte };
}

/** Passe chaque texte réel de canaux.json au vérificateur ; ne garde que les faits non confirmés. */
export function controlerCanaux(canaux, fiche) {
  return canaux.map(({ canal, champ, texte, source, date }) => ({
    canal, champ, texte, source, date,
    faits: verifier(texte, fiche).faits.filter((f) => f.statut !== 'confirme'),
  }));
}
