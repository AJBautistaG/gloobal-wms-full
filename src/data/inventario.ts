import { CLAVES } from "@/lib/almacenamiento";
import { HOY, FOLIO_DIA } from "@/lib/fecha";
import { crearStore } from "@/lib/store";
import { horaActual } from "@/lib/utils";
import { INVENTARIO, diasPara, estadoLotesStore, mermaStore, type EstadoLote, type Merma } from "./caducidad";
import { kilos, todasLasOrdenes, type Orden, type Producto } from "./recepcion";
import {
  INSUMOS,
  estadoDe,
  pedidosAreaStore,
  surtidoStore,
  trabajosDelDia,
  type EstadoTrabajo,
  type PedidoArea,
} from "./surtido";

/**
 * Existencia global del Almacén Central: lo que había al abrir el día, más lo que entra por
 * recepción, menos lo que sale por surtido y lo que se descarta como merma. De ahí se resta lo
 * comprometido (pedidos en cola), lo bloqueado y lo que está en cuarentena para saber qué hay
 * disponible para surtir.
 */

export interface Articulo {
  sku: string;
  nombre: string;
  /** Unidad en la que se lleva la existencia (KG, LT, PZA). */
  unidad: string;
  /** Cuánto trae cada bulto, en esa unidad. */
  contenido: number;
  bulto: string;
  bultos: string;
  /** Existencia al abrir el día, en la unidad. */
  apertura: number;
  /** Códigos con que lo entregan los proveedores. */
  codigosProveedor: string[];
}

/** Código del proveedor → artículo del catálogo de surtido, cuando es el mismo insumo. */
const EQUIVALE: Record<string, string> = {
  "MOM-3107": "MAN-10",
  "MOM-3120": "CRE-UHT",
  "MOM-3125": "QCR-10",
  "MOM-3150": "HUE-LIQ",
  "MOM-2215": "AZU-R25",
  "EMP-1032": "EMP-C10",
  "EMP-1040": "EMP-B10",
};

/** Productos de proveedor que no están en el catálogo de surtido (todos se llevan en KG): arrancan el día con 3 cajas. */
function articuloDeProveedor(p: Producto): Articulo {
  const contenido = kilos(p, 1);
  return {
    sku: p.codigo,
    nombre: p.nombre,
    unidad: "KG",
    contenido,
    bulto: p.unidadManejo,
    bultos: p.unidadManejoPlural,
    apertura: Number((contenido * 3).toFixed(2)),
    codigosProveedor: [p.codigo],
  };
}

export const ARTICULOS: Articulo[] = (() => {
  const lista: Articulo[] = INSUMOS.map((i) => ({
    sku: i.sku,
    nombre: i.nombre,
    unidad: i.unidad,
    contenido: i.manejo.contenido,
    bulto: i.manejo.nombre,
    bultos: i.manejo.plural,
    apertura: i.stock,
    codigosProveedor: Object.entries(EQUIVALE)
      .filter(([, sku]) => sku === i.sku)
      .map(([c]) => c),
  }));
  const vistos = new Set(lista.map((a) => a.sku));
  for (const o of todasLasOrdenes())
    for (const p of o.productos) {
      if (EQUIVALE[p.codigo] || vistos.has(p.codigo)) continue;
      vistos.add(p.codigo);
      lista.push(articuloDeProveedor(p));
    }
  return lista;
})();

export const articuloDe = (sku: string) => ARTICULOS.find((a) => a.sku === sku);
export const skuDeProveedor = (codigo: string) => EQUIVALE[codigo] ?? codigo;
const r2 = (n: number) => Number(n.toFixed(2));

/** Cantidad de un producto de proveedor, convertida a la unidad del artículo del Central. */
export function cantidadRecibida(p: Producto, cajas: number) {
  const a = articuloDe(skuDeProveedor(p.codigo))!;
  return a.unidad === "PZA" ? cajas * p.unidadesPorCaja : kilos(p, cajas);
}

// ── Entradas por recepción (persistentes) ───────────────────────

export interface Entrada {
  hora: string;
  documento: string;
  proveedor: string;
  sku: string;
  cantidad: number;
  bultos: number;
  /** Bultos que entraron a cuarentena (vida útil, daño). Cuentan en existencia, no en disponible. */
  cuarentena: number;
  quien: string;
}

/** Lo que ya se recibió hoy antes de la demo. */
const ENTRADAS_EJEMPLO: Entrada[] = [
  { hora: "06:40", documento: "OC-7136", proveedor: "Alimentos de Primera", sku: "CRE-UHT", cantidad: 48, bultos: 4, cuarentena: 0, quien: "Rodolfo Paz" },
  { hora: "06:40", documento: "OC-7136", proveedor: "Alimentos de Primera", sku: "QCR-10", cantidad: 20, bultos: 2, cuarentena: 0, quien: "Rodolfo Paz" },
  { hora: "07:25", documento: "OC-7139", proveedor: "Pastas del Istmo", sku: "HAR-GM50", cantidad: 226.8, bultos: 10, cuarentena: 0, quien: "Rodolfo Paz" },
];

