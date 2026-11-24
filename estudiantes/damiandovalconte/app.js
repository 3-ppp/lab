/* Batallas de Argentina (1806-2001) - Lógica del mapa interactivo y mapa de calor */

const PERIODOS = [
  { id: "invasiones", nombre: "Invasiones Inglesas", color: "#38bdf8" },
  { id: "independencia", nombre: "Independencia", color: "#22c55e" },
  { id: "civiles", nombre: "Unitarios y Federales", color: "#f97316" },
  { id: "consolidacion", nombre: "Consolidación y Territorio", color: "#eab308" },
  { id: "estado_pueblo", nombre: "Estado y Pueblo", color: "#ef4444" },
  { id: "guerrilla_militares", nombre: "Guerrilla y Militares", color: "#a855f7" },
  { id: "malvinas", nombre: "Guerra de Malvinas", color: "#14b8a6" }
];

const PERIODO_MAP = new Map(PERIODOS.map((p) => [p.id, p]));

const ZONAS_ZOOM = {
  argentina: { center: [-38.5, -63.5], zoom: 4 },
  amba: { center: [-34.63, -58.44], zoom: 11 },
  litoral: { center: [-32.2, -60.8], zoom: 7 },
  norte: { center: [-26.1, -63.5], zoom: 6 },
  malvinas: { center: [-51.72, -58.55], zoom: 8 }
};

// Estado de la aplicación (en memoria, compatible con el sandbox del lab)
let batallas = [];
let filtradas = [];
let periodoActivo = "todos";
let seleccionadaId = null;
let heatVisible = true;
let markersVisible = true;
let heatMode = "cantidad"; // "cantidad" | "bajas"
let map, heatLayer, markerGroup, activeBaseLayer, fallbackLayer;
let tileErrors = 0;

const baseLayers = {};
const markerById = new Map();

// ---------- Capa personalizada de Mapa de Calor (Canvas sobre Leaflet) ----------
const CanvasHeatLayer = L.Layer.extend({
  initialize: function (points) {
    this._points = points || [];
    this._palette = this._buildPalette();
  },

  setPoints: function (points) {
    this._points = points || [];
    if (this._map) this._redraw();
  },

  onAdd: function (mapInstance) {
    this._map = mapInstance;
    const canvas = L.DomUtil.create("canvas", "leaflet-heat-canvas leaflet-zoom-animated");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "350";
    this._canvas = canvas;
    mapInstance.getPanes().overlayPane.appendChild(canvas);

    mapInstance.on("moveend zoomend resize viewreset", this._redraw, this);
    this._redraw();
  },

  onRemove: function (mapInstance) {
    mapInstance.off("moveend zoomend resize viewreset", this._redraw, this);
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._map = null;
  },

  _buildPalette: function () {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 1;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0.0, "rgba(29, 78, 216, 0)");
    g.addColorStop(0.18, "rgba(29, 78, 216, 0.55)");
    g.addColorStop(0.38, "rgba(6, 182, 212, 0.72)");
    g.addColorStop(0.58, "rgba(34, 197, 94, 0.80)");
    g.addColorStop(0.75, "rgba(250, 204, 21, 0.88)");
    g.addColorStop(0.89, "rgba(249, 115, 22, 0.94)");
    g.addColorStop(1.0, "rgba(239, 68, 68, 0.98)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 1);
    return ctx.getImageData(0, 0, 256, 1).data;
  },

  _redraw: function () {
    if (!this._map || !this._canvas) return;
    const size = this._map.getSize();
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.width = size.x;
    this._canvas.height = size.y;

    const ctx = this._canvas.getContext("2d");
    ctx.clearRect(0, 0, size.x, size.y);
    if (!this._points.length || size.x === 0 || size.y === 0) return;

    const zoom = this._map.getZoom();
    // Radio adaptable al zoom para que se vea claro tanto a escala país como ciudad
    const radius = Math.max(24, Math.min(68, 22 + zoom * 3.8));

    // Pasada 1: acumular densidad en escala de opacidad
    const off = document.createElement("canvas");
    off.width = size.x;
    off.height = size.y;
    const octx = off.getContext("2d");

    // Calcular peso máximo para normalizar
    let maxWeight = 1;
    for (const p of this._points) {
      if (p.weight > maxWeight) maxWeight = p.weight;
    }

    for (const p of this._points) {
      const pt = this._map.latLngToContainerPoint([p.lat, p.lng]);
      if (pt.x < -radius || pt.y < -radius || pt.x > size.x + radius || pt.y > size.y + radius) continue;

      const alpha = Math.max(0.18, Math.min(0.65, (p.weight / maxWeight) * 0.42 + 0.14));
      const grad = octx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
      grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
      grad.addColorStop(0.55, `rgba(0, 0, 0, ${alpha * 0.42})`);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      octx.fillStyle = grad;
      octx.beginPath();
      octx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      octx.fill();
    }

    // Pasada 2: colorear según la densidad acumulada
    const img = octx.getImageData(0, 0, size.x, size.y);
    const data = img.data;

    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > maxAlpha) maxAlpha = data[i];
    }
    if (maxAlpha === 0) return;

    const norm = 255 / Math.max(maxAlpha, 95);
    const pal = this._palette;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;
      const idx = Math.min(255, Math.floor(a * norm)) * 4;
      data[i] = pal[idx];
      data[i + 1] = pal[idx + 1];
      data[i + 2] = pal[idx + 2];
      data[i + 3] = Math.min(225, pal[idx + 3]);
    }

    ctx.putImageData(img, 0, 0);
  }
});

