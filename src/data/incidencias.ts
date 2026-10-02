import { CLAVES } from "@/lib/almacenamiento";
import { crearStore } from "@/lib/store";
import { rel } from "@/lib/fecha";
import { fechaLarga, horaActual } from "@/lib/utils";
import { actualizarBultos, agregarBultos, aplicarDecisionDano, quitarBultos, type Bulto } from "./bultos";
import { notificar } from "./notificaciones";
import { liberarPosicion } from "./posiciones";
import { camionEnAnden as camionSigueEnAnden } from "./recepciones";
import { actualizarTrabajo, type Apartada } from "./surtido";
import { decidirSaldo, registrarRecibido } from "./ordenes";
import type { DestinoDano } from "./recepcion";

export type TipoIncidencia =
  | "dano"
  | "no_en_oc"
  | "codigo_desconocido"
  | "otra_presentacion"
  | "linea_rechazada"
  | "excedente"
  | "saldo"
  | "otro"
  // Acomodar
  | "posicion_ocupada"
  | "inventario_inesperado"
  | "incompatible"
  | "fefo"
  | "abandonado"
  | "no_localizado"
  // Surtir
  | "fefo_surtido"
  | "faltante_surtido"
  | "posicion_vacia"
  | "vencido"
  | "sustituto"
  | "retraso_surtido"
  | "sin_confirmar"
  | "diferencia_area";

export type Semaforo = "verde" | "amarillo" | "rojo";
export type Decisor = "calidad" | "compras" | "supervisor" | "maestros" | "area";
export type Respuesta =
  | "autorizar"
  | "rechazar"
  | "investigar"
  | "liberar"
  | "mantener"
  | "mantener_saldo"
  | "cancelar_saldo"
  | "liberar_posicion"
  | "enterado"
  | "reasignar"
  | "a_calidad"
  | "aparecio"
  | "perdido"
  | "aceptar";

export type EstadoIncidencia =
  | "pendiente"
  | "investigando"
  | "registrada"
  | "autorizada"
  | "rechazada"
  | "liberada"
  | "cuarentena"
  | "saldo_abierto"
  | "saldo_cancelado"
  | "resuelta"
  | "anulada";

export interface Incidencia {
  id: string;
  tipo: TipoIncidencia;
  semaforo: Semaforo;
  decisor: Decisor;
  estado: EstadoIncidencia;
  titulo: string;
  detalle: string;
  recepcion: string;
  oc: string;
  proveedor: string;
  producto?: string;
  codigo?: string;
  paso: string;
  usuario: string;
  hora: string;
  cantidad?: number;
  unidad?: string;
  destino?: "resguardo" | DestinoDano | "devolucion";
  foto: boolean;
  comentario?: string;
  resolucion?: string;
  /** Bultos en resguardo que pasan a Acomodar si se autoriza. */
  bultosPendientes?: Bulto[];
  /** Recibido que se suma a la OC si se autoriza (otra presentación). */
  recibidoAlAutorizar?: Record<string, number>;
  /** Bultos afectados (Acomodar). */
  ssccs?: string[];
  /** Posición involucrada (Acomodar). */
  posicion?: string;
  /** Llave para no duplicar alertas automáticas (A10). */
  grupo?: string;
  creada: number;
  /** Bitácora completa: quién hizo qué y cuándo. */
  eventos?: Evento[];
  /** Quién la está atendiendo en piso. */
  atiende?: string;
  resueltaEn?: number;
}

export type AccionEvento = "registrada" | "notificada" | "vista" | "en_atencion" | "decision" | "efecto" | "anulada";

export interface Evento {
  ts: number;
  hora: string;
  accion: AccionEvento;
  quien: string;
  rol: string;
  texto: string;
}

/** Quién está actuando: el supervisor de turno o un rol simulado (Calidad, Compras). */
export interface Actor {
  nombre: string;
  rol: string;
}

