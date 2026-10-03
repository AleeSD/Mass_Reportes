// Consolidado de punta a punta con los exports crudos del 27/09 (F3).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import ExcelJS from "exceljs";
import { getReportType, loadConfig } from "../src/config.js";
import { loadConsolidatedWorkbookTables } from "../src/engine/consolidate.js";
import { scanWorkbookForObjectObject } from "../src/engine/helpers.js";
import { processCompositeDay, processDay } from "../src/engine/processDay.js";
import { serializeTimes } from "../src/engine/timeline/index.js";
import { FIXTURES, timeline } from "./helpers.js";

const FECHA = "2026-09-27";

function testConfig(outDir, fleetOverrides = {}) {
  const config = loadConfig();
  config.rutas = { raiz_salida: outDir };
  config.reportes.alertas.carpeta_raiz = path.join(FIXTURES, "entrada", "alertas_onway");
  config.reportes.alertas.carpeta_raiz_fallback = [];
  config.reportes.historial.carpeta_raiz = path.join(FIXTURES, "entrada", "historial_onway");
  config.reportes.historial.carpeta_raiz_fallback = [];
  config.analitica_flota = { ...config.analitica_flota, ...fleetOverrides };
  return config;
}

async function runComposite(fleetOverrides = {}, extra = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "onway-cons-"));
  const config = testConfig(out, fleetOverrides);
  const compositeReport = getReportType(config, "consolidado");
  const result = await processCompositeDay({ config, compositeReport, isoDate: FECHA, ...extra });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(result.consolidado);
  return { result, wb, config };
}

// ExcelJS relee las celdas con formato de hora como Date (base 1899-12-30).
function secsOf(value) {
  if (value instanceof Date) return Math.round((value.getTime() - Date.UTC(1899, 11, 30)) / 1000);
  return Math.round(value * 86400);
}

function sheetValues(ws) {
  const out = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals = [];
    row.eachCell({ includeEmpty: true }, (cell) => vals.push(cell.value instanceof Date ? cell.value.toISOString() : cell.value));
    out.push(vals);
  });
  return out;
}

let enabled;
let disabled;

before(async () => {
  enabled = await runComposite();
  disabled = await runComposite({ habilitado: false });
});

