import { useCallback, useEffect, useRef, useState } from "react";
import { pitido } from "@/lib/feedback";

export type Pulso = "ok" | "error" | null;

/** Franja de confirmación o rechazo que dura menos de un segundo tras cada escaneo. */
export function usePulso() {
  const [pulso, setPulso] = useState<Pulso>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrar = useCallback((tipo: Exclude<Pulso, null>) => {
    if (tipo === "ok") pitido();
    else navigator.vibrate?.([60, 40, 60]);
    setPulso(tipo);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setPulso(null), 900);
  }, []);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  return {
    pulso,
    confirmar: useCallback(() => mostrar("ok"), [mostrar]),
    rechazar: useCallback(() => mostrar("error"), [mostrar]),
  };
}
