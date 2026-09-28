import { useState, useMemo } from "react";
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
} from "lucide-react";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const PLATES = [
  { placa: "AAR-880", alertas: 34, ultima: "24/09/2026 13:45:23", estado: "OK" },
  { placa: "AJQ-739", alertas: 51, ultima: "24/09/2026 13:59:21", estado: "OK" },
  { placa: "AKO-712", alertas: 42, ultima: "24/09/2026 15:48:55", estado: "OK" },
  { placa: "ARY-825", alertas: 41, ultima: "24/09/2026 15:25:31", estado: "OK" },
  { placa: "B1Y-801", alertas: 49, ultima: "24/09/2026 14:17:03", estado: "OK" },
  { placa: "BXQ-847", alertas: 48, ultima: "24/09/2026 12:02:50", estado: "OK" },
  { placa: "BXT-918", alertas: 32, ultima: "24/09/2026 15:42:48", estado: "OK" },
  { placa: "C6E-921", alertas: 157, ultima: "24/09/2026 16:09:12", estado: "OK" },
  { placa: "CJS-721", alertas: 63, ultima: "24/09/2026 16:01:14", estado: "OK" },
  { placa: "CKL-718", alertas: 98, ultima: "24/09/2026 15:17:48", estado: "OK" },
  { placa: "CLW-864", alertas: 31, ultima: "24/09/2026 13:33:37", estado: "OK" },
  { placa: "CMP-924", alertas: 62, ultima: "24/09/2026 13:55:51", estado: "OK" },
  { placa: "CMV-853", alertas: 45, ultima: "24/09/2026 13:46:40", estado: "OK" },
  { placa: "F1W-796", alertas: 56, ultima: "24/09/2026 15:06:02", estado: "OK" },
  { placa: "F2F-768", alertas: 48, ultima: "24/09/2026 15:01:31", estado: "OK" },
  { placa: "GKL-542", alertas: 73, ultima: "24/09/2026 14:22:10", estado: "OK" },
  { placa: "HMN-317", alertas: 88, ultima: "24/09/2026 15:44:55", estado: "OK" },
  { placa: "JCP-621", alertas: 39, ultima: "24/09/2026 13:12:08", estado: "OK" },
  { placa: "KVT-904", alertas: 44, ultima: "24/09/2026 14:50:33", estado: "OK" },
  { placa: "LPQ-118", alertas: 57, ultima: "24/09/2026 16:15:44", estado: "OK" },
];

const ALERT_TYPES = [
  { tipo: "Acelerado y giro brusco", count: 374 },
  { tipo: "Vehículo encendido", count: 293 },
  { tipo: "Vehículo apagado", count: 290 },
  { tipo: "Aceleración brusca", count: 195 },
  { tipo: "Bache", count: 120 },
  { tipo: "Excedió límite de velocidad", count: 110 },
  { tipo: "Se movió", count: 63 },
  { tipo: "Exceso vel. en segmento", count: 63 },
  { tipo: "Inicio de ralentí", count: 62 },
  { tipo: "Fin de ralentí", count: 62 },
  { tipo: "Se detuvo", count: 18 },
  { tipo: "Ingreso a camino vecinal", count: 18 },
];

const HOURLY_DATA = [
  { hora: "06h", alertas: 45 },
  { hora: "07h", alertas: 78 },
  { hora: "08h", alertas: 124 },
  { hora: "09h", alertas: 156 },
  { hora: "10h", alertas: 132 },
  { hora: "11h", alertas: 98 },
  { hora: "12h", alertas: 87 },
  { hora: "13h", alertas: 145 },
  { hora: "14h", alertas: 167 },
  { hora: "15h", alertas: 189 },
  { hora: "16h", alertas: 143 },
  { hora: "17h", alertas: 57 },
];

const TOP_PLATES_BAR = [...PLATES]
  .sort((a, b) => b.alertas - a.alertas)
  .slice(0, 10)
  .reverse();

const PIE_DATA = [
  ...ALERT_TYPES.slice(0, 5),
  { tipo: "Otros", count: ALERT_TYPES.slice(5).reduce((s, i) => s + i.count, 0) },
];

