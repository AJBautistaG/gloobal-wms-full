import { useEffect, useState } from "react";

/**
 * Fecha del día. Los datos de ejemplo se escribieron para el 29 de septiembre de 2026; `rel` los corre
 * a la fecha real para que las citas, los vencimientos y la vida útil sigan contando igual cualquier día.
 */

const BASE = "2026-09-29";
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const aISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Fecha en la hora de Panamá: medianoche local, sin que la zona horaria la mueva de día. */
const desdeISO = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
};

/** Hoy, en formato 2026-09-30. Se fija al cargar para que los datos no cambien a media demo. */
export const HOY = aISO(new Date());

const DESFASE = Math.round((desdeISO(HOY).getTime() - desdeISO(BASE).getTime()) / 864e5);

/** Corre una fecha de los datos de ejemplo a la fecha real. "" (sin caducidad) queda igual. */
export function rel(iso: string): string;
export function rel(iso: string | null): string | null;
export function rel(iso: string | null) {
  if (!iso) return iso;
  const d = desdeISO(iso);
  d.setDate(d.getDate() + DESFASE);
  return aISO(d);
}

/** 2026-09-30 + (-4) → "2026-09-26" */
export function sumarDias(iso: string, dias: number) {
  const d = desdeISO(iso);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

/** 2026-10-12 → "12/oct" (como lo muestra el surtido). */
export const diaMes = (iso: string) => {
  const d = desdeISO(iso);
  return `${d.getDate()}/${MESES_CORTOS[d.getMonth()]}`;
};

/** "300926": día, mes y año, para los folios del día. */
export const FOLIO_DIA = HOY.slice(8, 10) + HOY.slice(5, 7) + HOY.slice(2, 4);

/** "Miércoles 30 de septiembre" */
export function textoDelDia(d = new Date()) {
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** Fecha que cambia sola al pasar la medianoche. */
export function useFechaHoy() {
  const [texto, setTexto] = useState(() => textoDelDia());
  useEffect(() => {
    const id = setInterval(() => setTexto(textoDelDia()), 30_000);
    return () => clearInterval(id);
  }, []);
  return texto;
}

export function FechaHoy() {
  return useFechaHoy();
}
