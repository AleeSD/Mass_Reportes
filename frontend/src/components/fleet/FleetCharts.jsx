import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ZONE_COLORS, average, durShort } from "../../lib/fleetFormat.js";

const AXIS = { fontSize: 11, fill: "#6B7280" };
const GRID = "#EEF2F7";
const TOOLTIP_STYLE = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};
const RUTA_COLOR = "#475569";

function Empty({ text = "Sin datos para este día o filtro." }) {
  return <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">{text}</div>;
}

/** Histograma de la duración de las vueltas completas (con tiendas), en tramos de 30 min. */
export function TripDurationHistogram({ trips }) {
  const data = useMemo(() => {
    const values = trips.filter((t) => t.con_tiendas && t.seg_vuelta != null).map((t) => t.seg_vuelta);
    if (!values.length) return [];
    const bin = 30 * 60;
    const max = Math.max(...values);
    const out = [];
    for (let b = 0; b <= max; b += bin) {
      const inBin = trips.filter((t) => t.con_tiendas && t.seg_vuelta != null && t.seg_vuelta >= b && t.seg_vuelta < b + bin);
      out.push({
        rango: `${durShort(b)}–${durShort(b + bin)}`,
        corto: `${(b / 3600).toFixed(1).replace(".0", "")} h`,
        vueltas: inBin.length,
        placas: inBin.map((t) => `${t.placa} V${t.vuelta}`).join(", "),
      });
    }
    return out;
  }, [trips]);
  if (!data.length) return <Empty text="No hay vueltas con tiendas cerradas." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="corto" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "#F4F6FA" }}
          labelFormatter={(_, p) => p?.[0]?.payload?.rango}
          formatter={(v, _n, p) => [`${v} vuelta(s)${p.payload.placas ? ` · ${p.payload.placas}` : ""}`, "Duración"]}
        />
        <Bar dataKey="vueltas" fill={RUTA_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Tiempo medio desde el origen de la vuelta hasta la 1.ª tienda, por placa. */
export function FirstStoreBars({ trips }) {
  const data = useMemo(() => {
    const byPlate = new Map();
    for (const t of trips) {
      if (!t.con_tiendas || t.seg_a_primera_tienda == null) continue;
      if (!byPlate.has(t.placa)) byPlate.set(t.placa, []);
      byPlate.get(t.placa).push(t.seg_a_primera_tienda);
    }
    return [...byPlate.entries()]
      .map(([placa, list]) => ({ placa, minutos: Math.round(average(list) / 60), vueltas: list.length }))
      .sort((a, b) => a.placa.localeCompare(b.placa));
  }, [trips]);
  if (!data.length) return <Empty text="No hay vueltas con tiendas." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 26 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} unit=" min" />
        <YAxis
          type="category"
          dataKey="placa"
          tick={{ ...AXIS, fill: "#374151", fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "#F4F6FA" }}
          formatter={(v, _n, p) => [`${durShort(v * 60)} (media de ${p.payload.vueltas} vuelta(s))`, "A la 1.ª tienda"]}
        />
        <Bar dataKey="minutos" fill={ZONE_COLORS.TIENDA} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vehículos dentro de BSF por franja. */
export function BsfOccupancyChart({ franjas }) {
  if (!franjas?.length || franjas.every((f) => f.vehiculos === 0)) return <Empty text="Ningún vehículo registró estancia en BSF." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={franjas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="bsfGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={ZONE_COLORS.BSF} stopOpacity={0.2} />
            <stop offset="95%" stopColor={ZONE_COLORS.BSF} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="franja" tick={AXIS} axisLine={false} tickLine={false} interval={7} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v, _n, p) => [`${v} vehículo(s)${p.payload.placas?.length ? ` · ${p.payload.placas.join(", ")}` : ""}`, "En BSF"]}
          labelFormatter={(l) => `Franja ${l}`}
        />
        <Area type="stepAfter" dataKey="vehiculos" stroke={ZONE_COLORS.BSF} strokeWidth={2} fill="url(#bsfGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
