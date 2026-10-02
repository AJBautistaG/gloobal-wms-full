/**
 * Reglas GS1 para las etiquetas de producto que Momi envía al proveedor (GS1-128):
 * (01) GTIN-14 · (10) lote · (17) caducidad AAMMDD · (400) orden de compra.
 */

/** Dígito verificador GS1: módulo 10, pesos 3-1 alternados desde el dígito más a la derecha. */
export function digitoGS1(base: string): number {
  const suma = [...base].reverse().reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10;
}

/** GTIN-14 de un producto de Momi: prefijo de la empresa + los dígitos del código + verificador. MOM-4412 → 07501234544122 */
export function gtinDe(codigo: string): string {
  const base = `075012345${codigo.replace(/\D/g, "").slice(-4).padStart(4, "0")}`;
  return `${base}${digitoGS1(base)}`;
}

const SIN_PESO = new Set(["de", "del", "la", "el", "los", "las", "para", "en", "y", "con", "in"]);

/** Iniciales del producto para el lote: "Mermelada de fresa" → "MF". */
export function iniciales(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((p) => /^[a-z]/i.test(p) && !SIN_PESO.has(p.toLowerCase()))
    .map((p) => p[0].toUpperCase())
    .join("");
}

/** 2026-09-26 → "260926" */
export const aammdd = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

/** Lote con el formato acordado: iniciales + fecha de la cita + letra de secuencia. "MF260926A" */
export const loteDe = (nombre: string, fechaCita: string, secuencia = "A") => `${iniciales(nombre)}${aammdd(fechaCita)}${secuencia}`;

/** FNC1 de Code 128 (así lo espera JsBarcode): cierra un dato de largo variable. */
const FNC1 = String.fromCharCode(207);

export interface DatosGS1 {
  gtin: string;
  lote: string;
  /** ISO o "" si no caduca. */
  caducidad: string;
  oc: string;
}

/** Texto legible bajo las barras: "(01)07501234544122(10)MF260926A(17)270321(400)OC-7131" */
export function textoGS1(d: DatosGS1): string {
  return `(01)${d.gtin}(10)${d.lote}${d.caducidad ? `(17)${aammdd(d.caducidad)}` : ""}(400)${d.oc}`;
}

/** Contenido codificado: los identificadores sin paréntesis, con FNC1 después del lote. */
export function codigoGS1(d: DatosGS1): string {
  return `01${d.gtin}10${d.lote}${FNC1}${d.caducidad ? `17${aammdd(d.caducidad)}` : ""}400${d.oc}`;
}
