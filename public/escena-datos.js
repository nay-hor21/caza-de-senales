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

  // ---------------- Bonus: Cubre la ciudad ----------------
  // Mapa de 1 de ancho por 4/3 de alto, dividido en celdas. Cada celda con gente
  // tiene un peso; la cobertura es el porcentaje de ese peso que recibe señal.
  var CIUDAD = {
    DURACION: 35,
    ALTO: 4 / 3,
    COLS: 15,
    FILAS: 20,
    MAX_ANTENAS: 4,
    Y_MIN: 0.5,          // las antenas van en la ciudad, no en la montaña
    MONTANA: 0.42,       // hasta aquí llega la montaña
    R_OMNI: 0.19,
    R_SECTOR: 0.45,
    ABERTURA: 120,       // grados del sector
    R_PARA: 1.7,
    HAZ_PARA: 9          // grados de tolerancia al apuntar al pueblo
  };
  var ZONAS = {
    pueblo: { nombre: "Pueblo tras la montaña", peso: 3 },
    barrio: { nombre: "Barrio", peso: 1 },
    avenida: { nombre: "Avenida", peso: 2 },
    industria: { nombre: "Zona industrial", peso: 1.5 }
  };

  function distSegmento(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var u = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
  }

  function ciudadMapa(semilla) {
    var r = azar((semilla ^ 0x51ED27) >>> 0);
    var espejo = r() < 0.5;
    var j = function (v) { return v + (r() - 0.5) * 0.05; };
    var X = function (x) { return espejo ? 1 - x : x; };
    var P = { x: X(j(0.2)), y: 0.15 };
    var B = { x: X(j(0.27)), y: j(0.86) };
    var I = { x: X(j(0.76)), y: j(0.68) };
    var ay = j(1.19);
    var A1 = { x: X(0.55), y: ay }, A2 = { x: X(0.93), y: ay };
    var s = 1 / CIUDAD.COLS;
    var celdas = [];
    for (var f = 0; f < CIUDAD.FILAS; f++) {
      for (var c = 0; c < CIUDAD.COLS; c++) {
        var x = (c + 0.5) * s, y = (f + 0.5) * s, zona = null;
        if (Math.hypot(x - P.x, y - P.y) <= 0.095) zona = "pueblo";
        else if (y > CIUDAD.MONTANA + 0.02) {
          if (Math.hypot(x - B.x, y - B.y) <= 0.165) zona = "barrio";
          else if (distSegmento(x, y, A1.x, A1.y, A2.x, A2.y) <= 0.05) zona = "avenida";
          else if (Math.hypot(x - I.x, y - I.y) <= 0.1) zona = "industria";
        }
        if (zona) celdas.push({ i: celdas.length, x: x, y: y, zona: zona, peso: ZONAS[zona].peso, soloEnlace: zona === "pueblo", ex: P.x, ey: P.y });
      }
    }
    var total = celdas.reduce(function (a, k) { return a + k.peso; }, 0);
    return { semilla: semilla, espejo: espejo, celdas: celdas, total: total, centros: { pueblo: P, barrio: B, industria: I, avenida: { x: (A1.x + A2.x) / 2, y: ay } }, avenida: [A1, A2] };
  }

  function difAngulo(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  // ¿Esta antena le da señal a esta celda?
  function cubre(ant, k) {
    var dx = k.x - ant.x, dy = k.y - ant.y, d = Math.hypot(dx, dy);
    if (ant.t === "para") {
      // Enlace punto a punto: si apunta al pueblo, todo el pueblo queda conectado.
      if (!k.soloEnlace) return false;
      var ex = k.ex - ant.x, ey = k.ey - ant.y;
      return Math.hypot(ex, ey) <= CIUDAD.R_PARA && difAngulo(Math.atan2(ey, ex), ant.a) <= CIUDAD.HAZ_PARA * Math.PI / 180;
    }
    if (k.soloEnlace) return false; // la montaña tapa la señal normal
    if (ant.t === "omni") return d <= CIUDAD.R_OMNI;
    if (ant.t === "sector") return d <= 0.03 || (d <= CIUDAD.R_SECTOR && difAngulo(Math.atan2(dy, dx), ant.a) <= (CIUDAD.ABERTURA / 2) * Math.PI / 180);
    return false;
  }

  function antenaValida(a) {
    return a && (a.t === "omni" || a.t === "sector" || a.t === "para") &&
      isFinite(a.x) && isFinite(a.y) && isFinite(a.a) &&
      a.x >= 0 && a.x <= 1 && a.y >= CIUDAD.Y_MIN && a.y <= CIUDAD.ALTO;
  }

  function cobertura(mapa, antenas) {
    var lista = (antenas || []).filter(antenaValida).slice(0, CIUDAD.MAX_ANTENAS);
    var cubiertas = {}, peso = 0, porZona = {};
    mapa.celdas.forEach(function (k) {
      var z = porZona[k.zona] || (porZona[k.zona] = { total: 0, cubierto: 0 });
      z.total += k.peso;
      for (var n = 0; n < lista.length; n++) {
        if (cubre(lista[n], k)) { cubiertas[k.i] = true; peso += k.peso; z.cubierto += k.peso; break; }
      }
    });
    return { pct: Math.round((peso / mapa.total) * 100), cubiertas: cubiertas, porZona: porZona, antenas: lista };
  }

  // ---------------- Bonus: Sintoniza la emisora ----------------
  var RADIO = { DURACION: 25, TOLERANCIA: 0.02, MANTENER: 0.35 };
  var BANDAS = {
    am: { nombre: "Radio AM", min: 530, max: 1700, unidad: "kHz", dec: 0, marcas: [600, 800, 1000, 1200, 1400, 1600] },
    fm: { nombre: "Radio FM", min: 87.5, max: 108.5, unidad: "MHz", dec: 1, marcas: [88, 92, 96, 100, 104, 108] },
    wifi: { nombre: "Wi-Fi 2,4 GHz", min: 2.400, max: 2.4835, unidad: "GHz", dec: 3, marcas: [2.41, 2.42, 2.43, 2.44, 2.45, 2.46, 2.47, 2.48] }
  };

  function emisoras(semilla) {
    var r = azar((semilla ^ 0x7ADD10) >>> 0);
    var orden = ["fm", "am", "wifi", "fm", "am", "fm", "wifi", "am", "fm", "wifi", "fm", "am", "fm", "wifi", "am", "fm", "am", "wifi", "fm", "am"];
    var lista = [];
    var p = 0.5;
    for (var n = 0; n < orden.length; n++) {
      var b = orden[n], valor, etiqueta;
      if (b === "am") { valor = 540 + 10 * Math.floor(r() * 107); etiqueta = valor + " kHz"; }
      else if (b === "fm") { valor = Math.round((88.1 + 0.2 * Math.floor(r() * 100)) * 10) / 10; etiqueta = valor.toFixed(1).replace(".", ",") + " MHz"; }
      else { var canal = 1 + Math.floor(r() * 11); valor = Math.round((2.412 + 0.005 * (canal - 1)) * 1000) / 1000; etiqueta = "canal " + canal + " · " + valor.toFixed(3).replace(".", ",") + " GHz"; }
      var B = BANDAS[b];
      var objetivo = (valor - B.min) / (B.max - B.min);
      var inicio;
      do { inicio = 0.08 + r() * 0.84; } while (Math.abs(inicio - objetivo) < 0.28);
      lista.push({ i: n, banda: b, valor: valor, etiqueta: etiqueta, objetivo: objetivo, inicio: inicio });
    }
    return lista;
  }

  function sintonizada(estacion, posicion, holgura) {
    return Math.abs(posicion - estacion.objetivo) <= RADIO.TOLERANCIA * (holgura || 1);
  }

  // Instrucciones cortas que aparecen durante la cuenta regresiva de cada bonus.
  var INSTRUCCIONES = {
    interferencias: { titulo: "Interferencias", pasos: ["Toca los monstruos que cruzan", "Los dorados valen el triple"] },
    ciudad: { titulo: "Cubre la ciudad", pasos: ["Elige una antena abajo", "Toca el mapa y arrastra para apuntar", "Cubre toda la ciudad con 4 antenas"] },
    radio: { titulo: "Sintoniza la emisora", pasos: ["Arrastra el dial a la frecuencia", "Sin estática: quédate quieto", "Sintoniza todas las que puedas"] }
  };

  return {
    INSTRUCCIONES: INSTRUCCIONES,
    DURACION_BONUS: DURACION_BONUS,
    SUBIDA: SUBIDA,
    CAJA: CAJA,
    azar: azar,
    drones: drones,
    posDron: posDron,
    interferencias: interferencias,
    posInterferencia: posInterferencia,
    CIUDAD: CIUDAD,
    ZONAS: ZONAS,
    ciudadMapa: ciudadMapa,
    cubre: cubre,
    cobertura: cobertura,
    antenaValida: antenaValida,
    RADIO: RADIO,
    BANDAS: BANDAS,
    emisoras: emisoras,
    sintonizada: sintonizada
  };
});
