/* Scène du premier écran : la nuit de Crans-Montana en lignes de niveau (shader GLSL).
   La crête EST le calendrier des prix : une période par pas, hauteur = prix cible de lib/prix.js calendrier().
   Le pic des Mondiaux s'allume en or quand le tracé l'atteint. Repli sans WebGL : img/nuit.webp (rendue par ce shader).
   Mouvement réduit : image finale dessinée une fois, sans boucle. */

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FS = `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;uniform float P[12];uniform float peakX;uniform float base;uniform float x0;uniform float amp;uniform float rv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.02+vec2(3.1,1.7);a*=.5;}return s;}
float ridge(float x){float xx=(x-x0)/(1.-x0);float u=clamp(xx,0.,.9999)*11.;int i=int(floor(u));float f=fract(u);f=f*f*(3.-2.*f);float a=0.,b=0.;for(int k=0;k<12;k++){if(k==i)a=P[k];if(k==i+1)b=P[k];}float h=mix(a,b,f);if(xx<0.)h=P[0]*(1.+xx*1.2)+fbm(vec2(x*5.,1.))*.12*(-xx);return base+h*amp+(fbm(vec2(x*9.,2.))-.5)*.05;}
void main(){vec2 uv=gl_FragCoord.xy/r;float asp=r.x/r.y;
 vec3 sky=mix(vec3(.025,.06,.05),vec3(.07,.13,.12),smoothstep(.2,1.,uv.y));
 float dm=length((uv-vec2(.84,.84))*vec2(asp,1.));sky+=vec3(.95,.9,.75)*(smoothstep(.028,.018,dm)*.55+exp(-dm*dm*60.)*.22);
 vec2 sp=uv*vec2(asp,1.)*140.;vec2 si=floor(sp);float sr=hash(si);float star=smoothstep(.985,1.,sr)*pow(max(0.,1.-length(fract(sp)-.5)*2.),6.)*(.6+.4*sin(t*1.5+sr*50.));
 sky+=vec3(1.,.95,.85)*star*smoothstep(.35,.9,uv.y);
 vec2 fp=uv*vec2(asp,1.)*40.+vec2(t*.02+(m.x-.5)*.3,-t*.06);vec2 fi=floor(fp);float fr=hash(fi+7.);vec2 ff=fract(fp)-.5+vec2(sin(t*.7+fr*30.)*.2,0.);float flake=smoothstep(.985,1.,fr)*smoothstep(.12,.0,length(ff));
 float yr=ridge(uv.x);float dy=uv.y-yr;
 float vis=1.-smoothstep(rv-.06,rv,uv.x);
 float ridgeLine=smoothstep(.0045,.0,abs(dy))*vis;float body=step(dy,0.)*vis;
 float h=(yr-uv.y)*6.+fbm(vec2(uv.x*6.,uv.y*8.))*1.2;
 float contour=smoothstep(.05,.0,abs(fract(h*2.5)-.5))*body;
 float fine=smoothstep(.025,.0,abs(fract(h*10.)-.5))*body*.3;
 vec3 mount=mix(vec3(.17,.23,.21),vec3(.018,.04,.036),smoothstep(0.,-.32,dy));mount+=vec3(.5,.38,.18)*exp(-abs(uv.x-peakX)*6.)*smoothstep(0.,-.25,dy)*.35*smoothstep(0.,-.02,dy);
 vec3 col=mix(sky,mount,body);
 col+=vec3(.93,.90,.82)*(contour*.16+fine*.08)*(1.-smoothstep(0.,-.6,dy))*vis;
 col+=vec3(.95,.92,.85)*ridgeLine*.85;
 float px=peakX;float py=ridge(px);float dpk=length((uv-vec2(px,py))*vec2(asp,1.));float lit=smoothstep(px,px+.05,rv);
 col+=(vec3(1.,.78,.42)*exp(-dpk*dpk*280.)*.68+vec3(1.,.7,.35)*exp(-dpk*16.)*.14)*lit;
 col+=vec3(1.,.9,.7)*smoothstep(.007,.0,abs(dy))*smoothstep(.08,.0,abs(uv.x-px))*1.3*lit;
 col+=vec3(1.)*flake*.7*(1.-body*.6);
 col+=(hash(gl_FragCoord.xy+fract(t))-.5)*.02;
 gl_FragColor=vec4(col,1.);}`;

/** Hauteurs de la crête : cible de chaque période « ok » ; période sans prix recommandé dessinée en creux (¾ de la plus basse cible), jamais comme un prix. */
export function hauteurs(cal) {
  const ok = cal.filter((p) => p.statut === 'ok').map((p) => p.cible);
  const creux = Math.round(Math.min(...ok) * 0.75);
  const v = cal.map((p) => (p.statut === 'ok' ? p.cible : creux));
  while (v.length < 12) v.push(v[v.length - 1]);
  return v.slice(0, 12);
}

