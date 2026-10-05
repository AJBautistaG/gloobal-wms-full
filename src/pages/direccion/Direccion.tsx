import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import {
  Bell,
  BookOpen,
  CalendarClock,
  ChevronLeft,
  CircleDollarSign,
  Factory,
  FileText,
  Gauge,
  LineChart,
  LogOut,
  Moon,
  Settings,
  ShieldAlert,
  Store,
  Sun,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { usePda } from "@/context/PdaContext";
import { analisisDe } from "@/data/analisisDireccion";
import type { EstadoLote } from "@/data/caducidad";
import { AREAS_DIR, CANALES, DIRECTOR, PERIODOS, useDireccionEnVivo, type Escalada, type Periodo } from "@/data/direccion";
import { useFechaHoy } from "@/lib/fecha";
import { useSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { TablaSimple } from "../supervisor/Graficas";
import { Fuente, Selector, type Lateral } from "./PiezasDireccion";
import { Torre } from "./TorreDireccion";

/**
 * Dirección General (módulo de Lovable): la Torre de Control con resultado, capital de trabajo y
 * riesgo. Las demás secciones del menú quedan como "próximamente", igual que en el mock.
 */

const SECCIONES: { grupo: string; items: { ruta: string; nombre: string; icono: typeof Gauge; descripcion: string; badge?: boolean }[] }[] = [
  {
    grupo: "Dirección",
    items: [
      { ruta: "", nombre: "Torre de Control", icono: LineChart, descripcion: "" },
      { ruta: "margen", nombre: "Resultado e impacto", icono: CircleDollarSign, descripcion: "Aquí vivirá el impacto económico de excepciones por causa, artículo y canal, y el margen potencial no capturado por desabasto." },
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
      {lateral && <PanelLateral l={lateral} onCerrar={() => setLateral(null)} vivo={vivo} />}
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
                Dirección General · resultado, capital y pérdida, y riesgo · {area === AREAS_DIR[0] ? "todas las áreas" : area} · {canal === CANALES[0] ? "todos los canales" : canal}
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
