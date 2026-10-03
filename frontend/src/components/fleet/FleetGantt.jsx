import { useEffect, useMemo, useRef, useState } from "react";
import { ZONE_COLORS, ZONE_LABELS, daySecs, dur, hms, secsToHm } from "../../lib/fleetFormat.js";

const LABEL_W = 92;
const ROW_H = 30;
const AXIS_H = 26;
const BAR_H = 16;
const ROUTE_H = 6;

function useWidth(ref) {
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(480, Math.floor(entry.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * Línea de tiempo tipo Gantt: una fila por placa. Tramos: en BSF (azul),
 * en Base OS (morado), en tienda (verde), en ruta (gris), pasos por zona
 * (marca gris). Los extremos estimados o faltantes van rayados.
 */
export default function FleetGantt({ fecha, placas, trips, visits, desdeHora = 4, hastaHora = 20, onSelectPlate }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const [tip, setTip] = useState(null);

  const rows = useMemo(() => {
    return placas.map((p) => {
      const jornada = daySecs(p.inicio_jornada, fecha);
      const ultima = daySecs(p.ultima_senal, fecha);
      const segs = [];
      for (const t of trips.filter((x) => x.placa === p.placa)) {
        const start = daySecs(t.inicio, fecha);
        const end = daySecs(t.cierre_hora, fecha) ?? daySecs(t.salida_ultima_tienda, fecha);
        if (start == null) continue;
        segs.push({
          kind: "RUTA",
          start,
          end: end ?? start,
          estimated: t.inicio_calidad !== "real",
          lines: [
            `Vuelta ${t.vuelta} · ${t.origen}`,
            `Inicio ${hms(t.inicio)}${t.inicio_calidad !== "real" ? " (estimado)" : ""}`,
            `${t.n_tiendas} tienda(s) · cierre: ${t.cierre}${t.cierre_hora ? ` ${hms(t.cierre_hora)}` : ""}`,
            t.seg_vuelta != null ? `Vuelta completa ${dur(t.seg_vuelta)}` : null,
          ],
        });
      }
      for (const v of visits.filter((x) => x.placa === p.placa)) {
        let start = daySecs(v.llegada, fecha);
        let end = daySecs(v.salida, fecha);
        const missingStart = start == null;
        const missingEnd = end == null;
        if (missingStart) start = Math.min(jornada ?? desdeHora * 3600, end ?? Infinity);
        if (missingEnd) end = Math.max(ultima ?? start, start);
        segs.push({
          kind: v.paso ? "PASO" : v.zona_tipo,
          start,
          end,
          estimated: missingStart || missingEnd,
          lines: [
            v.zona_tipo === "TIENDA" ? v.nombre : ZONE_LABELS[v.zona_tipo] || v.zona_tipo,
            v.zona_tipo === "TIENDA" && v.distrito ? `${v.distrito} · ${v.cd || ""}` : null,
            `${missingStart ? "llegada faltante" : hms(v.llegada)} → ${missingEnd ? "salida faltante" : hms(v.salida)}`,
            v.seg_permanencia != null ? `Permanencia ${dur(v.seg_permanencia)}` : null,
            v.marcas?.length ? v.marcas.join(", ") : null,
          ],
        });
      }
      return { placa: p, segs };
    });
  }, [placas, trips, visits, fecha, desdeHora]);

  // Eje: rango configurado, ampliado si hay datos fuera de él.
  const [x0, x1] = useMemo(() => {
    let lo = desdeHora * 3600;
    let hi = hastaHora * 3600;
    for (const r of rows) {
      for (const s of r.segs) {
        if (s.kind === "RUTA") continue;
        lo = Math.min(lo, s.start);
        hi = Math.max(hi, s.end);
      }
    }
    lo = Math.max(0, Math.floor(lo / 3600) * 3600);
    hi = Math.min(36 * 3600, Math.ceil(hi / 3600) * 3600);
    return [lo, hi];
  }, [rows, desdeHora, hastaHora]);

  const plotW = width - LABEL_W - 24;
  const x = (secs) => LABEL_W + ((Math.min(Math.max(secs, x0), x1) - x0) / (x1 - x0)) * plotW;
  const height = AXIS_H + rows.length * ROW_H + 6;
  const hours = [];
  for (let h = x0; h <= x1; h += 3600) hours.push(h);
  const step = plotW / hours.length < 34 ? 2 : 1;

  function showTip(e, seg, placa) {
    const box = ref.current.getBoundingClientRect();
    setTip({
      left: Math.min(e.clientX - box.left + 12, box.width - 250),
      top: e.clientY - box.top + 12,
      title: placa,
      lines: seg.lines.filter(Boolean),
    });
  }

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Línea de tiempo de la flota por placa">
        <defs>
          {Object.entries(ZONE_COLORS).map(([k, c]) => (
            <pattern key={k} id={`hatch-${k}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={c} opacity="0.35" />
              <line x1="0" y1="0" x2="0" y2="6" stroke={c} strokeWidth="3" />
            </pattern>
          ))}
        </defs>
        {hours.map((h, i) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={AXIS_H - 4} y2={height - 4} stroke="#EEF2F7" />
            {i % step === 0 && (
              <text x={x(h)} y={14} textAnchor="middle" fontSize="10" fill="#6B7280" style={{ fontFamily: "var(--font-mono)" }}>
                {secsToHm(h)}
              </text>
            )}
          </g>
        ))}
        {rows.map((row, i) => {
          const y = AXIS_H + i * ROW_H;
          const cy = y + ROW_H / 2;
          const sinReporte = row.placa.estado_reporte !== "Con reporte";
          return (
            <g key={row.placa.placa}>
              {i % 2 === 1 && <rect x={0} y={y} width={width} height={ROW_H} fill="#F8FAFC" />}
              <text
                x={8}
                y={cy + 4}
                fontSize="11"
                fill={sinReporte ? "#9CA3AF" : "#0F1117"}
                style={{ fontFamily: "var(--font-mono)", cursor: "pointer" }}
                onClick={() => onSelectPlate?.(row.placa.placa)}
              >
                {row.placa.placa}
              </text>
              {sinReporte && (
                <text x={LABEL_W + 4} y={cy + 4} fontSize="10" fill="#9CA3AF">
                  Sin reporte del día
                </text>
              )}
              {row.segs
                .filter((s) => s.kind === "RUTA")
                .map((s, k) => (
                  <rect
                    key={`r${k}`}
                    x={x(s.start)}
                    y={cy - ROUTE_H / 2}
                    width={Math.max(2, x(s.end) - x(s.start))}
                    height={ROUTE_H}
                    rx={3}
                    fill={s.estimated ? "url(#hatch-RUTA)" : ZONE_COLORS.RUTA}
                    onMouseMove={(e) => showTip(e, s, row.placa.placa)}
                  />
                ))}
              {row.segs
                .filter((s) => s.kind !== "RUTA")
                .map((s, k) => {
                  const w = Math.max(s.kind === "PASO" ? 2 : 3, x(s.end) - x(s.start));
                  const color = ZONE_COLORS[s.kind] || ZONE_COLORS.PASO;
                  return (
                    <g key={`s${k}`} onMouseMove={(e) => showTip(e, s, row.placa.placa)} onClick={() => onSelectPlate?.(row.placa.placa)} style={{ cursor: "pointer" }}>
                      {/* área de hover más grande que la marca */}
                      <rect x={x(s.start) - 4} y={cy - 12} width={w + 8} height={24} fill="transparent" />
                      <rect
                        x={x(s.start)}
                        y={cy - (s.kind === "PASO" ? 6 : BAR_H / 2)}
                        width={w}
                        height={s.kind === "PASO" ? 12 : BAR_H}
                        rx={s.kind === "PASO" ? 1 : 4}
                        fill={s.estimated ? `url(#hatch-${s.kind})` : color}
                        stroke="#FFFFFF"
                        strokeWidth="1"
                      />
                    </g>
                  );
                })}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-60 rounded-lg border border-border bg-white px-3 py-2 text-[11px] shadow-lg"
          style={{ left: tip.left, top: tip.top }}
        >
          <p className="font-semibold text-foreground" style={{ fontFamily: "var(--font-mono)" }}>
            {tip.title}
          </p>
          {tip.lines.map((l, i) => (
            <p key={i} className={i === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function GanttLegend() {
  const item = (label, fill, hatch) => {
    const id = `lg-${label.replace(/[^a-z0-9]/gi, "")}`;
    return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <svg width="18" height="10" aria-hidden="true">
        <defs>
          <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill={fill} opacity="0.35" />
            <line x1="0" y1="0" x2="0" y2="4" stroke={fill} strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="18" height="10" rx="3" fill={hatch ? `url(#${id})` : fill} />
      </svg>
      {label}
    </span>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {item("En BSF", ZONE_COLORS.BSF)}
      {item("En tienda", ZONE_COLORS.TIENDA)}
      {item("En Base OS", ZONE_COLORS.BASE_OS)}
      {item("En ruta", ZONE_COLORS.RUTA)}
      {item("Paso por zona", ZONE_COLORS.PASO)}
      {item("Estimado / faltante", "#64748B", true)}
    </div>
  );
}
