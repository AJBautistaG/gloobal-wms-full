import { HOY, sumarDias } from "@/lib/fecha";
import { gtinDe, type DatosGS1 } from "@/lib/gs1";
import { cuenta, fechaConAnio } from "@/lib/utils";
import { ACTOR_DE, type Incidencia } from "./incidencias";
import { recibidoDe, resumenOrden, type ordenesStore } from "./ordenes";
import { todasLasOrdenes, type Orden } from "./recepcion";
import type { RegistroRecepcion } from "./recepciones";
import { estadoDe, insumoDe, pedidosAreaStore, trabajosDelDia, type PedidoArea, type Trabajo, type surtidoStore } from "./surtido";

/**
 * Documentos de orden (compra y surtido) con el formato impreso propuesto para Momi:
 * encabezado, folio, QR para escanear al recibir, datos, líneas y Code 128 de respaldo.
 */

export const EMPRESA = { nombre: "Dulcería Momi, S.A.", pais: "Panamá", ruc: "1553877-1-756213" };

export type Tono = "ok" | "alerta" | "critico" | "neutro" | "info";

export interface LineaDoc {
  articulo: string;
  nota?: string;
  codigo: string | null;
  destino?: string;
  cantidad: string;
  presentacion: string;
  /** La línea ya tiene su etiqueta GS1-128 generada. */
  etiqueta?: boolean;
  avance?: { texto: string; tono: Tono };
}

/** Etiqueta GS1-128 de una línea de la OC: el proveedor pega una copia en cada caja. */
export interface EtiquetaGS1 extends DatosGS1 {
  linea: number;
  nombre: string;
  codigo: string;
  presentacion: string;
  copias: number;
  unidadCopia: string;
}

export interface DocOrden {
  clase: "compra" | "surtido";
  folio: string;
  titulo: string;
  /** Nombre corto para la lista (proveedor o área). */
  quien: string;
  cuando: string;
  etiquetaQr: string;
  payload: string;
  estado: { texto: string; tono: Tono };
  /** Grupo para los filtros de la lista. */
  pendiente: boolean;
  atendida: boolean;
  campos: { etiqueta: string; valor: string; destacado?: boolean }[];
  lineas: LineaDoc[];
  columnaAvance?: string;
  conDestino?: boolean;
  historial: { hora: string; texto: string }[];
  incidencias: Incidencia[];
  /** Solo en compra: una etiqueta por línea. */
  etiquetas?: EtiquetaGS1[];
  /** Datos de la cabecera de la hoja de etiquetas. */
  proveedor?: string;
  cita?: string;
}

const hh = (h: string) => h.padStart(5, "0");

const compacta = (iso: string) => iso.replaceAll("-", "");

/** Dígito de control corto para el QR (4 hex), para que un QR alterado no pase. */
function control(texto: string) {
  let h = 0x811c9dc5;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return (h & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

const payload = (tipo: string, folio: string, fecha: string) => {
  const base = `MOMI|${tipo}|${folio}|${compacta(fecha)}`;
  return `${base}|${control(base)}`;
};

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false });

const TRANSPORTE: Record<Orden["transporte"], string> = {
  seco: "Seco · ambiente",
  refrigerado: "Refrigerado · 0 a 4 °C",
  congelado: "Congelado · termo ≤ -18 °C",
};

// ── Orden de compra ─────────────────────────────────────────────

