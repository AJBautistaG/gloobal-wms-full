import { useSesion } from "@/lib/sesion";

/** El primer nombre de quien inició sesión, para los saludos. */
export function PrimerNombre() {
  return useSesion()?.nombre.split(" ")[0] ?? "";
}
