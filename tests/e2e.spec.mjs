// E2E Playwright (optionnel) : npm run e2e. Aucun fichier du prototype n'est modifié.
let pw;
try { pw = await import('playwright'); } catch {
  if (process.env.PLAYWRIGHT_PATH) { try { pw = await import(process.env.PLAYWRIGHT_PATH); } catch { /* ignoré */ } }
}
if (!pw) { console.log('E2E ignoré : Playwright absent (npm i -D playwright && npx playwright install chromium)'); process.exit(0); }
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// Serveur propre sur un port libre (jamais un serveur déjà présent sur un port connu : il peut servir un autre site) ; E2E_URL pour viser une démo explicite.
const { createServer } = await import('node:net');
const portLibre = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = process.env.E2E_URL ? 0 : await portLibre();
const URL = process.env.E2E_URL || `http://127.0.0.1:${PORT}/`;
let serveur = null;
const repond = async () => { try { const r = await fetch(URL); return r.ok; } catch { return false; } };
if (!process.env.E2E_URL) {
  serveur = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', 'prototype'], { stdio: 'ignore' });
  for (let i = 0; i < 30 && !(await repond()); i++) await new Promise((r) => setTimeout(r, 200));
}
const fin = async (code) => { if (serveur) serveur.kill(); process.exit(code); };
if (!/Richemont 3B/.test(await fetch(URL).then((r) => r.text()).catch(() => ''))) { console.log(`ÉCHEC : ${URL} ne sert pas le prototype Richemont 3B`); await fin(1); }

let browser;
try { browser = await pw.chromium.launch({ args: ['--disable-gpu'] }); } catch {
  try { browser = await pw.chromium.launch({ channel: 'chrome', args: ['--disable-gpu'] }); } catch {
    console.log('E2E ignoré : navigateur absent'); await fin(0);
  }
}

const t0 = Date.now();
let n = 0; const echecs = [];
async function ctrl(nom, fn) {
  n++;
  try { await fn(); console.log(`OK  ${nom}`); } catch (e) { echecs.push(nom); console.log(`KO  ${nom} : ${String(e.message).split('\n')[0].slice(0, 220)}`); }
}
const nouvelle = async (w, h, locale = 'fr-CH') => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  return { ctx, page, errs };
};
const sw = (page) => page.evaluate(() => document.documentElement.scrollWidth);
const errsTous = [];

