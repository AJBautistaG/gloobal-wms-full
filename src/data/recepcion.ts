import { HOY, rel } from "@/lib/fecha";
import { loteDe } from "@/lib/gs1";
import { diasEntre } from "@/lib/utils";

export { HOY };
export const RECIBE = "Rodolfo Paz";

export type Zona = "Seco" | "Refrigerado" | "Congelado";
export type Transporte = "seco" | "refrigerado" | "congelado";
export type EstadoOrden = "con_cita" | "vencida" | "adelantada";

export interface Producto {
  codigo: string;
  nombre: string;
  presentacion: string;
  /** Bultos esperados (cajas, sacos…) según la orden. */
  cajas: number;
  unidadesPorCaja: number;
  unidadInterna: string;
  unidadInternaPlural: string;
  /** Unidad en la que se cuenta al recibir. */
  unidadManejo: string;
  unidadManejoPlural: string;
  sinCaducidad: boolean;
  /** Peso de cada unidad interna, en gramos. */
  pesoUnidad: number;
  lote: string;
  caducidad: string;
  /** Caducidad del lote que ya está en piso, si hay. */
  loteEnPiso: string | null;
  zona: Zona;
  /** Bultos de esta línea que llegaron en una entrega anterior (OC parcial). */
  recibidoPrevio?: number;
}

export interface Orden {
  oc: string;
  proveedor: string;
  fechaProgramada: string;
  cita: string | null;
  estado: EstadoOrden;
  transporte: Transporte;
  llegada: { hora: string; transportista: string; placa: string; anden: string };
  productos: Producto[];
}

export interface Proveedor {
  id: string;
  nombre: string;
  ordenes: Orden[];
}

function producto(
  codigo: string,
  nombre: string,
  presentacion: string,
  cajas: number,
  unidadesPorCaja: number,
  [unidadInterna, unidadInternaPlural]: [string, string],
  pesoUnidad: number,
  lote: string,
  caducidad: string,
  loteEnPiso: string | null,
  zona: Zona,
): Producto {
  const porPieza = unidadesPorCaja === 1;
  return {
    codigo,
    nombre,
    presentacion,
    cajas,
    unidadesPorCaja,
    unidadInterna,
    unidadInternaPlural,
    unidadManejo: porPieza ? unidadInterna : "caja",
    unidadManejoPlural: porPieza ? unidadInternaPlural : "cajas",
    sinCaducidad: caducidad === "",
    pesoUnidad,
    lote,
    caducidad: rel(caducidad),
    loteEnPiso: rel(loteEnPiso),
    zona,
  };
}

const RUTAS_DEL_SUR = { hora: "8:34", transportista: "Rutas del Sur", placa: "PA-4471", anden: "A-1" };
const TRANSPORTES_CHAME = { hora: "9:02", transportista: "Transportes Chame", placa: "PA-3380", anden: "A-2" };

