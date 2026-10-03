import cron from "node-cron";
import { enabledReportTypes, getReportType, loadConfig } from "./config.js";
import { getLatestRun, saveRun } from "./db.js";
import { addDaysIso, todayIso } from "./engine/helpers.js";
import { inputFingerprint, sameFingerprint } from "./engine/paths.js";
import { LockedError } from "./locks.js";
import { runReport } from "./runner.js";

function daysToCheck(sched) {
  const hoy = todayIso(sched.timezone || "America/Lima");
  const wanted = Array.isArray(sched.dias_a_revisar) && sched.dias_a_revisar.length
    ? sched.dias_a_revisar
    : ["hoy"];
  const days = wanted.map((d) => (d === "ayer" ? addDaysIso(hoy, -1) : d === "hoy" ? hoy : d));
  return [...new Set(days)];
}

/**
 * Un ciclo del scheduler: por cada día a revisar procesa Alertas -> Historial ->
 * Consolidado, solo si los archivos están estables y cambiaron desde el último run.
 */
export async function runSchedulerCycle(cfg = loadConfig(), { now = Date.now(), log = console } = {}) {
  const sched = cfg.scheduler || {};
  const estabilidadMs = Number(sched.estabilidad_segundos ?? 120) * 1000;
  const soloSiCambio = sched.solo_si_cambio !== false;
  const tipos = enabledReportTypes(cfg);
  const ordered = [...tipos.filter((t) => !t.es_compuesto), ...tipos.filter((t) => t.es_compuesto)];
  const summary = [];

  for (const iso of daysToCheck(sched)) {
    // Estabilidad: si algún .xlsx del día cambió hace poco, se espera al próximo ciclo.
    const all = ordered.filter((t) => !t.es_compuesto).map((t) => inputFingerprint(cfg, iso, t));
    const lastChange = Math.max(0, ...all.map((f) => (f.ultima_modificacion ? Date.parse(f.ultima_modificacion) : 0)));
    if (lastChange && now - lastChange < estabilidadMs) {
      log.log(`[scheduler] ${iso}: archivos modificados hace menos de ${estabilidadMs / 1000}s, se espera al próximo ciclo`);
      summary.push({ fecha: iso, accion: "esperando_estabilidad" });
      continue;
    }
    for (const reportType of ordered) {
      const name = reportType.key_publico || reportType.key;
      const huella = inputFingerprint(cfg, iso, reportType, getReportType);
      if (huella.archivos === 0) continue;
      if (soloSiCambio) {
        const last = getLatestRun(reportType.key, iso);
        if (last && last.estado !== "error" && sameFingerprint(last.resumen?.huella_entrada, huella)) {
          summary.push({ fecha: iso, tipo: name, accion: "sin_cambios" });
          continue;
        }
      }
      try {
        const result = await runReport({ config: cfg, reportType, isoDate: iso });
        const saveIt = reportType.es_compuesto ? result.placas_ok > 0 : result.archivos_encontrados > 0;
        if (saveIt) {
          saveRun(result);
          const cobertura = result.resumen?.analitica_flota?.generado
            ? ` · ${result.resumen.analitica_flota.placas_con_reporte} de ${result.resumen.analitica_flota.placas_esperadas} placas`
            : "";
          log.log(
            `[scheduler] ${name} ${iso}: ${result.estado} (${result.placas_ok} ok, ${result.placas_error} error)${cobertura}`,
          );
        }
        summary.push({ fecha: iso, tipo: name, accion: "procesado", estado: result.estado });
      } catch (error) {
        if (error instanceof LockedError) {
          log.log(`[scheduler] ${name} ${iso}: en proceso manual, se omite este ciclo`);
          summary.push({ fecha: iso, tipo: name, accion: "bloqueado" });
          continue;
        }
        log.error(`[scheduler] error ${name} ${iso}:`, error.message);
        summary.push({ fecha: iso, tipo: name, accion: "error", error: error.message });
      }
    }
  }
  return summary;
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
  cron.schedule(expr, () => runSchedulerCycle(loadConfig()), { timezone: sched.timezone || "America/Lima" });
  console.log(
    `[scheduler] activo (${expr}) tz=${sched.timezone || "America/Lima"} días=${(sched.dias_a_revisar || ["hoy"]).join(",")}`,
  );
}
