import test from 'node:test';
import assert from 'node:assert/strict';
import { seuilEquivalence, revenuPeriode, comparer, netMoyen } from '../prototype/lib/gain.js';
import { periodes, hypotheses as hyp, cal } from './aide.js';

const proche = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);

test('seuil d\'équivalence 280 / 465 = 0,60 (brut, sans hypothèses)', () => {
  proche(seuilEquivalence(280, 465), 0.6, 0.01);
  assert.ok(seuilEquivalence(280, 130) > 2, 'mi-novembre : seuil > 100 %');
});

test('seuil en net hôte : même canal 0,60 ; ImmoCrans 20 % contre Airbnb 15,5 % ≈ 0,57', () => {
  const m = seuilEquivalence(280, 465, hyp, 'central');
  proche(m.brut, 0.6, 0.005); proche(m.net, 0.6, 0.005);
  assert.deepEqual([m.canalPlancher, m.canalCible], ['immocrans', 'immocrans']);
  const x = seuilEquivalence(280, 465, hyp, 'central', 'immocrans', 'plateforme');
  proche(x.brut, 0.6, 0.005);
  proche(x.net, (280 * 0.8) / (465 * 0.845), 1e-4);
  proche(x.net, 0.57, 0.005);
  assert.equal(x.canalCible, 'plateforme');
});

test('formule à la main sur une période (Mondiaux, 14 nuits, prudent)', () => {
  const m = cal.find((p) => p.id === 'mondiaux');
  const horizon = 377; // 2026-11-14 -> 2027-11-26
  // net moyen prudent = 0,7 × (1 − 0,25) + 0,3 × (1 − 0,155) + 0 = 0,525 + 0,2535 = 0,7785
  proche(netMoyen({ immocrans: 0.7, plateformes: 0.3, direct: 0 }, hyp, 'prudent'), 0.7785, 1e-9);
  const parts = hyp.scenarios.prudent.parts;
  // sans nuits propriétaire (horizonNuits absent) : 14 × 0,75 × 280 × 0,7785
  assert.equal(revenuPeriode({ debut: m.debut, fin: m.fin }, 280, 0.75, parts, hyp, 'prudent'), Math.round(14 * 0.75 * 280 * 0.7785 * 100) / 100);
  // avec prorata : 21 × 14 / 378 = 0,7778 nuit propriétaire retirée
  const att = (14 - (21 * 14) / horizon) * 0.75 * 280 * 0.7785;
  assert.equal(revenuPeriode({ debut: m.debut, fin: m.fin, horizonNuits: horizon }, 280, 0.75, parts, hyp, 'prudent'), Math.round(att * 100) / 100);
  // ligne de comparer() : même formule
  const g = comparer(cal, periodes, hyp);
  const l = g.scenarios.prudent.parPeriode.find((x) => x.id === 'mondiaux');
  const base = (14 - (21 * 14) / horizon) * 0.75 * 280 * 0.7785;
  const reco = (14 - (21 * 14) / horizon) * 0.60 * 465 * 0.7785;
  proche(l.base.net, base); proche(l.reco.net, reco); proche(l.delta, reco - base, 0.01);
  proche(l.seuil.brut, 0.6, 0.01); proche(l.seuil.net, 0.6, 0.01);
  // montants voyageur = avant commissions : net / 0,7785
  proche(l.base.voyageur, base / 0.7785, 0.01); proche(l.reco.voyageur, reco / 0.7785, 0.01);
  assert.ok(l.base.voyageur > l.base.net && l.reco.voyageur > l.reco.net);
});

test('prudent ≤ central ≤ haut sur le total (base et reco)', () => {
  const g = comparer(cal, periodes, hyp);
  const t = (s) => g.scenarios[s].total;
  assert.ok(t('prudent').reco <= t('central').reco && t('central').reco <= t('haut').reco);
  assert.ok(t('prudent').base <= t('central').base && t('central').base <= t('haut').base);
  assert.equal(t('prudent').nPeriodes, 8);
  assert.equal(t('prudent').nInsuffisantes, 3);
});

test('périodes insuffisantes : base au plancher, reco et delta null', () => {
  const g = comparer(cal, periodes, hyp);
  for (const s of Object.keys(g.scenarios)) {
    for (const id of ['janv', 'printemps', 'automne27']) {
      const l = g.scenarios[s].parPeriode.find((x) => x.id === id);
      assert.ok(l.base.net > 0 && l.base.voyageur >= l.base.net);
      assert.equal(l.reco, null);
      assert.equal(l.seuil, null);
      assert.equal(l.delta, null);
    }
    assert.equal(g.scenarios[s].parPeriode.length, 11);
  }
});

test('saisons : hiver + été = total (périodes comparables)', () => {
  const g = comparer(cal, periodes, hyp).scenarios.central;
  proche(g.parSaison.hiver.reco + g.parSaison.ete.reco, g.total.reco, 0.02);
  proche(g.parSaison.hiver.base + g.parSaison.ete.base, g.total.base, 0.02);
});

test('invalidations : 8 phrases, note de sensibilité, occupation bornée à 0,95, tout en hypothèse', () => {
  const g = comparer(cal, periodes, hyp);
  assert.equal(g.invalidations.length, 8);
  assert.equal(g.note, 'sensibilité au prix non mesurée');
  assert.equal(hyp.sensibilitePrix, 'non mesurée');
  for (const sc of Object.values(hyp.scenarios)) for (const o of Object.values(sc.occupation)) {
    assert.ok(o.plancher <= 0.95 && o.cible <= 0.95 && o.statut === 'H');
  }
  assert.equal(hyp.scenarios.central.occupation.mondiaux.plancher, 0.85);
  assert.equal(hyp.scenarios.haut.occupation.fetes.plancher, 0.95);
});