export const SUPERVISOR: Actor = { nombre: "Rosa Villalaz", rol: "Supervisor de almacén" };
export const ACTOR_DE: Record<Decisor, Actor> = {
  supervisor: SUPERVISOR,
  calidad: { nombre: "Marisol Quintero", rol: "Calidad" },
  compras: { nombre: "Ana Batista", rol: "Compras" },
  maestros: { nombre: "Maestros de datos", rol: "Maestros" },
  area: { nombre: "Encargada del área", rol: "Área de producción" },
};

const evento = (accion: AccionEvento, actor: Actor, texto: string): Evento => ({
  ts: Date.now(),
  hora: horaActual(),
  accion,
  quien: actor.nombre,
  rol: actor.rol,
  texto,
});

function actualizar(id: string, cambio: (i: Incidencia) => Partial<Incidencia>) {
  incidenciasStore.set((todas) => todas.map((x) => (x.id === id ? { ...x, ...cambio(x) } : x)));
}

function registrarEvento(id: string, e: Evento, cambios: Partial<Incidencia> = {}) {
  actualizar(id, (x) => ({ ...cambios, eventos: [...(x.eventos ?? []), e] }));
}

/** El proceso de piso al que pertenece (para filtrar y medir). */
export const procesoDe = (i: Incidencia) =>
  i.recepcion === "acomodo" ? "Acomodo" : i.recepcion === "surtido" ? "Surtido" : "Recibo";

export const incidenciasStore = crearStore<Incidencia[]>(CLAVES.incidencias, []);

export const DECISOR: Record<Decisor, string> = {
  calidad: "Calidad",
  compras: "Compras",
  supervisor: "Supervisor",
  maestros: "Maestros de datos",
  area: "El área",
};

export const SEMAFORO: Record<Semaforo, { texto: string; clase: string; punto: string }> = {
  verde: { texto: "Verde · lo resuelve el operador", clase: "bg-exito/15 text-exito", punto: "bg-exito" },
  amarillo: { texto: "Amarillo · continúa y queda registrado", clase: "bg-alerta/15 text-alerta", punto: "bg-alerta" },
  rojo: { texto: "Rojo · requiere decisión", clase: "bg-critico/15 text-critico", punto: "bg-critico" },
};

export const esPendiente = (i: Incidencia) => i.estado === "pendiente" || i.estado === "investigando";

/** Las respuestas que puede dar quien decide, para el simulador. */
export function respuestasPosibles(i: Incidencia): { id: Respuesta; texto: string; tono: "exito" | "critico" | "neutro" }[] {
  if (!esPendiente(i)) return [];
  if (i.tipo === "dano") {
    return [
      { id: "liberar", texto: "Liberar", tono: "exito" },
      { id: "mantener", texto: "Mantener cuarentena", tono: "neutro" },
      { id: "rechazar", texto: "Rechazar", tono: "critico" },
    ];
  }
  if (i.tipo === "saldo") {
    return [
      { id: "mantener_saldo", texto: "Mantener saldo abierto", tono: "exito" },
      { id: "cancelar_saldo", texto: "Cancelar saldo", tono: "critico" },
    ];
  }
  // A1 y A9 se resuelven con el conteo en la tarea Contar; el supervisor solo puede adelantarse.
  if (i.tipo === "posicion_ocupada" || i.tipo === "inventario_inesperado") {
    return [
      { id: "liberar_posicion", texto: "Liberar sin contar", tono: "neutro" },
      { id: "investigar", texto: "Investigar", tono: "neutro" },
    ];
  }
  if (i.tipo === "incompatible" || i.tipo === "fefo") {
    return [
      { id: "autorizar", texto: "Autorizar", tono: "exito" },
      { id: "rechazar", texto: "Rechazar", tono: "critico" },
      { id: "investigar", texto: "Investigar", tono: "neutro" },
    ];
  }
  if (i.tipo === "abandonado") {
    return [
      { id: "enterado", texto: "Enterado", tono: "neutro" },
      { id: "reasignar", texto: "Reasignar", tono: "exito" },
      { id: "a_calidad", texto: "Mandar a Calidad", tono: "critico" },
    ];
  }
  if (i.tipo === "no_localizado") {
    return [
      { id: "aparecio", texto: "Apareció", tono: "exito" },
      { id: "investigar", texto: "Investigar", tono: "neutro" },
      { id: "perdido", texto: "Dar por perdido", tono: "critico" },
    ];
  }
  if (i.tipo === "sustituto") {
    return [
      { id: "aceptar", texto: "Aceptar sustituto", tono: "exito" },
      { id: "rechazar", texto: "Rechazar", tono: "critico" },
    ];
  }
  if (i.tipo === "diferencia_area") {
    return [
      { id: "autorizar", texto: "Reponer en el siguiente envío", tono: "exito" },
      { id: "investigar", texto: "Investigar con el surtidor", tono: "neutro" },
      { id: "enterado", texto: "Cerrar sin reponer", tono: "critico" },
    ];
  }
  if (i.tipo === "retraso_surtido" || i.tipo === "sin_confirmar") {
    return [
      { id: "enterado", texto: "Enterado", tono: "neutro" },
      { id: "reasignar", texto: "Reasignar", tono: "exito" },
    ];
  }
  return [
    { id: "autorizar", texto: "Autorizar", tono: "exito" },
    { id: "rechazar", texto: "Rechazar", tono: "critico" },
    { id: "investigar", texto: "Investigar", tono: "neutro" },
  ];
}

