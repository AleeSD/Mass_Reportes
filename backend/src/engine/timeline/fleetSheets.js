import { durationToExcel, tsToExcelTime } from "./utils.js";

// Hojas RESUMEN_FLOTA, VUELTAS y VISITAS del consolidado (§7).

const C = {
  general: { head: "FF1F4E79", fill: null },
  bsf: { head: "FF2563EB", fill: "FFDBEAFE" },
  os: { head: "FFA21CAF", fill: "FFFAE8FF" },
  tienda: { head: "FF15803D", fill: "FFDCFCE7" },
  total: { head: "FF374151", fill: null },
};
const ESTIMADO_FILL = "FFFEF3C7";
const LARGA_FILL = "FFFECACA";
const SIN_REPORTE_FONT = "FF9CA3AF";
const BORDER = { style: "thin", color: { argb: "FFD0D0D0" } };
const BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const FALTANTE = "—";

const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function toCellValue(type, value) {
  if (value == null || value === "") return null;
  if (type === "time") return tsToExcelTime(value);
  if (type === "dur") return durationToExcel(value);
  return value;
}

/**
 * Escribe una tabla con título, leyenda, encabezados agrupados y formato.
 * columns: [{ header, group, zone, type: text|time|dur|int, width, get(row), quality?(row), highlight?(row) }]
 */
function writeTable(ws, { title, legend = true, columns, rows, freezeCols = 1, params = {}, rowStyle }) {
  const nCols = columns.length;
  const HEADER_ROW = 4;

  // Fila 1: título
  ws.getRow(1).getCell(1).value = title;
  ws.getRow(1).getCell(1).font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
  ws.getRow(1).height = 20;

  // Fila 2: leyenda de colores
  if (legend) {
    const larga = Number(params.resaltar_estancia_bsf_min ?? 240);
    const items = [
      ["BSF", fill(C.bsf.fill)],
      ["Base OS", fill(C.os.fill)],
      ["Tiendas", fill(C.tienda.fill)],
      ["Estimado", fill(ESTIMADO_FILL), { italic: true }],
      [`${FALTANTE} = faltante`, null],
      [`Estancia BSF ≥ ${larga} min`, fill(LARGA_FILL)],
    ];
    ws.getRow(2).getCell(1).value = "Leyenda:";
    ws.getRow(2).getCell(1).font = { bold: true, size: 9, color: { argb: "FF6B7280" } };
    items.forEach(([text, f, font], i) => {
      const cell = ws.getRow(2).getCell(i + 2);
      cell.value = text;
      if (f) cell.fill = f;
      cell.font = { size: 9, ...(font || {}) };
      cell.alignment = { horizontal: "center" };
      cell.border = BORDERS;
    });
  }

  // Fila 3: grupos (celdas combinadas); fila 4: columnas
  let start = 0;
  while (start < nCols) {
    const group = columns[start].group || "";
    let end = start;
    while (end + 1 < nCols && (columns[end + 1].group || "") === group) end += 1;
    const zone = C[columns[start].zone || "general"] || C.general;
    if (end > start) ws.mergeCells(3, start + 1, 3, end + 1);
    const cell = ws.getRow(3).getCell(start + 1);
    cell.value = group;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = fill(zone.head);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDERS;
    start = end + 1;
  }
  const headerRow = ws.getRow(HEADER_ROW);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    const zone = C[col.zone || "general"] || C.general;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = fill(zone.head);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDERS;
  });
  headerRow.height = 30;

  rows.forEach((row, r) => {
    const excelRow = ws.getRow(HEADER_ROW + 1 + r);
    const style = rowStyle ? rowStyle(row) : {};
    columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const raw = col.get(row);
      const value = toCellValue(col.type, raw);
      const zone = C[col.zone || "general"] || C.general;
      const isTimeLike = col.type === "time" || col.type === "dur";
      const quality = col.quality ? col.quality(row) : null;
      const font = { name: "Calibri", size: 10 };
      if (value == null) {
        // undefined = no aplica (celda vacía); null = dato faltante ("—").
        cell.value = style.muted || raw === undefined || !isTimeLike ? null : FALTANTE;
        font.color = { argb: SIN_REPORTE_FONT };
        cell.alignment = { horizontal: "center" };
      } else {
        cell.value = value;
        if (col.type === "time") cell.numFmt = "hh:mm:ss";
        if (col.type === "dur") cell.numFmt = "[h]:mm:ss";
        if (isTimeLike || col.type === "int") cell.alignment = { horizontal: "center" };
      }
      if (zone.fill) cell.fill = fill(zone.fill);
      if (style.fill) cell.fill = fill(style.fill);
      if (quality === "estimado" && value != null) {
        font.italic = true;
        cell.fill = fill(ESTIMADO_FILL);
      }
      if (col.highlight && col.highlight(row) && value != null) cell.fill = fill(LARGA_FILL);
      if (style.muted) font.color = { argb: SIN_REPORTE_FONT };
      if (style.italic) font.italic = true;
      if (col.bold) font.bold = true;
      cell.font = font;
      cell.border = BORDERS;
    });
  });

  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width || 12;
  });
  ws.views = [{ state: "frozen", xSplit: freezeCols, ySplit: HEADER_ROW }];
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW + Math.max(rows.length, 1), column: nCols },
  };
}

