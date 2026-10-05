import {
  CAUSAS,
  COSTO_PROCESO,
  ESCENARIO,
  IMPACTO_MENSUAL,
  INMOVILIZADO,
  RETRASO,
  TOP_EXCEPCIONES,
  VALOR_CAMARA,
  VALOR_INVENTARIO,
  caducidadDe,
  totalInmovilizado,
  totalMes,
  usd,
  valorEnRiesgo,
  type Escalada,
} from "./direccion";
import type { EstadoLote } from "./caducidad";

/**
 * "Análisis ✦" de cada panel de Dirección: qué está pasando, por qué, qué pasa si no se hace
 * nada, qué hacer (quién decide, para cuándo, cuánto vale) y qué no se sabe. Texto preparado sobre
 * los datos de ejemplo; las cifras en vivo se calculan al abrirlo. No inventa causas que el dato
 * no sostiene: cuando no se sabe, lo dice.
 */

export interface Accion {
  titulo: string;
  detalle: string;
  decide: string;
  para: string;
  vale: string;
  enlace?: { texto: string; ruta?: string };
}

export interface Analisis {
  pasando: string;
  porque: string;
  siNo: string;
  acciones: Accion[];
  noSe: string;
}

export type PanelId = "impacto" | "riesgo" | "inmovilizado" | "caducidad" | "costo" | "retraso" | "negocio" | "excepciones" | "valor" | "top";