export function demarrerScene({ cal, idPic = 'mondiaux' }) {
  const scene = document.getElementById('scene'), canvas = document.getElementById('gl'), pk = document.getElementById('pic');
  if (!scene || !canvas || !cal || !cal.length) return;
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PRIX = hauteurs(cal), MAXV = Math.max(520, Math.max(...PRIX) + 55);
  const PIC = Math.max(0, cal.findIndex((p) => p.id === idPic)) / 11; // sommet de la crête : début du pas de la période (lissage entre deux périodes)
  const etroit = () => innerWidth < 640;
  const X0 = () => (etroit() ? 0.05 : 0.3), BASE = () => (etroit() ? 0.10 : 0.22), AMP = () => (etroit() ? 0.26 : 0.34);
  const crete = (x) => { const xx = (x - X0()) / (1 - X0()); const u = Math.min(Math.max(xx, 0), 0.9999) * 11, i = Math.floor(u); let f = u - i; f = f * f * (3 - 2 * f); return BASE() + (PRIX[i] / MAXV * (1 - f) + PRIX[i + 1] / MAXV * f) * AMP(); };
  const repli = () => { scene.classList.add('fixe'); pk.classList.add('on'); placerPic(X0() + PIC * (1 - X0())); };
  const placerPic = (px) => { let haut = 0; for (let dx = -0.04; dx <= 0.04; dx += 0.005) haut = Math.max(haut, crete(px + dx)); pk.style.left = `${px * 100}%`; pk.style.top = `${(1 - haut - 0.03) * 100}%`; };
  // Mesure (captures) : hauteur écran de la crête à l'abscisse x (px), sans le bruit ; BRUIT = écart maximal du bruit fbm du shader (±0,025 de la hauteur).
  window.__creteY = (xPx) => { const r = scene.getBoundingClientRect(); return r.top + (1 - crete(xPx / r.width)) * r.height; };
  window.__creteBruit = () => 0.025 * scene.getBoundingClientRect().height;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) { repli(); return; }
  const sh = (k, src) => { const o = gl.createShader(k); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  const par = gl.getExtension('KHR_parallel_shader_compile'); // compilation en parallèle : le titre monte sans attendre le shader
  const pret = () => (par ? gl.getProgramParameter(pr, par.COMPLETION_STATUS_KHR) : true);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  let lastW = 0, u = null, peakPx = 0.6, mx = 0.5, tx = 0.5, last = 0, tStart = 0, frames = 0, lance = false;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const logiciel = /swiftshader|llvmpipe|software/i.test(dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '');
  const taille = () => {
    if (!u) return;
    const w = scene.clientWidth, hh = scene.clientHeight; if (!w || !hh) return; lastW = w;
    const cible = logiciel ? 640 : Math.min(1280, w * Math.min(devicePixelRatio || 1, 1.5)), sc = cible / w;
    canvas.width = Math.round(w * sc); canvas.height = Math.round(hh * sc); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.r, canvas.width, canvas.height); gl.uniform1f(u.base, BASE()); gl.uniform1f(u.x0, X0()); gl.uniform1f(u.amp, AMP());
    peakPx = X0() + PIC * (1 - X0()); gl.uniform1f(u.peakX, peakPx); placerPic(peakPx);
    if (reduit) dessiner(performance.now());
  };
  const dessiner = (now) => {
    if (!tStart) tStart = now; mx += (tx - mx) * 0.03; frames++;
    const k = reduit ? 1 : Math.max(Math.min(1, (now - tStart) / 1500), Math.min(1, frames / 14)); const rv = 1.3 * (1 - (1 - k) ** 3);
    gl.uniform1f(u.rv, rv); gl.uniform1f(u.t, now / 1000 + 40); gl.uniform2f(u.m, mx, 0.5); gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (k >= 1 || rv > peakPx + 0.05) pk.classList.add('on');
  };
  const partir = () => {
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { repli(); return; }
    gl.useProgram(pr);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    u = Object.fromEntries(['r', 't', 'm', 'peakX', 'base', 'x0', 'amp', 'rv'].map((n) => [n, gl.getUniformLocation(pr, n)]));
    gl.uniform1fv(gl.getUniformLocation(pr, 'P'), new Float32Array(PRIX.map((v) => v / MAXV)));
    lance = true; scene.classList.add('pret'); document.documentElement.dataset.scene = 'ready';
    taille(); dessiner(performance.now());
  };
  // Rejoue le tracé de la crête depuis zéro (captures et vidéo : la compilation logicielle du shader peut prendre plusieurs secondes).
  window.__rejouerCrete = () => { tStart = 0; frames = 0; pk.classList.remove('on'); if (reduit && lance) dessiner(performance.now()); };
  addEventListener('resize', taille, { passive: true });
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth; }, { passive: true });
  const boucle = (now) => {
    if (!lance) { if (pret()) partir(); requestAnimationFrame(boucle); return; }
    if (scene.clientWidth && scene.clientWidth !== lastW) taille();
    if (reduit) { requestAnimationFrame(boucle); return; }
    if (!document.hidden && scene.offsetParent !== null && scrollY < innerHeight * 1.2 && now - last > (logiciel ? 80 : 16)) { last = now; dessiner(now); }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); repli(); }, { once: true });
}
