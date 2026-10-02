import { CLAVES, guardar, leer } from "@/lib/almacenamiento";
import { generarSSCC } from "@/lib/sscc";
import { cuenta } from "@/lib/utils";
import { buscarOrden, kilos, OC_EN_ANDEN, TIPOS_DANO, type DestinoDano, type Orden, type Zona } from "./recepcion";

/** Un bulto etiquetado al recibir, esperando que lo acomoden. */
export interface Bulto {
  sscc: string;
  producto: string;
  codigo: string;
  lote: string;
  caduca: string;
  kg: number;
  zona: Zona;
  oc: string;
  proveedor: string;
  unidad: string;
  contenido: string;
  origen: string;
  loteEnPiso: string | null;
  cuarentena: string | null;
  /** Nota que viaja con el bulto (p. ej. daño exterior aceptado). */
  observacion?: string;
  /** Incidencia que lo originó o lo retiene. */
  incidencia?: string;
  desde: number;
  /** Apartado mientras el supervisor decide (ID de la incidencia). */
  espera?: string;
  /** Instrucción que regresa con la decisión del supervisor. */
  nota?: string;
  /** Posición que el supervisor autorizó aunque no sea la compatible. */
  posicionAutorizada?: string;
  /** El supervisor autorizó dejarlo al fondo aunque caduque antes. */
  fefoInvertido?: boolean;
}

/** Resultado del conteo de un producto al recibir. */
export interface ConteoLinea {
  cajas: number;
  faltante: number;
  danadas: number;
  tipoDano?: string;
  destinoDano?: DestinoDano;
  incidencia?: string;
  /** Incidencia del excedente que se mandó a resguardo al contar. */
  incidenciaExcedente?: string;
}

const ANTESALA: Record<Zona, string> = {
  Refrigerado: "antesala F-02",
  Congelado: "antesala C-01",
  Seco: "antesala R-01",
};

/** Estado de la decisión de Calidad sobre los bultos dañados de una línea. */
export type DecisionDano = "pendiente" | "liberada" | "cuarentena" | "rechazada";

/**
 * Crea un bulto por caja contada. Las primeras `danadas` llevan la incidencia de daño:
 * van a cuarentena salvo que el daño sea solo exterior o Calidad ya las haya liberado;
 * si Calidad las rechazó, se devuelven y no se crean.
 */
export function generarBultos(
  orden: Orden,
  conteos: (ConteoLinea | undefined)[],
  decisionDe: (incidencia: string) => DecisionDano = () => "pendiente",
  inicioSerie = 0,
): Bulto[] {
  const bultos: Bulto[] = [];
  let indice = inicioSerie;
  orden.productos.forEach((p, i) => {
    const conteo = conteos[i];
    if (!conteo) return;
    const tipo = TIPOS_DANO.find((t) => t.id === conteo.tipoDano);
    const decision = conteo.incidencia ? decisionDe(conteo.incidencia) : "pendiente";
    for (let c = 0; c < conteo.cajas; c++) {
      const danada = c < conteo.danadas;
      if (danada && decision === "rechazada") continue;
      const retenida = danada && conteo.destinoDano !== "disponible" && decision !== "liberada";
      bultos.push({
        sscc: generarSSCC(indice++, orden.oc),
        producto: p.nombre,
        codigo: p.codigo,
        lote: p.lote,
        caduca: p.sinCaducidad ? "" : p.caducidad,
        kg: kilos(p, 1),
        zona: p.zona,
        oc: orden.oc,
        proveedor: orden.proveedor,
        unidad: p.unidadManejo,
        contenido: p.unidadesPorCaja > 1 ? cuenta(p.unidadesPorCaja, p.unidadInterna, p.unidadInternaPlural) : `${kilos(p, 1)} kg`,
        origen: ANTESALA[p.zona],
        loteEnPiso: p.loteEnPiso,
        cuarentena: retenida ? `Dañado al recibir · ${tipo?.texto.toLowerCase() ?? "daño"}` : null,
        observacion: danada && !retenida ? `Daño: ${tipo?.texto.toLowerCase() ?? "revisado por Calidad"}` : undefined,
        incidencia: danada ? conteo.incidencia : undefined,
        desde: Date.now(),
      });
    }
  });
  return bultos;
}

