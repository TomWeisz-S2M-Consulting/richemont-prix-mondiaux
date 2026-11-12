import test from 'node:test';
import assert from 'node:assert/strict';
import { valider, normaliserEmail, cle, creerMagasin } from '../prototype/lib/demandes.js';
import { fiche } from './aide.js';

const AUJ = '2026-11-05';
const base = { prenom: 'Giulia', email: 'giulia.b@example.test', arrivee: '2026-12-19', depart: '2026-12-26', voyageurs: 4, langue: 'fr', message: '' };

test('valider : demande correcte et codes', () => {
  assert.deepEqual(valider(base, fiche, { aujourdhui: AUJ }), []);
  assert.deepEqual(valider({ ...base, prenom: '  ' }, fiche, { aujourdhui: AUJ }), ['prenom_vide']);
  assert.deepEqual(valider({ ...base, email: 'giulia@' }, fiche, { aujourdhui: AUJ }), ['email_invalide']);
  assert.deepEqual(valider({ ...base, message: 'x'.repeat(501) }, fiche, { aujourdhui: AUJ }), ['message_trop_long']);
  assert.deepEqual(valider({ ...base, message: 'x'.repeat(500) }, fiche, { aujourdhui: AUJ }), [], '500 caractères acceptés');
  assert.ok(valider({ ...base, voyageurs: 9 }, fiche, { aujourdhui: AUJ }).includes('voyageurs_invalides'));
  assert.ok(valider({ ...base, arrivee: '2026-01-01', depart: '2026-01-05' }, fiche, { aujourdhui: AUJ }).includes('date_passee'));
});

test('e-mail normalisé et clé de doublon', () => {
  assert.equal(normaliserEmail(' A.B@Example.test '), 'a.b@example.test');
  assert.equal(cle({ ...base, email: 'A.B@Example.test ' }), 'a.b@example.test|2026-12-19|2026-12-26');
});

test('doublon exact, e-mail en majuscules, autre e-mail, deux appels consécutifs', () => {
  const m = creerMagasin(null, { maintenant: () => '2026-11-05T14:32:00.000Z' });
  const un = m.ajouter({ ...base, email: 'a.b@example.test' });
  assert.equal(un.doublon, false);
  assert.equal(un.id, 'R3B-2612-0001', 'format R3B-AAMM-compteur');
  const deux = m.ajouter({ ...base, email: 'A.B@Example.test ' });
  assert.equal(deux.doublon, true, 'même e-mail à la casse et aux espaces près');
  assert.equal(deux.id, un.id);
  assert.equal(deux.recueLe, '2026-11-05T14:32:00.000Z');
  const autre = m.ajouter({ ...base, email: 'autre@example.test' });
  assert.equal(autre.doublon, false, 'mêmes dates, autre e-mail');
  assert.notEqual(autre.id, un.id, 'ids uniques');
  assert.equal(m.liste().length, 2);
});

test('deux ajouter dans le même tick = un enregistrement', () => {
  const m = creerMagasin();
  const [a, b] = [m.ajouter(base), m.ajouter(base)];
  assert.equal(a.doublon, false);
  assert.equal(b.doublon, true);
  assert.equal(m.liste().length, 1);
});

test('stockage qui lève : avertissement, ajout en mémoire', () => {
  const m = creerMagasin({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
  const r = m.ajouter(base);
  assert.equal(r.doublon, false);
  assert.equal(m.avertissement, 'stockage_indisponible');
  assert.equal(m.liste().length, 1, 'la demande reste en mémoire');
});

test('stockage fonctionnel : relu au démarrage', () => {
  const mem = {};
  const st = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  creerMagasin(st).ajouter(base);
  assert.equal(creerMagasin(st).liste().length, 1);
});

test('prénom <script> stocké comme simple chaîne', () => {
  const m = creerMagasin();
  const r = m.ajouter({ ...base, prenom: '<script>alert(1)</script>' });
  assert.equal(r.demande.prenom, '<script>alert(1)</script>', 'stocké tel quel (affichage par textContent)');
  assert.equal(typeof r.demande.prenom, 'string');
  assert.ok(!cle(r.demande).includes('<'), 'la clé de doublon ne contient pas le prénom');
});
