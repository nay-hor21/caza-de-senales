// Caza de Señales · efectos de sonido sintetizados (no hace falta descargar audios).
(function () {
  "use strict";
  var ctx = null, maestro = null, activo = true, ultimoDisparo = 0;

  function contexto() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      maestro = ctx.createGain();
      maestro.gain.value = 0.32;
      maestro.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(function () {});
    return ctx;
  }

  function tono(f0, f1, dur, tipo, vol, retraso) {
    var c = contexto();
    if (!c || !activo) return;
    var t = c.currentTime + (retraso || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = tipo || "square";
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(maestro);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function ruido(dur, vol, frec, retraso) {
    var c = contexto();
    if (!c || !activo) return;
    var t = c.currentTime + (retraso || 0);
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var datos = buf.getChannelData(0);
    for (var i = 0; i < n; i++) datos[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = c.createBufferSource(); s.buffer = buf;
    var f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = frec || 1500; f.Q.value = 0.8;
    var g = c.createGain(); g.gain.value = vol || 0.4;
    s.connect(f); f.connect(g); g.connect(maestro);
    s.start(t);
  }

  window.Sonido = {
    desbloquear: function () { contexto(); },
    activo: function (v) { if (typeof v === "boolean") activo = v; return activo; },
    disparo: function (suave) {
      var ahora = Date.now();
      if (suave && ahora - ultimoDisparo < 70) return;
      ultimoDisparo = ahora;
      ruido(0.12, suave ? 0.18 : 0.5, 1700);
      tono(520, 110, 0.09, "square", suave ? 0.04 : 0.1);
    },
    impacto: function () { tono(980, 240, 0.16, "square", 0.18); ruido(0.2, 0.35, 3200); },
    caida: function () { tono(1500, 260, 0.85, "sine", 0.16); },
    golpe: function () { ruido(0.25, 0.45, 300); },
    pitido: function (ultimo) { tono(ultimo ? 1320 : 880, null, ultimo ? 0.28 : 0.12, "square", 0.12); },
    inicio: function () { [523, 659, 784, 1047].forEach(function (f, i) { tono(f, null, 0.12, "square", 0.12, i * 0.09); }); },
    atrapado: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tono(f, null, 0.16, "triangle", 0.2, i * 0.11); }); },
    risa: function () { for (var i = 0; i < 6; i++) tono(i % 2 ? 330 : 392, i % 2 ? 300 : 360, 0.11, "square", 0.12, i * 0.14); },
    pop: function (dorada) { tono(dorada ? 1400 : 700, dorada ? 2100 : 1200, 0.08, "triangle", 0.18); },
    sinBalas: function () { tono(200, 140, 0.18, "sawtooth", 0.08); },
    bonus: function () { [659, 784, 988, 1319, 988, 1319].forEach(function (f, i) { tono(f, null, 0.1, "square", 0.1, i * 0.07); }); },
    final: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tono(f, null, 0.2, "triangle", 0.18, i * 0.15); }); }
  };
})();