/** Valor solo si aplica; si no, undefined (celda vacía en vez de "—"). */
const when = (cond, value) => (cond ? value : undefined);
const hasBsf = (p) => p.n_ingresos_bsf > 0;
const hasOs = (p) => p.salida_base_os != null || p.regreso_base_os != null || p.n_estancias_base_os > 0;
const hasStores = (p) => p.tiendas_visitadas > 0;
const closesInDepot = (t) => t?.cierre_tipo === "BSF" || t?.cierre_tipo === "BASE_OS";
const isSinVisitas = (t) => String(t?.cierre_tipo || "").startsWith("SIN_VISITAS");

function fechaDmy(iso) {
  const [y, m, d] = String(iso).split("-");
  return `${d}/${m}/${y}`;
}

function resumenColumns(params) {
  const maxVueltas = Number(params.max_vueltas_en_resumen ?? 4);
  const cols = [
    { group: "Identificación", header: "Placa", get: (p) => p.placa, width: 11, bold: true },
    { group: "Identificación", header: "Empresa", get: (p) => p.empresa, width: 30 },
    { group: "Identificación", header: "Tipo", get: (p) => p.tipo, width: 7 },
    { group: "Identificación", header: "Estado del reporte", get: (p) => p.estado_reporte, width: 18 },
    {
      group: "Inicio",
      header: "Inicio de jornada",
      type: "time",
      get: (p) => p.inicio_jornada,
      quality: (p) => p.inicio_calidad,
      width: 11,
    },
    { group: "Inicio", header: "Origen vuelta 1", get: (p) => p.origen_vuelta1, width: 16 },
    { group: "BSF", zone: "bsf", header: "1.ª llegada a BSF", type: "time", get: (p) => when(hasBsf(p), p.primera_llegada_bsf), width: 11 },
    { group: "BSF", zone: "bsf", header: "Última salida de BSF", type: "time", get: (p) => when(hasBsf(p), p.ultima_salida_bsf), width: 11 },
    { group: "BSF", zone: "bsf", header: "N.º ingresos a BSF", type: "int", get: (p) => (p.estado_reporte === "Con reporte" ? p.n_ingresos_bsf : null), width: 9 },
    {
      group: "BSF",
      zone: "bsf",
      header: "Tiempo total en BSF",
      type: "dur",
      get: (p) => when(hasBsf(p), p.seg_total_bsf),
      highlight: (p) => p.bsf_larga,
      width: 11,
    },
  ];
  for (let k = 0; k < maxVueltas; k += 1) {
    const g = `Vuelta ${k + 1}`;
    const v = (p) => p.vueltas?.[k];
    const q = (p) => v(p)?.calidad;
    cols.push(
      { group: g, header: "Inicio", type: "time", get: (p) => v(p)?.inicio, quality: q, width: 10 },
      { group: g, header: "N.º tiendas", type: "int", get: (p) => v(p)?.n_tiendas, width: 8 },
      { group: g, header: "Tiempo a 1.ª tienda", type: "dur", get: (p) => when(v(p)?.n_tiendas > 0, v(p)?.seg_a_primera_tienda), quality: q, width: 10 },
      { group: g, header: "Cierre (hora)", type: "time", get: (p) => when(v(p) && !isSinVisitas(v(p)), v(p)?.cierre_hora), width: 10 },
      { group: g, header: "Cierre (tipo)", get: (p) => v(p)?.cierre, width: 18 },
      { group: g, header: "Duración", type: "dur", get: (p) => when(v(p) && !isSinVisitas(v(p)), v(p)?.seg_vuelta), quality: q, width: 10 },
    );
  }
  cols.push(
    { group: "Tiendas", zone: "tienda", header: "Tiendas visitadas", type: "int", get: (p) => (p.estado_reporte === "Con reporte" ? p.tiendas_visitadas : null), width: 9 },
    { group: "Tiendas", zone: "tienda", header: "Permanencia media", type: "dur", get: (p) => when(hasStores(p), p.seg_permanencia_media), width: 11 },
    { group: "Base OS", zone: "os", header: "Salida de Base OS", type: "time", get: (p) => when(hasOs(p), p.salida_base_os), width: 11 },
    { group: "Base OS", zone: "os", header: "Regreso a Base OS", type: "time", get: (p) => when(hasOs(p), p.regreso_base_os), width: 11 },
    { group: "Fin de servicio", header: "Salida última tienda", type: "time", get: (p) => when(hasStores(p), p.salida_ultima_tienda), width: 11 },
    { group: "Fin de servicio", header: "Destino tras última tienda", get: (p) => p.destino_tras_ultima_tienda, width: 16 },
    { group: "Fin de servicio", header: "Tiempo de retorno", type: "dur", get: (p) => when(hasStores(p) && p.destino_tras_ultima_tienda !== "Fin de servicio", p.seg_retorno), width: 10 },
    { group: "Totales", zone: "total", header: "Tiempo total en ruta", type: "dur", get: (p) => when(p.n_vueltas > 0, p.seg_total_ruta), width: 11 },
    { group: "Totales", zone: "total", header: "Última señal del día", type: "time", get: (p) => p.ultima_senal, width: 11 },
    { group: "Totales", zone: "total", header: "Cierre del día", get: (p) => p.cierre_dia, width: 26 },
    {
      group: "Totales",
      zone: "total",
      header: "Observaciones de calidad",
      get: (p) => {
        const extra = (p.vueltas?.length || 0) > maxVueltas ? `+${p.vueltas.length - maxVueltas} vuelta(s), ver VUELTAS` : "";
        return [extra, p.observaciones].filter(Boolean).join("; ");
      },
      width: 60,
    },
  );
  return cols;
}

