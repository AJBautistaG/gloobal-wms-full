import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BookOpen,
  Boxes,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  Factory,
  FileText,
  Gauge,
  LineChart,
  LogOut,
  Moon,
  Percent,
  Settings,
  ShieldAlert,
  Sparkles,
  Store,
  Sun,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { usePda } from "@/context/PdaContext";
import { analisisDe, type PanelId } from "@/data/analisisDireccion";
import {
  AREAS_DIR,
  CAMARAS,
  CANALES,
  CAPITAL_ABC,
  COSTO_PROCESO,
  CUMPLIMIENTO_CANAL,
  DIAS_SEMANA,
  DIRECTOR,
  FUGAS,
  MARGEN_MENSUAL,
  MESES,
  META_CUMPLIMIENTO,
  NEGOCIO,
  PERIODOS,
  RETRASO,
  RIESGO_CADUCIDAD,
  VALOR_CAMARA,
  VENTANAS_RETRASO,
  cumpleMeta,
  kpis,
  usd,
  usdCorto,
  useDireccionEnVivo,
  type Alcance,
  type Camara,
  type Compromiso,
  type Escalada,
  type Kpi,
  type Periodo,
} from "@/data/direccion";
import { documentoCompra, documentoSurtido } from "@/data/documentos";
import { incidenciasStore } from "@/data/incidencias";
import { ordenesStore } from "@/data/ordenes";
import { buscarOrden } from "@/data/recepcion";
import { recepcionesStore } from "@/data/recepciones";
import { surtidoStore, trabajosDelDia } from "@/data/surtido";
import { useFechaHoy } from "@/lib/fecha";
import { useSesion } from "@/lib/sesion";
import { cn, cuenta } from "@/lib/utils";
import { TablaSimple } from "../supervisor/Graficas";
import { Dona, GraficaMargen, MapaCalor } from "./GraficasDireccion";

/**
 * Dirección General (módulo de Lovable): la Torre de Control con resultado, capital de trabajo y
 * riesgo. Las demás secciones del menú quedan como "próximamente", igual que en el mock.
 */

const SECCIONES: { grupo: string; items: { ruta: string; nombre: string; icono: typeof Gauge; descripcion: string; badge?: boolean }[] }[] = [
  {
    grupo: "Dirección",
    items: [
      { ruta: "", nombre: "Torre de Control", icono: LineChart, descripcion: "" },
      { ruta: "margen", nombre: "Resultado y margen", icono: CircleDollarSign, descripcion: "Aquí vivirá el desglose del margen perdido por causa, artículo y canal." },
      { ruta: "capital", nombre: "Capital de trabajo", icono: Wallet, descripcion: "Aquí vivirán los días de inventario, la rotación por clase y el capital inmovilizado." },
    ],
  },
  {
    grupo: "Operación",
    items: [
      { ruta: "abasto", nombre: "Abasto y proveedores", icono: Truck, descripcion: "Aquí vivirán el OTIF por proveedor, las citas y el saldo de las órdenes de compra." },
      { ruta: "produccion", nombre: "Producción", icono: Factory, descripcion: "Aquí vivirá el cumplimiento del plan por área y la cobertura de insumos." },
      { ruta: "canales", nombre: "Tiendas y canales", icono: Store, descripcion: "Aquí vivirán el fill rate y el cumplimiento a la hora prometida por canal." },
    ],
  },
  {
    grupo: "Gobierno",
    items: [
      { ruta: "riesgo", nombre: "Riesgo y cumplimiento", icono: ShieldAlert, descripcion: "Aquí vivirán las excepciones de inocuidad, auditoría y control interno.", badge: true },
      { ruta: "reportes", nombre: "Reportes", icono: FileText, descripcion: "Aquí vivirán los reportes para el consejo y los cierres de mes." },
      { ruta: "config", nombre: "Configuración", icono: Settings, descripcion: "Aquí vivirán las metas, umbrales y destinatarios de alertas." },
    ],
  },
];

const ICONO_KPI: Record<string, typeof Gauge> = { margen: CircleDollarSign, fill: Percent, dias: Boxes, otif: Truck, plan: Factory, exactitud: ClipboardCheck };

// ── Piezas ──────────────────────────────────────────────────────

function Panel({ titulo, subtitulo, children, className, accion, onAnalizar }: { titulo: string; subtitulo?: string; children: ReactNode; className?: string; accion?: ReactNode; onAnalizar?: () => void }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-extrabold">{titulo}</h2>
          {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onAnalizar && (
            <button type="button" onClick={onAnalizar} aria-label="Analizar este panel" title="Analizar este panel" className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
              <Sparkles size={15} aria-hidden />
            </button>
          )}
          {accion}
        </div>
      </div>
      {children}
    </section>
  );
}

