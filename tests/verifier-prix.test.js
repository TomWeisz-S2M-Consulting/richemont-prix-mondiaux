// Vérificateur : prix par période (contexte.calendrier). Sans calendrier, le comportement historique est inchangé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifier } from '../prototype/lib/verifier.js';
import { fiche, cal } from './aide.js';

const v = (texte, ctx = {}) => verifier(texte, fiche, { calendrier: cal, ...ctx });
const prix = (r) => r.faits.filter((f) => f.type === 'prix');
const un = (r) => { const p = prix(r); assert.equal(p.length, 1, JSON.stringify(p.map((x) => x.extrait))); return p[0]; };

test('« CHF 465 la nuit du 6 au 13 février 2027 » : confirmé, dans_bornes (Mondiaux)', () => {
  const f = un(v('CHF 465 la nuit du 6 au 13 février 2027'));
  assert.equal(f.statut, 'confirme');
  assert.equal(f.code, 'dans_bornes');
  assert.equal(f.periode, 'mondiaux');
});

test('« 700 CHF/nuit pendant les Mondiaux » avec contexte.periode : précision hors_bornes', () => {
  const r = v('700 CHF/nuit pendant les Mondiaux', { periode: 'mondiaux' });
  const f = un(r);
  assert.equal(f.statut, 'precision');
  assert.equal(f.code, 'hors_bornes');
  assert.match(f.message, /Hors bornes de Mondiaux de ski alpin FIS 2027 : 455 – 500 CHF\/nuit \(relevé du 05\/11\/2026\)/);
  assert.equal(r.verdict, 'ok', 'une précision ne bloque pas');
});

test('« CHF 3\'255 / semaine » (Mondiaux) : converti, 465 -> confirmé', () => {
  const f = un(v("CHF 3'255 / semaine", { periode: 'mondiaux' }));
  assert.equal(f.statut, 'confirme');
  assert.equal(f.code, 'dans_bornes');
  assert.equal(f.nuit, 465);
  assert.equal(f.unite, 'semaine');
});

test('« 400 CHF/nuit » sans période : précision dans_bornes_de (fêtes)', () => {
  const f = un(v('400 CHF/nuit'));
  assert.equal(f.statut, 'precision');
  assert.equal(f.code, 'dans_bornes_de');
  assert.deepEqual(f.periodes, ['fetes']);
});

test('hors de toutes les bornes, sans période : contredit prix_hors_fiche', () => {
  const r = v('900 CHF/nuit');
  const f = un(r);
  assert.equal(f.statut, 'contredit');
  assert.equal(f.code, 'prix_hors_fiche');
  assert.equal(r.verdict, 'bloque');
});

test('280 / nuit et 1\'960 / semaine : confirmé, prix_plancher_public', () => {
  for (const t of ["1'960 / semaine", 'CHF 280 par nuit', '280 CHF/nuit', 'CHF 1\'960 la semaine']) {
    const f = un(v(t));
    assert.equal(f.statut, 'confirme', t);
    assert.equal(f.code, 'prix_plancher_public', t);
  }
  assert.equal(un(v('280/nuit', { periode: 'mondiaux' })).code, 'plancher_hors_bornes', 'avec une période dont les bornes n\'incluent pas 280 : précision');
});

test('« 300/nuit en mai » : période insuffisante (printemps)', () => {
  const f = un(v('300/nuit en mai'));
  assert.equal(f.statut, 'precision');
  assert.equal(f.code, 'periode_insuffisante');
  assert.equal(f.periode, 'printemps');
});

test('dates du texte : plage, ISO, anglais, allemand, mois seul', () => {
  assert.equal(un(v('Pour CHF 160 la nuit, du 12 au 19 décembre 2026')).periode, 'preouv');
  assert.equal(un(v('CHF 160 la nuit, du 12 au 19 décembre 2026')).code, 'dans_bornes');
  assert.equal(un(v('CHF 465 / night, arrival 2027-02-06')).periode, 'mondiaux');
  assert.equal(un(v('CHF 465 la nuit, 6-13 février 2027')).code, 'dans_bornes');
  assert.equal(un(v('465 CHF/night from 6 to 13 February 2027')).periode, 'mondiaux');
  assert.equal(un(v('465 CHF/Nacht vom 6. bis 13. Februar 2027')).periode, 'mondiaux');
  assert.equal(un(v('210 CHF/nuit en juillet')).periode, 'ete', 'juillet 2027 = une seule période');
  assert.equal(un(v('265 CHF/nuit en mars')).code, 'dans_bornes_de', 'mars touche deux périodes : ambigu');
  const f = un(v('CHF 465 la nuit du 20 au 27 février 2027'));
  assert.equal(f.periode, 'fevrier');
  assert.equal(f.code, 'hors_bornes', '465 est hors des bornes de février (225 – 305)');
  // les dates ne sont jamais des faits « prix »
  assert.equal(prix(v('Du 6 au 13 février 2027, CHF 465 la nuit')).length, 1);
});

