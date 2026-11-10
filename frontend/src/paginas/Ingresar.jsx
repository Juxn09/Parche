// Inicio de sesion. La contrasena viaja a la API, que la compara con el hash bcrypt.
import { AlertCircle, Clock } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import LineasCancha from "../componentes/LineasCancha.jsx";
import { useSesion } from "../contexto/Sesion.jsx";

const CUENTAS_DEMO = [
  { rol: "Jugador", email: "santiago.suarez@gmail.com", nota: "Reserva canchas y se une a partidos" },
  { rol: "Propietaria", email: "laura.gomez@elgolazo.co", nota: "Administra El Golazo: 2 sedes, 6 canchas" },
  { rol: "Administrador", email: "admin@parche.co", nota: "Aprueba las sedes nuevas" },
];

export default function Ingresar() {
  const { ingresar } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (!email.trim() || !clave) {
      setError("Escribe tu correo y tu contraseña");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await ingresar(email.trim(), clave);
      navegar(ubicacion.state?.desde || "/"); // vuelve a la cancha que estaba viendo
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const claseCampo =
    "h-11 w-full rounded-pieza border border-linea-fuerte bg-superficie px-3 text-[15px] outline-none focus:border-acento";

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-20">
      <div className="max-w-md">
        <h1 className="titular text-6xl">Entra a tu cuenta</h1>
        <p className="mt-3 text-tinta-suave">
          Para reservar, cancelar y unirte a partidos abiertos. ¿No tienes cuenta?{" "}
          <Link to="/registro" className="font-semibold text-tinta underline underline-offset-4">
            Créala aquí
          </Link>
        </p>

        {ubicacion.state?.aviso && !error && (
          <p role="status" className="mt-6 flex items-start gap-2 rounded-pieza border border-alerta/40 bg-superficie p-3 text-sm">
            <Clock className="mt-0.5 size-4 shrink-0 text-alerta" strokeWidth={1.75} />
            {ubicacion.state.aviso}
          </p>
        )}

        <form onSubmit={enviar} noValidate className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Correo</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="tu.correo@gmail.com"
              className={claseCampo}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={clave}
              onChange={(e) => {
                setClave(e.target.value);
                setError(null);
              }}
              className={claseCampo}
            />
          </label>

          {error && (
            <p role="alert" className="flex items-center gap-2 text-sm text-error">
              <AlertCircle className="size-4" strokeWidth={1.75} />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="h-11 w-full rounded-pieza bg-acento font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
          >
            {enviando ? "Verificando" : "Ingresar"}
          </button>
        </form>
      </div>

      {/* Panel de cuentas de prueba sobre la "grama" */}
      <aside className="grama relative overflow-hidden rounded-pieza p-6 text-cal sm:p-8">
        <LineasCancha className="pointer-events-none absolute inset-0 size-full text-cal/20" />
        <div className="relative">
          <h2 className="titular text-4xl">Cuentas de prueba</h2>
          <p className="mt-2 max-w-sm text-sm text-cal/80">
            Usan la contraseña de prueba del equipo. Toca una cuenta para llenar el correo.
          </p>
          <ul className="mt-6 space-y-2">
            {CUENTAS_DEMO.map((c) => (
              <li key={c.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(c.email);
                    setError(null);
                  }}
                  className="w-full rounded-pieza bg-grama-profunda/80 px-4 py-3 text-left ring-1 ring-cal/15 transition-colors duration-150 hover:ring-cal/50"
                >
                  <span className="block font-semibold">{c.rol}</span>
                  <span className="block text-sm text-cal/80">{c.email}</span>
                  <span className="mt-1 block text-xs text-cal/60">{c.nota}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </section>
  );
}