export function documentoCompra(
  o: Orden,
  estados: ReturnType<typeof ordenesStore.get>,
  recepciones: RegistroRecepcion[],
  incidencias: Incidencia[],
): DocOrden {
  const r = resumenOrden(o, estados);
  const propias = recepciones.filter((x) => x.oc === o.oc);
  const enCurso = propias.find((x) => x.estado === "en_curso");
  const conAvance = r.recibido > 0;

  const estado: DocOrden["estado"] = enCurso
    ? { texto: `Recibiendo · andén ${enCurso.anden}`, tono: "info" }
    : r.estado === "completa"
      ? { texto: "Recibida completa", tono: "ok" }
      : r.estado === "cerrada_corta"
        ? { texto: "Cerrada corta", tono: "neutro" }
        : r.estado === "parcial"
          ? {
              texto: r.decisionSaldo === "abierto" ? `Parcial · saldo abierto${r.fechaEstimada ? ` (${r.fechaEstimada})` : ""}` : r.decisionSaldo === "pendiente" ? "Parcial · saldo en Compras" : "Recibida parcial",
              tono: "alerta",
            }
          : o.fechaProgramada < HOY
            ? { texto: "Por recibir · cita vencida", tono: "critico" }
            : { texto: "Por recibir", tono: "neutro" };

  const lineas: LineaDoc[] = o.productos.map((p) => {
    const recibido = recibidoDe(o, p, estados);
    return {
      articulo: p.nombre.toUpperCase(),
      nota: p.sinCaducidad ? undefined : "Lote y caducidad obligatorios",
      etiqueta: true,
      codigo: p.codigo,
      cantidad: String(p.cajas),
      presentacion: p.unidadesPorCaja === 1 ? `${p.unidadManejo} ${p.presentacion}` : `${p.unidadManejo} ${p.unidadesPorCaja} × ${p.presentacion}`,
      avance: conAvance
        ? recibido >= p.cajas
          ? { texto: `${recibido} de ${p.cajas}`, tono: "ok" }
          : r.estado === "cerrada_corta"
            ? { texto: `${recibido} de ${p.cajas} · saldo cancelado`, tono: "neutro" }
            : { texto: `${recibido} de ${p.cajas}`, tono: recibido > 0 ? "alerta" : "critico" }
        : undefined,
    };
  });

  const historial = [
    ...(o.productos.some((p) => p.recibidoPrevio)
      ? [{ hora: fechaConAnio(sumarDias(HOY, -4)), texto: `Entrega anterior: ${cuenta(o.productos.reduce((s, p) => s + (p.recibidoPrevio ?? 0), 0), "bulto")}` }]
      : []),
    ...propias.map((x) => ({
      hora: hora(x.inicio),
      texto:
        x.estado === "en_curso"
          ? `Recepción en curso en andén ${x.anden}`
          : x.estado === "cerrada"
            ? `Recepción cerrada en andén ${x.anden}${x.bultos !== undefined ? ` · ${cuenta(x.bultos, "bulto")}` : ""}`
            : `Recepción cancelada${x.motivo ? `: ${x.motivo}` : ""}`,
    })),
  ];

  return {
    clase: "compra",
    folio: o.oc,
    titulo: "Orden de compra",
    quien: o.proveedor,
    cuando: `${fechaConAnio(o.fechaProgramada)}${o.cita ? ` · ${hh(o.cita)}` : ""}`,
    etiquetaQr: "Escanear al recibir",
    payload: payload("PO", o.oc, o.fechaProgramada),
    estado,
    pendiente: r.saldo > 0 && r.estado !== "cerrada_corta",
    atendida: conAvance,
    campos: [
      { etiqueta: "Proveedor", valor: o.proveedor },
      { etiqueta: "Emitida", valor: `${fechaConAnio(sumarDias(o.fechaProgramada, -4))} · ${ACTOR_DE.compras.nombre}` },
      { etiqueta: "Entregar en", valor: "Almacén Central · Zona de carga" },
      { etiqueta: "Cita de entrega", valor: `${fechaConAnio(o.fechaProgramada)} · ${o.cita ? hh(o.cita) : "sin hora"}`, destacado: true },
      { etiqueta: "Condición de transporte", valor: TRANSPORTE[o.transporte] },
      { etiqueta: "Líneas", valor: String(o.productos.length) },
    ],
    lineas,
    columnaAvance: conAvance ? "Recibido" : undefined,
    historial,
    incidencias: incidencias.filter((i) => i.oc === o.oc),
    proveedor: o.proveedor,
    cita: `${fechaConAnio(o.fechaProgramada)}${o.cita ? ` · ${hh(o.cita)}` : ""}`,
    etiquetas: o.productos.map((p, n) => ({
      linea: n + 1,
      nombre: p.nombre.toUpperCase(),
      codigo: p.codigo,
      presentacion: lineas[n].presentacion,
      copias: p.cajas,
      unidadCopia: p.unidadManejoPlural,
      gtin: gtinDe(p.codigo),
      lote: p.lote,
      caducidad: p.sinCaducidad ? "" : p.caducidad,
      oc: o.oc,
    })),
  };
}