// ---------- Inicialización del mapa ----------
function initMap() {
  map = L.map("map", {
    center: ZONAS_ZOOM.argentina.center,
    zoom: ZONAS_ZOOM.argentina.zoom,
    minZoom: 3,
    maxZoom: 17,
    zoomControl: true
  });

  baseLayers.argenmap = L.tileLayer(
    "https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{y}.png",
    {
      tms: true,
      maxZoom: 18,
      attribution: "&copy; Instituto Geográfico Nacional (Argenmap) &amp; OpenStreetMap"
    }
  );

  baseLayers.streets = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 18,
      attribution: "Tiles &copy; Esri &mdash; OpenStreetMap contributors"
    }
  );

  const darkBase = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 16,
      attribution: "Tiles &copy; Esri"
    }
  );
  const darkRef = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 16,
      pane: "overlayPane"
    }
  );
  baseLayers.dark = L.layerGroup([darkBase, darkRef]);

  // Escuchar fallos de mosaicos por si el usuario está sin conexión
  [baseLayers.argenmap, baseLayers.streets, darkBase].forEach((layer) => {
    layer.on("tileerror", () => {
      tileErrors++;
      if (tileErrors >= 8 && !fallbackLayer) {
        activarMapaRespaldo();
      }
    });
  });

  activeBaseLayer = baseLayers.argenmap.addTo(map);
  heatLayer = new CanvasHeatLayer([]).addTo(map);
  markerGroup = L.layerGroup().addTo(map);
}

// Silueta geográfica de respaldo si no hay conexión a internet para mosaicos
function activarMapaRespaldo() {
  const contornoArgentina = [
    [-21.8, -66.2], [-22.1, -62.7], [-25.3, -57.6], [-25.6, -54.5], [-27.5, -55.9],
    [-30.2, -57.6], [-33.0, -58.2], [-34.6, -58.3], [-36.3, -56.7], [-38.1, -57.5],
    [-39.0, -62.0], [-41.0, -63.0], [-42.8, -64.9], [-45.9, -67.5], [-47.8, -65.9],
    [-51.6, -69.1], [-54.8, -68.3], [-54.9, -65.2], [-52.4, -68.4], [-51.8, -72.2],
    [-46.5, -71.8], [-41.1, -71.6], [-36.5, -71.0], [-32.9, -70.0], [-27.8, -69.0],
    [-23.0, -67.0], [-21.8, -66.2]
  ];
  const malvinas = [
    [-51.3, -60.8], [-51.3, -57.7], [-52.3, -57.7], [-52.3, -60.8]
  ];
  fallbackLayer = L.layerGroup([
    L.polygon(contornoArgentina, { color: "#38bdf8", weight: 2, fillColor: "#162640", fillOpacity: 0.65 }),
    L.polygon(malvinas, { color: "#14b8a6", weight: 2, fillColor: "#162640", fillOpacity: 0.7 })
  ]).addTo(map);
  document.getElementById("tile-fallback-banner").hidden = false;
}

