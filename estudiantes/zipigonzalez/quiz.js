// Las preguntas viven en datos.json (la "base de datos" del proyecto).
// Cada pregunta es un registro con los campos: id, pregunta, opciones, correcta y dato.
// Todo se guarda en memoria: al recargar la página, el juego vuelve a empezar.

let preguntas = [];
let actual = 0;
let puntos = 0;

const el = (id) => document.getElementById(id);

// Mezcla una lista para que el orden cambie en cada partida.
function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function empezar(todas) {
  preguntas = mezclar(todas);
  actual = 0;
  puntos = 0;
  el("final").hidden = true;
  el("juego").hidden = false;
  mostrarPregunta();
}

function mostrarPregunta() {
  const p = preguntas[actual];
  el("progreso").textContent = `Pregunta ${actual + 1} de ${preguntas.length} · Puntos: ${puntos}`;
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

  if (elegida === p.correcta) {
    puntos++;
    el("mensaje").textContent = `✅ ¡Correcto! ${p.dato}`;
  } else {
    botones[elegida].classList.add("incorrecta");
    el("mensaje").textContent = `❌ Era «${p.opciones[p.correcta]}». ${p.dato}`;
  }

  el("progreso").textContent = `Pregunta ${actual + 1} de ${preguntas.length} · Puntos: ${puntos}`;
  const esLaUltima = actual === preguntas.length - 1;
  el("siguiente").textContent = esLaUltima ? "Ver resultado" : "Siguiente";
  el("siguiente").hidden = false;
  el("siguiente").focus();
}

function mostrarFinal() {
  el("juego").hidden = true;
  el("final").hidden = false;
  const total = preguntas.length;
  const porcentaje = Math.round((puntos / total) * 100);
  let frase = "¡A seguir practicando!";
  if (porcentaje === 100) frase = "¡Perfecto! Sos un crack. 🏆";
  else if (porcentaje >= 70) frase = "¡Muy bien jugado! 👏";
  else if (porcentaje >= 40) frase = "Nada mal, ¡vas por buen camino!";
  el("progreso").textContent = "Fin del partido";
  el("resultado").textContent = `Acertaste ${puntos} de ${total} (${porcentaje}%). ${frase}`;
}

el("siguiente").addEventListener("click", () => {
  actual++;
  if (actual < preguntas.length) mostrarPregunta();
  else mostrarFinal();
});

let todas = [];
el("reiniciar").addEventListener("click", () => empezar(todas));

fetch("datos.json")
  .then((respuesta) => respuesta.json())
  .then((datos) => {
    todas = datos;
    empezar(todas);
  })
  .catch(() => {
    el("progreso").textContent =
      "No se pudieron cargar las preguntas. Si abriste el archivo con doble clic, probalo con un servidor local.";
  });
