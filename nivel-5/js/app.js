'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   El canto de los Espíritus — Lógica principal
   ═══════════════════════════════════════════════════════════════════════════
   Reloj maestro único con puertas cada 4.8 s (inicio y mitad del ciclo).
   Al soltar una máscara, el rupestre entra en modo silueta y su audio
   espera hasta la próxima puerta para activarse en fase con los demás.
   Una máscara = un rupestre a la vez.
   ═══════════════════════════════════════════════════════════════════════════ */

let   LOOP_LENGTH = 9.6;                 // duración del ciclo maestro (se ajusta a la duración real del buffer)
let   GATES       = [0, LOOP_LENGTH / 2];// puertas: 0 s y 4.8 s dentro de cada ciclo
const FADE_MS     = 60;

const LAYERS = {
  'atl-viento': { audioId: 'atl-viento', anim: 'assets/animación_01_Atlantico_Viento_MascaraIZQUIERDA.webp',  animClass: 'anim-viento' },
  'pac-viento': { audioId: 'pac-viento', anim: 'assets/animación_02_Pacifico_Viento_MascaraIZQUIERDA.webp',   animClass: 'anim-viento' },
  'ama-viento': { audioId: 'ama-viento', anim: 'assets/animación_03_Amazonas_Viento_MascaraIZQUIERDA.webp',   animClass: 'anim-viento' },
  'atl-percu':  { audioId: 'atl-percu',  anim: 'assets/animación_04_Atlantico_Percusion_MascaraCENTRO.webp',  animClass: 'anim-percu'  },
  'pac-percu':  { audioId: 'pac-percu',  anim: 'assets/animación_05_Pacifico_Percusion_MascaraCENTRO.webp',   animClass: 'anim-percu'  },
  'ama-percu':  { audioId: 'ama-percu',  anim: 'assets/animación_06_Amazonas_Percusion_MascaraCENTRO.webp',   animClass: 'anim-percu'  },
  'atl-sinte':  { audioId: 'atl-sinte',  anim: 'assets/animación_07_Atlantico_Sintetizador_MascaraDERECHA.webp', animClass: 'anim-sinte' },
  'pac-sinte':  { audioId: 'pac-sinte',  anim: 'assets/animación_08_Pacifico_Sintetizador_MascaraDERECHA.webp',  animClass: 'anim-sinte' },
  'ama-sinte':  { audioId: 'ama-sinte',  anim: 'assets/animación_09_Amazonas_Sintetizador_MascaraDERECHA.webp',  animClass: 'anim-sinte' },
};

const IDLE_IMGS = ['assets/rupestre01.webp', 'assets/rupestre02.webp', 'assets/rupestre03.webp'];
const RUPESTRES = {
  a1: { zone: 'atl', idle: IDLE_IMGS[0] },
  a2: { zone: 'atl', idle: IDLE_IMGS[1] },
  a3: { zone: 'atl', idle: IDLE_IMGS[2] },
  p1: { zone: 'pac', idle: IDLE_IMGS[1] },
  p2: { zone: 'pac', idle: IDLE_IMGS[0] },
  p3: { zone: 'pac', idle: IDLE_IMGS[2] },
  m1: { zone: 'ama', idle: IDLE_IMGS[2] },
  m2: { zone: 'ama', idle: IDLE_IMGS[0] },
  m3: { zone: 'ama', idle: IDLE_IMGS[1] },
};
const IDLE_SCALE   = 0.12;
const ACTIVE_SCALE = 0.28;

/* ═══════════════════════════════════════════════════════════════════════
   ESTADO
   ═══════════════════════════════════════════════════════════════════════ */
const maskChar     = { viento: null, percu: null, sinte: null };        // mask → rupId
const rupestreMask = Object.fromEntries(Object.keys(RUPESTRES).map(k => [k, null]));
const rupestreState = Object.fromEntries(Object.keys(RUPESTRES).map(k => [k, 'idle'])); // 'idle' | 'waiting' | 'active'

