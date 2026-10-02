import { useEffect, useState } from "react";
import { leerBultos } from "./bultos";
import { esPendiente, incidenciasStore, procesoDe, type Incidencia, type TipoIncidencia } from "./incidencias";
import { bloqueosStore, familiaTemperatura, tareasConteoStore, umbralesStore } from "./posiciones";
import { recepcionesStore } from "./recepciones";
import { estadoDe, surtidoStore, trabajosDelDia } from "./surtido";

export const TIPO_TEXTO: Record<TipoIncidencia, string> = {
  dano: "Daño",
  no_en_oc: "No está en la OC",
  codigo_desconocido: "Código no reconocido",
  otra_presentacion: "Otra presentación",
  linea_rechazada: "Línea rechazada",
  excedente: "Excedente",
  saldo: "Saldo de OC",
  otro: "Otro problema",
  posicion_ocupada: "Posición ocupada",
  inventario_inesperado: "Inventario no registrado",
  incompatible: "Temperatura incompatible",
  fefo: "FEFO imposible",
  abandonado: "Bulto en antesala",
  no_localizado: "Bulto no localizado",
  fefo_surtido: "Lote FEFO no disponible",
  faltante_surtido: "Faltante al surtir",
  posicion_vacia: "Posición vacía",
  vencido: "Producto vencido",
  diferencia_area: "Diferencia al recibir",
  vida_util: "Vida útil corta",
  lote_distinto: "Lote distinto al sistema",
  sustituto: "Sustituto propuesto",
  retraso_surtido: "No alcanza la salida",
  sin_confirmar: "Entrega sin confirmar",
};

const minutos = (desde: number, ahora: number) => Math.max(0, Math.round((ahora - desde) / 6e4));

/** Orden de atención: rojo primero y, dentro de cada color, lo más antiguo. */
export function porUrgencia(a: Incidencia, b: Incidencia) {
  const peso = { rojo: 0, amarillo: 1, verde: 2 };
  return peso[a.semaforo] - peso[b.semaforo] || a.creada - b.creada;
}

