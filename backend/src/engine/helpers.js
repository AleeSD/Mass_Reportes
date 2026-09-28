const MESES = {
  "01": ["enero"],
  "02": ["febrero"],
  "03": ["marzo"],
  "04": ["abril"],
  "05": ["mayo"],
  "06": ["junio"],
  "07": ["julio"],
  "08": ["agosto"],
  "09": ["setiembre", "septiembre"],
  "10": ["octubre"],
  "11": ["noviembre"],
  "12": ["diciembre"],
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

export function todayIso(timeZone = "America/Lima") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseToIso(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (ISO_DATE.test(trimmed)) return trimmed;
  const m = trimmed.match(DMY_DATE);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function isoToDmy(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function monthFolderNames(iso) {
  const month = iso.slice(5, 7);
  return MESES[month] || [];
}

export function isEmptyCell(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

export function normalizeHeader(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePlate(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
}

export function excelSheetName(plate) {
  const cleaned = String(plate || "SIN-PLACA")
    .replace(/[\\/?*[\]]/g, "-")
    .slice(0, 31);
  return cleaned || "SIN-PLACA";
}

export function plateFromFilename(filename) {
  const base = pathBase(filename);
  const match = base.match(/alerts[_-]([A-Z0-9-]{4,})/i);
  if (match) return normalizePlate(match[1]);
  return null;
}

function pathBase(filename) {
  return String(filename).replace(/\\/g, "/").split("/").pop().replace(/\.xlsx$/i, "");
}

export function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
    if (value.text) return String(value.text);
    if (value.richText) return value.richText.map((p) => p.text).join("");
    if (value.result !== undefined) return cellToString(value.result);
    if (value.hyperlink && value.text) return String(value.text);
    return "";
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

const STRING_LITERAL = /^"((?:[^"\\]|\\.)*)"/;

function skipWhitespace(s, i) {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  return i;
}

function parseStringLiteral(s, i0) {
  const rest = s.slice(i0);
  const m = rest.match(STRING_LITERAL);
  if (!m) return { ok: false };
  return { ok: true, value: m[1].replace(/\\"/g, '"'), end: i0 + m[0].length };
}

function parseNumberLiteral(s, i0) {
  const rest = s.slice(i0);
  const m = rest.match(/^-?\d+(\.\d+)?/);
  if (!m) return { ok: false };
  return { ok: true, value: Number(m[0]), end: i0 + m[0].length };
}

function parseIfOrHyperlink(s, i0) {
  const upper = s.slice(i0, i0 + 10).toUpperCase();
  if (upper.startsWith("IF(")) return parseIf(s, i0);
  if (upper.startsWith("HYPERLINK(")) return parseHyperlink(s, i0);
  return { ok: false };
}

function splitTopLevelArgs(insideParens) {
  const args = [];
  let depth = 0;
  let inStr = false;
  let cur = "";
  for (let i = 0; i < insideParens.length; i += 1) {
    const c = insideParens[i];
    if (inStr) {
      cur += c;
      if (c === '"' && insideParens[i - 1] !== "\\") inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      cur += c;
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    if (c === "," && depth === 0) {
      args.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length) args.push(cur);
  return args.map((a) => a.trim());
}

function parseExpression(expr) {
  const s = expr.trim();
  if (!s) return { ok: false };
  // Cadena
  if (s.startsWith('"')) {
    const p = parseStringLiteral(s, 0);
    if (p.ok && skipWhitespace(s, p.end) === s.length) return { ok: true, value: p.value };
  }
  // Número
  const num = parseNumberLiteral(s, 0);
  if (num.ok && skipWhitespace(s, num.end) === s.length) return { ok: true, value: num.value };
  return { ok: false };
}

function parseComparison(cond) {
  const s = cond.trim();
  // Patrón a=b con literales a cada lado
  const eqIdx = s.indexOf("=");
  if (eqIdx < 0) return { ok: false };
  const left = parseExpression(s.slice(0, eqIdx));
  const right = parseExpression(s.slice(eqIdx + 1));
  if (!left.ok || !right.ok) return { ok: false };
  return { ok: true, value: Object.is(left.value, right.value) };
}

function evalIfBody(body) {
  const args = splitTopLevelArgs(body);
  if (args.length < 3) return { unresolved: true };
  const cond = parseComparison(args[0]);
  if (!cond.ok) return { unresolved: true };
  const branch = cond.value ? args[1] : args[2];
  return evalFormulaExpr(branch);
}

function evalHyperlinkBody(body) {
  const args = splitTopLevelArgs(body);
  if (args.length < 2) return { unresolved: true };
  // Devolvemos el segundo argumento (el texto visible)
  const textExpr = parseExpression(args[1]);
  if (textExpr.ok) return textExpr.value;
  // Si falla por algo raro, intentamos la rama alternativa: evaluar como expr anidada
  const alt = evalFormulaExpr(args[1]);
  if (typeof alt === "string") return alt;
  return { unresolved: true };
}

function evalFormulaExpr(expr) {
  const s = expr.trim();
  if (!s) return "";
  const upper = s.toUpperCase();
  if (upper.startsWith("IF(")) {
    if (!s.endsWith(")")) return { unresolved: true };
    return evalIfBody(s.slice(3, -1));
  }
  if (upper.startsWith("HYPERLINK(")) {
    if (!s.endsWith(")")) return { unresolved: true };
    return evalHyperlinkBody(s.slice(10, -1));
  }
  const lit = parseExpression(s);
  if (lit.ok) return lit.value;
  return { unresolved: true };
}

/**
 * Parsea y evalúa fórmulas mínimas que Onway exporta sin calcular:
 *   - HYPERLINK("url","texto")  -> devuelve texto
 *   - IF(a=b, "X", Y) con literales, incluido IF anidado en Y  -> devuelve "X" o rama Y
 *
 * Acepta tanto el string de fórmula crudo como el objeto ExcelJS { formula, ... }.
 * Valores de retorno:
 *   - string: fórmula reconocida y resuelta a texto
 *   - { unresolved: true }: fórmula detectada pero no coincide con patrones Onway
 *   - null: el valor no era una fórmula
 */
export function resolveOnwayFormula(value) {
  if (!value) return null;
  let formulaText = null;
  if (typeof value === "string") {
    if (value.startsWith("=")) formulaText = value.slice(1);
  } else if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    if (typeof value.formula === "string") formulaText = value.formula;
  }
  if (!formulaText) return null;
  const result = evalFormulaExpr(formulaText);
  if (result && typeof result === "object" && "unresolved" in result) return { unresolved: true };
  return typeof result === "string" ? result : result == null ? "" : String(result);
}

/**
 * Recorre todas las celdas de un workbook en memoria y busca la cadena
 * literal "[object Object]" como señal de que una fórmula no fue resuelta.
 * Retorna { found: boolean, cells: [{sheet, row, col}] }.
 */
export function scanWorkbookForObjectObject(workbook) {
  const cells = [];
  if (!workbook || !Array.isArray(workbook.worksheets)) return { found: false, cells };
  for (const ws of workbook.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        const text = cellToString(cell.value);
        if (typeof text === "string" && text.includes("[object Object]")) {
          cells.push({ sheet: ws.name, row: rowNum, col: colNum, value: text });
        }
      });
    });
  }
  return { found: cells.length > 0, cells };
}
