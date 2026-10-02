import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CircleAlert, Lock, Trash2, TriangleAlert, Unlock, X } from "lucide-react";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import {
  CAUSAS_MERMA,
  INVENTARIO,
  VENTANAS,
  bloquearLote,
  descartarLote,
  diasPara,
  estadoLotesStore,
  exactitudStore,
  indicadoresCaducidad,
  liberarLote,
  mermaStore,
  politicaStore,
  ventanaDe,
  type BultoLote,
  type Ventana,
} from "@/data/caducidad";
import { SUPERVISOR } from "@/data/incidencias";
import { cantidadCon, insumoDe } from "@/data/surtido";
import { useSesion } from "@/lib/sesion";
import { cn, cuenta, fechaConAnio } from "@/lib/utils";

const TONO_VENTANA: Record<Ventana, { chip: string; icono: typeof CircleAlert }> = {
  vencido: { chip: "bg-critico/15 text-critico", icono: TriangleAlert },
  "0-7": { chip: "bg-critico/15 text-critico", icono: CircleAlert },
  "8-15": { chip: "bg-alerta/15 text-alerta", icono: CircleAlert },
  "16-30": { chip: "bg-alerta/10 text-alerta", icono: CalendarClock },
  mas30: { chip: "bg-exito/15 text-exito", icono: CalendarClock },
};

function useIndicadores() {
  const estados = estadoLotesStore.use();
  const merma = mermaStore.use();
  const exactitud = exactitudStore.use();
  return indicadoresCaducidad(estados, merma, exactitud);
}

