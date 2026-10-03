// Persistencia SQLite, endpoints /api/fleet/*, mutex y scheduler (F4 / §10).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { FIXTURES } from "./helpers.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "onway-api-"));
process.env.ONWAY_DB_PATH = path.join(TMP, "test.db");

const { default: express } = await import("express");
const { getReportType, loadConfig } = await import("../src/config.js");
const { createApiRouter } = await import("../src/api.js");
const { getFleetDay, saveRun } = await import("../src/db.js");
const { LockedError, withLock } = await import("../src/locks.js");
const { runReport } = await import("../src/runner.js");
const { runSchedulerCycle } = await import("../src/scheduler.js");
const { serializeTimes } = await import("../src/engine/timeline/index.js");

const FECHA = "2026-09-27";

function testConfig(outDir) {
  const config = loadConfig();
  config.rutas = { raiz_salida: outDir };
  config.reportes.alertas.carpeta_raiz = path.join(FIXTURES, "entrada", "alertas_onway");
  config.reportes.alertas.carpeta_raiz_fallback = [];
  config.reportes.historial.carpeta_raiz = path.join(FIXTURES, "entrada", "historial_onway");
  config.reportes.historial.carpeta_raiz_fallback = [];
  config.scheduler = { ...config.scheduler, dias_a_revisar: [FECHA], estabilidad_segundos: 120, solo_si_cambio: true };
  return config;
}

let server;
let base;
let composite;

before(async () => {
  const config = testConfig(path.join(TMP, "out"));
  composite = await runReport({ config, reportType: getReportType(config, "consolidado"), isoDate: FECHA });
  saveRun(composite);
  const app = express();
  app.use("/api", createApiRouter());
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server?.close());

const get = async (p) => {
  const res = await fetch(base + p);
  return { status: res.status, body: await res.json() };
};

describe("SQLite", () => {
  test("guarda vueltas y visitas del día y coinciden con el Excel", () => {
    const day = getFleetDay(FECHA);
    const plain = serializeTimes(composite.analitica_flota);
    assert.equal(day.trips.length, plain.trips.length);
    assert.equal(day.visits.length, plain.visits.length);
    assert.equal(day.placas.length, 22);
    const bxt = day.trips.find((t) => t.placa === "BXT-918" && t.vuelta === 1);
    assert.equal(bxt.cierre_hora, "2026-09-27 08:13:45");
    assert.equal(bxt.seg_vuelta, 2 * 3600 + 44 * 60 + 45);
    assert.equal(bxt.tiendas.length, 3);
    assert.equal(composite.resumen.huella_entrada.archivos, 8);
  });

  test("reprocesar el día reemplaza sus filas (no duplica)", () => {
    const before = getFleetDay(FECHA);
    saveRun(composite);
    const after2 = getFleetDay(FECHA);
    assert.equal(after2.trips.length, before.trips.length);
    assert.equal(after2.visits.length, before.visits.length);
    assert.ok(after2.run_id > before.run_id);
  });
});

describe("endpoints /api/fleet", () => {
  test("timeline del día", async () => {
    const { status, body } = await get(`/fleet/timeline/${FECHA}`);
    assert.equal(status, 200);
    assert.equal(body.generado, true);
    assert.equal(body.kpis.placas_con_reporte, 7);
    assert.equal(body.placas.length, 22);
    assert.equal(body.calidad.placas_sin_reporte.length, 15);
    assert.deepEqual(body.calidad.inicios_estimados, ["BXT-918"]);
  });

  test("timeline de una placa (con o sin guion)", async () => {
    const { body } = await get(`/fleet/timeline/${FECHA}/AAR880`);
    assert.equal(body.placa.placa, "AAR-880");
    assert.equal(body.trips.length, 2);
    assert.ok(body.visits.length >= 6);
  });

  test("ranking de tiendas", async () => {
    const { body } = await get(`/fleet/stores/${FECHA}`);
    assert.equal(body.tiendas.length, 9);
    const t1206 = body.tiendas.find((t) => t.codigo === "1206");
    assert.equal(t1206.hora_media_llegada, "05:59:54");
    assert.equal(t1206.seg_permanencia_media, 3600 + 11 * 60 + 21);
  });

  test("ocupación de BSF por franja de 15 min", async () => {
    const { body } = await get(`/fleet/bsf-occupancy/${FECHA}`);
    assert.equal(body.franjas.length, 64);
    const f1100 = body.franjas.find((f) => f.franja === "11:00");
    // A las 11:00 están dentro: AAR-880, AKO-712, ARY-825, BXQ-847, BXT-918, C6E-921
    assert.deepEqual(f1100.placas, ["AAR-880", "AKO-712", "ARY-825", "BXQ-847", "BXT-918", "C6E-921"]);
    assert.equal(body.maximo, 6);
  });

  test("día sin análisis y fecha inválida", async () => {
    const empty = await get("/fleet/timeline/2026-09-01");
    assert.deepEqual(empty.body, { generado: false, fecha: "2026-09-01" });
    const bad = await get("/fleet/timeline/2026-02-31");
    assert.equal(bad.status, 400);
    const bad2 = await get("/fleet/stores/hola");
    assert.equal(bad2.status, 400);
  });

  test("config de solo lectura", async () => {
    const { body } = await get("/fleet/config");
    assert.equal(body.flota.placas.length, 22);
    assert.equal(body.catalogo.total, 115);
    assert.equal(body.parametros.paso_por_zona_segundos, 180);
  });
});

describe("mutex tipo+fecha", () => {
  test("una segunda ejecución concurrente recibe LockedError (409)", async () => {
    let release;
    const first = withLock("consolidado_diario", FECHA, () => new Promise((r) => (release = r)));
    await assert.rejects(withLock("consolidado_diario", FECHA, async () => 1), (err) => err instanceof LockedError && err.status === 409);
    assert.equal(await withLock("alertas", FECHA, async () => "otro tipo sí"), "otro tipo sí");
    release("ok");
    assert.equal(await first, "ok");
    assert.equal(await withLock("consolidado_diario", FECHA, async () => 2), 2);
  });
});

describe("scheduler", () => {
  test("espera estabilidad, procesa una vez y luego no reprocesa si nada cambió", async () => {
    const config = testConfig(path.join(TMP, "out-sched"));
    const quiet = { log() {}, error() {} };
    const files = fs
      .readdirSync(path.join(FIXTURES, "entrada", "alertas_onway", FECHA, "alertas"))
      .map((f) => fs.statSync(path.join(FIXTURES, "entrada", "alertas_onway", FECHA, "alertas", f)).mtimeMs);
    const lastMtime = Math.max(...files);

    const early = await runSchedulerCycle(config, { now: lastMtime + 10_000, log: quiet });
    assert.deepEqual(early, [{ fecha: FECHA, accion: "esperando_estabilidad" }]);

    const later = Date.now() + 10 * 60_000;
    const first = await runSchedulerCycle(config, { now: later, log: quiet });
    // El consolidado ya fue procesado en before() con la misma huella -> sin cambios.
    const acciones = Object.fromEntries(first.map((s) => [s.tipo, s.accion]));
    assert.equal(acciones.consolidado, "sin_cambios");
    const second = await runSchedulerCycle(config, { now: later, log: quiet });
    assert.ok(second.every((s) => s.accion === "sin_cambios"), JSON.stringify(second));
  });
});
