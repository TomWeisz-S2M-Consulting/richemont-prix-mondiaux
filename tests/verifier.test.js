import test from 'node:test';
import assert from 'node:assert/strict';
import { verifier, controlerCanaux } from '../prototype/lib/verifier.js';
import { brouillon, prixAdmisPour } from '../prototype/lib/reponse.js';
import { estimer } from '../prototype/lib/tarifs.js';
import { fiche, canaux, brouillons, tarifsPublic, tarifsAvecHote } from './aide.js';

// « personnes » et « capacite » sont le même type (la capacité 4 à 5 peut porter l'un ou l'autre nom).
const norm = (t) => (t === 'personnes' ? 'capacite' : t);
const nonConfirmes = (r) => r.faits.filter((f) => f.statut !== 'confirme');
const a = (texte) => verifier(texte, fiche);
const resume = (r) => nonConfirmes(r).map((f) => `${f.cle || f.type}:${f.statut}`);
// Le fait attendu par un piège : type (ou clé d'équipement) + statut.
const trouve = (r, att) => r.faits.some((f) => (norm(f.type) === norm(att.type) || f.cle === att.type) && f.statut === att.statut);

const parOrigine = (o) => brouillons.filter((b) => b.origine === o);
const oks = parOrigine('redige');
const pieges = parOrigine('piege');
const llm = parOrigine('llm-brut');

test('brouillons ok-* : verdict ok, 0 contredit, 0 absent', () => {
  for (const b of oks) {
    const r = a(b.texte);
    assert.equal(r.verdict, 'ok', `${b.id} devrait passer, faits non confirmés : ${resume(r).join(', ')}`);
    assert.equal(r.compte.contredit + r.compte.absent, 0, `${b.id} : aucun contredit ni absent`);
  }
});

test('brouillons piege-* : bloqués avec le fait attendu', () => {
  for (const b of pieges) {
    const r = a(b.texte);
    assert.equal(r.verdict, 'bloque', `${b.id} devrait être bloqué`);
    for (const att of b.attendu.faits) assert.ok(trouve(r, att), `${b.id} : fait attendu ${att.type}/${att.statut} introuvable, obtenu ${resume(r).join(', ')}`);
  }
});

test('textes réels de canaux.json : faits non confirmés = ecarts_attendus exacts', () => {
  const controles = controlerCanaux(canaux, fiche);
  assert.equal(controles.length, canaux.length);
  controles.forEach((c, i) => {
    const obtenu = c.faits.map((f) => `${norm(f.type)}:${f.statut}`).sort();
    const attendu = canaux[i].ecarts_attendus.map((e) => `${norm(e.type)}:${e.statut}`).sort();
    assert.deepEqual(obtenu, attendu, `${c.canal}/${c.champ} « ${c.texte} » : écarts inattendus`);
    assert.equal(c.faits.filter((f) => f.statut === 'absent' || f.statut === 'contredit').length, attendu.filter((x) => /contredit|absent/.test(x)).length);
  });
});

test('formats de nombres, de surface et de nombres en lettres', () => {
  for (const t of ["CHF 1'960", 'CHF 1 960', 'CHF 1,960', '1960 CHF', '280.-/nuit', 'two bedrooms', 'a 2-bedroom flat', 'deux chambres', '74 m2', '74m²', '74 mètres carrés', '5 persons']) {
    const r = a(t);
    assert.ok(r.faits.length >= 1 && r.verdict === 'ok', `« ${t} » devrait être un fait confirmé, obtenu ${JSON.stringify(r.compte)}`);
  }
  assert.equal(a('three bedrooms').verdict, 'bloque');
  assert.equal(a('une chambre double').faits.length, 0, '« une » est un article, pas un fait');
});

test('ce qui n\'est jamais un fait', () => {
  const r = a('Arrivée le 19 décembre 2026 dès 16 h, code postal 3963, joignable 24 h/24, à 12 min de la gare, 4 pm.');
  assert.equal(r.faits.length, 0, `faits inattendus : ${r.faits.map((f) => f.extrait)}`);
});

test('lieux : « Lens » confirmé, « Lenslet » ignoré', () => {
  assert.equal(a('à Lens').faits[0].statut, 'confirme');
  assert.equal(a('à Lens').faits[0].message, 'Confirmé : commune.');
  assert.equal(a('le Lenslet').faits.length, 0);
});

