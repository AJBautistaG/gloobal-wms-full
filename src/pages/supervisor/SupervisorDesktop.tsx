import { FechaHoy } from "@/lib/fecha";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSesion } from "@/lib/sesion";
import { CircleAlert, CircleCheck, Clock, FileText, LogOut, Moon, Smartphone, Sun, TriangleAlert } from "lucide-react";
import { EstadoChip, useAvisosEnVivo } from "@/components/incidencias/Avisos";
import { usePda } from "@/context/PdaContext";
import { DECISOR, SEMAFORO, SUPERVISOR, esPendiente, incidenciasStore, procesoDe, type Incidencia } from "@/data/incidencias";
import { TIPO_TEXTO, antiguedad, porUrgencia, useMetricas, type Metricas } from "@/data/metricas";
import { umbralesStore } from "@/data/posiciones";
import { JEFE_ALMACEN } from "@/data/surtido";
import { adelantarTransito, useVigilanciaTransito } from "@/data/vigilancia";
import { cn, cuenta } from "@/lib/utils";
import { VisorOrdenesEscritorio } from "./Ordenes";
import { CampanaSupervisor, DetalleIncidencia, TareasInventario, quienDecide } from "./Piezas";

// ── Piezas del tablero ───────────────────────────────────────────

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

/** Mosaico de indicador: etiqueta, valor y contexto. */
function Indicador({ etiqueta, valor, contexto, tono }: { etiqueta: string; valor: ReactNode; contexto?: ReactNode; tono?: "alerta" | "critico" }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 font-sans text-3xl font-semibold">{valor}</p>
      {contexto && (
        <p className={cn("text-xs", tono === "critico" ? "font-semibold text-critico" : tono === "alerta" ? "font-semibold text-alerta" : "text-muted-foreground")}>
          {contexto}
        </p>
      )}
    </div>
  );
}

const NIVEL = {
  ok: { texto: "En tiempo", icono: CircleCheck, relleno: "bg-exito", pista: "bg-exito/15", tinta: "text-exito" },
  alerta: { texto: "En alerta", icono: CircleAlert, relleno: "bg-alerta", pista: "bg-alerta/15", tinta: "text-alerta" },
  critico: { texto: "Escalado", icono: TriangleAlert, relleno: "bg-critico", pista: "bg-critico/15", tinta: "text-critico" },
};

/** Medidor del tiempo en antesala contra su límite; el estado va con ícono y texto, no solo color. */
function MedidorAntesala({ a }: { a: Metricas["acomodo"]["antesala"][number] }) {
  const n = NIVEL[a.nivel];
  const Icono = n.icono;
  const pct = a.limite ? Math.min(a.minutos / a.limite, 1) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{a.etiqueta}</span>
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", n.tinta)}>
          <Icono size={14} aria-hidden /> {a.bultos ? n.texto : "Sin bultos"}
        </span>
      </div>
      <div className={cn("mt-1.5 h-2 w-full overflow-hidden rounded-full", n.pista)} role="meter" aria-valuemin={0} aria-valuemax={a.limite} aria-valuenow={a.minutos} aria-label={`${a.etiqueta}: ${a.minutos} de ${a.limite} minutos`}>
        <div className={cn("h-full rounded-full", n.relleno)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {a.bultos ? `${a.minutos} min el más antiguo · alerta ${a.alerta} · límite ${a.limite} min · ${cuenta(a.bultos, "bulto")}` : "Nada esperando en antesala"}
      </p>
    </div>
  );
}

