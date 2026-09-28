import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PROJECT_ROOT } from "./config.js";

const DATA_DIR = path.join(PROJECT_ROOT, "backend", "data");
const DB_PATH = path.join(DATA_DIR, "metadata.db");

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
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
  `);
  return db;
}

export function saveRun(result) {
  const db = ensureDb();
  const stmt = db.prepare(`
    INSERT INTO runs (
      tipo, fecha, estado, archivos_encontrados, placas_ok, placas_error,
      consolidado, resumen_json, logs_json, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
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
  db.close();
}

export function getLatestRun(tipo, fecha) {
  const db = ensureDb();
  const row = db
    .prepare(
      `SELECT * FROM runs WHERE tipo = ? AND fecha = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(tipo, fecha);
  db.close();
  return row ? hydrate(row) : null;
}

export function listRuns(limit = 50) {
  const db = ensureDb();
  const rows = db
    .prepare(`SELECT * FROM runs ORDER BY id DESC LIMIT ?`)
    .all(limit);
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
