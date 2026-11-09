// Caza de Señales · servidor multijugador
// El proyector muestra el cielo con los drones; cada jugador dispara desde su celular.

const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const PREGUNTAS = require("./preguntas");
const ED = require("./public/escena-datos.js");

const PUERTO = Number(process.env.PORT) || 3000;
const MAX_JUGADORES = 60;
const BALAS = 3;
const SEG_PREPARAR = 3;
const SEG_PREPARAR_BONUS = 6;   // un poco más, para leer las instrucciones
const TOTAL_RONDAS = 13;        // preguntas + bonus
const SEG_BONUS = { interferencias: ED.DURACION_BONUS, ciudad: ED.CIUDAD.DURACION, radio: ED.RADIO.DURACION };
const MODOS_BONUS = ["interferencias", "ciudad", "radio"];
const PUNTOS_ESTACION = 100;
const PUNTOS_COBERTURA = 8; // por cada punto de porcentaje
const HORAS_INACTIVIDAD = 3;
const PALETA = ["#FF5D73", "#3DDC97", "#FFB547", "#4EA8FF", "#C77DFF", "#FF8C42", "#2EC4B6", "#F15BB5", "#A0E426", "#9B8CFF", "#FFD166", "#06D6A0"];

const app = express();
const servidor = http.createServer(app);
const io = new Server(servidor);

app.use(express.static(path.join(__dirname, "public")));

function direccionesLocales() {
  const ips = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      const esIPv4 = i.family === "IPv4" || i.family === 4;
      if (esIPv4 && !i.internal) ips.push(i.address);
    }
  }
  return ips;
}

app.get("/api/info", (req, res) => {
  res.json({ urlsLocales: direccionesLocales().map((ip) => `http://${ip}:${PUERTO}`) });
});

app.get("/api/qr", async (req, res) => {
  const texto = String(req.query.texto || "").slice(0, 300);
  if (!texto) return res.status(400).end();
  try {
    const svg = await QRCode.toString(texto, {
      type: "svg", margin: 1, errorCorrectionLevel: "M",
      color: { dark: "#0A1F2B", light: "#FFFFFF" }
    });
    res.type("image/svg+xml").send(svg);
  } catch (e) {
    res.status(500).end();
  }
});

// ---------------- utilidades ----------------
function barajar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function nuevaClave() { return crypto.randomBytes(12).toString("hex"); }
function nuevaSemilla() { return crypto.randomInt(1, 2147483646); }
function nuevoPin() {
  let pin;
  do { pin = String(crypto.randomInt(100000, 1000000)); } while (partidas.has(pin));
  return pin;
}
function limpiarNombre(texto) {
  // Quita caracteres de control e invisibles, junta espacios y limita a 14 caracteres.
  const invisibles = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f]", "g");
  return String(texto || "").replace(invisibles, "").replace(/\s+/g, " ").trim().slice(0, 14);
}
function responderAck(ack, datos) { if (typeof ack === "function") ack(datos); }
function numero(v, porDefecto) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-0.2, Math.min(1.2, n)) : porDefecto;
}

// Puntaje de una pregunta: 500–1000 por rapidez + 100 por cada acierto seguido (máx. +500).
function calcularPuntos(segundos, tiempo, racha) {
  const rapidez = Math.round(1000 * (1 - (Math.min(segundos, tiempo) / tiempo) / 2));
  const bono = racha >= 2 ? Math.min((racha - 1) * 100, 500) : 0;
  return { rapidez, bono, total: rapidez + bono };
}

// ---------------- partidas ----------------
const partidas = new Map();

