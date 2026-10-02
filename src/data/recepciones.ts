import { CLAVES } from "@/lib/almacenamiento";
import { crearStore } from "@/lib/store";

/** Bitácora de recepciones, para el monitoreo del supervisor. */
export interface RegistroRecepcion {
  id: string;
  oc: string;
  proveedor: string;
  anden: string;
  inicio: number;
  estado: "en_curso" | "cerrada" | "cancelada";
  fin?: number;
  bultos?: number;
  motivo?: string;
}

export const recepcionesStore = crearStore<RegistroRecepcion[]>(CLAVES.recepciones, []);

export function iniciarRecepcion(r: Omit<RegistroRecepcion, "estado" | "inicio">) {
  recepcionesStore.set((todas) => [...todas, { ...r, estado: "en_curso", inicio: Date.now() }]);
}

export function terminarRecepcion(id: string, cambios: Pick<RegistroRecepcion, "estado"> & Partial<RegistroRecepcion>) {
  recepcionesStore.set((todas) => todas.map((r) => (r.id === id ? { ...r, ...cambios, fin: Date.now() } : r)));
}

/** ¿El camión de esta recepción sigue en el andén? Define si un rechazo se devuelve en él. */
export const camionEnAnden = (recepcion: string) =>
  recepcionesStore.get().some((r) => r.id === recepcion && r.estado === "en_curso");
