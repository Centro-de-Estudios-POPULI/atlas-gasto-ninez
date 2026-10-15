/* Atlas de la Niñez y la Adolescencia — utilidades compartidas: tema claro/oscuro, formato de cifras y el lenguaje de
   los gráficos ECharts (identidad 2, 13-oct-2026): Figtree en todo el gráfico, ejes y grilla en un hilo, barras apiladas
   sin hueco con un filete oscuro muy suave, líneas de 2 px con punto hueco, tooltip propio (título, clave de línea,
   valor fuerte a la derecha, total y unidad) y leyenda con el ícono de cada marca. */
(function () {
  const A = (window.Atlas = {});
  A.$ = (id) => document.getElementById(id);
  A.css = (v) => getComputedStyle(document.body).getPropertyValue(v).trim();
  A.fuente = "Figtree, system-ui, sans-serif";
  A.nf = (v, d = 0) => (v == null || !isFinite(v) ? "s/d" : Number(v).toLocaleString("es-BO", { minimumFractionDigits: d, maximumFractionDigits: d }));
  // la cifra y su unidad van unidas por un espacio duro: en el celular, «%» o «Bs» no quedan solos en otro renglón
  const NB = "\u00a0";
  A.bs = (v) => (v == null || !isFinite(v) ? "s/d" : "Bs" + NB + A.nf(v, 0));
  A.mm = (v) => (v == null || !isFinite(v) ? "s/d" : A.nf(v, v < 10 ? 2 : 1) + NB + "MM" + NB + "Bs");
  A.pc = (v, d = 1) => (v == null || !isFinite(v) ? "s/d" : A.nf(v, d) + NB + "%");
  A.esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // al pie de las tarjetas: «Bolivia: 13,9 %» y «puesto 3 de 9» no se parten (el renglón se corta en el «·»)
  A.juntos = (s) => String(s == null ? "" : s).replace(/: <b>/g, ":" + NB + "<b>").replace(/puesto (<b>)?(\d+)(<\/b>)? de (\d+)/g, `puesto${NB}$1$2$3${NB}de${NB}$4`);
  /* con menos de 50 casos en el denominador, la tasa de un municipio salta mucho: se raya en el mapa, no entra en
     los rankings ni en los puestos (el mismo umbral que usa 74_exportar_indicadores.py para el puesto entre los 343) */
  A.POCOS = 50;
  A.val = (v, unidad) => (unidad === "%" ? A.pc(v) : unidad === "por 1.000" ? A.nf(v, 1) : A.nf(v, 0));

  /* «uno de cada tres», «dos de cada diez»: la proporción dicha como la diría una persona */
  const N = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
  A.deCada = (p) => {
    if (p == null || !isFinite(p) || p <= 0) return null;
    if (p >= 15) {   // cerca de un décimo exacto, «tres de cada diez»; si no, «casi seis» o «más de cuatro»
      const x = p / 10, k = Math.round(x), d = x - k;
      if (k >= 10) return "casi todos";
      const t = k === 5 ? "la mitad" : `${N[k]} de cada diez`;
      return Math.abs(d) <= 0.2 ? t : d < 0 ? `casi ${t}` : `más de ${t}`;
    }
    const k = Math.round(100 / p);
    return k <= 10 ? `uno de cada ${N[k]}` : `uno de cada ${k}`;
  };

  /* tema: se recuerda en el navegador; si no hay preferencia guardada, sigue al sistema */
  const CLAVE = "atlas-ninez-tema";
  A.oscuro = () => document.body.classList.contains("dark");
  A.aplicarTema = (oscuro, guardar) => {
    document.body.classList.toggle("dark", oscuro);
    if (guardar) { try { localStorage.setItem(CLAVE, oscuro ? "dark" : "light"); } catch (_) {} }
  };
  let pref = null;
  try { pref = localStorage.getItem(CLAVE); } catch (_) {}
  const q = new URLSearchParams(location.search).get("tema");
  A.aplicarTema(q ? q === "dark" : pref ? pref === "dark" : matchMedia("(prefers-color-scheme: dark)").matches, false);

  /* color con transparencia, para atenuar marcas fuera del rango de edad de la ley */
  A.alfa = (hex, a) => {
    const h = String(hex).replace("#", "");
    if (h.length < 6) return hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${a})`;
  };
  /* el filete que separa segmentos que se tocan: un hilo oscuro muy suave, nunca un hueco blanco */
  A.filete = (k = 1) => (A.oscuro() ? `rgba(0,0,0,${0.5 * k})` : `rgba(45,32,12,${0.24 * k})`);

  /* ── tooltip ────────────────────────────────────────────────────────────────────────────────
     Una caja propia: título, una fila por serie (clave de línea con el color, nombre en gris, valor fuerte a la
     derecha), total y unidad al pie. Los nombres pasan por esc(): vienen de los datos. */
  A.tt = ({ titulo, filas = [], total, pie }) =>
    `<div class="tt-c">${titulo != null ? `<div class="tt-h">${A.esc(titulo)}</div>` : ""}` +
    filas.map((f) => `<div class="tt-r${f.fuerte ? " tt-fuerte" : ""}"><i class="tt-k${f.forma === "punto" ? " tt-p" : ""}" style="background:${f.color || "transparent"}"></i>` +
      `<span class="tt-n">${A.esc(f.nombre)}</span><b class="tt-v">${f.valor}</b></div>`).join("") +
    (total ? `<div class="tt-t"><span class="tt-n">${A.esc(total[0])}</span><b class="tt-v">${total[1]}</b></div>` : "") +
    (pie ? `<div class="tt-f">${pie}</div>` : "") + `</div>`;
  const colorDe = (p) => (typeof p.color === "string" ? p.color : (p.color && p.color.colorStops && p.color.colorStops[0].color) || A.css("--suave"));
  /* tooltip de eje: fmt(valor, serie) formatea cada valor; las apiladas se listan de arriba abajo, como se ven, y suman */
  A.tipEje = (fmt, o = {}) => (ps) => {
    ps = (Array.isArray(ps) ? ps : [ps]).filter((p) => p.value != null && p.value !== "" && !(Array.isArray(p.value) && p.value[1] == null) && p.seriesType !== "custom");
    if (!ps.length) return "";
    const f = fmt || ((v) => A.nf(v, Math.abs(v) < 10 ? 1 : 0));
    const apil = ps.length > 1 && ps.every((p) => p.seriesType === "bar") && o.apilado !== false;
    const filas = (apil ? ps.slice().reverse() : ps).map((p) => {
      const v = Array.isArray(p.value) ? p.value[p.encode && p.encode.y ? p.encode.y[0] : 1] : p.value;
      return { color: colorDe(p), nombre: p.seriesName, valor: f(v, p), forma: p.seriesType === "scatter" ? "punto" : "linea" };
    });
    let total = null;
    if (apil && o.total !== false && filas.length > 1) {
      const t = ps.reduce((s, p) => s + (+(Array.isArray(p.value) ? p.value[1] : p.value) || 0), 0);
      total = [o.totalNombre || "Total", f(t, null)];
    }
    return A.tt({ titulo: o.titulo ? o.titulo(ps) : ps[0].axisValueLabel ?? ps[0].name, filas, total, pie: typeof o.pie === "function" ? o.pie(ps) : o.pie });
  };
  /* tooltip de una marca (barra suelta, punto, celda): título + filas que arma quien llama */
  A.tipItem = (fn) => (p) => { const r = fn(p); return r == null ? "" : typeof r === "string" ? r : A.tt(r); };

  A.tooltip = (o = {}) => ({
    trigger: o.trigger || "axis", className: "tt", confine: true, enterable: false, transitionDuration: 0.12,
    backgroundColor: A.css("--superficie"), borderColor: A.css("--linea"), borderWidth: 1, padding: [10, 12],
    textStyle: { color: A.css("--tinta"), fontSize: 12, fontFamily: A.fuente },
    extraCssText: "border-radius:0;box-shadow:0 10px 28px -8px rgba(30,22,8,.28),0 1px 2px rgba(30,22,8,.08);",
    axisPointer: o.puntero === "sombra"
      ? { type: "shadow", shadowStyle: { color: A.alfa(A.oscuro() ? "#f1ece0" : "#582f0e", 0.06) } }
      : { type: "line", lineStyle: { color: A.css("--suave"), width: 1, opacity: 0.45 }, label: { show: false } },
    ...(o.formatter ? { formatter: o.formatter } : {}),
  });

  /* ── base de todos los gráficos ─────────────────────────────────────────────────────────── */
  A.base = () => ({
    textStyle: { fontFamily: A.fuente, color: A.css("--suave"), fontSize: 11.5 },
    animationDuration: 520, animationEasing: "cubicOut", animationDurationUpdate: 380, animationEasingUpdate: "cubicInOut",
    grid: { left: 6, right: 14, top: 38, bottom: 6, containLabel: true },
    tooltip: A.tooltip(),
    legend: { top: 2, left: 0, itemWidth: 14, itemHeight: 8, itemGap: 16, icon: "rect", type: "plain",
      textStyle: { color: A.css("--tinta"), fontSize: 12, fontFamily: A.fuente } },
  });
  const eje = () => ({ color: A.css("--suave"), fontFamily: A.fuente, fontSize: 11 });
  A.ejeX = (data) => ({ type: "category", data, axisLine: { lineStyle: { color: A.css("--linea") } }, axisTick: { show: false },
    axisLabel: { ...eje(), margin: 10 } });
  A.ejeY = (fmt) => ({ type: "value", splitNumber: 4, axisLine: { show: false }, axisTick: { show: false },
    splitLine: { lineStyle: { color: A.css("--grilla"), width: 1 } }, axisLabel: { ...eje(), formatter: fmt } });
  A.barra = (name, data, color, stack) => ({ name, type: "bar", stack, data, barMaxWidth: 30,
    itemStyle: { color, borderColor: A.filete(stack ? 1 : 0.6), borderWidth: stack ? 0.6 : 0.5 },
    emphasis: { focus: "series", itemStyle: { borderColor: A.css("--tinta"), borderWidth: 1 } }, blur: { itemStyle: { opacity: 0.32 } } });
  A.linea = (name, data, color, o = {}) => ({ name, type: "line", data, smooth: o.curva || false, smoothMonotone: "x",
    symbol: o.lleno ? "circle" : "emptyCircle", symbolSize: o.punto || 5, showSymbol: o.puntos !== false,
    connectNulls: false, lineStyle: { color, width: o.ancho || 2, type: o.trazo || "solid", cap: "round", join: "round" },
    itemStyle: { color, borderWidth: 1.6 }, emphasis: { focus: "series", scale: 1.5 }, blur: { lineStyle: { opacity: 0.25 } }, z: o.z || 2 });

  /* ── ajustes comunes a TODO gráfico, sin tocar el código de cada página ─────────────────────
     Se aplican al llamar setOption: (1) las barras apiladas dejan de separarse con un hueco del color de la superficie
     y pasan al filete oscuro; (2) la leyenda dibuja el ícono de cada marca (rectángulo para barras, línea para líneas,
     rayas para las punteadas, punto para dispersión); (3) un tooltip de eje sin formato propio usa la caja común;
     (4) el orden de las apiladas; (5) el cero de los ejes; (6) la leyenda en filas (ver cada uno abajo). */
  const ICONO = { linea: "path://M0,3.2h20v2.6H0z", raya: "path://M0,3.2h7v2.6H0zM10,3.2h7v2.6h-7z", punto: "circle" };
  const valorDe = (v) => (v == null ? 0 : typeof v === "number" ? v : Array.isArray(v) ? (+[...v].reverse().find((x) => typeof x === "number") || 0)
    : typeof v === "object" ? valorDe(v.value) : +v || 0);
  // sólo los restos genéricos («Otros», «Otras fuentes», «Otras 12 líneas»); «Otros recursos del TGN» es una fuente real
  const AL_FINAL = /^(otros|otras|otras fuentes|otros gastos|resto|varios|sin dato|sin clasificar)$|^(otros|otras) \d|^otras líneas menores/i;
  /* (4) regla de las apiladas: en cada pila, la serie más grande abajo y las demás encima por orden de importancia (la
     suma de todos sus valores); «Otros» y «Resto», siempre arriba. El color viaja con su serie, así que reordenar no
     repinta nada; si alguna serie de la pila no trae color propio, la pila se deja como vino. */
  function ordenarPilas(o, ser) {
    const pilas = new Map();
    ser.forEach((s, i) => { if (s && s.type === "bar" && s.stack != null && o.ordenarPilas !== false) (pilas.get(s.stack) || pilas.set(s.stack, []).get(s.stack)).push(i); });
    const nuevo = ser.slice();
    pilas.forEach((idx) => {
      const grupo = idx.map((i) => ser[i]);
      if (grupo.length < 2 || grupo.some((s) => !(s.itemStyle && s.itemStyle.color) && !s.color)) return;
      const peso = (s) => (Array.isArray(s.data) ? s.data.reduce((a, v) => a + Math.abs(valorDe(v)), 0) : 0);
      const orden = grupo.slice().sort((a, b) => (AL_FINAL.test(a.name || "") - AL_FINAL.test(b.name || "")) || (peso(b) - peso(a)));
      idx.forEach((pos, j) => { nuevo[pos] = orden[j]; });
    });
    return nuevo;
  }
  /* (5) el cero de un eje se escribe «0», no «0,0» ni «0,00 MM» (los formatos con decimales para cifras chicas) */
  const conCero = (f) => (f.__cero ? f : Object.assign((v, ...r) => {
    const t = f(v, ...r);
    return v === 0 && typeof t === "string" ? t.replace(/(^|[^\d.,])0,0+(?!\d)/, (m, a) => a + "0") : t;
  }, { __cero: true }));
  /* (6) la leyenda se parte en filas, nunca en páginas (en el celular, las flechas «◂ 1/4 ▸» escondían series); el área
     del gráfico y los textos de `graphic` anclados arriba bajan lo que crezca. Se mide con la letra real, como ECharts:
     ícono + 5 px + texto, y entre filas el alto de la fila más el mismo `itemGap`. */
  let lienzo = null;
  const anchoTexto = (A.anchoTexto = (t, font) => { lienzo = lienzo || document.createElement("canvas").getContext("2d"); lienzo.font = font; return lienzo.measureText(String(t)).width; });
  const ORIG = new WeakMap();   // los valores de partida de cada opción: volver a pulirla al cambiar el ancho no acumula
  function filasLeyenda(L, nombres, ancho, gap) {
    const ts = L.textStyle || {}, font = `${ts.fontWeight || 400} ${ts.fontSize || 12}px ${ts.fontFamily || A.fuente}`;
    const pad = typeof L.padding === "number" ? L.padding : 5, lado = (v) => (typeof v === "number" ? v : 0);
    const disp = ancho - lado(L.left) - lado(L.right) - 2 * pad;
    let filas = 1, x = 0;
    nombres.forEach((n) => {
      // con 3 % y 2 px de resguardo: si la cuenta queda justa, ECharts parte igual y la segunda fila pisaba el eje
      const w = (L.itemWidth ?? 25) + 5 + 1.03 * anchoTexto(typeof L.formatter === "function" ? L.formatter(n) : n, font) + 2;
      if (x > 0 && x + w > disp) { filas++; x = 0; }
      x += w + gap;
    });
    return filas;
  }
  /* y el contenedor crece lo mismo que la leyenda, para que el área de los datos conserve su alto (si no, en el celular
     la serie de la desagregación quedaba aplastada debajo de cuatro filas de leyenda); con una fila vuelve a su alto */
  function crecer(c, extra) {
    const dom = c.getDom && c.getDom();
    if (!dom || !dom.style) return false;
    const a = dom.__alto;
    if (!(a && dom.style.height === a.puesto)) {   // la página cambió el alto (o nunca lo tocamos): ese es el de partida
      if (!extra) return false;
      dom.__alto = { base: dom.clientHeight, estilo: dom.style.height };
    }
    const b = dom.__alto;
    if (!(b.base > 0)) return false;
    const quiero = extra > 0 ? `${Math.round(b.base + extra)}px` : b.estilo;
    if (dom.style.height === quiero) return false;
    dom.style.height = quiero; b.puesto = dom.style.height;
    return true;
  }
  function acomodarLeyenda(o, c, ser) {
    const L = o.legend, g = o.grid;
    if (!c || !L || Array.isArray(L) || L.show === false || L.type === "scroll" || L.orient === "vertical" || !g || Array.isArray(g)) return;
    const ancho = c.getWidth();
    if (!(ancho > 0)) { c.__leyenda = { o, filas: 1 }; return; }   // oculto: se mide cuando la página lo muestre y llame a resize
    let o0 = ORIG.get(o);
    if (!o0) { o0 = { top: g.top, bottom: g.bottom, gap: L.itemGap ?? 10, gr: [].concat(o.graphic || []).map((e) => [e, e && e.top]) }; ORIG.set(o, o0); }
    const nombres = (L.data || ser.map((s) => s && s.name)).map((d) => (d && typeof d === "object" ? d.name : d)).filter(Boolean);
    let gap = o0.gap, filas = filasLeyenda(L, nombres, ancho, gap);
    if (filas > 1) { gap = Math.min(gap, 12); filas = filasLeyenda(L, nombres, ancho, gap); }
    L.itemGap = gap;
    const extra = (filas - 1) * (Math.max(L.itemHeight ?? 14, (L.textStyle && L.textStyle.fontSize) || 12) + gap);
    if (L.top == null && L.bottom != null) { if (typeof o0.bottom === "number") g.bottom = o0.bottom + extra; }
    else if (typeof (o0.top ?? 38) === "number") {
      g.top = (o0.top ?? 38) + extra;
      // sólo los elementos que venían en la opción (si la página reemplazó uno, ya trae su lugar calculado)
      [].concat(o.graphic || []).forEach((e, k) => { const [e0, t0] = o0.gr[k] || []; if (e && e === e0 && typeof t0 === "number") e.top = t0 + extra; });
    }
    if (crecer(c, extra)) c.__crecio = true;
    c.__leyenda = { o, filas };
  }
  A.pulir = (o, c) => {
    if (!o || typeof o !== "object") return o;
    let ser = Array.isArray(o.series) ? o.series : o.series ? [o.series] : [];
    if (Array.isArray(o.series)) ser = o.series = ordenarPilas(o, ser);
    // el total de una pila (`rotuloPila` en cualquiera de sus series) va como rótulo de la ÚLTIMA serie, la de afuera:
    // pegado a otra, quedaba tapado por los segmentos que el orden de (4) le pone encima
    const afuera = new Map();
    ser.forEach((s) => { if (s && s.type === "bar" && s.stack != null) afuera.set(s.stack, s); });
    ser.forEach((s) => { if (s && s.rotuloPila && afuera.has(s.stack)) afuera.get(s.stack).label = s.rotuloPila; });
    const sup = A.css("--superficie").toLowerCase();
    ser.forEach((s) => {
      if (!s || s.type !== "bar" || !s.itemStyle) return;
      const bc = String(s.itemStyle.borderColor || "").toLowerCase();
      if (s.stack && (bc === sup || bc === "" || bc === "#fff" || bc === "#ffffff")) { s.itemStyle.borderColor = A.filete(); s.itemStyle.borderWidth = 0.6; }
    });
    const L = o.legend;
    if (L && !Array.isArray(L) && L.show !== false && !L.data && ser.length) {
      const vistos = new Set();
      L.data = ser.filter((s) => s && s.name && s.type !== "custom" && !vistos.has(s.name) && vistos.add(s.name)).map((s) => ({
        name: s.name,
        icon: s.type === "line" ? ((s.lineStyle && s.lineStyle.type) === "dashed" || (s.lineStyle && s.lineStyle.type) === "dotted" ? ICONO.raya : ICONO.linea)
          : s.type === "scatter" || s.type === "effectScatter" ? ICONO.punto : "rect",
      }));
    }
    const T = o.tooltip;
    if (T && !Array.isArray(T) && !T.formatter && (T.trigger || "axis") === "axis" && ser.length) T.formatter = A.tipEje(T.valueFormatter);
    // ejes de porcentaje con tope 100: cortes de 25 en 25 (si no, ECharts escribe 0, 30, 60, 90 y 100)
    [].concat(o.xAxis || [], o.yAxis || []).forEach((e) => {
      if (e && e.type === "value" && e.max === 100 && e.interval == null) e.interval = 25;
      if (e && e.axisLabel && typeof e.axisLabel.formatter === "function") e.axisLabel.formatter = conCero(e.axisLabel.formatter);
    });
    // cifra al final de la línea: sólo con una o dos series de tiempo y si los finales no quedan encimados
    const lin = ser.filter((s) => s && s.type === "line" && Array.isArray(s.data) && s.data.length >= 5 && !s.endLabel);
    const xs = [].concat(o.xAxis || []);
    if (lin.length && lin.length <= 2 && lin.length === ser.length && xs.length === 1 && xs[0].type === "category" && o.finLinea !== false) {
      const ult = lin.map((s) => { for (let i = s.data.length - 1; i >= 0; i--) { const v = s.data[i]; if (v != null && !(typeof v === "object")) return v; } return null; });
      const todos = lin.flatMap((s) => s.data.filter((v) => typeof v === "number"));
      const rango = Math.max(...todos) - Math.min(0, ...todos) || 1;
      const juntos = ult.length === 2 && ult[0] != null && ult[1] != null && Math.abs(ult[0] - ult[1]) < 0.08 * rango;
      const fmt = (T && T.valueFormatter) || ((v) => A.nf(v, Math.abs(v) < 10 ? 1 : 0));
      if (!juntos && ult.every((v) => v != null)) {
        lin.forEach((s) => { s.endLabel = { show: true, distance: 6, formatter: (p) => fmt(Array.isArray(p.value) ? p.value[1] : p.value),
          color: A.css("--tinta"), fontFamily: A.fuente, fontSize: 11, fontWeight: 650 }; });
        const g = o.grid || (o.grid = {});
        if (!Array.isArray(g)) g.right = Math.max(g.right || 0, 58);
      }
    }
    if (L) acomodarLeyenda(o, c, ser);
    return o;
  };
  if (window.echarts && !echarts.__atlas) {
    const init0 = echarts.init.bind(echarts);
    echarts.init = (...args) => {
      const c = init0(...args), so = c.setOption.bind(c), rs = c.resize.bind(c), cl = c.clear.bind(c);
      c.setOption = (o, ...r) => {
        const nueva = r[0] === true || (r[0] && r[0].notMerge);
        if (o && (o.legend || nueva)) { c.__leyenda = null; c.__leyendaR = r; }
        const p = A.pulir(o, c);
        if (nueva && o && !o.legend && crecer(c, 0)) c.__crecio = true;   // un gráfico nuevo sin leyenda: su alto de siempre
        if (c.__crecio) { c.__crecio = false; rs(); }
        return so(p, ...r);
      };
      c.clear = () => { c.__leyenda = null; return cl(); };
      // al cambiar el ancho, si la leyenda pasa a tener otro número de filas, se vuelve a dibujar con el área corrida
      c.resize = (...r) => {
        rs(...r);
        const s = c.__leyenda;
        if (!s) return;
        const antes = s.filas;
        acomodarLeyenda(s.o, c, Array.isArray(s.o.series) ? s.o.series : []);
        if (c.__crecio) { c.__crecio = false; rs(...r); }
        if (c.__leyenda.filas !== antes) so(s.o, ...(c.__leyendaR || []));
      };
      return c;
    };
    echarts.__atlas = true;
  }

  /* los gráficos se pintan cuando las fuentes ya cargaron: si no, ECharts mide las leyendas con la fuente de reserva */
  A.listo = (fn) => (document.fonts ? document.fonts.ready : Promise.resolve()).then(fn);

  /* navegación en el teléfono: una copia de la del encabezado, debajo de él (identidad.css decide cuándo se ve) */
  const nav = document.querySelector("#top nav"), top = document.getElementById("top");
  if (nav && top && !document.querySelector(".nav-movil")) { const m = nav.cloneNode(true); m.className = "nav-movil"; top.after(m); }
})();