/** KPI-14, KPI-15 y KPI-23 para la torre de control. */
export function IndicadoresLote({ onAbrir }: { onAbrir: () => void }) {
  const k = useIndicadores();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Próximo a vencer · KPI-14</p>
          <p className="mt-0.5 text-3xl font-semibold">{k.proximosPct} %</p>
          <p className="text-xs text-muted-foreground">
            {cuenta(k.proximos, "bulto")} {k.proximos === 1 ? "vence" : "vencen"} en 30 días o menos, de {k.totalBultos}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Merma · 30 días · KPI-15</p>
          <p className="mt-0.5 text-3xl font-semibold">{cuenta(k.mermaBultos, "bulto")}</p>
          <p className="text-xs text-muted-foreground">{k.mermaPorCausa.map((m) => `${m.causa.toLowerCase()}: ${m.bultos}`).join(" · ") || "sin descartes"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Exactitud de lote · KPI-23</p>
          <p className={cn("mt-0.5 text-3xl font-semibold", k.exactitudPct < 95 && "text-alerta")}>{k.exactitudPct} %</p>
          <p className="text-xs text-muted-foreground">
            {k.lecturas - k.difieren} de {cuenta(k.lecturas, "lectura")} coinciden con el sistema
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {VENTANAS.map((v) => {
          const t = TONO_VENTANA[v.id];
          const Icono = t.icono;
          return (
            <div key={v.id} className="rounded-xl border border-border p-2.5">
              <p className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", t.chip)}>
                <Icono size={12} aria-hidden /> {v.nombre}
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{k.porVentana[v.id].bultos}</p>
              <p className="text-xs text-muted-foreground">{cuenta(k.porVentana[v.id].lotes, "lote")}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {k.vencidosSinBloquear > 0 ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-critico">
            <TriangleAlert size={16} aria-hidden /> {cuenta(k.vencidosSinBloquear, "lote vencido sigue", "lotes vencidos siguen")} sin bloquear en posiciones
          </p>
        ) : (
          <p className="text-sm text-exito">Ningún lote vencido sin bloquear.</p>
        )}
        <button type="button" onClick={onAbrir} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold">
          <CalendarClock size={16} aria-hidden /> Ver caducidad por lote
        </button>
      </div>
    </div>
  );
}

/** Política de vida útil mínima al recibir, en la sección de Configuración. */
export function ConfigVidaUtil() {
  const p = politicaStore.use();
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="font-semibold">Vida útil mínima al recibir</p>
      {(["refrigerado", "seco"] as const).map((k) => (
        <label key={k} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{k === "refrigerado" ? "Refrigerado y congelado (días)" : "Seco (días)"}</span>
          <input
            type="number"
            min={1}
            value={p[k]}
            onChange={(e) => politicaStore.set((x) => ({ ...x, [k]: Math.max(1, Number(e.target.value) || 1) }))}
            className="h-9 w-20 rounded-lg border border-input bg-background px-2 text-right tabular-nums"
          />
        </label>
      ))}
      <p className="text-xs text-muted-foreground">Si al lote le quedan menos días, el recibidor lo manda a cuarentena y decide Calidad.</p>
    </div>
  );
}

// ── Visor de caducidad por lote ─────────────────────────────────

function FilaLote({ b, quien }: { b: BultoLote; quien: string }) {
  const estado = estadoLotesStore.use()[b.id];
  const [descartando, setDescartando] = useState(false);
  const [causa, setCausa] = useState("");
  const i = insumoDe(b.sku);
  const dias = diasPara(b);
  const v = ventanaDe(dias);
  return (
    <tr className={cn("border-t border-border align-middle", estado?.estado === "descarte" && "opacity-50")}>
      <td className="py-2.5 pr-3">
        <span className="flex items-center gap-2">
          <ImagenProducto codigo={b.sku} nombre={i.nombre} tamano="sm" />
          <span>
            <span className="block font-semibold">{i.nombre}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {b.sku} · lote {b.lote}
            </span>
          </span>
        </span>
      </td>
      <td className="py-2.5 font-mono text-xs">{b.posicion}</td>
      <td className="py-2.5 text-sm">{fechaConAnio(b.caducidad)}</td>
      <td className="py-2.5">
        <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", TONO_VENTANA[v].chip)}>{dias < 0 ? `venció hace ${Math.abs(dias)} d` : dias === 0 ? "vence hoy" : `${dias} d`}</span>
      </td>
      <td className="py-2.5 text-right font-mono text-sm tabular-nums">
        {b.bultos}
        <span className="block text-xs text-muted-foreground">{cantidadCon(i.unidad, b.cantidad)}</span>
      </td>
      <td className="py-2.5 pl-3 text-xs">
        {estado ? (
          <span className={cn("rounded-full px-2 py-0.5 font-semibold", estado.estado === "descarte" ? "bg-muted text-muted-foreground" : "bg-alerta/15 text-alerta")}>
            {estado.estado === "descarte" ? `En descarte · ${estado.causa?.toLowerCase()}` : "Bloqueado"}
          </span>
        ) : (
          <span className="text-muted-foreground">Disponible</span>
        )}
        {estado && <span className="mt-0.5 block text-muted-foreground">{estado.hora} · {estado.quien}</span>}
      </td>
      <td className="py-2.5 pl-3">
        {estado?.estado === "descarte" ? null : descartando ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <select aria-label={`Causa del descarte de ${b.lote}`} value={causa} onChange={(e) => setCausa(e.target.value)} className="h-8 rounded-lg border border-input bg-background px-2 text-xs">
              <option value="">Causa…</option>
              {CAUSAS_MERMA.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!causa}
              onClick={() => {
                descartarLote(b, causa, quien);
                toast.success(`Lote ${b.lote} a descarte`, { description: `${cuenta(b.bultos, "bulto")} cuentan como merma: ${causa.toLowerCase()}.` });
              }}
              className="min-h-8 rounded-lg bg-critico px-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setDescartando(false)} className="min-h-8 px-1 text-xs text-muted-foreground underline">
              Cancelar
            </button>
          </span>
        ) : (
          <span className="flex gap-1.5">
            {estado?.estado === "bloqueado" ? (
              <button type="button" onClick={() => liberarLote(b)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold">
                <Unlock size={13} aria-hidden /> Liberar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  bloquearLote(b, quien);
                  toast(`Lote ${b.lote} bloqueado`, { description: "Nadie lo surte hasta que se libere o se descarte." });
                }}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold"
              >
                <Lock size={13} aria-hidden /> Bloquear
              </button>
            )}
            <button type="button" onClick={() => setDescartando(true)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-critico/40 px-2 text-xs font-semibold text-critico">
              <Trash2 size={13} aria-hidden /> A descarte
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

export function VisorCaducidad({ onCerrar }: { onCerrar: () => void }) {
  const sesion = useSesion();
  const quien = sesion?.nombre ?? SUPERVISOR.nombre;
  const k = useIndicadores();
  const merma = mermaStore.use();
  const exactitud = exactitudStore.use();
  const [filtro, setFiltro] = useState<Ventana | "proximos" | "todos">("proximos");
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);

  const lista = INVENTARIO.filter((b) => {
    const v = ventanaDe(diasPara(b));
    return filtro === "todos" ? true : filtro === "proximos" ? v !== "mas30" : v === filtro;
  }).sort((a, b) => diasPara(a) - diasPara(b));

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-muted" role="dialog" aria-modal="true" aria-label="Lote y caducidad">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-6 py-3">
        <CalendarClock size={20} className="text-primary" aria-hidden />
        <p className="font-display text-lg font-extrabold">Lote y caducidad</p>
        <span className="text-sm text-muted-foreground">Semáforo por lote en posiciones · bloquear y mandar a descarte</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="ml-auto grid size-11 place-items-center rounded-full border border-border bg-card">
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["proximos", `Vencidos y próximos (${k.porVentana.vencido.lotes + k.porVentana["0-7"].lotes + k.porVentana["8-15"].lotes + k.porVentana["16-30"].lotes})`],
                ...VENTANAS.map((v) => [v.id, `${v.nombre} (${k.porVentana[v.id].lotes})`]),
                ["todos", "Todos"],
              ] as [typeof filtro, string][]
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filtro === id}
                onClick={() => setFiltro(id)}
                className={cn("min-h-9 rounded-full border px-3 text-sm font-semibold", filtro === id ? "border-primary bg-primary-soft text-primary" : "border-border")}
              >
                {texto}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Insumo y lote</th>
                  <th className="pb-2 font-medium">Posición</th>
                  <th className="pb-2 font-medium">Caduca</th>
                  <th className="pb-2 font-medium">Faltan</th>
                  <th className="pb-2 text-right font-medium">Bultos</th>
                  <th className="pb-2 pl-3 font-medium">Estado</th>
                  <th className="pb-2 pl-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((b) => (
                  <FilaLote key={b.id} b={b} quien={quien} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="font-display font-extrabold">Merma · últimos 30 días · KPI-15</p>
            <p className="text-sm text-muted-foreground">{cuenta(k.mermaBultos, "bulto")} en {cuenta(k.mermaRegistros, "descarte")}</p>
            <ol className="mt-3 space-y-2 text-sm">
              {[...merma].reverse().map((m, n) => (
                <li key={n} className="rounded-xl bg-muted px-3 py-2">
                  <span className="font-semibold">{insumoDe(m.sku).nombre}</span> · lote {m.lote}
                  <span className="block text-xs text-muted-foreground">
                    {fechaConAnio(m.fecha)} {m.hora} · {cuenta(m.bultos, "bulto")} · {m.causa} · {m.quien}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="font-display font-extrabold">Exactitud de lote · KPI-23</p>
            <p className="text-sm text-muted-foreground">
              {k.exactitudPct} % · {exactitud.difieren} de {cuenta(k.lecturas, "lectura")} no coincidieron
            </p>
            {exactitud.eventos.length ? (
              <ol className="mt-3 space-y-2 text-sm">
                {exactitud.eventos.map((e, n) => (
                  <li key={n} className="rounded-xl bg-alerta/10 px-3 py-2">
                    {e.posicion}: el sistema decía <b className="font-mono">{e.esperado}</b> y se leyó <b className="font-mono">{e.leido}</b>
                    <span className="block text-xs text-muted-foreground">
                      {e.hora} · {e.quien}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Hoy no hay diferencias. Las del mes son datos de ejemplo.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
