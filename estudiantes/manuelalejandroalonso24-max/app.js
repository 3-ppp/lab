(() => {
  const CATEGORIES = [
    { id: "Seguidos", label: "☆ Seguidos" },
    { id: "Acciones", label: "Acciones" },
    { id: "CEDEARs", label: "CEDEARs" },
    { id: "Bonos", label: "Bonos" },
    { id: "Opciones", label: "Opciones" },
    { id: "Letras", label: "Letras" },
    { id: "Futuros A3", label: "Futuros A3" },
    { id: "Commodities", label: "Commodities" },
    { id: "Fondos", label: "Fondos" },
    { id: "Cauciones", label: "Cauciones" },
    { id: "Oblig. Negociables", label: "Oblig. Negociables" },
    { id: "Internacional", label: "Internacional" },
    { id: "Crypto", label: "Crypto" },
    { id: "Dólares", label: "Dólares" },
  ];

  let assets = [];
  let portfolio = []; // { assetId, qty, avgPrice } en memoria
  let simActive = true;
  let simTimer = null;
  let activeCategory = "Acciones";
  let activePanel = "Merval";
  let activeCurrency = "ORIG"; // ORIG | ARS | MEP | CCL
  let activePlazo = "24hs"; // 24hs | CI
  let searchQuery = "";
  let hideNoPrice = true;
  let sortCol = "simbolo";
  let sortDir = 1; // 1 asc, -1 desc
  let selectedAssetId = null;
  let activeTimeframe = "1D";
  let lastFlashes = new Map();

  // Referencias DOM
  const el = (id) => document.getElementById(id);

  // ---------- Formateo estilo argentino ----------
  function fmtNum(val, decimals = 2) {
    if (val === null || val === undefined || Number.isNaN(val)) return "-";
    return Number(val).toLocaleString("es-AR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtPrice(val, currency) {
    if (!val && val !== 0) return "-";
    const decimals = val < 1 ? 4 : (currency === "ARS" ? (val >= 1000 ? 2 : 3) : (val < 10 ? 3 : 2));
    return fmtNum(val, decimals);
  }

  function fmtCompact(val, prefix = "") {
    if (!val) return "-";
    if (val >= 1e12) return prefix + fmtNum(val / 1e12, 2) + "T";
    if (val >= 1e9) return prefix + fmtNum(val / 1e9, 2) + "B";
    if (val >= 1e6) return prefix + fmtNum(val / 1e6, 2) + "M";
    if (val >= 1e3) return prefix + fmtNum(val / 1e3, 0) + "K";
    return prefix + fmtNum(val, 0);
  }

  function nowTimeStr() {
    return new Date().toLocaleTimeString("es-AR", { hour12: false });
  }

  function showToast(msg) {
    const t = el("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // ---------- Tipos de cambio actuales ----------
  function getFxRate(symbol, fallback) {
    const found = assets.find((a) => a.simbolo === symbol);
    return found && found.ultimo > 0 ? found.ultimo : fallback;
  }

  function convertValue(val, fromMoneda) {
    if (!val && val !== 0) return val;
    const mep = getFxRate("USD-MEP", 1695.1);
    const ccl = getFxRate("USD-CCL", 1797.1);
    let out = val;
    let currency = fromMoneda;

    if (activeCurrency === "ARS") {
      out = fromMoneda === "USD" ? val * mep : val;
      currency = "ARS";
    } else if (activeCurrency === "MEP") {
      out = fromMoneda === "ARS" ? val / mep : val;
      currency = "USD";
    } else if (activeCurrency === "CCL") {
      out = fromMoneda === "ARS" ? val / ccl : val;
      currency = "USD";
    }

    // Ajuste Contado Inmediato (CI) solo para instrumentos locales en pesos
    if (activePlazo === "CI" && fromMoneda === "ARS") {
      out = out * 0.9975;
    }
    return { val: out, currency };
  }

  // ---------- Carga inicial desde datos.json ----------
  async function loadInitialData() {
    try {
      const res = await fetch("datos.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      assets = data.map((item) => ({
        ...item,
        historial: buildSeries(item.ultimo, item.variacion, 40),
      }));
      el("lastUpdateText").textContent = "Última actualización: " + nowTimeStr();
      renderAll();
      startSimulation();
      // Actualiza Dólar (DolarAPI) y Cripto (Binance) automáticamente al abrir y cada 30s
      refreshPublicApis(true);
      setInterval(() => {
        if (simActive) refreshPublicApis(true);
      }, 30000);
    } catch (err) {
      el("quotesBody").innerHTML = "";
      el("emptyState").style.display = "block";
      el("emptyState").textContent =
        "No se pudo cargar datos.json. Si abriste index.html con doble clic, probalo desde un servidor local o desde el lab.";
    }
  }

  // Mapa de símbolos a tickers reales de TradingView Scanner (sin clave, CORS abierto)
  const TV_GLOBAL_MAP = {
    "GC=F": "COMEX:GC1!", "SI=F": "COMEX:SI1!", "HG=F": "COMEX:HG1!", "PL=F": "NYMEX:PL1!", "PA=F": "NYMEX:PA1!",
    "CL=F": "NYMEX:CL1!", "BZ=F": "ICEEUR:BRN1!", "NG=F": "NYMEX:NG1!", "TTF=F": "ICEENDEX:TFM1!", "RB=F": "NYMEX:RB1!",
    "ZS=F": "CBOT:ZS1!", "ZM=F": "CBOT:ZM1!", "ZL=F": "CBOT:ZL1!", "ZW=F": "CBOT:ZW1!", "ZC=F": "CBOT:ZC1!",
    "KC=F": "ICEUS:KC1!", "CC=F": "ICEUS:CC1!", "SB=F": "ICEUS:SB1!", "LE=F": "CME:LE1!",
    "SPX": "SP:SPX", "NDX": "NASDAQ:NDX", "DJI": "DJ:DJI", "RUT": "TVC:RUT", "VIX": "CBOE:VIX",
    "DAX": "XETR:DAX", "FTSE": "TVC:UKX", "N225": "TVC:NI225", "BVSP": "BMFBOVESPA:IBOV",
    "US10Y": "TVC:US10Y", "DXY": "TVC:DXY", "EUR/USD": "FX:EURUSD", "USD/BRL": "FX_IDC:USDBRL",
    "YPF.ADR": "NYSE:YPF", "GGAL.ADR": "NASDAQ:GGAL", "VIST.US": "NYSE:VIST", "MELI.US": "NASDAQ:MELI",
    "NVDA.US": "NASDAQ:NVDA", "AAPL.US": "NASDAQ:AAPL", "MSFT.US": "NASDAQ:MSFT", "ARGT": "AMEX:ARGT",
  };

  // ---------- Actualización automática/manual desde APIs públicas sin clave ----------
  async function refreshPublicApis(silent = false) {
    const btn = el("btnLiveApi");
    btn.disabled = true;
    btn.textContent = "Actualizando…";
    let updatedFx = 0;
    let updatedCrypto = 0;
    let updatedTv = 0;

    // 1. Dólares argentinos desde DolarAPI (pública, sin clave, CORS abierto)
    try {
      const r = await fetch("https://dolarapi.com/v1/dolares");
      if (r.ok) {
        const list = await r.json();
        const map = {
          bolsa: "USD-MEP",
          contadoconliqui: "USD-CCL",
          oficial: "USD-OF",
          blue: "USD-BLUE",
          cripto: "USD-CRIPTO",
        };
        for (const d of list) {
          const sym = map[d.casa];
          if (!sym) continue;
          const a = assets.find((x) => x.simbolo === sym);
          if (a && d.venta) {
            const prev = a.ultimo;
            a.ultimo = Number(d.venta);
            a.precioCompra = Number(d.compra || d.venta);
            a.precioVenta = Number(d.venta);
            a.variacion = a.cierre ? Number((((a.ultimo - a.cierre) / a.cierre) * 100).toFixed(2)) : a.variacion;
            a.hora = nowTimeStr();
            if (a.ultimo !== prev) lastFlashes.set(a.id, a.ultimo > prev ? "up" : "down");
            updatedFx++;
          }
        }
      }
    } catch { /* fallback silencioso a datos.json */ }

    // 2. Top 10 Criptomonedas más líquidas desde Binance pública (sin clave)
    try {
      const syms = encodeURIComponent(JSON.stringify([
        "BTCUSDT", "ETHUSDT", "SOLUSDT", "ZECUSDT", "XRPUSDT",
        "NEARUSDT", "HYPEUSDT", "BNBUSDT", "DOGEUSDT", "LINKUSDT",
      ]));
      const r = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbols=" + syms);
      if (r.ok) {
        const list = await r.json();
        const map = {
          BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", ZECUSDT: "ZEC", XRPUSDT: "XRP",
          NEARUSDT: "NEAR", HYPEUSDT: "HYPE", BNBUSDT: "BNB", DOGEUSDT: "DOGE", LINKUSDT: "LINK",
        };
        for (const c of list) {
          const sym = map[c.symbol];
          const a = assets.find((x) => x.simbolo === sym);
          if (a && Number(c.lastPrice) > 0) {
            const prev = a.ultimo;
            a.ultimo = Number(c.lastPrice);
            a.variacion = Number(Number(c.priceChangePercent).toFixed(2));
            a.cierre = Number(c.prevClosePrice || a.cierre);
            a.precioCompra = Number(c.bidPrice || a.ultimo);
            a.precioVenta = Number(c.askPrice || a.ultimo);
            a.minimo = Number(c.lowPrice || a.minimo);
            a.maximo = Number(c.highPrice || a.maximo);
            a.volumen = Math.round(Number(c.volume || a.volumen));
            a.monto = Math.round(Number(c.quoteVolume || a.monto));
            if (Number(c.count) > 0) a.operaciones = Number(c.count);
            a.hora = nowTimeStr();
            if (a.ultimo !== prev) lastFlashes.set(a.id, a.ultimo > prev ? "up" : "down");
            updatedCrypto++;
          }
        }
      }
    } catch { /* fallback silencioso a datos.json */ }

    // 3. TradingView Scanner en vivo (Acciones BYMA, CEDEARs, Commodities, Índices, USA, Forex)
    const applyTvRows = (rows, reverseLookup) => {
      for (const row of rows || []) {
        const sym = reverseLookup[row.s];
        const a = sym ? assets.find((x) => x.simbolo === sym) : null;
        const d = row.d;
        if (!a || !d || !(Number(d[0]) > 0)) continue;
        const prev = a.ultimo;
        const p = Number(d[0]);
        const chg = Number(Number(d[1] || 0).toFixed(2));
        const dec = p < 10 ? 4 : 2;
        a.ultimo = Number(p.toFixed(dec));
        a.variacion = chg;
        if (chg !== -100) a.cierre = Number((p / (1 + chg / 100)).toFixed(dec));
        if (Number(d[3]) > 0) a.maximo = Number(Number(d[3]).toFixed(dec));
        if (Number(d[4]) > 0) a.minimo = Number(Number(d[4]).toFixed(dec));
        if (Number(d[5]) > 0) a.volumen = Math.round(Number(d[5]));
        if (Number(d[6]) > 0) a.monto = Math.round(Number(d[6]));
        a.precioCompra = Number((p * 0.998).toFixed(dec));
        a.precioVenta = Number((p * 1.002).toFixed(dec));
        a.hora = nowTimeStr();
        if (a.ultimo !== prev) lastFlashes.set(a.id, a.ultimo > prev ? "up" : "down");
        updatedTv++;
      }
    };

    try {
      const arRev = {};
      const arTickers = [];
      for (const a of assets) {
        if (a.categoria === "Acciones" || a.categoria === "CEDEARs") {
          if (a.simbolo === "ARGT") continue;
          const tk = "BCBA:" + a.simbolo;
          arRev[tk] = a.simbolo;
          arTickers.push(tk);
        }
      }
      const glRev = {};
      const glTickers = [];
      for (const [sym, tk] of Object.entries(TV_GLOBAL_MAP)) {
        glRev[tk] = sym;
        glTickers.push(tk);
      }

      const [rAr, rGl] = await Promise.all([
        fetch("https://scanner.tradingview.com/argentina/scan", {
          method: "POST",
          body: JSON.stringify({ symbols: { tickers: arTickers }, columns: ["close", "change", "open", "high", "low", "volume", "Value.Traded"] }),
        }),
        fetch("https://scanner.tradingview.com/global/scan", {
          method: "POST",
          body: JSON.stringify({ symbols: { tickers: glTickers }, columns: ["close", "change", "open", "high", "low", "volume"] }),
        }),
      ]);
      if (rAr.ok) applyTvRows((await rAr.json()).data, arRev);
      if (rGl.ok) applyTvRows((await rGl.json()).data, glRev);
    } catch { /* fallback silencioso a datos.json */ }

    btn.disabled = false;
    btn.textContent = "↻ Actualizar en vivo (TV · Dólar · Cripto)";

    if (updatedTv + updatedFx + updatedCrypto > 0) {
      el("apiStatus").textContent = `· Tiempo real: TradingView (${updatedTv}) + Dólar (${updatedFx}) + Cripto (${updatedCrypto})`;
      el("lastUpdateText").textContent = "Última actualización en vivo: " + nowTimeStr();
      if (!silent) showToast(`En vivo: ${updatedTv} TradingView, ${updatedFx} dólares y ${updatedCrypto} criptos`);
      renderAll();
    } else if (!silent) {
      showToast("Sin conexión a APIs externas: seguimos operando con datos.json");
    }
  }

  // ---------- Simulador de ticks en vivo (en memoria) ----------
  function startSimulation() {
    clearInterval(simTimer);
    simTimer = setInterval(() => {
      if (!simActive || assets.length === 0) return;
      lastFlashes.clear();
      const count = Math.min(6, assets.length);
      const tStr = nowTimeStr();
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * assets.length);
        const a = assets[idx];
        // Variación sutil de mercado en memoria sin alejarse de los precios reales
        const vol =
          a.categoria === "Opciones" ? 0.004 :
          a.categoria === "Fondos" || a.categoria === "Letras" || a.categoria === "Dólares" ? 0.0004 :
          0.0012;
        const deltaPct = (Math.random() - 0.5) * 2 * vol;
        const next = Math.max(0.01, a.ultimo * (1 + deltaPct));
        const direction = next >= a.ultimo ? "up" : "down";
        a.ultimo = Number(next.toFixed(a.moneda === "USD" && next < 10 ? 4 : 2));
        a.variacion = a.cierre ? Number((((a.ultimo - a.cierre) / a.cierre) * 100).toFixed(2)) : a.variacion;
        a.precioCompra = Number((a.ultimo * 0.996).toFixed(2));
        a.precioVenta = Number((a.ultimo * 1.004).toFixed(2));
        a.minimo = Math.min(a.minimo, a.ultimo);
        a.maximo = Math.max(a.maximo, a.ultimo);
        if (a.operaciones > 0) {
          a.operaciones += Math.floor(Math.random() * 6) + 1;
          a.volumen += Math.floor(Math.random() * 900) + 50;
          a.monto += Math.floor(a.ultimo * 120);
        }
        a.hora = tStr;
        a.historial.push(a.ultimo);
        if (a.historial.length > 60) a.historial.shift();
        lastFlashes.set(a.id, direction);
      }
      el("lastUpdateText").textContent = "Última actualización: " + tStr;
      renderFxStrip();
      renderTable();
      if (selectedAssetId !== null && el("detailModal").classList.contains("open")) {
        renderDetailModal(selectedAssetId);
      }
    }, 2600);
  }

  // ---------- Renderizado de Tira Superior de Dólares, Índices y Commodities ----------
  function renderFxStrip() {
    const featured = ["USD-MEP", "USD-CCL", "USD-OF", "USD-BLUE", "MERV.USD", "SPX", "NDX", "GC=F", "SI=F", "CL=F", "NG=F", "ZS=F", "BTC"];
    const labelMap = {
      "USD-MEP": "Dólar MEP", "USD-CCL": "Dólar CCL", "USD-OF": "Dólar Oficial", "USD-BLUE": "Dólar Blue",
      "MERV.USD": "Merval USD", "GC=F": "Oro", "SI=F": "Plata", "CL=F": "WTI", "NG=F": "Gas Nat.", "ZS=F": "Soja CBOT",
    };
    const container = el("fxStrip");
    container.replaceChildren();
    for (const sym of featured) {
      const a = assets.find((x) => x.simbolo === sym);
      if (!a) continue;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "fx-chip";
      const cls = a.variacion > 0 ? "var-up" : a.variacion < 0 ? "var-down" : "var-flat";
      const arrow = a.variacion > 0 ? "↑" : a.variacion < 0 ? "↓" : "";
      const prefix = a.moneda === "ARS" ? "$" : "US$";
      chip.innerHTML = `
        <span class="fx-label">${labelMap[a.simbolo] || a.simbolo}</span>
        <span class="fx-val">${prefix}${fmtPrice(a.ultimo, a.moneda)}</span>
        <span class="var-pill ${cls}" style="font-size:11px;padding:1px 6px;">${a.variacion > 0 ? "+" : ""}${fmtNum(a.variacion, 2)}% ${arrow}</span>
      `;
      chip.onclick = () => openDetail(a.id);
      container.append(chip);
    }
  }

  // ---------- Pestañas y Paneles ----------
  function renderCategoryTabs() {
    const wrap = el("categoryTabs");
    wrap.replaceChildren();
    const favCount = assets.filter((a) => a.seguido).length;
    for (const cat of CATEGORIES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-tab" + (activeCategory === cat.id ? " active" : "");
      btn.textContent = cat.id === "Seguidos" ? `☆ Seguidos (${favCount})` : cat.label;
      btn.onclick = () => {
        activeCategory = cat.id;
        activePanel = "Todos";
        if (cat.id === "Acciones") activePanel = "Merval";
        renderCategoryTabs();
        renderPanelPills();
        renderTable();
      };
      wrap.append(btn);
    }
  }

  function renderPanelPills() {
    const wrap = el("panelPills");
    wrap.replaceChildren();
    const inCat = activeCategory === "Seguidos"
      ? assets.filter((a) => a.seguido)
      : assets.filter((a) => a.categoria === activeCategory);
    const panels = ["Todos", ...new Set(inCat.map((a) => a.panel))];
    if (!panels.includes(activePanel)) activePanel = panels[0] || "Todos";

    for (const p of panels) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill" + (activePanel === p ? " active" : "");
      btn.textContent = p;
      btn.onclick = () => {
        activePanel = p;
        renderPanelPills();
        renderTable();
      };
      wrap.append(btn);
    }
  }

  // ---------- Filtrado, Ordenamiento y Tabla ----------
  function getFilteredAssets() {
    const q = searchQuery.trim().toLowerCase();
    return assets
      .filter((a) => {
        if (q) {
          // Si hay búsqueda, busca en toda la plataforma para comodidad estilo terminal
          const hay = (a.simbolo + " " + a.nombre + " " + a.categoria + " " + a.sector).toLowerCase();
          if (!hay.includes(q)) return false;
        } else {
          if (activeCategory === "Seguidos") {
            if (!a.seguido) return false;
          } else if (a.categoria !== activeCategory) {
            return false;
          }
          if (activePanel !== "Todos" && a.panel !== activePanel) return false;
        }
        if (hideNoPrice && (!a.ultimo || a.ultimo <= 0)) return false;
        return true;
      })
      .sort((a, b) => {
        const va = a[sortCol];
        const vb = b[sortCol];
        if (typeof va === "string") return va.localeCompare(vb, "es") * sortDir;
        return ((va || 0) - (vb || 0)) * sortDir;
      });
  }

  function renderTable() {
    const rows = getFilteredAssets();
    const tbody = el("quotesBody");
    tbody.replaceChildren();

    // Estadísticas del panel
    const ups = rows.filter((r) => r.variacion > 0).length;
    const downs = rows.filter((r) => r.variacion < 0).length;
    const avgVar = rows.length ? rows.reduce((s, r) => s + r.variacion, 0) / rows.length : 0;
    const totalMonto = rows.reduce((s, r) => s + convertValue(r.monto, r.moneda).val, 0);
    const currSym = activeCurrency === "MEP" || activeCurrency === "CCL" ? "US$" : "$";
    el("panelStats").innerHTML = `
      <span>Mostrando <strong>${rows.length}</strong> instrumentos</span>
      <span>Suben: <strong style="color:var(--up)">${ups}</strong> · Bajan: <strong style="color:var(--down)">${downs}</strong></span>
      <span>Promedio var.: <strong>${avgVar >= 0 ? "+" : ""}${fmtNum(avgVar, 2)}%</strong></span>
      <span>Monto operado: <strong>${fmtCompact(totalMonto, currSym)}</strong></span>
    `;

    // Encabezados ordenados
    document.querySelectorAll("thead th").forEach((th) => {
      const col = th.dataset.sort;
      th.classList.toggle("sorted", col === sortCol);
      const base = th.dataset.base || th.textContent.replace(/[▲▼]/g, "").trim();
      th.dataset.base = base;
      th.textContent = col === sortCol ? `${base} ${sortDir === 1 ? "▲" : "▼"}` : base;
    });

    if (rows.length === 0) {
      el("emptyState").style.display = "block";
      return;
    }
    el("emptyState").style.display = "none";

    for (const a of rows) {
      const tr = document.createElement("tr");
      const flash = lastFlashes.get(a.id);
      if (flash === "up") tr.classList.add("flash-up");
      if (flash === "down") tr.classList.add("flash-down");

      const pUlt = convertValue(a.ultimo, a.moneda);
      const pCie = convertValue(a.cierre, a.moneda);
      const pBid = convertValue(a.precioCompra, a.moneda);
      const pAsk = convertValue(a.precioVenta, a.moneda);
      const pMin = convertValue(a.minimo, a.moneda);
      const pMax = convertValue(a.maximo, a.moneda);
      const pMnt = convertValue(a.monto, a.moneda);

      const varCls = a.variacion > 0 ? "var-up" : a.variacion < 0 ? "var-down" : "var-flat";
      const arrow = a.variacion > 0 ? "↑" : a.variacion < 0 ? "↓" : "–";
      const shortBadge = a.simbolo.replace(/[^A-Z0-9]/g, "").slice(0, 3);
      const moneyPrefix = pMnt.currency === "USD" ? "US$" : "$";

      tr.innerHTML = `
        <td class="col-symbol">
          <div class="sym-cell">
            <button class="star-btn ${a.seguido ? "active" : ""}" type="button" title="Agregar o quitar de Seguidos">${a.seguido ? "★" : "☆"}</button>
            <span class="ticker-badge" style="background:${a.color}">${shortBadge}</span>
            <div>
              <span class="sym-name">${a.simbolo}</span><span class="sym-sep">|</span><span class="sym-desc">${a.nombre}</span>
            </div>
          </div>
        </td>
        <td class="col-price">
          <span class="price-curr">${pUlt.currency}</span>
          ${fmtPrice(pUlt.val, pUlt.currency)}
        </td>
        <td>
          <span class="var-pill ${varCls}">${a.variacion > 0 ? "+" : ""}${fmtNum(a.variacion, 2)} % ${arrow}</span>
        </td>
        <td>${fmtPrice(pCie.val, pCie.currency)}</td>
        <td class="col-bid">${a.cantCompra ? fmtNum(a.cantCompra, 0) : "0"}</td>
        <td class="col-bid">${a.precioCompra ? fmtPrice(pBid.val, pBid.currency) : "-"}</td>
        <td class="col-ask">${a.precioVenta ? fmtPrice(pAsk.val, pAsk.currency) : "-"}</td>
        <td class="col-ask">${a.cantVenta ? fmtNum(a.cantVenta, 0) : "0"}</td>
        <td><strong>${fmtPrice(pMin.val, pMin.currency)} - ${fmtPrice(pMax.val, pMax.currency)}</strong></td>
        <td>${fmtCompact(a.volumen)}</td>
        <td>${fmtCompact(pMnt.val, moneyPrefix)}</td>
        <td>${a.operaciones ? fmtNum(a.operaciones, 0) : "-"}</td>
        <td class="col-muted">${a.hora}</td>
      `;

      tr.querySelector(".star-btn").onclick = (e) => {
        e.stopPropagation();
        a.seguido = !a.seguido;
        renderCategoryTabs();
        renderTable();
        showToast(a.seguido ? `${a.simbolo} agregado a Seguidos` : `${a.simbolo} quitado de Seguidos`);
      };

      tr.onclick = () => openDetail(a.id);
      tbody.append(tr);
    }
  }

  // ---------- Serie histórica sintética y gráfico SVG interactivo ----------
  function buildSeries(endPrice, varPct, points = 40) {
    const startPrice = endPrice / (1 + (varPct || 0) / 100);
    const arr = [];
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      const trend = startPrice + (endPrice - startPrice) * t;
      const noise = (Math.sin(i * 0.8 + endPrice) * 0.008 + (Math.random() - 0.5) * 0.009) * endPrice;
      arr.push(Number(Math.max(0.01, i === points - 1 ? endPrice : trend + noise).toFixed(3)));
    }
    return arr;
  }

  function getSeriesForTimeframe(asset, tf) {
    if (tf === "1D") return asset.historial;
    const scale = { "1S": 2.4, "1M": 5.5, "6M": 16, "1A": 32 }[tf] || 1;
    // Serie determinista según id + timeframe para que no salte al redibujar
    const points = 44;
    const arr = [];
    const base = asset.ultimo;
    let seed = asset.id * 97 + tf.charCodeAt(0) * 13;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    let cur = base * (1 - ((rand() - 0.35) * scale) / 100);
    for (let i = 0; i < points - 1; i++) {
      arr.push(Number(Math.max(0.01, cur).toFixed(3)));
      cur += (base - cur) / (points - i) + (rand() - 0.48) * base * (scale / 100) * 0.28;
    }
    arr.push(base);
    return arr;
  }

  function calcRSI(series, period = 14) {
    if (series.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = series.length - period; i < series.length; i++) {
      const diff = series[i] - series[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  function openDetail(id) {
    selectedAssetId = id;
    activeTimeframe = "1D";
    document.querySelectorAll("#timeframePills .pill").forEach((p) => {
      p.classList.toggle("active", p.dataset.tf === "1D");
    });
    renderDetailModal(id);
    el("detailModal").classList.add("open");
  }

  function renderDetailModal(id) {
    const a = assets.find((x) => x.id === id);
    if (!a) return;
    const pUlt = convertValue(a.ultimo, a.moneda);
    const pBid = convertValue(a.precioCompra, a.moneda);
    const pAsk = convertValue(a.precioVenta, a.moneda);
    const pMin = convertValue(a.minimo, a.moneda);
    const pMax = convertValue(a.maximo, a.moneda);

    const badge = el("dBadge");
    badge.style.background = a.color;
    badge.textContent = a.simbolo.replace(/[^A-Z0-9]/g, "").slice(0, 3);
    el("dTitle").textContent = `${a.simbolo} · ${a.nombre}`;
    const varEl = el("dVar");
    varEl.className = "var-pill " + (a.variacion > 0 ? "var-up" : a.variacion < 0 ? "var-down" : "var-flat");
    varEl.textContent = `${a.variacion > 0 ? "+" : ""}${fmtNum(a.variacion, 2)}%`;
    el("dMeta").textContent = `${a.categoria} · ${a.panel} · ${a.sector} · ${a.infoExtra || ""}`;

    el("dKpis").innerHTML = `
      <div class="kpi-box"><span>Último (${pUlt.currency})</span><strong>${fmtPrice(pUlt.val, pUlt.currency)}</strong></div>
      <div class="kpi-box"><span>Punta Compra</span><strong style="color:var(--up)">${fmtPrice(pBid.val, pBid.currency)}</strong></div>
      <div class="kpi-box"><span>Punta Venta</span><strong style="color:var(--down)">${fmtPrice(pAsk.val, pAsk.currency)}</strong></div>
      <div class="kpi-box"><span>Rango Diario</span><strong>${fmtPrice(pMin.val, pMin.currency)} – ${fmtPrice(pMax.val, pMax.currency)}</strong></div>
      <div class="kpi-box"><span>Operaciones</span><strong>${a.operaciones ? fmtNum(a.operaciones, 0) : "-"}</strong></div>
    `;

    el("btnStarDetail").textContent = a.seguido ? "★ En Seguidos" : "☆ Seguir";
    el("btnStarDetail").onclick = () => {
      a.seguido = !a.seguido;
      renderDetailModal(a.id);
      renderCategoryTabs();
      renderTable();
    };

    el("btnBuySim").onclick = () => {
      const qty = Number(el("tradeQty").value);
      if (!qty || qty <= 0) return;
      const existing = portfolio.find((p) => p.assetId === a.id);
      if (existing) {
        const totalCost = existing.avgPrice * existing.qty + a.ultimo * qty;
        existing.qty += qty;
        existing.avgPrice = totalCost / existing.qty;
      } else {
        portfolio.push({ assetId: a.id, qty, avgPrice: a.ultimo });
      }
      updatePortfolioBadge();
      showToast(`Compraste ${qty} nominales de ${a.simbolo} en tu cartera simulada`);
    };

    drawSvgChart(a);
  }

  function drawSvgChart(asset) {
    const rawSeries = getSeriesForTimeframe(asset, activeTimeframe);
    const series = rawSeries.map((v) => convertValue(v, asset.moneda).val);
    const curr = convertValue(asset.ultimo, asset.moneda).currency;
    const svg = el("chartSvg");
    const W = 700, H = 220, padX = 12, padY = 18;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const isUp = series[series.length - 1] >= series[0];
    const stroke = isUp ? "#0f9d58" : "#d93025";

    const pts = series.map((v, i) => {
      const x = padX + (i / (series.length - 1)) * (W - padX * 2);
      const y = H - padY - ((v - min) / span) * (H - padY * 2);
      return { x, y, v, i };
    });

    const lineD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaD = `${lineD} L${pts[pts.length - 1].x.toFixed(1)},${H - padY} L${pts[0].x.toFixed(1)},${H - padY} Z`;

    // Media móvil simple 10
    const smaPts = pts.map((p, i) => {
      const slice = series.slice(Math.max(0, i - 9), i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      const y = H - padY - ((avg - min) / span) * (H - padY * 2);
      return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    svg.innerHTML = `
      <defs>
        <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${stroke}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${stroke}" stop-opacity="0.01"/>
        </linearGradient>
      </defs>
      <line x1="${padX}" y1="${padY}" x2="${W - padX}" y2="${padY}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="4 4"/>
      <line x1="${padX}" y1="${H / 2}" x2="${W - padX}" y2="${H / 2}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="4 4"/>
      <line x1="${padX}" y1="${H - padY}" x2="${W - padX}" y2="${H - padY}" stroke="currentColor" stroke-opacity="0.12"/>
      <path d="${areaD}" fill="url(#areaGrad)"/>
      <path d="${smaPts}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.8"/>
      <path d="${lineD}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle id="hoverDot" cx="${pts[pts.length - 1].x}" cy="${pts[pts.length - 1].y}" r="4.5" fill="${stroke}" stroke="#fff" stroke-width="2"/>
    `;

    svg.onmousemove = (e) => {
      const rect = svg.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * W;
      let nearest = pts[0];
      for (const p of pts) {
        if (Math.abs(p.x - relX) < Math.abs(nearest.x - relX)) nearest = p;
      }
      const dot = svg.querySelector("#hoverDot");
      if (dot) {
        dot.setAttribute("cx", nearest.x);
        dot.setAttribute("cy", nearest.y);
      }
      el("chartHoverInfo").textContent = `Punto #${nearest.i + 1} (${activeTimeframe}): ${curr} ${fmtPrice(nearest.v, curr)}`;
    };

    const rsi = calcRSI(series, 14);
    const sma = series.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, series.length);
    const tfVar = ((series[series.length - 1] - series[0]) / series[0]) * 100;
    const rsiLabel = rsi > 70 ? "Sobrecompra" : rsi < 30 ? "Sobreventa" : "Neutral";
    el("techIndicators").innerHTML = `
      <span>Var. ${activeTimeframe}: <strong style="color:${isUp ? "var(--up)" : "var(--down)"}">${tfVar >= 0 ? "+" : ""}${fmtNum(tfVar, 2)}%</strong></span>
      <span>RSI (14): <strong>${fmtNum(rsi, 1)}</strong> (${rsiLabel})</span>
      <span>Media Móvil (20): <strong style="color:#6366f1">${curr} ${fmtPrice(sma, curr)}</strong></span>
      <span>Mín / Máx ${activeTimeframe}: <strong>${fmtPrice(min, curr)} / ${fmtPrice(max, curr)}</strong></span>
    `;
  }

  // ---------- Conversor ARS ↔ USD ----------
  function renderConverter() {
    const amount = Number(el("convAmount").value) || 0;
    const dir = el("convDir").value;
    const rates = [
      { label: "Dólar MEP (Bolsa)", val: getFxRate("USD-MEP", 1695.1) },
      { label: "Dólar CCL (Cable)", val: getFxRate("USD-CCL", 1797.1) },
      { label: "Dólar Oficial", val: getFxRate("USD-OF", 1615.0) },
      { label: "Dólar Blue", val: getFxRate("USD-BLUE", 1700.0) },
    ];
    el("convResults").innerHTML = rates.map((r) => {
      const res = dir === "ARS_TO_USD" ? amount / r.val : amount * r.val;
      const outStr = dir === "ARS_TO_USD" ? `US$ ${fmtNum(res, 2)}` : `ARS $ ${fmtNum(res, 2)}`;
      return `<div class="kpi-box"><span>${r.label} ($${fmtNum(r.val, 2)})</span><strong>${outStr}</strong></div>`;
    }).join("");
  }

  // ---------- Mi Cartera Simulada ----------
  function updatePortfolioBadge() {
    el("portfolioCount").textContent = portfolio.length;
  }

  function renderPortfolio() {
    const mep = getFxRate("USD-MEP", 1695.1);
    let totalArs = 0;
    let totalCostArs = 0;

    const listEl = el("portfolioList");
    if (portfolio.length === 0) {
      el("portfolioSummary").innerHTML = "";
      listEl.innerHTML = `<div class="empty-state">Todavía no tenés posiciones simuladas. Hacé clic en cualquier activo de la tabla y tocá <strong>Comprar (simulado)</strong>.</div>`;
      return;
    }

    listEl.replaceChildren();
    for (const pos of portfolio) {
      const a = assets.find((x) => x.id === pos.assetId);
      if (!a) continue;
      const factor = a.moneda === "USD" ? mep : 1;
      const valArs = a.ultimo * pos.qty * factor;
      const costArs = pos.avgPrice * pos.qty * factor;
      const pnlPct = ((a.ultimo - pos.avgPrice) / pos.avgPrice) * 100;
      totalArs += valArs;
      totalCostArs += costArs;

      const row = document.createElement("div");
      row.className = "portfolio-row";
      row.innerHTML = `
        <div>
          <strong>${a.simbolo}</strong> <span class="col-muted">${a.nombre}</span>
          <div class="col-muted" style="font-size:12px;">${fmtNum(pos.qty, 0)} nominales · PPP: ${a.moneda} ${fmtPrice(pos.avgPrice, a.moneda)}</div>
        </div>
        <div style="text-align:right;">
          <div><strong>ARS $ ${fmtNum(valArs, 2)}</strong></div>
          <span class="var-pill ${pnlPct >= 0 ? "var-up" : "var-down"}" style="font-size:11.5px;">${pnlPct >= 0 ? "+" : ""}${fmtNum(pnlPct, 2)}%</span>
        </div>
        <button class="btn" type="button">Vender</button>
      `;
      row.querySelector("button").onclick = () => {
        portfolio = portfolio.filter((p) => p.assetId !== pos.assetId);
        updatePortfolioBadge();
        renderPortfolio();
        showToast(`Posición en ${a.simbolo} cerrada`);
      };
      listEl.append(row);
    }

    const totalPnl = totalArs - totalCostArs;
    const totalPnlPct = totalCostArs ? (totalPnl / totalCostArs) * 100 : 0;
    el("portfolioSummary").innerHTML = `
      <div class="kpi-box"><span>Valuación Total (ARS)</span><strong>$ ${fmtNum(totalArs, 2)}</strong></div>
      <div class="kpi-box"><span>Valuación Total (USD MEP)</span><strong>US$ ${fmtNum(totalArs / mep, 2)}</strong></div>
      <div class="kpi-box"><span>Resultado</span><strong style="color:${totalPnl >= 0 ? "var(--up)" : "var(--down)"}">${totalPnl >= 0 ? "+" : ""}${fmtNum(totalPnlPct, 2)}%</strong></div>
    `;
  }

  // ---------- Eventos UI ----------
  function bindEvents() {
    el("searchInput").oninput = (e) => {
      searchQuery = e.target.value;
      renderTable();
    };

    el("toggleFilters").onchange = (e) => {
      el("filtersBar").classList.toggle("hidden", !e.target.checked);
    };

    el("hideNoPrice").onchange = (e) => {
      hideNoPrice = e.target.checked;
      renderTable();
    };

    document.querySelectorAll("#currencyPills .pill").forEach((btn) => {
      btn.onclick = () => {
        activeCurrency = btn.dataset.currency;
        document.querySelectorAll("#currencyPills .pill").forEach((b) => b.classList.toggle("active", b === btn));
        renderTable();
      };
    });

    document.querySelectorAll("#plazoPills .pill").forEach((btn) => {
      btn.onclick = () => {
        activePlazo = btn.dataset.plazo;
        document.querySelectorAll("#plazoPills .pill").forEach((b) => b.classList.toggle("active", b === btn));
        renderTable();
      };
    });

    document.querySelectorAll("thead th[data-sort]").forEach((th) => {
      th.onclick = () => {
        const col = th.dataset.sort;
        if (sortCol === col) sortDir *= -1;
        else { sortCol = col; sortDir = col === "simbolo" ? 1 : -1; }
        renderTable();
      };
    });

    document.querySelectorAll("#timeframePills .pill").forEach((btn) => {
      btn.onclick = () => {
        activeTimeframe = btn.dataset.tf;
        document.querySelectorAll("#timeframePills .pill").forEach((b) => b.classList.toggle("active", b === btn));
        const a = assets.find((x) => x.id === selectedAssetId);
        if (a) drawSvgChart(a);
      };
    });

    el("btnToggleSim").onclick = () => {
      simActive = !simActive;
      el("btnToggleSim").textContent = simActive ? "⏸ Pausar ticks" : "▶ Reanudar ticks";
      el("marketStatus").textContent = simActive
        ? "Mercado en vivo (simulación activa)"
        : "Cotizaciones pausadas";
      el("liveDot").classList.toggle("paused", !simActive);
    };

    el("btnLiveApi").onclick = () => refreshPublicApis(false);

    el("btnTheme").onclick = () => {
      const dark = document.body.classList.toggle("dark");
      el("btnTheme").textContent = dark ? "☀️ Claro" : "🌙 Oscuro";
    };

    el("btnConverter").onclick = () => {
      renderConverter();
      el("converterModal").classList.add("open");
    };
    el("convAmount").oninput = renderConverter;
    el("convDir").onchange = renderConverter;

    el("btnPortfolio").onclick = () => {
      renderPortfolio();
      el("portfolioModal").classList.add("open");
    };

    el("btnAddAsset").onclick = () => el("addModal").classList.add("open");

    el("addForm").onsubmit = (e) => {
      e.preventDefault();
      const sym = el("newSym").value.trim().toUpperCase();
      const name = el("newName").value.trim().toUpperCase();
      const cat = el("newCat").value;
      const panel = el("newPanel").value.trim() || "General";
      const moneda = el("newMoneda").value;
      const ultimo = Number(el("newPrecio").value);
      const variacion = Number(el("newVar").value) || 0;
      const sector = el("newSector").value.trim() || "Personalizado";
      const cierre = Number((ultimo / (1 + variacion / 100)).toFixed(2));
      const nextId = Math.max(0, ...assets.map((a) => a.id)) + 1;

      const nuevo = {
        id: nextId,
        simbolo: sym,
        nombre: name,
        categoria: cat,
        panel,
        moneda,
        ultimo,
        variacion,
        cierre,
        cantCompra: 100,
        precioCompra: Number((ultimo * 0.995).toFixed(2)),
        precioVenta: Number((ultimo * 1.005).toFixed(2)),
        cantVenta: 100,
        minimo: Number((ultimo * 0.985).toFixed(2)),
        maximo: Number((ultimo * 1.015).toFixed(2)),
        volumen: 15000,
        monto: Math.round(ultimo * 15000),
        operaciones: 45,
        hora: nowTimeStr(),
        sector,
        infoExtra: "Agregado en memoria",
        color: "#1b36e3",
        seguido: true,
        historial: buildSeries(ultimo, variacion, 40),
      };

      assets.unshift(nuevo);
      activeCategory = cat;
      activePanel = "Todos";
      e.target.reset();
      el("addModal").classList.remove("open");
      renderAll();
      showToast(`${sym} agregado en memoria a ${cat}`);
    };

    // Cerrar modales
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.onclick = () => el(btn.dataset.close).classList.remove("open");
    });
    document.querySelectorAll(".modal-backdrop").forEach((bg) => {
      bg.onclick = (e) => {
        if (e.target === bg) bg.classList.remove("open");
      };
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-backdrop.open").forEach((m) => m.classList.remove("open"));
      }
    });
  }

  function renderAll() {
    renderFxStrip();
    renderCategoryTabs();
    renderPanelPills();
    renderTable();
    updatePortfolioBadge();
  }

  bindEvents();
  loadInitialData();
})();
