# Caza de Señales · juego multijugador sobre antenas

Un juego de cacería en vivo con estilo de atardecer retro. En el proyector y en cada celular vuelan cuatro drones, y cada uno lleva colgada una respuesta. Los jugadores tocan la pantalla para disparar y tienen **3 balas** por pregunta. El primer dron que derriban es su respuesta.

- Quien acierta gana de 500 a 1000 puntos, según qué tan rápido dispare. Cada acierto seguido suma 100 puntos extra, hasta +500.
- Al revelar la respuesta, los drones equivocados se escapan y el correcto cae. Torri, la torrecita mascota, sale del pasto con el dron en la mano. Si nadie le atinó, se ríe.
- Cada partida tiene **20 rondas**: 15 preguntas y 5 bonus, unos 12 minutos. Si desactivas los bonus, son 20 preguntas.
- Antes de cada bonus hay 6 segundos con 2 o 3 pasos cortos que explican qué hacer.
- Cada 3 preguntas hay una **ronda bonus**, y se van turnando tres tipos:
  - **Interferencias** (15 s): cruzan el cielo monstruos de interferencia que hay que derribar. Cada uno vale 50 puntos, y los dorados, 150.
  - **Cubre la ciudad** (35 s): cada jugador coloca 4 antenas en un mapa. La omnidireccional cubre 360° de cerca, la sectorial cubre 120° y se apunta, y la parabólica hace un enlace punto a punto, la única forma de llegar al pueblo tras la montaña. Gana más quien cubra más población: 8 puntos por cada 1 %. Al final, las interferencias entran por las zonas sin señal.
  - **Sintoniza la emisora** (25 s): hay que girar el dial de una radio hasta encontrar emisoras de AM, FM y Wi-Fi. La estática baja a medida que te acercas. Cada emisora vale 100 puntos.
- Al final aparece un podio con premios a la mejor puntería, al cazador de interferencias, a la mejor cobertura y a la mejor racha.

Incluye 26 preguntas en el banco (en cada partida salen 15 al azar), repartidas entre los tres temas de la exposición: fundamentos, tipos de antenas, y potencia, conectores y aplicaciones.

| | Opción A · En internet | Opción B · En tu computadora |
|---|---|---|
| Cómo entran los jugadores | Con sus **propios datos móviles** o cualquier Wi-Fi | Todos en el **mismo Wi-Fi** que la computadora |
| Qué hay que instalar | Nada | Node.js en la computadora |
| Se prepara | Una sola vez, antes de la clase | Cada vez que vayas a jugar |

Si cada compañero va a usar sus propios datos, usa la **opción A**.

---

## Opción A · Publicado en internet (recomendada)

El juego queda en una página web gratis, con una dirección como `https://caza-de-senales.onrender.com`.

**1. Sube la carpeta a GitHub**

1. Crea una cuenta gratis en [github.com](https://github.com).
2. Toca **+ → New repository**, ponle de nombre `caza-de-senales` y toca **Create repository**.
3. Toca el enlace **uploading an existing file**.
4. Descomprime el ZIP, abre la carpeta `caza-de-senales` y arrastra **todo lo que hay dentro** (la carpeta `public` y los archivos) a la página.
5. Toca **Commit changes**.

**2. Publícalo en Render**

1. Entra a [render.com](https://render.com) y crea la cuenta con **GitHub**.
2. Toca **New → Web Service** y elige el repositorio `caza-de-senales`.
3. Revisa que quede así:
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Toca **Deploy Web Service** y espera hasta que diga **Live**.

**3. El día de la exposición**

1. Unos minutos antes, abre en la computadora del proyector la dirección de Render con `/host.html` al final. Por ejemplo: `https://caza-de-senales.onrender.com/host.html`.
2. Crea la partida. Si quieres sonido, sube el volumen de la computadora.
3. Los compañeros escanean el QR o entran a la dirección y escriben el PIN.

**Importante:** en el plan gratis, el juego se apaga tras 15 minutos sin uso y tarda cerca de un minuto en despertar. Ábrelo unos minutos antes de empezar.

---

## Opción B · En tu computadora (todos en el mismo Wi-Fi)

Necesitas **Node.js 18 o más reciente**. Descárgalo en [nodejs.org](https://nodejs.org) y elige la versión LTS.

1. Descomprime la carpeta.
2. Abre una terminal dentro de la carpeta:
   - **Windows:** en el Explorador, escribe `cmd` en la barra de direcciones y presiona Enter.
   - **Mac:** abre la app Terminal, escribe `cd ` (con un espacio al final), arrastra la carpeta a la ventana y presiona Enter.
3. Escribe `npm install`. Solo hace falta la primera vez.
4. Escribe `npm start`.
5. En la computadora del proyector, abre **http://localhost:3000/host.html**.
6. Los jugadores escanean el QR, o entran a la dirección que aparece en pantalla (por ejemplo `192.168.1.20:3000`) y escriben el PIN.

Para detenerlo, presiona `Ctrl + C`.

---

## Consejos para jugar

- **Atajos del presentador:** la barra espaciadora o Enter pasan a la siguiente ronda. El botón **Terminar la ronda** corta el tiempo.
- **Sacar a un jugador:** en la sala de espera, toca su nombre dos veces.
- **Reconexión:** si un celular se bloquea o se recarga, el jugador vuelve con sus puntos y sus balas. Si el proyector se recarga, la partida también se recupera.
- **Sin bonus:** desactiva **Rondas bonus** al crear la partida para jugar 20 preguntas seguidas.

## Cambiar o agregar preguntas

Edita el archivo `preguntas.js`:

- La **primera opción** de cada pregunta es la correcta. El juego mezcla el orden solo.
- Las opciones van colgadas de los drones, así que conviene que sean cortas, de unas 18 letras como máximo.
- Cada pregunta lleva una explicación corta, que aparece al revelar la respuesta.

Después de editar el archivo:

- **Opción A:** súbelo a GitHub. Render vuelve a publicar el juego solo.
- **Opción B:** reinicia el juego con `Ctrl + C` y luego `npm start`.
