import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CalendarClock, Lock, Search, Trash2, TriangleAlert, Unlock, X } from "lucide-react";
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
import { articuloDe, useExistenciaGlobal, type FilaExistencia, type Movimiento } from "@/data/inventario";
import { cantidadCon, insumoDe } from "@/data/surtido";
import { useSesion } from "@/lib/sesion";
import { cn, cuenta, fechaConAnio, fechaCorta } from "@/lib/utils";
import { Barras, Columnas, Composicion, Divergentes } from "./Graficas";

/** Color y estilo de cada ventana de caducidad (estado: va siempre con texto). */
const TONO_VENTANA: Record<Ventana, { chip: string; barra: string }> = {
  vencido: { chip: "bg-critico/15 text-critico", barra: "bg-critico" },
  "0-7": { chip: "bg-critico/15 text-critico", barra: "bg-critico/55" },
  "8-15": { chip: "bg-alerta/15 text-alerta", barra: "bg-alerta" },
  "16-30": { chip: "bg-alerta/10 text-alerta", barra: "bg-alerta/50" },
  mas30: { chip: "bg-exito/15 text-exito", barra: "bg-exito/70" },
};

function useIndicadores() {
  const estados = estadoLotesStore.use();
  const merma = mermaStore.use();
  const exactitud = exactitudStore.use();
  return indicadoresCaducidad(estados, merma, exactitud);
}

type Indicadores = ReturnType<typeof indicadoresCaducidad>;

const nombreDe = (sku: string) => articuloDe(sku)?.nombre ?? insumoDe(sku).nombre;
const rangoTexto = (rango: string) => {
  if (!rango) return "ya vencieron";
  const [a, b] = rango.split("|");
  return `${fechaCorta(a)} al ${fechaCorta(b)}`;
};

// ── Gráficas de caducidad y merma ───────────────────────────────

function GraficaVencimientos({ k }: { k: Indicadores }) {
  return (
    <Columnas
      unidad="bultos"
      datos={k.vencePorSemana.map((s) => ({
        clave: s.etiqueta,
        eje: s.etiqueta === "Esta semana" ? "Esta sem." : s.etiqueta,
        valor: s.bultos,
        critico: s.etiqueta === "Vencidos",
        tooltip: (
          <>
            <b>{s.etiqueta}</b> · {rangoTexto(s.rango)}
            <span className="block">
              {cuenta(s.bultos, "bulto")} en {cuenta(s.lotes, "lote")}
            </span>
          </>
        ),
      }))}
      columnasTabla={["Semana", "Fechas", "Bultos", "Lotes"]}
      filasTabla={k.vencePorSemana.map((s) => [s.etiqueta, rangoTexto(s.rango), s.bultos, s.lotes])}
    />
  );
}

function GraficaMerma({ k, alto = 120 }: { k: Indicadores; alto?: number }) {
  return (
    <Columnas
      unidad="bultos"
      alto={alto}
      ejeCada={7}
      valores="maximo"
      datos={k.mermaPorDia.map((d, n) => ({
        clave: d.fecha,
        eje: n === 29 ? "Hoy" : fechaCorta(d.fecha),
        valor: d.bultos,
        tooltip: (
          <>
            <b>{n === 29 ? "Hoy" : fechaConAnio(d.fecha)}</b>: {cuenta(d.bultos, "bulto")}
            {d.registros.map((m, i) => (
              <span key={i} className="block text-muted-foreground">
                {nombreDe(m.sku)} · {m.causa.toLowerCase()}
              </span>
            ))}
          </>
        ),
      }))}
      columnasTabla={["Día", "Bultos", "Causas"]}
      filasTabla={k.mermaPorDia.filter((d) => d.bultos).map((d) => [fechaConAnio(d.fecha), d.bultos, d.registros.map((m) => m.causa).join(", ")])}
    />
  );
}

function ComposicionInventario({ k }: { k: Indicadores }) {
  return (
    <Composicion
      unidad="bultos"
      partes={VENTANAS.map((v) => ({ texto: v.nombre, valor: k.porVentana[v.id].bultos, clase: TONO_VENTANA[v.id].barra }))}
    />
  );
}

