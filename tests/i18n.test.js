import test from 'node:test';
import assert from 'node:assert/strict';
import { textes, t } from '../prototype/lib/i18n.js';

const LANGUES = ['fr', 'en', 'de', 'it', 'ru'];
const cles = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? cles(v, `${p}${k}.`) : [`${p}${k}`]));

test('les 5 langues ont exactement les mêmes clés, toutes non vides', () => {
  const ref = cles(textes.fr).sort();
  assert.ok(ref.length > 50);
  for (const l of LANGUES) {
    assert.deepEqual(cles(textes[l]).sort(), ref, `clés différentes entre FR et ${l}`);
    for (const k of ref) assert.ok(String(k.split('.').reduce((o, x) => o[x], textes[l])).trim(), `${l}.${k} vide`);
  }
});

test('mêmes paramètres {…} dans chaque langue pour une même clé', () => {
  const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of cles(textes.fr)) {
    const lire = (l) => k.split('.').reduce((o, x) => o[x], textes[l]);
    for (const l of LANGUES) assert.equal(params(lire(l)), params(lire('fr')), `${l}.${k} : paramètres différents du FR`);
  }
});

test('t : paramètres, codes d\'erreur, DE / IT / RU livrés', () => {
  assert.equal(t('fr', 'estimation', { n: 7, total: '2 940' }), 'Estimation pour 7 nuits : CHF 2 940');
  assert.equal(t('en', 'erreurs.date_passee'), 'This arrival date has already passed.');
  assert.equal(t('de', 'reserver'), 'Buchen');
  assert.equal(t('it', 'reserver'), 'Prenota');
  assert.equal(t('ru', 'reserver'), 'Забронировать');
  assert.equal(t('de', 'estimation', { n: 7, total: "2'940" }), "Schätzung für 7 Nächte: CHF 2'940");
  assert.equal(t('it', 'erreurs.date_passee'), 'Questa data di arrivo è già passata.');
  assert.equal(t('ru', 'numero', { id: 'R3B-2612-0001' }), 'Номер R3B-2612-0001');
  assert.equal(t('fr', 'cle_inconnue'), 'cle_inconnue');
  for (const code of ['prenom_vide', 'email_invalide', 'message_trop_long', 'dates_invalides', 'dates_inversees', 'date_passee', 'voyageurs_invalides', 'nuits_min']) {
    for (const l of LANGUES) assert.ok(textes[l].erreurs[code], `message manquant pour ${code} en ${l}`);
  }
});

test('chiffres au format suisse (1\'960) en DE, IT, RU ; pas d\'espace dans les montants', () => {
  for (const l of ['de', 'it', 'ru']) assert.ok(textes[l].prix_depuis.includes("1'960"), `${l} : prix_depuis`);
});

test('repli sur le FR si une clé manque dans une langue', () => {
  const sauve = textes.de.reserver;
  delete textes.de.reserver;
  try {
    assert.equal(t('de', 'reserver'), 'Réserver');
    assert.equal(t('xx', 'reserver'), 'Réserver', 'langue inconnue : repli FR');
  } finally { textes.de.reserver = sauve; }
});

test('codes de faits du vérificateur traduits dans les 5 langues', () => {
  for (const code of ['fiche_dit', 'non_annonce', 'deux_mesures', 'site_dit_min', 'prix_hors_fiche', 'plage_contient', 'source_unique']) {
    for (const l of LANGUES) assert.ok(textes[l].codes[code], `codes.${code} manquant en ${l}`);
  }
});
