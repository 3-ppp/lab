// SIMULACRO DEL CURSO: esto NO es un hackeo de verdad.
// Tapa la página con una pantalla falsa de "hackeado". No roba, no borra y no envía nada.
// Si estás leyendo esto antes de aprobar: bien ahí. No comentes /aprobar.
(function () {
  var css =
    "#simulacro{position:fixed;inset:0;z-index:2147483647;background:#0b0b0b;color:#39ff6a;font:16px/1.5 Consolas,monospace;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;text-align:center;box-sizing:border-box}" +
    "#simulacro div{max-width:560px;margin:auto}" +
    "#simulacro h1{color:#ff3b3b;font:bold 34px/1.2 Consolas,monospace;margin:12px 0}" +
    "#simulacro p{color:inherit;font:inherit;margin:10px 0}" +
    "#simulacro .barra{height:14px;border:1px solid #39ff6a;margin:18px 0 6px}" +
    "#simulacro .barra i{display:block;height:100%;width:0;background:#39ff6a}" +
    "#simulacro button{font:inherit;color:#0b0b0b;background:#39ff6a;border:0;padding:10px 18px;margin:14px 6px 0;cursor:pointer}";

  function crear(tag, texto) {
    var e = document.createElement(tag);
    if (texto) e.textContent = texto;
    return e;
  }

  function mostrar() {
    var estilo = crear("style", css);
    var fondo = crear("section");
    fondo.id = "simulacro";
    var caja = crear("div");

    var barra = crear("p");
    barra.className = "barra";
    var relleno = crear("i");
    barra.append(relleno);
    var estado = crear("p", "Tomando control del proyecto… 0%");
    var que = crear("button", "¿Qué pasó?");
    caja.append(crear("p", "☠"), crear("h1", "HAS SIDO HACKEADO"), crear("p", "Tu proyecto ahora es nuestro."), barra, estado, que);
    fondo.append(caja);
    document.head.append(estilo);
    document.body.append(fondo);

    var n = 0;
    var reloj = setInterval(function () {
      n = Math.min(100, n + 3);
      relleno.style.width = n + "%";
      estado.textContent = n < 100 ? "Tomando control del proyecto… " + n + "%" : "Control total obtenido.";
      if (n === 100) clearInterval(reloj);
    }, 150);

    que.onclick = function () {
      clearInterval(reloj);
      var ver = crear("button", "Ver el proyecto");
      ver.onclick = function () { fondo.remove(); estilo.remove(); };
      caja.replaceChildren(
        crear("h1", "Tranqui: es un simulacro"),
        crear("p", "No se robó ni se borró nada. Esta pantalla está acá porque se aprobó un pull request que la agregaba."),
        crear("p", "Antes de aprobar, mirá siempre la pestaña Files changed. Si hay algo que no entendés, preguntá o pedile a tu agente que te lo explique."),
        crear("p", "Para volver atrás, decile a tu agente: «Sacá de mi carpeta el archivo ajuste.js y la línea de index.html que lo carga, y abrí un pull request». El robot lo incorpora solo."),
        ver
      );
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mostrar);
  else mostrar();
})();
