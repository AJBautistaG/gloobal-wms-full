import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...entradas: ClassValue[]) {
  return twMerge(clsx(entradas));
}

/** Plural simple en español: "saco" → "sacos", "caja" → "cajas", "bidón" → "bidones". */
export function pluralizar(palabra: string, cantidad: number): string {
  if (cantidad === 1 || !palabra) return palabra;
  const [primera, ...resto] = palabra.split(" ");
  const cola = resto.length ? ` ${resto.join(" ")}` : "";
  if (/^(kg|g|l|lb|ml|oz)$/i.test(primera)) return palabra;
  const mayusculas = primera === primera.toUpperCase() && /[A-Z]/.test(primera);
  const base = primera.toLowerCase();
  const plural = /ón$/.test(base)
    ? base.replace(/ón$/, "ones")
    : /[aeiouáéó]$/.test(base)
      ? `${base}s`
      : /z$/.test(base)
        ? base.replace(/z$/, "ces")
        : `${base}es`;
  return (mayusculas ? plural.toUpperCase() : plural) + cola;
}

/** "3 cajas", "1 bulto". Acepta un plural explícito cuando la regla no alcanza. */
export function cuenta(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? pluralizar(singular, n))}`;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** 2026-10-02 → "2 de octubre" */
export function fechaLarga(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/** 2026-10-02 → "2 oct" */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}

/** 2026-10-02 → "2 oct 2026" */
export function fechaConAnio(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)} ${a}`;
}

/** 2026-10-02 → "02/10/2026" */
export function fechaNumerica(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** 2026-10-02 → "02/10/26" */
export function fechaEtiqueta(iso: string | null | undefined): string {
  if (!iso) return "sin caducidad";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 864e5);
}

/** "8:34" + 27 min → "9:01" */
export function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function horaActual(): string {
  return new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false });
}
