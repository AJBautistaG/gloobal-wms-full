/** Dígito verificador GS1 (módulo 10, pesos 3-1 desde la izquierda en 17 dígitos). */
function digitoVerificador(base: string): number {
  const suma = base.split("").reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10;
}

/** SSCC de 18 dígitos para el bulto número `indice` de una orden de compra. */
export function generarSSCC(indice: number, oc = "OC-7142"): string {
  const serie = Number(oc.replace(/\D/g, "")) * 1000 + indice;
  const base = `37501234${String(serie).padStart(9, "0")}`;
  return `${base}${digitoVerificador(base)}`;
}

/** "(00) 3 7501234 007142000 5" */
export function ssccLegible(sscc: string): string {
  return `(00) ${sscc[0]} ${sscc.slice(1, 8)} ${sscc.slice(8, 17)} ${sscc[17]}`;
}
