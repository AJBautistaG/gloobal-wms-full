import { useId, useState, type FormEvent } from "react";
import { ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  etiqueta?: string;
  placeholder?: string;
  ayuda?: string;
  grande?: boolean;
  onEscaneo: (codigo: string) => void;
}

/**
 * Campo que recibe la lectura del escáner. Los lectores de PDA "teclean" el código
 * y mandan Enter, así que basta con un formulario.
 */
export function CampoEscaneo({
  etiqueta = "Escanea la etiqueta",
  placeholder = "Ubicación, SSCC o lote",
  ayuda,
  grande = false,
  onEscaneo,
}: Props) {
  const id = useId();
  const [valor, setValor] = useState("");

  function enviar(e: FormEvent) {
    e.preventDefault();
    const codigo = valor.trim();
    if (!codigo) return;
    onEscaneo(codigo);
    setValor("");
  }

  return (
    <form onSubmit={enviar} className="w-full">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {etiqueta}
      </label>
      <div className="mt-1.5 flex gap-2">
        <div className="relative flex-1">
          <ScanLine size={18} aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-primary" />
          <input
            id={id}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className={cn(
              "w-full rounded-lg border border-input bg-card pr-3 pl-10 font-mono tracking-tight",
              grande ? "h-14 text-base" : "h-10 text-sm",
            )}
          />
        </div>
        <button
          type="submit"
          className={cn(
            "rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary-hover",
            grande ? "h-14 px-5 text-base" : "h-10 px-4 text-sm",
          )}
        >
          Confirmar
        </button>
      </div>
      {ayuda && <p className="mt-1.5 text-xs text-muted-foreground">{ayuda}</p>}
    </form>
  );
}
