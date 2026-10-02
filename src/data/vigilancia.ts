import { useEffect } from "react";
import { horaActual } from "@/lib/utils";
import { SISTEMA, cerrarIncidencia, crearIncidencia, escalarIncidencia, esPendiente, incidenciasStore } from "./incidencias";
import { notificar } from "./notificaciones";
import { registrarEntrada } from "./planeacion";
import { estadoDe } from "./surtido";
import { JEFE_ALMACEN, cancelarPedidoArea, confirmarRecepcionArea, surtidoStore, trabajoDe, trabajosDelDia } from "./surtido";

const grupo = (id: string) => `transito|${id}`;
const minutosDesde = (ms: number, ahora: number) => Math.floor((ahora - ms) / 6e4);

/**
 * Contenedores en tránsito que el área no confirma: a los 30 min pasa al supervisor y
 * a los 60 al jefe de almacén. Nunca se cierra solo; quien surte nunca confirma.
 */
export function vigilarTransito(ahora = Date.now()) {
  const estados = surtidoStore.get();
  for (const t of trabajosDelDia()) {
    const e = estados[t.id];
    if (e?.estado !== "transito" || !e.salidaMs) continue;
    const minutos = minutosDesde(e.salidaMs, ahora);
    const existente = incidenciasStore.get().find((i) => i.grupo === grupo(t.id));
    if (minutos >= 30 && !existente) {
      crearIncidencia({
        registradaPor: SISTEMA,
        recepcion: "surtido",
        oc: t.contenedor,
        proveedor: t.nombre,
        tipo: "sin_confirmar",
        semaforo: minutos >= 60 ? "rojo" : "amarillo",
        decisor: "supervisor",
        titulo: `${t.nombre} no ha confirmado la entrega`,
        detalle: `El contenedor ${t.contenedor} lleva ${minutos} min en tránsito. ${t.recibe} debe escanearlo al recibir.`,
        paso: "En tránsito",
        foto: false,
        grupo: grupo(t.id),
      });
    } else if (minutos >= 60 && existente && esPendiente(existente) && existente.semaforo !== "rojo") {
      escalarIncidencia(existente.id, `Pasaron 60 min sin confirmar: escaló a ${JEFE_ALMACEN}, jefe de almacén`);
    }
  }
}

export function useVigilanciaTransito() {
  useEffect(() => {
    vigilarTransito();
    const reloj = setInterval(() => vigilarTransito(), 15_000);
    return () => clearInterval(reloj);
  }, []);
}

/**
 * El área confirma la entrega desde su PDA. Una diferencia no ajusta inventario: abre una
 * discrepancia que resuelve el supervisor.
 */
export function confirmarEntregaArea(id: string, quien: string, causaDiferencia?: string) {
  const t = trabajoDe(id);
  const hora = horaActual();
  const actor = { nombre: quien, rol: t.nombre };
  const diferencia = causaDiferencia
    ? crearIncidencia({
        registradaPor: actor,
        recepcion: "surtido",
        oc: t.contenedor,
        proveedor: t.nombre,
        tipo: "diferencia_area",
        semaforo: "amarillo",
        decisor: "supervisor",
        titulo: `${t.nombre} recibió con diferencia`,
        detalle: `${causaDiferencia}. Confirmó ${quien} al escanear ${t.contenedor}. No ajusta inventario: lo resuelve el supervisor.`,
        paso: "Confirmar entrega",
        foto: false,
      })
    : null;
  confirmarRecepcionArea(id, hora, quien, diferencia && causaDiferencia ? { causa: causaDiferencia, incidencia: diferencia.id } : undefined);
  // Lo recibido entra a la existencia del área.
  registrarEntrada(t, estadoDe(id), quien);
  const inc = incidenciasStore.get().find((i) => i.grupo === grupo(id) && esPendiente(i));
  if (inc) cerrarIncidencia(inc.id, actor, `${quien} confirmó la entrega de ${t.contenedor}.`);
  notificar({
    para: "operador",
    incidencia: diferencia?.id ?? inc?.id ?? t.contenedor,
    titulo: `${t.nombre} confirmó ${t.contenedor}`,
    texto: diferencia ? `Recibió ${quien} con diferencia: ${causaDiferencia?.toLowerCase()}.` : `Recibió ${quien}, conforme. El stock sale de tránsito.`,
    tono: "decision",
  });
  return diferencia;
}

/** El área cancela un pedido que todavía no sale; el surtidor devuelve lo que ya tomó. */
export function cancelarDesdeArea(id: string, quien: string, motivo: string) {
  const t = trabajoDe(id);
  cancelarPedidoArea(id, { hora: horaActual(), quien, motivo });
  notificar({ para: "operador", incidencia: t.contenedor, titulo: `${t.nombre} canceló ${t.corto.split(" · ")[1] ?? t.id}`, texto: `${motivo}. Devuelve lo que ya tomaste a su posición.`, tono: "anulada" });
}

/** Para la demo: adelanta el reloj de un contenedor en tránsito. */
export function adelantarTransito(id: string, minutos: number) {
  surtidoStore.set((todos) => {
    const e = todos[id];
    if (!e?.salidaMs) return todos;
    return { ...todos, [id]: { ...e, salidaMs: e.salidaMs - minutos * 6e4 } };
  });
  vigilarTransito();
}