export const entradasStore = crearStore<Entrada[]>(CLAVES.entradasCentral, ENTRADAS_EJEMPLO);

/** Al cerrar la recepción, lo recibido entra a la existencia del Central. */
export function registrarEntradaRecepcion(orden: Orden, recibidas: Record<string, number>, cuarentena: Record<string, number>, quien: string) {
  const hora = horaActual();
  const nuevas: Entrada[] = orden.productos.flatMap((p) => {
    const cajas = recibidas[p.codigo] ?? 0;
    if (!cajas) return [];
    return [{ hora, documento: orden.oc, proveedor: orden.proveedor, sku: skuDeProveedor(p.codigo), cantidad: cantidadRecibida(p, cajas), bultos: cajas, cuarentena: Math.min(cajas, cuarentena[p.codigo] ?? 0), quien }];
  });
  if (nuevas.length) entradasStore.set((e) => [...e, ...nuevas]);
}

// ── Salidas por surtido (salen de lo que el surtidor ya tomó) ────

export interface Salida {
  hora: string;
  documento: string;
  destino: string;
  sku: string;
  cantidad: number;
  bultos: number;
  estado: "surtido" | "transito" | "confirmado";
}

/** Surtidos de la mañana, antes de la demo. */
const SALIDAS_EJEMPLO: Salida[] = [
  { hora: "07:05", documento: `ENT-PAN-${FOLIO_DIA}-009`, destino: "Panadería", sku: "HAR-GM50", cantidad: 113.4, bultos: 5, estado: "confirmado" },
  { hora: "07:05", documento: `ENT-PAN-${FOLIO_DIA}-009`, destino: "Panadería", sku: "LEV-10", cantidad: 10, bultos: 1, estado: "confirmado" },
  { hora: "07:50", documento: `ENT-COC-${FOLIO_DIA}-010`, destino: "Cocina", sku: "CRE-UHT", cantidad: 24, bultos: 2, estado: "confirmado" },
  { hora: "07:50", documento: `ENT-COC-${FOLIO_DIA}-010`, destino: "Cocina", sku: "HUE-LIQ", cantidad: 10, bultos: 1, estado: "confirmado" },
  { hora: "08:35", documento: `ENT-DUL-${FOLIO_DIA}-011`, destino: "Dulcería", sku: "AZU-G25", cantidad: 25, bultos: 1, estado: "confirmado" },
  { hora: "08:35", documento: `ENT-DUL-${FOLIO_DIA}-011`, destino: "Dulcería", sku: "CHO-05", cantidad: 10, bultos: 2, estado: "confirmado" },
];

const ESTADO_SALIDA: Partial<Record<EstadoTrabajo["estado"], Salida["estado"]>> = {
  surtiendo: "surtido",
  pausado: "surtido",
  transito: "transito",
  confirmado: "confirmado",
};

export function salidasDelDia(estados = surtidoStore.get(), pedidos = pedidosAreaStore.get()): Salida[] {
  const salidas = [...SALIDAS_EJEMPLO];
  for (const t of trabajosDelDia(pedidos)) {
    const e = estadoDe(t.id, estados);
    const estado = ESTADO_SALIDA[e.estado];
    if (!estado) continue;
    for (const l of t.lineas) {
      const r = e.resultados[l.id];
      // Un sustituto sale de otro artículo y lo decide el área; aquí solo cuenta lo que se tomó del insumo pedido.
      if (!r || r.bultos <= 0 || r.tipo === "sustituto") continue;
      const a = articuloDe(l.sku)!;
      salidas.push({
        hora: r.hora ?? "—",
        documento: t.contenedor,
        destino: l.destino,
        sku: l.sku,
        cantidad: r2(r.bultos * a.contenido),
        bultos: r.bultos,
        estado,
      });
    }
  }
  return salidas;
}

/** Lo que está pedido y todavía no se toma de la posición. */
function comprometidoDelDia(estados: Record<string, EstadoTrabajo>, pedidos: PedidoArea[]) {
  const porSku: Record<string, number> = {};
  for (const t of trabajosDelDia(pedidos)) {
    const e = estadoDe(t.id, estados);
    if (!["en_cola", "surtiendo", "pausado"].includes(e.estado)) continue;
    for (const l of t.lineas) {
      if (e.resultados[l.id]) continue;
      const a = articuloDe(l.sku)!;
      porSku[l.sku] = (porSku[l.sku] ?? 0) + l.bultos * a.contenido;
    }
  }
  return porSku;
}

// ── Existencia por artículo ─────────────────────────────────────

export interface FilaExistencia {
  articulo: Articulo;
  apertura: number;
  entradas: number;
  salidas: number;
  merma: number;
  existencia: number;
  cuarentena: number;
  bloqueado: number;
  comprometido: number;
  disponible: number;
  estado: "ok" | "bajo" | "falta";
  /** Días para la caducidad del lote más próximo en posiciones, si se conoce. */
  proximaCaducidad: number | null;
}

