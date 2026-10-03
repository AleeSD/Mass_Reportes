import fs from "node:fs";
import path from "node:path";
import express from "express";
import {
  getReportType,
  loadConfig,
  enabledReportTypes,
  loadFleetConfig,
  loadStoresCatalog,
  loadZonesConfig,
} from "./config.js";
import { getFleetDay, getLatestRun, listFleetDates, listRuns, saveRun } from "./db.js";
import { listOriginalFiles } from "./engine/processDay.js";
import { discoverAvailableDates, resolveOutputPath, findExistingOutputPath } from "./engine/paths.js";
import { addDaysIso, parseToIso, todayIso } from "./engine/helpers.js";
import { bsfOccupancy, storeRanking } from "./engine/timeline/index.js";
import { LockedError, runningLocks } from "./locks.js";
import { runReport } from "./runner.js";

function sendDownload(res, filePath, downloadName) {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Archivo no encontrado" });
    return;
  }
  res.download(filePath, downloadName);
}

function sendProcessError(res, error) {
  if (error instanceof LockedError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: error.message });
}

function requireIso(req, res) {
  const iso = parseToIso(req.params.fecha);
  if (!iso) {
    res.status(400).json({ error: "Fecha inválida. Use YYYY-MM-DD o DD-MM-YYYY" });
    return null;
  }
  return iso;
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
      ayer: addDaysIso(hoy, -1),
      en_proceso: runningLocks(),
      dias_a_revisar: sched.dias_a_revisar || ["hoy"],
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
      const result = await runReport({ config, reportType, isoDate: iso });
      saveRun(result);
      const { analitica_flota, ...rest } = result;
      res.json({ ...rest, analitica_flota_generada: !!analitica_flota });
    } catch (error) {
      sendProcessError(res, error);
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
      const result = await runReport({ config, reportType, isoDate: iso });
      saveRun(result);
      const { analitica_flota, ...rest } = result;
      res.json({ ...rest, analitica_flota_generada: !!analitica_flota });
    } catch (error) {
      sendProcessError(res, error);
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

  // ── Analítica de flota (v1.4) ──

  router.get("/fleet/dates", (_req, res) => {
    const config = loadConfig();
    const hoy = todayIso(config.scheduler?.timezone || "America/Lima");
    res.json({ fechas: listFleetDates(), hoy, ayer: addDaysIso(hoy, -1) });
  });

  router.get("/fleet/config", (_req, res) => {
    const config = loadConfig();
    const zonas = loadZonesConfig();
    const catalogo = loadStoresCatalog(zonas.zonas?.tienda?.catalogo);
    const flota = loadFleetConfig();
    res.json({
      parametros: config.analitica_flota || {},
      flota,
      zonas,
      catalogo: {
        total: catalogo.length,
        cds: [...new Set(catalogo.map((t) => t.cd))].sort(),
        distritos: [...new Set(catalogo.map((t) => t.distrito))].sort(),
        tiendas: catalogo,
      },
    });
  });

  router.get("/fleet/timeline/:fecha", (req, res) => {
    const iso = requireIso(req, res);
    if (!iso) return;
    const day = getFleetDay(iso);
    if (!day) {
      res.json({ generado: false, fecha: iso });
      return;
    }
    const config = loadConfig();
    const p = config.analitica_flota || {};
    const calidad = day.placas.reduce(
      (acc, placa) => {
        const c = placa.calidad || {};
        if (c.sin_reporte) acc.placas_sin_reporte.push(placa.placa);
        acc.estancias_abiertas += c.estancias_abiertas || 0;
        acc.pasos += c.pasos || 0;
        acc.duplicados += c.duplicados || 0;
        acc.rebotes += c.rebotes || 0;
        acc.llegadas_repetidas += c.llegadas_repetidas || 0;
        acc.salidas_sin_llegada += c.salidas_sin_llegada || 0;
        acc.gps_antiguo += c.gps_antiguo || 0;
        if (c.inicio_estimado) acc.inicios_estimados.push(placa.placa);
        for (const z of c.zonas_desconocidas || []) {
          if (!acc.zonas_desconocidas.includes(z)) acc.zonas_desconocidas.push(z);
        }
        return acc;
      },
      {
        placas_sin_reporte: [],
        inicios_estimados: [],
        estancias_abiertas: 0,
        pasos: 0,
        duplicados: 0,
        rebotes: 0,
        llegadas_repetidas: 0,
        salidas_sin_llegada: 0,
        gps_antiguo: 0,
        zonas_desconocidas: [],
      },
    );
    res.json({
      generado: true,
      ...day,
      calidad,
      gantt: { desde_hora: p.gantt_hora_inicio ?? 4, hasta_hora: p.gantt_hora_fin ?? 20 },
    });
  });

  router.get("/fleet/timeline/:fecha/:placa", (req, res) => {
    const iso = requireIso(req, res);
    if (!iso) return;
    const day = getFleetDay(iso);
    if (!day) {
      res.json({ generado: false, fecha: iso });
      return;
    }
    const wanted = String(req.params.placa).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const norm = (p) => String(p).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const placa = day.placas.find((p) => norm(p.placa) === wanted);
    if (!placa) {
      res.status(404).json({ error: "Placa sin datos para esta fecha" });
      return;
    }
    const alertRun = getLatestRun("alertas", iso);
    const original = (alertRun?.resumen?.placas || []).find((p) => norm(p.placa) === wanted);
    res.json({
      generado: true,
      fecha: iso,
      placa,
      trips: day.trips.filter((t) => norm(t.placa) === wanted),
      visits: day.visits.filter((v) => norm(v.placa) === wanted),
      archivo_original: original?.archivo
        ? {
            archivo: original.archivo,
            url: `/api/download/original/alertas/${iso}/${encodeURIComponent(original.archivo)}`,
          }
        : null,
    });
  });

  router.get("/fleet/stores/:fecha", (req, res) => {
    const iso = requireIso(req, res);
    if (!iso) return;
    const day = getFleetDay(iso);
    if (!day) {
      res.json({ generado: false, fecha: iso });
      return;
    }
    res.json({ generado: true, fecha: iso, tiendas: storeRanking(day.visits, iso) });
  });

  router.get("/fleet/bsf-occupancy/:fecha", (req, res) => {
    const iso = requireIso(req, res);
    if (!iso) return;
    const day = getFleetDay(iso);
    if (!day) {
      res.json({ generado: false, fecha: iso });
      return;
    }
    const p = loadConfig().analitica_flota || {};
    const franjas = bsfOccupancy(day.visits, day.placas, iso, {
      desdeHora: p.gantt_hora_inicio ?? 4,
      hastaHora: p.gantt_hora_fin ?? 20,
      minutos: p.ocupacion_bsf_minutos ?? 15,
    });
    res.json({
      generado: true,
      fecha: iso,
      minutos: p.ocupacion_bsf_minutos ?? 15,
      maximo: franjas.reduce((m, f) => Math.max(m, f.vehiculos), 0),
      franjas,
    });
  });

  return router;
}