/** Bultos que quedan en resguardo y solo pasan a Acomodar si se autorizan. */
export function bultosDeResguardo(
  n: number,
  datos: {
    producto: string;
    codigo: string;
    oc: string;
    proveedor: string;
    zona: Zona;
    contenido: string;
    incidencia: string;
    /** Unidad en la que llegó, en singular; por defecto, caja. */
    unidad?: string;
  },
): Bulto[] {
  const unidad = datos.unidad ?? "caja";
  const serie = 900 + Math.floor(Math.random() * 90) * 10;
  return Array.from({ length: n }, (_, i) => ({
    sscc: generarSSCC(serie + i, datos.oc),
    producto: datos.producto,
    codigo: datos.codigo,
    lote: "Por validar",
    caduca: "",
    kg: 0,
    zona: datos.zona,
    oc: datos.oc,
    proveedor: datos.proveedor,
    unidad,
    contenido: datos.contenido,
    origen: "resguardo R-01",
    loteEnPiso: null,
    cuarentena: null,
    incidencia: datos.incidencia,
    desde: Date.now(),
  }));
}

export const leerBultos = () => leer<Bulto[]>(CLAVES.bultosPorAcomodar, []);

export function agregarBultos(bultos: Bulto[]) {
  guardar(CLAVES.bultosPorAcomodar, [...leerBultos(), ...bultos]);
}

export function quitarBulto(sscc: string) {
  guardar(CLAVES.bultosPorAcomodar, leerBultos().filter((b) => b.sscc !== sscc));
}

export function actualizarBultos(filtro: (b: Bulto) => boolean, cambios: Partial<Bulto>) {
  guardar(
    CLAVES.bultosPorAcomodar,
    leerBultos().map((b) => (filtro(b) ? { ...b, ...cambios } : b)),
  );
}

export function quitarBultos(filtro: (b: Bulto) => boolean) {
  guardar(CLAVES.bultosPorAcomodar, leerBultos().filter((b) => !filtro(b)));
}

/** Aplica la decisión de Calidad a los bultos que ya se pasaron a Acomodar. */
export function aplicarDecisionDano(incidencia: string, decision: DecisionDano) {
  const bultos = leerBultos();
  if (decision === "rechazada") {
    guardar(CLAVES.bultosPorAcomodar, bultos.filter((b) => !(b.incidencia === incidencia && b.cuarentena)));
  } else if (decision === "liberada") {
    guardar(
      CLAVES.bultosPorAcomodar,
      bultos.map((b) =>
        b.incidencia === incidencia && b.cuarentena ? { ...b, cuarentena: null, observacion: "Liberado por Calidad" } : b,
      ),
    );
  }
}

/** Para probar Acomodar sin recibir primero: carga los bultos de la orden en andén. */
export function cargarBultosDeEjemplo() {
  const orden = buscarOrden(OC_EN_ANDEN)!;
  const conteos: ConteoLinea[] = orden.productos.map((p, i) => ({
    cajas: p.cajas,
    faltante: 0,
    danadas: i === 4 ? 1 : 0,
    tipoDano: i === 4 ? "primario" : undefined,
    destinoDano: i === 4 ? "cuarentena" : undefined,
  }));
  // Para ver las alertas de antesala sin esperar: lo frío lleva 25 min y lo seco 35.
  const ahora = Date.now();
  const bultos = generarBultos(orden, conteos, undefined, 500).map((b) => ({
    ...b,
    desde: ahora - (b.zona === "Seco" ? 35 : 25) * 60_000,
  }));
  agregarBultos(bultos);
}