test('négation : sans piscine ok, pas de garage contredit, positions dans le texte d\'origine', () => {
  assert.equal(a('Appartement sans piscine').verdict, 'ok');
  assert.equal(a('Appartement avec piscine').verdict, 'bloque');
  const r = a('Il n’y a pas de garage.');
  assert.equal(r.verdict, 'bloque');
  const f = r.faits.find((x) => x.cle === 'garage');
  assert.equal(f.statut, 'contredit');
  assert.equal(f.extrait, 'garage');
  const t = 'Appartement de 74 m² à Crans-Montana — Ï Éé ; 3 chambres';
  const g = a(t).faits.find((x) => x.type === 'chambres');
  assert.equal(t.slice(g.debut, g.fin), '3 chambres', 'les positions pointent dans le texte d\'origine');
});

test('plages et « jusqu\'à » de capacité', () => {
  assert.equal(a('4 à 5 personnes').faits[0].statut, 'precision');
  assert.equal(a('4 to 5 guests').faits[0].statut, 'precision');
  assert.equal(a('jusqu\'à 5 personnes').faits[0].statut, 'confirme');
  assert.equal(a('up to 6 guests').faits[0].statut, 'contredit');
  assert.equal(a('4-6 personnes').faits[0].statut, 'contredit');
  assert.equal(a('vous serez 2 voyageurs').faits[0].statut, 'confirme', 'un nombre de voyageurs <= capacité n\'est pas un écart');
});

test('brouillon déterministe FR et EN, avec et sans tarifs de l\'hôte : verdict ok', () => {
  const demande = { prenom: 'Camille', arrivee: '2026-12-19', depart: '2026-12-26', voyageurs: 4 };
  const courte = { ...demande, depart: '2026-12-22' };
  for (const tarifs of [tarifsPublic, tarifsAvecHote]) {
    for (const d of [demande, courte]) {
      for (const langue of ['fr', 'en']) {
        const est = estimer(d, tarifs, fiche, { aujourdhui: '2026-11-05' });
        const { champs, texte } = brouillon(d, est, fiche, tarifs, langue);
        assert.ok(champs.signature && champs.inclus && champs.prix);
        const r = verifier(texte, fiche, { prixAdmis: prixAdmisPour(est, tarifs) });
        assert.equal(r.verdict, 'ok', `${langue}${tarifs.tarifsHote ? ' avec' : ' sans'} tarifs hôte, ${est.nuits} nuits : ${resume(r).join(', ')}\n${texte}`);
      }
    }
  }
});

test('10 000 caractères en moins de 100 ms', () => {
  const texte = oks.map((b) => b.texte).join(' ').repeat(10).slice(0, 10000);
  assert.equal(texte.length, 10000);
  verifier(texte, fiche); // chauffe
  // meilleur de 3 passages : la machine peut être chargée (fichiers de test en parallèle)
  let ms = Infinity;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); verifier(texte, fiche); ms = Math.min(ms, performance.now() - t0); }
  assert.ok(ms < 100, `trop lent : ${ms.toFixed(1)} ms pour 10 000 caractères`);
});

test('fiche.json : chaque champ a une source et une date', () => {
  for (const [nom, ch] of Object.entries(fiche.champs)) {
    assert.ok(ch.source && ch.date, `le champ « ${nom} » n'a pas de source ou de date`);
  }
});