function crearPartida(ajustes) {
  const tiempo = [20, 30].includes(Number(ajustes.tiempo)) ? Number(ajustes.tiempo) : 20;
  const conBonus = ajustes.bonus !== false;
  // 13 rondas: con bonus, 3 preguntas y luego 1 bonus (10 preguntas + 3 bonus); sin bonus, 13 preguntas.
  const seleccion = barajar(PREGUNTAS);
  const rondas = [];
  let bonus = 0, numero = 0;
  while (rondas.length < TOTAL_RONDAS && numero < seleccion.length) {
    const p = seleccion[numero++];
    const orden = barajar([0, 1, 2, 3]);
    rondas.push({ tipo: "pregunta", numero, seed: nuevaSemilla(), p: { q: p.q, exp: p.exp, ops: orden.map((k) => p.ops[k]), correcta: orden.indexOf(0) } });
    if (conBonus && numero % 3 === 0 && rondas.length < TOTAL_RONDAS) {
      const modo = MODOS_BONUS[bonus++ % MODOS_BONUS.length];
      const seed = nuevaSemilla();
      const ronda = { tipo: "bonus", modo, seed };
      if (modo === "ciudad") ronda.mapa = ED.ciudadMapa(seed);
      if (modo === "radio") ronda.emisoras = ED.emisoras(seed);
      rondas.push(ronda);
    }
  }
  const preguntas = rondas.filter((r) => r.tipo === "pregunta");
  const partida = {
    pin: nuevoPin(),
    claveHost: nuevaClave(),
    tiempo,
    rondas,
    totalPreguntas: preguntas.length,
    indice: -1,
    fase: "lobby", // lobby | preparar | jugar | resultado | final
    jugadores: new Map(),
    colores: 0,
    inicio: 0,
    finPreparar: 0,
    temporizador: null,
    distribucion: [0, 0, 0, 0],
    acertaron: 0,
    interferencias: [],
    bonusTop: [],
    mejorCiudad: null,
    hostPendiente: null,
    premios: null,
    ultimaActividad: Date.now()
  };
  partidas.set(partida.pin, partida);
  return partida;
}

function rondaVacia() {
  return {
    balas: BALAS, respuesta: null, bonusHits: new Set(), bonusPuntos: 0, ultimoDisparo: 0,
    antenas: [], cobertura: 0, emisoras: 0, ultimaSintonia: 0
  };
}

function rondaActual(partida) { return partida.rondas[partida.indice] || null; }
function duracionMs(ronda, partida) { return ronda && ronda.tipo === "bonus" ? SEG_BONUS[ronda.modo] * 1000 : partida.tiempo * 1000; }

function ranking(partida) {
  return [...partida.jugadores.values()].sort((a, b) => b.puntos - a.puntos || a.unidoEn - b.unidoEn);
}

function restanteMs(partida) {
  const r = rondaActual(partida);
  if (partida.fase === "preparar") return Math.max(0, partida.finPreparar - Date.now());
  if (partida.fase === "jugar") return Math.max(0, duracionMs(r, partida) - (Date.now() - partida.inicio));
  return 0;
}

function infoRonda(partida) {
  const r = rondaActual(partida);
  if (!r) return null;
  return {
    clave: partida.pin + ":" + partida.indice,
    tipo: r.tipo,
    modo: r.modo || null,
    numero: r.numero || null,
    seed: r.seed,
    nivel: r.numero ? r.numero - 1 : 0,
    duracionMs: duracionMs(r, partida)
  };
}

function listos(partida) {
  const conectados = [...partida.jugadores.values()].filter((j) => j.conectado);
  return {
    conectados: conectados.length,
    respondieron: conectados.filter((j) => j.ronda.respuesta || j.ronda.balas <= 0).length
  };
}

// Lo que cada jugador lleva en un bonus de ciudad o radio (para el ranking en vivo).
function valorBonus(r, j) {
  if (!r || r.tipo !== "bonus") return 0;
  if (r.modo === "ciudad") return j.ronda.cobertura;
  if (r.modo === "radio") return j.ronda.emisoras;
  return j.ronda.bonusHits.size;
}

