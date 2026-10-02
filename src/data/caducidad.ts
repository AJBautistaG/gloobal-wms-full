import { CLAVES } from "@/lib/almacenamiento";
import { HOY, rel, sumarDias } from "@/lib/fecha";
import { crearStore } from "@/lib/store";
import { diasEntre, horaActual } from "@/lib/utils";
import { insumoDe } from "./surtido";

/**
 * Lote y caducidad en el almacén: inventario por lote y posición, política de vida útil al
 * recibir, bloqueos y descarte (merma), y la exactitud de lote (lote físico contra sistema).
 * Indicadores: KPI-14 inventario próximo a vencer, KPI-15 merma, KPI-23 exactitud de lote.
 */

// ── Política de vida útil mínima al recibir (configurable en la torre) ──

export interface PoliticaVidaUtil {
  /** Días mínimos que le deben quedar al lote al recibirlo. */
  refrigerado: number;
  seco: number;
}

export const politicaStore = crearStore<PoliticaVidaUtil>(CLAVES.politicaVidaUtil, { refrigerado: 10, seco: 60 });

/** Revisa la caducidad de un lote que se está recibiendo. */
export function revisarVidaUtil(caducidad: string, refrigerado: boolean, politica = politicaStore.get()) {
  const quedan = diasEntre(HOY, caducidad);
  const minimo = refrigerado ? politica.refrigerado : politica.seco;
  if (quedan < 0) return { estado: "vencido" as const, quedan, minimo };
  if (quedan < minimo) return { estado: "corta" as const, quedan, minimo };
  return { estado: "ok" as const, quedan, minimo };
}

/** Una fecha tecleada a mano: una vencida avisa (y la política la manda a cuarentena); una absurda no deja seguir. */
export function revisarFechaManual(fecha: string): { bloquea: boolean; texto: string } | null {
  if (!fecha) return null;
  const dias = diasEntre(HOY, fecha);
  if (dias < 0) return { bloquea: false, texto: "Esa fecha ya pasó: el lote está vencido. Revisa la etiqueta; si es correcta, se recibe a cuarentena." };
  if (dias > 365 * 5) return { bloquea: true, texto: "La fecha es de más de 5 años. Revisa que el año esté bien." };
  return null;
}

// ── Inventario por lote en posiciones (datos de ejemplo) ─────────

export interface BultoLote {
  id: string;
  sku: string;
  lote: string;
  caducidad: string;
  cantidad: number;
  bultos: number;
  posicion: string;
}

const lote = (id: string, sku: string, lote: string, dias: number, bultos: number, posicion: string): BultoLote => {
  const i = insumoDe(sku);
  return { id, sku, lote, caducidad: sumarDias(HOY, dias), cantidad: Number((bultos * i.manejo.contenido).toFixed(2)), bultos, posicion };
};

/** Lo que hay hoy en piso, por lote. Fechas relativas a hoy para que el semáforo siempre tenga de todo. */
export const INVENTARIO: BultoLote[] = [
  // Vencidos
  { ...lote("B-101", "HAR-GM50", "L180924", 0, 2, "PA-R04-N3-P02"), caducidad: rel("2024-09-18") },
  lote("B-102", "QCR-10", "L150925", -6, 3, "PB-CF2"),
  lote("B-103", "CRE-UHT", "L200925", -3, 2, "PB-CF1"),
  // 0 a 7 días
  lote("B-104", "HUE-LIQ", "L260925", 4, 5, "PB-CF2"),
  lote("B-105", "QCR-10", "L220925", 6, 4, "PB-CF2"),
  lote("B-106", "MAN-10", "L240925", 2, 3, "PB-CF2"),
  // 8 a 15 días
  lote("B-107", "HAR-GM50", "L230825", 10, 12, "PB-R02-N1-P05"),
  lote("B-108", "CRE-UHT", "L011025", 13, 8, "PB-CF1"),
  lote("B-109", "LEC-P25", "L050925", 15, 4, "PB-R05-N1-P02"),
  // 16 a 30 días
  lote("B-110", "AVE-10", "L090925", 21, 6, "PB-R03-N1-P04"),
  lote("B-111", "CHO-05", "L120925", 28, 10, "PB-R07-N2-P03"),
  // Más de 30 días
  lote("B-112", "AZU-R25", "L010925", 240, 24, "PB-R02-N1-P08"),
  lote("B-113", "SAL-25", "L020925", 500, 12, "PB-R02-N1-P09"),
  lote("B-114", "ACE-18", "L030925", 180, 12, "PA-R10-N1-P01"),
  lote("B-115", "LEV-10", "L200925", 110, 5, "PA-R12-N2-P05"),
  lote("B-116", "HAR-INT", "L070925", 95, 6, "PA-R12-N1-P03"),
  lote("B-117", "CAC-05", "L100925", 300, 8, "PA-R12-N3-P01"),
  lote("B-118", "VAI-04", "L110925", 400, 6, "PB-R03-N2-P03"),
  lote("B-119", "AZU-G25", "L130925", 200, 6, "PB-R02-N1-P07"),
  lote("B-120", "HAR-GM50", "L280925", 75, 28, "PA-R12-N2-P04"),
];

export type Ventana = "vencido" | "0-7" | "8-15" | "16-30" | "mas30";

export const VENTANAS: { id: Ventana; nombre: string }[] = [
  { id: "vencido", nombre: "Vencidos" },
  { id: "0-7", nombre: "0 a 7 días" },
  { id: "8-15", nombre: "8 a 15 días" },
  { id: "16-30", nombre: "16 a 30 días" },
  { id: "mas30", nombre: "Más de 30 días" },
];