/** Panel de la torre: inventario próximo a vencer, merma y exactitud por lote con sus gráficas. */
export function IndicadoresLote({ onAbrir }: { onAbrir: (pestana: Pestana) => void }) {
  const k = useIndicadores();
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">KPI-Inventario próximo a vencer</p>
          <p className="mt-0.5 text-3xl font-semibold">{k.proximosPct} %</p>
          <p className="text-xs text-muted-foreground">
            {cuenta(k.proximos, "bulto")} {k.proximos === 1 ? "vence" : "vencen"} en 30 días o menos, de {k.totalBultos}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">KPI-Merma · 30 días</p>
          <p className="mt-0.5 text-3xl font-semibold">{cuenta(k.mermaBultos, "bulto")}</p>
          <p className="text-xs text-muted-foreground">{cuenta(k.mermaRegistros, "descarte")} con causa registrada</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">KPI-Exactitud por lote</p>
          <p className={cn("mt-0.5 text-3xl font-semibold", k.exactitudPct < 95 && "text-alerta")}>{k.exactitudPct} %</p>
          <p className="text-xs text-muted-foreground">
            {k.lecturas - k.difieren} de {cuenta(k.lecturas, "lectura")} coinciden con el sistema
            {k.exactitudPct < 95 && " · meta 95 %"}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Inventario por ventana de caducidad</p>
        <ComposicionInventario k={k} />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="text-sm font-semibold">Qué vence y cuándo</p>
          <p className="text-xs text-muted-foreground">Bultos en posiciones por semana de caducidad</p>
          <GraficaVencimientos k={k} />
        </div>
        <div className="lg:col-span-4">
          <p className="text-sm font-semibold">Merma diaria · últimos 30 días</p>
          <p className="text-xs text-muted-foreground">Bultos descartados por día</p>
          <GraficaMerma k={k} />
        </div>
        <div className="lg:col-span-3">
          <p className="text-sm font-semibold">Merma por causa</p>
          <p className="mb-3 text-xs text-muted-foreground">Bultos · 30 días</p>
          <Barras unidad="bultos" datos={k.mermaPorCausa.map((m) => ({ texto: m.causa, valor: m.bultos }))} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {k.vencidosSinBloquear > 0 ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-critico">
            <TriangleAlert size={16} aria-hidden /> {cuenta(k.vencidosSinBloquear, "lote vencido sigue", "lotes vencidos siguen")} sin bloquear en posiciones
          </p>
        ) : (
          <p className="text-sm text-exito">Ningún lote vencido sin bloquear.</p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => onAbrir("merma")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold">
            <Trash2 size={16} aria-hidden /> Ver merma
          </button>
          <button type="button" onClick={() => onAbrir("caducidad")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold">
            <CalendarClock size={16} aria-hidden /> Ver caducidad por lote
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Existencia global del Almacén Central ───────────────────────

function Mosaico({ etiqueta, valor, contexto, icono, tono }: { etiqueta: string; valor: string | number; contexto: string; icono?: React.ReactNode; tono?: "alerta" | "critico" }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icono} {etiqueta}
      </p>
      <p className="mt-0.5 text-3xl font-semibold tabular-nums">{valor}</p>
      <p className={cn("text-xs", tono === "critico" ? "font-semibold text-critico" : tono === "alerta" ? "font-semibold text-alerta" : "text-muted-foreground")}>{contexto}</p>
    </div>
  );
}

function MosaicosExistencia({ g }: { g: ReturnType<typeof useExistenciaGlobal> }) {
  const t = g.totales;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <Mosaico etiqueta="Existencia" valor={t.existencia} contexto={`bultos · abrió el día con ${t.apertura}`} icono={<Boxes size={15} aria-hidden />} />
      <Mosaico etiqueta="Entradas hoy" valor={`+${t.entradas}`} contexto={`bultos · ${cuenta(t.documentosEntrada, "recepción", "recepciones")}`} icono={<ArrowDownToLine size={15} aria-hidden />} />
      <Mosaico etiqueta="Salidas hoy" valor={`−${t.salidas}`} contexto={`bultos · ${cuenta(t.documentosSalida, "pedido")} surtidos`} icono={<ArrowUpFromLine size={15} aria-hidden />} />
      <Mosaico etiqueta="Merma hoy" valor={t.merma ? `−${t.merma}` : 0} contexto="bultos a descarte" icono={<Trash2 size={15} aria-hidden />} />
      <Mosaico etiqueta="Comprometido" valor={t.comprometido} contexto="bultos de pedidos en cola" />
      <Mosaico
        etiqueta="Alertas de existencia"
        valor={t.faltan + t.bajos}
        contexto={t.faltan ? `${cuenta(t.faltan, "artículo")} no alcanza para lo pedido` : t.bajos ? `${cuenta(t.bajos, "artículo")} con menos de 2 bultos libres` : "Todo alcanza"}
        tono={t.faltan ? "critico" : t.bajos ? "alerta" : undefined}
      />
    </div>
  );
}