function estadoHost(partida) {
  const r = rondaActual(partida);
  const enJuego = partida.fase === "jugar" || partida.fase === "resultado";
  const cuenta = listos(partida);
  return {
    rol: "host",
    pin: partida.pin,
    fase: partida.fase,
    tiempo: partida.tiempo,
    indice: partida.indice,
    totalRondas: partida.rondas.length,
    totalPreguntas: partida.totalPreguntas,
    ronda: infoRonda(partida),
    restanteMs: restanteMs(partida),
    jugadores: ranking(partida).map((j) => ({ nombre: j.nombre, color: j.color, puntos: j.puntos, conectado: j.conectado, aciertos: j.aciertos })),
    respondieron: cuenta.respondieron,
    conectados: cuenta.conectados,
    pregunta: r && r.tipo === "pregunta" && enJuego ? { q: r.p.q, ops: r.p.ops } : null,
    resultado: r && r.tipo === "pregunta" && partida.fase === "resultado"
      ? { correcta: r.p.correcta, distribucion: partida.distribucion, exp: r.p.exp, acertaron: partida.acertaron }
      : null,
    vivo: r && r.tipo === "bonus" && r.modo !== "interferencias" && partida.fase === "jugar"
      ? [...partida.jugadores.values()].map((j) => ({ nombre: j.nombre, color: j.color, valor: valorBonus(r, j) }))
        .sort((a, b) => b.valor - a.valor).slice(0, 8)
      : null,
    bonus: r && r.tipo === "bonus" && partida.fase === "resultado" ? { modo: r.modo, top: partida.bonusTop, mejor: r.modo === "ciudad" ? partida.mejorCiudad : null } : null,
    premios: partida.fase === "final" ? partida.premios : null
  };
}

function estadoJugador(partida, jugador, lista) {
  const r = rondaActual(partida);
  const enJuego = partida.fase === "jugar";
  return {
    rol: "jugador",
    pin: partida.pin,
    fase: partida.fase,
    nombre: jugador.nombre,
    color: jugador.color,
    puntos: jugador.puntos,
    racha: jugador.racha,
    aciertos: jugador.aciertos,
    puesto: lista.indexOf(jugador) + 1,
    totalJugadores: lista.length,
    totalPreguntas: partida.totalPreguntas,
    indice: partida.indice,
    totalRondas: partida.rondas.length,
    ronda: infoRonda(partida),
    restanteMs: restanteMs(partida),
    pregunta: r && r.tipo === "pregunta" && enJuego ? { q: r.p.q, ops: r.p.ops } : null,
    balas: jugador.ronda.balas,
    respuesta: jugador.ronda.respuesta ? jugador.ronda.respuesta.dron : null,
    bonus: r && r.tipo === "bonus" && enJuego
      ? { hits: [...jugador.ronda.bonusHits], puntos: jugador.ronda.bonusPuntos, antenas: jugador.ronda.antenas, cobertura: jugador.ronda.cobertura, emisoras: jugador.ronda.emisoras }
      : null,
    resultado: partida.fase === "resultado" && jugador.ultimo
      ? Object.assign({}, jugador.ultimo, r && r.tipo === "pregunta" ? { correcta: r.p.correcta, correctaTexto: r.p.ops[r.p.correcta] } : {})
      : null,
    final: partida.fase === "final"
      ? { aciertos: jugador.aciertos, interferencias: jugador.bonusTotal, punteria: jugador.disparos ? Math.round(100 * jugador.impactos / jugador.disparos) : 0 }
      : null
  };
}

function enviarAlHost(partida) {
  io.to("host:" + partida.pin).emit("estado", estadoHost(partida));
}

function enviarAlHostPronto(partida) {
  if (partida.hostPendiente) return;
  partida.hostPendiente = setTimeout(() => { partida.hostPendiente = null; enviarAlHost(partida); }, 250);
}

function enviarAJugador(partida, jugador) {
  if (jugador.conectado && jugador.socketId) {
    io.to(jugador.socketId).emit("estado", estadoJugador(partida, jugador, ranking(partida)));
  }
}

function difundir(partida) {
  partida.ultimaActividad = Date.now();
  enviarAlHost(partida);
  const lista = ranking(partida);
  for (const j of lista) {
    if (j.conectado && j.socketId) io.to(j.socketId).emit("estado", estadoJugador(partida, j, lista));
  }
}

