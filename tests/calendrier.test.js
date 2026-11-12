import test from 'node:test';
import assert from 'node:assert/strict';
import { comparables, hypotheses, cal } from './aide.js';
import { calendrier } from '../prototype/lib/prix.js';

test('calendrier : 8 périodes ok sur 11, janvier / printemps / automne 2027 insuffisants', () => {
  assert.equal(cal.length, 11);
  assert.equal(cal.filter((p) => p.statut === 'ok').length, 8);
  assert.deepEqual(cal.filter((p) => p.statut === 'insuffisant').map((p) => p.id), ['janv', 'printemps', 'automne27']);
});

test('aucune borne sans au moins 5 annonces ; aucun chiffre dans les insuffisantes', () => {
  const nMin = hypotheses.nMin.valeur;
  const json = JSON.parse(JSON.stringify(cal)); // sortie sérialisée, comme l'interface la lit
  const verifie = (b) => {
    if (b.statut === 'ok') {
      assert.ok(b.annonces.length >= nMin, `${b.id} : ${b.annonces.length} annonces`);
      assert.equal(b.n, b.annonces.length);
      assert.ok(b.basse <= b.cible && b.cible <= b.haute);
      assert.ok(b.releveLe);
    } else {
      for (const k of ['basse', 'cible', 'haute', 'sansAvis', 'releveLe', 'fraisInclus']) assert.ok(!(k in b), `${b.id} : ${k} présent`);
      assert.ok(b.annonces.length < nMin);
    }
  };
  for (const p of json) { verifie(p); for (const s of p.sousLignes) verifie(s); }
});

test('sous-lignes : court séjour Mondiaux insuffisant (3), mars court ok', () => {
  const m = cal.find((p) => p.id === 'mondiaux').sousLignes[0];
  assert.equal(m.statut, 'insuffisant');
  assert.equal(m.n, 3);
  const c = cal.find((p) => p.id === 'mars').sousLignes[0];
  assert.equal(c.statut, 'ok');
  assert.deepEqual([c.basse, c.cible, c.haute, c.n], [210, 225, 270, 10]);
});

test('chaque annonce affichée existe dans comparables.json avec le même total (rien d\'écrit à la main)', () => {
  for (const p of cal.filter((x) => x.statut === 'ok')) {
    for (const a of p.annonces) {
      const src = comparables.annonces.find((x) => x.id === a.annonceId);
      const prix = src.prix.find((x) => x.periode === a.fenetre);
      assert.equal(prix.total_chf, a.total);
      assert.equal(src.url, a.url);
    }
  }
});

test('ordre d\'entrée des annonces sans effet', () => {
  const inv = { ...comparables, annonces: [...comparables.annonces].reverse() };
  const lire = (c) => c.map((p) => [p.id, p.basse, p.cible, p.haute, p.n]);
  const periodes = JSON.parse(JSON.stringify(cal));
  assert.deepEqual(lire(calendrier(inv, periodes, hypotheses)), lire(cal));
});

test('preuves : chaque relevé retenu a un sha256 de 64 hex, capture conservée hors dépôt', () => {
  assert.equal(comparables.preuves.conservees_hors_depot, true);
  assert.match(comparables.preuves.note, /hors dépôt/);
  const hex = /^[0-9a-f]{64}$/;
  let n = 0;
  for (const p of cal.filter((x) => x.statut === 'ok')) {
    for (const a of p.annonces) {
      assert.match(a.sha256 ?? '', hex, `${a.annonceId} ${a.fenetre}`);
      n++;
    }
  }
  assert.ok(n >= 50);
  // chaque capture déclarée dans le JSON a son empreinte
  for (const a of comparables.annonces) for (const p of a.prix || []) {
    if (p.capture) assert.match(p.sha256 ?? '', hex);
    if (p.capture_pleine) assert.match(p.sha256_pleine ?? '', hex);
    if (p.frais && p.frais.capture) assert.match(p.frais.sha256 ?? '', hex);
  }
});

test('aucune capture ni photo sous prototype/ ; captures de preuves exclues de l\'export', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const racine = new URL('../', import.meta.url);
  const vues = [];
  const marche = (d) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; statSync(p).isDirectory() ? marche(p) : /\.(png|jpe?g|webp)$/i.test(f) && vues.push(p); } };
  marche(new URL('prototype', racine).pathname);
  // Seules images admises : les deux replis sans WebGL de la scène (1280 et 390), rendu par notre propre shader (scene.js), épinglé par son SHA-256.
  const { createHash } = await import('node:crypto');
  const REPLI = { 'prototype/img/nuit.webp': 'ed8fd5807cded82944c17cc06bb7639afda4fec8a58d845cbf017e51dbed499b', 'prototype/img/nuit-390.webp': '8c48216192e2c0c709f72874ffe64d5e75173ff858704a27648f27e26e255dbb' };
  const autres = vues.filter((p) => { const rel = p.slice(new URL('./', racine).pathname.length); return !(REPLI[rel] && createHash('sha256').update(readFileSync(p)).digest('hex') === REPLI[rel]); });
  assert.deepEqual(autres, [], 'images sous prototype/');
  // Dans le dépôt de travail, .gitattributes et .gitignore existent ; dans une archive publique ils peuvent manquer : on ne les lit que s'ils sont là.
  const { existsSync } = await import('node:fs');
  const ga = new URL('.gitattributes', racine);
  if (existsSync(ga)) assert.ok((readFileSync(ga, 'utf8').match(/export-ignore/g) || []).length >= 8, 'les fichiers de travail interne sont exclus de l’archive publique');
  const gi = new URL('.gitignore', racine);
  if (existsSync(gi)) assert.match(readFileSync(gi, 'utf8'), /captures-hors-depot/, 'les captures de preuves (photos d’annonces tierces) ne sont jamais suivies par git');
  // Dans tous les cas : aucune capture de page de résultats Airbnb dans l'arbre public.
  const arbre = []; const marche2 = (d) => { for (const f of readdirSync(d)) { if (f === 'node_modules' || f === '.git' || f === 'captures-hors-depot') continue; const p = `${d}/${f}`; statSync(p).isDirectory() ? marche2(p) : /airbnb-.*-pleine\.png$/i.test(f) && arbre.push(p); } };
  marche2(racine.pathname.replace(/\/$/, ''));
  assert.deepEqual(arbre, [], 'captures pleine page d’annonces tierces dans l’arbre');
});