describe("consolidado con analítica de flota", () => {
  test("se genera ok con alertas + historial", () => {
    assert.equal(enabled.result.estado, "ok");
    assert.equal(enabled.result.placas_ok, 7);
    assert.ok(enabled.result.analitica_flota);
    assert.equal(enabled.result.resumen.analitica_flota.placas_con_reporte, 7);
    assert.ok(enabled.result.logs.some((l) => /Cobertura: 7 de 22/.test(l.mensaje)));
  });

  test("las 3 hojas nuevas van antes de las hojas por placa", () => {
    const names = enabled.wb.worksheets.map((ws) => ws.name);
    assert.deepEqual(names.slice(0, 3), ["RESUMEN_FLOTA", "VUELTAS", "VISITAS"]);
    const plates = names.slice(3);
    assert.deepEqual(plates, [...plates].sort());
    assert.equal(plates.length, 7);
  });

  test("RESUMEN_FLOTA: 22 placas en orden alfabético, horas como valor de hora", () => {
    const ws = enabled.wb.getWorksheet("RESUMEN_FLOTA");
    const placas = [];
    for (let r = 5; r <= ws.rowCount; r += 1) {
      const v = ws.getRow(r).getCell(1).value;
      if (v) placas.push(v);
    }
    assert.equal(placas.length, 22);
    assert.deepEqual(placas, [...placas].sort((a, b) => a.localeCompare(b)));
    const headers = [];
    ws.getRow(4).eachCell((c, i) => (headers[i] = c.value));
    const colInicio = headers.indexOf("Inicio de jornada");
    const aar = ws.getRow(5 + placas.indexOf("AAR-880")).getCell(colInicio);
    assert.ok(aar.value instanceof Date || typeof aar.value === "number", "valor de hora, no texto");
    assert.equal(aar.numFmt, "hh:mm:ss");
    assert.equal(secsOf(aar.value), 5 * 3600 + 12 * 60 + 7);
    const colBsf = headers.indexOf("Tiempo total en BSF");
    const bsf = ws.getRow(5 + placas.indexOf("AAR-880")).getCell(colBsf);
    assert.equal(bsf.numFmt, "[h]:mm:ss");
    assert.equal(secsOf(bsf.value), 3 * 3600 + 21 * 60 + 3);
    const bxt = ws.getRow(5 + placas.indexOf("BXT-918")).getCell(colInicio);
    assert.equal(bxt.font.italic, true, "inicio estimado en cursiva");
    const sinReporte = ws.getRow(5 + placas.indexOf("CPH-709"));
    assert.equal(sinReporte.getCell(headers.indexOf("Estado del reporte")).value, "Sin reporte del día");
  });

  test("VUELTAS y VISITAS tienen una fila por vuelta / estancia", () => {
    const vueltas = enabled.wb.getWorksheet("VUELTAS");
    const visitas = enabled.wb.getWorksheet("VISITAS");
    const k = enabled.result.analitica_flota;
    assert.equal(vueltas.rowCount - 4, k.trips.length);
    assert.equal(visitas.rowCount - 4, k.visits.length);
    assert.deepEqual(vueltas.views[0].xSplit, 2);
    assert.ok(vueltas.autoFilter);
  });

  test("sin [object Object]", () => {
    assert.equal(scanWorkbookForObjectObject(enabled.wb).found, false);
  });

  test("H8: el análisis es igual con y sin las filas de historial", async () => {
    const tables = await loadConsolidatedWorkbookTables(
      path.join(path.dirname(enabled.result.consolidado), `REPORTE_ALERTAS_${FECHA}.xlsx`),
    );
    const soloAlertas = timeline(tables, FECHA);
    const pick = (r) => serializeTimes(r.trips.filter((t) => t.placa === "C6E-921"));
    assert.deepEqual(pick(enabled.result.analitica_flota), pick(soloAlertas));
    const c6eSheet = enabled.wb.getWorksheet("C6E-921");
    assert.ok(c6eSheet.rowCount > 700, "el consolidado sí incluye el historial");
  });
});

describe("no regresión", () => {
  test("con habilitado: false no hay hojas nuevas y las hojas por placa son idénticas", () => {
    const names = disabled.wb.worksheets.map((ws) => ws.name);
    assert.ok(!names.includes("RESUMEN_FLOTA"));
    assert.equal(disabled.result.analitica_flota, null);
    assert.equal(disabled.result.resumen.analitica_flota, undefined);
    for (const name of names) {
      assert.deepEqual(sheetValues(enabled.wb.getWorksheet(name)), sheetValues(disabled.wb.getWorksheet(name)), name);
    }
  });

  test("falla aislada: si el motor falla, el consolidado sale igual y el run queda parcial", async () => {
    const failing = await runComposite({}, {
      fleetBuilder: () => {
        throw new Error("fallo simulado");
      },
    });
    assert.equal(failing.result.estado, "parcial");
    assert.ok(failing.result.logs.some((l) => l.nivel === "warn" && /fallo simulado/.test(l.mensaje)));
    const names = failing.wb.worksheets.map((ws) => ws.name);
    assert.equal(names.length, 7);
    assert.ok(!names.includes("RESUMEN_FLOTA"));
  });

  test("exports crudos: se leen sin errores ni [object Object]", async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "onway-raw-"));
    const config = testConfig(out);
    for (const tipo of ["alertas", "historial"]) {
      const r = await processDay({ config, reportType: getReportType(config, tipo), isoDate: FECHA });
      assert.equal(r.placas_error, 0, tipo);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(r.consolidado);
      assert.equal(scanWorkbookForObjectObject(wb).found, false, tipo);
    }
  });
});
