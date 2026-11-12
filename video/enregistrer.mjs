// Enregistre les plans bruts 1 à 10 : node video/enregistrer.mjs [numéros...]  (depuis la racine de l'équipe)
// Playwright : `npm i -D playwright && npx playwright install chromium` (ou canal Chrome local) ; sinon PLAYWRIGHT_PATH=<chemin de playwright/index.mjs>
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, renameSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BRUT = path.join(RACINE, 'video/brut');
const TMP = path.join(BRUT, '_tmp');
const PORT = process.env.PORT_PROTO || '8080', PORTC = process.env.PORT_CARTES || '8081';
const PROTO = `http://localhost:${PORT}/`, CARTES = `http://localhost:${PORTC}/`;
const DUREES = { 1: 3, 2: 20, 3: 22, 4: 22, 5: 12, 6: 22, 7: 24, 8: 26, 9: 16, 10: 12 };
const ICS_VIDE = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'; // libère les dates synthétiques de février 2027 (comme tests/e2e.spec.mjs)
const veut = process.argv.slice(2).map(Number);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const repond = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };

const serveurs = [];
if (!(await repond(PROTO))) serveurs.push(spawn('python3', ['-m', 'http.server', PORT, '--directory', path.join(RACINE, 'prototype')], { stdio: 'ignore' }));
if (!(await repond(CARTES))) serveurs.push(spawn('python3', ['-m', 'http.server', PORTC, '--directory', path.join(RACINE, 'video/cartes')], { stdio: 'ignore' }));
for (let i = 0; i < 40 && !((await repond(PROTO)) && (await repond(CARTES))); i++) await pause(200);

mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'] }); // rendu logiciel : la scène WebGL de l'accueil

