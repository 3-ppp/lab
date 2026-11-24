// Datos del proyecto:
// - datos.json: las finales de los Mundiales. Cada final es un registro con los campos
//   id, anio, fecha, sede, local, visitante, golesLocal, golesVisitante, alargue,
//   penales, campeon, goles (lista con minuto, jugador, equipo, penal, enContra) y nota.
// - preguntas.json: preguntas escritas a mano (id, dificultad, pregunta, opciones, correcta, dato).
// Todo se guarda en memoria: al recargar la página, el juego vuelve a empezar.

// Cuánta "sabiduría" vale cada pregunta según su dificultad.
const DIFICULTADES = {
  facil: { nombre: "Fácil", valor: 1 },
  media: { nombre: "Media", valor: 2 },
  dificil: { nombre: "Difícil", valor: 3 },
};

// Cuántas preguntas de cada dificultad tiene cada modo de juego.
const MODOS = {
  corta: { facil: 3, media: 4, dificil: 3 }, // 10 preguntas
  larga: { facil: 8, media: 11, dificil: 11 }, // 30 preguntas
};

// Resultado final según el porcentaje de sabiduría (de mayor a menor).
const RESULTADOS = [
  { desde: 85, titulo: "Te sentás en la mesa con Macaya", frase: "", emoji: "🎙️" },
  { desde: 65, titulo: "Futbolero", frase: "", emoji: "⚽" },
  { desde: 40, titulo: "Mirás fútbol cada 4 años", frase: "Para no quedarte afuera.", emoji: "📺" },
  { desde: 0, titulo: "Volvé a ver Utilísima", frase: "No sabés una joraca de fútbol.", emoji: "🧶" },
];

let finales = [];
let preguntasFijas = [];
let preguntas = [];
let actual = 0;
let aciertos = 0;
let sabiduria = 0; // puntos de sabiduría ganados
let sabiduriaPosible = 0; // puntos de sabiduría que se podían ganar

const el = (id) => document.getElementById(id);

// ---------- Ayudas ----------

function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const sinRepetir = (lista) => [...new Set(lista)];

// Arma una pregunta con la respuesta correcta y tres opciones incorrectas, mezcladas.
function armarPregunta(dificultad, texto, correcta, incorrectas, dato) {
  const otras = mezclar(sinRepetir(incorrectas).filter((x) => x !== correcta)).slice(0, 3);
  const opciones = mezclar([correcta, ...otras]);
  return { dificultad, pregunta: texto, opciones, correcta: opciones.indexOf(correcta), dato };
}

function marcador(p) {
  let texto = `${p.local} ${p.golesLocal}-${p.golesVisitante} ${p.visitante}`;
  if (p.alargue) texto += " (con alargue)";
  if (p.penales) texto += `, ${p.penales.local}-${p.penales.visitante} por penales`;
  return texto;
}

const resumen = (p) => `Final ${p.anio}, ${p.sede}: ${marcador(p)}. Campeón: ${p.campeon}.`;

// ---------- Preguntas armadas a partir de las finales ----------

const todosLosEquipos = () => sinRepetir(finales.flatMap((p) => [p.local, p.visitante]));
const golesNormales = (p) => p.goles.filter((g) => !g.enContra);

// Intermedias: quién ganó, cómo terminó, dónde se jugó.
const tiposMedios = [
  (p) =>
    armarPregunta(
      "media",
      `¿Qué selección ganó la final del Mundial ${p.anio}?`,
      p.campeon,
      [p.local, p.visitante, ...mezclar(todosLosEquipos())],
      resumen(p)
    ),

  (p) => {
    const real = `${p.golesLocal}-${p.golesVisitante}`;
    const incorrectos = [];
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) if (`${a}-${b}` !== real) incorrectos.push(`${a}-${b}`);
    const aclaracion = p.alargue ? " (contando el alargue, sin penales)" : "";
    return armarPregunta(
      "media",
      `¿Cómo terminó la final de ${p.anio} entre ${p.local} y ${p.visitante}${aclaracion}?`,
      real,
      mezclar(incorrectos),
      resumen(p)
    );
  },

  (p) =>
    armarPregunta(
      "media",
      `¿En qué ciudad se jugó la final del Mundial ${p.anio}?`,
      p.sede.split(",")[0],
      mezclar(finales.map((x) => x.sede.split(",")[0])),
      resumen(p)
    ),
];

