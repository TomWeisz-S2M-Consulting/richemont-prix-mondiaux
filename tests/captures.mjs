// Captures d'étape 2 : npm run captures -> captures/apres/<nom>-<largeur>.png
let pw;
try { pw = await import('playwright'); } catch {
  if (process.env.PLAYWRIGHT_PATH) { try { pw = await import(process.env.PLAYWRIGHT_PATH); } catch { /* ignoré */ } }
}
if (!pw) { console.log('Captures ignorées : Playwright absent (npm i -D playwright && npx playwright install chromium)'); process.exit(0); }
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// Serveur propre sur un port libre (jamais un serveur déjà présent sur un port connu : il peut servir un autre site) ; E2E_URL pour viser une démo explicite.
const { createServer } = await import('node:net');
const portLibre = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = process.env.E2E_URL ? 0 : await portLibre();
const URL = process.env.E2E_URL || `http://127.0.0.1:${PORT}/`;
const OUT = 'captures/apres/';
mkdirSync(OUT, { recursive: true });
let serveur = null;
const repond = async () => { try { return (await fetch(URL)).ok; } catch { return false; } };
if (!process.env.E2E_URL) {
  serveur = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', 'prototype'], { stdio: 'ignore' });
  for (let i = 0; i < 30 && !(await repond()); i++) await new Promise((r) => setTimeout(r, 200));
}
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'];
if (!/Richemont 3B/.test(await fetch(URL).then((r) => r.text()).catch(() => ''))) { console.log(`Captures arrêtées : ${URL} ne sert pas le prototype Richemont 3B`); if (serveur) serveur.kill(); process.exit(1); }
let browser;
try { browser = await pw.chromium.launch({ channel: 'chrome', args: ARGS }); } catch {
  try { browser = await pw.chromium.launch({ args: ARGS }); } catch {
    console.log('Captures ignorées : navigateur absent'); if (serveur) serveur.kill(); process.exit(0);
  }
}
const liste = [];
const wait = (p, ms) => p.waitForTimeout(ms);
const ouvrir = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'fr-CH' });
  const page = await ctx.newPage();
  return { ctx, page };
};
const cap = async (page, nom, w, full = false) => { const f = `${nom}-${w}.png`; await page.mouse.move(0, 0); await page.waitForTimeout(80); await page.screenshot({ path: OUT + f, fullPage: full }); liste.push(f); };
const langue = async (page, w, lg) => { if (w >= 761) await page.click(`.langue[data-langue="${lg}"]`); else await page.selectOption('#langue-select', lg); await wait(page, 120); };
const versReponse = async (page, w, lg) => { // dates -> formulaire -> accusé -> réponse
  await page.click('#bt-reserver'); await wait(page, 350);
  await page.click('[data-iso="2026-12-07"]'); await page.click('[data-iso="2026-12-10"]'); await wait(page, 250);
  await page.click('#bt-direct'); await wait(page, 250);
  await page.fill('#f-prenom', 'Invité'); await page.fill('#f-email', 'invite@example.test');
  await page.click('#p-action button[type=submit]'); await wait(page, 200);
  await page.click('#bt-envoyer'); await wait(page, 250);
  await page.click('#p-action .bouton-plein'); await wait(page, 300);
};

