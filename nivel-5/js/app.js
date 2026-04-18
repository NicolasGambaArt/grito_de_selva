'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Espíritus Rupestres — Lógica principal
   ═══════════════════════════════════════════════════════════════════════════

   Posicionado con CSS transform:
     img.style.transformOrigin = `${cx}% ${cy}%`
     img.style.transform = `translate(${tx-cx}%, ${ty-cy}%) scale(${scale})`

   cx, cy  = centro del personaje dentro del canvas 1920×1357 (medido con PIL)
   tx, ty  = destino sobre la roca (% del canvas)
   scale   = escala relativa al canvas (el canvas es 100% del ancho del #scene)

   Audio: <audio id="aud-flauta01"> preloaded en el HTML → funciona desde file://
   ═══════════════════════════════════════════════════════════════════════════ */


/* ── Transforms de reposo (rupestres) ────────────────────────────────────── */
const IDLE_DATA = {
  rupestre01: { src: 'assets/rupestre01.webp', cx: 50.8, cy: 53.9, scale: 0.15, tx: 52, ty: 22 },
  rupestre02: { src: 'assets/rupestre02.webp', cx: 49.9, cy: 55.9, scale: 0.15, tx: 17, ty: 49 },
  rupestre03: { src: 'assets/rupestre03.webp', cx: 52.2, cy: 56.5, scale: 0.15, tx: 77, ty: 46 },
};

/* ── Combos máscara + personaje ──────────────────────────────────────────── */
const COMBOS = {
  'viento-1': { src: 'assets/flautista01.webp',   audioId: 'flauta01', animClass: 'anim-viento', cx: 51.5, cy: 39.4, scale: 0.40, tx: 52, ty: 22 },
  'viento-2': { src: 'assets/flautista02.webp',   audioId: 'flauta02', animClass: 'anim-viento', cx: 51.3, cy: 42.2, scale: 0.40, tx: 17, ty: 49 },
  'viento-3': { src: 'assets/flautista03.webp',   audioId: 'flauta03', animClass: 'anim-viento', cx: 49.9, cy: 43.0, scale: 0.40, tx: 77, ty: 46 },
  'tierra-1': { src: 'assets/tamborilero01.webp', audioId: 'percu01',  animClass: 'anim-tierra', cx: 51.2, cy: 44.4, scale: 0.50, tx: 52, ty: 22 },
  'tierra-2': { src: 'assets/tamborilero02.webp', audioId: 'percu02',  animClass: 'anim-tierra', cx: 51.0, cy: 42.1, scale: 0.50, tx: 17, ty: 49 },
  'tierra-3': { src: 'assets/tamborilero03.webp', audioId: 'percu03',  animClass: 'anim-tierra', cx: 43.3, cy: 44.4, scale: 0.50, tx: 77, ty: 46 },
};


/* ── Estado ──────────────────────────────────────────────────────────────── */
// charMask[id] = 'viento' | 'tierra' | null
const charMask = { 1: null, 2: null, 3: null };
// maskChar[type] = 1|2|3 | null
const maskChar = { viento: null, tierra: null };


/* ── Utilidades de transform ─────────────────────────────────────────────── */
/*
  Se aplica al div .char-wrap (NO a la img).
  La img dentro solo recibe transform: rotate() del @keyframes → sin conflicto.
*/
function applyTransform(wrapEl, d) {
  wrapEl.style.transformOrigin = `${d.cx}% ${d.cy}%`;
  wrapEl.style.transform = `translate(${d.tx - d.cx}%, ${d.ty - d.cy}%) scale(${d.scale})`;
}


/* ── Audio simple (desde <audio> preloaded en HTML) ──────────────────────── */
function audioPlay(audioId) {
  const el = document.getElementById('aud-' + audioId);
  if (!el) { console.warn('audio no encontrado:', audioId); return; }
  el.currentTime = 0;
  el.play().catch(e => console.warn('[audio] play bloqueado:', e.message));
}

function audioStop(audioId) {
  const el = document.getElementById('aud-' + audioId);
  if (!el) return;
  el.pause();
  el.currentTime = 0;
}


/* ── Actualizar visual del personaje ─────────────────────────────────────── */
function showChar(charId, maskType) {
  const idleWrap = document.getElementById(`idle-wrap-${charId}`);
  const animWrap = document.getElementById(`anim-wrap-${charId}`);
  const animImg  = animWrap.querySelector('.char-img');

  // Siempre reposicionar el wrapper del rupestre base
  const idleData = IDLE_DATA[`rupestre0${charId}`];
  applyTransform(idleWrap, idleData);
  idleWrap.style.opacity = '1';

  if (!maskType) {
    animWrap.style.opacity = '0';
    animWrap.className = 'char-wrap anim-wrap';
    return;
  }

  const combo = COMBOS[`${maskType}-${charId}`];
  if (!combo) return;

  // Posicionar el wrapper animado ANTES de cargar la imagen
  applyTransform(animWrap, combo);

  // Asignar onload ANTES de cambiar src para evitar race condition
  animImg.onload = null;
  const show = () => {
    // Clase en el wrapper → CSS aplica animación a la img dentro
    animWrap.className = `char-wrap anim-wrap ${combo.animClass}`;
    animWrap.style.opacity = '1';
  };

  if (animImg.src.endsWith(combo.src) && animImg.complete && animImg.naturalWidth) {
    // Imagen ya cargada (caché)
    show();
  } else {
    animImg.onload = show;
    animImg.src = combo.src;
  }
}


/* ── Actualizar estado visual de los slots ───────────────────────────────── */
function updateSlots() {
  ['viento', 'tierra'].forEach(mask => {
    const slot = document.getElementById(`slot-${mask}`);
    if (!slot) return;
    if (maskChar[mask] !== null) {
      slot.classList.add('in-use');
      slot.classList.remove('available');
    } else {
      slot.classList.remove('in-use');
      slot.classList.add('available');
    }
  });
}


/* ── Aplicar máscara a personaje ─────────────────────────────────────────── */
function applyMask(maskType, charId) {
  const id = Number(charId);

  // 1. Si esta máscara estaba en otro personaje → liberarlo
  const prevCharOfMask = maskChar[maskType];
  if (prevCharOfMask !== null && prevCharOfMask !== id) {
    const prevAudioId = COMBOS[`${maskType}-${prevCharOfMask}`]?.audioId;
    if (prevAudioId) audioStop(prevAudioId);
    charMask[prevCharOfMask] = null;
    showChar(prevCharOfMask, null);
  }

  // 2. Si el personaje destino ya tenía otra máscara → quitarla
  const prevMaskOfChar = charMask[id];
  if (prevMaskOfChar !== null && prevMaskOfChar !== maskType) {
    const prevAudioId = COMBOS[`${prevMaskOfChar}-${id}`]?.audioId;
    if (prevAudioId) audioStop(prevAudioId);
    maskChar[prevMaskOfChar] = null;
  }

  // 3. Asignar
  maskChar[maskType] = id;
  charMask[id] = maskType;

  showChar(id, maskType);
  audioPlay(COMBOS[`${maskType}-${id}`].audioId);
  updateSlots();
}


/* ═══════════════════════════════════════════════════════════════════════════
   DRAG & DROP — Pointer Events (mouse + touch unificado)
   ═══════════════════════════════════════════════════════════════════════════ */

let drag         = null;   // { maskType }
let ghost        = null;
let ghostImg     = null;
let lastDropTime = 0;      // evita que un drop se interprete como click de retiro

function onPointerDown(e) {
  const slot = e.currentTarget;
  if (slot.classList.contains('disabled')) return;
  e.preventDefault();
  e.stopPropagation();

  const maskType = slot.dataset.mask;
  drag = { maskType };

  ghost    = document.getElementById('drag-ghost');
  ghostImg = ghost.querySelector('img');
  ghostImg.src = slot.querySelector('img').src;
  ghost.style.left    = e.clientX + 'px';
  ghost.style.top     = e.clientY + 'px';
  ghost.style.display = 'block';
  document.body.classList.add('is-dragging');

  // setPointerCapture redirige todos los eventos al slot →
  // funciona tanto en mouse como en touch sin listeners globales
  slot.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!drag) return;
  e.preventDefault();
  ghost.style.left = e.clientX + 'px';
  ghost.style.top  = e.clientY + 'px';

  // Highlight del hotspot bajo el cursor
  document.querySelectorAll('.char-layer').forEach(l => l.classList.remove('dragover'));
  const hs = getHotspotAt(e.clientX, e.clientY);
  if (hs) {
    document.querySelector(`#char-layer-${hs.dataset.char}`)?.classList.add('dragover');
  }
}

