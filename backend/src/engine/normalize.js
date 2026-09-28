import ExcelJS from "exceljs";
import path from "node:path";
import {
  cellToString,
  isEmptyCell,
  normalizeHeader,
  normalizePlate,
  plateFromFilename,
  resolveOnwayFormula,
} from "./helpers.js";

function headerMatches(actual, expected) {
  return normalizeHeader(actual).toLowerCase() === normalizeHeader(expected).toLowerCase();
}

function findHeaderRow(worksheet, reportType) {
  const needle = reportType.columna_placa;
  const maxScan = Math.min(worksheet.rowCount || 20, 30);
  for (let r = 1; r <= maxScan; r += 1) {
    const row = worksheet.getRow(r);
    const values = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      values.push(normalizeHeader(cellToString(cell.value)));
    });
    if (values.some((h) => headerMatches(h, needle))) {
      return r;
    }
    if (values.some((h) => headerMatches(h, "Alerta") || headerMatches(h, "Secuencia"))) {
      return r;
    }
  }
  return 1;
}

function buildHeaderMap(row) {
  const map = new Map();
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = normalizeHeader(cellToString(cell.value));
    if (header && !map.has(header.toLowerCase())) {
      map.set(header.toLowerCase(), { name: header, col: colNumber });
    }
  });
  return map;
}

function lookupHeader(headerMap, name) {
  return headerMap.get(normalizeHeader(name).toLowerCase()) || null;
}

function pickPlate(rows, plateColumn, filename) {
  const counts = new Map();
  for (const row of rows) {
    const plate = normalizePlate(row[plateColumn]);
    if (!plate) continue;
    counts.set(plate, (counts.get(plate) || 0) + 1);
  }
  if (counts.size === 0) {
    return plateFromFilename(filename);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export async function readReportFile(filePath, reportType) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet =
    workbook.getWorksheet(reportType.hoja_origen) || workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("El archivo no contiene hojas");
  }

  const headerRowNumber = findHeaderRow(worksheet, reportType);
  const headerMap = buildHeaderMap(worksheet.getRow(headerRowNumber));
  const plateMeta = lookupHeader(headerMap, reportType.columna_placa);
  if (!plateMeta) {
    throw new Error(`No se encontró la columna "${reportType.columna_placa}"`);
  }

  const missingRequired = (reportType.columnas_obligatorias || []).filter(
    (col) => !lookupHeader(headerMap, col),
  );

  const headers = [...headerMap.values()].sort((a, b) => a.col - b.col).map((h) => h.name);
  const rows = [];
  const unresolvedFormulaWarnings = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const record = {};
    let hasData = false;
    for (const header of headers) {
      const meta = lookupHeader(headerMap, header);
      const cellValue = meta ? row.getCell(meta.col).value : null;
      let resolved;
      let unresolved = false;
      const formulaResult = resolveOnwayFormula(cellValue);
      if (formulaResult === null) {
        // No era fórmula: normalizamos como siempre
        const text = cellValue instanceof Date ? cellValue : cellToString(cellValue).trim();
        resolved = text instanceof Date ? text : text;
      } else if (typeof formulaResult === "string") {
        resolved = formulaResult;
      } else if (formulaResult && typeof formulaResult === "object" && "unresolved" in formulaResult) {
        // Fórmula detectada pero no reconocida: vacío + warn
        resolved = "";
        unresolved = true;
        unresolvedFormulaWarnings.push({ columna: header, fila: rowNumber });
      } else {
        resolved = "";
      }
      const normalized = resolved === "" ? "" : resolved;
      record[header] = normalized;
      if (!isEmptyCell(record[header])) hasData = true;
    }
    if (hasData) rows.push(record);
  });

  const plate = pickPlate(rows, plateMeta.name, path.basename(filePath));
  if (!plate) {
    throw new Error("Columna de placa vacía y el nombre de archivo no contiene placa");
  }

  return {
    filePath,
    filename: path.basename(filePath),
    sheetName: worksheet.name,
    headers,
    rows,
    plate,
    missingRequired,
    headerMap: headers,
    unresolvedFormulaWarnings,
  };
}

export function applyTemplate(rows, reportType) {
  const template = reportType.columnas_plantilla || [];
  if (!template.length) {
    const union = [];
    const seen = new Set();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const k = normalizeHeader(key);
        if (!seen.has(k.toLowerCase())) {
          seen.add(k.toLowerCase());
          union.push(k);
        }
      }
    }
    return rows.map((row) => mapRow(row, union));
  }
  return rows.map((row) => mapRow(row, template));
}

function mapRow(row, columns) {
  const lookup = new Map();
  for (const [key, value] of Object.entries(row)) {
    lookup.set(normalizeHeader(key).toLowerCase(), value);
  }
  const out = {};
  for (const col of columns) {
    const value = lookup.get(normalizeHeader(col).toLowerCase());
    out[col] = value === undefined || value === null ? "" : value;
  }
  return out;
}

export function pruneEmptyColumns(tables, columns, enabled) {
  if (!enabled) return columns;
  return columns.filter((col) =>
    tables.some((table) =>
      table.rows.some((row) => !isEmptyCell(row[col])),
    ),
  );
}

export function formatCell(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  return isEmptyCell(value) ? "" : value;
}