export const PROVEEDORES: Proveedor[] = [
  {
    id: "alimentos-primera",
    nombre: "Alimentos de Primera",
    ordenes: [
      {
        oc: "OC-7142",
        proveedor: "Alimentos de Primera",
        fechaProgramada: HOY,
        cita: "8:30",
        estado: "con_cita",
        transporte: "refrigerado",
        llegada: RUTAS_DEL_SUR,
        productos: [
          producto("MOM-4412", "Mermelada de fresa", "500 g", 6, 10, ["frasco", "frascos"], 500, "L-2603A", "2027-03-12", "2026-09-28", "Seco"),
          producto("MOM-4418", "Galleta de coco", "200 g", 4, 12, ["paquete", "paquetes"], 200, "L-2604C", "2027-01-20", "2026-12-02", "Seco"),
          producto("MOM-3107", "Mantequilla sin sal", "1 kg", 6, 25, ["barra", "barras"], 1000, "L-2609M", "2026-12-15", "2026-11-02", "Refrigerado"),
          producto("MOM-3120", "Crema de leche", "1 L", 5, 24, ["envase", "envases"], 1000, "L-2609K", "2026-10-30", "2026-11-05", "Refrigerado"),
          producto("MOM-3125", "Queso crema", "1.5 kg", 5, 20, ["barra", "barras"], 1500, "L-2608Q", "2026-12-01", "2026-10-20", "Refrigerado"),
          producto("MOM-5210", "Pulpa de maracuyá", "1 kg", 4, 40, ["bolsa", "bolsas"], 1000, "L-2609P", "2027-02-10", null, "Refrigerado"),
          producto("MOM-4430", "Leche condensada", "400 g", 4, 120, ["lata", "latas"], 400, "L-2607L", "2027-06-30", "2027-03-15", "Seco"),
          producto("MOM-3140", "Margarina de hojaldre", "2 kg", 4, 25, ["bloque", "bloques"], 2000, "L-2609H", "2027-01-05", "2026-12-10", "Refrigerado"),
          producto("MOM-3150", "Huevo líquido pasteurizado", "1 kg", 4, 57, ["envase", "envases"], 1000, "L-2609E", "2026-10-25", "2026-10-12", "Refrigerado"),
        ],
      },
      {
        oc: "OC-7131",
        proveedor: "Alimentos de Primera",
        fechaProgramada: rel("2026-09-25"),
        cita: null,
        estado: "vencida",
        transporte: "seco",
        llegada: TRANSPORTES_CHAME,
        productos: [
          producto("MOM-4412", "Mermelada de fresa", "500 g", 3, 10, ["frasco", "frascos"], 500, "L-2603B", "2027-03-20", "2026-09-28", "Seco"),
          producto("MOM-4418", "Galleta de coco", "200 g", 3, 12, ["paquete", "paquetes"], 200, "L-2604D", "2027-01-28", "2026-12-02", "Seco"),
          producto("MOM-4430", "Leche condensada", "400 g", 2, 120, ["lata", "latas"], 400, "L-2607M", "2027-07-05", "2027-03-15", "Seco"),
        ],
      },
      {
        oc: "OC-7150",
        proveedor: "Alimentos de Primera",
        fechaProgramada: rel("2026-10-02"),
        cita: null,
        estado: "adelantada",
        transporte: "refrigerado",
        llegada: TRANSPORTES_CHAME,
        productos: [
          producto("MOM-3107", "Mantequilla sin sal", "1 kg", 3, 25, ["barra", "barras"], 1000, "L-2610M", "2026-12-28", "2026-11-02", "Refrigerado"),
          producto("MOM-3120", "Crema de leche", "1 L", 3, 24, ["envase", "envases"], 1000, "L-2610K", "2026-11-10", "2026-11-05", "Refrigerado"),
          producto("MOM-3125", "Queso crema", "1.5 kg", 3, 20, ["barra", "barras"], 1500, "L-2610Q", "2026-12-12", "2026-10-20", "Refrigerado"),
          producto("MOM-3140", "Margarina de hojaldre", "2 kg", 3, 25, ["bloque", "bloques"], 2000, "L-2610H", "2027-01-15", "2026-12-10", "Refrigerado"),
          producto("MOM-4412", "Mermelada de fresa", "500 g", 2, 10, ["frasco", "frascos"], 500, "L-2603C", "2027-03-28", "2026-09-28", "Seco"),
          producto("MOM-4450", "Dulce de leche", "1 kg", 3, 12, ["frasco", "frascos"], 1000, "L-2610D", "2027-04-15", null, "Seco"),
        ],
      },
    ],
  },
  {
    id: "pastas-istmo",
    nombre: "Pastas del Istmo",
    ordenes: [
      {
        oc: "OC-7148",
        proveedor: "Pastas del Istmo",
        fechaProgramada: HOY,
        cita: "10:00",
        estado: "con_cita",
        transporte: "seco",
        llegada: { hora: "10:06", transportista: "Carga Istmeña", placa: "PA-1829", anden: "A-3" },
        // OC parcial: hace cuatro días llegó una primera entrega.
        productos: [
          { ...producto("MOM-2210", "Harina de trigo suave", "25 kg", 4, 1, ["saco", "sacos"], 25000, "L-2609T", "2027-03-01", "2027-01-15", "Seco"), recibidoPrevio: 2 },
          { ...producto("MOM-2215", "Azúcar refinada", "25 kg", 3, 1, ["saco", "sacos"], 25000, "L-2609Z", "2028-09-01", "2028-05-10", "Seco"), recibidoPrevio: 3 },
          producto("MOM-2230", "Fideo cabello de ángel", "400 g", 2, 20, ["paquete", "paquetes"], 400, "L-2608F", "2027-08-12", null, "Seco"),
          { ...producto("MOM-2240", "Pasta lasaña", "500 g", 2, 16, ["estuche", "estuches"], 500, "L-2608S", "2027-07-20", null, "Seco"), recibidoPrevio: 2 },
        ],
      },
    ],
  },
  {
    id: "empaques-delta",
    nombre: "Empaques Delta",
    ordenes: [
      {
        oc: "OC-7149",
        proveedor: "Empaques Delta",
        fechaProgramada: HOY,
        cita: "13:30",
        estado: "con_cita",
        transporte: "seco",
        llegada: { hora: "13:41", transportista: "Delta Logística", placa: "PA-5566", anden: "A-2" },
        productos: [
          producto("EMP-1032", "Caja para pastel 10 in", "1 pza", 4, 50, ["pieza", "piezas"], 120, "L-2609C", "", null, "Seco"),
          producto("EMP-1040", "Base de cartón dorada 10 in", "1 pza", 2, 100, ["base", "bases"], 60, "L-2609B", "", null, "Seco"),
        ],
      },
    ],
  },
  { id: "alimentos-norte", nombre: "Alimentos del Norte", ordenes: [] },
];

