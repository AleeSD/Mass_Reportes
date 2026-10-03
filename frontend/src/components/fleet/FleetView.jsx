import { useEffect, useMemo, useState } from "react";
import { Building2, Clock, Download, MapPin, Package, RefreshCw, Route, Store, Timer, Truck, Warehouse } from "lucide-react";
import { api, cn } from "../../lib/api.js";
import { computeKpis, durShort, fechaLarga, secsToHm } from "../../lib/fleetFormat.js";
import { KpiCard, SectionCard, Skeleton } from "../ui.jsx";
import FleetGantt, { GanttLegend } from "./FleetGantt.jsx";
import FleetMasterTable from "./FleetMasterTable.jsx";
import { BsfOccupancyChart, FirstStoreBars, TripDurationHistogram } from "./FleetCharts.jsx";
import StoreRanking from "./StoreRanking.jsx";
import QualityPanel from "./QualityPanel.jsx";
import PlateDetailPanel from "./PlateDetailPanel.jsx";

const ALL = "";

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-muted border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer max-w-[220px]"
      >
        <option value={ALL}>Todas</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoadingState() {
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px]" />
        ))}
      </div>
      <Skeleton className="h-[420px]" />
      <Skeleton className="h-[300px]" />
    </div>
  );
}

/**
 * Vista "Operación de flota": tiempos reales por placa (BSF, tiendas, Base OS),
 * a partir del análisis del consolidado del día.
 */
