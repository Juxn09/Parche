import { Route, Routes, useLocation } from "react-router";
import Encabezado from "./componentes/Encabezado.jsx";
import ErrorPantalla from "./componentes/ErrorPantalla.jsx";
import Detalle from "./paginas/Detalle.jsx";
import Ingresar from "./paginas/Ingresar.jsx";
import Inicio from "./paginas/Inicio.jsx";
import MisReservas from "./paginas/MisReservas.jsx";
import NoEncontrada from "./paginas/NoEncontrada.jsx";
import PanelAdmin from "./paginas/PanelAdmin.jsx";
import PanelPropietario from "./paginas/PanelPropietario.jsx";
import Partidos from "./paginas/Partidos.jsx";
import Registro from "./paginas/Registro.jsx";

export default function App() {
  const ubicacion = useLocation();
  return (
    <div className="min-h-dvh bg-fondo text-tinta">
      <Encabezado />
      <main>
        {/* key: al cambiar de pagina, el aviso de error se reinicia */}
        <ErrorPantalla key={ubicacion.pathname}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/ingresar" element={<Ingresar />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/canchas/:id" element={<Detalle />} />
          <Route path="/partidos" element={<Partidos />} />
          <Route path="/mis-reservas" element={<MisReservas />} />
          <Route path="/panel" element={<PanelPropietario />} />
          <Route path="/admin" element={<PanelAdmin />} />
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
        </ErrorPantalla>
      </main>
    </div>
  );
}
