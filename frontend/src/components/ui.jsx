import { AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { cn } from "../lib/api.js";

export function estadoMeta(estado) {
  if (estado === "OK" || estado === "ok")
    return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Completado", dot: "bg-emerald-500" };
  if (String(estado).toLowerCase().includes("error"))
    return { cls: "bg-red-50 text-red-700 border-red-200", label: "Fallido", dot: "bg-red-500" };
  if (estado === "parcial" || estado === "Pendiente")
    return { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Parcial", dot: "bg-amber-500" };
  if (estado === "sin_archivos")
    return { cls: "bg-slate-50 text-slate-600 border-slate-200", label: "Sin archivos", dot: "bg-slate-400" };
  return { cls: "bg-slate-50 text-slate-600 border-slate-200", label: estado || "Sin proceso", dot: "bg-slate-400" };
}

export function StatusBadge({ estado, size = "md" }) {
  const meta = estadoMeta(estado);
  const Icon = estado === "OK" || estado === "ok" ? CheckCircle : estado === "error" ? XCircle : AlertCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        meta.cls,
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
      )}
    >
      <Icon size={size === "sm" ? 8 : 9} />
      {meta.label}
    </span>
  );
}

export function KpiCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl border p-5 flex flex-col gap-3",
        accent ? "border-amber-200 bg-amber-50/60 ring-1 ring-amber-200/60" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">{label}</span>
        {Icon && (
          <span
            className={cn(
              "p-1.5 rounded-lg",
              accent ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon size={13} />
          </span>
        )}
      </div>
      <div>
        <span
          className={cn("text-2xl font-semibold tabular-nums", accent ? "text-amber-700" : "text-foreground")}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {value}
        </span>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function SectionCard({ title, sub, children, action, className, bodyClassName }) {
  return (
    <div className={cn("bg-card rounded-xl border border-border", className)}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
        {action}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

export function AlertTypeBars({ data, accentIdx = -1 }) {
  if (!data || !data.length) return <p className="text-xs text-muted-foreground">Sin datos.</p>;
  const max = data[0]?.cantidad || data[0]?.count || 1;
  return (
    <div className="space-y-3">
      {data.map((item, idx) => {
        const label = item.tipo;
        const count = item.cantidad ?? item.count ?? 0;
        return (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-44 truncate shrink-0" title={label}>
              {label}
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  idx === accentIdx ? "bg-amber-500" : "bg-primary",
                )}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span
              className="text-xs font-medium text-foreground tabular-nums w-10 text-right shrink-0"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

/** Selector de fecha con accesos rápidos (Ayer / Hoy) y lista de días disponibles. */
export function DateSelector({ value, onChange, fechas = [], hoy, ayer }) {
  return (
    <div className="flex items-center gap-1.5">
      {ayer && (
        <button
          onClick={() => onChange(ayer)}
          className={cn(
            "text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
            value === ayer ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border hover:bg-slate-200",
          )}
        >
          Ayer
        </button>
      )}
      {hoy && (
        <button
          onClick={() => onChange(hoy)}
          className={cn(
            "text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
            value === hoy ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border hover:bg-slate-200",
          )}
        >
          Hoy
        </button>
      )}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Fecha"
        className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
      />
      {fechas.length > 0 && (
        <select
          value={fechas.includes(value) ? value : ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Días disponibles"
          className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
        >
          <option value="">Días…</option>
          {fechas.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