// ---------------- flujo de rondas ----------------
function empezarRonda(partida) {
  clearTimeout(partida.temporizador);
  partida.indice += 1;
  if (partida.indice >= partida.rondas.length) return terminar(partida);
  partida.fase = "preparar";
  const prep = rondaActual(partida).tipo === "bonus" ? SEG_PREPARAR_BONUS : SEG_PREPARAR;
  partida.finPreparar = Date.now() + prep * 1000;
  partida.distribucion = [0, 0, 0, 0];
  partida.acertaron = 0;
  for (const j of partida.jugadores.values()) j.ronda = rondaVacia();
  const indice = partida.indice;
  partida.temporizador = setTimeout(() => iniciarJuego(partida, indice), prep * 1000);
  difundir(partida);
}

function iniciarJuego(partida, indice) {
  if (partida.fase !== "preparar" || partida.indice !== indice) return;
  const r = rondaActual(partida);
  partida.fase = "jugar";
  partida.inicio = Date.now();
  partida.interferencias = r.tipo === "bonus" && r.modo === "interferencias" ? ED.interferencias(r.seed, SEG_BONUS.interferencias) : [];
  partida.temporizador = setTimeout(() => revelar(partida, indice), duracionMs(r, partida) + 400);
  difundir(partida);
}

function revelar(partida, indice) {
  if (partida.fase !== "jugar" || (indice !== undefined && partida.indice !== indice)) return;
  clearTimeout(partida.temporizador);
  const r = rondaActual(partida);
  partida.fase = "resultado";
  if (r.tipo === "pregunta") {
    for (const j of partida.jugadores.values()) {
      const resp = j.ronda.respuesta;
      if (resp && resp.dron === r.p.correcta) {
        j.racha += 1;
        j.mejorRacha = Math.max(j.mejorRacha, j.racha);
        j.aciertos += 1;
        partida.acertaron += 1;
        const pts = calcularPuntos(resp.ms / 1000, partida.tiempo, j.racha);
        j.puntos += pts.total;
        j.ultimo = { tipo: "pregunta", acierto: true, disparo: true, ganados: pts.total, bono: pts.bono, racha: j.racha };
      } else {
        j.racha = 0;
        j.ultimo = { tipo: "pregunta", acierto: false, disparo: Boolean(resp), sinBalas: !resp && j.ronda.balas <= 0, ganados: 0, bono: 0, racha: 0 };
      }
    }
  } else if (r.modo === "ciudad") {
    let mejor = null;
    for (const j of partida.jugadores.values()) {
      const pct = j.ronda.cobertura;
      const ganados = Math.round(pct * PUNTOS_COBERTURA);
      j.puntos += ganados;
      j.mejorCobertura = Math.max(j.mejorCobertura, pct);
      j.ultimo = { tipo: "bonus", modo: "ciudad", valor: pct, antenas: j.ronda.antenas.length, ganados };
      if (j.ronda.antenas.length && (!mejor || pct > mejor.pct)) mejor = { nombre: j.nombre, color: j.color, pct, antenas: j.ronda.antenas };
    }
    partida.mejorCiudad = mejor;
    partida.bonusTop = topBonus(partida, (j) => j.ronda.cobertura, (j) => Math.round(j.ronda.cobertura * PUNTOS_COBERTURA));
  } else if (r.modo === "radio") {
    for (const j of partida.jugadores.values()) {
      const ganados = j.ronda.emisoras * PUNTOS_ESTACION;
      j.puntos += ganados;
      j.ultimo = { tipo: "bonus", modo: "radio", valor: j.ronda.emisoras, ganados };
    }
    partida.bonusTop = topBonus(partida, (j) => j.ronda.emisoras, (j) => j.ronda.emisoras * PUNTOS_ESTACION);
  } else {
    for (const j of partida.jugadores.values()) {
      j.ultimo = { tipo: "bonus", modo: "interferencias", valor: j.ronda.bonusHits.size, hits: j.ronda.bonusHits.size, ganados: j.ronda.bonusPuntos };
    }
    partida.bonusTop = topBonus(partida, (j) => j.ronda.bonusHits.size, (j) => j.ronda.bonusPuntos);
  }
  difundir(partida);
}