function onPointerUp(e) {
  if (!drag) return;
  endDrag(e.clientX, e.clientY);
}

function onPointerCancel(e) {
  if (!drag) return;
  cancelDrag();
}

function endDrag(x, y) {
  ghost.style.display = 'none';
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.char-layer').forEach(l => l.classList.remove('dragover'));

  const hs = getHotspotAt(x, y);
  if (hs) {
    applyMask(drag.maskType, hs.dataset.char);
    lastDropTime = Date.now();   // marca para ignorar el click que viene después
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
  for (const el of els) {
    if (el.classList.contains('drop-hotspot')) return el;
  }
  return null;
}


/* ── Fullscreen ──────────────────────────────────────────────────────────── */
function requestFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (fn) fn.call(el).catch(() => {});
}

/* ── Init ────────────────────────────────────────────────────────────────── */
function init() {
  // Precargar imágenes animadas → elimina delay al soltar la primera máscara
  Object.values(COMBOS).forEach(c => { const i = new Image(); i.src = c.src; });

  // Fullscreen automático en primer toque (requiere gesto de usuario)
  document.addEventListener('pointerdown', requestFullscreen, { once: true });

  // Posicionar rupestres en reposo
  [1, 2, 3].forEach(id => showChar(id, null));

  // Vincular slots de máscara
  document.querySelectorAll('.mask-slot').forEach(slot => {
    if (slot.classList.contains('disabled')) return;
    slot.addEventListener('pointerdown',  onPointerDown);
    slot.addEventListener('pointermove',  onPointerMove);
    slot.addEventListener('pointerup',    onPointerUp);
    slot.addEventListener('pointercancel', onPointerCancel);
  });

  // Click sobre personaje activo → retirar máscara (detiene animación y audio).
  // Se ignora si el click es consecuencia inmediata de un drop (< 350 ms).
  document.querySelectorAll('.drop-hotspot').forEach(hs => {
    hs.addEventListener('click', () => {
      if (Date.now() - lastDropTime < 350) return;
      const id = Number(hs.dataset.char);
      const mask = charMask[id];
      if (!mask) return;
      const audioId = COMBOS[`${mask}-${id}`]?.audioId;
      if (audioId) audioStop(audioId);
      maskChar[mask] = null;
      charMask[id]   = null;
      showChar(id, null);
      updateSlots();
    });
  });

  updateSlots();
  console.log('[Espíritus Rupestres] Listo');
}

document.addEventListener('DOMContentLoaded', init);
