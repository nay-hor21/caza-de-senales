// Caza de Señales · datos compartidos entre el servidor y los navegadores.
// Las trayectorias salen de una "semilla": el proyector y cada celular calculan
// exactamente el mismo vuelo sin tener que enviarse posiciones por internet.
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.EscenaDatos = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DURACION_BONUS = 15;   // segundos de la ronda de interferencias
  var SUBIDA = 1.1;          // segundos que tardan los drones en salir del pasto
  var CAJA = { x0: 0.09, x1: 0.91, y0: 0.08, y1: 0.56 };

  // Generador pseudoaleatorio con semilla (mulberry32).
  function azar(semilla) {
    var a = semilla >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Rebota un valor entre a y b, como una pelota entre dos paredes.
  function rebote(v, a, b) {
    var L = b - a;
    var p = (v - a) % (2 * L);
    if (p < 0) p += 2 * L;
    return a + (p > L ? 2 * L - p : p);
  }

  function suave(u) { return u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u); }

  // Cuatro drones, uno por opción. nivel sube la velocidad poco a poco.
  function drones(semilla, nivel) {
    var r = azar(semilla);
    var columnas = [0.16, 0.39, 0.61, 0.84];
    for (var i = 3; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var tmp = columnas[i]; columnas[i] = columnas[j]; columnas[j] = tmp;
    }
    var factor = 1 + Math.min(nivel || 0, 12) * 0.045;
    var lista = [];
    for (var k = 0; k < 4; k++) {
      var rapidez = (0.15 + r() * 0.07) * factor;
      var angulo = (20 + r() * 42) * Math.PI / 180;
      lista.push({
        x0: columnas[k],
        y0: 0.18 + r() * 0.3,
        vx: Math.cos(angulo) * rapidez * (r() < 0.5 ? -1 : 1),
        vy: Math.sin(angulo) * rapidez * (r() < 0.5 ? -1 : 1),
        ola: 0.008 + r() * 0.01,
        frec: 1.4 + r() * 1.2,
        fase: r() * Math.PI * 2,
        retraso: k * 0.12
      });
    }
    return lista;
  }

  function posDron(d, t) {
    var ts = t - d.retraso;
    if (ts < SUBIDA) {
      var u = suave(ts / SUBIDA);
      return { x: d.x0, y: 1.1 + (d.y0 - 1.1) * u, dir: 0 };
    }
    var s = ts - SUBIDA;
    var x = rebote(d.x0 + d.vx * s, CAJA.x0, CAJA.x1);
    var y = rebote(d.y0 + d.vy * s, CAJA.y0, CAJA.y1) + Math.sin(s * d.frec * 2 * Math.PI + d.fase) * d.ola;
    var x2 = rebote(d.x0 + d.vx * (s + 0.02), CAJA.x0, CAJA.x1);
    return { x: x, y: y, dir: x2 > x ? 1 : -1 };
  }

  // Interferencias de la ronda bonus: aparecen por un lado y cruzan la pantalla.
  function interferencias(semilla, duracion) {
    var r = azar((semilla ^ 0x9E3779B9) >>> 0);
    var N = 34;
    var lista = [];
    for (var i = 0; i < N; i++) {
      var dorada = r() < 0.12;
      lista.push({
        id: i,
        nace: 0.5 + (i / N) * (duracion - 3.3) + r() * 0.4,
        vida: dorada ? 2.1 : 2.8 + r() * 0.7,
        dorada: dorada,
        valor: dorada ? 150 : 50,
        izquierda: r() < 0.5,
        y0: 0.1 + r() * 0.42,
        deriva: (r() - 0.5) * 0.2,
        amp: 0.03 + r() * 0.07,
        frec: 0.8 + r() * 1.4,
        fase: r() * Math.PI * 2
      });
    }
    return lista;
  }

  function posInterferencia(b, t) {
    var u = (t - b.nace) / b.vida;
    if (u < 0 || u > 1) return null;
    var x = b.izquierda ? -0.06 + u * 1.12 : 1.06 - u * 1.12;
    var y = b.y0 + b.deriva * u + Math.sin((t - b.nace) * b.frec * 2 * Math.PI + b.fase) * b.amp;
    return { x: x, y: Math.max(0.05, Math.min(0.62, y)), u: u };
  }

  return {
    DURACION_BONUS: DURACION_BONUS,
    SUBIDA: SUBIDA,
    CAJA: CAJA,
    azar: azar,
    drones: drones,
    posDron: posDron,
    interferencias: interferencias,
    posInterferencia: posInterferencia
  };
});
