import { HOY, sumarDias } from "@/lib/fecha";
import { diasEntre, fechaConAnio, horaActual } from "@/lib/utils";
import { INVENTARIO, diasPara, estadoLotesStore, exactitudStore, type EstadoLote, type Exactitud } from "./caducidad";
import { incidenciasStore, type Incidencia } from "./incidencias";
import { resumenOrden, ordenesStore } from "./ordenes";
import { todasLasOrdenes } from "./recepcion";
import { recepcionesStore, type RegistroRecepcion } from "./recepciones";
import { estadoDe, insumoDe, minutosDelDia, pedidosAreaStore, surtidoStore, trabajosDelDia, type EstadoTrabajo, type PedidoArea } from "./surtido";

/**
 * Dirección General (basado en el módulo de Lovable): resultado, capital de trabajo y riesgo de
 * toda la operación. Las cifras de negocio (USD, ventas, costos) son datos de ejemplo; lo que la
 * maqueta ya opera (lotes vencidos, citas, surtido, exactitud, actividad, órdenes) sale en vivo.
 */

export const DIRECTOR = { nombre: "Eduardo Him", puesto: "Director General" };

// ── Filtros ─────────────────────────────────────────────────────

export type Periodo = "mes" | "90d" | "anio";

const inicioMes = HOY.slice(0, 8) + "01";
export const PERIODOS: { id: Periodo; texto: string; rango: string; factor: number }[] = [
  { id: "mes", texto: "Mes a la fecha", rango: `${fechaConAnio(inicioMes).replace(/ \d{4}$/, "")} – ${fechaConAnio(HOY)}`, factor: 1 },
  { id: "90d", texto: "Últimos 90 días", rango: `${fechaConAnio(sumarDias(HOY, -89))} – ${fechaConAnio(HOY)}`, factor: 2.9 },
  { id: "anio", texto: "Año", rango: `1 ene – ${fechaConAnio(HOY)}`, factor: 9.4 },
];

export const AREAS_DIR = ["Todas las áreas", "Panadería", "Dulcería", "Cocina", "Almacén Central"];
export const CANALES = ["Todos los canales", "Áreas de producción", "Tiendas · rutas", "E-commerce", "Pedidos especiales"];

// ── Indicadores principales ─────────────────────────────────────

