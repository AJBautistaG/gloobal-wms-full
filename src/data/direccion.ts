import { HOY } from "@/lib/fecha";
import { diasEntre, fechaConAnio, horaActual } from "@/lib/utils";
import { INVENTARIO, diasPara, estadoLotesStore, exactitudStore, type EstadoLote, type Exactitud } from "./caducidad";
import { esPendiente, incidenciasStore, type Incidencia } from "./incidencias";
import { resumenOrden, ordenesStore } from "./ordenes";
import { todasLasOrdenes } from "./recepcion";
import { recepcionesStore, type RegistroRecepcion } from "./recepciones";
import { estadoDe, insumoDe, minutosDelDia, pedidosAreaStore, surtidoStore, trabajosDelDia, type EstadoTrabajo, type PedidoArea } from "./surtido";

/**
 * Torre de Control de Dirección (propuesta TO-BE). Se organiza en Resultado (¿qué tan bien
 * cumplimos?), Capital y pérdida (¿dónde está el dinero y dónde se erosiona?) y Riesgo (¿qué puede
 * afectar el negocio?). Las cifras de negocio son de ejemplo pero cuadran entre sí en cada nivel:
 * Dirección → causa → detalle. Lo que la maqueta ya opera (lotes, surtido, citas, exactitud,
 * actividad, órdenes) sale en vivo.
 */

export const DIRECTOR = { nombre: "Eduardo Him", puesto: "Director General" };

