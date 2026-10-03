// Casos sintéticos y reales adicionales (§12 "Otros casos").
import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { loadConsolidatedWorkbookTables } from "../src/engine/consolidate.js";
import { selectAlertRows } from "../src/engine/timeline/index.js";
import { createZoneResolver } from "../src/engine/timeline/normalizeZone.js";
import { parseFecha, toTs } from "../src/engine/timeline/utils.js";
import { parseToIso } from "../src/engine/helpers.js";
import { FIXTURES, IN, ON, OUT, ctx, dur, hms, row, timeline } from "./helpers.js";

const one = (rows, placa = "ZZZ-999", fecha = "2026-09-28") => {
  const r = timeline([{ plate: placa, rows }], fecha);
  return {
    r,
    placa: r.placas.find((p) => p.placa === placa),
    trips: r.trips.filter((t) => t.placa === placa),
    visits: r.visits.filter((v) => v.placa === placa),
  };
};

describe("normalización de zonas", () => {
  const resolver = createZoneResolver(ctx.zonesConfig, ctx.catalog);
  test("BSF y Base OS por nombre, sin importar mayúsculas y espacios", () => {
    assert.equal(resolver.resolve(" mass  bsf 1 ").tipo, "BSF");
    assert.equal(resolver.resolve("BASE-OSLOGISTICS").tipo, "BASE_OS");
  });
  test("tienda por código, con espacio no separable o espacios sobrantes", () => {
    const z = resolver.resolve("324-MASS SAN JUAN");
    assert.equal(z.tipo, "TIENDA");
    assert.equal(z.codigo, "324");
    assert.equal(resolver.resolve("1422-TORRES 3 SJM MS ").local, "TORRES 3 SJM MS");
    assert.equal(resolver.resolve("1422-OTRO NOMBRE").codigo, "1422");
  });
  test("código fuera del catálogo = zona desconocida", () => {
    assert.equal(resolver.resolve("99999-NUEVA TIENDA").tipo, "DESCONOCIDA");
    assert.equal(resolver.resolve("ZONA RARA").tipo, "DESCONOCIDA");
  });
  test("catálogo con 115 tiendas y sin FILMS A OSLO", () => {
    assert.equal(resolver.catalogSize, 115);
    assert.ok(!ctx.catalog.some((t) => /FILMS/i.test(t.local)));
  });
});

describe("reglas de estancias y vueltas", () => {
  test("zona con código fuera del catálogo se registra en calidad, no en visitas", () => {
    const { placa, visits } = one([
      row("06:00:00", ON),
      row("06:30:00", IN, "99999-NUEVA"),
      row("06:50:00", OUT, "99999-NUEVA"),
    ]);
    assert.deepEqual(placa.calidad.zonas_desconocidas, ["99999-NUEVA"]);
    assert.equal(visits.length, 0);
    assert.match(placa.observaciones, /desconocida/);
  });

  test("vehículo que amanece dentro de Base OS (solo 'Salió') y regresa", () => {
    const { placa, trips, visits } = one([
      row("05:00:00", ON),
      row("05:05:00", OUT, "BASE-OSLOGISTICS"),
      row("05:40:00", IN, "MASS BSF 1"),
      row("07:00:00", OUT, "MASS BSF 1"),
      row("07:30:00", IN, "242-ATECA"),
      row("07:50:00", OUT, "242-ATECA"),
      row("09:00:00", IN, "BASE-OSLOGISTICS"),
    ]);
    const base = visits.filter((v) => v.zona_tipo === "BASE_OS");
    assert.equal(base[0].llegada, null);
    assert.ok(base[0].marcas.includes("salida sin llegada"));
    assert.equal(hms(placa.salida_base_os), "05:05:00");
    assert.equal(hms(placa.regreso_base_os), "09:00:00");
    assert.equal(trips[0].origen, "Salida Base OS");
    assert.equal(trips[0].cierre, "BSF");
    assert.equal(dur(trips[0].seg_vuelta), "0:35:00");
    assert.equal(trips[1].cierre, "Base OS");
    assert.equal(dur(trips[1].seg_retorno), "1:10:00");
    assert.equal(placa.destino_tras_ultima_tienda, "Base OS");
    assert.equal(placa.cierre_dia, "Regreso a Base OS");
  });

  test("cruce de medianoche", () => {
    const { trips } = one([
      row("23:10:00", ON, "", { fecha: "28/09/2026" }),
      row("23:40:00", IN, "242-ATECA", { fecha: "28/09/2026" }),
      row("00:20:00", OUT, "242-ATECA", { fecha: "29/09/2026" }),
      row("01:00:00", IN, "MASS BSF 1", { fecha: "29/09/2026" }),
    ]);
    assert.equal(dur(trips[0].tiendas[0].seg_permanencia), "0:40:00");
    assert.equal(dur(trips[0].seg_vuelta), "1:50:00");
  });

  test("tienda visitada dos veces en el día (fuera de la ventana de rebote)", () => {
    const { trips } = one([
      row("06:00:00", ON),
      row("06:30:00", IN, "242-ATECA"),
      row("06:50:00", OUT, "242-ATECA"),
      row("07:30:00", IN, "242-ATECA"),
      row("07:45:00", OUT, "242-ATECA"),
    ]);
    assert.equal(trips.length, 1);
    assert.equal(trips[0].n_tiendas, 2);
    assert.equal(dur(trips[0].tiendas[1].seg_traslado), "0:40:00");
    assert.equal(trips[0].cierre_tipo, "FIN_SERVICIO");
  });

  test("rebote no se fusiona si hubo otra zona en medio", () => {
    const { visits } = one([
      row("06:00:00", ON),
      row("06:30:00", IN, "242-ATECA"),
      row("06:40:00", OUT, "242-ATECA"),
      row("06:42:00", IN, "343-PASTOR SEVILLA 1"),
      row("06:47:00", OUT, "343-PASTOR SEVILLA 1"),
      row("06:48:00", IN, "242-ATECA"),
      row("06:55:00", OUT, "242-ATECA"),
    ]);
    assert.equal(visits.filter((v) => v.codigo === "242").length, 2);
  });

  test("estancia abierta al final del día en BSF = cierre en BSF", () => {
    const { placa, trips, visits } = one([
      row("06:00:00", ON),
      row("06:30:00", IN, "242-ATECA"),
      row("06:50:00", OUT, "242-ATECA"),
      row("07:30:00", IN, "MASS BSF 1"),
    ]);
    assert.equal(trips.length, 1);
    assert.equal(trips[0].cierre, "BSF");
    assert.ok(visits.at(-1).marcas.includes("estancia abierta"));
    assert.equal(placa.cierre_dia, "Cierre en BSF (precarga / documentos)");
    assert.equal(placa.calidad.estancias_abiertas, 1);
  });

  test("inicio: 'Encendido o Entró en cobertura' no es inicio; 'Se movio' es estimado", () => {
    const { placa } = one([
      row("04:00:00", "Encendido o Entró en cobertura"),
      row("05:00:00", "Se movio"),
      row("05:30:00", IN, "242-ATECA"),
      row("05:50:00", OUT, "242-ATECA"),
    ]);
    assert.equal(hms(placa.inicio_jornada), "05:00:00");
    assert.equal(placa.inicio_calidad, "estimado");
  });

  test("placa con y sin guion es la misma", () => {
    const r = timeline([{ plate: "CPH709", rows: [row("06:00:00", ON)] }], "2026-09-28");
    const p = r.placas.find((x) => x.placa === "CPH-709");
    assert.equal(p.estado_reporte, "Con reporte");
    assert.equal(p.tipo, "OS");
    assert.equal(r.placas.length, 22);
  });

  test("placa fuera de la flota se agrega igual", () => {
    const r = timeline([{ plate: "NEW-001", rows: [row("06:00:00", ON)] }], "2026-09-28");
    const p = r.placas.find((x) => x.placa === "NEW-001");
    assert.equal(p.en_flota, false);
    assert.equal(r.placas.length, 23);
    assert.deepEqual(r.kpis.placas_fuera_de_flota, ["NEW-001"]);
  });

  test("archivo vacío / sin filas = sin reporte", () => {
    const r = timeline([{ plate: "AAR-880", rows: [] }], "2026-09-28");
    const p = r.placas.find((x) => x.placa === "AAR-880");
    assert.equal(p.estado_reporte, "Sin reporte del día");
    assert.equal(p.observaciones, "Sin reporte del día");
  });

  test("filas con fecha/hora inválida se cuentan en calidad", () => {
    const { placa } = one([row("06:00:00", ON), row("xx", "Se movio", "", { fecha: "31/02/2026" })]);
    assert.equal(placa.calidad.filas_invalidas, 1);
  });
});