const sumar = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function analisisDe(panel: PanelId, vivo: { escaladas: Escalada[]; estadosLote: Record<string, EstadoLote> }): Analisis {
  const lotes = vivo.escaladas.find((e) => e.id === "inocuidad")!;
  const surtido = vivo.escaladas.find((e) => e.id === "surtido")!;
  const proveedor = vivo.escaladas.find((e) => e.id === "proveedor")!;
  const accionLotes: Accion = {
    titulo: lotes.n ? `Bloquear ${lotes.n === 1 ? "el lote vencido" : `los ${lotes.n} lotes vencidos`}` : "Inventario vencido: al día",
    detalle: lotes.n ? `${lotes.filas.map((f) => `${f[0]} ${f[1]}`).join(", ")} siguen disponibles para surtir` : "Ningún lote vencido sigue disponible",
    decide: "Calidad",
    para: "hoy",
    vale: `USD ${usd(lotes.impacto)}`,
    enlace: { texto: "Abrir caducidad por lote", ruta: "/supervisor?ver=caducidad" },
  };
  const accionSurtidor: Accion = {
    titulo: "Reforzar el turno de surtido",
    detalle: `Hay ${surtido.n} ${surtido.n === 1 ? "compromiso vencido" : "compromisos vencidos"} y un solo surtidor por turno`,
    decide: "Eduardo",
    para: "hoy",
    vale: `USD ${usd(surtido.impacto)}`,
    enlace: { texto: "Abrir la cola de surtido", ruta: "/supervisor?ver=surtido" },
  };
  const accionProveedor: Accion = {
    titulo: proveedor.n ? `Llamar a ${[...new Set(proveedor.filas.map((f) => f[1]))].join(", ")}` : "Proveedores: citas al día",
    detalle: proveedor.n ? proveedor.filas.map((f) => `${f[0]} (${f[3]} de retraso)`).join(", ") : "Sus citas de hoy van en tiempo",
    decide: "Compras",
    para: "hoy",
    vale: `USD ${usd(proveedor.impacto)}`,
    enlace: { texto: "Abrir órdenes de compra", ruta: "/supervisor?ver=ordenes" },
  };

  switch (panel) {
    case "impacto": {
      const sep = totalMes(8);
      const ago = totalMes(7);
      const t1 = sumar([0, 1, 2].map(totalMes));
      const t3 = sumar([6, 7, 8].map(totalMes));
      const confirmadas = TOP_EXCEPCIONES.filter((x) => x.confirmada);
      const investigacion = TOP_EXCEPCIONES.filter((x) => !x.confirmada);
      const mayor = [...CAUSAS].sort((a, b) => IMPACTO_MENSUAL[b.id][8] - IMPACTO_MENSUAL[a.id][8])[0];
      return {
        pasando: `Las excepciones costaron USD ${usd(sep)} en septiembre, ${(((sep / ago) - 1) * 100).toFixed(1)} % más que en agosto. ${mayor.nombre} es la causa más grande: USD ${usd(IMPACTO_MENSUAL[mayor.id][8])}.`,
        porque: `Por causa: ${CAUSAS.map((c) => `${c.nombre.toLowerCase()} ${usd(IMPACTO_MENSUAL[c.id][8])}`).join(", ")}. Las seis excepciones confirmadas más grandes suman USD ${usd(sumar(confirmadas.map((x) => x.usd)))}. ${investigacion.map((x) => `${x.articulo} (USD ${usd(x.usd)})`).join(", ")} sigue en investigación y no cuenta como pérdida.`,
        siNo: `El último trimestre pesa ${Math.round((t3 / t1 - 1) * 100)} % más que el primero. En el escenario base, diciembre llegaría a USD ${usd(ESCENARIO.base[2])}; en el escenario objetivo con WMS, a ${usd(ESCENARIO.objetivo[2])}. Es una proyección con supuestos de reducción, no un resultado garantizado.`,
        acciones: [accionLotes, accionSurtidor, accionProveedor],
        noSe: `No sé cuánta merma es de manipulación y cuánta de sobrecompra, porque los ajustes se capturan con texto libre. El desabasto está valuado a costo: el margen no capturado por desabasto necesita precio de venta y demanda no atendida, que hoy no están integrados.`,
      };
    }
    case "riesgo": {
      const r = valorEnRiesgo(vivo.estadosLote);
      return {
        pasando: `Hoy hay USD ${usd(r.total)} expuestos a convertirse en pérdida.`,
        porque: r.componentes.map((c) => `${c.nombre.toLowerCase()}: ${usd(c.usd)}`).join("; ") + ". El sobrestock sin movimiento no se suma aquí: está en capital inmovilizado, para no contarlo dos veces.",
        siNo: `Lo vencido y lo que vence en 7 días (USD ${usd(caducidadDe("Todas").vencido + caducidadDe("Todas")["7"])}) se vuelve merma en días si no se consume o se bloquea.`,
        acciones: [accionLotes, { titulo: "Cerrar las diferencias en investigación", detalle: "Contar las posiciones antes de ajustar: lo no encontrado puede aparecer", decide: "Supervisor de almacén", para: "esta semana", vale: "USD 6,050", enlace: { texto: "Abrir inventario", ruta: "/supervisor?ver=inventario" } }],
        noSe: `No tengo el consumo planeado por lote, así que no sé cuánto de lo que vence en 8 a 30 días alcanza a usarse antes.`,
      };
    }
    case "inmovilizado": {
      const total = totalInmovilizado();
      const mas90 = sumar(INMOVILIZADO.slice(2).map((t) => t.usd));
      return {
        pasando: `USD ${usd(total)} llevan más de 30 días sin movimiento: ${Math.round((total / VALOR_INVENTARIO.fisico) * 100)} % del inventario. USD ${usd(mas90)} llevan más de 90 días.`,
        porque: `El tramo más grande es 31–60 días (USD ${usd(INMOVILIZADO[0].usd)}). En más de 180 días hay empaque y esencias que se compraron por volumen.`,
        siNo: `Lo que pasa de 180 días sin moverse tiene alta probabilidad de terminar en merma u obsolescencia.`,
        acciones: [
          { titulo: "Revisar lo que lleva más de 90 días", detalle: "Decidir consumo, devolución o liquidación", decide: "Compras", para: "este mes", vale: `USD ${usd(mas90)}` },
          { titulo: "Ajustar los puntos de reorden", detalle: "Pedir por consumo real en los artículos de 31–90 días", decide: "Compras", para: "este mes", vale: `USD ${usd(INMOVILIZADO[0].usd + INMOVILIZADO[1].usd)}` },
        ],
        noSe: `La antigüedad se mide desde el último movimiento; un artículo de temporada puede estar quieto a propósito.`,
      };
    }
    case "caducidad": {
      const r = caducidadDe("Todas");
      return {
        pasando: `USD ${usd(r.vencido)} ya vencieron y USD ${usd(r["7"])} vencen en 7 días o menos. Otros ${usd(r["30"])} vencen entre 8 y 30 días.`,
        porque: `El refrigerado concentra lo vencido (USD ${usd(caducidadDe("Refrigerado").vencido)}). ${lotes.n ? `Hoy hay ${lotes.n} lotes vencidos todavía disponibles para surtir.` : "Hoy no hay lotes vencidos disponibles."}`,
        siNo: `Lo vencido no puede usarse; lo de 7 días se convierte en merma la próxima semana si no se consume primero.`,
        acciones: [accionLotes, { titulo: "Ofrecer a producción lo que vence en 7 días", detalle: "Que Dulcería y Cocina lo consuman antes del lote nuevo", decide: "Supervisor de almacén", para: "esta semana", vale: `USD ${usd(r["7"])}`, enlace: { texto: "Abrir inventario", ruta: "/supervisor?ver=inventario" } }],
        noSe: `No sé cuánto de lo próximo a vencer ya está comprometido en pedidos de las áreas.`,
      };
    }
    case "costo": {
      const total = sumar(COSTO_PROCESO.map((c) => c.usd));
      const s = COSTO_PROCESO.find((c) => c.proceso === "Surtido")!;
      return {
        pasando: `Operar el almacén costaría USD ${usd(total)} al mes; surtido sería el ${Math.round((s.usd / total) * 100)} % (USD ${usd(s.usd)}). Montos ilustrativos: es una capacidad futura.`,
        porque: `Surtido tiene el mayor costo por unidad movida (USD ${s.porUnidad}) y un solo surtidor por turno. Sube cada mes: ${s.historia.map(usd).join(" → ")}.`,
        siNo: `Sin costo por proceso no se puede decidir con datos dónde conviene invertir en gente o equipo.`,
        acciones: [{ titulo: "Definir la metodología de costeo", detalle: "Tiempos del WMS + costo laboral (RRHH) + equipo e infraestructura (ERP)", decide: "Eduardo", para: "este trimestre", vale: "Decisiones de capacidad" }],
        noSe: `Hoy no hay costeo por proceso en MOMI: estos montos son de ejemplo. Requiere tiempos del WMS, costo laboral de RRHH y costos del ERP.`,
      };
    }
    case "retraso": {
      const filas = Object.entries(RETRASO);
      const total = sumar(filas.flatMap(([, v]) => v));
      const finDeSemana = sumar(filas.flatMap(([, v]) => [v[4], v[5]]));
      return {
        pasando: `Viernes y sábado concentran el ${Math.round((finDeSemana / total) * 100)} % de las horas de retraso. Tiendas · rutas llega a 5.8 h el sábado.`,
        porque: `El dato muestra el patrón, no la causa: la maqueta no registra por qué se retrasó cada compromiso.`,
        siNo: `Si el patrón sigue, los compromisos del fin de semana seguirán saliendo tarde.`,
        acciones: [{ titulo: "Definir compromiso y causa de retraso", detalle: "Hora objetivo, hora real y causa obligatoria al cerrar cada entrega", decide: "Eduardo", para: "este mes", vale: "Saber dónde actuar" }],
        noSe: `No sé si el retraso viene del almacén, de producción o de transporte, porque la causa no se captura.`,
      };
    }
    case "negocio":
      return {
        pasando: `Se despacharon USD 418,600 en el mes. E-commerce cumple el 90 % a la hora prometida; los pedidos especiales, el 64 %.`,
        porque: `La Torre junta fuentes distintas (ventas, e-commerce, producción, compras y WMS); el WMS es una de ellas, no la única.`,
        siNo: `Sin cumplimiento por canal, un incumplimiento en pedidos especiales se ve tarde.`,
        acciones: [{ titulo: "Integrar ventas y e-commerce a la Torre", detalle: "Para medir cumplimiento con la venta real y no solo con lo despachado", decide: "Eduardo", para: "este trimestre", vale: "Visibilidad por canal" }],
        noSe: `No tengo la venta a precio de venta, solo lo despachado.`,
      };
    case "excepciones": {
      const abiertas = vivo.escaladas.filter((e) => e.n > 0);
      return {
        pasando: `${abiertas.length} tipos de excepción superan hoy las reglas de escalamiento, con USD ${usd(sumar(abiertas.map((e) => e.impacto)))} de impacto asociado.`,
        porque: `Inventario vencido, pedidos incumplidos y OC atrasadas salen en vivo del almacén; las diferencias y el material retenido, de los conteos y de Calidad.`,
        siNo: `Las de inocuidad son las más delicadas: un lote vencido surtido llega a producción.`,
        acciones: [accionLotes, accionSurtidor, accionProveedor],
        noSe: `Las reglas de escalamiento de esta maqueta son de ejemplo; hay que definir los umbrales reales con cada área.`,
      };
    }
    case "valor": {
      const total = sumar(VALOR_CAMARA.map((c) => c.mp + c.insumos + c.pt));
      const seco = VALOR_CAMARA[0];
      return {
        pasando: `El inventario vale USD ${usd(total)}, pero solo USD ${usd(VALOR_INVENTARIO.disponible)} están disponibles: ${usd(VALOR_INVENTARIO.comprometido)} ya están comprometidos y ${usd(VALOR_INVENTARIO.retenido)} retenidos en cuarentena o resguardo.`,
        porque: `Seco concentra USD ${usd(seco.mp + seco.insumos + seco.pt)} (${Math.round(((seco.mp + seco.insumos + seco.pt) / total) * 100)} %). La clase A es el 40 % del valor y rota cada 12 días.`,
        siNo: `Valor total no es inventario utilizable: decidir con el total sobrestima lo que hay para producir.`,
        acciones: [{ titulo: "Pedir empaque por consumo", detalle: "El empaque (USD 173,000) rota lento y ocupa piso", decide: "Compras", para: "este mes", vale: "USD 58,000" }],
        noSe: `El producto terminado está valuado a costo estándar, no al costo real del lote.`,
      };
    }
    case "top": {
      const conf = TOP_EXCEPCIONES.filter((x) => x.confirmada);
      const inv = TOP_EXCEPCIONES.filter((x) => !x.confirmada);
      return {
        pasando: `Las siete excepciones más grandes de septiembre suman USD ${usd(sumar(TOP_EXCEPCIONES.map((x) => x.usd)))}: USD ${usd(sumar(conf.map((x) => x.usd)))} confirmados y USD ${usd(sumar(inv.map((x) => x.usd)))} en investigación.`,
        porque: `El desabasto de harina y azúcar es lo más caro confirmado. ${inv.map((x) => x.articulo).join(", ")} no se encontró en su posición: puede estar mal ubicado, así que no es pérdida todavía.`,
        siNo: `Si la diferencia no se resuelve, terminará como ajuste confirmado y pasará al impacto económico.`,
        acciones: [{ titulo: "Contar la posición de la piña", detalle: "Antes de ajustar, buscar en posiciones vecinas", decide: "Supervisor de almacén", para: "hoy", vale: "USD 3,910", enlace: { texto: "Abrir inventario", ruta: "/supervisor?ver=inventario" } }, accionProveedor],
        noSe: `"No se encontró" no distingue entre mal ubicado y faltante real hasta que se cuenta.`,
      };
    }
  }
}
