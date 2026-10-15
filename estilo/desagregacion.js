/* Atlas de la Niñez y la Adolescencia — desagregación dinámica del gasto de una entidad (alcaldía, gobernación o nivel
   central). Los datos los arma scripts/81_desagregacion_gasto.py: cada línea del presupuesto con su regla de
   clasificación, actividad, partida, organismo financiador, tipo (corriente o inversión) y los tres momentos.
   La página elige por qué camino abrir el gasto (las preguntas del documento MEFP-UNICEF 2017 y la de «para quién») y
   cada clic baja un nivel, hasta la línea del presupuesto. */
(function () {
  const A = window.Atlas;
  const { $, css, nf, base, ejeX, ejeY } = A;
  let DIC = null;
  const cargarDic = () => (DIC ? Promise.resolve(DIC) : fetch("datos/gasto/desagregado/dic.json").then((r) => r.json()).then((d) => (DIC = d)));

  /* cifras en bolivianos dichas como se leen */
  const bsCorto = (v) => {
    if (v == null || !isFinite(v)) return "s/d";
    const a = Math.abs(v);
    if (a >= 1e6) return "Bs " + nf(v / 1e6, a >= 1e8 ? 0 : 1) + " MM";
    if (a >= 1e3) return "Bs " + nf(v / 1e3, 0) + " mil";
    return "Bs " + nf(v, 0);
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* caminos para abrir el gasto: cada uno es una lista de dimensiones */
  /* caminos: `dims` en orden; las de `opc` aparecen sólo cuando suman algo en ese nodo (más de un hijo; el tipo de
     intervención, además, sólo cuando hay más de MIN_LINEAS líneas distintas). Una «línea» junta las actividades con el
     mismo nombre (la misma en varias entidades o programas); debajo, si son varias, las entidades.
     Las `q` primeras dimensiones responden la pregunta de la pestaña; las demás siguen ESA plata hasta la línea del
     presupuesto, y la lista lo dice (`luego`: «Qué pagó esta plata: por categoría»). */
  const VISTAS = {
    para: { t: "¿Para qué?", d: "Clase de gasto, categoría, programa o servicio, tipo de intervención y cada línea del presupuesto",
      dims: ["clase", "cat", "sub", "interv", "lin", "ent", "partida"], opc: ["interv", "ent", "partida"], q: 7 },
    en: { t: "¿En qué?", d: "Lo que se compra o se paga: personal, servicios, materiales, obras, transferencias",
      dims: ["grupo", "partida", "interv", "lin", "ent"], opc: ["interv", "ent"], q: 2, luego: "Para qué se usó" },
    con: { t: "¿Con qué recursos?", d: "Fuente y organismo financiador; después, qué pagó esa plata", dims: ["fuente", "organismo", "cat", "interv", "lin", "ent"],
      opc: ["organismo", "interv", "ent"], q: 2, luego: "Qué pagó esta plata" },   // el organismo, sólo si hay más de uno
    edad: { t: "¿Para quién?", d: "El tramo de edad al que va el programa", dims: ["ciclo", "cat", "sub", "interv", "lin", "ent"], opc: ["interv", "ent"], q: 1, luego: "Qué se pagó para este tramo" },
    como: { t: "¿Gasto corriente o inversión?", d: "Funcionamiento de cada año o proyectos de inversión", dims: ["tipo", "cat", "interv", "lin", "ent"], opc: ["interv", "ent"], q: 1, luego: "Qué pagó este gasto" },
    ent: { t: "¿Qué entidad?", d: "La gobernación, la región autónoma y sus entidades descentralizadas", dims: ["ent", "cat", "sub", "interv", "lin"], opc: ["interv"], q: 1, luego: "Qué pagó esta entidad" },
    ter: { t: "¿Quién gasta en el territorio?", d: "Alcaldía, gobernación y nivel central (estimación)", dims: ["nivel", "cat", "sub"], opc: [], q: 1, luego: "Qué pagó este nivel" },
  };
  const MIN_LINEAS = 8;
  /* el organismo financiador dice algo propio sólo en los créditos y donaciones (el banco o el país que presta o dona) y
     en «Otros»; en el Tesoro, la coparticipación, el IDH, las regalías y los recursos propios es el mismo origen con otro
     nombre (en El Alto, «Tesoro General de la Nación» 99,6 %): ahí se salta y se pasa a lo que pagó esa plata */
  const ORG_DICE = new Set(["Crédito y donación", "Otros"]);
  const NOMBRE_DIM = { clase: "clase de gasto", cat: "categoría", sub: "programa o servicio", lin: "línea del presupuesto", partida: "partida",
    interv: "tipo de intervención", grupo: "objeto del gasto", fuente: "fuente", organismo: "organismo financiador", ciclo: "tramo de edad",
    tipo: "tipo de gasto", ent: "entidad", nivel: "nivel del Estado" };
  const ORDEN_CLASE = { "Específico": 0, "Indirecto": 1, "Ampliado": 2 };
  const TRAMO_POB = { 0: "0_5", 1: "6_11", 2: "12_17" };   // índices de dic.ciclos con población propia

  A.Desagregar = function (cont, opt) {
    /* opt: url, quien («la alcaldía»), vistas (claves de VISTAS), anio (índice), alCambiarAnio(i), especifico(año): lo
       que la página muestra como gasto específico por niño ese año (para el puente con indirecto y ampliado),
       vistaInicial: la pregunta con que abre, si no es la primera (el nivel central abre en «¿Para quién?»),
       fuenteNombres: otro nombre para una fuente en esta entidad (en el nivel central, «Otros del TGN» es el Tesoro) */
    const st = { vista: opt.vistaInicial || opt.vistas[0], camino: [], clases: opt.clases || "esp", medida: "dev", unidad: "bs", anio: opt.anio, verTodas: false };
    let D = null, chM = null, chS = null, INFO = [], ULTIMO = null;   // ULTIMO: el nodo pintado (abrir usa su dimensión)
    cont.classList.add("dg");
    cont.innerHTML = `
      <div class="dg-vistas selector" role="group" aria-label="Mirar el gasto por">${opt.vistas.map((k) => `<button data-v="${k}" title="${VISTAS[k].d}">${VISTAS[k].t}</button>`).join("")}</div>
      <div class="dg-op">
        <span class="selector dg-clases" role="group" aria-label="Qué gasto entra">
          <button data-c="esp" title="Sólo programas dirigidos a niñas, niños y adolescentes">Sólo específico</button>
          <button data-c="todo" title="Suma la parte que les llega de los programas para la madre y el niño, la familia y toda la población">Con indirecto y ampliado</button></span>
        <label>Medida <select class="dg-medida"><option value="dev">Lo gastado (devengado)</option><option value="vig">Presupuesto final (vigente)</option><option value="ini">Presupuesto aprobado (inicial)</option></select></label>
        <label>Unidad <select class="dg-unidad"><option value="bs">Bolivianos de 2025</option><option value="nino">Bolivianos por niño</option><option value="pct">% del total</option></select></label>
      </div>
      <nav class="dg-miga" aria-label="Dónde estás"></nav>
      <div class="dg-kpis"></div>
      <p class="dg-puente"></p>
      <div class="dg-cuerpo">
        <div><div class="dg-mapa" role="img" aria-label="Mapa de rectángulos del gasto: el tamaño de cada uno es su monto"></div><p class="dg-pista">Tocá un rectángulo o una fila para abrirlo.</p></div>
        <div class="dg-lista-c"><div class="gt dg-lista-t"></div><ol class="dg-lista"></ol></div>
      </div>
      <div class="gt dg-serie-t"></div>
      <div class="g dg-serie"></div>
      <p class="nota dg-nota"></p>`;
    const q = (s) => cont.querySelector(s);

    /* ── etiquetas de cada dimensión para una fila ───────────────────────────────────────── */
    function clave(dim, f) {
      const R = DIC.reglas[f[1]];
      switch (dim) {
        case "clase": return R.clase;
        case "cat": return R.cat;
        case "sub": return R.sub;
        case "lin": return "l" + D.act[f[2]][3];
        case "interv": return D.lin[D.act[f[2]][3]][1];
        case "partida": return DIC.partidas[f[3]][0];
        case "grupo": return DIC.partidas[f[3]][2];
        case "fuente": return DIC.fuentes[DIC.organismos[f[4]][1]];
        case "organismo": return DIC.organismos[f[4]][0];
        case "ciclo": return D.act[f[2]][2];
        case "tipo": return f[5] ? "Inversión (proyectos)" : "Gasto corriente";
        case "ent": return D.ent[D.act[f[2]][1]];
      }
    }
    function etiqueta(dim, k) {
      if (dim === "lin") { const i = +k.slice(1), x = INFO[i]; return { n: D.lin[i][0], s: x.ent.size > 1 ? `en ${x.ent.size} entidades` : x.prog.size > 1 ? `en ${x.prog.size} programas`
        : D.prog[[...x.prog][0]] + (D.ent.length > 1 ? " · " + D.ent[[...x.ent][0]] : "") }; }
      if (dim === "interv") { const t = DIC.tipos[k]; return { n: t[1], s: t[2] }; }
      if (dim === "partida") { const p = DIC.partidas.find((x) => x[0] === k); return { n: p ? p[1] : k, s: /0000$/.test(k) ? "Líneas menores juntadas" : "Partida " + k }; }
      if (dim === "grupo") { const g = DIC.grupos[k]; return { n: g.n, s: g.oficial }; }
      if (dim === "ciclo") return { n: DIC.ciclos[k], s: "" };
      if (dim === "nivel") return { n: (opt.niveles || DIC.niveles)[k], s: "" };
      if (dim === "sub") { const r = DIC.reglas.find((x) => x.sub === k); return { n: k, s: r ? r.criterio : "" }; }
      if (dim === "fuente") {
        // «Otros del TGN» se llama por lo que es: en alcaldías y gobernaciones, plata del Tesoro que les gira el nivel
        // central (como en los gráficos del sitio); en el nivel central, el Tesoro mismo (opt.fuenteNombres)
        const propio = (opt.fuenteNombres || {})[k];
        if (propio) return { n: propio, s: "" };
        return k === "Otros del TGN" ? { n: "Transferencias del nivel central", s: "Plata del Tesoro que le gira el nivel central (sin coparticipación ni IDH)" } : { n: k, s: "" };
      }
      if (dim === "clase") return { n: k, s: { "Específico": "Programas sólo para niñas, niños y adolescentes", "Indirecto": "Programas para la madre y el niño o para la familia: cuenta la parte que les llega", "Ampliado": "Programas para toda la población: cuenta la parte de los menores de 18" }[k] };
      return { n: k, s: "" };
    }

    /* ── agregación ──────────────────────────────────────────────────────────────────────── */
    const conTodo = () => st.clases === "todo";
    const entra = (R) => conTodo() || R.clase === "Específico";
    // valor de una fila en la medida elegida: bruto si sólo específico (peso 1), ponderado si entra todo
    function valor(f) {
      const m = st.medida === "dev" ? f[8] : st.medida === "vig" ? f[7] : f[6];
      return m * (f.length > 9 ? f[9] : 1);
    }
    function filasAnio(y) {
      if (st.vista === "ter") {
        // territorio: [año, nivel, regla, llave, monto ponderado]
        return D.ter.filter((t) => t[0] === y && entra(DIC.reglas[t[2]]));
      }
      return D.filas.filter((f) => f[0] === y && entra(DIC.reglas[f[1]]));
    }
    function claveFila(dim, f) {
      if (st.vista !== "ter") return clave(dim, f);
      const R = DIC.reglas[f[2]];
      return dim === "nivel" ? f[1] : dim === "cat" ? R.cat : R.sub;
    }
    const valFila = (f) => (st.vista === "ter" ? f[4] : valor(f));
    const dims = () => {
      let d = VISTAS[st.vista].dims.slice();
      if (!conTodo() && d[0] === "clase") d = d.slice(1);   // con una sola clase, ese nivel sobra
      return d;
    };
    function filtrar(F, camino) { camino.forEach(({ d, k }) => { F = F.filter((f) => String(claveFila(d, f)) === String(k)); }); return F; }
    function siguiente(F, camino) {
      // la dimensión que abre este nodo: la primera de la vista, después de la última usada, que no sobre acá
      const ds = dims(), opc = VISTAS[st.vista].opc || [];
      const desde = camino.length ? ds.indexOf(camino[camino.length - 1].d) + 1 : 0;
      for (let i = desde; i < ds.length; i++) {
        const d = ds[i];
        if (!opc.includes(d)) return d;
        if (new Set(F.map((f) => String(claveFila(d, f)))).size <= 1) continue;
        if (d === "interv" && new Set(F.map((f) => D.act[f[2]][3])).size <= MIN_LINEAS) continue;
        if (d === "organismo" && !camino.some((c) => c.d === "fuente" && ORG_DICE.has(String(c.k)))) continue;
        return d;
      }
      return null;
    }
    function nodo(y, dimFija) {
      // filas del nodo actual (las que cumplen el camino) y sus hijos agregados; `dimFija` mantiene la del año elegido
      const F = filtrar(filasAnio(y), st.camino);
      const dim = dimFija !== undefined ? dimFija : siguiente(F, st.camino);
      const hijos = new Map();
      let tot = 0, vig = 0, dev = 0, rep = 0;
      F.forEach((f) => {
        const v = valFila(f); tot += v;
        if (st.vista !== "ter") { const w = f.length > 9 ? f[9] : 1; vig += f[7] * w; dev += f[8] * w; }
        else if (f[3]) rep += f[4];
        if (dim) {
          const k = claveFila(dim, f);
          const h = hijos.get(k) || { k, v: 0, vig: 0, dev: 0, rep: 0, F: [] };
          h.v += v; h.F.push(f);
          if (st.vista !== "ter") { const w = f.length > 9 ? f[9] : 1; h.vig += f[7] * w; h.dev += f[8] * w; } else if (f[3]) h.rep += f[4];
          hijos.set(k, h);
        }
      });
      let H = [...hijos.values()].filter((h) => Math.abs(h.v) >= 1);
      H.forEach((h) => (h.abre = !!siguiente(h.F, st.camino.concat([{ d: dim, k: h.k }]))));
      if (dim === "clase") H.sort((a, b) => ORDEN_CLASE[a.k] - ORDEN_CLASE[b.k]); else H.sort((a, b) => b.v - a.v);
      return { F, dim, H, tot, vig, dev, rep, hoja: !dim };
    }

    /* unidad: bolivianos de 2025, por niño (o por niño del tramo) o % del total del nodo */
    function poblacion(y, k) {
      // en «¿para quién?», los tramos con población propia se dividen por ella; lo demás, por la de 0 a 17
      const ciclo = st.vista === "edad" ? (st.camino.length ? st.camino[0].k : k) : null;
      const pk = ciclo != null && TRAMO_POB[ciclo] && D.pob_tramos ? D.pob_tramos[TRAMO_POB[ciclo]] : null;
      return (pk ? pk[y] : D.pob[y]) || null;
    }
    const divisor = (y, k) => (st.unidad === "nino" ? poblacion(y, k) : 1);
    const real = (v, y) => v * (D.deflactor[y] || 1);
    function enUnidad(v, y, k, tot) {
      if (st.unidad === "pct") return tot ? 100 * v / tot : null;
      const d = divisor(y, k);
      return d ? real(v, y) / d : null;
    }
    const fmtU = (x) => (x == null ? "s/d" : st.unidad === "pct" ? A.pc(x) : st.unidad === "nino" ? "Bs " + nf(x, x < 10 ? 1 : 0) : bsCorto(x));
    const unidadTxt = () => (st.unidad === "pct" ? "% del total" : st.unidad === "nino" ? "bolivianos de 2025 por niño" : "bolivianos de 2025");
    const medidaTxt = () => ({ dev: "lo gastado", vig: "el presupuesto final", ini: "el presupuesto aprobado" })[st.medida];

    /* ── pintura ─────────────────────────────────────────────────────────────────────────── */
    /* nombres largos, acortados sólo dentro de los rectángulos (la lista conserva el nombre completo) */
    const corto = (n) => { n = String(n).replace(/^Direc\. Dptal\. de Educación /, "DDE ").replace(/^Gobierno Autónomo Departamental de /, "Gobernación de ")
      .replace(/^Gobierno Autónomo Regional del /, "Región del ").replace(/^Ministerio de /, "Min. de ").replace(/^Servicio Departamental de /, "Serv. Dptal. de ");
      return n.length > 46 ? n.slice(0, 44) + "…" : n; };
    /* oliva continua: el mayor en el tono más fuerte y cada uno un paso más suave (más oscuro = más bolivianos; en el
       tema oscuro la rampa del sitio ya viene invertida) */
    const hex2rgb = (h) => { h = String(h).replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
    function rampa(n) {
      const t = ["--o7", "--o6", "--o5", "--o4", "--o3", "--o2"].map((v) => hex2rgb(css(v)));
      return Array.from({ length: n }, (_, i) => {
        const x = n <= 1 ? 0 : (i / (n - 1)) * (t.length - 1), a = Math.floor(x), b = Math.min(t.length - 1, a + 1), f = x - a;
        return "#" + t[a].map((c, k) => Math.round(c + (t[b][k] - c) * f).toString(16).padStart(2, "0")).join("");
      });
    }
    /* texto sobre cada rectángulo según la luminosidad real del fondo */
    const CLARO = "#fbfaf6", OSCURO = "#1f2318";
    const sobreFondo = (fondoOscuro) => (fondoOscuro ? CLARO : OSCURO);
    const lumin = (hex) => { const [r, g, b] = hex2rgb(hex).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const textoPara = (fondo) => sobreFondo(lumin(fondo) < 0.28);
    const textoSobre = (i, n) => textoPara(rampa(Math.max(n, 1))[Math.min(i, Math.max(n, 1) - 1)]);

    /* el puente con la cifra del resto de la página: con indirecto y ampliado, el total por niño se parte en sus tres
       clases, y lo específico es la misma cifra que la página usa arriba (la gobernación de Potosí en 2025: los Bs 1.105
       del desglose son los Bs 351 del capítulo, más Bs 3 de indirecto y Bs 751 de ampliado) */
    function puente(N, y) {
      const p = D.pob[y];
      if (!p || !N.tot) return "";
      const por = { "Específico": 0, "Indirecto": 0, "Ampliado": 0 }, sub = new Map();
      N.F.forEach((f) => { const R = DIC.reglas[f[1]], v = valor(f); por[R.clase] += v;
        if (R.clase === "Ampliado") sub.set(R.sub, (sub.get(R.sub) || 0) + v); });
      const porNino = (v) => real(v, y) / p;
      // redondeadas, las tres partes suman lo mismo que el total redondeado (la diferencia va a la mayor). Lo específico
      // es, tal cual, la cifra que muestra la página (opt.especifico): sus series por niño vienen redondeadas de otra
      // cadena y pueden diferir en un boliviano de la suma de estas líneas; lo absorbe el ampliado
      const ks = Object.keys(por), r = ks.map((k) => Math.round(porNino(por[k]))), total = Math.round(porNino(N.tot));
      const pag = st.medida === "dev" && typeof opt.especifico === "function" ? opt.especifico(D.anios[y]) : null;
      const usa = pag != null && isFinite(pag) && Math.abs(Math.round(pag) - r[0]) <= 1 && (r[1] > 0 || r[2] > 0);
      if (usa) r[0] = Math.round(pag);
      const dif = total - r.reduce((a, b) => a + b, 0);
      if (dif) { const c = usa ? [1, 2] : [0, 1, 2]; r[c.reduce((m, i) => (r[i] > r[m] ? i : m), c[0])] += dif; }
      const V = Object.fromEntries(ks.map((k, i) => [k, r[i]]));
      const sw = (k) => `<i class="dg-sw" style="background:${css(["--o7", "--o5", "--o3"][ORDEN_CLASE[k]])}"></i>`;
      const top = [...sub.entries()].sort((a, b) => b[1] - a[1])[0];
      const sobre = top && por["Ampliado"] > 0 && top[1] / por["Ampliado"] >= 0.5 ? `, sobre todo ${esc(top[0].charAt(0).toLowerCase() + top[0].slice(1))}` : "";
      const partes = [`${sw("Específico")}<b>${A.bs(V["Específico"])}</b> son de programas sólo para la niñez (lo específico${usa ? ", la cifra que usa el resto de la página" : ""})`];
      if (V["Indirecto"] > 0) partes.push(`${sw("Indirecto")}<b>${A.bs(V["Indirecto"])}</b>, la parte que les llega de los programas para la madre y el niño o la familia`);
      if (V["Ampliado"] > 0) partes.push(`${sw("Ampliado")}<b>${A.bs(V["Ampliado"])}</b>, su parte de los programas para toda la población${sobre}`);
      const lista = partes.length === 1 ? partes[0] : partes.slice(0, -1).join("; ") + (partes.length > 2 ? "; y " : " y ") + partes[partes.length - 1];
      return `De los <b>${A.bs(total)}</b> por niña, niño o adolescente, ${lista}.`;
    }

    /* de dónde viene «Otros del TGN» (alcaldías y gobernaciones): el presupuesto de la entidad sólo dice «Tesoro General
       de la Nación»; quién se lo mandó lo dice el del nivel central (81: `transf`). Se muestra al mirar los recursos o la
       inversión: en las alcaldías, la mayor parte de lo que invierten en escuelas llega así (sobre todo de la UPRE) */
    function tesoro(raiz, y) {
      const enCamino = st.camino.length === 1 && ((st.camino[0].d === "fuente" && st.camino[0].k === "Otros del TGN") || (st.camino[0].d === "tipo" && /Inversión/.test(st.camino[0].k)));
      if (!D.transf || !["con", "como"].includes(st.vista) || (st.camino.length && !enCamino)) return "";
      const R = D.transf[String(y)] || [], rec = R.reduce((a, r) => a + r[1], 0);
      let inv = 0, invT = 0, usaT = 0;
      raiz.F.forEach((f) => { const v = valor(f), t = clave("fuente", f) === "Otros del TGN";
        if (t) usaT += v; if (f[5]) { inv += v; if (t) invT += v; } });
      if (!rec && !usaT) return "";
      const Y = D.anios[y], quien = opt.quien || "la entidad";
      const lista = R.slice(0, 3).map((r) => `<b>${bsCorto(r[1])}</b> ${esc(r[0])}`), resto = R.slice(3).reduce((a, r) => a + r[1], 0);
      if (resto) lista.push(`${bsCorto(resto)} de otras entidades`);
      const enum_ = lista.length > 1 ? lista.slice(0, -1).join(", ") + " y " + lista[lista.length - 1] : lista[0];
      let t = `«Transferencias del nivel central» es plata del Tesoro (sin coparticipación ni IDH) que el nivel central le gira a ${quien}: su presupuesto la registra como «Tesoro General de la Nación». `;
      t += rec ? `En ${Y} recibió <b>${bsCorto(rec)}</b> así, para todos sus proyectos y no sólo los de la niñez: ${enum_}.`
        : `En ${Y} el nivel central no le registró transferencias del Tesoro: lo que gastó así puede venir de las de años anteriores.`;
      if (inv > 0 && invT > 0) t += ` Con esa plata pagó el <b>${A.pc(100 * invT / inv, 0)}</b> de lo que invirtió en la niñez.`;
      return t;
    }

    function pintar() {
      if (!D) return;
      const y = st.anio, Y = D.anios;
      if (st.vista === "ter" && st.medida !== "dev") { st.medida = "dev"; q(".dg-medida").value = "dev"; }
      q(".dg-medida").disabled = st.vista === "ter";
      cont.querySelectorAll(".dg-vistas button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === st.vista));
      cont.querySelectorAll(".dg-clases button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.c === st.clases));
      const N = nodo(y), raiz = (() => { const c = st.camino; st.camino = []; const r = nodo(y); st.camino = c; return r; })();

      // miga de pan
      const raizN = st.vista === "ter" ? opt.quienTer || "Todo el Estado" : opt.quien[0].toUpperCase() + opt.quien.slice(1);
      const miga = [`<button data-n="0">${esc(raizN)}, ${Y[y]}</button>`].concat(st.camino.map(({ d, k }, n) => {
        const e = etiqueta(d, k); return `<span aria-hidden="true">›</span><button data-n="${n + 1}" title="${esc(e.s || "")}">${esc(e.n)}</button>`; }));
      q(".dg-miga").innerHTML = miga.join("");
      q(".dg-miga").querySelectorAll("button").forEach((b) => (b.onclick = () => { st.camino = st.camino.slice(0, +b.dataset.n); st.verTodas = false; pintar(); }));

      // cifras del nodo
      const ult = st.camino[st.camino.length - 1];
      const tit = ult ? etiqueta(ult.d, ult.k).n : raizN;
      const k0 = st.camino.length ? st.camino[0].k : null;
      const div = poblacion(y, k0);
      const ejec = st.vista !== "ter" && N.vig > 0 ? 100 * N.dev / N.vig : null;
      const kp = [
        [st.vista === "ter" ? "Gastado en el territorio" : medidaTxt()[0].toUpperCase() + medidaTxt().slice(1), bsCorto(real(N.tot, y)), "bolivianos de 2025"],
        ["Por cada niña, niño o adolescente", div ? "Bs " + nf(real(N.tot, y) / div, 0) : "s/d", st.vista === "edad" && TRAMO_POB[k0] ? "de " + DIC.ciclos[k0].replace(/.*\((.*)\)/, "$1") + " años" : "de 0 a 17 años"],
        st.vista === "ter" ? ["Estimado por reparto", raiz.tot ? A.pc(100 * N.rep / (N.tot || 1)) : "s/d", "el resto es dato del presupuesto"]
          : ["Ejecución", ejec == null ? "s/d" : A.pc(ejec, 0), "lo gastado ÷ el presupuesto final"],
        st.vista === "ter" && !st.camino.length ? [opt.alcaldiasTxt || "Lo ejecuta la alcaldía", (() => { const a = N.H.find((h) => h.k === 0); return a && N.tot ? A.pc(100 * a.v / N.tot) : "s/d"; })(), "el resto, la gobernación y el nivel central"]
          : st.camino.length ? ["Parte del total", raiz.tot ? A.pc(100 * N.tot / raiz.tot) : "s/d", `de todo lo ${(st.vista === "ter" ? "de todo el Estado en el territorio" : "de " + opt.quien).replace(/^de el /, "del ")} en ${Y[y]}`]
          : opt.totalEntidad && D.gasto_total && D.gasto_total[y] && st.vista !== "ter" ? ["Parte de su presupuesto", A.pc(100 * N.dev / D.gasto_total[y]), `de todo lo que gastó ${opt.quien}`] : ["Líneas del presupuesto", nf(N.F.length), "con gasto en el año"],
      ];
      q(".dg-kpis").innerHTML = kp.map(([l, v, u]) => `<div class="dg-kpi"><div class="kl">${l}</div><div class="kv">${v}</div><div class="ku">${u}</div></div>`).join("");
      const lineas = [conTodo() && st.vista !== "ter" && !st.camino.length ? puente(N, y) : "", tesoro(raiz, y)].filter(Boolean);
      q(".dg-puente").innerHTML = lineas.map((l) => `<span class="dg-pl">${l}</span>`).join("");

      // hijos: mapa de rectángulos y lista
      const H = N.H, MAX = 24;
      const top = H.slice(0, MAX), resto = H.slice(MAX);
      const restoV = resto.reduce((s, h) => s + h.v, 0);
      const cols = rampa(top.length);
      const NIVC = ["--alcaldia", "--gobernacion", "--central"];
      const colorDe = (h, i) => (N.dim === "clase" ? css(["--o7", "--o5", "--o3"][ORDEN_CLASE[h.k]]) : N.dim === "nivel" ? css(NIVC[h.k]) : cols[i]);
      const textoDe = (h, i) => textoPara(colorDe(h, i));
      const datos = top.map((h, i) => ({ name: etiqueta(N.dim, h.k).n, value: Math.max(h.v, 0), k: h.k, h, itemStyle: { color: colorDe(h, i) }, label: { color: textoDe(h, i) } }));
      if (restoV > 0) datos.push({ name: N.dim === "lin" ? `Otras ${resto.length} líneas` : `Otros ${resto.length}`, value: restoV, k: null, itemStyle: { color: css("--otros") }, label: { color: css("--tinta") } });
      if (!N.hoja && datos.length) {
        chM.setOption({
          tooltip: { ...base().tooltip, trigger: "item", formatter: A.tipItem((p) => {
            const d = p.data, h = d.h, e = d.k != null ? etiqueta(N.dim, d.k) : { n: d.name, s: "" };
            const filas = [{ nombre: unidadTxt()[0].toUpperCase() + unidadTxt().slice(1), valor: fmtU(enUnidad(d.value, y, d.k, N.tot)), color: p.color },
              { nombre: `Parte de ${tit}`, valor: A.pc(100 * d.value / (N.tot || 1)) }];
            if (h && h.vig > 0 && st.vista !== "ter") filas.push({ nombre: "Ejecución", valor: A.pc(100 * h.dev / h.vig, 0) });
            if (h && st.vista === "ter" && h.v) filas.push({ nombre: "Estimado por reparto", valor: A.pc(100 * h.rep / h.v, 0) });
            return { titulo: e.n, filas, pie: e.s ? A.esc(e.s) : null };
          }) },
          series: [{ id: "dg", type: "treemap", data: datos, roam: false, nodeClick: false, breadcrumb: { show: false }, width: "100%", height: "100%", top: 0, left: 0,
            squareRatio: 0.9, animationDurationUpdate: 500,
            itemStyle: { borderColor: css("--superficie"), borderWidth: 1, gapWidth: 1 },
            label: { show: true, formatter: (p) => (p.value / (N.tot || 1) < 0.035 ? "" : `{n|${corto(p.name)}}\n{v|${A.pc(100 * p.value / (N.tot || 1), 0)}}`), overflow: "truncate", ellipsis: "…",
              rich: { n: { fontFamily: "Figtree", fontSize: 12.5, fontWeight: 600, lineHeight: 17 }, v: { fontFamily: "Figtree", fontSize: 12, lineHeight: 17 } }, position: "insideTopLeft", padding: [6, 8] },
            emphasis: { itemStyle: { borderColor: css("--acento") } }, levels: [{ itemStyle: { borderWidth: 0, gapWidth: 1 } }] }],
        }, true);
        q(".dg-mapa").style.display = ""; q(".dg-pista").style.display = "";
      } else {
        chM.clear(); q(".dg-mapa").style.display = "none"; q(".dg-pista").style.display = "none";
      }

      // lista
      const lista = st.verTodas ? H : H.slice(0, 12);
      const vmax = Math.max(...H.map((h) => Math.abs(enUnidad(h.v, y, h.k, N.tot) || 0)), 1e-9);
      const V = VISTAS[st.vista], respondida = V.luego && !V.dims.slice(0, V.q).includes(N.dim);
      q(".dg-lista-t").textContent = N.hoja ? "" : respondida ? `${V.luego}: por ${NOMBRE_DIM[N.dim]}, ${unidadTxt()}` : `Por ${NOMBRE_DIM[N.dim]}, ${unidadTxt()}`;
      q(".dg-lista").innerHTML = N.hoja ? `<li class="dg-vacio">Esta es la línea más fina del presupuesto: ${esc(tit)}.</li>`
        : !H.length ? `<li class="dg-vacio">Sin gasto${conTodo() ? "" : " específico"} en ${Y[y]}.</li>`
        : lista.map((h, i) => {
          const e = etiqueta(N.dim, h.k), x = enUnidad(h.v, y, h.k, N.tot), ej = h.vig > 0 && st.vista !== "ter" ? ` · ejec. ${A.pc(100 * h.dev / h.vig, 0)}` : "";
          const abre = h.abre;
          return `<li><button class="dg-fila" data-k="${esc(h.k)}" ${abre ? "" : 'data-hoja="1"'}>
            <span class="dg-n">${esc(e.n)}${e.s && !["sub", "clase", "interv"].includes(N.dim) ? `<small>${esc(e.s)}</small>` : ""}</span>
            <span class="dg-b"><i style="width:${Math.max(0.5, 100 * Math.abs(x || 0) / vmax)}%"></i></span>
            <span class="dg-v">${fmtU(x)}<small>${A.pc(100 * h.v / (N.tot || 1), 1)}${ej}</small></span></button></li>`; }).join("")
          + (H.length > 12 ? `<li><button class="dg-mas">${st.verTodas ? "Ver sólo las 12 mayores" : `Ver las ${H.length} (${H.length - 12} más)`}</button></li>` : "");
      q(".dg-lista").querySelectorAll(".dg-fila").forEach((b) => (b.onclick = () => { if (b.dataset.hoja) return; abrir(b.dataset.k); }));
      ULTIMO = N;
      const mas = q(".dg-mas"); if (mas) mas.onclick = () => { st.verTodas = !st.verTodas; pintar(); };

      // serie 2016-2025 del nodo, apilada por sus 5 hijos más grandes en TODO el período (no sólo en el año elegido: si
      // no, lo que pesó en otro año —el bono Renueva de El Alto en 2021, Bs 75 MM— se iba entero a «Otros»)
      const series = [], porAnio = Y.map((_, j) => nodo(j, N.dim));
      const sumas = new Map();   // clave → [clave, bolivianos de 2025 sumados en los diez años]
      porAnio.forEach((n, j) => n.H.forEach((h) => { const s = sumas.get(String(h.k)) || [h.k, 0]; s[1] += Math.abs(real(h.v, j)); sumas.set(String(h.k), s); }));
      const keys = [...sumas.values()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
      const tope = (j) => porAnio[j].tot;
      const colS = N.dim === "nivel" ? keys.map((k) => css(NIVC[k])) : N.dim === "clase" ? keys.map((k) => css(["--o7", "--o5", "--o3"][ORDEN_CLASE[k]])) : rampa(Math.max(keys.length, 1));
      keys.forEach((k, i) => series.push(A.barra(etiqueta(N.dim, k).n, porAnio.map((n, j) => { const h = n.H.find((x) => String(x.k) === String(k)); return h ? enUnidad(h.v, j, k, tope(j)) : null; }), colS[i], "s")));
      const hayOtros = porAnio.some((n) => n.H.some((h) => !keys.some((k) => String(k) === String(h.k))));
      if (hayOtros || N.hoja) series.push(A.barra(N.hoja ? tit : "Otros", porAnio.map((n, j) => {
        const v = n.hoja ? n.tot : n.H.filter((h) => !keys.some((k) => String(k) === String(h.k))).reduce((s, h) => s + h.v, 0); return v ? enUnidad(v, j, null, tope(j)) : null; }), N.hoja ? css("--o5") : css("--otros"), "s"));
      q(".dg-serie-t").textContent = `${tit}: cómo cambió de ${Y[0]} a ${Y[Y.length - 1]} (${st.vista === "ter" ? "lo gastado" : medidaTxt()}, ${unidadTxt()})`;
      chS.setOption({ ...base(), legend: { ...base().legend, itemGap: 16, textStyle: { ...base().legend.textStyle, fontFamily: "Figtree" }, formatter: (n) => (n.length > 34 ? n.slice(0, 32) + "…" : n) }, grid: { left: 8, right: 14, top: 44, bottom: 8, containLabel: true },
        tooltip: { ...base().tooltip, formatter: (ps) => `${ps[0].axisValueLabel}${ps.filter((p) => p.value != null).map((p) => `<br>${p.marker}${esc(p.seriesName)}: <b>${fmtU(p.value)}</b>`).join("")}` },
        xAxis: ejeX(Y.map(String)), yAxis: ejeY((v) => (st.unidad === "pct" ? v + " %" : st.unidad === "nino" ? nf(v) : nf(v / 1e6, v < 1e7 ? 1 : 0))),
        series: series.map((s) => ({ ...s, itemStyle: { ...s.itemStyle, opacity: 1 } })),
        graphic: st.unidad === "bs" ? [{ type: "text", right: 14, top: 26, style: { text: "millones", fill: css("--suave"), font: "11px Figtree" } }] : [] }, true);

      // nota: qué entra en el nodo (criterio de la regla) y cómo se pondera
      const notas = [];
      const regs = new Set(N.F.map((f) => (st.vista === "ter" ? f[2] : f[1])));
      if (regs.size === 1) { const R = DIC.reglas[[...regs][0]]; notas.push(`<b>Qué entra:</b> ${esc(R.criterio)} Clase: ${R.clase.toLowerCase()}${R.clase !== "Específico" ? ` (cuenta ${R.peso})` : ""}.`); }
      if (conTodo()) notas.push("Con indirecto y ampliado, cada línea cuenta sólo la parte que llega a niñas, niños y adolescentes (ponderadores de UNICEF Bolivia 2023): la mitad en los programas para la madre y el niño, un tercio en los de la familia y el peso de los menores de 18 en la población en los programas para todos.");
      if (st.vista === "ter") notas.push("Lo que ejecuta la alcaldía es dato. De la gobernación y del nivel central, los proyectos de inversión con ubicación van a su municipio y el resto se reparte con una llave declarada (la planilla docente por matrícula fiscal, los bonos escolares por estudiantes, los programas materno-infantiles por niños de 0 a 5 años, lo demás por población de 0 a 17).");
      if (st.unidad === "nino") notas.push(st.vista === "edad" ? "Por niño: los tramos de primera infancia, niñez y adolescencia se dividen por su propia población; los demás, por la de 0 a 17 años." : "Por niño: se divide por la población de 0 a 17 años del año (INE), no por los beneficiarios.");
      q(".dg-nota").innerHTML = notas.join(" ");
    }

    function abrir(k) {
      const N = ULTIMO, h = N && N.H.find((x) => String(x.k) === String(k));
      if (!h || !h.abre) return;   // la línea más fina no se abre
      st.camino.push({ d: N.dim, k: h.k }); st.verTodas = false; pintar();
      q(".dg-miga").scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    /* ── eventos ─────────────────────────────────────────────────────────────────────────── */
    cont.querySelectorAll(".dg-vistas button").forEach((b) => (b.onclick = () => { st.vista = b.dataset.v; st.camino = []; st.verTodas = false; pintar(); }));
    cont.querySelectorAll(".dg-clases button").forEach((b) => (b.onclick = () => { st.clases = b.dataset.c; st.camino = []; st.verTodas = false; pintar(); }));
    q(".dg-medida").onchange = (e) => { st.medida = e.target.value; pintar(); };
    q(".dg-unidad").onchange = (e) => { st.unidad = e.target.value; pintar(); };

    const api = {
      anio(i) { st.anio = i; pintar(); },
      repintar: pintar,
      resize() { chM && chM.resize(); chS && chS.resize(); },
    };
    /* los datos se bajan cuando la sección se acerca a la pantalla (el del nivel central pesa ≈ 370 kB comprimido) */
    const cargar = () => Promise.all([cargarDic(), fetch(opt.url).then((r) => { if (!r.ok) throw new Error("sin desagregación"); return r.json(); })]).then(([_, d]) => {
      D = d;
      // de cada línea (actividades con el mismo nombre): en qué entidades y programas está
      INFO = (D.lin || []).map(() => ({ ent: new Set(), prog: new Set() }));
      D.act.forEach((a) => { const x = INFO[a[3]]; if (x) { x.ent.add(a[1]); x.prog.add(a[0]); } });   // act: [programa, entidad, tramo, línea]
      if (D.ent && D.ent.length < 2) cont.querySelectorAll('.dg-vistas button[data-v="ent"]').forEach((b) => b.remove());
      if (!D.ter || !D.ter.length) cont.querySelectorAll('.dg-vistas button[data-v="ter"]').forEach((b) => b.remove());
      chM = echarts.init(q(".dg-mapa")); chS = echarts.init(q(".dg-serie"));
      chM.on("click", (p) => { if (p.data && p.data.k != null) abrir(p.data.k); });
      chS.on("click", (p) => { if (opt.alCambiarAnio) opt.alCambiarAnio(p.dataIndex); });
      pintar();
    }).catch((e) => { cont.innerHTML = `<p class="nota">No se pudo cargar la desagregación del gasto (${esc(e.message)}).</p>`; });
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); cargar(); } }, { rootMargin: "900px 0px" });
      io.observe(cont);
    } else cargar();
    return api;
  };
})();
