import { loadConfig, getReportType } from "./backend/src/config.js";
import { resolveOutputPath, discoverAvailableDates } from "./backend/src/engine/paths.js";

const cfg = loadConfig();
const FECHA = "2026-09-18";
for (const k of ["alertas", "historial", "consolidado"]) {
  const rt = getReportType(cfg, k);
  const out = resolveOutputPath(cfg, FECHA, rt);
  console.log(`${k}  → ${out}`);
}
console.log("\ndiscoverAvailableDates(alertas)  :", discoverAvailableDates(cfg, getReportType(cfg, "alertas")));
console.log("discoverAvailableDates(consolidado):", discoverAvailableDates(cfg, getReportType(cfg, "consolidado")));
