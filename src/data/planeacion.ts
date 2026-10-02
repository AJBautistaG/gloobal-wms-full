import { CLAVES } from "@/lib/almacenamiento";
import { HOY, sumarDias } from "@/lib/fecha";
import { crearStore } from "@/lib/store";
import { horaActual } from "@/lib/utils";
import { AREAS, borradoresStore, trabajosDelArea, type Area, type Borrador } from "./area";
import { bultosPara, equivalente, estadoDe, insumoDe, pedidosAreaStore, surtidoStore, type ClaveArea, type EstadoTrabajo, type Insumo, type Trabajo } from "./surtido";

/**
 * Planeación del área: el jefe del área estima qué va a producir cada día de la semana.
 * Con las recetas se calcula qué insumos necesita, se descuenta lo que ya tiene y lo que
 * ya viene en camino, y lo que falta se convierte en una solicitud en borrador para revisar.
 */

// ── Recetas de ejemplo ──────────────────────────────────────────

export interface ProductoTerminado {
  id: string;
  nombre: string;
  /** Cómo se cuenta lo que se produce: piezas, pasteles, tandas… */
  unidad: string;
  /** Insumos por unidad producida, en la unidad del insumo (KG, LT, PZA). */
  receta: [string, number][];
}

export const PRODUCTOS: Record<ClaveArea, ProductoTerminado[]> = {
  panaderia: [
    { id: "pan-molde", nombre: "Pan de molde blanco", unidad: "piezas", receta: [["HAR-GM50", 0.5], ["AZU-R25", 0.03], ["SAL-25", 0.01], ["LEV-10", 0.01], ["LEC-P25", 0.02], ["BOL-PAN", 1]] },
    { id: "pan-integral", nombre: "Pan integral", unidad: "piezas", receta: [["HAR-INT", 0.45], ["HAR-GM50", 0.1], ["LEV-10", 0.01], ["SAL-25", 0.01], ["BOL-PAN", 1]] },
    { id: "pan-avena", nombre: "Pan de avena", unidad: "piezas", receta: [["HAR-GM50", 0.35], ["AVE-10", 0.1], ["AZU-R25", 0.03], ["LEV-10", 0.008], ["SAL-25", 0.008], ["BOL-PAN", 1]] },
  ],
  cocina: [
    { id: "crema-verduras", nombre: "Crema de verduras", unidad: "porciones", receta: [["CRE-UHT", 0.05], ["MAN-10", 0.01], ["ACE-18", 0.01], ["SAL-25", 0.003]] },
    { id: "quiche", nombre: "Quiche de vegetales", unidad: "piezas", receta: [["HUE-LIQ", 0.3], ["CRE-UHT", 0.2], ["HAR-GM50", 0.2], ["MAN-10", 0.1], ["SAL-25", 0.005]] },
    { id: "brownie", nombre: "Brownie (bandeja)", unidad: "bandejas", receta: [["CAC-05", 0.4], ["AZU-R25", 1], ["HAR-GM50", 0.5], ["HUE-LIQ", 0.5], ["MAN-10", 0.5]] },
  ],
  dulceria: [
    { id: "tres-leches", nombre: 'Pastel tres leches 10"', unidad: "pasteles", receta: [["HAR-GM50", 0.4], ["AZU-R25", 0.3], ["HUE-LIQ", 0.4], ["CRE-UHT", 0.5], ["VAI-04", 0.01], ["EMP-C10", 1], ["EMP-B10", 1]] },
    { id: "cheesecake", nombre: 'Cheesecake 10"', unidad: "pasteles", receta: [["QCR-10", 0.9], ["AZU-R25", 0.2], ["HUE-LIQ", 0.2], ["VAI-04", 0.005], ["EMP-C10", 1], ["EMP-B10", 1]] },
    { id: "pastel-chocolate", nombre: 'Pastel de chocolate 10"', unidad: "pasteles", receta: [["HAR-GM50", 0.35], ["CHO-05", 0.4], ["AZU-G25", 0.25], ["CRE-UHT", 0.3], ["EMP-C10", 1], ["EMP-B10", 1]] },
  ],
};

/** Plan sugerido por día (lunes a domingo) para empezar la semana. */
const PLAN_BASE: Record<string, number[]> = {
  "pan-molde": [300, 300, 300, 300, 350, 400, 0],
  "pan-integral": [80, 80, 80, 80, 100, 120, 0],
  "pan-avena": [60, 60, 60, 60, 80, 100, 0],
  "crema-verduras": [120, 120, 120, 120, 140, 160, 0],
  quiche: [20, 20, 20, 20, 25, 30, 0],
  brownie: [4, 4, 4, 4, 5, 6, 0],
  "tres-leches": [12, 12, 12, 12, 15, 20, 0],
  cheesecake: [8, 8, 8, 8, 10, 14, 0],
  "pastel-chocolate": [10, 10, 10, 10, 12, 16, 0],
};

