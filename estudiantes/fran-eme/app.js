const ANIOS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  ciudades: [],
  mapa: null,
  metrica: "desocupacion",
  seleccionadaId: null,
  ramaActiva: null,
  mostrarTodasRamas: false,
  busqueda: "",
  region: "todas",
  orden: "metric_desc",
  view: { scale: 1, x: 0, y: 0 },
  drag: null,
};

const fmt = (n, dec = 1) =>
  n == null ? "s/d" : n.toFixed(dec).replace(".", ",");

const el = (tag, attrs = {}, text = "") => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
};

function proyectar(lon, lat) {
  const { cosLat, lonMin, latMax, scale } = state.mapa;
  return {
    x: (lon - lonMin) * cosLat * scale,
    y: (latMax - lat) * scale,
  };
}

function radioCirculo(valor, maxVal) {
  const minR = 4.2;
  const maxR = 20.5;
  const ratio = Math.max(0, valor) / Math.max(maxVal, 1);
  return minR + Math.sqrt(ratio) * (maxR - minR);
}

function valorMetrica(ciudad) {
  return state.metrica === "desocupacion"
    ? ciudad.tasa_desocupacion
    : ciudad.tasa_subocupacion;
}

function renderResumenNacional() {
  const cont = document.getElementById("resumen-nacional");
  const totalPob = state.ciudades.reduce((s, c) => s + (c.poblacion_miles || 0), 0);
  const promDes =
    state.ciudades.reduce((s, c) => s + c.tasa_desocupacion, 0) /
    state.ciudades.length;
  const promSub =
    state.ciudades.reduce((s, c) => s + c.tasa_subocupacion, 0) /
    state.ciudades.length;

  cont.innerHTML = `
    <div class="summary-pill"><span>Áreas urbanas EPH</span><strong>${state.ciudades.length} aglomerados</strong></div>
    <div class="summary-pill"><span>Desocupación nac. (INDEC 2T 2026)</span><strong>7,9%</strong></div>
    <div class="summary-pill"><span>Subocupación nac. (INDEC 2T 2026)</span><strong>11,5%</strong></div>
    <div class="summary-pill"><span>Población cubierta</span><strong>${Math.round(totalPob / 1000).toLocaleString("es-AR")} M hab.</strong></div>
  `;
  cont.dataset.prom = `${fmt(promDes)} / ${fmt(promSub)}`;
}

function renderMapaBase() {
  const svg = document.getElementById("mapa-svg");
  svg.setAttribute("viewBox", `0 0 ${state.mapa.width} ${state.mapa.height}`);
  const capaProv = document.getElementById("capa-provincias");
  capaProv.replaceChildren();
  for (const p of state.mapa.provincias) {
    capaProv.append(el("path", { d: p.d, class: "provincia", "data-prov": p.nombre }));
  }
}

function aplicarTransform() {
  const vp = document.getElementById("viewport");
  vp.setAttribute(
    "transform",
    `translate(${state.view.x.toFixed(1)}, ${state.view.y.toFixed(1)}) scale(${state.view.scale.toFixed(3)})`
  );
  // Escalar radios inversamente al zoom para no tapar ciudades cercanas al hacer zoom
  const factor = 1 / Math.pow(state.view.scale, 0.55);
  for (const c of document.querySelectorAll(".city-circle")) {
    const baseR = Number(c.dataset.baseR || 6);
    c.setAttribute("r", (baseR * factor).toFixed(2));
  }
  for (const lbl of document.querySelectorAll(".city-label")) {
    lbl.setAttribute("font-size", (8.5 * factor).toFixed(2));
  }
}

function zoomA(preset) {
  const w = state.mapa.width;
  const h = state.mapa.height;
  if (preset === "reset") {
    state.view = { scale: 1, x: 0, y: 0 };
  } else if (preset === "amba") {
    const p = proyectar(-58.35, -34.7);
    const s = 5.4;
    state.view = { scale: s, x: w / 2 - p.x * s, y: h / 2 - p.y * s };
  } else if (preset === "litoral") {
    const p = proyectar(-60.3, -30.2);
    const s = 3.2;
    state.view = { scale: s, x: w / 2 - p.x * s, y: h / 2 - p.y * s };
  }
  aplicarTransform();
}

