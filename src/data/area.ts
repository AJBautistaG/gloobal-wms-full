import { CLAVES } from "@/lib/almacenamiento";
import { FOLIO_DIA } from "@/lib/fecha";
import { crearStore } from "@/lib/store";
import { horaActual } from "@/lib/utils";
import { crearIncidencia, esPendiente, type Incidencia } from "./incidencias";
import { SURTIDOR, estadoDe, insumoDe, pedidosAreaStore, trabajosDelDia, type ClaveArea, type EstadoTrabajo, type Insumo, type PedidoArea, type Trabajo } from "./surtido";

/**
 * Rol Área (Panadería, Cocina, Dulcería): pide al almacén por ventanas, sigue su pedido
 * y confirma lo que recibe. Quien pide, quien surte y quien confirma son personas distintas.
 */

export interface LineaSugerida {
  sku: string;
  cantidad: number;
  /** Por qué el sistema la sugiere. */
  razon: string;
  /** Si es distinta a lo de siempre, pide el visto del área antes de enviar. */
  visto?: string;
}

export interface Area {
  clave: ClaveArea;
  nombre: string;
  prefijo: string;
  /** Quien pide desde el PDA del área. */
  pide: string;
  /** Quien recibe y confirma en el área. */
  recibe: string;
  /** Otra persona del área que también puede recibir. */
  companero: string;
  /** El pedido que ya está en la cola del surtidor (de los datos de ejemplo). */
  trabajoBase: string;
  etiquetaBase: string;
  sugerido: LineaSugerida[];
  /** Lo que se entregó en la ventana de las 07:00. */
  entregaTemprano: { lineas: [string, number][]; pedido: string; surtido: string; posicion: string; lote: string; cerrado: string; salida: string; entregado: string };
}

/** La ventana abierta para pedir: sale a las 14:00 y cierra a las 12:30. */
export const VENTANA = { sale: "14:00", llega: "14:30", cierra: "12:30" };

/** A qué almacén puede pedir el área. Por ahora solo Central; el selector queda listo para más. */
export const ORIGENES = [
  { id: "central", nombre: "Almacén Central", disponible: true, detalle: "Insumos, empaque y refrigerados" },
  { id: "fabrica", nombre: "Fábrica", disponible: false, detalle: "Producto intermedio · próximamente" },
];

export type Entrega = "ventana" | "urgente";

const base = (prefijo: string, n: string) => `SOL-${prefijo}-${FOLIO_DIA}-${n}`;