// Difíciles: quién hizo el gol y en qué minuto.
const tiposDificiles = [
  (p) => {
    const goles = golesNormales(p);
    if (!goles.length) return null;
    const g = alAzar(goles);
    const otros = finales.flatMap((x) => golesNormales(x).map((y) => y.jugador)).filter((j) => j !== g.jugador);
    return armarPregunta(
      "dificil",
      `En la final de ${p.anio} (${p.local} vs ${p.visitante}), ¿quién hizo el gol de ${g.equipo} en el minuto ${g.minuto}?`,
      g.jugador,
      mezclar(otros),
      resumen(p)
    );
  },

  (p) => {
    const unicos = golesNormales(p).filter((g) => p.goles.filter((x) => x.jugador === g.jugador).length === 1);
    if (!unicos.length) return null;
    const g = alAzar(unicos);
    const tope = p.alargue ? 120 : 90;
    const incorrectos = [];
    while (incorrectos.length < 3) {
      const m = 1 + Math.floor(Math.random() * tope);
      if (Math.abs(m - g.minuto) >= 5 && !incorrectos.some((x) => Math.abs(x - m) < 5)) incorrectos.push(m);
    }
    return armarPregunta(
      "dificil",
      `¿En qué minuto hizo ${g.jugador} su gol en la final de ${p.anio}?`,
      `Minuto ${g.minuto}`,
      incorrectos.map((m) => `Minuto ${m}`),
      resumen(p)
    );
  },
];

function preguntasDeFinales(tipos, cantidad, yaElegidas) {
  const resultado = [];
  let intentos = 0;
  while (resultado.length < cantidad && intentos < 500) {
    intentos++;
    const pregunta = alAzar(tipos)(alAzar(finales));
    const repetida = [...yaElegidas, ...resultado].some((x) => x.pregunta === pregunta?.pregunta);
    if (pregunta && !repetida) resultado.push(pregunta);
  }
  return resultado;
}

// Elige las preguntas de una partida según el modo.
function armarPartida(modo) {
  const cuantas = MODOS[modo];
  const fijas = (dificultad) => mezclar(preguntasFijas.filter((p) => p.dificultad === dificultad));

  // Fáciles: todas escritas a mano.
  const faciles = fijas("facil").slice(0, cuantas.facil);
  // Intermedias: la mitad escritas a mano y el resto armadas con las finales.
  const mediasFijas = fijas("media").slice(0, Math.floor(cuantas.media / 2));
  const medias = [...mediasFijas, ...preguntasDeFinales(tiposMedios, cuantas.media - mediasFijas.length, mediasFijas)];
  // Difíciles: todas armadas con las finales.
  const dificiles = preguntasDeFinales(tiposDificiles, cuantas.dificil, []);

  return mezclar([...faciles, ...medias, ...dificiles]);
}

// ---------- Juego ----------

function mostrarPantalla(cual) {
  el("inicio").hidden = cual !== "inicio";
  el("juego").hidden = cual !== "juego";
  el("final").hidden = cual !== "final";
}

function empezar(modo) {
  preguntas = armarPartida(modo);
  actual = 0;
  aciertos = 0;
  sabiduria = 0;
  sabiduriaPosible = preguntas.reduce((total, p) => total + DIFICULTADES[p.dificultad].valor, 0);
  mostrarPantalla("juego");
  mostrarPregunta();
}

const porcentaje = () => (sabiduriaPosible ? Math.round((sabiduria / sabiduriaPosible) * 100) : 0);

