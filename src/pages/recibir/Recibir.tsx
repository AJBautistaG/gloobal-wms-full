import { PrimerNombre } from "@/components/PrimerNombre";
import { FechaHoy } from "@/lib/fecha";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ShieldAlert, Snowflake, X } from "lucide-react";
import { toast } from "sonner";
import {
  BarraFlujo,
  BotonFlujo,
  BotonHoja,
  Cifras,
  Contador,
  Escaner,
  Exito,
  Fila,
  Hoja,
  HojaCancelar,
  Marco,
  Progreso,
  SelectorTarea,
  Tarjeta,
  TEXTO_ESCANER,
} from "@/components/flujo/Flujo";
import {
  CAUSAS_DIFERENCIA,
  CODIGO_DESCONOCIDO,
  OC_EN_ANDEN,
  RANGO_TEMPERATURA,
  RECIBE,
  TEXTO_DESTINO_DANO,
  TIPOS_DANO,
  buscarOrden,
  citasDeHoy,
  kilos,
  ordenesDe,
  productoAjeno,
  type Producto,
} from "@/data/recepcion";
import { agregarBultos, bultosDeResguardo, generarBultos, type ConteoLinea, type DecisionDano } from "@/data/bultos";
import { anularIncidencias, crearIncidencia, esPendiente, incidenciasStore, type Incidencia } from "@/data/incidencias";
import { agregar, CLAVES } from "@/lib/almacenamiento";
import { ordenesStore, registrarRecibido, reiniciarOrden, resumenOrden, saldoDe } from "@/data/ordenes";
import { iniciarRecepcion, terminarRecepcion } from "@/data/recepciones";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { pitido } from "@/lib/feedback";
import { generarSSCC, ssccLegible } from "@/lib/sscc";
import { gtinDe, textoGS1 } from "@/lib/gs1";
import { cn, cuenta, diasEntre, fechaConAnio, fechaNumerica, horaActual, sumarMinutos } from "@/lib/utils";
import { BuscarRecepcion, type Desviacion } from "./BuscarRecepcion";
import {
  PantallaCodigoDesconocido,
  PantallaNoEnOC,
  PantallaOtraLinea,
  PantallaOtraPresentacion,
  type DatosPresentacion,
  type LineaPendiente,
} from "./Excepciones";
import {
  ChipPendientes,
  Foto,
  HojaReportar,
  PantallaIncidencia,
  PantallaOtroProblema,
  type CausaReporte,
  type PasoReporte,
} from "./Incidencias";

type Paso =
  | "inicio"
  | "buscar"
  | "cabecera"
  | "producto"
  | "contar"
  | "recontar"
  | "lote"
  | "etiquetar"
  | "listo"
  | "resumen"
  | "cerrado";

type Visor = "orden" | "producto" | "caja" | "etiqueta" | null;
type EstadoLinea = "recibida" | "resguardo" | "rechazada";

type Excepcion =
  | { tipo: "otra_linea"; indice: number }
  | { tipo: "no_en_oc"; ajeno: ReturnType<typeof productoAjeno> }
  | { tipo: "codigo" }
  | { tipo: "presentacion" }
  | { tipo: "otro"; causa: string }
  | null;

const CONDICIONES_FRIO = ["Termo encendido", "Producto frío al tacto", "Sin escarcha ni agua"];

const MOTIVOS_CANCELAR_RECEPCION = [
  "Me equivoqué de orden",
  "El camión se retiró sin descargar",
  "Se rechaza la entrega completa",
  "La termina otra persona",
];

const enManejo = (p: Producto, n: number) => cuenta(n, p.unidadManejo, p.unidadManejoPlural);
const enInterna = (p: Producto, n: number) => cuenta(n, p.unidadInterna, p.unidadInternaPlural);
const articulo = (p: Producto, femenino: string, masculino: string) => (p.unidadManejo === "caja" ? femenino : masculino);

const ETIQUETA_LINEA: Record<EstadoLinea | "pendiente" | "previa", { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-muted text-muted-foreground" },
  previa: { texto: "Ya recibida", clase: "bg-exito/15 text-exito" },
  recibida: { texto: "Recibida", clase: "bg-exito/15 text-exito" },
  resguardo: { texto: "En resguardo", clase: "bg-alerta/15 text-alerta" },
  rechazada: { texto: "Rechazada", clase: "bg-critico/15 text-critico" },
};

function decisionDano(i: Incidencia | undefined): DecisionDano {
  if (!i) return "pendiente";
  if (i.estado === "liberada") return "liberada";
  if (i.estado === "rechazada") return "rechazada";
  if (i.estado === "cuarentena") return "cuarentena";
  return "pendiente";
}

/**
 * Recepción multilínea por andén: el sistema calcula los pasos de cada línea
 * (contar, leer lote, etiquetar) y la persona confirma. Las excepciones generan
 * incidencias que nunca detienen la descarga.
 */