function GraficaMovimiento({ g }: { g: ReturnType<typeof useExistenciaGlobal> }) {
  return (
    <Divergentes
      datos={g.porHora.map((h) => ({
        clave: String(h.hora),
        eje: `${h.hora}:00`,
        arriba: h.entradas,
        abajo: h.salidas,
        tooltip: (
          <>
            <b>
              {h.hora}:00 a {h.hora}:59
            </b>
            <span className="block">Entraron {cuenta(h.entradas, "bulto")}</span>
            <span className="block">Salieron {cuenta(h.salidas, "bulto")}</span>
          </>
        ),
      }))}
    />
  );
}

/** Panel de la torre: existencia global del Central y su movimiento del día. */
export function PanelExistencia({ onAbrir }: { onAbrir: () => void }) {
  const g = useExistenciaGlobal();
  const alertas = g.filas.filter((f) => f.estado !== "ok").sort((a, b) => a.disponible / a.articulo.contenido - b.disponible / b.articulo.contenido);
  return (
    <div className="space-y-5">
      <MosaicosExistencia g={g} />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="text-sm font-semibold">Movimiento de hoy por hora</p>
          <p className="text-xs text-muted-foreground">Bultos que entraron por recepción y salieron por surtido</p>
          <div className="mt-2">
            <GraficaMovimiento g={g} />
          </div>
        </div>
        <div className="space-y-5 lg:col-span-5">
          <div>
            <p className="text-sm font-semibold">Salidas de hoy por destino</p>
            <p className="mb-3 text-xs text-muted-foreground">Bultos que ya salieron de posiciones</p>
            <Barras unidad="bultos" datos={g.destinos.map((d) => ({ texto: d.destino, valor: d.bultos }))} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Lo que no alcanza</p>
            {alertas.length ? (
              <ul className="space-y-1.5 text-sm">
                {alertas.slice(0, 4).map((f) => (
                  <li key={f.articulo.sku} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.articulo.nombre}</span>
                    <EstadoExistencia f={f} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-exito">Todo lo pedido tiene existencia libre.</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onAbrir} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold">
          <Boxes size={16} aria-hidden /> Ver existencia por artículo
        </button>
      </div>
    </div>
  );
}

const enBultosTexto = (f: FilaExistencia, n: number) => {
  const b = Math.round((n / f.articulo.contenido) * 10) / 10;
  return `${b} ${b === 1 ? f.articulo.bulto : f.articulo.bultos}`;
};

function EstadoExistencia({ f }: { f: FilaExistencia }) {
  if (f.estado === "ok") return <span className="text-xs text-muted-foreground">Alcanza</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", f.estado === "falta" ? "bg-critico/15 text-critico" : "bg-alerta/15 text-alerta")}>
      <TriangleAlert size={12} aria-hidden /> {f.estado === "falta" ? `Faltan ${enBultosTexto(f, -f.disponible)}` : "Poco libre"}
    </span>
  );
}

function Firmado({ n, signo, clase }: { n: number; signo: "+" | "−"; clase?: string }) {
  return n ? <span className={clase}>{`${signo}${Number(n.toFixed(2)).toLocaleString("en-US")}`}</span> : <span className="text-muted-foreground">—</span>;
}

function TablaExistencias({ filas }: { filas: FilaExistencia[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Artículo</th>
            <th className="pb-2 text-right font-medium">Apertura</th>
            <th className="pb-2 text-right font-medium">Entradas</th>
            <th className="pb-2 text-right font-medium">Salidas</th>
            <th className="pb-2 text-right font-medium">Merma</th>
            <th className="pb-2 text-right font-medium">Existencia</th>
            <th className="pb-2 text-right font-medium" title="Cuarentena y lotes bloqueados">Retenido</th>
            <th className="pb-2 text-right font-medium">Comprometido</th>
            <th className="pb-2 text-right font-medium">Disponible</th>
            <th className="pb-2 pl-3 font-medium">Caduca</th>
            <th className="pb-2 pl-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {filas.map((f) => {
            const retenido = f.cuarentena + f.bloqueado;
            const v = f.proximaCaducidad !== null ? ventanaDe(f.proximaCaducidad) : null;
            return (
              <tr key={f.articulo.sku} className="border-t border-border align-middle">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <ImagenProducto codigo={f.articulo.codigosProveedor[0] ?? f.articulo.sku} nombre={f.articulo.nombre} tamano="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold">{f.articulo.nombre}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {f.articulo.sku} · {f.articulo.unidad}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="py-2 text-right text-muted-foreground">{Number(f.apertura.toFixed(2)).toLocaleString("en-US")}</td>
                <td className="py-2 text-right">
                  <Firmado n={f.entradas} signo="+" clase="font-semibold text-serie-entrada" />
                </td>
                <td className="py-2 text-right">
                  <Firmado n={f.salidas} signo="−" clase="font-semibold text-serie-salida" />
                </td>
                <td className="py-2 text-right">
                  <Firmado n={f.merma} signo="−" clase="font-semibold text-critico" />
                </td>
                <td className="py-2 text-right">
                  <b>{Number(f.existencia.toFixed(2)).toLocaleString("en-US")}</b>
                  <span className="block text-xs text-muted-foreground">{enBultosTexto(f, f.existencia)}</span>
                </td>
                <td className="py-2 text-right">{retenido ? <span title={`Cuarentena ${f.cuarentena} · bloqueado ${f.bloqueado}`}>{Number(retenido.toFixed(2))}</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2 text-right">{f.comprometido ? Number(f.comprometido.toFixed(2)) : <span className="text-muted-foreground">—</span>}</td>
                <td className={cn("py-2 text-right font-semibold", f.disponible < 0 && "text-critico")}>{Number(f.disponible.toFixed(2)).toLocaleString("en-US")}</td>
                <td className="py-2 pl-3 text-xs">
                  {v ? (
                    <span className={cn("rounded-full px-2 py-0.5 font-semibold whitespace-nowrap", TONO_VENTANA[v].chip)}>
                      {f.proximaCaducidad! < 0 ? `venció hace ${Math.abs(f.proximaCaducidad!)} d` : `${f.proximaCaducidad} d`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground" title="Sin lote registrado en posiciones">—</span>
                  )}
                </td>
                <td className="py-2 pl-3">
                  <EstadoExistencia f={f} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TIPO_MOV = {
  entrada: { texto: "Entrada", clase: "bg-serie-entrada/15 text-serie-entrada", signo: "+" },
  salida: { texto: "Salida", clase: "bg-serie-salida/15 text-serie-salida", signo: "−" },
  merma: { texto: "Merma", clase: "bg-critico/15 text-critico", signo: "−" },
} as const;

const ESTADO_SALIDA = { surtido: "en contenedor", transito: "en tránsito", confirmado: "entregado" };

function Kardex({ movimientos }: { movimientos: Movimiento[] }) {
  return (
    <ol className="space-y-2 text-sm">
      {movimientos.map((m, n) => {
        const t = TIPO_MOV[m.tipo];
        const a = articuloDe(m.sku);
        return (
          <li key={n} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-xl bg-muted px-3 py-2">
            <span className="text-xs text-muted-foreground tabular-nums">{m.hora}</span>
            <span className="min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", t.clase)}>{t.texto}</span>
                <b className="tabular-nums">
                  {t.signo}
                  {cuenta(m.bultos, "bulto")}
                </b>
              </span>
              <span className="mt-1 block truncate font-semibold">{a?.nombre ?? m.sku}</span>
              <span className="block text-xs text-muted-foreground">
                {m.tipo === "entrada"
                  ? `${m.documento} · ${m.proveedor}${m.cuarentena ? ` · ${m.cuarentena} a cuarentena` : ""}`
                  : m.tipo === "salida"
                    ? `${m.destino} · ${m.documento} · ${ESTADO_SALIDA[m.estado]}`
                    : `${m.documento} · ${m.causa.toLowerCase()} · ${m.quien}`}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PestanaExistencias() {
  const g = useExistenciaGlobal();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "alerta" | "movimiento">("todos");
  const q = busca.trim().toLowerCase();
  const filas = g.filas
    .filter((f) => !q || f.articulo.nombre.toLowerCase().includes(q) || f.articulo.sku.toLowerCase().includes(q))
    .filter((f) => (filtro === "alerta" ? f.estado !== "ok" : filtro === "movimiento" ? f.entradas || f.salidas || f.merma : true))
    .sort((a, b) => (a.estado === b.estado ? a.articulo.nombre.localeCompare(b.articulo.nombre) : a.estado === "falta" ? -1 : b.estado === "falta" ? 1 : a.estado === "bajo" ? -1 : 1));
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <MosaicosExistencia g={g} />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar artículo o SKU" aria-label="Buscar artículo" className="h-9 w-64 rounded-full border border-input bg-background pr-3 pl-9 text-sm" />
            </label>
            {(
              [
                ["todos", `Todos (${g.filas.length})`],
                ["alerta", `No alcanza o poco libre (${g.totales.faltan + g.totales.bajos})`],
                ["movimiento", "Con movimiento hoy"],
              ] as const
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
          <TablaExistencias filas={filas} />
          <p className="mt-3 text-xs text-muted-foreground">
            Existencia = apertura + entradas − salidas − merma. Disponible = existencia − retenido (cuarentena y lotes bloqueados) − comprometido (pedidos en cola que aún no se toman). Cantidades en la unidad del artículo.
          </p>
        </section>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="font-display font-extrabold">Movimientos de hoy</p>
        <p className="mb-3 text-sm text-muted-foreground">Kárdex del Central: entradas, salidas y merma</p>
        <Kardex movimientos={g.movimientos} />
      </section>
    </div>
  );
}

// ── Pestaña de merma ────────────────────────────────────────────

function PestanaMerma() {
  const k = useIndicadores();
  const merma = mermaStore.use();
  const porArticulo = Object.entries(
    k.mermaPorDia.flatMap((d) => d.registros).reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.sku]: (acc[m.sku] ?? 0) + m.bultos }), {}),
  )
    .map(([sku, bultos]) => ({ texto: nombreDe(sku), valor: bultos }))
    .sort((a, b) => b.valor - a.valor);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Mosaico etiqueta="KPI-Merma · 30 días" valor={cuenta(k.mermaBultos, "bulto")} contexto={`${cuenta(k.mermaRegistros, "descarte")} con causa`} />
            <Mosaico etiqueta="Causa principal" valor={k.mermaPorCausa.slice().sort((a, b) => b.bultos - a.bultos)[0]?.causa ?? "—"} contexto="por bultos descartados" />
            <Mosaico etiqueta="Promedio diario" valor={(k.mermaBultos / 30).toFixed(1)} contexto="bultos por día" />
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="font-display font-extrabold">Merma diaria</p>
          <p className="text-sm text-muted-foreground">Bultos descartados por día, últimos 30 días</p>
          <GraficaMerma k={k} alto={180} />
        </section>
        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 font-display font-extrabold">Por causa</p>
            <Barras unidad="bultos" datos={k.mermaPorCausa.map((m) => ({ texto: m.causa, valor: m.bultos }))} />
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 font-display font-extrabold">Por artículo</p>
            <Barras unidad="bultos" datos={porArticulo} />
          </section>
        </div>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="font-display font-extrabold">Registro de descartes</p>
        <p className="text-sm text-muted-foreground">Cada descarte lleva causa y responsable</p>
        <ol className="mt-3 space-y-2 text-sm">
          {[...merma].reverse().map((m, n) => (
            <li key={n} className="rounded-xl bg-muted px-3 py-2">
              <span className="font-semibold">{nombreDe(m.sku)}</span> · lote {m.lote}
              <span className="block text-xs text-muted-foreground">
                {fechaConAnio(m.fecha)} {m.hora} · {cuenta(m.bultos, "bulto")} · {m.causa} · {m.quien}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ── Pestaña de caducidad por lote ───────────────────────────────

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
                toast.success(`Lote ${b.lote} a descarte`, { description: `${cuenta(b.bultos, "bulto")} cuentan como merma y salen de la existencia: ${causa.toLowerCase()}.` });
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

function PestanaCaducidad({ quien }: { quien: string }) {
  const k = useIndicadores();
  const exactitud = exactitudStore.use();
  const [filtro, setFiltro] = useState<Ventana | "proximos" | "todos">("proximos");
  const lista = INVENTARIO.filter((b) => {
    const v = ventanaDe(diasPara(b));
    return filtro === "todos" ? true : filtro === "proximos" ? v !== "mas30" : v === filtro;
  }).sort((a, b) => diasPara(a) - diasPara(b));
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="grid gap-6 rounded-2xl border border-border bg-card p-5 md:grid-cols-2">
          <div>
            <p className="font-display font-extrabold">KPI-Inventario próximo a vencer · {k.proximosPct} %</p>
            <p className="mb-3 text-sm text-muted-foreground">
              {cuenta(k.proximos, "bulto")} de {k.totalBultos} vencen en 30 días o menos
            </p>
            <ComposicionInventario k={k} />
          </div>
          <div>
            <p className="font-display font-extrabold">Qué vence y cuándo</p>
            <p className="text-sm text-muted-foreground">Bultos por semana de caducidad</p>
            <GraficaVencimientos k={k} />
          </div>
        </section>
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
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="font-display font-extrabold">KPI-Exactitud por lote</p>
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
  );
}

// ── Visor de inventario ─────────────────────────────────────────

export type Pestana = "existencias" | "caducidad" | "merma";

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: "existencias", texto: "Existencias" },
  { id: "caducidad", texto: "Caducidad por lote" },
  { id: "merma", texto: "Merma" },
];

export function VisorInventario({ pestana: inicial, onCerrar }: { pestana: Pestana; onCerrar: () => void }) {
  const sesion = useSesion();
  const quien = sesion?.nombre ?? SUPERVISOR.nombre;
  const [pestana, setPestana] = useState(inicial);
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

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-muted" role="dialog" aria-modal="true" aria-label="Inventario del Almacén Central">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-6 py-3">
        <Boxes size={20} className="text-primary" aria-hidden />
        <p className="font-display text-lg font-extrabold">Inventario · Almacén Central</p>
        <div className="inline-flex rounded-xl bg-muted p-0.5" role="tablist">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={cn("min-h-9 rounded-lg px-3 text-sm font-semibold", pestana === p.id ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {p.texto}
            </button>
          ))}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="ml-auto grid size-11 place-items-center rounded-full border border-border bg-card">
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {pestana === "existencias" ? <PestanaExistencias /> : pestana === "merma" ? <PestanaMerma /> : <PestanaCaducidad quien={quien} />}
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