// ── Orden de surtido ────────────────────────────────────────────

const ESTADO_SURTIDO: Record<string, DocOrden["estado"]> = {
  por_aprobar: { texto: "Urgente · por aprobar", tono: "alerta" },
  rechazado: { texto: "Urgencia rechazada", tono: "critico" },
  en_cola: { texto: "Por surtir", tono: "neutro" },
  surtiendo: { texto: "Surtiendo", tono: "info" },
  pausado: { texto: "En pausa", tono: "alerta" },
  transito: { texto: "En tránsito", tono: "info" },
  confirmado: { texto: "Entregada · confirmada", tono: "ok" },
  cancelado: { texto: "Cancelada por el área", tono: "neutro" },
};

const NOMBRE_PISO = { B: "Piso B", A: "Piso A", camara: "cámara de frío" };

export function documentoSurtido(t: Trabajo, todos: ReturnType<typeof surtidoStore.get>, incidencias: Incidencia[]): DocOrden {
  const e = estadoDe(t.id, todos);
  const conAvance = e.estado !== "en_cola";
  const pisos = [...new Set(t.lineas.map((l) => l.piso))].map((p) => NOMBRE_PISO[p]);
  const frio = t.lineas.some((l) => l.piso === "camara");

  const lineas: LineaDoc[] = t.lineas.map((l) => {
    const i = insumoDe(l.sku);
    const r = e.resultados[l.id];
    const apartada = e.apartadas[l.id];
    const avance: LineaDoc["avance"] = r
      ? r.tipo === "completa"
        ? { texto: "Surtida", tono: "ok" }
        : r.tipo === "parcial"
          ? { texto: `Parcial · ${r.bultos} de ${l.bultos}`, tono: "alerta" }
          : r.tipo === "sustituto"
            ? { texto: `Sustituto: ${r.sustituto ?? "otro insumo"}`, tono: "alerta" }
            : { texto: "Pendiente", tono: "critico" }
      : apartada?.estado === "esperando"
        ? { texto: "Apartada · espera decisión", tono: "alerta" }
        : e.estado === "cancelado"
          ? { texto: "No se surtió", tono: "neutro" }
          : { texto: "Por surtir", tono: "neutro" };
    return {
      articulo: i.nombre.toUpperCase(),
      nota: i.lote ? `Lote FEFO ${i.lote.codigo} · vence ${i.lote.vence}` : undefined,
      codigo: i.sku,
      destino: t.tipo === "ruta" ? l.destino : undefined,
      cantidad: `${l.pidio} ${i.unidad}`,
      presentacion: `${l.bultos} × ${i.manejo.etiqueta}`,
      avance: conAvance ? avance : undefined,
    };
  });

  const ap = e.aprobacion;
  const historial = [
    ...(ap ? [{ hora: ap.solicitada, texto: `Solicitud urgente: ${ap.motivo.toLowerCase()} · espera aprobación de ${ap.aprobador}` }] : []),
    ...(ap?.decision
      ? [{ hora: ap.hora!, texto: ap.decision === "aprobada" ? `${ap.quien} aprobó la urgencia` : ap.decision === "ventana" ? `${ap.quien} la pasó a la ventana de las ${t.sale}` : `${ap.quien} rechazó la urgencia${ap.nota ? `: ${ap.nota.toLowerCase()}` : ""}` }]
      : []),
    ...(ap?.reenviada ? [{ hora: ap.reenviada.hora, texto: `${ap.reenviada.quien} la reenvió en la ventana de las ${t.sale}` }] : []),
    ...(e.salidaMs ? [{ hora: hora(e.salidaMs), texto: `Salió del almacén en contenedor ${t.contenedor}` }] : []),
    ...(e.confirmado ? [{ hora: e.confirmado.hora, texto: `${e.confirmado.quien} confirmó la recepción` }] : []),
    ...(e.estado === "cancelado" ? [{ hora: "—", texto: "El área canceló el pedido; lo tomado regresa a su posición" }] : []),
  ];

  const esRuta = t.tipo === "ruta";
  // Si lo pidió un área desde su escritorio, la hoja lleva quién lo pidió, el origen y su nota.
  const p = pedidosAreaStore.get().find((x) => x.id === t.id);
  return {
    clase: "surtido",
    folio: t.id,
    titulo: "Orden de surtido",
    quien: esRuta ? "Ruta Este · 3 tiendas" : t.nombre,
    cuando: t.urgente ? "Urgente · sale ahora" : `Sale ${t.sale}`,
    etiquetaQr: esRuta ? "Escanear al recibir en tienda" : "Escanear al recibir en el área",
    payload: payload("SO", t.id, HOY),
    estado: t.urgente && e.estado === "en_cola" ? { texto: "Urgente · por surtir", tono: "critico" } : ESTADO_SURTIDO[e.estado],
    pendiente: ["en_cola", "surtiendo", "pausado"].includes(e.estado),
    atendida: ["transito", "confirmado", "cancelado"].includes(e.estado),
    campos: [
      { etiqueta: "Solicita", valor: esRuta ? "Planeación de rutas · tiendas" : `${t.nombre} · ${p?.pide ?? t.recibe}` },
      { etiqueta: "Emitida", valor: `${fechaConAnio(HOY)} · ${p ? `${p.hora} · ` : ""}${t.urgente ? `urgente: ${t.urgente.toLowerCase()}` : "pedido del día"}` },
      { etiqueta: "Surtir desde", valor: `${p?.origen ?? "Almacén Central"} · ${pisos.join(", ")}` },
      { etiqueta: "Sale del almacén", valor: t.sale === "ahora" ? `${fechaConAnio(HOY)} · ahora (urgente)` : `${fechaConAnio(HOY)} · ${t.sale}${t.llega ? ` · llega ${t.llega}` : ""}`, destacado: true },
      { etiqueta: "Entregar en", valor: esRuta ? "Tocumen · La Doña · Brisas del Golf" : `${t.nombre} · recibe ${t.recibe}` },
      { etiqueta: "Contenedor", valor: t.contenedor },
      { etiqueta: "Condición", valor: frio ? "Mixta · lo refrigerado se toma al final" : "Seco · ambiente" },
      { etiqueta: "Líneas", valor: String(t.lineas.length) },
      ...(ap
        ? [
            {
              etiqueta: "Aprobación",
              valor: ap.decision
                ? `${ap.decision === "rechazada" ? "Rechazada" : ap.decision === "ventana" ? "Pasada a la ventana" : "Aprobada"} · ${ap.quien} · ${ap.hora}`
                : `Pendiente · ${ap.aprobador}`,
            },
          ]
        : []),
      ...(p?.nota ? [{ etiqueta: "Nota para el almacén", valor: p.nota }] : []),
    ],
    lineas,
    columnaAvance: conAvance ? "Surtido" : undefined,
    conDestino: esRuta,
    historial,
    incidencias: incidencias.filter((i) => i.oc.startsWith(t.contenedor)),
  };
}

export const ordenesDeCompra = () =>
  [...todasLasOrdenes()].sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada) || (a.cita ?? "").localeCompare(b.cita ?? ""));

export const ordenesDeSurtido = (pedidos?: PedidoArea[]) => trabajosDelDia(pedidos);