export const AREAS: Record<ClaveArea, Area> = {
  panaderia: {
    clave: "panaderia",
    nombre: "Panadería",
    prefijo: "PAN",
    pide: "Carlos Méndez",
    recibe: "José Pinzón",
    companero: "Marta Cedeño",
    trabajoBase: base("PAN", "016"),
    etiquetaBase: "Urgente",
    sugerido: [
      { sku: "HAR-GM50", cantidad: 150, razon: "pides esto cada 2 días · última vez hace 3" },
      { sku: "AZU-R25", cantidad: 50, razon: "lo pediste las últimas 5 veces en este turno" },
      { sku: "SAL-25", cantidad: 10, razon: "pides esto cada 2 días · última vez hace 3" },
      { sku: "LEV-10", cantidad: 5, razon: "tu consumo subió 20 % esta semana", visto: "Subió de 4 a 5" },
      { sku: "LEC-P25", cantidad: 25, razon: "lo pediste las últimas 5 veces en este turno" },
      { sku: "HAR-INT", cantidad: 45, razon: "quedó pendiente de tu pedido de ayer", visto: "Está en Piso A · +15 min" },
      { sku: "AVE-10", cantidad: 10, razon: "sueles pedirla en el turno de la tarde" },
      { sku: "BOL-PAN", cantidad: 300, razon: "lo pediste las últimas 5 veces en este turno" },
    ],
    entregaTemprano: { lineas: [["HAR-GM50", 90], ["AZU-R25", 25], ["BOL-PAN", 200]], pedido: "06:28", surtido: "06:58", posicion: "PB-R02-N1-P05", lote: "L230825", cerrado: "07:10", salida: "07:14", entregado: "07:24" },
  },
  cocina: {
    clave: "cocina",
    nombre: "Cocina",
    prefijo: "COC",
    pide: "Rubén Araúz",
    recibe: "Delia Castillo",
    companero: "Iris Batista",
    trabajoBase: base("COC", "014"),
    etiquetaBase: "10:00",
    sugerido: [
      { sku: "HAR-GM50", cantidad: 45, razon: "lo pediste las últimas 5 veces en este turno" },
      { sku: "ACE-18", cantidad: 36, razon: "pides esto cada 2 días · última vez hace 2" },
      { sku: "CRE-UHT", cantidad: 24, razon: "lo pediste las últimas 5 veces en este turno" },
      { sku: "HUE-LIQ", cantidad: 20, razon: "es el doble de lo usual", visto: "Subió de 10 a 20" },
      { sku: "MAN-10", cantidad: 10, razon: "pides esto cada 2 días · última vez hace 3" },
      { sku: "SAL-25", cantidad: 5, razon: "lo pediste las últimas 5 veces en este turno" },
      { sku: "CAC-05", cantidad: 5, razon: "quedó pendiente de tu pedido de ayer", visto: "Está en Piso A · +15 min" },
    ],
    entregaTemprano: { lineas: [["HAR-GM50", 45], ["CRE-UHT", 12], ["HUE-LIQ", 10]], pedido: "06:35", surtido: "07:06", posicion: "PB-R02-N1-P05", lote: "L230825", cerrado: "07:20", salida: "07:25", entregado: "07:36" },
  },
  dulceria: {
    clave: "dulceria",
    nombre: "Dulcería",
    prefijo: "DUL",
    pide: "María Cedeño",
    recibe: "Ana Rodríguez",
    companero: "Gabriela Núñez",
    trabajoBase: base("DUL", "015"),
    etiquetaBase: "10:00",
    sugerido: [
      { sku: "AZU-G25", cantidad: 25, razon: "lo pediste las últimas 5 veces en este turno" },
      { sku: "QCR-10", cantidad: 20, razon: "tu consumo subió 30 % esta semana", visto: "Subió de 10 a 20" },
      { sku: "CRE-UHT", cantidad: 24, razon: "pides esto cada 2 días · última vez hace 2" },
      { sku: "CHO-05", cantidad: 10, razon: "lo pediste las últimas 5 veces en este turno" },
      { sku: "EMP-C10", cantidad: 50, razon: "pides esto cada 2 días · última vez hace 3" },
      { sku: "EMP-B10", cantidad: 50, razon: "pides esto cada 2 días · última vez hace 3" },
      { sku: "VAI-04", cantidad: 4, razon: "quedó pendiente de tu pedido de ayer", visto: "Subió de 2 a 4" },
    ],
    entregaTemprano: { lineas: [["HAR-GM50", 90], ["EMP-C10", 50], ["CRE-UHT", 12]], pedido: "06:31", surtido: "07:04", posicion: "PB-R02-N1-P05", lote: "L230825", cerrado: "07:18", salida: "07:22", entregado: "07:31" },
  },
};

export const folioTemprano = (a: Area) => base(a.prefijo, "012");

/** Catálogo por categoría para "Agregar algo más". */
export const CATEGORIAS: { nombre: string; skus: string[] }[] = [
  { nombre: "Harinas y azúcares", skus: ["HAR-GM50", "HAR-INT", "AZU-R25", "AZU-G25", "SAL-25", "AVE-10"] },
  { nombre: "Lácteos y grasas", skus: ["CRE-UHT", "QCR-10", "LEC-P25", "MAN-10", "HUE-LIQ", "ACE-18"] },
  { nombre: "Chocolate y cacao", skus: ["CHO-05", "CAC-05"] },
  { nombre: "Empaque", skus: ["EMP-C10", "EMP-B10", "BOL-PAN"] },
  { nombre: "Otros", skus: ["LEV-10", "VAI-04"] },
];

