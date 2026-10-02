import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarCheck, ClipboardList, PencilLine, RotateCcw } from "lucide-react";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { borradoresStore, type Area } from "@/data/area";
import {
  DIA_HOY,
  PRODUCTOS,
  SEMANA,
  TEXTO_FRECUENCIA,
  alcance,
  cambiarPlan,
  confirmarPlan,
  consumoDelDia,
  contarExistencia,
  copiarSemanaAnterior,
  editarPlan,
  enCaminoDe,
  existenciasDe,
  existenciasStore,
  generarSolicitud,
  planDe,
  planesStore,
  registrarConsumoDeHoy,
  requerimiento,
} from "@/data/planeacion";
import { cantidadCon, enBultos, insumoDe, pedidosAreaStore, surtidoStore } from "@/data/surtido";
import { HOY } from "@/lib/fecha";
import { cn, cuenta } from "@/lib/utils";

const BOTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-40";
const PRINCIPAL = cn(BOTON, "bg-primary text-primary-foreground");
const SECUNDARIO = cn(BOTON, "border border-border bg-card");

function Panel({ titulo, subtitulo, children, className, accion }: { titulo: string; subtitulo?: ReactNode; children: ReactNode; className?: string; accion?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
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

const rango = `${SEMANA[0].dia} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(SEMANA[0].iso.slice(5, 7)) - 1]} – ${SEMANA[6].dia} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(SEMANA[6].iso.slice(5, 7)) - 1]}`;

/** Celda del plan: se escribe la cantidad del día. */
function CeldaPlan({ valor, onCambio, deshabilitada, etiqueta }: { valor: number; onCambio: (n: number) => void; deshabilitada: boolean; etiqueta: string }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  if (deshabilitada) return <span className="block text-center font-mono tabular-nums">{valor}</span>;
  return (
    <input
      value={texto}
      inputMode="numeric"
      aria-label={etiqueta}
      onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
      onBlur={() => onCambio(Number(texto) || 0)}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="h-9 w-full rounded-lg border border-input bg-background text-center font-mono tabular-nums"
    />
  );
}

// ── Planeación ──────────────────────────────────────────────────

export function VistaPlaneacion({ a, onGenerada }: { a: Area; onGenerada: () => void }) {
  const plan = planDe(a, planesStore.use());
  const existencias = existenciasDe(a.clave, existenciasStore.use());
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  const borrador = borradoresStore.use()[a.clave];
  const req = requerimiento(a, plan, existencias, enCaminoDe(a, estados, pedidos));
  const aPedir = req.filter((r) => r.empaques > 0);
  const confirmado = plan.estado === "confirmado";

  return (
    <div className="grid gap-5">
      <Panel
        titulo={`Plan de la semana · ${rango}`}
        subtitulo={
          confirmado ? (
            <span className="font-semibold text-exito">
              Confirmado por {plan.confirmado?.quien} a las {plan.confirmado?.hora}
            </span>
          ) : (
            "Borrador · escribe cuánto vas a producir cada día y confírmalo"
          )
        }
        accion={
          <div className="flex flex-wrap gap-2">
            {confirmado ? (
              <button type="button" onClick={() => editarPlan(a)} className={SECUNDARIO}>
                <PencilLine size={16} aria-hidden /> Editar plan
              </button>
            ) : (
              <>
                <button type="button" onClick={() => copiarSemanaAnterior(a)} className={SECUNDARIO}>
                  <RotateCcw size={16} aria-hidden /> Copiar semana anterior
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmarPlan(a);
                    toast.success("Plan confirmado", { description: "Ya puedes generar la solicitud de pedido." });
                  }}
                  className={PRINCIPAL}
                >
                  <CalendarCheck size={16} aria-hidden /> Confirmar plan
                </button>
              </>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Producto</th>
                {SEMANA.map((d) => (
                  <th key={d.n} className={cn("w-20 pb-2 text-center font-medium", d.hoy && "text-primary")}>
                    {d.nombre} {d.dia}
                    {d.hoy && <span className="block text-[10px] tracking-wider uppercase">hoy</span>}
                  </th>
                ))}
                <th className="w-20 pb-2 text-right font-medium">Semana</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTOS[a.clave].map((p) => {
                const fila = plan.cantidades[p.id] ?? Array(7).fill(0);
                return (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="py-2.5 pr-3">
                      <span className="block font-semibold">{p.nombre}</span>
                      <span className="block text-xs text-muted-foreground">en {p.unidad}</span>
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-semibold text-primary">Receta por unidad</summary>
                        <ul className="mt-1 space-y-0.5">
                          {p.receta.map(([sku, n]) => (
                            <li key={sku}>
                              {cantidadCon(insumoDe(sku).unidad, n)} · {insumoDe(sku).nombre}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    {SEMANA.map((d) => (
                      <td key={d.n} className={cn("px-1 py-2.5", d.hoy && "bg-primary-soft/40", d.pasado && "text-muted-foreground")}>
                        <CeldaPlan valor={fila[d.n] ?? 0} deshabilitada={confirmado || d.pasado} etiqueta={`${p.nombre} el ${d.nombre} ${d.dia}`} onCambio={(n) => cambiarPlan(a, p.id, d.n, n)} />
                      </td>
                    ))}
                    <td className="py-2.5 text-right font-mono font-semibold tabular-nums">{fila.reduce((s, x) => s + x, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Los días que ya pasaron no se editan. Las recetas son de ejemplo para la maqueta.</p>
      </Panel>

      <Panel
        titulo="Lo que necesitas pedir"
        subtitulo="Plan × receta, menos lo que ya tienes en el área y lo que ya viene en camino. Lo refrigerado se pide a diario; lo seco, cada tercer día."
        accion={
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={!confirmado || aPedir.length === 0}
              onClick={() => {
                const n = generarSolicitud(a, req);
                toast.success(`Solicitud generada con ${cuenta(n, "artículo")}`, { description: "Quedó como borrador: revísala antes de enviarla." });
                onGenerada();
              }}
              className={PRINCIPAL}
            >
              <ClipboardList size={16} aria-hidden /> Generar solicitud · {cuenta(aPedir.length, "artículo")}
            </button>
            <span className="text-xs text-muted-foreground">
              {!confirmado ? "Confirma el plan para generarla." : borrador ? "Reemplaza tu borrador actual. Nada se envía sin tu revisión." : "Se crea un borrador. Nada se envía sin tu revisión."}
            </span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Insumo</th>
                <th className="pb-2 font-medium">Se pide</th>
                <th className="pb-2 text-right font-medium">Necesitas</th>
                <th className="pb-2 text-right font-medium">Tienes</th>
                <th className="pb-2 text-right font-medium">En camino</th>
                <th className="pb-2 text-right font-medium">Falta</th>
                <th className="pb-2 pl-4 font-medium">Pedir</th>
              </tr>
            </thead>
            <tbody>
              {req.map((r) => (
                <tr key={r.sku} className="border-t border-border align-top">
                  <td className="py-2.5 pr-3">
                    <span className="flex items-start gap-2">
                      <ImagenProducto codigo={r.sku} nombre={r.insumo.nombre} tamano="sm" />
                      <span>
                        <span className="block font-semibold">{r.insumo.nombre}</span>
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-semibold text-primary">Por qué</summary>
                          <ul className="mt-1 space-y-0.5">
                            {r.porque.map((x) => (
                              <li key={x.producto}>
                                {x.unidades} × {x.producto} = {cantidadCon(r.insumo.unidad, x.cantidad)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </span>
                    </span>
                  </td>
                  <td className="py-2.5 text-xs">
                    {TEXTO_FRECUENCIA[r.frecuencia]}
                    <span className="block text-muted-foreground">
                      {r.dias.at(0)} a {r.dias.at(-1)}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{cantidadCon(r.insumo.unidad, r.necesito)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{cantidadCon(r.insumo.unidad, r.tengo)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{r.enCamino ? cantidadCon(r.insumo.unidad, r.enCamino) : "—"}</td>
                  <td className={cn("py-2.5 text-right font-mono font-semibold tabular-nums", r.falta > 0 ? "text-critico" : "text-exito")}>{r.falta > 0 ? cantidadCon(r.insumo.unidad, r.falta) : "Alcanza"}</td>
                  <td className="py-2.5 pl-4">
                    {r.empaques > 0 ? (
                      <>
                        <span className="block font-semibold">{enBultos(r.insumo, r.empaques)}</span>
                        <span className="text-xs text-muted-foreground">
                          {cantidadCon(r.insumo.unidad, r.pedir)} · {r.insumo.manejo.etiqueta}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ── Existencias del área ────────────────────────────────────────

function Contar({ a, sku, actual }: { a: Area; sku: string; actual: number }) {
  const [texto, setTexto] = useState("");
  const i = insumoDe(sku);
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={texto}
        inputMode="decimal"
        placeholder={String(actual)}
        aria-label={`Conteo de ${i.nombre}`}
        onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, ""))}
        className="h-8 w-20 rounded-lg border border-input bg-background px-2 text-right font-mono text-sm"
      />
      <span className="text-xs text-muted-foreground">{i.unidad}</span>
      <button
        type="button"
        disabled={texto === ""}
        onClick={() => {
          contarExistencia(a, sku, Number(texto.replace(",", ".")));
          setTexto("");
          toast.success(`Conteo de ${i.nombre} registrado`);
        }}
        className="min-h-8 rounded-lg border border-border px-2.5 text-xs font-semibold disabled:opacity-40"
      >
        Guardar
      </button>
    </span>
  );
}

export function VistaExistencias({ a }: { a: Area }) {
  const plan = planDe(a, planesStore.use());
  const e = existenciasDe(a.clave, existenciasStore.use());
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  const camino = enCaminoDe(a, estados, pedidos);
  const hoy = consumoDelDia(a, plan, DIA_HOY);
  const skus = [...new Set([...Object.keys(e.cantidades), ...PRODUCTOS[a.clave].flatMap((p) => p.receta.map(([s]) => s))])].sort((x, y) => insumoDe(x).nombre.localeCompare(insumoDe(y).nombre));
  const consumido = e.consumoRegistrado === HOY;

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Panel
        titulo={`Existencias de ${a.nombre}`}
        subtitulo="Lo que hay en el área. Sube con lo que confirmas al recibir, baja con el consumo del plan y se corrige con un conteo."
        className="lg:col-span-8"
        accion={
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={consumido}
              onClick={() => {
                registrarConsumoDeHoy(a);
                toast.success("Consumo de hoy registrado", { description: "Se descontó lo que pide el plan de hoy." });
              }}
              className={SECUNDARIO}
            >
              {consumido ? "Consumo de hoy ya registrado" : "Registrar el consumo de hoy"}
            </button>
            <span className="text-xs text-muted-foreground">Descuenta la producción de hoy según el plan.</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Insumo</th>
                <th className="pb-2 text-right font-medium">Existencia</th>
                <th className="pb-2 text-right font-medium">Consumo de hoy</th>
                <th className="pb-2 font-medium pl-4">Alcanza para</th>
                <th className="pb-2 text-right font-medium">En camino</th>
                <th className="pb-2 font-medium pl-4">Último conteo</th>
                <th className="pb-2 font-medium">Contar</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((sku) => {
                const i = insumoDe(sku);
                const cantidad = e.cantidades[sku] ?? 0;
                const dias = alcance(a, plan, sku, cantidad, consumido);
                const conteo = e.contado[sku];
                return (
                  <tr key={sku} className="border-t border-border">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2">
                        <ImagenProducto codigo={sku} nombre={i.nombre} tamano="sm" />
                        <span>
                          <span className="block font-semibold">{i.nombre}</span>
                          <span className="font-mono text-xs text-muted-foreground">{sku}</span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono font-semibold tabular-nums">{cantidadCon(i.unidad, cantidad)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{hoy.get(sku) ? <>{cantidadCon(i.unidad, Number((hoy.get(sku) ?? 0).toFixed(2)))}{consumido && <span className="block font-sans text-xs text-muted-foreground">ya descontado</span>}</> : "—"}</td>
                    <td className="py-2.5 pl-4">
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", dias === 0 ? "bg-critico/15 text-critico" : dias === 1 ? "bg-alerta/15 text-alerta" : "bg-exito/15 text-exito")}>
                        {dias === 0 ? "No alcanza hoy" : dias === 1 ? (consumido ? "No alcanza mañana" : "Solo hoy") : dias >= 7 - DIA_HOY ? "Toda la semana" : `${cuenta(dias, "día")}`}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{camino.get(sku) ? cantidadCon(i.unidad, camino.get(sku)!) : "—"}</td>
                    <td className="py-2.5 pl-4 text-xs text-muted-foreground">{conteo ? `${conteo.hora} · ${conteo.quien}` : "Sin contar"}</td>
                    <td className="py-2.5">
                      <Contar a={a} sku={sku} actual={cantidad} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel titulo="Movimientos" subtitulo="Entradas, conteos y consumo del día" className="lg:col-span-4">
        {e.movimientos.length ? (
          <ol className="max-h-[70vh] space-y-2 overflow-y-auto text-sm">
            {e.movimientos.map((m, n) => {
              const i = insumoDe(m.sku);
              return (
                <li key={n} className="rounded-xl bg-muted px-3 py-2">
                  <span className="font-mono text-xs text-muted-foreground">{m.hora}</span>{" "}
                  <span className={cn("font-semibold", m.tipo === "entrada" ? "text-exito" : m.tipo === "consumo" ? "text-alerta" : "")}>
                    {m.tipo === "entrada" ? `+${cantidadCon(i.unidad, m.cantidad)}` : m.tipo === "consumo" ? `−${cantidadCon(i.unidad, Math.abs(Number(m.cantidad.toFixed(2))))}` : `= ${cantidadCon(i.unidad, m.cantidad)}`}
                  </span>{" "}
                  {i.nombre}
                  <span className="block text-xs text-muted-foreground">
                    {m.texto} · {m.quien}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Sin movimientos hoy. El conteo inicial fue a las 06:00.</p>
        )}
      </Panel>
    </div>
  );
}