let consecutivo = 0;
function nuevoId() {
  const max = incidenciasStore.get().reduce((m, i) => Math.max(m, Number(i.id.replace(/\D/g, "")) || 0), 11);
  consecutivo = Math.max(consecutivo, max) + 1;
  return `INC-${String(consecutivo).padStart(4, "0")}`;
}

type NuevaIncidencia = Omit<Incidencia, "id" | "hora" | "creada" | "estado" | "usuario" | "eventos"> & {
  estado?: EstadoIncidencia;
  /** "Sistema" para las alertas automáticas; por defecto, el operador del PDA. */
  registradaPor?: Actor;
};

export const OPERADOR: Actor = { nombre: "Rodolfo Paz", rol: "Operador de piso" };
export const SISTEMA: Actor = { nombre: "Sistema", rol: "Alerta automática" };

export const ESTADO_TEXTO: Record<EstadoIncidencia, { texto: string; clase: string }> = {
  pendiente: { texto: "Esperando decisión", clase: "bg-alerta/15 text-alerta" },
  investigando: { texto: "En investigación", clase: "bg-alerta/15 text-alerta" },
  registrada: { texto: "Registrada", clase: "bg-muted text-muted-foreground" },
  autorizada: { texto: "Autorizada", clase: "bg-exito/15 text-exito" },
  rechazada: { texto: "Rechazada", clase: "bg-critico/15 text-critico" },
  liberada: { texto: "Liberada", clase: "bg-exito/15 text-exito" },
  cuarentena: { texto: "Sigue en cuarentena", clase: "bg-muted text-muted-foreground" },
  saldo_abierto: { texto: "Saldo abierto", clase: "bg-exito/15 text-exito" },
  saldo_cancelado: { texto: "Saldo cancelado", clase: "bg-critico/15 text-critico" },
  resuelta: { texto: "Resuelta", clase: "bg-exito/15 text-exito" },
  anulada: { texto: "Anulada", clase: "bg-muted text-muted-foreground line-through" },
};
export const ROL_DECISOR: Record<Decisor, "supervisor" | "calidad" | "compras"> = {
  supervisor: "supervisor",
  calidad: "calidad",
  compras: "compras",
  maestros: "supervisor",
  area: "supervisor",
};

