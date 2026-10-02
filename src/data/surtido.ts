import { CLAVES } from "@/lib/almacenamiento";
import { crearStore } from "@/lib/store";
import { diaMes, FOLIO_DIA, rel } from "@/lib/fecha";
import { cuenta } from "@/lib/utils";

/**
 * Surtido a producción y tiendas (basado en el mock actualizado de Momi): una cola de
 * trabajos por hora de salida. Cada trabajo se surte línea por línea en un contenedor.
 */

export const SURTIDOR = { nombre: "Luis Ortega", rol: "Surtidor" };
export const JEFE_ALMACEN = "Roberto Vega";
/** Hora de la demo: el surtidor empieza su turno a esta hora. */
export const HORA_DEMO = "09:38";
export const ELEVADOR = "EC-01";
/** Bultos que caben en un contenedor antes de partirlo en otro. */
export const CAPACIDAD_CONTENEDOR = 8;

export type TipoPosicion = "frente" | "reserva" | "camara" | "congelado";
export type Piso = "B" | "A" | "camara";

export interface Manejo {
  nombre: string;
  plural: string;
  /** "saco de 50 lb" */
  etiqueta: string;
  /** Cuánto trae cada bulto, en la unidad del insumo. */
  contenido: number;
}

export interface Insumo {
  sku: string;
  nombre: string;
  unidad: string;
  manejo: Manejo;
  stock: number;
  posicion: string;
  tipo: TipoPosicion;
  lote?: { codigo: string; vence: string };
  sustituto?: { nombre: string; stock: number };
}

const saco50 = { nombre: "saco", plural: "sacos", etiqueta: "saco de 50 lb", contenido: 22.68 };
const saco25 = { nombre: "saco", plural: "sacos", etiqueta: "saco de 25 KG", contenido: 25 };
const saco45 = { nombre: "saco", plural: "sacos", etiqueta: "saco de 45 KG", contenido: 45 };
const caja = (n: number, u: string): Manejo => ({ nombre: "caja", plural: "cajas", etiqueta: `caja de ${n} ${u}`, contenido: n });
const paquete = (n: number): Manejo => ({ nombre: "paquete", plural: "paquetes", etiqueta: `paquete de ${n} PZA`, contenido: n });

