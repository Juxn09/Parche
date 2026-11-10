// Ficha de una cancha: datos de la sede ($lookup en la API), regleta de horas del dia
// (GET /api/canchas/{id}/disponibilidad) y el formulario para reservar (POST /api/reservas).
import { AlertCircle, ArrowLeft, Check, MapPin, Sun, Users, Warehouse } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { LineasDeporte } from "../componentes/Pictograma.jsx";
import Regleta, { LeyendaRegleta } from "../componentes/Regleta.jsx";
import { useSesion } from "../contexto/Sesion.jsx";
import { api, pesos } from "../servicios/Api.js";
import { METODOS_PAGO, SUPERFICIES, fechaLocal, nombreDia, nombreHora, unirConY } from "../servicios/Catalogo.js";

const DIAS_VISIBLES = 8;

export default function Detalle() {
  const { id } = useParams();
  const [parametros] = useSearchParams();
  const ubicacion = useLocation();
  const { usuario, token } = useSesion();

  const fechaInicial = parametros.get("fecha") || (new Date().getHours() >= 21 ? fechaLocal(1) : fechaLocal());
  const horaInicial = parametros.get("hora") ? Number(parametros.get("hora")) : null;

  const [cancha, setCancha] = useState(null);
  const [catalogo, setCatalogo] = useState([]);
  const [errorCarga, setErrorCarga] = useState(null);
  const [fecha, setFecha] = useState(fechaInicial);
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [inicio, setInicio] = useState(horaInicial);
  const [duracion, setDuracion] = useState(1);
  const [eleccion, setEleccion] = useState(0);
  const [metodo, setMetodo] = useState("nequi");
  const [abierta, setAbierta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorReserva, setErrorReserva] = useState(null);
  const [confirmada, setConfirmada] = useState(null);

  useEffect(() => {
    Promise.all([api(`/api/canchas/${id}`), api("/api/deportes")])
      .then(([datos, deportes]) => {
        setCancha(datos);
        setCatalogo(deportes);
      })
      .catch((e) => setErrorCarga(e.message));
  }, [id]);

  const cargarDisponibilidad = useCallback(() => {
    setDisponibilidad(null);
    return api(`/api/canchas/${id}/disponibilidad`, { parametros: { fecha } })
      .then(setDisponibilidad)
      .catch((e) => setErrorCarga(e.message));
  }, [id, fecha]);

  useEffect(() => {
    cargarDisponibilidad();
  }, [cargarDisponibilidad]);

  // Si hoy ya no queda ninguna hora libre (y no llegaron con una fecha elegida), pasar a manana
  useEffect(() => {
    if (!disponibilidad || parametros.get("fecha") || fecha !== fechaLocal()) return;
    if (disponibilidad.horas?.length && !disponibilidad.horas.some((h) => h.estado === "libre")) setFecha(fechaLocal(1));
  }, [disponibilidad, fecha, parametros]);

  // Si la hora que venia en la URL (o la elegida) ya no esta libre, se quita la seleccion:
  // antes se veia en naranja una hora "Ocupada".
  useEffect(() => {
    if (inicio === null || !disponibilidad) return;
    const h = disponibilidad.horas?.find((x) => x.hora === inicio);
    if (!h || h.estado !== "libre") setInicio(null);
  }, [disponibilidad, inicio]);

  // --- Calculos de la seleccion ---
  const horasDelDia = useMemo(() => disponibilidad?.horas ?? [], [disponibilidad]);
  const horasVisibles = horasDelDia.filter((h) => h.estado !== "pasada");
  const pasadas = horasDelDia.length - horasVisibles.length;
  const horasElegidas = useMemo(() => {
    if (inicio === null) return [];
    return horasDelDia.filter((h) => h.hora >= inicio && h.hora < inicio + duracion);
  }, [horasDelDia, inicio, duracion]);
  const seleccionValida =
    horasElegidas.length === duracion && horasElegidas.every((h) => h.estado === "libre");
  const precio = horasElegidas.reduce((total, h) => total + h.precio, 0);

  const deporteElegido = cancha?.deportes[eleccion];
  const jugadores =
    catalogo
      .find((d) => d.nombre === deporteElegido?.deporte)
      ?.modalidades.find((m) => m.nombre === deporteElegido?.modalidad)?.jugadores ?? 0;
  const puedeAbrir = jugadores >= 4;
  const cuota = puedeAbrir ? Math.ceil(precio / jugadores / 100) * 100 : 0;

  // Duraciones posibles desde la hora elegida (solo horas libres seguidas, maximo 3)
  const duracionMaxima = useMemo(() => {
    if (inicio === null) return 1;
    let n = 0;
    for (const h of horasDelDia) {
      if (h.hora === inicio + n && h.estado === "libre") n++;
      if (n === 3) break;
    }
    return Math.max(n, 1);
  }, [horasDelDia, inicio]);

  useEffect(() => {
    if (duracion > duracionMaxima) setDuracion(duracionMaxima);
  }, [duracion, duracionMaxima]);

  useEffect(() => {
    if (!puedeAbrir) setAbierta(false);
  }, [puedeAbrir]);

  async function reservar() {
    setEnviando(true);
    setErrorReserva(null);
    try {
      const reserva = await api("/api/reservas", {
        metodo: "POST",
        token,
        cuerpo: {
          cancha_id: id,
          fecha,
          hora_inicio: inicio,
          horas: duracion,
          deporte: deporteElegido.deporte,
          modalidad: deporteElegido.modalidad,
          metodo_pago: metodo,
          abierta,
        },
      });
      setConfirmada(reserva);
      setInicio(null);
      cargarDisponibilidad();
    } catch (e) {
      setErrorReserva(e.message);
      if (e.estado === 409) cargarDisponibilidad(); // alguien tomo la hora: refrescar la regleta
    } finally {
      setEnviando(false);
    }
  }

  if (errorCarga && !cancha) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="titular text-4xl">No encontramos esta cancha</p>
        <p className="mt-2 text-tinta-suave">{errorCarga}</p>
        <Link to="/" className="mt-6 inline-block font-semibold underline underline-offset-4">
          Volver a buscar canchas
        </Link>
      </section>
    );
  }
  if (!cancha) return <EsqueletoDetalle />;

  const sede = cancha.sede_completa;
  const dias = Array.from({ length: DIAS_VISIBLES }, (_, i) => fechaLocal(i));

  return (
    <>
      {/* ---------------- Cabecera de la cancha ---------------- */}
      <section className="grama relative overflow-hidden text-cal">
        <LineasDeporte
          deporte={cancha.deportes[0].deporte}
          className="pointer-events-none absolute -right-24 top-1/2 hidden h-[140%] -translate-y-1/2 text-cal/10 lg:block"
        />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-10 pt-6 sm:px-6 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-cal/80 hover:text-cal">
              <ArrowLeft className="size-4" />
              Todas las canchas
            </Link>
            <p className="mt-8 text-lg text-cal/85">{sede.nombre}</p>
            <h1 className="titular text-[clamp(3.5rem,9vw,6.5rem)]">{cancha.nombre}</h1>
            <p className="mt-4 flex items-start gap-2 text-cal/85">
              <MapPin className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              {sede.direccion}, {sede.zona}, {sede.ciudad}
            </p>
            <ul className="mt-5 flex flex-wrap gap-2 text-sm">
              {cancha.deportes.map((d) => (
                <li key={d.modalidad} className="rounded-[4px] bg-cal/15 px-2.5 py-1">
                  {d.modalidad}
                </li>
              ))}
              <li className="inline-flex items-center gap-1.5 rounded-[4px] bg-cal/15 px-2.5 py-1">
                {cancha.techada ? <Warehouse className="size-4" strokeWidth={1.75} /> : <Sun className="size-4" strokeWidth={1.75} />}
                {cancha.techada ? "Techada" : "Al aire libre"}
              </li>
              <li className="rounded-[4px] bg-cal/15 px-2.5 py-1">{SUPERFICIES[cancha.superficie]}</li>
            </ul>
            {sede.servicios?.length > 0 && (
              <p className="mt-4 text-sm text-cal/75">La sede tiene {unirConY(sede.servicios)}.</p>
            )}
          </div>
          <FichaPrecio cancha={cancha} />
        </div>
      </section>

      {/* ---------------- Horas y reserva ---------------- */}
      <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <h2 className="titular text-4xl">Elige día y hora</h2>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Día">
            {dias.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={fecha === d}
                onClick={() => {
                  setFecha(d);
                  setInicio(null);
                  setConfirmada(null);
                  setErrorReserva(null);
                }}
                className={`h-10 shrink-0 rounded-full border px-4 text-sm font-medium first-letter:uppercase transition-colors duration-150 ${
                  fecha === d
                    ? "border-tinta bg-tinta text-fondo"
                    : "border-linea-fuerte text-tinta-suave hover:border-tinta hover:text-tinta"
                }`}
              >
                {nombreDia(d)}
              </button>
            ))}
          </div>

          {cancha.estado !== "activa" ? (
            <p className="mt-6 rounded-pieza border border-alerta/40 bg-superficie p-4 text-alerta">
              Esta cancha está en mantenimiento y no recibe reservas por ahora.
            </p>
          ) : !disponibilidad ? (
            <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-pieza bg-hundido" />
              ))}
            </div>
          ) : !disponibilidad.abierta ? (
            <p className="mt-6 text-tinta-suave">La sede no abre este día.</p>
          ) : (
            <>
              {pasadas > 0 && horasVisibles.length > 0 && (
                <p className="mt-5 text-sm text-tinta-suave">
                  Las horas antes de las {nombreHora(horasVisibles[0].hora)} ya pasaron.
                </p>
              )}
              {horasVisibles.length === 0 && (
                <p className="mt-6 text-tinta-suave">Por hoy ya no quedan horas. Elige otro día arriba.</p>
              )}
              <div className="mt-4">
                <Regleta
                  horas={horasVisibles}
                  elegidas={inicio !== null ? horasElegidas : []}
                  onElegir={(hora) => {
                    setInicio(hora);
                    setConfirmada(null);
                    setErrorReserva(null);
                  }}
                />
              </div>
              <LeyendaRegleta />
            </>
          )}
        </div>

        {/* ---------------- Panel de reserva ---------------- */}
        <aside className="h-fit rounded-pieza border border-linea bg-superficie p-5 lg:sticky lg:top-4">
          {confirmada ? (
            <Confirmacion reserva={confirmada} onOtra={() => setConfirmada(null)} />
          ) : (
            <>
              <h2 className="titular text-3xl">Tu reserva</h2>
              {inicio === null ? (
                <p className="mt-3 text-tinta-suave">Elige una hora libre para ver el precio.</p>
              ) : (
                <dl className="mt-4 space-y-3 text-sm">
                  <Fila etiqueta="Día">
                    <span className="first-letter:uppercase">{nombreDia(fecha)}</span>
                  </Fila>
                  <Fila etiqueta="Hora">
                    {nombreHora(inicio)} a {nombreHora(inicio + duracion)}
                  </Fila>
                  <Fila etiqueta="Duración">
                    <select
                      value={duracion}
                      onChange={(e) => setDuracion(Number(e.target.value))}
                      className="rounded-[4px] border border-linea-fuerte bg-superficie px-2 py-1"
                    >
                      {[1, 2, 3].filter((n) => n <= duracionMaxima).map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "hora" : "horas"}
                        </option>
                      ))}
                    </select>
                  </Fila>
                  {cancha.deportes.length > 1 && (
                    <Fila etiqueta="Vas a jugar">
                      <select
                        value={eleccion}
                        onChange={(e) => setEleccion(Number(e.target.value))}
                        className="rounded-[4px] border border-linea-fuerte bg-superficie px-2 py-1"
                      >
                        {cancha.deportes.map((d, i) => (
                          <option key={d.modalidad} value={i}>
                            {d.modalidad}
                          </option>
                        ))}
                      </select>
                    </Fila>
                  )}
                  <Fila etiqueta="Pago">
                    <select
                      value={metodo}
                      onChange={(e) => setMetodo(e.target.value)}
                      className="rounded-[4px] border border-linea-fuerte bg-superficie px-2 py-1"
                    >
                      {Object.entries(METODOS_PAGO).map(([valor, nombre]) => (
                        <option key={valor} value={valor}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                  </Fila>
                </dl>
              )}

              {inicio !== null && puedeAbrir && (
                <label className="mt-5 flex cursor-pointer gap-3 rounded-pieza bg-hundido p-3">
                  <input
                    type="checkbox"
                    checked={abierta}
                    onChange={(e) => setAbierta(e.target.checked)}
                    className="mt-1 size-4 accent-[var(--acento)]"
                  />
                  <span className="text-sm">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Users className="size-4" strokeWidth={1.75} />
                      Abrir el partido
                    </span>
                    <span className="mt-0.5 block text-tinta-suave">
                      Hasta {jugadores - 1} jugadores más pueden unirse y te pagan {pesos(cuota)} cada uno.
                    </span>
                  </span>
                </label>
              )}

              {inicio !== null && (
                <div className="mt-5 flex items-baseline justify-between border-t border-linea pt-4">
                  <span className="text-sm text-tinta-suave">Total</span>
                  <span className="titular cifras text-4xl">{pesos(precio)}</span>
                </div>
              )}

              {errorReserva && (
                <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-error">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  {errorReserva}
                </p>
              )}

              {!usuario ? (
                <Link
                  to="/ingresar"
                  state={{ desde: ubicacion.pathname + ubicacion.search }}
                  className="mt-5 flex h-11 items-center justify-center rounded-pieza bg-tinta font-semibold text-fondo hover:opacity-85"
                >
                  Ingresa para reservar
                </Link>
              ) : usuario.rol !== "cliente" ? (
                <p className="mt-5 text-sm text-tinta-suave">
                  Las reservas se hacen con una cuenta de jugador. Estás como {usuario.rol}.
                </p>
              ) : (
                <button
                  type="button"
                  disabled={!seleccionValida || enviando}
                  onClick={reservar}
                  className="mt-5 h-11 w-full rounded-pieza bg-acento font-semibold text-acento-tinta transition-[filter,opacity] duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {enviando ? "Reservando" : inicio === null ? "Elige una hora" : `Reservar y pagar ${pesos(precio)}`}
                </button>
              )}
              <p className="mt-3 text-xs text-tinta-tenue">
                El pago es simulado. Puedes cancelar gratis hasta 24 horas antes.
              </p>
            </>
          )}
        </aside>
      </section>
    </>
  );
}

