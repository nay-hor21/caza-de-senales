// Caza de Señales · escena animada (cielo, drones, interferencias y la mascota Torri).
// La usan el proyector y el celular; cada uno la dibuja a su tamaño.
(function () {
  "use strict";

  var D = window.EscenaDatos;
  var COLORES = ["#FF7A5C", "#2EBCAC", "#F4CC4E", "#8197FF"];
  var OSCUROS = ["#B9452D", "#1B7C71", "#B08A12", "#4D5FC2"];
  var LETRAS = ["A", "B", "C", "D"];
  var TINTA = "#0A1F2B";

  function limitar(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function suave(u) { u = limitar(u, 0, 1); return u * u * (3 - 2 * u); }

  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function torreReticulada(ctx, x, base, alto, ancho, color, grosor) {
    var arriba = base - alto;
    ctx.strokeStyle = color;
    ctx.lineWidth = grosor;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - ancho / 2, base); ctx.lineTo(x, arriba);
    ctx.moveTo(x + ancho / 2, base); ctx.lineTo(x, arriba);
    var tramos = 5;
    for (var i = 1; i <= tramos; i++) {
      var f1 = (i - 1) / tramos, f2 = i / tramos;
      var y1 = base - alto * f1, y2 = base - alto * f2;
      var a1 = ancho / 2 * (1 - f1), a2 = ancho / 2 * (1 - f2);
      ctx.moveTo(x - a2, y2); ctx.lineTo(x + a2, y2);
      ctx.moveTo(x - a1, y1); ctx.lineTo(x + a2, y2);
      ctx.moveTo(x + a1, y1); ctx.lineTo(x - a2, y2);
    }
    ctx.moveTo(x, arriba); ctx.lineTo(x, arriba - alto * 0.12);
    ctx.stroke();
  }

  function crear(canvas, op) {
    op = op || {};
    var esHost = op.modo === "host";
    var ctx = canvas.getContext("2d");
    var dpr = 1, W = 0, H = 0, arriba = 0, Hs = 0, R = 30;
    var SUELO = esHost ? 0.8 : 0.86;          // altura (0–1) del pasto en el fondo
    var escalaY = esHost ? 1 : 1.3;          // en el celular los drones usan más alto
    var sueloObj = SUELO / escalaY;          // el pasto, medido como los drones
    var fondo = document.createElement("canvas");
    var frente = document.createElement("canvas");
    var estado = { modo: "vacio" };
    var reloj0 = performance.now();
    var particulas = [], marcas = [], textos = [];
    var derribados = {};
    var reventadas = {};
    var revel = null;
    var mascotaMax = 0.88;
    var cacheFrame = -1, cachePos = null;
    var nubes = [
      { x: 0.08, y: 0.1, s: 1.0, v: 0.006 },
      { x: 0.42, y: 0.05, s: 0.75, v: 0.004 },
      { x: 0.7, y: 0.16, s: 1.15, v: 0.005 },
      { x: 1.05, y: 0.32, s: 0.6, v: 0.007 },
      { x: 0.25, y: 0.38, s: 0.55, v: 0.003 }
    ];

    function seg() { return (performance.now() - reloj0) / 1000; }
    function px(x) { return x * W; }
    function py(y) { return arriba + y * Hs * escalaY; }
    function pyF(y) { return arriba + y * Hs; }

    // ---------- tamaño ----------
    function medir() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      Hs = Math.max(10, H - arriba);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      R = esHost ? limitar(Hs * 0.068, 24, 76) : limitar(W * 0.068, 20, 34);
      pintarFondo();
      pintarFrente();
    }

    function pintarFondo() {
      fondo.width = canvas.width; fondo.height = canvas.height;
      var c = fondo.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      var suelo = pyF(SUELO);
      var cielo = c.createLinearGradient(0, 0, 0, suelo);
      cielo.addColorStop(0, "#3E9FE6");
      cielo.addColorStop(0.65, "#86CBF5");
      cielo.addColorStop(1, "#CDEBFB");
      c.fillStyle = cielo;
      c.fillRect(0, 0, W, suelo + 2);
      // sol
      c.fillStyle = "rgba(255, 244, 200, .9)";
      c.beginPath(); c.arc(W * 0.9, pyF(0.1), R * 0.9, 0, Math.PI * 2); c.fill();
      // colinas lejanas
      c.fillStyle = "#8FCDB0";
      c.beginPath();
      c.moveTo(0, suelo);
      for (var x = 0; x <= W + 20; x += 20) c.lineTo(x, suelo - Hs * (0.05 + 0.03 * Math.sin(x / W * 7 + 1)));
      c.lineTo(W, suelo); c.closePath(); c.fill();
      // torres y parabólica a lo lejos
      var lejos = "rgba(46, 104, 128, .55)";
      torreReticulada(c, W * 0.1, suelo - Hs * 0.02, Hs * 0.36, Hs * 0.08, lejos, Math.max(1.5, R * 0.05));
      torreReticulada(c, W * 0.83, suelo - Hs * 0.03, Hs * 0.27, Hs * 0.06, lejos, Math.max(1.5, R * 0.045));
      c.fillStyle = lejos; c.strokeStyle = lejos; c.lineWidth = Math.max(2, R * 0.06);
      var dx = W * 0.64, dy = suelo - Hs * 0.08, dr = Hs * 0.06;
      c.beginPath(); c.moveTo(dx, suelo - Hs * 0.02); c.lineTo(dx, dy); c.stroke();
      c.beginPath(); c.ellipse(dx, dy - dr * 0.4, dr, dr * 0.55, -0.6, Math.PI * 0.05, Math.PI * 1.05); c.fill();
      // pasto
      var pasto = c.createLinearGradient(0, suelo, 0, H);
      pasto.addColorStop(0, "#58B86D"); pasto.addColorStop(1, "#3E9A57");
      c.fillStyle = pasto;
      c.fillRect(0, suelo, W, H - suelo);
    }

    function pintarFrente() {
      frente.width = canvas.width; frente.height = canvas.height;
      var c = frente.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      var borde = pyF(SUELO) + Hs * 0.02;
      var r = D.azar(7);
      c.fillStyle = "#2F8A4B";
      c.beginPath();
      c.moveTo(0, H);
      c.lineTo(0, borde);
      var paso = Math.max(10, R * 0.32);
      for (var x = 0; x <= W + paso; x += paso) {
        var alto = Hs * (0.025 + r() * 0.035);
        c.lineTo(x + paso * 0.5, borde - alto);
        c.lineTo(x + paso, borde - Hs * 0.004);
      }
      c.lineTo(W, H); c.closePath(); c.fill();
      c.fillStyle = "#24733D";
      c.fillRect(0, borde + Hs * 0.03, W, H);
      // arbustos
      [0.05, 0.31, 0.58, 0.95].forEach(function (bx, i) {
        var cx = W * bx, cy = borde + Hs * 0.01, rr = R * (0.9 + (i % 2) * 0.4);
        c.fillStyle = "#2A7E44";
        c.beginPath();
        c.arc(cx - rr * 0.6, cy, rr * 0.7, 0, Math.PI * 2);
        c.arc(cx, cy - rr * 0.35, rr * 0.85, 0, Math.PI * 2);
        c.arc(cx + rr * 0.7, cy, rr * 0.65, 0, Math.PI * 2);
        c.fill();
      });
    }

    // ---------- piezas ----------
    function dibujarNubes(t) {
      ctx.fillStyle = "rgba(255,255,255,.92)";
      nubes.forEach(function (n) {
        var x = ((n.x + t * n.v) % 1.3) - 0.15;
        var cx = px(x), cy = pyF(n.y), s = R * 1.3 * n.s;
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 1.5, s * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - s * 0.6, cy - s * 0.25, s * 0.7, s * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + s * 0.35, cy - s * 0.45, s * 0.8, s * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function medidasEtiqueta(texto, r) {
      var fs = Math.round(Math.max(esHost ? 15 : 11, r * (esHost ? 0.4 : 0.46)));
      ctx.font = "700 " + fs + "px 'Atkinson Hyperlegible', 'Segoe UI', sans-serif";
      var w = ctx.measureText(texto).width + fs * 1.1;
      return { fs: fs, w: w, h: fs * 1.55, dy: r * 1.05 };
    }

    function dibujarDron(x, y, r, i, texto, t, inclina, opts) {
      opts = opts || {};
      var color = COLORES[i];
      ctx.save();
      ctx.translate(x, y);
      if (opts.giro) ctx.rotate(opts.giro); else ctx.rotate(inclina * 0.14);
      if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

      // brazos y hélices
      ctx.strokeStyle = "#2B3A42";
      ctx.lineWidth = Math.max(2, r * 0.13);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 1.18, -r * 0.32); ctx.lineTo(r * 1.18, -r * 0.32);
      ctx.moveTo(-r * 1.18, -r * 0.32); ctx.lineTo(-r * 1.18, -r * 0.6);
      ctx.moveTo(r * 1.18, -r * 0.32); ctx.lineTo(r * 1.18, -r * 0.6);
      ctx.stroke();
      [-1, 1].forEach(function (lado) {
        var giroHelice = opts.helicesQuietas ? 0.9 : Math.abs(Math.cos(t * 34 + lado));
        ctx.fillStyle = "rgba(25, 36, 44, .6)";
        ctx.beginPath();
        ctx.ellipse(lado * r * 1.18, -r * 0.64, r * 0.66 * (0.2 + 0.8 * giroHelice), r * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2B3A42";
        ctx.beginPath(); ctx.arc(lado * r * 1.18, -r * 0.64, r * 0.1, 0, Math.PI * 2); ctx.fill();
      });

      // antena con luz
      ctx.strokeStyle = "#2B3A42";
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.5); ctx.lineTo(r * 0.52, -r * 1.02); ctx.stroke();
      ctx.fillStyle = (Math.floor(t * 3 + i) % 2) ? "#FF3B4E" : "#FFD6DA";
      ctx.beginPath(); ctx.arc(r * 0.52, -r * 1.06, r * 0.1, 0, Math.PI * 2); ctx.fill();

      // patas
      ctx.strokeStyle = "#2B3A42";
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, r * 0.5); ctx.lineTo(-r * 0.6, r * 0.78);
      ctx.moveTo(r * 0.45, r * 0.5); ctx.lineTo(r * 0.6, r * 0.78);
      ctx.stroke();

      // cuerpo
      redondeado(ctx, -r * 0.88, -r * 0.55, r * 1.76, r * 1.1, r * 0.42);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.08); ctx.strokeStyle = OSCUROS[i]; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.25)";
      redondeado(ctx, -r * 0.7, -r * 0.45, r * 1.0, r * 0.22, r * 0.11); ctx.fill();
      // letra
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.arc(0, r * 0.02, r * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = OSCUROS[i];
      ctx.font = "900 " + Math.round(r * 0.56) + "px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(LETRAS[i], 0, r * 0.05);
      ctx.restore();

      // cartel colgante con la respuesta
      if (texto && !opts.sinCartel) {
        var m = medidasEtiqueta(texto, r);
        var ty = y + m.dy;
        ctx.save();
        if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
        ctx.strokeStyle = "rgba(43,58,66,.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.4, y + r * 0.5); ctx.lineTo(x - m.w * 0.35, ty);
        ctx.moveTo(x + r * 0.4, y + r * 0.5); ctx.lineTo(x + m.w * 0.35, ty);
        ctx.stroke();
        redondeado(ctx, x - m.w / 2, ty, m.w, m.h, m.h * 0.3);
        ctx.fillStyle = "#FFFFFF"; ctx.fill();
        ctx.lineWidth = Math.max(2, r * 0.07); ctx.strokeStyle = color; ctx.stroke();
        ctx.fillStyle = TINTA;
        ctx.font = "700 " + m.fs + "px 'Atkinson Hyperlegible', 'Segoe UI', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(texto, x, ty + m.h / 2 + 1);
        ctx.restore();
      }
    }

    function dibujarInterferencia(x, y, r, b, t) {
      var color = b.dorada ? "#FFC233" : "#B04BFF";
      var borde = b.dorada ? "#B97E00" : "#6C1FB0";
      var puntas = 12;
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      for (var k = 0; k <= puntas; k++) {
        var ang = (k / puntas) * Math.PI * 2;
        var rr = r * (0.82 + 0.22 * Math.sin(t * 22 + k * 2.3 + b.id));
        var vx = Math.cos(ang) * rr, vy = Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.1); ctx.strokeStyle = borde; ctx.stroke();
      // estática
      var rnd = D.azar(Math.floor(t * 18) + b.id * 97);
      for (var s = 0; s < 9; s++) {
        ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.7)" : "rgba(20,0,40,.45)";
        var sx = (rnd() - 0.5) * r * 1.1, sy = (rnd() - 0.5) * r * 1.1;
        ctx.fillRect(sx, sy, r * 0.16, r * 0.08);
      }
      // ojos enojados
      [-1, 1].forEach(function (l) {
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath(); ctx.arc(l * r * 0.3, -r * 0.08, r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = TINTA;
        ctx.beginPath(); ctx.arc(l * r * 0.3 + (b.izquierda ? r * 0.06 : -r * 0.06), -r * 0.04, r * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = TINTA; ctx.lineWidth = Math.max(1.5, r * 0.09);
        ctx.beginPath(); ctx.moveTo(l * r * 0.52, -r * 0.38); ctx.lineTo(l * r * 0.1, -r * 0.24); ctx.stroke();
      });
      // rayos
      ctx.strokeStyle = borde; ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.85); ctx.lineTo(-r * 0.45, -r * 1.15); ctx.lineTo(-r * 0.25, -r * 1.2); ctx.lineTo(-r * 0.42, -r * 1.5);
      ctx.moveTo(r * 0.3, -r * 0.85); ctx.lineTo(r * 0.45, -r * 1.15); ctx.lineTo(r * 0.25, -r * 1.2); ctx.lineTo(r * 0.42, -r * 1.5);
      ctx.stroke();
      if (b.dorada) {
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "900 " + Math.round(r * 0.5) + "px 'Big Shoulders Display', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("x3", 0, r * 0.45);
      }
      ctx.restore();
    }

    // Torri, la torrecita mascota.
    function dibujarMascota(cx, base, alto, modo, t, dron) {
      var temblor = modo === "risa" ? Math.sin(t * 34) * alto * 0.012 : 0;
      ctx.save();
      ctx.translate(cx + temblor, 0);
      var cara = base - alto * 0.62, rc = alto * 0.2;
      // cuerpo reticulado
      torreReticulada(ctx, 0, base + alto * 0.05, alto * 0.62, alto * 0.42, "#4C6170", Math.max(3, alto * 0.035));
      // brazos
      ctx.strokeStyle = "#4C6170"; ctx.lineWidth = Math.max(3, alto * 0.04); ctx.lineCap = "round";
      ctx.beginPath();
      if (modo === "atrapo") {
        ctx.moveTo(-rc * 0.9, cara + rc * 0.3); ctx.lineTo(-rc * 1.25, cara - rc * 1.6);
        ctx.moveTo(rc * 0.9, cara + rc * 0.3); ctx.lineTo(rc * 1.25, cara - rc * 1.6);
      } else {
        ctx.moveTo(-rc * 0.9, cara + rc * 0.4); ctx.lineTo(-rc * 1.5, cara + rc * 1.1);
        ctx.moveTo(rc * 0.9, cara + rc * 0.4); ctx.lineTo(rc * 1.5, cara + rc * 1.1);
      }
      ctx.stroke();
      // antena y ondas
      ctx.beginPath(); ctx.moveTo(0, cara - rc); ctx.lineTo(0, cara - rc * 1.7); ctx.stroke();
      ctx.fillStyle = (Math.floor(t * 4) % 2) ? "#FF3B4E" : "#FFB547";
      ctx.beginPath(); ctx.arc(0, cara - rc * 1.8, rc * 0.18, 0, Math.PI * 2); ctx.fill();
      if (modo !== "atrapo") {
        ctx.strokeStyle = "rgba(255,181,71,.9)"; ctx.lineWidth = Math.max(2, alto * 0.02);
        for (var k = 1; k <= 3; k++) {
          var fase = (t * 1.5 + k / 3) % 1;
          ctx.globalAlpha = 1 - fase;
          ctx.beginPath(); ctx.arc(0, cara - rc * 1.8, rc * (0.4 + fase * 1.2), -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // cara
      ctx.fillStyle = "#F4F8F9";
      ctx.beginPath(); ctx.arc(0, cara, rc, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(2, alto * 0.025); ctx.strokeStyle = "#4C6170"; ctx.stroke();
      ctx.fillStyle = "rgba(255,122,92,.45)";
      ctx.beginPath(); ctx.arc(-rc * 0.55, cara + rc * 0.3, rc * 0.17, 0, Math.PI * 2); ctx.arc(rc * 0.55, cara + rc * 0.3, rc * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = TINTA; ctx.fillStyle = TINTA; ctx.lineWidth = Math.max(2, rc * 0.12);
      if (modo === "risa") {
        ctx.beginPath();
        ctx.moveTo(-rc * 0.5, cara - rc * 0.15); ctx.lineTo(-rc * 0.32, cara - rc * 0.32); ctx.lineTo(-rc * 0.14, cara - rc * 0.15);
        ctx.moveTo(rc * 0.14, cara - rc * 0.15); ctx.lineTo(rc * 0.32, cara - rc * 0.32); ctx.lineTo(rc * 0.5, cara - rc * 0.15);
        ctx.stroke();
        ctx.fillStyle = "#C2344A";
        ctx.beginPath(); ctx.moveTo(-rc * 0.42, cara + rc * 0.12); ctx.quadraticCurveTo(0, cara + rc * (0.85 + 0.1 * Math.sin(t * 30)), rc * 0.42, cara + rc * 0.12); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(-rc * 0.32, cara - rc * 0.18, rc * 0.12, 0, Math.PI * 2); ctx.arc(rc * 0.32, cara - rc * 0.18, rc * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, cara + rc * 0.12, rc * 0.42, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      }
      ctx.restore();
      if (modo === "atrapo" && dron) {
        dibujarDron(cx, cara - rc * 2.35, R * 0.85, dron.i, null, t, 0, { helicesQuietas: true });
      }
    }

    function burbuja(x, y, texto, maxX) {
      var fs = Math.round(esHost ? limitar(R * 0.42, 16, 30) : 14);
      ctx.font = "700 " + fs + "px 'Atkinson Hyperlegible', 'Segoe UI', sans-serif";
      var w = ctx.measureText(texto).width + fs * 1.4, h = fs * 2;
      var bx = limitar(x - w / 2, 8, Math.min(maxX || W, W) - w - 8), by = y - h;
      ctx.fillStyle = "#FFFFFF";
      redondeado(ctx, bx, by, w, h, h * 0.35); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - fs * 0.4, by + h - 1); ctx.lineTo(x + fs * 0.4, by + h - 1); ctx.lineTo(x, by + h + fs * 0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(texto, bx + w / 2, by + h / 2 + 1);
    }

    // ---------- posiciones ----------
    function tRonda() { return estado.modo === "vacio" ? 0 : (performance.now() - estado.inicioLocal) / 1000; }

    function posiciones() {
      var f = Math.floor(performance.now());
      if (f === cacheFrame && cachePos) return cachePos;
      cacheFrame = f;
      var t = tRonda();
      cachePos = estado.drones ? estado.drones.map(function (d) { return D.posDron(d, t); }) : [];
      return cachePos;
    }

    // ---------- partículas ----------
    function chispas(x, y, color, n) {
      for (var k = 0; k < (n || 16); k++) {
        var a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * R * 4;
        particulas.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - R, vida: 0.5 + Math.random() * 0.3, t: seg(), color: color || (Math.random() < 0.5 ? "#FFD25A" : "#FF8A3D"), tam: R * (0.08 + Math.random() * 0.08), tipo: "chispa" });
      }
    }
    function humo(x, y) {
      particulas.push({ x: x, y: y, vx: (Math.random() - 0.5) * R, vy: -R * 0.6, vida: 0.9, t: seg(), tam: R * 0.25, tipo: "humo" });
    }
    function polvo(x, y) {
      for (var k = 0; k < 10; k++) particulas.push({ x: x + (Math.random() - 0.5) * R * 2, y: y, vx: (Math.random() - 0.5) * R * 2, vy: -R * (0.5 + Math.random()), vida: 0.7, t: seg(), tam: R * 0.3, tipo: "humo" });
    }
    function pixeles(x, y, color) {
      for (var k = 0; k < 14; k++) {
        var a = Math.random() * Math.PI * 2, v = (0.5 + Math.random()) * R * 3.5;
        particulas.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0.55, t: seg(), color: color, tam: R * 0.14, tipo: "pixel" });
      }
    }

    function dibujarParticulas(ahora, dt) {
      particulas = particulas.filter(function (p) { return ahora - p.t < p.vida; });
      particulas.forEach(function (p) {
        var u = (ahora - p.t) / p.vida;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.tipo !== "humo") p.vy += R * 9 * dt;
        ctx.globalAlpha = 1 - u;
        if (p.tipo === "humo") {
          ctx.fillStyle = "rgba(90,100,110,.55)";
          ctx.beginPath(); ctx.arc(p.x, p.y, p.tam * (1 + u * 1.5), 0, Math.PI * 2); ctx.fill();
        } else if (p.tipo === "pixel") {
          ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.tam, p.tam);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.tam, 0, Math.PI * 2); ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }

    function dibujarMarcas(ahora) {
      marcas = marcas.filter(function (m) { return ahora - m.t < 0.9; });
      marcas.forEach(function (m) {
        var u = (ahora - m.t) / 0.9;
        var x = px(m.x), y = py(m.y);
        ctx.globalAlpha = 1 - u;
        ctx.strokeStyle = m.color; ctx.lineWidth = Math.max(2.5, R * 0.09);
        ctx.beginPath(); ctx.arc(x, y, R * (0.2 + u * 0.75), 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - R * 0.3, y); ctx.lineTo(x - R * 0.12, y);
        ctx.moveTo(x + R * 0.12, y); ctx.lineTo(x + R * 0.3, y);
        ctx.moveTo(x, y - R * 0.3); ctx.lineTo(x, y - R * 0.12);
        ctx.moveTo(x, y + R * 0.12); ctx.lineTo(x, y + R * 0.3);
        ctx.stroke();
        if (m.etiqueta) {
          var fs = Math.round(esHost ? limitar(R * 0.3, 12, 20) : 11);
          ctx.font = "700 " + fs + "px 'Atkinson Hyperlegible', sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,31,43,.85)";
          ctx.strokeText(m.etiqueta, x, y - R * 0.55);
          ctx.fillStyle = "#FFFFFF"; ctx.fillText(m.etiqueta, x, y - R * 0.55);
        }
      });
      ctx.globalAlpha = 1;
      textos = textos.filter(function (o) { return ahora - o.t < 1.1; });
      textos.forEach(function (o) {
        var u = (ahora - o.t) / 1.1;
        var fs = Math.round(R * (o.grande ? 0.9 : 0.6));
        ctx.globalAlpha = 1 - u * u;
        ctx.font = "900 " + fs + "px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(3, fs * 0.14); ctx.strokeStyle = TINTA;
        var y = Math.max(arriba + fs * 0.7, py(o.y) - u * R * 1.4);
        ctx.strokeText(o.texto, px(o.x), y);
        ctx.fillStyle = o.color; ctx.fillText(o.texto, px(o.x), y);
      });
      ctx.globalAlpha = 1;
    }

    // ---------- dibujo principal ----------
    var ultimo = seg();
    function cuadro() {
      var ahora = seg();
      var dt = Math.min(0.05, ahora - ultimo);
      ultimo = ahora;
      if (!W) medir();
      if (W) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(fondo, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        dibujarNubes(ahora);
        var t = tRonda();
        var mascota = null;

        if (estado.modo === "pregunta") {
          var pos = posiciones();
          pos.forEach(function (p, i) {
            var caida = derribados[i];
            if (caida) {
              var dc = ahora - caida.t;
              if (dc < 0.18) {
                dibujarDron(px(caida.x), py(caida.y), R, i, estado.ops[i], ahora, 0, { helicesQuietas: true });
              } else {
                var yc = caida.y + 1.5 * (dc - 0.18) * (dc - 0.18);
                if (yc < sueloObj + 0.05) {
                  if (Math.random() < 0.4) humo(px(caida.x), py(yc));
                  dibujarDron(px(caida.x + caida.dir * 0.03 * dc), py(yc), R, i, null, ahora, 0, { giro: (dc - 0.18) * 7 * caida.dir, helicesQuietas: true });
                } else if (!caida.polvo) { caida.polvo = true; polvo(px(caida.x), pyF(SUELO + 0.03)); }
              }
              return;
            }
            dibujarDron(px(p.x), py(p.y), R, i, estado.ops[i], ahora, p.dir);
          });
        } else if (estado.modo === "revelar" && revel) {
          var dt2 = ahora - revel.t;
          revel.base.forEach(function (b, i) {
            var esCorrecta = i === revel.correcta;
            if (esCorrecta && revel.acertaron > 0) {
              if (dt2 < 0.5) {
                dibujarDron(px(b.x), py(b.y), R * (1 + 0.08 * Math.sin(dt2 * 40)), i, estado.ops[i], ahora, 0, { helicesQuietas: true });
              } else {
                var yc = b.y + 1.6 * (dt2 - 0.5) * (dt2 - 0.5);
                if (yc < sueloObj + 0.05) {
                  if (Math.random() < 0.5) humo(px(b.x), py(yc));
                  dibujarDron(px(b.x), py(yc), R, i, null, ahora, 0, { giro: (dt2 - 0.5) * 6, helicesQuietas: true });
                } else if (!revel.aterrizo) {
                  revel.aterrizo = ahora;
                  polvo(px(b.x), pyF(SUELO + 0.03));
                }
              }
            } else {
              var lado = b.x < 0.5 ? -1 : 1;
              var ye = b.y - (0.3 * dt2 + 0.8 * dt2 * dt2);
              if (ye > -0.4) {
                dibujarDron(px(b.x + lado * 0.12 * dt2), py(ye), R, i, estado.ops[i], ahora, lado, { alpha: esCorrecta ? 1 : 0.85 });
                if (esCorrecta) {
                  ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);
                  ctx.beginPath(); ctx.arc(px(b.x + lado * 0.12 * dt2), py(ye), R * 1.7, 0, Math.PI * 2); ctx.stroke();
                  ctx.setLineDash([]);
                }
              }
            }
          });
          var listo = revel.acertaron > 0 ? (revel.aterrizo ? ahora - revel.aterrizo - 0.25 : -1) : dt2 - 1.2;
          if (listo > 0) {
            var sube = suave(listo / 0.45);
            var alto = Math.min(Hs * 0.42, R * 4.4);
            var mx = revel.acertaron > 0 ? limitar(revel.base[revel.correcta].x, 0.12, mascotaMax) : Math.min(0.5, mascotaMax - 0.04);
            mascota = { x: px(mx), base: pyF(SUELO + 0.06) - alto * 0.2 + alto * (1 - sube) * 1.3, alto: alto, modo: revel.acertaron > 0 ? "atrapo" : "risa", sube: sube };
          }
        } else if (estado.modo === "bonus") {
          estado.lista.forEach(function (b) {
            if (reventadas[b.id]) return;
            var p = D.posInterferencia(b, t);
            if (p) dibujarInterferencia(px(p.x), py(p.y), R * (esHost ? 0.62 : 0.8), b, ahora);
          });
        }

        if (mascota) {
          dibujarMascota(mascota.x, mascota.base, mascota.alto, mascota.modo, ahora, mascota.modo === "atrapo" ? { i: revel.correcta } : null);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(frente, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (mascota && mascota.sube >= 1) {
          var texto = mascota.modo === "atrapo"
            ? "¡Lo atrapé! Era la " + LETRAS[revel.correcta]
            : "¡Ja, ja! Nadie le dio. Era la " + LETRAS[revel.correcta];
          var topeCara = mascota.base - mascota.alto * (mascota.modo === "atrapo" ? 1.45 : 1.05);
          burbuja(mascota.x, topeCara, texto, px(mascotaMax + 0.1));
        }
        dibujarParticulas(ahora, dt);
        dibujarMarcas(ahora);
      }
      requestAnimationFrame(cuadro);
    }

    // ---------- API ----------
    function fijarInicio(transcurridoMs) { estado.inicioLocal = performance.now() - (transcurridoMs || 0); }

    var api = {
      LETRAS: LETRAS,
      COLORES: COLORES,
      margenSuperior: function (px2) { if (px2 !== arriba) { arriba = px2; medir(); } },
      limiteMascota: function (x) { mascotaMax = x; },
      medir: medir,
      vacio: function () { estado = { modo: "vacio" }; revel = null; derribados = {}; reventadas = {}; },
      pregunta: function (d) {
        estado = { modo: "pregunta", clave: d.clave, drones: D.drones(d.seed, d.nivel), ops: d.ops };
        fijarInicio(d.transcurridoMs);
        revel = null; derribados = {}; cachePos = null;
      },
      bonus: function (d) {
        estado = { modo: "bonus", clave: d.clave, lista: D.interferencias(d.seed, d.duracion || D.DURACION_BONUS) };
        fijarInicio(d.transcurridoMs);
        revel = null; reventadas = {};
      },
      sincronizar: function (transcurridoMs) {
        if (estado.modo !== "pregunta" && estado.modo !== "bonus") return;
        var actual = performance.now() - estado.inicioLocal;
        if (Math.abs(actual - transcurridoMs) > 450) fijarInicio(transcurridoMs);
      },
      clave: function () { return estado.clave; },
      modo: function () { return estado.modo; },
      revelar: function (d) {
        if (estado.modo !== "pregunta") return;
        var pos = posiciones();
        revel = { t: seg(), correcta: d.correcta, acertaron: d.acertaron, base: pos.map(function (p) { return { x: p.x, y: p.y }; }) };
        estado.modo = "revelar";
        if (d.acertaron > 0) chispas(px(pos[d.correcta].x), py(pos[d.correcta].y), null, 22);
      },
      // Coordenadas de un toque, de 0 a 1 dentro del cielo.
      normalizar: function (clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        return { x: (clientX - rect.left) / W, y: (clientY - rect.top - arriba) / (Hs * escalaY) };
      },
      // Qué hay debajo de un punto (en coordenadas 0–1).
      apuntar: function (x, y) {
        var X = px(x), Y = py(y);
        if (estado.modo === "pregunta") {
          var pos = posiciones();
          var mejor = null, dist = Infinity;
          pos.forEach(function (p, i) {
            if (derribados[i]) return;
            var cx = px(p.x), cy = py(p.y);
            var d = Math.hypot(X - cx, Y - cy);
            var m = medidasEtiqueta(estado.ops[i], R);
            var enCartel = X >= cx - m.w / 2 - 6 && X <= cx + m.w / 2 + 6 && Y >= cy + m.dy - 6 && Y <= cy + m.dy + m.h + 6;
            if ((d < R * 1.5 || enCartel) && d < dist) { mejor = { tipo: "dron", i: i, x: p.x, y: p.y, dir: p.dir }; dist = d; }
          });
          return mejor;
        }
        if (estado.modo === "bonus") {
          var t = tRonda(), elegido = null, dmin = Infinity;
          estado.lista.forEach(function (b) {
            if (reventadas[b.id]) return;
            var p = D.posInterferencia(b, t);
            if (!p) return;
            var d = Math.hypot(X - px(p.x), Y - py(p.y));
            if (d < R * (esHost ? 0.62 : 0.8) * 1.45 && d < dmin) { elegido = { tipo: "interferencia", id: b.id, valor: b.valor, dorada: b.dorada, x: p.x, y: p.y }; dmin = d; }
          });
          return elegido;
        }
        return null;
      },
      derribar: function (i, x, y, dir) {
        derribados[i] = { t: seg(), x: x, y: y, dir: dir || 1 };
        chispas(px(x), py(y));
      },
      // Al reconectar: el dron ya derribado no se vuelve a dibujar.
      ocultarDron: function (i) { derribados[i] = { t: -100, x: 0, y: 2, dir: 1, polvo: true }; },
      reventar: function (id, x, y, dorada) {
        reventadas[id] = true;
        if (x !== undefined) pixeles(px(x), py(y), dorada ? "#FFC233" : "#B04BFF");
      },
      ocultarInterferencia: function (id) { reventadas[id] = true; },
      marcarDisparo: function (x, y, color, etiqueta) { marcas.push({ x: x, y: y, color: color, etiqueta: etiqueta, t: seg() }); },
      texto: function (x, y, texto, color, grande) { textos.push({ x: x, y: y, texto: texto, color: color, grande: grande, t: seg() }); },
      dronesEnPantalla: function () {
        // Para pruebas: posición en píxeles de cada dron.
        var rect = canvas.getBoundingClientRect();
        return posiciones().map(function (p, i) { return { i: i, x: rect.left + px(p.x), y: rect.top + py(p.y), derribado: Boolean(derribados[i]) }; });
      },
      interferenciasEnPantalla: function () {
        var rect = canvas.getBoundingClientRect(), t = tRonda();
        if (estado.modo !== "bonus") return [];
        return estado.lista.map(function (b) {
          var p = D.posInterferencia(b, t);
          return p && !reventadas[b.id] ? { id: b.id, x: rect.left + px(p.x), y: rect.top + py(p.y) } : null;
        }).filter(Boolean);
      }
    };

    if (window.ResizeObserver) new ResizeObserver(medir).observe(canvas);
    else window.addEventListener("resize", medir);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir);
    medir();
    requestAnimationFrame(cuadro);
    return api;
  }

  window.Escena = { crear: crear, COLORES: COLORES, LETRAS: LETRAS };
})();
