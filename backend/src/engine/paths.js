import fs from "node:fs";
import path from "node:path";
import { absPath, inputRoot, outputRoot } from "../config.js";
import { isoToDmy, monthFolderNames, parseToIso } from "./helpers.js";

function existsDir(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function listXlsx(dir) {
  if (!existsDir(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"))
    .map((name) => path.join(dir, name));
}

/**
 * Devuelve la lista de carpetas raíz a inspeccionar para un tipo de reporte.
 * Prioridad: carpeta_raiz del tipo → fallbacks del tipo → raiz_entrada global (legacy).
 */
function rootsForReportType(config, reportType) {
  const roots = [];
  if (reportType?.carpeta_raiz) roots.push(String(reportType.carpeta_raiz));
  if (Array.isArray(reportType?.carpeta_raiz_fallback)) {
    for (const f of reportType.carpeta_raiz_fallback) roots.push(String(f));
  }
  // Legacy: rutas.raiz_entrada global
  if (config.rutas?.raiz_entrada) roots.push(String(config.rutas.raiz_entrada));
  return roots
    .map((r) => absPath(r))
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

/**
 * Resuelve las carpetas de entrada del día para un tipo concreto.
 * Soporta estructura recomendada y actual del equipo, con múltiples raíces.
 *   <raiz>/YYYY-MM-DD/<carpeta_entrada>/
 *   <raiz>/YYYY-MM-DD/
 *   <raiz>/<mes>/DD-MM-YYYY/<carpeta_entrada>/
 *   <raiz>/<mes>/DD-MM-YYYY/
 *   <raiz>/<mes>/YYYY-MM-DD/<carpeta_entrada>/
 *   <raiz>/<mes>/YYYY-MM-DD/
 */
export function resolveInputDirs(config, isoDate, reportType) {
  const roots = rootsForReportType(config, reportType);
  const dmy = isoToDmy(isoDate);
  const months = monthFolderNames(isoDate);
  const sub = reportType.carpeta_entrada || "";
  const found = [];
  const seen = new Set();

  for (const root of roots) {
    const candidates = [
      path.join(root, isoDate, sub),
      path.join(root, isoDate),
      ...months.flatMap((month) => [
        path.join(root, month, dmy, sub),
        path.join(root, month, dmy),
        path.join(root, month, isoDate, sub),
        path.join(root, month, isoDate),
      ]),
    ];
    for (const dir of candidates) {
      const resolved = path.resolve(dir);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      if (listXlsx(resolved).length > 0) found.push(resolved);
    }
  }
  return found;
}

export function listInputFiles(config, isoDate, reportType) {
  const dirs = resolveInputDirs(config, isoDate, reportType);
  const files = dirs.flatMap(listXlsx);
  const unique = [];
  const seen = new Set();
  for (const file of files) {
    const key = path.resolve(file).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }
  return unique;
}

/**
 * Devuelve las carpetas raíz de salida: la principal y la de respaldo si existe.
 * Para escribir, siempre usamos la principal (ensureOutputDir la crea si no existe).
 * Para leer, buscamos en ambas.
 */
function outputRoots(config) {
  const list = [];
  if (config.rutas?.raiz_salida) list.push(absPath(config.rutas.raiz_salida));
  const fallbacks = config.rutas?.raiz_salida_fallback;
  if (Array.isArray(fallbacks)) {
    for (const f of fallbacks) list.push(absPath(f));
  } else if (fallbacks) {
    list.push(absPath(fallbacks));
  }
  // Legacy: si configuraba raiz_entrada y ahí había _procesados
  if (config.rutas?.raiz_entrada) {
    const legacy = absPath(config.rutas.raiz_entrada);
    if (legacy) list.push(path.join(legacy, "_procesados"));
  }
  return list.filter((v, i, arr) => arr.indexOf(v) === i);
}

export function resolveOutputPath(config, isoDate, reportType) {
  const name = String(reportType.nombre_salida).replace("{fecha}", isoDate);
  const roots = outputRoots(config);
  // Escribimos siempre en la raíz principal configurada
  const primary = roots[0] || outputRoot(config);
  // Estructura: <raiz_salida>/<mes>/<isoDate>/<archivo>
  const meses = monthFolderNames(isoDate);
  const mes = meses[0] || isoDate.slice(5, 7);
  return path.join(primary, mes, isoDate, name);
}

/**
 * Busca un archivo de salida ya existente probando todas las convenciones
 * (nueva con <mes>/ y la legacy directamente en <isoDate>/), en todas las
 * raíces de salida configuradas. Retorna null si no existe.
 */
export function findExistingOutputPath(config, isoDate, reportType) {
  const name = String(reportType.nombre_salida).replace("{fecha}", isoDate);
  const roots = outputRoots(config);
  const meses = monthFolderNames(isoDate);
  const mes = meses[0] || isoDate.slice(5, 7);
  const candidates = [];
  for (const root of roots) {
    // Nueva convención: <raiz>/<mes>/<isoDate>/<archivo>
    candidates.push(path.join(root, mes, isoDate, name));
    // Otras variantes de nombre de mes (ej. setiembre vs septiembre)
    for (let i = 1; i < meses.length; i++) {
      candidates.push(path.join(root, meses[i], isoDate, name));
    }
    // Legacy: <raiz>/<isoDate>/<archivo>
    candidates.push(path.join(root, isoDate, name));
  }
  const seen = new Set();
  for (const c of candidates) {
    const resolved = path.resolve(c);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function ensureOutputDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function collectIsoDatesInRoot(root, reportTypeCtx, depth = 0, acc = new Set()) {
  if (!existsDir(root) || depth > 4) return acc;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  const base = path.basename(root);
  const iso = parseToIso(base);
  if (iso && listXlsx(root).length > 0) {
    acc.add(iso);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    collectIsoDatesInRoot(path.join(root, entry.name), reportTypeCtx, depth + 1, acc);
  }
  void reportTypeCtx;
  return acc;
}

export function discoverAvailableDates(config, reportType) {
  const dates = new Set();

  // Fechas detectadas en las carpetas de entrada de este tipo
  const inRoots = rootsForReportType(config, reportType);
  for (const r of inRoots) collectIsoDatesInRoot(r, reportType, 0, dates);

  // Fechas detectadas en las carpetas de salida (incluso si la entrada se borró)
  const outRoots = outputRoots(config);
  for (const outRoot of outRoots) {
    if (!existsDir(outRoot)) continue;
    for (const entry of fs.readdirSync(outRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Caso legacy: <raiz>/<isoDate>/
      const iso = parseToIso(entry.name);
      if (iso) {
        dates.add(iso);
        continue;
      }
      // Caso nuevo: <raiz>/<mes>/<isoDate>/ — entrar un nivel más
      const monthDir = path.join(outRoot, entry.name);
      if (!existsDir(monthDir)) continue;
      try {
        for (const sub of fs.readdirSync(monthDir, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const subIso = parseToIso(sub.name);
          if (subIso) dates.add(subIso);
        }
      } catch {
        // ignore permission errors
      }
    }
  }

  return [...dates].sort().reverse();
}
