import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePda } from "@/context/PdaContext";

/** Pantalla completa con contenido desplazable y los botones siempre al alcance del pulgar. */
export function Marco({ children, boton, oscuro = false }: { children: ReactNode; boton: ReactNode; oscuro?: boolean }) {
  return (
    <div className={cn("flujo flex h-[100dvh] flex-col", oscuro ? "bg-foreground text-background" : "bg-background")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-4">{children}</div>
      <div className="shrink-0 space-y-2 px-5 pt-2 pb-5">{boton}</div>
    </div>
  );
}

export function BotonFlujo({
  children,
  onClick,
  disabled,
  variante = "principal",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variante?: "principal" | "discreto";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-14 w-full rounded-2xl px-4 font-display text-base font-extrabold transition-transform active:scale-[0.98] disabled:opacity-40",
        variante === "principal"
          ? "bg-primary text-primary-foreground"
          : "border border-current/30 bg-transparent font-sans font-semibold",
      )}
    >
      {children}
    </button>
  );
}

export function BotonSecundario({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold text-muted-foreground"
    >
      {children}
    </button>
  );
}

/**
 * Barra superior de los flujos: "Atrás" regresa un paso sin perder lo capturado;
 * "Cancelar" abandona todo el proceso (siempre pide confirmación).
 */
export function BarraFlujo({
  onVolver,
  onCancelar,
  children,
}: {
  onVolver?: () => void;
  onCancelar?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="-mt-1 mb-3 flex min-h-11 items-center gap-2">
      {onVolver && (
        <button type="button" onClick={onVolver} className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-2 text-primary">
          <ChevronLeft size={24} aria-hidden />
          <span className="text-sm font-semibold">Atrás</span>
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {children}
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="min-h-11 px-1 text-sm font-semibold text-critico">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

/** Confirmación para cancelar un proceso completo, con motivo obligatorio. */
export function HojaCancelar({
  abierta,
  titulo,
  consecuencias,
  motivos,
  textoConfirmar,
  onConfirmar,
  onCerrar,
}: {
  abierta: boolean;
  titulo: string;
  consecuencias: ReactNode;
  motivos: string[];
  textoConfirmar: string;
  onConfirmar: (motivo: string) => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  return (
    <Hoja
      abierta={abierta}
      titulo={titulo}
      onCerrar={() => {
        setMotivo(null);
        onCerrar();
      }}
    >
      <div className="rounded-2xl border border-critico/40 bg-critico/10 p-3 text-sm">{consecuencias}</div>
      <p className="pt-1 text-sm font-semibold">¿Por qué?</p>
      {motivos.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={motivo === m}
          onClick={() => setMotivo(m)}
          className={cn(
            "min-h-12 w-full rounded-2xl border px-4 text-left text-sm font-semibold",
            motivo === m ? "border-critico bg-critico/10 text-critico" : "border-border bg-card",
          )}
        >
          {m}
        </button>
      ))}
      <button
        type="button"
        disabled={!motivo}
        onClick={() => {
          onConfirmar(motivo!);
          setMotivo(null);
        }}
        className="min-h-14 w-full rounded-2xl bg-critico px-4 font-display text-base font-extrabold text-white disabled:opacity-40"
      >
        {motivo ? textoConfirmar : "Elige el motivo"}
      </button>
      <BotonSecundario
        onClick={() => {
          setMotivo(null);
          onCerrar();
        }}
      >
        No, seguir
      </BotonSecundario>
    </Hoja>
  );
}

export function Volver({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-2 text-primary">
      <ChevronLeft size={24} aria-hidden />
      <span className="text-sm font-semibold">Atrás</span>
    </button>
  );
}

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[18px] border border-border bg-card p-4", className)}>{children}</div>;
}

export function Fila({ k, v, tono }: { k: ReactNode; v: ReactNode; tono?: "exito" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className={cn("text-right text-base font-semibold", tono === "exito" && "text-exito")}>{v}</span>
    </div>
  );
}

/** Tres cifras grandes lado a lado: productos · cajas · kg. */
export function Cifras({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-border rounded-[18px] border border-border bg-card">
      {items.map(([valor, etiqueta]) => (
        <div key={etiqueta} className="px-2 py-3 text-center">
          <p className="font-mono text-xl font-semibold tabular-nums">{valor}</p>
          <p className="text-xs text-muted-foreground">{etiqueta}</p>
        </div>
      ))}
    </div>
  );
}

/** Opción grande con icono redondo, título y subtítulo. */
export function Opcion({
  icono,
  titulo,
  sub,
  onClick,
  tono,
}: {
  icono: ReactNode;
  titulo: string;
  sub: string;
  onClick: () => void;
  tono?: "critico";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[72px] w-full items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3 text-left active:scale-[0.99]"
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full",
          tono === "critico" ? "bg-critico/15 text-critico" : "bg-primary-soft text-primary",
        )}
      >
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-extrabold">{titulo}</span>
        <span className="block text-sm text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
    </button>
  );
}

