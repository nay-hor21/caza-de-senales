// Caza de Señales · pantalla del proyector
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var LETRAS = ["A", "B", "C", "D"];
  var VISTAS_MENU = ["v-cargando", "v-config", "v-lobby", "v-final"];
  var CIRCUNFERENCIA = 2 * Math.PI * 44;

  var socket = io();
  var estado = null;
  var sesion = leerSesion();
  var baseUrl = location.origin;
  var sinRedLocal = false;
  var escena = null;
  var claveEscena = null, faseEscena = null;
  var rafReloj = 0, rafCuenta = 0;
  var panelTimer = 0;
  var sonidosTimer = [];
  var confirmando = null;
  var qrPintado = "";
  var finalSonado = false;

  function leerSesion() {
    try { return JSON.parse(sessionStorage.getItem("cs-host")); } catch (e) { return null; }
  }
  function guardarSesion(s) {
    try {
      if (s) sessionStorage.setItem("cs-host", JSON.stringify(s));
      else sessionStorage.removeItem("cs-host");
    } catch (e) { /* sin almacenamiento */ }
  }
  function fmt(n) { return Number(n).toLocaleString("es"); }
  function pinBonito(pin) { return pin.slice(0, 3) + " " + pin.slice(3); }

  function mostrar(id) {
    VISTAS_MENU.forEach(function (v) { $(v).hidden = v !== id; });
    $("app").hidden = id === "v-juego";
    $("v-juego").hidden = id !== "v-juego";
    if (id === "v-juego") asegurarEscena();
  }

  function asegurarEscena() {
    if (escena) return;
    escena = Escena.crear($("cielo"), { modo: "host" });
    escena.limiteMascota(0.56);
    window.__escena = escena;
    ajustarBanda();
    window.addEventListener("resize", ajustarBanda);
  }
  function ajustarBanda() {
    if (!escena) return;
    requestAnimationFrame(function () {
      var h = $("banda").offsetHeight;
      escena.margenSuperior(h);
      document.documentElement.style.setProperty("--alto-banda", h + "px");
    });
  }

  // ---------- dirección para los celulares ----------
  var esLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].indexOf(location.hostname) !== -1;
  if (esLocal) {
    fetch("/api/info").then(function (r) { return r.json(); }).then(function (info) {
      if (info.urlsLocales && info.urlsLocales.length) baseUrl = info.urlsLocales[0];
      else sinRedLocal = true;
      qrPintado = "";
      if (estado && estado.fase === "lobby") pintarLobby();
    }).catch(function () { /* se usa la dirección actual */ });
  }

  // ---------- conexión ----------
  socket.on("connect", function () {
    $("conexion").hidden = true;
    if (sesion) {
      socket.emit("host:reanudar", sesion, function (r) {
        if (!r || !r.ok) { sesion = null; guardarSesion(null); mostrar("v-config"); }
      });
    } else if (!estado) {
      mostrar("v-config");
    }
  });
  socket.on("disconnect", function () { $("conexion").hidden = false; });
  socket.on("estado", function (s) { estado = s; pintar(); });
  socket.on("disparo", function (d) {
    if (!escena || $("v-juego").hidden) return;
    escena.marcarDisparo(d.x, d.y, d.color, d.nombre);
    if (d.tipo === "bonus") escena.texto(d.x, d.y, "+" + d.valor, d.color);
    Sonido.disparo(true);
  });

  document.addEventListener("pointerdown", function () { Sonido.desbloquear(); }, { once: true });

  // ---------- controles ----------
  $("form-config").addEventListener("submit", function (e) {
    e.preventDefault();
    Sonido.desbloquear();
    var cantidad = $("cantidad-todas").checked ? "todas" : "10";
    var tiempo = $("tiempo-30").checked ? 30 : 20;
    $("btn-crear").disabled = true;
    socket.emit("host:crear", { cantidad: cantidad, tiempo: tiempo, bonus: $("con-bonus").checked }, function (r) {
      $("btn-crear").disabled = false;
      if (r && r.ok) { sesion = { pin: r.pin, claveHost: r.claveHost }; guardarSesion(sesion); }
    });
  });
  $("btn-empezar").addEventListener("click", function () { Sonido.desbloquear(); socket.emit("host:empezar"); });
  $("btn-saltar").addEventListener("click", function () { socket.emit("host:saltar"); });
  $("btn-siguiente").addEventListener("click", function () { socket.emit("host:siguiente"); });
  $("btn-sonido").addEventListener("click", function () {
    var activo = Sonido.activo(!Sonido.activo());
    this.textContent = activo ? "Sonido: activado" : "Sonido: apagado";
  });
  $("btn-nueva").addEventListener("click", function () {
    socket.emit("host:cerrar");
    sesion = null; estado = null; guardarSesion(null);
    claveEscena = null; faseEscena = null; qrPintado = ""; finalSonado = false;
    mostrar("v-config");
  });
  document.addEventListener("keydown", function (e) {
    if (!estado || e.target.tagName === "INPUT") return;
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
      if (estado.fase === "resultado" && !$("panel-res").hidden) { e.preventDefault(); socket.emit("host:siguiente"); }
      else if (estado.fase === "lobby" && estado.jugadores.length) { e.preventDefault(); socket.emit("host:empezar"); }
    }
  });

  // ---------- pintar ----------
  function pintar() {
    if (estado.fase === "lobby") { mostrar("v-lobby"); pintarLobby(); }
    else if (estado.fase === "final") { detenerTodo(); mostrar("v-final"); pintarFinal(); }
    else { mostrar("v-juego"); pintarJuego(); }
  }

  function detenerTodo() {
    cancelAnimationFrame(rafReloj); cancelAnimationFrame(rafCuenta);
    clearTimeout(panelTimer);
    sonidosTimer.forEach(clearTimeout); sonidosTimer = [];
  }

  function pintarLobby() {
    finalSonado = false;
    $("lobby-pin").textContent = pinBonito(estado.pin);
    $("lobby-url").textContent = baseUrl.replace(/^https?:\/\//, "");
    var enlace = baseUrl + "/?pin=" + estado.pin;
    if (qrPintado !== enlace) { $("lobby-qr").src = "/api/qr?texto=" + encodeURIComponent(enlace); qrPintado = enlace; }
    $("lobby-nota").textContent = sinRedLocal
      ? "Esta computadora no está conectada a una red. Conéctala para que los celulares puedan entrar."
      : (esLocal ? "Los celulares tienen que estar en la misma red Wi-Fi que esta computadora." : "");

    var lista = $("lobby-lista");
    lista.textContent = "";
    estado.jugadores.forEach(function (j) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      var punto = document.createElement("i");
      b.style.setProperty("--c", j.color);
      b.appendChild(punto);
      b.appendChild(document.createTextNode(confirmando === j.nombre ? "Sacar a " + j.nombre : j.nombre));
      if (confirmando === j.nombre) b.className = "confirmar";
      else if (!j.conectado) b.className = "desconectado";
      b.addEventListener("click", function () {
        if (confirmando === j.nombre) {
          socket.emit("host:expulsar", { nombre: j.nombre });
          confirmando = null;
        } else {
          confirmando = j.nombre;
          setTimeout(function () { if (confirmando === j.nombre) { confirmando = null; pintarLobby(); } }, 3000);
          pintarLobby();
        }
      });
      li.appendChild(b);
      lista.appendChild(li);
    });
    var n = estado.jugadores.length;
    $("lobby-cuenta").textContent = n;
    $("lobby-vacio").hidden = n > 0;
    $("btn-empezar").disabled = n === 0;
  }

  var INFO_BONUS = {
    interferencias: {
      nombre: "Ronda bonus · Interferencias",
      ayuda: "Toca todas las interferencias que puedas: 50 pts, doradas 150",
      banda: "¡Derriba todas las interferencias que puedas!",
      fin: "¡Se acabaron las interferencias!",
      titulo: "Mejores cazadores",
      vacio: "Nadie cazó interferencias esta vez.",
      valor: function (j) { return j.valor + (j.valor === 1 ? " cazada" : " cazadas") + " · +" + fmt(j.ganados); }
    },
    ciudad: {
      nombre: "Ronda bonus · Cubre la ciudad",
      ayuda: "Coloca 4 antenas en tu celular para dar señal a toda la ciudad",
      banda: "Cubre la ciudad: coloca tus antenas desde el celular",
      fin: "¡Llegan las interferencias a las zonas sin señal!",
      titulo: "Mejor cobertura",
      vacio: "Nadie colocó antenas esta vez.",
      valor: function (j) { return j.valor + " % · +" + fmt(j.ganados); },
      vivo: "Cobertura en vivo",
      vivoValor: function (v) { return v + " %"; },
      leyenda: [
        ["omni", "Omnidireccional", "360°, alcance corto. Ideal para un barrio."],
        ["sector", "Sectorial", "120°, alcance medio. Apúntala a lo largo de la avenida."],
        ["para", "Parabólica", "Enlace punto a punto. Es la única que llega al pueblo tras la montaña."]
      ]
    },
    radio: {
      nombre: "Ronda bonus · Sintoniza la emisora",
      ayuda: "Gira el dial en tu celular hasta que se limpie la estática",
      banda: "Sintoniza la emisora: gira el dial en tu celular",
      fin: "¡Se acabó la transmisión!",
      titulo: "Mejores sintonizadores",
      vacio: "Nadie sintonizó emisoras esta vez.",
      valor: function (j) { return j.valor + (j.valor === 1 ? " emisora" : " emisoras") + " · +" + fmt(j.ganados); },
      vivo: "Emisoras sintonizadas",
      vivoValor: function (v) { return String(v); },
      leyenda: [
        ["am", "Radio AM", "530 a 1700 kHz (kilohercios)"],
        ["fm", "Radio FM", "88 a 108 MHz (megahercios)"],
        ["wifi", "Wi-Fi", "2,4 GHz, canales 1 al 11"]
      ]
    }
  };

  function etiquetaRonda(r) {
    return r.tipo === "pregunta" ? "Pregunta " + r.numero + " de " + estado.totalPreguntas : INFO_BONUS[r.modo].nombre;
  }

  // Área del cielo que queda libre a la izquierda del panel lateral.
  function areaIzquierda(info) {
    var panel = Math.min(470, info.W * 0.38) + 40;
    return { x: 24, y: info.arriba + 14, w: Math.max(200, info.W - panel - 36), h: info.Hs - 84 };
  }

  var ciudadHost = null;
  function capaCiudad(info) {
    if (!ciudadHost) return;
    var R = Ciudad.ajustar(areaIzquierda(info), 0);
    var ataque = null;
    if (ciudadHost.ataque) ataque = { objetivos: ciudadHost.ataque, t: (performance.now() - ciudadHost.inicioAtaque) / 1000 };
    Ciudad.dibujar(info.ctx, R, ciudadHost.mapa, ciudadHost.antenas, ciudadHost.res, { t: info.t, etiquetas: true, ataque: ataque });
    if (ciudadHost.mejor) {
      var texto = ciudadHost.mejor.nombre + " · " + ciudadHost.mejor.pct + " % de cobertura";
      var c = info.ctx, fs = Math.max(14, Math.min(22, R.w * 0.04));
      c.font = "700 " + fs + "px 'Atkinson Hyperlegible', sans-serif";
      var w = c.measureText(texto).width + fs * 1.4;
      c.fillStyle = "rgba(28, 15, 22, .92)";
      c.fillRect(R.x + (R.w - w) / 2, R.y + R.h - fs * 2.4, w, fs * 1.8);
      c.fillStyle = ciudadHost.mejor.color;
      c.fillRect(R.x + (R.w - w) / 2, R.y + R.h - fs * 2.4, 6, fs * 1.8);
      c.fillStyle = "#FBEFE3"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(texto, R.x + R.w / 2, R.y + R.h - fs * 1.5);
    }
  }
  function capaRadio(info) {
    Radio.decorativa(info.ctx, areaIzquierda(info), info.t);
  }
  function conCtx(fn) { return function (ctx, info) { info.ctx = ctx; fn(info); }; }

  function pintarVivo(r) {
    var datos = INFO_BONUS[r.modo];
    var leyenda = $("vivo-leyenda");
    if (leyenda.dataset.modo !== r.modo) {
      leyenda.dataset.modo = r.modo;
      $("vivo-eyebrow").textContent = datos.nombre;
      $("vivo-titulo").textContent = r.modo === "ciudad" ? "Dale señal a toda la ciudad" : "Encuentra la emisora";
      $("vivo-subtitulo").textContent = datos.vivo;
      leyenda.textContent = "";
      datos.leyenda.forEach(function (l) {
        var li = document.createElement("li");
        var i = document.createElement("i"); i.className = "ico-" + l[0];
        var b = document.createElement("b"); b.textContent = l[1];
        var span = document.createElement("span"); span.textContent = l[2];
        li.appendChild(i); li.appendChild(b); li.appendChild(span);
        leyenda.appendChild(li);
      });
    }
    var lista = estado.vivo || [];
    var ol = $("vivo-lista");
    ol.textContent = "";
    var max = r.modo === "ciudad" ? 100 : Math.max(1, lista.reduce(function (m, j) { return Math.max(m, j.valor); }, 0));
    if (!lista.length) {
      var vacio = document.createElement("li");
      vacio.className = "vivo-vacio";
      vacio.textContent = "Esperando a los jugadores…";
      ol.appendChild(vacio);
    }
    lista.forEach(function (j) {
      var li = document.createElement("li");
      var quien = document.createElement("span"); quien.className = "quien"; quien.textContent = j.nombre;
      var barra = document.createElement("span"); barra.className = "barra";
      var relleno = document.createElement("i"); relleno.style.width = Math.max(2, (j.valor / max) * 100) + "%"; relleno.style.background = j.color;
      barra.appendChild(relleno);
      var v = document.createElement("span"); v.className = "n"; v.textContent = datos.vivoValor(j.valor);
      li.appendChild(quien); li.appendChild(barra); li.appendChild(v);
      ol.appendChild(li);
    });
  }

  function pintarJuego() {
    var r = estado.ronda;
    if (!r) return;
    var esPregunta = r.tipo === "pregunta";
    var libre = !esPregunta && r.modo !== "interferencias";
    $("j-pin").textContent = pinBonito(estado.pin);
    $("j-etiqueta").textContent = etiquetaRonda(r);

    if (estado.fase === "preparar") {
      if (claveEscena !== r.clave || faseEscena !== "preparar") {
        detenerTodo();
        claveEscena = r.clave; faseEscena = "preparar";
        escena.vacio();
        ciudadHost = null;
        $("panel-res").hidden = true;
        $("panel-vivo").hidden = true;
        $("btn-saltar").hidden = true;
        $("j-pregunta").textContent = esPregunta ? "Prepárate…" : INFO_BONUS[r.modo].banda;
        $("cuenta-tipo").textContent = etiquetaRonda(r);
        $("cuenta-ayuda").textContent = esPregunta ? "Derriba el dron que lleva la respuesta correcta" : INFO_BONUS[r.modo].ayuda;
        $("cuenta").hidden = false;
        pintarReloj(r.duracionMs, r.duracionMs);
        iniciarCuenta(estado.restanteMs);
        ajustarBanda();
      }
      $("j-listos").textContent = estado.conectados + " cazadores";
      return;
    }

    if (estado.fase === "jugar") {
      var transcurrido = r.duracionMs - estado.restanteMs;
      if (claveEscena !== r.clave || faseEscena !== "jugar") {
        detenerTodo();
        claveEscena = r.clave; faseEscena = "jugar";
        $("cuenta").hidden = true;
        $("panel-res").hidden = true;
        $("btn-saltar").hidden = false;
        $("panel-vivo").hidden = !libre;
        if (esPregunta) {
          escena.pregunta({ clave: r.clave, seed: r.seed, nivel: r.nivel, ops: estado.pregunta.ops, transcurridoMs: transcurrido });
          $("j-pregunta").textContent = estado.pregunta.q;
          Sonido.inicio();
        } else if (r.modo === "interferencias") {
          escena.bonus({ clave: r.clave, seed: r.seed, duracion: r.duracionMs / 1000, transcurridoMs: transcurrido });
          $("j-pregunta").textContent = INFO_BONUS.interferencias.banda;
          Sonido.bonus();
        } else if (r.modo === "ciudad") {
          var mapa = EscenaDatos.ciudadMapa(r.seed);
          ciudadHost = { mapa: mapa, antenas: [], res: EscenaDatos.cobertura(mapa, []) };
          escena.libre({ clave: r.clave, transcurridoMs: transcurrido, capa: conCtx(capaCiudad) });
          $("j-pregunta").textContent = INFO_BONUS.ciudad.banda;
          Sonido.bonus();
        } else {
          escena.libre({ clave: r.clave, transcurridoMs: transcurrido, capa: conCtx(capaRadio) });
          $("j-pregunta").textContent = INFO_BONUS.radio.banda;
          Sonido.bonus();
        }
        iniciarReloj(estado.restanteMs, r.duracionMs);
        ajustarBanda();
      } else {
        escena.sincronizar(transcurrido);
      }
      if (libre) pintarVivo(r);
      $("j-listos").textContent = esPregunta
        ? estado.respondieron + " de " + estado.conectados + " dispararon"
        : estado.conectados + " cazadores";
      return;
    }

    if (estado.fase === "resultado") {
      if (claveEscena !== r.clave || faseEscena !== "resultado") {
        var vieneDeJuego = claveEscena === r.clave && faseEscena === "jugar";
        detenerTodo();
        claveEscena = r.clave; faseEscena = "resultado";
        $("cuenta").hidden = true;
        $("btn-saltar").hidden = true;
        $("panel-vivo").hidden = true;
        pintarReloj(0, r.duracionMs);
        var espera = 600;
        if (esPregunta) {
          if (!vieneDeJuego || escena.modo() !== "pregunta") {
            escena.pregunta({ clave: r.clave, seed: r.seed, nivel: r.nivel, ops: estado.pregunta.ops, transcurridoMs: r.duracionMs });
          }
          $("j-pregunta").textContent = estado.pregunta.q;
          var res = estado.resultado;
          escena.revelar({ correcta: res.correcta, acertaron: res.acertaron });
          if (res.acertaron > 0) {
            Sonido.impacto();
            sonidosTimer.push(setTimeout(Sonido.caida, 500));
            sonidosTimer.push(setTimeout(Sonido.golpe, 1350));
            sonidosTimer.push(setTimeout(Sonido.atrapado, 1700));
          } else {
            sonidosTimer.push(setTimeout(Sonido.risa, 1300));
          }
          espera = 2800;
        } else if (r.modo === "ciudad") {
          var m2 = EscenaDatos.ciudadMapa(r.seed);
          var mejor = estado.bonus && estado.bonus.mejor;
          var antenas = mejor ? mejor.antenas : [];
          var res2 = EscenaDatos.cobertura(m2, antenas);
          ciudadHost = { mapa: m2, antenas: antenas, res: res2, mejor: mejor, ataque: Ciudad.prepararAtaque(m2, res2), inicioAtaque: performance.now() };
          escena.libre({ clave: r.clave, transcurridoMs: r.duracionMs, capa: conCtx(capaCiudad) });
          $("j-pregunta").textContent = INFO_BONUS.ciudad.fin;
          if (res2.pct >= 95) Sonido.atrapado(); else sonidosTimer.push(setTimeout(Sonido.risa, 900));
          espera = 2600;
        } else if (r.modo === "radio") {
          escena.libre({ clave: r.clave, transcurridoMs: r.duracionMs, capa: conCtx(capaRadio) });
          $("j-pregunta").textContent = INFO_BONUS.radio.fin;
          Sonido.final();
        } else {
          escena.vacio();
          $("j-pregunta").textContent = INFO_BONUS.interferencias.fin;
          Sonido.final();
        }
        ajustarBanda();
        panelTimer = setTimeout(function () {
          $("panel-res").hidden = false;
          $("btn-siguiente").focus({ preventScroll: true });
        }, espera);
      }
      pintarPanel();
      $("j-listos").textContent = esPregunta ? estado.resultado.acertaron + " de " + estado.jugadores.length + " acertaron" : "";
    }
  }

  function pintarPanel() {
    var r = estado.ronda;
    var esPregunta = r.tipo === "pregunta";
    $("res-pregunta").hidden = !esPregunta;
    $("res-bonus").hidden = esPregunta;
    $("res-top-titulo").hidden = !esPregunta;
    var ultima = estado.indice >= estado.totalRondas - 1;
    $("btn-siguiente").textContent = ultima ? "Ver el podio" : "Siguiente ronda";

    if (esPregunta) {
      var res = estado.resultado;
      $("res-marca").textContent = LETRAS[res.correcta];
      $("res-marca").dataset.i = res.correcta;
      $("res-texto").textContent = estado.pregunta.ops[res.correcta];
      $("res-exp").textContent = res.exp;
      var votos = $("res-votos");
      if (votos.dataset.clave !== r.clave) {
        votos.dataset.clave = r.clave;
        votos.textContent = "";
        var max = Math.max.apply(null, res.distribucion.concat([1]));
        res.distribucion.forEach(function (n, k) {
          var li = document.createElement("li");
          if (k === res.correcta) li.className = "ok";
          var m = document.createElement("span"); m.className = "marca"; m.dataset.i = k; m.textContent = LETRAS[k];
          var barra = document.createElement("span"); barra.className = "barra";
          var relleno = document.createElement("i"); barra.appendChild(relleno);
          var num = document.createElement("span"); num.className = "n"; num.textContent = n;
          li.appendChild(m); li.appendChild(barra); li.appendChild(num);
          votos.appendChild(li);
          setTimeout(function () { relleno.style.width = Math.max(3, (n / max) * 100) + "%"; }, 3000);
        });
      }
      pintarTop($("res-top"), estado.jugadores.slice(0, 5), function (j) { return fmt(j.puntos); });
    } else {
      var datos = INFO_BONUS[r.modo];
      $("res-bonus-eyebrow").textContent = datos.nombre;
      $("res-bonus-titulo").textContent = datos.titulo;
      var nota = $("res-bonus-nota");
      nota.hidden = r.modo !== "ciudad";
      if (r.modo === "ciudad") {
        var mejor = estado.bonus && estado.bonus.mejor;
        nota.textContent = mejor && mejor.pct >= 95
          ? "¡Ciudad protegida! La combinación correcta: omni para el barrio, sectorial para la avenida y parabólica para el pueblo."
          : "Las interferencias entran por las zonas sin señal. Omni para el barrio, sectorial para la avenida y parabólica para el pueblo.";
      }
      var top = (estado.bonus && estado.bonus.top) || [];
      if (!top.length) {
        var ol = $("res-top");
        ol.textContent = "";
        var li = document.createElement("li");
        li.textContent = datos.vacio;
        ol.appendChild(li);
      } else {
        pintarTop($("res-top"), top, datos.valor);
      }
    }
  }

  function pintarTop(ol, lista, valor, desde) {
    ol.textContent = "";
    lista.forEach(function (j, idx) {
      var li = document.createElement("li");
      var pos = document.createElement("span"); pos.className = "pos"; pos.textContent = "#" + ((desde || 0) + idx + 1);
      var punto = document.createElement("span"); punto.className = "punto"; punto.style.background = j.color;
      var quien = document.createElement("span"); quien.className = "quien"; quien.textContent = j.nombre;
      var pts = document.createElement("span"); pts.className = "pts"; pts.textContent = valor(j);
      li.appendChild(pos); li.appendChild(punto); li.appendChild(quien); li.appendChild(pts);
      ol.appendChild(li);
    });
  }

  // ---------- reloj y cuenta regresiva ----------
  function iniciarReloj(restanteMs, totalMs) {
    cancelAnimationFrame(rafReloj);
    var fin = performance.now() + restanteMs;
    var ultimoSeg = -1;
    var paso = function () {
      var resta = Math.max(0, fin - performance.now());
      pintarReloj(resta, totalMs);
      var s = Math.ceil(resta / 1000);
      if (s !== ultimoSeg) {
        if (s <= 3 && s > 0 && ultimoSeg !== -1) Sonido.pitido(false);
        ultimoSeg = s;
      }
      if (resta > 0) rafReloj = requestAnimationFrame(paso);
    };
    rafReloj = requestAnimationFrame(paso);
  }
  function pintarReloj(restaMs, totalMs) {
    var frac = Math.max(0, Math.min(1, restaMs / totalMs));
    var arco = $("reloj-arco");
    arco.style.strokeDasharray = CIRCUNFERENCIA;
    arco.style.strokeDashoffset = CIRCUNFERENCIA * (1 - frac);
    $("reloj-num").textContent = Math.ceil(restaMs / 1000);
    $("reloj").classList.toggle("urgente", restaMs > 0 && restaMs <= 5000);
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
        Sonido.pitido(false);
        ultimo = s;
      }
      if (resta > 0) rafCuenta = requestAnimationFrame(paso);
    };
    rafCuenta = requestAnimationFrame(paso);
  }

  // ---------- podio ----------
  function pintarFinal() {
    if (!finalSonado) { Sonido.final(); finalSonado = true; }
    var lista = estado.jugadores;
    var podio = $("f-podio");
    podio.textContent = "";
    [1, 0, 2].forEach(function (i) {
      var j = lista[i];
      var col = document.createElement("div");
      col.className = "puesto p" + (i + 1);
      if (!j) col.style.visibility = "hidden";
      var nombre = document.createElement("span"); nombre.className = "nombre";
      nombre.style.setProperty("--c", j ? j.color : "transparent");
      var punto = document.createElement("i");
      var texto = document.createElement("span"); texto.textContent = j ? j.nombre : "—";
      nombre.appendChild(punto); nombre.appendChild(texto);
      var bloque = document.createElement("div"); bloque.className = "bloque";
      var num = document.createElement("span"); num.className = "num"; num.textContent = i + 1;
      var pts = document.createElement("span"); pts.className = "pts"; pts.textContent = j ? fmt(j.puntos) + " pts" : "";
      bloque.appendChild(num); bloque.appendChild(pts);
      col.appendChild(nombre); col.appendChild(bloque);
      podio.appendChild(col);
    });

    var premios = $("f-premios");
    premios.textContent = "";
    var p = estado.premios || {};
    [
      ["punteria", "Mejor puntería", function (v) { return v + " %"; }],
      ["cazador", "Cazador de interferencias", function (v) { return v + (v === 1 ? " cazada" : " cazadas"); }],
      ["cobertura", "Mejor cobertura", function (v) { return v + " %"; }],
      ["racha", "Mejor racha", function (v) { return v + " seguidas"; }]
    ].forEach(function (def) {
      var dato = p[def[0]];
      if (!dato) return;
      var li = document.createElement("li");
      li.style.setProperty("--c", dato.color);
      var e = document.createElement("span"); e.className = "eyebrow"; e.textContent = def[1];
      var q = document.createElement("span"); q.className = "quien"; q.textContent = dato.nombre;
      var v = document.createElement("span"); v.className = "valor"; v.textContent = def[2](dato.valor);
      li.appendChild(e); li.appendChild(q); li.appendChild(v);
      premios.appendChild(li);
    });
    premios.hidden = !premios.children.length;
    pintarTop($("f-resto"), lista.slice(3), function (j) { return fmt(j.puntos); }, 3);
  }
})();
