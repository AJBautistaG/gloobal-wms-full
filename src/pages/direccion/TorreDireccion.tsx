import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { PanelId } from "@/data/analisisDireccion";
import {
  ABC,
  BANDAS,
  CAMARAS,
  CAUSAS,
  COL_EXACTITUD,
  COL_LOTES,
  COL_IMPACTO_DETALLE,
  DIAS_SEMANA,
  DIFERENCIAS_MES,
  INMOVILIZADO,
  MESES,
  META_CUMPLIMIENTO,
  NEGOCIO,
  REGLA_ESCALAMIENTO,
  TODAS,
  TODOS,
  VALOR_CAMARA,
  VALOR_INVENTARIO,
  VENTANAS_RETRASO,
  caducidadDe,
  costoDe,
  cumpleMeta,
  detalleImpacto,
  filtrarActividad,
  filtrarCompromisos,
  filtrarEscaladas,
  impactoDe,
  impactoMes,
  negocioDe,
  retrasoDe,
  topDe,
  kpis,
  lotesDeBanda,
  periodoDe,
  totalInmovilizado,
  usd,
  usdCorto,
  useDireccionEnVivo,
  valorEnRiesgo,
  type Alcance,
  type Banda,
  type Camara,
  type Compromiso,
  type Escalada,
  type Filtros,
  type Kpi,
} from "@/data/direccion";
import { documentoCompra, documentoSurtido } from "@/data/documentos";
import { incidenciasStore } from "@/data/incidencias";
import { ordenesStore } from "@/data/ordenes";
import { buscarOrden } from "@/data/recepcion";
import { recepcionesStore } from "@/data/recepciones";
import { surtidoStore, trabajosDelDia } from "@/data/surtido";
import { cn, cuenta } from "@/lib/utils";
import { TablaSimple } from "../supervisor/Graficas";
import { Dona, GraficaImpacto, MapaCalor } from "./GraficasDireccion";
import { Desglose, Panel, Selector, TablaFilas, TablaPorcentaje, type Lateral } from "./PiezasDireccion";

const DIMENSIONES: { id: Kpi["dimension"]; nombre: string }[] = [
  { id: "resultado", nombre: "Resultado" },
  { id: "capital", nombre: "Capital y pérdida" },
  { id: "riesgo", nombre: "Riesgo" },
];

function TarjetaKpi({ k, onAbrir }: { k: Kpi; onAbrir: () => void }) {
  const ok = cumpleMeta(k);
  const pct = (v: number) => (k.escala ? Math.max(0, Math.min(100, ((v - k.escala[0]) / (k.escala[1] - k.escala[0])) * 100)) : 0);
  const Flecha = k.cambio?.texto.startsWith("−") ? ArrowDown : ArrowUp;
  return (
    <button type="button" onClick={onAbrir} className="min-w-0 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/50" aria-label={`${k.nombre}: ver desglose`}>
      <p className="text-sm leading-tight font-semibold">{k.nombre}</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-semibold tabular-nums">{k.unidad === "USD" ? usd(k.valor) : k.valor}</span>
        <span className="text-sm text-muted-foreground">{k.unidad}</span>
      </p>
      {k.cambio ? (
        <p title="Contra el periodo anterior" className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", k.cambio.bueno ? "text-exito" : "text-critico")}>
          <Flecha size={12} aria-hidden /> {k.cambio.texto}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">sin periodo comparable</p>
      )}
      {k.meta && k.escala && (
        <>
          <div className="relative mt-3 h-1.5 rounded-full bg-muted" role="meter" aria-valuenow={k.valor} aria-label={`${k.nombre}: ${k.valor} ${k.unidad}, ${k.meta.texto}`}>
            <div className={cn("h-full rounded-full", ok ? "bg-exito" : k.meta.mayorEsMejor ? "bg-alerta" : "bg-critico")} style={{ width: `${pct(k.valor)}%` }} />
            <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-foreground" style={{ left: `${pct(k.meta.valor)}%` }} aria-hidden />
          </div>
          <p className={cn("mt-1.5 text-xs", ok ? "text-exito" : "text-muted-foreground")}>
            {k.meta.texto}
            {ok ? " · cumple" : ""}
          </p>
        </>
      )}
      <div className={cn("mt-3 grid gap-x-2 gap-y-1.5 border-t border-border pt-2.5", "grid-cols-2")}>
        {k.apoyo.map((a) => (
          <div key={a.texto} className="min-w-0">
            <p className="text-sm font-semibold tabular-nums">{a.valor}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">{a.texto}</p>
          </div>
        ))}
      </div>
    </button>
  );
}

