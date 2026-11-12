import test from 'node:test';
import assert from 'node:assert/strict';
import { valide, numeroJour, nuits, ajouter, plage, formatCourt, moisGrille } from '../prototype/lib/dates.js';

test('valide : vraies dates, bissextiles et formats', () => {
  assert.equal(valide('2028-02-29'), true, '2028 est bissextile');
  assert.equal(valide('2027-02-29'), false, '2027 n\'est pas bissextile');
  assert.equal(valide('2026-02-30'), false, '30 février n\'existe pas');
  assert.equal(valide('2026-13-01'), false, 'mois 13 refusé');
  assert.equal(valide('2026-1-01'), false, 'format strict AAAA-MM-JJ');
  assert.equal(valide('2100-02-29'), false, '2100 n\'est pas bissextile');
});

test('numeroJour et nuits : entiers, indépendants du fuseau', () => {
  assert.equal(numeroJour('1970-01-01'), 0);
  assert.equal(nuits('2026-12-19', '2026-12-26'), 7);
  assert.equal(nuits('2027-03-27', '2027-03-28'), 1, 'changement d\'heure : toujours 1 nuit');
  assert.equal(nuits('2026-10-24', '2026-10-25'), 1);
  assert.equal(nuits('2026-12-26', '2026-12-19'), -7, 'négatif conservé pour l\'appelant');
});

test('ajouter et plage : passage de mois et d\'année', () => {
  assert.equal(ajouter('2026-12-31', 1), '2027-01-01');
  assert.equal(ajouter('2027-03-01', -1), '2027-02-28');
  assert.deepEqual(plage('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepEqual(plage('2026-12-30', '2026-12-30'), []);
});

test('formatCourt : FR et EN sans toLocale', () => {
  assert.equal(formatCourt('2026-12-19', 'fr'), 'sam. 19 déc. 2026');
  assert.equal(formatCourt('2026-12-19', 'en'), 'Sat 19 Dec 2026');
  assert.equal(formatCourt('1970-01-01', 'fr'), 'jeu. 1 janv. 1970');
  assert.equal(formatCourt('2027-03-28', 'en'), 'Sun 28 Mar 2027');
});

test('moisGrille : lundi = 0', () => {
  assert.deepEqual(moisGrille(2026, 12), { annee: 2026, mois: 12, premierJourSemaine: 1, nbJours: 31 }, '1er déc. 2026 = mardi');
  assert.equal(moisGrille(2028, 2).nbJours, 29);
  assert.equal(moisGrille(2026, 6).premierJourSemaine, 0, '1er juin 2026 = lundi');
});
