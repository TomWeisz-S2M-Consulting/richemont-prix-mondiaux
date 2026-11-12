// décision par période (monter / garder), gain branché sur les prix retenus, vérificateur qui accepte sa sortie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bornes, prixRetenusDefaut, prixSejour, tarifsHoteDepuisCalendrier, propositionImmoCrans } from '../prototype/lib/prix.js';
import { comparer } from '../prototype/lib/gain.js';
import { verifier } from '../prototype/lib/verifier.js';
import { textes, t } from '../prototype/lib/i18n.js';
import { fiche, cal, periodes, hypotheses as hyp, comparables } from './aide.js';

const par = (id) => cal.find((p) => p.id === id);
const LANGUES = ['fr', 'en', 'de', 'it', 'ru'];
const v = (texte, ctx = {}) => verifier(texte, fiche, { calendrier: cal, ...ctx });
const prix = (r) => r.faits.filter((f) => f.type === 'prix');

// --- 1. Décision par période -------------------------------------------------------------
test('décision : monter quand la cible dépasse le plancher, garder 280 sinon, aucune si relevé insuffisant', () => {
  const m = par('mondiaux').decision;
  assert.deepEqual(m, { action: 'monter', prixRetenuDefaut: 465, raison: { code: 'decision_monter', params: { cible: 465, plancher: 280 } } });
  const f = par('fevrier').decision;
  assert.equal(f.action, 'garder');
  assert.equal(f.prixRetenuDefaut, 280);
  assert.deepEqual(f.raison, { code: 'decision_garder', params: { cible: 265, plancher: 280 } });
  assert.deepEqual(par('janv').decision, { action: 'aucune', prixRetenuDefaut: null, raison: { code: 'decision_aucune' } });
  for (const p of cal) assert.ok(['monter', 'garder', 'aucune'].includes(p.decision.action));
  assert.equal(cal.filter((p) => p.decision.action === 'monter').map((p) => p.id).join(), 'fetes,mondiaux');
});

test('décision : cible = plancher → garder ; message FR de la raison', () => {
  assert.equal(t('fr', 'decision_garder', { cible: 265, plancher: 280 }),
    "Marché à 265 sous le plancher public 280 : garder 280 ; baisser n'augmente pas le revenu à occupation égale.");
  for (const l of LANGUES) for (const k of ['decision_monter', 'decision_garder', 'decision_aucune', 'scenario_faible', 'scenario_moyenne', 'scenario_forte']) {
    assert.ok(textes[l][k] && textes[l][k].trim(), `${l}.${k}`);
  }
  const egal = bornes(comparables, { debut: '2027-02-01', fin: '2027-02-15', fenetres: ['P4'] }, { ...hyp, prixPlancherNuit: { valeur: 465 } });
  assert.equal(egal.cible, 465);
  assert.equal(egal.decision.action, 'garder');
});

test('prixRetenusDefaut : 280 ou cible par période, rien pour les périodes insuffisantes', () => {
  const d = prixRetenusDefaut(cal);
  assert.equal(d.mondiaux, 465);
  assert.equal(d.fetes, 390);
  assert.equal(d.fevrier, 280);
  assert.ok(!('janv' in d));
  assert.equal(Object.keys(d).length, 8);
  assert.equal(prixSejour('2027-02-08', '2027-02-17', cal, d).total, 7 * 465 + 2 * 280);
  assert.equal(tarifsHoteDepuisCalendrier(cal, d).periodes.find((p) => p.nom.startsWith('Vacances de février')).prixNuit, 280);
});

test('garde-fou : prix retenu non numérique, nul ou négatif ignoré (repli sur le prix retenu par défaut)', () => {
  for (const mauvais of ['abc', 'n', 0, -100, NaN, null, undefined, {}, '']) {
    assert.equal(prixSejour('2027-02-08', '2027-02-17', cal, { mondiaux: mauvais }).total, 7 * 465 + 2 * 280, String(mauvais));
  }
  assert.equal(prixSejour('2027-02-08', '2027-02-17', cal, { mondiaux: '500' }).total, 7 * 500 + 2 * 280);
  assert.equal(prixSejour('2027-02-08', '2027-02-17', cal, 'n').total, 7 * 465 + 2 * 265, 'mode inconnu = cible, jamais l\'effectif n');
  const g = comparer(cal, periodes, hyp, { mondiaux: 'abc' });
  assert.equal(g.scenarios.central.parPeriode.find((x) => x.id === 'mondiaux').prixRetenu, 465);
});