/* Reloj maestro con soporte de pausa.
   Arranca EN PAUSA: el ciclo se activa cuando se coloca la primera máscara. */
const masterStartReal = performance.now();
let   pausedAccumMs   = 0;
let   pausedAtMs      = masterStartReal;  // pausado desde el inicio
let   audioRunning    = false;

function masterNowMs() {
  const now = performance.now();
  if (pausedAtMs !== null) return pausedAtMs - masterStartReal - pausedAccumMs;
  return now - masterStartReal - pausedAccumMs;
}
function currentLoopOffset() { return (masterNowMs() / 1000) % LOOP_LENGTH; }

/* ═══════════════════════════════════════════════════════════════════════
   AUDIO — Web Audio API con AudioBufferSourceNode para loops sin gap
   (estilo Incredibox). Fallback: <audio> element si fetch falla
   (p. ej. abriendo el .html directamente con file://). En ese caso el
   loop tendrá el pequeño silencio de padding inherente al codec OGG
   Vorbis — la solución es servir el prototipo desde un servidor local
   (python -m http.server, Live Server, GitHub Pages, etc.).
   ═══════════════════════════════════════════════════════════════════════ */
let audioCtx      = null;
let useWebAudio   = false;
const buffers     = {};   // key → AudioBuffer (PCM sin padding)
const sources     = {};   // key → { source, gain }

function audioEl(key) { return document.getElementById('aud-' + key); }

async function initAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('AudioContext no soportado');
    audioCtx = new Ctx();

    const keys = Object.keys(LAYERS);
    await Promise.all(keys.map(async key => {
      const res = await fetch(`assets/loop-${key}.ogg`);
      if (!res.ok) throw new Error(`HTTP ${res.status} en loop-${key}.ogg`);
      const arrBuf = await res.arrayBuffer();
      buffers[key] = await new Promise((resolve, reject) => {
        /* decodeAudioData: descarta el padding del encoder Vorbis y
           entrega PCM exacto. source.loop=true loopea sin silencio. */
        audioCtx.decodeAudioData(arrBuf, resolve, reject);
      });
    }));

    useWebAudio = true;

    /* Alinea LOOP_LENGTH a la duración real del buffer para que el reloj
       maestro (visual) y la rueda PCM del buffer no drifteen nunca. */
    const firstKey = Object.keys(buffers)[0];
    if (firstKey) {
      const dur = buffers[firstKey].duration;
      if (Math.abs(dur - LOOP_LENGTH) > 0.01) {
        LOOP_LENGTH = dur;
        GATES[1]    = LOOP_LENGTH / 2;
        console.log(`[audio] LOOP_LENGTH ajustado a ${dur.toFixed(4)}s`);
      }
    }
    console.log('[audio] Web Audio activo — loops sin gap');
  } catch (err) {
    useWebAudio = false;
    console.warn('[audio] Web Audio no disponible:', err.message);
    console.warn('[audio] Usando <audio> element (con gap de Vorbis). Para loops sin gap, sirve desde un servidor: python -m http.server');
  }
}

