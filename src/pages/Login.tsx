import { useEffect, useLayoutEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { cerrarSesion, iniciarSesion, permitido, useSesion, validar, type Usuario } from "@/lib/sesion";
import { cn } from "@/lib/utils";

/** Destino después de entrar: la ruta que pidió (si le corresponde) o su inicio. */
function destino(u: Usuario, siguiente: string | null) {
  if (siguiente) {
    const [ruta, query] = siguiente.split("?");
    if (permitido(u, ruta, new URLSearchParams(query ?? "").get("area"))) return siguiente;
  }
  return u.inicio;
}

/**
 * Inicio de sesión simulado: correo y contraseña. No hay servidor; las credenciales de la
 * maqueta están en `src/lib/sesion.ts`.
 */
export default function Login() {
  const sesion = useSesion();
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const siguiente = params.get("siguiente");
  // "Cerrar sesión" llega aquí con ?salir=1: se cierra la sesión de esta pestaña sin redirigir.
  const saliendo = params.has("salir");
  useLayoutEffect(() => {
    if (!saliendo) return;
    cerrarSesion();
    setParams({}, { replace: true });
  }, [saliendo, setParams]);

  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => {
    document.title = "Iniciar sesión · Momi WMS";
    return () => {
      document.title = "Momi PDA";
    };
  }, []);

  if (sesion && !entrando && !saliendo) return <Navigate to={destino(sesion, siguiente)} replace />;

  const entrar = () => {
    setError(null);
    setEntrando(true);
    // Una pausa breve para que se sienta como una validación contra el servidor.
    setTimeout(() => {
      const r = validar(correo, contrasena);
      if ("error" in r) {
        setError(r.error);
        setEntrando(false);
        return;
      }
      iniciarSesion(r.usuario.id);
      navegar(destino(r.usuario, siguiente), { replace: true });
    }, 700);
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary-foreground font-display text-xl font-extrabold text-primary">M</span>
          <span className="font-display text-xl font-extrabold">Momi WMS</span>
        </div>
        <div>
          <p className="font-display text-4xl leading-tight font-extrabold text-balance">Del andén a la vitrina, cada movimiento con nombre, hora y lote.</p>
          <p className="mt-4 max-w-md text-primary-foreground/80">Recibo, acomodo, surtido, pedidos de las áreas y planeación en un solo lugar.</p>
        </div>
        <p className="text-sm text-primary-foreground/70">Dulcería Momi, S.A. · Panamá</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-xl bg-primary font-display text-xl font-extrabold text-primary-foreground">M</span>
            <span className="font-display text-xl font-extrabold">Momi WMS</span>
          </div>
          <h1 className="font-display text-3xl font-extrabold">Iniciar sesión</h1>
          <p className="mt-1 text-muted-foreground">Entra con tu correo de Momi.</p>
          {siguiente && <p className="mt-3 rounded-xl bg-alerta/10 px-3 py-2 text-sm text-alerta">Inicia sesión para continuar.</p>}

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              entrar();
            }}
          >
            <div>
              <label htmlFor="correo" className="text-sm font-semibold">
                Correo
              </label>
              <div className="relative mt-1">
                <Mail size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="correo"
                  type="email"
                  autoComplete="username"
                  required
                  value={correo}
                  onChange={(e) => {
                    setCorreo(e.target.value);
                    setError(null);
                  }}
                  placeholder="nombre@momi.test"
                  className={cn("h-12 w-full rounded-xl border bg-background pr-3 pl-10", error ? "border-critico" : "border-input")}
                />
              </div>
            </div>
            <div>
              <label htmlFor="contrasena" className="text-sm font-semibold">
                Contraseña
              </label>
              <div className="relative mt-1">
                <Lock size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="contrasena"
                  type={ver ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={contrasena}
                  onChange={(e) => {
                    setContrasena(e.target.value);
                    setError(null);
                  }}
                  className={cn("h-12 w-full rounded-xl border bg-background pr-11 pl-10", error ? "border-critico" : "border-input")}
                />
                <button
                  type="button"
                  onClick={() => setVer(!ver)}
                  aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  {ver ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-critico/10 px-3 py-2 text-sm text-critico">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={entrando || !correo || !contrasena}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
            >
              {entrando ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden /> Entrando…
                </>
              ) : (
                "Iniciar sesión"
              )}
            </button>
          </form>

          <button type="button" onClick={() => setAyuda(!ayuda)} className="mt-4 text-sm font-semibold text-primary underline underline-offset-4">
            ¿Olvidaste tu contraseña?
          </button>
          {ayuda && <p className="mt-2 text-sm text-muted-foreground">Pide tu acceso a quien administra la maqueta. En esta versión de pruebas no se envían correos.</p>}

          <p className="mt-10 text-xs text-muted-foreground">Maqueta con datos de ejemplo. La sesión es por pestaña: puedes abrir otra pestaña con otro usuario.</p>
        </div>
      </main>
    </div>
  );
}