// --- DE / IT / RU --------------------------------------------------------------------
const OK_LANGUES = {
  de: [
    'Guten Tag, vielen Dank für Ihre Anfrage vom 19. bis 26. Dezember 2026. Die Wohnung wurde 2026 vollständig renoviert. Die Anreise ist ab 16 Uhr möglich.',
    "Unsere Adresse: Rue du Pas-de-l'Ours 3B, 3963 Crans-Montana. Wir sind täglich von 8 bis 20 Uhr erreichbar.",
    'Die Wohnung hat 2 Schlafzimmer und 2 Badezimmer und bietet Platz für bis zu 5 Personen. Die Gondel ist 4 Min. entfernt.',
    "Der öffentliche Preis beträgt CHF 1'960 pro Woche (280.-/Nacht), Nebenkosten, Bettwäsche, Internet und Garage inklusive. Wir sind 24 Stunden erreichbar.",
    'Ankunft am 2. Januar 2027, Abreise am 9. Januar 2027. Wohnung 74 m², 1. Stock, mit Terrasse und Garten. Zum Golf sind es 7 Min.',
  ],
  it: [
    "Buongiorno, grazie per la Sua richiesta dal 19 al 26 dicembre 2026. L'appartamento è stato interamente ristrutturato nel 2026. L'arrivo è possibile dalle 16.",
    "Il nostro indirizzo: Rue du Pas-de-l'Ours 3B, 3963 Crans-Montana. Siamo raggiungibili ogni giorno dalle 8 alle 20.",
    "L'appartamento ha 2 camere da letto e 2 bagni e ospita fino a 5 persone. La cabinovia è a 4 min.",
    "Il prezzo pubblico è di CHF 1'960 a settimana (280.-/notte), spese, biancheria, internet e garage inclusi. Siamo raggiungibili 24 ore su 24.",
    "Arrivo il 2 gennaio 2027, partenza il 9 gennaio 2027. Appartamento di 74 mq al 1° piano, con terrazza e giardino. Il golf è a 7 min a piedi.",
  ],
  ru: [
    'Здравствуйте! Благодарим Вас за запрос на период с 19 по 26 декабря 2026 года. Квартира полностью отремонтирована в 2026 году. Заезд возможен после 16:00.',
    "Наш адрес: Rue du Pas-de-l'Ours 3B, 3963 Crans-Montana. Мы на связи ежедневно с 8 до 20 часов.",
    'В квартире 2 спальни и 2 ванные комнаты, она рассчитана до 5 человек. До гондолы 4 мин.',
    "Публичная цена составляет CHF 1'960 в неделю (280.-/ночь), коммунальные расходы, бельё, интернет и гараж включены. Мы на связи 24 часа в сутки.",
    'Заезд 2 января 2027 года, отъезд 9 января 2027 года. Квартира 74 м², 1 этаж, с террасой и садом. До гольф-клуба 7 мин пешком.',
  ],
};
// 3 pièges par langue : [texte, type attendu, statut attendu]
const PIEGES_LANGUES = {
  de: [['Die Wohnung hat 3 Schlafzimmer.', 'chambres', 'contredit'], ['Die Wohnung ist mit Pool.', 'piscine', 'absent'], ['Die Wohnung hat 80 qm.', 'surface', 'contredit']],
  it: [["L'appartamento ha tre camere.", 'chambres', 'contredit'], ["L'appartamento è con piscina.", 'piscine', 'absent'], ["Il prezzo è CHF 1'800 a settimana.", 'prix', 'contredit']],
  ru: [['В квартире 3 спальни.', 'chambres', 'contredit'], ['Квартира с бассейном.', 'piscine', 'absent'], ['Квартира рассчитана на 6 человек.', 'personnes', 'contredit']],
};

test('DE / IT / RU : 5 phrases correctes par langue (nombres non factuels) → verdict ok', () => {
  for (const [l, phrases] of Object.entries(OK_LANGUES)) {
    assert.equal(phrases.length, 5);
    for (const p of phrases) {
      const r = a(p);
      assert.equal(r.verdict, 'ok', `${l} : « ${p} » → ${resume(r).join(', ')}`);
      assert.equal(r.compte.contredit + r.compte.absent, 0);
    }
  }
});

test('DE / IT / RU : 3 pièges par langue bloqués avec le bon type', () => {
  for (const [l, pieges3] of Object.entries(PIEGES_LANGUES)) {
    for (const [texte, type, statut] of pieges3) {
      const r = a(texte);
      assert.equal(r.verdict, 'bloque', `${l} : « ${texte} » devrait être bloqué`);
      assert.ok(trouve(r, { type, statut }), `${l} : « ${texte} » : ${type}/${statut} attendu, obtenu ${JSON.stringify(r.faits.map((f) => [f.type, f.cle, f.statut]))}`);
    }
  }
  // Les pièges du cahier des charges, mot pour mot
  for (const t of ['3 Schlafzimmer', 'mit Pool', '80 qm', 'tre camere', 'con piscina', "CHF 1'800", '3 спальни', 'с бассейном', '6 человек']) assert.equal(a(t).verdict, 'bloque', t);
});

test('négations DE / IT / RU : ohne Pool, senza piscina, без бассейна → ok ; kein Garage → contredit', () => {
  for (const t of ['Die Wohnung ist ohne Pool.', "L'appartamento è senza piscina.", 'Квартира без бассейна.', 'ohne Pool', 'senza piscina', 'без бассейна']) {
    assert.equal(a(t).verdict, 'ok', t);
    assert.ok(a(t).faits.every((f) => f.statut === 'confirme'), t);
  }
  for (const t of ['kein Garage', 'Es gibt keine Garage.', 'non ha garage', 'нет гаража', 'У нас нет гаража.']) {
    const r = a(t);
    assert.equal(r.verdict, 'bloque', t);
    assert.ok(r.faits.some((f) => f.cle === 'garage' && f.statut === 'contredit'), t);
  }
  // « не » dans un mot ne nie rien (« окне ») ; « sans » ne passe pas la 3e proposition
  assert.equal(a('В окне бассейн').verdict, 'bloque');
});

