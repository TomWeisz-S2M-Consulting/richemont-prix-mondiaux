import test from 'node:test';
import assert from 'node:assert/strict';
import { quartile, arrondi5, filtrer, bornes, calendrier, periodeDe, couvertureOk, prixSejour,
  tarifsHoteDepuisCalendrier, canal, netHote, propositionImmoCrans, deuxLignes } from '../prototype/lib/prix.js';
import { plage } from '../prototype/lib/dates.js';
import { comparables, periodes, hypotheses, cal } from './aide.js';

const par = (id) => cal.find((p) => p.id === id);

test('quartiles type 7 à la main sur [455,451,467,480,465,500,520]', () => {
  const xs = [455, 451, 467, 480, 465, 500, 520]; // trié : 451 455 465 467 480 500 520
  assert.equal(quartile(xs, 0.25), 460, 'h = 1,5 -> (455+465)/2');
  assert.equal(quartile(xs, 0.5), 467, 'h = 3');
  assert.equal(quartile(xs, 0.75), 490, 'h = 4,5 -> (480+500)/2');
  assert.deepEqual(xs, [455, 451, 467, 480, 465, 500, 520], 'entrée non modifiée');
  assert.equal(quartile([10, 20], 0.5), 15);
  assert.equal(quartile([], 0.5), null);
});

test('arrondi au CHF 5, moitié vers le haut', () => {
  assert.equal(arrondi5(462.4), 460);
  assert.equal(arrondi5(462.5), 465);
  assert.equal(arrondi5(467), 465);
  assert.equal(arrondi5(447.5), 450);
});

test('filtre : 2 chambres, fenêtre, motifs écrits', () => {
  const { retenues, exclues } = filtrer(comparables, 'P4');
  assert.equal(retenues.length, 7);
  for (const r of retenues) {
    assert.ok(r.url && r.titre && r.total > 0 && r.nuits === 7);
    assert.ok(Math.abs(r.nuit - r.total / 7) < 1e-9);
    // 'non vérifié' sans champ frais ; sinon l'objet relevé (6 annonces ont un détail de frais)
    if (r.fraisInclus !== 'non vérifié') assert.equal(typeof r.fraisInclus.total_detail_chf, 'number');
  }
  assert.equal(retenues.filter((r) => r.fraisInclus !== 'non vérifié').length, 3, '3 annonces des Mondiaux ont un détail de frais');
  assert.equal(retenues.filter((r) => r.fraisInclus === 'non vérifié').length, 4);
  // Mondiaux : les 2 annonces absentes au 2e passage (897484, 853237) ont 3 et 1 chambres : exclues par le filtre, pas retenues
  assert.equal(retenues.filter((r) => r.capturePartielle === true).length, 0);
  assert.deepEqual(exclues.filter((e) => ['airbnb-897484', 'airbnb-853237'].includes(e.annonceId)).map((e) => e.motif), ['chambres ≠ 2', 'chambres ≠ 2']);
  // ailleurs, une annonce partielle à 2 chambres reste retenue et marquée (P2 : airbnb-169880)
  const p2 = filtrer(comparables, 'P2').retenues.find((r) => r.annonceId === 'airbnb-169880');
  assert.equal(p2.capturePartielle, true);
  assert.match(p2.sha256, /^[0-9a-f]{64}$/);
  assert.equal(retenues.filter((r) => r.avis === 0).length, 3, '3 annonces sans avis');
  const motifs = new Set(exclues.map((e) => e.motif));
  for (const m of motifs) assert.ok(['chambres ≠ 2', 'pas de prix pour cette fenêtre', 'source ImmoCrans = prix catalogue'].includes(m), m);
  assert.ok(motifs.has('source ImmoCrans = prix catalogue'));
  assert.equal(retenues.length + exclues.length, comparables.annonces.length, 'chaque annonce est retenue ou exclue avec un motif');
});