/** Artículos frecuentes que no tienen código en el catálogo. */
export const SIN_CODIGO_FRECUENTES = ["Semillas de ajonjolí", "Mejorante para pan", "Papel antiadherente", "Pasas sin semilla", "Linaza molida", "Etiquetas de fecha"];

/** Dónde está y cuánto tarda en llegar, según su posición. */
export function disponibilidad(i: Insumo) {
  if (i.tipo === "reserva") return "Disponible en Piso A · +15 min";
  if (i.tipo === "camara") return "Disponible en cámara de frío";
  return "Disponible";
}

/** Paso de los botones − y +: un empaque para piezas; 5 en kilos o litros. */
export const pasoDe = (i: Insumo) => (i.unidad === "PZA" ? i.manejo.contenido : 5);

export interface LineaPedido {
  sku: string;
  /** Siempre en la unidad del artículo (KG, LT, PZA). */
  cantidad: number;
  antes: boolean;
  /** En qué unidad la capturó el área: la del artículo o su empaque (saco, caja…). */
  unidad?: UnidadPedido;
}

export type UnidadPedido = "base" | "empaque";

/** Convierte a la unidad del artículo: 2 sacos de 50 lb → 45.36 KG. */
export const aBase = (i: Insumo, n: number, u: UnidadPedido) => (u === "empaque" ? Number((n * i.manejo.contenido).toFixed(2)) : n);

/** Cuánto es en la unidad elegida: 45.36 KG → 2 sacos. */
export const enUnidad = (i: Insumo, cantidad: number, u: UnidadPedido) => (u === "empaque" ? Number((cantidad / i.manejo.contenido).toFixed(2)) : cantidad);

export interface SinCodigo {
  texto: string;
  cantidad: number;
  unidad: string;
}

/**
 * Envía el pedido de la ventana: entra a la cola del surtidor. Lo marcado "lo necesito antes"
 * sale aparte como urgente, y lo que no tiene código va a Compras.
 */
export function enviarPedido(
  a: Area,
  lineas: LineaPedido[],
  sinCodigo: SinCodigo[],
  opciones: { recibe?: string; entrega?: Entrega; origen?: string; nota?: string; desdePlan?: boolean } = {},
) {
  const recibe = opciones.recibe ?? a.recibe;
  const extra = { origen: opciones.origen ?? ORIGENES[0].nombre, nota: opciones.nota || undefined, desdePlan: opciones.desdePlan || undefined };
  // Si toda la solicitud es urgente, todas sus líneas salen ahora.
  if (opciones.entrega === "urgente") lineas = lineas.map((l) => ({ ...l, antes: true }));
  const existentes = pedidosAreaStore.get().filter((p) => p.area === a.clave).length;
  const siguiente = (n: number) => `SOL-${a.prefijo}-${FOLIO_DIA}-0${17 + existentes + n}`;
  const hora = horaActual();
  const nuevos: PedidoArea[] = [];
  const normales = lineas.filter((l) => !l.antes);
  const urgentes = lineas.filter((l) => l.antes);
  if (normales.length) {
    nuevos.push({ id: siguiente(0), area: a.clave, nombre: a.nombre, sale: VENTANA.sale, llega: VENTANA.llega, pide: a.pide, recibe, lineas: normales.map((l) => [l.sku, l.cantidad]), hora, ...extra });
  }
  if (urgentes.length) {
    nuevos.push({
      id: siguiente(nuevos.length),
      area: a.clave,
      nombre: a.nombre,
      sale: "ahora",
      llega: "en 30 min",
      pide: a.pide,
      recibe,
      lineas: urgentes.map((l) => [l.sku, l.cantidad]),
      urgente: opciones.entrega === "urgente" ? "Solicitud urgente" : "Lo necesito antes",
      hora,
      ...extra,
    });
  }
  pedidosAreaStore.set((todos) => [...todos, ...nuevos]);
  const solicitudes = sinCodigo.map((s) =>
    crearIncidencia({
      registradaPor: { nombre: a.pide, rol: a.nombre },
      recepcion: "surtido",
      oc: nuevos[0]?.id ?? `SOL-${a.prefijo}`,
      proveedor: a.nombre,
      tipo: "otro",
      semaforo: "amarillo",
      decisor: "compras",
      titulo: `Artículo sin código: ${s.texto}`,
      detalle: `${a.nombre} pide ${s.cantidad} ${s.unidad} de "${s.texto}", que no está en el catálogo. Compras decide si se compra o se da de alta.`,
      paso: "Pedido del área",
      foto: false,
    }),
  );
  return { pedidos: nuevos, solicitudes };
}