// El lote de cada línea es el impreso en la etiqueta GS1-128 que Momi envía al proveedor con la OC
// (iniciales + fecha de la cita + secuencia). Así la etiqueta, el PDA y la trazabilidad dicen lo mismo.
for (const { ordenes } of PROVEEDORES)
  for (const o of ordenes) for (const p of o.productos) p.lote = loteDe(p.nombre, o.fechaProgramada);

/** La orden cuyo camión ya está en el andén. */
export const OC_EN_ANDEN = "OC-7142";

export const RANGO_TEMPERATURA: Record<Transporte, { min: number; max: number } | null> = {
  refrigerado: { min: 0, max: 4 },
  congelado: { min: -25, max: -16 },
  seco: null,
};

/** Datos de ejemplo para una entrega sin orden de compra que queda en resguardo. */
export const RESGUARDO = {
  entrego: "J. Moreno",
  placa: "PA-2210",
  zona: "Zona R-01",
  recibio: RECIBE,
  compras: "Ana Batista",
  hora: "11:26",
  limite: "15:00",
};

// ── Excepciones de recepción ─────────────────────────────────────

export type DestinoDano = "disponible" | "cuarentena" | "cuarentena_critica";

/**
 * Rasgos del daño y adónde manda el sistema la mercancía. El recibidor no decide:
 * elige lo que ve y toma la foto. El rechazo solo lo decide Calidad.
 */
export const TIPOS_DANO: { id: string; texto: string; destino: DestinoDano }[] = [
  { id: "exterior", texto: "Caja exterior golpeada, producto íntegro", destino: "disponible" },
  { id: "primario", texto: "Empaque primario roto o con fuga", destino: "cuarentena" },
  { id: "humedad", texto: "Humedad o manchas", destino: "cuarentena" },
  { id: "aplastado", texto: "Producto aplastado o deformado", destino: "cuarentena" },
  { id: "plaga", texto: "Señales de plaga", destino: "cuarentena_critica" },
  { id: "frio", texto: "Cadena de frío rota (descongelado o tibio)", destino: "cuarentena_critica" },
];

