/**
 * Depuración 1 (§4.1): un evento del mismo tipo (Llegó/Salió) y la misma zona
 * que el evento anterior de esa zona, dentro de `dedupe_segundos`, es un
 * duplicado y se ignora (ej. AAR-880 Salió BSF 11:24:50 y 11:24:55).
 */
export function cleanEvents(zoneEvents, params = {}) {
  const dedupe = Number(params.dedupe_segundos ?? 120);
  const lastByZone = new Map();
  const kept = [];
  const duplicates = [];
  for (const ev of zoneEvents) {
    const prev = lastByZone.get(ev.zona.key);
    if (prev && prev.kind === ev.kind && ev.ts - prev.ts <= dedupe) {
      duplicates.push({
        ts: ev.ts,
        zonaKey: ev.zona.key,
        zona: ev.zona.nombre,
        marca: ev.kind === "out" ? "salida duplicada" : "llegada duplicada",
      });
      continue;
    }
    lastByZone.set(ev.zona.key, ev);
    kept.push(ev);
  }
  return { events: kept, duplicates };
}
