import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Rol } from "@/data/tareas";
import { CLAVES, guardar, leer } from "@/lib/almacenamiento";

interface EstadoPda {
  usuario: string;
  rol: Rol;
  setRol: (rol: Rol) => void;
  oscuro: boolean;
  setOscuro: (oscuro: boolean) => void;
}

const PdaContext = createContext<EstadoPda | null>(null);

export function PdaProvider({ children }: { children: ReactNode }) {
  const [rol, setRol] = useState<Rol>("recibidor");
  const [oscuro, setOscuro] = useState(() => leer(CLAVES.oscuro, false));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", oscuro);
    guardar(CLAVES.oscuro, oscuro);
  }, [oscuro]);

  const valor = useMemo(() => ({ usuario: "Rodolfo Paz", rol, setRol, oscuro, setOscuro }), [rol, oscuro]);
  return <PdaContext.Provider value={valor}>{children}</PdaContext.Provider>;
}

export function usePda() {
  const ctx = useContext(PdaContext);
  if (!ctx) throw new Error("usePda debe usarse dentro de PdaProvider");
  return ctx;
}