export const INSUMOS: Insumo[] = [
  { sku: "HAR-GM50", nombre: "Harina Gold Mills dura", unidad: "KG", manejo: saco50, stock: 900, posicion: "PB-R02-N1-P05", tipo: "frente", lote: { codigo: "L230825", vence: diaMes(rel("2026-10-12")) }, sustituto: { nombre: "Harina suave Molinos del Istmo", stock: 300 } },
  { sku: "AZU-R25", nombre: "Azúcar refinada", unidad: "KG", manejo: saco25, stock: 600, posicion: "PB-R02-N1-P08", tipo: "frente" },
  { sku: "SAL-25", nombre: "Sal refinada", unidad: "KG", manejo: saco25, stock: 300, posicion: "PB-R02-N1-P09", tipo: "frente" },
  { sku: "CRE-UHT", nombre: "Crema de leche UHT", unidad: "LT", manejo: caja(12, "LT"), stock: 144, posicion: "PB-CF1", tipo: "camara", lote: { codigo: "L011025", vence: diaMes(rel("2026-11-30")) } },
  { sku: "QCR-10", nombre: "Queso crema", unidad: "KG", manejo: caja(10, "KG"), stock: 60, posicion: "PB-CF2", tipo: "camara", lote: { codigo: "L220925", vence: diaMes(rel("2026-10-22")) } },
  { sku: "HUE-LIQ", nombre: "Huevo líquido pasteurizado", unidad: "LT", manejo: caja(10, "LT"), stock: 80, posicion: "PB-CF2", tipo: "camara", lote: { codigo: "L260925", vence: diaMes(rel("2026-10-10")) } },
  { sku: "ACE-18", nombre: "Aceite vegetal", unidad: "LT", manejo: { nombre: "bidón", plural: "bidones", etiqueta: "bidón de 18 LT", contenido: 18 }, stock: 216, posicion: "PA-R10-N1-P01", tipo: "reserva" },
  { sku: "CAC-05", nombre: "Cacao en polvo", unidad: "KG", manejo: caja(5, "KG"), stock: 40, posicion: "PA-R12-N3-P01", tipo: "reserva" },
  { sku: "EMP-C10", nombre: 'Caja pastel 10"', unidad: "PZA", manejo: paquete(25), stock: 800, posicion: "PB-R04-N2-P01", tipo: "frente" },
  { sku: "EMP-B10", nombre: 'Base de cartón dorada 10"', unidad: "PZA", manejo: paquete(50), stock: 900, posicion: "PB-R04-N2-P02", tipo: "frente" },
  { sku: "VAI-04", nombre: "Esencia de vainilla", unidad: "LT", manejo: caja(4, "LT"), stock: 24, posicion: "PB-R03-N2-P03", tipo: "frente" },
  { sku: "LEV-10", nombre: "Levadura seca instantánea", unidad: "KG", manejo: caja(10, "KG"), stock: 50, posicion: "PA-R12-N2-P05", tipo: "reserva", lote: { codigo: "L200925", vence: diaMes(rel("2027-01-20")) } },
  // Catálogo que las áreas piden desde su PDA
  { sku: "LEC-P25", nombre: "Leche en polvo", unidad: "KG", manejo: saco25, stock: 200, posicion: "PB-R05-N1-P02", tipo: "frente" },
  { sku: "HAR-INT", nombre: "Harina integral", unidad: "KG", manejo: saco45, stock: 270, posicion: "PA-R12-N1-P03", tipo: "reserva" },
  { sku: "AVE-10", nombre: "Avena en hojuelas", unidad: "KG", manejo: caja(10, "KG"), stock: 80, posicion: "PB-R03-N1-P04", tipo: "frente" },
  { sku: "BOL-PAN", nombre: "Bolsa de papel para pan", unidad: "PZA", manejo: paquete(100), stock: 2400, posicion: "PB-R04-N3-P01", tipo: "frente" },
  { sku: "AZU-G25", nombre: "Azúcar glas", unidad: "KG", manejo: saco25, stock: 150, posicion: "PB-R02-N1-P07", tipo: "frente" },
  { sku: "CHO-05", nombre: "Chocolate cobertura 60 %", unidad: "KG", manejo: caja(5, "KG"), stock: 60, posicion: "PB-R07-N2-P03", tipo: "frente" },
  { sku: "MAN-10", nombre: "Mantequilla sin sal", unidad: "KG", manejo: caja(10, "KG"), stock: 70, posicion: "PB-CF2", tipo: "camara" },
];

export const insumoDe = (sku: string) => INSUMOS.find((i) => i.sku === sku)!;

export const pisoDe = (i: Insumo): Piso => (i.tipo === "reserva" ? "A" : i.tipo === "frente" ? "B" : "camara");
export const bultosPara = (i: Insumo, cantidad: number) => Math.max(1, Math.ceil(cantidad / i.manejo.contenido - 1e-9));
export const enBultos = (i: Insumo, n: number) => `${n} ${n === 1 ? i.manejo.nombre : i.manejo.plural}`;
export const equivalente = (i: Insumo, bultos: number) => Number((bultos * i.manejo.contenido).toFixed(2));
export const cantidadCon = (unidad: string, n: number) => `${Number(n.toFixed(2)).toLocaleString("en-US")} ${unidad}`;

export interface LineaSurtido {
  id: string;
  destino: string;
  sku: string;
  pidio: number;
  bultos: number;
  piso: Piso;
}

export interface Trabajo {
  id: string;
  tipo: "area" | "ruta";
  nombre: string;
  corto: string;
  /** Hora de salida del almacén, o "ahora" si es urgente. */
  sale: string;
  llega?: string;
  urgente?: string;
  contenedor: string;
  /** Quién recibe en destino. */
  recibe: string;
  lineas: LineaSurtido[];
}

/** Recorrido de menor esfuerzo: Piso B, un solo viaje a Piso A, y la cámara al final. */
function ordenarRecorrido(lineas: LineaSurtido[]) {
  const de = (p: Piso) => lineas.filter((l) => l.piso === p).sort((a, b) => insumoDe(a.sku).posicion.localeCompare(insumoDe(b.sku).posicion));
  return [...de("B"), ...de("A"), ...de("camara")];
}