/** Los trabajos de un área, del más reciente al más antiguo. */
export function trabajosDelArea(a: Area, pedidos = pedidosAreaStore.get()) {
  const propios = new Set([a.trabajoBase, ...pedidos.filter((p) => p.area === a.clave).map((p) => p.id)]);
  return trabajosDelDia(pedidos).filter((t) => propios.has(t.id));
}

export const pedidoDe = (id: string) => pedidosAreaStore.get().find((p) => p.id === id);

export const nombreInsumo = (sku: string) => insumoDe(sku).nombre;

// ── Borrador de la solicitud (uno por área) ─────────────────────

export interface Borrador {
  lineas: (LineaPedido & { vistoDado?: boolean; razon?: string; visto?: string })[];
  sinCodigo: SinCodigo[];
  recibe: string;
  entrega: Entrega;
  nota: string;
  guardado: string;
  /** Lo generó la planeación: se revisa antes de enviar. */
  desdePlan?: boolean;
}

export const borradoresStore = crearStore<Partial<Record<ClaveArea, Borrador>>>(CLAVES.borradoresArea, {});

export function guardarBorrador(a: Area, b: Omit<Borrador, "guardado">) {
  borradoresStore.set((todos) => ({ ...todos, [a.clave]: { ...b, guardado: horaActual() } }));
}

export function descartarBorrador(a: Area) {
  borradoresStore.set((todos) => {
    const { [a.clave]: _, ...resto } = todos;
    return resto;
  });
}

// ── Métricas del área ───────────────────────────────────────────

export function metricasArea(a: Area, trabajos: Trabajo[], estados: Record<string, EstadoTrabajo>, incidencias: Incidencia[]) {
  const de = (t: Trabajo) => estadoDe(t.id, estados);
  const activos = trabajos.filter((t) => de(t).estado !== "cancelado");
  const entregados = trabajos.filter((t) => de(t).estado === "confirmado");
  // Líneas resueltas por el surtidor y cuántas salieron completas (la entrega de las 07:00 cuenta completa).
  let lineas = a.entregaTemprano.lineas.length;
  let completas = lineas;
  for (const t of activos) {
    for (const l of t.lineas) {
      const r = de(t).resultados[l.id];
      if (!r) continue;
      lineas++;
      if (r.tipo === "completa") completas++;
    }
  }
  const propias = incidencias.filter((i) => i.proveedor === a.nombre);
  return {
    pedidosHoy: activos.length + 1,
    enCamino: trabajos.filter((t) => de(t).estado === "transito").length,
    porSurtir: trabajos.filter((t) => ["en_cola", "surtiendo", "pausado"].includes(de(t).estado)).length,
    entregados: entregados.length + 1,
    conformes: entregados.filter((t) => !de(t).confirmado?.diferencia).length + 1,
    lineasCompletas: lineas ? Math.round((completas / lineas) * 100) : 100,
    lineas,
    diferencias: propias.filter((i) => i.tipo === "diferencia_area" && esPendiente(i)),
    decisiones: propias.filter((i) => i.decisor === "area" && esPendiente(i)),
    desdePlan: activos.filter((t) => pedidosAreaStore.get().find((p) => p.id === t.id)?.desdePlan).length,
    enviados: activos.filter((t) => pedidosAreaStore.get().some((p) => p.id === t.id)).length,
  };
}

export { SURTIDOR };
