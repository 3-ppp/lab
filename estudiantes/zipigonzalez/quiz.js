// Datos del proyecto:
// - datos.json: las finales de los Mundiales. Cada final es un registro con los campos
//   id, anio, fecha, sede, local, visitante, golesLocal, golesVisitante, alargue,
//   penales, campeon, goles (lista con minuto, jugador, equipo, penal, enContra) y nota.
// - preguntas.json: preguntas escritas a mano (id, dificultad, pregunta, opciones, correcta, dato).
// - goleadores.json: jugadores con 2 o más goles en cada Mundial (id, anio, jugador, seleccion, goles).
// Todo se guarda en memoria: al recargar la página, el juego vuelve a empezar.

// Cuánta "sabiduría" vale cada pregunta según su dificultad.
const DIFICULTADES = {
  facil: { nombre: "Fácil", valor: 1 },
  media: { nombre: "Media", valor: 2 },
  dificil: { nombre: "Difícil", valor: 3 },
};

// Cuántas preguntas de cada dificultad tiene cada modo de juego, y los límites:
// como mucho tantas preguntas de minutos de goles y tantas sobre Argentina.
const MODOS = {
  corta: { facil: 3, media: 4, dificil: 3, maxMinutos: 1, maxArgentina: 2 }, // 10 preguntas
  larga: { facil: 8, media: 11, dificil: 11, maxMinutos: 2, maxArgentina: 5 }, // 30 preguntas
};

// Resultado final según el porcentaje de sabiduría (de mayor a menor).
const RESULTADOS = [
  { desde: 85, titulo: "Te sentás en la mesa con Macaya", frase: "", emoji: "🎙️" },
  { desde: 65, titulo: "Futbolero", frase: "", emoji: "⚽" },
  { desde: 40, titulo: "Mirás fútbol cada 4 años", frase: "Para no quedarte afuera.", emoji: "📺" },
  { desde: 0, titulo: "Volvé a ver Utilísima", frase: "No sabés un joraca de fútbol.", emoji: "🧶" },
];

let finales = [];
let preguntasFijas = [];
let goleadores = [];
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