function actualizarProgreso() {
  el("progreso").textContent =
    `Pregunta ${actual + 1} de ${preguntas.length} · Aciertos: ${aciertos} · Sabiduría: ${porcentaje()}%`;
}

function mostrarPregunta() {
  const p = preguntas[actual];
  const dif = DIFICULTADES[p.dificultad];
  actualizarProgreso();
  el("dificultad").textContent = `${dif.nombre} · +${dif.valor} de sabiduría`;
  el("dificultad").className = `etiqueta ${p.dificultad}`;
  el("pregunta").textContent = p.pregunta;
  el("mensaje").textContent = "";
  el("siguiente").hidden = true;

  const contenedor = el("opciones");
  contenedor.innerHTML = "";
  p.opciones.forEach((texto, indice) => {
    const boton = document.createElement("button");
    boton.textContent = texto;
    boton.addEventListener("click", () => responder(indice));
    contenedor.appendChild(boton);
  });
}

function responder(elegida) {
  const p = preguntas[actual];
  const botones = el("opciones").querySelectorAll("button");
  botones.forEach((b) => (b.disabled = true));
  botones[p.correcta].classList.add("correcta");

  p.acertada = elegida === p.correcta;
  if (p.acertada) {
    aciertos++;
    sabiduria += DIFICULTADES[p.dificultad].valor;
    el("mensaje").textContent = `✅ ¡Correcto! ${p.dato}`;
  } else {
    botones[elegida].classList.add("incorrecta");
    el("mensaje").textContent = `❌ Era «${p.opciones[p.correcta]}». ${p.dato}`;
  }

  actualizarProgreso();
  const esLaUltima = actual === preguntas.length - 1;
  el("siguiente").textContent = esLaUltima ? "Ver resultado" : "Siguiente";
  el("siguiente").hidden = false;
  el("siguiente").focus();
}

function mostrarFinal() {
  mostrarPantalla("final");
  const pct = porcentaje();
  const resultado = RESULTADOS.find((r) => pct >= r.desde);

  el("progreso").textContent = "Fin del partido";
  el("titulo-resultado").textContent = `${resultado.emoji} ${resultado.titulo}`;
  el("frase-resultado").textContent = resultado.frase;
  el("frase-resultado").hidden = !resultado.frase;
  el("porcentaje").textContent = `${pct}% de sabiduría`;
  el("barra-relleno").style.width = `${pct}%`;

  // Detalle: aciertos por dificultad.
  const detalle = el("detalle");
  detalle.innerHTML = "";
  for (const [clave, dif] of Object.entries(DIFICULTADES)) {
    const deEsta = preguntas.filter((p) => p.dificultad === clave);
    if (!deEsta.length) continue;
    const bien = deEsta.filter((p) => p.acertada).length;
    const item = document.createElement("li");
    item.textContent = `${dif.nombre}: ${bien} de ${deEsta.length} (vale ${dif.valor} cada una)`;
    detalle.appendChild(item);
  }
  el("aciertos-total").textContent = `Acertaste ${aciertos} de ${preguntas.length} preguntas.`;
}

el("siguiente").addEventListener("click", () => {
  actual++;
  if (actual < preguntas.length) mostrarPregunta();
  else mostrarFinal();
});
el("modo-corta").addEventListener("click", () => empezar("corta"));
el("modo-larga").addEventListener("click", () => empezar("larga"));
el("reiniciar").addEventListener("click", () => {
  el("progreso").textContent = "Elegí cómo querés jugar";
  mostrarPantalla("inicio");
});

// ---------- Vista de finales ----------

