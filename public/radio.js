// Caza de Señales · bonus «Sintoniza la emisora»
// En el celular: un dial de radio que se arrastra hasta limpiar la estática.
// En el proyector: una radio retro decorativa.
(function () {
  "use strict";

  var D = window.EscenaDatos;
  var R = D.RADIO;
  var TINTA = "#1C0F16";
  var ANCHO_BANDA = 2.4; // la banda completa mide 2,4 veces la ventana del dial

  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function formato(banda, v) {
    var B = D.BANDAS[banda];
    return v.toFixed(B.dec).replace(".", ",");
  }

  // Ventana del dial con la escala que se desliza bajo la aguja.
  function dial(ctx, x, y, w, h, banda, pos, zoom) {
    var B = D.BANDAS[banda];
    var span = B.max - B.min;
    zoom = zoom || ANCHO_BANDA;
    ctx.save();
    redondeado(ctx, x, y, w, h, h * 0.16);
    ctx.fillStyle = "#F6E6C8"; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = "#E86A3E"; ctx.stroke();
    ctx.clip();
    var cx = x + w / 2;
    var aPx = function (v) { return cx + (((v - B.min) / span) - pos) * w * zoom; };
    // marcas menores
    ctx.strokeStyle = "rgba(28, 15, 22, .45)"; ctx.lineWidth = 1.5;
    var menores = 60;
    for (var k = 0; k <= menores; k++) {
      var v = B.min + (k / menores) * span, xx = aPx(v);
      if (xx < x - 2 || xx > x + w + 2) continue;
      ctx.beginPath(); ctx.moveTo(xx, y + h * 0.62); ctx.lineTo(xx, y + h * (k % 5 ? 0.74 : 0.8)); ctx.stroke();
    }
    // marcas con número
    ctx.fillStyle = TINTA; ctx.strokeStyle = TINTA; ctx.lineWidth = 2.5;
    ctx.font = "600 " + Math.round(h * 0.2) + "px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    B.marcas.forEach(function (m) {
      var xx = aPx(m);
      if (xx < x - 40 || xx > x + w + 40) return;
      ctx.beginPath(); ctx.moveTo(xx, y + h * 0.55); ctx.lineTo(xx, y + h * 0.86); ctx.stroke();
      ctx.fillText(formato(banda, m), xx, y + h * 0.33);
    });
    // borde de la banda
    ctx.fillStyle = "rgba(28, 15, 22, .18)";
    var ini = aPx(B.min), fin = aPx(B.max);
    if (ini > x) ctx.fillRect(x, y, ini - x, h);
    if (fin < x + w) ctx.fillRect(fin, y, x + w - fin, h);
    // aguja
    ctx.fillStyle = "#D9472F";
    ctx.fillRect(cx - 2, y + 4, 4, h - 8);
    ctx.beginPath(); ctx.moveTo(cx - 9, y); ctx.lineTo(cx + 9, y); ctx.lineTo(cx, y + 12); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function parlante(ctx, cx, cy, r, ruido, t, sintonizado) {
    ctx.save();
    ctx.fillStyle = "#3A2029";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    var semilla = Math.floor(t * 20);
    var rnd = D.azar(semilla + 7);
    var cel = Math.max(4, r / 9);
    for (var yy = cy - r; yy < cy + r; yy += cel) {
      for (var xx = cx - r; xx < cx + r; xx += cel) {
        var v = rnd();
        if (v < ruido) {
          ctx.fillStyle = v < ruido * 0.5 ? "rgba(251, 239, 227, .75)" : "rgba(207, 166, 151, .45)";
          ctx.fillRect(xx, yy, cel - 1, cel - 1);
        }
      }
    }
    if (ruido < 0.4) {
      ctx.strokeStyle = sintonizado ? "#5BDA9C" : "#F4CC4E"; ctx.lineWidth = Math.max(2, r * 0.05);
      for (var k = 1; k <= 3; k++) {
        var f = (t * 1.4 + k / 3) % 1;
        ctx.globalAlpha = (1 - f) * (1 - ruido * 2);
        ctx.beginPath(); ctx.arc(cx, cy, r * (0.2 + f * 0.8), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.lineWidth = Math.max(3, r * 0.06); ctx.strokeStyle = "#E86A3E";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  function barras(ctx, x, y, w, h, nivel) {
    for (var k = 0; k < 5; k++) {
      var bh = h * (0.3 + k * 0.175);
      ctx.fillStyle = k < Math.round(nivel * 5) ? (nivel > 0.95 ? "#5BDA9C" : "#F4CC4E") : "#4A2A35";
      ctx.fillRect(x + k * (w / 5), y + h - bh, w / 5 - 4, bh);
    }
  }

  // ---------- control en el celular ----------
  function control(op) {
    var st = {
      lista: [], idx: 0, pos: 0.5, mantenido: 0, arrastre: null, hechas: [],
      celebrar: 0, ultimo: performance.now(), activo: false
    };
    function actual() { return st.lista[st.idx]; }
    function cercania() {
      var e = actual();
      if (!e) return 0;
      return Math.max(0, 1 - Math.abs(st.pos - e.objetivo) / 0.1);
    }
    return {
      estado: st,
      iniciar: function (seed, idx) {
        st.lista = D.emisoras(seed);
        st.idx = idx || 0;
        st.hechas = st.lista.slice(0, st.idx);
        st.pos = actual() ? actual().inicio : 0.5;
        st.mantenido = 0; st.celebrar = 0; st.activo = true;
        if (op.cambio) op.cambio(st);
      },
      detener: function () { st.activo = false; if (op.estatica) op.estatica(0); },
      actual: actual,
      dibujar: function (ctx, info) {
        var ahora = performance.now(), dt = Math.min(0.1, (ahora - st.ultimo) / 1000);
        st.ultimo = ahora;
        var e = actual();
        var W = info.W, top = info.arriba, H = info.Hs;
        ctx.fillStyle = "#24131B";
        ctx.fillRect(0, top, W, H);
        if (!e) return;
        var B = D.BANDAS[e.banda];
        var celebrando = ahora < st.celebrar;
        if (st.activo && !celebrando && D.sintonizada(e, st.pos)) {
          st.mantenido += dt;
          if (st.mantenido >= R.MANTENER) {
            var valor = B.min + st.pos * (B.max - B.min);
            if (op.sintonizada) op.sintonizada(st.idx, st.pos, valor);
            st.hechas.push(e);
            st.celebrar = ahora + 1300;
            st.idx += 1;
            st.mantenido = 0;
            st.arrastre = null;
            var sig = actual();
            if (sig) st.pos = sig.inicio;
            if (op.cambio) op.cambio(st);
            return;
          }
        } else if (!celebrando) {
          st.mantenido = Math.max(0, st.mantenido - dt * 2);
        }
        var cerca = cercania();
        if (op.estatica && st.activo) op.estatica(celebrando ? 0 : (1 - cerca) * 0.9 + 0.05);

        // caja de la radio
        var m = 14;
        var caja = { x: m, y: top + m, w: W - m * 2, h: H - m * 2 };
        redondeado(ctx, caja.x, caja.y, caja.w, caja.h, 22);
        var g = ctx.createLinearGradient(0, caja.y, 0, caja.y + caja.h);
        g.addColorStop(0, "#5A2D3A"); g.addColorStop(1, "#3A1C27");
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "#E86A3E"; ctx.stroke();

        // objetivo
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#CFA697";
        ctx.font = "600 13px 'IBM Plex Mono', monospace";
        ctx.fillText(("Emisora " + (st.idx + 1) + " · busca " + B.nombre).toUpperCase(), W / 2, caja.y + 32);
        ctx.fillStyle = "#FBEFE3";
        var fs = Math.min(46, W * 0.11);
        ctx.font = "900 " + Math.round(fs) + "px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
        ctx.fillText(e.etiqueta.toUpperCase(), W / 2, caja.y + 32 + fs * 1.05);

        // dial
        var dy = caja.y + 32 + fs * 1.05 + 20;
        var dh = Math.min(104, H * 0.16);
        dial(ctx, caja.x + 16, dy, caja.w - 32, dh, e.banda, st.pos);
        var actualValor = B.min + st.pos * (B.max - B.min);
        ctx.fillStyle = "#F4CC4E";
        ctx.font = "600 15px 'IBM Plex Mono', monospace";
        ctx.fillText("Estás en " + formato(e.banda, actualValor) + " " + B.unidad, W / 2, dy + dh + 24);

        // zona central: parlante y barras, o la celebración
        var chipsY = caja.y + caja.h - 46;
        var restoTop = dy + dh + 40, restoH = chipsY - restoTop - 10;
        var r = Math.max(28, Math.min(caja.w * 0.28, restoH * 0.32));
        if (celebrando) {
          var hecha = st.hechas[st.hechas.length - 1];
          var cy = restoTop + restoH * 0.42;
          ctx.fillStyle = "rgba(91, 218, 156, .16)";
          redondeado(ctx, caja.x + 16, restoTop, caja.w - 32, restoH * 0.9, 18); ctx.fill();
          ctx.fillStyle = "#5BDA9C";
          ctx.font = "900 " + Math.round(Math.min(52, W * 0.12)) + "px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
          ctx.fillText("¡SINTONIZADA!", W / 2, cy - 18);
          ctx.fillStyle = "#FFB547";
          ctx.font = "900 " + Math.round(Math.min(64, W * 0.15)) + "px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
          ctx.fillText("+100", W / 2, cy + 46);
          ctx.fillStyle = "#FBEFE3";
          ctx.font = "700 15px 'Atkinson Hyperlegible', sans-serif";
          ctx.fillText(D.BANDAS[hecha.banda].nombre + " · " + hecha.etiqueta, W / 2, cy + 84);
          ctx.fillStyle = "#CFA697";
          ctx.fillText("Ahora busca la siguiente ↑", W / 2, cy + 108);
        } else {
          parlante(ctx, W / 2, restoTop + r + 4, r, 1 - cerca, info.t, false);
          barras(ctx, W / 2 - 60, restoTop + r * 2 + 18, 120, 30, Math.min(1, cerca + (st.mantenido / R.MANTENER) * 0.2));
          var listo = D.sintonizada(e, st.pos);
          ctx.fillStyle = listo ? "#5BDA9C" : "#CFA697";
          ctx.font = "700 15px 'Atkinson Hyperlegible', sans-serif";
          ctx.fillText(listo ? "¡Ahí está! Suelta y no lo muevas" : "Arrastra el dial hasta que se limpie la señal", W / 2, restoTop + r * 2 + 72);
        }

        // emisoras ya sintonizadas
        ctx.font = "600 12px 'IBM Plex Mono', monospace";
        ctx.textAlign = "left";
        var x = caja.x + 16;
        ctx.fillStyle = "#CFA697";
        ctx.fillText(st.hechas.length ? "SINTONIZADAS:" : "AÚN NO SINTONIZAS NINGUNA", x, chipsY + 6);
        var cx = x;
        var ultimas = st.hechas.slice(-3);
        ctx.font = "700 13px 'Atkinson Hyperlegible', sans-serif";
        ultimas.forEach(function (h) {
          var texto = "✓ " + h.etiqueta.replace(/^canal \d+ · /, "Wi-Fi ");
          var w = ctx.measureText(texto).width + 16;
          if (cx + w > caja.x + caja.w - 12) return;
          ctx.fillStyle = "rgba(91, 218, 156, .2)";
          redondeado(ctx, cx, chipsY + 14, w, 22, 11); ctx.fill();
          ctx.fillStyle = "#5BDA9C";
          ctx.fillText(texto, cx + 8, chipsY + 30);
          cx += w + 6;
        });
        ctx.textAlign = "center";
      },
      abajo: function (px) { st.arrastre = { x: px, pos: st.pos }; },
      mover: function (px, ancho) {
        if (!st.arrastre || !st.activo || performance.now() < st.celebrar) return;
        var w = Math.max(200, ancho - 60) * ANCHO_BANDA;
        st.pos = Math.max(0, Math.min(1, st.arrastre.pos - (px - st.arrastre.x) / w));
      },
      arriba: function () { st.arrastre = null; },
      paso: function (dir) {
        if (!st.activo) return;
        st.pos = Math.max(0, Math.min(1, st.pos + dir * 0.004));
      }
    };
  }

  // ---------- radio decorativa del proyector ----------
  function decorativa(ctx, area, t, banda) {
    var w = Math.min(area.w * 0.8, area.h * 0.95), h = w * 0.66;
    var x = area.x + (area.w - w) / 2, y = Math.max(area.y + h * 0.3, area.y + (area.h - h) / 2 + h * 0.12);
    ctx.save();
    // antena con ondas
    ctx.strokeStyle = "#3B1C28"; ctx.lineWidth = Math.max(3, w * 0.012); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x + w * 0.78, y + 4); ctx.lineTo(x + w * 0.88, y - h * 0.24); ctx.stroke();
    ctx.strokeStyle = "rgba(255, 245, 225, .85)"; ctx.lineWidth = Math.max(2, w * 0.008);
    for (var k = 1; k <= 3; k++) {
      var f = (t * 0.9 + k / 3) % 1;
      ctx.globalAlpha = 1 - f;
      ctx.beginPath(); ctx.arc(x + w * 0.88, y - h * 0.24, w * (0.03 + f * 0.1), -Math.PI * 0.95, -Math.PI * 0.05); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // caja
    redondeado(ctx, x, y, w, h, w * 0.06);
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#5A2D3A"); g.addColorStop(1, "#2E1620");
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(4, w * 0.012); ctx.strokeStyle = "#E86A3E"; ctx.stroke();
    // dial
    var bandas = ["fm", "am", "wifi"];
    var b = banda || bandas[Math.floor(t / 4) % 3];
    dial(ctx, x + w * 0.07, y + h * 0.1, w * 0.86, h * 0.24, b, 0.5 + Math.sin(t * 0.6) * 0.35, 1.6);
    // parlantes
    parlante(ctx, x + w * 0.27, y + h * 0.66, h * 0.24, 0.15 + 0.1 * Math.sin(t * 3), t, false);
    parlante(ctx, x + w * 0.73, y + h * 0.66, h * 0.24, 0.15 + 0.1 * Math.cos(t * 3), t + 0.3, false);
    // ecualizador
    for (var n = 0; n < 7; n++) {
      var alto = h * (0.06 + 0.12 * Math.abs(Math.sin(t * 5 + n * 1.3)));
      ctx.fillStyle = n % 2 ? "#F4CC4E" : "#FF5D8F";
      ctx.fillRect(x + w * 0.42 + n * w * 0.024, y + h * 0.84 - alto, w * 0.016, alto);
    }
    ctx.restore();
  }

  window.Radio = { control: control, decorativa: decorativa, formato: formato };
})();
