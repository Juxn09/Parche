// Partidos abiertos: reservas cuyo organizador dejo cupos para que otros se unan.
// Unirse usa POST /api/partidos/{id}/unirse, que en la API es una actualizacion atomica.
import { AlertCircle, Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import Cupos from "../componentes/Cupos.jsx";
import Pictograma from "../componentes/Pictograma.jsx";
import { useSesion } from "../contexto/Sesion.jsx";
import { api, pesos } from "../servicios/Api.js";
import { nombreDia, nombreHora } from "../servicios/Catalogo.js";

export default function Partidos() {
  const { usuario, token } = useSesion();
  const ubicacion = useLocation();
  const [deportes, setDeportes] = useState([]);
  const [deporte, setDeporte] = useState("");
  const [partidos, setPartidos] = useState(null);
  const [error, setError] = useState(null);
  const [avisos, setAvisos] = useState({}); // por partido: { tipo, texto }
  const [uniendo, setUniendo] = useState(null);

  const cargar = useCallback(() => {
    setError(null);
    return api("/api/partidos", { parametros: { deporte } })
      .then(setPartidos)
      .catch((e) => setError(e.message));
  }, [deporte]);

  useEffect(() => {
    api("/api/deportes").then(setDeportes).catch(() => {});
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function unirse(partido) {
    setUniendo(partido._id);
    try {
      const r = await api(`/api/partidos/${partido._id}/unirse`, { metodo: "POST", token });
      setAvisos((a) => ({ ...a, [partido._id]: { tipo: "ok", texto: r.mensaje } }));
      await cargar();
    } catch (e) {
      setAvisos((a) => ({ ...a, [partido._id]: { tipo: "error", texto: e.message } }));
    } finally {
      setUniendo(null);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="titular text-6xl">Partidos abiertos</h1>
      <p className="mt-3 max-w-xl text-lg text-tinta-suave">
        Equipos a los que les faltan jugadores. Te unes pagando tu parte de la cancha y el organizador recibe tu cuota.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {[{ nombre: "" }, ...deportes].map((d) => (
          <button
            key={d.nombre || "todos"}
            type="button"
            onClick={() => setDeporte(d.nombre)}
            aria-pressed={deporte === d.nombre}
            className={`h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${
              deporte === d.nombre
                ? "border-tinta bg-tinta text-fondo"
                : "border-linea-fuerte text-tinta-suave hover:border-tinta hover:text-tinta"
            }`}
          >
            {d.nombre || "Todos"}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {error ? (
          <p className="flex items-center gap-2 text-error">
            <AlertCircle className="size-4" /> {error}
          </p>
        ) : !partidos ? (
          <div className="h-48 animate-pulse rounded-pieza bg-hundido" aria-label="Cargando" />
        ) : partidos.length === 0 ? (
          <div className="rounded-pieza border border-dashed border-linea-fuerte px-6 py-14 text-center">
            <p className="titular text-3xl">No hay partidos abiertos{deporte && ` de ${deporte.toLowerCase()}`}</p>
            <p className="mt-2 text-tinta-suave">Reserva una cancha y abre tu propio partido para que otros se sumen.</p>
            <Link to="/" className="mt-5 inline-block font-semibold underline underline-offset-4">
              Buscar canchas
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-linea overflow-hidden rounded-pieza border border-linea bg-superficie">
            {partidos.map((p) => {
              const pa = p.partido_abierto;
              const ocupados = pa.participantes.length + 1;
              const aviso = avisos[p._id];
              const soyOrganizador = usuario && p.usuario_id === usuario._id;
              const yaEstoy = usuario && pa.participantes.some((x) => x.usuario_id === usuario._id);
              return (
                <li key={p._id} className="grid gap-4 px-4 py-5 sm:grid-cols-[auto_9rem_1fr_auto] sm:gap-6 sm:items-center sm:px-6">
                  <Pictograma deporte={p.deporte} className="hidden w-20 sm:block" />
                  <div>
                    <p className="titular whitespace-nowrap text-3xl first-letter:uppercase">{nombreDia(p.fecha)}</p>
                    <p className="cifras text-sm text-tinta-suave">
                      {nombreHora(p.hora_inicio)} a {nombreHora(p.hora_fin)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {p.modalidad} en {p.cancha.nombre}, {p.cancha.sede}
                    </p>
                    <p className="text-sm text-tinta-suave">
                      {p.cancha.zona}. Organiza {p.usuario.nombre}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Cupos total={pa.cupos_totales} ocupados={ocupados} />
                      <span className="text-sm">
                        {p.cupos_libres === 1 ? "Queda 1 cupo" : `Quedan ${p.cupos_libres} cupos`}
                      </span>
                    </div>
                    {aviso && (
                      <p
                        role="status"
                        className={`mt-2 flex items-center gap-1.5 text-sm ${aviso.tipo === "ok" ? "text-exito" : "text-error"}`}
                      >
                        {aviso.tipo === "ok" ? <Check className="size-4" /> : <AlertCircle className="size-4" />}
                        {aviso.texto}
                      </p>
                    )}
                  </div>
                  <div className="sm:text-right">
                    <p className="titular cifras text-3xl">{pesos(pa.cuota)}</p>
                    <p className="text-sm text-tinta-suave">tu parte</p>
                    {!usuario ? (
                      <Link
                        to="/ingresar"
                        state={{ desde: ubicacion.pathname }}
                        className="mt-2 inline-flex h-10 items-center rounded-pieza bg-tinta px-4 text-sm font-semibold text-fondo hover:opacity-85"
                      >
                        Ingresa para unirte
                      </Link>
                    ) : usuario.rol !== "cliente" ? null : soyOrganizador ? (
                      <p className="mt-2 text-sm font-medium">Es tu partido</p>
                    ) : yaEstoy ? (
                      <p className="mt-2 text-sm font-medium text-exito">Ya estás dentro</p>
                    ) : (
                      <button
                        type="button"
                        disabled={uniendo === p._id}
                        onClick={() => unirse(p)}
                        className="mt-2 h-10 rounded-pieza bg-acento px-4 text-sm font-semibold text-acento-tinta hover:brightness-110 disabled:opacity-50"
                      >
                        {uniendo === p._id ? "Uniéndote" : "Unirme al partido"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-4 text-sm text-tinta-tenue">
        Puedes unirte hasta 2 horas antes. Si sales con más de 24 horas de anticipación, se te devuelve la cuota.
      </p>
    </section>
  );
}
