import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { Barcode, ChevronRight, FileText, Printer, X } from "lucide-react";
import { EstadoChip } from "@/components/incidencias/Avisos";
import { EMPRESA, documentoCompra, documentoSurtido, ordenesDeCompra, ordenesDeSurtido, type DocOrden, type EtiquetaGS1, type Tono } from "@/data/documentos";
import { incidenciasStore } from "@/data/incidencias";
import { ordenesStore } from "@/data/ordenes";
import { recepcionesStore } from "@/data/recepciones";
import { pedidosAreaStore, surtidoStore } from "@/data/surtido";
import { codigoGS1, textoGS1 } from "@/lib/gs1";
import { cn, cuenta, fechaEtiqueta } from "@/lib/utils";

// ── Códigos ─────────────────────────────────────────────────────

function Qr({ texto, className }: { texto: string; className?: string }) {
  const { n, d } = useMemo(() => {
    const { modules } = QRCode.create(texto, { errorCorrectionLevel: "M" });
    let d = "";
    for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return { n: modules.size, d };
  }, [texto]);
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} shapeRendering="crispEdges" className={className} role="img" aria-label={`Código QR: ${texto}`}>
      <rect x={-1} y={-1} width={n + 2} height={n + 2} fill="#ffffff" />
      <path d={d} fill="#1d1a1c" />
    </svg>
  );
}

function Barras({ valor }: { valor: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, valor, {
      format: "CODE128",
      height: 64,
      width: 2,
      margin: 0,
      fontSize: 18,
      font: "JetBrains Mono, monospace",
      textMargin: 6,
      background: "transparent",
      lineColor: "#1d1a1c",
    });
  }, [valor]);
  return <svg ref={ref} className="h-auto max-w-full" role="img" aria-label={`Código de barras Code 128: ${valor}`} />;
}

/** GS1-128: Code 128 con FNC1 inicial; el texto de abajo lleva los identificadores entre paréntesis. */
function BarrasGS1({ e }: { e: EtiquetaGS1 }) {
  const ref = useRef<SVGSVGElement>(null);
  const texto = textoGS1(e);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, codigoGS1(e), {
      format: "CODE128",
      ean128: true,
      text: texto,
      height: 110,
      width: 2,
      margin: 0,
      fontSize: 22,
      font: "JetBrains Mono, monospace",
      textMargin: 6,
      background: "#ffffff",
      lineColor: "#1d1a1c",
    });
  }, [e, texto]);
  return <svg ref={ref} className="block h-auto max-h-full w-full" role="img" aria-label={`Código GS1-128: ${texto}`} />;
}

// ── Documento (papel: siempre claro, como impreso) ───────────────

const TINTA_TONO: Record<Tono, string> = {
  ok: "border-[#1f7a45] text-[#1f7a45]",
  alerta: "border-[#a15c00] text-[#a15c00]",
  critico: "border-[#c0262d] text-[#c0262d]",
  info: "border-[#1f5aa6] text-[#1f5aa6]",
  neutro: "border-[#6b6468] text-[#6b6468]",
};

function Sello({ tono, children }: { tono: Tono; children: string }) {
  return <span className={cn("inline-block rounded-md border-2 px-2 py-0.5 text-xs font-bold tracking-[0.12em] uppercase", TINTA_TONO[tono])}>{children}</span>;
}

const ETIQUETA = "text-[11px] font-semibold tracking-[0.14em] text-[#6b6468] uppercase";