export function trabajoDeArea(
  id: string,
  nombre: string,
  sale: string,
  llega: string,
  recibe: string,
  pedido: [string, number][],
  urgente?: string,
): Trabajo {
  const lineas = pedido.map(([sku, pidio], n) => {
    const i = insumoDe(sku);
    return { id: `${id}-${n}`, destino: nombre, sku, pidio, bultos: bultosPara(i, pidio), piso: pisoDe(i) };
  });
  return {
    id,
    tipo: "area",
    nombre,
    corto: `${nombre} · ${id.replace(/^SOL-\w+-\d+-/, "SOL-")}`,
    sale,
    llega,
    urgente,
    contenedor: id.replace(/^SOL-/, "ENT-"),
    recibe,
    lineas: ordenarRecorrido(lineas),
  };
}

const TIENDAS_RUTA = ["Tocumen", "La Doña", "Brisas del Golf"];
const PEDIDO_TIENDA: [string, number][] = [
  ["HAR-GM50", 45],
  ["CRE-UHT", 12],
  ["EMP-C10", 25],
];

export const TRABAJOS: Trabajo[] = [
  trabajoDeArea(`SOL-PAN-${FOLIO_DIA}-016`, "Panadería", "ahora", "09:58", "José Pinzón", [["LEV-10", 5]], "Se acabó en línea"),
  trabajoDeArea(`SOL-COC-${FOLIO_DIA}-014`, "Cocina", "10:12", "10:30", "Delia Castillo", [
    ["HAR-GM50", 45],
    ["ACE-18", 36],
    ["AZU-R25", 25],
    ["CRE-UHT", 24],
    ["CAC-05", 5],
    ["HUE-LIQ", 10],
    ["SAL-25", 5],
    ["VAI-04", 2],
  ]),
  trabajoDeArea(`SOL-DUL-${FOLIO_DIA}-015`, "Dulcería", "10:20", "10:30", "Ana Rodríguez", [
    ["HAR-GM50", 90],
    ["AZU-R25", 25],
    ["EMP-C10", 50],
    ["EMP-B10", 50],
    ["QCR-10", 10],
  ]),
  {
    id: "RUTA-ESTE",
    tipo: "ruta",
    nombre: "Ruta Este",
    corto: "Ruta Este",
    sale: "11:00",
    contenedor: `ENT-RTE-${FOLIO_DIA}-011`,
    recibe: "Encargados de tienda",
    lineas: ordenarRecorrido(
      TIENDAS_RUTA.flatMap((tienda, t) =>
        PEDIDO_TIENDA.map(([sku, pidio], n) => {
          const i = insumoDe(sku);
          return { id: `RUTA-${t}-${n}`, destino: tienda, sku, pidio, bultos: bultosPara(i, pidio), piso: pisoDe(i) };
        }),
      ),
    ),
  },
];

// ── Pedidos que las áreas envían desde su PDA ─────────────────────

export type ClaveArea = "panaderia" | "cocina" | "dulceria";

export interface PedidoArea {
  id: string;
  area: ClaveArea;
  nombre: string;
  /** Ventana de salida ("14:00") o "ahora" si es urgente. */
  sale: string;
  llega: string;
  pide: string;
  recibe: string;
  lineas: [string, number][];
  urgente?: string;
  hora: string;
  /** A qué almacén se pidió. */
  origen?: string;
  nota?: string;
  /** La generó la planeación del área (y el área la revisó antes de enviarla). */
  desdePlan?: boolean;
}

export const pedidosAreaStore = crearStore<PedidoArea[]>(CLAVES.pedidosArea, []);

/** Todos los trabajos del día: los de ejemplo más lo que las áreas enviaron desde su PDA. */
export function trabajosDelDia(pedidos = pedidosAreaStore.get()): Trabajo[] {
  return [...TRABAJOS, ...pedidos.map((p) => trabajoDeArea(p.id, p.nombre, p.sale, p.llega, p.recibe, p.lineas, p.urgente))];
}

export const trabajoDe = (id: string) => trabajosDelDia().find((t) => t.id === id)!;

export function detalleTrabajo(t: Trabajo) {
  const a = t.lineas.filter((l) => l.piso === "A").length;
  const base = t.tipo === "ruta" ? `${cuenta(TIENDAS_RUTA.length, "tienda")} · ${cuenta(t.lineas.length, "línea")} · sale en vehículo` : cuenta(t.lineas.length, "línea");
  return a && t.tipo === "area" ? `${base} · ${t.lineas.length - a} en Piso B, ${a} en Piso A` : base;
}