export function crearIncidencia({ registradaPor = OPERADOR, ...datos }: NuevaIncidencia): Incidencia {
  const id = nuevoId();
  const estado = datos.estado ?? "pendiente";
  const pendiente = estado === "pendiente";
  const avisados = [DECISOR[datos.decisor], ...(datos.decisor !== "supervisor" ? ["Supervisor (copia)"] : [])].join(" y ");
  const incidencia: Incidencia = {
    ...datos,
    id,
    estado,
    usuario: registradaPor.nombre,
    hora: horaActual(),
    creada: Date.now(),
    bultosPendientes: datos.bultosPendientes?.map((b) => ({ ...b, incidencia: id })),
    eventos: [
      evento("registrada", registradaPor, `${datos.titulo} · en ${datos.paso}${datos.foto ? " · con foto" : ""}`),
      evento("notificada", SISTEMA, pendiente ? `Notificada a ${avisados} para decidir` : `Informativa: notificada a ${avisados}`),
    ],
    resueltaEn: pendiente ? undefined : Date.now(),
  };
  incidenciasStore.set((todas) => [...todas, incidencia]);
  const aviso = { incidencia: id, titulo: `${id} · ${datos.titulo}`, texto: `${datos.proveedor} · ${datos.oc}${datos.producto ? ` · ${datos.producto}` : ""}`, tono: "nueva" as const };
  notificar({ ...aviso, para: "supervisor" });
  if (datos.decisor === "calidad" || datos.decisor === "compras") notificar({ ...aviso, para: datos.decisor });
  return incidencia;
}

/** V5: el supervisor asignó el conteo de revisión a alguien de piso. */
export function registrarAsignacion(id: string, persona: string, posicion: string, actor: Actor = SUPERVISOR) {
  registrarEvento(id, evento("en_atencion", actor, `Asignó el conteo de ${posicion} a ${persona}`));
  notificar({
    para: "operador",
    incidencia: id,
    titulo: `Conteo de ${posicion} asignado a ${persona}`,
    texto: "Aparece primero en la tarea Contar.",
    tono: "decision",
  });
}

/** El supervisor abrió el detalle: queda como "vista" (una vez por persona). */
export function marcarVista(id: string, actor: Actor = SUPERVISOR) {
  const i = incidenciasStore.get().find((x) => x.id === id);
  if (!i || i.eventos?.some((e) => e.accion === "vista" && e.quien === actor.nombre)) return;
  registrarEvento(id, evento("vista", actor, "Abrió el detalle"));
}

/** "Voy a verlo": el supervisor va a piso; el operador recibe el aviso. */
export function marcarEnAtencion(id: string, actor: Actor = SUPERVISOR) {
  const i = incidenciasStore.get().find((x) => x.id === id);
  if (!i || i.atiende) return;
  registrarEvento(id, evento("en_atencion", actor, "Va a piso a revisarlo"), { atiende: actor.nombre });
  notificar({ para: "operador", incidencia: id, titulo: `${id} · ${actor.nombre} va a revisarlo`, texto: i.titulo, tono: "decision" });
}

const devolucion = (camionEnAnden: boolean) =>
  camionEnAnden
    ? "Se devuelve en el mismo camión, que sigue en el andén."
    : `El camión ya salió: se creó la tarea de devolución al proveedor DEV-${Math.floor(3000 + Math.random() * 900)}.`;

/**
 * Registra la decisión de quien decide (con su motivo) y aplica su efecto en la maqueta:
 * mover bultos a Acomodar, devolverlos o cambiar el estado de la OC. Queda en la bitácora
 * y se notifica al operador de piso.
 */
