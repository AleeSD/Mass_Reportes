import { AlertTriangle, CheckCircle, Info } from "lucide-react";

/** Panel de calidad de datos del día (sobre las placas filtradas). */
export default function QualityPanel({ placas, onSelectPlate }) {
  const sinReporte = placas.filter((p) => p.calidad?.sin_reporte).map((p) => p.placa);
  const sum = (k) => placas.reduce((n, p) => n + (p.calidad?.[k] || 0), 0);
  const withIssue = (k) => placas.filter((p) => (p.calidad?.[k] || 0) > 0).map((p) => p.placa);
  const unknown = [...new Set(placas.flatMap((p) => p.calidad?.zonas_desconocidas || []))];
  const estimados = placas.filter((p) => p.calidad?.inicio_estimado).map((p) => p.placa);

  const items = [
    { label: "Placas sin reporte del día", value: sinReporte.length, placas: sinReporte, level: "warn" },
    { label: "Zonas desconocidas (fuera de catálogo)", value: unknown.length, detail: unknown.join(", "), level: "warn" },
    { label: "Estancias abiertas (salida o llegada faltante)", value: sum("estancias_abiertas") + sum("salidas_sin_llegada"), placas: [...new Set([...withIssue("estancias_abiertas"), ...withIssue("salidas_sin_llegada")])], level: "warn" },
    { label: "Inicios de jornada estimados", value: estimados.length, placas: estimados, level: "warn" },
    { label: "Pasos por zona descartados (< 3 min)", value: sum("pasos"), placas: withIssue("pasos"), level: "info" },
    { label: "Eventos duplicados depurados", value: sum("duplicados"), placas: withIssue("duplicados"), level: "info" },
    { label: "Rebotes de geocerca fusionados", value: sum("rebotes"), placas: withIssue("rebotes"), level: "info" },
    { label: "Llegadas repetidas sin salida", value: sum("llegadas_repetidas"), placas: withIssue("llegadas_repetidas"), level: "info" },
    { label: "Eventos con GPS antiguo", value: sum("gps_antiguo"), placas: withIssue("gps_antiguo"), level: "info" },
  ];

  return (
    <ul className="space-y-2.5">
      {items.map((it) => {
        const ok = it.value === 0;
        const Icon = ok ? CheckCircle : it.level === "warn" ? AlertTriangle : Info;
        return (
          <li key={it.label} className="flex items-start gap-2.5">
            <Icon
              size={14}
              className={ok ? "text-emerald-600 mt-0.5 shrink-0" : it.level === "warn" ? "text-amber-600 mt-0.5 shrink-0" : "text-slate-500 mt-0.5 shrink-0"}
              aria-label={ok ? "Sin incidencias" : it.level === "warn" ? "Atención" : "Informativo"}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground">{it.label}</span>
                <span className="text-xs font-semibold tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                  {it.value}
                </span>
              </div>
              {!ok && (it.placas?.length || it.detail) ? (
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {it.detail ||
                    it.placas.map((p, i) => (
                      <span key={p}>
                        {i > 0 && ", "}
                        <button className="hover:text-primary hover:underline" onClick={() => onSelectPlate(p)} style={{ fontFamily: "var(--font-mono)" }}>
                          {p}
                        </button>
                      </span>
                    ))}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