// ---------- Filtros y renderizado ----------
function construirChipsPeriodos() {
  const cont = document.getElementById("periodos");
  cont.replaceChildren();

  const btnTodos = document.createElement("button");
  btnTodos.type = "button";
  btnTodos.className = "chip" + (periodoActivo === "todos" ? " active" : "");
  btnTodos.dataset.periodo = "todos";
  const lblTodos = document.createElement("span");
  lblTodos.textContent = "Todos";
  const cntTodos = document.createElement("span");
  cntTodos.className = "chip-count";
  cntTodos.textContent = `(${batallas.length})`;
  btnTodos.append(lblTodos, cntTodos);
  btnTodos.onclick = () => {
    periodoActivo = "todos";
    actualizarTodo();
  };
  cont.append(btnTodos);

  for (const p of PERIODOS) {
    const count = batallas.filter((b) => b.periodoId === p.id).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (periodoActivo === p.id ? " active" : "");
    btn.dataset.periodo = p.id;

    const dot = document.createElement("span");
    dot.className = "chip-dot";
    dot.style.background = p.color;

    const lbl = document.createElement("span");
    lbl.textContent = p.nombre;

    const cnt = document.createElement("span");
    cnt.className = "chip-count";
    cnt.textContent = `(${count})`;

    btn.append(dot, lbl, cnt);
    btn.onclick = () => {
      periodoActivo = periodoActivo === p.id ? "todos" : p.id;
      actualizarTodo();
    };
    cont.append(btn);
  }
}

function obtenerFiltradas() {
  const q = document.getElementById("buscar").value.trim().toLowerCase();
  let desde = Number(document.getElementById("anio-desde").value);
  let hasta = Number(document.getElementById("anio-hasta").value);
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  document.getElementById("rango-label").textContent = `${desde} – ${hasta}`;

  const orden = document.getElementById("ordenar").value;

  const res = batallas.filter((b) => {
    if (periodoActivo !== "todos" && b.periodoId !== periodoActivo) return false;
    if (b.anio < desde || b.anio > hasta) return false;
    if (!q) return true;
    const texto = [
      b.titulo, b.fecha, String(b.anio), b.periodo, b.lugar, b.provincia,
      b.fuerzas, b.lideres.bando1, b.lideres.bando2, b.razones, b.consecuencias
    ].join(" ").toLowerCase();
    return texto.includes(q);
  });

  if (orden === "anio-asc") {
    res.sort((a, b) => a.anio - b.anio || a.id - b.id);
  } else if (orden === "anio-desc") {
    res.sort((a, b) => b.anio - a.anio || b.id - a.id);
  } else if (orden === "bajas-desc") {
    res.sort((a, b) => (b.muertos.totalEstimado || 0) - (a.muertos.totalEstimado || 0));
  }
  return res;
}

function actualizarResumen() {
  document.getElementById("stat-total").textContent = String(filtradas.length);

  const porZona = new Map();
  for (const b of filtradas) {
    porZona.set(b.provincia, (porZona.get(b.provincia) || 0) + 1);
  }
  document.getElementById("stat-provincias").textContent = String(porZona.size);

  let topNombre = "—";
  let topCant = 0;
  for (const [prov, cant] of porZona.entries()) {
    if (cant > topCant) {
      topCant = cant;
      topNombre = prov;
    }
  }
  const corto = topNombre === "Ciudad de Buenos Aires" ? "CABA" : topNombre.replace(" (Exterior)", "");
  document.getElementById("stat-hotspot").textContent = topCant ? `${corto} (${topCant})` : "—";

  renderRankingZonas(porZona);
}

function renderRankingZonas(porZona) {
  const ul = document.getElementById("ranking-zonas");
  ul.replaceChildren();
  const entries = [...porZona.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Sin enfrentamientos para los filtros seleccionados.";
    ul.append(li);
    return;
  }

  const max = entries[0][1];
  for (const [zona, cant] of entries) {
    const li = document.createElement("li");
    li.className = "zone-row";

    const head = document.createElement("div");
    head.className = "zone-head";
    const nameEl = document.createElement("strong");
    nameEl.textContent = zona;
    const countEl = document.createElement("span");
    countEl.className = "muted";
    countEl.textContent = `${cant} ${cant === 1 ? "hecho" : "hechos"}`;
    head.append(nameEl, countEl);

    const barBg = document.createElement("div");
    barBg.className = "zone-bar-bg";
    const barFill = document.createElement("div");
    barFill.className = "zone-bar-fill";
    barFill.style.width = `${Math.max(8, Math.round((cant / max) * 100))}%`;
    barBg.append(barFill);

    li.append(head, barBg);
    li.onclick = () => {
      const pts = filtradas.filter((b) => b.provincia === zona).map((b) => [b.lat, b.lng]);
      if (pts.length === 1) {
        map.flyTo(pts[0], 9, { duration: 0.7 });
      } else if (pts.length > 1) {
        map.fitBounds(pts, { padding: [55, 55], maxZoom: 11 });
      }
      setMobileView("mapa");
    };
    ul.append(li);
  }
}