export function antiguedad(i: Incidencia, ahora = Date.now()) {
  const m = minutos(i.creada, i.resueltaEn ?? ahora);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Indicadores de monitoreo en vivo (V3) con lo que la operación ya registra. */
export function calcularMetricas(ahora = Date.now()) {
  const incidencias = incidenciasStore.get();
  const recepciones = recepcionesStore.get();
  const umbrales = umbralesStore.get();
  const bultos = leerBultos();
  const abiertas = incidencias.filter(esPendiente);
  const resueltas = incidencias.filter((i) => i.resueltaEn && i.estado !== "anulada" && i.estado !== "registrada");
  const masAntigua = [...abiertas].sort((a, b) => a.creada - b.creada)[0];

  const antesala = (["frio", "seco"] as const).map((familia) => {
    const deFamilia = bultos.filter((b) => !b.espera && familiaTemperatura(b.zona) === familia);
    const max = deFamilia.length ? Math.max(...deFamilia.map((b) => minutos(b.desde, ahora))) : 0;
    const u = umbrales[familia];
    return {
      familia,
      etiqueta: familia === "frio" ? "Refrigerado y congelado" : "Seco",
      bultos: deFamilia.length,
      minutos: max,
      alerta: u.alerta,
      limite: u.escala,
      nivel: max >= u.escala ? ("critico" as const) : max >= u.alerta ? ("alerta" as const) : ("ok" as const),
    };
  });

  const conteoTipos = new Map<TipoIncidencia, number>();
  for (const i of abiertas) conteoTipos.set(i.tipo, (conteoTipos.get(i.tipo) ?? 0) + 1);

  const revisiones = tareasConteoStore.get().filter((t) => t.estado === "pendiente");

  const surtido = surtidoStore.get();
  const trabajos = trabajosDelDia().map((t) => ({ t, e: estadoDe(t.id, surtido) }));
  const enTransito = trabajos
    .filter(({ e }) => e.estado === "transito" && e.salidaMs)
    .map(({ t, e }) => ({ id: t.id, nombre: t.corto, recibe: t.recibe, minutos: minutos(e.salidaMs!, ahora) }));
  const lineasConDiferencia = trabajos.reduce(
    (s, { e }) => s + Object.values(e.resultados).filter((r) => r.tipo !== "completa").length,
    0,
  );

  return {
    recibo: {
      enCurso: recepciones.filter((r) => r.estado === "en_curso"),
      cerradas: recepciones.filter((r) => r.estado === "cerrada").length,
      canceladas: recepciones.filter((r) => r.estado === "cancelada").length,
      ocConSaldo: abiertas.filter((i) => i.tipo === "saldo").length,
      enResguardo: abiertas.filter((i) => i.destino === "resguardo").reduce((s, i) => s + (i.cantidad ?? 0), 0),
    },
    acomodo: {
      porAcomodar: bultos.filter((b) => !b.espera).length,
      apartados: bultos.filter((b) => b.espera).length,
      bloqueadas: Object.keys(bloqueosStore.get()).length,
      antesala,
    },
    excepciones: {
      abiertas: abiertas.length,
      rojas: abiertas.filter((i) => i.semaforo === "rojo").length,
      amarillas: abiertas.filter((i) => i.semaforo === "amarillo").length,
      recibo: abiertas.filter((i) => procesoDe(i) === "Recibo").length,
      acomodo: abiertas.filter((i) => procesoDe(i) === "Acomodo").length,
      surtido: abiertas.filter((i) => procesoDe(i) === "Surtido").length,
      area: abiertas.filter((i) => i.decisor === "area").length,
      supervisor: abiertas.filter((i) => i.decisor === "supervisor" || i.decisor === "maestros").length,
      calidad: abiertas.filter((i) => i.decisor === "calidad").length,
      compras: abiertas.filter((i) => i.decisor === "compras").length,
      masAntigua: masAntigua ? { id: masAntigua.id, titulo: masAntigua.titulo, minutos: minutos(masAntigua.creada, ahora) } : null,
      promedioResolucion: resueltas.length
        ? Math.round(resueltas.reduce((s, i) => s + minutos(i.creada, i.resueltaEn!), 0) / resueltas.length)
        : null,
      resueltas: resueltas.length,
      porTipo: [...conteoTipos.entries()]
        .map(([tipo, n]) => ({ tipo, texto: TIPO_TEXTO[tipo], n }))
        .sort((a, b) => b.n - a.n),
    },
    inventario: {
      revisiones: revisiones.length,
      sinAsignar: revisiones.filter((t) => !t.asignado).length,
    },
    surtido: {
      enCola: trabajos.filter(({ e }) => e.estado === "en_cola" || e.estado === "pausado").length,
      surtiendo: trabajos.filter(({ e }) => e.estado === "surtiendo").length,
      urgentes: trabajos.filter(({ t, e }) => t.urgente && ["en_cola", "pausado", "surtiendo"].includes(e.estado)).length,
      enTransito,
      confirmados: trabajos.filter(({ e }) => e.estado === "confirmado").length,
      lineasConDiferencia,
      trabajos: trabajos.map(({ t, e }) => ({
        id: t.id,
        nombre: t.corto,
        sale: t.sale,
        urgente: !!t.urgente,
        estado: e.estado,
        avance: `${Object.keys(e.resultados).length} de ${t.lineas.length}`,
        minutosTransito: e.salidaMs && e.estado === "transito" ? minutos(e.salidaMs, ahora) : null,
        // Lo que hizo el área desde su PDA.
        area: e.confirmado
          ? `Confirmó ${e.confirmado.quien} · ${e.confirmado.hora}${e.confirmado.diferencia ? " · con diferencia" : ""}`
          : e.cancelado
            ? `Canceló ${e.cancelado.quien} · ${e.cancelado.hora}`
            : e.estado === "transito"
              ? `Falta que confirme ${t.recibe}`
              : "—",
      })),
    },
  };
}

export type Metricas = ReturnType<typeof calcularMetricas>;

/**
 * Métricas en vivo: se recalculan cuando cambia cualquier dato compartido (también
 * desde otra pestaña) y cada 5 s para los tiempos que corren.
 */
export function useMetricas() {
  incidenciasStore.use();
  recepcionesStore.use();
  bloqueosStore.use();
  tareasConteoStore.use();
  umbralesStore.use();
  surtidoStore.use();
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 5000);
    return () => clearInterval(reloj);
  }, []);
  return { metricas: calcularMetricas(ahora), ahora };
}