function renderCirculos() {
  const capa = document.getElementById("capa-ciudades");
  const etiquetas = document.getElementById("capa-etiquetas");
  capa.replaceChildren();
  etiquetas.replaceChildren();

  const maxVal = Math.max(...state.ciudades.map(valorMetrica));
  const ordenadas = [...state.ciudades].sort((a, b) => valorMetrica(b) - valorMetrica(a));
  const top3Ids = new Set(ordenadas.slice(0, 3).map((c) => c.id));

  for (const c of ordenadas) {
    const pt = proyectar(c.lon, c.lat);
    const val = valorMetrica(c);
    const r = radioCirculo(val, maxVal);
    const isSel = c.id === state.seleccionadaId;

    const circle = el("circle", {
      cx: pt.x.toFixed(1),
      cy: pt.y.toFixed(1),
      r: r.toFixed(2),
      class: `city-circle metric-${state.metrica}${isSel ? " selected" : ""}`,
      "data-id": c.id,
      tabindex: "0",
      role: "button",
      "aria-label": `${c.nombre}: ${fmt(val)}%`,
    });
    circle.dataset.baseR = r.toFixed(2);

    circle.addEventListener("mouseenter", (e) => mostrarTooltip(e, c));
    circle.addEventListener("mousemove", (e) => moverTooltip(e));
    circle.addEventListener("mouseleave", ocultarTooltip);
    circle.addEventListener("click", () => seleccionarCiudad(c.id));
    circle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        seleccionarCiudad(c.id);
      }
    });

    capa.append(circle);

    if (isSel || top3Ids.has(c.id)) {
      const lbl = el(
        "text",
        {
          x: (pt.x + 4).toFixed(1),
          y: (pt.y - 4).toFixed(1),
          class: "city-label",
        },
        `${c.nombre.split(" - ")[0]} (${fmt(val)}%)`
      );
      etiquetas.append(lbl);
    }
  }

  renderLeyenda(maxVal);
  aplicarTransform();
}

function renderLeyenda(maxVal) {
  const leg = document.getElementById("leyenda");
  const titulo =
    state.metrica === "desocupacion"
      ? "Tasa de desocupación (2T 2026)"
      : "Tasa de subocupación (2T 2026)";
  const color =
    state.metrica === "desocupacion"
      ? "rgba(217, 72, 59, 0.56)"
      : "rgba(15, 118, 110, 0.54)";
  const border = state.metrica === "desocupacion" ? "#991b1b" : "#115e59";

  const refs = [
    Math.max(2, Math.round(maxVal * 0.25)),
    Math.round(maxVal * 0.6),
    Math.round(maxVal),
  ];

  leg.innerHTML = `
    <div class="legend-title">${titulo}</div>
    <div class="legend-circles">
      ${refs
        .map((v) => {
          const px = Math.round(radioCirculo(v, maxVal) * 1.45);
          return `<div class="legend-item">
            <span class="legend-dot" style="width:${px}px;height:${px}px;background:${color};border:1.5px solid ${border}"></span>
            <span>${v}%</span>
          </div>`;
        })
        .join("")}
    </div>
  `;
}

function mostrarTooltip(e, c) {
  const tip = document.getElementById("map-tooltip");
  const topRama = c.ramas[0];
  tip.innerHTML = `
    <strong>${c.nombre}</strong> <span style="opacity:.75">(${c.provincia})</span><br>
    Desocupación: <strong>${fmt(c.tasa_desocupacion)}%</strong> · Subocupación: <strong>${fmt(c.tasa_subocupacion)}%</strong><br>
    Actividad principal: ${topRama.nombre} (${fmt(topRama.actual)}%)
  `;
  tip.hidden = false;
  moverTooltip(e);
}

function moverTooltip(e) {
  const stage = document.getElementById("map-stage").getBoundingClientRect();
  const tip = document.getElementById("map-tooltip");
  const left = Math.min(stage.width - 245, Math.max(8, e.clientX - stage.left + 12));
  const top = Math.max(8, e.clientY - stage.top - 14);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function ocultarTooltip() {
  document.getElementById("map-tooltip").hidden = true;
}

function renderListaCiudades() {
  const cont = document.getElementById("lista-ciudades");
  const q = state.busqueda.trim().toLowerCase();

  const filtradas = state.ciudades.filter((c) => {
    if (state.region !== "todas" && c.region !== state.region) return false;
    if (!q) return true;
    return `${c.nombre} ${c.provincia} ${c.region}`.toLowerCase().includes(q);
  });

  filtradas.sort((a, b) => {
    if (state.orden === "nombre") return a.nombre.localeCompare(b.nombre, "es");
    if (state.orden === "metric_asc") return valorMetrica(a) - valorMetrica(b);
    return valorMetrica(b) - valorMetrica(a);
  });

  cont.replaceChildren();
  if (!filtradas.length) {
    cont.innerHTML = `<p style="font-size:.82rem;color:#55657d;margin:.4rem 0">No hay ciudades que coincidan con el filtro.</p>`;
    return;
  }

  for (const c of filtradas) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `city-btn${c.id === state.seleccionadaId ? " selected" : ""}`;
    const val = valorMetrica(c);
    const cls = state.metrica === "desocupacion" ? "des" : "sub";
    btn.innerHTML = `<span>${c.nombre}</span><span class="rate ${cls}">${fmt(val)}%</span>`;
    btn.addEventListener("click", () => seleccionarCiudad(c.id));
    cont.append(btn);
  }
}

