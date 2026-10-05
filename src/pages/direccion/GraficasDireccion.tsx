import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CAUSAS, ESCENARIO, IMPACTO_MENSUAL, MESES, SUPUESTO_ESCENARIO, totalMes, usd } from "@/data/direccion";
import { Leyenda, TablaSimple } from "../supervisor/Graficas";

function CambiarVista({ tabla, onCambio }: { tabla: boolean; onCambio: () => void }) {
  return (
    <button type="button" onClick={onCambio} className="text-xs font-semibold text-primary underline underline-offset-4">
      {tabla ? "Ver gráfica" : "Ver como tabla"}
    </button>
  );
}

// ── Impacto económico por causa y escenario proyectado ─────────

export function GraficaImpacto() {
  const [tabla, setTabla] = useState(false);
  const [foco, setFoco] = useState<number | null>(null);
  const W = 640;
  const H = 230;
  const izq = 40;
  const abajo = 24;
  const arriba = 14;
  const tope = 26000;
  const ancho = (W - izq) / 12;
  const y = (v: number) => arriba + (H - arriba - abajo) * (1 - v / tope);
  const x = (i: number) => izq + ancho * i + ancho / 2;
  const linea = (vals: number[]) => [8, 9, 10, 11].map((i, k) => `${k ? "L" : "M"}${x(i)},${y(k === 0 ? totalMes(8) : vals[k - 1])}`).join(" ");
  const meses = IMPACTO_MENSUAL.merma.map((_, i) => i);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Leyenda
          series={[
            ...CAUSAS.map((c) => ({ texto: c.nombre, clase: c.clase })),
            { texto: "Escenario base", clase: "bg-muted-foreground" },
            { texto: "Escenario objetivo con WMS", clase: "bg-exito" },
          ]}
        />
        <CambiarVista tabla={tabla} onCambio={() => setTabla((t) => !t)} />
      </div>
      {tabla ? (
        <TablaSimple
          columnas={["Mes", ...CAUSAS.map((c) => c.nombre), "Total"]}
          filas={[
            ...meses.map((i) => [MESES[i], ...CAUSAS.map((c) => usd(IMPACTO_MENSUAL[c.id][i])), usd(totalMes(i))]),
            ...ESCENARIO.base.map((b, k) => [`${MESES[9 + k]} (escenario)`, "—", "—", "—", "—", `base ${usd(b)} · objetivo ${usd(ESCENARIO.objetivo[k])}`]),
          ]}
        />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Impacto económico de excepciones por mes y causa, de enero a septiembre, con escenario proyectado a diciembre" onMouseLeave={() => setFoco(null)}>
            {[0, 6500, 13000, 19500, 26000].map((v) => (
              <g key={v}>
                <line x1={izq} x2={W} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v ? "3 3" : undefined} />
                <text x={izq - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {v ? `${v / 1000}K` : 0}
                </text>
              </g>
            ))}
            <rect x={x(8) + ancho / 2} y={arriba} width={W - x(8) - ancho / 2} height={H - arriba - abajo} className="fill-muted/60" />
            <text x={x(8) + ancho / 2 + 4} y={H - abajo - 5} className="fill-muted-foreground text-[10px]">
              escenario proyectado
            </text>
            {meses.map((i) => {
              const w = ancho * 0.62;
              let base = 0;
              return (
                <g key={i} onMouseEnter={() => setFoco(i)} className={cn(foco !== null && foco !== i && "opacity-60")}>
                  <rect x={x(i) - ancho / 2} y={arriba} width={ancho} height={H - arriba - abajo} className="fill-transparent" />
                  {CAUSAS.map((c, k) => {
                    const v = IMPACTO_MENSUAL[c.id][i];
                    const y0 = y(base);
                    const y1 = y(base + v);
                    base += v;
                    const ultimo = k === CAUSAS.length - 1;
                    // 2 px de separación entre segmentos; el de arriba lleva la punta redondeada.
                    const alto = Math.max(0, y0 - y1 - (k ? 2 : 0));
                    return ultimo ? (
                      <path key={c.id} d={`M${x(i) - w / 2},${y1 + alto} V${y1 + 4} Q${x(i) - w / 2},${y1} ${x(i) - w / 2 + 4},${y1} H${x(i) + w / 2 - 4} Q${x(i) + w / 2},${y1} ${x(i) + w / 2},${y1 + 4} V${y1 + alto} Z`} className={c.trazo} />
                    ) : (
                      <rect key={c.id} x={x(i) - w / 2} y={y1} width={w} height={alto} className={c.trazo} />
                    );
                  })}
                </g>
              );
            })}
            <path d={linea(ESCENARIO.base)} fill="none" className="stroke-muted-foreground" strokeWidth={2} strokeDasharray="5 4" />
            <path d={linea(ESCENARIO.objetivo)} fill="none" className="stroke-exito" strokeWidth={2} strokeDasharray="5 4" />
            {[9, 10, 11].map((i, k) => (
              <g key={i}>
                <circle cx={x(i)} cy={y(ESCENARIO.base[k])} r={4} className="fill-muted-foreground stroke-card" strokeWidth={2} />
                <circle cx={x(i)} cy={y(ESCENARIO.objetivo[k])} r={4} className="fill-exito stroke-card" strokeWidth={2} />
              </g>
            ))}
            <text x={x(11)} y={y(ESCENARIO.base[2]) - 9} textAnchor="end" className="fill-foreground text-[11px] font-semibold">
              base {usd(ESCENARIO.base[2])}
            </text>
            <text x={x(11)} y={y(ESCENARIO.objetivo[2]) + 17} textAnchor="end" className="fill-exito text-[11px] font-semibold">
              objetivo {usd(ESCENARIO.objetivo[2])}
            </text>
            {MESES.map((m, i) => (
              <text key={m} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {m}
              </text>
            ))}
          </svg>
          {foco !== null && (
            <span role="tooltip" className="pointer-events-none absolute top-2 z-10 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg" style={{ left: `${Math.min(66, (x(foco) / W) * 100)}%` }}>
              <b>{MESES[foco]}</b>: USD {usd(totalMes(foco))}
              {CAUSAS.map((c) => (
                <span key={c.id} className="block">
                  {c.nombre} {usd(IMPACTO_MENSUAL[c.id][foco])}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{SUPUESTO_ESCENARIO}</p>
    </div>
  );
}

// ── Dona con leyenda ────────────────────────────────────────────

export interface Rebanada {
  texto: string;
  valor: number;
  /** Clase del trazo en la dona (stroke-…) y del punto en la leyenda (bg-…). */
  clase: string;
  punto: string;
  detalle?: string;
  icono?: ReactNode;
}

export function Dona({ rebanadas, centro, subcentro, onElegir }: { rebanadas: Rebanada[]; centro: string; subcentro: string; onElegir?: (r: Rebanada) => void }) {
  const [tabla, setTabla] = useState(false);
  const [foco, setFoco] = useState<number | null>(null);
  const total = rebanadas.reduce((s, r) => s + r.valor, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <CambiarVista tabla={tabla} onCambio={() => setTabla((t) => !t)} />
      </div>
      {tabla ? (
        <TablaSimple columnas={["Segmento", "USD", "%"]} filas={rebanadas.map((r) => [r.texto, usd(r.valor), `${((r.valor / total) * 100).toFixed(1)} %`])} />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-36 shrink-0">
            <svg viewBox="0 0 140 140" className="size-full -rotate-90" onMouseLeave={() => setFoco(null)} role="img" aria-label={rebanadas.map((r) => `${r.texto}: ${usd(r.valor)} USD`).join(", ")}>
              {rebanadas.map((r, i) => {
                const largo = (r.valor / total) * C;
                // 2 px de separación entre rebanadas
                const trazo = Math.max(0, largo - 2);
                const el = (
                  <circle
                    key={r.texto}
                    cx={70}
                    cy={70}
                    r={R}
                    fill="none"
                    strokeWidth={foco === i ? 18 : 15}
                    strokeDasharray={`${trazo} ${C - trazo}`}
                    strokeDashoffset={-acumulado}
                    className={cn(r.clase, onElegir && "cursor-pointer")}
                    onMouseEnter={() => setFoco(i)}
                    onClick={() => onElegir?.(r)}
                  />
                );
                acumulado += largo;
                return el;
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <span>
                <span className="block text-xl font-semibold tabular-nums">{foco !== null ? usd(rebanadas[foco].valor) : centro}</span>
                <span className="block text-[11px] text-muted-foreground">{foco !== null ? rebanadas[foco].texto : subcentro}</span>
              </span>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-2 text-sm">
            {rebanadas.map((r, i) => (
              <li key={r.texto}>
                <button type="button" onClick={() => onElegir?.(r)} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} className="flex w-full items-start justify-between gap-2 text-left">
                  <span className="flex items-start gap-2">
                    <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", r.punto)} aria-hidden />
                    <span>
                      {r.texto}
                      {r.detalle && <span className="block text-xs text-muted-foreground">{r.detalle}</span>}
                    </span>
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {usd(r.valor)}
                    <span className="block text-xs font-normal text-muted-foreground">{((r.valor / total) * 100).toFixed(1)} %</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Mapa de calor ───────────────────────────────────────────────

export function MapaCalor({ filas, columnas, maximo = 6, unidad = "h" }: { filas: [string, number[]][]; columnas: string[]; maximo?: number; unidad?: string }) {
  const [tabla, setTabla] = useState(false);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <CambiarVista tabla={tabla} onCambio={() => setTabla((t) => !t)} />
      </div>
      {tabla ? (
        <TablaSimple columnas={["Área", ...columnas]} filas={filas.map(([n, v]) => [n, ...v.map((x) => x.toFixed(1))])} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] border-separate border-spacing-[2px] text-sm">
            <thead>
              <tr>
                <th />
                {columnas.map((c) => (
                  <th key={c} className="pb-1 text-center text-xs font-medium text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(([nombre, valores]) => (
                <tr key={nombre}>
                  <th scope="row" className="pr-3 text-left font-normal whitespace-nowrap">
                    {nombre}
                  </th>
                  {valores.map((v, i) => {
                    const t = Math.min(1, v / maximo);
                    return (
                      <td
                        key={i}
                        title={`${nombre} · ${columnas[i]}: ${v.toFixed(1)} ${unidad}`}
                        className={cn("h-9 rounded-[4px] text-center font-semibold tabular-nums", t > 0.55 ? "text-white" : "text-foreground")}
                        // Una sola tonalidad (rojo de alerta) de claro a oscuro: más horas, más intenso.
                        style={{ background: `color-mix(in oklch, var(--critico) ${Math.round(12 + t * 88)}%, var(--card))` }}
                      >
                        {v.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            Sin retraso
            <span className="h-2 w-24 rounded-full" style={{ background: "linear-gradient(to right, color-mix(in oklch, var(--critico) 12%, var(--card)), var(--critico))" }} aria-hidden />
            {maximo} {unidad} o más
          </div>
        </div>
      )}
    </div>
  );
}
