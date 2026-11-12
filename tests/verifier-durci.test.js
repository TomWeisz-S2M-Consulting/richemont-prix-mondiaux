import test from 'node:test';
import assert from 'node:assert/strict';
import { verifier } from '../prototype/lib/verifier.js';
import { fiche } from './aide.js';

const a = (t) => verifier(t, fiche);
const f1 = (t, type) => a(t).faits.find((f) => f.type === type);

test('pluriels et flexions : chiens, dogs, Hunde, piscines, cani', () => {
  for (const t of ['Pets are welcome, dogs too.', 'Nous acceptons les chiens.', 'Hunde erlaubt', 'Deux piscines à proximité.', 'Accettiamo i cani.']) assert.equal(a(t).verdict, 'bloque', t);
});

test('« libellé : nombre » et « Chambres 2 »', () => {
  const r = a('Chambres : 2. Salles de bain : 3.');
  assert.deepEqual([r.compte.confirme, r.compte.contredit], [1, 1]);
  assert.equal(a('Chambres 2').compte.confirme, 1);
  assert.equal(a('3 chambres : 2 doubles et 1 simple').verdict, 'bloque');
});

test('négation : exceptions et négation après le mot', () => {
  for (const t of ['Not only a garage, also a dishwasher.', 'Без доплаты гараж включён.', 'Nicht nur Garage.', 'Sans supplément : garage.']) assert.equal(a(t).verdict, 'ok', t);
  for (const t of ["Le garage n'est malheureusement plus disponible cet hiver.", 'The garage is no longer available.', 'Die Garage ist nicht mehr verfügbar.', 'Il garage non è disponibile.']) assert.equal(f1(t, 'equipement').statut, 'contredit', t);
});

test('distances : > 2× = contredit, sinon précision avec le message du site', () => {
  assert.equal(f1('La télécabine est à 15 minutes.', 'distance').statut, 'contredit');
  const p = f1('Ski à 3 min', 'distance');
  assert.equal(p.statut, 'precision');
  assert.equal(p.message, 'Le site dit : télécabine à 4 min');
  assert.equal(f1('La Coop est à 20 minutes.', 'distance').statut, 'contredit');
});

test('lieux autres : contredit, code lieu_autre', () => {
  const f = f1("L'appartement se trouve à Zermatt.", 'lieu');
  assert.equal(f.statut, 'contredit'); assert.equal(f.code, 'lieu_autre');
  assert.equal(f.message, "L'appartement est à Crans-Montana (commune de Lens).");
  assert.equal(a('Près de Sierre, à Crans-Montana.').verdict, 'ok');
});

test('rénovation : année confirmée ou contredite ; dix personnes bloqué', () => {
  assert.equal(f1('Entièrement rénové en 2026', 'renovation').statut, 'confirme');
  assert.equal(f1('Rénové en 2024', 'renovation').statut, 'contredit');
  assert.equal(a('dix personnes').verdict, 'bloque');
});