export const TEXTO_DESTINO_DANO: Record<DestinoDano, { titulo: string; detalle: string }> = {
  disponible: {
    titulo: "Entra disponible con observación",
    detalle: "El producto está íntegro. Queda anotado en el lote.",
  },
  cuarentena: {
    titulo: "Va a cuarentena",
    detalle: "No queda disponible hasta que Calidad decida: liberar, mantener o rechazar.",
  },
  cuarentena_critica: {
    titulo: "Cuarentena crítica · aislar ya",
    detalle: "Sepáralo del resto de la descarga. Se avisó a Calidad de inmediato.",
  },
};

/** Productos del catálogo que no están en ninguna OC abierta. */
const CATALOGO_EXTRA = [{ codigo: "MOM-4460", nombre: "Chispas de chocolate", presentacion: "1 kg", zona: "Seco" as Zona }];

/** Código de barras que no existe en el catálogo, para simular R3. */
export const CODIGO_DESCONOCIDO = "7501234567890";

/**
 * Un producto conocido que no pertenece a la orden, para simular R2. Si está en otra
 * OC abierta del mismo proveedor, se indica para que Compras decida contra cuál recibir.
 */
export function productoAjeno(orden: Orden) {
  const codigos = new Set(orden.productos.map((p) => p.codigo));
  for (const otra of ordenesDe(orden.proveedor)) {
    if (otra.oc === orden.oc) continue;
    const p = otra.productos.find((x) => !codigos.has(x.codigo));
    if (p) return { codigo: p.codigo, nombre: p.nombre, presentacion: p.presentacion, zona: p.zona, enOtraOc: otra };
  }
  return { ...CATALOGO_EXTRA[0], enOtraOc: null as Orden | null };
}

export const CAUSAS_DIFERENCIA = [
  "Proveedor entregó parcial",
  "Producto dañado",
  "No llegó",
  "Diferencia de unidad de medida",
  "Producto equivocado",
];

export const CAUSAS_ADELANTADA = ["El proveedor se adelantó", "Momi lo pidió antes", "Consolidó dos entregas"];
export const CAUSAS_VENCIDA = [
  "El proveedor se atrasó",
  "Problema de transporte",
  "No tenía producto",
  "Momi reprogramó",
];

export const todasLasOrdenes = () => PROVEEDORES.flatMap((p) => p.ordenes);

export const buscarOrden = (oc: string) =>
  todasLasOrdenes().find((o) => o.oc.toLowerCase() === oc.trim().toLowerCase());

export const ordenesDe = (proveedor: string) => PROVEEDORES.find((p) => p.nombre === proveedor)?.ordenes ?? [];

/** Kilos de `cajas` bultos de un producto, redondeado a un decimal. */
export const kilos = (p: Producto, cajas: number) => Math.round(((cajas * p.unidadesPorCaja * p.pesoUnidad) / 1000) * 10) / 10;

export function totales(orden: Orden) {
  return {
    productos: orden.productos.length,
    cajas: orden.productos.reduce((s, p) => s + p.cajas, 0),
    kg: Math.round(orden.productos.reduce((s, p) => s + (p.cajas * p.unidadesPorCaja * p.pesoUnidad) / 1000, 0)),
  };
}

export const diasDesdeHoy = (fecha: string) => diasEntre(HOY, fecha);

export interface Cita extends Orden {
  productosTotal: number;
  cajasTotal: number;
  kgTotal: number;
  enAnden: boolean;
}

/** Citas de hoy ordenadas por hora. */
export function citasDeHoy(): Cita[] {
  const minutos = (h: string) => {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm;
  };
  return todasLasOrdenes()
    .filter((o) => o.fechaProgramada === HOY && o.cita)
    .map((o) => {
      const t = totales(o);
      return { ...o, productosTotal: t.productos, cajasTotal: t.cajas, kgTotal: t.kg, enAnden: o.oc === OC_EN_ANDEN };
    })
    .sort((a, b) => minutos(a.cita!) - minutos(b.cita!));
}
