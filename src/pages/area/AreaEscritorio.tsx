import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSesion } from "@/lib/sesion";
import { toast } from "sonner";
import { ArrowLeft, Bell, Check, ClipboardList, FileText, Hourglass, LogOut, Minus, Moon, Plus, Search, ShieldCheck, Smartphone, Sun, Truck, X } from "lucide-react";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { usePda } from "@/context/PdaContext";
import {
  APROBADOR_URGENTE,
  AREAS,
  CATEGORIAS,
  MOTIVOS_RECHAZO_URGENTE,
  MOTIVOS_URGENCIA,
  ORIGENES,
  TEXTO_DECISION,
  VENTANA,
  borradoresStore,
  descartarBorrador,
  aBase,
  disponibilidad,
  enUnidad,
  enviarPedido,
  folioTemprano,
  guardarBorrador,
  metricasArea,
  pasoDe,
  pedidoDe,
  decidirUrgente,
  reenviarEnVentana,
  trabajosDelArea,
  type Area,
  type Borrador,
  type Entrega,
  type SinCodigo,
  type UnidadPedido,
} from "@/data/area";
import { documentoSurtido } from "@/data/documentos";
import { esPendiente, incidenciasStore, responder, type Incidencia } from "@/data/incidencias";
import {
  SURTIDOR,
  bultosPara,
  cantidadCon,
  enBultos,
  estadoDe,
  insumoDe,
  pedidosAreaStore,
  surtidoStore,
  trabajoDe,
  type ClaveArea,
  type EstadoTrabajo,
  type Insumo,
  type Trabajo,
} from "@/data/surtido";
import { cancelarDesdeArea, useVigilanciaTransito } from "@/data/vigilancia";
import { FechaHoy } from "@/lib/fecha";
import { cn, cuenta } from "@/lib/utils";
import { BotonImprimir, DocumentoOrden, useImprimir } from "../supervisor/Ordenes";
import { productosQueUsan } from "@/data/planeacion";
import { VistaExistencias, VistaPlaneacion } from "./Planeacion";
import { ESTADO, MOTIVOS_CANCELAR, MOTIVOS_SUSTITUTO, PedirSinCodigo, Recorrido, horaDe, pasosDe, pasosTemprano, textoLinea } from "./comun";

/**
 * Escritorio del área (Panadería, Cocina, Dulcería): planear y pedir al almacén, seguir los
 * pedidos, decidir sustitutos y ver sus indicadores. Recibir la entrega se hace con el PDA.
 */

type Vista = { tipo: "tablero" } | { tipo: "nueva" } | { tipo: "hoja"; ids: string[]; enviada?: { solicitudes: string[] } } | { tipo: "planeacion" } | { tipo: "existencias" };

const PESTANAS: [Vista["tipo"], string][] = [
  ["tablero", "Pedidos"],
  ["planeacion", "Planeación"],
  ["existencias", "Existencias"],
];

export default function AreaEscritorio() {
  const [params] = useSearchParams();
  const clave = (["panaderia", "cocina", "dulceria"].includes(params.get("area") ?? "") ? params.get("area") : "panaderia") as ClaveArea;
  return <Escritorio key={clave} a={AREAS[clave]} />;
}

// ── Piezas ──────────────────────────────────────────────────────

function Panel({ titulo, subtitulo, children, className, accion }: { titulo: string; subtitulo?: string; children: ReactNode; className?: string; accion?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold">{titulo}</h2>
          {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Indicador({ etiqueta, valor, contexto, tono }: { etiqueta: string; valor: ReactNode; contexto?: ReactNode; tono?: "alerta" | "critico" | "exito" }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 font-sans text-3xl font-semibold">{valor}</p>
      {contexto && <p className={cn("text-xs", tono === "critico" ? "font-semibold text-critico" : tono === "alerta" ? "font-semibold text-alerta" : tono === "exito" ? "text-exito" : "text-muted-foreground")}>{contexto}</p>}
    </div>
  );
}

const BOTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-40";
const PRINCIPAL = cn(BOTON, "bg-primary text-primary-foreground");
const SECUNDARIO = cn(BOTON, "border border-border bg-card");

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick} className={cn("min-h-9 rounded-full border px-3 text-sm font-semibold", activo ? "border-primary bg-primary-soft text-primary" : "border-border")}>
      {children}
    </button>
  );
}

/**
 * Cantidad del pedido: se escribe a mano o con − y +, en la unidad del artículo (KG, LT, PZA)
 * o en su empaque (sacos, cajas, bidones, paquetes). Se guarda siempre en la unidad del artículo.
 */