export default function FleetView({ fecha, refreshTick, onProcess, processing }) {
  const [data, setData] = useState(null);
  const [stores, setStores] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ empresa: ALL, tipo: ALL, placa: ALL, vuelta: ALL, cd: ALL });

  useEffect(() => {
    let cancelled = false;
    if (!fecha) return undefined;
    // En refrescos automáticos no se muestra el skeleton, solo en cambios de fecha.
    if (!data || data.fecha !== fecha) setLoading(true);
    setError("");
    Promise.all([
      api(`/api/fleet/timeline/${fecha}`),
      api(`/api/fleet/stores/${fecha}`),
      api(`/api/fleet/bsf-occupancy/${fecha}`),
    ])
      .then(([timeline, st, occ]) => {
        if (cancelled) return;
        setData(timeline);
        setStores(st.tiendas || []);
        setOccupancy(occ.franjas || []);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, refreshTick]);

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));

  const options = useMemo(() => {
    const placas = data?.placas || [];
    const uniq = (list) => [...new Set(list.filter(Boolean))].sort();
    return {
      empresa: uniq(placas.map((p) => p.empresa)).map((v) => ({ value: v, label: v })),
      tipo: uniq(placas.map((p) => p.tipo)).map((v) => ({ value: v, label: v })),
      placa: placas.map((p) => ({ value: p.placa, label: p.placa })),
      vuelta: uniq((data?.trips || []).map((t) => String(t.vuelta))).map((v) => ({ value: v, label: `Vuelta ${v}` })),
      cd: uniq((data?.visits || []).filter((v) => v.zona_tipo === "TIENDA").map((v) => v.cd)).map((v) => ({ value: v, label: v })),
    };
  }, [data]);

  const view = useMemo(() => {
    if (!data?.generado) return null;
    const placas = data.placas.filter(
      (p) =>
        (!filters.empresa || p.empresa === filters.empresa) &&
        (!filters.tipo || p.tipo === filters.tipo) &&
        (!filters.placa || p.placa === filters.placa),
    );
    const names = new Set(placas.map((p) => p.placa));
    const vuelta = filters.vuelta ? Number(filters.vuelta) : null;
    let trips = data.trips.filter((t) => names.has(t.placa) && (!vuelta || t.vuelta === vuelta));
    let visits = data.visits.filter((v) => names.has(v.placa) && (!vuelta || v.vuelta === vuelta));
    if (filters.cd) {
      visits = visits.filter((v) => v.zona_tipo !== "TIENDA" || v.cd === filters.cd);
      trips = trips.filter((t) => t.tiendas.some((s) => s.cd === filters.cd));
    }
    const storeRows = stores.filter(
      (s) => (!filters.cd || s.cd === filters.cd) && s.placas.some((p) => names.has(p)),
    );
    const occ = occupancy.map((f) => {
      const inside = f.placas.filter((p) => names.has(p));
      return { ...f, placas: inside, vehiculos: inside.length };
    });
    return { placas, trips, visits, storeRows, occ, kpis: computeKpis({ placas, trips, visits, fecha: data.fecha }) };
  }, [data, filters, stores, occupancy]);

  const filtered = Object.values(filters).some(Boolean);

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!data?.generado) {
    return (
      <div className="p-6">
        <div className="bg-card rounded-xl border border-dashed border-border p-10 text-center">
          <Truck size={28} className="mx-auto text-muted-foreground" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">Este día no tiene análisis de flota</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            Procese el consolidado del {fechaLarga(fecha).toLowerCase()} para generar las hojas RESUMEN_FLOTA, VUELTAS y VISITAS y ver
            aquí los tiempos de la flota. Los reportes por placa del día anterior se suben cada día a las 8 am.
          </p>
          <button
            onClick={onProcess}
            disabled={processing}
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm",
              processing ? "bg-slate-300 text-slate-500 cursor-wait" : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <RefreshCw size={12} className={processing ? "animate-spin" : ""} />
            {processing ? "Procesando…" : "Procesar el día"}
          </button>
        </div>
      </div>
    );
  }

  const k = view.kpis;

  return (
    <div className="p-6 space-y-5">
      {/* Estado + filtros globales */}
      <div className="bg-card rounded-xl border border-border px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs text-muted-foreground">{fechaLarga(data.fecha)}</span>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full border",
            k.conReporte < k.esperadas ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200",
          )}
        >
          {k.conReporte} de {k.esperadas} placas con reporte
        </span>
        {data.consolidado && (
          <a
            href={`/api/download/consolidated/consolidado/${data.fecha}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            title={data.consolidado}
          >
            <Download size={12} /> {data.consolidado}
          </a>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <FilterSelect label="Empresa" value={filters.empresa} onChange={setFilter("empresa")} options={options.empresa} />
          <FilterSelect label="Tipo" value={filters.tipo} onChange={setFilter("tipo")} options={options.tipo} />
          <FilterSelect label="Placa" value={filters.placa} onChange={setFilter("placa")} options={options.placa} />
          <FilterSelect label="Vuelta" value={filters.vuelta} onChange={setFilter("vuelta")} options={options.vuelta} />
          <FilterSelect label="CD" value={filters.cd} onChange={setFilter("cd")} options={options.cd} />
          {filtered && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => setFilters({ empresa: ALL, tipo: ALL, placa: ALL, vuelta: ALL, cd: ALL })}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard label="Vehículos con reporte" value={`${k.conReporte} / ${k.esperadas}`} sub={k.fueraDeFlota ? `+${k.fueraDeFlota} fuera de flota` : "esperados según flota.yaml"} icon={Truck} accent={k.conReporte < k.esperadas} />
        <KpiCard label="1.ª salida de BSF" value={secsToHm(k.primeraSalidaBsf)} sub="la más temprana del día" icon={Warehouse} />
        <KpiCard label="Salida media de BSF" value={secsToHm(k.horaMediaSalidaBsf)} sub="1.ª salida de cada placa" icon={Clock} />
        <KpiCard label="Vueltas por vehículo" value={k.vueltasMedia == null ? "—" : k.vueltasMedia.toFixed(1)} sub={`${k.vueltasConTiendas} vuelta(s) con tiendas`} icon={Route} />
        <KpiCard label="Vuelta completa media" value={durShort(k.segVueltaMedia)} sub="origen → cierre" icon={Timer} />
        <KpiCard label="A la 1.ª tienda (media)" value={durShort(k.segPrimeraTiendaMedia)} sub="desde el origen de la vuelta" icon={MapPin} />
        <KpiCard label="Carga en BSF (media)" value={durShort(k.segBsfMedia)} sub="por estancia en BSF" icon={Package} />
        <KpiCard label="Tiendas visitadas" value={k.tiendasVisitadas} sub={`${k.tiendasDistintas} tienda(s) distinta(s)`} icon={Store} />
        <KpiCard label="Servicios que terminan en tienda" value={k.finEnTienda} sub="fin de servicio (D4)" icon={Building2} />
        <KpiCard label="Estancias BSF ≥ umbral" value={view.visits.filter((v) => v.larga).length} sub={`≥ ${data.parametros?.resaltar_estancia_bsf_min ?? 240} min`} icon={Warehouse} />
      </div>

      {/* Gantt */}
      <SectionCard
        title="Línea de tiempo de la flota"
        sub="Una fila por placa · pase el cursor por un tramo para ver horas y permanencia · clic para el detalle"
        action={<GanttLegend />}
        bodyClassName="p-3"
      >
        <FleetGantt
          fecha={data.fecha}
          placas={view.placas}
          trips={view.trips}
          visits={view.visits}
          desdeHora={data.gantt?.desde_hora ?? 4}
          hastaHora={data.gantt?.hasta_hora ?? 20}
          onSelectPlate={setSelected}
        />
      </SectionCard>

      {/* Tabla maestra */}
      <SectionCard title="Resumen por placa" sub="Espejo de la hoja RESUMEN_FLOTA · ordene con clic en el encabezado" bodyClassName="p-0">
        <FleetMasterTable placas={view.placas} fecha={data.fecha} onSelectPlate={setSelected} />
      </SectionCard>

      {/* Distribuciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Duración de las vueltas completas" sub="Vueltas con tiendas, en tramos de 30 min">
          <TripDurationHistogram trips={view.trips} />
        </SectionCard>
        <SectionCard title="Tiempo a la 1.ª tienda por placa" sub="Media por placa, desde el origen de cada vuelta">
          <FirstStoreBars trips={view.trips} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard className="lg:col-span-2" title="Ocupación de BSF" sub="Vehículos dentro de BSF por franja de 15 min">
          <BsfOccupancyChart franjas={view.occ} />
        </SectionCard>
        <SectionCard title="Calidad de datos" sub="Sobre las placas filtradas">
          <QualityPanel placas={view.placas} onSelectPlate={setSelected} />
        </SectionCard>
      </div>

      <SectionCard title="Ranking de tiendas" sub="Visitas reales (sin pasos por zona)" bodyClassName="p-0">
        <StoreRanking tiendas={view.storeRows} />
      </SectionCard>

      {selected && <PlateDetailPanel fecha={data.fecha} placa={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
