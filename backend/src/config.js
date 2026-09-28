import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../..");

const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "reportes.yaml");

export function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return yaml.load(raw);
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
