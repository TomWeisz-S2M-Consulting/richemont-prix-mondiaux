// Mesures de la scène d'accueil : node tests/mesurer-scene.mjs -> captures/apres/mesures-degagement.txt, repli-1280.png, repli-390.png
// Pour chaque largeur (1280, 390) et chaque mode (WebGL SwiftShader, repli sans WebGL) : écart entre la crête et chaque bouton ou texte
// de la scène (bruit du shader déduit, doit rester ≥ 16 px), et écart horizontal entre le sommet de la crête et le centre de l'étiquette « CHF 465 » (< 8 px).
let pw;
try { pw = await import('playwright'); } catch {
  if (process.env.PLAYWRIGHT_PATH) { try { pw = await import(process.env.PLAYWRIGHT_PATH); } catch { /* ignoré */ } }
}
if (!pw) { console.log('Mesures ignorées : Playwright absent'); process.exit(0); }
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';

const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const URL = process.env.E2E_URL || `http://127.0.0.1:${port}/`;
const serveur = process.env.E2E_URL ? null : spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', 'prototype'], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* attente */ } await new Promise((r) => setTimeout(r, 200)); }
if (!/Richemont 3B/.test(await fetch(URL).then((r) => r.text()).catch(() => ''))) { console.log(`Arrêt : ${URL} ne sert pas le prototype`); if (serveur) serveur.kill(); process.exit(1); }

const MODES = {
  webgl: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'],
  repli: ['--disable-webgl', '--disable-3d-apis'],
};
const lignes = [`# Dégagement de la crête et axe du pic, ${new Date().toISOString().slice(0, 16)} (Chrome sans écran, Playwright)`, 'Règle : crête − bruit du shader ≥ 16 px sous chaque bouton et chaque texte de la scène ; |sommet − centre de l\'étiquette| < 8 px.'];
let echec = false;
for (const [mode, args] of Object.entries(MODES)) {
  const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args });
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    await p.goto(URL);
    await p.waitForFunction(() => document.documentElement.dataset.scene === 'ready' || document.querySelector('.scene.fixe'), null, { timeout: 40000 });
    await p.waitForTimeout(3500);
    const m = await p.evaluate(() => {
      const fixe = document.querySelector('.scene').classList.contains('fixe');
      const img = document.querySelector('.scene img'); const src = fixe ? (img.currentSrc || img.src).split('/').pop() : 'canvas';
      const bruit = window.__creteBruit();
      const cibles = [...document.querySelectorAll('#nuit h1, #nuit .lede, #nuit .actions .bouton, #nuit .nuit-leg')];
      const ecarts = cibles.map((e) => {
        const r = e.getBoundingClientRect(); let min = Infinity;
        for (let x = Math.max(0, r.left); x <= Math.min(innerWidth, r.right); x += 2) {
          const y = window.__creteY(x);
          // texte au-dessus de la crête : écart = crête − bas du texte ; texte sous la crête (légende, dans la masse) : écart = haut du texte − crête
          const d = y < r.top ? r.top - (y + bruit) : (y - bruit) - r.bottom;
          min = Math.min(min, d);
        }
        return { nom: e.id || e.textContent.trim().slice(0, 28), ecart: Math.round(min) };
      });
      const pic = document.getElementById('pic').getBoundingClientRect(); const pc = pic.left + pic.width / 2;
      let sx = pc, sy = Infinity;
      for (let x = pc - 80; x <= pc + 80; x += 0.5) { const y = window.__creteY(x); if (y < sy) { sy = y; sx = x; } }
      return { fixe, src, bruit: Math.round(bruit), ecarts, axe: Math.round(Math.abs(sx - pc) * 10) / 10, picOn: document.getElementById('pic').classList.contains('on'), sw: document.documentElement.scrollWidth };
    });
    const min = Math.min(...m.ecarts.map((e) => e.ecart));
    const ok = min >= 16 && m.axe < 8 && m.picOn && m.sw === w && (mode === 'repli') === m.fixe;
    if (!ok) echec = true;
    lignes.push(`${ok ? 'OK ' : 'KO '} ${mode} ${w} px : image ${m.src} · bruit déduit ${m.bruit} px · écart minimal ${min} px (${m.ecarts.map((e) => `${e.nom} ${e.ecart}`).join(' ; ')}) · sommet − étiquette ${m.axe} px · étiquette allumée ${m.picOn} · scrollWidth ${m.sw}`);
    if (mode === 'repli') await p.screenshot({ path: `captures/apres/repli-${w}.png` });
    await p.close();
  }
  await b.close();
}
writeFileSync('captures/apres/mesures-degagement.txt', lignes.join('\n') + '\n');
console.log(lignes.join('\n'));
if (serveur) serveur.kill();
process.exit(echec ? 1 : 0);
