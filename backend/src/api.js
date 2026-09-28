import fs from "node:fs";
import path from "node:path";
import express from "express";
import { getReportType, loadConfig, enabledReportTypes } from "./config.js";
import { getLatestRun, listRuns, saveRun } from "./db.js";
import { processCompositeDay, processDay, listOriginalFiles } from "./engine/processDay.js";
import { discoverAvailableDates, resolveOutputPath, findExistingOutputPath } from "./engine/paths.js";
import { parseToIso, todayIso } from "./engine/helpers.js";

function sendDownload(res, filePath, downloadName) {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Archivo no encontrado" });
    return;
  }
  res.download(filePath, downloadName);
}

function uniqueSortedStrings(list) {
  return [...new Set(list)].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export function createApiRouter() {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/scheduler/status", (_req, res) => {
    const config = loadConfig();
    const sched = config.scheduler || {};
    const hoy = todayIso(sched.timezone || "America/Lima");
    const tiposActivos = enabledReportTypes(config);
    const ultimasEjecuciones = tiposActivos.map((rt) => ({
      tipo: rt.key,
      key_publico: rt.key_publico || rt.key,
      etiqueta: rt.etiqueta || rt.key,
      ultimo_run: getLatestRun(rt.key, hoy),
    }));
    res.json({
      habilitado: sched.habilitado !== false,
      cron: sched.cron || "*/10 * * * *",
      timezone: sched.timezone || "America/Lima",
      hoy,
      tipos_activos: tiposActivos.map((t) => ({
        key: t.key,
        key_publico: t.key_publico || t.key,
        etiqueta: t.etiqueta,
        es_compuesto: !!t.es_compuesto,
      })),
      ultimas_ejecuciones: ultimasEjecuciones.map((u) => ({
        tipo: u.tipo,
        key_publico: u.key_publico,
        etiqueta: u.etiqueta,
        estado: u.ultimo_run?.estado || "sin ejecución hoy",
        finished_at: u.ultimo_run?.finished_at || null,
        archivos: u.ultimo_run?.archivos_encontrados ?? 0,
        placas_ok: u.ultimo_run?.placas_ok ?? 0,
      })),
    });
  });

  router.get("/report-types", (_req, res) => {
    const config = loadConfig();
    res.json(
      enabledReportTypes(config).map((rt) => ({
        key: rt.key_publico || rt.key,
        key_interno: rt.key,
        etiqueta: rt.etiqueta || rt.key,
        habilitado: rt.habilitado !== false,
        es_compuesto: !!rt.es_compuesto,
        tipos_incluidos: Array.isArray(rt.tipos_incluidos) ? rt.tipos_incluidos : undefined,
      })),
    );
  });

  router.get("/days", (req, res) => {
    const config = loadConfig();
    const tipo = req.query.tipo || "alertas";
    const reportType = getReportType(config, tipo);
    let fechas = [];
    if (reportType?.es_compuesto && Array.isArray(reportType.tipos_incluidos)) {
      const sets = reportType.tipos_incluidos.map((baseKey) => {
        const baseType = getReportType(config, baseKey);
        return discoverAvailableDates(config, baseType);
      });
      fechas = uniqueSortedStrings(sets.flat());
    } else {
      fechas = discoverAvailableDates(config, reportType);
    }
    res.json({
      tipo,
      es_compuesto: !!reportType?.es_compuesto,
      fechas,
      hoy: todayIso(config.scheduler?.timezone || "America/Lima"),
    });
  });

  router.get("/runs", (req, res) => {
    const limit = Number(req.query.limit || 40);
    res.json(listRuns(limit));
  });

  router.get("/summary/:tipo/:fecha", (req, res) => {
    const iso = parseToIso(req.params.fecha);
    if (!iso) {
      res.status(400).json({ error: "Fecha inválida. Use YYYY-MM-DD o DD-MM-YYYY" });
      return;
    }
    const config = loadConfig();
    const reportType = getReportType(config, req.params.tipo);
    const run = getLatestRun(reportType.key, iso);
    const originals = reportType?.es_compuesto ? [] : listOriginalFiles(config, iso, reportType);
    const existingPath = findExistingOutputPath(config, iso, reportType);
    res.json({
      fecha: iso,
      tipo: reportType.key,
      key_publico: reportType.key_publico || reportType.key,
      etiqueta: reportType.etiqueta || reportType.key,
      es_compuesto: !!reportType?.es_compuesto,
      run,
      archivos_entrada: originals,
      consolidado_existe: !!existingPath,
      consolidado: existingPath ? path.basename(existingPath) : null,
      pendientes: originals.length === 0 && !reportType?.es_compuesto,
    });
  });

  router.post("/process/:tipo/:fecha", async (req, res) => {
    const iso = parseToIso(req.params.fecha);
    if (!iso) {
      res.status(400).json({ error: "Fecha inválida" });
      return;
    }
    try {
      const config = loadConfig();
      const reportType = getReportType(config, req.params.tipo);
      if (reportType.habilitado === false) {
        res.status(400).json({ error: "Este tipo de reporte aún no está habilitado" });
        return;
      }
      const result = reportType?.es_compuesto
        ? await processCompositeDay({ config, compositeReport: reportType, isoDate: iso })
        : await processDay({ config, reportType, isoDate: iso });
      saveRun(result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/process-today", async (req, res) => {
    const config = loadConfig();
    const tipo = req.body?.tipo || "alertas";
    const iso = todayIso(config.scheduler?.timezone || "America/Lima");
    try {
      const reportType = getReportType(config, tipo);
      if (reportType.habilitado === false) {
        res.status(400).json({ error: "Este tipo de reporte aún no está habilitado" });
        return;
      }
      const result = reportType?.es_compuesto
        ? await processCompositeDay({ config, compositeReport: reportType, isoDate: iso })
        : await processDay({ config, reportType, isoDate: iso });
      saveRun(result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/download/consolidated/:tipo/:fecha", (req, res) => {
    const iso = parseToIso(req.params.fecha);
    if (!iso) {
      res.status(400).json({ error: "Fecha inválida" });
      return;
    }
    const config = loadConfig();
    const reportType = getReportType(config, req.params.tipo);
    const existingPath = findExistingOutputPath(config, iso, reportType);
    if (existingPath) {
      sendDownload(res, existingPath, path.basename(existingPath));
    } else {
      // Fallback: try the write-path in case file is pending write
      const writePath = resolveOutputPath(config, iso, reportType);
      sendDownload(res, writePath, path.basename(writePath));
    }
  });

  router.get("/download/original/:tipo/:fecha/:archivo", (req, res) => {
    const iso = parseToIso(req.params.fecha);
    if (!iso) {
      res.status(400).json({ error: "Fecha inválida" });
      return;
    }
    const requested = path.basename(req.params.archivo);
    const config = loadConfig();
    const reportType = getReportType(config, req.params.tipo);
    if (reportType?.es_compuesto) {
      res.status(400).json({ error: "Reportes compuestos no tienen archivos originales directos" });
      return;
    }
    const match = listOriginalFiles(config, iso, reportType).find(
      (f) => f.archivo === requested,
    );
    if (!match) {
      res.status(404).json({ error: "Archivo original no encontrado" });
      return;
    }
    sendDownload(res, match.ruta, match.archivo);
  });

  return router;
}
