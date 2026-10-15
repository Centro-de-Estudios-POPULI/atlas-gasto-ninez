/* Atlas de la Niñez y la Adolescencia — utilidades de las encuestas (Encuesta de Hogares 2025 y EDSA 2023) y del
   catálogo: nombre y año de cada fuente, el tema del sitio que le toca a cada indicador, el formato de cada cifra con
   su margen de error y los pares de indicadores que miden lo mismo en dos fuentes.
   Lo usan indicadores.html, encuesta.html y metodologia.html. Nada se recalcula: cada celda trae del pipeline su valor,
   su error estándar, su CV, sus casos y su calificación; acá sólo se arma el intervalo de 95 % (v ± 1,96·ee). */
(function () {
  const A = window.Atlas, E = (A.enc = {});

  E.FUENTES = {
    censo: { clave: "censo", corto: "Censo 2024", largo: "Censo de Población y Vivienda 2024", anio: 2024 },
    eh2025: { clave: "eh2025", corto: "EH 2025", largo: "Encuesta de Hogares 2025", anio: 2025, archivo: "datos/eh2025.json" },
    edsa2023: { clave: "edsa2023", corto: "EDSA 2023", largo: "Encuesta de Demografía y Salud 2023", anio: 2023, archivo: "datos/edsa2023.json" },
  };
  E.ENCUESTAS = ["eh2025", "edsa2023"];
  /* una encuesta; si todavía no existe (la EDSA se está calculando), null: la página sigue sin ella */
  const memo = {};
  E.cargar = (clave) => (memo[clave] = memo[clave] || fetch(E.FUENTES[clave].archivo).then((r) => (r.ok ? r.json() : null)).catch(() => null));

  E.norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  E.esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ── tema del sitio (los del catálogo del censo) para cada indicador de encuesta ──────────────────────────── */
  const POR_CODIGO = {
    eh2025: [[/^DEM0[12]$/, "poblacion"], [/^DEM13$/, "identidad"], [/^SAL1[2-6]$/, "familia"]],
    edsa2023: [[/^N0?[568](\D|$)/, "salud"], [/^S0?[89](\D|$)/, "salud"], [/^E0?[78](\D|$)/, "proteccion"], [/^E10(\D|$)/, "identidad"],
      [/^E11(\D|$)/, "familia"], [/^I0?2(\D|$)/, "vivienda"]],
  };
  const POR_TEMA = [
    [/nutricion|anemia|lactancia|primera infancia|salud infantil|mortalidad|desarrollo infantil|crianza/, "primera_infancia"],
    [/fecundidad|sexual|reproductiva|maternidad|embarazo/, "familia"],
    [/violencia|discrimina|proteccion/, "proteccion"],
    [/aliment|pobreza|ingreso/, "pobreza"],
    [/trabajo|empleo|ocupacion/, "trabajo"],
    [/migracion|migrante/, "migracion"],
    [/educacion|escolar/, "educacion"],
    [/salud|discapacidad/, "salud"],
    [/vivienda|servicio|\btic\b|tecnolog|internet/, "vivienda"],
    [/familia|hogar|convivencia/, "familia"],
    [/identidad|registro/, "identidad"],
  ];
  E.temaDe = (clave, x) => {
    for (const [re, t] of POR_CODIGO[clave] || []) if (re.test(x.cod)) return t;
    const t = E.norm(x.tema);
    for (const [re, k] of POR_TEMA) if (re.test(t)) return k;
    return "otros";
  };
  E.temas = (CAT) => ({ ...CAT.temas, otros: { nombre: "Otros temas", descripcion: "Indicadores que todavía no tienen un tema del atlas." } });

  /* ── formato: cada tipo con su unidad ─────────────────────────────────────────────────────────────────────── */
  E.TIPO = { prop: "porcentaje", mean: "promedio", median: "mediana", total: "total de personas", rate1000: "tasa por mil" };
  E.unidad = (x) => {
    if (x.tipo === "prop") return { pre: "", suf: " %", dec: 1, pts: " puntos" };
    if (x.tipo === "rate1000") return { pre: "", suf: " por mil", dec: 1, pts: "" };
    if (x.tipo === "total") return { pre: "", suf: "", dec: 0, pts: "" };
    const n = E.norm(x.nombre);
    if (/\bbs\b/.test(n)) return { pre: "Bs ", suf: "", dec: 0, pts: "" };
    if (/horas/.test(n)) return { pre: "", suf: " horas", dec: 1, pts: "" };
    if (/anos promedio|anos de estudio/.test(n)) return { pre: "", suf: " años", dec: 1, pts: "" };
    if (/tamano/.test(n)) return { pre: "", suf: " personas", dec: 1, pts: "" };
    return { pre: "", suf: "", dec: 1, pts: "" };
  };
  /* cifra con su unidad; «solo» = sin unidad (ejes y tablas) */
  E.fmt = (x, v, solo) => {
    if (v == null || !isFinite(v)) return "s/d";
    const u = E.unidad(x);
    return solo ? A.nf(v, u.dec) : `${u.pre}${A.nf(v, u.dec)}${u.suf}`;
  };
  /* para las cifras grandes: la unidad larga va chica, para que no empuje el ancho */
  E.fmtHTML = (x, v) => {
    if (v == null || !isFinite(v)) return "s/d";
    const u = E.unidad(x);
    return u.suf === " %" ? `${u.pre}${A.nf(v, u.dec)} %` : `${u.pre}${A.nf(v, u.dec)}${u.suf ? `<span class="u">${u.suf}</span>` : ""}`;
  };
  E.margen = (c) => (c && c.ee != null && isFinite(c.ee) ? 1.96 * c.ee : null);
  E.ic = (x, c) => {
    const m = E.margen(c);
    if (m == null || c.v == null) return null;
    let lo = c.v - m, hi = c.v + m;
    if (c.v >= 0 && lo < 0) lo = 0;
    if (x.tipo === "prop" && hi > 100) hi = 100;
    return [lo, hi];
  };
  E.pm = (x, c) => { const m = E.margen(c); return m == null ? "" : `± ${A.nf(m, E.unidad(x).dec)}`; };
  E.cv = (c) => (c && c.cv != null && isFinite(c.cv) ? A.nf(100 * c.cv, 1) + " %" : "—");
  E.CALIF = { p: "publicable", a: "cautela", x: "muestra insuficiente" };
  /* 0 % o 100 % con error estándar cero: ningún caso (o todos) en la muestra. El error no se puede medir y el CV
     queda vacío, así que la regla «CV < 15 %» no se cumple: no se dibuja como cifra firme (pendiente en el pipeline). */
  E.degenerada = (c) => !!c && c.ee === 0 && (c.v === 0 || c.v === 100);
  E.publica = (c) => !!c && c.c !== "x" && c.v != null && isFinite(c.v) && !E.degenerada(c);
  /* por qué una cifra no se publica (o su calificación, si se publica) */
  E.motivo = (c) => (!c ? E.CALIF.x : E.degenerada(c) ? (c.v === 0 ? "ningún caso en la muestra" : "todos los casos de la muestra") : E.CALIF[c.c] || "");
  E.contar = (dep, claves) => {
    const n = { p: 0, a: 0, x: 0 };
    claves.forEach((k) => { const c = (dep || {})[k]; n[E.publica(c) && c.c in n ? c.c : "x"]++; });
    return n;
  };

  /* ── población en lenguaje llano ──────────────────────────────────────────────────────────────────────────── */
  const quien = (a, b) => (b <= 5 ? "las niñas y niños" : a >= 12 ? "los adolescentes" : "las niñas, niños y adolescentes");
  const rango = (s) => s.replace(/(\d+)\s*[-–]\s*(\d+)/g, "$1 a $2");
  /* «0-17» → «0 a 17 años» (chips y tarjetas) */
  E.poblacion = (p) => {
    const t = String(p || "").trim(); let m;
    if ((m = t.match(/^(\d+)\s*[-–]\s*(\d+)$/))) return `${m[1]} a ${m[2]} años`;
    if ((m = t.match(/^(\d+)\+$/))) return `${m[1]} años o más`;
    if ((m = t.match(/^(\d+)$/))) return `${m[1]} años`;
    if ((m = t.match(/^(mujeres|hombres)\s+(\d+)\s*[-–]\s*(\d+)$/i))) return `${m[1]} de ${m[2]} a ${m[3]} años`;
    return rango(t);
  };
  /* «0-17» → «las niñas, niños y adolescentes de 0 a 17 años» (frases) */
  E.quienes = (p) => {
    const t = String(p || "").trim(); let m;
    if ((m = t.match(/^(\d+)\s*[-–]\s*(\d+)(\s*años)?$/))) return `${quien(+m[1], +m[2])} de ${m[1]} a ${m[2]} años`;
    if ((m = t.match(/^(\d+)\s*[-–]\s*(\d+)\s*meses$/))) return `las niñas y niños de ${m[1]} a ${m[2]} meses`;
    if ((m = t.match(/^(\d+)$/))) return `los jóvenes de ${m[1]} años`;
    if ((m = t.match(/^(\d+)\+$/))) return `las personas de ${m[1]} años o más`;
    if ((m = t.match(/^(mujeres|hombres)\s+(\d+)\s*[-–]\s*(\d+)$/i))) return `${/^m/i.test(m[1]) ? "las mujeres" : "los hombres"} de ${m[2]} a ${m[3]} años`;
    if (/^toda la poblaci/i.test(t)) return "toda la población";
    return `la población de referencia (${rango(t)})`;
  };
  /* rótulo de un tramo o grupo de edad: «0-5» → «0 a 5 años» */
  E.tramo = (k) => {
    const s = String(k).trim(); let m;
    if ((m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/))) return `${m[1]} a ${m[2]} años`;
    if ((m = s.match(/^(\d+)\s*[-–]\s*(\d+)\s*m(eses)?$/))) return `${m[1]} a ${m[2]} meses`;
    if (/^\d+$/.test(s)) return `${s} años`;
    return rango(s);
  };

  /* ── la misma pregunta en dos fuentes (docs/05_catalogo_indicadores.md, «Censo y encuesta frente a frente») ──
     Sólo códigos: las cifras salen de los datos de cada fuente al abrir la página. */
  E.PARES = [
    { que: "Pertenencia a un pueblo indígena", censo: ["indigena"], eh2025: ["DEM13"], por: "La pregunta y quién responde por el niño no son iguales." },
    { que: "Viven en un hogar monoparental", censo: ["monoparental"], eh2025: ["DEM07"] },
    { que: "Viven en el hogar de sus abuelos", censo: ["nieto_del_jefe"], eh2025: ["DEM12"] },
    { que: "Sin seguro de salud", censo: ["sin_seguro"], eh2025: ["SAL01"], edsa2023: ["S08b"] },
    { que: "Registrados en el SUS", censo: ["afil_sus"], eh2025: ["SAL02"] },
    { que: "Dificultad funcional severa", censo: ["dificultad"], eh2025: ["SAL10"], edsa2023: ["S09"] },
    { que: "Agua por cañería de red", eh2025: ["VIV01"], edsa2023: ["I02"] },
    { que: "Baño con alcantarillado o cámara séptica", eh2025: ["VIV03"], edsa2023: ["I02b"] },
    { que: "Trabajo infantil y adolescente", censo: ["trabaja", "trabaja_amplio"], eh2025: ["TRA03"],
      por: "Cada fuente con la definición con que la publica el INE: el censo con y sin la producción para el consumo de la familia; la encuesta, con ella." },
    { que: "Sin baño ni letrina", censo: ["sin_bano"], eh2025: ["VIV02"] },
    { que: "Hacinamiento", censo: ["hacinamiento"], eh2025: ["VIV06"] },
    { que: "Piso de tierra", censo: ["piso_tierra"], eh2025: ["VIV07"] },
    { que: "Se cocina con leña o bosta", censo: ["cocina_lena"], eh2025: ["VIV05"] },
    { que: "Sin electricidad", censo: ["sin_electricidad"], eh2025: ["VIV04"] },
    { que: "Nacieron en otro país", censo: ["nacio_exterior"], eh2025: ["MIG01"] },
    { que: "Adolescentes que ya son madres", censo: ["madre_adolescente"], eh2025: ["SAL15"] },
    { que: "Fecundidad de 15 a 19 años", censo: ["nacimientos_adolescentes"], eh2025: ["SAL16"], edsa2023: ["F01"],
      por: "Cada fuente mira un período distinto antes de la entrevista y la Encuesta de Hogares capta menos nacimientos adolescentes." },
  ];
  E.paresDe = (clave, cod) => E.PARES.filter((p) => (p[clave] || []).includes(cod));
})();
