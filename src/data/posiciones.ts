import { CLAVES } from "@/lib/almacenamiento";
import { crearStore } from "@/lib/store";
import type { Zona } from "./recepcion";

// ── Temperatura de cada posición ────────────────────────────────

/** La temperatura se lee del código de la posición: PB-CF = frío, PB-CG = congelado, CUA = cuarentena. */
export function zonaDePosicion(posicion: string): Zona | "Cuarentena" {
  if (/^PB-CF/.test(posicion)) return "Refrigerado";
  if (/^PB-CG/.test(posicion)) return "Congelado";
  if (/^CUA/.test(posicion)) return "Cuarentena";
  return "Seco";
}

export function esCompatible(bulto: { zona: Zona; cuarentena: string | null }, posicion: string) {
  const zona = zonaDePosicion(posicion);
  if (bulto.cuarentena) return zona === "Cuarentena";
  return zona === bulto.zona;
}

/** Una posición de otra temperatura, para simular el error A3. */
export const posicionIncompatible = (zona: Zona) => (zona === "Seco" ? "PB-CF2" : "N2-A03");

// ── Posiciones bloqueadas y tareas de conteo ────────────────────

export interface Bloqueo {
  motivo: string;
  incidencia: string;
  desde: number;
}

export const bloqueosStore = crearStore<Record<string, Bloqueo>>(CLAVES.posiciones, {});

export interface TareaConteo {
  id: string;
  posicion: string;
  motivo: string;
  incidencia: string;
  articulo: string;
  sku: string;
  /** Lo que el sistema cree que hay (0 si la tenía por vacía). */
  sistema: number;
  estado: "pendiente" | "hecha";
  /** Persona a la que el supervisor asignó el conteo. */
  asignado?: string;
  creada?: number;
}

/** Personal de piso al que el supervisor puede asignar conteos. */
export const PERSONAL = ["Rodolfo Paz", "Yaritza Montenegro", "Abdiel Serrano"];

export function asignarTarea(id: string, persona: string) {
  tareasConteoStore.set((t) => t.map((x) => (x.id === id ? { ...x, asignado: persona } : x)));
}

export const tareasConteoStore = crearStore<TareaConteo[]>(CLAVES.tareasConteo, []);

/** Bloquea la posición hasta que alguien la cuente en la tarea Contar. */
export function bloquearParaConteo(posicion: string, motivo: string, incidencia: string, articulo: string, sku: string) {
  bloqueosStore.set((b) => ({ ...b, [posicion]: { motivo, incidencia, desde: Date.now() } }));
  tareasConteoStore.set((t) => [
    ...t,
    {
      id: `CNT-R${String(t.length + 1).padStart(3, "0")}`,
      posicion,
      motivo,
      incidencia,
      articulo,
      sku,
      sistema: 0,
      estado: "pendiente",
      creada: Date.now(),
    },
  ]);
}

/** Conteo para el siguiente turno sin bloquear la posición (diferencias al surtir). */
export function crearTareaConteo(posicion: string, motivo: string, incidencia: string, articulo: string, sku: string, sistema: number) {
  tareasConteoStore.set((t) => [
    ...t,
    {
      id: `CNT-R${String(t.length + 1).padStart(3, "0")}`,
      posicion,
      motivo,
      incidencia,
      articulo,
      sku,
      sistema,
      estado: "pendiente",
      creada: Date.now(),
    },
  ]);
}

export function liberarPosicion(posicion: string) {
  bloqueosStore.set((b) => {
    const { [posicion]: _, ...resto } = b;
    return resto;
  });
}

export function completarTareaConteo(id: string) {
  tareasConteoStore.set((t) => t.map((x) => (x.id === id ? { ...x, estado: "hecha" } : x)));
}

/** Posiciones de la misma familia, para proponer una alternativa libre. */
const FAMILIAS: string[][] = [
  ["PB-CF1", "PB-CF2", "PB-CF3"],
  ["PB-CG1", "PB-CG2"],
  ["N1-S01", "N1-S02", "N1-S03", "N1-S04", "N1-S05", "N1-S06"],
  ["N2-A01", "N2-A02", "N2-A03", "N2-A04", "N2-A05", "N2-A06", "N2-A07", "N2-A08"],
];

/** Posiciones llenas en el ejemplo, para mostrar la alternativa autorizada. */
export const LLENAS = new Set(["N2-A07"]);

export function alternativaDe(posicion: string, excluir: string[] = []): string {
  const bloqueadas = bloqueosStore.get();
  const familia = FAMILIAS.find((f) => f.includes(posicion)) ?? [];
  const libre = familia.find((p) => p !== posicion && !bloqueadas[p] && !LLENAS.has(p) && !excluir.includes(p));
  return libre ?? `${posicion}B`;
}

// ── Umbrales de antesala (A10), configurables por el supervisor ──

export interface Umbrales {
  seco: { alerta: number; escala: number };
  frio: { alerta: number; escala: number };
}

export const umbralesStore = crearStore<Umbrales>(CLAVES.umbrales, {
  seco: { alerta: 30, escala: 60 },
  frio: { alerta: 10, escala: 20 },
});

export const familiaTemperatura = (zona: Zona) => (zona === "Seco" ? "seco" : "frio");
