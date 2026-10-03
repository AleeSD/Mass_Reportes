import { normalizePlate as normalizePlateBase } from "../helpers.js";

// Los tiempos del motor son "segundos ingenuos": la fecha/hora local de la
// alerta (America/Lima) contada como si fuera UTC. Así el cálculo no depende de
// la zona horaria de la máquina y las horas se muestran tal cual las ve Onway.

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizePlateKey(value) {
  return normalizePlateBase(value).replace(/-/g, "");
}

export function normalizePlateDisplay(value) {
  const cleaned = normalizePlateBase(value);
  if (!cleaned) return "";
  if (cleaned.includes("-")) return cleaned;
  if (cleaned.length >= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return cleaned;
}

export function wildcardToRegExp(pattern) {
  const escaped = String(pattern || "")
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function matchesAnyPattern(value, patterns = []) {
  const text = normalizeText(value);
  if (!text) return false;
  return patterns.some((pattern) => wildcardToRegExp(normalizeText(pattern)).test(text));
}

function dayTs(y, m, d) {
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return ms / 1000;
}

/** "27/09/2026" | "2026-09-27" | Date -> segundos ingenuos del inicio del día. */
export function parseFecha(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dayTs(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  const text = String(value ?? "").trim();
  let m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return dayTs(Number(m[3]), Number(m[2]), Number(m[1]));
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return dayTs(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

/** "05:12:07" | Date (hora Excel) | fracción de día -> segundos desde medianoche. */
export function parseHora(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const frac = value - Math.floor(value);
    return Math.round(frac * 86400) % 86400;
  }
  const m = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = Number(m[3] || 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

export function toTs(fecha, hora) {
  const day = parseFecha(fecha);
  const secs = parseHora(hora);
  if (day == null || secs == null) return null;
  return day + secs;
}

export function isoDateToTs(iso) {
  return parseFecha(iso);
}

export function tsToIsoDate(ts) {
  if (ts == null) return null;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** "2026-09-27 05:12:07" */
export function tsToText(ts) {
  if (ts == null) return null;
  return new Date(ts * 1000).toISOString().slice(0, 19).replace("T", " ");
}

export function tsToHms(ts) {
  if (ts == null) return "—";
  return new Date(ts * 1000).toISOString().slice(11, 19);
}

/** Hora del día como valor de hora real de Excel (fracción de día). */
export function tsToExcelTime(ts) {
  if (ts == null) return null;
  const secs = ((ts % 86400) + 86400) % 86400;
  return secs / 86400;
}

export function durationToExcel(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return null;
  return seconds / 86400;
}

export function secondsBetween(a, b) {
  if (a == null || b == null) return null;
  return b - a;
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.round(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function average(list) {
  const values = list.filter((v) => v != null && !Number.isNaN(v));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function sum(list) {
  const values = list.filter((v) => v != null && !Number.isNaN(v));
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0);
}
