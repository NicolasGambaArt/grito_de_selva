/* ============================================================
   canvas.js — Motor de dibujo rupestre (stamp-brush)

   Enfoque inspirado en motores de pintura digital reales
   (Procreate, Rebelle, Krita). Cada pincel es un PNG procedural
   offscreen con textura irregular — se "estampa" muchas veces
   a lo largo del gesto con rotación y jitter. Esto hace que el
   trazo nunca se vea como una línea vectorial limpia.
   ============================================================ */

const Lienzo = (() => {
  let canvas = null;
  let ctx = null;
  let trazos = [];
  let activo = null;

  let VIDA_TRAZO_MS = 15000;
  let FADE_COLA_MS  = 5000;
  const setDuracionMs = (ms) => {
    VIDA_TRAZO_MS = Math.max(500, ms);
    FADE_COLA_MS  = Math.min(VIDA_TRAZO_MS * 0.5, 3000);
  };
  const PIGMENTOS = ['amarillo','rojo','verde','azul'];

  // ---------- setup ----------
  const redimensionar = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.floor(canvas.clientWidth  * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  };

  const init = (selector) => {
    canvas = document.querySelector(selector);
    ctx = canvas.getContext('2d', { alpha: true });
    redimensionar();
    construirPinceles();
    window.addEventListener('resize', redimensionar);
    requestAnimationFrame(pintar);
  };

  // ---------- paleta ----------
  const hexToRgb = (hex) => {
    const n = parseInt(hex.replace('#',''), 16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  };
  const PALETA = {
    amarillo: { base:'#d6a435', claro:'#edc56a', oscuro:'#7a5015' },
    rojo:     { base:'#b04a2a', claro:'#d4673c', oscuro:'#5c2310' },
    verde:    { base:'#7a8a3a', claro:'#a4b15a', oscuro:'#3d461a' },
    azul:     { base:'#3a4a8a', claro:'#6070ae', oscuro:'#1a2240' },
  };

  // ============================================================
  // PINCELES — generamos 3 texturas diferentes por pigmento
  // cada textura: 128x128 canvas con alpha irregular (no una esfera)
  // ============================================================
  const PINCEL_SIZE = 128;
  const PINCELES_POR_COLOR = 3;
  const pinceles = {}; // pigmento -> [canvas, canvas, canvas]

  const construirPinceles = () => {
    for (const p of PIGMENTOS) pinceles[p] = construirSetPinceles(p);
  };

  // Genera N variantes de pincel para un pigmento. Cada pincel es
  // un canvas 128x128 con una "huella" irregular:
  //   - base circular con bordes fragmentados
  //   - sobreposición de puntos (granos de pigmento)
  //   - veta de fibras (como cerdas mojadas)
  const construirSetPinceles = (pigmento) => {
    const arr = [];
    const col = PALETA[pigmento];
    const base   = hexToRgb(col.base);
    const claro  = hexToRgb(col.claro);
    const oscuro = hexToRgb(col.oscuro);

    for (let v = 0; v < PINCELES_POR_COLOR; v++) {
      const c = document.createElement('canvas');
      c.width = c.height = PINCEL_SIZE;
      const b = c.getContext('2d');
      const cx = PINCEL_SIZE/2, cy = PINCEL_SIZE/2;
      const R = PINCEL_SIZE * 0.42;

      // 1) Forma base irregular — polígono de ~18 lados con radios
      //    distintos. Crea un borde "mordido" en vez de circular.
      const lados = 22;
      b.save();
      b.beginPath();
      for (let i = 0; i < lados; i++) {
        const ang = (i / lados) * Math.PI * 2;
        const rr = R * (0.75 + Math.random() * 0.35);
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        if (i === 0) b.moveTo(x,y); else b.lineTo(x,y);
      }
      b.closePath();
      // gradiente radial para densidad en el centro
      const grad = b.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0,    `rgba(${claro.r},${claro.g},${claro.b},0.95)`);
      grad.addColorStop(0.45, `rgba(${base.r},${base.g},${base.b},0.9)`);
      grad.addColorStop(0.85, `rgba(${base.r},${base.g},${base.b},0.45)`);
      grad.addColorStop(1,    `rgba(${oscuro.r},${oscuro.g},${oscuro.b},0)`);
      b.fillStyle = grad;
      b.fill();
      b.restore();

      // 2) Zonas oscuras internas (charcos de pigmento) — multiply
      b.save();
      b.globalCompositeOperation = 'multiply';
      for (let k = 0; k < 6; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r  = Math.random() * R * 0.7;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        const rr = 4 + Math.random() * 12;
        const g2 = b.createRadialGradient(x,y,0, x,y,rr);
        g2.addColorStop(0, `rgba(${oscuro.r},${oscuro.g},${oscuro.b},0.55)`);
        g2.addColorStop(1, `rgba(${oscuro.r},${oscuro.g},${oscuro.b},0)`);
        b.fillStyle = g2;
        b.beginPath();
        b.arc(x, y, rr, 0, Math.PI*2);
        b.fill();
      }
      b.restore();

      // 3) Highlights internos (donde el pigmento se adelgaza)
      b.save();
      b.globalCompositeOperation = 'screen';
      for (let k = 0; k < 4; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r  = Math.random() * R * 0.6;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        const rr = 3 + Math.random() * 8;
        const g3 = b.createRadialGradient(x,y,0, x,y,rr);
        g3.addColorStop(0, `rgba(${claro.r},${claro.g},${claro.b},0.4)`);
        g3.addColorStop(1, `rgba(${claro.r},${claro.g},${claro.b},0)`);
        b.fillStyle = g3;
        b.beginPath();
        b.arc(x, y, rr, 0, Math.PI*2);
        b.fill();
      }
      b.restore();

      // 4) Granos — pixeles de pigmento seco
      b.save();
      const data = b.getImageData(0,0,PINCEL_SIZE,PINCEL_SIZE);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i+3] < 8) continue;
        // multiplicamos alpha por ruido para crear textura de poro
        const noise = 0.78 + Math.random() * 0.22;
        d[i+3] = Math.floor(d[i+3] * noise);
        // ocasionalmente, agujero (poro)
        if (Math.random() < 0.015) d[i+3] = 0;
      }
      b.putImageData(data, 0, 0);
      b.restore();

      // 5) Cerdas del pincel — pequeñas líneas radiales
      b.save();
      b.strokeStyle = `rgba(${oscuro.r},${oscuro.g},${oscuro.b},0.35)`;
      b.lineWidth = 0.8;
      b.lineCap = 'round';
      for (let k = 0; k < 26; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r1 = R * (0.25 + Math.random() * 0.3);
        const r2 = R * (0.75 + Math.random() * 0.2);
        b.beginPath();
        b.moveTo(cx + Math.cos(ang)*r1, cy + Math.sin(ang)*r1);
        b.lineTo(cx + Math.cos(ang)*r2, cy + Math.sin(ang)*r2);
        b.stroke();
      }
      b.restore();

      arr.push(c);
    }
    return arr;
  };

  // ============================================================
  // TEXTURA DE PAPEL/ROCA — pre-rendered, aplicada como mask
  // Simula la irregularidad de la superficie de piedra.
  // ============================================================
  let texturaRoca = null;
  const construirTexturaRoca = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const b = c.getContext('2d');
    const img = b.createImageData(256, 256);
    const d = img.data;
    // ruido azul-coherente fake: suma de varias frecuencias
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const n = (Math.random() * 0.6 + 0.4) * 255;
        d[i] = d[i+1] = d[i+2] = n;
        d[i+3] = 255;
      }
    }
    b.putImageData(img, 0, 0);
    // suavizado
    b.filter = 'blur(1.2px)';
    b.drawImage(c, 0, 0);
    b.filter = 'none';
    texturaRoca = c;
  };

  // ============================================================
  // GESTOS
  // ============================================================
  const empezar = (x, y, pigmento, grosorBase = 14) => {
    activo = {
      puntos: [{ x, y, t: performance.now(), presion: 1 }],
      pigmento,
      nacido: performance.now(),
      vida: VIDA_TRAZO_MS,
      grosor: grosorBase,
      semilla: Math.floor(Math.random() * 1e6),
    };
    trazos.push(activo);
  };

  const extender = (x, y) => {
    if (!activo) return;
    const last = activo.puntos[activo.puntos.length - 1];
    const dx = x - last.x, dy = y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.5) return;
    // presión según velocidad: rápido = más fino y con gaps
    const presion = Math.max(0.55, Math.min(1.1, 1.15 - d * 0.012));
    activo.puntos.push({ x, y, t: performance.now(), presion });
  };

  const terminar = () => { activo = null; };

  const limpiar = () => {
    trazos = [];
    activo = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // PRNG determinista por semilla — mantiene los mismos sellos
  // entre frames para que la textura no "parpadee" al redibujar.
  const mulberry32 = (seed) => {
    let a = seed | 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ============================================================
  // PINTADO — estampado a lo largo de la curva
  // ============================================================
  const pintarTrazo = (trazo, ahora) => {
    const edad = ahora - trazo.nacido;
    if (edad > trazo.vida) return false;

    let op = 1;
    const umbralFade = trazo.vida - FADE_COLA_MS;
    if (edad > umbralFade) op = 1 - (edad - umbralFade) / FADE_COLA_MS;
    op = Math.max(0, Math.min(1, op));

    const pts = trazo.puntos;
    if (pts.length === 0) return true;

    const setPinceles = pinceles[trazo.pigmento];
    const rand = mulberry32(trazo.semilla);

    // Espaciado de sellos — el clave para que se vea continuo pero texturizado
    // Procreate usa ~7-12% del tamaño del pincel. Nosotros usamos ~12% + jitter.
    const sizePincel = trazo.grosor * 2.4;
    const paso = sizePincel * 0.13;

    // Construimos la polilínea acumulada (longitudes) para estampar
    // equidistante a lo largo de la curva real.
    const segmentos = [];
    let longitudTotal = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i-1], b = pts[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      segmentos.push({ a, b, L, ini: longitudTotal });
      longitudTotal += L;
    }
    // Si es un solo punto, estampar una vez
    if (pts.length === 1) {
      estampar(pts[0], 0, setPinceles, trazo, rand, op, sizePincel);
      return true;
    }

    // Estampado equidistante
    let distAcum = 0;
    let segIdx = 0;
    while (distAcum <= longitudTotal) {
      // avanzar a segmento correcto
      while (segIdx < segmentos.length - 1 &&
             distAcum > segmentos[segIdx].ini + segmentos[segIdx].L) segIdx++;
      const s = segmentos[segIdx];
      const t01 = (distAcum - s.ini) / (s.L || 1);
      const x = s.a.x + (s.b.x - s.a.x) * t01;
      const y = s.a.y + (s.b.y - s.a.y) * t01;
      const presion = s.a.presion + (s.b.presion - s.a.presion) * t01;
      const ang = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);

      estampar({x, y, presion}, ang, setPinceles, trazo, rand, op, sizePincel);
      distAcum += paso * (0.85 + rand() * 0.3); // jitter de espaciado
    }

    return true;
  };

  // Estampa un pincel en (x,y) con rotación, tamaño y alpha variables
  const estampar = (p, angBase, setPinceles, trazo, rand, op, sizePincel) => {
    const pincelIdx = Math.floor(rand() * setPinceles.length);
    const pincel = setPinceles[pincelIdx];

    // Variaciones por sello — pequeñas pero importantes
    const escalaJitter = 0.75 + rand() * 0.5;     // 0.75 – 1.25
    const tam   = sizePincel * p.presion * escalaJitter;
    const rot   = angBase + (rand() - 0.5) * 0.4;  // ligero wobble
    const offX  = (rand() - 0.5) * tam * 0.12;    // jitter lateral
    const offY  = (rand() - 0.5) * tam * 0.12;
    const alpha = op * (0.55 + rand() * 0.35);    // densidad variable

    // Ocasionalmente, pincel "seco" — alpha mucho menor, da huecos
    const seco = rand() < 0.08;
    const alphaFinal = seco ? alpha * 0.25 : alpha;

    ctx.save();
    ctx.globalAlpha = alphaFinal;
    ctx.translate(p.x + offX, p.y + offY);
    ctx.rotate(rot);
    ctx.drawImage(pincel, -tam/2, -tam/2, tam, tam);
    ctx.restore();

    // Salpicaduras ocasionales — puntos pequeños separados
    if (rand() < 0.03) {
      const col = PALETA[trazo.pigmento];
      const base = hexToRgb(col.base);
      ctx.save();
      ctx.globalAlpha = op * (0.4 + rand()*0.3);
      ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
      const dd = tam * (0.6 + rand()*0.9);
      const aa = rand() * Math.PI * 2;
      const sx = p.x + Math.cos(aa) * dd;
      const sy = p.y + Math.sin(aa) * dd;
      const rr = 0.5 + rand() * 1.2;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  };

  // ---------- loop ----------
  const pintar = () => {
    const ahora = performance.now();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const vivos = [];
    for (const t of trazos) {
      if (pintarTrazo(t, ahora)) vivos.push(t);
    }
    trazos = vivos;
    requestAnimationFrame(pintar);
  };

  const ultimoPunto = () => {
    if (!activo || !activo.puntos.length) return null;
    return activo.puntos[activo.puntos.length - 1];
  };
  const dimensiones = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });

  return { init, empezar, extender, terminar, limpiar, ultimoPunto, dimensiones, setDuracionMs };
})();
