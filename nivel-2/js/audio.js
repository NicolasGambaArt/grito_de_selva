/* ============================================================
   audio.js — Motor de audio Grito de Selva · Nivel 2
   Síntesis procedural. Cada pigmento = voz distinta.
   Cada gesto = voz nueva con fade propio.
   ============================================================ */

const Audio = (() => {
  let ctx = null;
  let masterGain = null;
  let convolver = null;   // reverb compartida (selva húmeda)
  let aveCounter = 0;     // rotación de especies de aves
  const voces = {};

  const pitchDesdeY = (y01) => {
    const c = Math.max(0, Math.min(1, y01));
    return 1.25 - c * 0.5;   // 1.25× arriba → 0.75× abajo
  };

  // ---------- utilidades ----------
  const crearBufferRuido = (segundos, tipo) => {
    const len = Math.floor(ctx.sampleRate * segundos);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let ult = 0, b0=0,b1=0,b2=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random()*2-1;
      if (tipo === 'rosa') {
        // Filtro de Paul Kellet — ruido rosa de calidad
        b0 = 0.99765*b0 + w*0.0990460;
        b1 = 0.96300*b1 + w*0.2965164;
        b2 = 0.57000*b2 + w*1.0526913;
        d[i] = (b0 + b1 + b2 + w*0.1848) * 0.17;
      } else if (tipo === 'marron') {
        ult = (ult + 0.02*w) / 1.02;
        d[i] = ult * 3.5;
      } else d[i] = w;
    }
    return buf;
  };

  // Reverb corta de "espacio selvático": buffer IR sintético
  const crearImpulso = (segundos = 2.2, decay = 2.5) => {
    const len = ctx.sampleRate * segundos;
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, decay);
      }
    }
    return imp;
  };

  // ============================================================
  // AMARILLO — QUENA: melodía pentatónica andina
  // La quena toca una secuencia melódica (escala pentatónica menor en La)
  // con vibrato, trémolo y aire. Cada gesto arranca en un punto distinto.
  // ============================================================
  const ESCALA_ANDINA_HZ = [
    // La menor pentatónica en dos octavas: A, C, D, E, G, A, C, D, E
    220.00, 261.63, 293.66, 329.63, 392.00,
    440.00, 523.25, 587.33, 659.25, 783.99,
  ];
  // Melodías tradicionales (índices dentro de ESCALA_ANDINA_HZ) + duración beats
  const MELODIAS_QUENA = [
    // Frases fluidas tipo flauta tradicional andina — mayor variedad rítmica
    [[5,0.5],[4,0.5],[3,1],[4,0.5],[5,0.5],[6,1],[5,0.5],[4,0.5],[3,1.5],[5,1.5]],
    [[7,0.75],[5,0.25],[4,0.5],[5,1],[3,0.5],[4,0.5],[5,1],[3,0.5],[2,0.5],[3,2]],
    [[5,1],[6,0.5],[7,0.5],[8,1],[7,0.5],[6,0.5],[5,0.5],[4,0.5],[5,1.5],[3,1.5]],
    [[4,0.5],[5,0.5],[7,1],[6,0.5],[5,0.5],[4,1],[3,0.5],[2,0.5],[3,2],[5,1.5]],
    [[5,0.5],[7,0.5],[5,0.5],[4,0.5],[3,1],[4,0.5],[5,0.5],[6,1],[5,1.5],[4,1.5]],
  ];

  let quenaMelIdx = 0;

  const crearVozQuena = () => {
    const out = ctx.createGain();
    out.gain.value = 0;

    // Oscilador principal — triangular suave
    const osc = ctx.createOscillator();
    osc.type = 'triangle';

    // Armónico (octava) muy bajo para cuerpo
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;

    // Vibrato
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 4;

    // Envelope/puerta — ataque/liberación de cada nota
    const env = ctx.createGain();
    env.gain.value = 0;

    // Filtro pasa-bajos (timbre de flauta)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.Q.value = 0.7;

    // Formante de flauta (pico en 2kHz)
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 2000;
    peak.Q.value = 2;
    peak.gain.value = 4;

    // Aire / sopro (ruido bandpass)
    const aire = ctx.createBufferSource();
    aire.buffer = crearBufferRuido(3, 'rosa');
    aire.loop = true;
    const aireBp = ctx.createBiquadFilter();
    aireBp.type = 'bandpass';
    aireBp.frequency.value = 2600;
    aireBp.Q.value = 0.7;
    const aireGain = ctx.createGain();
    aireGain.gain.value = 0.04;

    const gainQuena = ctx.createGain();
    gainQuena.gain.value = 0.22;

    vib.connect(vibAmt).connect(osc.frequency);
    vib.connect(vibAmt).connect(osc2.frequency);
    osc.connect(env);
    osc2.connect(g2).connect(env);
    env.connect(lp).connect(peak).connect(gainQuena).connect(out);
    aire.connect(aireBp).connect(aireGain).connect(env);

    osc.start(); osc2.start(); vib.start(); aire.start();

    // Secuencia melódica
    let pitchMult = 1;
    const melodia = MELODIAS_QUENA[quenaMelIdx % MELODIAS_QUENA.length];
    quenaMelIdx++;
    const bpm = 108;
    const beatSec = 60 / bpm;
    let tAcum = ctx.currentTime + 0.08;
    const schedule = [];

    for (const [nota, dur] of melodia) {
      const f = ESCALA_ANDINA_HZ[nota] * pitchMult;
      const d = dur * beatSec * 0.92;
      schedule.push({ t: tAcum, freq: f, dur: d });
      tAcum += dur * beatSec;
    }
    // Programar todas las notas con legato suave
    const schedulerFn = () => {
      for (const n of schedule) {
        // Frecuencia con ramp suave (legato) en vez de setValueAtTime duro
        osc.frequency.setValueAtTime(osc.frequency.value, n.t - 0.02);
        osc.frequency.linearRampToValueAtTime(n.freq * pitchMult, n.t);
        osc2.frequency.setValueAtTime(osc2.frequency.value, n.t - 0.02);
        osc2.frequency.linearRampToValueAtTime(n.freq * 2 * pitchMult, n.t);
        // ADSR más suave: attack 40ms, sustain, release 120ms
        env.gain.setValueAtTime(0.001, n.t);
        env.gain.linearRampToValueAtTime(1, n.t + 0.04);
        env.gain.setValueAtTime(1, n.t + Math.max(0.06, n.dur - 0.14));
        env.gain.linearRampToValueAtTime(0.001, n.t + n.dur);
      }
    };
    schedulerFn();

    return {
      out,
      setPitch: (mult) => {
        pitchMult = mult;
        // Reprogramar frecuencias futuras con el nuevo multiplicador
        const now = ctx.currentTime;
        osc.frequency.cancelScheduledValues(now);
        osc2.frequency.cancelScheduledValues(now);
        for (const n of schedule) {
          if (n.t >= now) {
            osc.frequency.setValueAtTime(n.freq * mult, n.t);
            osc2.frequency.setValueAtTime(n.freq * 2 * mult, n.t);
          }
        }
      },
      detener: () => {
        try { osc.stop(); osc2.stop(); vib.stop(); aire.stop(); } catch(e){}
      },
    };
  };

  // ============================================================
  // ROJO — AVES AMAZÓNICAS: 5 especies sintetizadas
  // Cada gesto dispara UNA especie, rotando en secuencia.
  // ============================================================
  const ESPECIES_AVES = [
    // 1. Tucán amazónico — graznidos graves rítmicos
    {
      nombre: 'tucan',
      crear: () => {
        const out = ctx.createGain();
        out.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 380;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1100;
        lp.Q.value = 4;
        const env = ctx.createGain(); env.gain.value = 0;
        const gain = ctx.createGain(); gain.gain.value = 0.35;
        osc.connect(env).connect(lp).connect(gain).connect(out);
        osc.start();
        // Graznido cada ~0.9s, 3-4 veces
        let t = ctx.currentTime + 0.2;
        for (let i = 0; i < 5; i++) {
          env.gain.setValueAtTime(0.0001, t);
          env.gain.exponentialRampToValueAtTime(1, t + 0.04);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          osc.frequency.setValueAtTime(380 + Math.random()*30, t);
          osc.frequency.exponentialRampToValueAtTime(260, t + 0.25);
          t += 0.75 + Math.random()*0.4;
        }
        return { out, osc, lp, detener: () => { try{osc.stop();}catch(e){} } };
      },
      setPitch: (voz, m) => {
        voz.lp.frequency.setTargetAtTime(1100*m, ctx.currentTime, 0.05);
      },
    },

    // 2. Oropéndola / mochilero — canto melódico descendente líquido
    {
      nombre: 'oropendola',
      crear: () => {
        const out = ctx.createGain();
        out.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const env = ctx.createGain(); env.gain.value = 0;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1800;
        bp.Q.value = 3;
        const gain = ctx.createGain(); gain.gain.value = 0.45;
        osc.connect(env).connect(bp).connect(gain).connect(out);
        osc.start();
        // Frase descendente tipo "oooo-liuuu" seguido de gotas
        let t = ctx.currentTime + 0.2;
        const frases = [
          [[2200, 0.08],[1800, 0.08],[1400, 0.12],[900, 0.25]],
          [[2400, 0.06],[1900, 0.2],[1200, 0.3]],
        ];
        for (let k = 0; k < 3; k++) {
          const f = frases[k % frases.length];
          for (const [hz, d] of f) {
            env.gain.setValueAtTime(0.0001, t);
            env.gain.exponentialRampToValueAtTime(1, t + 0.02);
            env.gain.exponentialRampToValueAtTime(0.0001, t + d);
            osc.frequency.setValueAtTime(hz, t);
            t += d + 0.02;
          }
          t += 0.4 + Math.random()*0.3;
        }
        return { out, osc, bp, detener: () => { try{osc.stop();}catch(e){} } };
      },
      setPitch: (voz, m) => {
        voz.bp.frequency.setTargetAtTime(1800*m, ctx.currentTime, 0.05);
      },
    },

    // 3. Colibrí — trino metálico rapidísimo
    {
      nombre: 'colibri',
      crear: () => {
        const out = ctx.createGain();
        out.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 3800;
        const env = ctx.createGain(); env.gain.value = 0;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 4200;
        bp.Q.value = 6;
        const gain = ctx.createGain(); gain.gain.value = 0.22;
        osc.connect(env).connect(bp).connect(gain).connect(out);
        osc.start();
        let t = ctx.currentTime + 0.15;
        for (let k = 0; k < 28; k++) {
          env.gain.setValueAtTime(0.0001, t);
          env.gain.exponentialRampToValueAtTime(1, t + 0.006);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
          osc.frequency.setValueAtTime(3600 + Math.random()*600, t);
          t += 0.08 + Math.random()*0.04;
        }
        return { out, osc, bp, detener: () => { try{osc.stop();}catch(e){} } };
      },
      setPitch: (voz, m) => {
        voz.bp.frequency.setTargetAtTime(4200*m, ctx.currentTime, 0.05);
      },
    },

    // 4. Guacamayo — graznidos agudos y nasales
    {
      nombre: 'guacamayo',
      crear: () => {
        const out = ctx.createGain();
        out.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 1400;
        const env = ctx.createGain(); env.gain.value = 0;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1600;
        bp.Q.value = 2.5;
        const fm = ctx.createOscillator();
        fm.frequency.value = 15;
        const fmAmt = ctx.createGain();
        fmAmt.gain.value = 200;
        fm.connect(fmAmt).connect(osc.frequency);
        const gain = ctx.createGain(); gain.gain.value = 0.22;
        osc.connect(env).connect(bp).connect(gain).connect(out);
        osc.start(); fm.start();
        let t = ctx.currentTime + 0.2;
        for (let k = 0; k < 4; k++) {
          env.gain.setValueAtTime(0.0001, t);
          env.gain.exponentialRampToValueAtTime(1, t + 0.03);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          t += 0.9 + Math.random()*0.5;
        }
        return { out, osc, fm, bp, detener: () => { try{osc.stop();fm.stop();}catch(e){} } };
      },
      setPitch: (voz, m) => {
        voz.bp.frequency.setTargetAtTime(1600*m, ctx.currentTime, 0.05);
      },
    },

    // 5. Pájaro campana / cotinga — silbido puro sostenido
    {
      nombre: 'cotinga',
      crear: () => {
        const out = ctx.createGain();
        out.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const env = ctx.createGain(); env.gain.value = 0;
        const gain = ctx.createGain(); gain.gain.value = 0.3;
        osc.connect(env).connect(gain).connect(out);
        osc.start();
        let t = ctx.currentTime + 0.25;
        const notas = [[2600, 0.35], [3100, 0.5], [2800, 0.4], [3300, 0.6]];
        for (let k = 0; k < 3; k++) {
          for (const [hz, d] of notas) {
            env.gain.setValueAtTime(0.0001, t);
            env.gain.exponentialRampToValueAtTime(1, t + 0.05);
            env.gain.setValueAtTime(1, t + d - 0.1);
            env.gain.exponentialRampToValueAtTime(0.0001, t + d);
            osc.frequency.setValueAtTime(hz, t);
            t += d + 0.15;
          }
          t += 0.3;
        }
        return { out, osc, detener: () => { try{osc.stop();}catch(e){} } };
      },
      setPitch: (voz, m) => {
        voz.osc.detune.setTargetAtTime(Math.log2(m) * 1200, ctx.currentTime, 0.05);
      },
    },
  ];

  const crearVozAve = () => {
    const esp = ESPECIES_AVES[aveCounter % ESPECIES_AVES.length];
    aveCounter++;
    const voz = esp.crear();
    voz._especie = esp;
    return {
      out: voz.out,
      setPitch: (mult) => esp.setPitch(voz, mult),
      detener: voz.detener,
    };
  };

  // ============================================================
  // VERDE — QUEBRADA: agua fluyendo entre piedras, brillante
  // Más aguda que un río amplio. Cascadita + chorros + gotas.
  // ============================================================
  const crearVozRio = () => {
    const out = ctx.createGain();
    out.gain.value = 0;

    // Capa 1 — chorro fino: ruido blanco con highpass alto (brillo de agua)
    const r1 = ctx.createBufferSource();
    r1.buffer = crearBufferRuido(4, 'blanco');
    r1.loop = true;
    const hp1 = ctx.createBiquadFilter();
    hp1.type = 'highpass';
    hp1.frequency.value = 1800;
    hp1.Q.value = 0.5;
    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.value = 3200;
    bp1.Q.value = 0.9;
    const g1 = ctx.createGain(); g1.gain.value = 0.35;

    // Capa 2 — agua chocando con piedras: ruido rosa, bandpass medio
    const r2 = ctx.createBufferSource();
    r2.buffer = crearBufferRuido(4, 'rosa');
    r2.loop = true;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 1200;
    bp2.Q.value = 1.0;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;

    // LFOs independientes — crean irregularidad orgánica
    const lfoA = ctx.createOscillator();
    lfoA.frequency.value = 0.23;
    const lfoAAmt = ctx.createGain(); lfoAAmt.gain.value = 600;
    lfoA.connect(lfoAAmt).connect(bp1.frequency);

    const lfoB = ctx.createOscillator();
    lfoB.frequency.value = 0.37;
    const lfoBAmt = ctx.createGain(); lfoBAmt.gain.value = 400;
    lfoB.connect(lfoBAmt).connect(bp2.frequency);

    // Capa 3 — gotas/burbujas rápidas de agua (más agudas que un río)
    const bur = ctx.createOscillator();
    bur.type = 'sine';
    const burEnv = ctx.createGain(); burEnv.gain.value = 0;
    const burG = ctx.createGain(); burG.gain.value = 0.22;
    bur.connect(burEnv).connect(burG).connect(out);
    bur.start();
    // Goteo denso — como agua cayendo entre rocas
    let tb = ctx.currentTime + 0.15;
    for (let i = 0; i < 36; i++) {
      const hz = 900 + Math.random()*1400;
      burEnv.gain.setValueAtTime(0.0001, tb);
      burEnv.gain.exponentialRampToValueAtTime(1, tb + 0.004);
      burEnv.gain.exponentialRampToValueAtTime(0.0001, tb + 0.07);
      bur.frequency.setValueAtTime(hz, tb);
      bur.frequency.exponentialRampToValueAtTime(hz * 0.5, tb + 0.07);
      tb += 0.15 + Math.random()*0.35;
    }

    // Filtro final
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;

    const gTotal = ctx.createGain();
    gTotal.gain.value = 0.32;

    r1.connect(hp1).connect(bp1).connect(g1).connect(lp);
    r2.connect(bp2).connect(g2).connect(lp);
    lp.connect(gTotal).connect(out);

    r1.start(); r2.start(); lfoA.start(); lfoB.start();

    return {
      out,
      setPitch: (mult) => {
        const t = ctx.currentTime;
        bp1.frequency.setTargetAtTime(3200*mult, t, 0.1);
        bp2.frequency.setTargetAtTime(1200*mult, t, 0.1);
      },
      detener: () => {
        try { r1.stop(); r2.stop(); lfoA.stop(); lfoB.stop(); bur.stop(); } catch(e){}
      },
    };
  };

  // ============================================================
  // AZUL — VIENTO: silbido sutil, no rugido
  // Síntesis: ruido filtrado muy estrecho + oscilador sine apenas audible
  // ============================================================
  const crearVozViento = () => {
    const out = ctx.createGain();
    out.gain.value = 0;

    // Capa aire base — ruido rosa muy filtrado
    const r = ctx.createBufferSource();
    r.buffer = crearBufferRuido(5, 'rosa');
    r.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    hp.Q.value = 0.7;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 2.5;

    // LFO para mover la banda — silbido dinámico
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 600;
    lfo.connect(lfoAmt).connect(bp.frequency);

    // Modulación de ganancia — ráfagas suaves
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.5;
    const lfo2Amt = ctx.createGain(); lfo2Amt.gain.value = 0.35;
    const lfo2Off = ctx.createConstantSource();
    lfo2Off.offset.value = 0.5;

    // Silbido armónico — oscilador sine muy bajo volumen
    const silbOsc = ctx.createOscillator();
    silbOsc.type = 'sine';
    silbOsc.frequency.value = 1400;
    const silbG = ctx.createGain(); silbG.gain.value = 0.02;
    const silbLfo = ctx.createOscillator();
    silbLfo.frequency.value = 0.3;
    const silbLfoAmt = ctx.createGain();
    silbLfoAmt.gain.value = 80;
    silbLfo.connect(silbLfoAmt).connect(silbOsc.frequency);

    const gainTotal = ctx.createGain();
    gainTotal.gain.value = 0.25;

    lfo2.connect(lfo2Amt).connect(gainTotal.gain);
    lfo2Off.connect(gainTotal.gain);

    r.connect(hp).connect(bp).connect(gainTotal).connect(out);
    silbOsc.connect(silbG).connect(gainTotal);

    r.start(); lfo.start(); lfo2.start(); lfo2Off.start();
    silbOsc.start(); silbLfo.start();

    return {
      out,
      setPitch: (mult) => {
        const t = ctx.currentTime;
        bp.frequency.setTargetAtTime(1800*mult, t, 0.1);
        silbOsc.frequency.setTargetAtTime(1400*mult, t, 0.1);
      },
      detener: () => {
        try {
          r.stop(); lfo.stop(); lfo2.stop(); lfo2Off.stop();
          silbOsc.stop(); silbLfo.stop();
        } catch(e){}
      },
    };
  };

  const fabricas = {
    amarillo: crearVozQuena,
    rojo:     crearVozAve,
    verde:    crearVozRio,
    azul:     crearVozViento,
  };

  // ============================================================
  // API pública
  // ============================================================
  const iniciar = async () => {
    if (ctx) {
      if (ctx.state === 'suspended') await ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.55;
    // Compresor/limitador — evita distorsión/clipping
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.18;
    // Reverb suave de selva
    convolver = ctx.createConvolver();
    convolver.buffer = crearImpulso(2.0, 2.8);
    const dry = ctx.createGain(); dry.gain.value = 0.85;
    const wet = ctx.createGain(); wet.gain.value = 0.15;
    masterGain.connect(comp);
    comp.connect(dry).connect(ctx.destination);
    comp.connect(convolver).connect(wet).connect(ctx.destination);
  };

  const activar = (pigmento, voiceId = null) => {
    if (!ctx) return null;
    if (voiceId && voces[voiceId]) {
      const t = ctx.currentTime;
      voces[voiceId].out.gain.cancelScheduledValues(t);
      voces[voiceId].out.gain.setTargetAtTime(1, t, 0.12);
      return voiceId;
    }
    const fab = fabricas[pigmento];
    if (!fab) return null;
    const voz = fab();
    voz.pigmento = pigmento;
    voz.out.connect(masterGain);

    const t = ctx.currentTime;
    voz.out.gain.cancelScheduledValues(t);
    voz.out.gain.setValueAtTime(0, t);
    voz.out.gain.linearRampToValueAtTime(1, t + 0.3);

    const id = voiceId || ('v_' + Math.random().toString(36).slice(2) + Date.now());
    voces[id] = voz;
    return id;
  };

  const programarFadeOut = (voiceId, msInicio, msFade) => {
    const voz = voces[voiceId];
    if (!voz || !ctx) return;
    const t0 = ctx.currentTime + msInicio/1000;
    const t1 = t0 + msFade/1000;
    const g = voz.out.gain;
    g.setValueAtTime(g.value, Math.max(ctx.currentTime, t0 - 0.001));
    g.linearRampToValueAtTime(0.0001, t1);
    g.setValueAtTime(0, t1 + 0.01);
    voz._stopAt = setTimeout(() => {
      try { voz.detener(); } catch(e){}
      try { voz.out.disconnect(); } catch(e){}
      delete voces[voiceId];
    }, msInicio + msFade + 300);
  };

  const cancelarFade = (voiceId) => {
    const voz = voces[voiceId];
    if (!voz || !ctx) return;
    if (voz._stopAt) { clearTimeout(voz._stopAt); voz._stopAt = null; }
    const t = ctx.currentTime;
    voz.out.gain.cancelScheduledValues(t);
    voz.out.gain.setTargetAtTime(1, t, 0.1);
  };

  const detener = (voiceId) => {
    const voz = voces[voiceId];
    if (!voz || !ctx) return;
    delete voces[voiceId];
    const t = ctx.currentTime;
    const g = voz.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.0001, t + 0.45);
    g.setValueAtTime(0, t + 0.46);
    setTimeout(() => {
      try { voz.detener(); } catch(e){}
      try { voz.out.disconnect(); } catch(e){}
    }, 700);
  };

  const modularPitch = (voiceId, y01) => {
    const voz = voces[voiceId];
    if (!voz) return;
    voz.setPitch(pitchDesdeY(y01));
  };

  const detenerTodo = () => { Object.keys(voces).forEach(detener); };

  return { iniciar, activar, detener, modularPitch, detenerTodo, programarFadeOut, cancelarFade };
})();
