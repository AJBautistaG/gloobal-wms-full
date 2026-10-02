import { FechaHoy } from "@/lib/fecha";
import { useEffect, useState, type ReactNode } from "react";
import { Lock, Minus, Plus, ShieldAlert, Truck } from "lucide-react";
import {
  BarraFlujo,
  BotonFlujo,
  BotonHoja,
  Escaner,
  Exito,
  Fila,
  Hoja,
  Marco,
  SelectorTarea,
  Tarjeta,
} from "@/components/flujo/Flujo";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { crearIncidencia, incidenciasStore, type Incidencia } from "@/data/incidencias";
import { crearTareaConteo } from "@/data/posiciones";
import {
  CAPACIDAD_CONTENEDOR,
  ELEVADOR,
  HORA_DEMO,
  JEFE_ALMACEN,
  SURTIDOR,
  pedidosAreaStore,
  trabajosDelDia,
  actualizarTrabajo,
  cantidadCon,
  colaDelDia,
  detalleTrabajo,
  enBultos,
  equivalente,
  estadoDe,
  insumoDe,
  loteSiguiente,
  minutosDelDia,
  minutosRestantes,
  otraExistencia,
  surtidoStore,
  viajesSinAgrupar,
  type LineaSurtido,
  type Resultado,
  type Trabajo,
} from "@/data/surtido";
import { SUPERVISOR } from "@/data/incidencias";
import { useVigilanciaTransito } from "@/data/vigilancia";
import { pitido } from "@/lib/feedback";
import { cn, cuenta, horaActual } from "@/lib/utils";
import { ChipPendientes, PantallaIncidencia } from "../recibir/Incidencias";

const MOTIVOS_OTRO_LOTE = [
  "El lote FEFO está dañado",
  "El lote FEFO no es accesible en la posición",
  "No encuentro el lote FEFO en la posición",
  "El lote FEFO está retenido por Calidad",
];

type Paso = "inicio" | "pos" | "cant" | "lote" | "cont" | "excepcion" | "salidas" | "cerrar" | "salida" | "fin" | "esperando";
type Visor = "pos" | "lote" | "cont" | null;
type Problema = "Dañado" | "Vencido" | "No alcanzo" | null;

/** Hora del reloj de la demo + minutos: "09:38" + 30 → 610. */
const reloj = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Surtido dirigido: el sistema arma la cola por hora de salida y el recorrido de cada pedido;
 * el surtidor confirma posición, cantidad, lote FEFO y contenedor. Las excepciones generan
 * incidencias y nunca detienen el trabajo.
 */