export type Movimiento =
  | ({ tipo: "entrada" } & Entrada)
  | ({ tipo: "salida" } & Salida)
  | { tipo: "merma"; hora: string; documento: string; sku: string; cantidad: number; bultos: number; causa: string; quien: string };

export function existenciaGlobal(
  entradas: Entrada[] = entradasStore.get(),
  estados: Record<string, EstadoTrabajo> = surtidoStore.get(),
  pedidos: PedidoArea[] = pedidosAreaStore.get(),
  merma: Merma[] = mermaStore.get(),
  lotes: Record<string, EstadoLote> = estadoLotesStore.get(),
) {
  const salidas = salidasDelDia(estados, pedidos);
  const comprometido = comprometidoDelDia(estados, pedidos);
  const mermaHoy = merma.filter((m) => m.fecha === HOY);
  const suma = <T extends { sku: string }>(lista: T[], sku: string, valor: (x: T) => number) => lista.filter((x) => x.sku === sku).reduce((s, x) => s + valor(x), 0);

  const filas: FilaExistencia[] = ARTICULOS.map((a) => {
    const ent = suma(entradas, a.sku, (x) => x.cantidad);
    const sal = suma(salidas, a.sku, (x) => x.cantidad);
    const mer = suma(mermaHoy, a.sku, (x) => x.cantidad);
    const existencia = r2(Math.max(0, a.apertura + ent - sal - mer));
    const cuarentena = r2(suma(entradas, a.sku, (x) => x.cuarentena * a.contenido));
    const bloqueado = r2(INVENTARIO.filter((b) => b.sku === a.sku && lotes[b.id]?.estado === "bloqueado").reduce((s, b) => s + b.cantidad, 0));
    const comp = r2(comprometido[a.sku] ?? 0);
    const disponible = r2(existencia - cuarentena - bloqueado - comp);
    const vivos = INVENTARIO.filter((b) => b.sku === a.sku && lotes[b.id]?.estado !== "descarte").map(diasPara);
    return {
      articulo: a,
      apertura: a.apertura,
      entradas: r2(ent),
      salidas: r2(sal),
      merma: r2(mer),
      existencia,
      cuarentena,
      bloqueado,
      comprometido: comp,
      disponible,
      estado: disponible < 0 ? "falta" : disponible < a.contenido * 2 ? "bajo" : "ok",
      proximaCaducidad: vivos.length ? Math.min(...vivos) : null,
    };
  });

  const enBultos = (sku: string, cantidad: number) => cantidad / articuloDe(sku)!.contenido;
  const bultos = (f: (x: FilaExistencia) => number) => Math.round(filas.reduce((s, x) => s + enBultos(x.articulo.sku, f(x)), 0));

  const movimientos: Movimiento[] = [
    ...entradas.map((e) => ({ tipo: "entrada" as const, ...e })),
    ...salidas.map((s) => ({ tipo: "salida" as const, ...s })),
    ...mermaHoy.map((m) => ({ tipo: "merma" as const, hora: m.hora, documento: `Lote ${m.lote}`, sku: m.sku, cantidad: m.cantidad, bultos: m.bultos, causa: m.causa, quien: m.quien })),
  ].sort((a, b) => (b.hora ?? "").localeCompare(a.hora ?? ""));

  // Entradas y salidas por hora del día (en bultos), para la gráfica de movimiento.
  const horas = Array.from({ length: 13 }, (_, n) => n + 6);
  const deHora = (h: string) => Number(h.split(":")[0]);
  const porHora = horas.map((h) => ({
    hora: h,
    entradas: entradas.filter((e) => deHora(e.hora) === h).reduce((s, e) => s + e.bultos, 0),
    salidas: salidas.filter((s) => deHora(s.hora) === h).reduce((s, x) => s + x.bultos, 0),
  }));

  const destinos = [...new Set(salidas.map((s) => s.destino))].map((d) => ({ destino: d, bultos: salidas.filter((s) => s.destino === d).reduce((s, x) => s + x.bultos, 0) })).sort((a, b) => b.bultos - a.bultos);

  return {
    filas,
    movimientos,
    porHora,
    destinos,
    totales: {
      existencia: bultos((x) => x.existencia),
      apertura: bultos((x) => x.apertura),
      entradas: entradas.reduce((s, e) => s + e.bultos, 0),
      documentosEntrada: new Set(entradas.map((e) => e.documento)).size,
      salidas: salidas.reduce((s, e) => s + e.bultos, 0),
      documentosSalida: new Set(salidas.map((e) => e.documento)).size,
      merma: mermaHoy.reduce((s, m) => s + m.bultos, 0),
      comprometido: bultos((x) => x.comprometido),
      faltan: filas.filter((x) => x.estado === "falta").length,
      bajos: filas.filter((x) => x.estado === "bajo").length,
    },
  };
}

export function useExistenciaGlobal() {
  const entradas = entradasStore.use();
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  const merma = mermaStore.use();
  const lotes = estadoLotesStore.use();
  return existenciaGlobal(entradas, estados, pedidos, merma, lotes);
}