test('équipements annoncés en DE / IT / RU : confirmés', () => {
  for (const t of ['Garage', 'Parkplatz', 'WLAN', 'Waschmaschine und Trockner', 'Geschirrspüler', 'Dampfgarer', 'Fernseher', 'Dreifachverglasung', 'Bettwäsche', 'Ausziehbett', 'Dusch-WC', 'Garten',
    'lavatrice e asciugatrice', 'lavastoviglie', 'forno a vapore', 'microonde', 'televisore', 'balcone', 'triplo vetro', 'biancheria', 'letto estraibile', 'giardino',
    'гараж', 'интернет', 'стиральная машина', 'сушильная машина', 'посудомоечная машина', 'пароварка', 'телевизор', 'балкон', 'тройное остекление', 'бельё', 'выдвижная кровать', 'сад']) {
    const r = a(t);
    assert.ok(r.faits.length >= 1 && r.verdict === 'ok', `« ${t} » devrait être confirmé : ${JSON.stringify(r.compte)}`);
  }
  for (const t of ['Sauna', 'Whirlpool', 'Kamin', 'Klimaanlage', 'Haustiere', 'Ski-in', 'sauna', 'idromassaggio', 'camino', 'aria condizionata', 'animali', 'сауна', 'джакузи', 'камин', 'кондиционер', 'питомцы']) {
    assert.equal(a(t).verdict, 'bloque', `« ${t} » non annoncé : doit bloquer`);
  }
});

test('nombres en lettres DE / IT / RU, surface, étage, distance, prix, lieux', () => {
  assert.equal(a('drei Schlafzimmer').verdict, 'bloque');
  assert.equal(a('zwei Schlafzimmer').verdict, 'ok');
  assert.equal(a('eine Schlafzimmer').faits.length, 0, '« eine » est un article');
  assert.equal(a('due camere').verdict, 'ok');
  assert.equal(a('quattro camere').verdict, 'bloque');
  assert.equal(a('две спальни').verdict, 'ok');
  assert.equal(a('четыре спальни').verdict, 'bloque');
  assert.equal(a('шесть человек').verdict, 'bloque');
  assert.equal(a('fünf Personen').verdict, 'ok');
  assert.equal(a('sechs Gäste').verdict, 'bloque');
  assert.equal(a('74 Quadratmeter').verdict, 'ok');
  assert.equal(a('74 metri quadri').verdict, 'ok');
  assert.equal(a('74 кв. м').verdict, 'ok');
  assert.equal(a('68 qm').faits[0].statut, 'precision');
  assert.equal(a('2. Stock').faits[0].statut, 'precision');
  assert.equal(a('1. OG').faits[0].statut, 'confirme');
  assert.equal(a('al 1° piano').faits[0].statut, 'confirme');
  assert.equal(a('на 1 этаже').faits[0].statut, 'confirme');
  assert.equal(a('Die Gondel ist 4 Minuten entfernt').faits.find((f) => f.type === 'distance').statut, 'confirme');
  assert.equal(a('Die Gondel ist 8 Minuten entfernt').faits.find((f) => f.type === 'distance').statut, 'precision');
  assert.equal(a('cabinovia a 8 minuti').faits.find((f) => f.type === 'distance').statut, 'precision');
  assert.equal(a('до подъёмника 4 минуты').faits.find((f) => f.type === 'distance').statut, 'confirme');
  assert.equal(a('до подъёмника 8 минут').faits.find((f) => f.type === 'distance').statut, 'precision'); // limite : 2× exactement
  assert.equal(a('до подъёмника 9 минут').faits.find((f) => f.type === 'distance').statut, 'contredit'); // > 2× la valeur du site
  assert.equal(a('1960 Franken').verdict, 'ok');
  assert.equal(a('1960 franchi').verdict, 'ok');
  assert.equal(a('1960 франков').verdict, 'ok');
  assert.equal(a('Fr. 1\'960').verdict, 'ok');
  assert.equal(a('2000 Franken').verdict, 'bloque');
  assert.equal(a('2000 франков').verdict, 'bloque');
  for (const t of ['Кран-Монтана', 'в Ленсе', 'Вале']) assert.equal(a(t).faits[0].statut, 'confirme', t);
});

