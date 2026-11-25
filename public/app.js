// Mapa de proyectos. Todo el texto que viene de los proyectos se inserta con textContent (nunca como HTML).
const NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const svg = $("svg");
let data = { proyectos: [], repo: "", ahora: 0 };
let seleccionado = null;
let pingTimers = new Map();

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(tag === "svg" || ["g", "rect", "path", "circle", "text", "polyline"].includes(tag) ? NS : "http://www.w3.org/1999/xhtml", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
};
const html = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === "onclick" ? (e.onclick = v) : e.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
};

function hace(ts) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

// Posición estable: los proyectos van en espiral por orden de llegada, así uno nuevo no mueve a los demás.
function posiciones(ps) {
  const dorado = Math.PI * (3 - Math.sqrt(5));
  return ps.map((p, i) => {
    const r = i === 0 ? 0 : 84 * Math.sqrt(i + 0.35);
    const a = i * dorado - Math.PI / 2;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

function dibujar() {
  const ps = data.proyectos;
  $("vacio").hidden = ps.length > 0;
  svg.replaceChildren();
  if (!ps.length) return;
  const pos = posiciones(ps);
  const lado = (p) => 22 + Math.min(22, Math.log2(p.commits + 1) * 6); // más cambios, más grande
  // Ramas de colaboración: del proyecto de una persona sale una rama hasta quien le propuso una mejora (máx. 3 por proyecto)
  const ramas = new Map();
  for (const c of data.colaboraciones || []) {
    const i = ps.findIndex((p) => p.id === c.a);
    if (i < 0) continue;
    if (!ramas.has(i)) ramas.set(i, []);
    ramas.get(i).push(c);
  }
  for (const lista of ramas.values()) lista.sort((a, b) => (b.estado === "pendiente") - (a.estado === "pendiente") || b.ts - a.ts);
  const ALCANCE = 62;
  let max = 0;
  ps.forEach((p, i) => { max = Math.max(max, Math.hypot(pos[i].x, pos[i].y) + lado(p) + 40 + (ramas.has(i) ? ALCANCE + 30 : 0)); });
  max = Math.max(max, 130);
  svg.setAttribute("viewBox", `${-max} ${-max} ${max * 2} ${max * 2}`);

  for (let r = 150; r < max; r += 150) svg.append(el("circle", { class: "guia", cx: 0, cy: 0, r }));

  const capa = el("g", {});
  svg.append(capa);
  ramas.forEach((lista, i) => {
    const p0 = pos[i], l0 = lado(ps[i]);
    const base = i === 0 ? -Math.PI / 2 : Math.atan2(p0.y, p0.x); // las ramas salen hacia afuera del centro
    const visibles = lista.slice(0, 3);
    visibles.forEach((c, k) => {
      const ang = base + (k - (visibles.length - 1) / 2) * 0.95;
      const d = l0 / 2 + ALCANCE;
      const fin = { x: p0.x + d * Math.cos(ang), y: p0.y + d * Math.sin(ang) };
      const ini = { x: p0.x + (l0 / 2) * Math.cos(ang), y: p0.y + (l0 / 2) * Math.sin(ang) };
      const ctl = { x: (ini.x + fin.x) / 2 + 14 * Math.sin(ang), y: (ini.y + fin.y) / 2 - 14 * Math.cos(ang) };
      const pend = c.estado === "pendiente";
      const tit = pend ? `${c.de} propone una mejora a ${c.a}: ${c.titulo || "pull request"} (espera la aprobación de ${c.a})` : `${c.de} mejoró el proyecto de ${c.a}${c.veces > 1 ? ` (${c.veces} veces)` : ""}`;
      const g = el("g", { class: "brote" + (pend ? " pend" : ""), transform: `translate(${fin.x} ${fin.y})`, role: pend && data.repo ? "link" : "img", "aria-label": tit },
        el("title", {}, tit),
        el("rect", { class: "bcuerpo", x: -6, y: -6, width: 12, height: 12 }),
        el("text", { class: "betq", x: 0, y: 20 }, c.de));
      if (pend && data.repo && c.n) g.addEventListener("click", () => window.open(`${data.repo}/pull/${c.n}`, "_blank", "noopener"));
      capa.append(el("path", { class: "rama" + (pend ? " pend" : ""), d: `M${ini.x} ${ini.y} Q${ctl.x} ${ctl.y} ${fin.x} ${fin.y}` }), g);
    });
    if (lista.length > 3) capa.append(el("text", { class: "betq", x: p0.x + (l0 / 2 + ALCANCE + 30) * Math.cos(base), y: p0.y + (l0 / 2 + ALCANCE + 30) * Math.sin(base) }, `+${lista.length - 3}`));
  });

  ps.forEach((p, i) => {
    const edad = data.ahora - p.actualizado;
    const calor = Math.max(0, 1 - edad / 1800); // 0 a 1 durante la última media hora
    const lat = edad < 1800;
    const l = lado(p);
    const halo = el("rect", { class: "halo", x: -l / 2, y: -l / 2, width: l, height: l });
    halo.style.setProperty("--dur", (3.4 - 2 * calor).toFixed(2) + "s"); // por CSSOM: la política de seguridad no permite style="" en el HTML
    halo.style.setProperty("--fuerza", (0.35 + 0.5 * calor).toFixed(2));
    const g = el("g", {
      class: "nodo" + (lat ? " late" : "") + (edad < 600 ? " caliente" : "") + (seleccionado === p.id ? " sel" : "") + (pingTimers.has(p.id) ? " ping" : ""),
      transform: `translate(${pos[i].x} ${pos[i].y})`, tabindex: 0, role: "button",
      "aria-label": `${p.nombre}: ${p.titulo}, actualizado ${hace(p.actualizado)}`, "data-id": p.id,
    },
      halo,
      el("rect", { class: "halo onda", x: -l / 2, y: -l / 2, width: l, height: l }),
      el("rect", { class: "cuerpo", x: -l / 2, y: -l / 2, width: l, height: l }),
      el("text", { class: "etq", x: 0, y: l / 2 + 15 }, p.nombre)
    );
    g.addEventListener("click", () => seleccionar(p.id));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); seleccionar(p.id); } });
    svg.append(g);
  });
  actividad();
}

