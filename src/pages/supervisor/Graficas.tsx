import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Gráficas ligeras de la torre (HTML, sin librerías): marcas delgadas con punta redondeada de 4 px
 * sobre la línea base, 2 px de separación, tooltip al pasar el cursor o al enfocar con teclado y
 * vista en tabla. El color nunca va solo: cada serie lleva leyenda o etiqueta.
 */

function CambiarVista({ tabla, onCambio }: { tabla: boolean; onCambio: () => void }) {
  return (
    <button type="button" onClick={onCambio} className="text-xs font-semibold text-primary underline underline-offset-4">
      {tabla ? "Ver gráfica" : "Ver como tabla"}
    </button>
  );
}

function Tooltip({ children, lado = "centro" }: { children: ReactNode; lado?: "centro" | "izq" | "der" }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-[16rem] rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-normal text-foreground shadow-lg",
        lado === "centro" ? "left-1/2 -translate-x-1/2" : lado === "izq" ? "left-0" : "right-0",
      )}
    >
      {children}
    </span>
  );
}

export function Leyenda({ series }: { series: { texto: string; clase: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.texto} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[3px]", s.clase)} aria-hidden /> {s.texto}
        </li>
      ))}
    </ul>
  );
}

// ── Columnas de una serie ───────────────────────────────────────

export interface Columna {
  clave: string;
  /** Etiqueta del eje (corta). */
  eje: string;
  valor: number;
  /** Marca de estado (p. ej. vencidos): lleva color de estado y etiqueta propia. */
  critico?: boolean;
  tooltip: ReactNode;
}