// Arma una pregunta con la respuesta correcta y tres opciones incorrectas.
// Las incorrectas llegan ordenadas de la más capciosa a la menos: se usan las tres primeras.
function armarPregunta(dificultad, texto, correcta, incorrectas, dato) {
  const otras = sinRepetir(incorrectas).filter((x) => x !== correcta).slice(0, 3);
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

// Alemania y Alemania Federal cuentan como la misma selección.
const mismaSeleccion = (a, b) => a.replace(" Federal", "") === b.replace(" Federal", "");
// Finales "de la misma época" que la final p (hasta tantos años antes o después).
const deLaEpoca = (p, anios) => finales.filter((x) => x !== p && Math.abs(x.anio - p.anio) <= anios);
const ciudad = (p) => p.sede.split(",")[0];
const pais = (p) => p.sede.split(", ")[1];

// Intermedias: quién ganó, cómo terminó, dónde se jugó.
const tiposMedios = [
  // ¿Quién ganó? Siempre aparece el rival, y el resto son finalistas de esa época.
  (p) => {
    const rival = p.campeon === p.local ? p.visitante : p.local;
    const deEsaEpoca = deLaEpoca(p, 12).flatMap((x) => [x.local, x.visitante]);
    return armarPregunta(
      "media",
      `¿Qué selección ganó la final del Mundial ${p.anio}?`,
      p.campeon,
      [rival, ...mezclar(deEsaEpoca), ...mezclar(todosLosEquipos())],
      resumen(p)
    );
  },

  // ¿Cómo terminó? Cada opción dice cuántos goles hizo cada selección, por ejemplo
  // "Suecia 2 - Brasil 5". Opciones parecidas: el resultado dado vuelta y por un gol de diferencia.
  (p) => {
    const a = p.golesLocal;
    const b = p.golesVisitante;
    const texto = (x, y) => `${p.local} ${x} - ${p.visitante} ${y}`;
    const parecidos = [
      [a + 1, b], [a, b + 1], [a - 1, b], [a, b - 1], [a + 1, b + 1], [a - 1, b - 1],
    ].filter(([x, y]) => x >= 0 && y >= 0);
    const incorrectos = [texto(b, a), ...mezclar(parecidos).map(([x, y]) => texto(x, y))];
    const aclaracion = p.alargue ? " (contando el alargue, sin penales)" : "";
    return armarPregunta(
      "media",
      `¿Cómo terminó la final del Mundial ${p.anio}${aclaracion}?`,
      texto(a, b),
      incorrectos,
      resumen(p)
    );
  },

  // ¿Dónde se jugó? Primero otras ciudades del mismo país, después sedes de esa época.
  (p) =>
    armarPregunta(
      "media",
      `¿En qué ciudad se jugó la final del Mundial ${p.anio}?`,
      ciudad(p),
      [
        ...mezclar(finales.filter((x) => pais(x) === pais(p)).map(ciudad)),
        ...mezclar(deLaEpoca(p, 16).map(ciudad)),
        ...mezclar(finales.map(ciudad)),
      ],
      resumen(p)
    ),
];

// Difíciles: quién hizo el gol y en qué minuto.
const tiposDificiles = [
  // ¿Quién hizo el gol? Las opciones son goleadores de la MISMA selección en otras finales
  // y goleadores del rival en ese mismo partido. Nunca alguien de una selección que no tiene nada que ver.
  (p) => {
    const goles = golesNormales(p);
    if (!goles.length) return null;
    const g = alAzar(goles);
    const goleadores = (filtro) =>
      mezclar(sinRepetir(finales.flatMap((x) => golesNormales(x).filter((y) => filtro(x, y)).map((y) => y.jugador))));
    const deSuSeleccion = goleadores((x, y) => mismaSeleccion(y.equipo, g.equipo));
    const delRival = goleadores((x, y) => x === p && !mismaSeleccion(y.equipo, g.equipo));
    const deLaMismaEpoca = goleadores((x) => Math.abs(x.anio - p.anio) <= 12);
    return armarPregunta(
      "dificil",
      `En la final de ${p.anio} (${p.local} vs ${p.visitante}), ¿quién hizo el gol de ${g.equipo} en el minuto ${g.minuto}?`,
      g.jugador,
      [
        ...deSuSeleccion.filter((j) => j !== g.jugador).slice(0, 2),
        ...delRival.slice(0, 1),
        ...deSuSeleccion,
        ...delRival,
        ...deLaMismaEpoca,
      ],
      resumen(p)
    );
  },

  // ¿En qué minuto? Las opciones son minutos de otros goles de ese partido y minutos cercanos.
  (p) => {
    const unicos = golesNormales(p).filter((g) => p.goles.filter((x) => x.jugador === g.jugador).length === 1);
    if (!unicos.length) return null;
    const g = alAzar(unicos);
    const tope = p.alargue ? 120 : 90;
    const valido = (m, lista) => m >= 1 && m <= tope && m !== g.minuto && !lista.includes(m);
    const incorrectos = [];
    const otrosGoles = mezclar(p.goles.map((x) => x.minuto));
    if (otrosGoles.length && valido(otrosGoles[0], incorrectos)) incorrectos.push(otrosGoles[0]);
    let intentos = 0;
    while (incorrectos.length < 3 && intentos < 200) {
      intentos++;
      // Cerca del minuto real (entre 2 y 9 minutos antes o después), y si no, cualquiera.
      const cerca = g.minuto + (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 8));
      const m = intentos < 100 ? cerca : 1 + Math.floor(Math.random() * tope);
      if (valido(m, incorrectos)) incorrectos.push(m);
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

// ¿Quién fue el goleador de un Mundial? Los datos salen de goleadores.json.
// Las opciones son otros goleadores de ESE Mundial y goleadores del Mundial anterior o el siguiente.
function preguntaGoleadorDelMundial() {
  const anios = sinRepetir(goleadores.map((g) => g.anio)).sort((a, b) => a - b);
  const anio = alAzar(anios);
  const i = anios.indexOf(anio);
  const delMundial = (a) => goleadores.filter((g) => g.anio === a).sort((x, y) => y.goles - x.goles);
  const nombre = (g) => `${g.jugador} (${g.seleccion})`;

  const deEse = delMundial(anio);
  const maximo = deEse[0].goles;
  const empatados = deEse.filter((g) => g.goles === maximo);
  const noEmpatados = (lista) => lista.filter((g) => !empatados.some((e) => e.jugador === g.jugador));
  const correcto = alAzar(empatados);

  // Los que más goles hicieron en ese Mundial, después de los primeros.
  const delMismo = noEmpatados(deEse).slice(0, 4);
  // Los goleadores del Mundial anterior y el siguiente.
  const vecinos = noEmpatados([...delMundial(anios[i - 1]), ...delMundial(anios[i + 1])].slice(0, 99))
    .sort((x, y) => y.goles - x.goles)
    .slice(0, 4);

  const texto =
    empatados.length > 1
      ? `¿Quién fue uno de los goleadores del Mundial ${anio}? (hubo ${empatados.length} empatados con ${maximo} goles)`
      : `¿Quién fue el goleador del Mundial ${anio}?`;
  const segundo = noEmpatados(deEse)[0];
  const dato =
    `${empatados.map((g) => nombre(g)).join(", ")}: ${maximo} goles.` +
    (segundo ? ` Detrás quedó ${nombre(segundo)} con ${segundo.goles}.` : "");

  return armarPregunta(
    "dificil",
    texto,
    nombre(correcto),
    [
      ...mezclar(delMismo).slice(0, 2).map(nombre),
      ...mezclar(vecinos).slice(0, 1).map(nombre),
      ...delMismo.map(nombre),
      ...vecinos.map(nombre),
    ],
    dato
  );
}

// Generadores: cada uno arma una pregunta nueva al azar.
const conTipo = (pregunta, tipo) => pregunta && { ...pregunta, tipo };
const generadoresMedios = tiposMedios.map((tipo) => () => tipo(alAzar(finales)));
const generadoresDificiles = [
  () => conTipo(tiposDificiles[0](alAzar(finales)), "goleador-final"),
  () => conTipo(tiposDificiles[1](alAzar(finales)), "minuto"),
  () => conTipo(preguntaGoleadorDelMundial(), "goleador-mundial"),
];

// Las preguntas sobre Argentina son las que más se saben: hay un límite por partida.
const esDeArgentina = (p) => /Argentin|Messi|Maradona|Boca Juniors|Scaloni/.test(p.pregunta + " " + p.opciones[p.correcta]);

// Elige las preguntas de una partida según el modo, respetando los límites.
function armarPartida(modo) {
  const cuantas = MODOS[modo];
  const partida = [];

  const sePuede = (p) => {
    if (!p || partida.some((x) => x.pregunta === p.pregunta)) return false;
    if (esDeArgentina(p) && partida.filter(esDeArgentina).length >= cuantas.maxArgentina) return false;
    if (p.tipo === "minuto" && partida.filter((x) => x.tipo === "minuto").length >= cuantas.maxMinutos) return false;
    return true;
  };
  // Agrega hasta "cantidad" preguntas sacadas de una lista fija o de generadores al azar.
  const agregarDeLista = (lista, cantidad) => {
    let agregadas = 0;
    for (const p of mezclar(lista)) {
      if (agregadas >= cantidad) break;
      if (sePuede(p)) { partida.push(p); agregadas++; }
    }
    return agregadas;
  };
  const agregarGeneradas = (generadores, cantidad) => {
    let agregadas = 0;
    for (let intentos = 0; agregadas < cantidad && intentos < 1000; intentos++) {
      const p = alAzar(generadores)();
      if (sePuede(p)) { partida.push(p); agregadas++; }
    }
  };
  const fijas = (dificultad) => preguntasFijas.filter((p) => p.dificultad === dificultad);

  // Fáciles: escritas a mano.
  agregarDeLista(fijas("facil"), cuantas.facil);
  // Intermedias: la mitad escritas a mano y el resto armadas con las finales.
  const mediasFijas = agregarDeLista(fijas("media"), Math.floor(cuantas.media / 2));
  agregarGeneradas(generadoresMedios, cuantas.media - mediasFijas);
  // Difíciles: goleadores de las finales, minutos (con límite) y goleadores de cada Mundial.
  agregarGeneradas(generadoresDificiles, cuantas.dificil);

  return mezclar(partida);
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
  fetch("goleadores.json").then((r) => r.json()),
])
  .then(([datosFinales, datosPreguntas, datosGoleadores]) => {
    finales = datosFinales;
    preguntasFijas = datosPreguntas;
    goleadores = datosGoleadores;
    llenarFiltro();
    mostrarFinales();
    el("progreso").textContent = "Elegí cómo querés jugar";
    mostrarPantalla("inicio");
  })
  .catch(() => {
    el("progreso").textContent =
      "No se pudieron cargar los datos. Si abriste el archivo con doble clic, probalo con un servidor local.";
  });