describe("fechas", () => {
  test("parseToIso rechaza fechas imposibles", () => {
    assert.equal(parseToIso("2026-02-31"), null);
    assert.equal(parseToIso("31-02-2026"), null);
    assert.equal(parseToIso("2026-09-28"), "2026-09-28");
    assert.equal(parseToIso("28-09-2026"), "2026-09-28");
    assert.equal(parseToIso("hola"), null);
  });
  test("parseFecha / toTs aceptan DD/MM/YYYY, ISO y Date", () => {
    assert.equal(parseFecha("27/09/2026"), parseFecha("2026-09-27"));
    assert.equal(parseFecha(new Date(Date.UTC(2026, 8, 27))), parseFecha("2026-09-27"));
    assert.equal(toTs("27/09/2026", "05:12:07") - parseFecha("2026-09-27"), 5 * 3600 + 12 * 60 + 7);
  });
});

describe("reportes reales del 24/09", () => {
  test("CPH709 y CPF781 sin reporte; F6V-794 inicia en su primer 'Vehículo encendido'", async () => {
    const tables = await loadConsolidatedWorkbookTables(path.join(FIXTURES, "REPORTE_ALERTAS_2026-09-24.xlsx"));
    const r = timeline(tables, "2026-09-24");
    assert.equal(r.kpis.placas_con_reporte, 20);
    for (const placa of ["CPH-709", "CPF-781"]) {
      assert.equal(r.placas.find((p) => p.placa === placa).estado_reporte, "Sin reporte del día");
    }
    const f6v = tables.find((t) => t.plate === "F6V-794");
    const firstEvent = f6v.rows[0];
    assert.equal(firstEvent.Hora.slice(0, 2), "01");
    const firstOn = f6v.rows.find((x) => x.Alerta === ON);
    const p = r.placas.find((x) => x.placa === "F6V-794");
    assert.equal(hms(p.inicio_jornada), firstOn.Hora);
    assert.equal(p.inicio_calidad, "real");
  });
});

describe("H8: el historial no duplica eventos", () => {
  test("selectAlertRows usa solo filas de alertas", () => {
    const rows = [
      { _base: "alertas", Alerta: IN },
      { _base: "historial", Alerta: IN },
      { "Origen del registro": "Historial", Alerta: IN },
      { "Origen del registro": "Alertas", Alerta: IN },
    ];
    assert.equal(selectAlertRows(rows).length, 2);
  });
});