function vueltasColumns(params) {
  const maxTiendas = Number(params.max_tiendas_por_vuelta_en_hoja ?? 7);
  const cols = [
    { group: "Vuelta", header: "Placa", get: (t) => t.placa, width: 11, bold: true },
    { group: "Vuelta", header: "Vuelta", type: "int", get: (t) => t.vuelta, width: 7 },
    { group: "Vuelta", header: "Origen", get: (t) => t.origen, width: 16 },
    { group: "Vuelta", header: "Inicio", type: "time", get: (t) => t.inicio, quality: (t) => t.inicio_calidad, width: 10 },
    { group: "BSF (carga)", zone: "bsf", header: "Llegada a BSF previa", type: "time", get: (t) => when(t.origen_tipo === "BSF", t.llegada_bsf_prev), width: 11 },
    { group: "BSF (carga)", zone: "bsf", header: "Salida de BSF", type: "time", get: (t) => when(t.origen_tipo === "BSF", t.salida_bsf), width: 11 },
    {
      group: "BSF (carga)",
      zone: "bsf",
      header: "Tiempo en BSF",
      type: "dur",
      get: (t) => when(t.origen_tipo === "BSF", t.seg_en_bsf),
      highlight: (t) => t.seg_en_bsf != null && t.seg_en_bsf >= Number(params.resaltar_estancia_bsf_min ?? 240) * 60,
      width: 10,
    },
  ];
  for (let k = 0; k < maxTiendas; k += 1) {
    const g = `Tienda ${k + 1}`;
    const s = (t) => t.tiendas?.[k];
    cols.push(
      { group: g, zone: "tienda", header: "Tienda (código-local)", get: (t) => s(t)?.nombre, width: 24 },
      { group: g, zone: "tienda", header: "Llegada", type: "time", get: (t) => (s(t) ? s(t).llegada : undefined), width: 10 },
      { group: g, zone: "tienda", header: "Salida", type: "time", get: (t) => (s(t) ? s(t).salida : undefined), width: 10 },
      { group: g, zone: "tienda", header: "Permanencia", type: "dur", get: (t) => s(t)?.seg_permanencia, width: 10 },
      { group: g, zone: "tienda", header: "Acumulado desde origen", type: "dur", get: (t) => s(t)?.seg_acumulado, quality: (t) => t.inicio_calidad, width: 11 },
      { group: g, zone: "tienda", header: "Traslado desde la anterior", type: "dur", get: (t) => when(k > 0 && s(t), s(t)?.seg_traslado), width: 11 },
    );
  }
  cols.push(
    {
      group: "Tiendas",
      zone: "tienda",
      header: "Más tiendas",
      get: (t) => (t.tiendas.length > maxTiendas ? `+${t.tiendas.length - maxTiendas} tiendas, ver VISITAS` : ""),
      width: 22,
    },
    { group: "Cierre", header: "N.º tiendas", type: "int", get: (t) => t.n_tiendas, width: 8 },
    { group: "Cierre", header: "Salida última tienda", type: "time", get: (t) => when(t.n_tiendas > 0, t.salida_ultima_tienda), width: 11 },
    { group: "Cierre", header: "Tiempo de retorno", type: "dur", get: (t) => when(t.n_tiendas > 0 && closesInDepot(t), t.seg_retorno), width: 10 },
    { group: "Cierre", header: "Cierre", get: (t) => t.cierre, width: 26 },
    { group: "Cierre", header: "Hora de cierre", type: "time", get: (t) => when(!isSinVisitas(t), t.cierre_hora), width: 10 },
    {
      group: "Cierre",
      header: "Tiempo de vuelta completa",
      type: "dur",
      get: (t) => when(!isSinVisitas(t), t.seg_vuelta),
      quality: (t) => t.inicio_calidad,
      width: 12,
      bold: true,
    },
    { group: "Cierre", header: "Calidad", get: (t) => t.calidad, width: 10 },
  );
  return cols;
}

