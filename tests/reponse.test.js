import test from 'node:test';
import assert from 'node:assert/strict';
import { verifier } from '../prototype/lib/verifier.js';
import { brouillon, prixAdmisPour } from '../prototype/lib/reponse.js';
import { estimer } from '../prototype/lib/tarifs.js';
import { fiche, tarifsPublic, tarifsAvecHote } from './aide.js';

const LANGUES = ['fr', 'en', 'de', 'it', 'ru'];
const demande = { prenom: 'Camille', arrivee: '2026-12-19', depart: '2026-12-26', voyageurs: 4 };

test('brouillons FR, EN, DE, IT, RU : verdict ok, avec et sans tarifs de l\'hôte, séjour long et court', () => {
  for (const tarifs of [tarifsPublic, tarifsAvecHote]) {
    for (const d of [demande, { ...demande, depart: '2026-12-22' }]) {
      for (const langue of LANGUES) {
        const est = estimer(d, tarifs, fiche, { aujourdhui: '2026-11-05' });
        const { champs, texte } = brouillon(d, est, fiche, tarifs, langue);
        for (const k of ['salutation', 'dates', 'voyageurs', 'prix', 'inclus', 'prochaine_etape', 'signature']) assert.ok(champs[k], `${langue} : champ ${k}`);
        const r = verifier(texte, fiche, { prixAdmis: prixAdmisPour(est, tarifs) });
        assert.equal(r.verdict, 'ok', `${langue}${tarifs.tarifsHote ? ' avec' : ' sans'} tarifs hôte, ${est.nuits} nuits : ${r.faits.filter((f) => f.statut !== 'confirme').map((f) => `${f.extrait}:${f.statut}`)}\n${texte}`);
        assert.equal(r.compte.contredit + r.compte.absent, 0);
      }
    }
  }
});

test('brouillons DE, IT, RU : bonne langue, prénom, montant au format suisse, lien ImmoCrans', () => {
  const est = estimer(demande, tarifsAvecHote, fiche, { aujourdhui: '2026-11-05' });
  const attendu = { de: /Guten Tag Camille/, it: /Buongiorno Camille/, ru: /Здравствуйте, Camille/ };
  for (const [l, re] of Object.entries(attendu)) {
    const { texte } = brouillon(demande, est, fiche, tarifsAvecHote, l);
    assert.match(texte, re);
    assert.match(texte, /CHF 2'730/);
    assert.match(texte, /immocrans\.ch/);
  }
  assert.match(brouillon(demande, est, fiche, tarifsAvecHote, 'de').texte, /19\. Dezember 2026/);
  assert.match(brouillon(demande, est, fiche, tarifsAvecHote, 'it').texte, /19 dicembre 2026/);
  assert.match(brouillon(demande, est, fiche, tarifsAvecHote, 'ru').texte, /19 декабря 2026 г\./);
});

test('un brouillon DE / IT / RU avec un fait faux est bloqué', () => {
  const est = estimer(demande, tarifsPublic, fiche, { aujourdhui: '2026-11-05' });
  const faux = { de: 'mit Pool', it: 'con piscina', ru: 'с бассейном' };
  for (const [l, ajout] of Object.entries(faux)) {
    const { texte } = brouillon(demande, est, fiche, tarifsPublic, l);
    assert.equal(verifier(`${texte}\n${ajout}`, fiche).verdict, 'bloque', l);
  }
});