/** Hoja inferior modal. */
export function Hoja({
  abierta,
  titulo,
  onCerrar,
  children,
}: {
  abierta: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  if (!abierta) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={onCerrar}
    >
      <div
        className="flujo max-h-[88dvh] w-full max-w-[420px] space-y-2 overflow-y-auto rounded-t-[18px] bg-background p-5 animate-in slide-in-from-bottom-8 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-lg font-extrabold">{titulo}</p>
        {children}
      </div>
    </div>
  );
}

export function BotonHoja({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-14 w-full rounded-2xl border border-border bg-card px-4 text-left font-semibold"
    >
      {children}
    </button>
  );
}

export function Exito() {
  return (
    <div className="mx-auto grid size-24 place-items-center rounded-full bg-exito text-white animate-in zoom-in-50 fade-in duration-500">
      <Check size={52} strokeWidth={3} aria-hidden />
    </div>
  );
}

export function Progreso({ indice, total, pendientes = false }: { indice: number; total: number; pendientes?: boolean }) {
  const restantes = total - indice - 1;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.12em] text-muted-foreground">
        <span>
          PRODUCTO {indice + 1} DE {total}
        </span>
        {pendientes && (
          <span>
            {restantes} {restantes === 1 ? "pendiente" : "pendientes"}
          </span>
        )}
      </div>
      <div className="mt-2 h-1 rounded-full bg-border">
        <div className="h-1 rounded-full bg-primary transition-all" style={{ width: `${((indice + 1) / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** Contador grande con botones − y + para contar con guantes. */
export function Contador({
  valor,
  onCambio,
  etiqueta,
  unidad,
}: {
  valor: number;
  onCambio: (n: number) => void;
  etiqueta: string;
  unidad: string;
}) {
  return (
    <div className="flex items-center justify-center gap-6">
      <button
        type="button"
        aria-label={`Un ${unidad} menos`}
        disabled={valor === 0}
        onClick={() => onCambio(Math.max(0, valor - 1))}
        className="grid size-16 place-items-center rounded-2xl border border-border bg-card disabled:opacity-30"
      >
        <Minus size={28} aria-hidden />
      </button>
      <input
        inputMode="numeric"
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value.replace(/\D/g, "")) || 0)}
        aria-label={etiqueta}
        className="w-24 bg-transparent text-center font-mono text-[52px] leading-none font-semibold tabular-nums outline-none"
      />
      <button
        type="button"
        aria-label={`Un ${unidad} más`}
        onClick={() => onCambio(valor + 1)}
        className="grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground"
      >
        <Plus size={28} aria-hidden />
      </button>
    </div>
  );
}

/** "Rodolfo Paz · [Recibidor ▾]": cambia de tarea sin salir de la pantalla completa. */
export function SelectorTarea({ actual, nombre }: { actual: string; nombre?: string }) {
  const navegar = useNavigate();
  const { usuario } = usePda();
  return (
    <label className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
      {nombre ?? usuario} ·
      <select
        aria-label="Cambiar de tarea"
        value={actual}
        onChange={(e) => navegar(e.target.value)}
        className="bg-transparent font-semibold text-foreground"
      >
        <option value="/pda/recibir">Recibidor</option>
        <option value="/pda/acomodar">Acomodador</option>
        <option value="/pda/surtir">Surtidor</option>
        <option value="/pda/contar">Conteo</option>
        <option value="/pda/tienda">Tienda</option>
        <option value="/pda/supervisor">Supervisor</option>
        <optgroup label="Área">
          <option value="/pda/area?area=panaderia">Panadería</option>
          <option value="/pda/area?area=cocina">Cocina</option>
          <option value="/pda/area?area=dulceria">Dulcería</option>
        </optgroup>
        <option value="/pda">Todas las tareas</option>
      </select>
    </label>
  );
}

export const TEXTO_ESCANER = {
  orden: "Apunta al código de la orden de compra",
  producto: "Apunta al código del producto",
  caja: "Apunta al código de la caja",
  etiqueta: "Apunta a una etiqueta ya pegada",
} as const;

interface EscanerProps {
  titulo?: string;
  subtitulo?: string;
  /** Lo que "ve" la cámara, impreso bajo el código de barras. */
  codigo: string;
  texto: string;
  onLeer: () => void;
  /** Mantener presionado 2 s simula leer un código equivocado. */
  onLeerLargo?: () => void;
  onCerrar: () => void;
  pie?: ReactNode;
}

/**
 * Visor del escáner. Tocar "Leer código" simula una lectura correcta; mantener
 * presionado dos segundos simula una lectura equivocada, para probar los errores.
 */
export function Escaner({ titulo = "Recibir", subtitulo, codigo, texto, onLeer, onLeerLargo, onCerrar, pie }: EscanerProps) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fueLargo = useRef(false);

  const presionLarga = onLeerLargo
    ? {
        onPointerDown: () => {
          fueLargo.current = false;
          temporizador.current = setTimeout(() => {
            fueLargo.current = true;
            onLeerLargo();
          }, 2000);
        },
        onPointerUp: () => temporizador.current && clearTimeout(temporizador.current),
        onPointerLeave: () => temporizador.current && clearTimeout(temporizador.current),
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : {};

  const leer = () => {
    if (fueLargo.current) {
      fueLargo.current = false;
      return;
    }
    onLeer();
  };

  return (
    <Marco
      oscuro
      boton={
        <>
          <div {...presionLarga} className="select-none">
            <BotonFlujo onClick={leer}>Leer código</BotonFlujo>
          </div>
          {pie}
        </>
      }
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onCerrar}
          className="grid size-11 place-items-center rounded-full bg-background/10 text-xl"
        >
          ×
        </button>
        <div>
          <p className="font-display text-lg font-extrabold">{titulo}</p>
          {subtitulo && <p className="text-sm opacity-70">{subtitulo}</p>}
        </div>
      </div>
      <button
        type="button"
        {...presionLarga}
        onClick={leer}
        aria-label="Leer código"
        className="relative mx-auto mt-10 block aspect-square w-full max-w-[300px] overflow-hidden"
      >
        {[
          "top-0 left-0 border-t-4 border-l-4",
          "top-0 right-0 border-t-4 border-r-4",
          "bottom-0 left-0 border-b-4 border-l-4",
          "bottom-0 right-0 border-b-4 border-r-4",
        ].map((esquina) => (
          <span key={esquina} className={cn("absolute size-10 rounded-sm border-background", esquina)} />
        ))}
        <div className="absolute inset-10 grid place-items-center rounded-xl bg-background/15 p-4">
          <div className="flex h-20 w-full items-end gap-[3px]">
            {Array.from({ length: 34 }).map((_, i) => (
              <span key={i} className="h-full bg-background/80" style={{ width: i % 3 === 0 ? 4 : 2 }} />
            ))}
          </div>
          <span className="font-mono text-sm break-all">{codigo}</span>
        </div>
        <span className="animate-barrido absolute inset-x-6 h-0.5 bg-primary shadow-[0_0_12px_var(--primary)]" />
      </button>
      <p className="mt-6 text-center text-base opacity-80">{texto}</p>
      {onLeerLargo && (
        <p className="mt-2 text-center text-xs opacity-50">Mantén presionado 2 s para simular un código equivocado.</p>
      )}
    </Marco>
  );
}
