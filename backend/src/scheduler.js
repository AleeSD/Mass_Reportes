import cron from "node-cron";
import { enabledReportTypes, loadConfig } from "./config.js";
import { saveRun } from "./db.js";
import { todayIso } from "./engine/helpers.js";
import { processCompositeDay, processDay } from "./engine/processDay.js";

async function runOne({ config, reportType, iso }) {
  if (reportType.es_compuesto) {
    return processCompositeDay({ config, compositeReport: reportType, isoDate: iso });
  }
  return processDay({ config, reportType, isoDate: iso });
}

export function startScheduler() {
  const config = loadConfig();
  const sched = config.scheduler || {};
  if (sched.habilitado === false) {
    console.log("[scheduler] deshabilitado por configuración");
    return;
  }
  const expr = sched.cron || "*/10 * * * *";
  if (!cron.validate(expr)) {
    console.error(`[scheduler] expresión cron inválida: ${expr}`);
    return;
  }
  cron.schedule(
    expr,
    async () => {
      const cfg = loadConfig();
      const iso = todayIso(cfg.scheduler?.timezone || "America/Lima");
      const tipos = enabledReportTypes(cfg);
      // Tipos base primero, luego compuestos
      const bases = tipos.filter((t) => !t.es_compuesto);
      const compuestos = tipos.filter((t) => !!t.es_compuesto);
      for (const reportType of [...bases, ...compuestos]) {
        try {
          const result = await runOne({ config: cfg, reportType, iso });
          const saveIt = reportType.es_compuesto
            ? (result.placas_ok > 0)
            : (result.archivos_encontrados > 0);
          if (saveIt) {
            saveRun(result);
            console.log(
              `[scheduler] ${reportType.key_publico || reportType.key} ${iso}: ${result.estado} (${result.placas_ok} ok, ${result.placas_error} error)`,
            );
          }
        } catch (error) {
          console.error(
            `[scheduler] error ${reportType.key_publico || reportType.key} ${iso}:`,
            error.message,
          );
        }
      }
    },
    { timezone: sched.timezone || "America/Lima" },
  );
  console.log(`[scheduler] activo (${expr}) tz=${sched.timezone || "America/Lima"}`);
}
