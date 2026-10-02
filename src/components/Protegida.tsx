import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { cerrarSesion, permitido, useSesion } from "@/lib/sesion";

/** Pide sesión y revisa que la ruta le corresponda al usuario. */
export function Protegida({ children }: { children: ReactNode }) {
  const u = useSesion();
  const { pathname, search } = useLocation();
  const navegar = useNavigate();
  if (!u) return <Navigate to={`/login?siguiente=${encodeURIComponent(pathname + search)}`} replace />;
  if (permitido(u, pathname, new URLSearchParams(search).get("area"))) return <>{children}</>;
  return (
    <div className="grid min-h-screen place-items-center bg-muted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-alerta/15 text-alerta">
          <Lock size={26} aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold">No tienes acceso a esta pantalla</h1>
        <p className="mt-1 text-muted-foreground">
          Entraste como {u.nombre} ({u.puesto}). Esta pantalla es para otro perfil.
        </p>
        <div className="mt-5 grid gap-2">
          <Link to={u.inicio} replace className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground">
            Ir a mi inicio
          </Link>
          <button
            type="button"
            onClick={() => {
              cerrarSesion();
              navegar(`/login?siguiente=${encodeURIComponent(pathname + search)}`, { replace: true });
            }}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border font-semibold"
          >
            Entrar con otro usuario
          </button>
        </div>
      </div>
    </div>
  );
}

/** "/" lleva al inicio del usuario o a la entrada. */
export function Inicio() {
  const u = useSesion();
  return <Navigate to={u ? u.inicio : "/login"} replace />;
}