export function responder(id: string, respuesta: Respuesta, { actor, motivo }: { actor: Actor; motivo?: string }) {
  const i = incidenciasStore.get().find((x) => x.id === id);
  if (!i) return;
  const camionEnAnden = camionSigueEnAnden(i.recepcion);
  const textoRespuesta = respuestasPosibles(i).find((r) => r.id === respuesta)?.texto ?? respuesta;
  const quien = DECISOR[i.decisor];
  let estado: EstadoIncidencia = i.estado;
  let resolucion = "";

  if (i.tipo === "dano") {
    if (respuesta === "liberar") {
      estado = "liberada";
      resolucion = `Calidad liberó ${i.cantidad} ${i.unidad}: pasan a disponible.`;
      aplicarDecisionDano(i.id, "liberada");
    } else if (respuesta === "mantener") {
      estado = "cuarentena";
      resolucion = "Calidad las mantiene en cuarentena (CUA-01) para una segunda revisión.";
    } else {
      estado = "rechazada";
      resolucion = `Calidad rechazó ${i.cantidad} ${i.unidad}. ${devolucion(camionEnAnden)}`;
      aplicarDecisionDano(i.id, "rechazada");
      // Con la recepción ya cerrada, lo devuelto deja de estar recibido y vuelve al saldo de la OC.
      if (!camionEnAnden && i.codigo && i.cantidad) {
        registrarRecibido(i.oc, { [i.codigo]: -i.cantidad }, true);
        resolucion += ` Las ${i.cantidad} vuelven al saldo de ${i.oc}.`;
        crearIncidencia({
          recepcion: i.recepcion,
          oc: i.oc,
          proveedor: i.proveedor,
          tipo: "saldo",
          semaforo: "amarillo",
          decisor: "compras",
          titulo: `Saldo pendiente de ${i.cantidad} ${i.unidad}`,
          detalle: `${i.producto}: ${i.cantidad} rechazadas por Calidad. Mientras Compras decide, el saldo queda abierto.`,
          paso: "Decisión de Calidad",
          cantidad: i.cantidad,
          unidad: i.unidad,
          foto: false,
        });
      }
    }
  } else if (i.tipo === "saldo") {
    if (respuesta === "mantener_saldo") {
      estado = "saldo_abierto";
      decidirSaldo(i.oc, "abierto", fechaLarga(rel("2026-10-02")));
      resolucion = `Compras mantiene el saldo abierto. Entrega estimada: ${fechaLarga(rel("2026-10-02"))}.`;
    } else {
      estado = "saldo_cancelado";
      decidirSaldo(i.oc, "cancelado");
      resolucion = `Compras canceló el saldo: ${i.oc} queda cerrada corta. Si el proveedor lo trae después, se recibe como entrega sin OC.`;
    }
  } else if (i.tipo === "posicion_ocupada" || i.tipo === "inventario_inesperado") {
    if (respuesta === "liberar_posicion") {
      estado = "resuelta";
      if (i.posicion) liberarPosicion(i.posicion);
      resolucion = `El supervisor liberó ${i.posicion} sin esperar el conteo.`;
    } else {
      estado = "investigando";
      resolucion = `${i.posicion} sigue bloqueada. El supervisor lo investiga junto con el conteo.`;
    }
  } else if (i.tipo === "incompatible" || i.tipo === "fefo") {
    const deEste = (b: { sscc: string }) => !!i.ssccs?.includes(b.sscc);
    if (respuesta === "autorizar") {
      estado = "autorizada";
      if (i.tipo === "incompatible") {
        actualizarBultos(deEste, {
          espera: undefined,
          posicionAutorizada: i.posicion,
          nota: `El supervisor autorizó dejarlo en ${i.posicion}.`,
        });
        resolucion = `Autorizado: el bulto va a ${i.posicion}. Regresa a la cola de Acomodar.`;
      } else {
        actualizarBultos(deEste, {
          espera: undefined,
          fefoInvertido: true,
          nota: "FEFO invertido autorizado: queda al fondo y Surtido toma primero este lote.",
        });
        resolucion = `Autorizado el FEFO invertido en ${i.posicion}. Surtido tomará primero este lote aunque esté al fondo.`;
      }
    } else if (respuesta === "rechazar") {
      estado = "rechazada";
      actualizarBultos(deEste, {
        espera: undefined,
        nota:
          i.tipo === "incompatible"
            ? "El supervisor no autorizó: llévalo a una posición de su temperatura."
            : "El supervisor no autorizó: hay que recorrer la fila para que quede al frente.",
      });
      resolucion = "No autorizado. El bulto regresa a la cola con la instrucción del supervisor.";
    } else {
      estado = "investigando";
      resolucion = "El supervisor lo revisa en piso. El bulto sigue apartado.";
    }
  } else if (i.tipo === "abandonado") {
    if (respuesta === "a_calidad") {
      estado = "resuelta";
      actualizarBultos((b) => !!i.ssccs?.includes(b.sscc), {
        cuarentena: "Tiempo fuera de cámara · revisa Calidad",
      });
      resolucion = "Los bultos pasan a cuarentena (CUA-01) para que Calidad revise el producto.";
    } else if (respuesta === "reasignar") {
      estado = "resuelta";
      resolucion = "El supervisor reasignó el acomodo a otra persona del turno.";
    } else {
      estado = "resuelta";
      resolucion = "El supervisor está enterado.";
    }
  } else if (i.tipo === "fefo_surtido") {
    // La línea quedó apartada en el trabajo de surtido; regresa con la decisión.
    const [trabajo, linea] = (i.grupo ?? "|").split("|");
    const marcar = (estadoLinea: Apartada["estado"]) =>
      actualizarTrabajo(trabajo, (e) => ({
        apartadas: { ...e.apartadas, [linea]: { ...e.apartadas[linea], estado: estadoLinea } },
      }));
    if (respuesta === "autorizar") {
      estado = "autorizada";
      marcar("autorizada");
      resolucion = `Autorizado tomar el lote más nuevo. La línea regresa al surtidor para terminarla.`;
    } else if (respuesta === "rechazar") {
      estado = "rechazada";
      marcar("rechazada");
      resolucion = "No autorizado. La línea queda pendiente con fecha: mañana 07:00.";
    } else {
      estado = "investigando";
      resolucion = "El supervisor revisa la posición. La línea sigue apartada.";
    }
  } else if (i.tipo === "sustituto") {
    if (respuesta === "aceptar") {
      estado = "autorizada";
      resolucion = `${i.proveedor} aceptó el sustituto. Sale en el siguiente envío.`;
    } else {
      estado = "rechazada";
      resolucion = `${i.proveedor} rechazó el sustituto. La línea queda pendiente con fecha.`;
    }
  } else if (i.tipo === "retraso_surtido" || i.tipo === "sin_confirmar") {
    estado = "resuelta";
    resolucion =
      respuesta === "reasignar"
        ? i.tipo === "retraso_surtido"
          ? "El supervisor asignó a otra persona para apoyar el surtido."
          : "El supervisor mandó a alguien del almacén a confirmar con el área."
        : "El supervisor está enterado.";
  } else if (i.tipo === "diferencia_area") {
    if (respuesta === "autorizar") {
      estado = "resuelta";
      resolucion = `Se repone a ${i.proveedor} en el siguiente envío.`;
    } else if (respuesta === "enterado") {
      estado = "resuelta";
      resolucion = "El supervisor la cerró sin reponer.";
    } else {
      estado = "investigando";
      resolucion = "El supervisor lo revisa con el surtidor.";
    }
  } else if (i.tipo === "no_localizado") {
    const deEste = (b: { sscc: string }) => !!i.ssccs?.includes(b.sscc);
    if (respuesta === "aparecio") {
      estado = "resuelta";
      actualizarBultos(deEste, { espera: undefined, nota: "Apareció: el supervisor lo devolvió a la cola." });
      resolucion = "El bulto apareció y regresa a la cola de Acomodar.";
    } else if (respuesta === "perdido") {
      estado = "resuelta";
      quitarBultos(deEste);
      resolucion = "Se da por perdido: sale de Acomodar y queda un ajuste de inventario pendiente.";
    } else {
      estado = "investigando";
      resolucion = "El supervisor lo busca. El bulto sigue apartado.";
    }
  } else if (respuesta === "autorizar") {
    estado = "autorizada";
    if (i.bultosPendientes?.length) agregarBultos(i.bultosPendientes);
    if (i.recibidoAlAutorizar) registrarRecibido(i.oc, i.recibidoAlAutorizar, false);
    resolucion =
      i.tipo === "otra_presentacion"
        ? `${quien} autorizó la conversión. Las etiquetas salieron en la impresora de resguardo y ${i.cantidad} ${i.unidad} pasan a Acomodar.`
        : i.tipo === "excedente"
          ? `Compras amplió ${i.oc}: el excedente entra a inventario y pasa a Acomodar.`
          : i.tipo === "no_en_oc"
            ? `Compras lo cargó a la orden: entra a inventario y pasa a Acomodar.`
            : `${quien} autorizó. Puedes continuar.`;
  } else if (respuesta === "rechazar") {
    estado = "rechazada";
    resolucion = i.bultosPendientes?.length ? `${quien} rechazó. ${devolucion(camionEnAnden)}` : `${quien} rechazó el caso.`;
  } else {
    estado = "investigando";
    resolucion = `${quien} lo investiga: sigue en resguardo y se programó un conteo de verificación.`;
  }

  // Tras una decisión solo sigue abierta si se mandó a investigar.
  const cerrada = estado !== "investigando";
  actualizar(id, (x) => ({
    estado,
    resolucion,
    resueltaEn: cerrada ? Date.now() : undefined,
    eventos: [
      ...(x.eventos ?? []),
      evento("decision", actor, `${textoRespuesta}${motivo ? ` · motivo: ${motivo}` : ""}`),
      evento("efecto", SISTEMA, resolucion),
    ],
  }));
  notificar({
    para: "operador",
    incidencia: id,
    titulo: `${id} · ${actor.rol}: ${textoRespuesta.toLowerCase()}`,
    texto: resolucion,
    tono: "decision",
  });
  // Lo que deciden Calidad o Compras también le llega al supervisor, para seguimiento.
  if (actor.nombre !== SUPERVISOR.nombre) {
    notificar({ para: "supervisor", incidencia: id, titulo: `${id} · ${actor.rol}: ${textoRespuesta.toLowerCase()}`, texto: resolucion, tono: "decision" });
  }
  return resolucion;
}