function renderGraficoTasas(ciudad) {
  const svg = document.getElementById("chart-tasas");
  svg.replaceChildren();

  const W = 540, H = 190;
  const pad = { top: 18, right: 20, bottom: 28, left: 36 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const valsDes = ANIOS.map((y) => ciudad.serie_tasas[y].desocupacion);
  const valsSub = ANIOS.map((y) => ciudad.serie_tasas[y].subocupacion);
  const maxY = Math.max(15, Math.ceil(Math.max(...valsDes, ...valsSub) / 5) * 5);

  const xAt = (i) => pad.left + (i / (ANIOS.length - 1)) * iw;
  const yAt = (v) => pad.top + ih - (v / maxY) * ih;

  // Grilla horizontal
  for (let t = 0; t <= maxY; t += 5) {
    const y = yAt(t);
    svg.append(el("line", { x1: pad.left, y1: y, x2: W - pad.right, y2: y, stroke: "#e5ebf3", "stroke-width": 1 }));
    svg.append(el("text", { x: pad.left - 6, y: y + 3, "text-anchor": "end", "font-size": 10, fill: "#64748b" }, `${t}%`));
  }

  // Eje X
  ANIOS.forEach((yr, i) => {
    svg.append(el("text", { x: xAt(i), y: H - 8, "text-anchor": "middle", "font-size": 10, fill: "#475569" }, yr));
  });

  const pathFor = (arr) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");

  svg.append(el("path", { d: pathFor(valsSub), fill: "none", stroke: "#0f766e", "stroke-width": 2.4 }));
  svg.append(el("path", { d: pathFor(valsDes), fill: "none", stroke: "#d9483b", "stroke-width": 2.4 }));

  ANIOS.forEach((yr, i) => {
    const vd = valsDes[i];
    const vs = valsSub[i];
    const cd = el("circle", { cx: xAt(i), cy: yAt(vd), r: 3.5, fill: "#d9483b", stroke: "#fff", "stroke-width": 1.2 });
    const cs = el("circle", { cx: xAt(i), cy: yAt(vs), r: 3.5, fill: "#0f766e", stroke: "#fff", "stroke-width": 1.2 });
    cd.append(el("title", {}, `${yr} (2T) — Desocupación: ${fmt(vd)}%`));
    cs.append(el("title", {}, `${yr} (2T) — Subocupación: ${fmt(vs)}%`));
    svg.append(cs, cd);

    if (i === 0 || i === ANIOS.length - 1 || vd === Math.max(...valsDes)) {
      svg.append(el("text", { x: xAt(i), y: yAt(vd) - 7, "text-anchor": "middle", "font-size": 9.5, "font-weight": 700, fill: "#991b1b" }, `${fmt(vd)}%`));
    }
    if (i === 0 || i === ANIOS.length - 1) {
      svg.append(el("text", { x: xAt(i), y: yAt(vs) + 12, "text-anchor": "middle", "font-size": 9.5, "font-weight": 700, fill: "#115e59" }, `${fmt(vs)}%`));
    }
  });
}

function crearSparkline(evolucion) {
  const W = 150, H = 26, p = 3;
  const vals = ANIOS.map((y) => evolucion[y] ?? 0);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = Math.max(maxV - minV, 1);

  const pts = vals.map((v, i) => {
    const x = p + (i / (vals.length - 1)) * (W - p * 2);
    const y = H - p - ((v - minV) / span) * (H - p * 2);
    return [x, y];
  });

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "sparkline", "aria-hidden": "true" });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  svg.append(el("path", { d, fill: "none", stroke: "#2563eb", "stroke-width": 1.7 }));
  svg.append(el("circle", { cx: pts[0][0], cy: pts[0][1], r: 2.1, fill: "#94a3b8" }));
  svg.append(el("circle", { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2.5, fill: "#1d4ed8" }));
  return svg;
}