function topBonus(partida, valor, ganados) {
  return [...partida.jugadores.values()]
    .filter((j) => valor(j) > 0)
    .sort((a, b) => ganados(b) - ganados(a) || valor(b) - valor(a))
    .slice(0, 5)
    .map((j) => ({ nombre: j.nombre, color: j.color, valor: valor(j), ganados: ganados(j) }));
}

function premio(lista, valor, minimo) {
  let mejor = null;
  for (const j of lista) {
    const v = valor(j);
    if (v === null || v < (minimo || 0)) continue;
    if (!mejor || v > mejor.valor) mejor = { nombre: j.nombre, color: j.color, valor: v };
  }
  return mejor;
}

function terminar(partida) {
  clearTimeout(partida.temporizador);
  partida.fase = "final";
  const lista = ranking(partida);
  partida.premios = {
    punteria: premio(lista, (j) => (j.disparos >= 4 ? Math.round(100 * j.impactos / j.disparos) : null), 1),
    cazador: premio(lista, (j) => j.bonusTotal, 1),
    cobertura: premio(lista, (j) => j.mejorCobertura, 1),
    racha: premio(lista, (j) => j.mejorRacha, 2)
  };
  difundir(partida);
}

function partidaDelHost(socket) {
  const { rol, pin } = socket.data || {};
  if (rol !== "host") return null;
  return partidas.get(pin) || null;
}

function jugadorDe(socket) {
  const { rol, pin, clave } = socket.data || {};
  if (rol !== "jugador") return null;
  const partida = partidas.get(pin);
  const jugador = partida && partida.jugadores.get(clave);
  return jugador ? { partida, jugador } : null;
}

