// Caza de Señales · pantalla del jugador (celular)
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var LETRAS = ["A", "B", "C", "D"];
  var VISTAS_MENU = ["v-unirse", "v-espera", "v-final"];
  var BALA = '<svg viewBox="0 0 16 34" aria-hidden="true"><path d="M3 13 Q8 0 13 13 V31 H3 Z" fill="#FFB547"/><rect x="2" y="26" width="12" height="6" rx="1" fill="#C98A2B"/></svg>';

  var socket = io();
  var sesion = leerSesion();
  var estado = null;
  var escena = null;
  var claveEscena = null, faseEscena = null;
  var rafReloj = 0, rafCuenta = 0;
  var balas = 3, disparo = null, ultimoTiro = 0;
  var cazadas = 0, puntosBonus = 0;
  var bloqueo = null;

  // PIN desde el código QR
  var pinEnlace = (new URLSearchParams(location.search).get("pin") || "").replace(/\D/g, "").slice(0, 6);
  if (pinEnlace) {
    $("pin").value = pinEnlace.slice(0, 3) + " " + pinEnlace.slice(3);
    if (sesion && sesion.pin !== pinEnlace) { sesion = null; guardarSesion(null); }
  }
  try {
    $("nombre").value = localStorage.getItem("cs-nombre") || "";
    if (localStorage.getItem("cs-sonido") === "no") Sonido.activo(false);
  } catch (e) { /* sin almacenamiento */ }
  pintarIconoSonido();

  function leerSesion() {
    try { return JSON.parse(localStorage.getItem("cs-jugador")); } catch (e) { return null; }
  }
  function guardarSesion(s) {
    try {
      if (s) localStorage.setItem("cs-jugador", JSON.stringify(s));
      else localStorage.removeItem("cs-jugador");
    } catch (e) { /* sin almacenamiento */ }
  }
  function fmt(n) { return Number(n).toLocaleString("es"); }
  function vibrar(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* sin vibración */ } } }

  function mostrar(id) {
    var esMenu = VISTAS_MENU.indexOf(id) !== -1;
    VISTAS_MENU.forEach(function (v) { $(v).hidden = v !== id; });
    $("app").hidden = !esMenu;
    $("v-juego").hidden = id !== "v-juego";
    $("v-resultado").hidden = id !== "v-resultado";
    if (id === "v-juego" && !escena) {
      escena = Escena.crear($("cielo"), { modo: "jugador" });
      window.__escena = escena;
    }
  }

  function error(texto) {
    var el = $("unirse-error");
    el.textContent = texto || "";
    el.hidden = !texto;
  }

  function volverAlInicio(mensaje) {
    sesion = null; estado = null; claveEscena = null; faseEscena = null;
    guardarSesion(null);
    cancelAnimationFrame(rafReloj); cancelAnimationFrame(rafCuenta);
    mostrar("v-unirse");
    error(mensaje);
  }

  // Mantiene la pantalla encendida mientras se juega, si el celular lo permite.
  function pedirPantallaEncendida() {
    if (!navigator.wakeLock || bloqueo) return;
    navigator.wakeLock.request("screen").then(function (b) {
      bloqueo = b;
      b.addEventListener("release", function () { bloqueo = null; });
    }).catch(function () { /* no disponible */ });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && sesion) pedirPantallaEncendida();
  });

  // ---------- entrar ----------
  $("pin").addEventListener("input", function () {
    var d = this.value.replace(/\D/g, "").slice(0, 6);
    this.value = d.length > 3 ? d.slice(0, 3) + " " + d.slice(3) : d;
  });

  $("form-unirse").addEventListener("submit", function (e) {
    e.preventDefault();
    Sonido.desbloquear();
    var pin = $("pin").value.replace(/\D/g, "");
    var nombre = $("nombre").value.trim();
    if (pin.length !== 6) return error("El PIN tiene 6 números. Míralo en el proyector.");
    if (!nombre) return error("Escribe tu nombre para entrar.");
    try { localStorage.setItem("cs-nombre", nombre); } catch (err) { /* sin almacenamiento */ }
    error("");
    $("btn-entrar").disabled = true;
    unirse({ pin: pin, nombre: nombre }, false);
  });

  function unirse(datos, silencioso) {
    socket.emit("jugador:unirse", datos, function (r) {
      $("btn-entrar").disabled = false;
      if (r && r.ok) {
        sesion = { pin: r.pin, clave: r.clave, nombre: r.nombre };
        guardarSesion(sesion);
        pedirPantallaEncendida();
      } else if (silencioso) {
        volverAlInicio("");
      } else {
        error((r && r.error) || "No se pudo entrar. Revisa el PIN e intenta de nuevo.");
      }
    });
  }

  socket.on("connect", function () {
    $("conexion").hidden = true;
    if (sesion) unirse({ pin: sesion.pin, clave: sesion.clave, nombre: sesion.nombre }, true);
  });
  socket.on("disconnect", function () { if (sesion) $("conexion").hidden = false; });
  socket.on("expulsado", function () { volverAlInicio("El presentador te sacó de la partida."); });
  socket.on("partida-cerrada", function () { volverAlInicio("El presentador cerró la partida."); });
  socket.on("estado", function (s) { estado = s; pintar(); });

  $("btn-otra").addEventListener("click", function () {
    volverAlInicio("");
    $("pin").value = "";
    $("pin").focus();
  });

  $("btn-sonido").addEventListener("click", function () {
    var activo = Sonido.activo(!Sonido.activo());
    try { localStorage.setItem("cs-sonido", activo ? "si" : "no"); } catch (e) { /* sin almacenamiento */ }
    pintarIconoSonido();
  });
  function pintarIconoSonido() {
    var activo = Sonido.activo();
    $("icono-ondas").hidden = !activo;
    $("icono-mudo").hidden = activo;
    $("btn-sonido").setAttribute("aria-label", activo ? "Apagar el sonido" : "Activar el sonido");
  }

  // ---------- pintar ----------
  function pintar() {
    document.documentElement.style.setProperty("--c", estado.color);
    if (estado.fase === "lobby") {
      $("espera-titulo").textContent = "¡Estás dentro, " + estado.nombre + "!";
      $("espera-pin").textContent = "PIN " + estado.pin.slice(0, 3) + " " + estado.pin.slice(3);
      $("espera-mira").style.color = estado.color;
      $("espera-color").style.setProperty("--c", estado.color);
      mostrar("v-espera");
    } else if (estado.fase === "preparar" || estado.fase === "jugar") {
      mostrar("v-juego");
      pintarJuego();
    } else if (estado.fase === "resultado") {
      cancelAnimationFrame(rafReloj);
      faseEscena = "resultado";
      pintarResultado();
    } else if (estado.fase === "final") {
      cancelAnimationFrame(rafReloj);
      $("f-puesto").textContent = "#" + estado.puesto;
      $("f-de").textContent = "de " + estado.totalJugadores + (estado.totalJugadores === 1 ? " jugador" : " jugadores");
      $("f-puntos").textContent = fmt(estado.puntos);
      $("f-aciertos").textContent = estado.final.aciertos + "/" + estado.totalPreguntas;
      $("f-punteria").textContent = estado.final.punteria + " %";
      mostrar("v-final");
    }
  }

  function etiquetaRonda(r) { return r.tipo === "pregunta" ? "Pregunta " + r.numero + " de " + estado.totalPreguntas : "Ronda bonus"; }

  function pintarJuego() {
    var r = estado.ronda;
    $("h-ronda").textContent = r.tipo === "pregunta" ? r.numero + " / " + estado.totalPreguntas : "Bonus";
    $("h-puntos").textContent = fmt(estado.puntos) + " pts";

    if (estado.fase === "preparar") {
      if (claveEscena !== r.clave || faseEscena !== "preparar") {
        claveEscena = r.clave; faseEscena = "preparar";
        cancelAnimationFrame(rafReloj);
        escena.vacio();
        balas = 3; disparo = null; cazadas = 0; puntosBonus = 0;
        $("aviso").hidden = true;
        $("h-leyenda").hidden = true;
        $("h-pregunta").textContent = r.tipo === "pregunta" ? "Prepárate…" : "¡Ronda bonus!";
        $("cuenta-tipo").textContent = etiquetaRonda(r);
        $("cuenta-ayuda").textContent = r.tipo === "pregunta"
          ? "Toca el dron con la respuesta correcta"
          : "Toca todas las interferencias que puedas";
        $("cuenta").hidden = false;
        $("h-tiempo").textContent = Math.round(r.duracionMs / 1000);
        $("h-tiempo").classList.remove("urgente");
        pintarPie();
        iniciarCuenta(estado.restanteMs);
      }
      return;
    }

    // jugar
    var transcurrido = r.duracionMs - estado.restanteMs;
    if (claveEscena !== r.clave || faseEscena !== "jugar") {
      claveEscena = r.clave; faseEscena = "jugar";
      cancelAnimationFrame(rafCuenta);
      $("cuenta").hidden = true;
      $("aviso").hidden = true;
      balas = estado.balas;
      disparo = estado.respuesta;
      if (r.tipo === "pregunta") {
        escena.pregunta({ clave: r.clave, seed: r.seed, nivel: r.nivel, ops: estado.pregunta.ops, transcurridoMs: transcurrido });
        $("h-pregunta").textContent = estado.pregunta.q;
        pintarLeyenda(estado.pregunta.ops);
        if (disparo !== null) { escena.ocultarDron(disparo); avisar("Le diste a la " + LETRAS[disparo] + ". Espera el resultado"); }
        else if (balas <= 0) avisar("Sin balas. Espera el resultado");
      } else {
        escena.bonus({ clave: r.clave, seed: r.seed, duracion: r.duracionMs / 1000, transcurridoMs: transcurrido });
        $("h-pregunta").textContent = "¡Caza interferencias! Las doradas valen 150";
        $("h-leyenda").hidden = true;
        cazadas = estado.bonus ? estado.bonus.hits.length : 0;
        puntosBonus = estado.bonus ? estado.bonus.puntos : 0;
        if (estado.bonus) estado.bonus.hits.forEach(function (id) { escena.ocultarInterferencia(id); });
      }
      pintarPie();
      iniciarReloj(estado.restanteMs);
    } else {
      escena.sincronizar(transcurrido);
      if (r.tipo === "pregunta") {
        balas = Math.min(balas, estado.balas);
        if (estado.respuesta !== null && disparo === null) { disparo = estado.respuesta; escena.ocultarDron(disparo); }
        pintarPie();
      }
    }
  }

  function pintarLeyenda(ops) {
    var ul = $("h-leyenda");
    ul.textContent = "";
    ops.forEach(function (texto, k) {
      var li = document.createElement("li");
      var m = document.createElement("span"); m.className = "marca"; m.dataset.i = k; m.textContent = LETRAS[k];
      var t = document.createElement("span"); t.textContent = texto;
      li.appendChild(m); li.appendChild(t);
      ul.appendChild(li);
    });
    ul.hidden = false;
  }

  function pintarPie() {
    var r = estado && estado.ronda;
    var cont = $("balas");
    if (r && r.tipo === "bonus") {
      cont.innerHTML = "";
      var c = document.createElement("span");
      c.className = "bonus-cuenta";
      c.textContent = cazadas;
      cont.appendChild(c);
      $("pie-texto").textContent = cazadas === 1 ? "interferencia cazada · +" + fmt(puntosBonus) : "interferencias cazadas · +" + fmt(puntosBonus);
      return;
    }
    cont.innerHTML = BALA + BALA + BALA;
    var iconos = cont.querySelectorAll("svg");
    for (var k = 0; k < iconos.length; k++) iconos[k].classList.toggle("gastada", k >= balas);
    $("pie-texto").textContent = disparo !== null
      ? "Ya respondiste esta pregunta"
      : (balas > 0 ? "Toca el dron con la respuesta correcta" : "Te quedaste sin balas");
  }

  function avisar(texto) {
    var a = $("aviso");
    a.textContent = texto;
    a.hidden = false;
  }

  // ---------- disparar ----------
  $("zona").addEventListener("pointerdown", function (e) {
    if (!estado || estado.fase !== "jugar" || !escena || e.target.id !== "cielo") return;
    e.preventDefault();
    Sonido.desbloquear();
    var r = estado.ronda;
    var p = escena.normalizar(e.clientX, e.clientY);
    var ahora = performance.now();

    if (r.tipo === "pregunta") {
      if (disparo !== null || balas <= 0) { Sonido.sinBalas(); return; }
      if (ahora - ultimoTiro < 140) return;
      ultimoTiro = ahora;
      var obj = escena.apuntar(p.x, p.y);
      balas -= 1;
      Sonido.disparo(false);
      escena.marcarDisparo(p.x, p.y, estado.color, null);
      if (obj) {
        disparo = obj.i;
        escena.derribar(obj.i, obj.x, obj.y, obj.dir);
        escena.texto(obj.x, obj.y - 0.08, "¡PUM!", "#FFFFFF", true);
        Sonido.impacto();
        setTimeout(Sonido.caida, 180);
        vibrar(45);
        avisar("Le diste a la " + LETRAS[obj.i] + ". Espera el resultado");
      } else if (balas === 0) {
        avisar("Sin balas. Espera el resultado");
      } else {
        vibrar(10);
      }
      pintarPie();
      socket.emit("jugador:disparo", { x: p.x, y: p.y, dron: obj ? obj.i : null }, function (res) {
        if (res && res.ok) { balas = res.balas; pintarPie(); }
      });
    } else {
      if (ahora - ultimoTiro < 130) return;
      ultimoTiro = ahora;
      var b = escena.apuntar(p.x, p.y);
      Sonido.disparo(false);
      escena.marcarDisparo(p.x, p.y, estado.color, null);
      if (b) {
        escena.reventar(b.id, b.x, b.y, b.dorada);
        escena.texto(b.x, b.y, "+" + b.valor, b.dorada ? "#FFC233" : "#FFFFFF", b.dorada);
        Sonido.pop(b.dorada);
        vibrar(b.dorada ? 40 : 18);
        cazadas += 1;
        puntosBonus += b.valor;
        pintarPie();
      }
      socket.emit("jugador:disparo", { x: p.x, y: p.y, id: b ? b.id : null }, function (res) {
        if (res && res.ok && typeof res.puntos === "number") { puntosBonus = res.puntos; pintarPie(); }
      });
    }
  });

  // ---------- resultado ----------
  function pintarResultado() {
    var r = estado.resultado;
    if (!r) { mostrar("v-juego"); return; }
    var sec = $("v-resultado");
    var era = $("r-era");
    era.hidden = true;
    if (r.tipo === "bonus") {
      sec.className = "resultado-j bonus";
      $("r-titulo").textContent = r.hits === 1 ? "Interferencia cazada" : "Interferencias cazadas";
      $("r-puntos").textContent = r.hits;
      $("r-detalle").textContent = "+" + fmt(r.ganados) + " pts";
    } else if (r.acierto) {
      sec.className = "resultado-j ok";
      $("r-titulo").textContent = "¡Le diste!";
      $("r-puntos").textContent = "+" + fmt(r.ganados);
      $("r-detalle").textContent = r.racha >= 2 ? "Racha de " + r.racha + " · bono +" + r.bono : "Dron correcto derribado";
    } else {
      sec.className = "resultado-j mal";
      $("r-titulo").textContent = r.disparo ? "Dron equivocado" : (r.sinBalas ? "Sin balas" : "No disparaste");
      $("r-puntos").textContent = "+0";
      $("r-detalle").textContent = "Total: " + fmt(estado.puntos) + " pts";
      $("r-marca").textContent = LETRAS[r.correcta];
      $("r-marca").dataset.i = r.correcta;
      $("r-era-texto").textContent = "La correcta: " + r.correctaTexto;
      era.hidden = false;
    }
    $("r-puesto").textContent = "Vas en el puesto " + estado.puesto + " de " + estado.totalJugadores;
    mostrar("v-resultado");
  }

  // ---------- reloj ----------
  function iniciarReloj(restanteMs) {
    cancelAnimationFrame(rafReloj);
    var fin = performance.now() + restanteMs;
    var paso = function () {
      var resta = Math.max(0, fin - performance.now());
      var t = $("h-tiempo");
      t.textContent = Math.ceil(resta / 1000);
      t.classList.toggle("urgente", resta > 0 && resta <= 5000);
      if (resta > 0) rafReloj = requestAnimationFrame(paso);
    };
    rafReloj = requestAnimationFrame(paso);
  }
  function iniciarCuenta(restanteMs) {
    cancelAnimationFrame(rafCuenta);
    var fin = performance.now() + restanteMs;
    var ultimo = -1;
    var paso = function () {
      var resta = Math.max(0, fin - performance.now());
      var s = Math.max(1, Math.ceil(resta / 1000));
      if (s !== ultimo) {
        var num = $("cuenta-num");
        num.textContent = s;
        num.style.animation = "none"; void num.offsetWidth; num.style.animation = "";
        ultimo = s;
      }
      if (resta > 0) rafCuenta = requestAnimationFrame(paso);
    };
    rafCuenta = requestAnimationFrame(paso);
  }

  if (!sesion) mostrar("v-unirse");
  else mostrar("v-espera");
})();