// Mientras carga: la misma forma de la pagina (cabecera de grama + regleta), sin datos
function EsqueletoDetalle() {
  return (
    <div aria-label="Cargando la cancha" role="status">
      <div className="grama">
        <div className="mx-auto max-w-6xl space-y-4 px-4 pb-10 pt-14 sm:px-6">
          <div className="h-5 w-40 animate-pulse rounded bg-cal/15" />
          <div className="h-16 w-72 max-w-full animate-pulse rounded bg-cal/15" />
          <div className="h-5 w-64 max-w-full animate-pulse rounded bg-cal/15" />
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 px-4 py-10 sm:grid-cols-6 sm:px-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-pieza bg-hundido" />
        ))}
      </div>
    </div>
  );
}

function Fila({ etiqueta, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-tinta-suave">{etiqueta}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

// Ficha de la cancha: su dibujo (segun el deporte) y lo que cuesta
function FichaPrecio({ cancha }) {
  return (
    <div className="rounded-pieza bg-grama-profunda/85 p-5 ring-1 ring-cal/15">
      <LineasDeporte deporte={cancha.deportes[0].deporte} className="hidden w-full text-cal/70 sm:block" />
      <div className="flex items-end justify-between gap-4 sm:mt-5">
        <div>
          <p className="titular cifras text-5xl">{pesos(cancha.precio_hora)}</p>
          <p className="mt-1 text-sm text-cal/75">la hora</p>
        </div>
        <div className="text-right">
          <p className="titular cifras text-2xl">{pesos(cancha.precio_hora_pico)}</p>
          <p className="mt-1 text-xs text-cal/75">de 6 a 10 p. m.</p>
        </div>
      </div>
    </div>
  );
}

function Confirmacion({ reserva, onOtra }) {
  const partido = reserva.partido_abierto;
  return (
    <div>
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-exito text-white">
        <Check className="size-5" strokeWidth={2.25} />
      </span>
      <h2 className="titular mt-4 text-3xl">Reserva confirmada</h2>
      <p className="mt-2 text-tinta-suave">
        <span className="first-letter:uppercase">{nombreDia(reserva.fecha)}</span> de {nombreHora(reserva.hora_inicio)} a{" "}
        {nombreHora(reserva.hora_fin)} en {reserva.cancha.nombre}, {reserva.cancha.sede}.
      </p>
      <p className="titular cifras mt-4 text-3xl">{pesos(reserva.precio_total)}</p>
      <p className="text-sm text-tinta-suave">Pagado con {METODOS_PAGO[reserva.pago.metodo]}</p>
      {partido && (
        <p className="mt-4 rounded-pieza bg-hundido p-3 text-sm">
          Tu partido quedó abierto: {partido.cupos_totales - 1} cupos a {pesos(partido.cuota)} cada uno.
        </p>
      )}
      <button
        type="button"
        onClick={onOtra}
        className="mt-5 h-10 w-full rounded-pieza border border-linea-fuerte text-sm font-semibold hover:border-tinta"
      >
        Reservar otra hora
      </button>
    </div>
  );
}