// 1. Avant
{
  const { ctx, page, errs } = await nouvelle(1280, 800);
  await ctrl('1 Avant : trois liens sortants, aucun prix', async () => {
    await page.click('[data-mode="avant"]');
    await page.click('#bt-reserver');
    await page.waitForTimeout(300);
    const hrefs = await page.locator('#panneau a[target="_blank"]').evaluateAll((a) => a.map((x) => x.href));
    assert.equal(hrefs.length, 3, `liens: ${hrefs.length}`);
    assert.ok(hrefs.some((h) => /immocrans/i.test(h)), 'ImmoCrans');
    assert.ok(hrefs.some((h) => /airbnb/i.test(h)), 'Airbnb');
    assert.ok(hrefs.some((h) => /booking/i.test(h)), 'Booking');
    const t = await page.innerText('#panneau');
    assert.ok(!/CHF\s*\d|\d['’]\d{3}/.test(t), 'un prix est affiché');
    assert.ok(t.includes('Votre séjour commence ici.'));
  });
  errsTous.push(...errs);
  await ctx.close();
}

// 2 à 5, 8 : parcours Après (1280)
{
  const { ctx, page, errs } = await nouvelle(1280, 800);
  await page.waitForTimeout(300);
  await ctrl('2a Réserver : prix public 1\'960 visible', async () => {
    await page.click('#bt-reserver');
    await page.waitForTimeout(350);
    assert.ok(/1['’]960/.test(await page.innerText('#panneau')));
  });
  await ctrl('2b Deux dates libres : 3 nuits · libre', async () => {
    await page.click('[data-iso="2026-12-07"]');
    await page.click('[data-iso="2026-12-10"]');
    await page.waitForTimeout(250);
    assert.match(await page.innerText('#p-corps'), /3 nuits · libre/);
  });
  await ctrl('2c Formulaire : erreur e-mail puis relecture', async () => {
    await page.click('text=Demander ces dates à l’hôte');
    await page.fill('#f-prenom', 'Camille');
    await page.fill('#f-email', 'camille');
    await page.click('button:has-text("Relire ma demande")');
    assert.ok((await page.innerText('#err-email')).includes('incomplète'));
    await page.fill('#f-email', 'camille.t@example.test');
    await page.fill('#f-message', 'Bonjour <b>test</b>');
    await page.click('button:has-text("Relire ma demande")');
    await page.waitForSelector('#bt-envoyer');
  });
  await ctrl('2d Double clic Envoyer : un seul numéro et un seul enregistrement', async () => {
    await page.dblclick('#bt-envoyer');
    await page.waitForTimeout(300);
    const nums = (await page.innerText('#p-corps')).match(/R3B-\d{4}-\d{4}/g) || [];
    assert.equal(nums.length, 1, nums.join(','));
    const stock = await page.evaluate(() => JSON.parse(localStorage.getItem('r3b_demandes') || '[]').length);
    assert.equal(stock, 1);
  });
  await ctrl('2e Mêmes données : doublon affiché, toujours 1 demande', async () => {
    await page.click('button:has-text("Retour aux dates")');
    await page.click('text=Demander ces dates à l’hôte');
    await page.click('button:has-text("Relire ma demande")');
    await page.click('#bt-envoyer');
    await page.waitForTimeout(300);
    assert.match(await page.innerText('#p-corps'), /existe déjà/);
    const stock = await page.evaluate(() => JSON.parse(localStorage.getItem('r3b_demandes') || '[]').length);
    assert.equal(stock, 1);
  });
  await ctrl('3 Sept nuits : aiguillage ImmoCrans et récap copiable', async () => {
    await page.click('button:has-text("Retour aux dates")');
    await page.click('[data-iso="2026-12-12"]');
    await page.click('[data-iso="2026-12-19"]');
    await page.waitForTimeout(250);
    assert.match(await page.innerText('#p-corps'), /passe par ImmoCrans/);
    assert.equal(await page.locator('#bt-immocrans').count(), 1);
    assert.ok(await page.locator('#p-corps button:has-text("Copier")').count() >= 1, 'bouton Copier');
    assert.match(await page.innerText('#p-corps'), /12 → 19 déc\. 2026|12.{1,4}19 déc/);
  });
  await ctrl('4 Séjour pris : conflit, pas d\'envoi actif', async () => {
    await page.click('[data-iso="2026-12-17"]');
    await page.click('[data-iso="2026-12-27"]');
    assert.match(await page.innerText('#p-corps'), /croisent un séjour déjà réservé/);
    assert.equal(await page.locator('#bt-direct:visible').count(), 0, 'bouton de demande visible');
    assert.equal(await page.locator('#bt-immocrans:visible').count(), 0, 'bouton ImmoCrans visible');
  });
  await ctrl('7 FAQ : 8 details, ouverture montre la source', async () => {
    await page.click('[data-iso="2026-12-07"]');
    await page.click('[data-iso="2026-12-10"]');
    assert.equal(await page.locator('details.faq-q').count(), 8);
    await page.locator('.faq-q summary').first().click();
    await page.waitForTimeout(250);
    const src = await page.locator('.faq-q[open] .faq-source').first().innerText();
    assert.match(src, /Source.*\d{2}\/\d{2}\/\d{4}/);
  });
  await ctrl('8 Échap ferme le panneau et rend le focus au bouton', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#panneau').isHidden());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'bt-reserver');
  });
  await ctrl('2f Vue hôte : 1 demande', async () => {
    await page.click('#bt-reserver');
    await page.click('#panneau button:has-text("Vue hôte")');
    await page.waitForTimeout(300);
    const t = await page.innerText('#v-hote');
    assert.equal((t.match(/R3B-\d{4}-\d{4}/g) || []).filter((v, i, a) => a.indexOf(v) === i).length, 1, 'numéros distincts');
    assert.match(t, /Doublon de R3B/);
  });
  await ctrl('5a Vérificateur : titre Airbnb contredit, deux balises, envoi bloqué', async () => {
    await page.click('#bt-vers-rep');
    await page.waitForTimeout(250);
    await page.click('button:has-text("Titre d’annonce Airbnb")');
    await page.waitForTimeout(400);
    assert.match(await page.innerText('#rep-verdict'), /contredit/);
    assert.ok((await page.innerText('#rep-cartes')).includes('Même page, deux balises'));
    assert.ok(await page.locator('#rep-envoyer').isDisabled());
  });
  await ctrl('5b Brouillon IA piégé : bloqué', async () => {
    await page.click('button:has-text("Brouillon IA piégé")');
    await page.waitForTimeout(300);
    assert.match(await page.innerText('#rep-verdict'), /absent|contredit/);
    assert.ok(await page.locator('#rep-envoyer').isDisabled());
  });
  await ctrl('5c Brouillon correct : verdict ok, bouton actif', async () => {
    await page.click('button:has-text("Brouillon correct")');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#rep-envoyer').isEnabled(), await page.innerText('#rep-verdict'));
    assert.ok(!/contredit|absent/.test(await page.innerText('#rep-verdict')));
    await page.click('#rep-envoyer');
    assert.ok((await page.innerText('#rep-accuse')).includes('Réponse prête'));
  });
  errsTous.push(...errs);
  await ctx.close();
}

// 6. Langues et débordements
const T = { de: 'Ihre Termine' };
for (const [w, h] of [[1280, 800], [390, 844]]) {
  for (const lg of ['de', 'it', 'ru', 'en']) {
    const { ctx, page, errs } = await nouvelle(w, h);
    const tag = `6 ${lg} ${w}`;
    await ctrl(`${tag} : titre traduit et aucun débordement (accueil, panneau, réponse, hôte)`, async () => {
      await page.waitForTimeout(300);
      if (w >= 761) await page.click(`.langue[data-langue="${lg}"]`); else await page.selectOption('#langue-select', lg);
      assert.ok((await sw(page)) <= w, `accueil ${await sw(page)}`);
      await page.click('#bt-reserver'); await page.waitForTimeout(350);
      const titre = (await page.innerText('#p-titre')).trim();
      assert.ok(titre.length > 0 && titre !== 'Vos dates', `titre non traduit : ${titre}`);
      if (T[lg]) assert.equal(titre, T[lg]);
      assert.ok((await sw(page)) <= w, `panneau ${await sw(page)}`);
      await page.click('[data-iso="2026-12-07"]'); await page.click('[data-iso="2026-12-10"]'); await page.waitForTimeout(250);
      await page.click('#bt-direct'); await page.waitForTimeout(250);
      await page.fill('#f-prenom', 'Camille'); await page.fill('#f-email', 'camille.t@example.test');
      await page.click('#p-action button[type=submit]'); await page.waitForTimeout(200);
      await page.click('#bt-envoyer'); await page.waitForTimeout(250);
      await page.click('#p-action .bouton-plein'); await page.waitForTimeout(300);
      assert.ok((await sw(page)) <= w, `réponse ${await sw(page)}`);
      await page.click('[data-ex="piege"]'); await page.waitForTimeout(250);
      assert.ok((await sw(page)) <= w, `réponse piège ${await sw(page)}`);
      await page.click('#bt-vers-hote'); await page.waitForTimeout(250);
      assert.ok((await sw(page)) <= w, `hôte ${await sw(page)}`);
    });
    errsTous.push(...errs);
    await ctx.close();
  }
}

// 10. Pivot : calendrier des prix, vignette, panneau, vérificateur, 390 px
const ICS_VIDE = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'; // le jeu synthétique bloque tout 1-14 févr. 2027 : on libère les dates pour tester le panneau
const nouvelleP = async (w, h, { libre = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'fr-CH' });
  try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write']); } catch { /* ignoré */ }
  await ctx.addInitScript(() => { window.__copies = []; const o = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null; if (navigator.clipboard) navigator.clipboard.writeText = (t) => { window.__copies.push(String(t)); return o ? o(t).catch(() => {}) : Promise.resolve(); }; });
  if (libre) await ctx.route('**/calendrier.ics', (r) => r.fulfill({ contentType: 'text/calendar', body: ICS_VIDE }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs };
};
const choisir = async (page, iso) => {
  for (let i = 0; i < 16; i++) {
    if (await page.locator(`[data-iso="${iso}"]`).count()) { await page.click(`[data-iso="${iso}"]`); return; }
    await page.click('button[aria-label="Mois suivant"]'); await page.waitForTimeout(50);
  }
  throw new Error('date introuvable ' + iso);
};
const dates = async (page, a, d) => { await choisir(page, a); await choisir(page, d); await page.waitForTimeout(300); };
const MAUVAIS = /\bnull\b|\bundefined\b|\bNaN\b/;
const propre = async (page, nom) => { const t = await page.evaluate(() => document.body.innerText); assert.ok(!MAUVAIS.test(t), `${nom} : chaîne parasite « ${(t.match(MAUVAIS) || [])[0]} »`); };

{ // 10a Accueil et calendrier (1280)
  const { ctx, page, errs } = await nouvelleP(1280, 900);
  await ctrl('10a Accueil : vignette Mondiaux 465 et 280', async () => {
    const v = await page.innerText('#vignette');
    assert.ok(/Mondiaux/.test(v), v); assert.ok(v.includes('465'), '465'); assert.ok(v.includes('280'), '280');
    await propre(page, 'accueil');
  });
  await ctrl('10b Clic vignette : calendrier, période Mondiaux dépliée', async () => {
    await page.click('#vignette'); await page.waitForTimeout(500);
    assert.ok(await page.locator('#v-prix').isVisible(), 'vue calendrier');
    assert.equal(await page.locator('.per[data-id="mondiaux"] .per-ligne').getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator('#d-mondiaux').isVisible(), 'détail visible');
  });
  await ctrl('10c Calendrier : 11 lignes, 8 avec prix, 3 sur demande sans chiffre de prix', async () => {
    assert.equal(await page.locator('.per').count(), 11);
    assert.equal(await page.locator('.per:not(.per-vide)').count(), 8);
    assert.equal(await page.locator('.per.per-vide').count(), 3);
    const ids = await page.locator('.per.per-vide').evaluateAll((l) => l.map((e) => e.dataset.id));
    assert.deepEqual(ids, ['janv', 'printemps', 'automne27']);
    for (const id of ids) {
      const brut = await page.locator(`.per[data-id="${id}"]`).innerText();
      // le prix public ImmoCrans « dès CHF 1'960 / sem. » est une référence voulue (conception §3), pas un prix recommandé
      const l = brut.replace(/prix public ImmoCrans\s*:\s*dès CHF\s*1['’]960\s*\/\s*sem\./i, '');
      assert.match(l, /sur demande|insuffisant/i, `${id} : ${l}`);
      assert.ok(!/CHF|\/\s*nuit/.test(l), `${id} : prix dans la ligne « ${l.replace(/\n/g, ' | ')} »`);
      assert.ok(!/\d/.test(await page.locator(`.per[data-id="${id}"] .per-prix`).innerText()), `${id} : chiffre dans .per-prix`);
      assert.ok(!/(^|[^\d'’])\d{3}([^\d]|$)/.test(l.replace(/\d{1,2} [^\s]+ 20\d\d|20\d\d/g, '').replace(/\d+ nuits?/g, '')), `${id} : nombre de prix probable « ${l.replace(/\n/g, ' | ')} »`);
    }
  });
  await ctrl('10d Phrase de tête : 6 nuits sur 10', async () => {
    assert.match(await page.innerText('#prix-contenu .phrase'), /6 nuits sur 10/);
  });
  await ctrl('10e Ligne Mondiaux : 465, 7 annonces, biais, extrapolation, deux lignes voyageur / net hôte', async () => {
    const t = await page.innerText('.per[data-id="mondiaux"]');
    assert.ok(t.includes('465'), '465'); assert.ok(t.includes('7 annonces'), '7 annonces');
    assert.ok(t.includes('annonces déjà réservées'), 'biais');
    assert.ok(t.includes('7 nuits'), 'extrapolation');
    assert.match(t, /voyageur CHF 465/); assert.match(t, /net h[ôo]te ≈ CHF 372/);
    assert.equal(await page.locator('.per[data-id="mondiaux"] .per-notes .note-deux').count(), 1, 'ligne voyageur/net');
    assert.ok(await page.locator('.per[data-id="mondiaux"] .barre svg').count() >= 1, 'barre SVG');
  });
  await ctrl('10f Détail Mondiaux : 7 annonces, 7 liens http, aucune balise img', async () => {
    const li = page.locator('#d-mondiaux ul.ann li');
    assert.equal(await li.count(), 7);
    const hrefs = await li.evaluateAll((l) => l.map((x) => (x.querySelector('a') || {}).href || ''));
    assert.ok(hrefs.every((h) => /^https?:/.test(h)), hrefs.join(','));
    assert.equal(await page.locator('#d-mondiaux img').count(), 0, 'img dans le détail');
    assert.equal(await page.locator('#v-prix img').count(), 0, 'img dans la vue');
  });
  await ctrl('10g Gain : 3 scénarios, deltas signés, 8 invalidations', async () => {
    assert.equal(await page.locator('section.gain details.sc-det').count(), 3);
    const g = await page.innerText('section.gain');
    for (const nom of ['Prudent', 'Central', 'Haut']) assert.ok(g.includes(nom), nom);
    const d = g.match(/écart [+−-]\s?\d[\d'’]*/g) || [];
    assert.ok(d.length >= 6, 'deltas : ' + d.length);
    assert.ok(d.some((x) => /\+/.test(x)) && d.some((x) => /[−-]/.test(x)), 'signes + et −');
    assert.equal(await page.locator('section.inval li').count(), 8);
  });
  await ctrl('10h Copier la proposition ImmoCrans : Mondiaux et 465', async () => {
    await page.click('button:has-text("Copier la proposition pour ImmoCrans")'); await page.waitForTimeout(400);
    let txt = ''; try { txt = await page.evaluate(() => navigator.clipboard.readText()); } catch { /* repli */ }
    if (!txt.includes('Mondiaux')) txt = (await page.evaluate(() => window.__copies)).join('\n');
    assert.ok(txt.includes('Mondiaux'), 'Mondiaux absent : ' + txt.slice(0, 120));
    assert.ok(txt.includes('465'), '465 absent');
    assert.ok(!MAUVAIS.test(txt), 'chaîne parasite dans le texte copié');
  });
  await ctrl('10i Calendrier : aucune chaîne null / undefined / NaN', async () => {
    await propre(page, 'calendrier');
    await page.locator('.per[data-id="janv"] .per-ligne').click().catch(() => {}); await page.waitForTimeout(200);
    await propre(page, 'calendrier avec période vide dépliée');
  });
  errsTous.push(...errs); await ctx.close();
}

for (const [nom, a, d, attendu] of [
  ['10j Panneau 6→13 févr. 2027 : 3\'255, 465, 7 annonces, sans net hôte (vue visiteur)', '2027-02-06', '2027-02-13', null],
  ['10k Panneau 10→13 janv. 2027 : sur demande', '2027-01-10', '2027-01-13', null],
  ['10l Panneau 8→17 févr. 2027 (à cheval) : 3\'785', '2027-02-08', '2027-02-17', null],
]) {
  const { ctx, page, errs } = await nouvelleP(1280, 900, { libre: true });
  await ctrl(nom, async () => {
    await page.click('#bt-reserver'); await page.waitForTimeout(350);
    await dates(page, a, d);
    const t = await page.innerText('#p-corps');
    await propre(page, nom);
    if (a === '2027-02-06') {
      assert.match(t, /3['’]255/); assert.ok(t.includes('465'), '465');
      assert.match(t, /7 annonces/); assert.ok(!/net h[ôo]te/i.test(t), 'le net hôte ne doit pas apparaître côté visiteur');
    } else if (a === '2027-01-10') {
      assert.match(t, /sur demande/i);
      assert.ok(!/CHF\s*\d[\d'’]*\s*pour/.test(t), 'prix affiché pour une période sans prix');
    } else {
      assert.match(t, /3['’]785/);
    }
  });
  errsTous.push(...errs); await ctx.close();
}

{ // 10m Utiliser ces prix -> panneau
  const { ctx, page, errs } = await nouvelleP(1280, 900, { libre: true });
  await ctrl('10m Mondiaux retenu 480 + « Utiliser ces prix » : panneau 7 nuits = 3\'360', async () => {
    await page.click('#bt-prix'); await page.waitForTimeout(400);
    await page.fill('#ret-mondiaux', '480'); await page.press('#ret-mondiaux', 'Tab');
    await page.click('button:has-text("Utiliser ces prix dans le panneau")'); await page.waitForTimeout(300);
    await page.click('#bt-reserver'); await page.waitForTimeout(350);
    await dates(page, '2027-02-06', '2027-02-13');
    const t = await page.innerText('#p-corps');
    assert.match(t, /3['’]360/, t.slice(0, 400));
    await propre(page, 'panneau 480');
  });
  errsTous.push(...errs); await ctx.close();
}

{ // 10n Vérificateur de prix
  const { ctx, page, errs } = await nouvelleP(1280, 900);
  await ctrl('10n Vérificateur : 700 CHF la nuit -> précision ; 465 CHF la semaine -> pas confirmé', async () => {
    await page.click('#bt-verif'); await page.waitForTimeout(300);
    await page.fill('#rep-texte', '700 CHF la nuit du 6 au 13 février 2027'); await page.waitForTimeout(600);
    assert.match(await page.innerText('#rep-verdict'), /précision/);
    await page.fill('#rep-texte', '465 CHF la semaine'); await page.waitForTimeout(600);
    const v = await page.innerText('#rep-verdict');
    assert.ok(!/confirm/i.test(v), v);
  });
  errsTous.push(...errs); await ctx.close();
}

{ // 10o 390 px
  const { ctx, page, errs } = await nouvelleP(390, 844);
  await ctrl('10o 390 px : calendrier, détail ouvert, gain sans débordement', async () => {
    await page.click('#bt-voir'); await page.waitForTimeout(500);
    assert.ok((await sw(page)) <= 390, `calendrier ${await sw(page)}`);
    await propre(page, 'calendrier 390');
    await page.locator('.per[data-id="mondiaux"] .per-ligne').click(); await page.waitForTimeout(350);
    assert.ok(await page.locator('#d-mondiaux').isVisible(), 'détail ouvert');
    assert.ok((await sw(page)) <= 390, `détail ${await sw(page)}`);
    await page.locator('section.gain').scrollIntoViewIfNeeded();
    for (const el of await page.locator('section.gain details.sc-det summary').all()) await el.click();
    await page.locator('section.gain details.hyp summary').click().catch(() => {});
    await page.waitForTimeout(250);
    assert.ok((await sw(page)) <= 390, `gain ${await sw(page)}`);
    await page.locator('details.tableau-alt summary').click().catch(() => {});
    assert.ok((await sw(page)) <= 390, `tableau ${await sw(page)}`);
  });
  errsTous.push(...errs); await ctx.close();
}

await ctrl('9 Aucune erreur console sur tout le parcours', async () => { assert.deepEqual(errsTous, []); });

await browser.close();
const s = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`${n - echecs.length}/${n} contrôles OK en ${s} s`);
if (echecs.length) console.log('ÉCHECS : ' + echecs.join(' ; '));
await fin(echecs.length ? 1 : 0);
