/* ============================================================
   app.js — Orquestador de Nivel 2
   Conecta UI (tazas) ↔ Lienzo ↔ Audio
   ============================================================ */

(() => {
  let pigmentoActivo = 'amarillo';
  let dibujando = false;
  let preludioOculto = false;
  let voiceIdActivo = null;   // id de la voz del gesto en curso

  // Parametros de vida del trazo/audio (deben coincidir con canvas.js)
  const VIDA_TRAZO_MS = 15000;
  const FADE_COLA_MS  = 5000;

  // Fullscreen bajo demanda (ver botón de esquina inferior derecha)
  const _fsRoot = document.documentElement;
  const _isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
  const _enterFs = () => {
    const fn = _fsRoot.requestFullscreen || _fsRoot.webkitRequestFullscreen || _fsRoot.mozRequestFullScreen;
    if (fn) fn.call(_fsRoot).catch(() => {});
  };
  const _exitFs = () => {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (fn) fn.call(document).catch(() => {});
  };
  const _toggleFs = () => { _isFs() ? _exitFs() : _enterFs(); };
  const _syncFsClass = () => document.body.classList.toggle('is-fullscreen', _isFs());
  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, _syncFsClass)
  );
  const _btnFs = document.getElementById('btn-fullscreen');
  if (_btnFs) _btnFs.addEventListener('click', _toggleFs);

  // Modal de instrucciones
  const _openModal  = () => { const m = document.getElementById('info-modal'); if (m) { m.classList.add('abierto'); m.setAttribute('aria-hidden','false'); } };
  const _closeModal = () => { const m = document.getElementById('info-modal'); if (m) { m.classList.remove('abierto'); m.setAttribute('aria-hidden','true'); } };
  const _btnInfo = document.getElementById('btn-info');
  if (_btnInfo) _btnInfo.addEventListener('click', _openModal);
  const _btnInfoClose = document.getElementById('btn-info-close');
  if (_btnInfoClose) _btnInfoClose.addEventListener('click', _closeModal);
  const _modal = document.getElementById('info-modal');
  if (_modal) _modal.addEventListener('click', (e) => { if (e.target === _modal) _closeModal(); });

  const $escena    = document.querySelector('.escena');
  const $preludio  = document.querySelector('.preludio');
  const $pitchLine = document.querySelector('.pitch-line');
  const $tazas     = document.querySelectorAll('.taza');

  // ---------- selección de taza ----------
  const seleccionarTaza = (pigmento) => {
    pigmentoActivo = pigmento;
    $tazas.forEach(t => {
      t.classList.toggle('is-activa', t.dataset.pigmento === pigmento);
    });
  };

  $tazas.forEach(t => {
    t.addEventListener('click', async () => {
      await Audio.iniciar();
      seleccionarTaza(t.dataset.pigmento);
    });
  });

  // Inicializa lienzo
  Lienzo.init('.lienzo');

  const $lienzo = document.querySelector('.lienzo');

  // ---------- helpers coordenadas ----------
  const coords = (evt) => {
    const rect = $lienzo.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      y01: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const ocultarPreludio = () => {
    if (preludioOculto) return;
    preludioOculto = true;
    $preludio.classList.add('oculto');
  };

  // ---------- start/move/end ----------
  const empezar = async (evt) => {
    evt.preventDefault();
    await Audio.iniciar();
    ocultarPreludio();

    const { x, y, y01 } = coords(evt);
    dibujando = true;

    const grosor = parseFloat(document.documentElement.style.getPropertyValue('--grosor')) || 14;
    Lienzo.empezar(x, y, pigmentoActivo, grosor);

    // Cada gesto = voz nueva independiente
    voiceIdActivo = Audio.activar(pigmentoActivo);
    Audio.modularPitch(voiceIdActivo, y01);

    document.querySelectorAll('.taza.is-activa').forEach(t =>
      t.classList.add('is-sonando'));

    mostrarPitchLine(y);
  };

  const mover = (evt) => {
    if (!dibujando) return;
    evt.preventDefault();
    const { x, y, y01 } = coords(evt);
    Lienzo.extender(x, y);
    Audio.modularPitch(voiceIdActivo, y01);
    mostrarPitchLine(y);
  };

  const terminar = () => {
    if (!dibujando) return;
    dibujando = false;
    Lienzo.terminar();

    // El sonido NO se detiene aquí. Programamos su fade en paralelo
    // con la vida del trazo: suena lleno hasta que empieza la cola visual,
    // y fade-out sincronizado con el desvanecimiento del pigmento.
    if (voiceIdActivo) {
      const duracion = parseFloat(document.documentElement.style.getPropertyValue('--grosor-vida')) || VIDA_TRAZO_MS;
      const inicioFade = VIDA_TRAZO_MS - FADE_COLA_MS; // ~10s sonido pleno
      Audio.programarFadeOut(voiceIdActivo, inicioFade, FADE_COLA_MS);
      voiceIdActivo = null;
    }

    document.querySelectorAll('.taza').forEach(t =>
      t.classList.remove('is-sonando'));
    ocultarPitchLine();
  };

  // ---------- pitch line visual ----------
  let pitchHideTimer = null;
  const mostrarPitchLine = (y) => {
    $pitchLine.style.top = `${y}px`;
    $pitchLine.classList.add('visible');
    if (pitchHideTimer) clearTimeout(pitchHideTimer);
  };
  const ocultarPitchLine = () => {
    pitchHideTimer = setTimeout(() => {
      $pitchLine.classList.remove('visible');
    }, 350);
  };

  // Mouse
  $lienzo.addEventListener('mousedown', empezar);
  window.addEventListener('mousemove', mover);
  window.addEventListener('mouseup', terminar);
  // Touch
  $lienzo.addEventListener('touchstart', empezar, { passive: false });
  $lienzo.addEventListener('touchmove', mover,   { passive: false });
  window.addEventListener('touchend', terminar);
  window.addEventListener('touchcancel', terminar);

  // Teclas 1-4 → cambio rápido de pigmento
  window.addEventListener('keydown', async (e) => {
    const map = { '1': 'amarillo', '2': 'rojo', '3': 'verde', '4': 'azul' };
    if (map[e.key]) {
      await Audio.iniciar();
      seleccionarTaza(map[e.key]);
    }
    if (e.key === 'c' || e.key === 'C') {
      Lienzo.limpiar();
    }
  });

  // Selección inicial
  seleccionarTaza('amarillo');

  // ============================================================
  // TWEAKS
  // ============================================================
  const TWEAKS = /*EDITMODE-BEGIN*/{
    "grosor": 14,
    "volumen": 0.7,
    "duracionTrazo": 15
  }/*EDITMODE-END*/;

  const aplicarTweaks = (t) => {
    document.documentElement.style.setProperty('--grosor', t.grosor);
    document.documentElement.style.setProperty('--fade-trazo', t.duracionTrazo + 's');
    if (window.Canvas && window.Canvas.setDuracionMs) {
      window.Canvas.setDuracionMs(t.duracionTrazo * 1000);
    }
  };
  aplicarTweaks(TWEAKS);

  const $tweaks = document.createElement('div');
  $tweaks.className = 'tweaks';
  $tweaks.innerHTML = `
    <h3>Tweaks</h3>
    <div class="tweaks__fila">
      <label>
        <span>Grosor <b id="v-grosor">${TWEAKS.grosor}</b></span>
        <input type="range" min="4" max="40" step="1" value="${TWEAKS.grosor}" data-k="grosor">
      </label>
      <label>
        <span>Duración <b id="v-duracionTrazo">${TWEAKS.duracionTrazo}s</b></span>
        <input type="range" min="1" max="15" step="1" value="${TWEAKS.duracionTrazo}" data-k="duracionTrazo">
      </label>
      <button class="limpiar">Limpiar lienzo</button>
    </div>
  `;
  document.body.appendChild($tweaks);

  $tweaks.querySelectorAll('input[type="range"]').forEach(input => {
    input.addEventListener('input', () => {
      const k = input.dataset.k;
      const v = parseFloat(input.value);
      TWEAKS[k] = v;
      const badge = $tweaks.querySelector(`#v-${k}`);
      if (badge) badge.textContent = (k === 'duracionTrazo') ? `${v}s` : v;
      aplicarTweaks(TWEAKS);
      try {
        window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
      } catch (e) {}
    });
  });

  $tweaks.querySelector('.limpiar').addEventListener('click', () => {
    Lienzo.limpiar();
  });

  // Protocolo: listener antes de anunciar
  window.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === '__activate_edit_mode')   $tweaks.classList.add('abierto');
    if (ev.data.type === '__deactivate_edit_mode') $tweaks.classList.remove('abierto');
  });
  try {
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
  } catch (e) {}
})();
