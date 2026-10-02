import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { FOTOS, ilustracionDe, type Foto, type Ilustracion } from "@/data/imagenes";
import { cn } from "@/lib/utils";

const TAMANOS = {
  sm: "size-10 rounded-xl",
  md: "size-16 rounded-2xl",
  lg: "size-24 rounded-3xl",
};

const TINTA = "#2b2226";
const SOMBRA = "rgba(0,0,0,0.14)";

/** Etiqueta blanca con el nombre corto; parte en dos líneas si no cabe. */
function Etiqueta({ texto, x, y, ancho, alto }: { texto: string; x: number; y: number; ancho: number; alto: number }) {
  const palabras = texto.split(" ");
  const lineas = texto.length > 9 && palabras.length > 1 ? [palabras.slice(0, Math.ceil(palabras.length / 2)).join(" "), palabras.slice(Math.ceil(palabras.length / 2)).join(" ")] : [texto];
  const mayor = Math.max(...lineas.map((l) => l.length));
  const tamano = Math.min(7.5, ((ancho - 4) / mayor) * 1.75);
  const centro = y + alto / 2;
  return (
    <g>
      <rect x={x} y={y} width={ancho} height={alto} rx={2.5} fill="#ffffff" opacity={0.94} />
      {lineas.map((l, i) => (
        <text
          key={l}
          x={x + ancho / 2}
          y={centro + (i - (lineas.length - 1) / 2) * (tamano + 1) + tamano * 0.35}
          textAnchor="middle"
          fontFamily="Archivo, sans-serif"
          fontWeight={800}
          fontSize={tamano}
          fill={TINTA}
        >
          {l}
        </text>
      ))}
    </g>
  );
}