// Un plan = un contexte vidéo. setup(page) avant la marque (non filmé après découpe), corps(page, t) après.
async function enregistrer(num, { url, libre = false, avantMarque = false, calage = null, setup, corps }) {
  if (veut.length && !veut.includes(num)) return;
  const dir = path.join(TMP, `p${num}`);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } }, locale: 'fr-CH', reducedMotion: 'no-preference' });
  if (libre) await ctx.route('**/calendrier.ics', (r) => r.fulfill({ contentType: 'text/calendar', body: ICS_VIDE }));
  const page = await ctx.newPage();
  const t0 = Date.now();
  let marque;
  if (avantMarque) { marque = Date.now() - t0; await page.goto(url, { waitUntil: 'load' }); }
  else { await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(600); if (setup) await setup(page); await page.waitForTimeout(300); marque = Date.now() - t0; }
  let debut = Date.now();
  const t = (ms) => { const reste = debut + ms - Date.now(); return reste > 0 ? pause(reste) : Promise.resolve(); }; // attend l'instant ms depuis la marque
  const dur = DUREES[num];
  const refaire = () => { marque = Date.now() - t0; debut = Date.now(); }; // corps peut recaler la marque (ex. plan 1 : juste après __rejouerCrete)
  await corps(page, t, refaire);
  await t(dur * 1000 + 300);
  await ctx.close();
  const webm = path.join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
  if (process.env.SANS_FFMPEG) { // machine sans ffmpeg : on garde le webm et la marque, la conversion se fait ailleurs (video/convertir.mjs)
    mkdirSync(path.join(BRUT, '_webm'), { recursive: true }); renameSync(webm, path.join(BRUT, '_webm', `plan-${num}.webm`)); writeFileSync(path.join(BRUT, '_webm', `plan-${num}.json`), JSON.stringify({ marque, dur })); console.log(`plan ${num} -> webm brut (marque ${marque} ms)`); return;
  }
  if (calage === 'reset') { // le rendu logiciel retarde l'écran : la marque est recalée sur l'instant réel où la crête repart de zéro (fin de la dernière image figée de la crête)
    const j = spawnSync('ffmpeg', ['-i', webm, '-vf', 'crop=1280:400:0:300,freezedetect=n=-50dB:d=0.3', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const fins = [...j.matchAll(/freeze_end: ([0-9.]+)/g)].map((m) => parseFloat(m[1]));
    if (fins.length) { marque = Math.max(0, fins[fins.length - 1] * 1000 - 40); console.log(`plan ${num} : calage sur le départ de la crête à ${(marque / 1000).toFixed(2)} s du brut`); }
  }
  const sortie = path.join(BRUT, `plan-${num}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (marque / 1000).toFixed(2), '-i', webm, '-t', String(dur), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', sortie]);
  console.log(`plan ${num} -> ${sortie} (marque ${marque} ms)`);
}

// Défilement lent et régulier : px pixels répartis sur ms millisecondes, souris à la marge gauche (aucune bulle).
async function defile(page, px, ms, pas = 40) {
  const n = Math.max(1, Math.round(ms / pas)); let fait = 0;
  for (let i = 1; i <= n; i++) { const cible = Math.round((px * i) / n); const d = cible - fait; fait = cible; if (d) await page.mouse.wheel(0, d); await page.waitForTimeout(pas); }
}
const prete = (page) => page.waitForFunction(() => document.documentElement.dataset.scene === 'ready' || document.querySelector('.scene.fixe'), null, { timeout: 40000 });
const loin = (page) => page.mouse.move(4, 400);
const haut = (loc) => loc.evaluate((e) => e.getBoundingClientRect().top);
const bas = (loc) => loc.evaluate((e) => e.getBoundingClientRect().bottom);
const aller = async (page, loc, marge, ms) => { const d = (await haut(loc)) - marge; if (d > 0) await defile(page, d, ms); return d; };
const versCalendrier = async (page) => { await page.click('#bt-voir'); await page.waitForTimeout(1300); await loin(page); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200); };
const instantAvant = (loc, marge) => loc.evaluate((e, m) => window.scrollBy(0, e.getBoundingClientRect().top - m), marge);

// 10 : carte de fin
await enregistrer(10, { url: CARTES + 'fin.html', avantMarque: true, corps: async (p, t) => { await t(DUREES[10] * 1000); } });

// 1 : ouverture sur la scène de nuit : tracé de la crête (1,5 s) puis allumage du pic (rejoué à la marque pour être filmé en entier)
await enregistrer(1, { url: PROTO, calage: 'reset', setup: async (p) => { await prete(p); await p.mouse.move(4, 400); await p.waitForTimeout(500); }, corps: async (p, t, refaire) => {
  await p.evaluate(() => window.__rejouerCrete()); refaire(); await t(DUREES[1] * 1000);
} });

// 2 : scène de nuit 5 s (souris immobile), défilement doux 3 s jusqu'au graphe (90 px sous l'en-tête), puis barres, 130, 280, 465
await enregistrer(2, { url: PROTO, setup: async (p) => { await prete(p); await p.mouse.move(4, 400); await p.waitForTimeout(500); }, corps: async (p, t) => {
  await t(5000);
  const d = (await haut(p.locator('#graphe'))) - (76 + 90);
  // interpolation pilotée par l'horloge (rendu logiciel : les molettes de défilement sont retardées, l'arrivée doit tomber à 3 s quoi qu'il arrive)
  if (d > 0) await p.evaluate(([dist, ms]) => new Promise((ok) => { const y0 = scrollY, t0 = performance.now(); const f = (n) => { const k = Math.min(1, (n - t0) / ms); scrollTo(0, y0 + dist * (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k))); k < 1 ? requestAnimationFrame(f) : ok(); }; requestAnimationFrame(f); }), [d, 3000]);
  await t(DUREES[2] * 1000);
} });

// 3 : clic calendrier, cascade, défilement sur les 11 lignes
await enregistrer(3, { url: PROTO, setup: async (p) => { await prete(p); await loin(p); await p.waitForTimeout(400); }, corps: async (p, t) => {
  await t(1000); await p.click('#bt-voir'); await loin(p);
  await t(5000);
  const dernier = p.locator('.per').last();
  const d = Math.max(0, (await bas(dernier)) - 640);
  await defile(p, d, 14500);
} });

// 4 : détail Mondiaux
await enregistrer(4, { url: PROTO, setup: async (p) => { await versCalendrier(p); await instantAvant(p.locator('.per[data-id="mondiaux"]'), 110); await p.waitForTimeout(300); }, corps: async (p, t) => {
  await t(800); await p.locator('.per[data-id="mondiaux"] .per-ligne').click(); await loin(p);
  await t(2500);
  const det = p.locator('#d-mondiaux');
  const d = Math.max(0, (await bas(det)) - 660);
  await defile(p, d, 16000);
} });

// 5 : défilement vers « Ski janvier »
await enregistrer(5, { url: PROTO, setup: async (p) => { await versCalendrier(p); }, corps: async (p, t) => {
  await t(700);
  const j = p.locator('.per[data-id="janv"]');
  await aller(p, j, 200, 8000);
} });

// 6 : bloc Gain, hypothèses, invalidations
await enregistrer(6, { url: PROTO, setup: async (p) => { await versCalendrier(p); await instantAvant(p.locator('.per').last(), 300); await p.waitForTimeout(200); }, corps: async (p, t) => {
  await t(500);
  await aller(p, p.locator('section.gain'), 70, 4500);
  await t(6500);
  const sum = p.locator('section.gain details:has(> summary:has-text("hypoth")) > summary').first();
  await aller(p, sum, 360, 1500);
  await t(8500);
  await sum.click(); await loin(p);
  await t(9500);
  await defile(p, 520, 4500);
  await t(15000);
  await sum.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await p.waitForTimeout(200);
  await sum.click(); await loin(p);
  await t(16000);
  await aller(p, p.locator('section.inval'), 90, 4000);
} });

// 7 : réservation 6 -> 13 février 2027, repère marché, canaux
await enregistrer(7, { url: PROTO, setup: async (p) => { await prete(p); await loin(p); await p.waitForTimeout(400); }, corps: async (p, t) => {
  await t(1000); await p.click('#bt-reserver'); await p.waitForTimeout(400);
  await t(3000);
  for (let i = 0; i < 16 && !(await p.locator('[data-iso="2027-02-06"]').count()); i++) { await p.click('button[aria-label="Mois suivant"]'); await p.waitForTimeout(450); }
  await t(7000); await p.click('[data-iso="2027-02-06"]');
  await t(8500); await p.click('[data-iso="2027-02-13"]');
  await p.mouse.move(1000, 400);
  await t(12000);
  const corps = p.locator('#p-corps');
  const fin = p.locator('#p-corps').getByText('Séjour de 7 nuits et plus').first();
  const d = await fin.evaluate((e) => { const c = document.querySelector('#p-corps').getBoundingClientRect(); return e.getBoundingClientRect().bottom - c.bottom + 40; });
  if (d > 0) await defile(p, d, 9000);
} });

// 8 : vérificateur
await enregistrer(8, { url: PROTO, setup: async (p) => { await prete(p); await loin(p); await p.waitForTimeout(400); }, corps: async (p, t) => {
  await t(800); await p.click('#bt-verif'); await loin(p);
  await t(2500); await p.click('button:has-text("Titre d’annonce Airbnb")'); await loin(p);
  await t(4000); await defile(p, 380, 5500);
  await t(10500); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
  await p.click('button:has-text("Brouillon IA piégé")'); await loin(p);
  await t(12500); await defile(p, 380, 5500);
  await t(18500); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  await p.click('.langue[data-langue="de"]'); await loin(p);
} });

// 9 : terminal
await enregistrer(9, { url: CARTES + 'terminal.html', avantMarque: true, corps: async (p, t) => { await t(16000); } });

await browser.close();
serveurs.forEach((s) => s.kill());
rmSync(TMP, { recursive: true, force: true });
