/**
 * Persistencia local de la maqueta. Todo vive en localStorage del navegador:
 * nada sale del dispositivo.
 */

export const CLAVES = {
  bultosPorAcomodar: "momi-recepcion-cerrada",
  desviacionesRecepcion: "momi-desviaciones-recepcion",
  desviacionesAcomodo: "momi-desviaciones-acomodo",
  resguardos: "momi-resguardo",
  sustituciones: "momi-sustituciones",
  incidencias: "momi-incidencias",
  ordenes: "momi-estado-ordenes",
  posiciones: "momi-posiciones-bloqueadas",
  tareasConteo: "momi-tareas-conteo",
  umbrales: "momi-umbrales-antesala",
  notificaciones: "momi-notificaciones",
  recepciones: "momi-recepciones",
  surtido: "momi-surtido",
  pedidosArea: "momi-pedidos-area",
  borradoresArea: "momi-borradores-area",
  planesArea: "momi-planes-area",
  existenciasArea: "momi-existencias-area",
  politicaVidaUtil: "momi-politica-vida-util",
  estadoLotes: "momi-estado-lotes",
  merma: "momi-merma",
  exactitudLote: "momi-exactitud-lote",
  oscuro: "momi-pda-oscuro",
} as const;

export function leer<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo === null ? porDefecto : (JSON.parse(crudo) as T);
  } catch {
    return porDefecto;
  }
}

export function guardar(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Almacenamiento bloqueado (modo privado): la maqueta sigue funcionando sin persistir.
  }
}

export function agregar<T>(clave: string, elemento: T) {
  guardar(clave, [...leer<T[]>(clave, []), elemento]);
}
