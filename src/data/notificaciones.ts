import { CLAVES } from "@/lib/almacenamiento";
import { crearStore } from "@/lib/store";
import { horaActual } from "@/lib/utils";

/**
 * A quién va dirigida: el supervisor (y Calidad o Compras cuando deciden ellos) recibe
 * lo nuevo; el operador de piso recibe las decisiones sobre lo que reportó.
 */
export type Destinatario = "supervisor" | "calidad" | "compras" | "operador";

export interface Notificacion {
  id: string;
  para: Destinatario;
  incidencia: string;
  titulo: string;
  texto: string;
  tono: "nueva" | "decision" | "anulada";
  hora: string;
  ts: number;
  leida: boolean;
}

export const notificacionesStore = crearStore<Notificacion[]>(CLAVES.notificaciones, []);

export function notificar(n: Omit<Notificacion, "id" | "hora" | "ts" | "leida">) {
  const ts = Date.now();
  notificacionesStore.set((todas) => [
    ...todas,
    { ...n, id: `NOT-${ts}-${Math.floor(Math.random() * 1000)}`, hora: horaActual(), ts, leida: false },
  ]);
}

export function marcarLeidas(para: Destinatario[]) {
  notificacionesStore.set((todas) => todas.map((n) => (para.includes(n.para) && !n.leida ? { ...n, leida: true } : n)));
}
