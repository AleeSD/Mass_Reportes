import { useMemo, useState } from "react";
import { cn } from "../../lib/api.js";
import { average, dur, secsToHm } from "../../lib/fleetFormat.js";

const GROUPS = [
  { id: "tienda", label: "Tienda" },
  { id: "distrito", label: "Distrito" },
  { id: "cd", label: "CD" },
];

/** Ranking de tiendas: visitas, hora media de llegada y permanencia; agrupable por distrito o CD. */
export default function StoreRanking({ tiendas }) {
  const [group, setGroup] = useState("tienda");

  const rows = useMemo(() => {
    if (group === "tienda") {
      return tiendas.map((t) => ({
        key: t.codigo,
        nombre: t.nombre,
        detalle: `${t.distrito || "—"} · ${t.cd || "—"}`,
        visitas: t.visitas,
        tiendas: 1,
        placas: t.placas,
        hora: t.seg_hora_media_llegada,
        perm: t.seg_permanencia_media,
      }));
    }
    const map = new Map();
    for (const t of tiendas) {
      const key = (group === "distrito" ? t.distrito : t.cd) || "—";
      if (!map.has(key)) map.set(key, { key, nombre: key, visitas: 0, codigos: new Set(), placas: new Set(), horas: [], perms: [] });
      const g = map.get(key);
      g.visitas += t.visitas;
      g.codigos.add(t.codigo);
      t.placas.forEach((p) => g.placas.add(p));
      if (t.seg_hora_media_llegada != null) g.horas.push(t.seg_hora_media_llegada);
      if (t.seg_permanencia_media != null) g.perms.push(t.seg_permanencia_media);
    }
    return [...map.values()]
      .map((g) => ({
        key: g.key,
        nombre: g.nombre,
        detalle: `${g.codigos.size} tienda(s)`,
        visitas: g.visitas,
        tiendas: g.codigos.size,
        placas: [...g.placas].sort(),
        hora: average(g.horas),
        perm: average(g.perms),
      }))
      .sort((a, b) => b.visitas - a.visitas);
  }, [tiendas, group]);

  const max = Math.max(1, ...rows.map((r) => r.visitas));

  return (
    <div>
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Agrupar por</span>
        {GROUPS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGroup(g.id)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-md border transition-colors",
              group === g.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border hover:bg-slate-200",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="p-5 text-xs text-muted-foreground">No hay visitas a tiendas para este día o filtro.</p>
      ) : (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left py-2.5 px-4 font-semibold">{GROUPS.find((g) => g.id === group).label}</th>
                <th className="text-left py-2.5 px-3 font-semibold w-1/4">Visitas</th>
                <th className="text-right py-2.5 px-3 font-semibold">Hora media llegada</th>
                <th className="text-right py-2.5 px-3 font-semibold">Permanencia media</th>
                <th className="text-left py-2.5 px-4 font-semibold">Placas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-muted/40">
                  <td className="py-2 px-4">
                    <p className="font-medium text-foreground">{r.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{r.detalle}</p>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.visitas / max) * 100}%`, background: "#15803D" }} />
                      </div>
                      <span className="tabular-nums w-6 text-right" style={{ fontFamily: "var(--font-mono)" }}>
                        {r.visitas}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                    {secsToHm(r.hora)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                    {dur(r.perm)}
                  </td>
                  <td className="py-2 px-4 text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                    {r.placas.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
