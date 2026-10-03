// Pruebas de oro (§12): valores verificados sobre el reporte real del 27/09.
import assert from "node:assert/strict";
import path from "node:path";
import { before, describe, test } from "node:test";
import { loadConsolidatedWorkbookTables } from "../src/engine/consolidate.js";
import { FIXTURES, dur, hms, timeline } from "./helpers.js";
import { processDay } from "../src/engine/processDay.js";
import { getReportType, loadConfig } from "../src/config.js";
import fs from "node:fs";
import os from "node:os";

let result;
const byPlate = (placa) => ({
  placa: result.placas.find((p) => p.placa === placa),
  trips: result.trips.filter((t) => t.placa === placa),
  visits: result.visits.filter((v) => v.placa === placa),
});

before(async () => {
  // Generamos el REPORTE_ALERTAS del 27/09 desde los exports crudos del fixture.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "onway-golden-"));
  const config = loadConfig();
  config.rutas = { raiz_salida: tmp };
  const alertas = {
    ...getReportType(config, "alertas"),
    carpeta_raiz: path.join(FIXTURES, "entrada", "alertas_onway"),
    carpeta_raiz_fallback: [],
  };
  const run = await processDay({ config, reportType: alertas, isoDate: "2026-09-27" });
  assert.equal(run.estado, "ok");
  assert.equal(run.placas_ok, 7);
  const tables = await loadConsolidatedWorkbookTables(run.consolidado);
  result = timeline(tables, "2026-09-27");
});