function Cantidad({ i, valor, unidad = "base", onCambio }: { i: Insumo; valor: number; unidad?: UnidadPedido; onCambio: (cantidad: number, unidad: UnidadPedido) => void }) {
  const mostrado = enUnidad(i, valor, unidad);
  const [texto, setTexto] = useState(String(mostrado));
  useEffect(() => setTexto(String(mostrado)), [mostrado]);
  const paso = unidad === "empaque" ? 1 : pasoDe(i);
  const entero = unidad === "empaque" || i.unidad === "PZA";
  const fijar = (n: number) => {
    const limpio = entero ? Math.round(n) : Number(n.toFixed(2));
    if (!(limpio > 0)) return setTexto(String(mostrado));
    onCambio(aBase(i, limpio, unidad), unidad);
  };
  const confirmar = () => fijar(Number(texto.replace(",", ".")));
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Menos ${i.nombre}`} disabled={mostrado <= paso} onClick={() => fijar(mostrado - paso)} className="grid size-8 shrink-0 place-items-center rounded-lg border border-border disabled:opacity-30">
          <Minus size={16} aria-hidden />
        </button>
        <input
          value={texto}
          inputMode={entero ? "numeric" : "decimal"}
          aria-label={`Cantidad de ${i.nombre}`}
          onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, ""))}
          onBlur={confirmar}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className="h-8 w-16 rounded-lg border border-input bg-background px-1 text-center font-mono text-sm font-semibold tabular-nums"
        />
        <select
          aria-label={`Unidad de ${i.nombre}`}
          value={unidad}
          onChange={(e) => {
            const nueva = e.target.value as UnidadPedido;
            // Al pasar a empaque se redondea a empaques completos: no se surte medio saco.
            onCambio(nueva === "empaque" ? aBase(i, bultosPara(i, valor), "empaque") : valor, nueva);
          }}
          className="h-8 rounded-lg border border-input bg-background px-1 text-sm font-semibold"
        >
          <option value="base">{i.unidad}</option>
          <option value="empaque">{i.manejo.plural}</option>
        </select>
        <button type="button" aria-label={`Más ${i.nombre}`} onClick={() => fijar(mostrado + paso)} className="grid size-8 shrink-0 place-items-center rounded-lg border border-border">
          <Plus size={16} aria-hidden />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {unidad === "empaque" ? `= ${cantidadCon(i.unidad, valor)} · ${i.manejo.etiqueta}` : `se surte en ${enBultos(i, bultosPara(i, valor))} (${i.manejo.etiqueta})`}
      </p>
    </div>
  );
}

// ── Avisos del área ─────────────────────────────────────────────

interface Aviso {
  id: string;
  texto: string;
  hora?: string;
  tono: "accion" | "info" | "ok" | "alerta";
}

function avisosDe(a: Area, trabajos: Trabajo[], estados: Record<string, EstadoTrabajo>, incidencias: Incidencia[]): Aviso[] {
  const avisos: Aviso[] = [];
  for (const t of trabajos) {
    const e = estadoDe(t.id, estados);
    const hechas = Object.keys(e.resultados).length;
    if (["surtiendo", "pausado"].includes(e.estado) && hechas) avisos.push({ id: `${t.id}-surtiendo`, texto: `${t.id} se está surtiendo · ${hechas} de ${t.lineas.length} líneas`, tono: "info" });
    for (const l of t.lineas) {
      const r = e.resultados[l.id];
      if (r && (r.tipo === "parcial" || r.tipo === "pendiente")) {
        avisos.push({ id: `${l.id}-${r.tipo}`, texto: `${insumoDe(l.sku).nombre} (${t.id}) quedó ${r.tipo === "parcial" ? "parcial" : "pendiente con fecha"}: ${r.causa ?? "sin existencia"}${productosQueUsan(a.clave, l.sku).length ? `. Afecta tu plan: ${productosQueUsan(a.clave, l.sku).join(", ").toLowerCase()}` : ""}`, tono: "alerta" });
      }
    }
    const ap = e.aprobacion;
    if (ap?.decision)
      avisos.push({
        id: `${t.id}-${ap.decision}`,
        hora: ap.hora,
        texto: `${t.id}: ${ap.quien} ${TEXTO_DECISION[ap.decision]}${ap.nota ? ` (${ap.nota.toLowerCase()})` : ""}${ap.decision === "aprobada" ? ". Ya está en la cola del surtidor." : ap.decision === "ventana" ? `. Sale a las ${VENTANA.sale}.` : ". Puedes reenviarla en la ventana."}`,
        tono: ap.decision === "rechazada" ? "alerta" : "ok",
      });
    if (e.estado === "transito") avisos.push({ id: `${t.id}-transito`, hora: e.salidaMs ? horaDe(e.salidaMs) : undefined, texto: `${t.id} salió del almacén. Confírmalo con el PDA al recibir el contenedor ${t.contenedor}.`, tono: "accion" });
    if (e.confirmado) avisos.push({ id: `${t.id}-confirmado`, hora: e.confirmado.hora, texto: `${t.id} entregado: recibió ${e.confirmado.quien}${e.confirmado.diferencia ? ", con diferencia" : ", conforme"}.`, tono: "ok" });
    if (e.cancelado) avisos.push({ id: `${t.id}-cancelado`, hora: e.cancelado.hora, texto: `${t.id} cancelado por ${e.cancelado.quien}: ${e.cancelado.motivo.toLowerCase()}.`, tono: "info" });
  }
  for (const i of incidencias.filter((x) => x.proveedor === a.nombre)) {
    if (i.decisor === "area" && esPendiente(i)) avisos.push({ id: `${i.id}-decidir`, hora: i.hora, texto: `Te toca decidir: ${i.titulo}.`, tono: "accion" });
    else if (!esPendiente(i) && i.resolucion && i.estado !== "anulada") avisos.push({ id: `${i.id}-resuelta`, hora: i.eventos?.at(-1)?.hora, texto: `${i.id} · ${i.resolucion}`, tono: "ok" });
  }
  const orden = { accion: 0, alerta: 1, info: 2, ok: 3 };
  return avisos.sort((x, y) => orden[x.tono] - orden[y.tono]);
}

/** Aviso en pantalla cuando cambia algo de los pedidos del área, aunque esté en otra vista. */
function useAvisosEnVivo(avisos: Aviso[]) {
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!vistos.current) {
      vistos.current = new Set(avisos.map((x) => x.id));
      return;
    }
    for (const x of avisos) {
      if (vistos.current.has(x.id)) continue;
      vistos.current.add(x.id);
      if (x.tono === "ok") toast.success(x.texto);
      else if (x.tono === "alerta") toast.warning(x.texto);
      else toast(x.texto);
    }
  }, [avisos]);
}

function Campana({ avisos }: { avisos: Aviso[] }) {
  const [abierta, setAbierta] = useState(false);
  const pendientes = avisos.filter((x) => x.tono === "accion").length;
  return (
    <div className="relative">
      <button type="button" onClick={() => setAbierta(!abierta)} aria-expanded={abierta} aria-label={`Avisos: ${pendientes} por atender`} className="relative grid size-11 place-items-center rounded-full border border-border bg-card">
        <Bell size={18} aria-hidden />
        {pendientes > 0 && <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-critico text-[11px] font-bold text-white">{pendientes}</span>}
      </button>
      {abierta && (
        <div className="absolute right-0 z-40 mt-2 w-[380px] rounded-2xl border border-border bg-card p-3 shadow-xl">
          <p className="mb-2 font-semibold">Avisos de hoy</p>
          {avisos.length ? (
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
              {avisos.map((x) => (
                <li key={x.id} className={cn("rounded-xl px-3 py-2 text-sm", x.tono === "accion" ? "bg-primary-soft" : x.tono === "alerta" ? "bg-alerta/10" : "bg-muted")}>
                  {x.hora && <span className="mr-1 font-mono text-xs text-muted-foreground">{x.hora}</span>}
                  {x.texto}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin avisos todavía.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────

function Escritorio({ a }: { a: Area }) {
  const { oscuro, setOscuro } = usePda();
  const [, setParams] = useSearchParams();
  const sesion = useSesion();
  const navegar = useNavigate();
  const yo = sesion ?? { nombre: a.pide, puesto: `Jefe de ${a.nombre}`, perfil: "area_jefe" as const };
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  const incidencias = incidenciasStore.use();
  const borrador = borradoresStore.use()[a.clave];
  useVigilanciaTransito();
  const [vista, setVista] = useState<Vista>({ tipo: "tablero" });
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    document.title = `${a.nombre} · Pedidos al almacén`;
    return () => {
      clearInterval(reloj);
      document.title = "Momi PDA";
    };
  }, [a.nombre]);

  const trabajos = trabajosDelArea(a, pedidos);
  const avisos = useMemo(() => avisosDe(a, trabajos, estados, incidencias), [a, trabajos, estados, incidencias]);
  useAvisosEnVivo(avisos);

  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary font-display text-lg font-extrabold text-primary-foreground">M</span>
            <div>
              <p className="font-display text-lg leading-tight font-extrabold">Pedidos al almacén</p>
              <p className="text-xs text-muted-foreground">
                Momi · <FechaHoy /> · {horaDe(ahora)}
              </p>
            </div>
          </div>
          {yo.perfil !== "supervisor" ? (
            <span className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold">{a.nombre}</span>
          ) : (
          <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">Área</span>
            <select
              aria-label="Área"
              value={a.clave}
              onChange={(e) => setParams({ area: e.target.value })}
              className="bg-transparent font-semibold"
            >
              {Object.values(AREAS).map((x) => (
                <option key={x.clave} value={x.clave}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          )}
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">Maqueta con datos de ejemplo</span>
          <div className="ml-auto flex items-center gap-2">
            <Link to={`/pda/area?area=${a.clave}`} target="_blank" className={SECUNDARIO}>
              <Smartphone size={16} aria-hidden /> PDA para recibir
            </Link>
            <button type="button" onClick={() => setOscuro(!oscuro)} aria-label={oscuro ? "Modo claro" : "Modo oscuro"} className="grid size-11 place-items-center rounded-full border border-border bg-card">
              {oscuro ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>
            <Campana avisos={avisos} />
            <div className="hidden items-center gap-2 pl-2 sm:flex">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-sm font-bold">{yo.nombre.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
              <div className="text-sm leading-tight">
                <p className="font-semibold">{yo.nombre}</p>
                <p className="text-xs text-muted-foreground">{yo.puesto}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                navegar("/login?salir=1", { replace: true });
              }}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="grid size-11 place-items-center rounded-full border border-border bg-card"
            >
              <LogOut size={18} aria-hidden />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1440px] gap-1 px-6" aria-label="Secciones del área">
          {PESTANAS.map(([tipo, nombre]) => {
            const activa = vista.tipo === tipo || (tipo === "tablero" && (vista.tipo === "nueva" || vista.tipo === "hoja"));
            return (
              <button
                key={tipo}
                type="button"
                aria-current={activa ? "page" : undefined}
                onClick={() => setVista({ tipo } as Vista)}
                className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold", activa ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {nombre}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {vista.tipo === "planeacion" ? (
          <VistaPlaneacion a={a} onGenerada={() => setVista({ tipo: "nueva" })} />
        ) : vista.tipo === "existencias" ? (
          <VistaExistencias a={a} />
        ) : vista.tipo === "nueva" ? (
          <NuevaSolicitud
            a={a}
            borrador={borrador}
            onSalir={() => setVista({ tipo: "tablero" })}
            onEnviada={(ids, solicitudes) => setVista({ tipo: "hoja", ids, enviada: { solicitudes } })}
          />
        ) : vista.tipo === "hoja" ? (
          <Hoja ids={vista.ids} enviada={vista.enviada} estados={estados} incidencias={incidencias} onVolver={() => setVista({ tipo: "tablero" })} />
        ) : (
          <Tablero a={a} trabajos={trabajos} estados={estados} incidencias={incidencias} borrador={borrador} onNueva={() => setVista({ tipo: "nueva" })} onHoja={(id) => setVista({ tipo: "hoja", ids: [id] })} onPlaneacion={() => setVista({ tipo: "planeacion" })} />
        )}
      </main>
    </div>
  );
}

// ── Tablero ─────────────────────────────────────────────────────

type Filtro = "todos" | "activos" | "entregados" | "cancelados";

function Tablero({
  a,
  trabajos,
  estados,
  incidencias,
  borrador,
  onNueva,
  onHoja,
  onPlaneacion,
}: {
  a: Area;
  trabajos: Trabajo[];
  estados: Record<string, EstadoTrabajo>;
  incidencias: Incidencia[];
  borrador?: Borrador;
  onNueva: () => void;
  onHoja: (id: string) => void;
  onPlaneacion: () => void;
}) {
  const m = metricasArea(a, trabajos, estados, incidencias);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [seleccion, setSeleccion] = useState<string>(() => trabajos.find((t) => !["confirmado", "cancelado"].includes(estadoDe(t.id, estados).estado))?.id ?? "temprano");
  const enviada14 = pedidoDe(trabajos.find((t) => t.sale === VENTANA.sale)?.id ?? "");
  const visibles = trabajos
    .filter((t) => {
      const e = estadoDe(t.id, estados).estado;
      return filtro === "todos" ? true : filtro === "activos" ? !["confirmado", "cancelado", "rechazado"].includes(e) : filtro === "entregados" ? e === "confirmado" : e === "cancelado" || e === "rechazado";
    })
    .reverse();
  const elegido = trabajos.find((t) => t.id === seleccion);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <Panel titulo={`Ventana de las ${VENTANA.sale}`} subtitulo={`Cierra a las ${VENTANA.cierra} · llega a ${a.nombre} a las ${VENTANA.llega}`} className="lg:col-span-4">
        {borrador ? (
          <p className="mb-3 rounded-xl bg-alerta/10 px-3 py-2 text-sm">
            {borrador.desdePlan ? "La planeación generó una solicitud" : "Tienes un borrador"} con {cuenta(borrador.lineas.length + borrador.sinCodigo.length, "artículo")}, guardado a las {borrador.guardado}. {borrador.desdePlan && "Revísala antes de enviarla."}
          </p>
        ) : enviada14 ? (
          <p className="mb-3 rounded-xl bg-exito/10 px-3 py-2 text-sm text-exito">Ya enviaste la de las {VENTANA.sale} ({enviada14.id}). Puedes hacer otra solicitud si te falta algo.</p>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">Tu pedido ya está armado con lo que sueles pedir: {cuenta(a.sugerido.length, "artículo")}. Revísalo, ajústalo y envíalo.</p>
        )}
        {m.enviados > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            Hoy: {m.desdePlan} de {cuenta(m.enviados, "solicitud enviada", "solicitudes enviadas")} {m.desdePlan === 1 ? "salió" : "salieron"} de la planeación.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onNueva} className={PRINCIPAL}>
            <ClipboardList size={16} aria-hidden /> {borrador ? (borrador.desdePlan ? "Revisar la solicitud del plan" : "Continuar el borrador") : "Nueva solicitud"}
          </button>
          {!borrador && (
            <button type="button" onClick={onPlaneacion} className={SECUNDARIO}>
              Generar desde la planeación
            </button>
          )}
          {borrador && (
            <button type="button" onClick={() => descartarBorrador(a)} className={SECUNDARIO}>
              Descartar borrador
            </button>
          )}
        </div>
      </Panel>

      <Panel titulo={`Hoy en ${a.nombre}`} subtitulo="Tus pedidos al almacén, en vivo" className="lg:col-span-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Indicador etiqueta="Pedidos hoy" valor={m.pedidosHoy} contexto="incluye la entrega de las 07:00" />
          <Indicador etiqueta="Por surtir" valor={m.porSurtir} contexto={m.porAprobar ? `${m.porAprobar} urgente por aprobar` : `los surte ${SURTIDOR.nombre}`} tono={m.porAprobar ? "alerta" : undefined} />
          <Indicador etiqueta="En camino" valor={m.enCamino} contexto={m.enCamino ? "confírmalo con el PDA" : "nada en camino"} tono={m.enCamino ? "alerta" : undefined} />
          <Indicador etiqueta="Entregados" valor={m.entregados} contexto={cuenta(m.conformes, "conforme")} />
          <Indicador etiqueta="Líneas completas" valor={`${m.lineasCompletas} %`} contexto={`de ${cuenta(m.lineas, "línea")} surtidas`} tono={m.lineasCompletas < 90 ? "alerta" : "exito"} />
          <Indicador etiqueta="Diferencias abiertas" valor={m.diferencias.length} contexto={m.diferencias.length ? "las revisa el supervisor" : "ninguna"} tono={m.diferencias.length ? "critico" : undefined} />
        </div>
      </Panel>

      {(m.decisiones.length > 0 || m.diferencias.length > 0) && (
        <Panel titulo="Necesita tu atención" subtitulo="Sustitutos que propuso el surtidor y diferencias que reportaste" className="lg:col-span-12">
          <div className="grid gap-3 md:grid-cols-2">
            {m.decisiones.map((i) => (
              <DecisionSustituto key={i.id} a={a} i={i} />
            ))}
            {m.diferencias.map((i) => (
              <div key={i.id} className="rounded-xl border border-border p-4 text-sm">
                <p className="font-mono text-xs text-muted-foreground">{i.id} · {i.hora}</p>
                <p className="font-semibold">{i.titulo}</p>
                <p className="text-muted-foreground">{i.detalle}</p>
                <p className="mt-1 text-xs font-semibold text-alerta">Lo resuelve el supervisor. Te llega un aviso.</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel
        titulo="Mis pedidos"
        subtitulo="Del más reciente al más antiguo"
        className="lg:col-span-7"
        accion={
          <div className="inline-flex rounded-xl bg-muted p-0.5">
            {(
              [
                ["todos", "Todos"],
                ["activos", "Activos"],
                ["entregados", "Entregados"],
                ["cancelados", "Cancelados o rechazados"],
              ] as const
            ).map(([v, t]) => (
              <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)} className={cn("min-h-8 rounded-lg px-2.5 text-xs font-semibold", filtro === v ? "bg-card shadow-sm" : "text-muted-foreground")}>
                {t}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Ventana</th>
                <th className="pb-2 font-medium">Folio</th>
                <th className="pb-2 font-medium">A</th>
                <th className="pb-2 font-medium">Artículos</th>
                <th className="pb-2 font-medium">Recibe</th>
                <th className="pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {borrador && (filtro === "todos" || filtro === "activos") && (
                <tr onClick={onNueva} className="cursor-pointer border-t border-border hover:bg-muted/60">
                  <td className="py-2.5 font-mono">{borrador.entrega === "urgente" ? "Urgente" : VENTANA.sale}</td>
                  <td className="py-2.5 text-muted-foreground">sin enviar</td>
                  <td className="py-2.5">Almacén Central</td>
                  <td className="py-2.5">{borrador.lineas.length + borrador.sinCodigo.length}</td>
                  <td className="py-2.5">{borrador.recibe}</td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-alerta/15 px-2.5 py-0.5 text-xs font-semibold text-alerta">Borrador</span>
                  </td>
                </tr>
              )}
              {visibles.map((t) => {
                const e = estadoDe(t.id, estados);
                const p = pedidoDe(t.id);
                return (
                  <tr key={t.id} onClick={() => setSeleccion(t.id)} className={cn("cursor-pointer border-t border-border hover:bg-muted/60", seleccion === t.id && "bg-primary-soft/70 hover:bg-primary-soft/70")}>
                    <td className="py-2.5 font-mono">{t.id === a.trabajoBase ? a.etiquetaBase : t.urgente ? "Urgente" : t.sale}</td>
                    <td className="py-2.5">
                      <button type="button" onClick={() => setSeleccion(t.id)} className="font-mono text-xs font-semibold">
                        {t.id}
                      </button>
                    </td>
                    <td className="py-2.5">{p?.origen ?? "Almacén Central"}</td>
                    <td className="py-2.5 tabular-nums">{t.lineas.length}</td>
                    <td className="py-2.5">{e.confirmado?.quien ?? p?.recibe ?? t.recibe}</td>
                    <td className="py-2.5">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", ESTADO[e.estado].clase)}>{ESTADO[e.estado].texto}</span>
                    </td>
                  </tr>
                );
              })}
              {(filtro === "todos" || filtro === "entregados") && (
                <tr onClick={() => setSeleccion("temprano")} className={cn("cursor-pointer border-t border-border hover:bg-muted/60", seleccion === "temprano" && "bg-primary-soft/70")}>
                  <td className="py-2.5 font-mono">07:00</td>
                  <td className="py-2.5 font-mono text-xs font-semibold">{folioTemprano(a)}</td>
                  <td className="py-2.5">Almacén Central</td>
                  <td className="py-2.5">{a.entregaTemprano.lineas.length}</td>
                  <td className="py-2.5">{a.recibe}</td>
                  <td className="py-2.5">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", ESTADO.confirmado.clase)}>Entregada</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="lg:col-span-5">
        <Panel titulo="Detalle del pedido" className="lg:sticky lg:top-24">
          {seleccion === "temprano" ? (
            <DetalleTemprano a={a} />
          ) : elegido ? (
            <DetallePedido key={elegido.id} a={a} t={elegido} e={estadoDe(elegido.id, estados)} onHoja={() => onHoja(elegido.id)} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Elige un pedido de la lista.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function DecisionSustituto({ a, i }: { a: Area; i: Incidencia }) {
  const [respuesta, setRespuesta] = useState<"aceptar" | "rechazar" | null>(null);
  const [motivo, setMotivo] = useState("");
  return (
    <div className="rounded-xl border border-primary/40 bg-primary-soft/50 p-4 text-sm">
      <p className="font-mono text-xs text-muted-foreground">{i.id} · {i.hora} · propuso {i.usuario}</p>
      <p className="font-semibold">{i.titulo}</p>
      <p className="text-muted-foreground">{i.detalle}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["aceptar", "rechazar"] as const).map((r) => (
          <Chip
            key={r}
            activo={respuesta === r}
            onClick={() => {
              setRespuesta(r);
              setMotivo("");
            }}
          >
            {r === "aceptar" ? "Aceptar" : "Rechazar"}
          </Chip>
        ))}
        {respuesta && (
          <select aria-label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-9 rounded-full border border-border bg-background px-3">
            <option value="">Elige el motivo…</option>
            {MOTIVOS_SUSTITUTO[respuesta].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={!respuesta || !motivo}
          onClick={() => {
            const r = responder(i.id, respuesta!, { actor: { nombre: a.pide, rol: a.nombre }, motivo });
            toast.success(r ?? "Respuesta enviada");
          }}
          className={cn(PRINCIPAL, "min-h-9")}
        >
          Enviar respuesta
        </button>
      </div>
    </div>
  );
}

function DetallePedido({ a, t, e, onHoja }: { a: Area; t: Trabajo; e: EstadoTrabajo; onHoja: () => void }) {
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const p = pedidoDe(t.id);
  const cancelable = ["por_aprobar", "en_cola", "surtiendo", "pausado"].includes(e.estado);
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{t.id}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", ESTADO[e.estado].clase)}>{ESTADO[e.estado].texto}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.urgente ? "Urgente · sale ahora" : `Sale ${t.sale} · llega ${t.llega}`} · a {p?.origen ?? "Almacén Central"} · recibe {p?.recibe ?? t.recibe}
        </p>
        {p?.nota && <p className="mt-1 text-sm">Nota para el almacén: {p.nota}</p>}
      </div>
      <EstadoAprobacion a={a} t={t} e={e} />
      {e.cancelado && (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">
          Lo canceló {e.cancelado.quien} a las {e.cancelado.hora}: {e.cancelado.motivo.toLowerCase()}.
        </p>
      )}
      {e.estado === "transito" && (
        <p className="flex items-center gap-2 rounded-xl bg-alerta/10 px-3 py-2 text-sm">
          <Truck size={16} className="text-alerta" aria-hidden /> Va en camino. Quien reciba lo confirma escaneando el contenedor con el PDA.
        </p>
      )}
      <Recorrido pasos={pasosDe(a, t, e)} />
      <div className="space-y-2 border-t border-border pt-3">
        {t.lineas.map((l, n) => {
          const i = insumoDe(l.sku);
          return (
            <div key={l.id} className="flex items-center gap-3">
              <ImagenProducto codigo={i.sku} nombre={i.nombre} tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">{i.nombre}</span>
                <span className="block text-xs text-muted-foreground">{textoLinea(t, e, n)}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onHoja} className={SECUNDARIO}>
          <FileText size={16} aria-hidden /> Ver hoja de solicitud
        </button>
        {cancelable && !cancelando && (
          <button type="button" onClick={() => setCancelando(true)} className={cn(SECUNDARIO, "text-critico")}>
            Cancelar pedido
          </button>
        )}
      </div>
      {cancelando && (
        <div className="space-y-2 rounded-xl border border-critico/40 p-3">
          <p className="text-sm font-semibold">¿Por qué lo cancelas?</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_CANCELAR.map((x) => (
              <Chip key={x} activo={motivo === x} onClick={() => setMotivo(x)}>
                {x}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">El surtidor recibe el aviso y regresa a su posición lo que ya tomó.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCancelando(false)} className={SECUNDARIO}>
              No cancelar
            </button>
            <button
              type="button"
              disabled={!motivo}
              onClick={() => {
                cancelarDesdeArea(t.id, a.pide, motivo!);
                setCancelando(false);
              }}
              className={cn(BOTON, "bg-critico text-white")}
            >
              Cancelar pedido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Una urgencia espera a la supervisora antes de surtirse; en la maqueta se puede simular su respuesta. */
function EstadoAprobacion({ a, t, e }: { a: Area; t: Trabajo; e: EstadoTrabajo }) {
  const ap = e.aprobacion;
  const [rechazando, setRechazando] = useState(false);
  if (!ap || e.estado === "cancelado") return null;
  if (e.estado === "por_aprobar")
    return (
      <div role="status" className="space-y-2 rounded-xl border border-alerta/50 bg-alerta/10 p-3 text-sm">
        <p className="flex items-center gap-2 font-semibold text-alerta">
          <Hourglass size={16} aria-hidden /> Espera aprobación de {ap.aprobador}
        </p>
        <p>
          {APROBADOR_URGENTE.puesto} · pedida a las {ap.solicitada} · motivo: {ap.motivo.toLowerCase()}. No entra a la cola del surtidor hasta que la apruebe.
        </p>
        <div className="border-t border-alerta/30 pt-2">
          <p className="mb-1.5 text-xs text-muted-foreground">Maqueta: simula la respuesta de {ap.aprobador}</p>
          {rechazando ? (
            <div className="flex flex-wrap items-center gap-2">
              {MOTIVOS_RECHAZO_URGENTE.map((m) => (
                <Chip key={m} activo={false} onClick={() => decidirUrgente(t.id, "rechazada", ap.aprobador, m, true)}>
                  {m}
                </Chip>
              ))}
              <button type="button" onClick={() => setRechazando(false)} className="text-xs text-muted-foreground underline">
                Volver
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => decidirUrgente(t.id, "aprobada", ap.aprobador, undefined, true)} className={cn(SECUNDARIO, "min-h-9")}>
                <ShieldCheck size={15} aria-hidden /> Simular aprobación de {ap.aprobador}
              </button>
              <button type="button" onClick={() => decidirUrgente(t.id, "ventana", ap.aprobador, "Puede esperar a la ventana", true)} className={cn(SECUNDARIO, "min-h-9")}>
                Simular que la pasa a las {VENTANA.sale}
              </button>
              <button type="button" onClick={() => setRechazando(true)} className={cn(SECUNDARIO, "min-h-9 text-critico")}>
                Simular rechazo
              </button>
            </div>
          )}
        </div>
      </div>
    );
  if (e.estado === "rechazado")
    return (
      <div role="alert" className="space-y-2 rounded-xl border border-critico/50 bg-critico/10 p-3 text-sm">
        <p className="font-semibold text-critico">
          {ap.quien} rechazó la urgencia a las {ap.hora}
          {ap.nota && `: ${ap.nota.toLowerCase()}`}
        </p>
        <p>No se surte. Si todavía lo necesitas, mándala como pedido normal de la ventana.</p>
        <button type="button" onClick={() => reenviarEnVentana(t.id, a.pide)} className={cn(PRINCIPAL, "min-h-9")}>
          Enviarla en la ventana de las {VENTANA.sale}
        </button>
      </div>
    );
  return (
    <p className="flex items-center gap-2 rounded-xl bg-exito/10 px-3 py-2 text-sm">
      <ShieldCheck size={16} className="shrink-0 text-exito" aria-hidden />
      {ap.reenviada
        ? `${ap.quien} rechazó la urgencia; ${ap.reenviada.quien} la reenvió en la ventana de las ${VENTANA.sale}.`
        : ap.decision === "ventana"
          ? `${ap.quien} la pasó a la ventana de las ${VENTANA.sale} (${ap.hora}).`
          : `${ap.quien} aprobó la urgencia a las ${ap.hora}.`}
    </p>
  );
}

function DetalleTemprano({ a }: { a: Area }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold">{folioTemprano(a)}</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", ESTADO.confirmado.clase)}>Entregada · 07:00</span>
      </div>
      <Recorrido pasos={pasosTemprano(a)} />
      <div className="space-y-2 border-t border-border pt-3">
        {a.entregaTemprano.lineas.map(([sku, n]) => {
          const i = insumoDe(sku);
          return (
            <div key={sku} className="flex items-center gap-3">
              <ImagenProducto codigo={sku} nombre={i.nombre} tamano="sm" />
              <span>
                <span className="block font-semibold leading-tight">{i.nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {cantidadCon(i.unidad, n)} de {cantidadCon(i.unidad, n)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Nueva solicitud ─────────────────────────────────────────────

type LineaCarrito = Borrador["lineas"][number];

const PASOS = ["Datos de la solicitud", "Productos", "Revisar y enviar"];

function NuevaSolicitud({ a, borrador, onSalir, onEnviada }: { a: Area; borrador?: Borrador; onSalir: () => void; onEnviada: (ids: string[], solicitudes: string[]) => void }) {
  const [paso, setPaso] = useState(0);
  const [recibe, setRecibe] = useState(borrador?.recibe ?? a.recibe);
  const [entrega, setEntrega] = useState<Entrega>(borrador?.entrega ?? "ventana");
  const [nota, setNota] = useState(borrador?.nota ?? "");
  const [motivoUrgencia, setMotivoUrgencia] = useState(borrador?.motivoUrgencia ?? "");
  const [lineas, setLineas] = useState<LineaCarrito[]>(
    () => borrador?.lineas ?? a.sugerido.map((l) => ({ sku: l.sku, cantidad: l.cantidad, antes: false, razon: l.razon, visto: l.visto, vistoDado: !l.visto })),
  );
  const [sinCodigo, setSinCodigo] = useState<SinCodigo[]>(borrador?.sinCodigo ?? []);

  const total = lineas.length + sinCodigo.length;
  const faltanVistos = lineas.filter((l) => !l.vistoDado).length;
  const hayUrgente = entrega === "urgente" || lineas.some((l) => l.antes);
  const cambiar = (sku: string, cambio: Partial<LineaCarrito>) => setLineas((ls) => ls.map((l) => (l.sku === sku ? { ...l, ...cambio } : l)));
  const guardar = () => {
    guardarBorrador(a, { lineas, sinCodigo, recibe, entrega, nota, motivoUrgencia, desdePlan: borrador?.desdePlan });
    toast.success("Borrador guardado", { description: "Lo retomas desde Mis pedidos." });
    onSalir();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onSalir} className={SECUNDARIO}>
          <ArrowLeft size={16} aria-hidden /> Mis pedidos
        </button>
        <h1 className="font-display text-2xl font-extrabold">{borrador?.desdePlan ? "Solicitud desde la planeación" : "Nueva solicitud"} · {a.nombre}</h1>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={guardar} disabled={total === 0} className={SECUNDARIO}>
            Guardar borrador
          </button>
        </div>
      </div>

      {borrador?.desdePlan && (
        <p className="rounded-2xl border border-primary/40 bg-primary-soft/60 px-4 py-3 text-sm">
          La planeación de la semana calculó estas cantidades con tu plan, tus existencias y lo que ya viene en camino. Revísalas, ajusta lo que haga falta y envíala: <b>no se envía sola</b>.
        </p>
      )}
      <ol className="grid grid-cols-3 gap-2" aria-label="Pasos de la solicitud">
        {PASOS.map((p, n) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => n < paso && setPaso(n)}
              aria-current={paso === n ? "step" : undefined}
              className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold", paso === n ? "border-primary bg-primary-soft text-primary" : n < paso ? "border-border bg-card" : "border-border bg-card text-muted-foreground")}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs", n < paso ? "bg-exito text-white" : paso === n ? "bg-primary text-primary-foreground" : "bg-muted")}>{n < paso ? <Check size={14} aria-hidden /> : n + 1}</span>
              {p}
            </button>
          </li>
        ))}
      </ol>

      {paso === 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel titulo="¿A dónde lo pides?" subtitulo="El almacén que surte la solicitud">
            <div className="grid gap-2 sm:grid-cols-2">
              {ORIGENES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={!o.disponible}
                  aria-pressed={o.disponible}
                  className={cn("rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50", o.disponible ? "border-primary bg-primary-soft" : "border-border")}
                >
                  <span className="block font-semibold">{o.nombre}</span>
                  <span className="block text-xs text-muted-foreground">{o.detalle}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel titulo="¿Cuándo lo necesitas?">
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={entrega === "ventana"} onClick={() => setEntrega("ventana")} className={cn("rounded-xl border p-3 text-left", entrega === "ventana" ? "border-primary bg-primary-soft" : "border-border")}>
                <span className="block font-semibold">Ventana de las {VENTANA.sale}</span>
                <span className="block text-xs text-muted-foreground">
                  Cierra {VENTANA.cierra} · llega {VENTANA.llega}
                </span>
              </button>
              <button type="button" aria-pressed={entrega === "urgente"} onClick={() => setEntrega("urgente")} className={cn("rounded-xl border p-3 text-left", entrega === "urgente" ? "border-critico bg-critico/10" : "border-border")}>
                <span className="block font-semibold">Urgente · sale ahora</span>
                <span className="block text-xs text-muted-foreground">Requiere aprobación de {APROBADOR_URGENTE.nombre}</span>
              </button>
            </div>
            {entrega === "urgente" && <MotivoUrgencia valor={motivoUrgencia} onCambio={setMotivoUrgencia} />}
          </Panel>
          <Panel titulo="¿Quién lo recibe?" subtitulo="Confirma la entrega con el PDA. No puede ser quien surte.">
            <div className="flex flex-wrap gap-2">
              {[a.recibe, a.companero].map((p) => (
                <Chip key={p} activo={recibe === p} onClick={() => setRecibe(p)}>
                  {p}
                </Chip>
              ))}
            </div>
          </Panel>
          <Panel titulo="Nota para el almacén" subtitulo="Opcional">
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder="Por ejemplo: dejar la crema en la cámara del área" aria-label="Nota para el almacén" className="w-full rounded-xl border border-input bg-background p-3 text-sm" />
          </Panel>
          <div className="flex justify-end lg:col-span-2">
            <button type="button" onClick={() => setPaso(1)} className={PRINCIPAL}>
              Siguiente: elegir productos
            </button>
          </div>
        </div>
      )}

      {paso === 1 && (
        <Productos
          a={a}
          lineas={lineas}
          setLineas={setLineas}
          cambiar={cambiar}
          sinCodigo={sinCodigo}
          setSinCodigo={setSinCodigo}
          onSiguiente={() => setPaso(2)}
          onAtras={() => setPaso(0)}
        />
      )}

      {paso === 2 && (
        <div className="grid gap-5 lg:grid-cols-12">
          <Panel titulo="Productos de la solicitud" subtitulo={cuenta(total, "artículo")} className="lg:col-span-8">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Producto</th>
                    <th className="pb-2 text-right font-medium">Cantidad</th>
                    <th className="pb-2 pl-4 font-medium">Se surte en</th>
                    <th className="pb-2 font-medium">Disponibilidad</th>
                    <th className="pb-2 font-medium">Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => {
                    const i = insumoDe(l.sku);
                    return (
                      <tr key={l.sku} className="border-t border-border align-middle">
                        <td className="py-2.5">
                          <span className="flex items-center gap-2">
                            <ImagenProducto codigo={i.sku} nombre={i.nombre} tamano="sm" />
                            <span>
                              <span className="block font-semibold">{i.nombre}</span>
                              <span className="font-mono text-xs text-muted-foreground">{i.sku}</span>
                              {l.razon && <span className="block max-w-[28rem] text-xs text-muted-foreground">{l.razon}</span>}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums">
                          {l.unidad === "empaque" ? (
                            <>
                              {enBultos(i, enUnidad(i, l.cantidad, "empaque"))}
                              <span className="block text-xs text-muted-foreground">{cantidadCon(i.unidad, l.cantidad)}</span>
                            </>
                          ) : (
                            cantidadCon(i.unidad, l.cantidad)
                          )}
                        </td>
                        <td className="py-2.5 pl-4 font-mono text-xs">
                          {bultosPara(i, l.cantidad)} × {i.manejo.etiqueta}
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">{disponibilidad(i)}</td>
                        <td className="py-2.5">
                          {!l.vistoDado ? (
                            <button type="button" onClick={() => cambiar(l.sku, { vistoDado: true })} className="rounded-lg bg-alerta/10 px-2 py-1 text-xs font-semibold text-alerta">
                              ● {l.visto} · dar visto
                            </button>
                          ) : entrega === "urgente" || l.antes ? (
                            <span className="text-xs font-semibold text-critico">Sale ahora (urgente)</span>
                          ) : (
                            <span className="text-xs font-semibold text-exito">✓ {l.visto ? "Visto" : "Lo de siempre"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {sinCodigo.map((s, n) => (
                    <tr key={`${s.texto}-${n}`} className="border-t border-border">
                      <td className="py-2.5 font-semibold">{s.texto}</td>
                      <td className="py-2.5 text-right font-mono">
                        {s.cantidad} {s.unidad}
                      </td>
                      <td className="py-2.5 pl-4 text-xs text-muted-foreground" colSpan={3}>
                        Sin código: no entra al surtido, lo revisa Compras
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel titulo="Datos de la solicitud" className="lg:col-span-4">
            <dl className="space-y-2 text-sm">
              {[
                ["Área", a.nombre],
                ["Pide", a.pide],
                ["A", ORIGENES[0].nombre],
                ["Entrega", entrega === "urgente" ? "Urgente · sale ahora" : `Ventana ${VENTANA.sale} · llega ${VENTANA.llega}`],
                ...(hayUrgente ? [["Aprueba la urgencia", APROBADOR_URGENTE.nombre]] : []),
                ["Recibe", recibe],
                ["Nota", nota || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {hayUrgente && (
              <div className="mt-4 rounded-xl border border-alerta/50 bg-alerta/10 p-3 text-sm">
                <p>
                  {entrega === "urgente" ? "La solicitud es urgente" : `${cuenta(lineas.filter((l) => l.antes).length, "línea marcada", "líneas marcadas")} "lo necesito antes" salen aparte como urgencia`}: no entra a la cola del surtidor hasta que {APROBADOR_URGENTE.nombre} la apruebe.
                </p>
                <MotivoUrgencia valor={motivoUrgencia} onCambio={setMotivoUrgencia} />
              </div>
            )}
            {faltanVistos > 0 && <p className="mt-4 rounded-xl bg-alerta/10 px-3 py-2 text-sm text-alerta">{cuenta(faltanVistos, "línea necesita tu visto", "líneas necesitan tu visto")} antes de enviar.</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={faltanVistos > 0 || total === 0 || (hayUrgente && !motivoUrgencia)}
                onClick={() => {
                  const r = enviarPedido(a, lineas, sinCodigo, { recibe, entrega, origen: ORIGENES[0].nombre, nota, desdePlan: borrador?.desdePlan, motivoUrgencia: hayUrgente ? motivoUrgencia : undefined });
                  descartarBorrador(a);
                  toast.success(`Solicitud enviada a ${ORIGENES[0].nombre}`, {
                    description: hayUrgente
                      ? `Lo urgente espera la aprobación de ${APROBADOR_URGENTE.nombre}${r.pedidos.length > 1 ? "; lo demás ya está en la cola del surtidor" : ""}.`
                      : "Ya está en la cola del surtidor.",
                  });
                  onEnviada(
                    r.pedidos.map((p) => p.id),
                    r.solicitudes.map((i) => i.id),
                  );
                }}
                className={PRINCIPAL}
              >
                Enviar solicitud · {cuenta(total, "artículo")}
              </button>
              <button type="button" onClick={() => setPaso(1)} className={SECUNDARIO}>
                Atrás: productos
              </button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function MotivoUrgencia({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-sm font-semibold">
        ¿Por qué es urgente? <span className="font-normal text-muted-foreground">(obligatorio)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {MOTIVOS_URGENCIA.map((m) => (
          <Chip key={m} activo={valor === m} onClick={() => onCambio(m)}>
            {m}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Productos({
  a,
  lineas,
  setLineas,
  cambiar,
  sinCodigo,
  setSinCodigo,
  onSiguiente,
  onAtras,
}: {
  a: Area;
  lineas: LineaCarrito[];
  setLineas: (f: (ls: LineaCarrito[]) => LineaCarrito[]) => void;
  cambiar: (sku: string, cambio: Partial<LineaCarrito>) => void;
  sinCodigo: SinCodigo[];
  setSinCodigo: (f: (s: SinCodigo[]) => SinCodigo[]) => void;
  onSiguiente: () => void;
  onAtras: () => void;
}) {
  const [categoria, setCategoria] = useState("Sugeridos para ti");
  const [busqueda, setBusqueda] = useState("");
  const [pidiendoSinCodigo, setPidiendoSinCodigo] = useState(false);
  const enCarrito = new Map(lineas.map((l) => [l.sku, l]));
  const todos = [...new Set(CATEGORIAS.flatMap((c) => c.skus))];
  const texto = busqueda.trim().toLowerCase();
  const catalogo = texto
    ? todos.filter((sku) => sku.toLowerCase().includes(texto) || insumoDe(sku).nombre.toLowerCase().includes(texto))
    : categoria === "Sugeridos para ti"
      ? a.sugerido.map((s) => s.sku)
      : categoria === "Todo"
        ? todos
        : (CATEGORIAS.find((c) => c.nombre === categoria)?.skus ?? []);
  const razon = (sku: string) => a.sugerido.find((s) => s.sku === sku)?.razon;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Panel titulo="Catálogo" subtitulo={`Lo que surte ${ORIGENES[0].nombre}`}>
        <label className="flex items-center gap-2 rounded-xl border border-input bg-background px-3">
          <Search size={18} className="text-muted-foreground" aria-hidden />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busca por nombre o código" aria-label="Buscar en el catálogo" className="h-11 w-full bg-transparent outline-none" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Sugeridos para ti", ...CATEGORIAS.map((c) => c.nombre), "Todo"].map((c) => (
            <Chip
              key={c}
              activo={!texto && categoria === c}
              onClick={() => {
                setCategoria(c);
                setBusqueda("");
              }}
            >
              {c}
            </Chip>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalogo.map((sku) => {
            const i = insumoDe(sku);
            const l = enCarrito.get(sku);
            return (
              <article key={sku} className={cn("flex flex-col gap-2 rounded-xl border p-3", l ? "border-primary/50 bg-primary-soft/40" : "border-border")}>
                <div className="flex items-start gap-3">
                  <ImagenProducto codigo={sku} nombre={i.nombre} tamano="md" />
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{i.nombre}</p>
                    <p className="font-mono text-xs text-muted-foreground">{sku}</p>
                    <p className="text-xs text-muted-foreground">{i.manejo.etiqueta}</p>
                  </div>
                </div>
                {razon(sku) && <p className="text-xs text-muted-foreground">{razon(sku)}</p>}
                <p className="text-xs text-exito">{disponibilidad(i)}</p>
                <div className="mt-auto">
                  {l ? (
                    <Cantidad i={i} valor={l.cantidad} unidad={l.unidad} onCambio={(cantidad, unidad) => cambiar(sku, { cantidad, unidad })} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => [...ls, { sku, cantidad: a.sugerido.find((s) => s.sku === sku)?.cantidad ?? pasoDe(i), antes: false, vistoDado: true, razon: "agregado por ti" }])}
                      className={cn(SECUNDARIO, "w-full")}
                    >
                      <Plus size={16} aria-hidden /> Agregar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {catalogo.length === 0 && <p className="text-sm text-muted-foreground">No hay coincidencias. Puedes pedirlo sin código desde tu solicitud.</p>}
        </div>
      </Panel>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <Panel titulo="Tu solicitud" subtitulo={cuenta(lineas.length + sinCodigo.length, "artículo")}>
          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {lineas.map((l) => {
              const i = insumoDe(l.sku);
              return (
                <div key={l.sku} className={cn("rounded-xl border p-2.5", !l.vistoDado ? "border-alerta/60" : "border-border")}>
                  <div className="flex items-center gap-2">
                    <ImagenProducto codigo={i.sku} nombre={i.nombre} tamano="sm" />
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-tight">{i.nombre}</span>
                    <button type="button" aria-label={`Quitar ${i.nombre}`} onClick={() => setLineas((ls) => ls.filter((x) => x.sku !== l.sku))} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                      <X size={16} aria-hidden />
                    </button>
                  </div>
                  {l.razon && <p className="mt-1 text-xs text-muted-foreground">{l.razon}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <Cantidad i={i} valor={l.cantidad} unidad={l.unidad} onCambio={(cantidad, unidad) => cambiar(l.sku, { cantidad, unidad })} />
                    <button type="button" aria-pressed={l.antes} onClick={() => cambiar(l.sku, { antes: !l.antes })} className={cn("min-h-8 rounded-full border px-2.5 text-xs font-semibold", l.antes ? "border-critico bg-critico/10 text-critico" : "border-border text-muted-foreground")}>
                      {l.antes ? "Sale ahora" : "Lo necesito antes"}
                    </button>
                  </div>
                  {!l.vistoDado && (
                    <button type="button" onClick={() => cambiar(l.sku, { vistoDado: true })} className="mt-2 w-full rounded-lg bg-alerta/10 px-2 py-1.5 text-left text-xs font-semibold text-alerta">
                      ● {l.visto} · toca para dar el visto
                    </button>
                  )}
                </div>
              );
            })}
            {sinCodigo.map((s, n) => (
              <div key={`${s.texto}-${n}`} className="flex items-center gap-2 rounded-xl border border-dashed border-border p-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.texto}</span>
                  <span className="text-xs text-muted-foreground">
                    Sin código · {s.cantidad} {s.unidad} · lo revisa Compras
                  </span>
                </span>
                <button type="button" aria-label={`Quitar ${s.texto}`} onClick={() => setSinCodigo((x) => x.filter((_, k) => k !== n))} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X size={16} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3">
            {pidiendoSinCodigo ? (
              <PedirSinCodigo
                onAgregar={(s) => {
                  setSinCodigo((x) => [...x, s]);
                  setPidiendoSinCodigo(false);
                }}
                onCancelar={() => setPidiendoSinCodigo(false)}
              />
            ) : (
              <button type="button" onClick={() => setPidiendoSinCodigo(true)} className="min-h-9 text-sm font-semibold text-primary underline underline-offset-4">
                ¿No está en el catálogo? Pedir sin código
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={onAtras} className={SECUNDARIO}>
              Atrás
            </button>
            <button type="button" disabled={lineas.length + sinCodigo.length === 0} onClick={onSiguiente} className={PRINCIPAL}>
              Revisar
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── Hoja de solicitud ───────────────────────────────────────────

function Hoja({
  ids,
  enviada,
  estados,
  incidencias,
  onVolver,
}: {
  ids: string[];
  enviada?: { solicitudes: string[] };
  estados: Record<string, EstadoTrabajo>;
  incidencias: Incidencia[];
  onVolver: () => void;
}) {
  const { imprimir, copia } = useImprimir();
  const docs = ids.map((id) => documentoSurtido(trabajoDe(id), estados, incidencias));
  return (
    <div className="space-y-5">
      {copia}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className={SECUNDARIO}>
          <ArrowLeft size={16} aria-hidden /> Mis pedidos
        </button>
        <h1 className="font-display text-2xl font-extrabold">Hoja de solicitud</h1>
      </div>
      {enviada && (
        <div className="rounded-2xl border border-exito/40 bg-exito/10 p-4 text-sm">
          <p className="font-semibold text-exito">Solicitud enviada. Ya está en la cola del surtidor.</p>
          {docs.length > 1 && <p className="mt-1">Lo marcado "lo necesito antes" salió aparte como urgente: {docs.length} hojas.</p>}
          {enviada.solicitudes.length > 0 && (
            <p className="mt-1">
              {cuenta(enviada.solicitudes.length, "artículo sin código", "artículos sin código")} {enviada.solicitudes.length === 1 ? "quedó" : "quedaron"} con Compras ({enviada.solicitudes.join(", ")}).
            </p>
          )}
        </div>
      )}
      {docs.map((d) => (
        <div key={d.folio} className="space-y-2">
          <div className="mx-auto flex w-full max-w-[900px] justify-end">
            <BotonImprimir onClick={() => imprimir(d)} />
          </div>
          <DocumentoOrden doc={d} />
        </div>
      ))}
    </div>
  );
}