/** Disponibilidad del dato (metadata para evaluar integración; no es para Dirección). */
export const DISPONIBILIDAD = {
  D1: "Disponible hoy",
  D2: "Calculable con WMS",
  D3: "Requiere integración (ERP, ventas, costos, producción)",
  D4: "Analítica o proyección",
} as const;
export type Disponibilidad = keyof typeof DISPONIBILIDAD;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const usd = fmt;
export const usdCorto = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/0$/, "")} M` : n >= 1e3 ? `${Math.round(n / 1e3)} K` : fmt(n));
const sumar = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// ── Periodo (meses cerrados, para que tarjetas y gráfica digan lo mismo) ──

export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export type Periodo = "mes" | "trimestre" | "anio";
export const PERIODOS: { id: Periodo; texto: string; rango: string; meses: number[]; anterior?: number[] }[] = [
  { id: "mes", texto: "Último mes cerrado", rango: "1 – 30 sep 2026", meses: [8], anterior: [7] },
  { id: "trimestre", texto: "Último trimestre", rango: "jul – sep 2026", meses: [6, 7, 8], anterior: [3, 4, 5] },
  { id: "anio", texto: "Año a la fecha", rango: "ene – sep 2026", meses: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
];
export const periodoDe = (p: Periodo) => PERIODOS.find((x) => x.id === p)!;

export const AREAS_DIR = ["Todas las áreas", "Panadería", "Dulcería", "Cocina", "Almacén Central"] as const;
export const CANALES = ["Todos los canales", "Áreas de producción", "Tiendas · rutas", "E-commerce", "Pedidos especiales"] as const;
export type AreaDir = (typeof AREAS_DIR)[number];
export type Canal = (typeof CANALES)[number];
export const TODAS: AreaDir = "Todas las áreas";
export const TODOS: Canal = "Todos los canales";
export const AREAS_PRODUCCION = ["Panadería", "Dulcería", "Cocina"] as const;
export const esProduccion = (a: AreaDir) => (AREAS_PRODUCCION as readonly string[]).includes(a);

export interface Filtros {
  periodo: Periodo;
  area: AreaDir;
  canal: Canal;
}

// ── Capital y pérdida: impacto económico de excepciones ─────────

export type Causa = "merma" | "caducidad" | "desabasto" | "diferencias";
export const CAUSAS: { id: Causa; nombre: string; clase: string; trazo: string; definicion: string }[] = [
  { id: "merma", nombre: "Merma", clase: "bg-causa-merma", trazo: "fill-causa-merma", definicion: "Producto dañado o desechado, con causa confirmada" },
  { id: "caducidad", nombre: "Caducidad", clase: "bg-causa-caducidad", trazo: "fill-causa-caducidad", definicion: "Lotes que vencieron antes de consumirse" },
  { id: "desabasto", nombre: "Desabasto", clase: "bg-causa-desabasto", trazo: "fill-causa-desabasto", definicion: "Demanda no atendida, valuada a costo" },
  { id: "diferencias", nombre: "Diferencias", clase: "bg-causa-diferencias", trazo: "fill-causa-diferencias", definicion: "Ajustes de inventario confirmados (no las que siguen en investigación)" },
];

/** Impacto mensual por causa, enero a septiembre (USD). */
export const IMPACTO_MENSUAL: Record<Causa, number[]> = {
  merma: [6100, 6400, 6700, 7000, 7300, 7700, 8100, 8500, 9180],
  caducidad: [1500, 1550, 1600, 1650, 1700, 1780, 1860, 1960, 2110],
  desabasto: [5000, 5200, 5400, 5700, 5900, 6100, 6400, 6700, 7250],
  diferencias: [1100, 1150, 1180, 1220, 1260, 1300, 1380, 1474, 1659],
};
type AreaImpacto = Exclude<AreaDir, "Todas las áreas">;
const AREAS_IMPACTO: AreaImpacto[] = ["Panadería", "Dulcería", "Cocina", "Almacén Central"];

/** Cómo se reparte el impacto de septiembre por área (los demás meses siguen la misma proporción). */
const IMPACTO_AREA_SEP: Record<Causa, Record<AreaImpacto, number>> = {
  merma: { Panadería: 3300, Dulcería: 2700, Cocina: 2180, "Almacén Central": 1000 },
  caducidad: { Panadería: 60, Dulcería: 1950, Cocina: 100, "Almacén Central": 0 },
  desabasto: { Panadería: 3900, Dulcería: 2900, Cocina: 450, "Almacén Central": 0 },
  diferencias: { Panadería: 0, Dulcería: 0, Cocina: 0, "Almacén Central": 1659 },
};

/** Impacto de una causa en un mes para un área; el reparto suma exacto el total del mes. */
export function impactoMes(c: Causa, i: number, area: AreaDir = TODAS) {
  const total = IMPACTO_MENSUAL[c][i];
  if (area === TODAS) return total;
  const sep = IMPACTO_AREA_SEP[c];
  const base = IMPACTO_MENSUAL[c][8];
  const partes = AREAS_IMPACTO.map((a) => Math.round((total * sep[a]) / base));
  // El área con más peso absorbe el redondeo, para que las cuatro sumen exacto.
  const mayor = AREAS_IMPACTO.reduce((m, a, k) => (sep[a] > sep[AREAS_IMPACTO[m]] ? k : m), 0);
  partes[mayor] += total - sumar(partes);
  return partes[AREAS_IMPACTO.indexOf(area as AreaImpacto)];
}
export const totalMes = (i: number, area: AreaDir = TODAS) => sumar(CAUSAS.map((c) => impactoMes(c.id, i, area)));
/** Parte del área en el impacto de septiembre (para escalar el escenario). */
export const pesoArea = (area: AreaDir) => (area === TODAS ? 1 : totalMes(8, area) / totalMes(8));

/** Escenario proyectado oct–dic: base (sin cambios) contra objetivo con WMS. Supuestos, no resultados. */
export const ESCENARIO = { base: [21200, 22200, 23200], objetivo: [21200, 18800, 16400] };
export const SUPUESTO_ESCENARIO = "Proyección basada en supuestos de reducción objetivo de merma, desabasto y diferencias.";

export function impactoDe(periodo: Periodo, area: AreaDir = TODAS) {
  const p = periodoDe(periodo);
  const porCausa = Object.fromEntries(CAUSAS.map((c) => [c.id, sumar(p.meses.map((i) => impactoMes(c.id, i, area)))])) as Record<Causa, number>;
  const total = sumar(Object.values(porCausa));
  const anterior = p.anterior ? sumar(p.anterior.map((i) => totalMes(i, area))) : null;
  return { porCausa, total, cambio: anterior ? (total / anterior - 1) * 100 : null };
}

/** Una fila de detalle operacional (nivel 3). La última columna siempre es el valor en USD. */
export interface Fila {
  celdas: string[];
  usd: number;
  estado?: string;
}

/** Completa con "Otros …" para que el detalle sume exactamente el total de su causa. */
function conResto(filas: Fila[], total: number, resto: string, columnas: number): Fila[] {
  const falta = total - sumar(filas.map((f) => f.usd));
  return falta > 0 ? [...filas, { celdas: [resto, ...Array(columnas - 1).fill("—")], usd: falta }] : filas;
}

const COL_IMPACTO = ["Artículo", "Lote · ubicación", "Cantidad", "Incidencia", "Responsable", "Estado"];

/** Detalle del impacto de septiembre por causa, con el área a la que pertenece cada registro. */
const DETALLE_BASE: Record<Causa, { filas: (Fila & { area: AreaImpacto })[]; resto: string }> = {
  merma: {
    filas: [
      { celdas: ["Aceite vegetal · ACE-18", "L120925 · PA-R10-N1-P01", "40 LT", "INC-0907 · dañado", "Cocina", "Merma confirmada"], usd: 1870, area: "Cocina" },
      { celdas: ["Producto de panadería · PT-PAN-001", "L280925 · Panadería", "310 PZA", "INC-0912 · sin venta", "Panadería", "Merma confirmada"], usd: 1540, area: "Panadería" },
      { celdas: ["Mantequilla sin sal · MAN-10", "L040925 · PB-CF2", "10 KG", "INC-0918 · dañado", "Calidad", "Merma confirmada"], usd: 820, area: "Almacén Central" },
      { celdas: ["Chocolate cobertura · CHO-05", "L010925 · PB-R07-N2-P03", "6 KG", "INC-0921 · humedad", "Dulcería", "Merma confirmada"], usd: 690, area: "Dulcería" },
    ],
    resto: "Otros registros de merma",
  },
  caducidad: {
    filas: [
      { celdas: ["Crema de leche UHT · CRE-UHT", "L280825 · PB-CF1", "24 LT", "INC-0903 · vencido", "Calidad", "Merma confirmada"], usd: 1210, area: "Dulcería" },
      { celdas: ["Queso crema · QCR-10", "L050925 · PB-CF2", "10 KG", "INC-0915 · vencido", "Calidad", "Merma confirmada"], usd: 640, area: "Dulcería" },
    ],
    resto: "Otros lotes vencidos",
  },
  desabasto: {
    filas: [
      { celdas: ["Harina Gold Mills dura · HAR-GM50", "— · sin existencia", "4,830 KG", "Pedidos de Panadería", "Compras", "Demanda no atendida"], usd: 3480, area: "Panadería" },
      { celdas: ["Azúcar refinada · AZU-R25", "— · sin existencia", "2,780 KG", "Pedidos de Dulcería", "Compras", "Demanda no atendida"], usd: 2640, area: "Dulcería" },
    ],
    resto: "Otras líneas no surtidas",
  },
  diferencias: {
    filas: [
      { celdas: ["Levadura seca · LEV-10", "L200925 · PA-R12-N2-P05", "−3 cajas", "CNT-0042", "Supervisor de almacén", "Ajuste confirmado"], usd: 620, area: "Almacén Central" },
      { celdas: ["Cacao en polvo · CAC-05", "L100925 · PA-R12-N3-P01", "−2 cajas", "CNT-0047", "Supervisor de almacén", "Ajuste confirmado"], usd: 410, area: "Almacén Central" },
    ],
    resto: "Otros ajustes confirmados",
  },
};

export const COL_IMPACTO_DETALLE = COL_IMPACTO;

/** Detalle operacional de septiembre de una causa, para un área; suma exacto lo de la causa. */
export function detalleImpacto(c: Causa, area: AreaDir = TODAS): Fila[] {
  const d = DETALLE_BASE[c];
  const filas = d.filas.filter((x) => area === TODAS || x.area === area).map(({ celdas, usd }) => ({ celdas, usd }));
  return conResto(filas, impactoMes(c, 8, area), d.resto, COL_IMPACTO.length);
}

// ── Riesgo: valor económico en riesgo (foto de hoy) ─────────────

export type Banda = "vencido" | "7" | "30" | "mas30";
export const BANDAS: { id: Banda; nombre: string; clase: string; trazo: string }[] = [
  { id: "vencido", nombre: "Vencido", clase: "bg-critico", trazo: "stroke-critico" },
  { id: "7", nombre: "≤ 7 días", clase: "bg-critico/50", trazo: "stroke-critico/50" },
  { id: "30", nombre: "8 a 30 días", clase: "bg-alerta", trazo: "stroke-alerta" },
  { id: "mas30", nombre: "Más de 30 días", clase: "bg-exito/70", trazo: "stroke-exito/70" },
];

export const CAMARAS = ["Todas", "Seco", "Refrigerado", "Congelado"] as const;
export type Camara = (typeof CAMARAS)[number];
type Perecedera = Exclude<Camara, "Todas">;

/** Valor por banda de caducidad y cámara. Cada cámara suma su valor de inventario (el empaque no caduca). */
const CADUCIDAD_CAMARA: Record<Perecedera, Record<Banda, number>> = {
  Seco: { vencido: 2000, "7": 4000, "30": 31000, mas30: 519000 },
  Refrigerado: { vencido: 12000, "7": 21000, "30": 61000, mas30: 224000 },
  Congelado: { vencido: 4000, "7": 4000, "30": 20000, mas30: 175000 },
};
export function caducidadDe(camara: Camara): Record<Banda, number> {
  const cs: Perecedera[] = camara === "Todas" ? ["Seco", "Refrigerado", "Congelado"] : [camara];
  return Object.fromEntries(BANDAS.map((b) => [b.id, sumar(cs.map((c) => CADUCIDAD_CAMARA[c][b.id]))])) as Record<Banda, number>;
}

/** Lotes con mayor valor por banda (los mismos lotes del almacén, con su estado en vivo). */
const LOTES_RIESGO: { bulto: string; banda: Banda; camara: Perecedera; usd: number }[] = [
  { bulto: "B-102", banda: "vencido", camara: "Refrigerado", usd: 5100 },
  { bulto: "B-103", banda: "vencido", camara: "Refrigerado", usd: 4600 },
  { bulto: "B-101", banda: "vencido", camara: "Seco", usd: 1200 },
  { bulto: "B-104", banda: "7", camara: "Refrigerado", usd: 6200 },
  { bulto: "B-105", banda: "7", camara: "Refrigerado", usd: 5400 },
  { bulto: "B-106", banda: "7", camara: "Refrigerado", usd: 3900 },
  { bulto: "B-107", banda: "30", camara: "Seco", usd: 9800 },
  { bulto: "B-108", banda: "30", camara: "Refrigerado", usd: 8600 },
  { bulto: "B-109", banda: "30", camara: "Seco", usd: 6500 },
  { bulto: "B-111", banda: "30", camara: "Seco", usd: 4200 },
  { bulto: "B-110", banda: "30", camara: "Seco", usd: 3100 },
];
export const valorLote = (bulto: string) => LOTES_RIESGO.find((l) => l.bulto === bulto)?.usd ?? 0;

export const COL_LOTES = ["Artículo", "Lote", "Ubicación", "Cantidad", "Caduca", "Días", "Estado"];

export function lotesDeBanda(banda: Banda, camara: Camara, estados: Record<string, EstadoLote>): Fila[] {
  const total = caducidadDe(camara)[banda];
  const filas: Fila[] = LOTES_RIESGO.filter((l) => l.banda === banda && (camara === "Todas" || l.camara === camara)).map((l) => {
    const b = INVENTARIO.find((x) => x.id === l.bulto)!;
    const i = insumoDe(b.sku);
    const e = estados[b.id];
    const d = diasPara(b);
    return {
      celdas: [`${i.nombre} · ${b.sku}`, b.lote, b.posicion, `${b.bultos} ${b.bultos === 1 ? i.manejo.nombre : i.manejo.plural}`, fechaConAnio(b.caducidad), d < 0 ? `venció hace ${-d}` : String(d), e ? (e.estado === "descarte" ? "En descarte" : "Bloqueado") : "Disponible"],
      usd: l.usd,
    };
  });
  return conResto(filas, total, banda === "mas30" ? "Lotes con más de 30 días" : "Otros lotes de la banda", COL_LOTES.length);
}

/** Valor económico en riesgo: lo que hoy puede convertirse en pérdida. El sobrestock se ve en capital inmovilizado. */
export function valorEnRiesgo(estados: Record<string, EstadoLote>) {
  const cad = caducidadDe("Todas");
  const componentes: { id: string; nombre: string; corto: string; usd: number; disponibilidad: Disponibilidad; columnas: string[]; filas: Fila[] }[] = [
    {
      id: "caducidad",
      nombre: "Caducidad (vencido y ≤ 30 días)",
      corto: "Caducidad",
      usd: cad.vencido + cad["7"] + cad["30"],
      disponibilidad: "D2",
      columnas: COL_LOTES,
      filas: [...lotesDeBanda("vencido", "Todas", estados), ...lotesDeBanda("7", "Todas", estados), ...lotesDeBanda("30", "Todas", estados)],
    },
    {
      id: "diferencias",
      nombre: "Diferencias en investigación",
      corto: "Diferencias",
      usd: 9870,
      disponibilidad: "D2",
      columnas: ["Artículo", "Ubicación", "Sistema", "Físico", "Incidencia", "Estado"],
      filas: conResto(
        [
          { celdas: ["Piña galón · ING-PIÑA-001", "PB-CF3-02", "48 galones", "0", "CNT-0051", "No se encontró · en investigación"], usd: 3910 },
          { celdas: ["Harina integral · HAR-INT", "PA-R12-N1-P03", "6 sacos", "4 sacos", "CNT-0053", "En investigación"], usd: 2140 },
        ],
        9870,
        "Otras 6 posiciones en conteo",
        6,
      ),
    },
    {
      id: "retenido",
      nombre: "Dañado o retenido en cuarentena",
      corto: "Retenido",
      usd: 6240,
      disponibilidad: "D2",
      columnas: ["Artículo", "Lote", "Motivo", "Desde", "Responsable", "Estado"],
      filas: conResto(
        [
          { celdas: ["Mantequilla sin sal · MAN-10", "L-2609M", "Daño en recepción", "hace 2 d", "Calidad", "En cuarentena"], usd: 2460 },
          { celdas: ["Huevo líquido · HUE-LIQ", "L-2609E", "Vida útil corta", "hace 1 d", "Calidad", "En cuarentena"], usd: 1780 },
        ],
        6240,
        "Otros 5 lotes retenidos",
        6,
      ),
    },
    {
      id: "desabasto",
      nombre: "Desabasto comprometido",
      corto: "Desabasto",
      usd: 9210,
      disponibilidad: "D3",
      columnas: ["Pedido o plan", "Insumo", "Falta", "Compromiso", "Responsable", "Estado"],
      filas: conResto(
        [
          { celdas: ["Plan de Panadería", "Harina integral", "45 KG", "mañana 08:57", "Compras", "Sin cobertura"], usd: 1380 },
          { celdas: ["ESP-0094 · Evento corporativo", "Crema de leche UHT", "24 LT", "hoy 17:00", "Supervisor de almacén", "En riesgo"], usd: 820 },
        ],
        9210,
        "Otros 11 pedidos en riesgo",
        6,
      ),
    },
  ];
  return { total: sumar(componentes.map((c) => c.usd)), cambio: -6.2, componentes };
}

// ── Capital: inmovilizado por antigüedad y valor por clase ABC ───

export const VALOR_INVENTARIO = { fisico: 1250000, disponible: 1104000, comprometido: 98500, retenido: 47500 };

export const INMOVILIZADO: { tramo: string; usd: number; filas: Fila[] }[] = [
  { tramo: "31–60 días", usd: 96400, filas: conResto([{ celdas: ["Aceite vegetal · ACE-18", "PA-R10-N1-P01", "48 días"], usd: 22800 }, { celdas: ["Leche en polvo · LEC-P25", "PB-R05-N1-P02", "41 días"], usd: 19600 }], 96400, "Otros 64 artículos", 3) },
  { tramo: "61–90 días", usd: 71200, filas: conResto([{ celdas: ["Azúcar glas · AZU-G25", "PB-R02-N1-P07", "77 días"], usd: 18300 }, { celdas: ["Avena en hojuelas · AVE-10", "PB-R03-N1-P04", "70 días"], usd: 9700 }], 71200, "Otros 41 artículos", 3) },
  { tramo: "91–180 días", usd: 58600, filas: conResto([{ celdas: ["Cacao en polvo · CAC-05", "PA-R12-N3-P01", "126 días"], usd: 14600 }, { celdas: ["Bolsa de papel para pan · BOL-PAN", "PB-R04-N3-P01", "104 días"], usd: 11200 }], 58600, "Otros 28 artículos", 3) },
  { tramo: "+180 días", usd: 36300, filas: conResto([{ celdas: ['Base de cartón dorada 10" · EMP-B10', "PB-R04-N2-P02", "212 días"], usd: 12400 }, { celdas: ["Esencia de vainilla · VAI-04", "PB-R03-N2-P03", "196 días"], usd: 8900 }], 36300, "Otros 17 artículos", 3) },
];
export const totalInmovilizado = () => sumar(INMOVILIZADO.map((t) => t.usd));

/** Valor por clasificación ABC (concentración del valor, no inmovilizado). Suma el valor físico. */
export const ABC = [
  { clase: "Clase A", valor: 500000, rota: 12, detalle: "20 % de los artículos · 80 % del consumo" },
  { clase: "Clase B", valor: 437500, rota: 31, detalle: "30 % de los artículos · 15 % del consumo" },
  { clase: "Clase C", valor: 312500, rota: 72, detalle: "50 % de los artículos · 5 % del consumo" },
];
/** Días de inventario = rotación ponderada por valor (34 días). */
export const diasInventario = () => Math.round(sumar(ABC.map((c) => c.valor * c.rota)) / sumar(ABC.map((c) => c.valor)));

export const VALOR_CAMARA = [
  { camara: "Seco", mp: 318000, insumos: 142000, pt: 96000 },
  { camara: "Refrigerado", mp: 186000, insumos: 74000, pt: 58000 },
  { camara: "Congelado", mp: 121000, insumos: 38000, pt: 44000 },
  { camara: "Empaque", mp: 0, insumos: 173000, pt: 0 },
];

// ── Resultado: indicadores con su desglose ──────────────────────

export interface Desglose {
  titulo: string;
  columnas: string[];
  filas: { nombre: string; hecho: number; base: number }[];
}

export interface Kpi {
  id: string;
  dimension: "resultado" | "capital" | "riesgo";
  nombre: string;
  pregunta: string;
  valor: number;
  unidad: string;
  cambio: { texto: string; bueno: boolean } | null;
  meta?: { texto: string; valor: number; mayorEsMejor: boolean };
  escala?: [number, number];
  apoyo: { valor: string; texto: string }[];
  disponibilidad: Disponibilidad;
  desglose?: Desglose;
}

const pct = (a: number, b: number) => Math.round((a / b) * 1000) / 10;

/** Pequeña mejora a lo largo del año: el periodo largo cumple un poco más que el último mes. */
const AJUSTE_PERIODO: Record<Periodo, number> = { mes: 1, trimestre: 1.008, anio: 1.018 };

export function kpis(f: Filtros, exactitud: Exactitud, estados: Record<string, EstadoLote>): Kpi[] {
  const periodo = f.periodo;
  const p = periodoDe(periodo);
  const n = p.meses.length;
  const imp = impactoDe(periodo, f.area);
  const riesgo = valorEnRiesgo(estados);
  const lecturas = exactitud.coinciden + exactitud.difieren;
  const escalar = (filas: Desglose["filas"]) => filas.map((x) => ({ ...x, base: x.base * n, hecho: Math.min(x.base * n, Math.round(x.hecho * n * AJUSTE_PERIODO[periodo])) }));
  // Fill rate: por área de producción, por canal o todo.
  const fillCanal = [
    { nombre: "Áreas de producción", hecho: 860, base: 1010 },
    { nombre: "Tiendas · rutas", hecho: 640, base: 720 },
    { nombre: "E-commerce", hecho: 228, base: 250 },
    { nombre: "Pedidos especiales", hecho: 115, base: 153 },
  ];
  const fillArea = [
    { nombre: "Panadería", hecho: 340, base: 400 },
    { nombre: "Dulcería", hecho: 300, base: 350 },
    { nombre: "Cocina", hecho: 220, base: 260 },
  ];
  const fill = escalar(esProduccion(f.area) ? fillArea.filter((x) => x.nombre === f.area) : f.canal !== TODOS ? fillCanal.filter((x) => x.nombre === f.canal) : fillCanal);
  const fillTitulo = esProduccion(f.area) ? "Del área" : f.canal !== TODOS ? "Del canal" : "Por canal";
  const otif = escalar([
    { nombre: "Alimentos de Primera", hecho: 12, base: 20 },
    { nombre: "Pastas del Istmo", hecho: 11, base: 13 },
    { nombre: "Empaques Delta", hecho: 9, base: 10 },
    { nombre: "Alimentos del Norte", hecho: 6, base: 7 },
  ]);
  const plan = escalar(
    [
      { nombre: "Panadería", hecho: 612, base: 680 },
      { nombre: "Dulcería", hecho: 448, base: 500 },
      { nombre: "Cocina", hecho: 308, base: 320 },
    ].filter((x) => !esProduccion(f.area) || x.nombre === f.area),
  );
  const tot = (fs: Desglose["filas"]) => [sumar(fs.map((f) => f.hecho)), sumar(fs.map((f) => f.base))];
  const [fh, fb] = tot(fill);
  const [oh, ob] = tot(otif);
  const [ph, pb] = tot(plan);
  // Año a la fecha no tiene periodo anterior comparable en la maqueta.
  const cambio = (t: string, bueno: boolean) => (periodo === "anio" ? null : { texto: t, bueno });
  return [
    { id: "fill", dimension: "resultado", nombre: "Fill rate a canales", pregunta: "¿Qué parte de la demanda solicitada se atendió?", valor: pct(fh, fb), unidad: "%", cambio: cambio("+1.2 pp", true), meta: { texto: "Meta ≥ 95 %", valor: 95, mayorEsMejor: true }, escala: [0, 100], apoyo: [{ valor: fmt(fh), texto: "Líneas surtidas" }, { valor: fmt(fb), texto: "Solicitadas" }], disponibilidad: "D2", desglose: { titulo: fillTitulo, columnas: [esProduccion(f.area) ? "Área" : "Canal", "Surtidas", "Solicitadas", "Fill rate"], filas: fill } },
    { id: "otif", dimension: "resultado", nombre: "OTIF de proveedores", pregunta: "¿Los proveedores entregan completo y a tiempo?", valor: pct(oh, ob), unidad: "%", cambio: cambio("−3 pp", false), meta: { texto: "Meta ≥ 90 %", valor: 90, mayorEsMejor: true }, escala: [0, 100], apoyo: [{ valor: fmt(oh), texto: "A tiempo y completo" }, { valor: fmt(ob), texto: "Recibos del periodo" }], disponibilidad: "D2", desglose: { titulo: "Por proveedor", columnas: ["Proveedor", "A tiempo y completo", "Recibos", "OTIF"], filas: otif } },
    { id: "plan", dimension: "resultado", nombre: "Cumplimiento del plan de producción", pregunta: "¿Qué parte del plan programado se produjo?", valor: pct(ph, pb), unidad: "%", cambio: cambio("−1.8 pp", false), meta: { texto: "Meta ≥ 98 %", valor: 98, mayorEsMejor: true }, escala: [0, 100], apoyo: [{ valor: fmt(ph), texto: "Unidades producidas" }, { valor: fmt(pb), texto: "Planeadas" }], disponibilidad: "D3", desglose: { titulo: "Por área", columnas: ["Área", "Producidas", "Planeadas", "Cumplimiento"], filas: plan } },
    {
      id: "impacto",
      dimension: "capital",
      nombre: "Impacto económico de excepciones",
      pregunta: "¿Cuánto costaron la merma, la caducidad, el desabasto y las diferencias?",
      valor: imp.total,
      unidad: "USD",
      cambio: imp.cambio === null ? null : { texto: `${imp.cambio >= 0 ? "+" : "−"}${Math.abs(imp.cambio).toFixed(1)} %`, bueno: imp.cambio < 0 },
      apoyo: CAUSAS.map((c) => ({ valor: fmt(imp.porCausa[c.id]), texto: c.nombre })),
      disponibilidad: "D3",
    },
    { id: "dias", dimension: "capital", nombre: "Días de inventario", pregunta: "¿Cuántos días de consumo cubre el inventario?", valor: diasInventario(), unidad: "días", cambio: { texto: "+2 d", bueno: false }, meta: { texto: "Meta ≤ 24 días", valor: 24, mayorEsMejor: false }, escala: [0, 40], apoyo: [{ valor: usdCorto(VALOR_INVENTARIO.fisico), texto: "USD en inventario" }, { valor: usdCorto(totalInmovilizado()), texto: "USD inmovilizados (+30 d)" }], disponibilidad: "D3" },
    { id: "riesgo", dimension: "riesgo", nombre: "Valor económico en riesgo", pregunta: "¿Cuánto dinero puede convertirse en pérdida?", valor: riesgo.total, unidad: "USD", cambio: { texto: "−6.2 %", bueno: true }, apoyo: riesgo.componentes.map((c) => ({ valor: usdCorto(c.usd), texto: c.corto })), disponibilidad: "D2" },
    { id: "exactitud", dimension: "riesgo", nombre: "Exactitud de inventario", pregunta: "¿Qué tan confiable es el sistema frente a lo físico?", valor: lecturas ? pct(exactitud.coinciden, lecturas) : 100, unidad: "%", cambio: { texto: "+1.1 pp", bueno: true }, meta: { texto: "Meta ≥ 98 %", valor: 98, mayorEsMejor: true }, escala: [0, 100], apoyo: [{ valor: fmt(exactitud.coinciden), texto: "Lecturas que coinciden" }, { valor: fmt(lecturas), texto: "Lecturas de lote" }], disponibilidad: "D2" },
  ];
}

export const cumpleMeta = (k: Kpi) => (k.meta ? (k.meta.mayorEsMejor ? k.valor >= k.meta.valor : k.valor <= k.meta.valor) : true);

/** Diferencias de lote del mes (las de ejemplo más las que registre hoy el PDA). */
export const COL_EXACTITUD = ["Artículo", "Lote", "Ubicación", "Sistema", "Físico", "Diferencia", "Último movimiento", "Incidencia"];
export const DIFERENCIAS_MES: string[][] = [
  ["Harina Gold Mills dura · HAR-GM50", "L230825", "PB-R02-N1-P05", "12 sacos", "11 sacos", "−1", "surtido 29 sep", "CNT-0031"],
  ["Queso crema · QCR-10", "L220925", "PB-CF2", "4 cajas", "5 cajas", "+1", "acomodo 28 sep", "CNT-0033"],
  ["Crema de leche UHT · CRE-UHT", "L011025", "PB-CF1", "8 cajas", "7 cajas", "−1", "surtido 27 sep", "CNT-0035"],
  ["Levadura seca · LEV-10", "L200925", "PA-R12-N2-P05", "5 cajas", "2 cajas", "−3", "surtido 25 sep", "CNT-0042"],
  ["Cacao en polvo · CAC-05", "L100925", "PA-R12-N3-P01", "8 cajas", "6 cajas", "−2", "conteo 24 sep", "CNT-0047"],
  ["Chocolate cobertura · CHO-05", "L120925", "PB-R07-N2-P03", "10 cajas", "10 cajas", "lote distinto", "acomodo 22 sep", "INC-0896"],
  ["Avena en hojuelas · AVE-10", "L090925", "PB-R03-N1-P04", "6 cajas", "7 cajas", "+1", "recepción 19 sep", "CNT-0028"],
  ["Huevo líquido · HUE-LIQ", "L260925", "PB-CF2", "5 cajas", "4 cajas", "−1", "surtido 17 sep", "CNT-0026"],
  ["Mantequilla sin sal · MAN-10", "L240925", "PB-CF2", "3 cajas", "3 cajas", "lote distinto", "acomodo 15 sep", "INC-0881"],
];

// ── Operación: costo, retrasos, negocio ─────────────────────────

/** Costo por proceso en el periodo: enero a junio crecen hacia los tres meses conocidos. */
export function costoDe(periodo: Periodo) {
  const meses = periodoDe(periodo).meses;
  return COSTO_PROCESO.map((c) => {
    const serie = [...[0.88, 0.89, 0.9, 0.92, 0.93, 0.95].map((k) => Math.round(c.historia[0] * k)), ...c.historia];
    const usd = sumar(meses.map((i) => serie[i]));
    const factor = usd / c.usd;
    return { ...c, usd, horas: Math.round(c.horas * factor), serie };
  });
}

export const COSTO_PROCESO = [
  { proceso: "Recepción", usd: 4820, horas: 566, personas: 2, porUnidad: 2.63, historia: [4510, 4690, 4820] },
  { proceso: "Almacenamiento", usd: 7140, horas: 840, personas: 3, porUnidad: 3.87, historia: [6880, 7020, 7140] },
  { proceso: "Surtido", usd: 9360, horas: 1101, personas: 1, porUnidad: 5.08, historia: [8798, 9079, 9360] },
  { proceso: "Calidad", usd: 2180, horas: 256, personas: 1, porUnidad: 1.18, historia: [2240, 2210, 2180] },
  { proceso: "Despacho", usd: 5420, horas: 637, personas: 2, porUnidad: 2.94, historia: [5160, 5300, 5420] },
];

export const DIAS_SEMANA = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
export const RETRASO: Record<string, number[]> = {
  Panadería: [1.2, 0.8, 1.5, 2.1, 5.4, 3.2],
  Dulcería: [0.9, 1.1, 1.8, 2.4, 5.1, 4.0],
  Cocina: [0.6, 0.5, 1.0, 1.4, 4.2, 2.1],
  "Tiendas · rutas": [1.8, 1.4, 2.2, 2.0, 4.7, 5.8],
  "E-commerce": [0.4, 0.6, 0.9, 1.1, 2.3, 3.4],
};
export const VENTANAS_RETRASO = [
  { id: 4, texto: "4 semanas", factor: 1 },
  { id: 8, texto: "8 semanas", factor: 0.92 },
  { id: 12, texto: "12 semanas", factor: 0.86 },
];

export type Alcance = "hoy" | "semana" | "mes";
export const NEGOCIO: { nombre: string; valores: Record<Alcance, number>; usd?: boolean; fuente: string }[] = [
  { nombre: "Venta despachada", valores: { hoy: 14200, semana: 96800, mes: 418600 }, usd: true, fuente: "ERP / ventas" },
  { nombre: "Pedidos a tiendas", valores: { hoy: 14, semana: 91, mes: 392 }, fuente: "WMS" },
  { nombre: "E-commerce", valores: { hoy: 7, semana: 39, mes: 168 }, fuente: "Plataforma e-commerce" },
  { nombre: "Pedidos especiales", valores: { hoy: 2, semana: 17, mes: 71 }, fuente: "Ventas" },
  { nombre: "Órdenes de producción", valores: { hoy: 5, semana: 30, mes: 128 }, fuente: "Producción" },
  { nombre: "Órdenes de compra", valores: { hoy: 8, semana: 50, mes: 214 }, fuente: "ERP / compras" },
];
export const CUMPLIMIENTO_CANAL: { canal: string; valores: Record<Alcance, number> }[] = [
  { canal: "Áreas de producción", valores: { hoy: 68, semana: 70, mes: 71 } },
  { canal: "Tiendas · rutas", valores: { hoy: 81, semana: 77, mes: 78 } },
  { canal: "E-commerce", valores: { hoy: 86, semana: 91, mes: 90 } },
  { canal: "Pedidos especiales", valores: { hoy: 50, semana: 62, mes: 64 } },
];
export const META_CUMPLIMIENTO = 95;

/** Qué canal corresponde a cada indicador de negocio (para resaltar el canal elegido). */
const CANAL_NEGOCIO: Record<string, Canal | null> = {
  "Venta despachada": null,
  "Pedidos a tiendas": "Tiendas · rutas",
  "E-commerce": "E-commerce",
  "Pedidos especiales": "Pedidos especiales",
  "Órdenes de producción": "Áreas de producción",
  "Órdenes de compra": null,
};
const PRODUCCION_AREA: Record<string, Record<Alcance, number>> = {
  Panadería: { hoy: 2, semana: 14, mes: 58 },
  Dulcería: { hoy: 2, semana: 10, mes: 42 },
  Cocina: { hoy: 1, semana: 6, mes: 28 },
};
const CUMPLIMIENTO_AREA: Record<string, Record<Alcance, number>> = {
  Panadería: { hoy: 64, semana: 68, mes: 69 },
  Dulcería: { hoy: 72, semana: 73, mes: 74 },
  Cocina: { hoy: 70, semana: 70, mes: 71 },
};

export function negocioDe(area: AreaDir, canal: Canal) {
  const tiles = NEGOCIO.map((x) => {
    const c = CANAL_NEGOCIO[x.nombre];
    const valores = x.nombre === "Órdenes de producción" && esProduccion(area) ? PRODUCCION_AREA[area] : x.valores;
    const nombre = x.nombre === "Órdenes de producción" && esProduccion(area) ? `Órdenes de producción · ${area}` : x.nombre;
    return { ...x, nombre, valores, activo: canal === TODOS || c === canal };
  });
  const cumplimiento = CUMPLIMIENTO_CANAL.map((x) => {
    const propio = x.canal === "Áreas de producción" && esProduccion(area);
    return { canal: propio ? area : x.canal, valores: propio ? CUMPLIMIENTO_AREA[area] : x.valores, activo: canal === TODOS || x.canal === canal };
  });
  return { tiles, cumplimiento };
}

/** Filas del mapa de retraso según el área o el canal elegidos. */
export function retrasoDe(area: AreaDir, canal: Canal, factor: number): [string, number[]][] {
  const porCanal: Record<string, string[]> = {
    "Áreas de producción": ["Panadería", "Dulcería", "Cocina"],
    "Tiendas · rutas": ["Tiendas · rutas"],
    "E-commerce": ["E-commerce"],
    "Pedidos especiales": [],
  };
  return Object.entries(RETRASO)
    .filter(([n]) => (esProduccion(area) ? n === area : true))
    .filter(([n]) => (canal === TODOS ? true : porCanal[canal].includes(n)))
    .map(([n, v]) => [n, v.map((x) => Math.round(x * factor * 10) / 10)]);
}

// ── Top excepciones por impacto (septiembre) ────────────────────

/** Lo confirmado sale del detalle de cada causa; lo que sigue en investigación no cuenta como pérdida. */
export const TOP_EXCEPCIONES: { articulo: string; codigo: string; tipo: string; causa: Causa | null; cantidad: string; usd: number; estado: string; confirmada: boolean; responsable: string; area: AreaImpacto }[] = [
  { articulo: "Piña galón", codigo: "ING-PIÑA-001", tipo: "Diferencia físico-sistema", causa: null, cantidad: "48 galones", usd: 3910, estado: "En investigación", confirmada: false, responsable: "Supervisor de almacén", area: "Almacén Central" },
  { articulo: "Harina Gold Mills dura", codigo: "HAR-GM50", tipo: "Desabasto", causa: "desabasto", cantidad: "4,830 KG", usd: 3480, estado: "Confirmada", confirmada: true, responsable: "Compras", area: "Panadería" },
  { articulo: "Azúcar refinada", codigo: "AZU-R25", tipo: "Desabasto", causa: "desabasto", cantidad: "2,780 KG", usd: 2640, estado: "Confirmada", confirmada: true, responsable: "Compras", area: "Dulcería" },
  { articulo: "Aceite vegetal", codigo: "ACE-18", tipo: "Daño", causa: "merma", cantidad: "40 LT", usd: 1870, estado: "Merma confirmada", confirmada: true, responsable: "Cocina", area: "Cocina" },
  { articulo: "Producto de panadería", codigo: "PT-PAN-001", tipo: "Merma", causa: "merma", cantidad: "310 PZA", usd: 1540, estado: "Merma confirmada", confirmada: true, responsable: "Panadería", area: "Panadería" },
  { articulo: "Crema de leche UHT", codigo: "CRE-UHT", tipo: "Caducidad", causa: "caducidad", cantidad: "24 LT", usd: 1210, estado: "Merma confirmada", confirmada: true, responsable: "Calidad", area: "Dulcería" },
  { articulo: "Queso crema", codigo: "QCR-10", tipo: "Caducidad", causa: "caducidad", cantidad: "10 KG", usd: 640, estado: "Merma confirmada", confirmada: true, responsable: "Calidad", area: "Dulcería" },
];

/**
 * Top del periodo y área: lo confirmado crece en la misma proporción que su causa en el periodo;
 * lo que sigue en investigación es una foto de hoy y no cambia.
 */
export function topDe(periodo: Periodo, area: AreaDir) {
  const imp = impactoDe(periodo);
  return TOP_EXCEPCIONES.filter((x) => area === TODAS || x.area === area)
    .map((x) => (x.causa && periodo !== "mes" ? { ...x, usd: Math.round((x.usd * imp.porCausa[x.causa]) / IMPACTO_MENSUAL[x.causa][8]), cantidad: "acumulado del periodo" } : x))
    .sort((a, b) => b.usd - a.usd);
}

// ── En vivo: excepciones que escalan, actividad y compromisos ───

const PRECIO: Record<string, number> = {
  "HAR-GM50": 0.72, "AZU-R25": 0.95, "SAL-25": 0.4, "CRE-UHT": 3.1, "QCR-10": 6.8, "HUE-LIQ": 4.2, "ACE-18": 2.6, "CAC-05": 9.5,
  "EMP-C10": 0.45, "EMP-B10": 0.18, "VAI-04": 22, "LEV-10": 7.5, "LEC-P25": 5.4, "HAR-INT": 0.9, "AVE-10": 1.9, "BOL-PAN": 0.05,
  "AZU-G25": 1.3, "CHO-05": 11, "MAN-10": 8.2,
};
export const valorLinea = (sku: string, cantidad: number) => cantidad * (PRECIO[sku] ?? 1);

const minutosAhora = () => {
  const [h, m] = horaActual().split(":").map(Number);
  return h * 60 + m;
};

/** Solo escala lo que supera las reglas: afecta producción o inocuidad, o vale más de USD 1,000. */
export const REGLA_ESCALAMIENTO = "Solo escala lo que afecta inocuidad o producción, o vale más de USD 1,000";

export interface Escalada {
  id: string;
  n: number;
  titulo: string;
  texto: string;
  tono: "critico" | "alerta";
  impacto: number;
  antiguedad: string;
  responsable: string;
  estado: string;
  siguiente: string;
  columnas: string[];
  filas: string[][];
}

export function escaladas(estadosLote: Record<string, EstadoLote>, estados: Record<string, EstadoTrabajo>, pedidos: PedidoArea[], recepciones: RegistroRecepcion[], incidencias: Incidencia[]): Escalada[] {
  const vencidos = INVENTARIO.filter((b) => diasPara(b) < 0 && !estadosLote[b.id]);
  const ahora = minutosAhora();
  const vencidosSurtido = trabajosDelDia(pedidos).filter((t) => {
    const e = estadoDe(t.id, estados).estado;
    return ["en_cola", "surtiendo", "pausado"].includes(e) && (t.sale === "ahora" || minutosDelDia(t.sale) <= ahora);
  });
  const citas = todasLasOrdenes().filter((o) => {
    const r = resumenOrden(o, ordenesStore.get());
    if (r.estado === "completa" || r.estado === "cerrada_corta") return false;
    if (recepciones.some((x) => x.oc === o.oc)) return false;
    if (o.fechaProgramada < HOY) return true;
    return o.fechaProgramada === HOY && !!o.cita && minutosDelDia(o.cita) < ahora;
  });
  const valorOc = (oc: (typeof citas)[number]) => Math.round(oc.productos.reduce((s, p) => s + p.cajas * p.unidadesPorCaja * 2.4, 0));
  // Material retenido: lo que el PDA mandó a cuarentena y sigue sin decisión, más los de ejemplo.
  const retenidoVivo = incidencias.filter((i) => esPendiente(i) && (i.tipo === "vida_util" || (i.tipo === "dano" && i.destino !== "disponible")));
  const masAntiguo = vencidos.length ? Math.max(...vencidos.map((b) => -diasPara(b))) : 0;
  return [
    {
      id: "inocuidad",
      n: vencidos.length,
      titulo: "Inventario vencido disponible",
      texto: "lotes vencidos que aún se pueden surtir",
      tono: "critico",
      impacto: vencidos.reduce((s, b) => s + valorLote(b.id), 0),
      antiguedad: masAntiguo ? `${masAntiguo} d el más antiguo` : "—",
      responsable: "Calidad",
      estado: vencidos.length ? "Abierta" : "Sin pendientes",
      siguiente: "Bloquear el lote y decidir destino",
      columnas: ["Artículo", "Lote", "Ubicación", "Vencido", "USD"],
      filas: vencidos.map((b) => [insumoDe(b.sku).nombre, b.lote, b.posicion, `hace ${-diasPara(b)} d`, fmt(valorLote(b.id))]),
    },
    {
      id: "produccion",
      n: 1,
      titulo: "Desabasto que afecta producción",
      texto: "plan de mañana sin cobertura",
      tono: "critico",
      impacto: 1380,
      antiguedad: "5 h",
      responsable: "Compras",
      estado: "Abierta",
      siguiente: "Surtir de otra existencia o comprar hoy",
      columnas: ["Área", "Insumo", "Falta", "Compromiso", "USD"],
      filas: [["Panadería", "Harina integral", "45 KG", "mañana 08:57", "1,380"]],
    },
    {
      id: "surtido",
      n: vencidosSurtido.length,
      titulo: "Pedidos críticos incumplidos",
      texto: "compromisos de surtido vencidos hoy",
      tono: "critico",
      impacto: Math.round(vencidosSurtido.reduce((s, t) => s + t.lineas.reduce((a, l) => a + valorLinea(l.sku, l.pidio), 0), 0)),
      antiguedad: vencidosSurtido.length ? "hoy" : "—",
      responsable: "Supervisor de almacén",
      estado: vencidosSurtido.length ? "Abierta" : "Sin pendientes",
      siguiente: "Reforzar el turno de surtido",
      columnas: ["Pedido", "Destino", "Debía salir", "Estado", "USD"],
      filas: vencidosSurtido.map((t) => [t.id, t.nombre, t.sale === "ahora" ? "urgente" : t.sale, estadoDe(t.id, estados).estado === "surtiendo" ? "Surtiendo" : "En cola", fmt(t.lineas.reduce((a, l) => a + valorLinea(l.sku, l.pidio), 0))]),
    },
    {
      id: "proveedor",
      n: citas.length,
      titulo: "OC crítica atrasada",
      texto: "citas vencidas sin llegar",
      tono: "alerta",
      impacto: citas.reduce((s, o) => s + valorOc(o), 0),
      antiguedad: citas.some((o) => o.fechaProgramada < HOY) ? `${Math.max(...citas.map((o) => diasEntre(o.fechaProgramada, HOY)))} d la más antigua` : citas.length ? "hoy" : "—",
      responsable: "Compras",
      estado: citas.length ? "Abierta" : "Sin pendientes",
      siguiente: "Llamar al proveedor y reprogramar la cita",
      columnas: ["OC", "Proveedor", "Cita", "Retraso", "USD"],
      filas: citas.map((o) => [o.oc, o.proveedor, `${fechaConAnio(o.fechaProgramada)}${o.cita ? ` ${o.cita}` : ""}`, o.fechaProgramada < HOY ? `${diasEntre(o.fechaProgramada, HOY)} d` : `${Math.max(1, Math.floor((ahora - minutosDelDia(o.cita!)) / 60))} h`, fmt(valorOc(o))]),
    },
    {
      id: "diferencia",
      n: 2,
      titulo: "Diferencia material de inventario",
      texto: "diferencias en investigación",
      tono: "alerta",
      impacto: 6050,
      antiguedad: "3 d",
      responsable: "Supervisor de almacén",
      estado: "En investigación",
      siguiente: "Contar la posición antes de ajustar",
      columnas: ["Artículo", "Ubicación", "Sistema", "Físico", "USD"],
      filas: [
        ["Piña galón", "PB-CF3-02", "48 galones", "0", "3,910"],
        ["Harina integral", "PA-R12-N1-P03", "6 sacos", "4 sacos", "2,140"],
      ],
    },
    {
      id: "retenido",
      n: 2 + retenidoVivo.length,
      titulo: "Material retenido de alto impacto",
      texto: "lotes en cuarentena sin decisión",
      tono: "alerta",
      impacto: 4240,
      antiguedad: "2 d",
      responsable: "Calidad",
      estado: "Esperando decisión",
      siguiente: "Liberar o rechazar con Calidad",
      columnas: ["Artículo", "Lote", "Motivo", "Incidencia", "USD"],
      filas: [
        ["Mantequilla sin sal", "L-2609M", "Daño en recepción", "—", "2,460"],
        ["Huevo líquido pasteurizado", "L-2609E", "Vida útil corta", "—", "1,780"],
        ...retenidoVivo.map((i) => [i.titulo, i.oc, i.tipo === "vida_util" ? "Vida útil corta" : "Daño", i.id, "—"]),
      ],
    },
  ];
}

export interface Actividad {
  ts: number;
  hora: string;
  titulo: string;
  detalle: string;
  tono: "critico" | "alerta" | "info";
}

/** Tipos de incidencia que importan a Dirección (no todo el registro técnico). */
const RELEVANTES = new Set(["vida_util", "lote_distinto", "diferencia_area", "faltante_surtido", "dano", "saldo"]);

/** El pulso de la operación: lo relevante de hoy, no cada movimiento. */
export function actividad(incidencias: Incidencia[], estados: Record<string, EstadoTrabajo>, pedidos: PedidoArea[], recepciones: RegistroRecepcion[]): Actividad[] {
  const lista: Actividad[] = [];
  for (const i of incidencias) if (i.semaforo === "rojo" || RELEVANTES.has(i.tipo)) lista.push({ ts: i.creada, hora: i.hora, titulo: i.titulo, detalle: `${i.id} · ${i.oc}`, tono: i.semaforo === "rojo" ? "critico" : "alerta" });
  for (const p of pedidos) {
    const ap = estados[p.id]?.aprobacion;
    if (ap) lista.push({ ts: ap.solicitadaMs, hora: ap.solicitada, titulo: `Urgencia de ${p.nombre}${ap.decision ? (ap.decision === "aprobada" ? " aprobada" : ap.decision === "ventana" ? " pasada a la ventana" : " rechazada") : " por aprobar"}`, detalle: `${ap.quien ?? ap.aprobador} · ${p.id}`, tono: ap.decision === "rechazada" || !ap.decision ? "alerta" : "info" });
  }
  for (const r of recepciones) if (r.estado === "cerrada" && r.fin) lista.push({ ts: r.fin, hora: new Date(r.fin).toTimeString().slice(0, 5), titulo: `Recepción ${r.oc} cerrada`, detalle: `${r.proveedor} · ${r.bultos ?? 0} bultos`, tono: "info" });
  for (const t of trabajosDelDia(pedidos)) {
    const e = estadoDe(t.id, estados);
    if (e.confirmado) lista.push({ ts: Date.now(), hora: e.confirmado.hora, titulo: `Entrega a ${t.nombre} ${e.confirmado.diferencia ? "con diferencia" : "confirmada"}`, detalle: `${t.contenedor} · ${e.confirmado.quien}`, tono: e.confirmado.diferencia ? "alerta" : "info" });
  }
  const base = new Date(`${HOY}T00:00:00`).getTime();
  const ejemplo = (hora: string, titulo: string, detalle: string, tono: Actividad["tono"]) => ({ ts: base + minutosDelDia(hora) * 6e4, hora, titulo, detalle, tono });
  lista.push(
    ejemplo("07:25", "Recepción OC-7139 cerrada", "Pastas del Istmo · 10 sacos de harina", "info"),
    ejemplo("09:31", "Urgencia de Panadería aprobada", "Rosa Villalaz · levadura", "info"),
    ejemplo("06:50", "Conteo cíclico cerrado", "Pasillo PB-CF · 95.4 % de exactitud", "info"),
  );
  return lista.sort((a, b) => b.ts - a.ts).slice(0, 8);
}

export interface Compromiso {
  /** Para filtrar: el área que recibe (o el Almacén para compras) y el canal. */
  area: AreaDir | null;
  canal: Canal | null;
  folio: string;
  tipo: "Compra" | "Surtido" | "Especial" | "E-commerce";
  destino: string;
  compromiso: string;
  orden: number;
  estado: string;
  tono: "critico" | "alerta" | "info" | "neutro";
  usd: number;
}

const ESPECIALES: Compromiso[] = [
  { area: null, canal: "Pedidos especiales", folio: "ESP-0094", tipo: "Especial", destino: "Evento corporativo", compromiso: "hoy 17:00", orden: 17 * 60, estado: "En cola 1 h", tono: "alerta", usd: 820 },
  { area: null, canal: "Pedidos especiales", folio: "ESP-0095", tipo: "Especial", destino: "Mayoreo · Súper 99", compromiso: "mañana 08:00", orden: 1440 + 480, estado: "Programado", tono: "info", usd: 1450 },
  { area: null, canal: "E-commerce", folio: "WEB-332", tipo: "E-commerce", destino: "Cliente web + 6 pedidos", compromiso: "hoy 15:00", orden: 15 * 60, estado: "Fuera de corte", tono: "critico", usd: 640 },
];

export function compromisos(estados: Record<string, EstadoTrabajo>, pedidos: PedidoArea[], recepciones: RegistroRecepcion[]): Compromiso[] {
  const ahora = minutosAhora();
  const ocs: Compromiso[] = todasLasOrdenes()
    .filter((o) => !["completa", "cerrada_corta"].includes(resumenOrden(o, ordenesStore.get()).estado))
    .map((o) => {
      const r = resumenOrden(o, ordenesStore.get());
      const enCurso = recepciones.some((x) => x.oc === o.oc && x.estado === "en_curso");
      const cita = o.cita ? minutosDelDia(o.cita) : 0;
      const dias = diasEntre(HOY, o.fechaProgramada);
      const vencida = !enCurso && r.estado === "nueva" && (dias < 0 || (dias === 0 && cita < ahora));
      return {
        area: "Almacén Central" as AreaDir,
        canal: null,
        folio: o.oc,
        tipo: "Compra" as const,
        destino: o.proveedor,
        compromiso: dias === 0 ? `hoy ${o.cita ?? ""}`.trim() : fechaConAnio(o.fechaProgramada),
        orden: dias * 1440 + cita,
        estado: enCurso ? "Recibiendo" : r.estado === "parcial" ? "Recibida parcial" : vencida ? (dias < 0 ? `Cita vencida ${-dias} d` : `Cita vencida ${Math.max(1, Math.floor((ahora - cita) / 60))} h`) : "Por recibir",
        tono: vencida ? ("critico" as const) : r.estado === "parcial" ? ("alerta" as const) : ("info" as const),
        usd: Math.round(o.productos.reduce((s, p) => s + p.cajas * p.unidadesPorCaja * 2.4, 0)),
      };
    });
  const surtidos: Compromiso[] = trabajosDelDia(pedidos)
    .map((t) => ({ t, e: estadoDe(t.id, estados) }))
    .filter(({ e }) => ["por_aprobar", "en_cola", "surtiendo", "pausado", "transito"].includes(e.estado))
    .map(({ t, e }) => {
      const sale = t.sale === "ahora" ? ahora : minutosDelDia(t.sale);
      const tarde = e.estado !== "transito" && e.estado !== "por_aprobar" && sale < ahora;
      return {
        area: t.tipo === "area" ? (t.nombre as AreaDir) : null,
        canal: (t.tipo === "ruta" ? "Tiendas · rutas" : "Áreas de producción") as Canal,
        folio: t.id,
        tipo: "Surtido" as const,
        destino: t.nombre,
        compromiso: t.sale === "ahora" ? "urgente" : `hoy ${t.sale}`,
        orden: sale,
        estado: e.estado === "por_aprobar" ? "Urgencia por aprobar" : e.estado === "transito" ? "En tránsito" : tarde ? "Vencido" : e.estado === "surtiendo" ? "Surtiendo" : "En cola",
        tono: tarde ? ("critico" as const) : e.estado === "por_aprobar" ? ("alerta" as const) : ("neutro" as const),
        usd: Math.round(t.lineas.reduce((s, l) => s + valorLinea(l.sku, l.pidio), 0)),
      };
    });
  return [...ESPECIALES, ...ocs, ...surtidos];
}

export function filtrarCompromisos(lista: Compromiso[], area: AreaDir, canal: Canal) {
  return lista.filter((c) => (area === TODAS || c.area === area) && (canal === TODOS || c.canal === canal));
}

/** Excepciones del área elegida: el Almacén ve las suyas; cada área, lo que le toca. */
export function filtrarEscaladas(lista: Escalada[], area: AreaDir): Escalada[] {
  if (area === TODAS) return lista;
  const delAlmacen = ["inocuidad", "proveedor", "diferencia", "retenido", "surtido"];
  return lista
    .filter((e) => (area === "Almacén Central" ? delAlmacen.includes(e.id) : e.id === "surtido" || (e.id === "produccion" && e.filas.some((x) => x[0] === area))))
    .map((e) => {
      if (e.id !== "surtido" || area === "Almacén Central") return e;
      const filas = e.filas.filter((x) => x[1] === area);
      return { ...e, n: filas.length, filas, impacto: sumar(filas.map((x) => Number(x[4].replace(/,/g, "")))), estado: filas.length ? e.estado : "Sin pendientes" };
    });
}

/** Actividad del área: lo que la menciona (el Almacén ve lo que no es de un área de producción). */
export function filtrarActividad(lista: Actividad[], area: AreaDir) {
  if (area === TODAS) return lista;
  const menciona = (x: Actividad, a: string) => `${x.titulo} ${x.detalle}`.includes(a) || `${x.titulo} ${x.detalle}`.includes(`-${a.slice(0, 3).toUpperCase()}-`);
  return area === "Almacén Central" ? lista.filter((x) => !AREAS_PRODUCCION.some((a) => menciona(x, a))) : lista.filter((x) => menciona(x, area));
}

export function useDireccionEnVivo() {
  const estadosLote = estadoLotesStore.use();
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  const recepciones = recepcionesStore.use();
  const incidencias = incidenciasStore.use();
  const exactitud = exactitudStore.use();
  ordenesStore.use();
  return {
    estadosLote,
    exactitud,
    escaladas: escaladas(estadosLote, estados, pedidos, recepciones, incidencias),
    actividad: actividad(incidencias, estados, pedidos, recepciones),
    compromisos: compromisos(estados, pedidos, recepciones),
  };
}