test('pièces : « 3.5 Zimmer / pièces / locali / rooms » = pieces (3.5 confirmé, autre = précision)', () => {
  for (const t of ['3.5 Zimmer', '3,5 pièces', '3.5 locali', '3.5 rooms']) {
    const r = a(t);
    assert.equal(r.faits.length, 1, t);
    assert.equal(r.faits[0].type, 'pieces');
    assert.equal(r.faits[0].statut, 'confirme');
  }
  const r = a('4.5 Zimmer');
  assert.equal(r.faits[0].type, 'pieces');
  assert.equal(r.faits[0].statut, 'precision');
  assert.equal(r.verdict, 'ok');
  assert.equal(a('4 Zimmer').verdict, 'bloque', '« 4 Zimmer » = 4 chambres selon le cahier des charges');
});

test('dates, années, heures, codes postaux en DE / IT / RU : jamais un fait', () => {
  const r = a('19. Dezember 2026, 3963, 16 Uhr, 24 Stunden; 5 gennaio 2027, ore 16, 31 dicembre; 7 января 2027, 24 декабря, 3963, в 16:00.');
  assert.equal(r.faits.length, 0, `faits inattendus : ${r.faits.map((f) => f.extrait)}`);
});

test('chaque fait a un `code` ; messages restent en FR', () => {
  const codes = (t) => a(t).faits.map((f) => f.code);
  assert.deepEqual(codes('2 chambres'), ['confirme']);
  assert.deepEqual(codes('3 chambres'), ['fiche_dit']);
  assert.deepEqual(codes('68 m²'), ['deux_mesures']);
  assert.deepEqual(codes("CHF 1'800"), ['prix_hors_fiche']);
  assert.deepEqual(codes('4 à 5 personnes'), ['plage_contient']);
  assert.deepEqual(codes('2e étage'), ['source_unique']);
  assert.deepEqual(codes('télécabine à 8 min'), ['site_dit_min']);
  assert.deepEqual(codes('avec piscine'), ['non_annonce']);
  assert.deepEqual(codes('pas de garage'), ['fiche_dit']);
  assert.equal(a('mit Pool').faits[0].message.startsWith('Absent de la fiche'), true);
  for (const t of ['2 Schlafzimmer, 4 Min. Gondel, mit Pool, 80 qm, 3.5 Zimmer, 1. Stock']) {
    for (const f of a(t).faits) assert.ok(['confirme', 'fiche_dit', 'non_annonce', 'deux_mesures', 'site_dit_min', 'prix_hors_fiche', 'plage_contient', 'source_unique'].includes(f.code), `${f.type} : code ${f.code}`);
  }
});

test('10 000 caractères en 5 langues < 100 ms', () => {
  const texte = [...Object.values(OK_LANGUES).flat(), ...oks.map((b) => b.texte)].join(' ').repeat(40).slice(0, 10000);
  verifier(texte, fiche);
  let ms = Infinity;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); verifier(texte, fiche); ms = Math.min(ms, performance.now() - t0); }
  assert.ok(ms < 100, `trop lent : ${ms.toFixed(1)} ms`);
});

// --- Bilan imprimé en fin de fichier ---------------------------------------------------
test('bilan : pièges bloqués, faux blocages, brouillons LLM bruts', () => {
  const bloques = pieges.filter((b) => a(b.texte).verdict === 'bloque').length;
  const faux = oks.filter((b) => a(b.texte).verdict === 'bloque').length;
  const llmBloques = llm.filter((b) => a(b.texte).verdict === 'bloque').length;
  for (const b of llm) {
    const r = a(b.texte);
    const liste = nonConfirmes(r).map((f) => `(${f.cle || f.type}, « ${f.extrait} », ${f.statut})`);
    console.log(`  ${b.id} verdict ${r.verdict} : ${liste.length ? liste.join(' ') : 'aucun fait non confirmé'}`);
  }
  console.log(`pièges bloqués : ${bloques}/${pieges.length} · faux blocages : ${faux}/${oks.length} · brouillons LLM bruts bloqués : ${llmBloques}/${llm.length}`);
  assert.equal(bloques, 10, 'tous les pièges doivent être bloqués');
  assert.equal(faux, 0, 'aucun brouillon correct ne doit être bloqué');
});

test('bilan des langues : phrases correctes passées, pièges bloqués', () => {
  const phrases = Object.values(OK_LANGUES).flat();
  const bonnes = phrases.filter((p) => a(p).verdict === 'ok').length;
  const pieges9 = Object.values(PIEGES_LANGUES).flat();
  const bloques = pieges9.filter(([t]) => a(t).verdict === 'bloque').length;
  console.log(`DE/IT/RU : phrases correctes passées : ${bonnes}/${phrases.length} · pièges bloqués : ${bloques}/${pieges9.length}`);
  assert.equal(bonnes, phrases.length);
  assert.equal(bloques, pieges9.length);
});
