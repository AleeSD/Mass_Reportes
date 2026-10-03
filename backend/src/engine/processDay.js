import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { applyTemplate, pruneEmptyColumns, readReportFile } from "./normalize.js";
import {
  loadConsolidatedWorkbookTables,
  summarizeTables,
  unionColumns,
  writeConsolidatedWorkbook,
} from "./consolidate.js";
import { ensureOutputDir, listInputFiles, resolveOutputPath, findExistingOutputPath } from "./paths.js";
import { getReportType, loadFleetConfig, loadStoresCatalog, loadZonesConfig } from "../config.js";
import { buildFleetTimeline, selectAlertRows } from "./timeline/index.js";
import { addFleetSheets, FLEET_SHEET_NAMES } from "./timeline/fleetSheets.js";
import { normalizeHeader, scanWorkbookForObjectObject } from "./helpers.js";

function lookupValue(row, columnName) {
  const target = normalizeHeader(columnName).toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeader(key).toLowerCase() === target) return value;
  }
  return "";
}

export async function processDay({ config, reportType, isoDate }) {
  const startedAt = new Date().toISOString();
  const files = listInputFiles(config, isoDate, reportType);
  const logs = [];
  const okTables = [];
  const errors = [];

  if (files.length === 0) {
    return {
      fecha: isoDate,
      tipo: reportType.key,
      estado: "sin_archivos",
      archivos_encontrados: 0,
      placas_ok: 0,
      placas_error: 0,
      consolidado: null,
      resumen: {
        total_alertas: 0,
        columnas: [],
        placas: [],
        por_tipo: [],
        por_severidad: [],
      },
      logs: [
        {
          nivel: "warn",
          mensaje: "No se encontraron archivos .xlsx para esta fecha",
        },
      ],
      startedAt,
      finishedAt: new Date().toISOString(),
      columnas_eliminadas: [],
    };
  }

  for (const filePath of files) {
    const filename = path.basename(filePath);
    try {
      const parsed = await readReportFile(filePath, reportType);
      if (parsed.missingRequired.length) {
        logs.push({
          nivel: "warn",
          archivo: filename,
          placa: parsed.plate,
          mensaje: `Faltan columnas obligatorias: ${parsed.missingRequired.join(", ")}`,
        });
      }
      if (Array.isArray(parsed.unresolvedFormulaWarnings) && parsed.unresolvedFormulaWarnings.length) {
        const cols = [...new Set(parsed.unresolvedFormulaWarnings.map((w) => w.columna))];
        logs.push({
          nivel: "warn",
          archivo: filename,
          placa: parsed.plate,
          mensaje: `Fórmula(s) no reconocida(s) en ${cols.length} columna(s): ${cols.join(", ")} (${parsed.unresolvedFormulaWarnings.length} celda(s) vaciada(s))`,
        });
      }

      const templated = applyTemplate(parsed.rows, reportType);
      let extraMetaRows = templated;
      if (reportType.columna_severidad) {
        const sevCol = reportType.columna_severidad;
        extraMetaRows = parsed.rows.map((row, idx) => ({
          ...templated[idx],
          [sevCol]: lookupValue(row, sevCol),
        }));
      }

      okTables.push({
        plate: parsed.plate,
        filename,
        filePath,
        rows: extraMetaRows,
      });
      logs.push({
        nivel: "info",
        archivo: filename,
        placa: parsed.plate,
        mensaje: `Procesado (${parsed.rows.length} filas)`,
      });
    } catch (error) {
      errors.push({
        archivo: filename,
        filePath,
        mensaje: error.message,
        estado: "Error en archivo",
      });
      logs.push({
        nivel: "error",
        archivo: filename,
        mensaje: error.message,
      });
    }
  }

  const templateCols =
    reportType.columnas_plantilla?.length
      ? reportType.columnas_plantilla
      : okTables[0]
        ? Object.keys(okTables[0].rows[0] || {}).filter(
            (c) => c !== (reportType.columna_severidad || "Severidad de la alerta"),
          )
        : [];

  const pruningEnabled = reportType.podar_columnas_vacias !== false;
  const outputCols = pruneEmptyColumns(okTables, templateCols, pruningEnabled);
  const columnas_eliminadas = pruningEnabled
    ? templateCols.filter((c) => !outputCols.includes(c))
    : [];

  const sheets = okTables
    .map((table) => ({
      plate: table.plate,
      filename: table.filename,
      rows: table.rows.map((row) => {
        const out = {};
        for (const col of outputCols) out[col] = row[col];
        return out;
      }),
    }))
    .sort((a, b) => a.plate.localeCompare(b.plate));

  const outputPath = resolveOutputPath(config, isoDate, reportType);
  ensureOutputDir(outputPath);
  await writeConsolidatedWorkbook(outputPath, sheets, outputCols);

  let estado = errors.length && okTables.length ? "parcial" : errors.length ? "error" : "ok";
  const anyUnresolvedFormula = logs.some(
    (l) => l.nivel === "warn" && String(l.mensaje).includes("Fórmula(s) no reconocida(s)")
  );
  if (anyUnresolvedFormula && estado === "ok") estado = "parcial";

  // Red de seguridad: detectar "[object Object]" residuales en el workbook escrito
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outputPath);
    const scan = scanWorkbookForObjectObject(wb);
    if (scan.found) {
      logs.push({
        nivel: "error",
        mensaje: `Se detectaron ${scan.cells.length} celda(s) con "[object Object]" en el archivo de salida (ver estado "parcial"/"error")`,
      });
      if (estado === "ok") estado = "parcial";
    }
  } catch (scanErr) {
    logs.push({
      nivel: "warn",
      mensaje: `No se pudo ejecutar la comprobación anti-[object Object]: ${scanErr.message}`,
    });
  }

  const resumen = summarizeTables(okTables, reportType, outputCols);
  resumen.columnas_eliminadas = columnas_eliminadas;
  resumen.placas = [
    ...resumen.placas,
    ...errors.map((err) => ({
      placa: path.basename(err.archivo, ".xlsx"),
      alias: "",
      alertas: 0,
      ultima_alerta: null,
      estado: "Error en archivo",
      archivo: err.archivo,
      error: err.mensaje,
      tipos: {},
    })),
  ].sort((a, b) => String(a.placa).localeCompare(String(b.placa)));

  return {
    fecha: isoDate,
    tipo: reportType.key,
    estado,
    archivos_encontrados: files.length,
    placas_ok: okTables.length,
    placas_error: errors.length,
    consolidado: outputPath,
    originales: okTables.map((t) => ({
      placa: t.plate,
      archivo: t.filename,
      ruta: t.filePath,
    })),
    errores: errors,
    resumen,
    logs,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export function listOriginalFiles(config, isoDate, reportType) {
  return listInputFiles(config, isoDate, reportType).map((filePath) => ({
    archivo: path.basename(filePath),
    ruta: filePath,
    size: fs.statSync(filePath).size,
  }));
}

/**
 * Procesa un reporte compuesto (ej: consolidado_diario = alertas + historial).
 * Asegura que cada tipo base tenga su salida, une las filas por placa, añade
 * la columna de origen, ordena por fecha/hora y escribe el workbook combinado.
 */
export async function processCompositeDay({
  config,
  compositeReport,
  isoDate,
  runBaseProcessor = processDay,
  fleetBuilder = buildFleetTimeline,
}) {
  const startedAt = new Date().toISOString();
  const logs = [];
  const tipos_incluidos = Array.isArray(compositeReport.tipos_incluidos)
    ? compositeReport.tipos_incluidos
    : [];
  if (tipos_incluidos.length === 0) {
    return emptyCompositeResult(compositeReport, isoDate, startedAt, {
      logs: [
        { nivel: "error", mensaje: "Reporte compuesto sin tipos_incluidos definidos" },
      ],
      estado: "error",
    });
  }

  const baseResults = [];
  const baseTypes = [];
  let anyBaseError = false;
  let anyBaseParcial = false;
  let totalArchivos = 0;

  for (const baseKey of tipos_incluidos) {
    const baseType = getReportType(config, baseKey);
    baseTypes.push(baseType);
    const existingPath = findExistingOutputPath(config, isoDate, baseType);
    let needsProcess = !existingPath;
    if (!needsProcess) {
      // Si existe, lo usamos pero logueamos como info
      logs.push({
        nivel: "info",
        mensaje: `Reutilizando salida existente para ${baseKey}: ${path.basename(existingPath)}`,
      });
    } else {
      logs.push({
        nivel: "info",
        mensaje: `Procesando tipo base ${baseKey} antes del consolidado…`,
      });
      try {
        const r = await runBaseProcessor({ config, reportType: baseType, isoDate });
        baseResults.push(r);
        totalArchivos += r.archivos_encontrados || 0;
        if (r.estado === "error") anyBaseError = true;
        else if (r.estado !== "ok") anyBaseParcial = true;
        if (Array.isArray(r.logs)) logs.push(...r.logs);
      } catch (err) {
        anyBaseError = true;
        logs.push({
          nivel: "error",
          mensaje: `Fallo al procesar ${baseKey}: ${err.message}`,
        });
      }
    }
  }

  // Cargar tablas desde los .xlsx de cada tipo base
  const originColumn = compositeReport.columna_origen || "Origen del registro";
  const merged = new Map();
  let tipoIdx = 0;
  for (const baseKey of tipos_incluidos) {
    const baseType = baseTypes[tipoIdx];
    tipoIdx += 1;
    const existingPath = findExistingOutputPath(config, isoDate, baseType);
    if (!existingPath) {
      logs.push({
        nivel: "warn",
        mensaje: `Sin salida para ${baseKey}, no se incluyen registros de este tipo en el consolidado`,
      });
      anyBaseParcial = true;
      continue;
    }
    const originLabel = baseType.etiqueta || baseKey;
    try {
      const tables = await loadConsolidatedWorkbookTables(existingPath, originLabel, originColumn);
      for (const t of tables) {
        if (!merged.has(t.plate)) merged.set(t.plate, []);
        merged.get(t.plate).push(...t.rows.map((r) => ({ ...r, _base: baseKey })));
      }
      logs.push({
        nivel: "info",
        mensaje: `Incorporadas ${tables.length} placa(s) de ${baseKey}`,
      });
    } catch (err) {
      anyBaseError = true;
      logs.push({
        nivel: "error",
        mensaje: `Error al leer ${baseKey} consolidado: ${err.message}`,
      });
    }
  }

  // Ordenar filas y armar sheets
  const orden = compositeReport.orden_filas || "fecha_hora";
  const allTables = [];
  for (const [plate, rows] of merged.entries()) {
    const sorted = [...rows];
    if (orden === "fecha_hora") {
      sorted.sort((a, b) => {
        const ka = `${String(a.Fecha ?? "")} ${String(a.Hora ?? "")}`;
        const kb = `${String(b.Fecha ?? "")} ${String(b.Hora ?? "")}`;
        if (ka < kb) return -1;
        if (ka > kb) return 1;
        // Si hay empate, por origen: Alertas primero, luego Historial
        return String(a._base || "").localeCompare(String(b._base || ""));
      });
    } else {
      // Bloques por origen
      sorted.sort((a, b) => {
        const oa = String(a._base || "").localeCompare(String(b._base || ""));
        if (oa !== 0) return oa;
        const ka = `${String(a.Fecha ?? "")} ${String(a.Hora ?? "")}`;
        const kb = `${String(b.Fecha ?? "")} ${String(b.Hora ?? "")}`;
        if (ka < kb) return -1;
        if (ka > kb) return 1;
        return 0;
      });
    }
    // Limpiar campo privado _base
    const cleanRows = sorted.map(({ _base, ...rest }) => rest);
    // Garantizar que Origen del registro no esté vacío (si por algo no se cargó)
    for (const r of cleanRows) {
      if (!r[originColumn]) {
        // Intentamos adivinar: si tiene IMEI o Estado GPS, es Alertas; si Zona/Marca o Notas, Historial
        if (r["IMEI"] || r["Estado GPS"]) r[originColumn] = "Alertas";
        else if (r["Zona/Marca"] != null || r["Notas"] != null) r[originColumn] = "Historial";
      }
    }
    allTables.push({ plate, rows: cleanRows, filename: `(consolidado-${plate})`, filePath: null });
  }

  // Columnas finales
  const templateCols = unionColumns(baseTypes, { columna_origen: originColumn });
  const pruningEnabled = compositeReport.podar_columnas_vacias !== false;
  const outputCols = pruneEmptyColumns(allTables, templateCols, pruningEnabled);
  const columnas_eliminadas = pruningEnabled
    ? templateCols.filter((c) => !outputCols.includes(c))
    : [];

  // Filtrar output columnas: asegurarse de que Origen del registro nunca se poda
  if (!outputCols.includes(originColumn)) outputCols.splice(templateCols.indexOf(originColumn), 0, originColumn);

  const sheets = allTables
    .map((table) => ({
      plate: table.plate,
      rows: table.rows.map((row) => {
        const out = {};
        for (const col of outputCols) out[col] = row[col];
        return out;
      }),
    }))
    .sort((a, b) => a.plate.localeCompare(b.plate));

  // Analítica de flota (v1.4). Falla aislada: si algo falla, el consolidado se
  // genera igual con las hojas por placa y el run queda "parcial".
  const fleetParams = config.analitica_flota || {};
  let fleet = null;
  let fleetFailed = false;
  if (fleetEnabled(fleetParams, compositeReport) && merged.size > 0) {
    try {
      const fuente = fleetParams.fuente_eventos || "alertas";
      const zonesConfig = loadZonesConfig();
      const alertTables = [...merged.entries()].map(([plate, rows]) => ({
        plate,
        rows: selectAlertRows(rows, { fuente }),
      }));
      fleet = fleetBuilder({
        tables: alertTables,
        params: fleetParams,
        zonesConfig,
        catalog: loadStoresCatalog(zonesConfig.zonas?.tienda?.catalogo),
        flota: loadFleetConfig(),
        fecha: isoDate,
      });
      const k = fleet.kpis;
      logs.push({
        nivel: k.placas_con_reporte_en_flota < k.placas_esperadas ? "warn" : "info",
        mensaje: `Cobertura: ${k.placas_con_reporte_en_flota} de ${k.placas_esperadas} placas de la flota con reporte${k.placas_fuera_de_flota.length ? ` (+${k.placas_fuera_de_flota.length} fuera de flota: ${k.placas_fuera_de_flota.join(", ")})` : ""}`,
      });
      logs.push({
        nivel: "info",
        mensaje: `Analítica de flota: ${k.vueltas_total} vueltas (${k.vueltas_con_tiendas} con tiendas), ${k.tiendas_visitadas} visitas a tiendas, ${k.pasos_por_zona} pasos por zona`,
      });
      const unknown = [...new Set(fleet.placas.flatMap((p) => p.calidad?.zonas_desconocidas || []))];
      if (unknown.length) {
        logs.push({ nivel: "warn", mensaje: `Zonas no reconocidas (revise zonas.yaml / catálogo): ${unknown.join(", ")}` });
      }
    } catch (err) {
      fleetFailed = true;
      fleet = null;
      logs.push({ nivel: "warn", mensaje: `Analítica de flota no generada: ${err.message}` });
    }
  }

  const outputPath = resolveOutputPath(config, isoDate, compositeReport);
  ensureOutputDir(outputPath);
  await writeConsolidatedWorkbook(outputPath, sheets, outputCols, {
    beforeSheets: fleet
      ? (workbook) => {
          try {
            addFleetSheets(workbook, fleet, fleetParams);
            return FLEET_SHEET_NAMES;
          } catch (err) {
            for (const name of FLEET_SHEET_NAMES) {
              const ws = workbook.getWorksheet(name);
              if (ws) workbook.removeWorksheet(ws.id);
            }
            fleetFailed = true;
            fleet = null;
            logs.push({ nivel: "warn", mensaje: `Hojas de flota no escritas: ${err.message}` });
            return [];
          }
        }
      : null,
  });

  // Red de seguridad anti-[object Object]
  let estadoPre = "ok";
  if (anyBaseError) estadoPre = "error";
  else if (anyBaseParcial) estadoPre = "parcial";
  if (merged.size === 0 && estadoPre === "ok") estadoPre = "sin_archivos";
  if (fleetFailed && estadoPre === "ok") estadoPre = "parcial";

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outputPath);
    const scan = scanWorkbookForObjectObject(wb);
    if (scan.found) {
      logs.push({
        nivel: "error",
        mensaje: `Se detectaron ${scan.cells.length} celda(s) con "[object Object]" en el consolidado`,
      });
      if (estadoPre === "ok") estadoPre = "parcial";
    }
  } catch (scanErr) {
    logs.push({
      nivel: "warn",
      mensaje: `No se pudo comprobar "[object Object]" en consolidado: ${scanErr.message}`,
    });
  }

  const resumen = summarizeTables(allTables, compositeReport, outputCols);
  resumen.columnas_eliminadas = columnas_eliminadas;

  // Contar placas_ok / placas_error
  const placas_ok = merged.size;
  const placas_error = 0;
  const total_registros = [...merged.values()].reduce((s, r) => s + r.length, 0);
  resumen.total_registros = total_registros;
  if (!resumen.total_alertas) resumen.total_alertas = total_registros;
  if (fleet) {
    resumen.analitica_flota = {
      generado: true,
      placas_esperadas: fleet.kpis.placas_esperadas,
      placas_con_reporte: fleet.kpis.placas_con_reporte_en_flota,
      placas_fuera_de_flota: fleet.kpis.placas_fuera_de_flota,
      vueltas: fleet.kpis.vueltas_total,
      tiendas_visitadas: fleet.kpis.tiendas_visitadas,
    };
  } else if (fleetEnabled(fleetParams, compositeReport)) {
    resumen.analitica_flota = { generado: false, error: fleetFailed };
  }

  return {
    fecha: isoDate,
    tipo: compositeReport.key,
    key_publico: compositeReport.key_publico,
    estado: estadoPre,
    archivos_encontrados: totalArchivos || baseResults.reduce((s, r) => s + (r.archivos_encontrados || 0), 0),
    placas_ok,
    placas_error,
    consolidado: outputPath,
    resumen,
    logs,
    startedAt,
    finishedAt: new Date().toISOString(),
    columnas_eliminadas,
    analitica_flota: fleet,
  };
}

function fleetEnabled(params, compositeReport) {
  if (!params || params.habilitado === false) return false;
  const aplica = Array.isArray(params.aplica_a) ? params.aplica_a : ["consolidado"];
  return aplica.includes(compositeReport.key_publico) || aplica.includes(compositeReport.key);
}

function emptyCompositeResult(compositeReport, isoDate, startedAt, opts = {}) {
  return {
    fecha: isoDate,
    tipo: compositeReport.key,
    key_publico: compositeReport.key_publico,
    estado: opts.estado || "sin_archivos",
    archivos_encontrados: 0,
    placas_ok: 0,
    placas_error: 0,
    consolidado: null,
    resumen: { total_alertas: 0, total_registros: 0, columnas: [], placas: [], por_tipo: [], por_severidad: [] },
    logs: opts.logs || [{ nivel: "warn", mensaje: "Sin registros para consolidar" }],
    startedAt,
    finishedAt: new Date().toISOString(),
    columnas_eliminadas: [],
  };
}
