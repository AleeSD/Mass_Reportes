import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { api, cn } from "../../lib/api.js";
import { ZONE_COLORS, ZONE_LABELS, dur, hms } from "../../lib/fleetFormat.js";
import { Skeleton } from "../ui.jsx";

function Row({ label, value, estimated }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium tabular-nums", estimated && "italic text-amber-700")} style={{ fontFamily: "var(--font-mono)" }}>
        {value}
      </span>
    </div>
  );
}

/** Panel lateral: secuencia cronológica de una placa con tiempos y marcas de calidad. */
export default function PlateDetailPanel({ fecha, placa, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    api(`/api/fleet/timeline/${fecha}/${encodeURIComponent(placa)}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [fecha, placa]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = data?.placa;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label={`Detalle ${placa}`}>
      <button className="absolute inset-0 bg-slate-900/20" onClick={onClose} aria-label="Cerrar" />
      <aside className="relative w-full max-w-md h-full bg-card border-l border-border shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div>
            <h3 className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
              {placa}
            </h3>
            <p className="text-xs text-muted-foreground">
              {p ? `${p.empresa || "—"} · ${p.tipo || "—"} · ${p.estado_reporte}` : "Cargando…"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Cerrar panel">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && <p className="text-xs text-red-700">{error}</p>}
          {!data && !error && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </div>
          )}
          {p && (
            <>
              <section>
                <Row label="Inicio de jornada" value={`${hms(p.inicio_jornada)}${p.inicio_calidad === "estimado" ? " (estimado)" : ""}`} estimated={p.inicio_calidad === "estimado"} />
                <Row label="Tiempo total en BSF" value={dur(p.seg_total_bsf)} />
                <Row label="Tiendas visitadas" value={p.tiendas_visitadas ?? "—"} />
                <Row label="Tiempo total en ruta" value={dur(p.seg_total_ruta)} />
                <Row label="Cierre del día" value={p.cierre_dia || "—"} />
                <Row label="Última señal" value={hms(p.ultima_senal)} />
                {p.observaciones && (
                  <p className="mt-2 text-[11px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5">
                    {p.observaciones}
                  </p>
                )}
                {data.archivo_original && (
                  <a
                    href={data.archivo_original.url}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Download size={12} /> Descargar original ({data.archivo_original.archivo})
                  </a>
                )}
              </section>

              {data.trips.length > 0 && (
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vueltas</h4>
                  <div className="space-y-2">
                    {data.trips.map((t) => (
                      <div key={t.vuelta} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">
                            Vuelta {t.vuelta} · {t.origen}
                          </span>
                          <span className="text-xs font-semibold tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                            {dur(t.seg_vuelta)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1" style={{ fontFamily: "var(--font-mono)" }}>
                          {hms(t.inicio)} → {t.cierre_hora ? hms(t.cierre_hora) : "—"} · {t.cierre}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.n_tiendas} tienda(s)
                          {t.seg_a_primera_tienda != null && ` · a 1.ª tienda ${dur(t.seg_a_primera_tienda)}`}
                          {t.seg_retorno != null && ` · retorno ${dur(t.seg_retorno)}`}
                          {t.seg_en_bsf != null && ` · carga BSF ${dur(t.seg_en_bsf)}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Secuencia del día</h4>
                {data.visits.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin eventos de zona.</p>
                ) : (
                  <ol className="relative border-l border-border ml-1.5 space-y-3">
                    {data.visits.map((v) => {
                      const color = v.paso ? ZONE_COLORS.PASO : ZONE_COLORS[v.zona_tipo];
                      return (
                        <li key={v.orden} className="ml-4">
                          <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: color }} />
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("text-xs font-medium", v.paso && "text-muted-foreground italic")}>
                              {v.zona_tipo === "TIENDA" ? v.nombre : ZONE_LABELS[v.zona_tipo]}
                              {v.vuelta ? <span className="text-muted-foreground font-normal"> · V{v.vuelta}</span> : null}
                            </span>
                            <span className="text-xs tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                              {dur(v.seg_permanencia)}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                            {v.llegada ? hms(v.llegada) : "— (faltante)"} → {v.salida ? hms(v.salida) : "— (faltante)"}
                            {v.seg_traslado != null && ` · traslado ${dur(v.seg_traslado)}`}
                            {v.seg_acumulado != null && ` · acumulado ${dur(v.seg_acumulado)}`}
                          </p>
                          {v.marcas?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {v.marcas.map((m) => (
                                <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