export default function Surtir() {
  const estados = surtidoStore.use();
  // Los pedidos que las áreas envían desde su PDA entran a esta misma cola.
  const pedidos = pedidosAreaStore.use();
  const trabajos = trabajosDelDia(pedidos);
  const incidencias = incidenciasStore.use();
  useVigilanciaTransito();
  const [trabajoId, setTrabajoId] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>("inicio");
  const [visor, setVisor] = useState<Visor>(null);
  const [error, setError] = useState<string | null>(null);
  const [tomar, setTomar] = useState(1);
  const [contado, setContado] = useState(0);
  const [problema, setProblema] = useState<Problema>(null);
  const [posAlterna, setPosAlterna] = useState<string | null>(null);
  const [vencidoBloqueado, setVencidoBloqueado] = useState(false);
  const [hojaOtroLote, setHojaOtroLote] = useState(false);
  const [motivoLote, setMotivoLote] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ incidencia: Incidencia; alSeguir: () => void; queSigue?: string } | null>(null);
  const [mensajeContenedor, setMensajeContenedor] = useState<string | null>(null);
  const [hojaEtiqueta, setHojaEtiqueta] = useState(false);
  const [mensajeEtiqueta, setMensajeEtiqueta] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const trabajo = trabajoId ? trabajos.find((t) => t.id === trabajoId) ?? null : null;
  const estado = trabajo ? estadoDe(trabajo.id, estados) : null;

  // ── Utilidades del trabajo en curso ─────────────────────────────
  const contexto = (t: Trabajo, l: LineaSurtido, pasoTexto: string) => {
    const i = insumoDe(l.sku);
    return {
      registradaPor: SURTIDOR,
      recepcion: "surtido",
      oc: t.contenedor,
      proveedor: l.destino,
      producto: i.nombre,
      codigo: i.sku,
      paso: pasoTexto,
    };
  };

  /** Siguiente línea sin resultado ni apartada, después de `desde`. */
  function siguienteLibre(t: Trabajo, desde: number) {
    const e = estadoDe(t.id);
    for (let n = desde; n < t.lineas.length; n++) {
      const l = t.lineas[n];
      if (!e.resultados[l.id] && !e.apartadas[l.id]) return n;
    }
    return -1;
  }

  function abrirLinea(t: Trabajo, n: number) {
    const l = t.lineas[n];
    actualizarTrabajo(t.id, () => ({ estado: "surtiendo", linea: n }));
    setTomar(l.bultos);
    setError(null);
    setContado(0);
    setProblema(null);
    setPosAlterna(null);
    setVencidoBloqueado(false);
    setMotivoLote(null);
    setPaso("pos");
  }

  /** Pasa a la siguiente línea libre; si no hay, retoma las autorizadas o va a cerrar. */
  function avanzar(t: Trabajo, desde: number) {
    const n = siguienteLibre(t, desde);
    if (n >= 0) return abrirLinea(t, n);
    const e = estadoDe(t.id);
    const autorizada = t.lineas.findIndex((l) => e.apartadas[l.id]?.estado === "autorizada" && !e.resultados[l.id]);
    if (autorizada >= 0) return abrirLinea(t, autorizada);
    // Las rechazadas quedan pendientes con fecha.
    for (const l of t.lineas) {
      if (e.apartadas[l.id]?.estado === "rechazada" && !e.resultados[l.id]) {
        registrarSinTomar(t, l, { tipo: "pendiente", bultos: 0, causa: "El supervisor no autorizó otro lote" });
      }
    }
    const esperando = t.lineas.some((l) => estadoDe(t.id).apartadas[l.id]?.estado === "esperando");
    setPaso(esperando ? "esperando" : "cerrar");
  }

  function comenzar(t: Trabajo) {
    const e = estadoDe(t.id);
    setTrabajoId(t.id);
    setMensajeContenedor(null);
    setMensajeEtiqueta(null);
    if (e.estado === "en_cola") actualizarTrabajo(t.id, () => ({ estado: "surtiendo", linea: 0 }));
    avanzar(t, e.estado === "pausado" ? e.linea : 0);
  }

  function pausar() {
    if (!trabajo || !estado) return;
    actualizarTrabajo(trabajo.id, () => ({ estado: "pausado" }));
    setTrabajoId(null);
    setPaso("inicio");
  }

  function mostrar(incidencia: Incidencia, alSeguir: () => void, queSigue?: string) {
    pitido();
    setAviso({ incidencia, alSeguir, queSigue });
  }

  /** Registra el resultado de una línea que no pasa por el contenedor (pendiente, sustituto). */
  function registrarSinTomar(t: Trabajo, l: LineaSurtido, r: Resultado) {
    actualizarTrabajo(t.id, (e) => ({ resultados: { ...e.resultados, [l.id]: r } }));
  }

  /** Cierra la línea actual: suma al contenedor (se parte si se llena) y registra faltantes. */
  function registrar(r: Resultado) {
    if (!trabajo || !estado) return;
    const n = estado.linea;
    const l = trabajo.lineas[n];
    const i = insumoDe(l.sku);
    const posicion = posAlterna ?? i.posicion;
    pitido();
    let mensaje: string | null = null;
    actualizarTrabajo(trabajo.id, (e) => {
      let contenedor = e.contenedor;
      if (r.bultos > 0) {
        if (contenedor.bultos + r.bultos > CAPACIDAD_CONTENEDOR && contenedor.bultos > 0) {
          mensaje = `Contenedor ${contenedor.n} cerrado: se llenó. Sigue en el contenedor ${contenedor.n + 1}.`;
          contenedor = { n: contenedor.n + 1, bultos: r.bultos };
        } else contenedor = { ...contenedor, bultos: contenedor.bultos + r.bultos };
      }
      return {
        resultados: { ...e.resultados, [l.id]: { ...r, posicion } },
        tomados: r.bultos > 0 ? [...e.tomados, { nombre: i.nombre, posicion, bultos: enBultos(i, r.bultos) }] : e.tomados,
        contenedor,
      };
    });
    setMensajeContenedor(mensaje);
    if (r.tipo === "parcial" || r.tipo === "pendiente") {
      const faltan = l.bultos - r.bultos;
      crearIncidencia({
        ...contexto(trabajo, l, "Surtir línea"),
        tipo: "faltante_surtido",
        semaforo: "amarillo",
        decisor: "supervisor",
        estado: "registrada",
        titulo: `Faltan ${enBultos(i, faltan)} de ${i.nombre}`,
        detalle: `${l.destino} pidió ${cantidadCon(i.unidad, l.pidio)}; salen ${enBultos(i, r.bultos)}. Causa: ${r.causa}. Lo que falta queda pendiente para mañana 07:00.`,
        cantidad: faltan,
        unidad: faltan === 1 ? i.manejo.nombre : i.manejo.plural,
        foto: false,
      });
    }
    avanzar(trabajo, n + 1);
  }

  // ── Confirmación de incidencias ─────────────────────────────────
  if (aviso) {
    return (
      <PantallaIncidencia
        incidencia={incidencias.find((x) => x.id === aviso.incidencia.id) ?? aviso.incidencia}
        textoBoton="Seguir surtiendo"
        tarea="El surtido"
        queSigue={aviso.queSigue}
        onSeguir={() => {
          const seguir = aviso.alSeguir;
          setAviso(null);
          seguir();
        }}
      />
    );
  }

  const barra = (volver?: () => void, extra?: ReactNode) => (
    <BarraFlujo onVolver={volver}>
      {extra}
      <ChipPendientes />
    </BarraFlujo>
  );

  // ── El área canceló mientras se surtía ──────────────────────────
  if (trabajo && estado?.estado === "cancelado" && paso !== "inicio") {
    return (
      <Marco
        boton={
          <BotonFlujo
            onClick={() => {
              setTrabajoId(null);
              setPaso("inicio");
            }}
          >
            Ya devolví todo
          </BotonFlujo>
        }
      >
        {barra()}
        <p className="rounded-[14px] border border-critico/40 bg-critico/10 p-3 font-display text-lg font-extrabold text-critico">
          {trabajo.nombre} canceló el pedido. Devuelve lo que ya tomaste a su posición.
        </p>
        <ul className="mt-4 space-y-2">
          {estado.tomados.length ? (
            estado.tomados.map((x, n) => (
              <li key={n} className="flex justify-between gap-2 rounded-[14px] border border-border bg-card p-3 text-sm">
                <span>
                  {x.nombre} · {x.bultos}
                </span>
                <span className="font-mono">{x.posicion}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">Todavía no habías tomado nada.</li>
          )}
        </ul>
      </Marco>
    );
  }

  // ── Inicio: la cola del día ─────────────────────────────────────
  if (paso === "inicio" || !trabajo || !estado) {
    const cola = colaDelDia(estados);
    const urgente = cola.find((t) => t.urgente && estadoDe(t.id, estados).estado !== "pausado");
    const pausado = cola.find((t) => estadoDe(t.id, estados).estado === "pausado");
    const principal = pausado ?? cola.find((t) => !t.urgente) ?? urgente;
    const despachados = trabajos.filter((t) => ["transito", "confirmado", "cancelado"].includes(estadoDe(t.id, estados).estado));

    // ¿Alcanza el tiempo? Se acumula lo que falta de cada trabajo desde la hora de la demo.
    let acumulado = minutosDelDia(HORA_DEMO);
    let retraso: { t: Trabajo; texto: string } | null = null;
    cola.forEach((t, n) => {
      const e = estadoDe(t.id, estados);
      acumulado += minutosRestantes(t, e.estado === "pausado" ? e.linea : 0);
      if (!retraso && t.sale !== "ahora" && acumulado > minutosDelDia(t.sale)) {
        const antes = cola[n - 1];
        retraso = {
          t,
          texto: `${t.tipo === "ruta" ? "La " : ""}${t.nombre} sale ${t.sale} y aún faltan ${cuenta(t.lineas.length, "línea")}. Terminarías cerca de las ${reloj(acumulado)} si haces ${antes?.nombre ?? "lo anterior"} primero.`,
        };
      }
    });
    const avisoRetraso = retraso as { t: Trabajo; texto: string } | null;
    const retrasoAvisado = avisoRetraso && incidencias.some((x) => x.grupo === `retraso|${avisoRetraso.t.id}`);

    if (!principal) {
      return (
        <Marco boton={null}>
          {barra()}
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"><FechaHoy /></p>
          <h1 className="mt-0.5 font-display text-2xl font-extrabold">Buenos días, Luis</h1>
          <SelectorTarea actual="/pda/surtir" nombre={SURTIDOR.nombre} />
          <p className="mt-16 text-center font-display text-xl font-extrabold">No hay nada por surtir.</p>
          <p className="mt-1 text-center text-muted-foreground">Cuando un área envíe su pedido, aparece aquí.</p>
          <Despachados trabajos={despachados} ahora={ahora} />
        </Marco>
      );
    }

    const ePrincipal = estadoDe(principal.id, estados);
    const enA = principal.lineas.filter((l) => l.piso === "A").length;
    const sinAgrupar = viajesSinAgrupar(principal);
    return (
      <Marco
        boton={
          <BotonFlujo onClick={() => comenzar(principal)}>
            {ePrincipal.estado === "pausado" ? `Retomar ${principal.nombre} en la línea ${ePrincipal.linea + 1}` : `Comenzar con ${principal.nombre}`}
          </BotonFlujo>
        }
      >
        {barra()}
        {urgente && urgente !== principal && (
          <button
            type="button"
            onClick={() => comenzar(urgente)}
            className="mb-3 flex w-full items-center justify-between gap-2 rounded-[14px] border border-alerta/40 bg-alerta/10 px-3 py-2.5 text-left text-sm"
          >
            <span className="min-w-0">
              <span className="block font-semibold text-alerta">Entró una urgencia de {urgente.nombre}</span>
              <span className="block text-muted-foreground">
                {cuenta(urgente.lineas.length, "línea")} · sale ahora · motivo: {urgente.urgente?.toLowerCase()}
              </span>
            </span>
            <span className="shrink-0 font-semibold text-alerta">Atender ›</span>
          </button>
        )}
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"><FechaHoy /></p>
        <h1 className="mt-0.5 font-display text-2xl font-extrabold">Buenos días, Luis</h1>
        <SelectorTarea actual="/pda/surtir" nombre={SURTIDOR.nombre} />
        <div className="mt-4 rounded-[18px] border-2 border-primary/40 bg-primary-soft p-4">
          <p className="flex justify-between text-sm font-semibold text-primary">
            <span>{ePrincipal.estado === "pausado" ? "En pausa" : "Surte ahora"}</span>
            <span>sale {principal.sale}</span>
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold">{principal.corto}</p>
          <p className="mt-1 text-sm">
            {ePrincipal.estado === "pausado"
              ? `${Object.keys(ePrincipal.resultados).length} de ${principal.lineas.length} líneas · carro cargado`
              : detalleTrabajo(principal)}
          </p>
          <p className="mt-3 border-t border-primary/20 pt-2 text-sm text-muted-foreground">
            {enA ? `Un solo viaje de ${ELEVADOR}.${sinAgrupar > 1 ? ` Sin agrupar serían ${sinAgrupar}.` : ""}` : "Todo en Piso B · sin elevador."}
          </p>
        </div>
        <h2 className="mt-5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">La cola de hoy · por hora de salida</h2>
        <ul className="mt-2 divide-y divide-border rounded-[14px] border border-border bg-card">
          {cola.map((t) => {
            const e = estadoDe(t.id, estados);
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    t.urgente ? "bg-alerta" : t === principal ? "bg-primary" : "border border-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{t.corto}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.urgente
                      ? `urgente · ${cuenta(t.lineas.length, "línea")} · viaje extra de ${ELEVADOR}`
                      : `${detalleTrabajo(t)}${e.estado === "pausado" ? " · en pausa" : t === principal ? " · en curso" : ""}`}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm">{t.sale}</span>
              </li>
            );
          })}
        </ul>
        {avisoRetraso && (
          <div className="mt-3 rounded-[14px] border border-critico/40 bg-critico/10 p-3 text-sm">
            <p className="font-semibold text-critico">{avisoRetraso.texto}</p>
            {retrasoAvisado ? (
              <p className="mt-1 text-muted-foreground">Aviso enviado a {SUPERVISOR.nombre}, supervisora.</p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const t = avisoRetraso.t;
                  crearIncidencia({
                    registradaPor: SURTIDOR,
                    recepcion: "surtido",
                    oc: t.contenedor,
                    proveedor: t.nombre,
                    tipo: "retraso_surtido",
                    semaforo: "amarillo",
                    decisor: "supervisor",
                    titulo: `No alcanza la salida de ${t.nombre}`,
                    detalle: avisoRetraso.texto,
                    paso: "Cola del día",
                    foto: false,
                    grupo: `retraso|${t.id}`,
                  });
                  pitido();
                }}
                className="mt-1 min-h-9 font-semibold text-critico underline"
              >
                Avisar al supervisor
              </button>
            )}
          </div>
        )}
        <Despachados trabajos={despachados} ahora={ahora} />
      </Marco>
    );
  }

  const t = trabajo;
  const e = estado;
  const linea = t.lineas[e.linea];
  const i = insumoDe(linea.sku);
  const posicion = posAlterna ?? i.posicion;
  const apartada = e.apartadas[linea.id];
  const loteAutorizado = apartada?.estado === "autorizada" ? apartada.loteNuevo : null;
  const otro = trabajosDelDia().find((x) => x.id !== t.id)?.nombre ?? "otro pedido";
  const codigoContenedor = e.contenedor.n > 1 ? `${t.contenedor} · ${e.contenedor.n}` : t.contenedor;
  const destinoTexto = t.tipo === "ruta" ? "la Ruta Este" : t.nombre;

  // ── Visores ────────────────────────────────────────────────────
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
  if (visor === "pos") {
    return (
      <Escaner
        titulo="Surtir"
        subtitulo={`${t.nombre} · línea ${e.linea + 1} de ${t.lineas.length}`}
        codigo={posicion}
        texto={`Apunta a la posición ${posicion}`}
        onCerrar={() => setVisor(null)}
        onLeer={() => {
          setVisor(null);
          pitido();
          setError(null);
          setPaso("cant");
        }}
        pie={
          <div className="pt-1">
            <p className="text-center text-xs opacity-50">Simular otra lectura</p>
            {simular("Una posición equivocada", () => setError(`Esa no es la posición. Vas a ${posicion}.`))}
          </div>
        }
      />
    );
  }
  if (visor === "lote" && i.lote) {
    return (
      <Escaner
        titulo="Surtir"
        subtitulo={`Lote ${i.lote.codigo}`}
        codigo={i.lote.codigo}
        texto={`Apunta al lote ${i.lote.codigo}`}
        onCerrar={() => setVisor(null)}
        onLeer={() => {
          setVisor(null);
          pitido();
          setError(null);
          setVencidoBloqueado(false);
          setPaso("cont");
        }}
        pie={
          <div className="pt-1">
            <p className="text-center text-xs opacity-50">Simular otra lectura</p>
            {simular(`Un lote más nuevo (${loteSiguiente(i)})`, () => {
              setError(`Ese lote vence después. Debes tomar ${i.lote!.codigo}.`);
              setHojaOtroLote(true);
            })}
            {simular("Un lote vencido (L180924)", () => {
              setVencidoBloqueado(true);
              setError(null);
              if (!incidencias.some((x) => x.grupo === `vencido|${linea.id}`)) {
                crearIncidencia({
                  ...contexto(t, linea, "Escanear lote"),
                  tipo: "vencido",
                  semaforo: "amarillo",
                  decisor: "calidad",
                  estado: "registrada",
                  titulo: `Lote vencido en ${posicion}`,
                  detalle: `Se leyó el lote L180924 (venció el 18/9/2024). Queda bloqueado y se creó la tarea de retiro. El surtido sigue con el lote ${i.lote!.codigo}.`,
                  posicion,
                  foto: false,
                  grupo: `vencido|${linea.id}`,
                });
              }
            })}
          </div>
        }
      />
    );
  }
  if (visor === "cont") {
    return (
      <Escaner
        titulo="Surtir"
        subtitulo="Contenedor"
        codigo={codigoContenedor}
        texto={`Apunta al contenedor ${codigoContenedor}`}
        onCerrar={() => setVisor(null)}
        onLeer={() => {
          setVisor(null);
          registrar({
            tipo: tomar < linea.bultos ? "parcial" : "completa",
            bultos: tomar,
            lote: loteAutorizado ?? i.lote?.codigo,
            ...(tomar < linea.bultos ? { causa: "Tomó menos" } : {}),
          });
        }}
        pie={
          <div className="pt-1">
            <p className="text-center text-xs opacity-50">Simular otra lectura</p>
            {simular(`El contenedor de ${otro}`, () => setError(`Ese contenedor es de ${otro}. No deposites ahí.`))}
          </div>
        }
      />
    );
  }

  // ── Encabezado común de cada línea ─────────────────────────────
  const enPisoA = t.lineas.filter((l) => l.piso === "A").length;
  const encabezado = (
    <>
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        <span>
          {t.nombre} · línea {e.linea + 1} de {t.lineas.length}
        </span>
        <span>sale {t.sale}</span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-border">
        <div className="h-1 rounded-full bg-primary" style={{ width: `${((Object.keys(e.resultados).length + 1) / t.lineas.length) * 100}%` }} />
      </div>
      <p
        className={cn(
          "mt-2 inline-block rounded-md px-2 py-1 text-xs font-semibold",
          linea.piso === "A" ? "bg-alerta/10 text-alerta" : linea.piso === "camara" ? "bg-frio/10 text-frio" : "bg-muted",
        )}
      >
        {linea.piso === "A"
          ? `Viaje 1 de 1 a Piso A · ${cuenta(enPisoA, "línea")} en este viaje`
          : linea.piso === "camara"
            ? "Piso B · cámara · al final para no romper frío"
            : "Piso B · sin elevador"}
      </p>
      {mensajeContenedor && (
        <p role="status" className="mt-2 rounded-[14px] border border-frio/30 bg-frio/10 p-2 text-sm font-medium text-frio">
          {mensajeContenedor}
        </p>
      )}
      {loteAutorizado && (
        <p className="mt-2 rounded-[14px] border border-primary/40 bg-primary-soft p-2 text-sm font-medium">
          El supervisor autorizó tomar el lote {loteAutorizado}. Termina esta línea.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-[14px] border border-critico/40 bg-critico/10 p-3 text-sm font-semibold text-critico">
          {error}
        </p>
      )}
    </>
  );
  const producto = (
    <Tarjeta className="mt-4 flex items-center gap-3">
      <ImagenProducto codigo={i.sku} nombre={i.nombre} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">
          {i.nombre} <span className="font-mono text-xs text-muted-foreground">{i.sku}</span>
        </p>
        <p className="text-muted-foreground">
          {linea.destino} pidió {cantidadCon(i.unidad, linea.pidio)} · Tomas {enBultos(i, linea.bultos)} de {i.manejo.etiqueta.replace(/^\S+ de /, "")}
        </p>
      </div>
    </Tarjeta>
  );

  if (paso === "pos") {
    return (
      <Marco
        boton={
          <>
            <BotonFlujo onClick={() => setVisor("pos")}>Escanear la posición</BotonFlujo>
            <BotonFlujo
              variante="discreto"
              onClick={() => {
                setContado(0);
                setProblema(null);
                setPaso("excepcion");
              }}
            >
              No puedo surtir esta línea
            </BotonFlujo>
          </>
        }
      >
        {barra(pausar)}
        {encabezado}
        <p className="mt-6 text-sm text-muted-foreground">{posAlterna ? "Ve a la otra existencia" : "Ve a la posición"}</p>
        <p className="font-mono text-4xl font-extrabold tracking-tight text-primary">{posicion}</p>
        {producto}
        <button type="button" onClick={pausar} className="mt-6 min-h-10 text-sm text-muted-foreground underline">
          Pausar este pedido
        </button>
      </Marco>
    );
  }

  if (paso === "cant") {
    const eq = equivalente(i, tomar);
    return (
      <Marco
        boton={
          <BotonFlujo
            onClick={() => {
              pitido();
              setPaso(i.lote && !loteAutorizado ? "lote" : "cont");
            }}
          >
            Confirmar {enBultos(i, tomar)}
          </BotonFlujo>
        }
      >
        {barra(() => setPaso("pos"))}
        {encabezado}
        {producto}
        <h1 className="mt-5 font-display text-2xl font-extrabold">¿Cuántos {i.manejo.plural} tomas?</h1>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            aria-label="Menos"
            disabled={tomar <= 1}
            onClick={() => setTomar(tomar - 1)}
            className="grid size-16 place-items-center rounded-2xl border border-border disabled:opacity-30"
          >
            <Minus size={28} aria-hidden />
          </button>
          <p className="text-center font-mono text-6xl font-semibold tabular-nums">{tomar}</p>
          <button
            type="button"
            aria-label="Más"
            disabled={tomar >= linea.bultos}
            onClick={() => setTomar(tomar + 1)}
            className="grid size-16 place-items-center rounded-2xl border border-border disabled:opacity-30"
          >
            <Plus size={28} aria-hidden />
          </button>
        </div>
        <p className="mt-4 rounded-[14px] bg-muted p-3 text-center font-semibold">
          {enBultos(i, tomar)} de {i.manejo.etiqueta.replace(/^\S+ de /, "")} = {cantidadCon(i.unidad, eq)} · {linea.destino} pidió{" "}
          {cantidadCon(i.unidad, linea.pidio)}
        </p>
        {eq > linea.pidio && (
          <p className="mt-3 rounded-[14px] border border-alerta/40 bg-alerta/10 p-3 text-sm">
            Se surten {cantidadCon(i.unidad, eq)} porque {i.manejo.nombre === "caja" ? "la caja" : `el ${i.manejo.nombre}`} no se abre. La
            diferencia queda registrada, no se esconde.
          </p>
        )}
        {tomar < linea.bultos && (
          <p className="mt-3 rounded-[14px] border border-alerta/40 bg-alerta/10 p-3 text-sm">
            Tomas menos de lo pedido. Lo que falta queda pendiente con fecha.
          </p>
        )}
      </Marco>
    );
  }

  if (paso === "lote" && i.lote) {
    return (
      <Marco
        boton={
          vencidoBloqueado ? (
            <BotonFlujo
              variante="discreto"
              onClick={() => {
                setVencidoBloqueado(false);
                setVisor("lote");
              }}
            >
              Dejar ese lote y escanear {i.lote.codigo}
            </BotonFlujo>
          ) : (
            <BotonFlujo onClick={() => setVisor("lote")}>Escanear el lote</BotonFlujo>
          )
        }
      >
        {barra(() => setPaso("cant"))}
        {encabezado}
        <h1 className="mt-5 font-display text-3xl font-extrabold">Toma el lote {i.lote.codigo}</h1>
        <p className="mt-1 font-semibold">Vence {i.lote.vence} · es el más próximo a vencer</p>
        <Tarjeta className="mt-4 text-sm">
          <p className="font-semibold">FEFO dirigido — la app dice qué lote tomar.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border-2 border-exito p-2">
              <p className="font-mono font-semibold">{i.lote.codigo}</p>
              <p className="text-xs text-exito">vence {i.lote.vence} · este</p>
            </div>
            <div className="rounded-lg border border-border p-2 opacity-70">
              <p className="font-mono">{loteSiguiente(i)}</p>
              <p className="text-xs text-muted-foreground">vence después · todavía no</p>
            </div>
          </div>
        </Tarjeta>
        {vencidoBloqueado && (
          <div role="alert" className="mt-4 rounded-[14px] border-2 border-critico bg-critico/10 p-3 text-critico">
            <p className="flex items-center gap-2 font-extrabold">
              <Lock size={18} aria-hidden /> Lote vencido el 18/9/2024. No se puede surtir.
            </p>
            <p className="mt-1 text-sm">Queda bloqueado y se creó la tarea de retiro. Calidad lo sabe.</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setHojaOtroLote(true)}
          className="mt-4 min-h-10 text-sm font-semibold text-primary underline underline-offset-4"
        >
          No puedo tomar el lote {i.lote.codigo}
        </button>
        <Hoja abierta={hojaOtroLote} titulo={`¿Por qué no puedes tomar ${i.lote.codigo}?`} onCerrar={() => setHojaOtroLote(false)}>
          <p className="text-sm text-muted-foreground">
            Solo el supervisor autoriza tomar {loteSiguiente(i)}. La línea se aparta y sigues con la siguiente; regresa cuando decida.
          </p>
          {MOTIVOS_OTRO_LOTE.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={motivoLote === m}
              onClick={() => setMotivoLote(m)}
              className={cn(
                "min-h-11 w-full rounded-xl border px-3 text-left text-sm font-semibold",
                motivoLote === m ? "border-primary bg-primary-soft text-primary" : "border-border bg-card",
              )}
            >
              {m}
            </button>
          ))}
          <BotonFlujo
            disabled={!motivoLote}
            onClick={() => {
              const inc = crearIncidencia({
                ...contexto(t, linea, "Escanear lote"),
                tipo: "fefo_surtido",
                semaforo: "rojo",
                decisor: "supervisor",
                titulo: `Tomar otro lote de ${i.nombre}`,
                detalle: `${motivoLote}. Se pide autorizar el lote ${loteSiguiente(i)} en lugar de ${i.lote!.codigo} (FEFO). Pedido de ${linea.destino}.`,
                posicion,
                foto: false,
                grupo: `${t.id}|${linea.id}`,
              });
              actualizarTrabajo(t.id, (x) => ({
                apartadas: { ...x.apartadas, [linea.id]: { incidencia: inc.id, estado: "esperando", loteNuevo: loteSiguiente(i) } },
              }));
              setHojaOtroLote(false);
              setError(null);
              mostrar(inc, () => avanzar(t, e.linea + 1), "La línea queda apartada. Sigues con la siguiente.");
            }}
          >
            {motivoLote ? "Pedir autorización al supervisor" : "Elige el motivo"}
          </BotonFlujo>
          <BotonFlujo
            variante="discreto"
            onClick={() => {
              setHojaOtroLote(false);
              setVisor("lote");
            }}
          >
            Volver a escanear
          </BotonFlujo>
        </Hoja>
      </Marco>
    );
  }

  if (paso === "cont") {
    return (
      <Marco boton={<BotonFlujo onClick={() => setVisor("cont")}>Escanear el contenedor</BotonFlujo>}>
        {barra(() => setPaso(i.lote && !loteAutorizado ? "lote" : "cant"))}
        {encabezado}
        {producto}
        <h1 className="mt-5 font-display text-2xl font-extrabold">Deposita en el contenedor</h1>
        <p className="mt-2 font-mono text-2xl font-semibold">{codigoContenedor}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {destinoTexto} · lleva {cuenta(e.contenedor.bultos, "bulto")} de {CAPACIDAD_CONTENEDOR}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Antes de depositar, escanea el contenedor. Así ningún bulto cae en el pedido equivocado.
        </p>
      </Marco>
    );
  }

  // ── No puedo surtir esta línea: contar y decidir la salida ──────
  const sistema = Math.max(1, Math.round(i.stock / i.manejo.contenido));
  if (paso === "excepcion") {
    return (
      <Marco
        boton={
          <BotonFlujo
            onClick={() => {
              pitido();
              if (contado !== sistema) {
                const vacia = contado === 0;
                const inc = crearIncidencia({
                  ...contexto(t, linea, "No puedo surtir"),
                  tipo: vacia ? "posicion_vacia" : "faltante_surtido",
                  semaforo: "amarillo",
                  decisor: "supervisor",
                  estado: "registrada",
                  titulo: vacia ? `Posición ${posicion} vacía` : `Diferencia en ${posicion}`,
                  detalle: `${i.nombre}: contó ${enBultos(i, contado)}, el sistema dice ${enBultos(i, sistema)} · ${contado > sistema ? "sobrante" : "faltante"}. Se generó un conteo para el siguiente turno; la diferencia la resuelve el supervisor.`,
                  posicion,
                  foto: false,
                });
                crearTareaConteo(posicion, vacia ? "Posición vacía al surtir" : "Diferencia al surtir", inc.id, i.nombre, i.sku, sistema);
              }
              if (problema === "Dañado" || problema === "Vencido") {
                crearIncidencia({
                  ...contexto(t, linea, "No puedo surtir"),
                  tipo: problema === "Dañado" ? "dano" : "vencido",
                  semaforo: "amarillo",
                  decisor: "calidad",
                  estado: problema === "Dañado" ? "pendiente" : "registrada",
                  titulo: problema === "Dañado" ? `${i.nombre} dañado en ${posicion}` : `${i.nombre} vencido en ${posicion}`,
                  detalle:
                    problema === "Dañado"
                      ? "Se encontró dañado al surtir. Va a cuarentena CUA-01; Calidad decide."
                      : "Se encontró vencido al surtir. Queda bloqueado y se creó la tarea de retiro.",
                  posicion,
                  cantidad: 1,
                  unidad: i.manejo.nombre,
                  destino: problema === "Dañado" ? "cuarentena" : undefined,
                  foto: false,
                });
              }
              setPaso("salidas");
            }}
          >
            Confirmar
          </BotonFlujo>
        }
      >
        {barra(() => setPaso("pos"))}
        {encabezado}
        {producto}
        <h1 className="mt-5 font-display text-2xl font-extrabold">¿Cuánto hay en la posición?</h1>
        <p className="text-muted-foreground">El sistema dice {enBultos(i, sistema)}</p>
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            aria-label="Menos"
            disabled={contado <= 0}
            onClick={() => setContado(contado - 1)}
            className="grid size-16 place-items-center rounded-2xl border border-border disabled:opacity-30"
          >
            <Minus size={28} aria-hidden />
          </button>
          <p className="text-center">
            <span className="block font-mono text-6xl font-semibold tabular-nums">{contado}</span>
            <span className="text-sm text-muted-foreground">{contado === 1 ? i.manejo.nombre : i.manejo.plural}</span>
          </p>
          <button
            type="button"
            aria-label="Más"
            onClick={() => setContado(contado + 1)}
            className="grid size-16 place-items-center rounded-2xl border border-border"
          >
            <Plus size={28} aria-hidden />
          </button>
        </div>
        <p className="mt-6 text-sm font-semibold">¿Hay algún problema?</p>
        <div className="mt-2 flex gap-2">
          {(["Dañado", "Vencido", "No alcanzo"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={problema === p}
              onClick={() => setProblema(problema === p ? null : p)}
              className={cn(
                "min-h-11 flex-1 rounded-full border px-3 text-sm font-semibold",
                problema === p ? "border-primary bg-primary-soft text-primary" : "border-border",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </Marco>
    );
  }

  if (paso === "salidas") {
    const bloqueado = problema === "Dañado" || problema === "Vencido";
    const puede = bloqueado || problema === "No alcanzo" ? 0 : Math.min(contado, linea.bultos);
    const alterna = otraExistencia(i);
    const salidas: { id: string; titulo: string; detalle: string; accion: () => void }[] = [];
    if (bloqueado) {
      salidas.push({
        id: "otra",
        titulo: `Tomar de otra existencia · ${alterna}`,
        detalle: "El problema de calidad no detiene el pedido.",
        accion: () => {
          setPosAlterna(alterna);
          setProblema(null);
          setPaso("pos");
        },
      });
    }
    if (puede >= linea.bultos) {
      salidas.push({
        id: "completa",
        titulo: `Surtir ${enBultos(i, linea.bultos)} completos`,
        detalle: `${linea.destino} recibe lo que pidió.`,
        accion: () => {
          setTomar(linea.bultos);
          setPaso("cant");
        },
      });
    } else if (puede > 0) {
      salidas.push({
        id: "parcial",
        titulo: `Surtir ${puede} y dejar ${linea.bultos - puede} pendiente`,
        detalle: `${linea.destino} recibe ${cantidadCon(i.unidad, equivalente(i, puede))} ahora. El resto queda vivo con fecha.`,
        accion: () => registrar({ tipo: "parcial", bultos: puede, causa: problema ?? "Cantidad física menor" }),
      });
    }
    if (i.sustituto && puede < linea.bultos) {
      salidas.push({
        id: "sust",
        titulo: "Proponer un sustituto",
        detalle: `${i.sustituto.nombre} · ${cantidadCon(i.unidad, i.sustituto.stock)}. ${linea.destino} lo acepta o lo rechaza.`,
        accion: () => {
          const inc = crearIncidencia({
            ...contexto(t, linea, "No puedo surtir"),
            tipo: "sustituto",
            semaforo: "amarillo",
            decisor: "area",
            titulo: `Sustituto para ${i.nombre}`,
            detalle: `Se propone ${i.sustituto!.nombre} en lugar de ${i.nombre} (${cantidadCon(i.unidad, linea.pidio)}). ${linea.destino} lo acepta o lo rechaza desde su pantalla.`,
            foto: false,
          });
          registrarSinTomar(t, linea, { tipo: "sustituto", bultos: 0, causa: problema ?? "Cantidad física menor", sustituto: i.sustituto!.nombre });
          mostrar(inc, () => avanzar(t, e.linea + 1), "Sigues con la siguiente línea.");
        },
      });
    }
    if (puede < linea.bultos) {
      salidas.push({
        id: "pend",
        titulo: "Dejar toda la línea pendiente",
        detalle: "Queda viva con fecha: mañana 07:00.",
        accion: () => registrar({ tipo: "pendiente", bultos: 0, causa: problema ?? "Sin existencia en la posición" }),
      });
    }
    return (
      <Marco boton={null}>
        {barra(() => setPaso("excepcion"))}
        {encabezado}
        <h1 className="mt-5 font-display text-2xl font-extrabold">
          {bloqueado ? `El bulto quedó bloqueado · ${problema?.toLowerCase()}` : `Hay ${enBultos(i, contado)} y se piden ${linea.bultos}`}
        </h1>
        {bloqueado && <p className="mt-1 text-sm text-muted-foreground">Va a cuarentena CUA-01 y se avisó a Calidad.</p>}
        {contado > sistema && (
          <p className="mt-3 rounded-[14px] border border-alerta/40 bg-alerta/10 p-3 text-sm">
            Hay más de lo que dice el sistema: contaste {enBultos(i, contado)}, el sistema dice {sistema}. El sobrante se registra igual
            que un faltante.
          </p>
        )}
        <div className="mt-4 space-y-2">
          {salidas.map((s, n) => (
            <button
              key={s.id}
              type="button"
              onClick={s.accion}
              className={cn("block w-full rounded-[14px] border p-3 text-left", n === 0 ? "border-2 border-primary bg-primary-soft" : "border-border bg-card")}
            >
              <span className="flex items-center gap-2 font-display font-extrabold">
                {n + 1}) {s.titulo}
                {n === 0 && <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] text-primary-foreground">Recomendada</span>}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{s.detalle}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {contado === sistema
            ? "La línea nunca se borra."
            : `Se generó un conteo de ${posicion} para el siguiente turno. La diferencia no se ajusta aquí: la resuelve el supervisor.`}
        </p>
      </Marco>
    );
  }

  // ── Líneas esperando autorización ─────────────────────────────
  const resultados = Object.values(e.resultados);
  const esperando = t.lineas.filter((l) => e.apartadas[l.id]?.estado === "esperando");
  if (paso === "esperando") {
    return (
      <Marco
        boton={
          <>
            <BotonFlujo onClick={pausar}>Pausar y seguir con otro pedido</BotonFlujo>
            <BotonFlujo
              variante="discreto"
              onClick={() => {
                esperando.forEach((l) => registrarSinTomar(t, l, { tipo: "pendiente", bultos: 0, causa: "Esperaba autorización de otro lote" }));
                setPaso("cerrar");
              }}
            >
              Cerrar sin esas líneas (quedan pendientes)
            </BotonFlujo>
          </>
        }
      >
        {barra()}
        <h1 className="font-display text-2xl font-extrabold">
          {cuenta(esperando.length, "línea espera", "líneas esperan")} al supervisor
        </h1>
        <p className="mt-1 text-muted-foreground">Todo lo demás ya está en el contenedor.</p>
        <ul className="mt-4 space-y-2">
          {esperando.map((l) => {
            const x = insumoDe(l.sku);
            return (
              <li key={l.id} className="flex items-center gap-3 rounded-[14px] border border-border bg-card p-3 text-sm">
                <ImagenProducto codigo={x.sku} nombre={x.nombre} tamano="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{x.nombre}</span>
                  <span className="text-xs text-muted-foreground">Otro lote · {e.apartadas[l.id].incidencia}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Si el supervisor autoriza, la línea aparece para terminarla al retomar el pedido. Si no, queda pendiente con fecha.
        </p>
        {esperando.length === 0 && <BotonFlujo onClick={() => avanzar(t, 0)}>Continuar</BotonFlujo>}
      </Marco>
    );
  }

  const completas = resultados.filter((r) => r.tipo === "completa").length;
  const bultos = resultados.reduce((s, r) => s + r.bultos, 0);

  // ── Cerrar el contenedor ──────────────────────────────────────
  if (paso === "cerrar") {
    return (
      <Marco
        boton={
          <>
            <BotonFlujo
              onClick={() => {
                pitido();
                setPaso("salida");
              }}
            >
              Cerrar el contenedor
            </BotonFlujo>
            <BotonFlujo variante="discreto" onClick={() => setHojaEtiqueta(true)}>
              ¿La etiqueta no salió?
            </BotonFlujo>
          </>
        }
      >
        {barra()}
        <h1 className="font-display text-2xl font-extrabold">Cierra el contenedor de {destinoTexto}</h1>
        {e.contenedor.n > 1 && <p className="mt-1 text-sm text-muted-foreground">Van {e.contenedor.n} contenedores: se partió solo al llenarse.</p>}
        <div className="mt-4 rounded-[18px] border-2 border-foreground bg-card p-4">
          <div className="mx-auto flex h-14 max-w-[260px] items-end gap-[3px]" aria-hidden>
            {Array.from({ length: 36 }).map((_, n) => (
              <span key={n} className="h-full bg-foreground" style={{ width: n % 3 === 0 ? 4 : 2 }} />
            ))}
          </div>
          <p className="mt-2 text-center font-mono text-xl font-semibold">
            {t.contenedor}
            {e.contenedor.n > 1 ? ` · ${e.contenedor.n} de ${e.contenedor.n}` : ""}
          </p>
          <Fila k="Destino" v={destinoTexto} />
          <Fila k="Líneas" v={`${t.lineas.length} · ${completas} completas, ${t.lineas.length - completas} con diferencia`} />
          <Fila k="Bultos" v={String(bultos)} />
          <Fila k="Surtió" v={`${SURTIDOR.nombre} · ${horaActual()}`} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Desde aquí viaja un contenedor, no {cuenta(t.lineas.length, "artículo")}. Por eso {destinoTexto} confirma con un solo escaneo.
        </p>
        {mensajeEtiqueta && (
          <p role="status" className="mt-3 rounded-[14px] bg-muted p-3 text-sm">
            {mensajeEtiqueta}
          </p>
        )}
        <Hoja abierta={hojaEtiqueta} titulo="La etiqueta no salió" onCerrar={() => setHojaEtiqueta(false)}>
          <BotonHoja
            onClick={() => {
              setHojaEtiqueta(false);
              setMensajeEtiqueta(`Reintento enviado. Mismo ID: ${t.contenedor}.`);
            }}
          >
            Reintentar
          </BotonHoja>
          <BotonHoja
            onClick={() => {
              setHojaEtiqueta(false);
              setMensajeEtiqueta(`Enviada a la impresora del andén A-2. Mismo ID: ${t.contenedor}.`);
            }}
          >
            Usar otra impresora
          </BotonHoja>
          <BotonHoja
            onClick={() => {
              setHojaEtiqueta(false);
              setMensajeEtiqueta(`Sigue con el ID digital ${t.contenedor}. Reimprime después con el mismo ID.`);
            }}
          >
            Continuar con el ID digital
          </BotonHoja>
          <p className="text-xs text-muted-foreground">Si se rompe o se pierde después, se reimprime con el mismo ID. Nunca se genera uno nuevo.</p>
        </Hoja>
      </Marco>
    );
  }

  // ── Salida a tránsito ─────────────────────────────────────────
  const siguienteTrabajo = colaDelDia(estados).find((x) => x.id !== t.id);
  if (paso === "salida") {
    return (
      <Marco
        boton={
          <BotonFlujo
            onClick={() => {
              actualizarTrabajo(t.id, () => ({ estado: "transito", salidaMs: Date.now() }));
              pitido();
              setPaso("fin");
            }}
          >
            {t.tipo === "area" ? "Salir con el contenedor" : "Consolidar en la Ruta Este"}
          </BotonFlujo>
        }
      >
        {barra(() => setPaso("cerrar"))}
        <h1 className="font-display text-2xl font-extrabold">{t.tipo === "area" ? `Carga a ${ELEVADOR} y sal` : "Consolida en la Ruta Este"}</h1>
        <Tarjeta className="mt-4 text-sm">
          {t.tipo === "area" ? (
            <>
              Al salir, el stock sale de las posiciones y entra a <b>En tránsito a {t.nombre}</b>. Siempre hay un responsable: ni el almacén
              ni el área quedan con material de nadie.
            </>
          ) : (
            <>
              El contenedor se suma al manifiesto de la ruta. El stock entra a <b>En tránsito a Ruta Este</b>. Cada encargado confirma al
              recibir.
            </>
          )}
        </Tarjeta>
        <Tarjeta className="mt-3 py-2">
          <Fila k="Destino" v={destinoTexto} />
          <Fila k="Bultos" v={`${bultos} en ${cuenta(e.contenedor.n, "contenedor", "contenedores")}`} />
          <Fila k="Recibe" v={t.recibe} />
          <Fila k="Hora prometida" v={t.llega ?? "según manifiesto"} />
        </Tarjeta>
        {siguienteTrabajo && (
          <div className="mt-4 rounded-[14px] border border-alerta/40 bg-alerta/10 p-3 text-sm">
            <p className="font-semibold">Después de esta</p>
            <p>
              {siguienteTrabajo.corto} · sale {siguienteTrabajo.sale} · {siguienteTrabajo.tipo === "ruta" ? "en vehículo" : `por elevador ${ELEVADOR}`}
            </p>
          </div>
        )}
      </Marco>
    );
  }

  // ── En tránsito: solo el área confirma ──────────────────────────
  const transcurrido = e.salidaMs ? ahora - e.salidaMs : 0;
  const minutos = Math.floor(transcurrido / 6e4);
  const confirmado = e.estado === "confirmado";
  return (
    <Marco
      boton={
        <BotonFlujo
          onClick={() => {
            setTrabajoId(null);
            setPaso("inicio");
          }}
        >
          Siguiente trabajo
        </BotonFlujo>
      }
    >
      {barra()}
      <div className="pt-4">
        {confirmado ? (
          <Exito />
        ) : (
          <div className="mx-auto grid size-24 place-items-center rounded-full bg-frio/15 text-frio">
            <Truck size={46} aria-hidden />
          </div>
        )}
      </div>
      <h1 className="mt-4 text-center font-display text-2xl font-extrabold">
        {confirmado ? `${t.recibe} confirmó la entrega` : `En tránsito · falta que ${destinoTexto} confirme.`}
      </h1>
      {!confirmado && (
        <p className="mt-6 text-center font-mono text-6xl font-semibold tabular-nums">
          {minutos}:{String(Math.floor(transcurrido / 1000) % 60).padStart(2, "0")}
        </p>
      )}
      <Tarjeta className="mt-5 text-sm">
        {confirmado
          ? `Confirmado a las ${e.confirmado?.hora}. El stock salió de tránsito.`
          : minutos >= 60
            ? `Pasó a la bandeja de ${JEFE_ALMACEN}, jefe de almacén.`
            : minutos >= 30
              ? `Pasó a la bandeja de ${SUPERVISOR.nombre}.`
              : `A los 30 min sin confirmar pasa a ${SUPERVISOR.nombre}; a los 60, a ${JEFE_ALMACEN}. Nunca se cierra solo.`}
      </Tarjeta>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
        <ShieldAlert size={14} aria-hidden /> Tú no puedes darla por recibida. Quien surte nunca confirma.
      </p>
    </Marco>
  );
}

/** Lo que ya salió hoy: en tránsito (con su tiempo), confirmado o cancelado. */
function Despachados({ trabajos, ahora }: { trabajos: Trabajo[]; ahora: number }) {
  const estados = surtidoStore.use();
  if (!trabajos.length) return null;
  return (
    <>
      <h2 className="mt-5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Despachados hoy</h2>
      <ul className="mt-2 space-y-2">
        {trabajos.map((t) => {
          const e = estadoDe(t.id, estados);
          const min = e.salidaMs ? Math.floor((ahora - e.salidaMs) / 6e4) : 0;
          const [texto, clase] =
            e.estado === "confirmado"
              ? [`Confirmado ${e.confirmado?.hora ?? ""}`, "bg-exito/15 text-exito"]
              : e.estado === "cancelado"
                ? ["Cancelado por el área", "bg-muted text-muted-foreground"]
                : [`En tránsito · ${min} min`, min >= 30 ? "bg-critico/15 text-critico" : "bg-frio/15 text-frio"];
          return (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded-[14px] border border-border bg-card px-3 py-2.5 text-sm">
              <span className="min-w-0 truncate font-semibold">{t.corto}</span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", clase)}>{texto}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Quien surte nunca confirma: lo confirma quien recibe.</p>
    </>
  );
}