// ── Semana ──────────────────────────────────────────────────────

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const desdeISO = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
};
/** 0 = lunes … 6 = domingo. */
export const DIA_HOY = (desdeISO(HOY).getDay() + 6) % 7;
export const LUNES = sumarDias(HOY, -DIA_HOY);
export const SEMANA = DIAS.map((nombre, n) => {
  const iso = sumarDias(LUNES, n);
  return { n, nombre, iso, dia: Number(iso.slice(8, 10)), pasado: n < DIA_HOY, hoy: n === DIA_HOY };
});

// ── Plan de la semana (persistente) ─────────────────────────────

export interface Plan {
  semana: string;
  cantidades: Record<string, number[]>;
  estado: "borrador" | "confirmado";
  confirmado?: { quien: string; hora: string };
}

const planInicial = (): Record<ClaveArea, Plan> =>
  Object.fromEntries(
    Object.values(AREAS).map((a) => [
      a.clave,
      { semana: LUNES, estado: "borrador", cantidades: Object.fromEntries(PRODUCTOS[a.clave].map((p) => [p.id, [...PLAN_BASE[p.id]]])) },
    ]),
  ) as Record<ClaveArea, Plan>;

export const planesStore = crearStore<Record<ClaveArea, Plan>>(CLAVES.planesArea, planInicial());

export const planDe = (a: Area, planes = planesStore.get()) => planes[a.clave] ?? planInicial()[a.clave];

export function cambiarPlan(a: Area, producto: string, dia: number, cantidad: number) {
  planesStore.set((todos) => {
    const p = planDe(a, todos);
    const fila = [...(p.cantidades[producto] ?? Array(7).fill(0))];
    fila[dia] = Math.max(0, Math.round(cantidad));
    return { ...todos, [a.clave]: { ...p, cantidades: { ...p.cantidades, [producto]: fila } } };
  });
}

export function confirmarPlan(a: Area) {
  planesStore.set((todos) => ({ ...todos, [a.clave]: { ...planDe(a, todos), estado: "confirmado", confirmado: { quien: a.pide, hora: horaActual() } } }));
}

export function editarPlan(a: Area) {
  planesStore.set((todos) => ({ ...todos, [a.clave]: { ...planDe(a, todos), estado: "borrador", confirmado: undefined } }));
}

/** Vuelve al plan sugerido (como copiar la semana anterior). */
export function copiarSemanaAnterior(a: Area) {
  planesStore.set((todos) => ({ ...todos, [a.clave]: planInicial()[a.clave] }));
}

// ── Existencias del área (persistente) ──────────────────────────

export interface Movimiento {
  hora: string;
  tipo: "entrada" | "conteo" | "consumo";
  sku: string;
  cantidad: number;
  texto: string;
  quien: string;
}

export interface ExistenciasArea {
  cantidades: Record<string, number>;
  contado: Record<string, { hora: string; quien: string }>;
  movimientos: Movimiento[];
  consumoRegistrado?: string;
}

const STOCK_INICIAL: Record<ClaveArea, Record<string, number>> = {
  panaderia: { "HAR-GM50": 120, "HAR-INT": 30, "AZU-R25": 20, "SAL-25": 8, "LEV-10": 3, "LEC-P25": 10, "AVE-10": 8, "BOL-PAN": 400 },
  cocina: { "CRE-UHT": 18, "MAN-10": 6, "ACE-18": 20, "SAL-25": 4, "HUE-LIQ": 6, "HAR-GM50": 15, "CAC-05": 2, "AZU-R25": 6 },
  dulceria: { "HAR-GM50": 10, "AZU-R25": 8, "AZU-G25": 4, "HUE-LIQ": 4, "CRE-UHT": 10, "QCR-10": 6, "CHO-05": 3, "VAI-04": 0.3, "EMP-C10": 25, "EMP-B10": 30 },
};

const stockInicial = (): Record<ClaveArea, ExistenciasArea> =>
  Object.fromEntries(
    Object.values(AREAS).map((a) => [
      a.clave,
      {
        cantidades: { ...STOCK_INICIAL[a.clave] },
        contado: Object.fromEntries(Object.keys(STOCK_INICIAL[a.clave]).map((sku) => [sku, { hora: "06:00", quien: a.recibe }])),
        movimientos: [] as Movimiento[],
      } satisfies ExistenciasArea,
    ]),
  ) as unknown as Record<ClaveArea, ExistenciasArea>;

