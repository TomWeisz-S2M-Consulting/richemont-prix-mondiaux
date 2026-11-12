// Brouillon de réponse déterministe à l'invité. Tous les chiffres viennent de la fiche.
import { formatCourt } from './dates.js';

// 1960 -> « 1'960 » (format suisse).
const chf = (n) => `CHF ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;

/** Montants à ajouter au contexte du vérificateur pour ce brouillon (total, prix par nuit). */
export function prixAdmisPour(estimation, tarifs) {
  const prix = [];
  if (estimation && estimation.total != null) prix.push(estimation.total);
  for (const p of (tarifs && tarifs.tarifsHote && tarifs.tarifsHote.periodes) || []) prix.push(p.prixNuit);
  if (tarifs && tarifs.tarifsHote) prix.push(tarifs.tarifsHote.prixNuitDefaut);
  return prix;
}

// Dates longues pour DE / IT / RU (formatCourt de dates.js ne connaît que FR et EN).
const MOIS = {
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
function dateLongue(iso, langue) {
  const [an, mo, jo] = iso.split('-').map(Number);
  const mois = MOIS[langue][mo - 1];
  if (langue === 'de') return `${jo}. ${mois} ${an}`;
  if (langue === 'it') return `${jo} ${mois} ${an}`;
  return `${jo} ${mois} ${an} г.`;
}

export function brouillon(demande, estimation, fiche, tarifs, langue = 'fr') {
  const c = fiche.champs;
  const l = ['fr', 'en', 'de', 'it', 'ru'].includes(langue) ? langue : 'fr';
  const court = (iso) => (l === 'fr' || l === 'en' ? formatCourt(iso, l) : dateLongue(iso, l));
  const a = court(demande.arrivee);
  const d = court(demande.depart);
  const n = estimation.nuits;
  const v = demande.voyageurs;
  const minutes = fiche.distances[0].minutes;
  const prixPublic = chf(c.prix_semaine_public_chf.valeur);
  const total = estimation.total != null ? chf(estimation.total) : null;
  const immo = estimation.aiguillage === 'immocrans';
  const lien = tarifs.liens && tarifs.liens.immocrans;
  const [surf, ch, sde, couch] = [c.surface_utile_m2.valeur, c.chambres.valeur, c.salles_eau.valeur, c.couchages.valeur];

  // Un tableau par langue : formel (vous / Sie / Lei / Вы). Chaque texte reste vérifiable par verifier.js.
  const textes = {
    fr: {
      salutation: `Bonjour ${demande.prenom},`,
      dates: `merci pour votre demande du ${a} au ${d} (${n} nuits)`,
      voyageurs: `pour ${v} personnes.`,
      prix: total
        ? `Pour ces dates : ${total} (tarif de l'hôte, exemple), charges, linge, internet et garage compris.`
        : `Le prix public est de ${prixPublic} par semaine (ImmoCrans) ; je vous confirme le tarif exact pour vos dates dans l'heure.`,
      inclus: `L'appartement : ${surf} m², ${ch} chambres, ${sde} salles d'eau, ${couch} couchages, garage fermé au parking du Mérignou, la Coop en face, la télécabine Cry d'Er à ${minutes} min.`,
      prochaine_etape: immo
        ? `Pour ${n} nuits et plus, la réservation passe par ImmoCrans : ${lien}.`
        : 'Répondez à ce message pour confirmer, je vous envoie ensuite les modalités.',
      signature: "L'hôte de Richemont 3B",
    },
    en: {
      salutation: `Hello ${demande.prenom},`,
      dates: `thank you for your enquiry from ${a} to ${d} (${n} nights)`,
      voyageurs: `for ${v} guests.`,
      prix: total
        ? `For these dates: ${total} (host rate, example), charges, linen, internet and garage included.`
        : `The public price is ${prixPublic} per week (ImmoCrans); I will confirm the exact rate for your dates within the hour.`,
      inclus: `The apartment: ${surf} m2, ${ch} bedrooms, ${sde} bathrooms, ${couch} beds, a closed garage box at the Mérignou car park, the Coop opposite, the Cry d'Er gondola ${minutes} min away.`,
      prochaine_etape: immo
        ? `For ${n} nights or more, booking goes through ImmoCrans: ${lien}.`
        : 'Reply to this message to confirm and I will send you the details.',
      signature: 'The host of Richemont 3B',
    },
    de: {
      salutation: `Guten Tag ${demande.prenom},`,
      dates: `vielen Dank für Ihre Anfrage vom ${a} bis ${d} (${n} Nächte)`,
      voyageurs: `für ${v} Personen.`,
      prix: total
        ? `Für diese Daten: ${total} (Tarif des Gastgebers, Beispiel), Nebenkosten, Bettwäsche, Internet und Garage inklusive.`
        : `Der öffentliche Preis beträgt ${prixPublic} pro Woche (ImmoCrans); den genauen Tarif für Ihre Daten bestätige ich Ihnen innerhalb einer Stunde.`,
      inclus: `Die Wohnung: ${surf} m², ${ch} Schlafzimmer, ${sde} Badezimmer, ${couch} Schlafplätze, geschlossene Garage (Box) auf dem Parkplatz Mérignou, die Coop gegenüber, die Gondel Cry d'Er ist ${minutes} Min. entfernt.`,
      prochaine_etape: immo
        ? `Ab ${n} Nächten läuft die Buchung über ImmoCrans: ${lien}.`
        : 'Antworten Sie auf diese Nachricht, um zu bestätigen; ich sende Ihnen anschliessend die Bedingungen.',
      signature: 'Der Gastgeber von Richemont 3B',
    },
    it: {
      salutation: `Buongiorno ${demande.prenom},`,
      dates: `grazie per la Sua richiesta dal ${a} al ${d} (${n} notti)`,
      voyageurs: `per ${v} persone.`,
      prix: total
        ? `Per queste date: ${total} (tariffa dell'host, esempio), spese, biancheria, internet e garage inclusi.`
        : `Il prezzo pubblico è di ${prixPublic} a settimana (ImmoCrans); Le confermo la tariffa esatta per le Sue date entro un'ora.`,
      inclus: `L'appartamento: ${surf} m², ${ch} camere da letto, ${sde} bagni, ${couch} posti letto, garage chiuso (box) al parcheggio del Mérignou, la Coop di fronte, la cabinovia Cry d'Er a ${minutes} min.`,
      prochaine_etape: immo
        ? `Da ${n} notti in su la prenotazione passa da ImmoCrans: ${lien}.`
        : 'Risponda a questo messaggio per confermare; Le invierò poi le modalità.',
      signature: "L'host di Richemont 3B",
    },
    ru: {
      salutation: `Здравствуйте, ${demande.prenom}!`,
      dates: `Благодарим Вас за запрос на период с ${a} по ${d} (ночей: ${n})`,
      voyageurs: `для ${v} человек.`,
      prix: total
        ? `На эти даты: ${total} (тариф хозяина, пример), коммунальные расходы, бельё, интернет и гараж включены.`
        : `Публичная цена составляет ${prixPublic} в неделю (ImmoCrans); точный тариф на Ваши даты я подтвержу в течение часа.`,
      inclus: `Апартаменты: ${surf} м², ${ch} спальни, ${sde} ванные комнаты, ${couch} мест для сна, закрытый гараж на парковке Mérignou, Coop напротив, до гондолы Cry d'Er — ${minutes} мин.`,
      prochaine_etape: immo
        ? `При проживании от ${n} ночей бронирование оформляется через ImmoCrans: ${lien}.`
        : 'Ответьте на это сообщение для подтверждения, после чего я пришлю Вам условия.',
      signature: 'Хозяин Richemont 3B',
    },
  };
  const champs = textes[l];
  const texte = `${champs.salutation} ${champs.dates} ${champs.voyageurs}\n\n${champs.prix}\n\n${champs.inclus}\n\n${champs.prochaine_etape}\n\n${champs.signature}`;
  return { champs, texte };
}
