import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { cn } from "../../lib/api.js";
import { daySecs, dur, hms } from "../../lib/fleetFormat.js";

const COLUMNS = [
  { key: "placa", label: "Placa", sort: (p) => p.placa, render: (p) => p.placa, mono: true },
  { key: "empresa", label: "Empresa", sort: (p) => p.empresa, render: (p) => p.empresa || "—", wide: true },
  { key: "tipo", label: "Tipo", sort: (p) => p.tipo, render: (p) => p.tipo || "—" },
  { key: "inicio", label: "Inicio jornada", time: true, sort: (p, f) => daySecs(p.inicio_jornada, f), render: (p) => hms(p.inicio_jornada), estimated: (p) => p.inicio_calidad === "estimado" },
  { key: "origen", label: "Origen V1", sort: (p) => p.origen_vuelta1, render: (p) => p.origen_vuelta1 || "—" },
  { key: "llegada_bsf", label: "1.ª llegada BSF", time: true, sort: (p, f) => daySecs(p.primera_llegada_bsf, f), render: (p) => hms(p.primera_llegada_bsf) },
  { key: "salida_bsf", label: "Últ. salida BSF", time: true, sort: (p, f) => daySecs(p.ultima_salida_bsf, f), render: (p) => hms(p.ultima_salida_bsf) },
  { key: "bsf", label: "Tiempo en BSF", time: true, sort: (p) => p.seg_total_bsf, render: (p) => dur(p.seg_total_bsf), warn: (p) => p.bsf_larga },
  { key: "vueltas", label: "Vueltas", num: true, sort: (p) => p.n_vueltas_con_tiendas, render: (p) => (p.n_vueltas ? `${p.n_vueltas_con_tiendas} / ${p.n_vueltas}` : "—"), title: "Con tiendas / total de tramos" },
  { key: "primera", label: "A 1.ª tienda (V1)", time: true, sort: (p) => p.vueltas?.find((v) => v.n_tiendas > 0)?.seg_a_primera_tienda, render: (p) => dur(p.vueltas?.find((v) => v.n_tiendas > 0)?.seg_a_primera_tienda) },
  { key: "tiendas", label: "Tiendas", num: true, sort: (p) => p.tiendas_visitadas, render: (p) => (p.estado_reporte === "Con reporte" ? p.tiendas_visitadas : "—") },
  { key: "perm", label: "Perm. media", time: true, sort: (p) => p.seg_permanencia_media, render: (p) => dur(p.seg_permanencia_media) },
  { key: "base_os", label: "Base OS (sale / regresa)", time: true, sort: (p, f) => daySecs(p.salida_base_os, f), render: (p) => (p.salida_base_os || p.regreso_base_os ? `${hms(p.salida_base_os)} / ${hms(p.regreso_base_os)}` : "—") },
  { key: "ultima_tienda", label: "Salida últ. tienda", time: true, sort: (p, f) => daySecs(p.salida_ultima_tienda, f), render: (p) => hms(p.salida_ultima_tienda) },
  { key: "destino", label: "Destino", sort: (p) => p.destino_tras_ultima_tienda, render: (p) => p.destino_tras_ultima_tienda || "—" },
  { key: "retorno", label: "Retorno", time: true, sort: (p) => p.seg_retorno, render: (p) => dur(p.seg_retorno) },
  { key: "ruta", label: "Total en ruta", time: true, sort: (p) => p.seg_total_ruta, render: (p) => dur(p.seg_total_ruta) },
  { key: "senal", label: "Última señal", time: true, sort: (p, f) => daySecs(p.ultima_senal, f), render: (p) => hms(p.ultima_senal) },
  { key: "obs", label: "Observaciones", sort: (p) => p.observaciones, render: (p) => p.observaciones || "—", wide: true, small: true },
];

export default function FleetMasterTable({ placas, fecha, onSelectPlate }) {
  const [sortKey, setSortKey] = useState("placa");
  const [asc, setAsc] = useState(true);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const text = q.trim().toUpperCase();
    const col = COLUMNS.find((c) => c.key === sortKey) || COLUMNS[0];
    const filtered = text
      ? placas.filter((p) =>
          [p.placa, p.empresa, p.tipo, p.estado_reporte, p.observaciones, p.destino_tras_ultima_tienda]
            .join(" ")
            .toUpperCase()
            .includes(text),
        )
      : placas;
    return [...filtered].sort((a, b) => {
      const va = col.sort(a, fecha);
      const vb = col.sort(b, fecha);
      if (va == null && vb == null) return a.placa.localeCompare(b.placa);
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return asc ? cmp : -cmp;
    });
  }, [placas, sortKey, asc, q, fecha]);

  function toggle(key) {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  return (
    <div>
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Filtrar placa, empresa, observación…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-muted rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary/30 w-64"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} placa(s) · clic en una fila para ver su detalle
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  onClick={() => toggle(c.key)}
                  className={cn(
                    "py-2.5 px-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px] whitespace-nowrap cursor-pointer select-none hover:text-foreground",
                    c.time || c.num ? "text-right" : "text-left",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key && (asc ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => {
              const muted = p.estado_reporte !== "Con reporte";
              return (
                <tr
                  key={p.placa}
                  onClick={() => onSelectPlate(p.placa)}
                  className={cn("cursor-pointer hover:bg-muted/50 transition-colors", muted && "text-muted-foreground")}
                >
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "py-2 px-3 whitespace-nowrap",
                        (c.time || c.num || c.mono) && "tabular-nums",
                        c.time || c.num ? "text-right" : "",
                        c.wide && "max-w-[280px] truncate",
                        c.small && "text-[11px]",
                        c.estimated?.(p) && "italic bg-amber-50",
                        c.warn?.(p) && "bg-red-50 text-red-700",
                        c.key === "placa" && "font-medium text-foreground",
                      )}
                      style={c.time || c.num || c.mono ? { fontFamily: "var(--font-mono)" } : undefined}
                      title={c.wide ? String(c.render(p)) : undefined}
                    >
                      {muted && c.key === "empresa" ? (
                        <span>
                          {p.empresa} · <span className="text-amber-700">Sin reporte del día</span>
                        </span>
                      ) : (
                        c.render(p)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
