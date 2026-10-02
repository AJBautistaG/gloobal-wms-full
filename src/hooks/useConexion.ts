import { useCallback, useState } from "react";

/**
 * Simula la cola de eventos del PDA: sin señal, cada registro se encola y se envía
 * solo al reconectar. Nunca se pide volver a escanear.
 */
export function useConexion(pendientesIniciales = 3) {
  const [sinConexion, setSinConexion] = useState(false);
  const [pendientes, setPendientes] = useState(pendientesIniciales);

  const encolar = useCallback(
    (_evento: string) => {
      if (sinConexion) setPendientes((n) => n + 1);
    },
    [sinConexion],
  );

  const alternar = useCallback(() => {
    // Al reconectar, la cola se vacía sola.
    if (sinConexion) setPendientes(0);
    setSinConexion(!sinConexion);
  }, [sinConexion]);

  return { sinConexion, pendientes, encolar, alternar };
}

export type Conexion = ReturnType<typeof useConexion>;
