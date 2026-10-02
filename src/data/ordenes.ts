import { CLAVES } from "@/lib/almacenamiento";
import { crearStore } from "@/lib/store";
import type { Orden, Producto } from "./recepcion";

export type DecisionSaldo = "pendiente" | "abierto" | "cancelado";

interface EstadoOC {
  /** Bultos recibidos por código en esta maqueta (además de `recibidoPrevio`). */
  recibido: Record<string, number>;
  decisionSaldo: DecisionSaldo;
  fechaEstimada?: string;
}

export const ordenesStore = crearStore<Record<string, EstadoOC>>(CLAVES.ordenes, {});

export type EstadoOrden = "nueva" | "parcial" | "completa" | "cerrada_corta";

export function recibidoDe(orden: Orden, p: Producto, estados = ordenesStore.get()) {
  return (p.recibidoPrevio ?? 0) + (estados[orden.oc]?.recibido[p.codigo] ?? 0);
}

export function saldoDe(orden: Orden, p: Producto, estados = ordenesStore.get()) {
  return Math.max(0, p.cajas - recibidoDe(orden, p, estados));
}

export function resumenOrden(orden: Orden, estados = ordenesStore.get()) {
  const pedido = orden.productos.reduce((s, p) => s + p.cajas, 0);
  const recibido = orden.productos.reduce((s, p) => s + Math.min(p.cajas, recibidoDe(orden, p, estados)), 0);
  const saldo = pedido - recibido;
  const estadoOC = estados[orden.oc];
  const estado: EstadoOrden =
    estadoOC?.decisionSaldo === "cancelado"
      ? "cerrada_corta"
      : saldo === 0
        ? "completa"
        : recibido > 0
          ? "parcial"
          : "nueva";
  return { pedido, recibido, saldo, estado, decisionSaldo: estadoOC?.decisionSaldo, fechaEstimada: estadoOC?.fechaEstimada };
}

/** Suma lo recibido en una recepción. Si queda saldo, Compras debe decidir. */
export function registrarRecibido(oc: string, porCodigo: Record<string, number>, quedaSaldo: boolean) {
  ordenesStore.set((todos) => {
    const actual = todos[oc] ?? { recibido: {}, decisionSaldo: "pendiente" as DecisionSaldo };
    const recibido = { ...actual.recibido };
    for (const [codigo, n] of Object.entries(porCodigo)) recibido[codigo] = (recibido[codigo] ?? 0) + n;
    return { ...todos, [oc]: { ...actual, recibido, decisionSaldo: quedaSaldo ? "pendiente" : actual.decisionSaldo } };
  });
}

export function decidirSaldo(oc: string, decision: DecisionSaldo, fechaEstimada?: string) {
  ordenesStore.set((todos) => ({
    ...todos,
    [oc]: { ...(todos[oc] ?? { recibido: {} }), decisionSaldo: decision, fechaEstimada },
  }));
}

/** Deja la OC como al inicio de la demo. */
export function reiniciarOrden(oc: string) {
  ordenesStore.set((todos) => {
    const { [oc]: _, ...resto } = todos;
    return resto;
  });
}
