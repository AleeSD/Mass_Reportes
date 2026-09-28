import { getReportType, loadConfig } from "./config.js";
import { saveRun } from "./db.js";
import { parseToIso, todayIso } from "./engine/helpers.js";
import { processCompositeDay, processDay } from "./engine/processDay.js";

const args = process.argv.slice(2);
const tipo = argValue("--tipo") || "alertas";
const fechaArg = argValue("--fecha");

function argValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

const config = loadConfig();
const iso = parseToIso(fechaArg) || todayIso(config.scheduler?.timezone || "America/Lima");
const reportType = getReportType(config, tipo);

const result = reportType?.es_compuesto
  ? await processCompositeDay({ config, compositeReport: reportType, isoDate: iso })
  : await processDay({ config, reportType, isoDate: iso });
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
}, null, 2));

if (result.estado === "error" || result.estado === "sin_archivos") {
  process.exitCode = 1;
}
