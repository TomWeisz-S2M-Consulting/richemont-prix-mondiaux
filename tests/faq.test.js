import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifier } from '../prototype/lib/verifier.js';
import { fiche } from './aide.js';

const faq = JSON.parse(readFileSync(new URL('../prototype/data/faq.json', import.meta.url), 'utf8'));
const LANGUES = ['fr', 'en', 'de', 'it', 'ru'];

test('FAQ : 8 entrées, 5 langues, source URL, date et statut', () => {
  assert.equal(faq.length, 8);
  assert.equal(new Set(faq.map((q) => q.id)).size, 8, 'ids uniques');
  for (const q of faq) {
    for (const l of LANGUES) {
      assert.ok(q.question[l] && q.question[l].trim(), `${q.id} : question ${l}`);
      assert.ok(q.reponse[l] && q.reponse[l].trim(), `${q.id} : réponse ${l}`);
    }
    assert.match(q.source, /^https:\/\//, `${q.id} : source`);
    assert.match(q.date, /^\d{4}-\d{2}-\d{2}$/, `${q.id} : date`);
    assert.ok(['C-HTML', 'H'].includes(q.statut), `${q.id} : statut`);
  }
  assert.equal(faq.find((q) => q.id === 'taxe-sejour').statut, 'H', 'taxe de séjour = hypothèse');
});

test('FAQ : 40 réponses (8 × 5 langues), toutes verdict ok au vérificateur', () => {
  let n = 0;
  for (const q of faq) {
    for (const l of LANGUES) {
      const r = verifier(q.reponse[l], fiche, { prixAdmis: q.prix_admis || [] });
      assert.equal(r.verdict, 'ok', `${q.id}/${l} : ${r.faits.filter((f) => f.statut !== 'confirme').map((f) => `${f.extrait}:${f.statut}`).join(', ')}`);
      assert.equal(r.compte.contredit + r.compte.absent, 0);
      n++;
    }
  }
  assert.equal(n, 40);
});

test('FAQ : les chiffres clés des réponses viennent de la fiche', () => {
  const dit = (id, l) => faq.find((q) => q.id === id).reponse[l];
  for (const l of LANGUES) {
    assert.ok(/\b4\b/.test(dit('distances', l)) && /\b7\b/.test(dit('distances', l)), `distances ${l}`);
    assert.ok(/1'?[ ,.]?960/.test(dit('inclus', l)), `inclus ${l}`);
    assert.ok(/\b5\b/.test(dit('capacite', l)), `capacité ${l}`);
    assert.ok(/\b3\b/.test(dit('taxe-sejour', l)), `taxe ${l}`);
    assert.ok(/\b7\b/.test(dit('duree-canal', l)), `durée ${l}`);
  }
});

test('FAQ : un fait inventé dans une réponse serait bloqué (garde-fou du test)', () => {
  for (const l of LANGUES) {
    const r = verifier(`${faq[0].reponse[l]} 3 ${{ fr: 'chambres', en: 'bedrooms', de: 'Schlafzimmer', it: 'camere', ru: 'спальни' }[l]}`, fiche);
    assert.equal(r.verdict, 'bloque', l);
  }
});