test('bornes Mondiaux 455 / 465 / 500, n = 7, sans avis 425 / 490 / 555 n = 4', () => {
  const b = par('mondiaux');
  assert.equal(b.statut, 'ok');
  assert.deepEqual([b.n, b.basse, b.cible, b.haute], [7, 455, 465, 500]);
  assert.deepEqual(b.sansAvis, { n: 4, basse: 425, cible: 490, haute: 555 });
  assert.equal(b.annonces.length, 7);
  assert.equal(b.releveLe, '2026-11-05');
  assert.deepEqual(b.preuves, { verifiees: 3, sur: 7, partielles: 0 });
  assert.deepEqual(b.fraisInclus, { verifiees: 3, sur: 7 });
  // même résultat en appelant bornes() directement
  const d = bornes(comparables, periodes.periodes.find((p) => p.id === 'mondiaux'), hypotheses);
  assert.deepEqual([d.basse, d.cible, d.haute], [455, 465, 500]);
});

test('bornes : fêtes 300/390/435 n = 14, février 225/265/305 n = 10, mi-novembre 125/130/130 n = 9', () => {
  assert.deepEqual([par('fetes').n, par('fetes').basse, par('fetes').cible, par('fetes').haute], [14, 300, 390, 435]);
  assert.deepEqual([par('fevrier').n, par('fevrier').basse, par('fevrier').cible, par('fevrier').haute], [10, 225, 265, 305]);
  assert.deepEqual([par('automne26').n, par('automne26').basse, par('automne26').cible, par('automne26').haute], [9, 125, 130, 130]);
});

test('janvier : insuffisant, AUCUN champ de prix', () => {
  const j = par('janv');
  assert.equal(j.statut, 'insuffisant');
  assert.equal(j.n, 0);
  for (const k of ['basse', 'cible', 'haute', 'sansAvis', 'releveLe']) assert.ok(!(k in j), `${k} ne doit pas exister`);
});

test('tolère l\'absence de capture_pleine / frais / capture_partielle et les lit quand ils existent', () => {
  const copie = structuredClone(comparables);
  const a = copie.annonces.find((x) => x.chambres === 2 && x.prix && x.prix.some((p) => p.periode === 'P4' && !p.frais));
  const p = a.prix.find((x) => x.periode === 'P4');
  p.frais = { menage: 80, service: 60, inclus: true };
  p.capture_pleine = 'captures/pleine.png';
  p.capture_partielle = false;
  const b = bornes(copie, periodes.periodes.find((x) => x.id === 'mondiaux'), hypotheses);
  assert.deepEqual(b.fraisInclus, { verifiees: 4, sur: 7 }, '3 réels + 1 ajouté ici');
  assert.equal(b.preuves.verifiees, 4);
  const r = b.annonces.find((x) => x.annonceId === a.id);
  assert.equal(r.capturePleine, 'captures/pleine.png');
  assert.equal(r.capturePartielle, false);
});

test('couverture : chaque date de l\'horizon dans exactement une période', () => {
  assert.equal(couvertureOk(periodes), true);
  assert.equal(couvertureOk(cal), true);
  assert.equal(cal.length, 11);
  assert.equal(cal[0].debut, '2026-11-14');
  assert.equal(cal[10].fin, '2027-11-26');
  for (const jour of plage('2026-11-14', '2027-11-26')) {
    const n = cal.filter((p) => p.debut <= jour && jour < p.fin).length;
    assert.equal(n, 1, jour);
  }
  assert.equal(periodeDe('2027-11-26', cal), null, 'fin exclusive');
  assert.equal(periodeDe('2026-11-13', cal), null);
  // détecte un trou et un recouvrement
  const trou = cal.map((p) => ({ ...p })); trou[3].debut = '2027-01-05';
  assert.equal(couvertureOk(trou), false);
  const chev = cal.map((p) => ({ ...p })); chev[3].fin = '2027-02-03';
  assert.equal(couvertureOk(chev), false);
});

