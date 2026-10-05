import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { PanelId } from "@/data/analisisDireccion";
import { DISPONIBILIDAD, usd, type Disponibilidad, type Fila } from "@/data/direccion";
import { cn } from "@/lib/utils";

/** Piezas compartidas de la Torre de Dirección: panel, selector, panel lateral y desglose por niveles. */

export function Panel({ titulo, subtitulo, children, className, accion, onAnalizar }: { titulo: string; subtitulo?: string; children: ReactNode; className?: string; accion?: ReactNode; onAnalizar?: () => void }) {
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

export function Selector<T extends string | number>({ valor, opciones, onCambio, etiqueta }: { valor: T; opciones: { id: T; texto: string }[]; onCambio: (v: T) => void; etiqueta: string }) {
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

/** Lo que abre el panel lateral: detalle (desglose) y, si aplica, el análisis del panel. */
export interface Lateral {
  titulo: string;
  detalle: ReactNode;
  panel?: PanelId;
  pestana?: "detalle" | "analisis";
  disponibilidad?: Disponibilidad;
}

export function Fuente({ d }: { d: Disponibilidad }) {
  return (
    <p className="mb-3 inline-block rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      Fuente del dato: <b className="font-semibold text-foreground">{d}</b> · {DISPONIBILIDAD[d]}
    </p>
  );
}

/** Tabla de detalle operacional con su total: siempre suma lo mismo que el nivel de arriba. */
export function TablaFilas({ columnas, filas, total }: { columnas: string[]; filas: Fila[]; total: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            {columnas.map((c) => (
              <th key={c} className="pr-2 pb-2 font-medium">
                {c}
              </th>
            ))}
            <th className="pb-2 text-right font-medium">USD</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-t border-border align-top">
              {f.celdas.map((c, k) => (
                <td key={k} className={cn("py-1.5 pr-2", k === 0 && "font-semibold", c.includes("investigación") && "text-alerta")}>
                  {c}
                </td>
              ))}
              <td className="py-1.5 text-right font-semibold tabular-nums">{usd(f.usd)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-foreground/30 font-semibold">
            <td className="py-1.5" colSpan={columnas.length}>
              Total
            </td>
            <td className="py-1.5 text-right tabular-nums">{usd(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export interface ItemDesglose {
  id: string;
  nombre: string;
  usd: number;
  clase?: string;
  nota?: string;
  columnas: string[];
  filas: Fila[];
}

/**
 * Desglose en niveles: Dirección (el total) → causa o dominio (barras) → detalle operacional
 * (tabla que suma exactamente lo de la causa).
 */
export function Desglose({ raiz, total, items, inicial }: { raiz: string; total: number; items: ItemDesglose[]; inicial?: string }) {
  const [abierto, setAbierto] = useState<string | null>(inicial ?? null);
  const item = items.find((x) => x.id === abierto);
  const max = Math.max(...items.map((x) => x.usd), 1);
  return (
    <div>
      <nav aria-label="Nivel del desglose" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button type="button" onClick={() => setAbierto(null)} className={cn(!item && "font-semibold text-foreground")}>
          {raiz} · USD {usd(total)}
        </button>
        {item && (
          <>
            <ChevronRight size={12} aria-hidden />
            <span className="font-semibold text-foreground">{item.nombre}</span>
          </>
        )}
      </nav>
      {item ? (
        <div className="space-y-3">
          {item.nota && <p className="text-muted-foreground">{item.nota}</p>}
          <TablaFilas columnas={item.columnas} filas={item.filas} total={item.usd} />
          <button type="button" onClick={() => setAbierto(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <ChevronLeft size={13} aria-hidden /> Volver a las causas
          </button>
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setAbierto(x.id)} className="grid w-full grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-muted">
                <span className="truncate">{x.nombre}</span>
                <span className="h-3 rounded-r-[4px]" style={{ width: `${(x.usd / max) * 100}%`, minWidth: 4 }}>
                  <span className={cn("block h-full rounded-r-[4px]", x.clase ?? "bg-primary")} />
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {usd(x.usd)} <span className="font-normal text-muted-foreground">· {Math.round((x.usd / total) * 100)} %</span>
                </span>
              </button>
            </li>
          ))}
          <li className="pt-1 text-xs text-muted-foreground">Toca una causa para ver el detalle operacional.</li>
        </ul>
      )}
    </div>
  );
}

/** Desglose de un porcentaje (fill rate, OTIF, plan) por canal, proveedor o área. */
export function TablaPorcentaje({ columnas, filas }: { columnas: string[]; filas: { nombre: string; hecho: number; base: number }[] }) {
  const th = filas.reduce((s, f) => s + f.hecho, 0);
  const tb = filas.reduce((s, f) => s + f.base, 0);
  const pct = (a: number, b: number) => `${(Math.round((a / b) * 1000) / 10).toFixed(1)} %`;
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          {columnas.map((c, i) => (
            <th key={c} className={cn("pb-2 font-medium", i > 0 && "text-right")}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.nombre} className="border-t border-border">
            <td className="py-1.5">{f.nombre}</td>
            <td className="py-1.5 text-right">{usd(f.hecho)}</td>
            <td className="py-1.5 text-right">{usd(f.base)}</td>
            <td className="py-1.5 text-right font-semibold">{pct(f.hecho, f.base)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-foreground/30 font-semibold">
          <td className="py-1.5">Total</td>
          <td className="py-1.5 text-right">{usd(th)}</td>
          <td className="py-1.5 text-right">{usd(tb)}</td>
          <td className="py-1.5 text-right">{pct(th, tb)}</td>
        </tr>
      </tbody>
    </table>
  );
}