export function Columnas({
  datos,
  alto = 140,
  unidad,
  columnasTabla,
  filasTabla,
  ejeCada = 1,
  valores = "todos",
}: {
  datos: Columna[];
  alto?: number;
  unidad: string;
  columnasTabla: string[];
  filasTabla: ReactNode[][];
  /** Muestra una etiqueta del eje cada n columnas (siempre la última). */
  ejeCada?: number;
  /** Qué valores se rotulan sobre la columna. */
  valores?: "todos" | "maximo" | "ninguno";
}) {
  const [tabla, setTabla] = useState(false);
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const tope = Math.ceil(max / 5) * 5 || 5;
  const iMax = datos.findIndex((d) => d.valor === max);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <CambiarVista tabla={tabla} onCambio={() => setTabla((t) => !t)} />
      </div>
      {tabla ? (
        <TablaSimple columnas={columnasTabla} filas={filasTabla} />
      ) : (
        <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
          {/* Eje Y discreto: tope y cero */}
          <div className="relative text-right text-[11px] text-muted-foreground tabular-nums" style={{ height: alto }}>
            <span className="absolute top-0 right-0 -translate-y-1/2">{tope}</span>
            <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
          </div>
          <div className="relative" style={{ height: alto }} onMouseLeave={() => setFoco(null)}>
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/60" aria-hidden />
            <ul className="absolute inset-0 flex items-end gap-[2px] border-b border-foreground/30" aria-label={`Gráfica en ${unidad}`}>
              {datos.map((d, n) => {
                const pct = (d.valor / tope) * 100;
                const rotular = valores === "todos" ? d.valor > 0 : valores === "maximo" ? n === iMax && d.valor > 0 : false;
                return (
                  <li
                    key={d.clave}
                    tabIndex={0}
                    aria-label={`${d.eje}: ${d.valor} ${unidad}`}
                    onMouseEnter={() => setFoco(n)}
                    onFocus={() => setFoco(n)}
                    onBlur={() => setFoco(null)}
                    className={cn("relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-[4px] outline-none", foco === n && "bg-muted")}
                  >
                    {rotular && <span className="mb-0.5 text-[11px] font-semibold tabular-nums">{d.valor}</span>}
                    <span
                      className={cn("w-full max-w-7 rounded-t-[4px]", d.critico ? "bg-critico" : "bg-primary", foco !== null && foco !== n && "opacity-60")}
                      style={{ height: `${pct}%`, minHeight: d.valor > 0 ? 3 : 0 }}
                    />
                    {foco === n && <Tooltip lado={n < 3 ? "izq" : n > datos.length - 4 ? "der" : "centro"}>{d.tooltip}</Tooltip>}
                  </li>
                );
              })}
            </ul>
          </div>
          <span />
          <div className="mt-1.5 flex gap-[2px] text-[11px] text-muted-foreground">
            {datos.map((d, n) => (
              <span key={d.clave} className={cn("min-w-0 flex-1 text-center whitespace-nowrap", d.critico && "font-semibold text-critico")}>
                {n === datos.length - 1 || (n % ejeCada === 0 && datos.length - 1 - n >= Math.ceil(ejeCada / 2)) ? d.eje : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Entradas (arriba) y salidas (abajo) por hora ────────────────

export function Divergentes({
  datos,
  alto = 160,
}: {
  datos: { clave: string; eje: string; arriba: number; abajo: number; tooltip: ReactNode }[];
  alto?: number;
}) {
  const [tabla, setTabla] = useState(false);
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...datos.flatMap((d) => [d.arriba, d.abajo]));
  const mitad = alto / 2;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Leyenda
          series={[
            { texto: "Entradas por recepción (arriba)", clase: "bg-serie-entrada" },
            { texto: "Salidas por surtido (abajo)", clase: "bg-serie-salida" },
          ]}
        />
        <CambiarVista tabla={tabla} onCambio={() => setTabla((t) => !t)} />
      </div>
      {tabla ? (
        <TablaSimple columnas={["Hora", "Entradas (bultos)", "Salidas (bultos)"]} filas={datos.map((d) => [d.eje, d.arriba, d.abajo])} />
      ) : (
        <div>
          <ul className="relative flex gap-[2px]" style={{ height: alto }} onMouseLeave={() => setFoco(null)} aria-label="Entradas y salidas por hora, en bultos">
            <span className="absolute inset-x-0 border-t border-foreground/30" style={{ top: mitad }} aria-hidden />
            {datos.map((d, n) => (
              <li
                key={d.clave}
                tabIndex={0}
                aria-label={`${d.eje}: ${d.arriba} bultos entraron, ${d.abajo} salieron`}
                onMouseEnter={() => setFoco(n)}
                onFocus={() => setFoco(n)}
                onBlur={() => setFoco(null)}
                className={cn("relative flex min-w-0 flex-1 flex-col items-center rounded-[4px] outline-none", foco === n && "bg-muted")}
              >
                <span className="flex w-full flex-col items-center justify-end" style={{ height: mitad - 1 }}>
                  {d.arriba > 0 && <span className="text-[11px] font-semibold tabular-nums">{d.arriba}</span>}
                  <span className="w-full max-w-7 rounded-t-[4px] bg-serie-entrada" style={{ height: `${(d.arriba / max) * 80}%` }} />
                </span>
                <span className="mt-[2px] flex w-full flex-col items-center justify-start" style={{ height: mitad - 1 }}>
                  <span className="w-full max-w-7 rounded-b-[4px] bg-serie-salida" style={{ height: `${(d.abajo / max) * 80}%` }} />
                  {d.abajo > 0 && <span className="text-[11px] font-semibold tabular-nums">{d.abajo}</span>}
                </span>
                {foco === n && <Tooltip lado={n < 3 ? "izq" : n > datos.length - 4 ? "der" : "centro"}>{d.tooltip}</Tooltip>}
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex gap-[2px] text-[11px] text-muted-foreground">
            {datos.map((d, n) => (
              <span key={d.clave} className="min-w-0 flex-1 text-center">
                {n % 2 === 0 ? d.eje : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composición (barra al 100 %) ────────────────────────────────

export function Composicion({ partes, unidad }: { partes: { texto: string; valor: number; clase: string; icono?: ReactNode }[]; unidad: string }) {
  const [foco, setFoco] = useState<number | null>(null);
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  return (
    <div>
      <div className="relative flex h-4 w-full gap-[2px]" onMouseLeave={() => setFoco(null)} role="img" aria-label={partes.map((p) => `${p.texto}: ${p.valor} ${unidad}`).join(", ")}>
        {partes
          .map((p, n) => ({ p, n }))
          .filter(({ p }) => p.valor > 0)
          .map(({ p, n }, k, visibles) => (
            <span
              key={p.texto}
              onMouseEnter={() => setFoco(n)}
              className={cn("relative h-full", p.clase, k === 0 && "rounded-l-[4px]", k === visibles.length - 1 && "rounded-r-[4px]", foco !== null && foco !== n && "opacity-60")}
              style={{ width: `${(p.valor / total) * 100}%`, minWidth: 4 }}
            >
              {foco === n && (
                <Tooltip lado={k === 0 ? "izq" : k === visibles.length - 1 ? "der" : "centro"}>
                  <b>{p.texto}</b>: {p.valor} {unidad} · {Math.round((p.valor / total) * 100)} %
                </Tooltip>
              )}
            </span>
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {partes.map((p) => (
          <li key={p.texto} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className={cn("size-2.5 rounded-[3px]", p.clase)} aria-hidden />
            {p.icono}
            {p.texto} <b className="font-semibold text-foreground tabular-nums">{Math.round((p.valor / total) * 100)} %</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Barras horizontales de una serie ────────────────────────────

export function Barras({ datos, unidad }: { datos: { texto: string; valor: number; detalle?: string }[]; unidad: string }) {
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1;
  if (!datos.length) return <p className="py-4 text-center text-sm text-muted-foreground">Sin datos.</p>;
  return (
    <ul className="space-y-1" onMouseLeave={() => setFoco(null)}>
      {datos.map((d, n) => (
        <li
          key={d.texto}
          tabIndex={0}
          onMouseEnter={() => setFoco(n)}
          onFocus={() => setFoco(n)}
          onBlur={() => setFoco(null)}
          aria-label={`${d.texto}: ${d.valor} ${unidad}`}
          className={cn("relative grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3 rounded-lg px-1 py-1 outline-none", foco === n && "bg-muted")}
        >
          <span className="truncate text-sm">{d.texto}</span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 rounded-r-[4px] bg-primary" style={{ width: `${(d.valor / max) * 100}%`, minWidth: 4 }} />
            <span className="text-sm font-semibold tabular-nums">{d.valor}</span>
          </span>
          {foco === n && (
            <Tooltip lado="der">
              <b>{d.texto}</b>: {d.valor} {unidad} · {Math.round((d.valor / total) * 100)} % del total
              {d.detalle && <span className="block text-muted-foreground">{d.detalle}</span>}
            </Tooltip>
          )}
        </li>
      ))}
    </ul>
  );
}

export function TablaSimple({ columnas, filas }: { columnas: string[]; filas: ReactNode[][] }) {
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            {columnas.map((c, n) => (
              <th key={c} className={cn("pb-2 font-medium", n > 0 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {filas.map((f, i) => (
            <tr key={i} className="border-t border-border">
              {f.map((v, n) => (
                <td key={n} className={cn("py-1.5", n > 0 && "text-right")}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