test('2027-02-14 -> mondiaux, 2027-02-15 -> février', () => {
  assert.equal(periodeDe('2027-02-14', cal).id, 'mondiaux');
  assert.equal(periodeDe('2027-02-15', cal).id, 'fevrier');
  assert.equal(periodeDe('2027-02-14', periodes).id, 'mondiaux', 'accepte aussi periodes.json');
});

test('séjour à cheval 2027-02-08 -> 2027-02-17 : 7 × 465 + 2 × 265 = 3\'785, nuits min 7', () => {
  const s = prixSejour('2027-02-08', '2027-02-17', cal);
  assert.equal(s.nuits, 9);
  assert.equal(s.total, 3785);
  assert.equal(s.nuitsMin, 7, 'la plus stricte (Mondiaux 7, février 5)');
  assert.deepEqual(s.periodes, ['mondiaux', 'fevrier']);
  assert.equal(s.insuffisant, false);
  assert.equal(s.lignes.length, 9);
  assert.deepEqual(s.lignes[0], { nuit: '2027-02-08', prix: 465, periode: 'mondiaux' });
  assert.equal(s.lignes[8].prix, 265);
  // prix retenu modifié par période
  assert.equal(prixSejour('2027-02-08', '2027-02-17', cal, { mondiaux: 500 }).total, 7 * 500 + 2 * 280, 'février sans saisie : prix retenu par défaut = garder 280');
  assert.equal(prixSejour('2027-02-08', '2027-02-17', cal, 'haute').total, 7 * 500 + 2 * 305);
});

test('une nuit en janvier : insuffisant, total null', () => {
  const s = prixSejour('2027-01-30', '2027-02-03', cal); // 2 nuits janvier + 2 nuits Mondiaux
  assert.equal(s.insuffisant, true);
  assert.equal(s.total, null);
  assert.equal(s.lignes[0].prix, null);
  assert.equal(s.lignes[2].prix, 465);
});

test('tarifsHoteDepuisCalendrier : 8 périodes, insuffisantes omises, compatible estimer', () => {
  const t = tarifsHoteDepuisCalendrier(cal);
  assert.equal(t.prixNuitDefaut, null);
  assert.equal(t.periodes.length, 8);
  const m = t.periodes.find((p) => p.nom === 'Mondiaux de ski alpin FIS 2027');
  assert.deepEqual([m.debut, m.fin, m.prixNuit, m.nuitsMin], ['2027-02-01', '2027-02-15', 465, 7]);
  assert.ok(!t.periodes.some((p) => p.debut === '2027-01-03'), 'janvier absent');
  assert.equal(t.nuitsMinDefaut, 2);
});

test('canal : 7 nuits ImmoCrans, 3 plateforme, origine site -> direct', () => {
  assert.equal(canal(7, 'mondiaux', 'plateforme', hypotheses).canal, 'immocrans');
  assert.equal(canal(14, 'fetes', undefined, hypotheses).canal, 'immocrans');
  assert.equal(canal(3, 'mars', 'plateforme', hypotheses).canal, 'plateforme');
  assert.equal(canal(6, 'mars', undefined, hypotheses).canal, 'plateforme');
  assert.equal(canal(3, 'mars', 'site', hypotheses).canal, 'direct');
  assert.equal(canal(9, 'mondiaux', 'site', hypotheses).canal, 'direct');
  assert.ok(canal(7, 'mondiaux', undefined, hypotheses).raison.length > 5);
});

test('net hôte : 3\'255 à 20 % = 2\'604', () => {
  assert.equal(netHote(3255, 'immocrans', hypotheses, 'central'), 2604);
  assert.equal(netHote(3255, 'immocrans', hypotheses, 'prudent'), 2441.25);
  assert.equal(netHote(3255, 'immocrans', hypotheses, 'haut'), 2766.75);
  assert.equal(netHote(3255, 'plateforme', hypotheses), 2750.48);
  assert.equal(netHote(3255, 'direct', hypotheses), 3189.9);
});

