// Mis reservas: las que organizo y los partidos a los que me uni (GET /api/reservas/mias).
// Cancelar (organizador) y salir del partido (participante) aplican las reglas de 24 horas en la API.
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import Cupos from "../componentes/Cupos.jsx";
import Pictograma, { LineasDeporte } from "../componentes/Pictograma.jsx";
import { useSesion } from "../contexto/Sesion.jsx";
import { api, pesos } from "../servicios/Api.js";
import { METODOS_PAGO, horasParaEmpezar, nombreDia, nombreHora } from "../servicios/Catalogo.js";

const PESTANAS = [
  { clave: "proximas", nombre: "Próximas" },
  { clave: "pasadas", nombre: "Jugadas" },
  { clave: "canceladas", nombre: "Canceladas" },
];

export default function MisReservas() {
  const { usuario, token } = useSesion();
  const [reservas, setReservas] = useState(null);
  const [error, setError] = useState(null);
  const [pestana, setPestana] = useState("proximas");
  const [confirmando, setConfirmando] = useState(null);
  const [avisos, setAvisos] = useState({});

  const cargar = useCallback(() => {
    if (!token) return;
    return api("/api/reservas/mias", { token })
      .then(setReservas)
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const grupos = useMemo(() => {
    const g = { proximas: [], pasadas: [], canceladas: [] };
    for (const r of reservas ?? []) {
      // "Proxima" = activa y todavia no termina (hora de FIN, no solo la fecha): asi un partido
      // de hoy que ya acabo pasa a "Jugadas" aunque la API aun no lo haya marcado como finalizada.
      if (r.estado === "cancelada") g.canceladas.push(r);
      else if (r.estado === "activa" && horasParaEmpezar(r.fecha, r.hora_fin) > 0) g.proximas.push(r);
      else g.pasadas.push(r);
    }
    g.proximas.reverse(); // la mas cercana primero
    return g;
  }, [reservas]);

  if (!usuario) return <Navigate to="/ingresar" state={{ desde: "/mis-reservas" }} replace />;

  async function accion(reserva, tipo) {
    try {
      const ruta = tipo === "cancelar" ? `/api/reservas/${reserva._id}/cancelar` : `/api/partidos/${reserva._id}/salir`;
      const r = await api(ruta, { metodo: "POST", token });
      const texto =
        tipo === "cancelar"
          ? `Reserva cancelada. Se reembolsan ${pesos(reserva.precio_total)}.`
          : r.detalle;
      setAvisos((a) => ({ ...a, [reserva._id]: { tipo: "ok", texto } }));
      setConfirmando(null);
      await cargar();
    } catch (e) {
      setAvisos((a) => ({ ...a, [reserva._id]: { tipo: "error", texto: e.message } }));
      setConfirmando(null);
    }
  }

  const lista = grupos[pestana];
  const avisosSueltos = Object.entries(avisos).filter(([id]) => !lista.some((r) => r._id === id));

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="titular text-6xl">Mis reservas</h1>

      <div className="mt-6 flex gap-2" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            onClick={() => setPestana(p.clave)}
            className={`h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${
              pestana === p.clave
                ? "border-tinta bg-tinta text-fondo"
                : "border-linea-fuerte text-tinta-suave hover:border-tinta hover:text-tinta"
            }`}
          >
            {p.nombre}
            <span className="cifras ml-1.5 opacity-60">{grupos[p.clave].length}</span>
          </button>
        ))}
      </div>

      {avisosSueltos.map(([id, a]) => (
        <p key={id} className={`mt-4 text-sm ${a.tipo === "ok" ? "text-exito" : "text-error"}`}>
          {a.texto}
        </p>
      ))}

      {pestana === "proximas" && grupos.proximas[0] && (
        <ProximoPartido reserva={grupos.proximas[0]} organizo={grupos.proximas[0].usuario_id === usuario._id} />
      )}

      <div className="mt-6">
        {error ? (
          <p className="flex items-center gap-2 text-error">
            <AlertCircle className="size-4" /> {error}
          </p>
        ) : !reservas ? (
          <div className="h-48 animate-pulse rounded-pieza bg-hundido" aria-label="Cargando" />
        ) : lista.length === 0 ? (
          <div className="rounded-pieza border border-dashed border-linea-fuerte px-6 py-12 text-center">
            <p className="titular text-3xl">
              {pestana === "proximas" ? "No tienes reservas próximas" : "Nada por aquí"}
            </p>
            {pestana === "proximas" && (
              <Link to="/" className="mt-4 inline-block font-semibold underline underline-offset-4">
                Buscar una cancha
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-linea overflow-hidden rounded-pieza border border-linea bg-superficie">
            {lista.map((r) => {
              const organizo = r.usuario_id === usuario._id;
              const pa = r.partido_abierto;
              const aviso = avisos[r._id];
              const faltan = horasParaEmpezar(r.fecha, r.hora_inicio);
              // La interfaz solo orienta: la regla real la aplica la API con la hora del servidor
              const puedeCancelar = !organizo || faltan >= 24;
              return (
                <li key={r._id} className="grid gap-4 px-4 py-5 sm:grid-cols-[auto_9rem_1fr_auto] sm:gap-6 sm:px-6">
                  <Pictograma deporte={r.deporte} className="hidden w-16 sm:block" />
                  <div>
                    <p className="titular whitespace-nowrap text-3xl first-letter:uppercase">{nombreDia(r.fecha)}</p>
                    <p className="cifras text-sm text-tinta-suave">
                      {nombreHora(r.hora_inicio)} a {nombreHora(r.hora_fin)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {r.cancha.nombre}, {r.cancha.sede}
                    </p>
                    <p className="text-sm text-tinta-suave">
                      {r.modalidad}. {organizo ? "Tú organizas" : `Te uniste al partido de ${r.usuario.nombre}`}
                    </p>
                    {pa && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <Cupos total={pa.cupos_totales} ocupados={pa.participantes.length + 1} />
                        {organizo
                          ? `${pa.participantes.length} se unieron. Te han pagado ${pesos(pa.participantes.length * pa.cuota)}`
                          : `Pagaste ${pesos(pa.cuota)}`}
                      </div>
                    )}
                    {aviso && (
                      <p className={`mt-2 text-sm ${aviso.tipo === "ok" ? "text-exito" : "text-error"}`}>{aviso.texto}</p>
                    )}
                  </div>
                  <div className="sm:text-right">
                    {organizo && (
                      <>
                        <p className="titular cifras text-3xl">{pesos(r.precio_total)}</p>
                        <p className="text-sm text-tinta-suave">
                          {r.estado === "cancelada" ? "Reembolsado" : METODOS_PAGO[r.pago.metodo]}
                        </p>
                      </>
                    )}
                    {pestana === "proximas" && !puedeCancelar && (
                      <p className="mt-2 max-w-[13rem] text-sm text-tinta-tenue sm:ml-auto">
                        Ya no se puede cancelar: faltan menos de 24 horas.
                      </p>
                    )}
                    {pestana === "proximas" &&
                      puedeCancelar &&
                      (confirmando === r._id ? (
                        <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                          {!organizo && faltan < 24 && (
                            <p className="w-full text-xs text-alerta">Faltan menos de 24 h: no se devuelve tu cuota.</p>
                          )}
                          <button
                            type="button"
                            onClick={() => accion(r, organizo ? "cancelar" : "salir")}
                            className="h-9 rounded-pieza bg-error px-3 text-sm font-semibold text-white"
                          >
                            {organizo ? "Sí, cancelar" : "Sí, salir"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmando(null)}
                            className="h-9 rounded-pieza border border-linea-fuerte px-3 text-sm"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmando(r._id)}
                          className="mt-2 h-9 rounded-pieza border border-linea-fuerte px-3 text-sm text-tinta-suave hover:border-error hover:text-error"
                        >
                          {organizo ? "Cancelar reserva" : "Salir del partido"}
                        </button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-4 text-sm text-tinta-tenue">
        Cancelar o salir con más de 24 horas de anticipación devuelve el dinero.
      </p>
    </section>
  );
}

// "En 2 días", "en 5 horas", "en 40 minutos": cuánto falta, en palabras
function cuantoFalta(horas) {
  if (horas >= 48) return `en ${Math.floor(horas / 24)} días`;
  if (horas >= 24) {
    const resto = Math.floor(horas - 24);
    return resto ? `en 1 día y ${resto} ${resto === 1 ? "hora" : "horas"}` : "en 1 día";
  }
  if (horas >= 1) return `en ${Math.floor(horas)} ${Math.floor(horas) === 1 ? "hora" : "horas"}`;
  if (horas > 0) return `en ${Math.max(1, Math.round(horas * 60))} minutos`;
  return "ya empezó";
}

// La reserva más cercana, como la boleta de entrada a la cancha
function ProximoPartido({ reserva, organizo }) {
  const pa = reserva.partido_abierto;
  const faltan = horasParaEmpezar(reserva.fecha, reserva.hora_inicio);
  const enJuego = faltan <= 0 && horasParaEmpezar(reserva.fecha, reserva.hora_fin) > 0;
  return (
    <section className="grama relative mt-6 overflow-hidden rounded-pieza text-cal">
      <LineasDeporte deporte={reserva.deporte} className="pointer-events-none absolute -right-10 top-1/2 h-[130%] -translate-y-1/2 text-cal/10" />
      <div className="relative grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-7">
        <div>
          <p className="text-sm text-cal/75">
            {enJuego ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-acento" /> En juego ahora mismo
              </span>
            ) : (
              `Tu próximo partido, ${cuantoFalta(faltan)}`
            )}
          </p>
          <p className="titular mt-2 text-5xl first-letter:uppercase sm:text-6xl">
            {nombreDia(reserva.fecha)}, {nombreHora(reserva.hora_inicio)}
          </p>
          <p className="mt-3 text-cal/85">
            {reserva.modalidad} en {reserva.cancha.nombre}, {reserva.cancha.sede}, hasta las {nombreHora(reserva.hora_fin)}
          </p>
        </div>
        {pa && (
          <div className="sm:text-right">
            <Cupos total={pa.cupos_totales} ocupados={pa.participantes.length + 1} tamano="size-3.5" />
            <p className="mt-2 text-sm text-cal/80">
              {pa.participantes.length + 1} de {pa.cupos_totales} jugadores
              {organizo ? "" : ". Te uniste a este partido"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
