import { getReportType } from "./config.js";
import { withLock } from "./locks.js";
import { inputFingerprint } from "./engine/paths.js";
import { processCompositeDay, processDay } from "./engine/processDay.js";

/**
 * Procesa un tipo (base o compuesto) para una fecha, con bloqueo tipo+fecha.
 * Registra en el resumen la huella de los archivos de entrada procesados.
 */
export function runReport({ config, reportType, isoDate }) {
  return withLock(reportType.key, isoDate, async () => {
    const huella = inputFingerprint(config, isoDate, reportType, getReportType);
    const result = reportType.es_compuesto
      ? await processCompositeDay({ config, compositeReport: reportType, isoDate })
      : await processDay({ config, reportType, isoDate });
    result.resumen = { ...(result.resumen || {}), huella_entrada: huella };
    return result;
  });
}