function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function tarjetaDePartido(p) {
  const tarjeta = crear("article", "tarjeta");
  tarjeta.appendChild(crear("p", "cabecera", `Mundial ${p.anio} · ${p.sede}`));

  const marcadorNodo = crear("p", "marcador");
  marcadorNodo.append(
    crear("span", p.campeon === p.local ? "ganador" : "", p.local),
    ` ${p.golesLocal} - ${p.golesVisitante} `,
    crear("span", p.campeon === p.visitante ? "ganador" : "", p.visitante)
  );
  tarjeta.appendChild(marcadorNodo);

  const extras = [];
  if (p.alargue) extras.push("con alargue");
  if (p.penales) extras.push(`penales ${p.penales.local}-${p.penales.visitante}`);
  extras.push(`🏆 ${p.campeon}`);
  tarjeta.appendChild(crear("p", "extras", extras.join(" · ")));

  if (p.goles.length) {
    const lista = crear("ul", "goles");
    for (const g of p.goles) {
      let detalle = `${g.jugador} (${g.equipo})`;
      if (g.penal) detalle += " · penal";
      if (g.enContra) detalle += " · en contra";
      const item = crear("li");
      item.append(crear("span", "minuto", `${g.minuto}'`), detalle);
      lista.appendChild(item);
    }
    tarjeta.appendChild(lista);
  } else {
    tarjeta.appendChild(crear("p", "extras", "Sin goles."));
  }

  if (p.nota) tarjeta.appendChild(crear("p", "nota", p.nota));
  return tarjeta;
}

function mostrarFinales() {
  const equipo = el("filtro").value;
  const filtradas = finales
    .filter((p) => !equipo || p.local === equipo || p.visitante === equipo)
    .sort((a, b) => b.anio - a.anio);

  // Cálculo con los datos: títulos por selección (o el récord en finales de una selección).
  if (equipo) {
    const ganadas = filtradas.filter((p) => p.campeon === equipo).length;
    el("titulos").textContent = `${equipo} jugó ${filtradas.length} final(es) y ganó ${ganadas}.`;
  } else {
    // FIFA cuenta los títulos de Alemania Federal como de Alemania.
    const conteo = {};
    for (const p of finales) {
      const campeon = p.campeon === "Alemania Federal" ? "Alemania" : p.campeon;
      conteo[campeon] = (conteo[campeon] || 0) + 1;
    }
    const ranking = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    el("titulos").textContent =
      "Títulos: " + ranking.map(([e, n]) => `${e} ${n}`).join(" · ") + " (Alemania incluye a Alemania Federal).";
  }

  const lista = el("lista-partidos");
  lista.innerHTML = "";
  filtradas.forEach((p) => lista.appendChild(tarjetaDePartido(p)));
}

function llenarFiltro() {
  for (const equipo of todosLosEquipos().sort((a, b) => a.localeCompare(b, "es"))) {
    const opcion = crear("option", "", equipo);
    opcion.value = equipo;
    el("filtro").appendChild(opcion);
  }
}

el("filtro").addEventListener("change", mostrarFinales);

// ---------- Pestañas ----------

function mostrarVista(cual) {
  el("vista-jugar").hidden = cual !== "jugar";
  el("vista-partidos").hidden = cual !== "partidos";
  el("tab-jugar").classList.toggle("activa", cual === "jugar");
  el("tab-partidos").classList.toggle("activa", cual === "partidos");
}
el("tab-jugar").addEventListener("click", () => mostrarVista("jugar"));
el("tab-partidos").addEventListener("click", () => mostrarVista("partidos"));

// ---------- Carga de datos ----------

Promise.all([
  fetch("datos.json").then((r) => r.json()),
  fetch("preguntas.json").then((r) => r.json()),
])
  .then(([datosFinales, datosPreguntas]) => {
    finales = datosFinales;
    preguntasFijas = datosPreguntas;
    llenarFiltro();
    mostrarFinales();
    el("progreso").textContent = "Elegí cómo querés jugar";
    mostrarPantalla("inicio");
  })
  .catch(() => {
    el("progreso").textContent =
      "No se pudieron cargar los datos. Si abriste el archivo con doble clic, probalo con un servidor local.";
  });