/** Cuántos viajes de elevador harían falta sin agrupar el recorrido. */
export function viajesSinAgrupar(t: Trabajo) {
  let viajes = 0;
  let enA = false;
  for (const l of t.lineas) {
    if (l.piso === "A" && !enA) viajes++;
    enA = l.piso === "A";
  }
  return viajes;
}

// ── Estado del surtido (persistente, compartido con la torre de control) ──

export type TipoResultado = "completa" | "parcial" | "sustituto" | "pendiente";

export interface Resultado {
  tipo: TipoResultado;
  bultos: number;
  causa?: string;
  sustituto?: string;
  lote?: string;
  posicion?: string;
}

export interface Apartada {
  incidencia: string;
  estado: "esperando" | "autorizada" | "rechazada";
  loteNuevo: string;
}

export interface EstadoTrabajo {
  estado: "en_cola" | "surtiendo" | "pausado" | "transito" | "confirmado" | "cancelado";
  linea: number;
  tomados: { nombre: string; posicion: string; bultos: string }[];
  resultados: Record<string, Resultado>;
  contenedor: { n: number; bultos: number };
  apartadas: Record<string, Apartada>;
  salidaMs?: number;
  confirmado?: { hora: string; quien: string; diferencia?: { causa: string; incidencia: string } };
  cancelado?: { hora: string; quien: string; motivo: string };
}

export const surtidoStore = crearStore<Record<string, EstadoTrabajo>>(CLAVES.surtido, {});

export const ESTADO_INICIAL: EstadoTrabajo = {
  estado: "en_cola",
  linea: 0,
  tomados: [],
  resultados: {},
  contenedor: { n: 1, bultos: 0 },
  apartadas: {},
};

export const estadoDe = (id: string, todos = surtidoStore.get()) => todos[id] ?? ESTADO_INICIAL;

export function actualizarTrabajo(id: string, cambio: (e: EstadoTrabajo) => Partial<EstadoTrabajo>) {
  surtidoStore.set((todos) => {
    const actual = todos[id] ?? ESTADO_INICIAL;
    return { ...todos, [id]: { ...actual, ...cambio(actual) } };
  });
}

/** Minutos estimados para surtir lo que queda de un trabajo. */
export function minutosRestantes(t: Trabajo, desde = 0) {
  const quedan = t.lineas.slice(desde);
  return Math.round(quedan.length * 1.75 + (quedan.some((l) => l.piso === "A") ? 8 : 0));
}

export const minutosDelDia = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

/** Cola del día: urgencias primero; lo demás por hora de salida. Sin lo ya despachado. */
export function colaDelDia(todos = surtidoStore.get()) {
  return trabajosDelDia().filter((t) => ["en_cola", "surtiendo", "pausado"].includes(estadoDe(t.id, todos).estado)).sort(
    (a, b) => (a.sale === "ahora" ? -1 : minutosDelDia(a.sale)) - (b.sale === "ahora" ? -1 : minutosDelDia(b.sale)),
  );
}

/** Posición alterna con existencia del mismo insumo (S1, S5, S6). */
export const otraExistencia = (i: Insumo) =>
  i.posicion.startsWith("PB-R") ? i.posicion.replace(/N(\d)/, (_, n: string) => `N${Number(n) + 1}`) : "PA-R12-N1-P06";

/** Siguiente lote después del FEFO (el que "vence después"). */
export const loteSiguiente = (i: Insumo) =>
  i.lote ? i.lote.codigo.replace(/^L(\d\d)/, (_, d: string) => `L${String((Number(d) + 7) % 31 || 1).padStart(2, "0")}`) : "";

/** El área escanea el contenedor y confirma la recepción (conforme o con diferencia). */
export function confirmarRecepcionArea(id: string, hora: string, quien = trabajoDe(id).recibe, diferencia?: { causa: string; incidencia: string }) {
  actualizarTrabajo(id, () => ({ estado: "confirmado", confirmado: { hora, quien, diferencia } }));
}

/** El área cancela un pedido que todavía no sale del almacén. */
export function cancelarPedidoArea(id: string, cancelado?: { hora: string; quien: string; motivo: string }) {
  actualizarTrabajo(id, () => ({ estado: "cancelado", cancelado }));
}