/**
 * Anula incidencias cuando el operador vuelve atrás o cancela el proceso. No se borran:
 * quedan en el historial con el motivo, y lo que ya se hubiera pasado a Acomodar se retira.
 */
export function anularIncidencias(ids: string[], motivo: string) {
  if (!ids.length) return;
  quitarBultos((b) => !!b.incidencia && ids.includes(b.incidencia));
  incidenciasStore.set((todas) =>
    todas.map((x) =>
      ids.includes(x.id)
        ? {
            ...x,
            estado: "anulada",
            resolucion: `Anulada: ${motivo}.`,
            resueltaEn: Date.now(),
            eventos: [...(x.eventos ?? []), evento("anulada", OPERADOR, `Anulada: ${motivo}`)],
          }
        : x,
    ),
  );
  for (const id of ids) {
    notificar({ para: "supervisor", incidencia: id, titulo: `${id} · anulada por el operador`, texto: motivo, tono: "anulada" });
  }
}

/** Sube la severidad de una incidencia abierta (p. ej. a los 60 min pasa al jefe de almacén). */
export function escalarIncidencia(id: string, texto: string) {
  registrarEvento(id, evento("notificada", SISTEMA, texto), { semaforo: "rojo" });
  const i = incidenciasStore.get().find((x) => x.id === id);
  if (i) notificar({ para: "supervisor", incidencia: id, titulo: `${id} · escaló`, texto, tono: "nueva" });
}

/** Cierra una incidencia porque el hecho que la originó ya se resolvió (p. ej. el área confirmó). */
export function cerrarIncidencia(id: string, actor: Actor, texto: string) {
  registrarEvento(id, evento("decision", actor, texto), { estado: "resuelta", resolucion: texto, resueltaEn: Date.now() });
  notificar({ para: "supervisor", incidencia: id, titulo: `${id} · resuelta`, texto, tono: "decision" });
}

/** El conteo en la tarea Contar cierra la incidencia que bloqueó la posición. */
export function resolverPorConteo(id: string, resolucion: string, contador = "Rodolfo Paz") {
  const i = incidenciasStore.get().find((x) => x.id === id);
  if (!i) return;
  if (i.posicion) liberarPosicion(i.posicion);
  registrarEvento(id, evento("decision", { nombre: contador, rol: "Conteo en Contar" }, resolucion), {
    estado: "resuelta",
    resolucion,
    resueltaEn: Date.now(),
  });
  const aviso = { incidencia: id, titulo: `${id} · posición ${i.posicion} contada y liberada`, texto: resolucion, tono: "decision" as const };
  notificar({ ...aviso, para: "supervisor" });
  notificar({ ...aviso, para: "operador" });
}