function visitasColumns() {
  return [
    { group: "Estancia", header: "Placa", get: (v) => v.placa, width: 11, bold: true },
    { group: "Estancia", header: "Vuelta", type: "int", get: (v) => v.vuelta, width: 7 },
    { group: "Estancia", header: "Orden", type: "int", get: (v) => v.orden, width: 7 },
    { group: "Estancia", header: "N.º tienda en vuelta", type: "int", get: (v) => v.n_tienda, width: 9 },
    { group: "Zona", header: "Tipo de zona", get: (v) => v.zona_label, width: 11 },
    { group: "Zona", header: "Código", get: (v) => v.codigo, width: 8 },
    { group: "Zona", header: "Local", get: (v) => v.local || v.nombre, width: 24 },
    { group: "Zona", header: "Distrito", get: (v) => v.distrito, width: 22 },
    { group: "Zona", header: "CD", get: (v) => v.cd, width: 18 },
    { group: "Tiempos", header: "Llegada", type: "time", get: (v) => v.llegada, width: 10 },
    { group: "Tiempos", header: "Salida", type: "time", get: (v) => v.salida, width: 10 },
    { group: "Tiempos", header: "Permanencia", type: "dur", get: (v) => v.seg_permanencia, highlight: (v) => v.larga, width: 10 },
    { group: "Tiempos", header: "Acumulado desde origen", type: "dur", get: (v) => when(v.n_tienda != null, v.seg_acumulado), width: 11 },
    { group: "Tiempos", header: "Traslado desde la anterior", type: "dur", get: (v) => when(v.n_tienda > 1, v.seg_traslado), width: 11 },
    { group: "Calidad", header: "Calidad", get: (v) => v.calidad, width: 10 },
    { group: "Calidad", header: "Marcas", get: (v) => v.marcas.join(", "), width: 40 },
  ];
}

const ZONE_ROW_FILL = { BSF: C.bsf.fill, BASE_OS: C.os.fill, TIENDA: C.tienda.fill };

/** Agrega las 3 hojas (antes de las hojas por placa). */
export function addFleetSheets(workbook, timeline, params = {}) {
  const fecha = fechaDmy(timeline.fecha);
  const k = timeline.kpis;

  const wsResumen = workbook.addWorksheet("RESUMEN_FLOTA", { properties: { tabColor: { argb: C.general.head } } });
  writeTable(wsResumen, {
    title: `Resumen de flota · ${fecha} · ${k.placas_con_reporte_en_flota} de ${k.placas_esperadas} placas con reporte`,
    columns: resumenColumns(params),
    rows: timeline.placas,
    freezeCols: 1,
    params,
    rowStyle: (p) => (p.estado_reporte === "Con reporte" ? {} : { muted: true }),
  });

  const wsVueltas = workbook.addWorksheet("VUELTAS", { properties: { tabColor: { argb: C.bsf.head } } });
  writeTable(wsVueltas, {
    title: `Vueltas por placa · ${fecha} · ${k.vueltas_total} vueltas (${k.vueltas_con_tiendas} con tiendas)`,
    columns: vueltasColumns(params),
    rows: timeline.trips,
    freezeCols: 2,
    params,
  });

  const wsVisitas = workbook.addWorksheet("VISITAS", { properties: { tabColor: { argb: C.tienda.head } } });
  writeTable(wsVisitas, {
    title: `Visitas y estancias · ${fecha} · ${k.tiendas_visitadas} visitas a tiendas, ${k.pasos_por_zona} pasos por zona`,
    columns: visitasColumns(),
    rows: timeline.visits,
    freezeCols: 1,
    params,
    rowStyle: (v) => ({
      fill: ZONE_ROW_FILL[v.zona_tipo],
      ...(v.paso ? { muted: true, italic: true } : {}),
    }),
  });
}

export const FLEET_SHEET_NAMES = ["RESUMEN_FLOTA", "VUELTAS", "VISITAS"];
