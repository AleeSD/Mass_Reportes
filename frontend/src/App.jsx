import { useEffect, useMemo, useState, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  LayoutDashboard,
  AlertTriangle,
  History,
  FileText,
  Search,
  CheckCircle,
  RefreshCw,
  Calendar,
  TrendingUp,
  Truck,
  Activity,
  Clock,
  Download,
  XCircle,
  AlertCircle,
  Eye,
} from "lucide-react";
import "./App.css";

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Error de API");
  }
  return res.json();
}

function cn(...args) {
  return args.filter(Boolean).join(" ");
}

function estadoMeta(estado) {
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

function StatusBadge({ estado, size = "md" }) {
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

function KpiCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl border p-5 flex flex-col gap-3",
        accent ? "border-amber-200 bg-amber-50/60 ring-1 ring-amber-200/60" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
          {label}
        </span>
        <span
          className={cn(
            "p-1.5 rounded-lg",
            accent ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon size={13} />
        </span>
      </div>
      <div>
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            accent ? "text-amber-700" : "text-foreground",
          )}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {value}
        </span>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({ title, sub, children, action }) {
  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function AlertTypeBars({ data, accentIdx = -1 }) {
  if (!data || !data.length)
    return <p className="text-xs text-muted-foreground">Sin datos.</p>;
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

// ─── Dashboard Overview View ───────────────────────────────────────────────

function DashboardOverview({ tipo, summary, scheduler }) {
  const run = summary?.run;
  const resumen = run?.resumen || {};
  const placas = resumen.placas || [];
  const porTipo = resumen.por_tipo || [];
  const porSeveridad = resumen.por_severidad || [];
  const archivosEntrada = summary?.archivos_entrada?.length || 0;
  const isAlertas = tipo === "alertas";
  const totalCount = isAlertas ? resumen.total_alertas ?? 0 : resumen.total_registros ?? 0;
  const totalLabel = isAlertas ? "Alertas totales" : "Registros totales";

  const sortedPlates = useMemo(
    () => [...placas].sort((a, b) => (b.alertas ?? b.registros ?? 0) - (a.alertas ?? a.registros ?? 0)),
    [placas],
  );
  const topPlate = sortedPlates[0];
  const avg = placas.length
    ? (sortedPlates.reduce((s, p) => s + (p.alertas ?? p.registros ?? 0), 0) / placas.length).toFixed(1)
    : "0";

  const top10Bar = useMemo(
    () =>
      sortedPlates
        .slice(0, 10)
        .reverse()
        .map((p) => ({ placa: p.placa, alertas: p.alertas ?? p.registros ?? 0 })),
    [sortedPlates],
  );

  // Build hourly data from ultima_alerta timestamps (approx distribution)
  const hourlyData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hora: `${String(h).padStart(2, "0")}h`,
      alertas: 0,
    }));
    for (const p of placas) {
      const stamp = p.ultima_alerta || p.ultimo_registro;
      if (!stamp) continue;
      const m = String(stamp).match(/(\d{1,2}):/);
      if (m) {
        const h = parseInt(m[1], 10);
        if (h >= 0 && h < 24) buckets[h].alertas += 1;
      }
    }
    // Scale to show something meaningful
    const scale = totalCount ? Math.max(1, Math.round(totalCount / Math.max(1, placas.length))) : 1;
    return buckets.filter((b) => b.alertas > 0 || (parseInt(b.hora) >= 6 && parseInt(b.hora) <= 19)).map((b) => ({
      ...b,
      alertas: b.alertas * scale,
    }));
  }, [placas, totalCount]);

  const PIE_COLORS = ["#1D4ED8", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE", "#CBD5E1"];
  const pieData = useMemo(() => {
    if (!porTipo.length) return [];
    const top = porTipo.slice(0, 5);
    const others = porTipo.slice(5).reduce((s, i) => s + (i.cantidad ?? 0), 0);
    const result = top.map((t) => ({ tipo: t.tipo, count: t.cantidad ?? 0 }));
    if (others > 0) result.push({ tipo: "Otros", count: others });
    return result;
  }, [porTipo]);

  const ultimoSchedBase = scheduler?.ultimas_ejecuciones?.find(
    (u) => u.tipo === tipo || u.key_publico === tipo,
  );

  const fechaFormatted = summary?.fecha
    ? new Date(summary.fecha + "T00:00:00").toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div className="p-6 space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Placas procesadas"
          value={`${run?.placas_ok ?? 0}${run?.placas_error ? ` / ${run?.placas_error}` : ""}`}
          sub={fechaFormatted}
          icon={Truck}
        />
        <KpiCard
          label={totalLabel}
          value={totalCount.toLocaleString("es-PE")}
          sub={`${archivosEntrada} archivo(s) del día`}
          icon={Activity}
        />
        <KpiCard
          label={topPlate ? "Placa más activa" : "Sin datos"}
          value={topPlate?.placa || "—"}
          sub={
            topPlate
              ? `${topPlate.alertas ?? topPlate.registros ?? 0} registros · ${topPlate.ultima_alerta || topPlate.ultimo_registro || ""}`
              : "No hay registros procesados"
          }
          icon={TrendingUp}
          accent={!!topPlate}
        />
        <KpiCard
          label={run?.placas_error ? "Con errores" : "Estado general"}
          value={
            run?.placas_error
              ? `${run.placas_error} error(es)`
              : archivosEntrada
                ? "Todo OK"
                : "—"
          }
          sub={
            ultimoSchedBase?.finished_at
              ? `Última corrida: ${new Date(ultimoSchedBase.finished_at).toLocaleString("es-PE")}`
              : "Aún no se procesa"
          }
          icon={run?.placas_error ? XCircle : CheckCircle}
        />
      </div>

      {/* Row 1: Plates bar chart + Pie distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              {isAlertas ? "Alertas por placa" : "Registros por placa"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Top 10 vehículos — placa destacada en ámbar
            </p>
          </div>
          <div className="p-5">
            {top10Bar.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
                Sin datos para mostrar. Procesa una fecha primero.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={top10Bar}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#EEF2F7"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="placa"
                    tick={{
                      fontSize: 11,
                      fill: "#374151",
                      fontFamily: "var(--font-mono)",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #E5E7EB",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                    cursor={{ fill: "#F4F6FA" }}
                    formatter={(val) => [`${val}`, isAlertas ? "Alertas" : "Registros"]}
                  />
                  <Bar dataKey="alertas" radius={[0, 4, 4, 0]}>
                    {top10Bar.map((entry) => (
                      <Cell
                        key={entry.placa}
                        fill={entry.placa === topPlate?.placa ? "#F59E0B" : "#1D4ED8"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Distribución por tipo</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Top 5 categorías + otros</p>
          </div>
          <div className="p-5">
            {pieData.length === 0 ? (
              <div className="space-y-2 pt-4">
                <p className="text-xs text-muted-foreground text-center">Sin distribución.</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={2}
                      dataKey="count"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {pieData.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          strokeWidth={0}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #E5E7EB",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(val) => [`${val}`, "Cantidad"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {pieData.slice(0, 5).map((item, idx) => (
                    <div key={item.tipo} className="flex items-center gap-2.5">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[idx] }}
                      />
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {item.tipo}
                      </span>
                      <span
                        className="text-xs font-medium tabular-nums text-foreground"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Activity by hour + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Actividad por hora</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Distribución aproximada a lo largo del día
            </p>
          </div>
          <div className="p-5">
            {hourlyData.every((h) => h.alertas === 0) ? (
              <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                Sin datos de horas.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={hourlyData}
                  margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                  <XAxis
                    dataKey="hora"
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #E5E7EB",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                    formatter={(val) => [`${val}`, "Estimado"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="alertas"
                    stroke="#1D4ED8"
                    strokeWidth={2}
                    fill="url(#alertGrad)"
                    dot={{ fill: "#1D4ED8", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#1D4ED8" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Ranking de placas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Top 5 por registros</p>
          </div>
          <div className="p-5 space-y-4">
            {sortedPlates.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin ranking aún.</p>
            ) : (
              sortedPlates.slice(0, 5).map((plate, idx) => {
                const count = plate.alertas ?? plate.registros ?? 0;
                const maxCount = sortedPlates[0]?.alertas ?? sortedPlates[0]?.registros ?? 1;
                return (
                  <div key={plate.placa} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-xs font-bold w-4 text-center shrink-0",
                        idx === 0 ? "text-amber-500" : "text-muted-foreground",
                      )}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-xs font-medium text-foreground"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {plate.placa}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            idx === 0 ? "text-amber-600" : "text-foreground",
                          )}
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {count}
                        </span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${(count / maxCount) * 100}%`,
                            background: idx === 0 ? "#F59E0B" : "#1D4ED8",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div className="pt-3 mt-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Promedio por placa</span>
              <span
                className="text-sm font-semibold text-foreground"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {avg}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Severity + types breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title={isAlertas ? "Alertas por tipo" : "Registros por tipo"}
          sub="Desglose completo de categorías del día"
          className="lg:col-span-2"
        >
          <AlertTypeBars data={porTipo} />
        </SectionCard>
        <SectionCard title="Por severidad" sub="Si Onway reportó severidad">
          {porSeveridad.length === 0 ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Onway no envió severidad en estos archivos, o la columna no existe para este tipo de reporte.
            </p>
          ) : (
            <AlertTypeBars
              data={porSeveridad.map((s) => ({
                tipo: s.severidad,
                cantidad: s.cantidad,
              }))}
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Report Detail View ────────────────────────────────────────────────────

function ReportView({ tipo, summary, onProcess, processing, searchPlaca, setSearchPlaca, showCols, setShowCols }) {
  const run = summary?.run;
  const resumen = run?.resumen || {};
  const placas = resumen.placas || [];
  const columnasConservadas = resumen.columnas?.length || 0;
  const columnasEliminadas = resumen.columnas_eliminadas?.length || 0;
  const porTipo = resumen.por_tipo || [];
  const porSeveridad = resumen.por_severidad || [];
  const archivosEntrada = summary?.archivos_entrada?.length || 0;
  const isAlertas = tipo === "alertas";
  const isHistorial = tipo === "historial";
  const isConsolidado = tipo === "consolidado";
  const totalCount = isAlertas ? resumen.total_alertas ?? 0 : resumen.total_registros ?? 0;
  const totalLabel = isAlertas ? "Alertas totales" : "Registros totales";
  const columnLabel = isAlertas ? "Alertas" : "Registros";
  const ultimaCol = isAlertas ? "Última alerta" : "Último registro";

  const q = searchPlaca.trim().toUpperCase();
  const placasFiltradas = q
    ? placas.filter(
        (p) =>
          String(p.placa || "").toUpperCase().includes(q) ||
          String(p.alias || "").toUpperCase().includes(q),
      )
    : placas;

  const stats = [
    { label: "Archivos del día", value: archivosEntrada },
    { label: "Placas procesadas", value: run?.placas_ok ?? 0, badge: run?.placas_error ? `-${run.placas_error}` : null },
    { label: totalLabel, value: totalCount.toLocaleString("es-PE") },
    { label: "Errores", value: run?.placas_error ?? 0 },
    {
      label: "Columnas del reporte",
      value: columnasConservadas,
      badge: columnasEliminadas > 0 ? `-${columnasEliminadas}` : null,
    },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground mb-2">{s.label}</p>
            <div className="flex items-end gap-2">
              <span
                className="text-2xl font-semibold text-foreground tabular-nums"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {s.value}
              </span>
              {s.badge && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 mb-0.5">
                  {s.badge}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Columns detail (collapsible) */}
      {showCols && run && (columnasConservadas > 0 || columnasEliminadas > 0) && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Columnas del consolidado</h3>
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowCols(false)}
            >
              Ocultar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(resumen.columnas || []).map((c) => (
              <span
                key={c}
                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200"
              >
                {c}
              </span>
            ))}
            {(resumen.columnas_eliminadas || []).map((c) => (
              <span
                key={c}
                title="Columna vacía para todas las placas este día"
                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 line-through decoration-amber-400/60"
              >
                {c} (eliminada)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Plates Table */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground shrink-0">Placas del día</h3>
            <div className="relative ml-auto">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                placeholder="Buscar placa o alias..."
                value={searchPlaca}
                onChange={(e) => setSearchPlaca(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-muted rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary/30 w-44 md:w-56 transition-all"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Placa", "Alias", columnLabel, ultimaCol, "Estado", "Archivo"].map((col) => (
                    <th
                      key={col}
                      className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground tracking-wide uppercase whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {placasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {placas.length === 0
                        ? summary?.pendientes
                          ? "No hay archivos en la carpeta de esta fecha. Presiona “Procesar ahora” para iniciar."
                          : "Aún no hay un proceso guardado."
                        : "Sin coincidencias para la búsqueda."}
                    </td>
                  </tr>
                ) : (
                  placasFiltradas.map((p) => {
                    const meta = estadoMeta(p.estado);
                    return (
                      <tr key={`${p.placa}-${p.archivo}`} className="hover:bg-muted/40 transition-colors group">
                        <td className="py-3 px-4">
                          <span
                            className="text-xs font-medium text-foreground"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {p.placa}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">{p.alias || "—"}</td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={cn(
                              "text-sm font-medium tabular-nums",
                              (p.alertas ?? p.registros ?? 0) > 100
                                ? "text-amber-600"
                                : "text-foreground",
                            )}
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {p.alertas ?? p.registros ?? 0}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="text-xs text-muted-foreground whitespace-nowrap"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {p.ultima_alerta || p.ultimo_registro || "—"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {p.error ? (
                            <span className="relative group/tooltip">
                              <StatusBadge estado={p.estado} size="sm" />
                              <span className="pointer-events-none opacity-0 group-hover/tooltip:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-red-50 border border-red-200 text-[10px] text-red-700 whitespace-nowrap z-20 shadow-sm">
                                {p.error}
                              </span>
                            </span>
                          ) : (
                            <StatusBadge estado={p.estado} size="sm" />
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {p.archivo ? (
                            !isConsolidado ? (
                              <a
                                href={`/api/download/original/${tipo}/${summary.fecha}/${encodeURIComponent(p.archivo)}`}
                                className="text-xs text-primary hover:underline truncate max-w-[160px] block opacity-70 group-hover:opacity-100 transition-opacity"
                                style={{ fontFamily: "var(--font-mono)" }}
                                title="Descargar original"
                              >
                                {p.archivo}
                              </a>
                            ) : (
                              <span
                                className="text-xs text-muted-foreground truncate max-w-[160px] block opacity-70"
                                style={{ fontFamily: "var(--font-mono)" }}
                                title="Consolidado no tiene originales directos"
                              >
                                (combinado)
                              </span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <SectionCard title={isAlertas ? "Alertas por tipo" : "Registros por tipo"}>
            <AlertTypeBars data={porTipo} />
          </SectionCard>

          <SectionCard title="Por severidad">
            {porSeveridad.length === 0 ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Onway no envió severidad en estos archivos, o la columna no existe.
              </p>
            ) : (
              <AlertTypeBars
                data={porSeveridad.map((s) => ({
                  tipo: s.severidad,
                  cantidad: s.cantidad,
                }))}
              />
            )}
          </SectionCard>

          {/* Log panel */}
          <div className="bg-card rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Log última ejecución</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Estado: <StatusBadge estado={run?.estado} size="sm" />
                  {run?.finished_at
                    ? ` · ${new Date(run.finished_at).toLocaleString("es-PE")}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="p-5">
              {run?.logs?.length ? (
                <div
                  className="max-h-52 overflow-y-auto space-y-1 text-[11px] leading-relaxed"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {run.logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "px-2 py-1 rounded",
                        log.nivel === "error"
                          ? "bg-red-50 text-red-700 border border-red-100"
                          : log.nivel === "warn"
                            ? "bg-amber-50 text-amber-700 border border-amber-100"
                            : "text-slate-700",
                      )}
                    >
                      <span className="opacity-60">[{log.nivel}]</span>{" "}
                      {log.archivo ? (
                        <span className="font-medium">{log.archivo} · </span>
                      ) : null}
                      {log.mensaje}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No hay ejecuciones registradas para esta fecha.
                </p>
              )}
              {run && (
                <div className="pt-3 mt-3 border-t border-border flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{run.placas_ok}</span> ok
                  </span>
                  <span>
                    <span className="font-medium text-foreground">{run.placas_error}</span> error
                  </span>
                  {columnasEliminadas > 0 && (
                    <button
                      onClick={() => setShowCols((v) => !v)}
                      className="text-primary hover:underline"
                    >
                      {columnasEliminadas} cols podadas
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App Shell ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "alertas", label: "Alertas", Icon: AlertTriangle },
  { id: "historial", label: "Historial", Icon: History },
  { id: "consolidado", label: "Consolidado", Icon: FileText },
];

export default function App() {
  const [view, setView] = useState("dashboard");
  const [types, setTypes] = useState([]);
  const [tipo, setTipo] = useState("alertas");
  const [fecha, setFecha] = useState("");
  const [fechas, setFechas] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [scheduler, setScheduler] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchPlaca, setSearchPlaca] = useState("");
  const [showCols, setShowCols] = useState(false);
  const refreshTimer = useRef(null);

  // Load initial metadata (types + scheduler status)
  useEffect(() => {
    let cancelled = false;
    Promise.all([api("/api/report-types"), api("/api/scheduler/status")])
      .then(([typeData, schedData]) => {
        if (cancelled) return;
        setTypes(typeData);
        setScheduler(schedData);
        const firstEnabled = (typeData || []).find((t) => t.habilitado && !t.es_compuesto);
        if (firstEnabled) setTipo(firstEnabled.key);
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // Load available dates when tipo changes
  useEffect(() => {
    if (!tipo) return;
    api(`/api/days?tipo=${tipo}`)
      .then((data) => {
        setFechas(data.fechas || []);
        setFecha((current) => current || data.fechas?.[0] || data.hoy || "");
      })
      .catch((err) => setError(err.message));
  }, [tipo]);

  // Load summary
  async function loadSummary(nextFecha = fecha, nextTipo = tipo) {
    if (!nextFecha || !nextTipo) return;
    setLoading(true);
    setError("");
    try {
      const data = await api(`/api/summary/${nextTipo}/${nextFecha}`);
      setSummary(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, [fecha, tipo]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      refreshTimer.current = null;
      return;
    }
    refreshTimer.current = setInterval(() => {
      loadSummary();
    }, 30000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [autoRefresh, fecha, tipo]);

  async function processNow() {
    setProcessing(true);
    setError("");
    try {
      await api(`/api/process/${tipo}/${fecha}`, { method: "POST" });
      await loadSummary();
      const sched = await api("/api/scheduler/status").catch(() => null);
      if (sched) setScheduler(sched);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  // When switching views (from sidebar), if switched to a specific tipo view (not dashboard),
  // sync the tipo selector too.
  useEffect(() => {
    if (view !== "dashboard" && view !== tipo) {
      const exists = types.find((t) => t.key === view || t.key_publico === view);
      if (exists) setTipo(exists.key_publico || exists.key);
    }
  }, [view, types, tipo]);

  const currentTypeInfo =
    view === "dashboard"
      ? types.find((t) => (t.key_publico || t.key) === tipo) || types[0]
      : types.find((t) => (t.key_publico || t.key) === (view === "dashboard" ? tipo : view)) ||
        types[0];

  const viewTitle =
    view === "dashboard"
      ? {
          title: "Dashboard",
          sub: "Resumen general de reportes del día",
        }
      : {
          title: currentTypeInfo?.etiqueta || view,
          sub: loading
            ? "Cargando…"
            : "Consolida los exports de Onway y descarga el reporte del día.",
        };

  const ultimoSched = scheduler?.ultimas_ejecuciones?.find(
    (u) => u.tipo === tipo || u.key_publico === tipo,
  );

  const fechaDisplay = fecha
    ? new Date(fecha + "T00:00:00").toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

  return (
    <div
      className="flex h-screen bg-background overflow-hidden"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 bg-card border-r border-border flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground tracking-[0.12em] uppercase">
            Onway · Flota
          </p>
          <h1 className="text-[15px] font-semibold text-foreground mt-0.5 leading-tight">
            Reportes del día
          </h1>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="text-[10px] font-bold text-muted-foreground tracking-[0.12em] uppercase px-2 mb-2">
            Navegación
          </p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left",
                  view === id
                    ? "bg-primary text-primary-foreground font-medium shadow-sm"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          <p className="text-[10px] font-bold text-muted-foreground tracking-[0.12em] uppercase px-2 mt-5 mb-2">
            Tipos activos
          </p>
          <div className="space-y-0.5">
            {types.map((t) => {
              const active = (t.key_publico || t.key) === tipo;
              return (
                <button
                  key={t.key}
                  disabled={!t.habilitado}
                  onClick={() => {
                    if (!t.habilitado) return;
                    setTipo(t.key_publico || t.key);
                    if (view !== "dashboard") setView(t.key_publico || t.key);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left",
                    active ? "bg-slate-100 text-slate-900 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    !t.habilitado ? "opacity-50 cursor-not-allowed" : "",
                  )}
                >
                  <span className="truncate">{t.etiqueta}</span>
                  {t.es_compuesto && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 font-medium">
                      mix
                    </span>
                  )}
                  {!t.habilitado && (
                    <span className="text-[9px] text-slate-400">próx.</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="px-4 pb-4 pt-3 border-t border-border space-y-3">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-[0.12em] uppercase mb-1.5">
              Scheduler automático
            </p>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  scheduler?.habilitado
                    ? "bg-emerald-500 shadow-sm shadow-emerald-300"
                    : "bg-slate-400",
                )}
              />
              <span className="text-xs font-semibold text-foreground">
                {scheduler?.habilitado ? "Activo" : "Detenido"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cada {scheduler?.cron === "*/10 * * * *" ? "10 min" : scheduler?.cron || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              TZ: {scheduler?.timezone || "—"}
            </p>
          </div>
          {ultimoSched && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground tracking-[0.12em] uppercase">
                Última corrida ({ultimoSched.etiqueta})
              </p>
              <StatusBadge estado={ultimoSched.estado} size="sm" />
              {ultimoSched.finished_at && (
                <p className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                  {new Date(ultimoSched.finished_at).toLocaleString("es-PE", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            El detalle de cada alerta vive en el Excel consolidado. Aquí solo metadatos.
          </p>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-card border-b border-border px-6 py-3 flex items-center justify-between shrink-0 gap-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground truncate">
              {viewTitle.title}
            </h2>
            <p className="text-xs text-muted-foreground truncate">{viewTitle.sub}</p>
            {ultimoSched?.finished_at && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Última actualización: {new Date(ultimoSched.finished_at).toLocaleString("es-PE")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {error && (
              <div className="px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 max-w-xs truncate">
                {error}
              </div>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              Auto-refresh (30s)
            </label>

            <div className="flex items-center gap-1.5 bg-muted border border-border rounded-lg px-3 py-1.5">
              <Calendar size={12} className="text-muted-foreground" />
              <span
                className="text-xs font-medium text-foreground"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {fechaDisplay}
              </span>
            </div>

            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
            />

            {fechas.length > 0 && (
              <select
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
              >
                {fechas.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={processNow}
              disabled={processing}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all",
                processing
                  ? "bg-slate-300 text-slate-500 cursor-wait"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
              )}
            >
              <RefreshCw size={12} className={processing ? "animate-spin" : ""} />
              {processing ? "Procesando…" : "Procesar ahora"}
            </button>

            {summary?.consolidado_existe && (
              <a
                href={`/api/download/consolidated/${tipo}/${fecha}`}
                className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm"
                title={`Descargar ${summary.consolidado}`}
              >
                <Download size={12} />
                Descargar
              </a>
            )}
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto">
          {view === "dashboard" ? (
            <DashboardOverview tipo={tipo} summary={summary} scheduler={scheduler} />
          ) : (
            <ReportView
              tipo={view}
              summary={summary}
              onProcess={processNow}
              processing={processing}
              searchPlaca={searchPlaca}
              setSearchPlaca={setSearchPlaca}
              showCols={showCols}
              setShowCols={setShowCols}
            />
          )}
        </main>
      </div>
    </div>
  );
}