const mesures = [];
const prete = async (page) => { await page.waitForFunction(() => document.documentElement.dataset.scene === 'ready' || document.querySelector('.scene.fixe'), null, { timeout: 40000 }).catch(() => {}); };
const infoScene = (page) => page.evaluate(() => { let r = 'n/a'; try { const c = document.createElement('canvas'); const g = c.getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); r = g.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch (x) { r = 'erreur ' + x.message; } const f = document.querySelector('.scene.fixe'); return { renderer: r, scene: document.documentElement.dataset.scene || '(aucun)', fixe: !!(f && getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().width > 0), sw: document.documentElement.scrollWidth, iw: window.innerWidth }; });
// Signature à 1280 : graphe, trois captures à t+0,3 / 0,8 / 1,5 s après le début de visibilité (page neuve, défilement jusqu'à #graphe, chrono = début du défilement)
for (const [nom, ms] of [['t300', 300], ['t800', 800], ['t1500', 1500]]) {
  const { ctx, page } = await ouvrir(1280, 800);
  await page.goto(URL, { waitUntil: 'load' }); await prete(page); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#graphe').scrollIntoView({ block: 'start' })); const t0 = Date.now();
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  const f = `graphe-${nom}-1280.png`; await page.screenshot({ path: OUT + f }); liste.push(f); await ctx.close();
}
for (const [w, h] of [[1280, 800], [390, 844]]) {
  // Parcours principal
  {
    const { ctx, page } = await ouvrir(w, h);
    await page.goto(URL, { waitUntil: 'load' }); await prete(page); const info = await infoScene(page);
    mesures.push(`largeur ${w} : renderer WebGL = ${info.renderer} ; data-scene = ${info.scene} ; .scene.fixe affichée = ${info.fixe} ; scrollWidth ${info.sw} / innerWidth ${info.iw}`);
    await page.mouse.move(0, 0); await wait(page, 300);
    const instants = {}; const tD = Date.now(); const ecoule = () => Date.now() - tD;
    await page.evaluate(() => window.__rejouerCrete()); const tR = Date.now(); const dep = () => Date.now() - tR;
    // chrono = appel de __rejouerCrete ; la capture (screenshot) dure quelques dizaines de ms : instants réels notés dans mesures-scene.txt
    await page.screenshot({ path: OUT + `accueil-t0-${w}.png` }); liste.push(`accueil-t0-${w}.png`); instants.t0 = dep();
    await wait(page, Math.max(0, 500 - dep())); await page.screenshot({ path: OUT + `accueil-t500-${w}.png` }); liste.push(`accueil-t500-${w}.png`); instants.t500 = dep();
    await wait(page, Math.max(0, 1500 - dep())); await page.screenshot({ path: OUT + `accueil-t1500-${w}.png` }); liste.push(`accueil-t1500-${w}.png`); instants.t1500 = dep();
    await wait(page, Math.max(0, 3000 - dep())); await page.screenshot({ path: OUT + `accueil-t3000-${w}.png` }); liste.push(`accueil-t3000-${w}.png`); instants.t3000 = dep();
    mesures.push(`   instants réels des captures (ms après l'appel de __rejouerCrete) : t0=${instants.t0} t500=${instants.t500} t1500=${instants.t1500} t3000=${instants.t3000}`);
    // Mouvement réduit : capture à t+0,3 s après ready
    { const ctxR = await browser.newContext({ viewport: { width: w, height: h }, locale: 'fr-CH', reducedMotion: 'reduce' }); const pr = await ctxR.newPage(); await pr.goto(URL, { waitUntil: 'load' }); await prete(pr); await pr.waitForTimeout(300); await pr.mouse.move(0, 0); await pr.screenshot({ path: OUT + `accueil-reduced-${w}.png` }); liste.push(`accueil-reduced-${w}.png`); await ctxR.close(); }
    // Défilement vers le graphe
    { const pd = await (await ouvrir(w, h)).page; await pd.goto(URL, { waitUntil: 'load' }); await prete(pd); await pd.waitForTimeout(300);
      await pd.evaluate(() => document.querySelector('#graphe').scrollIntoView({ block: 'start', behavior: 'instant' })); await pd.waitForTimeout(1800); await pd.mouse.move(0, 0); await pd.screenshot({ path: OUT + `accueil-defile-${w}.png` }); liste.push(`accueil-defile-${w}.png`);
      const sw = await pd.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); mesures.push(`   après défilement : scrollWidth ${sw[0]} / innerWidth ${sw[1]}`); await pd.context().close(); }
    // Premier clic
    { const pc = await (await ouvrir(w, h)).page; await pc.goto(URL, { waitUntil: 'load' }); await prete(pc); await pc.waitForTimeout(400);
      await pc.click('#bt-voir'); await pc.waitForTimeout(300); await pc.mouse.move(0, 0); await pc.screenshot({ path: OUT + `premier-clic-${w}.png` }); liste.push(`premier-clic-${w}.png`); await pc.context().close(); }
    if (w === 390) { // mesures réelles des étiquettes du graphe (taille de police calculée, hauteur du rectangle, rotation, échelle du SVG)
      const m = await page.evaluate(() => {
        const svg = document.querySelector('#plot svg'); const vb = svg.viewBox.baseVal; const ech = svg.getBoundingClientRect().width / vb.width;
        const l = [...svg.querySelectorAll('text')].filter((t) => getComputedStyle(t).display !== 'none').map((t) => {
          const r = t.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(t).fontSize) * ech;
          return `${t.textContent.trim()}=${fs.toFixed(1)}px/h${r.height.toFixed(1)}${t.getAttribute('transform') ? '/ROTATION' : ''}`;
        });
        return `echelle SVG ${ech.toFixed(2)} ; ${l.length} étiquettes visibles : ${l.join(' ; ')}`;
      });
      writeFileSync(OUT + 'mesures-graphe-390.txt', m + `\ninstants réels (ms après __rejouerCrete) : t0=${instants.t0} t500=${instants.t500} t1500=${instants.t1500} t3000=${instants.t3000}\n`); liste.push('mesures-graphe-390.txt');
    }
    await page.click('#bt-reserver'); await wait(page, 350); await cap(page, 'panneau', w);
    await page.click('[data-iso="2026-12-07"]'); await page.click('[data-iso="2026-12-10"]'); await wait(page, 300);
    await cap(page, 'dates-libres', w);
    await page.locator('.faq-q summary').first().click(); await wait(page, 300);
    await page.evaluate(() => { const c = document.querySelector('#p-corps'), q = document.querySelector('#p-corps .faq-q[open]'); c.scrollTop += q.getBoundingClientRect().top - c.getBoundingClientRect().top - 20; }); await wait(page, 150); // la capture commence sur le titre « Questions fréquentes », rien de coupé sous l'en-tête
    await cap(page, 'faq-ouverte', w);
    await page.locator('.faq-q[open] summary').first().click(); // refermer
    await page.click('#bt-direct'); await wait(page, 250);
    await page.fill('#f-prenom', 'Invité'); await page.fill('#f-email', 'invite@example.test'); await page.fill('#f-message', 'Bonjour, deux adultes et deux enfants.');
    await cap(page, 'formulaire', w);
    await page.click('#p-action button[type=submit]'); await wait(page, 250); await cap(page, 'relecture', w);
    await page.click('#bt-envoyer'); await wait(page, 300); await cap(page, 'accuse', w);
    await page.click('button:has-text("Retour aux dates")');
    await page.click('text=Demander ces dates à l’hôte'); await page.click('button:has-text("Relire ma demande")');
    await page.click('#bt-envoyer'); await wait(page, 300); await cap(page, 'doublon', w);
    await page.click('button:has-text("Retour aux dates")');
    await page.click('[data-iso="2026-12-12"]'); await page.click('[data-iso="2026-12-19"]'); await wait(page, 300);
    await cap(page, 'aiguillage-immocrans', w);
    await page.keyboard.press('Escape'); await wait(page, 300);
    await page.click('#bt-reserver'); await page.click('#panneau button:has-text("Vue hôte")'); await wait(page, 300);
    await cap(page, 'hote-fiche', w, true);
    await page.click('#bt-vers-rep'); await wait(page, 300);
    await page.click('button:has-text("Titre d’annonce Airbnb")'); await wait(page, 400); await cap(page, 'reponse-airbnb', w, true);
    await page.click('button:has-text("Brouillon IA piégé")'); await wait(page, 300); await cap(page, 'reponse-piege', w, true);
    await page.click('button:has-text("Brouillon correct")'); await wait(page, 300); await cap(page, 'reponse-correct', w, true);
    await ctx.close();
  }
  { // Pivot : calendrier, détail, gain, panneau avec prix
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'fr-CH' });
    await ctx.route('**/calendrier.ics', (r) => r.fulfill({ contentType: 'text/calendar', body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n' })); // dates des Mondiaux libérées pour la capture du panneau
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' }); await wait(page, 500);
    await page.click(w >= 761 ? '#bt-voir' : '#bt-voir'); await wait(page, 600);
    await cap(page, 'calendrier', w);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.per[data-id="mondiaux"] .per-ligne').click(); await wait(page, 450);
    await page.locator('.per[data-id="mondiaux"]').scrollIntoViewIfNeeded(); await wait(page, 200);
    await cap(page, 'calendrier-mondiaux-ouvert', w);
    await page.evaluate(() => document.querySelector('section.gain .sc-col h3').scrollIntoView({ block: 'start' })); await wait(page, 300); // titres de scénario visibles sous l'en-tête (scroll-margin-top)
    await cap(page, 'gain', w);
    const choisir = async (iso) => { for (let i = 0; i < 16; i++) { if (await page.locator(`[data-iso="${iso}"]`).count()) { await page.click(`[data-iso="${iso}"]`); return; } await page.click('button[aria-label="Mois suivant"]'); await wait(page, 50); } };
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#bt-reserver'); await wait(page, 350);
    await choisir('2027-02-06'); await choisir('2027-02-13'); await wait(page, 350);
    await page.locator('#p-corps').getByText(/nuits · libre/).first().scrollIntoViewIfNeeded(); await page.locator('#p-corps').evaluate((e) => { e.scrollTop += 120; }); await wait(page, 200); await cap(page, 'panneau-mondiaux', w);
    await page.keyboard.press('Escape'); await wait(page, 300);
    await page.click('#bt-reserver'); await wait(page, 350);
    await page.click('button[aria-label="Mois précédent"]').catch(() => {});
    for (let i = 0; i < 3 && !(await page.locator('[data-iso="2027-01-10"]').count()); i++) { await page.click('button[aria-label="Mois précédent"]').catch(() => {}); await wait(page, 50); }
    await page.click('#panneau button:has-text("Effacer")').catch(() => {});
    await choisir('2027-01-10'); await choisir('2027-01-13'); await wait(page, 350);
    await page.locator('#p-corps').getByText(/nuits · libre/).first().scrollIntoViewIfNeeded(); await page.locator('#p-corps').evaluate((e) => { e.scrollTop += 120; }); await wait(page, 200);
    await cap(page, 'panneau-sur-demande', w);
    await ctx.close();
  }
  { // Avant
    const { ctx, page } = await ouvrir(w, h);
    await page.goto(URL, { waitUntil: 'load' }); await wait(page, 400);
    await page.click('[data-mode="avant"]'); await page.click('#bt-reserver'); await wait(page, 350);
    await cap(page, 'avant-panneau', w); await ctx.close();
  }
  for (const lg of ['de', 'ru']) {
    const { ctx, page } = await ouvrir(w, h);
    await page.goto(URL, { waitUntil: 'load' }); await wait(page, 400);
    await langue(page, w, lg);
    await page.click('#bt-reserver'); await wait(page, 350);
    await cap(page, `panneau-${lg}`, w); await ctx.close();
  }
  { // reponse-it
    const { ctx, page } = await ouvrir(w, h);
    await page.goto(URL, { waitUntil: 'load' }); await wait(page, 400);
    await langue(page, w, 'it'); await versReponse(page, w, 'it');
    await cap(page, 'reponse-it', w, true); await ctx.close();
  }
}
writeFileSync(OUT + 'mesures-scene.txt', 'Chrome sans écran, args SwiftShader (--use-angle=swiftshader --enable-unsafe-swiftshader --use-gl=angle --ignore-gpu-blocklist)\n' + mesures.join('\n') + '\n'); liste.push('mesures-scene.txt');
await browser.close();
if (serveur) serveur.kill();
console.log(`${liste.length} captures dans ${OUT} : ${liste.join(' ')}`);
