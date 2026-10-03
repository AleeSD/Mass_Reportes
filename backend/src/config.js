import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../..");

const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "reportes.yaml");
const FLEET_CONFIG_PATH = path.join(PROJECT_ROOT, "config", "flota.yaml");
const ZONES_CONFIG_PATH = path.join(PROJECT_ROOT, "config", "zonas.yaml");

export function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return yaml.load(raw);
}

function loadYamlIfExists(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    const raw = fs.readFileSync(filePath, "utf8");
    return yaml.load(raw) ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export function loadFleetConfig() {
  return loadYamlIfExists(FLEET_CONFIG_PATH, {
    fecha_actualizacion: null,
    placas: [],
  });
}

export function loadZonesConfig() {
  return loadYamlIfExists(ZONES_CONFIG_PATH, {
    alertas_ingreso: ["Llegó a la zona"],
    alertas_salida: ["Salió de zona"],
    zonas: {
      bsf: { nombre: "MASS BSF 1", etiqueta: "BSF" },
      base_os: { nombre: "BASE-OSLOGISTICS", etiqueta: "BASE OS" },
      tienda: {
        patron: "^(\\d+)[-\\s]",
        grupo_codigo: 1,
        catalogo: "config/tiendas_mass.csv",
      },
    },
  });
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((value) => String(value ?? "").trim());
}

export function loadStoresCatalog(csvRelativePath = "config/tiendas_mass.csv") {
  const csvPath = absPath(csvRelativePath);
  if (!fs.existsSync(csvPath)) return [];
  const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

export function absPath(...parts) {
  return path.resolve(PROJECT_ROOT, ...parts);
}

export function inputRoot(config) {
  if (!config.rutas?.raiz_entrada) return null;
  return absPath(config.rutas.raiz_entrada);
}

export function outputRoot(config) {
  if (!config.rutas?.raiz_salida) return null;
  return absPath(config.rutas.raiz_salida);
}

/**
 * Retorna la lista de reportes compuestos definidos. Cada uno lleva su `key`
 * (el nombre de la entrada YAML), su `key_publico` (para API/frontend) y el
 * resto de campos. Para tipos compuestos usamos `key_publico` como clave
 * externa, mientras que en `runs` guardamos el `key` interno (ej. "consolidado_diario").
 */
export function listCompositeReports(config) {
  return Object.entries(config.reportes_compuestos || {})
    .filter(([, def]) => def?.habilitado !== false)
    .map(([key, def]) => ({
      key,
      key_publico: def.key_publico || key,
      es_compuesto: true,
      ...def,
    }));
}

function allReportLikeEntries(config) {
  const reportes = Object.entries(config.reportes || {}).map(([key, def]) => ({
    key,
    key_publico: key,
    es_compuesto: false,
    ...def,
  }));
  const compuestos = listCompositeReports(config).map((c) => c);
  return [...reportes, ...compuestos];
}

export function getReportType(config, typeKey) {
  // Primero por key pública (ej. "consolidado")
  const byPub = allReportLikeEntries(config).find(
    (t) => String(t.key_publico) === String(typeKey) || String(t.key) === String(typeKey)
  );
  if (byPub) return byPub;
  throw new Error(`Tipo de reporte desconocido: ${typeKey}`);
}

export function enabledReportTypes(config) {
  return allReportLikeEntries(config).filter((t) => t.habilitado !== false);
}
