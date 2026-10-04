import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Rol } from "@/data/tareas";
import { CLAVES, guardar, leer } from "@/lib/almacenamiento";
import { useSesion, type Perfil } from "@/lib/sesion";

const ROL_DE: Record<Perfil, Rol> = {
  recibidor: "recibidor",
  acomodador: "acomodador",
  surtidor: "surtidor",
  supervisor: "supervisor",
  tienda: "tienda",
  area_jefe: "area",
  area_recibe: "area",
  calidad: "supervisor",
  compras: "supervisor",
  direccion: "supervisor",
};

interface EstadoPda {
  usuario: string;
  rol: Rol;
  setRol: (rol: Rol) => void;
  oscuro: boolean;
  setOscuro: (oscuro: boolean) => void;
}

const PdaContext = createContext<EstadoPda | null>(null);

export function PdaProvider({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const [rolElegido, setRol] = useState<Rol | null>(null);
  // El rol es el del usuario; solo la supervisora puede ver el menú como otro rol.
  const rol: Rol = sesion?.perfil === "supervisor" ? (rolElegido ?? "supervisor") : sesion ? ROL_DE[sesion.perfil] : "recibidor";
  const [oscuro, setOscuro] = useState(() => leer(CLAVES.oscuro, false));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", oscuro);
    guardar(CLAVES.oscuro, oscuro);
  }, [oscuro]);

  const usuario = sesion?.nombre ?? "";
  const valor = useMemo(() => ({ usuario, rol, setRol, oscuro, setOscuro }), [usuario, rol, oscuro]);
  return <PdaContext.Provider value={valor}>{children}</PdaContext.Provider>;
}

export function usePda() {
  const ctx = useContext(PdaContext);
  if (!ctx) throw new Error("usePda debe usarse dentro de PdaProvider");
  return ctx;
}