function renderLista() {
  const ul = document.getElementById("lista-batallas");
  ul.replaceChildren();

  const cnt = document.getElementById("contador-lista");
  cnt.textContent = `${filtradas.length} de ${batallas.length} registros`;

  if (!filtradas.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No hay batallas que coincidan con tu búsqueda o rango de años.";
    ul.append(li);
    return;
  }

  for (const b of filtradas) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "battle-item" + (b.id === seleccionadaId ? " selected" : "");
    const color = PERIODO_MAP.get(b.periodoId)?.color || "#38bdf8";
    btn.style.borderLeftColor = color;

    const top = document.createElement("div");
    top.className = "battle-item-top";
    const yr = document.createElement("span");
    yr.className = "battle-year";
    yr.textContent = String(b.anio);
    const per = document.createElement("span");
    per.textContent = b.periodo;
    top.append(yr, per);

    const title = document.createElement("div");
    title.className = "battle-title";
    title.textContent = b.titulo;

    const loc = document.createElement("div");
    loc.className = "battle-loc";
    loc.textContent = `${b.provincia} · ${b.fecha}`;

    btn.append(top, title, loc);
    btn.onclick = () => seleccionarBatalla(b.id, true);
    li.append(btn);
    ul.append(li);
  }
}

// Micro-desplazamiento para que batallas en el mismo punto (ej. Plaza de Mayo) sean todas clicables
function calcularCoordenadasVisuales(lista) {
  const conteo = new Map();
  return lista.map((b) => {
    const key = `${b.lat.toFixed(2)},${b.lng.toFixed(2)}`;
    const idx = conteo.get(key) || 0;
    conteo.set(key, idx + 1);
    if (idx === 0) return { b, lat: b.lat, lng: b.lng };
    const ang = (idx * 2.39996); // ángulo áureo
    const r = 0.008 * Math.sqrt(idx);
    return {
      b,
      lat: b.lat + Math.cos(ang) * r,
      lng: b.lng + Math.sin(ang) * r
    };
  });
}

function renderMapa() {
  markerGroup.clearLayers();
  markerById.clear();

  const heatPoints = filtradas.map((b) => ({
    lat: b.lat,
    lng: b.lng,
    weight: heatMode === "bajas"
      ? Math.log10((b.muertos.totalEstimado || 10) + 10)
      : 1
  }));

  heatLayer.setPoints(heatVisible ? heatPoints : []);

  if (!markersVisible) return;

  const conCoords = calcularCoordenadasVisuales(filtradas);
  for (const { b, lat, lng } of conCoords) {
    const color = PERIODO_MAP.get(b.periodoId)?.color || "#38bdf8";
    const isSel = b.id === seleccionadaId;
    const radius = isSel ? 10 : 7;

    const m = L.circleMarker([lat, lng], {
      radius,
      fillColor: color,
      color: isSel ? "#ffffff" : "#0b1220",
      weight: isSel ? 3 : 2,
      opacity: 1,
      fillOpacity: 0.92
    });

    const tip = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = `${b.anio} · ${b.titulo}`;
    const sub = document.createElement("div");
    sub.textContent = b.provincia;
    sub.style.color = "#94a3b8";
    tip.append(strong, sub);

    m.bindTooltip(tip, { direction: "top", offset: [0, -8], className: "battle-tooltip" });
    m.on("click", () => seleccionarBatalla(b.id, false));
    m.addTo(markerGroup);
    markerById.set(b.id, m);
  }
}