describe("Pruebas de oro 27/09", () => {
  test("AAR-880: rebote, llegada repetida, salida duplicada, pasos por zona y fin de servicio", () => {
    const { placa, trips, visits } = byPlate("AAR-880");
    assert.equal(hms(placa.inicio_jornada), "05:12:07");
    assert.equal(placa.inicio_calidad, "real");
    const [v1, v2] = trips;
    assert.equal(trips.length, 2);
    assert.equal(v1.origen, "Precarga");
    assert.equal(v1.tiendas.length, 1);
    assert.equal(v1.tiendas[0].codigo, "242");
    assert.equal(hms(v1.tiendas[0].llegada), "05:50:22");
    assert.equal(hms(v1.tiendas[0].salida), "06:29:32");
    assert.equal(dur(v1.tiendas[0].seg_permanencia), "0:39:10");
    assert.ok(v1.tiendas[0].marcas.includes("rebote fusionado"));
    assert.equal(v1.cierre_tipo, "BSF");
    assert.equal(hms(v1.cierre_hora), "08:03:47");
    assert.equal(dur(v1.seg_vuelta), "2:51:40");
    assert.equal(dur(v1.seg_retorno), "1:34:15");
    assert.equal(hms(v2.llegada_bsf_prev), "08:03:47");
    assert.equal(hms(v2.salida_bsf), "11:24:50");
    assert.equal(dur(v2.seg_en_bsf), "3:21:03");
    assert.equal(v2.tiendas.length, 1);
    assert.equal(v2.tiendas[0].codigo, "2606");
    assert.equal(hms(v2.tiendas[0].llegada), "12:16:56");
    assert.equal(hms(v2.tiendas[0].salida), "12:34:22");
    assert.equal(dur(v2.tiendas[0].seg_permanencia), "0:17:26");
    assert.equal(v2.cierre_tipo, "FIN_SERVICIO");
    assert.equal(hms(v2.cierre_hora), "12:34:22");
    assert.equal(dur(v2.seg_vuelta), "1:09:32");
    const bsf = visits.find((v) => v.zona_tipo === "BSF");
    assert.ok(bsf.marcas.includes("llegada repetida"));
    assert.equal(placa.calidad.duplicados, 1);
    assert.equal(placa.calidad.llegadas_repetidas, 1);
    const pasos = visits.filter((v) => v.paso).map((v) => [v.codigo, v.seg_permanencia]);
    assert.deepEqual(pasos, [["343", 71], ["370", 5], ["1160", 52]]);
    assert.equal(placa.destino_tras_ultima_tienda, "Fin de servicio");
  });

  test("AKO-712: dos tiendas, BSF 4:39:45 y salida sin tiendas reales", () => {
    const { placa, trips } = byPlate("AKO-712");
    assert.equal(hms(placa.inicio_jornada), "06:06:35");
    const [v1, v2] = trips;
    assert.deepEqual(v1.tiendas.map((t) => [t.codigo, dur(t.seg_permanencia)]), [
      ["2766", "0:10:00"],
      ["1422", "0:33:34"],
    ]);
    assert.equal(hms(v1.cierre_hora), "08:48:33");
    assert.equal(dur(v1.seg_vuelta), "2:41:58");
    assert.equal(dur(v2.seg_en_bsf), "4:39:45");
    assert.equal(hms(v2.salida_bsf), "13:28:18");
    assert.equal(v2.n_tiendas, 0);
    assert.equal(v2.cierre, "Salida de BSF sin visitas registradas");
    assert.equal(placa.calidad.pasos, 2);
  });

  test("BXQ-847: rebote fusionado en 1191, paso por zona en 257 y salida duplicada", () => {
    const { placa, trips, visits } = byPlate("BXQ-847");
    const t1191 = visits.find((v) => v.codigo === "1191");
    assert.equal(hms(t1191.llegada), "08:16:03");
    assert.equal(hms(t1191.salida), "08:24:38");
    assert.equal(dur(t1191.seg_permanencia), "0:08:35");
    assert.ok(t1191.marcas.includes("rebote fusionado"));
    const t257 = visits.find((v) => v.codigo === "257");
    assert.equal(t257.paso, true);
    assert.equal(t257.seg_permanencia, 52);
    assert.equal(placa.calidad.duplicados, 1);
    assert.equal(hms(trips[0].cierre_hora), "08:33:11");
  });

  test("BXT-918: tabla de §7.4", () => {
    const { placa, trips } = byPlate("BXT-918");
    assert.equal(hms(placa.inicio_jornada), "05:29:00");
    assert.equal(placa.inicio_calidad, "estimado");
    const [v1, v2] = trips;
    assert.equal(v1.origen, "Precarga");
    assert.deepEqual(
      v1.tiendas.map((t) => [t.nombre, hms(t.llegada), hms(t.salida), dur(t.seg_permanencia), dur(t.seg_acumulado)]),
      [
        ["1206-ROSALES 1 SJM MS", "05:59:54", "07:11:15", "1:11:21", "0:30:54"],
        ["843-TRIU C21 SJM MS", "07:17:38", "07:25:47", "0:08:09", "1:48:38"],
        ["1317-UMAMAC17 SJM MS", "07:29:04", "07:46:44", "0:17:40", "2:00:04"],
      ],
    );
    assert.equal(hms(v1.cierre_hora), "08:13:45");
    assert.equal(dur(v1.seg_retorno), "0:27:01");
    assert.equal(dur(v1.seg_vuelta), "2:44:45");
    assert.equal(dur(v2.seg_en_bsf), "3:30:00");
    assert.equal(hms(v2.salida_bsf), "11:43:45");
    assert.equal(v2.tiendas[0].nombre, "343-PASTOR SEVILLA 1");
    assert.equal(dur(v2.tiendas[0].seg_permanencia), "0:53:55");
    assert.equal(dur(v2.tiendas[0].seg_acumulado), "1:19:34");
    assert.equal(v2.cierre, "Fin de servicio en tienda");
    assert.equal(hms(v2.cierre_hora), "13:57:14");
    assert.equal(dur(v2.seg_vuelta), "2:13:29");
  });

  test("C6E-921: tramos sin tiendas son un estado válido", () => {
    const { placa, trips } = byPlate("C6E-921");
    assert.equal(hms(placa.inicio_jornada), "05:30:39");
    assert.equal(trips.length, 3);
    assert.equal(hms(trips[0].cierre_hora), "07:31:09");
    assert.equal(dur(trips[0].seg_vuelta), "2:00:30");
    assert.equal(dur(trips[1].seg_en_bsf), "1:28:09");
    assert.equal(hms(trips[1].cierre_hora), "10:19:52");
    assert.equal(dur(trips[1].seg_vuelta), "1:20:34");
    assert.equal(dur(trips[2].seg_en_bsf), "3:56:00");
    assert.equal(hms(trips[2].salida_bsf), "14:15:52");
    assert.ok(trips.every((t) => t.n_tiendas === 0));
    assert.ok(trips.every((t) => t.calidad === "real"));
    assert.equal(placa.observaciones, "");
  });

  test("zonas del 27/09: ninguna sin clasificar (incluye 324-MASS\\u00a0SAN JUAN)", () => {
    for (const p of result.placas) {
      if (p.estado_reporte !== "Con reporte") continue;
      assert.deepEqual(p.calidad.zonas_desconocidas, [], p.placa);
    }
    assert.ok(result.visits.some((v) => v.codigo === "324"));
  });

  test("la hoja maestra parte de la flota: 22 placas, orden alfabético", () => {
    assert.equal(result.placas.length, 22);
    const names = result.placas.map((p) => p.placa);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    assert.equal(result.kpis.placas_con_reporte, 7);
    assert.equal(result.placas.filter((p) => p.estado_reporte === "Sin reporte del día").length, 15);
  });
});
