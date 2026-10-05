import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CalendarClock, LogOut, Moon, Sun, X } from "lucide-react";
import { usePda } from "@/context/PdaContext";
import { analisisDe } from "@/data/analisisDireccion";
import type { EstadoLote } from "@/data/caducidad";
import { AREAS_DIR, CANALES, DIRECTOR, PERIODOS, TODAS, TODOS, filtrarEscaladas, useDireccionEnVivo, type AreaDir, type Canal, type Escalada, type Periodo } from "@/data/direccion";
import { FechaHoy, useFechaHoy } from "@/lib/fecha";
import { useSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { TablaSimple } from "../supervisor/Graficas";
import { Fuente, Selector, type Lateral } from "./PiezasDireccion";
import { Torre } from "./TorreDireccion";

/**
 * Torre de Control de Dirección General. Misma estructura que la torre del supervisor: encabezado
 * fijo con filtros y el tablero debajo, sin menú lateral.
 */

// ── Panel lateral: Detalle y Análisis ───────────────────────────

function PanelLateral({ l, onCerrar, vivo }: { l: Lateral; onCerrar: () => void; vivo: { escaladas: Escalada[]; estadosLote: Record<string, EstadoLote> } }) {
  const [pestana, setPestana] = useState(l.pestana ?? "detalle");
  useEffect(() => setPestana(l.pestana ?? "detalle"), [l]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  const a = l.panel ? analisisDe(l.panel, vivo) : null;
  const ahora = useFechaHoy();
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20" onClick={onCerrar}>
      <aside role="dialog" aria-modal="true" aria-label={l.titulo} onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-[720px] flex-col bg-card shadow-2xl">
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
            <>
              {l.disponibilidad && <Fuente d={l.disponibilidad} />}
              {l.detalle}
            </>
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

// ── Página ──────────────────────────────────────────────────────

export default function Direccion() {
  const { oscuro, setOscuro } = usePda();
  const sesion = useSesion();
  const navegar = useNavigate();
  const yo = sesion ?? { nombre: DIRECTOR.nombre, puesto: DIRECTOR.puesto };
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [area, setArea] = useState<AreaDir>(TODAS);
  const [canal, setCanal] = useState<Canal>(TODOS);
  const [lateral, setLateral] = useState<Lateral | null>(null);
  const [campana, setCampana] = useState(false);
  const vivo = useDireccionEnVivo();
  const criticas = filtrarEscaladas(vivo.escaladas, area).filter((e) => e.n > 0 && e.tono === "critico");

  useEffect(() => {
    document.title = "Torre de Control · Dirección · Momi WMS";
    return () => {
      document.title = "Momi PDA";
    };
  }, []);

  return (
    <div className="min-h-screen bg-muted">
      {lateral && <PanelLateral l={lateral} onCerrar={() => setLateral(null)} vivo={vivo} />}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary font-display text-lg font-extrabold text-primary-foreground">M</span>
            <div>
              <p className="font-display text-lg leading-tight font-extrabold">Torre de Control · Dirección</p>
              <p className="text-xs text-muted-foreground">
                Momi WMS · Dirección General · <FechaHoy />
              </p>
            </div>
          </div>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">Maqueta con datos de ejemplo</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
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
              <button type="button" onClick={() => setCampana(!campana)} aria-label={`Alertas para Dirección: ${criticas.length}`} className="relative grid size-11 place-items-center rounded-full border border-border bg-card">
                <Bell size={18} aria-hidden />
                {criticas.length > 0 && <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-critico text-[11px] font-bold text-white">{criticas.length}</span>}
              </button>
              {campana && (
                <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-border bg-card p-3 shadow-xl">
                  <p className="mb-2 text-sm font-semibold">Escala a Dirección</p>
                  {criticas.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {criticas.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCampana(false);
                              setLateral({ titulo: e.titulo, detalle: e.filas.length ? <TablaSimple columnas={e.columnas} filas={e.filas} /> : null, panel: "excepciones" });
                            }}
                            className="w-full rounded-lg bg-critico/10 px-3 py-2 text-left"
                          >
                            <b className="text-critico">{e.n}</b> · {e.titulo}
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
            <button type="button" onClick={() => setOscuro(!oscuro)} aria-label={oscuro ? "Modo claro" : "Modo oscuro"} className="grid size-11 place-items-center rounded-full border border-border bg-card">
              {oscuro ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>
            <div className="hidden items-center gap-2 pl-2 sm:flex">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-sm font-bold">{yo.nombre.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
              <div className="text-sm leading-tight">
                <p className="font-semibold">{yo.nombre}</p>
                <p className="text-xs text-muted-foreground">{yo.puesto}</p>
              </div>
            </div>
            <button type="button" onClick={() => navegar("/login?salir=1", { replace: true })} aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-11 place-items-center rounded-full border border-border bg-card">
              <LogOut size={18} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-muted-foreground">
          {PERIODOS.find((p) => p.id === periodo)!.texto} ({PERIODOS.find((p) => p.id === periodo)!.rango}) · {area === TODAS ? "todas las áreas" : area} · {canal === TODOS ? "todos los canales" : canal}
          {(area !== TODAS || canal !== TODOS) && (
            <button type="button" onClick={() => { setArea(TODAS); setCanal(TODOS); }} className="ml-2 font-semibold text-primary underline underline-offset-4">
              Quitar filtros
            </button>
          )}
        </p>
        <Torre filtros={{ periodo, area, canal }} abrir={setLateral} />
      </main>
    </div>
  );
}
