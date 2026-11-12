// Convertit les webm bruts enregistrés sur une machine sans ffmpeg : node video/convertir.mjs [numéros...]  (lit video/brut/_webm/plan-N.webm + .json)
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(RACINE, 'video/brut/_webm');
const veut = process.argv.slice(2).map(Number);
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
  const num = Number(f.match(/plan-(\d+)/)[1]); if (veut.length && !veut.includes(num)) continue;
  let { marque, dur } = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
  if (num === 1) { // plan 1 : l'horloge de la vidéo logicielle dérive de l'horloge réelle ; on cale sur l'image la plus sombre de la crête (instant où __rejouerCrete la remet à zéro), après 0,6 s
    const r = spawnSync('ffmpeg', ['-i', path.join(DIR, 'plan-1.webm'), '-vf', 'fps=30,crop=1280:300:0:420,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8' }).stdout;
    const v = [...r.matchAll(/pts_time:([0-9.]+)\s+lavfi.signalstats.YAVG=([0-9.]+)/g)].map((m) => [parseFloat(m[1]), parseFloat(m[2])]).filter((x) => x[0] > 0.6);
    if (v.length) { const mini = v.reduce((a, b) => (b[1] < a[1] ? b : a)); marque = Math.max(0, mini[0] * 1000 - 60); console.log(`plan 1 : départ de la crête détecté à ${mini[0].toFixed(2)} s du brut (luminosité ${mini[1]})`); }
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (marque / 1000).toFixed(2), '-i', path.join(DIR, `plan-${num}.webm`), '-t', String(dur), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', path.join(RACINE, `video/brut/plan-${num}.mp4`)]);
  console.log(`plan ${num} converti (marque ${marque} ms)`);
}