function seleccionarBatalla(id, centrar) {
  const b = batallas.find((x) => x.id === id);
  if (!b) return;
  seleccionadaId = id;

  const pInfo = PERIODO_MAP.get(b.periodoId) || { nombre: b.periodo, color: "#38bdf8" };
  const pill = document.getElementById("ficha-periodo");
  pill.textContent = pInfo.nombre;
  pill.style.background = pInfo.color;

  document.getElementById("ficha-anio").textContent = String(b.anio);
  document.getElementById("ficha-titulo").textContent = b.titulo;
  document.getElementById("ficha-meta").textContent = `${b.fecha} · ${b.lugar} (${b.provincia})`;
  document.getElementById("ficha-fuerzas").textContent = b.fuerzas;
  document.getElementById("ficha-lider1").textContent = b.lideres.bando1;
  document.getElementById("ficha-lider2").textContent = b.lideres.bando2;
  document.getElementById("ficha-muertos1").textContent = b.muertos.bando1;
  document.getElementById("ficha-muertos2").textContent = b.muertos.bando2;
  document.getElementById("ficha-total-muertos").textContent =
    b.muertos.totalEstimado != null
      ? `Estimación de referencia para el mapa de calor: ~${b.muertos.totalEstimado.toLocaleString("es-AR")} víctimas fatales.`
      : "";
  document.getElementById("ficha-razones").textContent = b.razones;
  document.getElementById("ficha-consecuencias").textContent = b.consecuencias;
  document.getElementById("ficha-resultado").textContent = b.resultado || "—";
  document.getElementById("ficha-fuente").textContent = b.fuente || "Fuentes históricas";

  const idx = filtradas.findIndex((x) => x.id === id);
  document.getElementById("btn-prev").disabled = idx <= 0;
  document.getElementById("btn-next").disabled = idx === -1 || idx >= filtradas.length - 1;
  document.getElementById("ficha-posicion").textContent = idx >= 0 ? `${idx + 1} / ${filtradas.length}` : "";

  const estabaOculta = document.getElementById("ficha").hidden;
  document.getElementById("ficha").hidden = false;

  if (estabaOculta && map) {
    setTimeout(() => map.invalidateSize(), 50);
  }

  if (centrar) {
    const targetZoom = Math.max(map.getZoom(), 8);
    setTimeout(() => map.flyTo([b.lat, b.lng], Math.min(targetZoom, 11), { duration: 0.7 }), estabaOculta ? 70 : 0);
  }

  renderLista();
  renderMapa();

  if (window.innerWidth <= 900) {
    setMobileView("ficha");
  }
}

function cerrarFicha() {
  seleccionadaId = null;
  document.getElementById("ficha").hidden = true;
  if (map) setTimeout(() => map.invalidateSize(), 50);
  renderLista();
  renderMapa();
  if (window.innerWidth <= 900) {
    setMobileView("mapa");
  }
}

function actualizarTodo() {
  construirChipsPeriodos();
  filtradas = obtenerFiltradas();
  actualizarResumen();
  renderLista();
  renderMapa();

  // Actualizar estado de botones Anterior/Siguiente si hay ficha abierta
  if (seleccionadaId != null) {
    const idx = filtradas.findIndex((x) => x.id === seleccionadaId);
    document.getElementById("btn-prev").disabled = idx <= 0;
    document.getElementById("btn-next").disabled = idx === -1 || idx >= filtradas.length - 1;
    document.getElementById("ficha-posicion").textContent = idx >= 0 ? `${idx + 1} / ${filtradas.length}` : "Fuera de filtro";
  }
}

function setMobileView(view) {
  document.querySelector(".workspace").dataset.mobileView = view;
  document.querySelectorAll(".mob-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === view);
  });
  if (view === "mapa" && map) {
    setTimeout(() => map.invalidateSize(), 60);
  }
}

