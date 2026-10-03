#!/usr/bin/env node
// Genera config/tiendas_mass.csv desde GEOCERCAS.xlsx.
// Uso: node scripts/import-geocercas.js [ruta/GEOCERCAS.xlsx] [ruta/salida.csv]
// Se ejecuta a mano cuando cambien las geocercas de Onway.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const input = path.resolve(ROOT, process.argv[2] || "GEOCERCAS.xlsx");
const output = path.resolve(ROOT, process.argv[3] || "config/tiendas_mass.csv");

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.richText) return value.richText.map((p) => p.text).join("");
    if (value.text) return String(value.text);
    if (value.result !== undefined) return cellText(value.result);
    return "";
  }
  return String(value);
}

function clean(text) {
  return cellText(text).normalize("NFKC").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function csvField(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function findColumn(headers, ...names) {
  const wanted = names.map((n) => n.toUpperCase());
  const idx = headers.findIndex((h) => wanted.includes(h.toUpperCase()));
  return idx >= 0 ? idx + 1 : null;
}

async function main() {
  if (!fs.existsSync(input)) {
    console.error(`No existe ${input}`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(input);
  const ws = wb.worksheets[0];
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = clean(cell.value);
  });
  const col = {
    codigo: findColumn(headers, "CODIGO", "CÓDIGO"),
    local: findColumn(headers, "LOCAL"),
    cd: findColumn(headers, "CD MASS", "CD"),
    distrito: findColumn(headers, "DISTRITO"),
    geo: findColumn(headers, "GEOLOCALIZACIÓN", "GEOLOCALIZACION"),
    fecha: findColumn(headers, "FECHA GEOCERCA"),
  };
  for (const [k, v] of Object.entries(col)) {
    if (!v) throw new Error(`Falta la columna ${k} en ${path.basename(input)}`);
  }

  const out = [];
  const descartadas = [];
  const avisos = [];
  const seen = new Set();
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const get = (c) => row.getCell(c).value;
    const codigoRaw = clean(get(col.codigo));
    const local = clean(get(col.local));
    if (!codigoRaw && !local) continue; // fila vacía
    if (!/^\d+$/.test(codigoRaw)) {
      descartadas.push(`fila ${r}: "${local || "(sin nombre)"}" sin código`);
      continue;
    }
    const codigo = String(Number(codigoRaw));
    if (seen.has(codigo)) {
      avisos.push(`fila ${r}: código ${codigo} duplicado (se conserva el primero)`);
      continue;
    }
    seen.add(codigo);
    let cd = clean(get(col.cd)).toUpperCase();
    if (!cd || cd === "-") cd = "SIN CD";
    let distrito = clean(get(col.distrito)).toUpperCase();
    if (!distrito || distrito === "-") distrito = "SIN DISTRITO";
    const geo = clean(get(col.geo));
    const m = geo.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    let lat = "";
    let lon = "";
    if (m) {
      lat = Number(m[1]);
      lon = Number(m[2]);
      if (lat < -20 || lat > 0 || lon < -82 || lon > -68) {
        avisos.push(`fila ${r}: coordenadas fuera de rango (${geo}) para ${codigo}`);
      }
    } else {
      avisos.push(`fila ${r}: geolocalización inválida para ${codigo}: "${geo}"`);
    }
    const fechaVal = get(col.fecha);
    const fecha = fechaVal instanceof Date ? fechaVal.toISOString().slice(0, 10) : clean(fechaVal);
    out.push({ codigo, local, cd, distrito, lat, lon, fecha_geocerca: fecha });
  }

  out.sort((a, b) => Number(a.codigo) - Number(b.codigo));
  const header = "codigo,local,cd,distrito,lat,lon,fecha_geocerca";
  const lines = out.map((t) =>
    [t.codigo, t.local, t.cd, t.distrito, t.lat, t.lon, t.fecha_geocerca].map(csvField).join(","),
  );
  fs.writeFileSync(output, `${header}\n${lines.join("\n")}\n`, "utf8");

  console.log(`Tiendas exportadas: ${out.length} -> ${path.relative(ROOT, output)}`);
  const sinCd = out.filter((t) => t.cd === "SIN CD").map((t) => t.codigo);
  if (sinCd.length) console.log(`Sin CD: ${sinCd.join(", ")}`);
  const sinDistrito = out.filter((t) => t.distrito === "SIN DISTRITO").map((t) => t.codigo);
  if (sinDistrito.length) console.log(`Sin distrito: ${sinDistrito.join(", ")}`);
  for (const d of descartadas) console.warn(`[descartada] ${d}`);
  for (const a of avisos) console.warn(`[aviso] ${a}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
