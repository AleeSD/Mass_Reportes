import ExcelJS from "exceljs";
import { excelSheetName, isEmptyCell } from "./helpers.js";
import { formatCell } from "./normalize.js";

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E79" },
};
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
const CELL_FONT = { name: "Calibri", size: 10 };
const ZEBRA_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
};

function columnWidth(header, rows) {
  let max = String(header).length;
  for (const row of rows.slice(0, 80)) {
    const value = row[header];
    const text =
      value instanceof Date ? value.toISOString().slice(0, 19) : String(value ?? "");
    max = Math.max(max, text.length);
  }
  return Math.min(Math.max(max + 2, 12), 42);
}

function normalizeHeaderEq(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

/**
 * Calcula la unión de columnas para un reporte compuesto.
 * Orden: columnas del primer tipo + "Origen del registro" después de Placa/Patente
 * + columnas nuevas de los demás tipos al final, sin duplicar nombres ya presentes.
 */
export function unionColumns(baseTypes, compositeOpts = {}) {
  const colOrigen = compositeOpts.columna_origen || "Origen del registro";
  const seen = new Set();
  const normalizedSeen = new Set();
  const result = [];
  const pushUnique = (col) => {
    const n = String(col || "").trim().toLowerCase();
    if (!col || normalizedSeen.has(n)) return;
    normalizedSeen.add(n);
    seen.add(col);
    result.push(col);
  };
  // Base columns from first type (alertas)
  const first = baseTypes[0];
  const firstCols = Array.isArray(first?.columnas_plantilla) ? first.columnas_plantilla : [];
  let insertedOrigen = false;
  for (const col of firstCols) {
    pushUnique(col);
    // Insertar "Origen del registro" justo después de Placa/Patente
    if (!insertedOrigen && normalizeHeaderEq(col, "Placa/Patente")) {
      pushUnique(colOrigen);
      insertedOrigen = true;
    }
  }
  if (!insertedOrigen) pushUnique(colOrigen);
  // Resto de tipos: solo columnas nuevas al final
  for (let i = 1; i < baseTypes.length; i += 1) {
    const cols = Array.isArray(baseTypes[i]?.columnas_plantilla)
      ? baseTypes[i].columnas_plantilla
      : [];
    for (const c of cols) pushUnique(c);
  }
  return result;
}

/**
 * Carga el workbook de un reporte base y devuelve [{ plate, rows }].
 * Se asume que el libro ya fue generado por writeConsolidatedWorkbook (1 fila de
 * headers + hojas nombradas por placa).
 */
export async function loadConsolidatedWorkbookTables(xlsxPath, originLabel, columnOrigen) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const out = [];
  for (const ws of workbook.worksheets) {
    if (!ws || !ws.rowCount) continue;
    // Filas de la hoja: primera es header, el resto datos
    const headerRow = ws.getRow(1);
    const cols = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cols.push({ name: String(cell.value == null ? "" : cell.value), col: colNum });
    });
    if (!cols.length) continue;
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const rec = {};
      let hasData = false;
      for (const c of cols) {
        const raw = row.getCell(c.col).value;
        const value =
          raw instanceof Date && !Number.isNaN(raw.getTime())
            ? raw
            : (raw == null || raw === "")
              ? ""
              : raw;
        rec[c.name] = value;
        if (!isEmptyCell(value)) hasData = true;
      }
      if (!hasData) continue;
      if (columnOrigen) rec[columnOrigen] = originLabel;
      rows.push(rec);
    }
    const plate = ws.name || pathBasenameSafe(xlsxPath);
    out.push({ plate, rows, filename: pathBasenameSafe(xlsxPath), filePath: xlsxPath });
  }
  return out;
}

function pathBasenameSafe(p) {
  return String(p || "").replace(/\\/g, "/").split("/").pop() || "SIN-ARCHIVO";
}

export async function writeConsolidatedWorkbook(outputPath, sheets, columns) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema Reportes Flota Onway";
  workbook.created = new Date();

  const usedNames = new Set();
  for (const sheet of sheets) {
    let name = excelSheetName(sheet.plate);
    let i = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = excelSheetName(`${sheet.plate}-${i}`);
      i += 1;
    }
    usedNames.add(name.toLowerCase());

    const ws = workbook.addWorksheet(name);
    ws.addRow(columns);
    const headerRow = ws.getRow(1);
    headerRow.font = HEADER_FONT;
    headerRow.fill = HEADER_FILL;
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 22;

    for (const record of sheet.rows) {
      ws.addRow(columns.map((col) => formatCell(record[col])));
    }

    ws.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.font = rowNumber === 1 ? HEADER_FONT : CELL_FONT;
        cell.border = {
          top: { style: "thin", color: { argb: "FFD0D0D0" } },
          left: { style: "thin", color: { argb: "FFD0D0D0" } },
          bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
          right: { style: "thin", color: { argb: "FFD0D0D0" } },
        };
        if (rowNumber > 1 && rowNumber % 2 === 0) {
          cell.fill = ZEBRA_FILL;
        }
      });
    });

    ws.columns = columns.map((header) => ({
      header,
      width: columnWidth(header, sheet.rows),
    }));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet("SIN DATOS");
    ws.addRow(["No se procesaron placas para esta fecha"]);
  }

  await workbook.xlsx.writeFile(outputPath);
}

export function summarizeTables(tables, reportType, columns) {
  const byPlate = [];
  const byEvent = new Map();
  const bySeverity = new Map();
  let total = 0;
  let lastAt = null;

  const eventCol = reportType?.columna_alerta || reportType?.columna_evento || "Alerta";
  const sevCol = reportType?.columna_severidad || "Severidad de la alerta";

  for (const table of tables) {
    total += table.rows.length;
    const types = {};
    let lastForPlate = "";
    for (const row of table.rows) {
      const eventName = String(row[eventCol] || "").trim() || "(sin tipo)";
      types[eventName] = (types[eventName] || 0) + 1;
      byEvent.set(eventName, (byEvent.get(eventName) || 0) + 1);

      const severity = String(row[sevCol] || "").trim();
      if (severity) {
        bySeverity.set(severity, (bySeverity.get(severity) || 0) + 1);
      }

      const stamp = [row.Fecha, row.Hora].filter((v) => !isEmptyCell(v)).join(" ");
      if (stamp && stamp > lastForPlate) lastForPlate = stamp;
      if (stamp && (!lastAt || stamp > lastAt)) lastAt = stamp;
    }

    const alias = table.rows.find((r) => !isEmptyCell(r.Alias))?.Alias || "";
    byPlate.push({
      placa: table.plate,
      alias: String(alias),
      alertas: table.rows.length,
      registros: table.rows.length,
      ultima_alerta: lastForPlate || null,
      ultimo_registro: lastForPlate || null,
      estado: "OK",
      archivo: table.filename,
      tipos: types,
    });
  }

  return {
    total_alertas: total,
    total_registros: total,
    columnas: columns,
    placas: byPlate.sort((a, b) => a.placa.localeCompare(b.placa)),
    por_tipo: [...byEvent.entries()]
      .map(([tipo, cantidad]) => ({ tipo, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
    por_severidad: [...bySeverity.entries()]
      .map(([severidad, cantidad]) => ({ severidad, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
    ultima_alerta: lastAt,
    ultimo_registro: lastAt,
  };
}
