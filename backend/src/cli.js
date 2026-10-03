import { getReportType, loadConfig } from "./config.js";
import { saveRun } from "./db.js";
import { addDaysIso, parseToIso, todayIso } from "./engine/helpers.js";
import { runReport } from "./runner.js";

const args = process.argv.slice(2);
const tipo = argValue("--tipo") || "alertas";
const fechaArg = argValue("--fecha");

function argValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

const config = loadConfig();
const hoy = todayIso(config.scheduler?.timezone || "America/Lima");
// --fecha acepta YYYY-MM-DD, DD-MM-YYYY, "hoy" o "ayer" (D6: el día anterior).
const iso =
  fechaArg === "ayer" ? addDaysIso(hoy, -1) : fechaArg === "hoy" || !fechaArg ? hoy : parseToIso(fechaArg);
if (!iso) {
  console.error(`Fecha inválida: ${fechaArg}. Use YYYY-MM-DD, DD-MM-YYYY, hoy o ayer`);
  process.exit(1);
}
const reportType = getReportType(config, tipo);

const result = await runReport({ config, reportType, isoDate: iso });
saveRun(result);
console.log(JSON.stringify({
  fecha: result.fecha,
  tipo: result.tipo,
  key_publico: result.key_publico || reportType.key_publico,
  estado: result.estado,
  archivos: result.archivos_encontrados,
  ok: result.placas_ok,
  error: result.placas_error,
  consolidado: result.consolidado,
  total_alertas: result.resumen?.total_alertas,
  total_registros: result.resumen?.total_registros,
  analitica_flota: result.resumen?.analitica_flota,
}, null, 2));

if (result.estado === "error" || result.estado === "sin_archivos") {
  process.exitCode = 1;
}