function renderSpotlightRama(rama) {
  const box = document.getElementById("rama-destacada");
  if (!rama) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const signo = rama.delta_19_26 > 0 ? "+" : "";
  box.innerHTML = `
    <div class="spotlight-head">
      <strong>${rama.nombre} (serie 2019–2026)</strong>
      <span>Variación 2019→2026: <strong>${signo}${fmt(rama.delta_19_26)} p.p.</strong></span>
    </div>
    <div class="years-strip">
      ${ANIOS.map((yr) => `<div class="yr-cell"><span>${yr}</span><strong>${fmt(rama.evolucion[yr])}%</strong></div>`).join("")}
    </div>
  `;
}

function renderRamas(ciudad) {
  const ul = document.getElementById("lista-ramas");
  const btnToggle = document.getElementById("toggle-todas-ramas");
  const ramasValidas = ciudad.ramas.filter((r) => r.nombre !== "No bien especificadas");
  const limite = state.mostrarTodasRamas ? ramasValidas.length : 7;
  const visibles = ramasValidas.slice(0, limite);
  const maxShare = Math.max(...ramasValidas.map((r) => r.actual), 1);

  btnToggle.textContent = state.mostrarTodasRamas
    ? "Ver principales (top 7)"
    : `Ver todas (${ramasValidas.length})`;

  if (!state.ramaActiva || !ramasValidas.some((r) => r.nombre === state.ramaActiva)) {
    state.ramaActiva = visibles[0]?.nombre || null;
  }

  ul.replaceChildren();
  visibles.forEach((rama, idx) => {
    const li = document.createElement("li");
    li.className = `rama-item${rama.nombre === state.ramaActiva ? " active" : ""}`;
    const d = rama.delta_19_26;
    const dCls = d > 0.2 ? "up" : d < -0.2 ? "down" : "flat";
    const dText = `${d > 0 ? "+" : ""}${fmt(d)} p.p.`;

    li.innerHTML = `
      <div class="rama-top">
        <span class="rama-name">${idx + 1}. ${rama.nombre}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${((rama.actual / maxShare) * 100).toFixed(1)}%"></div></div>
        <span class="rama-pct">${fmt(rama.actual)}%</span>
        <span class="delta ${dCls}" title="Cambio 2019 → 2026">${dText}</span>
      </div>
      <div class="rama-spark-row">
        <span>2019: ${fmt(rama.evolucion["2019"])}% → 2026: ${fmt(rama.actual)}%</span>
      </div>
    `;
    li.querySelector(".rama-spark-row").append(crearSparkline(rama.evolucion));
    li.addEventListener("click", () => {
      state.ramaActiva = rama.nombre;
      renderRamas(ciudad);
    });
    ul.append(li);
  });

  const activa = ramasValidas.find((r) => r.nombre === state.ramaActiva);
  renderSpotlightRama(activa);
}

function renderDetalle() {
  const ciudad = state.ciudades.find((c) => c.id === state.seleccionadaId);
  if (!ciudad) return;

  document.getElementById("estado-carga").hidden = true;
  document.getElementById("detalle-contenido").hidden = false;

  document.getElementById("det-region").textContent = `Región ${ciudad.region}`;
  document.getElementById("det-nombre").textContent = ciudad.nombre;
  document.getElementById("det-subtitulo").textContent = `${ciudad.provincia} · Aglomerado INDEC #${ciudad.codigo} (${ciudad.nombre_indec})`;
  document.getElementById("det-poblacion").innerHTML = `
    <strong>${ciudad.poblacion_miles.toLocaleString("es-AR")} mil hab.</strong>
    <span>PEA: ${ciudad.pea_miles.toLocaleString("es-AR")} mil</span>
  `;

  document.getElementById("det-kpis").innerHTML = `
    <div class="kpi is-des">
      <div class="kpi-label">Desocupación</div>
      <div class="kpi-val">${fmt(ciudad.tasa_desocupacion)}%</div>
      <div class="kpi-sub">2019: ${fmt(ciudad.serie_tasas["2019"].desocupacion)}%</div>
    </div>
    <div class="kpi is-sub">
      <div class="kpi-label">Subocupación</div>
      <div class="kpi-val">${fmt(ciudad.tasa_subocupacion)}%</div>
      <div class="kpi-sub">Dem. ${fmt(ciudad.subocupacion_demandante)}% · No dem. ${fmt(ciudad.subocupacion_no_demandante)}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Tasa de Empleo</div>
      <div class="kpi-val">${fmt(ciudad.tasa_empleo)}%</div>
      <div class="kpi-sub">Sobre población total</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Tasa de Actividad</div>
      <div class="kpi-val">${fmt(ciudad.tasa_actividad)}%</div>
      <div class="kpi-sub">Ocup. demand.: ${fmt(ciudad.ocupados_demandantes)}%</div>
    </div>
  `;

  renderGraficoTasas(ciudad);
  renderRamas(ciudad);
}