const TONO_ESTADO: Record<Compromiso["tono"], string> = {
  critico: "bg-critico/15 text-critico",
  alerta: "bg-alerta/15 text-alerta",
  info: "bg-frio/15 text-frio",
  neutro: "bg-muted text-muted-foreground",
};

export function Torre({ filtros, abrir }: { filtros: Filtros; abrir: (l: Lateral) => void }) {
  const { periodo, area, canal } = filtros;
  const vivo = useDireccionEnVivo();
  const lista = kpis(filtros, vivo.exactitud, vivo.estadosLote);
  const imp = impactoDe(periodo, area);
  const p = periodoDe(periodo);
  const filtrado = area !== TODAS || canal !== TODOS;
  // Los paneles de inventario son una foto del Almacén Central: lo dicen cuando hay filtros.
  const fotoAlmacen = filtrado ? " · Almacén Central, no cambia por área ni canal" : "";
  const escaladas = filtrarEscaladas(vivo.escaladas, area);
  const top = topDe(periodo, area);
  const negocio = negocioDe(area, canal);
  const costos = costoDe(periodo);
  const riesgo = valorEnRiesgo(vivo.estadosLote);
  const [camara, setCamara] = useState<Camara>("Todas");
  const [semanas, setSemanas] = useState(4);
  const [alcance, setAlcance] = useState<Alcance>("mes");
  const [vistaValor, setVistaValor] = useState<"camara" | "abc">("camara");
  const analizar = (panel: PanelId, titulo: string, detalle: ReactNode) => () => abrir({ titulo, detalle, panel, pestana: "analisis" });

  const cad = caducidadDe(camara);
  const enRiesgoCad = cad.vencido + cad["7"] + cad["30"];
  const factorRetraso = VENTANAS_RETRASO.find((v) => v.id === semanas)!.factor;
  const retraso = retrasoDe(area, canal, factorRetraso);
  const totalRetraso = retraso.reduce((s, [, v]) => s + v.reduce((a, b) => a + b, 0), 0) || 1;
  const finSemana = retraso.reduce((s, [, v]) => s + v[4] + v[5], 0);
  const totalCosto = costos.reduce((s, c) => s + c.usd, 0);
  const maxCosto = Math.max(...costos.map((c) => c.usd));
  const totalValor = VALOR_CAMARA.reduce((s, c) => s + c.mp + c.insumos + c.pt, 0);
  const inmov = totalInmovilizado();
  const maxInmov = Math.max(...INMOVILIZADO.map((t) => t.usd));

  // ── Desgloses (nivel 2 y 3) ──
  const desgloseImpacto = (inicial?: string) =>
    periodo === "mes" ? (
      <Desglose
        raiz={`Impacto de septiembre${area === TODAS ? "" : ` · ${area}`}`}
        total={imp.total}
        inicial={inicial}
        items={CAUSAS.map((c) => ({ id: c.id, nombre: c.nombre, usd: imp.porCausa[c.id], clase: c.clase, nota: c.definicion, columnas: COL_IMPACTO_DETALLE, filas: detalleImpacto(c.id, area) }))}
      />
    ) : (
      <div className="space-y-3">
        <p className="text-muted-foreground">Desglose por mes del periodo. El detalle operacional por artículo está en el último mes cerrado.</p>
        <TablaSimple
          columnas={["Mes", ...CAUSAS.map((c) => c.nombre), "Total"]}
          filas={[
            ...p.meses.map((i) => [MESES[i], ...CAUSAS.map((c) => usd(impactoMes(c.id, i, area))), usd(CAUSAS.reduce((s, c) => s + impactoMes(c.id, i, area), 0))]),
            ["Total", ...CAUSAS.map((c) => usd(imp.porCausa[c.id])), usd(imp.total)],
          ]}
        />
      </div>
    );
  const desgloseRiesgo = <Desglose raiz="Valor en riesgo · hoy" total={riesgo.total} items={riesgo.componentes.map((c, i) => ({ id: c.id, nombre: c.nombre, usd: c.usd, clase: ["bg-critico", "bg-causa-diferencias", "bg-alerta", "bg-causa-desabasto"][i], columnas: c.columnas, filas: c.filas }))} />;
  const desgloseBanda = (b: Banda) => {
    const filas = lotesDeBanda(b, camara, vivo.estadosLote);
    return <TablaFilas columnas={COL_LOTES} filas={filas} total={cad[b]} />;
  };
  const exactitudDetalle = (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        {vivo.exactitud.coinciden} de {vivo.exactitud.coinciden + vivo.exactitud.difieren} lecturas de lote coinciden con el sistema. Estas son las que no:
      </p>
      <TablaSimple
        columnas={COL_EXACTITUD}
        filas={[...vivo.exactitud.eventos.map((e) => [`Lectura en ${e.posicion}`, e.leido, e.posicion, e.esperado, e.leido, "lote distinto", `hoy ${e.hora} · ${e.quien}`, "PDA"]), ...DIFERENCIAS_MES]}
      />
    </div>
  );

  const abrirKpi = (k: Kpi) => {
    const base = { titulo: k.nombre, disponibilidad: k.disponibilidad };
    if (k.id === "impacto") return abrir({ ...base, detalle: desgloseImpacto(), panel: "impacto" });
    if (k.id === "riesgo") return abrir({ ...base, detalle: desgloseRiesgo, panel: "riesgo" });
    if (k.id === "exactitud") return abrir({ ...base, detalle: exactitudDetalle });
    if (k.id === "dias")
      return abrir({
        ...base,
        panel: "inmovilizado",
        detalle: (
          <div className="space-y-3">
            <p className="text-muted-foreground">Días de inventario = rotación de cada clase ponderada por su valor.</p>
            <TablaSimple columnas={["Clase", "Valor USD", "Rota cada"]} filas={[...ABC.map((c) => [c.clase, usd(c.valor), `${c.rota} días`]), ["Total ponderado", usd(VALOR_INVENTARIO.fisico), `${k.valor} días`]]} />
          </div>
        ),
      });
    if (k.desglose) return abrir({ ...base, detalle: <div className="space-y-2"><p className="text-muted-foreground">Desglose {k.desglose.titulo.toLowerCase()}</p><TablaPorcentaje columnas={k.desglose.columnas} filas={k.desglose.filas} /></div> });
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Indicadores agrupados por la pregunta que responden */}
      <div className="grid grid-cols-1 gap-4 lg:col-span-12 xl:grid-cols-[3fr_2fr_2fr]">
        {DIMENSIONES.map((d) => {
          const ks = lista.filter((k) => k.dimension === d.id);
          return (
            <div key={d.id} className="min-w-0">
              <p className="mb-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {d.nombre}
              </p>
              <div className={cn("grid gap-3", ks.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                {ks.map((k) => (
                  <TarjetaKpi key={k.id} k={k} onAbrir={() => abrirKpi(k)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="-mt-3 text-xs text-muted-foreground lg:col-span-12">Las flechas comparan contra el periodo anterior. Toca un indicador para ver su desglose.</p>

      <Panel
        titulo="Impacto económico de excepciones y escenario proyectado"
        subtitulo={`${area === TODAS ? "Todas las áreas" : area} · resaltado: ${p.texto.toLowerCase()} · oct – dic escenario base contra escenario objetivo · USD`}
        className="lg:col-span-6"
        onAnalizar={analizar("impacto", "Impacto económico de excepciones", desgloseImpacto())}
        accion={
          <button type="button" onClick={() => abrir({ titulo: "Impacto económico de excepciones", detalle: desgloseImpacto(), panel: "impacto", disponibilidad: "D3" })} className="text-xs font-semibold text-primary">
            Ver detalle ›
          </button>
        }
      >
        <GraficaImpacto area={area} meses={p.meses} />
      </Panel>

      <Panel
        titulo="Capital inmovilizado"
        subtitulo={`Por días sin movimiento · foto de hoy${fotoAlmacen}`}
        className="lg:col-span-3"
        onAnalizar={analizar("inmovilizado", "Capital inmovilizado", <TablaSimple columnas={["Sin movimiento", "USD"]} filas={INMOVILIZADO.map((t) => [t.tramo, usd(t.usd)])} />)}
      >
        <p className="text-3xl font-semibold tabular-nums">{usd(inmov)}</p>
        <p className="text-xs text-muted-foreground">
          USD sin movimiento en más de 30 días · {Math.round((inmov / VALOR_INVENTARIO.fisico) * 100)} % del inventario
        </p>
        <ul className="mt-4 space-y-1">
          {INMOVILIZADO.map((t, i) => (
            <li key={t.tramo}>
              <button
                type="button"
                onClick={() => abrir({ titulo: `Capital inmovilizado · ${t.tramo}`, disponibilidad: "D2", panel: "inmovilizado", detalle: <TablaFilas columnas={["Artículo", "Ubicación", "Sin movimiento"]} filas={t.filas} total={t.usd} /> })}
                className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-muted"
              >
                <span className="text-xs">{t.tramo}</span>
                <span className="h-3">
                  {/* Tramos ordenados: una tonalidad, más intensa cuanto más tiempo quieto */}
                  <span className={cn("block h-full rounded-r-[4px]", ["bg-primary/35", "bg-primary/55", "bg-primary/75", "bg-primary"][i])} style={{ width: `${(t.usd / maxInmov) * 100}%` }} />
                </span>
                <span className="text-right text-xs font-semibold tabular-nums">{usdCorto(t.usd)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Más de 90 días: <b className="text-foreground">USD {usd(INMOVILIZADO[2].usd + INMOVILIZADO[3].usd)}</b>
        </p>
      </Panel>

      <Panel
        titulo="Riesgo de caducidad"
        subtitulo={`Por cámara · foto de hoy · sin empaque${fotoAlmacen}`}
        className="lg:col-span-3"
        onAnalizar={analizar("caducidad", "Riesgo de caducidad", <p>Valor por banda de caducidad, {camara === "Todas" ? "todas las cámaras" : `cámara ${camara.toLowerCase()}`}.</p>)}
      >
        <div className="mb-1">
          <Selector etiqueta="Cámara" valor={camara} onCambio={setCamara} opciones={CAMARAS.map((c) => ({ id: c, texto: c === "Todas" ? "Todas las cámaras" : c }))} />
        </div>
        <Dona
          centro={usdCorto(enRiesgoCad)}
          subcentro="en riesgo"
          rebanadas={BANDAS.map((b) => ({ texto: b.nombre, valor: cad[b.id], clase: b.trazo, punto: b.clase }))}
          onElegir={(r) => {
            const b = BANDAS.find((x) => x.nombre === r.texto)!;
            abrir({ titulo: `Caducidad · ${b.nombre}${camara === "Todas" ? "" : ` · ${camara}`}`, disponibilidad: "D2", panel: "caducidad", detalle: desgloseBanda(b.id) });
          }}
        />
        <Link to="/supervisor?ver=caducidad" target="_blank" className="mt-3 inline-block text-xs font-semibold text-primary underline underline-offset-4">
          Ver caducidad por lote en el almacén ›
        </Link>
      </Panel>

      <Panel titulo="Costo operativo por proceso de Almacén" subtitulo={`Capacidad futura · ${p.texto.toLowerCase()} · montos ilustrativos`} className="lg:col-span-5" onAnalizar={analizar("costo", "Costo operativo por proceso de Almacén", <TablaSimple columnas={["Proceso", "USD"]} filas={costos.map((c) => [c.proceso, usd(c.usd)])} />)}>
        <ul className="flex h-44 items-end gap-[2px] border-b border-foreground/30" aria-label="Costo por proceso en USD">
          {costos.map((c) => {
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
                      disponibilidad: "D3",
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
                          <TablaSimple columnas={["Mes", "USD"]} filas={p.meses.map((i) => [MESES[i], usd(c.serie[i])])} />
                          <p className="text-xs text-muted-foreground">Requiere tiempos del WMS, costo laboral (RRHH) y costos de equipo e infraestructura (ERP).</p>
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
          {costos.map((c) => (
            <span key={c.proceso} className={cn("min-w-0 flex-1 truncate text-center", c.usd === maxCosto && "font-semibold text-critico")}>
              {c.proceso}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm">
          Surtido sería <b>USD {usd(maxCosto)}</b> de los {usd(totalCosto)} del periodo — {Math.round((maxCosto / totalCosto) * 100)} % del costo, con un solo surtidor por turno.
        </p>
      </Panel>

      <Panel
        titulo="Horas de retraso por área y día"
        subtitulo={`Promedio · ${semanas} semanas · retraso = hora real − hora comprometida`}
        className="lg:col-span-7"
        onAnalizar={analizar("retraso", "Horas de retraso", <TablaSimple columnas={["Área", ...DIAS_SEMANA]} filas={retraso.map(([n, v]) => [n, ...v.map((x) => x.toFixed(1))])} />)}
        accion={<Selector etiqueta="Semanas" valor={semanas} onCambio={setSemanas} opciones={VENTANAS_RETRASO.map((v) => ({ id: v.id, texto: v.texto }))} />}
      >
        {retraso.length ? (
          <>
            <MapaCalor filas={retraso} columnas={DIAS_SEMANA} />
            <p className="mt-2 text-right text-xs font-semibold text-critico">Viernes y sábado concentran el {Math.round((finSemana / totalRetraso) * 100)} % del retraso · causa por registrar</p>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Los pedidos especiales todavía no registran hora comprometida, así que no hay retraso que medir.</p>
        )}
      </Panel>

      <Panel
        titulo="Negocio y flujo operativo"
        subtitulo="Compromisos por canal · ventas, e-commerce, producción, compras y WMS"
        className="lg:col-span-6"
        onAnalizar={analizar("negocio", "Negocio y flujo operativo", <TablaSimple columnas={["Indicador", "Fuente"]} filas={NEGOCIO.map((n) => [n.nombre, n.fuente])} />)}
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
          {negocio.tiles.map((n) => (
            <div key={n.nombre} className={cn("min-w-0 border-l border-border pl-2.5", !n.activo && "opacity-35")} title={`Fuente: ${n.fuente}`}>
              <p className="text-xs leading-tight text-muted-foreground">{n.nombre}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{usd(n.valores[alcance])}</p>
              <p className="text-[11px] text-muted-foreground">
                {alcance === "hoy" ? "hoy" : alcance === "semana" ? "esta semana" : "mes a la fecha"}
                {n.usd ? " · USD" : ""}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 mb-2 text-sm font-semibold">Cumplimiento a la hora prometida, por canal</p>
        <ul className="space-y-2">
          {negocio.cumplimiento.map((c) => {
            const v = c.valores[alcance];
            const tono = v >= 85 ? "exito" : v >= 70 ? "alerta" : "critico";
            return (
              <li key={c.canal} className={cn("grid grid-cols-[9rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm", !c.activo && "opacity-35")}>
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

      <Panel titulo="Excepciones que escalan a Dirección" subtitulo={REGLA_ESCALAMIENTO} className="lg:col-span-6" onAnalizar={analizar("excepciones", "Excepciones que escalan", <TablaSimple columnas={["Excepción", "Abiertas", "USD"]} filas={escaladas.map((e) => [e.titulo, e.n, usd(e.impacto)])} />)}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {escaladas.map((e) => (
            <button key={e.id} type="button" onClick={() => abrir({ titulo: e.titulo, detalle: <DetalleEscalada e={e} />, panel: "excepciones", disponibilidad: e.id === "produccion" ? "D3" : "D2" })} className={cn("rounded-xl p-3 text-left", e.n === 0 ? "bg-muted" : e.tono === "critico" ? "bg-critico/10" : "bg-alerta/10")}>
              <p className={cn("text-2xl font-semibold tabular-nums", e.n === 0 ? "text-muted-foreground" : e.tono === "critico" ? "text-critico" : "text-alerta")}>{e.n}</p>
              <p className="text-sm leading-tight font-semibold">{e.titulo}</p>
              <p className="mt-1 text-xs text-muted-foreground">{e.n ? `USD ${usd(e.impacto)} · ${e.responsable}` : "sin pendientes"}</p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        titulo="Valor de inventario"
        subtitulo={`USD · foto de hoy${fotoAlmacen}`}
        className="lg:col-span-4"
        onAnalizar={analizar("valor", "Valor de inventario", <p>USD {usd(totalValor)} en total.</p>)}
      >
        <div className="mb-3 inline-flex rounded-xl bg-muted p-0.5">
          {(
            [
              ["camara", "Cámara y familia"],
              ["abc", "Clase ABC"],
            ] as const
          ).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={vistaValor === v} onClick={() => setVistaValor(v)} className={cn("min-h-8 rounded-lg px-2.5 text-xs font-semibold", vistaValor === v ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {t}
            </button>
          ))}
        </div>
        {/* Valor total no es inventario utilizable */}
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-muted p-2.5 text-xs">
          {(
            [
              ["Disponible", VALOR_INVENTARIO.disponible],
              ["Comprometido", VALOR_INVENTARIO.comprometido],
              ["Cuarentena y resguardo", VALOR_INVENTARIO.retenido],
            ] as const
          ).map(([t, v]) => (
            <div key={t} className="min-w-0">
              <p className="font-semibold tabular-nums">{usdCorto(v)}</p>
              <p className="leading-tight text-muted-foreground">{t}</p>
            </div>
          ))}
        </div>
        {vistaValor === "camara" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[300px] text-sm whitespace-nowrap tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Cámara</th>
                  <th className="pb-2 pl-2 text-right font-medium">M. prima</th>
                  <th className="pb-2 pl-2 text-right font-medium">Insumos</th>
                  <th className="pb-2 pl-2 text-right font-medium">P. term.</th>
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
                  <td className="py-1.5">Total físico</td>
                  <td className="py-1.5 pl-2 text-right">{usdCorto(VALOR_CAMARA.reduce((s, c) => s + c.mp, 0))}</td>
                  <td className="py-1.5 pl-2 text-right">{usdCorto(VALOR_CAMARA.reduce((s, c) => s + c.insumos, 0))}</td>
                  <td className="py-1.5 pl-2 text-right">{usdCorto(VALOR_CAMARA.reduce((s, c) => s + c.pt, 0))}</td>
                  <td className="py-1.5 pl-2 text-right">{usdCorto(totalValor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <Dona
            centro={usdCorto(ABC.reduce((s, c) => s + c.valor, 0))}
            subcentro="USD"
            rebanadas={ABC.map((c, i) => ({
              texto: c.clase,
              valor: c.valor,
              // Clases ordenadas: una sola tonalidad, de la A (más intensa) a la C.
              clase: ["stroke-primary", "stroke-primary/60", "stroke-primary/30"][i],
              punto: ["bg-primary", "bg-primary/60", "bg-primary/30"][i],
              detalle: `rota cada ${c.rota} d`,
            }))}
          />
        )}
      </Panel>

      <Panel titulo="Top excepciones por impacto" subtitulo={`${p.texto} · ${area === TODAS ? "todas las áreas" : area} · USD · lo que sigue en investigación no es pérdida`} className="lg:col-span-4" onAnalizar={analizar("top", "Top excepciones por impacto", <TablaSimple columnas={["Artículo", "Tipo", "USD", "Estado"]} filas={top.map((x) => [x.articulo, x.tipo, usd(x.usd), x.estado])} />)}>
        <ul className="divide-y divide-border text-sm">
          {top.length === 0 && <li className="py-6 text-center text-muted-foreground">Sin excepciones de impacto para esta área.</li>}
          {top.map((x) => (
            <li key={x.codigo}>
              <button
                type="button"
                onClick={() =>
                  abrir({
                    titulo: `${x.articulo} · ${x.tipo.toLowerCase()}`,
                    panel: "top",
                    disponibilidad: x.tipo === "Desabasto" ? "D3" : "D2",
                    detalle: (
                      <dl className="grid grid-cols-2 gap-3">
                        {(
                          [
                            ["Artículo", `${x.articulo} · ${x.codigo}`],
                            ["Tipo de excepción", x.tipo],
                            ["Cantidad", x.cantidad],
                            ["Valor asociado", `USD ${usd(x.usd)}`],
                            ["Estado", x.estado],
                            ["Responsable", x.responsable],
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-xs text-muted-foreground">{k}</dt>
                            <dd className="font-semibold">{v}</dd>
                          </div>
                        ))}
                        {!x.confirmada && <p className="col-span-2 rounded-xl bg-alerta/10 px-3 py-2 text-alerta">No encontrado no es perdido: puede estar mal ubicado. Cuenta en el valor en riesgo, no en el impacto económico.</p>}
                      </dl>
                    ),
                  })
                }
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{x.articulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {x.cantidad} · {x.responsable}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", x.confirmada ? "bg-critico/10 text-critico" : "border border-dashed border-alerta text-alerta")}>{x.confirmada ? x.tipo : "En investigación"}</span>
                  <span className="w-12 text-right font-semibold tabular-nums">{usd(x.usd)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel titulo="Actividad en tiempo real" subtitulo="El pulso de la operación: lo relevante, no cada movimiento" className="lg:col-span-4" accion={<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-exito"><span className="size-2 animate-pulse rounded-full bg-exito" aria-hidden /> En vivo</span>}>
        <ol className="space-y-2.5">
          {filtrarActividad(vivo.actividad, area).length === 0 && <li className="text-sm text-muted-foreground">Sin actividad relevante de esta área hoy.</li>}
          {filtrarActividad(vivo.actividad, area).map((x, n) => (
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

      <Compromisos lista={filtrarCompromisos(vivo.compromisos, area, canal)} abrir={abrir} />
    </div>
  );
}

function DetalleEscalada({ e }: { e: Escalada }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3">
        {(
          [
            ["Problema", `${e.n} ${e.texto}`],
            ["Impacto", `USD ${usd(e.impacto)}`],
            ["Antigüedad", e.antiguedad],
            ["Responsable", e.responsable],
            ["Estado", e.estado],
            ["Siguiente acción", e.siguiente],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {e.filas.length ? <TablaSimple columnas={e.columnas} filas={e.filas} /> : <p className="text-muted-foreground">Nada pendiente en este momento.</p>}
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
  const ordenada = useMemo(
    () =>
      [...lista].sort((a, b) => {
        const va = a[orden.col];
        const vb = b[orden.col];
        const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
        return orden.asc ? c : -c;
      }),
    [lista, orden],
  );
  const paginas = Math.max(1, Math.ceil(ordenada.length / POR_PAGINA));
  // Al cambiar los filtros, regresa a la primera página.
  useEffect(() => setPagina(0), [lista.length]);
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
      disponibilidad: c.tipo === "Compra" || c.tipo === "Surtido" ? "D2" : "D3",
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
    <Panel
      titulo="Órdenes y compromisos abiertos"
      subtitulo="Vista ejecutiva de compromisos de todas las áreas y canales · compras y surtido en vivo"
      className="lg:col-span-12"
      accion={
        <button type="button" onClick={exportar} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold">
          <Download size={15} aria-hidden /> Exportar
        </button>
      }
    >
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
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Sin compromisos abiertos con estos filtros.
                </td>
              </tr>
            )}
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
