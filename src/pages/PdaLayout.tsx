import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Wifi } from "lucide-react";
import { useSesion } from "@/lib/sesion";
import { BannerMaqueta } from "@/components/ui/BannerMaqueta";
import { useAvisosEnVivo } from "@/components/incidencias/Avisos";
import { usePda } from "@/context/PdaContext";
import { ROLES, tareaPorRuta, type Rol } from "@/data/tareas";

/** Marco de teléfono: ancho de PDA centrado en pantallas grandes. */
function Telefono({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-muted">
      <div className="flex w-full max-w-[420px] flex-col bg-background shadow-sm">{children}</div>
    </div>
  );
}

export default function PdaLayout() {
  const { pathname } = useLocation();
  const { usuario, rol, setRol } = usePda();
  const sesion = useSesion();
  const navegar = useNavigate();
  const [verEstado, setVerEstado] = useState(false);
  // Avisos en vivo: el supervisor recibe lo nuevo; el operador, las decisiones.
  useAvisosEnVivo(pathname.endsWith("/pda/supervisor") ? ["supervisor"] : pathname.endsWith("/pda/area") ? [] : ["operador"]);

  // Recibir, Acomodar, Surtir y Supervisor son flujos a pantalla completa, sin encabezado.
  if (["/pda/recibir", "/pda/acomodar", "/pda/surtir", "/pda/supervisor", "/pda/area"].some((r) => pathname.endsWith(r))) {
    return (
      <Telefono>
        <Outlet />
      </Telefono>
    );
  }

  const tarea = tareaPorRuta(pathname);
  return (
    <Telefono>
      <BannerMaqueta className="sticky top-0 z-20" />
      <header className="sticky top-[29px] z-10 border-b border-border bg-card px-4 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-extrabold">{tarea ? tarea.titulo : "Tareas de piso"}</p>
            <label className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{usuario} ·</span>
              {sesion?.perfil === "supervisor" ? (
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as Rol)}
                  aria-label="Rol"
                  className="min-w-0 bg-transparent font-medium text-foreground"
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.etiqueta}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="truncate font-medium text-foreground">{sesion?.puesto}</span>
              )}
            </label>
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              navegar("/login?salir=1", { replace: true });
            }}
            aria-label="Cerrar sesión"
            className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground"
          >
            <LogOut size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-expanded={verEstado}
            onClick={() => setVerEstado((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-exito/30 bg-exito/10 px-2 py-1 text-xs font-medium text-exito"
          >
            <Wifi size={18} aria-hidden />
            En línea
          </button>
          </div>
        </div>
        {verEstado && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Conectado. Todo lo que registras se guarda al instante.
          </p>
        )}
      </header>
      <main className="flex-1 p-4 text-base">
        <Outlet />
      </main>
    </Telefono>
  );
}