/** Dibujo del empaque en un lienzo de 64 × 64. */
function Empaque({ il }: { il: Ilustracion }): ReactNode {
  const { color, acento, etiqueta } = il;
  const piso = <ellipse cx={32} cy={58} rx={20} ry={2.5} fill={SOMBRA} />;
  switch (il.empaque) {
    case "frasco":
      return (
        <>
          {piso}
          <rect x={19} y={9} width={26} height={8} rx={2} fill={acento} stroke={SOMBRA} />
          <rect x={15} y={16} width={34} height={41} rx={9} fill={color} />
          <rect x={18} y={19} width={4} height={30} rx={2} fill="#ffffff" opacity={0.35} />
          <Etiqueta texto={etiqueta} x={17} y={29} ancho={30} alto={16} />
        </>
      );
    case "lata":
      return (
        <>
          {piso}
          <rect x={16} y={12} width={32} height={44} rx={3} fill={color} />
          <ellipse cx={32} cy={12} rx={16} ry={4} fill="#c9ccd1" />
          <ellipse cx={32} cy={12} rx={12} ry={2.6} fill="#e3e5e8" />
          <rect x={16} y={24} width={32} height={20} fill={acento} />
          <Etiqueta texto={etiqueta} x={18} y={27} ancho={28} alto={14} />
          <ellipse cx={32} cy={56} rx={16} ry={3} fill={color} />
        </>
      );
    case "paquete":
      return (
        <>
          {piso}
          <path d="M9 15 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l2 3 v36 l-3 3 l-3 -3 l-3 3 l-3 -3 l-3 3 l-3 -3 l-3 3 l-3 -3 l-3 3 l-3 -3 l-3 3 l-3 -3 l-3 3 l-3 -3 z" fill={color} />
          <rect x={9} y={20} width={46} height={5} fill={acento} opacity={0.8} />
          <Etiqueta texto={etiqueta} x={15} y={30} ancho={34} alto={15} />
        </>
      );
    case "barra":
      return (
        <>
          {piso}
          <path d="M8 26 l8 -6 h40 l-8 6 z" fill={acento} opacity={0.85} />
          <rect x={8} y={26} width={40} height={24} rx={2} fill={color} />
          <path d="M48 26 l8 -6 v24 l-8 6 z" fill={acento} opacity={0.6} />
          <Etiqueta texto={etiqueta} x={10} y={30} ancho={36} alto={15} />
        </>
      );
    case "bloque":
      return (
        <>
          {piso}
          <path d="M10 20 l10 -8 h34 l-10 8 z" fill={acento} opacity={0.9} />
          <rect x={10} y={20} width={34} height={36} rx={2} fill={color} />
          <path d="M44 20 l10 -8 v36 l-10 8 z" fill={acento} opacity={0.65} />
          <Etiqueta texto={etiqueta} x={12} y={30} ancho={30} alto={15} />
        </>
      );
    case "envase":
      return (
        <>
          {piso}
          <path d="M18 18 l7 -10 h14 l7 10 z" fill={acento} />
          <rect x={27} y={4} width={10} height={5} rx={1} fill={acento} />
          <rect x={18} y={18} width={28} height={39} rx={2} fill={color} stroke={SOMBRA} />
          <rect x={18} y={48} width={28} height={9} fill={acento} />
          <Etiqueta texto={etiqueta} x={20} y={26} ancho={24} alto={15} />
        </>
      );
    case "botella":
      return (
        <>
          {piso}
          <rect x={26} y={5} width={12} height={7} rx={2} fill={acento} />
          <path d="M24 12 h16 v6 c6 3 8 7 8 12 v24 c0 2 -2 3 -4 3 h-24 c-2 0 -4 -1 -4 -3 v-24 c0 -5 2 -9 8 -12 z" fill={color} />
          <Etiqueta texto={etiqueta} x={18} y={31} ancho={28} alto={15} />
        </>
      );
    case "bolsa":
      return (
        <>
          {piso}
          <path d="M14 10 h36 l2 44 c0 2 -1 3 -3 3 h-34 c-2 0 -3 -1 -3 -3 z" fill={color} />
          <rect x={14} y={10} width={36} height={6} fill={acento} opacity={0.9} />
          <circle cx={45} cy={21} r={2} fill="#ffffff" opacity={0.7} />
          <Etiqueta texto={etiqueta} x={17} y={30} ancho={30} alto={15} />
        </>
      );
    case "saco":
      return (
        <>
          {piso}
          <path d="M22 12 c4 3 16 3 20 0 l-2 6 c8 4 12 12 12 22 c0 10 -4 17 -8 17 h-24 c-4 0 -8 -7 -8 -17 c0 -10 4 -18 12 -22 z" fill={color} stroke={SOMBRA} />
          <path d="M22 12 c4 3 16 3 20 0 l-3 -5 c-4 2 -10 2 -14 0 z" fill={color} stroke={SOMBRA} />
          <rect x={21} y={16} width={22} height={3} rx={1.5} fill={acento} />
          <Etiqueta texto={etiqueta} x={17} y={33} ancho={30} alto={15} />
        </>
      );
    case "estuche":
      return (
        <>
          {piso}
          <path d="M12 16 l6 -6 h36 l-6 6 z" fill={acento} />
          <rect x={12} y={16} width={36} height={40} rx={2} fill={color} />
          <path d="M48 16 l6 -6 v40 l-6 6 z" fill={color} opacity={0.75} />
          <Etiqueta texto={etiqueta} x={14} y={29} ancho={32} alto={15} />
        </>
      );
    case "caja_pastel":
      return (
        <>
          {piso}
          <path d="M8 22 l10 -10 h38 l-10 10 z" fill="#ffffff" stroke={SOMBRA} />
          <rect x={8} y={22} width={38} height={34} rx={2} fill={color} />
          <path d="M46 22 l10 -10 v34 l-10 10 z" fill={color} opacity={0.75} />
          <rect x={25} y={14} width={16} height={6} rx={1} fill={acento} opacity={0.8} />
          <Etiqueta texto={etiqueta} x={12} y={32} ancho={30} alto={15} />
        </>
      );
    case "base":
      return (
        <>
          <ellipse cx={32} cy={40} rx={26} ry={12} fill={SOMBRA} />
          <ellipse cx={32} cy={36} rx={26} ry={12} fill={color} />
          <ellipse cx={32} cy={35} rx={21} ry={9} fill={acento} />
          <Etiqueta texto={etiqueta} x={20} y={28} ancho={24} alto={13} />
        </>
      );
    default:
      return (
        <>
          {piso}
          <rect x={12} y={14} width={40} height={42} rx={3} fill={color} stroke={SOMBRA} />
          <rect x={12} y={30} width={40} height={6} fill={acento} opacity={0.4} />
          <text x={32} y={42} textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight={800} fontSize={20} fill={acento}>
            ?
          </text>
        </>
      );
  }
}

