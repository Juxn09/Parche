// Encabezado y navegación. Una sola lista de enlaces por rol alimenta las dos barras:
// - arriba (desde 640 px): enlaces de texto con la línea de tiza bajo el activo;
// - abajo (en celular): barra fija con íconos, al alcance del pulgar.
import { CalendarCheck, LayoutDashboard, LogIn, LogOut, Search, ShieldCheck, Users } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router";
import { useSesion } from "../contexto/Sesion.jsx";

const NOMBRE_ROL = { cliente: "Jugador", propietario: "Propietario", admin: "Administrador" };

// Qué ve cada rol. "corto" es el texto bajo el ícono en la barra del celular.
export function enlacesSegunRol(usuario) {
  const enlaces = [
    { a: "/", nombre: "Buscar canchas", corto: "Buscar", icono: Search, exacto: true },
    { a: "/partidos", nombre: "Partidos abiertos", corto: "Partidos", icono: Users },
  ];
  if (usuario?.rol === "cliente") enlaces.push({ a: "/mis-reservas", nombre: "Mis reservas", corto: "Mis reservas", icono: CalendarCheck });
  if (usuario?.rol === "propietario") enlaces.push({ a: "/panel", nombre: "Mi panel", corto: "Mi panel", icono: LayoutDashboard });
  if (usuario?.rol === "admin") enlaces.push({ a: "/admin", nombre: "Administración", corto: "Admin", icono: ShieldCheck });
  if (!usuario) enlaces.push({ a: "/ingresar", nombre: "Ingresar", corto: "Ingresar", icono: LogIn, soloCelular: true });
  return enlaces;
}

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
  const enlaces = enlacesSegunRol(usuario);

  return (
    <>
      <header className="border-b border-linea bg-fondo">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
          <Link to="/" aria-label="Parche, inicio">
            <Marca className="text-[2.1rem]" />
          </Link>

          {/* Arriba: desde 640 px */}
          <nav aria-label="Principal" className="hidden h-full items-stretch gap-6 sm:flex">
            {enlaces
              .filter((e) => !e.soloCelular)
              .map((e) => (
                <NavLink
                  key={e.a}
                  to={e.a}
                  end={e.exacto}
                  className={({ isActive }) =>
                    `relative flex items-center text-[15px] transition-colors duration-150 ${
                      isActive ? "font-semibold text-tinta" : "text-tinta-suave hover:text-tinta"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {e.nombre}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-tiza transition-transform duration-300 ease-cancha ${
                          isActive ? "scale-x-100" : "scale-x-0"
                        }`}
                      />
                    </>
                  )}
                </NavLink>
              ))}
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
                  <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Salir
                </button>
              </>
            ) : (
              <Link
                to="/ingresar"
                className="hidden h-9 items-center rounded-pieza bg-tinta px-4 text-sm font-semibold text-fondo transition-opacity duration-150 hover:opacity-85 sm:inline-flex"
              >
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Abajo: solo en celular (menos de 640 px). Fija, con el área segura del iPhone. */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-linea bg-fondo/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {enlaces.map((e) => (
            <li key={e.a} className="flex-1">
              <NavLink
                to={e.a}
                end={e.exacto}
                className={({ isActive }) =>
                  `relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-150 ${
                    isActive ? "font-semibold text-tinta" : "text-tinta-suave"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-6 top-0 h-[3px] rounded-full bg-tiza transition-transform duration-300 ease-cancha ${
                        isActive ? "scale-x-100" : "scale-x-0"
                      }`}
                    />
                    <e.icono className="size-5" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
                    {e.corto}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
