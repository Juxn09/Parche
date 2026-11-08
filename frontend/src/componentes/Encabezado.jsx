import { LogOut } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router";
import { useSesion } from "../contexto/Sesion.jsx";

const NOMBRE_ROL = { cliente: "Jugador", propietario: "Propietario", admin: "Administrador" };

// La marca: "parche" en Archivo condensada con el punto naranja de un peto
export function Marca({ className = "" }) {
  return (
    <span className={`titular inline-flex items-baseline ${className}`}>
      parche
      <span className="ml-[0.06em] inline-block size-[0.24em] rounded-full bg-acento" />
    </span>
  );
}

export default function Encabezado() {
  const { usuario, salir } = useSesion();
  const navegar = useNavigate();

  const claseEnlace = ({ isActive }) =>
    `text-[15px] transition-colors duration-150 ${isActive ? "text-tinta" : "text-tinta-suave hover:text-tinta"}`;

  return (
    <header className="border-b border-linea bg-fondo">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Link to="/" aria-label="Parche, inicio">
          <Marca className="text-[2.1rem]" />
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          <NavLink to="/" end className={claseEnlace}>
            Buscar canchas
          </NavLink>
          <NavLink to="/partidos" className={claseEnlace}>
            Partidos abiertos
          </NavLink>
          {usuario?.rol === "cliente" && (
            <NavLink to="/mis-reservas" className={claseEnlace}>
              Mis reservas
            </NavLink>
          )}
          {usuario?.rol === "propietario" && (
            <NavLink to="/panel" className={claseEnlace}>
              Mi panel
            </NavLink>
          )}
          {usuario?.rol === "admin" && (
            <NavLink to="/admin" className={claseEnlace}>
              Administración
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {usuario ? (
            <>
              <p className="hidden text-right text-sm leading-tight sm:block">
                {usuario.nombre}
                <span className="block text-xs text-tinta-tenue">{NOMBRE_ROL[usuario.rol]}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  salir();
                  navegar("/");
                }}
                className="inline-flex h-9 items-center gap-2 rounded-pieza border border-linea-fuerte px-3 text-sm text-tinta-suave transition-colors duration-150 hover:border-tinta hover:text-tinta"
              >
                <LogOut className="size-4" strokeWidth={1.75} />
                Salir
              </button>
            </>
          ) : (
            <Link
              to="/ingresar"
              className="inline-flex h-9 items-center rounded-pieza bg-tinta px-4 text-sm font-semibold text-fondo transition-opacity duration-150 hover:opacity-85"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