const PIE_COLORS = ["#1D4ED8", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE", "#CBD5E1"];

type View = "dashboard" | "alertas" | "historial" | "consolidado";

// ─── Shared Components ─────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent?: boolean;
}) {
  return (
    <div
      className={`bg-card rounded-xl border p-5 flex flex-col gap-3 ${
        accent
          ? "border-amber-200 bg-amber-50/60 ring-1 ring-amber-200/60"
          : "border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
          {label}
        </span>
        <span
          className={`p-1.5 rounded-lg ${
            accent ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon size={13} />
        </span>
      </div>
      <div>
        <span
          className={`text-2xl font-semibold tabular-nums ${
            accent ? "text-amber-700" : "text-foreground"
          }`}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {value}
        </span>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  sub,
  children,
  action,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function AlertTypeBars({ data }: { data: typeof ALERT_TYPES }) {
  const max = data[0].count;
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.tipo} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-44 truncate shrink-0">{item.tipo}</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span
            className="text-xs font-medium text-foreground tabular-nums w-8 text-right shrink-0"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ estado }: { estado: string }) {
  const ok = estado === "OK";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
        ok
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      <CheckCircle size={9} />
      {estado}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  );
}

// ─── Dashboard View ────────────────────────────────────────────────────────────

function DashboardView() {
  const sorted = useMemo(() => [...PLATES].sort((a, b) => b.alertas - a.alertas), []);
  const topPlate = sorted[0];
  const avg = (PLATES.reduce((s, p) => s + p.alertas, 0) / PLATES.length).toFixed(1);

  return (
    <div className="p-6 space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Placas procesadas" value="20" sub="24 de setiembre, 2026" icon={Truck} />
        <KpiCard label="Alertas totales" value="1,744" sub="Emitidas en el día" icon={Activity} />
        <KpiCard
          label="Placa más activa"
          value={topPlate.placa}
          sub={`${topPlate.alertas} alertas — ${topPlate.ultima}`}
          icon={TrendingUp}
          accent
        />
        <KpiCard label="Sin errores" value="20 / 20" sub="Todos los archivos OK" icon={CheckCircle} />
      </div>

      {/* Row 1: Bar chart + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Alertas por placa</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Top 10 vehículos — placa destacada en ámbar
            </p>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={TOP_PLATES_BAR}
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
                  formatter={(val: number) => [`${val} alertas`, "Total"]}
                />
                <Bar dataKey="alertas" radius={[0, 4, 4, 0]}>
                  {TOP_PLATES_BAR.map((entry) => (
                    <Cell
                      key={entry.placa}
                      fill={entry.placa === topPlate.placa ? "#F59E0B" : "#1D4ED8"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Distribución por tipo</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Top 5 categorías + otros</p>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={PIE_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={68}
                  paddingAngle={2}
                  dataKey="count"
                  startAngle={90}
                  endAngle={-270}
                >
                  {PIE_DATA.map((_, idx) => (
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
                  formatter={(val: number) => [`${val}`, "Alertas"]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {PIE_DATA.slice(0, 5).map((item, idx) => (
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
          </div>
        </div>
      </div>

      {/* Row 2: Area chart + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Actividad por hora</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Alertas emitidas a lo largo del día — pico a las 15h
            </p>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={HOURLY_DATA}
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
                  formatter={(val: number) => [`${val} alertas`, "Total"]}
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
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Ranking de placas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Top 5 por alertas</p>
          </div>
          <div className="p-5 space-y-4">
            {sorted.slice(0, 5).map((plate, idx) => (
              <div key={plate.placa} className="flex items-center gap-3">
                <span
                  className={`text-xs font-bold w-4 text-center shrink-0 ${
                    idx === 0 ? "text-amber-500" : "text-muted-foreground"
                  }`}
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
                      className={`text-xs font-semibold tabular-nums ${
                        idx === 0 ? "text-amber-600" : "text-foreground"
                      }`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {plate.alertas}
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(plate.alertas / sorted[0].alertas) * 100}%`,
                        background: idx === 0 ? "#F59E0B" : "#1D4ED8",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
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

      {/* Alert types breakdown */}
      <SectionCard
        title="Alertas por tipo"
        sub="Desglose completo de categorías del día"
      >
        <AlertTypeBars data={ALERT_TYPES} />
      </SectionCard>
    </div>
  );
}

// ─── Report Views (Alertas / Historial / Consolidado) ─────────────────────────

type ReportType = "alertas" | "historial" | "consolidado";

const REPORT_META: Record<
  ReportType,
  { title: string; sub: string; stats: { label: string; value: string; badge?: string }[] }
> = {
  alertas: {
    title: "Alertas",
    sub: "Consolida los exports de Onway y descarga el reporte del día.",
    stats: [
      { label: "Archivos del día", value: "20" },
      { label: "Placas procesadas", value: "20" },
      { label: "Alertas totales", value: "1,744" },
      { label: "Errores", value: "0" },
      { label: "Columnas del reporte", value: "23", badge: "-2" },
    ],
  },
  historial: {
    title: "Historial",
    sub: "Consolida los exports de Onway y descarga el reporte del día.",
    stats: [
      { label: "Archivos del día", value: "0" },
      { label: "Placas procesadas", value: "0" },
      { label: "Registros totales", value: "0" },
      { label: "Errores", value: "0" },
      { label: "Columnas del reporte", value: "0" },
    ],
  },
  consolidado: {
    title: "Consolidado",
    sub: "Consolida los exports de Onway y descarga el reporte del día.",
    stats: [
      { label: "Archivos del día", value: "0" },
      { label: "Placas procesadas", value: "20" },
      { label: "Registros totales", value: "1,744" },
      { label: "Errores", value: "0" },
      { label: "Columnas del reporte", value: "24", badge: "-4" },
    ],
  },
};

function PlatesTable({
  plates,
  search,
  columnLabel,
}: {
  plates: typeof PLATES;
  search: string;
  columnLabel: string;
}) {
  const filtered = useMemo(
    () =>
      plates.filter((p) =>
        p.placa.toLowerCase().includes(search.toLowerCase())
      ),
    [plates, search]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {["Placa", "Alias", columnLabel, "Última alerta", "Estado", "Archivo"].map(
              (col) => (
                <th
                  key={col}
                  className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground tracking-wide uppercase whitespace-nowrap first:rounded-none last:rounded-none"
                >
                  {col}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.length === 0 ? (
            <EmptyState message="No hay archivos en la carpeta de esta fecha." />
          ) : (
            filtered.map((plate) => (
              <tr key={plate.placa} className="hover:bg-muted/40 transition-colors group">
                <td className="py-3 px-4">
                  <span
                    className="text-xs font-medium text-foreground"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {plate.placa}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{plate.placa}</td>
                <td className="py-3 px-4 text-right">
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      plate.alertas > 100 ? "text-amber-600" : "text-foreground"
                    }`}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {plate.alertas}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span
                    className="text-xs text-muted-foreground"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {plate.ultima}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <StatusBadge estado={plate.estado} />
                </td>
                <td className="py-3 px-4">
                  <button className="text-xs text-primary hover:underline font-mono truncate max-w-[140px] block opacity-70 group-hover:opacity-100 transition-opacity">
                    alerts_{plate.placa.replace("-", "")}.xlsx
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportView({ type }: { type: ReportType }) {
  const [search, setSearch] = useState("");
  const meta = REPORT_META[type];
  const hasData = type !== "historial";
  const plates = hasData ? PLATES : [];
  const columnLabel = type === "historial" ? "Registros" : "Alertas";

  return (
    <div className="p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {meta.stats.map((s) => (
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

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Table */}
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-muted rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary/30 w-44 transition-all"
              />
            </div>
          </div>
          <PlatesTable plates={plates} search={search} columnLabel={columnLabel} />
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">
                {type === "historial" ? "Registros por tipo" : "Alertas por tipo"}
              </h3>
            </div>
            <div className="p-5">
              {hasData ? (
                <AlertTypeBars data={ALERT_TYPES} />
              ) : (
                <p className="text-xs text-muted-foreground">Sin datos.</p>
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-2">Por severidad</h3>
            <p className="text-xs text-muted-foreground">
              Onway no envió severidad en estos archivos, o la columna no existe.
            </p>
          </div>

          {!hasData && (
            <div className="bg-card rounded-xl border border-border">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Log última ejecución</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium border border-amber-200">
                  Sin archivos
                </span>
              </div>
              <div className="p-5">
                <p
                  className="text-xs text-amber-600"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  [warn] No se encontraron archivos .xlsx para esta fecha
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  25/9/2026, 3:27:29 p.m. · 0 ok / 0 error
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── App Shell ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: View; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "alertas", label: "Alertas", Icon: AlertTriangle },
  { id: "historial", label: "Historial", Icon: History },
  { id: "consolidado", label: "Consolidado", Icon: FileText },
];

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const currentMeta = view === "dashboard"
    ? { title: "Dashboard", sub: "Resumen general de reportes del día" }
    : REPORT_META[view as ReportType];

  return (
    <div
      className="flex h-screen bg-background overflow-hidden"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 bg-card border-r border-border flex flex-col">
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
            Tipo de reporte
          </p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left ${
                  view === id
                    ? "bg-primary text-primary-foreground font-medium shadow-sm"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </nav>

        <div className="px-4 pb-4 pt-3 border-t border-border space-y-3">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-[0.12em] uppercase mb-1.5">
              Scheduler automático
            </p>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-sm shadow-emerald-300" />
              <span className="text-xs font-semibold text-foreground">Activo</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Cada 10 min</p>
            <p className="text-xs text-muted-foreground">TZ: America/Lima</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-[0.12em] uppercase mb-1">
              Última ejecución (Alertas)
            </p>
            <span className="inline-block text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">
              sin ejecución hoy
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            El detalle de cada alerta vive en el Excel consolidado. Aquí solo se muestran
            metadatos del proceso.
          </p>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-card border-b border-border px-6 py-3 flex items-center justify-between shrink-0 gap-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground truncate">
              {currentMeta.title}
            </h2>
            <p className="text-xs text-muted-foreground truncate">{currentMeta.sub}</p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
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
                24/09/2026
              </span>
            </div>

            <select className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer">
              <option value="2026-09-24">2026-09-24</option>
              <option value="2026-09-23">2026-09-23</option>
              <option value="2026-09-22">2026-09-22</option>
            </select>

            <button className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm">
              <RefreshCw size={12} />
              Procesar ahora
            </button>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto">
          {view === "dashboard" && <DashboardView />}
          {view === "alertas" && <ReportView type="alertas" />}
          {view === "historial" && <ReportView type="historial" />}
          {view === "consolidado" && <ReportView type="consolidado" />}
        </main>
      </div>
    </div>
  );
}