export const existenciasStore = crearStore<Record<ClaveArea, ExistenciasArea>>(CLAVES.existenciasArea, stockInicial());

export const existenciasDe = (clave: ClaveArea, todos = existenciasStore.get()) => todos[clave] ?? stockInicial()[clave];

function moverStock(clave: ClaveArea, cambios: { sku: string; cantidad: number; tipo: Movimiento["tipo"]; texto: string; quien: string; fijar?: boolean }[]) {
  existenciasStore.set((todos) => {
    const e = existenciasDe(clave, todos);
    const cantidades = { ...e.cantidades };
    const contado = { ...e.contado };
    const hora = horaActual();
    for (const c of cambios) {
      cantidades[c.sku] = Number(Math.max(0, c.fijar ? c.cantidad : (cantidades[c.sku] ?? 0) + c.cantidad).toFixed(2));
      if (c.tipo === "conteo") contado[c.sku] = { hora, quien: c.quien };
    }
    const movimientos = [...cambios.map((c) => ({ hora, tipo: c.tipo, sku: c.sku, cantidad: c.cantidad, texto: c.texto, quien: c.quien })), ...e.movimientos].slice(0, 80);
    return { ...todos, [clave]: { ...e, cantidades, contado, movimientos } };
  });
}

export const claveDeArea = (nombre: string) => Object.values(AREAS).find((a) => a.nombre === nombre)?.clave;

/** Lo que el área confirmó al recibir entra a su existencia. */
export function registrarEntrada(t: Trabajo, e: EstadoTrabajo, quien: string) {
  const clave = claveDeArea(t.nombre);
  if (!clave) return;
  const cambios = t.lineas.flatMap((l) => {
    const r = e.resultados[l.id];
    if (!r || r.tipo === "pendiente" || r.tipo === "sustituto") return [];
    const cantidad = r.tipo === "completa" ? l.pidio : equivalente(insumoDe(l.sku), r.bultos);
    return [{ sku: l.sku, cantidad, tipo: "entrada" as const, texto: `Recibido en ${t.contenedor}`, quien }];
  });
  if (cambios.length) moverStock(clave, cambios);
}

/** El área cuenta lo que tiene: la existencia queda igual al conteo. */
export function contarExistencia(a: Area, sku: string, contado: number) {
  const antes = existenciasDe(a.clave).cantidades[sku] ?? 0;
  const dif = Number((contado - antes).toFixed(2));
  moverStock(a.clave, [{ sku, cantidad: contado, tipo: "conteo", fijar: true, texto: dif === 0 ? "Conteo sin diferencia" : `Conteo: ${dif > 0 ? "+" : ""}${dif} contra el sistema`, quien: a.recibe }]);
}

/** Descuenta lo que se consumió hoy según el plan (una vez por día). */
export function registrarConsumoDeHoy(a: Area) {
  const plan = planDe(a);
  const consumo = consumoDelDia(a, plan, DIA_HOY);
  moverStock(
    a.clave,
    [...consumo].map(([sku, cantidad]) => ({ sku, cantidad: -cantidad, tipo: "consumo" as const, texto: "Producción de hoy según el plan", quien: a.pide })),
  );
  existenciasStore.set((todos) => ({ ...todos, [a.clave]: { ...existenciasDe(a.clave, todos), consumoRegistrado: HOY } }));
}

// ── Requerimiento de insumos ────────────────────────────────────

export type Frecuencia = "diaria" | "cada3";
/** Lo refrigerado se pide a diario; lo seco, cada tercer día. */
export const frecuenciaDe = (i: Insumo): Frecuencia => (i.tipo === "camara" ? "diaria" : "cada3");
export const TEXTO_FRECUENCIA: Record<Frecuencia, string> = { diaria: "Diaria · cubre 2 días", cada3: "Cada tercer día · cubre 4 días" };
const DIAS_A_CUBRIR: Record<Frecuencia, number> = { diaria: 2, cada3: 4 };

/** Insumos que pide el plan en un día: sku → cantidad. */
export function consumoDelDia(a: Area, plan: Plan, dia: number) {
  const total = new Map<string, number>();
  for (const p of PRODUCTOS[a.clave]) {
    const n = plan.cantidades[p.id]?.[dia] ?? 0;
    for (const [sku, porUnidad] of p.receta) total.set(sku, (total.get(sku) ?? 0) + n * porUnidad);
  }
  return total;
}

