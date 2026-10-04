import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { usePda } from "@/context/PdaContext";
import PdaLayout from "@/pages/PdaLayout";
import Tareas from "@/pages/Tareas";
import Recibir from "@/pages/recibir/Recibir";
import Acomodar from "@/pages/acomodar/Acomodar";
import Surtir from "@/pages/surtir/Surtir";
import Contar from "@/pages/Contar";
import Trasladar from "@/pages/Trasladar";
import Tienda from "@/pages/Tienda";
import SupervisorMovil from "@/pages/supervisor/SupervisorMovil";
import SupervisorDesktop from "@/pages/supervisor/SupervisorDesktop";
import Area from "@/pages/area/Area";
import AreaEscritorio from "@/pages/area/AreaEscritorio";
import Login from "@/pages/Login";
import Direccion from "@/pages/direccion/Direccion";
import { Inicio, Protegida } from "@/components/Protegida";

export default function App() {
  const { oscuro } = usePda();
  const { pathname } = useLocation();
  // En escritorio los avisos van abajo a la derecha para no tapar el encabezado ni los indicadores;
  // en el PDA, arriba al centro, donde el operador los ve al instante.
  const escritorio = pathname.startsWith("/supervisor") || pathname === "/area" || pathname.startsWith("/direccion");
  return (
    <>
      <Toaster
        position={escritorio ? "bottom-right" : "top-center"}
        richColors
        closeButton
        visibleToasts={escritorio ? 4 : 3}
        offset={escritorio ? 24 : 16}
        theme={oscuro ? "dark" : "light"}
      />
      <Rutas />
    </>
  );
}

function Rutas() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/pda"
        element={
          <Protegida>
            <PdaLayout />
          </Protegida>
        }
      >
        <Route index element={<Tareas />} />
        <Route path="recibir" element={<Recibir />} />
        <Route path="acomodar" element={<Acomodar />} />
        <Route path="surtir" element={<Surtir />} />
        {/* La ventana 10:00 ahora es parte de la cola única de Surtir. */}
        <Route path="surtir-ventana" element={<Navigate to="/pda/surtir" replace />} />
        <Route path="contar" element={<Contar />} />
        <Route path="trasladar" element={<Trasladar />} />
        <Route path="tienda" element={<Tienda />} />
        <Route path="supervisor" element={<SupervisorMovil />} />
        <Route path="area" element={<Area />} />
      </Route>
      <Route
        path="/supervisor"
        element={
          <Protegida>
            <SupervisorDesktop />
          </Protegida>
        }
      />
      <Route
        path="/area"
        element={
          <Protegida>
            <AreaEscritorio />
          </Protegida>
        }
      />
      <Route
        path="/direccion/:seccion?"
        element={
          <Protegida>
            <Direccion />
          </Protegida>
        }
      />
      <Route path="*" element={<Inicio />} />
    </Routes>
  );
}