test('séjour à cheval sur deux périodes sans contexte : précision dans_bornes_de, jamais confirmé à tort', () => {
  const f = un(v('CHF 265 la nuit du 12 au 18 février 2027')); // Mondiaux (jusqu\'au 14) puis février
  assert.equal(f.statut, 'precision');
  assert.equal(f.code, 'dans_bornes_de');
  assert.deepEqual(f.periodes, ['fevrier']);
});

test('période insuffisante par dates (janvier) et par contexte', () => {
  assert.equal(un(v('CHF 300 la nuit du 10 au 17 janvier 2027')).code, 'periode_insuffisante');
  assert.equal(un(v('CHF 300 la nuit', { periode: 'janv' })).code, 'periode_insuffisante');
});

test('sans contexte.calendrier : comportement historique inchangé', () => {
  const sans = (t) => prix(verifier(t, fiche));
  assert.equal(sans('CHF 465 la nuit')[0].statut, 'contredit');
  assert.equal(sans('CHF 465 la nuit')[0].code, 'prix_hors_fiche');
  assert.equal(sans('CHF 1\'960 / semaine')[0].statut, 'confirme');
  assert.equal(sans('300/nuit en mai').length, 0, 'sans devise ni calendrier : pas un prix');
  assert.equal(sans('CHF 465')[0].code, 'prix_hors_fiche');
});

test('prix sans unité avec calendrier : règle historique (liste admise)', () => {
  assert.equal(un(v('CHF 465')).statut, 'contredit');
  assert.equal(un(v('CHF 3\'785', { prixAdmis: [3785] })).statut, 'confirme');
});

// Pièges d'unité (exigence 5) : nuit contre semaine, en 5 langues, période Mondiaux (bornes 455 – 500 / nuit).
const M = { periode: 'mondiaux' };
const PIEGES = [
  // [langue, texte, statut, code]
  ['fr', '465 CHF la semaine', 'precision', 'hors_bornes'],      // 465 / 7 = 66 la nuit : pas le prix recommandé
  ['fr', "CHF 1'960 la nuit", 'precision', 'hors_bornes'],       // le plancher est 1'960 par SEMAINE
  ['fr', "1'960 par semaine", 'precision', 'plancher_hors_bornes'],
  ['fr', "CHF 3'255 / semaine", 'confirme', 'dans_bornes'],      // 3'255 / 7 = 465
  ['en', '465 CHF per week', 'precision', 'hors_bornes'],
  ['en', "CHF 1,960 per night", 'precision', 'hors_bornes'],
  ['en', "1,960 per week", 'precision', 'plancher_hors_bornes'],
  ['en', "CHF 3,255 / week", 'confirme', 'dans_bornes'],
  ['de', '465 CHF pro Woche', 'precision', 'hors_bornes'],
  ['de', "1'960 pro Nacht", 'precision', 'hors_bornes'],
  ['de', "1'960 pro Woche", 'precision', 'plancher_hors_bornes'],
  ['de', "3'255 pro Woche", 'confirme', 'dans_bornes'],
  ['it', '465 CHF a settimana', 'precision', 'hors_bornes'],
  ['it', "1'960 a notte", 'precision', 'hors_bornes'],
  ['it', "1'960 a settimana", 'precision', 'plancher_hors_bornes'],
  ['it', "3'255 a settimana", 'confirme', 'dans_bornes'],
  ['ru', '465 CHF в неделю', 'precision', 'hors_bornes'],
  ['ru', "1'960 за ночь", 'precision', 'hors_bornes'],
  ['ru', "1'960 в неделю", 'precision', 'plancher_hors_bornes'],
  ['ru', "3'255 в неделю", 'confirme', 'dans_bornes'],
];
for (const [langue, texte, statut, code] of PIEGES) {
  test(`piège d'unité [${langue}] « ${texte} » (Mondiaux) : ${statut} ${code}`, () => {
    const f = un(v(texte, M));
    assert.equal(f.code, code, JSON.stringify(f));
    assert.equal(f.statut, statut);
  });
}

test('« 465 CHF la semaine » est converti en 66 / nuit (jamais confirmé comme 465 / nuit)', () => {
  const f = un(v('465 CHF la semaine', M));
  assert.equal(Math.round(f.nuit), 66, '465 / 7 = 66,43');
  assert.equal(f.unite, 'semaine');
  assert.notEqual(f.statut, 'confirme');
});

test('« CHF 1\'960 la nuit » n\'est pas le plancher public', () => {
  const f = un(v("CHF 1'960 la nuit", M));
  assert.notEqual(f.code, 'prix_plancher_public');
  assert.equal(f.unite, 'nuit');
});