export default function Recibir() {
  const [paso, setPaso] = useState<Paso>("inicio");
  const [visor, setVisor] = useState<Visor>(null);
  const [ocNoAbierta, setOcNoAbierta] = useState<{ codigo: string; motivo: string } | null>(null);
  const [proveedorBuscado, setProveedorBuscado] = useState<string | undefined>();

  const [oc, setOc] = useState(OC_EN_ANDEN);
  const [recepcion, setRecepcion] = useState("");
  const [sinEscanear, setSinEscanear] = useState(false);
  const [desviacion, setDesviacion] = useState<Desviacion | null>(null);
  const [saldos, setSaldos] = useState<number[]>([]);

  const [modoTemperatura, setModoTemperatura] = useState<"medir" | "sin" | null>(null);
  const [grados, setGrados] = useState("");
  const [condiciones, setCondiciones] = useState([true, true, true]);

  const [indice, setIndice] = useState(0);
  const [contado, setContado] = useState(0);
  const [danado, setDanado] = useState<boolean | null>(null);
  const [danadas, setDanadas] = useState(0);
  const [tipoDano, setTipoDano] = useState<string | null>(null);
  const [fotoDano, setFotoDano] = useState(false);
  const [hojaDiferencia, setHojaDiferencia] = useState<"menor" | "mayor" | "excedente" | null>(null);
  const [loteLeido, setLoteLeido] = useState(false);
  const [loteManual, setLoteManual] = useState<{ lote: string; fecha: string } | null>(null);
  const [conteos, setConteos] = useState<(ConteoLinea | undefined)[]>([]);
  const [lineas, setLineas] = useState<Partial<Record<number, EstadoLinea>>>({});
  const [verDetalle, setVerDetalle] = useState(false);
  const [verLineas, setVerLineas] = useState(false);
  const [cierre, setCierre] = useState<{
    bultos: number;
    autorizados: number;
    cuarentena: number;
    resguardo: number;
    saldo: number;
  } | null>(null);

  const [excepcion, setExcepcion] = useState<Excepcion>(null);
  const [aviso, setAviso] = useState<{ incidencia: Incidencia; alSeguir: () => void } | null>(null);
  const [reportando, setReportando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const inicioAnden = useRef(0);

  const estadosOC = ordenesStore.use();
  const incidencias = incidenciasStore.use();

  const orden = buscarOrden(oc)!;
  const productos = orden.productos;
  const rango = RANGO_TEMPERATURA[orden.transporte];
  const citas = citasDeHoy();
  const enAnden = citas.find((c) => c.enAnden)!;

  const prod = productos[indice];
  const esperado = saldos[indice] ?? prod.cajas;
  const lote = loteManual?.lote || prod.lote;
  const caducidad = loteManual?.fecha || prod.caducidad;

  const aRecibir = saldos.filter((s) => s > 0).length;
  const hechos = Object.keys(lineas).length;
  const pendientes: LineaPendiente[] = productos
    .map((p, i) => ({ indice: i, producto: p, saldo: saldos[i] ?? 0 }))
    .filter((l) => l.saldo > 0 && !lineas[l.indice]);
  const siguientePendiente = (excluir: number) =>
    (pendientes.find((l) => l.indice > excluir) ?? pendientes.find((l) => l.indice !== excluir))?.indice;

  /** Imagen y nombre del producto en curso, para que el operador sepa qué tiene en la mano. */
  const cabeceraProducto = (
    <div className="mt-3 flex items-center gap-3">
      <ImagenProducto codigo={prod.codigo} nombre={prod.nombre} tamano="sm" />
      <p className="font-semibold">
        {prod.nombre} <span className="font-normal text-muted-foreground">· {prod.presentacion}</span>
      </p>
    </div>
  );

  function avanzar(p: Paso) {
    pitido();
    setPaso(p);
  }

  const contexto = () => ({ recepcion, oc: orden.oc, proveedor: orden.proveedor, producto: prod.nombre, codigo: prod.codigo });

  /** Una OC recibida completa o con el saldo cancelado ya no se puede recibir. */
  function motivoCerrada(codigo: string) {
    const o = buscarOrden(codigo);
    if (!o) return "Puede estar cerrada, cancelada o ser de otro almacén.";
    const r = resumenOrden(o, estadosOC);
    if (r.estado === "completa") return "Ya se recibió completa.";
    if (r.estado === "cerrada_corta") return "Compras canceló el saldo. Si el proveedor lo trae, recíbelo como entrega sin OC.";
    return null;
  }

  function empezar(nuevaOc: string, elegidaSinEscanear: boolean, d: Desviacion | null = null) {
    const motivo = motivoCerrada(nuevaOc);
    if (motivo) {
      setPaso("inicio");
      setOcNoAbierta({ codigo: nuevaOc, motivo });
      return;
    }
    const o = buscarOrden(nuevaOc)!;
    const id = `REC-${Date.now()}`;
    setOc(nuevaOc);
    setRecepcion(id);
    iniciarRecepcion({ id, oc: o.oc, proveedor: o.proveedor, anden: o.llegada.anden });
    setSaldos(o.productos.map((p) => saldoDe(o, p, estadosOC)));
    setSinEscanear(elegidaSinEscanear);
    setDesviacion(d);
    setConteos([]);
    setLineas({});
    setCierre(null);
    setModoTemperatura(null);
    setGrados("");
    inicioAnden.current = Date.now();
    avanzar("cabecera");
  }

  function leerOrden(codigo: string) {
    setVisor(null);
    const motivo = motivoCerrada(codigo);
    if (motivo) {
      pitido();
      setOcNoAbierta({ codigo, motivo });
      return;
    }
    empezar(codigo, false);
  }

  function elegirDeAgenda(proveedor: string, codigo: string) {
    if (ordenesDe(proveedor).length > 1) {
      setProveedorBuscado(proveedor);
      setPaso("buscar");
      return;
    }
    empezar(codigo, true);
  }

  function irAProducto(i: number, directoAContar = false) {
    setIndice(i);
    setContado(0);
    setDanado(null);
    setDanadas(0);
    setTipoDano(null);
    setFotoDano(false);
    setHojaDiferencia(null);
    setLoteLeido(false);
    setLoteManual(null);
    setExcepcion(null);
    if (directoAContar) avanzar("contar");
    else setPaso("producto");
  }

  /** Tras cerrar una línea (recibida, en resguardo o rechazada) sigue la próxima pendiente. */
  function seguirConPendiente(actual: number) {
    const siguiente = siguientePendiente(actual);
    setExcepcion(null);
    if (siguiente === undefined) setPaso("resumen");
    else irAProducto(siguiente);
  }

  function mostrarIncidencia(incidencia: Incidencia, alSeguir: () => void) {
    pitido();
    setAviso({ incidencia, alSeguir });
  }

  // ── R10 · daño parcial ────────────────────────────────────────
  const tipo = TIPOS_DANO.find((t) => t.id === tipoDano);
  const danoCompleto = danado === false || (danado === true && danadas > 0 && danadas <= contado && tipo && fotoDano);

  function registrarDano(cajas: number): Partial<ConteoLinea> {
    if (!danado || !tipo) return { danadas: 0 };
    const n = Math.min(danadas, cajas);
    const critica = tipo.destino === "cuarentena_critica";
    const inc = crearIncidencia({
      ...contexto(),
      tipo: "dano",
      semaforo: critica ? "rojo" : "amarillo",
      decisor: "calidad",
      estado: tipo.destino === "disponible" ? "registrada" : "pendiente",
      titulo: `${enManejo(prod, n)} con daño`,
      detalle: `${tipo.texto}. ${TEXTO_DESTINO_DANO[tipo.destino].titulo}.`,
      paso: "Contar",
      cantidad: n,
      unidad: n === 1 ? prod.unidadManejo : prod.unidadManejoPlural,
      destino: tipo.destino,
      foto: fotoDano,
    });
    toast(`${inc.id} · ${TEXTO_DESTINO_DANO[tipo.destino].titulo}`, {
      description: tipo.destino === "disponible" ? "Queda como observación." : "Calidad decide. Tú sigues con la recepción.",
    });
    return { danadas: n, tipoDano: tipo.id, destinoDano: tipo.destino, incidencia: inc.id };
  }

  function registrarConteo(cajas: number, faltante: number, extra: Partial<ConteoLinea> = {}) {
    const dano = registrarDano(cajas);
    setConteos((antes) => {
      const nuevos = [...antes];
      nuevos[indice] = { cajas, faltante, danadas: 0, ...dano, ...extra };
      return nuevos;
    });
    setHojaDiferencia(null);
    pitido();
    setPaso("lote");
    setVisor("caja");
  }

  /**
   * Tolerancias: si llegó más que el saldo, el excedente va a resguardo; una diferencia
   * mínima pide causa; hasta 20 % pide recontar una vez; más, parcial u otra presentación.
   */
  function confirmarConteo() {
    if (contado > esperado) return setHojaDiferencia("excedente");
    const diferencia = esperado - contado;
    const proporcion = diferencia / esperado;
    if (diferencia === 0) return registrarConteo(contado, 0);
    if (diferencia <= 1 || proporcion <= 0.02) return setHojaDiferencia("menor");
    if (proporcion <= 0.2 && paso !== "recontar") {
      setContado(0);
      return avanzar("recontar");
    }
    setHojaDiferencia(proporcion <= 0.2 ? "menor" : "mayor");
  }

  // ── R1 · excedente sobre el saldo ─────────────────────────────
  function mandarExcedenteAResguardo() {
    const exceso = contado - esperado;
    const inc = crearIncidencia({
      ...contexto(),
      tipo: "excedente",
      semaforo: "rojo",
      decisor: "compras",
      titulo: `Excedente de ${enManejo(prod, exceso)}`,
      detalle: `Saldo de la OC: ${esperado}. Llegaron ${contado}. El excedente queda en resguardo sin disponibilidad.`,
      paso: "Contar",
      cantidad: exceso,
      unidad: exceso === 1 ? prod.unidadManejo : prod.unidadManejoPlural,
      destino: "resguardo",
      foto: false,
      bultosPendientes: bultosDeResguardo(exceso, {
        producto: prod.nombre,
        codigo: prod.codigo,
        oc: orden.oc,
        proveedor: orden.proveedor,
        zona: prod.zona,
        contenido: prod.presentacion,
        incidencia: "",
      }),
    });
    toast(`${inc.id} · Excedente en resguardo`, { description: "Compras decide. Tú sigues con la recepción." });
    registrarConteo(esperado, 0, { incidenciaExcedente: inc.id });
  }

  /** Atrás desde Lote: el conteo se deshace y lo que registró (daño, excedente) queda anulado. */
  function volverAContar() {
    const c = conteos[indice];
    anularIncidencias(
      [c?.incidencia, c?.incidenciaExcedente].filter((x): x is string => !!x),
      "el recibidor volvió a contar",
    );
    setConteos((antes) => {
      const nuevos = [...antes];
      nuevos[indice] = undefined;
      return nuevos;
    });
    setLoteLeido(false);
    setLoteManual(null);
    setPaso("contar");
  }

  /** Cancela la recepción: nada pasa a Acomodar y la OC queda como antes de empezar. */
  function cancelarRecepcion(motivo: string) {
    const ids = incidenciasStore
      .get()
      .filter((i) => i.recepcion === recepcion && i.estado !== "anulada")
      .map((i) => i.id);
    anularIncidencias(ids, `recepción cancelada (${motivo.toLowerCase()})`);
    terminarRecepcion(recepcion, { estado: "cancelada", motivo });
    agregar(CLAVES.desviacionesRecepcion, {
      proveedor: orden.proveedor,
      oc: orden.oc,
      desviacion: "cancelada",
      causa: motivo,
      hora: horaActual(),
    });
    setCancelando(false);
    setConteos([]);
    setLineas({});
    setModoTemperatura(null);
    setGrados("");
    setExcepcion(null);
    setVisor(null);
    setPaso("inicio");
    toast(`Recepción de ${orden.oc} cancelada`, {
      description: ids.length ? `${cuenta(ids.length, "incidencia anulada", "incidencias anuladas")}. La OC queda como estaba.` : "La OC queda como estaba.",
    });
  }

  // ── R4 · otra presentación ────────────────────────────────────
  function solicitarConversion(d: DatosPresentacion) {
    const inc = crearIncidencia({
      ...contexto(),
      tipo: "otra_presentacion",
      semaforo: "rojo",
      decisor: "supervisor",
      titulo: "Viene en otra presentación",
      detalle: `La OC espera ${enManejo(prod, esperado)}. Llegó: ${d.descripcion}. Se pide validar la conversión.`,
      paso: "Ficha del producto",
      cantidad: d.bultos,
      unidad: d.unidad,
      destino: "resguardo",
      foto: d.foto,
      bultosPendientes: bultosDeResguardo(d.bultos, {
        producto: prod.nombre,
        codigo: prod.codigo,
        oc: orden.oc,
        proveedor: orden.proveedor,
        zona: prod.zona,
        contenido: d.descripcion,
        unidad: d.unidadSingular,
        incidencia: "",
      }),
      recibidoAlAutorizar: { [prod.codigo]: esperado },
    });
    setLineas((l) => ({ ...l, [indice]: "resguardo" }));
    mostrarIncidencia(inc, () => seguirConPendiente(indice));
  }

  function rechazarLinea(d: DatosPresentacion) {
    const inc = crearIncidencia({
      ...contexto(),
      tipo: "linea_rechazada",
      semaforo: "amarillo",
      decisor: "supervisor",
      estado: "registrada",
      titulo: "Línea rechazada por presentación",
      detalle: `Llegó ${d.descripcion} en lugar de ${enManejo(prod, esperado)}. Regresa en el camión y queda como saldo de la OC.`,
      paso: "Ficha del producto",
      cantidad: d.bultos,
      unidad: d.unidad,
      destino: "devolucion",
      foto: d.foto,
    });
    setLineas((l) => ({ ...l, [indice]: "rechazada" }));
    mostrarIncidencia(inc, () => seguirConPendiente(indice));
  }

  // ── R2 · producto que no está en la OC ────────────────────────
  function registrarAdicional(ajeno: ReturnType<typeof productoAjeno>, bultos: number, foto: boolean) {
    const inc = crearIncidencia({
      ...contexto(),
      producto: `${ajeno.nombre} ${ajeno.presentacion}`.trim(),
      codigo: ajeno.codigo,
      tipo: "no_en_oc",
      semaforo: "rojo",
      decisor: "compras",
      titulo: "Producto que no está en la OC",
      detalle: ajeno.enOtraOc
        ? `${ajeno.codigo} no está en ${orden.oc}, pero sí en ${ajeno.enOtraOc.oc} del mismo proveedor. Compras decide contra cuál recibirlo.`
        : `${ajeno.codigo} no está en ninguna orden abierta de ${orden.proveedor}.`,
      paso: "Escanear producto",
      cantidad: bultos,
      unidad: bultos === 1 ? "bulto" : "bultos",
      destino: "resguardo",
      foto,
      bultosPendientes: bultosDeResguardo(bultos, {
        producto: ajeno.nombre,
        codigo: ajeno.codigo,
        oc: ajeno.enOtraOc?.oc ?? orden.oc,
        proveedor: orden.proveedor,
        zona: ajeno.zona,
        contenido: ajeno.presentacion,
        incidencia: "",
      }),
    });
    mostrarIncidencia(inc, () => {
      setExcepcion(null);
      setPaso("producto");
    });
  }

  // ── R3 · código no reconocido ─────────────────────────────────
  function confirmarCodigo(i: number) {
    const p = productos[i];
    const inc = crearIncidencia({
      ...contexto(),
      producto: p.nombre,
      codigo: p.codigo,
      tipo: "codigo_desconocido",
      semaforo: "amarillo",
      decisor: "maestros",
      estado: "registrada",
      titulo: "Código no reconocido",
      detalle: `El código ${CODIGO_DESCONOCIDO} se confirmó como ${p.codigo}. Maestros lo vincula al producto.`,
      paso: "Escanear producto",
      foto: false,
    });
    toast(`${inc.id} · Código enviado a Maestros`, { description: `Sigues contando ${p.nombre}.` });
    irAProducto(i, true);
  }

  // ── Reportar problema ─────────────────────────────────────────
  function reportar(causa: CausaReporte) {
    setReportando(false);
    if (causa === "codigo_desconocido") return setExcepcion({ tipo: "codigo" });
    if (causa === "no_en_oc") return setExcepcion({ tipo: "no_en_oc", ajeno: productoAjeno(orden) });
    if (causa === "otra_presentacion") return setExcepcion({ tipo: "presentacion" });
    if (causa === "dano") return setDanado(true);
    if (causa === "excedente") {
      toast("Cuenta todo lo que llegó", { description: "Si pasa del saldo de la OC, el sistema separa el excedente solo." });
      return;
    }
    setExcepcion({ tipo: "otro", causa });
  }

  function registrarOtro(comentario: string, foto: boolean) {
    const inc = crearIncidencia({
      ...contexto(),
      tipo: "otro",
      semaforo: "rojo",
      decisor: "supervisor",
      titulo: "Problema reportado",
      detalle: comentario,
      comentario,
      paso,
      foto,
    });
    mostrarIncidencia(inc, () => setExcepcion(null));
  }

  function cerrarRecepcion() {
    const todas = incidenciasStore.get();
    const decisionDe = (id: string) => decisionDano(todas.find((i) => i.id === id));
    const bultos = generarBultos(orden, conteos, decisionDe, resumenOrden(orden, estadosOC).recibido);
    agregarBultos(bultos);

    const porCodigo: Record<string, number> = {};
    let saldo = 0;
    const conSaldo: string[] = [];
    productos.forEach((p, i) => {
      if (!saldos[i]) return;
      // Lo que Calidad ya rechazó regresa en el camión: no cuenta como recibido.
      const c = conteos[i];
      const devueltas = c?.incidencia && decisionDe(c.incidencia) === "rechazada" ? c.danadas : 0;
      const recibidas = Math.min((c?.cajas ?? 0) - devueltas, saldos[i]);
      if (recibidas) porCodigo[p.codigo] = recibidas;
      const queda = saldos[i] - recibidas;
      if (queda > 0) {
        saldo += queda;
        conSaldo.push(`${p.nombre}: ${queda}`);
      }
    });
    registrarRecibido(orden.oc, porCodigo, saldo > 0);
    if (saldo > 0) {
      crearIncidencia({
        recepcion,
        oc: orden.oc,
        proveedor: orden.proveedor,
        tipo: "saldo",
        semaforo: "amarillo",
        decisor: "compras",
        titulo: `Saldo pendiente de ${cuenta(saldo, "bulto")}`,
        detalle: `${conSaldo.join(" · ")}. Mientras Compras decide, el saldo queda abierto.`,
        paso: "Cierre",
        cantidad: saldo,
        unidad: "bultos",
        foto: false,
      });
    }
    const resguardo = todas
      .filter((i) => i.recepcion === recepcion && i.destino === "resguardo" && esPendiente(i))
      .reduce((s, i) => s + (i.cantidad ?? 0), 0);
    terminarRecepcion(recepcion, { estado: "cerrada", bultos: bultos.length });
    // Lo que ya se autorizó desde resguardo durante la descarga también pasó a Acomodar.
    const autorizados = todas
      .filter((i) => i.recepcion === recepcion && i.estado === "autorizada")
      .reduce((s, i) => s + (i.bultosPendientes?.length ?? 0), 0);
    setCierre({
      bultos: bultos.length + autorizados,
      autorizados,
      cuarentena: bultos.filter((b) => b.cuarentena).length,
      resguardo,
      saldo,
    });
    avanzar("cerrado");
  }

  /**
   * Marco de Recibir: barra con "Atrás", chip de pendientes y "Cancelar" arriba;
   * "Reportar problema" bajo el botón principal.
   */
  function pantalla(
    contenido: ReactNode,
    boton: ReactNode,
    { reporte, volver, cancelable = false }: { reporte?: PasoReporte; volver?: () => void; cancelable?: boolean } = {},
  ) {
    return (
      <Marco
        boton={
          <>
            {boton}
            {reporte && (
              <button
                type="button"
                onClick={() => setReportando(true)}
                className="flex min-h-10 w-full items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground"
              >
                <ShieldAlert size={16} aria-hidden />
                Reportar problema
              </button>
            )}
          </>
        }
      >
        <BarraFlujo onVolver={volver} onCancelar={cancelable ? () => setCancelando(true) : undefined}>
          <ChipPendientes />
        </BarraFlujo>
        {contenido}
        {reporte && (
          <HojaReportar abierta={reportando} paso={reporte} onCerrar={() => setReportando(false)} onElegir={reportar} />
        )}
        {cancelable && (
          <HojaCancelar
            abierta={cancelando}
            titulo="¿Cancelar la recepción?"
            consecuencias={
              <>
                <p className="font-semibold text-critico">Se descarta lo avanzado de {orden.oc}.</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    {hechos
                      ? `${cuenta(hechos, "producto")} ya ${hechos === 1 ? "contado no pasa" : "contados no pasan"} a Acomodar.`
                      : "Aún no hay productos contados."}
                  </li>
                  <li>Las incidencias de esta recepción quedan anuladas, con el motivo.</li>
                  <li>La OC queda como estaba antes de empezar.</li>
                </ul>
              </>
            }
            motivos={MOTIVOS_CANCELAR_RECEPCION}
            textoConfirmar="Sí, cancelar la recepción"
            onConfirmar={cancelarRecepcion}
            onCerrar={() => setCancelando(false)}
          />
        )}
      </Marco>
    );
  }

  // ── Pantallas de excepción ──────────────────────────────────────
  if (aviso) {
    return (
      <PantallaIncidencia
        incidencia={incidencias.find((i) => i.id === aviso.incidencia.id) ?? aviso.incidencia}
        onSeguir={() => {
          const seguir = aviso.alSeguir;
          setAviso(null);
          seguir();
        }}
      />
    );
  }

  if (excepcion?.tipo === "otra_linea") {
    return (
      <PantallaOtraLinea
        leida={productos[excepcion.indice]}
        sugerida={prod}
        onRecibirEsta={() => irAProducto(excepcion.indice, true)}
        onAtras={() => setExcepcion(null)}
        onVolver={() => {
          setExcepcion(null);
          setVisor("producto");
        }}
      />
    );
  }
  if (excepcion?.tipo === "no_en_oc") {
    const ajeno = excepcion.ajeno;
    return (
      <PantallaNoEnOC
        orden={orden}
        ajeno={ajeno}
        lineas={pendientes}
        onAtras={() => setExcepcion(null)}
        onReescanear={() => {
          setExcepcion(null);
          setVisor("producto");
        }}
        onElegirLinea={(i) => irAProducto(i, true)}
        onRegistrarAdicional={(n, foto) => registrarAdicional(ajeno, n, foto)}
      />
    );
  }
  if (excepcion?.tipo === "codigo") {
    return (
      <PantallaCodigoDesconocido
        codigo={CODIGO_DESCONOCIDO}
        lineas={pendientes}
        onAtras={() => setExcepcion(null)}
        onReescanear={() => {
          setExcepcion(null);
          setVisor("producto");
        }}
        onConfirmar={confirmarCodigo}
        onNingunoCoincide={() =>
          setExcepcion({
            tipo: "no_en_oc",
            ajeno: { codigo: CODIGO_DESCONOCIDO, nombre: "Producto sin identificar", presentacion: "", zona: "Seco", enOtraOc: null },
          })
        }
      />
    );
  }
  if (excepcion?.tipo === "presentacion") {
    return (
      <PantallaOtraPresentacion
        prod={prod}
        esperado={esperado}
        onSolicitar={solicitarConversion}
        onRechazar={rechazarLinea}
        onCancelar={() => setExcepcion(null)}
      />
    );
  }
  if (excepcion?.tipo === "otro") {
    return <PantallaOtroProblema causa={excepcion.causa} onRegistrar={registrarOtro} onCancelar={() => setExcepcion(null)} />;
  }

  // ── Visor del escáner ───────────────────────────────────────────
  if (visor === "orden") {
    return (
      <Escaner
        codigo="Código de la orden"
        texto={TEXTO_ESCANER.orden}
        onCerrar={() => setVisor(null)}
        onLeer={() => leerOrden(OC_EN_ANDEN)}
        onLeerLargo={() => leerOrden("OC-9999")}
        pie={
          <BotonFlujo
            variante="discreto"
            onClick={() => {
              setVisor(null);
              setProveedorBuscado(undefined);
              setPaso("buscar");
            }}
          >
            Buscar sin escanear
          </BotonFlujo>
        }
      />
    );
  }
  if (visor === "producto") {
    const otra = siguientePendiente(indice);
    const simular = (texto: string, accion: () => void) => (
      <button
        type="button"
        onClick={() => {
          setVisor(null);
          accion();
        }}
        className="min-h-9 w-full text-sm font-semibold opacity-70"
      >
        {texto}
      </button>
    );
    return (
      <Escaner
        subtitulo={`Sugerido: ${prod.nombre}`}
        codigo={prod.codigo}
        texto={TEXTO_ESCANER.producto}
        onCerrar={() => setVisor(null)}
        onLeer={() => {
          setVisor(null);
          avanzar("contar");
        }}
        pie={
          <div className="pt-1">
            <p className="text-center text-xs opacity-50">Simular otra lectura</p>
            {otra !== undefined && simular(`Otro producto de la OC (${productos[otra].nombre})`, () => setExcepcion({ tipo: "otra_linea", indice: otra }))}
            {simular("Un producto que no está en la OC", () => setExcepcion({ tipo: "no_en_oc", ajeno: productoAjeno(orden) }))}
            {simular("Un código que no existe en el catálogo", () => setExcepcion({ tipo: "codigo" }))}
          </div>
        }
      />
    );
  }
  if (visor === "caja") {
    return (
      <Escaner
        subtitulo={prod.nombre}
        codigo={textoGS1({ gtin: gtinDe(prod.codigo), lote: prod.lote, caducidad: prod.sinCaducidad ? "" : prod.caducidad, oc: orden.oc })}
        texto={`Apunta al código ${articulo(prod, "de la", "del")} ${prod.unidadManejo}`}
        onCerrar={() => setVisor(null)}
        onLeer={() => {
          setVisor(null);
          pitido();
          setLoteLeido(true);
        }}
        pie={
          <button
            type="button"
            onClick={() => {
              setVisor(null);
              setLoteManual({ lote: "", fecha: prod.sinCaducidad ? "sin" : "" });
            }}
            className="min-h-11 w-full text-sm font-semibold opacity-80"
          >
            El código no lee
          </button>
        }
      />
    );
  }
  if (visor === "etiqueta") {
    return (
      <Escaner
        subtitulo={prod.nombre}
        codigo="(00) SSCC"
        texto={TEXTO_ESCANER.etiqueta}
        onCerrar={() => setVisor(null)}
        onLeer={() => {
          setVisor(null);
          setLineas((l) => ({ ...l, [indice]: "recibida" }));
          avanzar("listo");
        }}
      />
    );
  }

  if (ocNoAbierta) {
    return (
      <Marco
        boton={
          <>
            <BotonFlujo
              onClick={() => {
                setOcNoAbierta(null);
                setVisor("orden");
              }}
            >
              Reintentar
            </BotonFlujo>
            <BotonFlujo
              variante="discreto"
              onClick={() => {
                setOcNoAbierta(null);
                setProveedorBuscado(undefined);
                setPaso("buscar");
              }}
            >
              Buscar sin escanear
            </BotonFlujo>
          </>
        }
      >
        <div className="pt-10 text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-alerta/15 text-alerta">
            <X size={40} aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-2xl font-extrabold">Esta orden no está abierta</h1>
          <p className="mt-1 font-mono text-muted-foreground">Se leyó {ocNoAbierta.codigo}</p>
          <p className="mt-3 text-sm text-muted-foreground">{ocNoAbierta.motivo}</p>
        </div>
      </Marco>
    );
  }

  // ── Inicio: lo que está en el andén y lo que sigue ─────────────
  if (paso === "inicio") {
    const despues = citas.filter((c) => !c.enAnden);
    const estadoAnden = resumenOrden(enAnden, estadosOC);
    const cerradaAnden = estadoAnden.estado === "completa" || estadoAnden.estado === "cerrada_corta";
    return pantalla(
      <>
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"><FechaHoy /></p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Buenos días, <PrimerNombre /></h1>
        <SelectorTarea actual="/pda/recibir" />
        <button
          type="button"
          onClick={() => (cerradaAnden ? leerOrden(enAnden.oc) : elegirDeAgenda(enAnden.proveedor, enAnden.oc))}
          className="mt-6 block w-full rounded-[18px] border-2 border-primary/40 bg-primary-soft p-4 text-left"
        >
          <div className="flex items-center justify-between text-sm font-semibold text-primary">
            <span>● En andén ahora</span>
            <span className="font-mono">{enAnden.llegada.hora}</span>
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold">{enAnden.proveedor}</p>
          <p className="font-mono text-sm text-muted-foreground">
            {enAnden.oc} · cita {enAnden.cita}
          </p>
          <div className="mt-3">
            <Cifras
              items={
                estadoAnden.estado === "nueva"
                  ? [
                      [String(enAnden.productosTotal), "productos"],
                      [String(enAnden.cajasTotal), "cajas"],
                      [enAnden.kgTotal.toLocaleString("en-US"), "kg"],
                    ]
                  : [
                      [String(estadoAnden.pedido), "pedido"],
                      [String(estadoAnden.recibido), "recibido"],
                      [String(estadoAnden.saldo), "saldo"],
                    ]
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {enAnden.transporte !== "seco" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-alerta/15 px-3 py-1 text-sm font-semibold text-alerta capitalize">
                <Snowflake size={16} aria-hidden /> {enAnden.transporte}
              </span>
            )}
            <EtiquetaEstadoOC estado={estadoAnden.estado} decision={estadoAnden.decisionSaldo} />
          </div>
        </button>
        {cerradaAnden && (
          <button
            type="button"
            onClick={() => reiniciarOrden(enAnden.oc)}
            className="mt-2 min-h-11 w-full text-sm font-semibold text-primary"
          >
            Repetir la demo con {enAnden.oc}
          </button>
        )}
        {despues.length > 0 && <p className="mt-6 text-sm font-semibold text-muted-foreground">Después de esta</p>}
        <div className="mt-2 space-y-2">
          {despues.map((c) => {
            const r = resumenOrden(c, estadosOC);
            return (
              <button
                key={c.oc}
                type="button"
                onClick={() => elegirDeAgenda(c.proveedor, c.oc)}
                className="block w-full rounded-[18px] border border-border bg-card p-4 py-3 text-left"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{c.proveedor}</span>
                  <EtiquetaEstadoOC estado={r.estado} decision={r.decisionSaldo} />
                </span>
                <span className="block font-mono text-sm text-muted-foreground">
                  {c.cita} · {c.productosTotal} productos ·{" "}
                  {r.estado === "parcial" ? `saldo ${r.saldo} de ${r.pedido} cajas` : `${c.cajasTotal} cajas`}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            setProveedorBuscado(undefined);
            setPaso("buscar");
          }}
          className="mt-4 flex min-h-11 w-full items-center justify-center text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          Buscar una recepción
        </button>
      </>,
      <BotonFlujo
        onClick={() => {
          inicioAnden.current = Date.now();
          setVisor("orden");
        }}
      >
        Recibir
      </BotonFlujo>,
    );
  }

  if (paso === "buscar") {
    return (
      <BuscarRecepcion
        key={proveedorBuscado ?? "buscar"}
        proveedorInicial={proveedorBuscado}
        onSalir={() => setPaso("inicio")}
        onRecibir={(d, codigo) => empezar(codigo, false, d)}
      />
    );
  }

  // ── Cabecera: datos del camión y temperatura antes de abrir ─────
  if (paso === "cabecera") {
    const marcadas = CONDICIONES_FRIO.filter((_, i) => condiciones[i]);
    const enRango = rango !== null && grados !== "" && Number(grados) >= rango.min && Number(grados) <= rango.max;
    const r = resumenOrden(orden, estadosOC);
    const aTraer = productos.filter((_, i) => saldos[i] > 0);
    const primera = saldos.findIndex((s) => s > 0);
    return pantalla(
      <>
        <h1 className="font-display text-2xl font-extrabold">{orden.proveedor}</h1>
        <p className="font-mono text-sm text-muted-foreground">
          {orden.oc}
          {orden.cita ? ` · cita ${orden.cita}` : ""} · llegó {orden.llegada.hora}
        </p>
        {sinEscanear && <p className="mt-1 text-sm text-muted-foreground">Elegido de la agenda, sin escanear</p>}
        {desviacion && desviacion !== "con_cita" && (
          <span className="mt-2 inline-block rounded-full bg-alerta/15 px-3 py-1 text-sm font-semibold text-alerta">
            Desviación: {desviacion === "sin_cita" ? "sin cita" : desviacion} · registrada
          </span>
        )}
        {r.estado === "parcial" ? (
          <>
            <div className="mt-4">
              <Cifras
                items={[
                  [String(r.pedido), "pedido"],
                  [String(r.recibido), "recibido antes"],
                  [String(r.saldo), "saldo"],
                ]}
              />
            </div>
            <div className="mt-3 rounded-[18px] border border-primary/40 bg-primary-soft p-4 text-sm">
              <p className="font-semibold">OC parcialmente recibida</p>
              <p className="mt-1">
                Solo se recibe el saldo: {cuenta(aTraer.length, "producto")}. Las líneas completas no se vuelven a contar.
              </p>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <Cifras
              items={[
                [String(aTraer.length), "productos"],
                [String(r.saldo), new Set(productos.map((p) => p.unidadManejo)).size === 1 ? productos[0].unidadManejoPlural : "bultos"],
                [Math.round(productos.reduce((s, p, i) => s + kilos(p, saldos[i] ?? 0), 0)).toLocaleString("en-US"), "kg"],
              ]}
            />
          </div>
        )}

        {rango && (
          <div className="mt-4 rounded-[18px] border border-alerta/40 bg-alerta/10 p-4">
            <p className="inline-flex items-center gap-1.5 font-display font-extrabold text-alerta capitalize">
              <Snowflake size={18} aria-hidden /> Transporte {orden.transporte}
            </p>
            <p className="mt-1 text-sm">Mide antes de descargar. Después de abrir la puerta ya no mide nada.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label
                className={cn(
                  "flex min-h-14 items-center gap-1 rounded-2xl border bg-card px-3",
                  modoTemperatura === "medir" ? "border-primary" : "border-border",
                )}
              >
                <span className="text-sm font-semibold">Medí</span>
                <input
                  inputMode="decimal"
                  value={grados}
                  onFocus={() => setModoTemperatura("medir")}
                  onChange={(e) => {
                    setModoTemperatura("medir");
                    setGrados(e.target.value.replace(/[^\d.-]/g, ""));
                  }}
                  className="w-full min-w-0 bg-transparent text-center font-mono text-lg outline-none"
                  placeholder="___"
                  aria-label="Temperatura medida en grados"
                />
                <span className="text-sm">°C</span>
              </label>
              <button
                type="button"
                onClick={() => setModoTemperatura("sin")}
                className={cn(
                  "min-h-14 rounded-2xl border bg-card px-3 text-sm font-semibold",
                  modoTemperatura === "sin" ? "border-primary" : "border-border",
                )}
              >
                Sin termómetro
              </button>
            </div>
            {modoTemperatura === "medir" && grados !== "" && (
              <p className={cn("mt-3 text-sm font-semibold", enRango ? "text-exito" : "text-critico")}>
                {enRango ? "Dentro" : "Fuera"} de rango {rango.min}–{rango.max} °C · queda como medición
              </p>
            )}
            {modoTemperatura === "sin" && (
              <>
                <p className="mt-3 text-sm font-semibold text-alerta">
                  {marcadas.length ? marcadas.join(" · ") : "Sin condiciones marcadas"} · queda como condición declarada
                </p>
                <div className="mt-2 space-y-1">
                  {CONDICIONES_FRIO.map((c, i) => (
                    <label key={c} className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={condiciones[i]}
                        onChange={(e) => setCondiciones((antes) => antes.map((v, j) => (j === i ? e.target.checked : v)))}
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <Tarjeta className="mt-4 py-2">
          <Fila k="Transportista" v={`${orden.llegada.transportista} · ${orden.llegada.placa}`} />
          <Fila k="Andén" v={orden.llegada.anden} />
          <Fila k="Recibe" v={RECIBE} />
        </Tarjeta>
      </>,
      <BotonFlujo onClick={() => irAProducto(primera)}>Comenzar descarga</BotonFlujo>,
      { reporte: "cabecera", volver: () => setPaso("inicio"), cancelable: true },
    );
  }

  // ── Producto: qué viene y cómo se cuenta ────────────────────────
  if (paso === "producto") {
    const previo = prod.cajas - esperado;
    return pantalla(
      <>
        <Progreso total={aRecibir} indice={hechos} pendientes />
        <div className="mt-5 flex items-center gap-4">
          <ImagenProducto codigo={prod.codigo} nombre={prod.nombre} tamano="lg" />
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Sugerido</p>
            <p className="font-display text-xl font-extrabold">{prod.nombre}</p>
            <p className="font-mono text-sm text-muted-foreground">
              {prod.codigo} · {prod.presentacion}
            </p>
          </div>
        </div>
        <Tarjeta className="mt-4 py-2">
          {previo > 0 && <Fila k="Pedido · recibido antes" v={`${prod.cajas} · ${previo}`} />}
          <Fila k={previo > 0 ? "Vienen (saldo)" : "Vienen"} v={enManejo(prod, esperado)} />
          {prod.unidadesPorCaja === 1 ? (
            <>
              <Fila k={`Cada ${prod.unidadManejo}`} v={prod.presentacion} />
              <Fila k="En total" v={`${kilos(prod, esperado)} kg`} />
            </>
          ) : (
            <>
              <Fila k={`Cada ${prod.unidadManejo} trae`} v={enInterna(prod, prod.unidadesPorCaja)} />
              <Fila k={`Cada ${prod.unidadInterna}`} v={prod.presentacion} />
              <Fila k="En total" v={`${enInterna(prod, esperado * prod.unidadesPorCaja)} · ${kilos(prod, esperado)} kg`} />
            </>
          )}
        </Tarjeta>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-sm">Se cuenta en {prod.unidadManejo.toUpperCase()}</span>
          <span className="rounded-full bg-muted px-3 py-1 text-sm">Se inventaría en KG</span>
        </div>
        <button
          type="button"
          onClick={() => setExcepcion({ tipo: "presentacion" })}
          className="mt-4 min-h-11 text-sm font-semibold text-primary underline underline-offset-4"
        >
          ¿Viene en otra presentación?
        </button>
        <p className="text-sm text-muted-foreground">
          Puedes escanear los productos en cualquier orden: si lees otro de la OC, la app te lleva a él.
        </p>
        <button
          type="button"
          onClick={() => setVerLineas((v) => !v)}
          className="mt-3 flex min-h-12 w-full items-center justify-between rounded-[18px] border border-border bg-card px-4 text-left"
        >
          <span className="font-semibold">Ver los {productos.length} productos</span>
          <span className="text-sm font-semibold text-primary">{verLineas ? "Ocultar" : "Ver ›"}</span>
        </button>
        {verLineas && (
          <Tarjeta className="mt-2 space-y-2 py-3">
            {productos.map((p, i) => {
              const estado = saldos[i] === 0 ? "previa" : (lineas[i] ?? "pendiente");
              return (
                <button
                  key={p.codigo}
                  type="button"
                  disabled={estado !== "pendiente"}
                  onClick={() => irAProducto(i)}
                  className="flex w-full items-center justify-between gap-2 text-left disabled:opacity-70"
                >
                  <span className={cn("flex min-w-0 items-center gap-2 text-sm", i === indice && "font-semibold")}>
                    <ImagenProducto codigo={p.codigo} nombre={p.nombre} tamano="sm" />
                    {p.nombre}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", ETIQUETA_LINEA[estado].clase)}>
                    {ETIQUETA_LINEA[estado].texto}
                  </span>
                </button>
              );
            })}
          </Tarjeta>
        )}
      </>,
      <BotonFlujo onClick={() => setVisor("producto")}>Escanear el producto</BotonFlujo>,
      { reporte: "producto", volver: () => setPaso("cabecera"), cancelable: true },
    );
  }

  // ── Contar (y recontar si la diferencia lo pide) ────────────────
  if (paso === "contar" || paso === "recontar") {
    const faltanteSiRegistra = Math.max(0, esperado - contado);
    return pantalla(
      <>
        <Progreso total={aRecibir} indice={hechos} />
        <div className="flex items-center gap-3">
          <ImagenProducto codigo={prod.codigo} nombre={prod.nombre} tamano="sm" className="mt-2" />
          <p className="mt-2 font-semibold">{prod.nombre}</p>
        </div>
        <h1 className="mt-6 font-display text-2xl font-extrabold">
          {paso === "recontar" ? "Cuenta otra vez. " : ""}¿{articulo(prod, "Cuántas", "Cuántos")} {prod.unidadManejoPlural} hay?
        </h1>
        {paso === "recontar" && <p className="mt-1 text-sm text-alerta">El primer conteo no cuadró con la orden. Vuelve a contar desde cero.</p>}
        <div className="mt-6">
          <Contador valor={contado} onCambio={setContado} etiqueta="Cantidad contada" unidad={prod.unidadManejo} />
        </div>
        {contado > 0 && (
          <>
            <p className="mt-4 text-center font-mono text-sm text-muted-foreground">
              {enManejo(prod, contado)}
              {prod.unidadesPorCaja > 1 && ` = ${enInterna(prod, contado * prod.unidadesPorCaja)}`} = {kilos(prod, contado)} kg
            </p>
            <p className="mt-8 font-semibold">¿Hay algún bulto dañado o abierto?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setDanado(v)}
                  className={cn(
                    "min-h-14 rounded-2xl border font-semibold",
                    danado === v ? "border-primary bg-primary-soft text-primary" : "border-border bg-card",
                  )}
                >
                  {v ? "Sí" : "No"}
                </button>
              ))}
            </div>
          </>
        )}
        {danado && contado > 0 && (
          <div className="mt-4 space-y-4 rounded-[18px] border border-border bg-card p-4">
            <div>
              <p className="font-semibold">
                ¿{articulo(prod, "Cuántas", "Cuántos")} {articulo(prod, "vienen dañadas", "vienen dañados")}?
              </p>
              <div className="mt-2">
                <Contador valor={danadas} onCambio={(n) => setDanadas(Math.min(n, contado))} etiqueta="Bultos dañados" unidad={prod.unidadManejo} />
              </div>
              {danadas > 0 && danadas < contado && (
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  {enManejo(prod, contado - danadas)} buenas siguen normal.
                </p>
              )}
            </div>
            <div>
              <p className="font-semibold">¿Qué tiene?</p>
              <div className="mt-2 grid gap-2">
                {TIPOS_DANO.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={tipoDano === t.id}
                    onClick={() => setTipoDano(t.id)}
                    className={cn(
                      "min-h-12 rounded-2xl border px-4 text-left text-sm font-semibold",
                      tipoDano === t.id ? "border-primary bg-primary-soft text-primary" : "border-border bg-background",
                    )}
                  >
                    {t.texto}
                  </button>
                ))}
              </div>
            </div>
            <Foto tomada={fotoDano} onTomar={() => setFotoDano(true)} />
            {tipo && (
              <div
                className={cn(
                  "rounded-2xl border p-3 text-sm",
                  tipo.destino === "disponible"
                    ? "border-exito/40 bg-exito/10"
                    : tipo.destino === "cuarentena"
                      ? "border-alerta/40 bg-alerta/10"
                      : "border-critico/40 bg-critico/10",
                )}
              >
                <p className="font-display font-extrabold">El sistema decide: {TEXTO_DESTINO_DANO[tipo.destino].titulo}</p>
                <p className="mt-1">{TEXTO_DESTINO_DANO[tipo.destino].detalle}</p>
                <p className="mt-1 text-muted-foreground">El rechazo solo lo decide Calidad, con tu foto.</p>
              </div>
            )}
          </div>
        )}
        <Hoja
          abierta={hojaDiferencia !== null}
          titulo={
            hojaDiferencia === "excedente"
              ? "Llegó más de lo pedido"
              : hojaDiferencia === "mayor"
                ? "¿Entrega parcial o presentación distinta?"
                : "¿Por qué no cuadra?"
          }
          onCerrar={() => setHojaDiferencia(null)}
        >
          <p className="text-sm text-muted-foreground">
            {hojaDiferencia === "excedente" ? "El saldo de la OC es" : "La orden dice"} {enManejo(prod, esperado)}; contaste {enManejo(prod, contado)}.
          </p>
          <div className="space-y-2">
            {hojaDiferencia === "excedente" ? (
              <>
                <BotonHoja onClick={mandarExcedenteAResguardo}>
                  Recibir {esperado} y mandar {contado - esperado} a resguardo
                </BotonHoja>
                <BotonHoja
                  onClick={() => {
                    setHojaDiferencia(null);
                    setContado(0);
                  }}
                >
                  Contar de nuevo
                </BotonHoja>
                <p className="text-sm text-muted-foreground">El excedente no entra a inventario hasta que Compras decida.</p>
              </>
            ) : hojaDiferencia === "mayor" ? (
              <>
                <BotonHoja onClick={() => registrarConteo(contado, faltanteSiRegistra)}>Entrega parcial</BotonHoja>
                <BotonHoja
                  onClick={() => {
                    setHojaDiferencia(null);
                    setExcepcion({ tipo: "presentacion" });
                  }}
                >
                  Viene en otra presentación
                </BotonHoja>
              </>
            ) : (
              CAUSAS_DIFERENCIA.map((c) => (
                <BotonHoja key={c} onClick={() => registrarConteo(contado, faltanteSiRegistra)}>
                  {c}
                </BotonHoja>
              ))
            )}
          </div>
        </Hoja>
      </>,
      <BotonFlujo disabled={contado === 0 || danado === null || !danoCompleto} onClick={confirmarConteo}>
        {contado === 0
          ? `Cuenta ${articulo(prod, "las", "los")} ${prod.unidadManejoPlural}`
          : danado === null
            ? "Responde si hay alguno dañado"
            : !danoCompleto
              ? danadas === 0
                ? "Di cuántos vienen dañados"
                : !tipo
                  ? "Elige qué tiene el daño"
                  : "Toma la foto del daño"
              : `Confirmar ${enManejo(prod, contado)}`}
      </BotonFlujo>,
      { reporte: "contar", volver: () => setPaso("producto"), cancelable: true },
    );
  }

  // ── Lote y caducidad: se leen del código GS1 de la caja ─────────
  if (paso === "lote") {
    const listo = loteLeido || (loteManual !== null && loteManual.lote.trim() !== "" && loteManual.fecha !== "");
    const dias = prod.loteEnPiso && !prod.sinCaducidad ? diasEntre(prod.loteEnPiso, caducidad) : null;
    const alFondo = dias === null || dias >= 0;
    return pantalla(
      <>
        <Progreso total={aRecibir} indice={hechos} />
        {cabeceraProducto}
        {loteLeido ? (
          <h1 className="mt-6 font-display text-2xl font-extrabold">Lote leído</h1>
        ) : (
          <>
            <h1 className="mt-6 font-display text-2xl font-extrabold">
              Escanea el código de {articulo(prod, "una", "un")} {prod.unidadManejo}
            </h1>
            <p className="mt-1 text-muted-foreground">El lote y la caducidad vienen adentro del código.</p>
          </>
        )}
        {loteManual && !loteLeido && (
          <Tarjeta className="mt-4 space-y-3">
            <label className="block text-sm font-semibold">
              Lote
              <input
                value={loteManual.lote}
                onChange={(e) => setLoteManual({ ...loteManual, lote: e.target.value.toUpperCase() })}
                className="mt-1 h-12 w-full rounded-2xl border border-input bg-background px-3 font-mono"
              />
            </label>
            {!prod.sinCaducidad && (
              <label className="block text-sm font-semibold">
                Caduca
                <input
                  type="date"
                  value={loteManual.fecha}
                  onChange={(e) => setLoteManual({ ...loteManual, fecha: e.target.value })}
                  className="mt-1 h-12 w-full rounded-2xl border border-input bg-background px-3 font-mono"
                />
              </label>
            )}
          </Tarjeta>
        )}
        {listo && (
          <>
            <Tarjeta className="mt-4 py-2">
              <Fila k="Lote" v={<span className="font-mono">{lote}</span>} />
              <Fila k="Caduca" v={prod.sinCaducidad ? "Sin caducidad" : fechaConAnio(caducidad)} />
              <Fila k="Origen" v={loteLeido ? "Leído del código" : "Tecleado a mano"} />
            </Tarjeta>
            {prod.sinCaducidad ? (
              <Tarjeta className="mt-4">
                <p className="font-display font-extrabold">Sin caducidad · va por fecha de entrada (FIFO)</p>
                <p className="mt-1 text-sm">Queda detrás de lo que ya estaba.</p>
              </Tarjeta>
            ) : (
              <div className={cn("mt-4 rounded-[18px] border p-4", alFondo ? "border-exito/40 bg-exito/10" : "border-alerta/40 bg-alerta/10")}>
                <p className={cn("inline-flex items-center gap-1.5 font-display font-extrabold", alFondo ? "text-exito" : "text-alerta")}>
                  {alFondo ? <ArrowDown size={18} aria-hidden /> : <ArrowUp size={18} aria-hidden />}
                  {alFondo ? "Va al fondo de la posición" : "Va al frente. Recorre los otros hacia atrás."}
                </p>
                <p className="mt-1 text-sm">
                  {dias === null
                    ? "No hay otro lote en piso. No mueve nada."
                    : alFondo
                      ? `Caduca ${dias} días después del lote que ya está en piso. No mueve nada.`
                      : `Caduca ${Math.abs(dias)} días antes del lote que ya está en piso.`}
                </p>
              </div>
            )}
          </>
        )}
      </>,
      listo ? (
        <BotonFlujo onClick={() => avanzar("etiquetar")}>Continuar a etiquetar</BotonFlujo>
      ) : loteManual ? (
        <BotonFlujo disabled>Continuar a etiquetar</BotonFlujo>
      ) : (
        <>
          <BotonFlujo onClick={() => setVisor("caja")}>Escanear</BotonFlujo>
          <button
            type="button"
            onClick={() => setLoteManual({ lote: "", fecha: prod.sinCaducidad ? "sin" : "" })}
            className="min-h-11 w-full text-sm font-semibold text-muted-foreground"
          >
            El código no lee
          </button>
        </>
      ),
      { reporte: "lote", volver: volverAContar, cancelable: true },
    );
  }

  // ── Etiquetar: una etiqueta SSCC por bulto ─────────────────────
  if (paso === "etiquetar") {
    const conteo = conteos[indice];
    const impresas = conteo?.cajas ?? esperado;
    const enCuarentena = conteo?.destinoDano && conteo.destinoDano !== "disponible" ? conteo.danadas : 0;
    const bultosPrevios =
      resumenOrden(orden, estadosOC).recibido + productos.slice(0, indice).reduce((s, _, i) => s + (conteos[i]?.cajas ?? 0), 0);
    const primerSSCC = generarSSCC(bultosPrevios, orden.oc);
    return pantalla(
      <>
        <Progreso total={aRecibir} indice={hechos} />
        {cabeceraProducto}
        <h1 className="mt-6 font-display text-2xl font-extrabold">Pega una etiqueta en cada {prod.unidadManejo}</h1>
        <p className="mt-1 text-muted-foreground">Se imprimieron {impresas}. Salieron de la impresora del andén.</p>
        {enCuarentena > 0 && (
          <div className="mt-4 rounded-[18px] border border-critico/40 bg-critico/10 p-4 text-sm">
            <p className="font-display font-extrabold text-critico">
              {enCuarentena} {enCuarentena === 1 ? "etiqueta es" : "etiquetas son"} de CUARENTENA
            </p>
            <p className="mt-1">Pégalas en {articulo(prod, "las", "los")} {prod.unidadManejoPlural} dañad{articulo(prod, "a", "o")}s y sepáral{articulo(prod, "a", "o")}s del resto.</p>
          </div>
        )}
        <div className="mt-5 rounded-[18px] border border-border bg-card p-4 text-card-foreground shadow-sm">
          <div className="flex justify-between text-xs font-semibold">
            <span>MOMI · Panamá</span>
            <span className="font-mono">
              {prod.unidadManejo.toUpperCase()} 1 / {impresas}
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold">{prod.nombre}</p>
          <p className="mt-1 font-mono text-xs">
            {prod.unidadesPorCaja === 1 ? "" : `${enInterna(prod, prod.unidadesPorCaja)} · `}
            {kilos(prod, 1)} kg · {lote} · {prod.sinCaducidad ? "sin caducidad (FIFO)" : `vence ${fechaNumerica(caducidad)}`}
          </p>
          <div className="mt-3 flex h-14 items-end gap-[2px]" aria-hidden>
            {Array.from({ length: 60 }).map((_, i) => (
              <span key={i} className="h-full bg-foreground" style={{ width: (i * 7) % 3 === 0 ? 3 : 1.5 }} />
            ))}
          </div>
          <p className="mt-1 text-center font-mono text-xs tracking-wide">{ssccLegible(primerSSCC)}</p>
        </div>
      </>,
      <>
        <BotonFlujo onClick={() => setVisor("etiqueta")}>Escanear una etiqueta pegada</BotonFlujo>
        <p className="text-center text-sm text-muted-foreground">
          Sin esta lectura {articulo(prod, "la", "el")} {prod.unidadManejo} no existe en el sistema.
        </p>
      </>,
      { reporte: "etiquetar", volver: () => setPaso("lote"), cancelable: true },
    );
  }

  // ── Producto listo ─────────────────────────────────────────────
  if (paso === "listo") {
    const recibidas = conteos[indice]?.cajas ?? esperado;
    const idxSiguiente = siguientePendiente(indice);
    const siguiente = idxSiguiente !== undefined ? productos[idxSiguiente] : undefined;
    return pantalla(
      <>
        <div className="pt-6 text-center">
          <Exito />
          <h1 className="mt-5 font-display text-3xl font-extrabold">
            Producto {hechos} de {aRecibir} listo
          </h1>
          <div className="mt-3 flex items-center justify-center gap-2">
            <ImagenProducto codigo={prod.codigo} nombre={prod.nombre} tamano="sm" />
            <span className="font-semibold">{prod.nombre}</span>
          </div>
          <p className="mt-1 font-mono text-muted-foreground">
            {enManejo(prod, recibidas)} · {kilos(prod, recibidas)} kg · lote {lote}
          </p>
        </div>
        {siguiente && (
          <>
            <Tarjeta className="mt-8 flex items-center gap-3">
              <ImagenProducto codigo={siguiente.codigo} nombre={siguiente.nombre} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground">SIGUE</p>
                <p className="mt-1 font-display text-lg font-extrabold">
                  {siguiente.nombre} {siguiente.presentacion}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-sm">{enManejo(siguiente, saldos[idxSiguiente!])}</span>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", siguiente.zona === "Seco" ? "bg-muted" : "bg-alerta/15 text-alerta")}>
                    {siguiente.zona}
                  </span>
                </div>
              </div>
            </Tarjeta>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              {cuenta(pendientes.length, "producto pendiente", "productos pendientes")} ·{" "}
              {cuenta(
                pendientes.reduce((s, l) => s + l.saldo, 0),
                "bulto",
              )}
            </p>
          </>
        )}
      </>,
      siguiente ? (
        <BotonFlujo onClick={() => irAProducto(idxSiguiente!)}>Recibir el siguiente</BotonFlujo>
      ) : (
        <BotonFlujo onClick={() => avanzar("resumen")}>Ver resumen</BotonFlujo>
      ),
      // Sin "Atrás": la etiqueta ya se escaneó y el bulto existe en el sistema.
      { cancelable: true },
    );
  }

  // ── Resumen antes de cerrar ─────────────────────────────────────
  const deEsta = incidencias.filter((i) => i.recepcion === recepcion);
  const abiertas = deEsta.filter(esPendiente);
  const incDe = (id?: string) => incidencias.find((i) => i.id === id);
  const retenidas = (i: number) => {
    const c = conteos[i];
    if (!c?.danadas || c.destinoDano === "disponible") return 0;
    const d = decisionDano(incDe(c.incidencia));
    return d === "liberada" || d === "rechazada" ? 0 : c.danadas;
  };
  const rechazadasCalidad = (i: number) => (decisionDano(incDe(conteos[i]?.incidencia)) === "rechazada" ? (conteos[i]?.danadas ?? 0) : 0);
  const cajasRecibidas = conteos.reduce((s, c) => s + (c?.cajas ?? 0), 0);
  const enCuarentena = productos.reduce((s, _, i) => s + retenidas(i), 0);
  const devueltas = productos.reduce((s, _, i) => s + rechazadasCalidad(i), 0);
  const disponibles = cajasRecibidas - enCuarentena - devueltas;
  const enResguardo = deEsta.filter((i) => i.destino === "resguardo" && esPendiente(i)).reduce((s, i) => s + (i.cantidad ?? 0), 0);
  const saldoPendiente = productos.reduce((s, _, i) => s + Math.max(0, (saldos[i] ?? 0) - (conteos[i]?.cajas ?? 0)), 0);
  const minutosEnAnden = Math.min(60, Math.max(20, 27 + Math.round((Date.now() - (inicioAnden.current || Date.now())) / 6e4)));
  const enRango = rango !== null && grados !== "" && Number(grados) >= rango.min && Number(grados) <= rango.max;
  const textoTemperatura =
    modoTemperatura === "medir" && grados
      ? `${grados} °C · ${enRango ? "en rango" : "fuera de rango"}`
      : modoTemperatura === "sin"
        ? "Condición declarada"
        : rango
          ? "Sin registrar"
          : "No aplica · transporte seco";

  if (paso === "resumen") {
    const kgRecibidos = Math.round(productos.reduce((s, p, i) => s + kilos(p, conteos[i]?.cajas ?? 0), 0));
    return pantalla(
      <>
        <p className="font-mono text-sm text-muted-foreground">
          {orden.proveedor} · {orden.oc}
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">{saldoPendiente || abiertas.length ? "Descarga terminada" : "Todo recibido"}</h1>
        <div className="mt-4">
          <Cifras
            items={[
              [String(Object.values(lineas).filter((l) => l === "recibida").length), "productos"],
              [String(cajasRecibidas), "bultos"],
              [kgRecibidos.toLocaleString("en-US"), "kg"],
            ]}
          />
        </div>
        <Tarjeta className="mt-4 py-2">
          <Fila k="Recibido disponible" v={cuenta(disponibles, "bulto")} tono="exito" />
          <Fila k="En cuarentena" v={enCuarentena ? cuenta(enCuarentena, "bulto") : "Ninguno"} />
          {devueltas > 0 && <Fila k="Rechazado por Calidad" v={cuenta(devueltas, "bulto")} />}
          <Fila k="En resguardo" v={enResguardo ? cuenta(enResguardo, "bulto") : "Ninguno"} />
          <Fila k="Saldo pendiente de la OC" v={saldoPendiente ? cuenta(saldoPendiente, "bulto") : "Ninguno"} tono={saldoPendiente ? undefined : "exito"} />
          <Fila k="Incidencias abiertas" v={abiertas.length ? String(abiertas.length) : "Ninguna"} tono={abiertas.length ? undefined : "exito"} />
          <Fila k="Temperatura" v={textoTemperatura} />
          <Fila k="Tiempo en andén" v={`${minutosEnAnden} min`} />
        </Tarjeta>
        {abiertas.length > 0 && (
          <div className="mt-3 rounded-[18px] border border-alerta/40 bg-alerta/10 p-4 text-sm">
            <p className="font-semibold text-alerta">
              {abiertas.length} {abiertas.length === 1 ? "decisión pendiente no detiene" : "decisiones pendientes no detienen"} el cierre
            </p>
            <p className="mt-1">Lo que está en resguardo o cuarentena no queda disponible hasta que se decida.</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setVerDetalle((v) => !v)}
          className="mt-3 flex min-h-14 w-full items-center justify-between rounded-[18px] border border-border bg-card px-4 text-left"
        >
          <span className="font-semibold">Productos de la OC</span>
          <span className="text-sm font-semibold text-primary">{verDetalle ? "Ocultar" : "Ver ›"}</span>
        </button>
        {verDetalle && (
          <Tarjeta className="mt-2 py-2">
            {productos.map((p, i) => {
              const estado = saldos[i] === 0 ? "previa" : (lineas[i] ?? "pendiente");
              return (
                <Fila
                  key={p.codigo}
                  k={
                    <span className="flex items-center gap-2">
                      <ImagenProducto codigo={p.codigo} nombre={p.nombre} tamano="sm" />
                      {p.nombre}
                    </span>
                  }
                  v={
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs", ETIQUETA_LINEA[estado].clase)}>
                      {estado === "recibida" ? enManejo(p, conteos[i]?.cajas ?? 0) : ETIQUETA_LINEA[estado].texto}
                    </span>
                  }
                />
              );
            })}
          </Tarjeta>
        )}
        <div className="mt-3 rounded-[18px] border border-primary/40 bg-primary-soft p-4 text-sm">
          <span className="font-semibold">Al cerrar</span> — {cuenta(disponibles + enCuarentena, "bulto")} pasan a Acomodar
          {enCuarentena ? ` (${enCuarentena} a cuarentena)` : ""} y NetSuite recibe la entrada.
          {saldoPendiente > 0 && ` La OC queda parcial y Compras decide qué hacer con el saldo.`}
        </div>
      </>,
      <BotonFlujo onClick={cerrarRecepcion}>Cerrar recepción</BotonFlujo>,
      { reporte: "resumen", volver: () => setPaso("listo"), cancelable: true },
    );
  }

  // ── Recepción cerrada ──────────────────────────────────────────
  const c = cierre ?? { bultos: 0, autorizados: 0, cuarentena: 0, resguardo: 0, saldo: 0 };
  return pantalla(
    <>
      <div className="pt-6 text-center">
        <Exito />
        <h1 className="mt-5 font-display text-3xl font-extrabold">Recepción cerrada</h1>
        <p className="mt-1 font-mono text-muted-foreground">
          {sumarMinutos(orden.llegada.hora, minutosEnAnden)} · {minutosEnAnden} minutos en andén
        </p>
      </div>
      <Tarjeta className="mt-8 py-2">
        <Fila k="Pasaron a Acomodar" v={`${c.bultos} bultos${c.cuarentena ? ` (${c.cuarentena} a cuarentena)` : ""}`} />
        {c.autorizados > 0 && <Fila k="De ellos, autorizados desde resguardo" v={String(c.autorizados)} />}
        <Fila k="En resguardo" v={c.resguardo ? cuenta(c.resguardo, "bulto") : "Ninguno"} />
        <Fila
          k="OC"
          v={c.saldo ? `Parcial · saldo ${c.saldo} · decide Compras` : "Completa"}
          tono={c.saldo ? undefined : "exito"}
        />
        <Fila k="NetSuite" v="Entrada registrada" tono="exito" />
      </Tarjeta>
      <div className="mt-4 text-center">
        <span className="rounded-full bg-exito/15 px-4 py-1.5 text-sm font-semibold text-exito">Andén {orden.llegada.anden} libre</span>
      </div>
    </>,
    <>
      <BotonFlujo
        onClick={() => {
          setConteos([]);
          setLineas({});
          setModoTemperatura(null);
          setGrados("");
          setPaso("inicio");
        }}
      >
        Volver al inicio
      </BotonFlujo>
      <Link to="/pda/acomodar" className="flex min-h-11 items-center justify-center text-sm font-semibold text-primary">
        Ir a Acomodar
      </Link>
    </>,
  );
}

function EtiquetaEstadoOC({ estado, decision }: { estado: string; decision?: string }) {
  if (estado === "nueva") return null;
  const texto =
    estado === "parcial"
      ? decision === "abierto"
        ? "Parcial · saldo abierto"
        : decision === "pendiente"
          ? "Parcial · Compras decide"
          : "Parcial"
      : estado === "completa"
        ? "Recibida completa"
        : "Cerrada corta";
  const clase =
    estado === "parcial" ? "bg-primary-soft text-primary" : estado === "completa" ? "bg-exito/15 text-exito" : "bg-critico/15 text-critico";
  return <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", clase)}>{texto}</span>;
}