function Selector<T extends string | number>({ valor, opciones, onCambio, etiqueta }: { valor: T; opciones: { id: T; texto: string }[]; onCambio: (v: T) => void; etiqueta: string }) {
  return (
    <select
      aria-label={etiqueta}
      value={String(valor)}
      onChange={(e) => onCambio(opciones.find((o) => String(o.id) === e.target.value)!.id)}
      className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold"
    >
      {opciones.map((o) => (
        <option key={String(o.id)} value={String(o.id)}>
          {o.texto}
        </option>
      ))}
    </select>
  );
}

function TarjetaKpi({ k }: { k: Kpi }) {
  const Icono = ICONO_KPI[k.id] ?? Gauge;
  const ok = cumpleMeta(k);
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - k.escala[0]) / (k.escala[1] - k.escala[0])) * 100));
  const Flecha = k.cambio.texto.startsWith("−") ? ArrowDown : ArrowUp;
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{k.nombre}</p>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Icono size={16} aria-hidden />
        </span>
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-3xl font-semibold tabular-nums">{k.unidad === "USD" ? usd(k.valor) : k.valor}</span>
        <span className="text-sm text-muted-foreground">{k.unidad}</span>
        <span className={cn("inline-flex items-center text-xs font-semibold", k.cambio.bueno ? "text-exito" : "text-critico")}>
          <Flecha size={12} aria-hidden /> {k.cambio.texto}
        </span>
      </p>
      {/* Barra de avance con la meta marcada; el color dice si se cumple, el texto también. */}
      <div className="relative mt-3 h-1.5 rounded-full bg-muted" role="meter" aria-valuenow={k.valor} aria-label={`${k.nombre}: ${k.valor} ${k.unidad}, ${k.meta.texto}`}>
        <div className={cn("h-full rounded-full", ok ? "bg-exito" : k.meta.mayorEsMejor ? "bg-alerta" : "bg-critico")} style={{ width: `${pct(k.valor)}%` }} />
        <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-foreground" style={{ left: `${pct(k.meta.valor)}%` }} aria-hidden />
      </div>
      <p className={cn("mt-1.5 text-xs", ok ? "text-exito" : "text-muted-foreground")}>
        {k.meta.texto}
        {ok ? " · cumple" : ""}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2.5">
        {k.apoyo.map((a) => (
          <div key={a.texto} className="min-w-0">
            <p className="font-semibold tabular-nums">{a.valor}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">{a.texto}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const TONO_ESTADO: Record<Compromiso["tono"], string> = {
  critico: "bg-critico/15 text-critico",
  alerta: "bg-alerta/15 text-alerta",
  info: "bg-frio/15 text-frio",
  neutro: "bg-muted text-muted-foreground",
};

// ── Panel lateral: Detalle y Análisis ───────────────────────────

interface Lateral {
  titulo: string;
  detalle: ReactNode;
  panel?: PanelId;
  pestana?: "detalle" | "analisis";
}

function PanelLateral({ l, onCerrar, escaladas }: { l: Lateral; onCerrar: () => void; escaladas: Escalada[] }) {
  const [pestana, setPestana] = useState(l.pestana ?? "detalle");
  useEffect(() => setPestana(l.pestana ?? "detalle"), [l]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  const a = l.panel ? analisisDe(l.panel, { escaladas }) : null;
  const ahora = useFechaHoy();
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20" onClick={onCerrar}>
      <aside role="dialog" aria-modal="true" aria-label={l.titulo} onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-[480px] flex-col bg-card shadow-2xl">
        <header className="border-b border-border px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-lg font-extrabold">{l.titulo}</p>
            <button type="button" onClick={onCerrar} aria-label="Cerrar" className="grid size-9 shrink-0 place-items-center rounded-full border border-border">
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="mt-3 flex gap-1" role="tablist">
            {(["detalle", "analisis"] as const).map((p) =>
              p === "analisis" && !a ? null : (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={pestana === p}
                  onClick={() => setPestana(p)}
                  className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-semibold", pestana === p ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
                >
                  {p === "detalle" ? "Detalle" : "Análisis ✦"}
                </button>
              ),
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm">
          {pestana === "detalle" || !a ? (
            l.detalle
          ) : (
            <div className="space-y-5">
              {(
                [
                  ["Qué está pasando", a.pasando],
                  ["Por qué", a.porque],
                  ["Si no haces nada", a.siNo],
                ] as const
              ).map(([t, v]) => (
                <section key={t}>
                  <h3 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t}</h3>
                  <p className="mt-1 leading-relaxed">{v}</p>
                </section>
              ))}
              <section>
                <h3 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Qué hacer</h3>
                <ol className="mt-2 space-y-2.5">
                  {a.acciones.map((x) => (
                    <li key={x.titulo} className="rounded-xl border border-border p-3">
                      <p className="font-semibold">{x.titulo}</p>
                      <p className="text-muted-foreground">{x.detalle}</p>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        {(
                          [
                            ["Decide", x.decide],
                            ["Para", x.para],
                            ["Vale", x.vale],
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="font-semibold">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      {x.enlace &&
                        (x.enlace.ruta ? (
                          <Link to={x.enlace.ruta} target="_blank" className="mt-2 inline-block text-xs font-semibold text-primary underline underline-offset-4">
                            {x.enlace.texto} ›
                          </Link>
                        ) : (
                          <span className="mt-2 inline-block text-xs text-muted-foreground">{x.enlace.texto}</span>
                        ))}
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h3 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Qué no sé</h3>
                <p className="mt-1 leading-relaxed">{a.noSe}</p>
              </section>
              <p className="text-xs text-muted-foreground">Generado el {ahora} · sobre datos de ejemplo</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Torre de Control ────────────────────────────────────────────

function Torre({ periodo, abrir }: { periodo: Periodo; abrir: (l: Lateral) => void }) {
  const vivo = useDireccionEnVivo();
  const lista = kpis(periodo, vivo.exactitud);
  const [camara, setCamara] = useState<Camara>("Todas");
  const [semanas, setSemanas] = useState(4);
  const [alcance, setAlcance] = useState<Alcance>("mes");
  const analizar = (panel: PanelId, titulo: string, detalle: ReactNode) => () => abrir({ titulo, detalle, panel, pestana: "analisis" });

  const riesgo = RIESGO_CADUCIDAD[camara];
  const factorRetraso = VENTANAS_RETRASO.find((v) => v.id === semanas)!.factor;
  const retraso = Object.entries(RETRASO).map(([n, v]) => [n, v.map((x) => Math.round(x * factorRetraso * 10) / 10)] as [string, number[]]);
  const totalRetraso = retraso.reduce((s, [, v]) => s + v.reduce((a, b) => a + b, 0), 0);
  const finSemana = retraso.reduce((s, [, v]) => s + v[4] + v[5], 0);
  const totalCosto = COSTO_PROCESO.reduce((s, c) => s + c.usd, 0);
  const maxCosto = Math.max(...COSTO_PROCESO.map((c) => c.usd));
  const totalValor = VALOR_CAMARA.reduce((s, c) => s + c.mp + c.insumos + c.pt, 0);

  const detalleMargen = (
    <TablaSimple
      columnas={["Mes", "Merma", "Desabasto", "Total"]}
      filas={MARGEN_MENSUAL.merma.map((m, i) => [MESES[i], usd(m), usd(MARGEN_MENSUAL.desabasto[i]), usd(m + MARGEN_MENSUAL.desabasto[i])])}
    />
  );
  const detalleEscalada = (e: Escalada) => (e.filas.length ? <TablaSimple columnas={e.columnas} filas={e.filas} /> : <p className="text-muted-foreground">Nada pendiente en este momento.</p>);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-12 xl:grid-cols-6">
        {lista.map((k) => (
          <TarjetaKpi key={k.id} k={k} />
        ))}
      </div>

      <Panel
        titulo="Margen perdido y proyección a diciembre"
        subtitulo="ene – sep · merma y venta no surtida, USD"
        className="lg:col-span-6"
        onAnalizar={analizar("margen", "Margen perdido", detalleMargen)}
        accion={
          <button type="button" onClick={() => abrir({ titulo: "Margen perdido por mes", detalle: detalleMargen, panel: "margen" })} className="text-xs font-semibold text-primary">
            Ver detalle ›
          </button>
        }
      >
        <GraficaMargen />
      </Panel>

      <Panel titulo="Capital inmovilizado" subtitulo="Por clase ABC · foto de hoy" className="lg:col-span-3" onAnalizar={analizar("capital", "Capital inmovilizado", <TablaSimple columnas={["Clase", "USD", "Rota"]} filas={CAPITAL_ABC.map((c) => [c.clase, usd(c.valor), `${c.rota} d`])} />)}>
        <Dona
          centro={usdCorto(CAPITAL_ABC.reduce((s, c) => s + c.valor, 0))}
          subcentro="USD"
          rebanadas={CAPITAL_ABC.map((c, i) => ({
            texto: c.clase,
            valor: c.valor,
            // Clases ordenadas: una sola tonalidad, de la A (más intensa) a la C.
            clase: ["stroke-primary", "stroke-primary/60", "stroke-primary/30"][i],
            punto: ["bg-primary", "bg-primary/60", "bg-primary/30"][i],
            detalle: `rota ${c.rota} d`,
          }))}
          onElegir={(r) => {
            const c = CAPITAL_ABC.find((x) => x.clase === r.texto)!;
            abrir({ titulo: `${c.clase} · USD ${usd(c.valor)}`, detalle: <p>{c.detalle}. Rota cada {c.rota} días.</p>, panel: "capital" });
          }}
        />
      </Panel>

      <Panel
        titulo="Riesgo de caducidad"
        subtitulo="Por cámara · foto de hoy"
        className="lg:col-span-3"
        onAnalizar={analizar("caducidad", "Riesgo de caducidad", <p>Valor del inventario por ventana de caducidad, {camara === "Todas" ? "todas las cámaras" : `cámara ${camara.toLowerCase()}`}.</p>)}
      >
        <div className="mb-1">
          <Selector etiqueta="Cámara" valor={camara} onCambio={setCamara} opciones={CAMARAS.map((c) => ({ id: c, texto: c === "Todas" ? "Todas las cámaras" : c }))} />
        </div>
        <Dona
          centro={usdCorto(riesgo.critico + riesgo.proximo)}
          subcentro="en riesgo"
          rebanadas={[
            { texto: "Vencido o ≤ 7 días", valor: riesgo.critico, clase: "stroke-critico", punto: "bg-critico" },
            { texto: "8 a 30 días", valor: riesgo.proximo, clase: "stroke-alerta", punto: "bg-alerta" },
            { texto: "Más de 30 días", valor: riesgo.sano, clase: "stroke-exito", punto: "bg-exito" },
          ]}
        />
        <Link to="/supervisor?ver=caducidad" target="_blank" className="mt-3 inline-block text-xs font-semibold text-primary underline underline-offset-4">
          Ver caducidad por lote en el almacén ›
        </Link>
      </Panel>

      <Panel titulo="Costo operativo por proceso" subtitulo="Mano de obra y equipo · USD" className="lg:col-span-5" onAnalizar={analizar("costo", "Costo operativo", <TablaSimple columnas={["Proceso", "USD"]} filas={COSTO_PROCESO.map((c) => [c.proceso, usd(c.usd)])} />)}>
        <ul className="flex h-44 items-end gap-[2px] border-b border-foreground/30" aria-label="Costo por proceso en USD">
          {COSTO_PROCESO.map((c) => {
            const mayor = c.usd === maxCosto;
            return (
              <li key={c.proceso} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                <span className="mb-0.5 text-xs font-semibold tabular-nums">{usd(c.usd)}</span>
                <button
                  type="button"
                  aria-label={`${c.proceso}: USD ${usd(c.usd)}`}
                  onClick={() =>
                    abrir({
                      titulo: `${c.proceso} · costo del periodo`,
                      panel: "costo",
                      detalle: (
                        <div className="space-y-4">
                          <dl className="grid grid-cols-2 gap-3">
                            {(
                              [
                                ["Costo", `USD ${usd(c.usd)}`],
                                ["Horas-persona", usd(c.horas)],
                                ["Personas por turno", String(c.personas)],
                                ["Costo por unidad movida", `USD ${c.porUnidad.toFixed(2)}`],
                              ] as const
                            ).map(([k, v]) => (
                              <div key={k} className="rounded-xl bg-muted p-3">
                                <dt className="text-xs text-muted-foreground">{k}</dt>
                                <dd className="text-lg font-semibold">{v}</dd>
                              </div>
                            ))}
                          </dl>
                          <TablaSimple columnas={["Mes", "USD"]} filas={c.historia.map((h, i) => [MESES[6 + i], usd(h)])} />
                        </div>
                      ),
                    })
                  }
                  className={cn("w-full max-w-16 rounded-t-[4px] hover:opacity-80", mayor ? "bg-critico" : "bg-serie-entrada")}
                  style={{ height: `${(c.usd / maxCosto) * 82}%` }}
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-1.5 flex gap-[2px] text-[11px] text-muted-foreground">
          {COSTO_PROCESO.map((c) => (
            <span key={c.proceso} className={cn("min-w-0 flex-1 truncate text-center", c.usd === maxCosto && "font-semibold text-critico")}>
              {c.proceso}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm">
          Surtido se lleva <b>USD {usd(maxCosto)}</b> de los {usd(totalCosto)} del periodo — {Math.round((maxCosto / totalCosto) * 100)} % del costo, con un solo surtidor por turno.
        </p>
      </Panel>

      <Panel
        titulo="Horas de retraso por área y día"
        subtitulo={`Promedio · ${semanas} semanas`}
        className="lg:col-span-7"
        onAnalizar={analizar("retraso", "Horas de retraso", <TablaSimple columnas={["Área", ...DIAS_SEMANA]} filas={retraso.map(([n, v]) => [n, ...v.map((x) => x.toFixed(1))])} />)}
        accion={<Selector etiqueta="Semanas" valor={semanas} onCambio={setSemanas} opciones={VENTANAS_RETRASO.map((v) => ({ id: v.id, texto: v.texto }))} />}
      >
        <MapaCalor filas={retraso} columnas={DIAS_SEMANA} />
        <p className="mt-2 text-right text-xs font-semibold text-critico">Viernes y sábado concentran el {Math.round((finSemana / totalRetraso) * 100)} % del retraso</p>
      </Panel>

      <Panel
        titulo="Negocio y flujo operativo"
        subtitulo="Compromisos por canal"
        className="lg:col-span-6"
        onAnalizar={analizar("negocio", "Negocio y flujo operativo", <p>Compromisos por canal en el periodo elegido.</p>)}
        accion={
          <div className="inline-flex rounded-xl bg-muted p-0.5">
            {(["hoy", "semana", "mes"] as const).map((x) => (
              <button key={x} type="button" aria-pressed={alcance === x} onClick={() => setAlcance(x)} className={cn("min-h-8 rounded-lg px-2.5 text-xs font-semibold capitalize", alcance === x ? "bg-card shadow-sm" : "text-muted-foreground")}>
                {x}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NEGOCIO.map((n) => (
            <div key={n.nombre} className="min-w-0 border-l border-border pl-2.5">
              <p className="text-xs leading-tight text-muted-foreground">{n.nombre}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{usd(n.valores[alcance])}</p>
              <p className="text-[11px] text-muted-foreground">{alcance === "hoy" ? "hoy" : alcance === "semana" ? "esta semana" : "mes a la fecha"}{n.usd ? " · USD" : ""}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 mb-2 text-sm font-semibold">Cumplimiento a la hora prometida, por canal</p>
        <ul className="space-y-2">
          {CUMPLIMIENTO_CANAL.map((c) => {
            const v = c.valores[alcance];
            const tono = v >= 85 ? "exito" : v >= 70 ? "alerta" : "critico";
            return (
              <li key={c.canal} className="grid grid-cols-[9rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                <span className="truncate">{c.canal}</span>
                <span className="relative h-2 rounded-full bg-muted">
                  <span className={cn("absolute inset-y-0 left-0 rounded-full", tono === "exito" ? "bg-exito" : tono === "alerta" ? "bg-alerta" : "bg-critico")} style={{ width: `${v}%` }} />
                  <span className="absolute -top-1 h-4 w-0.5 rounded bg-foreground" style={{ left: `${META_CUMPLIMIENTO}%` }} title={`Meta ${META_CUMPLIMIENTO} %`} />
                </span>
                <span className={cn("text-right font-semibold tabular-nums", tono === "exito" ? "text-exito" : tono === "alerta" ? "text-alerta" : "text-critico")}>{v} %</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">La marca vertical es la meta de {META_CUMPLIMIENTO} %.</p>
      </Panel>

      <Panel
        titulo="Excepciones que escalan a Dirección"
        subtitulo="Abiertas ahora · inocuidad, surtido y proveedor salen en vivo del almacén"
        className="lg:col-span-6"
        onAnalizar={analizar("excepciones", "Excepciones que escalan", <TablaSimple columnas={["Tipo", "Abiertas"]} filas={vivo.escaladas.map((e) => [`${e.titulo} · ${e.texto}`, e.n])} />)}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {vivo.escaladas.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => abrir({ titulo: `${e.titulo} · ${cuenta(e.n, e.texto.split(" ")[0])} ${e.texto.split(" ").slice(1).join(" ")}`, detalle: detalleEscalada(e), panel: "excepciones" })}
              className={cn("rounded-xl p-3 text-left", e.n === 0 ? "bg-muted" : e.tono === "critico" ? "bg-critico/10" : "bg-alerta/10")}
            >
              <p className={cn("text-2xl font-semibold tabular-nums", e.n === 0 ? "text-muted-foreground" : e.tono === "critico" ? "text-critico" : "text-alerta")}>{e.n}</p>
              <p className="font-semibold">{e.titulo}</p>
              <p className="text-xs text-muted-foreground">{e.texto}</p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel titulo="Valor de inventario por cámara y familia" subtitulo="USD · foto de hoy" className="lg:col-span-4" onAnalizar={analizar("valor", "Valor de inventario", <p>USD {usd(totalValor)} en total.</p>)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm whitespace-nowrap tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Cámara</th>
                <th className="pb-2 pl-2 text-right font-medium">Materia prima</th>
                <th className="pb-2 pl-2 text-right font-medium">Insumos</th>
                <th className="pb-2 pl-2 text-right font-medium">P. terminado</th>
                <th className="pb-2 pl-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {VALOR_CAMARA.map((c) => (
                <tr key={c.camara} className="border-t border-border">
                  <td className="py-1.5 font-semibold">{c.camara}</td>
                  <td className="py-1.5 pl-2 text-right">{c.mp ? usdCorto(c.mp) : "—"}</td>
                  <td className="py-1.5 pl-2 text-right">{usdCorto(c.insumos)}</td>
                  <td className="py-1.5 pl-2 text-right">{c.pt ? usdCorto(c.pt) : "—"}</td>
                  <td className="py-1.5 pl-2 text-right font-semibold">{usdCorto(c.mp + c.insumos + c.pt)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td className="py-1.5">Gran total</td>
                <td className="py-1.5 pl-2 text-right">{usdCorto(VALOR_CAMARA.reduce((s, c) => s + c.mp, 0))}</td>
                <td className="py-1.5 pl-2 text-right">{usdCorto(VALOR_CAMARA.reduce((s, c) => s + c.insumos, 0))}</td>
                <td className="py-1.5 pl-2 text-right">{usdCorto(VALOR_CAMARA.reduce((s, c) => s + c.pt, 0))}</td>
                <td className="py-1.5 pl-2 text-right">{usdCorto(totalValor)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel titulo="Top fugas por valor" subtitulo="Últimos 30 días · USD" className="lg:col-span-4" onAnalizar={analizar("fugas", "Top fugas", <TablaSimple columnas={["Artículo", "Causa", "USD"]} filas={FUGAS.map((f) => [f.articulo, f.causa, usd(f.usd)])} />)}>
        <ul className="divide-y divide-border text-sm">
          {FUGAS.map((f) => (
            <li key={f.codigo} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{f.articulo}</span>
                <span className="font-mono text-xs text-muted-foreground">{f.codigo}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", f.causa === "Caducidad" || f.causa === "Dañado" ? "bg-critico/10 text-critico" : "bg-alerta/15 text-alerta")}>{f.causa}</span>
                <span className="w-12 text-right font-semibold tabular-nums">{usd(f.usd)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel titulo="Actividad en tiempo real" subtitulo="Trazabilidad de la operación" className="lg:col-span-4" accion={<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-exito"><span className="size-2 animate-pulse rounded-full bg-exito" aria-hidden /> En vivo</span>}>
        <ol className="space-y-2.5">
          {vivo.actividad.map((x, n) => (
            <li key={n} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 text-sm">
              <span className="text-xs text-muted-foreground tabular-nums">{x.hora}</span>
              <span className="min-w-0">
                <span className="flex items-start gap-1.5 font-semibold">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", x.tono === "critico" ? "bg-critico" : x.tono === "alerta" ? "bg-alerta" : "bg-frio")} aria-hidden />
                  {x.titulo}
                </span>
                <span className="block truncate pl-3.5 text-xs text-muted-foreground">{x.detalle}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <Compromisos lista={vivo.compromisos} abrir={abrir} />
    </div>
  );
}

// ── Órdenes y compromisos abiertos ──────────────────────────────

type Columna = "folio" | "tipo" | "destino" | "orden" | "estado" | "usd";
const COLUMNAS: { id: Columna; texto: string; derecha?: boolean }[] = [
  { id: "folio", texto: "Folio" },
  { id: "tipo", texto: "Tipo" },
  { id: "destino", texto: "Proveedor o destino" },
  { id: "orden", texto: "Compromiso" },
  { id: "estado", texto: "Estado" },
  { id: "usd", texto: "Valor USD", derecha: true },
];
const POR_PAGINA = 6;

function Compromisos({ lista, abrir }: { lista: Compromiso[]; abrir: (l: Lateral) => void }) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "folio", asc: true });
  const [pagina, setPagina] = useState(0);
  const estados = surtidoStore.use();
  const incidencias = incidenciasStore.use();
  const recepciones = recepcionesStore.use();
  const ordenes = ordenesStore.use();
  const ordenada = useMemo(() => {
    const xs = [...lista].sort((a, b) => {
      const va = a[orden.col];
      const vb = b[orden.col];
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return orden.asc ? c : -c;
    });
    return xs;
  }, [lista, orden]);
  const paginas = Math.max(1, Math.ceil(ordenada.length / POR_PAGINA));
  const visibles = ordenada.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  const exportar = () => {
    const filas = [COLUMNAS.map((c) => c.texto), ...ordenada.map((c) => [c.folio, c.tipo, c.destino, c.compromiso, c.estado, String(c.usd)])];
    const csv = filas.map((f) => f.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "compromisos-abiertos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const abrirFolio = (c: Compromiso) => {
    let historial: { hora: string; texto: string }[] = [];
    if (c.tipo === "Compra") {
      const o = buscarOrden(c.folio);
      if (o) historial = documentoCompra(o, ordenes, recepciones, incidencias).historial;
    } else if (c.tipo === "Surtido") {
      const t = trabajosDelDia().find((x) => x.id === c.folio);
      if (t) historial = documentoSurtido(t, estados, incidencias).historial;
    }
    abrir({
      titulo: c.folio,
      detalle: (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            {(
              [
                ["Tipo", c.tipo],
                ["Proveedor o destino", c.destino],
                ["Compromiso", c.compromiso],
                ["Estado", c.estado],
                ["Valor", `USD ${usd(c.usd)}`],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h3 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Línea de tiempo</h3>
            {historial.length ? (
              <ol className="mt-2 space-y-1.5">
                {historial.map((h, i) => (
                  <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{h.hora}</span>
                    <span>{h.texto}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-muted-foreground">Sin eventos registrados hoy para este folio.</p>
            )}
          </div>
        </div>
      ),
    });
  };

  return (
    <Panel titulo="Órdenes y compromisos abiertos" subtitulo="Todas las áreas y canales · compras y surtido en vivo · ordena por cualquier columna" className="lg:col-span-12" accion={
      <button type="button" onClick={exportar} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold">
        <Download size={15} aria-hidden /> Exportar
      </button>
    }>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              {COLUMNAS.map((c) => (
                <th key={c.id} className={cn("pb-2 font-medium", c.derecha && "text-right")} aria-sort={orden.col === c.id ? (orden.asc ? "ascending" : "descending") : undefined}>
                  <button type="button" onClick={() => setOrden((o) => ({ col: c.id, asc: o.col === c.id ? !o.asc : true }))} className="font-medium uppercase">
                    {c.texto} {orden.col === c.id ? (orden.asc ? "▲" : "▼") : ""}
                  </button>
                </th>
              ))}
              <th className="pb-2 text-right font-medium uppercase">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.folio} className="border-t border-border">
                <td className="py-2.5 font-mono text-xs font-semibold">{c.folio}</td>
                <td className="py-2.5">{c.tipo}</td>
                <td className="py-2.5">{c.destino}</td>
                <td className="py-2.5">{c.compromiso}</td>
                <td className="py-2.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TONO_ESTADO[c.tono])}>{c.estado}</span>
                </td>
                <td className="py-2.5 text-right tabular-nums">{usd(c.usd)}</td>
                <td className="py-2.5 text-right">
                  <button type="button" onClick={() => abrirFolio(c)} className="text-sm font-semibold text-primary">
                    Abrir ›
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm">
        <button type="button" aria-label="Página anterior" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-40">
          <ChevronLeft size={15} aria-hidden />
        </button>
        <span className="tabular-nums">
          {pagina + 1} / {paginas} · {cuenta(ordenada.length, "línea")}
        </span>
        <button type="button" aria-label="Página siguiente" disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)} className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-40">
          <ChevronRight size={15} aria-hidden />
        </button>
      </div>
    </Panel>
  );
}

// ── Página ──────────────────────────────────────────────────────

export default function Direccion() {
  const { seccion = "" } = useParams();
  const { oscuro, setOscuro } = usePda();
  const sesion = useSesion();
  const navegar = useNavigate();
  const yo = sesion ?? { nombre: DIRECTOR.nombre, puesto: DIRECTOR.puesto };
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [area, setArea] = useState(AREAS_DIR[0]);
  const [canal, setCanal] = useState(CANALES[0]);
  const [lateral, setLateral] = useState<Lateral | null>(null);
  const [campana, setCampana] = useState(false);
  const vivo = useDireccionEnVivo();
  const fecha = useFechaHoy();
  const actual = SECCIONES.flatMap((g) => g.items).find((i) => i.ruta === seccion) ?? SECCIONES[0].items[0];
  const escaladasAbiertas = vivo.escaladas.filter((e) => e.n > 0 && e.tono === "critico");

  useEffect(() => {
    document.title = `${actual.nombre} · Dirección · Momi WMS`;
    return () => {
      document.title = "Momi PDA";
    };
  }, [actual.nombre]);

  return (
    <div className="flex min-h-screen bg-muted">
      {lateral && <PanelLateral l={lateral} onCerrar={() => setLateral(null)} escaladas={vivo.escaladas} />}
      <nav aria-label="Secciones de Dirección" className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-4 lg:flex">
        <Link to="/direccion" className="mb-5 px-2">
          <img src="/momi-logo.png" alt="Momi" className="h-7 w-auto dark:brightness-0 dark:invert" />
          <span className="mt-1 block text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">WMS · Dirección</span>
        </Link>
        {SECCIONES.map((g) => (
          <div key={g.grupo} className="mb-4">
            <p className="mb-1 px-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{g.grupo}</p>
            {g.items.map((i) => {
              const Icono = i.icono;
              return (
                <NavLink
                  key={i.ruta}
                  to={`/direccion${i.ruta ? `/${i.ruta}` : ""}`}
                  end
                  className={({ isActive }) => cn("flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-sm", isActive ? "bg-primary-soft font-semibold text-primary" : "text-foreground hover:bg-muted")}
                >
                  <Icono size={16} aria-hidden />
                  <span className="flex-1">{i.nombre}</span>
                  {i.badge && escaladasAbiertas.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-critico text-[11px] font-bold text-white">{escaladasAbiertas.length}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
        <p className="mt-auto px-2 text-[11px] text-muted-foreground">Maqueta con datos de ejemplo</p>
      </nav>

      <div className="min-w-0 flex-1">
        <header className="border-b border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 text-xs text-muted-foreground sm:px-6">
            <span>
              Dirección › <span className="font-semibold text-primary">{actual.nombre}</span>
            </span>
            <span>Datos actualizados el {fecha}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <div className="mr-auto min-w-0">
              <h1 className="font-display text-2xl font-extrabold">{actual.nombre}</h1>
              <p className="text-sm text-muted-foreground">
                Dirección General · resultado, capital de trabajo y riesgo · {area === AREAS_DIR[0] ? "todas las áreas" : area} · {canal === CANALES[0] ? "todos los canales" : canal}
              </p>
              <span className="mt-1 inline-block rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">Maqueta con datos de ejemplo</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1">
                <CalendarClock size={15} className="text-muted-foreground" aria-hidden />
                <span className="leading-tight">
                  <select aria-label="Periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className="bg-transparent text-sm font-semibold">
                    {PERIODOS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.texto}
                      </option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-muted-foreground">{PERIODOS.find((p) => p.id === periodo)!.rango}</span>
                </span>
              </label>
              <Selector etiqueta="Área" valor={area} onCambio={setArea} opciones={AREAS_DIR.map((a) => ({ id: a, texto: a }))} />
              <Selector etiqueta="Canal" valor={canal} onCambio={setCanal} opciones={CANALES.map((c) => ({ id: c, texto: c }))} />
              <div className="relative">
                <button type="button" onClick={() => setCampana(!campana)} aria-label={`Alertas para Dirección: ${escaladasAbiertas.length}`} className="relative grid size-10 place-items-center rounded-full border border-border bg-card">
                  <Bell size={17} aria-hidden />
                  {escaladasAbiertas.length > 0 && <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-critico text-[11px] font-bold text-white">{escaladasAbiertas.length}</span>}
                </button>
                {campana && (
                  <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-border bg-card p-3 shadow-xl">
                    <p className="mb-2 text-sm font-semibold">Escala a Dirección</p>
                    {escaladasAbiertas.length ? (
                      <ul className="space-y-1.5 text-sm">
                        {escaladasAbiertas.map((e) => (
                          <li key={e.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setCampana(false);
                                setLateral({ titulo: `${e.titulo} · ${e.n} ${e.texto}`, detalle: e.filas.length ? <TablaSimple columnas={e.columnas} filas={e.filas} /> : null, panel: "excepciones" });
                              }}
                              className="w-full rounded-lg bg-critico/10 px-3 py-2 text-left"
                            >
                              <b className="text-critico">{e.n}</b> · {e.titulo}: {e.texto}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nada crítico ahora.</p>
                    )}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setOscuro(!oscuro)} aria-label={oscuro ? "Modo claro" : "Modo oscuro"} className="grid size-10 place-items-center rounded-full border border-border bg-card">
                {oscuro ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
              </button>
              <div className="hidden items-center gap-2 pl-1 sm:flex">
                <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{yo.nombre.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
                <div className="text-sm leading-tight">
                  <p className="font-semibold">{yo.nombre}</p>
                  <p className="text-xs text-muted-foreground">{yo.puesto}</p>
                </div>
              </div>
              <button type="button" onClick={() => navegar("/login?salir=1", { replace: true })} aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-10 place-items-center rounded-full border border-border bg-card">
                <LogOut size={17} aria-hidden />
              </button>
            </div>
          </div>
          {/* En pantallas chicas, el menú de secciones va arriba. */}
          <nav aria-label="Secciones de Dirección" className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {SECCIONES.flatMap((g) => g.items).map((i) => (
              <NavLink key={i.ruta} to={`/direccion${i.ruta ? `/${i.ruta}` : ""}`} end className={({ isActive }) => cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", isActive ? "bg-primary-soft text-primary" : "text-muted-foreground")}>
                {i.nombre}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="p-4 sm:p-6">
          {seccion === "" ? (
            <Torre periodo={periodo} abrir={setLateral} />
          ) : (
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <BookOpen size={28} className="mx-auto text-muted-foreground" aria-hidden />
              <p className="mt-3 font-display text-lg font-extrabold">Esta pantalla todavía no está en la maqueta</p>
              <p className="mt-1 text-sm text-muted-foreground">{actual.descripcion}</p>
              <Link to="/direccion" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                <ChevronLeft size={15} aria-hidden /> Volver a la Torre de Control
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