export function DocumentoOrden({ doc }: { doc: DocOrden }) {
  const avance = !!doc.columnaAvance;
  return (
    <article className="imprimible @container mx-auto w-full max-w-[900px] rounded-2xl border border-[#e4dfe2] bg-white p-5 text-[#1d1a1c] shadow-sm sm:p-8">
      {/* Encabezado */}
      <div className="grid gap-6 @2xl:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="font-display text-3xl font-extrabold text-[#d50062]">MOMI</p>
          <p className="mt-1 text-sm text-[#6b6468]">
            {EMPRESA.nombre} · {EMPRESA.pais} · <span className="whitespace-nowrap">RUC {EMPRESA.ruc}</span>
          </p>
          <p className="mt-6 font-display text-sm font-extrabold tracking-[0.18em] uppercase">{doc.titulo}</p>
          <p className="font-mono text-4xl leading-tight font-bold break-all @md:text-5xl">{doc.folio}</p>
          <div className="mt-3">
            <Sello tono={doc.estado.tono}>{doc.estado.texto}</Sello>
          </div>
        </div>
        <div className="w-full max-w-[260px] justify-self-start rounded-xl border-2 border-dashed border-[#d50062] bg-[#fff5f9] p-4 text-center @2xl:justify-self-end">
          <p className="text-xs font-bold tracking-[0.14em] text-[#b0004f] uppercase">{doc.etiquetaQr}</p>
          <Qr texto={doc.payload} className="mx-auto mt-3 size-40" />
          <p className="mt-2 font-mono text-[10px] break-all text-[#6b6468]">{doc.payload}</p>
        </div>
      </div>

      {/* Datos */}
      <dl className="mt-8 grid gap-x-10 gap-y-5 border-y border-[#e4dfe2] py-6 @xl:grid-cols-2">
        {doc.campos.map((c) => (
          <div key={c.etiqueta}>
            <dt className={ETIQUETA}>{c.etiqueta}</dt>
            <dd className={cn("mt-1 font-mono", c.destacado ? "text-lg font-bold" : "text-base")}>{c.valor}</dd>
          </div>
        ))}
      </dl>

      {/* Líneas: tabla en ancho, tarjetas en angosto */}
      <table className="mt-6 hidden w-full text-sm @2xl:table">
        <thead>
          <tr className="border-b-2 border-[#1d1a1c] text-left">
            <th className={cn(ETIQUETA, "w-8 pb-2")}>#</th>
            <th className={cn(ETIQUETA, "pb-2")}>Artículo</th>
            <th className={cn(ETIQUETA, "pb-2")}>Código</th>
            {doc.conDestino && <th className={cn(ETIQUETA, "pb-2")}>Destino</th>}
            <th className={cn(ETIQUETA, "pb-2 text-right")}>Cantidad</th>
            <th className={cn(ETIQUETA, "pb-2 pl-6 text-right")}>Presentación</th>
            {avance && <th className={cn(ETIQUETA, "pb-2 pl-6 text-right")}>{doc.columnaAvance}</th>}
          </tr>
        </thead>
        <tbody>
          {doc.lineas.map((l, n) => (
            <tr key={n} className="border-b border-[#e4dfe2] align-top">
              <td className="py-3">{n + 1}</td>
              <td className="py-3 pr-4">
                <span className="block text-[15px]">{l.articulo}</span>
                {l.nota && <span className="block text-xs text-[#6b6468]">{l.nota}</span>}
                {l.etiqueta && <span className="mt-1 inline-block rounded border border-[#1f7a45] px-1.5 text-[11px] font-bold text-[#1f7a45]">Etiqueta GS1 lista</span>}
              </td>
              <td className="py-3 pr-4 font-mono">
                {l.codigo ?? (
                  <>
                    —<span className="block text-xs text-[#6b6468]">sin código interno</span>
                  </>
                )}
              </td>
              {doc.conDestino && <td className="py-3 pr-4">{l.destino}</td>}
              <td className="py-3 text-right font-mono tabular-nums">{l.cantidad}</td>
              <td className="py-3 pl-6 text-right font-mono">{l.presentacion}</td>
              {avance && (
                <td className="py-3 pl-6 text-right">
                  {l.avance && <span className={cn("text-xs font-bold", TINTA_TONO[l.avance.tono])}>{l.avance.texto}</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="mt-6 divide-y divide-[#e4dfe2] border-t-2 border-[#1d1a1c] @2xl:hidden">
        {doc.lineas.map((l, n) => (
          <li key={n} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-2 py-3 text-sm">
            <span>{n + 1}</span>
            <span className="min-w-0">
              <span className="block">{l.articulo}</span>
              <span className="block font-mono text-xs text-[#6b6468]">
                {l.codigo ?? "sin código interno"}
                {l.destino && ` · ${l.destino}`}
              </span>
              {l.nota && <span className="block text-xs text-[#6b6468]">{l.nota}</span>}
              {l.etiqueta && <span className="block"><span className="mt-1 inline-block rounded border border-[#1f7a45] px-1.5 text-[11px] font-bold text-[#1f7a45]">Etiqueta GS1 lista</span></span>}
              {l.avance && (
                <span className={cn("mt-0.5 block text-xs font-bold", TINTA_TONO[l.avance.tono])}>
                  {doc.clase === "compra" && "Recibido "}
                  {l.avance.texto}
                </span>
              )}
            </span>
            <span className="text-right font-mono">
              <span className="block font-bold tabular-nums">{l.cantidad}</span>
              <span className="block text-xs text-[#6b6468]">{l.presentacion}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* Respaldo */}
      <div className="mt-8 border-t border-[#e4dfe2] pt-6 text-center">
        <p className={ETIQUETA}>Respaldo · Code 128 con el número de orden</p>
        <div className="mt-3 flex justify-center">
          <Barras valor={doc.folio} />
        </div>
        <p className="mt-6 text-xs text-[#8a8286]">Documento de ejemplo con datos ficticios · maqueta del WMS de Momi</p>
      </div>
    </article>
  );
}

// ── Etiquetas GS1-128 que se envían al proveedor ────────────────

const DATO = "text-[9px] font-bold tracking-[0.14em] text-[#6b6468] uppercase";

/** Etiqueta física de 100 × 60 mm, siempre blanca. */
function Etiqueta({ e, total, copia }: { e: EtiquetaGS1; total: number; copia?: string }) {
  return (
    <article
      aria-label={`Etiqueta de ${e.nombre}`}
      className="etiqueta-gs1 grid w-full min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-1.5 rounded-lg border-[1.5px] border-dashed sm:aspect-[100/60] border-[#b9b0b5] bg-white px-4 pt-3.5 pb-2.5 text-[#1d1a1c]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg font-extrabold text-[#d50062]">MOMI</span>
        <span className="text-right font-mono text-[11px] leading-tight text-[#6b6468]">
          {e.oc} · línea {e.linea} de {total}
          <br />
          {copia ?? `imprimir × ${e.copias} ${e.unidadCopia}`}
        </span>
      </div>
      <p className="text-[17px] leading-tight font-bold">
        {e.nombre}
        <span className="block font-mono text-xs font-normal text-[#6b6468]">
          {e.codigo} · {e.presentacion}
        </span>
      </p>
      <dl className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-[#e4dfe2] pt-1.5">
        {[
          ["GTIN (01)", e.gtin],
          ["Lote (10)", e.lote],
          ["Caduca (17)", e.caducidad ? fechaEtiqueta(e.caducidad) : "sin caducidad"],
          ["OC (400)", e.oc],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className={DATO}>{k}</dt>
            <dd className="font-mono text-xs font-semibold whitespace-nowrap">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid min-h-0 content-center">
        <BarrasGS1 e={e} />
      </div>
    </article>
  );
}

/** Hoja con una etiqueta por línea; al imprimir sale una copia por caja. */
export function HojaEtiquetas({ doc, porCaja = false }: { doc: DocOrden; porCaja?: boolean }) {
  const etiquetas = doc.etiquetas ?? [];
  const total = etiquetas.length;
  const lista = porCaja
    ? etiquetas.flatMap((e) => Array.from({ length: e.copias }, (_, k) => ({ e, clave: `${e.linea}-${k}`, copia: `copia ${k + 1} de ${e.copias}` })))
    : etiquetas.map((e) => ({ e, clave: String(e.linea), copia: undefined }));
  return (
    <section className="imprimible mx-auto grid w-full max-w-[980px] min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border border-[#e4dfe2] bg-white p-5 text-[#1d1a1c] sm:p-6">
      <div>
        <p className="text-xs font-bold tracking-[0.16em] text-[#d50062] uppercase">Etiquetas de producto · GS1-128</p>
        <p className="font-mono text-2xl font-bold">{doc.folio}</p>
        <p className="text-sm text-[#6b6468]">
          {doc.proveedor} · cita {doc.cita} · {cuenta(total, "etiqueta")}
          {porCaja && ` · ${cuenta(lista.length, "copia")}, una por caja`}
        </p>
      </div>
      <p className="rounded-xl bg-[#fff0f6] px-4 py-2.5 text-sm">
        Imprime <b>una etiqueta por caja</b> y pégala en un costado visible. El recibidor la escanea en el andén: de ella toma el producto, el lote, la caducidad y la OC.
      </p>
      <div className="etiquetas grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {lista.map(({ e, clave, copia }) => (
          <Etiqueta key={clave} e={e} total={total} copia={copia} />
        ))}
      </div>
    </section>
  );
}

/** Copia para imprimir: se monta en <body>, abre el diálogo de impresión y se quita al terminar. */
function Impresion({ children, onFin }: { children: ReactNode; onFin: () => void }) {
  useEffect(() => {
    window.addEventListener("afterprint", onFin);
    // Dos cuadros: el código de barras se dibuja en un efecto y debe estar listo antes de imprimir.
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => window.print())));
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("afterprint", onFin);
    };
  }, [onFin]);
  return createPortal(
    <div className="zona-impresion">{children}</div>,
    document.body,
  );
}

/** Imprime la orden o, con `etiquetas`, sus etiquetas con una copia por caja. */
export function useImprimir() {
  const [pedido, setPedido] = useState<{ doc: DocOrden; etiquetas: boolean } | null>(null);
  const fin = useMemo(() => () => setPedido(null), []);
  return {
    imprimir: (doc: DocOrden, etiquetas = false) => setPedido({ doc, etiquetas }),
    copia: pedido && (
      <Impresion onFin={fin}>{pedido.etiquetas ? <HojaEtiquetas doc={pedido.doc} porCaja /> : <DocumentoOrden doc={pedido.doc} />}</Impresion>
    ),
  };
}

function BotonEtiquetas({ doc, activo, onClick }: { doc: DocOrden; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold",
        activo ? "border-border bg-card" : "border-primary bg-primary-soft text-primary",
      )}
    >
      {activo ? <FileText size={16} aria-hidden /> : <Barcode size={16} aria-hidden />}
      {activo ? "Ver la orden" : `Ver etiquetas (${doc.etiquetas?.length ?? 0})`}
    </button>
  );
}

export function BotonImprimir({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold disabled:opacity-40">
      <Printer size={16} aria-hidden /> Imprimir
    </button>
  );
}

// ── Seguimiento (fuera del papel) ───────────────────────────────

function Seguimiento({ doc }: { doc: DocOrden }) {
  if (!doc.historial.length && !doc.incidencias.length) return null;
  return (
    <div className="mx-auto mt-4 grid w-full max-w-[900px] gap-4 sm:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="font-semibold">{doc.clase === "compra" ? "Recepciones" : "Movimientos"}</p>
        {doc.historial.length ? (
          <ol className="mt-2 space-y-1.5 text-sm">
            {doc.historial.map((h, n) => (
              <li key={n} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">{h.hora}</span>
                <span>{h.texto}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Sin movimientos todavía.</p>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="font-semibold">Incidencias de esta orden ({doc.incidencias.length})</p>
        {doc.incidencias.length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {doc.incidencias.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{i.titulo}</span>
                  <span className="text-xs text-muted-foreground">{i.id}</span>
                </span>
                <EstadoChip i={i} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Ninguna.</p>
        )}
      </section>
    </div>
  );
}

// ── Visor: lista + documento ────────────────────────────────────

type Clase = "compra" | "surtido";
type Filtro = "todas" | "pendientes" | "atendidas";

const FILTROS: Record<Clase, [Filtro, string][]> = {
  compra: [
    ["todas", "Todas"],
    ["pendientes", "Por recibir"],
    ["atendidas", "Recibidas"],
  ],
  surtido: [
    ["todas", "Todas"],
    ["pendientes", "Por surtir"],
    ["atendidas", "Despachadas"],
  ],
};

const PUNTO: Record<Tono, string> = {
  ok: "bg-exito",
  alerta: "bg-alerta",
  critico: "bg-critico",
  info: "bg-frio",
  neutro: "bg-neutro",
};

function useDocumentos() {
  const estadosOC = ordenesStore.use();
  const recepciones = recepcionesStore.use();
  const surtido = surtidoStore.use();
  const incidencias = incidenciasStore.use();
  const pedidos = pedidosAreaStore.use();
  return useMemo(
    () => ({
      compra: ordenesDeCompra().map((o) => documentoCompra(o, estadosOC, recepciones, incidencias)),
      surtido: ordenesDeSurtido(pedidos).map((t) => documentoSurtido(t, surtido, incidencias)),
    }),
    [estadosOC, recepciones, surtido, incidencias, pedidos],
  );
}

function Segmentos<T extends string>({ opciones, valor, onCambio, className }: { opciones: [T, string][]; valor: T; onCambio: (v: T) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-xl bg-muted p-0.5", className)} role="tablist">
      {opciones.map(([v, texto]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={valor === v}
          onClick={() => onCambio(v)}
          className={cn("min-h-9 flex-1 rounded-lg px-3 text-sm font-semibold whitespace-nowrap", valor === v ? "bg-card shadow-sm" : "text-muted-foreground")}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

function ListaOrdenes({ docs, seleccion, onElegir }: { docs: DocOrden[]; seleccion?: string; onElegir: (folio: string) => void }) {
  if (!docs.length) return <p className="py-8 text-center text-sm text-muted-foreground">Nada con este filtro.</p>;
  return (
    <ul className="space-y-2">
      {docs.map((d) => (
        <li key={d.folio}>
          <button
            type="button"
            onClick={() => onElegir(d.folio)}
            aria-current={seleccion === d.folio}
            className={cn(
              "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-left",
              seleccion === d.folio ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <span className="min-w-0">
              <span className="block font-mono text-sm font-bold">{d.folio}</span>
              <span className="block truncate text-sm">{d.quien}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {d.cuando} · {cuenta(d.lineas.length, "línea")}
              </span>
              <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold">
                <span className={cn("size-2 rounded-full", PUNTO[d.estado.tono])} aria-hidden />
                {d.estado.texto}
              </span>
            </span>
            <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function useVisor() {
  const docs = useDocumentos();
  const [clase, setClase] = useState<Clase>("compra");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [folio, setFolio] = useState<string | undefined>();
  const lista = docs[clase].filter((d) => (filtro === "pendientes" ? d.pendiente : filtro === "atendidas" ? d.atendida : true));
  const elegido = [...docs.compra, ...docs.surtido].find((d) => d.folio === folio);
  const cambiarClase = (c: Clase) => {
    setClase(c);
    setFiltro("todas");
    setFolio(undefined);
  };
  return { docs, clase, cambiarClase, filtro, setFiltro, lista, elegido, setFolio };
}

const CLASES: [Clase, string][] = [
  ["compra", "Compra"],
  ["surtido", "Surtido"],
];

/** Torre de control: capa a pantalla completa con la lista a la izquierda y el documento a la derecha. */
export function VisorOrdenesEscritorio({ onCerrar }: { onCerrar: () => void }) {
  const v = useVisor();
  const elegido = v.elegido ?? v.lista[0];
  const { imprimir, copia } = useImprimir();
  const [verEtiquetas, setVerEtiquetas] = useState(false);
  const conEtiquetas = verEtiquetas && !!elegido?.etiquetas;
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
    <div className="fixed inset-0 z-40 flex flex-col bg-muted" role="dialog" aria-modal="true" aria-label="Órdenes">
      {copia}
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-6 py-3">
        <FileText size={20} className="text-primary" aria-hidden />
        <p className="font-display text-lg font-extrabold">Órdenes</p>
        <Segmentos opciones={CLASES} valor={v.clase} onCambio={v.cambiarClase} />
        <div className="ml-auto flex items-center gap-2">
          {elegido?.etiquetas && <BotonEtiquetas doc={elegido} activo={conEtiquetas} onClick={() => setVerEtiquetas(!conEtiquetas)} />}
          <BotonImprimir onClick={() => elegido && imprimir(elegido, conEtiquetas)} disabled={!elegido} />
          <button type="button" onClick={onCerrar} aria-label="Cerrar órdenes" className="grid size-11 place-items-center rounded-full border border-border bg-card">
            <X size={18} aria-hidden />
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-border p-4">
          <Segmentos opciones={FILTROS[v.clase]} valor={v.filtro} onCambio={v.setFiltro} className="mb-3 flex w-full" />
          <ListaOrdenes docs={v.lista} seleccion={elegido?.folio} onElegir={v.setFolio} />
        </aside>
        <main className="min-h-0 overflow-y-auto p-6">
          {elegido && conEtiquetas ? (
            <HojaEtiquetas key={elegido.folio} doc={elegido} />
          ) : elegido ? (
            <>
              <DocumentoOrden key={elegido.folio} doc={elegido} />
              <Seguimiento doc={elegido} />
            </>
          ) : (
            <p className="py-20 text-center text-sm text-muted-foreground">Elige una orden de la lista.</p>
          )}
        </main>
      </div>
    </div>
  );
}

/** Supervisor móvil: primero la lista; al elegir, el documento a una columna. */
export function VisorOrdenesMovil({ folio, onElegir }: { folio?: string; onElegir: (folio: string) => void }) {
  const v = useVisor();
  const elegido = [...v.docs.compra, ...v.docs.surtido].find((d) => d.folio === folio);
  const { imprimir, copia } = useImprimir();
  const [verEtiquetas, setVerEtiquetas] = useState(false);
  if (elegido) {
    const conEtiquetas = verEtiquetas && !!elegido.etiquetas;
    return (
      <>
        {copia}
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          {elegido.etiquetas && <BotonEtiquetas doc={elegido} activo={conEtiquetas} onClick={() => setVerEtiquetas(!conEtiquetas)} />}
          <BotonImprimir onClick={() => imprimir(elegido, conEtiquetas)} />
        </div>
        {conEtiquetas ? (
          <HojaEtiquetas key={elegido.folio} doc={elegido} />
        ) : (
          <>
            <DocumentoOrden key={elegido.folio} doc={elegido} />
            <Seguimiento doc={elegido} />
          </>
        )}
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">Órdenes</h1>
      <Segmentos opciones={CLASES} valor={v.clase} onCambio={v.cambiarClase} className="mt-3 flex w-full" />
      <Segmentos opciones={FILTROS[v.clase]} valor={v.filtro} onCambio={v.setFiltro} className="mt-2 mb-3 flex w-full" />
      <ListaOrdenes docs={v.lista} onElegir={onElegir} />
    </>
  );
}