/** Barras horizontales de una sola serie, con tooltip al pasar el cursor y vista en tabla. */
function GraficaPorTipo({ datos }: { datos: { texto: string; n: number }[] }) {
  const [enfocada, setEnfocada] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const total = datos.reduce((s, d) => s + d.n, 0);
  const max = Math.max(1, ...datos.map((d) => d.n));
  if (!datos.length) return <p className="py-8 text-center text-sm text-muted-foreground">Sin excepciones abiertas.</p>;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setTabla((t) => !t)} className="text-xs font-semibold text-primary underline underline-offset-4">
          {tabla ? "Ver gráfica" : "Ver como tabla"}
        </button>
      </div>
      {tabla ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Tipo</th>
              <th className="pb-2 text-right font-medium">Abiertas</th>
              <th className="pb-2 text-right font-medium">% del total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {datos.map((d) => (
              <tr key={d.texto} className="border-t border-border">
                <td className="py-1.5">{d.texto}</td>
                <td className="py-1.5 text-right">{d.n}</td>
                <td className="py-1.5 text-right">{Math.round((d.n / total) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="relative space-y-1" onMouseLeave={() => setEnfocada(null)}>
          {datos.map((d, n) => (
            <li
              key={d.texto}
              onMouseEnter={() => setEnfocada(n)}
              onFocus={() => setEnfocada(n)}
              onBlur={() => setEnfocada(null)}
              tabIndex={0}
              aria-label={`${d.texto}: ${d.n} abiertas`}
              className={cn("relative grid grid-cols-[9.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg px-1 py-1.5 outline-none", enfocada === n && "bg-muted")}
            >
              <span className="truncate text-sm">{d.texto}</span>
              <span className="flex items-center gap-2">
                <span className="h-4 rounded-r-[4px] bg-primary" style={{ width: `${(d.n / max) * 100}%`, minWidth: 4 }} />
                <span className="text-sm font-semibold">{d.n}</span>
              </span>
              {enfocada === n && (
                <span role="tooltip" className="pointer-events-none absolute top-full right-2 z-10 mt-1 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
                  <b>{d.texto}</b>: {cuenta(d.n, "abierta")} · {Math.round((d.n / total) * 100)}% del total
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ESTADO_SURTIDO: Record<string, { texto: string; clase: string }> = {
  en_cola: { texto: "En cola", clase: "bg-muted text-muted-foreground" },
  surtiendo: { texto: "Surtiendo", clase: "bg-primary-soft text-primary" },
  pausado: { texto: "En pausa", clase: "bg-alerta/15 text-alerta" },
  transito: { texto: "En tránsito", clase: "bg-frio/15 text-frio" },
  confirmado: { texto: "Confirmado", clase: "bg-exito/15 text-exito" },
  cancelado: { texto: "Cancelado por el área", clase: "bg-muted text-muted-foreground" },
};

function EstadoSurtido({ estado, minutos }: { estado: string; minutos: number | null }) {
  const e = ESTADO_SURTIDO[estado];
  const tarde = minutos !== null && minutos >= 30;
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", tarde ? "bg-critico/15 text-critico" : e.clase)}>
      {e.texto}
      {minutos !== null && ` · ${minutos} min`}
    </span>
  );
}

// ── Bandeja ─────────────────────────────────────────────────────

type Filtro = { proceso: string; semaforo: string; decide: string; estado: string };

function Filtros({ filtro, onCambio }: { filtro: Filtro; onCambio: (f: Filtro) => void }) {
  const grupo = (clave: keyof Filtro, opciones: [string, string][]) => (
    <div className="inline-flex rounded-xl bg-muted p-0.5">
      {opciones.map(([valor, texto]) => (
        <button
          key={valor}
          type="button"
          aria-pressed={filtro[clave] === valor}
          onClick={() => onCambio({ ...filtro, [clave]: valor })}
          className={cn("min-h-8 rounded-lg px-2.5 text-xs font-semibold", filtro[clave] === valor ? "bg-card shadow-sm" : "text-muted-foreground")}
        >
          {texto}
        </button>
      ))}
    </div>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {grupo("estado", [["abiertas", "Abiertas"], ["resueltas", "Resueltas"], ["todas", "Todas"]])}
      {grupo("proceso", [["todos", "Todo proceso"], ["Recibo", "Recibo"], ["Acomodo", "Acomodo"], ["Surtido", "Surtido"]])}
      {grupo("semaforo", [["todos", "Todo semáforo"], ["rojo", "Rojo"], ["amarillo", "Amarillo"]])}
      {grupo("decide", [["todos", "Decide cualquiera"], ["supervisor", "Yo"], ["calidad", "Calidad"], ["compras", "Compras"], ["area", "Área"]])}
    </div>
  );
}

function Bandeja({ lista, seleccion, onElegir, ahora }: { lista: Incidencia[]; seleccion: string | null; onElegir: (id: string) => void; ahora: number }) {
  if (!lista.length) return <p className="py-10 text-center text-sm text-muted-foreground">Nada con estos filtros.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="w-6 pb-2" aria-label="Semáforo" />
            <th className="pb-2 font-medium">Incidencia</th>
            <th className="pb-2 font-medium">Proceso</th>
            <th className="pb-2 font-medium">Documento</th>
            <th className="pb-2 font-medium">Decide</th>
            <th className="pb-2 text-right font-medium">Antigüedad</th>
            <th className="pb-2 pl-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((i) => (
            <tr
              key={i.id}
              onClick={() => onElegir(i.id)}
              className={cn("cursor-pointer border-t border-border hover:bg-muted/60", seleccion === i.id && "bg-primary-soft/70 hover:bg-primary-soft/70")}
            >
              <td className="py-2.5">
                <span className={cn("block size-2.5 rounded-full", SEMAFORO[i.semaforo].punto)} aria-label={`Semáforo ${i.semaforo}`} />
              </td>
              <td className="py-2.5 pr-3">
                <button type="button" onClick={() => onElegir(i.id)} className="text-left">
                  <span className="block font-semibold">{i.titulo}</span>
                  <span className="block text-xs text-muted-foreground">
                    {i.id} · {TIPO_TEXTO[i.tipo]}
                    {i.atiende && ` · ${i.atiende} en piso`}
                  </span>
                </button>
              </td>
              <td className="py-2.5">{procesoDe(i)}</td>
              <td className="py-2.5 font-mono text-xs">{i.oc}</td>
              <td className="py-2.5">{quienDecide(i) === "supervisor" ? "Yo" : DECISOR[i.decisor]}</td>
              <td className="py-2.5 text-right tabular-nums">{antiguedad(i, ahora)}</td>
              <td className="py-2.5 pl-3">
                <EstadoChip i={i} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────

/** Torre de control del supervisor: monitoreo en vivo, bandeja de excepciones y trazabilidad. */
export default function SupervisorDesktop() {
  const { oscuro, setOscuro } = usePda();
  const sesion = useSesion();
  const navegar = useNavigate();
  const yo = sesion ?? { nombre: SUPERVISOR.nombre, puesto: SUPERVISOR.rol };
  const incidencias = incidenciasStore.use();
  const umbrales = umbralesStore.use();
  const { metricas: m, ahora } = useMetricas();
  const [filtro, setFiltro] = useState<Filtro>({ proceso: "todos", semaforo: "todos", decide: "todos", estado: "abiertas" });
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [verOrdenes, setVerOrdenes] = useState(false);
  const cerrarOrdenes = useCallback(() => setVerOrdenes(false), []);
  useAvisosEnVivo(["supervisor"]);
  useVigilanciaTransito();

  useEffect(() => {
    document.title = "Torre de control · Momi WMS";
    return () => {
      document.title = "Momi PDA";
    };
  }, []);

  const lista = useMemo(
    () =>
      incidencias
        .filter((i) => (filtro.estado === "abiertas" ? esPendiente(i) : filtro.estado === "resueltas" ? !esPendiente(i) : true))
        .filter((i) => filtro.proceso === "todos" || procesoDe(i) === filtro.proceso)
        .filter((i) => filtro.semaforo === "todos" || i.semaforo === filtro.semaforo)
        .filter((i) => filtro.decide === "todos" || quienDecide(i) === filtro.decide)
        .sort(filtro.estado === "abiertas" ? porUrgencia : (a, b) => b.creada - a.creada),
    [incidencias, filtro],
  );
  const elegida = incidencias.find((i) => i.id === (seleccion ?? lista[0]?.id));

  const actividad = incidencias
    .flatMap((i) => (i.eventos ?? []).map((e) => ({ ...e, id: i.id, titulo: i.titulo })))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 14);

  const hora = new Date(ahora).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="min-h-screen bg-muted">
      {verOrdenes && <VisorOrdenesEscritorio onCerrar={cerrarOrdenes} />}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary font-display text-lg font-extrabold text-primary-foreground">M</span>
            <div>
              <p className="font-display text-lg leading-tight font-extrabold">Torre de control</p>
              <p className="text-xs text-muted-foreground">Momi WMS · Almacén Central · <FechaHoy /> · {hora}</p>
            </div>
          </div>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">Maqueta con datos de ejemplo</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVerOrdenes(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"
            >
              <FileText size={16} aria-hidden /> Órdenes
            </button>
            <Link to="/pda" target="_blank" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold">
              <Smartphone size={16} aria-hidden /> Abrir el PDA
            </Link>
            <button
              type="button"
              onClick={() => setOscuro(!oscuro)}
              aria-label={oscuro ? "Modo claro" : "Modo oscuro"}
              className="grid size-11 place-items-center rounded-full border border-border bg-card"
            >
              {oscuro ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>
            <CampanaSupervisor
              variante="menu"
              onAbrir={(id) => {
                setFiltro({ proceso: "todos", semaforo: "todos", decide: "todos", estado: "todas" });
                setSeleccion(id);
                document.getElementById("bandeja")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
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
      </header>

      <main className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-12">
        {/* Excepciones: la cifra con la que abre el tablero */}
        <Panel titulo="Excepciones abiertas" subtitulo="Recibo y Acomodo, en vivo" className="lg:col-span-4">
          <p className="font-sans text-6xl font-semibold">{m.excepciones.abiertas}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-critico/15 px-2.5 py-1 text-critico">
              <span className="size-2 rounded-full bg-critico" aria-hidden /> {m.excepciones.rojas} en rojo
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-alerta/15 px-2.5 py-1 text-alerta">
              <span className="size-2 rounded-full bg-alerta" aria-hidden /> {m.excepciones.amarillas} en amarillo
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <Indicador
              etiqueta="La más antigua"
              valor={m.excepciones.masAntigua ? `${m.excepciones.masAntigua.minutos} min` : "—"}
              contexto={m.excepciones.masAntigua ? `${m.excepciones.masAntigua.id} · ${m.excepciones.masAntigua.titulo}` : "Nada abierto"}
              tono={m.excepciones.masAntigua && m.excepciones.masAntigua.minutos >= 30 ? "alerta" : undefined}
            />
            <Indicador
              etiqueta="Tiempo promedio de resolución"
              valor={m.excepciones.promedioResolucion !== null ? `${m.excepciones.promedioResolucion} min` : "—"}
              contexto={`${cuenta(m.excepciones.resueltas, "resuelta")} hoy`}
            />
          </div>
        </Panel>

        <Panel titulo="Recibo" subtitulo="Andenes y órdenes de compra" className="lg:col-span-4">
          <div className="grid grid-cols-2 gap-4">
            <Indicador etiqueta="En andén ahora" valor={m.recibo.enCurso.length} contexto={m.recibo.enCurso.length ? m.recibo.enCurso.map((r) => `${r.oc} (${r.anden})`).join(" · ") : "Andenes libres"} />
            <Indicador etiqueta="Recepciones cerradas" valor={m.recibo.cerradas} contexto={m.recibo.canceladas ? `${cuenta(m.recibo.canceladas, "cancelada")}` : "hoy"} />
            <Indicador etiqueta="OC con saldo" valor={m.recibo.ocConSaldo} contexto="Esperando decisión de Compras" tono={m.recibo.ocConSaldo ? "alerta" : undefined} />
            <Indicador etiqueta="Bultos en resguardo" valor={m.recibo.enResguardo} contexto="Sin disponibilidad" />
          </div>
        </Panel>

        <Panel titulo="Acomodo" subtitulo="Antesalas y posiciones" className="lg:col-span-4">
          <div className="grid grid-cols-3 gap-4">
            <Indicador etiqueta="Por acomodar" valor={m.acomodo.porAcomodar} />
            <Indicador etiqueta="Apartados" valor={m.acomodo.apartados} contexto="Esperan decisión" />
            <Indicador etiqueta="Posiciones bloqueadas" valor={m.acomodo.bloqueadas} contexto="Hasta contarlas" />
          </div>
          <div className="mt-5 space-y-4">
            {m.acomodo.antesala.map((a) => (
              <MedidorAntesala key={a.familia} a={a} />
            ))}
          </div>
        </Panel>

        <Panel titulo="Surtido" subtitulo="Pedidos de áreas y rutas, por hora de salida" className="lg:col-span-12">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Indicador etiqueta="En cola" valor={m.surtido.enCola} contexto={m.surtido.urgentes ? `${m.surtido.urgentes} urgente` : "Sin urgencias"} tono={m.surtido.urgentes ? "alerta" : undefined} />
            <Indicador etiqueta="Surtiendo" valor={m.surtido.surtiendo} />
            <Indicador
              etiqueta="En tránsito sin confirmar"
              valor={m.surtido.enTransito.length}
              contexto={m.surtido.enTransito.length ? `el más antiguo: ${Math.max(...m.surtido.enTransito.map((x) => x.minutos))} min` : "Nada en camino"}
              tono={m.surtido.enTransito.some((x) => x.minutos >= 60) ? "critico" : m.surtido.enTransito.some((x) => x.minutos >= 30) ? "alerta" : undefined}
            />
            <Indicador etiqueta="Confirmados por el área" valor={m.surtido.confirmados} />
            <Indicador etiqueta="Líneas con diferencia" valor={m.surtido.lineasConDiferencia} contexto="Parcial, sustituto o pendiente" />
            <Indicador etiqueta="Escala sin confirmar" valor="30 · 60 min" contexto={`${SUPERVISOR.nombre} · ${JEFE_ALMACEN}`} />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Pedido</th>
                  <th className="pb-2 font-medium">Sale</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Líneas</th>
                  <th className="pb-2 font-medium">Área</th>
                  <th className="pb-2 text-right font-medium">Demo</th>
                </tr>
              </thead>
              <tbody>
                {m.surtido.trabajos.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2.5 font-semibold">
                      {t.nombre}
                      {t.urgente && <span className="ml-2 rounded-full bg-alerta/15 px-2 py-0.5 text-xs text-alerta">urgente</span>}
                    </td>
                    <td className="py-2.5 font-mono">{t.sale}</td>
                    <td className="py-2.5">
                      <EstadoSurtido estado={t.estado} minutos={t.minutosTransito} />
                    </td>
                    <td className="py-2.5 tabular-nums">{t.avance}</td>
                    <td className="py-2.5 text-xs text-muted-foreground">{t.area}</td>
                    <td className="py-2.5 text-right">
                      {t.estado === "transito" && (
                        <button type="button" onClick={() => adelantarTransito(t.id, 31)} className="text-xs font-semibold text-muted-foreground underline" title="Adelanta el reloj para ver el escalamiento">
                          +31 min
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel titulo="Excepciones abiertas por tipo" subtitulo="Dónde se concentran los problemas" className="lg:col-span-5">
          <GraficaPorTipo datos={m.excepciones.porTipo} />
        </Panel>

        <Panel titulo="¿Quién tiene que decidir?" subtitulo="Abiertas por responsable" className="lg:col-span-3">
          <div className="grid grid-cols-2 gap-4">
            <Indicador etiqueta="Yo (supervisor)" valor={m.excepciones.supervisor} tono={m.excepciones.supervisor ? "alerta" : undefined} contexto={m.excepciones.supervisor ? "Revisa la bandeja" : "Al día"} />
            <Indicador etiqueta="Calidad" valor={m.excepciones.calidad} contexto="Seguimiento" />
            <Indicador etiqueta="Compras · Área" valor={`${m.excepciones.compras} · ${m.excepciones.area}`} contexto="Seguimiento" />
            <Indicador etiqueta="Recibo · Acomodo · Surtido" valor={`${m.excepciones.recibo} · ${m.excepciones.acomodo} · ${m.excepciones.surtido}`} />
          </div>
        </Panel>

        <Panel titulo="Conteos de revisión" subtitulo={`${m.inventario.revisiones} pendientes · ${m.inventario.sinAsignar} sin asignar`} className="lg:col-span-4">
          <TareasInventario />
        </Panel>

        {/*
          Bandeja y detalle comparten su propia fila: el detalle acompaña el scroll solo mientras
          se recorre la bandeja y se detiene al terminar la fila, sin tapar lo que sigue.
        */}
        <div id="bandeja" className="grid scroll-mt-24 grid-cols-1 gap-5 lg:col-span-12 lg:grid-cols-12">
          <Panel
            titulo="Bandeja de excepciones"
            subtitulo="Rojo primero; dentro de cada color, lo más antiguo"
            className="lg:col-span-7"
            accion={<span className="text-xs text-muted-foreground">{cuenta(lista.length, "incidencia")}</span>}
          >
            <div className="mb-4">
              <Filtros filtro={filtro} onCambio={setFiltro} />
            </div>
            <Bandeja lista={lista} seleccion={elegida?.id ?? null} onElegir={setSeleccion} ahora={ahora} />
          </Panel>

          <div className="lg:col-span-5">
            <Panel titulo="Detalle" className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto">
              {elegida ? (
                <DetalleIncidencia key={elegida.id} i={elegida} ahora={ahora} registrarVista={seleccion === elegida.id} />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Elige una incidencia de la bandeja.</p>
              )}
            </Panel>
          </div>
        </div>

        <Panel titulo="Actividad reciente" subtitulo="Trazabilidad: quién hizo qué y cuándo" className="lg:col-span-7">
          {actividad.length ? (
            <ol className="divide-y divide-border">
              {actividad.map((e, n) => (
                <li key={`${e.id}-${e.ts}-${n}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground tabular-nums">{e.hora}</span>
                  <button type="button" onClick={() => setSeleccion(e.id)} className="min-w-0 text-left">
                    <span className="font-semibold">{e.quien}</span> <span className="text-muted-foreground">({e.rol})</span> · {e.texto}
                    <span className="block text-xs text-muted-foreground">
                      {e.id} · {e.titulo}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay actividad. Registra algo desde el PDA.</p>
          )}
        </Panel>

        <Panel titulo="Configuración" subtitulo="Tiempos máximos en antesala (minutos)" className="lg:col-span-5">
          <div className="grid grid-cols-2 gap-4">
            {(["frio", "seco"] as const).map((f) => (
              <div key={f} className="space-y-2 rounded-xl border border-border p-3">
                <p className="font-semibold">{f === "frio" ? "Refrigerado y congelado" : "Seco"}</p>
                {(["alerta", "escala"] as const).map((k) => (
                  <label key={k} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{k === "alerta" ? "Alerta" : "Escala al supervisor"}</span>
                    <input
                      type="number"
                      min={1}
                      value={umbrales[f][k]}
                      onChange={(e) => {
                        const v = Math.max(1, Number(e.target.value) || 1);
                        umbralesStore.set((u) => ({ ...u, [f]: { ...u[f], [k]: k === "escala" ? Math.max(u[f].alerta + 1, v) : v } }));
                      }}
                      className="h-9 w-20 rounded-lg border border-input bg-background px-2 text-right tabular-nums"
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock size={14} aria-hidden /> El PDA aplica los cambios al instante.
          </p>
        </Panel>

      </main>
    </div>
  );
}
