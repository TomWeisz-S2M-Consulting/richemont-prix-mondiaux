import test from 'node:test';
import assert from 'node:assert/strict';
import { estimer } from '../prototype/lib/tarifs.js';
import { fiche, tarifsPublic, tarifsAvecHote } from './aide.js';

const AUJ = '2026-11-05';
const sejour = (arrivee, depart, voyageurs = 2) => ({ arrivee, depart, voyageurs });

test('sans tarifs de l\'hôte : aucun montant', () => {
  const r = estimer(sejour('2026-12-19', '2026-12-24'), tarifsPublic, fiche, { aujourdhui: AUJ });
  assert.equal(r.total, null);
  assert.deepEqual(r.lignes, []);
  assert.equal(r.nuitsMin, null);
  assert.equal(r.nuits, 5);
  assert.equal(r.prixSemainePublic, 1960);
});

test('aiguillage : 7 nuits -> ImmoCrans, 6 -> direct, seuils extrêmes, canal direct coupé', () => {
  const a = (d, t = tarifsPublic) => estimer(sejour('2027-04-01', d), t, fiche, { aujourdhui: AUJ }).aiguillage;
  assert.equal(a('2027-04-08'), 'immocrans', '7 nuits');
  assert.equal(a('2027-04-07'), 'direct', '6 nuits');
  assert.equal(a('2027-04-02', { ...tarifsPublic, seuilImmoCrans: 0 }), 'immocrans', 'seuil 0 : 1 nuit');
  assert.equal(a('2027-04-20', { ...tarifsPublic, seuilImmoCrans: 999 }), 'direct', 'seuil 999');
  assert.equal(a('2027-04-04', { ...tarifsPublic, canalDirect: false }), null, 'canalDirect false : pas de formulaire');
  assert.equal(a('2027-04-10', { ...tarifsPublic, canalDirect: false }), 'immocrans', 'canalDirect false mais 9 nuits');
});

test('tarifs dérivés du calendrier : période insuffisante, à cheval, Mondiaux prime sur Février', () => {
  const e = (a, d) => estimer(sejour(a, d), tarifsAvecHote, fiche, { aujourdhui: AUJ });
  const mars = e('2027-03-10', '2027-03-14');
  assert.equal(mars.total, 4 * 195, '4 nuits de mars à la cible (195)');
  assert.equal(e('2027-04-10', '2027-04-14').total, null, 'printemps : donnée insuffisante, aucun total');
  const apres = e('2027-02-13', '2027-02-17');
  assert.deepEqual(apres.lignes.map((l) => l.prix), [465, 465, 265, 265], 'Mondiaux jusqu\'au 14 inclus, février dès le 15');
  assert.equal(apres.total, 1460);
  const mond = e('2027-02-10', '2027-02-11');
  assert.equal(mond.lignes[0].prix, 465, 'Mondiaux (465) prime sur Février (265)');
  assert.equal(mond.lignes[0].periode, 'Mondiaux de ski alpin FIS 2027');
  assert.equal(e('2027-02-20', '2027-02-21').lignes[0].prix, 265, 'Février seul');
  const janv = e('2027-01-10', '2027-01-15');
  assert.equal(janv.total, null, 'janvier : insuffisant');
  assert.ok(janv.lignes.every((l) => l.prix === null));
});

test('codes d\'erreur', () => {
  const e = (s) => estimer(s, tarifsAvecHote, fiche, { aujourdhui: AUJ }).erreurs;
  assert.deepEqual(e(sejour('2027-03-10', '2027-03-14', 0)), ['voyageurs_invalides'], '0 voyageur');
  assert.deepEqual(e(sejour('2027-03-10', '2027-03-14', 6)), ['voyageurs_invalides'], '6 voyageurs (capacité 5)');
  assert.ok(e(sejour('2027-02-29', '2027-03-02')).includes('dates_invalides'), '29 février 2027');
  assert.ok(e(sejour('2027-04-05', '2027-04-01')).includes('dates_inversees'), 'départ avant arrivée');
  assert.ok(e(sejour('2026-11-01', '2026-11-05')).includes('date_passee'), 'arrivée passée');
  assert.ok(e(sejour('2027-03-10', '2027-03-11')).includes('nuits_min'), '1 nuit < minimum 3 (mars)');
  assert.ok(e(sejour('2026-12-30', '2027-01-05')).includes('nuits_min'), 'Fêtes : minimum 7 nuits');
  assert.deepEqual(e(sejour('2027-03-10', '2027-03-14')), [], 'séjour valide');
});

test('changement d\'heure : 2027-03-27 -> 2027-03-28 = 1 nuit', () => {
  const r = estimer(sejour('2027-03-27', '2027-03-28'), tarifsPublic, fiche, { aujourdhui: AUJ });
  assert.equal(r.nuits, 1);
});