test('garde-fou : nMin ≤ 0 traité comme 1, jamais de bornes sans relevé', () => {
  for (const nMin of [{ valeur: 0 }, { valeur: -3 }, 0]) {
    const b = bornes(comparables, { debut: '2027-02-01', fin: '2027-02-15', fenetres: [] }, { ...hyp, nMin });
    assert.equal(b.statut, 'insuffisant');
    assert.equal(b.n, 0);
    assert.equal(b.decision.action, 'aucune');
    assert.ok(!('basse' in b));
  }
  const un = bornes(comparables, { debut: '2027-02-01', fin: '2027-02-15', fenetres: ['P4'] }, { ...hyp, nMin: { valeur: 0 } });
  assert.equal(un.statut, 'ok');
  assert.ok(un.n >= 1);
});

// --- 2. Gain branché sur les prix retenus ------------------------------------------------
test('gain : aucune période avec un delta négatif, dans les 3 scénarios ; Mondiaux et fêtes positifs', () => {
  const g = comparer(cal, periodes, hyp);
  for (const [nom, sc] of Object.entries(g.scenarios)) {
    for (const p of sc.parPeriode.filter((x) => x.delta !== null)) assert.ok(p.delta >= 0, `${nom}/${p.id} : ${p.delta}`);
    assert.ok(sc.parPeriode.find((x) => x.id === 'mondiaux').delta > 0, `${nom} mondiaux`);
    assert.ok(sc.parPeriode.find((x) => x.id === 'fetes').delta > 0, `${nom} fêtes`);
    assert.ok(sc.total.delta > 0);
  }
});

test('gain : prix retenu = plancher → même occupation, delta 0, décision « garder » ; reco = base', () => {
  const l = comparer(cal, periodes, hyp).scenarios.central.parPeriode.find((x) => x.id === 'fevrier');
  assert.equal(l.decision, 'garder');
  assert.equal(l.prixRetenu, 280);
  assert.equal(l.delta, 0);
  assert.deepEqual(l.reco, l.base);
  assert.equal(l.seuil.brut, 1);
  const m = comparer(cal, periodes, hyp).scenarios.central.parPeriode.find((x) => x.id === 'mondiaux');
  assert.equal(m.decision, 'monter');
  assert.equal(m.prixRetenu, 465);
  const j = comparer(cal, periodes, hyp).scenarios.central.parPeriode.find((x) => x.id === 'janv');
  assert.equal(j.decision, 'aucune');
  assert.equal(j.prixRetenu, null);
});