export interface Requerimiento {
  sku: string;
  insumo: Insumo;
  frecuencia: Frecuencia;
  dias: string[];
  necesito: number;
  tengo: number;
  enCamino: number;
  falta: number;
  empaques: number;
  pedir: number;
  /** De dónde sale el número: producto, cantidad del plan y consumo. */
  porque: { producto: string; unidades: number; cantidad: number }[];
}

const red = (n: number) => Number(n.toFixed(2));

/** Lo que el área ya pidió y todavía no recibe, por insumo. */
export function enCaminoDe(a: Area, estados = surtidoStore.get(), pedidos = pedidosAreaStore.get()) {
  const total = new Map<string, number>();
  for (const t of trabajosDelArea(a, pedidos)) {
    const e = estadoDe(t.id, estados);
    if (["confirmado", "cancelado", "rechazado"].includes(e.estado)) continue;
    for (const l of t.lineas) total.set(l.sku, (total.get(l.sku) ?? 0) + l.pidio);
  }
  return total;
}

export function requerimiento(a: Area, plan: Plan, existencias: ExistenciasArea, enCamino: Map<string, number>): Requerimiento[] {
  const skus = [...new Set(PRODUCTOS[a.clave].flatMap((p) => p.receta.map(([sku]) => sku)))];
  // Si ya se registró el consumo de hoy, lo que hay en el área es para mañana en adelante.
  const inicio = existencias.consumoRegistrado === HOY ? DIA_HOY + 1 : DIA_HOY;
  return skus
    .map((sku) => {
      const insumo = insumoDe(sku);
      const frecuencia = frecuenciaDe(insumo);
      const dias = SEMANA.slice(inicio, inicio + DIAS_A_CUBRIR[frecuencia]);
      const porque = PRODUCTOS[a.clave].flatMap((p) => {
        const porUnidad = p.receta.find(([s]) => s === sku)?.[1];
        if (!porUnidad) return [];
        const unidades = dias.reduce((s, d) => s + (plan.cantidades[p.id]?.[d.n] ?? 0), 0);
        return unidades ? [{ producto: p.nombre, unidades, cantidad: red(unidades * porUnidad) }] : [];
      });
      const necesito = red(porque.reduce((s, x) => s + x.cantidad, 0));
      const tengo = red(existencias.cantidades[sku] ?? 0);
      const camino = red(enCamino.get(sku) ?? 0);
      const falta = red(Math.max(0, necesito - tengo - camino));
      const empaques = falta > 0 ? bultosPara(insumo, falta) : 0;
      return { sku, insumo, frecuencia, dias: dias.length ? dias.map((d) => `${d.nombre} ${d.dia}`) : ["fin de semana"], necesito, tengo, enCamino: camino, falta, empaques, pedir: red(empaques * insumo.manejo.contenido), porque };
    })
    .sort((x, y) => y.falta - x.falta || x.insumo.nombre.localeCompare(y.insumo.nombre));
}

/** Para cuántos días alcanza lo que hay, al ritmo del plan de los próximos días. */
export function alcance(a: Area, plan: Plan, sku: string, cantidad: number, desdeManana = false) {
  const inicio = desdeManana ? DIA_HOY + 1 : DIA_HOY;
  let resto = cantidad;
  for (let d = inicio; d < 7; d++) {
    resto -= consumoDelDia(a, plan, d).get(sku) ?? 0;
    if (resto < 0) return d - DIA_HOY;
  }
  return 7 - DIA_HOY;
}

/**
 * Convierte lo que falta en una solicitud en borrador. Nunca se envía sola: el área la revisa
 * en "Nueva solicitud" y la envía.
 */
export function generarSolicitud(a: Area, req: Requerimiento[]) {
  const lineas: Borrador["lineas"] = req
    .filter((r) => r.empaques > 0)
    .map((r) => ({
      sku: r.sku,
      cantidad: r.pedir,
      antes: false,
      unidad: "empaque" as const,
      vistoDado: true,
      razon: `Plan ${r.dias.at(0)}–${r.dias.at(-1)}: necesitas ${r.necesito} ${r.insumo.unidad}, tienes ${r.tengo}${r.enCamino ? ` y vienen ${r.enCamino}` : ""}`,
    }));
  borradoresStore.set((todos) => ({
    ...todos,
    [a.clave]: { lineas, sinCodigo: [], recibe: a.recibe, entrega: "ventana", nota: "Generada desde la planeación de la semana", guardado: horaActual(), desdePlan: true },
  }));
  return lineas.length;
}

/** Productos del plan que usan un insumo (para avisar el impacto de un faltante). */
export const productosQueUsan = (clave: ClaveArea, sku: string) => PRODUCTOS[clave].filter((p) => p.receta.some(([s]) => s === sku)).map((p) => p.nombre);