function seleccionarCiudad(id) {
  state.seleccionadaId = id;
  renderCirculos();
  renderListaCiudades();
  renderDetalle();
}

function actualizarDescripcionMetrica() {
  const p = document.getElementById("metric-desc");
  p.textContent =
    state.metrica === "desocupacion"
      ? "Círculos proporcionales a la tasa de desocupación abierta (personas sin ocupación que buscan trabajo activamente) · 2° trimestre de 2026."
      : "Círculos proporcionales a la tasa de subocupación horaria (ocupados que trabajan menos de 35 hs semanales involuntariamente y desean trabajar más) · 2° trimestre de 2026.";
}

function conectarEventos() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.metrica = btn.dataset.metric;
      document.querySelectorAll(".tab").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      actualizarDescripcionMetrica();
      renderCirculos();
      renderListaCiudades();
    });
  });

  document.querySelectorAll("[data-zoom]").forEach((b) => {
    b.addEventListener("click", () => zoomA(b.dataset.zoom));
  });

  const zoomStep = (factor) => {
    const next = Math.min(8, Math.max(1, state.view.scale * factor));
    const cx = state.mapa.width / 2;
    const cy = state.mapa.height / 2;
    const k = next / state.view.scale;
    state.view = {
      scale: next,
      x: next === 1 ? 0 : cx - (cx - state.view.x) * k,
      y: next === 1 ? 0 : cy - (cy - state.view.y) * k,
    };
    aplicarTransform();
  };

  document.getElementById("zoom-in").addEventListener("click", () => zoomStep(1.4));
  document.getElementById("zoom-out").addEventListener("click", () => zoomStep(1 / 1.4));

  const svg = document.getElementById("mapa-svg");
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * state.mapa.width;
    const my = ((e.clientY - rect.top) / rect.height) * state.mapa.height;
    const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
    const next = Math.min(8, Math.max(1, state.view.scale * factor));
    const k = next / state.view.scale;
    state.view = {
      scale: next,
      x: next === 1 ? 0 : mx - (mx - state.view.x) * k,
      y: next === 1 ? 0 : my - (my - state.view.y) * k,
    };
    aplicarTransform();
  }, { passive: false });

  svg.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("city-circle")) return;
    state.drag = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!state.drag) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - state.drag.x) / rect.width) * state.mapa.width;
    const dy = ((e.clientY - state.drag.y) / rect.height) * state.mapa.height;
    state.view.x = state.drag.vx + dx;
    state.view.y = state.drag.vy + dy;
    aplicarTransform();
  });
  svg.addEventListener("pointerup", () => { state.drag = null; });

  document.getElementById("buscar-ciudad").addEventListener("input", (e) => {
    state.busqueda = e.target.value;
    renderListaCiudades();
  });
  document.getElementById("filtro-region").addEventListener("change", (e) => {
    state.region = e.target.value;
    renderListaCiudades();
  });
  document.getElementById("ordenar-por").addEventListener("change", (e) => {
    state.orden = e.target.value;
    renderListaCiudades();
  });
  document.getElementById("toggle-todas-ramas").addEventListener("click", () => {
    state.mostrarTodasRamas = !state.mostrarTodasRamas;
    renderDetalle();
  });
}

async function iniciar() {
  try {
    const [ciudades, mapa] = await Promise.all([
      fetch("datos.json").then((r) => r.json()),
      fetch("mapa.json").then((r) => r.json()),
    ]);
    state.ciudades = ciudades;
    state.mapa = mapa;

    renderResumenNacional();
    renderMapaBase();
    actualizarDescripcionMetrica();
    conectarEventos();

    // Seleccionar inicialmente el aglomerado con mayor desocupación (Gran Rosario)
    const inicial = [...ciudades].sort((a, b) => b.tasa_desocupacion - a.tasa_desocupacion)[0];
    seleccionarCiudad(inicial.id);
  } catch (err) {
    document.getElementById("estado-carga").textContent =
      "No se pudieron cargar datos.json o mapa.json. Abrí la página desde el lab o con un servidor local (por ejemplo: python -m http.server).";
  }
}

iniciar();
