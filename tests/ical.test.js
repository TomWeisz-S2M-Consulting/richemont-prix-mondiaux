import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs, nuitsPrises, estLibre } from '../prototype/lib/ical.js';
import { icsTexte } from './aide.js';

const synth = (...evts) => `BEGIN:VCALENDAR\n${evts.join('\n')}\nEND:VCALENDAR`;

test('calendrier.ics réel : 8 plages après dédoublonnage', () => {
  const r = parseIcs(icsTexte);
  assert.equal(r.erreur, null);
  assert.equal(r.plages.length, 8, 'synth-001 est doublé : 9 VEVENT -> 8 plages');
  assert.equal(r.plages[0].debut, '2026-10-10', 'trié, événement passé présent');
});

test('calendrier.ics réel : TZID réduit à la date, ligne pliée lue', () => {
  const { plages } = parseIcs(icsTexte);
  const tz = plages.find((p) => p.uid === 'synth-006@example.test');
  assert.deepEqual([tz.debut, tz.fin], ['2027-03-05', '2027-03-08'], 'heure ignorée, DTEND exclusif');
  const plie = plages.find((p) => p.uid === 'synth-007@example.test');
  assert.match(plie.resume, /pour tester le pliage$/, 'la ligne repliée est dépliée');
});

test('cas synthétiques : LF seul, DTEND absent, sans DTSTART', () => {
  const r = parseIcs(synth('BEGIN:VEVENT\nDTSTART:20270101\nEND:VEVENT', 'BEGIN:VEVENT\nSUMMARY:x\nEND:VEVENT'));
  assert.deepEqual(r.plages.map((p) => [p.debut, p.fin]), [['2027-01-01', '2027-01-02']], 'sans DTEND = 1 nuit ; sans DTSTART ignoré');
});

test('texte vide ou HTML : erreur, jamais libre par défaut', () => {
  assert.equal(parseIcs('').erreur, 'vide');
  assert.equal(parseIcs('<html>404</html>').erreur, 'format');
  assert.deepEqual(parseIcs('<html>404</html>').plages, []);
});

test('chevauchements fusionnés, contigus conservés', () => {
  const e = (u, a, b) => `BEGIN:VEVENT\nUID:${u}\nDTSTART:${a}\nDTEND:${b}\nEND:VEVENT`;
  const r = parseIcs(synth(e('a', '20270101', '20270110'), e('b', '20270105', '20270115'), e('c', '20270115', '20270118')));
  assert.deepEqual(r.plages.map((p) => [p.debut, p.fin]), [['2027-01-01', '2027-01-15'], ['2027-01-15', '2027-01-18']]);
});

test('estLibre : arrivée, départ, englobant, contigus, un jour', () => {
  const plages = [{ debut: '2027-01-10', fin: '2027-01-17' }];
  assert.equal(estLibre(plages, '2027-01-01', '2027-01-08').libre, true, 'libre');
  assert.equal(estLibre(plages, '2027-01-12', '2027-01-14').libre, false, 'pris à l\'intérieur');
  assert.equal(estLibre(plages, '2027-01-08', '2027-01-12').libre, false, 'pris au départ');
  assert.equal(estLibre(plages, '2027-01-15', '2027-01-20').libre, false, 'pris à l\'arrivée');
  assert.equal(estLibre(plages, '2027-01-05', '2027-01-25').libre, false, 'séjour englobant');
  assert.equal(estLibre(plages, '2027-01-17', '2027-01-20').libre, true, 'arrivée le jour du fin = libre');
  assert.equal(estLibre(plages, '2027-01-05', '2027-01-10').libre, true, 'départ le jour du debut = libre');
  assert.equal(estLibre(plages, '2027-01-10', '2027-01-11').libre, false, 'un seul jour pris');
  assert.deepEqual(estLibre(plages, '2027-01-12', '2027-01-14').conflit, { debut: '2027-01-10', fin: '2027-01-17' });
  assert.equal(nuitsPrises(plages).size, 7);
});
