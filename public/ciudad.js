// Caza de Señales · bonus «Cubre la ciudad»
// Dibuja el mapa, las antenas y su cobertura; en el celular también maneja los toques.
(function () {
  "use strict";

  var D = window.EscenaDatos;
  var C = D.CIUDAD;
  var COLOR = { omni: "#2EBCAC", sector: "#F4CC4E", para: "#FF5D8F" };
  var NOMBRE = { omni: "Omnidireccional", sector: "Sectorial", para: "Parabólica" };
  var TINTA = "#1C0F16";

  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Rectángulo del mapa dentro de un área, manteniendo la proporción 1 : 4/3.
  function ajustar(area, margen) {
    margen = margen || 0;
    var w = Math.min(area.w - margen * 2, (area.h - margen * 2) / C.ALTO);
    var h = w * C.ALTO;
    return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w: w, h: h };
  }

  // ---------- piezas del mapa ----------
  function fondo(ctx, R, mapa) {
    var s = R.w;
    var Y = function (y) { return R.y + y * s; };
    ctx.save();
    redondeado(ctx, R.x, R.y, R.w, R.h, Math.max(8, s * 0.03));
    ctx.clip();
    // cielo del atardecer
    var cielo = ctx.createLinearGradient(0, R.y, 0, Y(C.MONTANA));
    cielo.addColorStop(0, "#D9472F"); cielo.addColorStop(1, "#F7B57A");
    ctx.fillStyle = cielo; ctx.fillRect(R.x, R.y, R.w, Y(C.MONTANA) - R.y + 2);
    ctx.fillStyle = "rgba(251, 227, 174, .85)";
    ctx.beginPath(); ctx.arc(R.x + s * (mapa.espejo ? 0.28 : 0.72), Y(0.2), s * 0.13, 0, Math.PI * 2); ctx.fill();
    // montañas
    var picos = [[-0.05, 0.42], [0.12, 0.08], [0.3, 0.3], [0.48, 0.05], [0.66, 0.28], [0.84, 0.1], [1.05, 0.42]];
    ctx.fillStyle = "#B9443A";
    ctx.beginPath(); ctx.moveTo(R.x, Y(C.MONTANA + 0.02));
    picos.forEach(function (p) { ctx.lineTo(R.x + p[0] * s, Y(p[1])); });
    ctx.lineTo(R.x + s, Y(C.MONTANA + 0.02)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255, 214, 180, .45)"; ctx.lineWidth = Math.max(1.5, s * 0.006);
    [[0.12, 0.08], [0.48, 0.05], [0.84, 0.1]].forEach(function (p) {
      ctx.beginPath();
      ctx.moveTo(R.x + p[0] * s, Y(p[1] + 0.01)); ctx.lineTo(R.x + (p[0] + 0.05) * s, Y(p[1] + 0.09));
      ctx.moveTo(R.x + (p[0] - 0.02) * s, Y(p[1] + 0.05)); ctx.lineTo(R.x + (p[0] + 0.02) * s, Y(p[1] + 0.13));
      ctx.stroke();
    });
    // meseta del pueblo
    var P = mapa.centros.pueblo;
    ctx.fillStyle = "#D35C43";
    ctx.beginPath(); ctx.ellipse(R.x + P.x * s, Y(P.y + 0.02), s * 0.14, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // pinos al pie de la montaña
    ctx.fillStyle = "#3B1C28";
    for (var k = 0; k < 22; k++) {
      var px = R.x + (k / 21) * s, base = Y(C.MONTANA + 0.03), alto = s * (0.05 + ((k * 37) % 5) * 0.008);
      ctx.beginPath(); ctx.moveTo(px - alto * 0.32, base); ctx.lineTo(px, base - alto); ctx.lineTo(px + alto * 0.32, base); ctx.closePath(); ctx.fill();
    }
    // suelo de la ciudad
    var suelo = ctx.createLinearGradient(0, Y(C.MONTANA), 0, R.y + R.h);
    suelo.addColorStop(0, "#4A2330"); suelo.addColorStop(1, "#2B1520");
    ctx.fillStyle = suelo; ctx.fillRect(R.x, Y(C.MONTANA + 0.03), R.w, R.h);
    // calles
    ctx.strokeStyle = "rgba(255, 200, 170, .07)"; ctx.lineWidth = 1;
    for (var g = 1; g < C.COLS; g++) { ctx.beginPath(); ctx.moveTo(R.x + (g / C.COLS) * s, Y(C.MONTANA + 0.04)); ctx.lineTo(R.x + (g / C.COLS) * s, R.y + R.h); ctx.stroke(); }
    for (var f = 7; f < C.FILAS; f++) { ctx.beginPath(); ctx.moveTo(R.x, Y(f / C.COLS)); ctx.lineTo(R.x + R.w, Y(f / C.COLS)); ctx.stroke(); }
    // avenida
    var A = mapa.avenida;
    ctx.strokeStyle = "#5E2E3B"; ctx.lineWidth = s * 0.05; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(R.x + A[0].x * s, Y(A[0].y + 0.045)); ctx.lineTo(R.x + A[1].x * s, Y(A[1].y + 0.045)); ctx.stroke();
    ctx.strokeStyle = "rgba(246, 196, 83, .55)"; ctx.lineWidth = Math.max(1, s * 0.004); ctx.setLineDash([s * 0.015, s * 0.015]);
    ctx.beginPath(); ctx.moveTo(R.x + A[0].x * s, Y(A[0].y + 0.045)); ctx.lineTo(R.x + A[1].x * s, Y(A[1].y + 0.045)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function zonaCobertura(ctx, R, ant, enlazado, t) {
    var s = R.w, x = R.x + ant.x * s, y = R.y + ant.y * s, col = COLOR[ant.t];
    ctx.save();
    if (ant.t === "omni") {
      ctx.fillStyle = "rgba(46, 188, 172, .2)"; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.005);
      ctx.beginPath(); ctx.arc(x, y, C.R_OMNI * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (ant.t === "sector") {
      var ab = (C.ABERTURA / 2) * Math.PI / 180;
      ctx.fillStyle = "rgba(244, 204, 78, .2)"; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.005);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, C.R_SECTOR * s, ant.a - ab, ant.a + ab); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      var largo = C.R_PARA * s;
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * (enlazado ? 0.012 : 0.006));
      if (!enlazado) ctx.setLineDash([s * 0.02, s * 0.015]);
      var fin = enlazado ? { x: R.x + enlazado.x * s, y: R.y + enlazado.y * s } : { x: x + Math.cos(ant.a) * largo, y: y + Math.sin(ant.a) * largo };
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fin.x, fin.y); ctx.stroke();
      ctx.setLineDash([]);
      if (enlazado) {
        for (var k = 0; k < 3; k++) {
          var u = ((t || 0) * 0.9 + k / 3) % 1;
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath(); ctx.arc(x + (fin.x - x) * u, y + (fin.y - y) * u, Math.max(2, s * 0.008), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function edificio(ctx, R, k, cubierta, rojo) {
    var s = R.w, cel = s / C.COLS, x = R.x + k.x * s, y = R.y + k.y * s;
    var luz = cubierta ? "#FFD25A" : "#2B1520";
    var cuerpo = cubierta ? "#F6DDB8" : "#7A4655";
    if (rojo) { cuerpo = "#C93A4E"; luz = "#2B1520"; }
    if (cubierta) {
      ctx.fillStyle = "rgba(46, 188, 172, .28)";
      ctx.fillRect(x - cel / 2 + 1, y - cel / 2 + 1, cel - 2, cel - 2);
    }
    ctx.fillStyle = cuerpo;
    var w = cel * 0.62;
    if (k.zona === "avenida") {
      var h = cel * 0.86;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = luz;
      for (var f = 0; f < 3; f++) for (var c = 0; c < 2; c++) ctx.fillRect(x - w / 2 + w * (0.18 + c * 0.44), y - h / 2 + h * (0.12 + f * 0.29), w * 0.2, h * 0.14);
    } else if (k.zona === "industria") {
      ctx.fillRect(x - w / 2, y - cel * 0.05, w, cel * 0.38);
      ctx.fillRect(x + w * 0.15, y - cel * 0.4, w * 0.2, cel * 0.4);
      ctx.fillStyle = luz; ctx.fillRect(x - w * 0.35, y + cel * 0.06, w * 0.25, cel * 0.12);
    } else {
      ctx.fillRect(x - w / 2, y - cel * 0.08, w, cel * 0.42);
      ctx.beginPath(); ctx.moveTo(x - w * 0.62, y - cel * 0.06); ctx.lineTo(x, y - cel * 0.4); ctx.lineTo(x + w * 0.62, y - cel * 0.06); ctx.closePath(); ctx.fill();
      ctx.fillStyle = luz; ctx.fillRect(x - w * 0.14, y + cel * 0.04, w * 0.28, cel * 0.16);
    }
  }

  function icono(ctx, x, y, t, a, tam, resaltar) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = "round";
    if (resaltar) {
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, tam * 1.15, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = TINTA;
    ctx.beginPath(); ctx.arc(0, 0, tam * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLOR[t]; ctx.fillStyle = COLOR[t]; ctx.lineWidth = Math.max(2, tam * 0.16);
    if (t === "omni") {
      ctx.beginPath(); ctx.moveTo(0, tam * 0.55); ctx.lineTo(0, -tam * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -tam * 0.55, tam * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.5, tam * 0.1);
      ctx.beginPath(); ctx.arc(0, -tam * 0.55, tam * 0.4, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -tam * 0.55, tam * 0.4, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
    } else if (t === "sector") {
      ctx.rotate(a + Math.PI / 2);
      redondeado(ctx, -tam * 0.22, -tam * 0.6, tam * 0.44, tam * 1.1, tam * 0.1); ctx.fill();
      ctx.fillStyle = TINTA; ctx.fillRect(-tam * 0.06, -tam * 0.45, tam * 0.12, tam * 0.8);
    } else {
      ctx.rotate(a);
      ctx.beginPath(); ctx.arc(-tam * 0.2, 0, tam * 0.62, -Math.PI * 0.42, Math.PI * 0.42); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-tam * 0.2, 0); ctx.lineTo(tam * 0.55, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(tam * 0.58, 0, tam * 0.12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function etiqueta(ctx, R, x, y, texto, tam) {
    ctx.font = "700 " + tam + "px 'Atkinson Hyperlegible', 'Segoe UI', sans-serif";
    var w = ctx.measureText(texto).width + tam * 0.9, h = tam * 1.5;
    x = Math.max(R.x + w / 2 + 6, Math.min(R.x + R.w - w / 2 - 6, x));
    ctx.fillStyle = "rgba(28, 15, 22, .82)";
    redondeado(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = "#FBEFE3"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(texto, x, y + 1);
  }

  function monstruo(ctx, x, y, r, t, semilla) {
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 10 + semilla) * r * 0.12);
    ctx.beginPath();
    for (var k = 0; k <= 10; k++) {
      var ang = (k / 10) * Math.PI * 2, rr = r * (0.85 + 0.2 * Math.sin(t * 18 + k * 2.1 + semilla));
      if (k === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = "#3BB89B"; ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = "#1E5E50"; ctx.stroke();
    [-1, 1].forEach(function (l) {
      ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(l * r * 0.32, -r * 0.1, r * 0.24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = TINTA; ctx.beginPath(); ctx.arc(l * r * 0.32, -r * 0.06, r * 0.11, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = TINTA;
    ctx.beginPath(); ctx.arc(0, r * 0.35, r * 0.22, 0, Math.PI); ctx.fill();
    ctx.restore();
  }

  // Dibujo completo. op: { etiquetas, seleccion, ataque: {t, res}, t }
  function dibujar(ctx, R, mapa, antenas, res, op) {
    op = op || {};
    var t = op.t || 0;
    fondo(ctx, R, mapa);
    ctx.save();
    redondeado(ctx, R.x, R.y, R.w, R.h, Math.max(8, R.w * 0.03));
    ctx.clip();
    var P = mapa.centros.pueblo;
    antenas.forEach(function (a) {
      var enlazado = a.t === "para" && mapa.celdas.some(function (k) { return k.soloEnlace && D.cubre(a, k); }) ? P : null;
      zonaCobertura(ctx, R, a, enlazado, t);
    });
    var ataque = op.ataque;
    var rojas = {};
    if (ataque) ataque.objetivos.forEach(function (o) { if (ataque.t >= o.llega) rojas[o.i] = true; });
    mapa.celdas.forEach(function (k) { edificio(ctx, R, k, Boolean(res.cubiertas[k.i]), rojas[k.i]); });
    antenas.forEach(function (a, n) {
      icono(ctx, R.x + a.x * R.w, R.y + a.y * R.w, a.t, a.a, Math.max(10, R.w * 0.04), op.seleccion === n);
    });
    if (ataque) {
      ataque.objetivos.forEach(function (o) {
        var u = (ataque.t - o.sale) / (o.llega - o.sale);
        if (u < 0) return;
        var k = mapa.celdas[o.i];
        var fx = R.x + k.x * R.w, fy = R.y + k.y * R.w;
        if (u >= 1) {
          if (Math.floor(ataque.t * 3 + o.i) % 2 === 0) {
            ctx.strokeStyle = "#FF5D73"; ctx.lineWidth = 2;
            ctx.strokeRect(fx - R.w / C.COLS / 2 + 1, fy - R.w / C.COLS / 2 + 1, R.w / C.COLS - 2, R.w / C.COLS - 2);
          }
          monstruo(ctx, fx + R.w * 0.012, fy - R.w * 0.02, R.w * 0.022, ataque.t, o.i);
        } else {
          var e = u * u * (3 - 2 * u);
          monstruo(ctx, R.x + (o.x0 + (k.x - o.x0) * e) * R.w, R.y + (o.y0 + (k.y - o.y0) * e) * R.w, R.w * 0.026, ataque.t, o.i);
        }
      });
    }
    if (op.etiquetas) {
      var tam = Math.max(11, Math.min(20, R.w * 0.034));
      var Z = mapa.centros;
      etiqueta(ctx, R, R.x + Z.pueblo.x * R.w, R.y + (Z.pueblo.y - 0.11) * R.w, "Pueblo tras la montaña", tam);
      etiqueta(ctx, R, R.x + Z.barrio.x * R.w, R.y + (Z.barrio.y - 0.2) * R.w, "Barrio", tam);
      etiqueta(ctx, R, R.x + Z.industria.x * R.w, R.y + (Z.industria.y - 0.13) * R.w, "Zona industrial", tam);
      etiqueta(ctx, R, R.x + Z.avenida.x * R.w, R.y + (Z.avenida.y - 0.085) * R.w, "Avenida", tam);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(251, 239, 227, .25)"; ctx.lineWidth = 2;
    redondeado(ctx, R.x, R.y, R.w, R.h, Math.max(8, R.w * 0.03)); ctx.stroke();
  }

  // Monstruos que van a las celdas sin señal (para el final de la ronda).
  function prepararAtaque(mapa, res) {
    var sin = mapa.celdas.filter(function (k) { return !res.cubiertas[k.i]; });
    var paso = Math.max(1, Math.ceil(sin.length / 22));
    var objetivos = [];
    sin.forEach(function (k, n) {
      if (n % paso) return;
      var bordes = [{ x: -0.06, y: k.y }, { x: 1.06, y: k.y }, { x: k.x, y: C.ALTO + 0.06 }];
      var b = bordes.reduce(function (m, e) { return Math.hypot(e.x - k.x, e.y - k.y) < Math.hypot(m.x - k.x, m.y - k.y) ? e : m; });
      var sale = 0.4 + objetivos.length * 0.12;
      objetivos.push({ i: k.i, x0: b.x, y0: b.y, sale: sale, llega: sale + 1.5 });
    });
    return objetivos;
  }

  // ---------- control táctil en el celular ----------
  function control(op) {
    var st = {
      mapa: null, antenas: [], res: { pct: 0, cubiertas: {} }, herramienta: "omni",
      rect: null, arrastre: null, seleccion: -1
    };
    function recalcular() {
      st.res = D.cobertura(st.mapa, st.antenas);
      if (op.cambio) op.cambio(st);
    }
    function aMapa(px, py) {
      if (!st.rect) return null;
      return { x: (px - st.rect.x) / st.rect.w, y: (py - st.rect.y) / st.rect.w };
    }
    return {
      estado: st,
      iniciar: function (seed, antenas) {
        st.mapa = D.ciudadMapa(seed);
        st.antenas = (antenas || []).map(function (a) { return { t: a.t, x: a.x, y: a.y, a: a.a }; });
        st.seleccion = -1; st.arrastre = null;
        st.res = D.cobertura(st.mapa, st.antenas);
        if (op.cambio) op.cambio(st);
      },
      herramienta: function (t) { st.herramienta = t; },
      dibujar: function (ctx, info) {
        if (!st.mapa) return;
        ctx.fillStyle = "#1C0F16";
        ctx.fillRect(0, info.arriba, info.W, info.Hs);
        st.rect = ajustar({ x: 0, y: info.arriba, w: info.W, h: info.Hs }, 8);
        st.rect.y = info.arriba + 8;
        dibujar(ctx, st.rect, st.mapa, st.antenas, st.res, { t: info.t, seleccion: st.seleccion, etiquetas: st.antenas.length === 0 });
      },
      abajo: function (px, py) {
        var m = aMapa(px, py);
        if (!m || m.x < 0 || m.x > 1 || m.y < 0 || m.y > C.ALTO) return;
        var cerca = -1, dmin = 0.07;
        st.antenas.forEach(function (a, n) { var d = Math.hypot(a.x - m.x, a.y - m.y); if (d < dmin) { dmin = d; cerca = n; } });
        if (cerca >= 0) {
          st.seleccion = cerca;
          st.arrastre = { n: cerca, px: px, py: py, movio: false, nueva: false };
          return;
        }
        if (m.y < C.Y_MIN) { if (op.aviso) op.aviso("Las antenas van en la ciudad. En la montaña no se puede construir"); return; }
        if (st.antenas.length >= C.MAX_ANTENAS) { if (op.aviso) op.aviso("Ya usaste tus 4 antenas. Toca una para quitarla"); return; }
        var a = { t: st.herramienta, x: m.x, y: m.y, a: -Math.PI / 2 };
        st.antenas.push(a);
        st.seleccion = st.antenas.length - 1;
        st.arrastre = { n: st.seleccion, px: px, py: py, movio: false, nueva: true };
        recalcular();
        if (op.sonido) op.sonido("poner");
      },
      mover: function (px, py) {
        var ar = st.arrastre;
        if (!ar) return;
        if (Math.hypot(px - ar.px, py - ar.py) > 10) ar.movio = true;
        if (!ar.movio) return;
        var a = st.antenas[ar.n];
        if (a.t === "omni") {
          var m = aMapa(px, py);
          if (m && m.y >= C.Y_MIN && m.y <= C.ALTO && m.x >= 0 && m.x <= 1) { a.x = m.x; a.y = m.y; }
        } else {
          var cx = st.rect.x + a.x * st.rect.w, cy = st.rect.y + a.y * st.rect.w;
          a.a = Math.atan2(py - cy, px - cx);
        }
        recalcular();
      },
      arriba: function () {
        var ar = st.arrastre;
        if (!ar) return;
        st.arrastre = null;
        if (!ar.movio && !ar.nueva) {
          st.antenas.splice(ar.n, 1);
          if (op.sonido) op.sonido("quitar");
        }
        st.seleccion = -1;
        recalcular();
        if (op.enviar) op.enviar(st);
      }
    };
  }

  window.Ciudad = {
    COLOR: COLOR,
    NOMBRE: NOMBRE,
    ajustar: ajustar,
    dibujar: dibujar,
    prepararAtaque: prepararAtaque,
    control: control
  };
})();
