import test from 'node:test';
import assert from 'node:assert/strict';
import { tableauCanaux, corrigerTexte, CHAMPS, CANAUX } from '../prototype/lib/canaux.js';
import { verifier } from '../prototype/lib/verifier.js';
import { fiche, canaux, brouillons } from './aide.js';

const t = tableauCanaux(fiche, canaux);
const cell = (champ, canal) => t.lignes.find((l) => l.champ === champ).parCanal[canal];

// Recherche simple, indépendante du vérificateur : un mot-clé par champ.
const MOTS = {
  chambres: /chambre|bedroom|schlafzimmer|camere|спальн/i, salles_eau: /salles? d['’]eau|salles? de bain|bathroom|badezimmer|bagni/i,
  capacite: /personne|voyageur|guest|couchage|capacit|\blits?\b|persons/i, surface: /m²|m2|surface/i, etage: /[ée]tage|floor/i,
  localisation: /crans|montana|lens|valais|adresse|rue /i, prix: /chf|prix|tarif/i, distance_ski: /\bmin\b|minute/i,
  garage: /garage|box|parking/i, renovation: /r[ée]nov/i, pieces: /pi[èe]ces|zimmer|rooms/i,
};

test('tableau : tous les champs, tous les canaux, fiche sourcée', () => {
  assert.deepEqual(t.lignes.map((l) => l.champ), CHAMPS);
  for (const l of t.lignes) {
    assert.ok(l.libelle_cle);
    assert.ok(l.fiche.valeur != null && l.fiche.source && l.fiche.date, `fiche ${l.champ}`);
    for (const c of CANAUX) assert.ok(['confirme', 'contredit', 'precision', 'non_mentionne'].includes(l.parCanal[c].statut), `${l.champ}/${c}`);
  }
});

test('chaque cellule « non mentionné » est vraie (aucun mot-clé du champ dans les textes du canal)', () => {
  let n = 0;
  for (const l of t.lignes) for (const c of CANAUX) {
    if (l.parCanal[c].statut !== 'non_mentionne') continue;
    n++;
    for (const x of canaux.filter((y) => y.canal === c)) assert.ok(!MOTS[l.champ].test(x.texte), `${l.champ}/${c} dit non mentionné mais « ${x.texte} » contient le mot-clé`);
  }
  assert.ok(n > 10, 'le tableau contient bien des cellules non mentionnées');
});

test('cellules attendues', () => {
  const ch = cell('chambres', 'airbnb');
  assert.equal(ch.statut, 'contredit'); assert.equal(ch.valeur, 3);
  assert.deepEqual(ch.valeurs.map((v) => [v.valeur, v.statut]), [[3, 'contredit'], [2, 'confirme']]);
  assert.equal(ch.detail, '<title> 3 / og:title 2');
  assert.deepEqual([cell('surface', 'immocrans').statut, cell('surface', 'immocrans').valeur], ['precision', 68]);
  assert.deepEqual([cell('capacite', 'immocrans').statut, cell('capacite', 'immocrans').valeur], ['precision', '4 à 5']);
  assert.deepEqual([cell('renovation', 'site').statut, cell('renovation', 'site').valeur], ['confirme', 2026]);
  assert.equal(cell('garage', 'site').statut, 'confirme');
  assert.equal(cell('chambres', 'immocrans').statut, 'confirme');
  assert.deepEqual([cell('distance_ski', 'booking').statut, cell('distance_ski', 'booking').valeur], ['precision', 8]);
  assert.deepEqual([cell('distance_ski', 'airbnb').statut, cell('distance_ski', 'airbnb').valeur], ['precision', 3]);
  assert.equal(cell('pieces', 'immocrans').valeur, 3.5);
  assert.equal(cell('localisation', 'site').statut, 'confirme');
  assert.ok(cell('chambres', 'site').source && cell('chambres', 'site').date);
});

test('le tableau est calculé : sans le texte, la cellule disparaît ; avec un autre texte, elle change', () => {
  const sans = tableauCanaux(fiche, canaux.filter((x) => x.texte !== 'Chambres 2'));
  assert.equal(sans.lignes.find((l) => l.champ === 'chambres').parCanal.immocrans.statut, 'non_mentionne');
  const autre = tableauCanaux(fiche, [...canaux, { canal: 'booking', champ: 'titre', texte: 'Richemont 4 chambres', source: 'x', date: '2026-11-05' }]);
  assert.equal(autre.lignes.find((l) => l.champ === 'chambres').parCanal.booking.statut, 'contredit');
});

test('corrigerTexte : remplace les nombres, lieux ; retire équipements ; précisions intactes', () => {
  const corr = (txt) => corrigerTexte(txt, verifier(txt, fiche).faits, fiche);
  assert.equal(corr('Un appartement de 3 chambres.').texte_corrige, 'Un appartement de 2 chambres.');
  assert.equal(corr('Il fait 80 m² au total.').texte_corrige, 'Il fait 74 m² au total.');
  assert.equal(corr('La télécabine est à 15 minutes.').texte_corrige, 'La télécabine est à 4 minutes.');
  assert.equal(corr('Nous sommes à Zermatt.').texte_corrige, 'Nous sommes à Crans-Montana.');
  assert.equal(corr('Cozy 3-bedroom flat.').texte_corrige, 'Cozy 2-bedroom flat.');
  assert.equal(corr('Pour dix personnes.').texte_corrige, 'Pour 5 personnes.');
  assert.equal(corr('Tarif CHF 1\'800.- la semaine.').texte_corrige, 'Tarif CHF 1\'960.- la semaine.');
  assert.equal(corr('Rénové en 2024.').texte_corrige, 'Rénové en 2026.');
  const eq = corr('Deux chambres et une piscine.');
  assert.equal(eq.texte_corrige, 'Deux chambres et une piscine.');
  assert.deepEqual(eq.corrections, [{ extrait: 'piscine', remplacement: null, raison: 'a_retirer' }]);
  const prec = corr('Ski à 3 min.');
  assert.equal(prec.corrections.length, 0); assert.equal(prec.texte_corrige, 'Ski à 3 min.');
  assert.equal(corr('Chambres : 2. Salles de bain : 3.').texte_corrige, 'Chambres : 2. Salles de bain : 2.');
});

test('corrigerTexte : le texte corrigé repasse verifier() ok pour les pièges numériques du corpus', () => {
  const numeriques = brouillons.filter((b) => b.origine === 'piege' && b.attendu.faits.every((f) => ['chambres', 'surface', 'prix', 'capacite', 'salles_eau'].includes(f.type)));
  assert.ok(numeriques.length >= 6);
  for (const b of numeriques) {
    const r = verifier(b.texte, fiche);
    const { texte_corrige, corrections } = corrigerTexte(b.texte, r.faits, fiche);
    assert.ok(corrections.length >= 1, b.id);
    const apres = verifier(texte_corrige, fiche);
    assert.equal(apres.verdict, 'ok', `${b.id} : « ${texte_corrige} » → ${apres.faits.filter((f) => f.statut !== 'confirme').map((f) => `${f.extrait}:${f.statut}`)}`);
  }
});
