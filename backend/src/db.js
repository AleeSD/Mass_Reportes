import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PROJECT_ROOT } from "./config.js";
import { serializeTimes } from "./engine/timeline/index.js";

const DATA_DIR = path.join(PROJECT_ROOT, "backend", "data");
const DEFAULT_DB_PATH = path.join(DATA_DIR, "metadata.db");

function dbPath() {
  return process.env.ONWAY_DB_PATH || DEFAULT_DB_PATH;
}

function ensureDb() {
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      estado TEXT NOT NULL,
      archivos_encontrados INTEGER NOT NULL DEFAULT 0,
      placas_ok INTEGER NOT NULL DEFAULT 0,
      placas_error INTEGER NOT NULL DEFAULT 0,
      consolidado TEXT,
      resumen_json TEXT NOT NULL,
      logs_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_runs_tipo_fecha ON runs(tipo, fecha, id DESC);

    -- Analítica de flota (v1.4). Horas en texto "YYYY-MM-DD HH:MM:SS" (hora local Lima).
    CREATE TABLE IF NOT EXISTS fleet_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      fecha TEXT NOT NULL,
      kpis_json TEXT NOT NULL,
      placas_json TEXT NOT NULL,
      parametros_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_fleet_days_fecha ON fleet_days(fecha);
    CREATE TABLE IF NOT EXISTS fleet_trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      fecha TEXT NOT NULL, placa TEXT NOT NULL, vuelta INTEGER NOT NULL,
      origen TEXT, origen_tipo TEXT, inicio TEXT, inicio_calidad TEXT,
      llegada_bsf_prev TEXT, salida_bsf TEXT,
      cierre_tipo TEXT, cierre TEXT, cierre_hora TEXT, salida_ultima_tienda TEXT,
      seg_en_bsf INTEGER, seg_a_primera_tienda INTEGER, seg_retorno INTEGER, seg_vuelta INTEGER,
      n_tiendas INTEGER, con_tiendas INTEGER, calidad TEXT, tiendas_json TEXT
    );
    CREATE TABLE IF NOT EXISTS fleet_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      fecha TEXT NOT NULL, placa TEXT NOT NULL, vuelta INTEGER, orden INTEGER, n_tienda INTEGER,
      zona_tipo TEXT NOT NULL, codigo TEXT, local TEXT, nombre TEXT, distrito TEXT, cd TEXT,
      llegada TEXT, salida TEXT, seg_permanencia INTEGER, seg_acumulado INTEGER, seg_traslado INTEGER,
      calidad TEXT, marcas TEXT, paso INTEGER, larga INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_trips_fecha  ON fleet_trips(fecha, placa);
    CREATE INDEX IF NOT EXISTS idx_visits_fecha ON fleet_visits(fecha, placa);
    CREATE INDEX IF NOT EXISTS idx_visits_codigo ON fleet_visits(codigo);
  `);
  return db;
}

function inTransaction(db, fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function saveFleet(db, runId, fecha, fleet) {
  const plain = serializeTimes({ kpis: fleet.kpis, placas: fleet.placas, trips: fleet.trips, visits: fleet.visits });
  // Reprocesar un día reemplaza su análisis.
  db.prepare("DELETE FROM fleet_days WHERE fecha = ?").run(fecha);
  db.prepare("DELETE FROM fleet_trips WHERE fecha = ?").run(fecha);
  db.prepare("DELETE FROM fleet_visits WHERE fecha = ?").run(fecha);
  db.prepare(
    "INSERT INTO fleet_days (run_id, fecha, kpis_json, placas_json, parametros_json) VALUES (?, ?, ?, ?, ?)",
  ).run(runId, fecha, JSON.stringify(plain.kpis), JSON.stringify(plain.placas), JSON.stringify(fleet.parametros || {}));
  const tripStmt = db.prepare(`
    INSERT INTO fleet_trips (
      run_id, fecha, placa, vuelta, origen, origen_tipo, inicio, inicio_calidad,
      llegada_bsf_prev, salida_bsf, cierre_tipo, cierre, cierre_hora, salida_ultima_tienda,
      seg_en_bsf, seg_a_primera_tienda, seg_retorno, seg_vuelta, n_tiendas, con_tiendas, calidad, tiendas_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of plain.trips) {
    tripStmt.run(
      runId, fecha, t.placa, t.vuelta, t.origen, t.origen_tipo, t.inicio, t.inicio_calidad,
      t.llegada_bsf_prev, t.salida_bsf, t.cierre_tipo, t.cierre, t.cierre_hora, t.salida_ultima_tienda,
      t.seg_en_bsf, t.seg_a_primera_tienda, t.seg_retorno, t.seg_vuelta, t.n_tiendas, t.con_tiendas ? 1 : 0,
      t.calidad, JSON.stringify(t.tiendas),
    );
  }
  const visitStmt = db.prepare(`
    INSERT INTO fleet_visits (
      run_id, fecha, placa, vuelta, orden, n_tienda, zona_tipo, codigo, local, nombre, distrito, cd,
      llegada, salida, seg_permanencia, seg_acumulado, seg_traslado, calidad, marcas, paso, larga
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const v of plain.visits) {
    visitStmt.run(
      runId, fecha, v.placa, v.vuelta, v.orden, v.n_tienda, v.zona_tipo, v.codigo, v.local, v.nombre,
      v.distrito, v.cd, v.llegada, v.salida, v.seg_permanencia, v.seg_acumulado, v.seg_traslado,
      v.calidad, JSON.stringify(v.marcas || []), v.paso ? 1 : 0, v.larga ? 1 : 0,
    );
  }
}

/** Guarda el run y, si trae analítica de flota, sus vueltas y visitas (una transacción). */
export function saveRun(result) {
  const db = ensureDb();
  try {
    return inTransaction(db, () => {
      const info = db
        .prepare(`
          INSERT INTO runs (
            tipo, fecha, estado, archivos_encontrados, placas_ok, placas_error,
            consolidado, resumen_json, logs_json, started_at, finished_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          result.tipo,
          result.fecha,
          result.estado,
          result.archivos_encontrados,
          result.placas_ok,
          result.placas_error,
          result.consolidado,
          JSON.stringify(result.resumen || {}),
          JSON.stringify(result.logs || []),
          result.startedAt,
          result.finishedAt,
        );
      const runId = Number(info.lastInsertRowid);
      if (result.analitica_flota) saveFleet(db, runId, result.fecha, result.analitica_flota);
      return runId;
    });
  } finally {
    db.close();
  }
}