export const diasPara = (b: BultoLote) => diasEntre(HOY, b.caducidad);
export function ventanaDe(dias: number): Ventana {
  if (dias < 0) return "vencido";
  if (dias <= 7) return "0-7";
  if (dias <= 15) return "8-15";
  if (dias <= 30) return "16-30";
  return "mas30";
}

// ── Bloqueos y descarte (persistente) ───────────────────────────

export interface EstadoLote {
  estado: "bloqueado" | "descarte";
  hora: string;
  quien: string;
  causa?: string;
}

export const estadoLotesStore = crearStore<Record<string, EstadoLote>>(CLAVES.estadoLotes, {});

export const CAUSAS_MERMA = ["Vencido", "Vida útil corta, sin consumo posible", "Dañado", "Rechazo de Calidad"];

export interface Merma {
  fecha: string;
  hora: string;
  sku: string;
  lote: string;
  bultos: number;
  cantidad: number;
  causa: string;
  quien: string;
}

/** Merma: incluye registros de ejemplo de días anteriores. */
const MERMA_EJEMPLO: Merma[] = [
  { fecha: sumarDias(HOY, -9), hora: "16:10", sku: "CRE-UHT", lote: "L280825", bultos: 2, cantidad: 24, causa: "Vencido", quien: "Marisol Quintero" },
  { fecha: sumarDias(HOY, -6), hora: "11:42", sku: "HUE-LIQ", lote: "L150925", bultos: 1, cantidad: 10, causa: "Dañado", quien: "Rosa Villalaz" },
  { fecha: sumarDias(HOY, -2), hora: "09:05", sku: "QCR-10", lote: "L050925", bultos: 1, cantidad: 10, causa: "Vencido", quien: "Marisol Quintero" },
];

export const mermaStore = crearStore<Merma[]>(CLAVES.merma, MERMA_EJEMPLO);

export function bloquearLote(b: BultoLote, quien: string) {
  estadoLotesStore.set((todos) => ({ ...todos, [b.id]: { estado: "bloqueado", hora: horaActual(), quien } }));
}

export function liberarLote(b: BultoLote) {
  estadoLotesStore.set((todos) => {
    const { [b.id]: _, ...resto } = todos;
    return resto;
  });
}

/** Manda el lote a descarte con causa obligatoria: sale del inventario y cuenta como merma. */
export function descartarLote(b: BultoLote, causa: string, quien: string) {
  const hora = horaActual();
  estadoLotesStore.set((todos) => ({ ...todos, [b.id]: { estado: "descarte", hora, quien, causa } }));
  mermaStore.set((m) => [...m, { fecha: HOY, hora, sku: b.sku, lote: b.lote, bultos: b.bultos, cantidad: b.cantidad, causa, quien }]);
}

// ── Exactitud de lote: lote físico contra sistema (persistente) ──

export interface Exactitud {
  coinciden: number;
  difieren: number;
  eventos: { hora: string; posicion: string; esperado: string; leido: string; quien: string }[];
}

/** Arranca con lecturas de ejemplo del mes (186 de 195 coinciden) más lo que se registre hoy. */
export const exactitudStore = crearStore<Exactitud>(CLAVES.exactitudLote, { coinciden: 186, difieren: 9, eventos: [] });

export function registrarLecturaLote(coincide: boolean, detalle?: { posicion: string; esperado: string; leido: string; quien: string }) {
  exactitudStore.set((e) => ({
    coinciden: e.coinciden + (coincide ? 1 : 0),
    difieren: e.difieren + (coincide ? 0 : 1),
    eventos: detalle ? [{ hora: horaActual(), ...detalle }, ...e.eventos].slice(0, 30) : e.eventos,
  }));
}

// ── Indicadores ─────────────────────────────────────────────────

export function indicadoresCaducidad(estados = estadoLotesStore.get(), merma = mermaStore.get(), exactitud = exactitudStore.get()) {
  const vivos = INVENTARIO.filter((b) => estados[b.id]?.estado !== "descarte");
  const porVentana = Object.fromEntries(VENTANAS.map((v) => [v.id, { bultos: 0, lotes: 0 }])) as Record<Ventana, { bultos: number; lotes: number }>;
  for (const b of vivos) {
    const v = porVentana[ventanaDe(diasPara(b))];
    v.bultos += b.bultos;
    v.lotes += 1;
  }
  const totalBultos = vivos.reduce((s, b) => s + b.bultos, 0);
  const proximos = porVentana["0-7"].bultos + porVentana["8-15"].bultos + porVentana["16-30"].bultos;
  // Merma de los últimos 30 días (así no queda en cero al inicio de cada mes).
  const delMes = merma.filter((m) => diasEntre(m.fecha, HOY) <= 30);
  const lecturas = exactitud.coinciden + exactitud.difieren;
  return {
    porVentana,
    totalBultos,
    /** KPI-14: bultos que vencen en 30 días o menos (sin contar los ya vencidos). */
    proximos,
    proximosPct: totalBultos ? Math.round((proximos / totalBultos) * 100) : 0,
    vencidosSinBloquear: vivos.filter((b) => diasPara(b) < 0 && !estados[b.id]).length,
    /** KPI-15: merma de los últimos 30 días. */
    mermaBultos: delMes.reduce((s, m) => s + m.bultos, 0),
    mermaRegistros: delMes.length,
    mermaPorCausa: CAUSAS_MERMA.map((c) => ({ causa: c, bultos: delMes.filter((m) => m.causa === c).reduce((s, m) => s + m.bultos, 0) })).filter((x) => x.bultos),
    /** KPI-23: exactitud de lote. */
    exactitudPct: lecturas ? Math.round((exactitud.coinciden / lecturas) * 1000) / 10 : 100,
    lecturas,
    difieren: exactitud.difieren,
  };
}