function actividad() {
  const lista = $("actividad");
  lista.replaceChildren();
  const recientes = [...data.proyectos].sort((a, b) => b.actualizado - a.actualizado).slice(0, 8);
  if (!recientes.length) lista.append(html("li", { class: "muted" }, "Sin actividad todavía."));
  for (const p of recientes)
    lista.append(html("li", {}, html("button", { type: "button", onclick: () => seleccionar(p.id) },
      html("span", {}, `${p.nombre} · ${p.titulo}`), html("span", { class: "cuando" }, hace(p.actualizado)))));
}

function seleccionar(id) {
  seleccionado = id;
  const p = data.proyectos.find((x) => x.id === id);
  document.querySelectorAll(".nodo").forEach((n) => n.classList.toggle("sel", n.dataset.id === id));
  const d = $("detalle");
  d.replaceChildren();
  if (!p) { d.append(html("p", { class: "muted" }, "Tocá un cuadrado del mapa para ver ese proyecto.")); return; }
  d.append(
    html("h2", {}, p.titulo),
    html("p", { class: "meta" }, `${p.nombre} · actualizado ${hace(p.actualizado)} · ${p.commits} ${p.commits === 1 ? "cambio" : "cambios"}`),
    p.descripcion ? html("p", {}, p.descripcion) : null,
    html("div", { class: "row" },
      html("a", { class: "btn", href: `/p/${p.id}/`, target: "_blank", rel: "noopener" }, "Abrir proyecto"),
      data.repo ? html("a", { class: "btn ghost", href: `${data.repo}/tree/main/estudiantes/${p.id}`, target: "_blank", rel: "noopener" }, "Ver el código") : null),
    html("iframe", { class: "previa", src: `/p/${p.id}/`, sandbox: "allow-scripts", loading: "lazy", title: `Vista previa de ${p.titulo}` })
  );
}

function avisar(texto) {
  const a = $("aviso");
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (a.hidden = true), 6000);
}

async function cargar() {
  const r = await fetch("/api/proyectos", { cache: "no-store" });
  data = await r.json();
  if (data.repo) { const a = $("repo"); a.href = data.repo; a.hidden = false; }
  dibujar();
  if (seleccionado) { const iframeActual = document.querySelector(".previa"); if (!iframeActual) seleccionar(seleccionado); }
}

function ping(id) {
  const nodo = svg.querySelector(`.nodo[data-id="${CSS.escape(id)}"]`);
  if (!nodo) return;
  nodo.classList.remove("ping");
  void nodo.getBoundingClientRect(); // reinicia la animación
  nodo.classList.add("ping");
  clearTimeout(pingTimers.get(id));
  pingTimers.set(id, setTimeout(() => { pingTimers.delete(id); svg.querySelector(`.nodo[data-id="${CSS.escape(id)}"]`)?.classList.remove("ping"); }, 7000));
}

function conectar() {
  const vivo = $("vivo");
  const es = new EventSource("/api/eventos");
  es.onopen = () => { vivo.textContent = "En vivo"; vivo.classList.remove("off"); cargar(); };
  es.onerror = () => { vivo.textContent = "Reconectando…"; vivo.classList.add("off"); };
  es.addEventListener("ramas", () => cargar().catch(() => {}));
  es.addEventListener("cambio", async (ev) => {
    const c = JSON.parse(ev.data);
    const sel = seleccionado, previa = document.querySelector(".previa");
    await cargar();
    ping(c.id);
    avisar(c.nuevo ? `${c.nombre} sumó su proyecto: ${c.titulo}` : `${c.nombre} actualizó su proyecto: ${c.titulo}`);
    if (sel === c.id && previa) previa.src = previa.src; // si lo estás mirando, se recarga
  });
}

cargar().catch(() => {});
conectar();
setInterval(() => cargar().catch(() => {}), 60000); // por si el aviso en vivo se pierde
setInterval(dibujar, 30000); // actualiza "hace X min" y se va apagando el latido