function audioStart(key, offset) {
  const target = (typeof offset === 'number') ? offset : currentLoopOffset();

  if (useWebAudio && buffers[key]) {
    /* Detiene cualquier source previa de esta misma clave */
    stopWebAudioSource(key, true);

    const source = audioCtx.createBufferSource();
    source.buffer = buffers[key];
    source.loop   = true;            // loop PCM-exacto, sin gap
    source.loopStart = 0;
    source.loopEnd   = buffers[key].duration;

    const gain = audioCtx.createGain();
    gain.gain.value = 0;

    source.connect(gain).connect(audioCtx.destination);
    source.start(0, target);

    const now = audioCtx.currentTime;
    gain.gain.linearRampToValueAtTime(1, now + FADE_MS / 1000);

    sources[key] = { source, gain };
    return;
  }

  /* Fallback: <audio> element */
  const el = audioEl(key);
  if (!el) return;
  try { el.currentTime = target; } catch (_) {}
  el.volume = 0;
  const p = el.play();
  if (p) p.catch(e => console.warn('[audio] play bloqueado:', key, e.message));
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / FADE_MS);
    el.volume = t;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function stopWebAudioSource(key, immediate) {
  const s = sources[key];
  if (!s) return;
  const now = audioCtx.currentTime;
  if (immediate) {
    try { s.source.stop(0); } catch (_) {}
    try { s.source.disconnect(); } catch (_) {}
    try { s.gain.disconnect();   } catch (_) {}
  } else {
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setValueAtTime(s.gain.gain.value, now);
    s.gain.gain.linearRampToValueAtTime(0, now + FADE_MS / 1000);
    try { s.source.stop(now + FADE_MS / 1000 + 0.05); } catch (_) {}
  }
  delete sources[key];
}

/* Con Web Audio + loop=true no hay drift jamás — esta función queda como
   no-op en ese modo. Solo resyncamos el <audio> fallback. */
function audioResync(key, offset) {
  if (useWebAudio) return;
  const el = audioEl(key);
  if (!el || el.paused) return;
  try {
    if (Math.abs(el.currentTime - offset) > 0.020) {
      el.currentTime = offset;
    }
  } catch (_) {}
}

function audioStop(key) {
  if (useWebAudio) {
    stopWebAudioSource(key, false);
    return;
  }
  const el = audioEl(key);
  if (!el) return;
  const startVol = el.volume;
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / FADE_MS);
    el.volume = startVol * (1 - t);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      el.pause();
      el.currentTime = 0;
      el.volume = 1;
    }
  };
  requestAnimationFrame(step);
}

function pauseAllAudios() {
  if (useWebAudio) {
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    return;
  }
  Object.keys(LAYERS).forEach(k => {
    const el = audioEl(k);
    if (el && !el.paused) el.pause();
  });
}