test('gain : un prix retenu saisi (500) fait bouger reco, delta et proposition', () => {
  const d = comparer(cal, periodes, hyp).scenarios.central.parPeriode.find((x) => x.id === 'mondiaux');
  const c = comparer(cal, periodes, hyp, { mondiaux: 500 }).scenarios.central.parPeriode.find((x) => x.id === 'mondiaux');
  assert.equal(c.prixRetenu, 500);
  assert.ok(c.reco.net > d.reco.net && c.delta > d.delta);
  // le reste de la grille garde ses décisions par défaut
  assert.equal(comparer(cal, periodes, hyp, { mondiaux: 500 }).scenarios.central.parPeriode.find((x) => x.id === 'fevrier').delta, 0);
  const p = propositionImmoCrans(cal, hyp, { mondiaux: 500 });
  assert.match(p, /Mondiaux[^\n]*monter à 500 \(prix voyageur CHF 500/);
  assert.match(p, /CHF 400 \(commission 20 %/);
});

test('scénarios = demande : noms FR / EN dans hypotheses.json et dans comparer, note sur la demande', () => {
  assert.deepEqual(hyp.scenarios.prudent.nom, { fr: 'Demande faible', en: 'Low demand', de: 'Geringe Nachfrage', it: 'Domanda bassa', ru: 'Низкий спрос' });
  const g = comparer(cal, periodes, hyp);
  assert.equal(g.scenarios.prudent.nom.fr, 'Demande faible');
  assert.equal(g.scenarios.central.nom.fr, 'Demande moyenne');
  assert.equal(g.scenarios.haut.nom.en, 'High demand');
  assert.match(g.noteScenarios.fr, /décrit la demande .*pas le gain/);
  assert.deepEqual(Object.keys(g.scenarios), ['prudent', 'central', 'haut']);
});

test('proposition : décision par période (monter à 465 / garder 280) et net', () => {
  const p = propositionImmoCrans(cal, hyp);
  assert.match(p, /Mondiaux[^\n]*monter à 465 \(prix voyageur CHF 465 la nuit/);
  assert.match(p, /Fêtes[^\n]*monter à 390/);
  assert.match(p, /Vacances de février hors Mondiaux[^\n]*garder 280[^\n]*Marché à 265, sous le plancher public 280/);
  assert.match(p, /Net hôte estimé par nuit : CHF 372 \(commission 20 %/);
  assert.ok(!/baisser à/.test(p));
});

// --- 3. Vérificateur : accepte sa propre sortie ------------------------------------------
test('texte réel du panneau « CHF 3\'255 pour 7 nuits · CHF 465 / nuit » (Mondiaux) : ok', () => {
  const r = v("CHF 3'255 pour 7 nuits · CHF 465 / nuit", { periode: 'mondiaux' });
  assert.equal(r.verdict, 'ok');
  assert.deepEqual(prix(r).map((f) => [f.statut, f.code, f.nuit]), [['confirme', 'dans_bornes', 465], ['confirme', 'dans_bornes', 465]]);
  assert.equal(v("CHF 3'255 pour 7 nuits du 6 au 13 février").verdict, 'ok');
  assert.equal(v("3'255 CHF pour 7 nuits du 6 au 13 février").verdict, 'ok');
});

test('totaux de séjour dans 5 langues : nuit = total ÷ N puis règle de période', () => {
  for (const texte of ["3'255 CHF / 7 nuits", "CHF 3'255 pour 7 nuits", "CHF 3,255 for 7 nights", "CHF 3'255 für 7 Nächte", "CHF 3'255 per 7 notti", "CHF 3'255 за 7 ночей", "3'255 CHF sur 7 nuits"]) {
    const r = v(texte, { periode: 'mondiaux' });
    assert.equal(r.verdict, 'ok', texte);
    assert.equal(prix(r)[0].statut, 'confirme', texte);
    assert.equal(prix(r)[0].nuit, 465, texte);
  }
  // total qui ne correspond pas à la période : précision (hors bornes), pas confirmé
  const faux = v("CHF 2'100 pour 7 nuits", { periode: 'mondiaux' });
  assert.equal(prix(faux)[0].code, 'hors_bornes');
});

test('unités : nuitée(s), /wk, p.w., per week, hebdo reconnus', () => {
  for (const [texte, nuit] of [['465 CHF la nuitée', 465], ['CHF 465 / nuitée', 465], ["CHF 3'255 /wk", 465], ["CHF 3'255 p.w.", 465], ["CHF 3'255 per week", 465], ["CHF 3'255 hebdo", 465], ["3'255 / wk", 465]]) {
    const r = v(texte, { periode: 'mondiaux' });
    assert.equal(prix(r).length, 1, texte);
    assert.equal(prix(r)[0].nuit, nuit, texte);
    assert.equal(prix(r)[0].code, 'dans_bornes', texte);
    assert.equal(r.verdict, 'ok', texte);
  }
});

test('la proposition ImmoCrans complète passe : verdict ok (aussi avec un prix retenu à 500)', () => {
  for (const p of [propositionImmoCrans(cal, hyp), propositionImmoCrans(cal, hyp, { mondiaux: 500, fevrier: 'abc' })]) {
    const r = v(p);
    assert.equal(r.verdict, 'ok', r.faits.filter((f) => f.statut === 'contredit' || f.statut === 'absent').map((f) => f.extrait).join(' | '));
    assert.ok(r.faits.some((f) => f.code === 'net_calcule'));
  }
});

test('les 40 réponses FAQ restent ok, avec et sans calendrier', () => {
  const faq = JSON.parse(readFileSync(new URL('../prototype/data/faq.json', import.meta.url), 'utf8'));
  let n = 0;
  for (const q of faq) for (const l of LANGUES) {
    for (const ctx of [{ prixAdmis: q.prix_admis || [] }, { prixAdmis: q.prix_admis || [], calendrier: cal }]) {
      assert.equal(verifier(q.reponse[l], fiche, ctx).verdict, 'ok', `${q.id}/${l}`);
    }
    n++;
  }
  assert.equal(n, 40);
});

test('280 : plancher public seulement sans période connue ; sinon précision plancher_hors_bornes', () => {
  const sans = v('CHF 280 la nuit');
  assert.equal(prix(sans)[0].code, 'prix_plancher_public');
  assert.equal(prix(sans)[0].statut, 'confirme');
  // période insuffisante : le plancher reste le seul repère
  assert.equal(prix(v('280/nuit en mai'))[0].code, 'prix_plancher_public');
  // période ok dont les bornes n'incluent pas 280
  const m = prix(v('280 la nuit aux Mondiaux'))[0];
  assert.equal(m.statut, 'precision');
  assert.equal(m.code, 'plancher_hors_bornes');
  assert.equal(m.periode, 'mondiaux');
  assert.equal(m.basse, par('mondiaux').basse);
  assert.equal(m.message, `280 est le plancher public ; le marché de Mondiaux de ski alpin FIS 2027 est à ${m.basse} – ${m.haute}`);
  assert.equal(prix(v('CHF 280 la nuit du 6 au 13 février'))[0].code, 'plancher_hors_bornes');
  assert.equal(prix(v('CHF 280 la nuit', { periode: 'mondiaux' }))[0].statut, 'precision');
  // une période ok dont les bornes contiennent 280 (février hors Mondiaux : 225 – 305) : dans les bornes
  assert.equal(prix(v('CHF 280 la nuit du 20 au 27 février'))[0].code, 'dans_bornes');
  for (const l of LANGUES) assert.ok(textes[l].codes.plancher_hors_bornes && textes[l].codes.net_calcule, l);
});