function Dibujo({ codigo, nombre, className }: { codigo: string; nombre: string; className?: string }) {
  const foto = FOTOS[codigo];
  if (foto) return <img src={foto.src} alt={`Foto de ${nombre}`} className={cn("size-full bg-white object-contain", className)} />;
  return (
    <svg viewBox="0 0 64 64" className={cn("size-full p-[8%]", className)} role="img" aria-label={`Imagen de referencia: ${nombre}`}>
      <Empaque il={ilustracionDe(codigo)} />
    </svg>
  );
}

/** Imagen a pantalla completa. Se monta en <body> y no deja pasar clics ni teclas al botón que la contiene. */
function Ampliada({ codigo, nombre, cerrar }: { codigo: string; nombre: string; cerrar: () => void }) {
  const foto: Foto | undefined = FOTOS[codigo];
  const botonCerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const enfocadoAntes = document.activeElement as HTMLElement | null;
    botonCerrar.current?.focus();
    const tecla = (e: globalThis.KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", tecla, true);
    const desbordeAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla, true);
      document.body.style.overflow = desbordeAntes;
      enfocadoAntes?.focus?.();
    };
  }, [cerrar]);
  const detener = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Imagen de ${nombre}`}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 animate-in fade-in-0"
      onClick={(e) => {
        e.stopPropagation();
        cerrar();
      }}
      onKeyDown={detener}
    >
      <figure
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-card text-card-foreground shadow-2xl animate-in zoom-in-95"
        onClick={detener}
      >
        <button
          ref={botonCerrar}
          type="button"
          onClick={cerrar}
          aria-label="Cerrar imagen"
          className="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
        </button>
        <div className="relative h-[min(58dvh,420px)] bg-white">
          <Dibujo codigo={codigo} nombre={nombre} className="absolute inset-0 p-4" />
        </div>
        <figcaption className="space-y-1 border-t border-border p-4">
          <p className="font-semibold leading-tight">{nombre}</p>
          <p className="font-mono text-xs text-muted-foreground">{codigo}</p>
          {foto ? (
            <p className="pt-1 text-xs leading-snug text-muted-foreground">
              Foto de referencia: {foto.referencia}. {foto.autor} ·{" "}
              <a href={foto.fuente} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                {foto.licencia}
              </a>
            </p>
          ) : (
            <p className="pt-1 text-xs text-muted-foreground">Sin foto: ilustración del empaque.</p>
          )}
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}

/**
 * Imagen de referencia del producto: la foto real si existe; si no, la ilustración de su
 * empaque. Al tocarla se amplía. Como suele ir dentro de botones, no es un <button>: es un
 * span con rol de botón que detiene el clic para no disparar la acción del botón que la contiene.
 */
export function ImagenProducto({
  codigo,
  nombre,
  tamano = "md",
  className,
}: {
  codigo: string;
  nombre: string;
  tamano?: keyof typeof TAMANOS;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = useCallback(() => setAbierta(false), []);
  const abrir = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setAbierta(true);
  };
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`Ampliar imagen de ${nombre}`}
        title="Toca para ampliar"
        onClick={abrir}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && abrir(e)}
        className={cn(
          "group relative grid shrink-0 cursor-zoom-in place-items-center overflow-hidden border border-border bg-white transition hover:ring-2 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
          TAMANOS[tamano],
          className,
        )}
      >
        <Dibujo codigo={codigo} nombre={nombre} />
        {tamano !== "sm" && (
          <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-black/55 text-white opacity-80 group-hover:opacity-100" aria-hidden>
            <Maximize2 className="size-3" />
          </span>
        )}
      </span>
      {abierta && <Ampliada codigo={codigo} nombre={nombre} cerrar={cerrar} />}
    </>
  );
}
