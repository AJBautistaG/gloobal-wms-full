import { useSyncExternalStore } from "react";

/**
 * Inicio de sesión simulado. La sesión vive en `sessionStorage`: es por pestaña, así se puede
 * tener al Recibidor en una pestaña y a la Supervisora en otra, compartiendo los mismos datos.
 */

export type Perfil = "recibidor" | "acomodador" | "surtidor" | "supervisor" | "tienda" | "area_jefe" | "area_recibe" | "calidad" | "compras";
export type ClaveAreaSesion = "panaderia" | "cocina" | "dulceria";

export interface Usuario {
  id: string;
  nombre: string;
  perfil: Perfil;
  /** Cómo se presenta: "Recibidor", "Jefe de Panadería"… */
  puesto: string;
  area?: ClaveAreaSesion;
  /** A dónde entra al iniciar sesión. */
  inicio: string;
  grupo: "Piso (PDA)" | "Escritorio";
  proximamente?: boolean;
}

export const PIN_DEMO = "1234";

export const USUARIOS: Usuario[] = [
  { id: "rodolfo", nombre: "Rodolfo Paz", perfil: "recibidor", puesto: "Recibidor", inicio: "/pda/recibir", grupo: "Piso (PDA)" },
  { id: "abdiel", nombre: "Abdiel Serrano", perfil: "acomodador", puesto: "Acomodador", inicio: "/pda/acomodar", grupo: "Piso (PDA)" },
  { id: "luis", nombre: "Luis Ortega", perfil: "surtidor", puesto: "Surtidor", inicio: "/pda/surtir", grupo: "Piso (PDA)" },
  { id: "irene", nombre: "Irene Castillo", perfil: "tienda", puesto: "Encargada de tienda", inicio: "/pda/tienda", grupo: "Piso (PDA)" },
  { id: "jose", nombre: "José Pinzón", perfil: "area_recibe", puesto: "Recibe en Panadería", area: "panaderia", inicio: "/pda/area?area=panaderia", grupo: "Piso (PDA)" },
  { id: "delia", nombre: "Delia Castillo", perfil: "area_recibe", puesto: "Recibe en Cocina", area: "cocina", inicio: "/pda/area?area=cocina", grupo: "Piso (PDA)" },
  { id: "ana", nombre: "Ana Rodríguez", perfil: "area_recibe", puesto: "Recibe en Dulcería", area: "dulceria", inicio: "/pda/area?area=dulceria", grupo: "Piso (PDA)" },
  { id: "rosa", nombre: "Rosa Villalaz", perfil: "supervisor", puesto: "Supervisora de almacén", inicio: "/supervisor", grupo: "Escritorio" },
  { id: "carlos", nombre: "Carlos Méndez", perfil: "area_jefe", puesto: "Jefe de Panadería", area: "panaderia", inicio: "/area?area=panaderia", grupo: "Escritorio" },
  { id: "ruben", nombre: "Rubén Araúz", perfil: "area_jefe", puesto: "Jefe de Cocina", area: "cocina", inicio: "/area?area=cocina", grupo: "Escritorio" },
  { id: "maria", nombre: "María Cedeño", perfil: "area_jefe", puesto: "Jefa de Dulcería", area: "dulceria", inicio: "/area?area=dulceria", grupo: "Escritorio" },
  { id: "marisol", nombre: "Marisol Quintero", perfil: "calidad", puesto: "Calidad", inicio: "/supervisor", grupo: "Escritorio", proximamente: true },
  { id: "katia", nombre: "Ana Batista", perfil: "compras", puesto: "Compras", inicio: "/supervisor", grupo: "Escritorio", proximamente: true },
];

/** Tareas del PDA que ve cada perfil (además del menú `/pda`). */
const PDA: Partial<Record<Perfil, string[]>> = {
  recibidor: ["/pda/recibir", "/pda/acomodar", "/pda/tienda"],
  acomodador: ["/pda/acomodar", "/pda/contar", "/pda/trasladar"],
  surtidor: ["/pda/surtir", "/pda/contar", "/pda/trasladar"],
  tienda: ["/pda/tienda"],
};

/** ¿Puede este usuario abrir esta ruta? La supervisora puede entrar a todo. */
export function permitido(u: Usuario | null, ruta: string, area?: string | null) {
  if (!u) return false;
  if (ruta === "/pda/surtir-ventana") ruta = "/pda/surtir";
  if (u.perfil === "supervisor") return true;
  if (ruta === "/area") return u.perfil === "area_jefe" && area === u.area;
  if (ruta === "/pda/area") return (u.perfil === "area_jefe" || u.perfil === "area_recibe") && area === u.area;
  if (ruta === "/pda") return !!PDA[u.perfil];
  return (PDA[u.perfil] ?? []).includes(ruta);
}

/** Lo que se puede elegir en "Cambiar de tarea", según el usuario. */
export function tareasDe(u: Usuario | null): { ruta: string; nombre: string }[] {
  const todas = [
    { ruta: "/pda/recibir", nombre: "Recibidor" },
    { ruta: "/pda/acomodar", nombre: "Acomodador" },
    { ruta: "/pda/surtir", nombre: "Surtidor" },
    { ruta: "/pda/contar", nombre: "Conteo" },
    { ruta: "/pda/trasladar", nombre: "Traslados" },
    { ruta: "/pda/tienda", nombre: "Tienda" },
    { ruta: "/pda/supervisor", nombre: "Supervisor" },
    { ruta: "/pda/area?area=panaderia", nombre: "Área · Panadería" },
    { ruta: "/pda/area?area=cocina", nombre: "Área · Cocina" },
    { ruta: "/pda/area?area=dulceria", nombre: "Área · Dulcería" },
    { ruta: "/pda", nombre: "Todas las tareas" },
  ];
  return todas.filter((t) => {
    const [ruta, query] = t.ruta.split("?");
    return permitido(u, ruta, new URLSearchParams(query).get("area"));
  });
}

// ── Sesión por pestaña ──────────────────────────────────────────

const CLAVE = "momi-sesion";
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

function leer(): string | null {
  try {
    return window.sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function usuarioActual(): Usuario | null {
  const id = leer();
  return USUARIOS.find((u) => u.id === id && !u.proximamente) ?? null;
}

export function iniciarSesion(id: string) {
  try {
    window.sessionStorage.setItem(CLAVE, id);
  } catch {
    /* sin almacenamiento: la sesión dura lo que la pestaña */
  }
  avisar();
}

export function cerrarSesion() {
  try {
    window.sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
  avisar();
}

export function useSesion() {
  const id = useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    leer,
    () => null,
  );
  return USUARIOS.find((u) => u.id === id && !u.proximamente) ?? null;
}