// ---------- Eventos de la interfaz ----------
function bindEvents() {
  document.getElementById("buscar").addEventListener("input", actualizarTodo);
  document.getElementById("anio-desde").addEventListener("input", actualizarTodo);
  document.getElementById("anio-hasta").addEventListener("input", actualizarTodo);
  document.getElementById("ordenar").addEventListener("change", actualizarTodo);

  document.getElementById("ficha-cerrar").addEventListener("click", cerrarFicha);

  document.getElementById("btn-prev").addEventListener("click", () => {
    const idx = filtradas.findIndex((x) => x.id === seleccionadaId);
    if (idx > 0) seleccionarBatalla(filtradas[idx - 1].id, true);
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    const idx = filtradas.findIndex((x) => x.id === seleccionadaId);
    if (idx >= 0 && idx < filtradas.length - 1) seleccionarBatalla(filtradas[idx + 1].id, true);
  });

  // Cambio de mapa base (Político / OpenStreetMap / Oscuro)
  document.querySelectorAll("[data-basemap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.basemap;
      if (!baseLayers[key]) return;
      map.removeLayer(activeBaseLayer);
      activeBaseLayer = baseLayers[key].addTo(map);
      document.querySelectorAll("[data-basemap]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  // Botones de zoom rápido
  document.querySelectorAll("[data-zoom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const z = ZONAS_ZOOM[btn.dataset.zoom];
      if (z) map.flyTo(z.center, z.zoom, { duration: 0.7 });
    });
  });

  // Controles del mapa de calor y marcadores
  document.getElementById("toggle-calor").addEventListener("change", (e) => {
    heatVisible = e.target.checked;
    renderMapa();
  });

  document.getElementById("toggle-marcadores").addEventListener("change", (e) => {
    markersVisible = e.target.checked;
    renderMapa();
  });

  document.querySelectorAll("[data-heatmode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      heatMode = btn.dataset.heatmode;
      document.querySelectorAll("[data-heatmode]").forEach((b) => b.classList.toggle("active", b === btn));
      renderMapa();
    });
  });

  // Sub-pestañas del panel izquierdo
  document.querySelectorAll(".subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.subtab;
      document.querySelectorAll(".subtab").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("panel-lista").hidden = tab !== "lista";
      document.getElementById("panel-regiones").hidden = tab !== "regiones";
    });
  });

  // Pestañas móviles
  document.querySelectorAll(".mob-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (view === "ficha" && seleccionadaId == null && filtradas.length) {
        seleccionarBatalla(filtradas[0].id, false);
        return;
      }
      setMobileView(view);
    });
  });

  // Modal agregar batalla en memoria
  const backdrop = document.getElementById("modal-backdrop");
  const abrirModal = () => { backdrop.hidden = false; };
  const cerrarModal = () => { backdrop.hidden = true; };

  document.getElementById("btn-agregar").addEventListener("click", abrirModal);
  document.getElementById("modal-cerrar").addEventListener("click", cerrarModal);
  document.getElementById("modal-cancelar").addEventListener("click", cerrarModal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) cerrarModal();
  });

  document.getElementById("form-nuevo").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const pId = String(fd.get("periodoId"));
    const pInfo = PERIODO_MAP.get(pId);
    const nuevoId = batallas.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const anio = Number(fd.get("anio"));

    const registro = {
      id: nuevoId,
      titulo: String(fd.get("titulo")).trim(),
      fecha: String(fd.get("fecha")).trim(),
      anio,
      periodo: pInfo ? pInfo.nombre : "Otro",
      periodoId: pId,
      lugar: String(fd.get("lugar")).trim(),
      provincia: String(fd.get("provincia")).trim(),
      lat: Number(fd.get("lat")),
      lng: Number(fd.get("lng")),
      fuerzas: String(fd.get("fuerzas")).trim(),
      lideres: {
        bando1: String(fd.get("lider1")).trim(),
        bando2: String(fd.get("lider2")).trim()
      },
      muertos: {
        bando1: String(fd.get("muertos1")).trim(),
        bando2: String(fd.get("muertos2")).trim(),
        totalEstimado: Number(fd.get("totalEstimado")) || 0
      },
      razones: String(fd.get("razones")).trim(),
      consecuencias: String(fd.get("consecuencias")).trim(),
      resultado: "Agregado en memoria por el usuario",
      fuente: "Registro manual (sesión actual)"
    };

    // Ajustar rango si el año queda fuera
    const desdeEl = document.getElementById("anio-desde");
    const hastaEl = document.getElementById("anio-hasta");
    if (anio < Number(desdeEl.min)) desdeEl.min = String(anio);
    if (anio > Number(hastaEl.max)) hastaEl.max = String(anio);
    if (anio < Number(desdeEl.value)) desdeEl.value = String(anio);
    if (anio > Number(hastaEl.value)) hastaEl.value = String(anio);

    batallas.push(registro);
    e.target.reset();
    cerrarModal();
    actualizarTodo();
    seleccionarBatalla(registro.id, true);
  });
}

// ---------- Carga de datos desde datos.json ----------
async function iniciar() {
  initMap();
  bindEvents();

  try {
    const resp = await fetch("datos.json");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const json = await resp.json();
    if (!Array.isArray(json)) throw new Error("Formato inválido");
    batallas = json;
    actualizarTodo();
  } catch (err) {
    const aviso = document.getElementById("aviso-error");
    aviso.textContent =
      "No pude cargar datos.json. Si abriste index.html con doble clic, probá verlo con un servidor local (por ejemplo python -m http.server) o directamente en el lab.";
    aviso.hidden = false;
  }
}

iniciar();