export function getLatestRun(tipo, fecha) {
  const db = ensureDb();
  const row = db
    .prepare(`SELECT * FROM runs WHERE tipo = ? AND fecha = ? ORDER BY id DESC LIMIT 1`)
    .get(tipo, fecha);
  db.close();
  return row ? hydrate(row) : null;
}

export function listRuns(limit = 50) {
  const db = ensureDb();
  const rows = db.prepare(`SELECT * FROM runs ORDER BY id DESC LIMIT ?`).all(limit);
  db.close();
  return rows.map(hydrate);
}

function hydrate(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    fecha: row.fecha,
    estado: row.estado,
    archivos_encontrados: row.archivos_encontrados,
    placas_ok: row.placas_ok,
    placas_error: row.placas_error,
    consolidado: row.consolidado,
    resumen: JSON.parse(row.resumen_json || "{}"),
    logs: JSON.parse(row.logs_json || "[]"),
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

// ── Lectura de la analítica de flota ──

export function getFleetDay(fecha) {
  const db = ensureDb();
  try {
    const day = db
      .prepare(`
        SELECT d.*, r.finished_at, r.estado, r.consolidado
        FROM fleet_days d JOIN runs r ON r.id = d.run_id
        WHERE d.fecha = ? ORDER BY d.id DESC LIMIT 1
      `)
      .get(fecha);
    if (!day) return null;
    const trips = db
      .prepare("SELECT * FROM fleet_trips WHERE fecha = ? ORDER BY placa, vuelta")
      .all(fecha)
      .map((t) => {
        const { tiendas_json, id, run_id, ...rest } = t;
        return { ...rest, con_tiendas: !!t.con_tiendas, tiendas: JSON.parse(tiendas_json || "[]") };
      });
    const visits = db
      .prepare("SELECT * FROM fleet_visits WHERE fecha = ? ORDER BY placa, orden")
      .all(fecha)
      .map((v) => {
        const { id, run_id, ...rest } = v;
        return { ...rest, marcas: JSON.parse(v.marcas || "[]"), paso: !!v.paso, larga: !!v.larga };
      });
    return {
      fecha,
      run_id: day.run_id,
      estado_run: day.estado,
      generado_en: day.finished_at,
      consolidado: day.consolidado ? path.basename(day.consolidado) : null,
      kpis: JSON.parse(day.kpis_json),
      placas: JSON.parse(day.placas_json),
      parametros: JSON.parse(day.parametros_json),
      trips,
      visits,
    };
  } finally {
    db.close();
  }
}

export function listFleetDates(limit = 60) {
  const db = ensureDb();
  try {
    return db
      .prepare("SELECT DISTINCT fecha FROM fleet_days ORDER BY fecha DESC LIMIT ?")
      .all(limit)
      .map((r) => r.fecha);
  } finally {
    db.close();
  }
}
