import { normalizeText } from "./utils.js";

export const ZONE_TYPES = {
  BSF: "BSF",
  BASE_OS: "BASE_OS",
  TIENDA: "TIENDA",
  DESCONOCIDA: "DESCONOCIDA",
};

export const ZONE_LABELS = {
  BSF: "BSF",
  BASE_OS: "Base OS",
  TIENDA: "Tienda",
  DESCONOCIDA: "Zona desconocida",
};

/**
 * Construye un clasificador de zonas: texto de la columna "Zona" ->
 * { tipo, key, codigo, local, nombre, cd, distrito }.
 * Las tiendas se unen SIEMPRE por el código numérico (H2).
 */
export function createZoneResolver(zonesConfig = {}, catalog = []) {
  const zonas = zonesConfig.zonas || {};
  const bsfName = normalizeText(zonas.bsf?.nombre || "MASS BSF 1");
  const baseOsName = normalizeText(zonas.base_os?.nombre || "BASE-OSLOGISTICS");
  const tienda = zonas.tienda || {};
  const pattern = new RegExp(tienda.patron || "^(\\d+)[-\\s]");
  const group = Number(tienda.grupo_codigo || 1);

  const byCode = new Map();
  for (const row of catalog) {
    const codigo = String(row.codigo ?? "").trim();
    if (!/^\d+$/.test(codigo)) continue;
    byCode.set(String(Number(codigo)), {
      codigo: String(Number(codigo)),
      local: String(row.local ?? "").trim(),
      cd: String(row.cd ?? "").trim() || "SIN CD",
      distrito: String(row.distrito ?? "").trim() || "SIN DISTRITO",
      lat: row.lat === "" || row.lat == null ? null : Number(row.lat),
      lon: row.lon === "" || row.lon == null ? null : Number(row.lon),
    });
  }

  const cache = new Map();

  function resolve(rawZone) {
    const text = normalizeText(rawZone);
    if (!text) return null;
    if (cache.has(text)) return cache.get(text);
    let result;
    if (text === bsfName) {
      result = { tipo: ZONE_TYPES.BSF, key: "BSF", nombre: zonas.bsf?.etiqueta || "BSF", texto: text };
    } else if (text === baseOsName) {
      result = {
        tipo: ZONE_TYPES.BASE_OS,
        key: "BASE_OS",
        nombre: zonas.base_os?.etiqueta || "BASE OS",
        texto: text,
      };
    } else {
      const m = text.match(pattern);
      const codigo = m ? String(Number(m[group])) : null;
      const store = codigo ? byCode.get(codigo) : null;
      if (store) {
        result = {
          tipo: ZONE_TYPES.TIENDA,
          key: `T${store.codigo}`,
          codigo: store.codigo,
          local: store.local,
          nombre: `${store.codigo}-${store.local}`,
          cd: store.cd,
          distrito: store.distrito,
          texto: text,
        };
      } else {
        result = {
          tipo: ZONE_TYPES.DESCONOCIDA,
          key: `X:${text}`,
          codigo,
          local: null,
          nombre: String(rawZone).trim(),
          texto: text,
        };
      }
    }
    cache.set(text, result);
    return result;
  }

  return { resolve, catalogSize: byCode.size, storeByCode: (code) => byCode.get(String(Number(code))) || null };
}