export interface Kpi {
  id: string;
  nombre: string;
  valor: number;
  unidad: string;
  /** Cambio contra el periodo anterior y si ese cambio es bueno. */
  cambio: { texto: string; bueno: boolean };
  meta: { texto: string; valor: number; mayorEsMejor: boolean };
  /** Escala de la barra de avance. */
  escala: [number, number];
  apoyo: [{ valor: string; texto: string }, { valor: string; texto: string }];
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const usd = fmt;
export const usdCorto = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/0$/, "")} M` : n >= 1e3 ? `${Math.round(n / 1e3)} K` : fmt(n));

export function kpis(periodo: Periodo, exactitud: Exactitud): Kpi[] {
  const f = PERIODOS.find((p) => p.id === periodo)!.factor;
  const merma = 9180 * f;
  const desabasto = 11019 * f;
  const lecturas = exactitud.coinciden + exactitud.difieren;
  const exact = lecturas ? Math.round((exactitud.coinciden / lecturas) * 1000) / 10 : 100;
  return [
    { id: "margen", nombre: "Margen perdido", valor: merma + desabasto, unidad: "USD", cambio: { texto: "+8.4 %", bueno: false }, meta: { texto: `Meta ≤ ${fmt(12500 * f)} USD`, valor: 12500 * f, mayorEsMejor: false }, escala: [0, 26000 * f], apoyo: [{ valor: fmt(merma), texto: "Merma" }, { valor: fmt(desabasto), texto: "Desabasto" }] },
    { id: "fill", nombre: "Fill rate a canales", valor: 86.4, unidad: "%", cambio: { texto: "+1.2 pp", bueno: true }, meta: { texto: "Meta ≥ 95 %", valor: 95, mayorEsMejor: true }, escala: [0, 100], apoyo: [{ valor: fmt(1843 * f), texto: "Líneas surtidas" }, { valor: fmt(2133 * f), texto: "Solicitadas" }] },
    { id: "dias", nombre: "Días de inventario", valor: 34, unidad: "días", cambio: { texto: "+2 d", bueno: false }, meta: { texto: "Meta ≤ 24 días", valor: 24, mayorEsMejor: false }, escala: [0, 40], apoyo: [{ valor: "1.25 M", texto: "USD en stock" }, { valor: fmt(36765), texto: "USD por día" }] },
    { id: "otif", nombre: "OTIF de proveedores", valor: 76, unidad: "%", cambio: { texto: "−3 pp", bueno: false }, meta: { texto: "Meta ≥ 90 %", valor: 90, mayorEsMejor: true }, escala: [0, 100], apoyo: [{ valor: fmt(38 * f), texto: "A tiempo y completo" }, { valor: fmt(50 * f), texto: "Recibos del periodo" }] },
    { id: "plan", nombre: "Cumplimiento del plan", valor: 91.2, unidad: "%", cambio: { texto: "−1.8 pp", bueno: false }, meta: { texto: "Meta ≥ 98 %", valor: 98, mayorEsMejor: true }, escala: [0, 100], apoyo: [{ valor: fmt(1368 * f), texto: "Unidades producidas" }, { valor: fmt(1500 * f), texto: "Planeadas" }] },
    // En vivo: las mismas lecturas de lote que registra el PDA (KPI-Exactitud por lote).
    { id: "exactitud", nombre: "Exactitud de inventario", valor: exact, unidad: "%", cambio: { texto: "+1.1 pp", bueno: true }, meta: { texto: "Meta ≥ 98 %", valor: 98, mayorEsMejor: true }, escala: [0, 100], apoyo: [{ valor: fmt(exactitud.coinciden), texto: "Lecturas que coinciden" }, { valor: fmt(lecturas), texto: "Lecturas de lote" }] },
  ];
}

export const cumpleMeta = (k: Kpi) => (k.meta.mayorEsMejor ? k.valor >= k.meta.valor : k.valor <= k.meta.valor);

// ── Margen perdido y proyección ─────────────────────────────────

export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MARGEN_MENSUAL = {
  merma: [6100, 6400, 6900, 7200, 7500, 7900, 8300, 8700, 9180],
  desabasto: [7600, 8100, 8500, 8900, 9300, 9700, 10100, 10600, 11019],
  /** Octubre a diciembre. */
  sinCambios: [21200, 22200, 23200],
  conWms: [21200, 18800, 16400],
};

// ── Capital, caducidad, costos, retrasos ────────────────────────

export const CAPITAL_ABC = [
  { clase: "Clase A", valor: 500000, rota: 12, detalle: "20 % de los artículos · 80 % del consumo" },
  { clase: "Clase B", valor: 437500, rota: 31, detalle: "30 % de los artículos · 15 % del consumo" },
  { clase: "Clase C", valor: 312500, rota: 68, detalle: "50 % de los artículos · 5 % del consumo" },
];

export const CAMARAS = ["Todas", "Seco", "Refrigerado", "Congelado"] as const;
export type Camara = (typeof CAMARAS)[number];
export const RIESGO_CADUCIDAD: Record<Camara, { critico: number; proximo: number; sano: number }> = {
  Todas: { critico: 47000, proximo: 112000, sano: 1091000 },
  Seco: { critico: 6000, proximo: 31000, sano: 692000 },
  Refrigerado: { critico: 33000, proximo: 61000, sano: 224000 },
  Congelado: { critico: 8000, proximo: 20000, sano: 175000 },
};

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

// ── Negocio y canales ───────────────────────────────────────────

export type Alcance = "hoy" | "semana" | "mes";
export const NEGOCIO: { nombre: string; valores: Record<Alcance, number>; usd?: boolean }[] = [
  { nombre: "Venta despachada", valores: { hoy: 14200, semana: 96800, mes: 418600 }, usd: true },
  { nombre: "Pedidos a tiendas", valores: { hoy: 14, semana: 91, mes: 392 } },
  { nombre: "E-commerce", valores: { hoy: 7, semana: 39, mes: 168 } },
  { nombre: "Pedidos especiales", valores: { hoy: 2, semana: 17, mes: 71 } },
  { nombre: "Órdenes de producción", valores: { hoy: 5, semana: 30, mes: 128 } },
  { nombre: "Órdenes de compra", valores: { hoy: 8, semana: 50, mes: 214 } },
];
export const CUMPLIMIENTO_CANAL: { canal: string; valores: Record<Alcance, number> }[] = [
  { canal: "Áreas de producción", valores: { hoy: 68, semana: 70, mes: 71 } },
  { canal: "Tiendas · rutas", valores: { hoy: 81, semana: 77, mes: 78 } },
  { canal: "E-commerce", valores: { hoy: 86, semana: 91, mes: 90 } },
  { canal: "Pedidos especiales", valores: { hoy: 50, semana: 62, mes: 64 } },
];
export const META_CUMPLIMIENTO = 95;

// ── Inventario por cámara y fugas ───────────────────────────────

export const VALOR_CAMARA = [
  { camara: "Seco", mp: 318000, insumos: 142000, pt: 96000 },
  { camara: "Refrigerado", mp: 186000, insumos: 74000, pt: 58000 },
  { camara: "Congelado", mp: 121000, insumos: 38000, pt: 44000 },
  { camara: "Empaque", mp: 0, insumos: 173000, pt: 0 },
];

export const FUGAS = [
  { articulo: "Crema de leche UHT", codigo: "CRE-UHT", causa: "Caducidad", usd: 4820, area: "Dulcería" },
  { articulo: "Piña galón", codigo: "ING-PIÑA-001", causa: "No se encontró", usd: 3910, area: "Dulcería" },
  { articulo: "Harina Gold Mills dura", codigo: "HAR-GM50", causa: "No teníamos", usd: 3480, area: "Panadería" },
  { articulo: "Azúcar refinada", codigo: "AZU-R25", causa: "No teníamos", usd: 2640, area: "Panadería" },
  { articulo: "Aceite vegetal", codigo: "ACE-18", causa: "Dañado", usd: 1870, area: "Cocina" },
  { articulo: "Producto de panadería", codigo: "PT-PAN-001", causa: "Caducidad", usd: 1540, area: "Panadería" },
  { articulo: "Queso crema", codigo: "QCR-10", causa: "Caducidad", usd: 1210, area: "Dulcería" },
];

// ── En vivo: excepciones que escalan, actividad y órdenes abiertas ──

/** Precio de referencia por unidad (USD) para valuar pedidos y lotes en la maqueta. */
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

export interface Escalada {
  id: string;
  n: number;
  titulo: string;
  texto: string;
  tono: "critico" | "alerta";
  columnas: string[];
  filas: string[][];
}

export function escaladas(estadosLote: Record<string, EstadoLote>, estados: Record<string, EstadoTrabajo>, pedidos: PedidoArea[], recepciones: RegistroRecepcion[]): Escalada[] {
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
    return o.fechaProgramada === HOY && !!o.cita && minutosDelDia(o.cita.padStart(5, "0")) < ahora;
  });
  return [
    {
      id: "inocuidad",
      n: vencidos.length,
      titulo: "Inocuidad",
      texto: "lotes vencidos disponibles",
      tono: "critico",
      columnas: ["Artículo", "Lote", "Posición", "Vencido"],
      filas: vencidos.map((b) => [insumoDe(b.sku).nombre, b.lote, b.posicion, `hace ${-diasPara(b)} d`]),
    },
    {
      id: "produccion",
      n: 1,
      titulo: "Producción",
      texto: "Panadería sin cobertura para mañana",
      tono: "critico",
      columnas: ["Área", "Insumo", "Falta para el plan", "Desde"],
      filas: [["Panadería", "Harina integral", "45 KG", "mañana 08:57"]],
    },
    {
      id: "surtido",
      n: vencidosSurtido.length,
      titulo: "Surtido",
      texto: "compromisos vencidos hoy",
      tono: "critico",
      columnas: ["Pedido", "Destino", "Debía salir", "Estado"],
      filas: vencidosSurtido.map((t) => [t.id, t.nombre, t.sale === "ahora" ? "urgente" : t.sale, estadoDe(t.id, estados).estado === "surtiendo" ? "Surtiendo" : "En cola"]),
    },
    {
      id: "proveedor",
      n: citas.length,
      titulo: "Proveedor",
      texto: "citas vencidas sin llegar",
      tono: "alerta",
      columnas: ["OC", "Proveedor", "Cita", "Retraso"],
      filas: citas.map((o) => [o.oc, o.proveedor, `${fechaConAnio(o.fechaProgramada)}${o.cita ? ` ${o.cita}` : ""}`, o.fechaProgramada < HOY ? `${diasEntre(o.fechaProgramada, HOY)} d` : `${Math.floor((ahora - minutosDelDia(o.cita!.padStart(5, "0"))) / 60)} h`]),
    },
    {
      id: "ajustes",
      n: 431,
      titulo: "Ajustes",
      texto: "sin causa clasificada",
      tono: "alerta",
      columnas: ["Tipo de ajuste", "Registros", "USD"],
      filas: [["Texto libre en conteo", "286", "6,940"], ["Diferencia de recepción", "98", "2,310"], ["Corrección manual", "47", "1,120"]],
    },
    {
      id: "capital",
      n: 10,
      titulo: "Capital",
      texto: "días sobre la meta de inventario",
      tono: "alerta",
      columnas: ["Clase", "Rotación", "Meta", "USD de más"],
      filas: [["Clase B", "31 d", "24 d", "98,800"], ["Clase C", "68 d", "45 d", "105,700"]],
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

/** La operación de hoy: incidencias, urgencias, recepciones y salidas, más lo de la mañana. */
export function actividad(incidencias: Incidencia[], estados: Record<string, EstadoTrabajo>, pedidos: PedidoArea[], recepciones: RegistroRecepcion[]): Actividad[] {
  const lista: Actividad[] = [];
  for (const i of incidencias) lista.push({ ts: i.creada, hora: i.hora, titulo: i.titulo, detalle: `${i.id} · ${i.oc}`, tono: i.semaforo === "rojo" ? "critico" : "alerta" });
  for (const p of pedidos) {
    const ap = estados[p.id]?.aprobacion;
    if (ap) lista.push({ ts: ap.solicitadaMs, hora: ap.solicitada, titulo: `Urgencia de ${p.nombre}${ap.decision ? (ap.decision === "aprobada" ? " aprobada" : ap.decision === "ventana" ? " pasada a la ventana" : " rechazada") : " por aprobar"}`, detalle: `${ap.quien ?? ap.aprobador} · ${p.id}`, tono: ap.decision === "rechazada" || !ap.decision ? "alerta" : "info" });
  }
  for (const r of recepciones) if (r.estado === "cerrada" && r.fin) lista.push({ ts: r.fin, hora: new Date(r.fin).toTimeString().slice(0, 5), titulo: `Recepción ${r.oc} cerrada`, detalle: `${r.proveedor} · ${r.bultos ?? 0} bultos`, tono: "info" });
  for (const t of trabajosDelDia(pedidos)) {
    const e = estadoDe(t.id, estados);
    if (e.salidaMs) lista.push({ ts: e.salidaMs, hora: new Date(e.salidaMs).toTimeString().slice(0, 5), titulo: `${t.nombre}: salió del almacén`, detalle: `${t.contenedor}`, tono: "info" });
  }
  // Lo de la mañana (datos de ejemplo), para que el panel no arranque vacío.
  const base = new Date(`${HOY}T00:00:00`).getTime();
  const ejemplo = (hora: string, titulo: string, detalle: string, tono: Actividad["tono"]) => ({ ts: base + minutosDelDia(hora) * 6e4, hora, titulo, detalle, tono });
  lista.push(
    ejemplo("07:25", "Recepción OC-7139 cerrada", "Pastas del Istmo · 10 sacos de harina", "info"),
    ejemplo("09:31", "Urgencia de Panadería aprobada", `Rosa Villalaz · levadura`, "info"),
    ejemplo("06:50", "Conteo cíclico cerrado", "Pasillo PB-CF · 95.4 % de exactitud", "info"),
  );
  return lista.sort((a, b) => b.ts - a.ts).slice(0, 8);
}

export interface Compromiso {
  folio: string;
  tipo: "Compra" | "Surtido" | "Especial" | "E-commerce";
  destino: string;
  compromiso: string;
  /** Para ordenar por fecha y hora. */
  orden: number;
  estado: string;
  tono: "critico" | "alerta" | "info" | "neutro";
  usd: number;
}

const ESPECIALES: Compromiso[] = [
  { folio: "ESP-0094", tipo: "Especial", destino: "Evento corporativo", compromiso: "hoy 17:00", orden: 17 * 60, estado: "En cola 1 h", tono: "alerta", usd: 820 },
  { folio: "ESP-0095", tipo: "Especial", destino: "Mayoreo · Súper 99", compromiso: "mañana 08:00", orden: 1440 + 480, estado: "Programado", tono: "info", usd: 1450 },
  { folio: "WEB-332", tipo: "E-commerce", destino: "Cliente web + 6 pedidos", compromiso: "hoy 15:00", orden: 15 * 60, estado: "Fuera de corte", tono: "critico", usd: 640 },
];

export function compromisos(estados: Record<string, EstadoTrabajo>, pedidos: PedidoArea[], recepciones: RegistroRecepcion[]): Compromiso[] {
  const ahora = minutosAhora();
  const ocs: Compromiso[] = todasLasOrdenes()
    .filter((o) => !["completa", "cerrada_corta"].includes(resumenOrden(o, ordenesStore.get()).estado))
    .map((o) => {
      const r = resumenOrden(o, ordenesStore.get());
      const enCurso = recepciones.some((x) => x.oc === o.oc && x.estado === "en_curso");
      const cita = o.cita ? minutosDelDia(o.cita.padStart(5, "0")) : 0;
      const dias = diasEntre(HOY, o.fechaProgramada);
      const vencida = !enCurso && r.estado === "nueva" && (dias < 0 || (dias === 0 && cita < ahora));
      const usdOc = o.productos.reduce((s, p) => s + p.cajas * p.unidadesPorCaja * 2.4, 0);
      return {
        folio: o.oc,
        tipo: "Compra" as const,
        destino: o.proveedor,
        compromiso: dias === 0 ? `hoy ${o.cita ?? ""}`.trim() : fechaConAnio(o.fechaProgramada),
        orden: dias * 1440 + cita,
        estado: enCurso ? "Recibiendo" : r.estado === "parcial" ? "Recibida parcial" : vencida ? (dias < 0 ? `Cita vencida ${-dias} d` : `Cita vencida ${Math.max(1, Math.floor((ahora - cita) / 60))} h`) : "Por recibir",
        tono: vencida ? ("critico" as const) : r.estado === "parcial" ? ("alerta" as const) : ("info" as const),
        usd: Math.round(usdOc),
      };
    });
  const surtidos: Compromiso[] = trabajosDelDia(pedidos)
    .map((t) => ({ t, e: estadoDe(t.id, estados) }))
    .filter(({ e }) => ["por_aprobar", "en_cola", "surtiendo", "pausado", "transito"].includes(e.estado))
    .map(({ t, e }) => {
      const sale = t.sale === "ahora" ? ahora : minutosDelDia(t.sale);
      const tarde = e.estado !== "transito" && e.estado !== "por_aprobar" && sale < ahora;
      return {
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

export function useDireccionEnVivo() {
  const estadosLote = estadoLotesStore.use();
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  const recepciones = recepcionesStore.use();
  const incidencias = incidenciasStore.use();
  const exactitud = exactitudStore.use();
  ordenesStore.use();
  return {
    exactitud,
    escaladas: escaladas(estadosLote, estados, pedidos, recepciones),
    actividad: actividad(incidencias, estados, pedidos, recepciones),
    compromisos: compromisos(estados, pedidos, recepciones),
  };
}
