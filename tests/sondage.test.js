import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifier } from '../prototype/lib/verifier.js';
import { fiche } from './aide.js';

const sondage = JSON.parse(readFileSync(new URL('../prototype/data/sondage-post-gel.json', import.meta.url), 'utf8'));

test('sondage post-gel : aucun raté non déclaré', () => {
  assert.match(sondage.etiquette, /POST-GEL/);
  const rates = sondage.phrases.filter((p) => verifier(p.texte, fiche).verdict !== p.attendu);
  const reussies = sondage.phrases.length - rates.length;
  console.log(`sondage post-gel : ${reussies} réussies / ${rates.length} ratées`);
  for (const p of rates) console.log(`  raté ${p.id}${p.connu_rate ? ' (connu)' : ''} : « ${p.texte} » attendu ${p.attendu}`);
  const nonDeclares = rates.filter((p) => !p.connu_rate);
  assert.deepEqual(nonDeclares.map((p) => p.id), [], 'ratés non déclarés (connu_rate:true absent)');
  // un raté déclaré qui réussit devient une fausse déclaration
  const faux = sondage.phrases.filter((p) => p.connu_rate && !rates.includes(p));
  assert.deepEqual(faux.map((p) => p.id), [], 'connu_rate:true mais la phrase réussit : retirer la déclaration');
});

test('sondage post-gel : ids uniques, attendu valide', () => {
  const ids = new Set(sondage.phrases.map((p) => p.id));
  assert.equal(ids.size, sondage.phrases.length);
  for (const p of sondage.phrases) assert.ok(['ok', 'bloque'].includes(p.attendu), p.id);
});