// ---------------- conexiones ----------------
io.on("connection", (socket) => {
  socket.data = {};

  // ----- proyector -----
  socket.on("host:crear", (ajustes, ack) => {
    const partida = crearPartida(ajustes || {});
    socket.data = { rol: "host", pin: partida.pin };
    socket.join("host:" + partida.pin);
    responderAck(ack, { ok: true, pin: partida.pin, claveHost: partida.claveHost });
    enviarAlHost(partida);
  });

  socket.on("host:reanudar", (datos, ack) => {
    const partida = partidas.get(String(datos && datos.pin));
    if (!partida || partida.claveHost !== (datos && datos.claveHost)) return responderAck(ack, { ok: false });
    socket.data = { rol: "host", pin: partida.pin };
    socket.join("host:" + partida.pin);
    responderAck(ack, { ok: true });
    enviarAlHost(partida);
  });

  socket.on("host:empezar", () => {
    const partida = partidaDelHost(socket);
    if (!partida || partida.fase !== "lobby" || partida.jugadores.size === 0) return;
    empezarRonda(partida);
  });

  socket.on("host:saltar", () => {
    const partida = partidaDelHost(socket);
    if (partida && partida.fase === "jugar") revelar(partida);
  });

  socket.on("host:siguiente", () => {
    const partida = partidaDelHost(socket);
    if (partida && partida.fase === "resultado") empezarRonda(partida);
  });

  socket.on("host:expulsar", (datos) => {
    const partida = partidaDelHost(socket);
    if (!partida || partida.fase !== "lobby") return;
    const nombre = limpiarNombre(datos && datos.nombre).toLowerCase();
    for (const [clave, j] of partida.jugadores) {
      if (j.nombre.toLowerCase() === nombre) {
        partida.jugadores.delete(clave);
        if (j.socketId) io.to(j.socketId).emit("expulsado");
      }
    }
    difundir(partida);
  });

  socket.on("host:cerrar", () => {
    const partida = partidaDelHost(socket);
    if (!partida) return;
    clearTimeout(partida.temporizador);
    io.to("jugadores:" + partida.pin).emit("partida-cerrada");
    partidas.delete(partida.pin);
  });

  // ----- jugadores -----
  socket.on("jugador:unirse", (datos, ack) => {
    datos = datos || {};
    const partida = partidas.get(String(datos.pin || "").trim());
    if (!partida) return responderAck(ack, { ok: false, error: "No hay ninguna partida con ese PIN." });

    const clave = typeof datos.clave === "string" && /^[a-f0-9]{24}$/.test(datos.clave) ? datos.clave : null;
    let jugador = clave ? partida.jugadores.get(clave) : null;

    if (!jugador) {
      if (partida.fase === "final") return responderAck(ack, { ok: false, error: "Esa partida ya terminó." });
      const nombre = limpiarNombre(datos.nombre);
      if (!nombre) return responderAck(ack, { ok: false, error: "Escribe tu nombre para entrar." });
      if (partida.jugadores.size >= MAX_JUGADORES) return responderAck(ack, { ok: false, error: "La partida está llena." });
      const repetido = [...partida.jugadores.values()].some((j) => j.nombre.toLowerCase() === nombre.toLowerCase());
      if (repetido) return responderAck(ack, { ok: false, error: "Ese nombre ya está en uso. Prueba con otro." });
      jugador = {
        clave: nuevaClave(), nombre, color: PALETA[partida.colores++ % PALETA.length],
        puntos: 0, racha: 0, mejorRacha: 0, aciertos: 0, disparos: 0, impactos: 0, bonusTotal: 0, mejorCobertura: 0,
        ronda: rondaVacia(), ultimo: null, conectado: true, socketId: socket.id, unidoEn: Date.now()
      };
      partida.jugadores.set(jugador.clave, jugador);
    }

    if (jugador.socketId && jugador.socketId !== socket.id) {
      const anterior = io.sockets.sockets.get(jugador.socketId);
      if (anterior) { anterior.data = {}; anterior.leave("jugadores:" + partida.pin); }
    }
    jugador.socketId = socket.id;
    jugador.conectado = true;
    socket.data = { rol: "jugador", pin: partida.pin, clave: jugador.clave };
    socket.join("jugadores:" + partida.pin);
    responderAck(ack, { ok: true, clave: jugador.clave, nombre: jugador.nombre, color: jugador.color, pin: partida.pin });
    difundir(partida);
  });

  socket.on("jugador:disparo", (datos, ack) => {
    const ctx = jugadorDe(socket);
    if (!ctx) return responderAck(ack, { ok: false });
    const { partida, jugador } = ctx;
    const r = rondaActual(partida);
    if (partida.fase !== "jugar" || !r) return responderAck(ack, { ok: false });
    datos = datos || {};
    const ahora = Date.now();
    const ms = ahora - partida.inicio;
    if (ms > duracionMs(r, partida) + 500) return responderAck(ack, { ok: false });
    if (ahora - jugador.ronda.ultimoDisparo < 120) return responderAck(ack, { ok: false, motivo: "rapido" });
    jugador.ronda.ultimoDisparo = ahora;
    const x = numero(datos.x, 0.5), y = numero(datos.y, 0.5);
    const marca = { x, y, color: jugador.color, nombre: jugador.nombre };

    if (r.tipo === "pregunta") {
      if (jugador.ronda.respuesta || jugador.ronda.balas <= 0) return responderAck(ack, { ok: false });
      jugador.ronda.balas -= 1;
      jugador.disparos += 1;
      const dron = Number.isInteger(datos.dron) && datos.dron >= 0 && datos.dron <= 3 ? datos.dron : null;
      if (dron !== null) {
        jugador.ronda.respuesta = { dron, ms };
        jugador.impactos += 1;
        partida.distribucion[dron] += 1;
      }
      io.to("host:" + partida.pin).emit("disparo", Object.assign(marca, { tipo: dron !== null ? "dron" : "fallo" }));
      responderAck(ack, { ok: true, balas: jugador.ronda.balas, respuesta: dron });
      enviarAlHost(partida);
      const cuenta = listos(partida);
      if (cuenta.conectados > 0 && cuenta.respondieron === cuenta.conectados) {
        const indice = partida.indice;
        clearTimeout(partida.temporizador);
        partida.temporizador = setTimeout(() => revelar(partida, indice), 700);
      }
    } else if (r.modo === "interferencias") {
      jugador.disparos += 1;
      let valor = 0;
      const id = Number.isInteger(datos.id) ? datos.id : null;
      const b = id !== null ? partida.interferencias[id] : null;
      const s = ms / 1000;
      if (b && !jugador.ronda.bonusHits.has(id) && s >= b.nace - 0.6 && s <= b.nace + b.vida + 1) {
        valor = b.valor;
        jugador.ronda.bonusHits.add(id);
        jugador.ronda.bonusPuntos += valor;
        jugador.puntos += valor;
        jugador.impactos += 1;
        jugador.bonusTotal += 1;
      }
      io.to("host:" + partida.pin).emit("disparo", Object.assign(marca, { tipo: valor ? "bonus" : "fallo", valor }));
      responderAck(ack, { ok: true, valor, puntos: jugador.ronda.bonusPuntos });
    } else {
      responderAck(ack, { ok: false });
    }
  });

  // ----- bonus: Cubre la ciudad -----
  socket.on("jugador:ciudad", (datos, ack) => {
    const ctx = jugadorDe(socket);
    if (!ctx) return responderAck(ack, { ok: false });
    const { partida, jugador } = ctx;
    const r = rondaActual(partida);
    if (partida.fase !== "jugar" || !r || r.modo !== "ciudad") return responderAck(ack, { ok: false });
    const lista = Array.isArray(datos && datos.antenas) ? datos.antenas : [];
    const antenas = lista.slice(0, ED.CIUDAD.MAX_ANTENAS)
      .map((a) => ({ t: String(a && a.t), x: Number(a && a.x), y: Number(a && a.y), a: Number(a && a.a) }))
      .filter(ED.antenaValida);
    const res = ED.cobertura(r.mapa, antenas);
    jugador.ronda.antenas = res.antenas;
    jugador.ronda.cobertura = res.pct;
    responderAck(ack, { ok: true, pct: res.pct });
    enviarAlHostPronto(partida);
  });

  // ----- bonus: Sintoniza la emisora -----
  socket.on("jugador:sintonia", (datos, ack) => {
    const ctx = jugadorDe(socket);
    if (!ctx) return responderAck(ack, { ok: false });
    const { partida, jugador } = ctx;
    const r = rondaActual(partida);
    if (partida.fase !== "jugar" || !r || r.modo !== "radio") return responderAck(ack, { ok: false });
    const ahora = Date.now();
    const idx = Number(datos && datos.idx);
    const pos = Number(datos && datos.pos);
    const estacion = r.emisoras[jugador.ronda.emisoras];
    if (idx !== jugador.ronda.emisoras || !estacion || !Number.isFinite(pos) || ahora - jugador.ronda.ultimaSintonia < 500 ||
        ahora - partida.inicio > duracionMs(r, partida) + 500 || !ED.sintonizada(estacion, pos, 1.6)) {
      return responderAck(ack, { ok: false, emisoras: jugador.ronda.emisoras });
    }
    jugador.ronda.emisoras += 1;
    jugador.ronda.ultimaSintonia = ahora;
    responderAck(ack, { ok: true, emisoras: jugador.ronda.emisoras });
    enviarAlHostPronto(partida);
  });

  socket.on("disconnect", () => {
    const ctx = jugadorDe(socket);
    if (!ctx) return;
    const { partida, jugador } = ctx;
    if (jugador.socketId === socket.id) {
      jugador.conectado = false;
      enviarAlHost(partida);
    }
  });
});

setInterval(() => {
  const limite = Date.now() - HORAS_INACTIVIDAD * 3600 * 1000;
  for (const [pin, partida] of partidas) {
    if (partida.ultimaActividad < limite) {
      clearTimeout(partida.temporizador);
      partidas.delete(pin);
    }
  }
}, 10 * 60 * 1000).unref();

servidor.listen(PUERTO, () => {
  console.log("");
  console.log("  Caza de Señales está funcionando.");
  console.log("");
  console.log(`  Proyector (en esta computadora):  http://localhost:${PUERTO}/host.html`);
  const urls = direccionesLocales();
  if (urls.length) {
    console.log("  Jugadores (en la misma red Wi-Fi):");
    for (const ip of urls) console.log(`    http://${ip}:${PUERTO}`);
  }
  console.log("");
  console.log("  Para detenerlo, presiona Ctrl + C.");
  console.log("");
});
