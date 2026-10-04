import { CAPITAL_ABC, COSTO_PROCESO, FUGAS, MARGEN_MENSUAL, RETRASO, RIESGO_CADUCIDAD, VALOR_CAMARA, usd, type Escalada } from "./direccion";

/**
 * "Análisis ✦" de cada panel de Dirección: qué está pasando, por qué, qué pasa si no se hace
 * nada, qué hacer (con quién decide, para cuándo y cuánto vale) y qué no se sabe todavía.
 * Es texto preparado sobre los datos de ejemplo; las cifras en vivo se calculan al abrirlo.
 */

export interface Accion {
  titulo: string;
  detalle: string;
  decide: string;
  para: string;
  vale: string;
  /** Pantalla de la maqueta donde se atiende (se abre en otra pestaña). */
  enlace?: { texto: string; ruta?: string };
}

export interface Analisis {
  pasando: string;
  porque: string;
  siNo: string;
  acciones: Accion[];
  noSe: string;
}

export type PanelId = "margen" | "capital" | "caducidad" | "costo" | "retraso" | "negocio" | "excepciones" | "valor" | "fugas";

const sumar = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function analisisDe(panel: PanelId, vivo: { escaladas: Escalada[] }): Analisis {
  const lotes = vivo.escaladas.find((e) => e.id === "inocuidad")!;
  const surtido = vivo.escaladas.find((e) => e.id === "surtido")!;
  const proveedor = vivo.escaladas.find((e) => e.id === "proveedor")!;
  const accionLotes: Accion = {
    titulo: lotes.n ? `Bloquear ${lotes.n === 1 ? "el lote vencido" : `los ${lotes.n} lotes vencidos`}` : "Lotes vencidos: al día",
    detalle: lotes.n ? `${lotes.filas.map((f) => `${f[0]} ${f[1]}`).join(", ")} siguen disponibles en posiciones` : "Ningún lote vencido sigue disponible",
    decide: "Calidad",
    para: "hoy",
    vale: "USD 43",
    enlace: { texto: "Abrir caducidad por lote", ruta: "/supervisor?ver=caducidad" },
  };
  const accionSurtidor: Accion = {
    titulo: "Asignar un segundo surtidor al turno",
    detalle: `Hay ${surtido.n} ${surtido.n === 1 ? "compromiso vencido" : "compromisos vencidos"} y un solo surtidor`,
    decide: "Eduardo",
    para: "hoy",
    vale: "USD 1,791",
    enlace: { texto: "Abrir la cola de surtido", ruta: "/supervisor?ver=surtido" },
  };
  const accionProveedor: Accion = {
    titulo: proveedor.n ? `Llamar a ${[...new Set(proveedor.filas.map((f) => f[1]))].join(", ")}` : "Proveedores: citas al día",
    detalle: proveedor.n ? `${proveedor.filas.map((f) => `${f[0]} (${f[3]} de retraso)`).join(", ")}` : "Sus citas de hoy van en tiempo",
    decide: "Compras",
    para: "hoy",
    vale: "USD 218",
    enlace: { texto: "Abrir órdenes de compra", ruta: "/supervisor?ver=ordenes" },
  };

  switch (panel) {
    case "margen": {
      const tot = MARGEN_MENSUAL.merma.map((m, i) => m + MARGEN_MENSUAL.desabasto[i]);
      const t1 = sumar(tot.slice(0, 3));
      const t3 = sumar(tot.slice(6, 9));
      const top = sumar(FUGAS.map((f) => f.usd));
      const porCausa = (c: string) => sumar(FUGAS.filter((f) => f.causa === c).map((f) => f.usd));
      const dulceria = sumar(FUGAS.filter((f) => f.area === "Dulcería").map((f) => f.usd));
      return {
        pasando: `Se perdieron USD 20,199 en el mes, un 8.4 % más que el mes anterior. Son USD 664 por día, incluidos domingos.`,
        porque: `Las siete mayores fugas explican ${usd(top)} de los 20,199. Por causa: caducidad ${usd(porCausa("Caducidad"))}, "no teníamos" ${usd(porCausa("No teníamos"))}, "no se encontró" ${usd(porCausa("No se encontró"))} y dañado ${usd(porCausa("Dañado"))}. Dulcería concentra ${usd(dulceria)} (${Math.round((dulceria / 20199) * 100)} %), con la crema de leche UHT como el artículo más caro.`,
        siNo: `La curva lleva nueve meses subiendo: el último trimestre pesa ${Math.round((t3 / t1 - 1) * 100)} % más que el primero. Diciembre cerraría en USD ${usd(MARGEN_MENSUAL.sinCambios[2])} al mes. Con el WMS operando desde noviembre cerraría en ${usd(MARGEN_MENSUAL.conWms[2])}: ${usd(MARGEN_MENSUAL.sinCambios[2] - MARGEN_MENSUAL.conWms[2])} menos en un solo mes.`,
        acciones: [
          accionLotes,
          accionSurtidor,
          accionProveedor,
          { titulo: "Nombrar un dueño del catálogo", detalle: "2,362 SKUs sin código bloquean la mitad del ahorro", decide: "Eduardo", para: "esta semana", vale: "USD 70,126", enlace: { texto: "Catálogo · próximamente" } },
        ],
        noSe: `No puedo separar cuánta merma es de manipulación y cuánta de sobrecompra: 431 ajustes se capturaron como texto libre, sin causa. Tampoco tengo el precio de venta, así que el desabasto está valuado a costo y el margen real perdido es mayor.`,
      };
    }
    case "capital": {
      const [a, b, c] = CAPITAL_ABC;
      return {
        pasando: `Hay USD 1.25 M inmovilizados en inventario: 34 días de consumo contra una meta de 24.`,
        porque: `La clase C (${usd(c.valor)}) rota cada ${c.rota} días y pesa ${Math.round((c.valor / 1250000) * 100)} % del capital con solo el 5 % del consumo. La clase B rota cada ${b.rota} días; la A, cada ${a.rota}.`,
        siNo: `Cada día de inventario de más cuesta USD 36,765 de capital. Los 10 días sobre la meta equivalen a USD 367,650 que no están en caja.`,
        acciones: [
          { titulo: "Bajar el punto de reorden de la clase C", detalle: "Pedir por consumo real y no por costumbre", decide: "Compras", para: "este mes", vale: "USD 105,700" },
          { titulo: "Revisar los mínimos de la clase B", detalle: "31 días de rotación contra 24 de meta", decide: "Compras", para: "este mes", vale: "USD 98,800" },
        ],
        noSe: `La clasificación ABC es de hace tres meses; los artículos nuevos y los de temporada podrían haber cambiado de clase.`,
      };
    }
    case "caducidad": {
      const r = RIESGO_CADUCIDAD.Todas;
      return {
        pasando: `USD ${usd(r.critico + r.proximo)} están en riesgo de caducar: ${usd(r.critico)} vencidos o por vencer en 7 días y ${usd(r.proximo)} entre 8 y 30 días.`,
        porque: `El refrigerado concentra el ${Math.round(((RIESGO_CADUCIDAD.Refrigerado.critico + RIESGO_CADUCIDAD.Refrigerado.proximo) / (r.critico + r.proximo)) * 100)} % del riesgo. ${lotes.n ? `Hoy hay ${lotes.n} lotes vencidos todavía disponibles para surtir.` : "Hoy no hay lotes vencidos disponibles."}`,
        siNo: `Lo que vence en 7 días se vuelve merma la próxima semana: USD ${usd(r.critico)} directo al margen perdido.`,
        acciones: [
          accionLotes,
          { titulo: "Mover lo próximo a vencer a producción", detalle: "Ofrecerlo a Dulcería y Cocina antes del lote nuevo", decide: "Supervisor de almacén", para: "esta semana", vale: `USD ${usd(Math.round(r.critico * 0.6))}`, enlace: { texto: "Abrir inventario", ruta: "/supervisor?ver=inventario" } },
        ],
        noSe: `No tengo el consumo planeado por lote, así que no sé cuánto de lo que vence en 8 a 30 días alcanza a usarse.`,
      };
    }
    case "costo": {
      const total = sumar(COSTO_PROCESO.map((c) => c.usd));
      const s = COSTO_PROCESO.find((c) => c.proceso === "Surtido")!;
      return {
        pasando: `La operación del almacén costó USD ${usd(total)} en el mes. Surtido se lleva ${usd(s.usd)} (${Math.round((s.usd / total) * 100)} %).`,
        porque: `Surtido tiene un solo surtidor por turno y es el proceso más caro por unidad movida (USD ${s.porUnidad}). Sube cada mes: ${s.historia.map(usd).join(" → ")}.`,
        siNo: `Con la tendencia actual, surtido pasaría de USD 10,000 en dos meses y los compromisos vencidos seguirían creciendo los viernes y sábados.`,
        acciones: [accionSurtidor, { titulo: "Agrupar el surtido por piso", detalle: "Un solo viaje de elevador por pedido", decide: "Supervisor de almacén", para: "este mes", vale: "USD 1,120" }],
        noSe: `El costo es de mano de obra y equipo; no incluye energía de las cámaras ni mermas por manipulación.`,
      };
    }
    case "retraso": {
      const filas = Object.entries(RETRASO);
      const total = sumar(filas.flatMap(([, v]) => v));
      const finDeSemana = sumar(filas.flatMap(([, v]) => [v[4], v[5]]));
      return {
        pasando: `Viernes y sábado concentran el ${Math.round((finDeSemana / total) * 100)} % de las horas de retraso. Tiendas · rutas llega a 5.8 h el sábado.`,
        porque: `La demanda de fin de semana sube y el turno de surtido es el mismo que entre semana. Las áreas piden más tarde los viernes.`,
        siNo: `Los pedidos de las tiendas del sábado seguirán saliendo tarde y la venta de fin de semana es la más alta.`,
        acciones: [accionSurtidor, { titulo: "Adelantar la ventana del viernes", detalle: "Cerrar pedidos de las áreas a las 11:30", decide: "Eduardo", para: "esta semana", vale: "USD 640" }],
        noSe: `No sé cuánto del retraso viene del almacén y cuánto de producción, porque la hora de inicio de producción no se registra.`,
      };
    }
    case "negocio":
      return {
        pasando: `Se despacharon USD 418,600 en el mes. E-commerce cumple el 90 % a la hora prometida; los pedidos especiales, solo el 64 %.`,
        porque: `Los pedidos especiales entran fuera de la planeación y compiten con las áreas por el mismo surtidor.`,
        siNo: `Los clientes de pedidos especiales son los de mayor ticket; cada incumplimiento arriesga la recompra.`,
        acciones: [{ titulo: "Reservar capacidad para especiales", detalle: "Una ventana fija diaria para pedidos especiales", decide: "Eduardo", para: "esta semana", vale: "USD 2,300" }],
        noSe: `No tengo la venta por canal a precio de venta, solo despachado a costo.`,
      };
    case "excepciones": {
      const abiertas = vivo.escaladas.filter((e) => e.n > 0);
      return {
        pasando: `${abiertas.length} tipos de excepción escalan hoy a Dirección: ${abiertas.map((e) => `${e.n} de ${e.titulo.toLowerCase()}`).join(", ")}.`,
        porque: `Inocuidad, surtido y proveedor salen en vivo de la operación del almacén; ajustes y capital, del cierre del periodo.`,
        siNo: `Las de inocuidad son las más delicadas: un lote vencido surtido llega a producción.`,
        acciones: [accionLotes, accionSurtidor, accionProveedor],
        noSe: `Los 431 ajustes sin causa no dejan saber si son errores de captura o pérdidas reales.`,
      };
    }
    case "valor": {
      const total = sumar(VALOR_CAMARA.map((c) => c.mp + c.insumos + c.pt));
      const seco = VALOR_CAMARA[0];
      return {
        pasando: `El inventario vale USD ${usd(total)}. Seco concentra USD ${usd(seco.mp + seco.insumos + seco.pt)} (${Math.round(((seco.mp + seco.insumos + seco.pt) / total) * 100)} %).`,
        porque: `La materia prima seca (harinas, azúcares) se compra por volumen para conseguir precio.`,
        siNo: `El empaque (USD 173,000) rota lento y ocupa espacio de piso que hace falta para el seco.`,
        acciones: [{ titulo: "Pedir empaque por consumo", detalle: "Entregas quincenales en lugar de trimestrales", decide: "Compras", para: "este mes", vale: "USD 58,000" }],
        noSe: `El producto terminado se valúa a costo estándar, no al costo real del lote.`,
      };
    }
    case "fugas":
      return {
        pasando: `Siete artículos explican USD ${usd(sumar(FUGAS.map((f) => f.usd)))} de pérdida en 30 días. La crema de leche UHT encabeza con USD 4,820 por caducidad.`,
        porque: `La crema se pide por caja completa y se consume por litro; los lotes nuevos entran antes de agotar los viejos.`,
        siNo: `La caducidad seguirá siendo la primera causa de merma mientras no se respete el primero que vence.`,
        acciones: [accionLotes, { titulo: "Pedir la crema por consumo de la semana", detalle: "Dulcería y Cocina comparten el pedido", decide: "Compras", para: "esta semana", vale: "USD 2,900" }],
        noSe: `"No se encontró" puede ser error de ubicación o faltante real; sin conteo de esa posición no se distingue.`,
      };
  }
}