test('proposition ImmoCrans : Mondiaux, 465, nuits min, date du relevé, périodes insuffisantes nommées', () => {
  const t = propositionImmoCrans(cal);
  assert.match(t, /Mondiaux/);
  assert.match(t, /465/);
  assert.match(t, /01\/02\/2027 au 15\/02\/2027/);
  assert.match(t, /7 nuits minimum/);
  assert.match(t, /7 annonces/);
  assert.match(t, /05\/11\/2026/);
  assert.match(t, /Ski janvier/);
  assert.ok(!/janvier.*CHF \d/.test(t.split('\n').find((l) => l.startsWith('- Ski janvier')) || ''), 'aucun prix pour janvier');
});

test('deuxLignes : voyageur et net hôte par canal, commission visible', () => {
  assert.deepEqual(deuxLignes(465, 'immocrans', hypotheses, 'central'), { voyageur: 465, net: 372, commission: 0.2 });
  assert.deepEqual(deuxLignes(465, 'plateforme', hypotheses), { voyageur: 465, net: 392.93, commission: 0.155 });
  assert.equal(deuxLignes(465, 'immocrans', hypotheses, 'prudent').net, 348.75);
});

test('règle de comparaison écrite dans hypotheses.json', () => {
  assert.match(hypotheses.regleComparaison, /prix payé par le voyageur/);
  assert.match(hypotheses.regleComparaison, /1 − commission du canal/);
});

test('biais du relevé à côté du chiffre : code, date, texte (périodes ok seulement)', () => {
  const b = par('mondiaux');
  assert.equal(b.biais.code, 'biais_releve');
  assert.equal(b.biais.date, '05/11/2026');
  assert.equal(b.biais.texte, 'Prix demandés par des annonces encore libres le 05/11/2026 ; les annonces déjà réservées, souvent les mieux placées, ne sont pas visibles.');
  assert.ok(!('biais' in par('janv')), 'pas de chiffre, pas de biais à afficher');
  assert.equal(b.sansAvis.n, 4);
});

test('couverture Mondiaux : 7 nuits relevées (6-13 février) sur 14 (1-14), extrapolé', () => {
  const c = par('mondiaux').couverture;
  assert.equal(c.nuitsRelevees, 7);
  assert.equal(c.nuitsPeriode, 14);
  assert.equal(c.extrapole, true);
  assert.deepEqual(c.fenetres, [{ id: 'P4', arrivee: '2027-02-06', depart: '2027-02-13' }]);
  assert.equal(c.message.code, 'extrapole_periode');
  assert.equal(c.message.texte, 'Relevé sur 7 nuits (06/02 → 13/02) ; appliqué à toute la période (14 nuits).');
});

test('couverture février : 7 nuits sur 20, extrapolé ; une période entièrement relevée ne l\'est pas', () => {
  const c = par('fevrier').couverture;
  assert.deepEqual([c.nuitsRelevees, c.nuitsPeriode, c.extrapole], [7, 20, true]);
  const entier = bornes(comparables, { debut: '2027-02-06', fin: '2027-02-13', fenetres: ['P4'] }, hypotheses);
  assert.deepEqual([entier.couverture.nuitsRelevees, entier.couverture.nuitsPeriode, entier.couverture.extrapole], [7, 7, false]);
  assert.ok(!('message' in entier.couverture));
});

test('proposition ImmoCrans : prix voyageur et net hôte estimé (hypothèse, commission centrale 20 %)', () => {
  const t = propositionImmoCrans(cal, hypotheses);
  assert.match(t, /prix voyageur CHF 465 la nuit/);
  assert.match(t, /Net hôte estimé par nuit : CHF 372 \(commission 20 %, hypothèse, commission réelle inconnue\)/);
  assert.match(t, /01\/02\/2027 au 15\/02\/2027/);
});