function resumeActiveAudios() {
  if (useWebAudio) {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  Object.entries(maskChar).forEach(([mask, rup]) => {
    if (!rup) return;
    if (rupestreState[rup] !== 'active') return;
    const key = `${RUPESTRES[rup].zone}-${mask}`;
    const el = audioEl(key);
    if (!el) return;
    el.currentTime = currentLoopOffset();
    el.play().catch(() => {});
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   RENDER RUPESTRES
   ═══════════════════════════════════════════════════════════════════════ */
function positionWrap(wrap, rupId, scale) {
  const layer = document.querySelector(`.char-layer[data-rupestre="${rupId}"]`);
  if (!layer) return;
  const style = getComputedStyle(layer);
  const tx = parseFloat(style.getPropertyValue('--tx')) || 50;
  const ty = parseFloat(style.getPropertyValue('--ty')) || 50;
  wrap.style.transformOrigin = `50% 50%`;
  wrap.style.transform = `translate(${tx - 50}%, ${ty - 50}%) scale(${scale})`;
}

function renderRupestre(rupId) {
  const layer = document.querySelector(`.char-layer[data-rupestre="${rupId}"]`);
  if (!layer) return;
  const rup = RUPESTRES[rupId];
  const mask = rupestreMask[rupId];
  const state = rupestreState[rupId];
  layer.innerHTML = '';

  const wrap = document.createElement('div');
  const img = document.createElement('img');
  img.className = 'char-img';
  img.draggable = false;
  wrap.appendChild(img);
  layer.appendChild(wrap);

  if (!mask || state === 'idle') {
    wrap.className = 'char-wrap';
    img.src = rup.idle;
    positionWrap(wrap, rupId, IDLE_SCALE);
    return;
  }

  const layerInfo = LAYERS[`${rup.zone}-${mask}`];
  if (!layerInfo) return;

  if (state === 'waiting') {
    /* Silueta: la animación ya cargada pero apagada, esperando la puerta */
    wrap.className = 'char-wrap silhouette';
    img.src = layerInfo.anim;
    positionWrap(wrap, rupId, ACTIVE_SCALE);
    return;
  }

  /* state === 'active' */
  wrap.className = `char-wrap anim-wrap ${layerInfo.animClass}`;
  img.src = layerInfo.anim;
  positionWrap(wrap, rupId, ACTIVE_SCALE);
}

function renderAllRupestres() {
  Object.keys(RUPESTRES).forEach(renderRupestre);
}

/* ═══════════════════════════════════════════════════════════════════════
   APLICAR / QUITAR MÁSCARA
   ═══════════════════════════════════════════════════════════════════════ */
function applyMask(mask, rupId) {
  if (!RUPESTRES[rupId]) return;

  /* 1. Si esta máscara estaba en otro rupestre, liberarlo inmediatamente */
  const prevRup = maskChar[mask];
  if (prevRup && prevRup !== rupId) {
    if (rupestreState[prevRup] === 'active') {
      audioStop(`${RUPESTRES[prevRup].zone}-${mask}`);
    }
    rupestreMask[prevRup] = null;
    rupestreState[prevRup] = 'idle';
    renderRupestre(prevRup);
  }

  /* 2. Si el rupestre destino tenía otra máscara, quitarla */
  const prevMask = rupestreMask[rupId];
  if (prevMask && prevMask !== mask) {
    if (rupestreState[rupId] === 'active') {
      audioStop(`${RUPESTRES[rupId].zone}-${prevMask}`);
    }
    maskChar[prevMask] = null;
  }

  /* 3. Asignar y poner en espera (silueta) */
  maskChar[mask] = rupId;
  rupestreMask[rupId] = mask;
  rupestreState[rupId] = 'waiting';
  renderRupestre(rupId);
  updateMaskSlots();
  updateDeckUI();

  /* 4. Si el reloj está en pausa inicial (primera máscara del nivel),
        arranca el tempo YA y activa este rupestre en el offset 0
        — sin esperar al próximo gate — para respuesta inmediata. */
  if (!audioRunning) {
    /* Web Audio requiere gesto de usuario para arrancar el contexto */
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    pausedAccumMs += (performance.now() - pausedAtMs);
    pausedAtMs = null;
    audioRunning = true;
    lastOffset = 0;

    const zone = RUPESTRES[rupId].zone;
    rupestreState[rupId] = 'active';
    audioStart(`${zone}-${mask}`, 0);
    renderRupestre(rupId);
    flashGate();
    updateDeckUI();
  }
}

function removeMask(rupId) {
  const mask = rupestreMask[rupId];
  if (!mask) return;
  const zone = RUPESTRES[rupId].zone;
  if (rupestreState[rupId] === 'active') {
    audioStop(`${zone}-${mask}`);
  }
  maskChar[mask] = null;
  rupestreMask[rupId] = null;
  rupestreState[rupId] = 'idle';
  renderRupestre(rupId);
  updateMaskSlots();
  updateDeckUI();
}

/* ═══════════════════════════════════════════════════════════════════════
   BUCLE DE CUANTIZACIÓN — activa las siluetas al cruzar una puerta
   ═══════════════════════════════════════════════════════════════════════ */
let lastOffset = 0;

function tick() {
  const offset = currentLoopOffset();

  /* Detecta cruce de puerta: cuando lastOffset > offset (wrap del ciclo)
     o cuando pasamos por la mitad (4.8) */
  const crossedCycleStart = audioRunning && offset < lastOffset;                         // 0 s
  const crossedHalf       = audioRunning && lastOffset < GATES[1] && offset >= GATES[1]; // 4.8 s

  if (crossedCycleStart || crossedHalf) {
    /* Offset ideal de la puerta: 0 s al inicio del ciclo, 4.8 s en la mitad.
       Usamos este valor exacto —no el `offset` actual, que ya puede ir unos
       ms por delante— para alinear todos los audios al mismo instante. */
    const gateOffset = crossedCycleStart ? 0 : GATES[1];

    /* 1) Re-sincroniza los audios ya activos solo en el gate de la MITAD
          (4.8 s). En el gate de INICIO el <audio loop> ya wrapeó por sí
          solo, y forzar currentTime=0 ahí genera un click audible que
          rompe la sensación de loop fluido. El drift residual se corrige
          al llegar al siguiente medio ciclo. */
    if (crossedHalf) {
      Object.keys(rupestreState).forEach(rupId => {
        if (rupestreState[rupId] === 'active') {
          const mask = rupestreMask[rupId];
          const zone = RUPESTRES[rupId].zone;
          audioResync(`${zone}-${mask}`, gateOffset);
        }
      });
    }

    /* 2) Activa todas las siluetas pendientes, todas al MISMO offset
          para que nazcan perfectamente alineadas entre sí. */
    Object.keys(rupestreState).forEach(rupId => {
      if (rupestreState[rupId] === 'waiting') {
        const mask = rupestreMask[rupId];
        const zone = RUPESTRES[rupId].zone;
        rupestreState[rupId] = 'active';
        audioStart(`${zone}-${mask}`, gateOffset);
        renderRupestre(rupId);
      }
    });

    /* Flash visual del anillo en la puerta */
    flashGate();
    updateDeckUI();
  }

  /* Actualiza anillo maestro */
  const p = offset / LOOP_LENGTH;
  document.querySelector('.pause-btn')?.style.setProperty('--p', p.toFixed(4));
  const ring = document.querySelector('.master-ring .ring-prog');
  if (ring) ring.style.strokeDashoffset = (125.66 * (1 - p)).toFixed(2);

  lastOffset = offset;
  requestAnimationFrame(tick);
}

let flashTimer = null;
function flashGate() {
  const deck = document.getElementById('loop-deck');
  if (!deck) return;
  deck.classList.add('gate-flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => deck.classList.remove('gate-flash'), 220);
}

/* ═══════════════════════════════════════════════════════════════════════
   UI: deck + máscaras
   ═══════════════════════════════════════════════════════════════════════ */
function updateDeckUI() {
  const deck = document.getElementById('loop-deck');
  const anyActive = Object.values(rupestreState).some(s => s === 'active' || s === 'waiting');
  deck.classList.toggle('is-empty', !anyActive);
  deck.classList.toggle('is-running', audioRunning && anyActive);
  deck.classList.toggle('paused', !audioRunning);
}

function updateMaskSlots() {
  ['viento', 'percu', 'sinte'].forEach(mask => {
    const slot = document.querySelector(`.mask-slot[data-mask="${mask}"]`);
    if (!slot) return;
    slot.classList.toggle('in-use', maskChar[mask] !== null);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   PAUSA / PLAY
   ═══════════════════════════════════════════════════════════════════════ */
function togglePause() {
  if (audioRunning) {
    pausedAtMs = performance.now();
    audioRunning = false;
    pauseAllAudios();
  } else {
    pausedAccumMs += (performance.now() - pausedAtMs);
    pausedAtMs = null;
    audioRunning = true;
    resumeActiveAudios();
  }
  updateDeckUI();
}

/* ═══════════════════════════════════════════════════════════════════════
   DRAG & DROP
   ═══════════════════════════════════════════════════════════════════════ */
let drag = null;
let ghost = null;
let ghostImg = null;
let lastDropTime = 0;

function onPointerDown(e) {
  const slot = e.currentTarget;
  if (slot.classList.contains('disabled')) return;
  e.preventDefault(); e.stopPropagation();
  ocultarPreludio();

  drag = { mask: slot.dataset.mask };
  ghost = document.getElementById('drag-ghost');
  ghostImg = ghost.querySelector('img');
  ghostImg.src = slot.querySelector('img').src;
  ghost.style.left = e.clientX + 'px';
  ghost.style.top  = e.clientY + 'px';
  ghost.style.display = 'block';
  document.body.classList.add('is-dragging');
  slot.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!drag) return;
  e.preventDefault();
  ghost.style.left = e.clientX + 'px';
  ghost.style.top  = e.clientY + 'px';
  document.querySelectorAll('.char-layer').forEach(l => l.classList.remove('dragover'));
  const hs = getHotspotAt(e.clientX, e.clientY);
  if (hs) {
    document.querySelector(`.char-layer[data-rupestre="${hs.dataset.rupestre}"]`)?.classList.add('dragover');
  }
}

function onPointerUp(e) {
  if (!drag) return;
  endDrag(e.clientX, e.clientY);
}

function onPointerCancel() {
  if (!drag) return;
  cancelDrag();
}

function endDrag(x, y) {
  ghost.style.display = 'none';
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.char-layer').forEach(l => l.classList.remove('dragover'));
  const hs = getHotspotAt(x, y);
  if (hs) {
    applyMask(drag.mask, hs.dataset.rupestre);
    lastDropTime = Date.now();
  }
  drag = null;
}

function cancelDrag() {
  if (ghost) ghost.style.display = 'none';
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.char-layer').forEach(l => l.classList.remove('dragover'));
  drag = null;
}

function getHotspotAt(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) if (el.classList.contains('drop-hotspot')) return el;
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   PRELUDIO / MODAL / FULLSCREEN
   ═══════════════════════════════════════════════════════════════════════ */
let preludioOculto = false;
function ocultarPreludio() {
  if (preludioOculto) return;
  preludioOculto = true;
  document.getElementById('preludio')?.classList.add('oculto');
}

function abrirModal() {
  const m = document.getElementById('info-modal');
  if (m) { m.classList.add('abierto'); m.setAttribute('aria-hidden', 'false'); }
}
function cerrarModal() {
  const m = document.getElementById('info-modal');
  if (m) { m.classList.remove('abierto'); m.setAttribute('aria-hidden', 'true'); }
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
}
function toggleFullscreen() {
  const el = document.documentElement;
  if (isFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen)?.call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen)?.call(el);
  }
}
function syncFsClass() { document.body.classList.toggle('is-fullscreen', isFullscreen()); }

/* ═══════════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════════ */
function init() {
  Object.values(LAYERS).forEach(l => { const img = new Image(); img.src = l.anim; });

  /* Carga buffers Web Audio en paralelo (no bloqueante).
     Si falla (file://), caemos al <audio> precargado en el HTML. */
  initAudio();

  renderAllRupestres();

  const reposition = () => renderAllRupestres();
  window.addEventListener('resize', reposition);
  window.addEventListener('orientationchange', reposition);

  document.querySelectorAll('.mask-slot').forEach(slot => {
    if (slot.classList.contains('disabled')) return;
    slot.addEventListener('pointerdown',  onPointerDown);
    slot.addEventListener('pointermove',  onPointerMove);
    slot.addEventListener('pointerup',    onPointerUp);
    slot.addEventListener('pointercancel', onPointerCancel);
  });

  document.querySelectorAll('.drop-hotspot').forEach(hs => {
    hs.addEventListener('click', () => {
      if (Date.now() - lastDropTime < 350) return;
      removeMask(hs.dataset.rupestre);
    });
  });

  document.getElementById('btn-pause')?.addEventListener('click', togglePause);

  document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);
  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, syncFsClass)
  );
  document.getElementById('btn-info')?.addEventListener('click', abrirModal);
  document.getElementById('btn-info-close')?.addEventListener('click', cerrarModal);
  document.getElementById('info-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'info-modal') cerrarModal();
  });

  updateMaskSlots();
  updateDeckUI();
  requestAnimationFrame(tick);

  console.log('[Espíritus Rupestres] nivel 5 — puertas cada 4.8 s, sync maestro activo');
}

document.addEventListener('DOMContentLoaded', init);
