// Pagina de inicio: "¿Juegas hoy?"
// La portada es una cancha de noche con la agenda REAL de las horas pico (6 a 10 p. m.):
// cuantas canchas quedan libres en cada hora, consultando la API.
import { AlertCircle, Clock, MapPin, RotateCcw, Search, Sun, Warehouse, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import Cupos from "../componentes/Cupos.jsx";
import LineasCancha from "../componentes/LineasCancha.jsx";
import Pictograma from "../componentes/Pictograma.jsx";
import { Boton, InsigniaPico } from "../componentes/Piezas.jsx";
import { api, pesos } from "../servicios/Api.js";
import { SUPERFICIES, fechaLocal, horasCompactas, nombreDia, nombreHora, unirConY } from "../servicios/Catalogo.js";

const HORAS_NOCHE = [18, 19, 20, 21, 22];
const HORAS_FILTRO = Array.from({ length: 17 }, (_, i) => i + 6); // 6 a. m. a 10 p. m.
const FILTROS_VACIOS = {
  texto: "",
  deporte: "",
  modalidad: "",
  ciudad: "",
  precio_max: "",
  fecha: "",
  hora: "",
  techada: "",
  orden: "precio",
};

const PAGINA = 12; // canchas por pagina ("Cargar mas" trae las siguientes 12)

// Los parametros de busqueda que entiende GET /api/canchas
function parametrosDe(filtros) {
  const p = { ...filtros };
  if (!(filtros.fecha && filtros.hora !== "")) {
    delete p.fecha; // la disponibilidad necesita fecha Y hora
    delete p.hora;
  }
  return p;
}

// Agrupa por sede conservando el orden de aparicion (la sede de la cancha mas barata va primero)
function agruparPorSede(canchas) {
  const grupos = new Map();
  for (const c of canchas) {
    if (!grupos.has(c.sede_id)) grupos.set(c.sede_id, { id: c.sede_id, sede: c.sede, canchas: [] });
    grupos.get(c.sede_id).canchas.push(c);
  }
  return [...grupos.values()];
}

export default function Inicio() {
  // Despues de las 9 p. m. ya no queda "esta noche": la portada muestra la de manana
  const esManana = new Date().getHours() >= 21;
  const fechaNoche = fechaLocal(esManana ? 1 : 0);

  const [deportes, setDeportes] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [noche, setNoche] = useState(null);
  const [errorNoche, setErrorNoche] = useState(false);
  const [partidos, setPartidos] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [textoEscrito, setTextoEscrito] = useState("");
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [agregadas, setAgregadas] = useState(null); // cuantas trajo el ultimo "Cargar mas"
  const [libresHoy, setLibresHoy] = useState({}); // id de cancha -> { libres, motivo }
  const buscadorRef = useRef(null);
  const busquedaActual = useRef(""); // para descartar respuestas de filtros viejos

  // "Libre hoy" es un extra: si falla o tarda, la lista se muestra igual, sin esa fila
  function pedirLibresHoy(canchas) {
    if (!canchas.length) return;
    api("/api/canchas/libres-hoy", { parametros: { ids: canchas.map((c) => c._id).join(",") } })
      .then((r) => setLibresHoy((previo) => ({ ...previo, ...r.canchas })))
      .catch(() => {});
  }

  // 1. Catalogo de deportes y todas las canchas (para conteos y listas de filtros)
  useEffect(() => {
    Promise.all([api("/api/deportes"), api("/api/canchas", { parametros: { limite: 100 } })])
      .then(([listaDeportes, todas]) => {
        setDeportes(listaDeportes);
        setCatalogo(todas.resultados);
      })
      .catch(() => {});
  }, [intento]);

  // 2. La agenda de la noche: una consulta por hora pico (la API excluye las canchas ocupadas)
  useEffect(() => {
    const horaActual = new Date().getHours();
    Promise.all(
      HORAS_NOCHE.map((h) =>
        !esManana && h <= horaActual
          ? Promise.resolve({ hora: h, pasada: true, libres: 0 })
          : api("/api/canchas", { parametros: { fecha: fechaNoche, hora: h, limite: 1 } }).then((d) => ({
              hora: h,
              pasada: false,
              libres: d.total,
            })),
      ),
    )
      .then((datos) => {
        setNoche(datos);
        setErrorNoche(false);
      })
      // Un error NO es lo mismo que "no quedan horas": se muestra distinto
      .catch(() => setErrorNoche(true));
  }, [fechaNoche, esManana, intento]);

  // Partidos abiertos que buscan jugadores (la funcion diferencial de Parche, en la portada)
  useEffect(() => {
    api("/api/partidos")
      .then((lista) => setPartidos(lista.slice(0, 3)))
      .catch(() => setPartidos([]));
  }, [intento]);

  // 3. El texto espera 300 ms despues de la ultima tecla (no una peticion por letra)
  useEffect(() => {
    const espera = setTimeout(() => setFiltros((f) => ({ ...f, texto: textoEscrito.trim() })), 300);
    return () => clearTimeout(espera);
  }, [textoEscrito]);

  // 4. Cada vez que cambia un filtro, se consulta la API
  //    Al cambiar un filtro se empieza de cero (saltar = 0); "Cargar mas" agrega la pagina siguiente.
  useEffect(() => {
    let vigente = true;
    busquedaActual.current = JSON.stringify(parametrosDe(filtros));
    setAgregadas(null);
    setCargando(true);
    setError(null);
    api("/api/canchas", { parametros: { ...parametrosDe(filtros), limite: PAGINA, saltar: 0 } })
      .then((datos) => {
        if (!vigente) return;
        setResultado(datos);
        pedirLibresHoy(datos.resultados);
      })
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [filtros, intento]);

  async function cargarMas() {
    const firma = busquedaActual.current;
    setCargandoMas(true);
    try {
      const datos = await api("/api/canchas", {
        parametros: { ...parametrosDe(filtros), limite: PAGINA, saltar: resultado.resultados.length },
      });
      if (busquedaActual.current !== firma) return; // el filtro cambio mientras cargaba: se descarta
      const vistos = new Set(resultado.resultados.map((c) => c._id)); // defensa extra contra repetidos
      const nuevas = datos.resultados.filter((c) => !vistos.has(c._id));
      setResultado((previo) => ({ ...datos, resultados: [...previo.resultados, ...nuevas] }));
      // Aviso discreto: como la lista va agrupada por sede, las nuevas pueden quedar en grupos de arriba
      setAgregadas(nuevas.length);
      pedirLibresHoy(nuevas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargandoMas(false);
    }
  }

  const conteos = useMemo(() => {
    const porDeporte = {};
    for (const c of catalogo) {
      for (const d of new Set(c.deportes.map((x) => x.deporte))) porDeporte[d] = (porDeporte[d] || 0) + 1;
    }
    return { porDeporte, ciudades: [...new Set(catalogo.map((c) => c.sede.ciudad))].sort() };
  }, [catalogo]);

  const modalidades = deportes.find((d) => d.nombre === filtros.deporte)?.modalidades ?? [];
  const cambiar = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const hayFiltros =
    textoEscrito || Object.entries(filtros).some(([k, v]) => k !== "orden" && k !== "texto" && v !== "");
  const limpiar = () => {
    setTextoEscrito("");
    setFiltros(FILTROS_VACIOS);
  };
  const verHora = (hora) => {
    setFiltros((f) => ({ ...f, fecha: fechaNoche, hora: String(hora) }));
    buscadorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const horaElegida = filtros.fecha === fechaNoche && filtros.hora !== "" ? Number(filtros.hora) : null;
  const mejorHora = noche?.filter((n) => !n.pasada).sort((a, b) => b.libres - a.libres)[0];
  const ciudades = conteos.ciudades.length ? unirConY(conteos.ciudades) : "Bogotá y Medellín";

  return (
    <>
      {/* ---------------- Portada: la cancha de noche ---------------- */}
      <section className="grama relative overflow-hidden text-cal">
        <LineasCancha
          pintar
          className="pointer-events-none absolute inset-0 size-full text-cal/25"
          grosor={1.5}
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-end lg:py-20">
          <div>
            <h1 className="titular text-[clamp(4.2rem,13vw,9.5rem)]">
              {esManana ? "¿Juegas mañana?" : "¿Juegas hoy?"}
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-cal/85">
              Reserva cancha de fútbol, pádel, baloncesto, voleibol o tenis en {ciudades}. Si te faltan jugadores,
              abre el partido para que otros se sumen y paguen su parte.
            </p>
          </div>

          {/* Agenda de la noche: datos reales de la API */}
          <div className="rounded-pieza bg-grama-profunda/80 p-5 ring-1 ring-cal/15 sm:p-6">
            <h2 className="text-[15px] font-semibold">
              {esManana ? "Canchas libres mañana en la noche" : "Canchas libres esta noche"}
            </h2>
            <p className="mt-0.5 text-sm text-cal/70">Toca una hora para ver cuáles son.</p>

            {errorNoche ? (
              <div className="mt-5 rounded-[4px] bg-cal/10 p-4 text-sm">
                <p className="font-semibold">No pudimos consultar las horas de esta noche.</p>
                <p className="mt-1 text-cal/75">Puede ser tu conexión o el servidor está despertando.</p>
                <button
                  type="button"
                  onClick={() => {
                    setErrorNoche(false);
                    setIntento((n) => n + 1);
                  }}
                  className="mt-3 font-semibold underline underline-offset-4"
                >
                  Intentar de nuevo
                </button>
              </div>
            ) : (
            <div className="mt-5 grid grid-cols-5 gap-2 sm:gap-3">
              {(noche ?? HORAS_NOCHE.map((h) => ({ hora: h, cargando: true }))).map((n, i) => (
                <button
                  key={n.hora}
                  type="button"
                  disabled={n.cargando || n.pasada}
                  onClick={() => verHora(n.hora)}
                  aria-pressed={horaElegida === n.hora}
                  aria-label={
                    n.pasada ? `${nombreHora(n.hora)}, ya pasó` : `${nombreHora(n.hora)}, ${n.libres} ${n.libres === 1 ? "cancha libre" : "canchas libres"}`
                  }
                  className={`group flex flex-col items-center rounded-[4px] px-1 pb-2 pt-1 transition-colors duration-150 ${
                    horaElegida === n.hora ? "bg-cal/15 ring-1 ring-cal/60" : "hover:bg-cal/10"
                  } ${n.pasada ? "opacity-40" : ""}`}
                >
                  <span className="titular cifras text-[clamp(2rem,5vw,2.9rem)]">
                    {n.cargando ? "·" : n.pasada ? "–" : n.libres}
                  </span>
                  <span className="relative mt-2 h-24 w-full overflow-hidden rounded-[3px] bg-cal/10">
                    {!n.cargando && !n.pasada && (
                      <span
                        className={`subir absolute inset-x-0 bottom-0 ${
                          n.hora === mejorHora?.hora ? "bg-acento" : "bg-cal/80"
                        }`}
                        style={{
                          height: `${Math.max(4, (n.libres / Math.max(catalogo.length, 1)) * 100)}%`,
                          animationDelay: `${1100 + i * 90}ms`,
                        }}
                      />
                    )}
                  </span>
                  <span className="mt-2 whitespace-nowrap text-xs font-medium sm:text-sm">{nombreHora(n.hora)}</span>
                </button>
              ))}
            </div>
            )}

            {!errorNoche && mejorHora && mejorHora.libres > 0 && (
              <button
                type="button"
                onClick={() => verHora(mejorHora.hora)}
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-pieza bg-acento px-4 font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110"
              >
                {mejorHora.libres === 1 ? "Ver la cancha libre" : `Ver las ${mejorHora.libres} canchas libres`} a las {nombreHora(mejorHora.hora)}
              </button>
            )}
            {!errorNoche && noche && !mejorHora && (
              <p className="mt-5 text-sm text-cal/80">Por hoy ya no quedan horas pico. Busca para mañana abajo.</p>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Partidos que buscan jugadores ---------------- */}
      {partidos.length > 0 && (
        <section className="border-b border-linea bg-superficie">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="titular text-4xl">A estos partidos les faltan jugadores</h2>
              <Link to="/partidos" className="text-sm font-semibold underline underline-offset-4 hover:text-tinta-suave">
                Ver todos los partidos
              </Link>
            </div>
            <ul className="mt-5 grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-linea">
              {partidos.map((p) => (
                <li key={p._id} className="md:px-6 md:first:pl-0 md:last:pr-0">
                  <Link to="/partidos" className="group flex gap-4">
                    <Pictograma deporte={p.deporte} className="w-20" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold first-letter:uppercase">
                        {nombreDia(p.fecha)}, {nombreHora(p.hora_inicio)}
                      </p>
                      <p className="truncate text-sm text-tinta-suave group-hover:text-tinta">
                        {p.modalidad} en {p.cancha.sede}
                      </p>
                      <div className="mt-2 flex items-center gap-2.5">
                        <Cupos total={p.partido_abierto.cupos_totales} ocupados={p.partido_abierto.participantes.length + 1} tamano="size-2.5" />
                        <span className="cifras text-sm font-semibold">{pesos(p.partido_abierto.cuota)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------------- Buscador ---------------- */}
      <section ref={buscadorRef} className="mx-auto max-w-6xl scroll-mt-4 px-4 py-12 sm:px-6">
        <h2 className="titular text-5xl">Todas las canchas</h2>

        <div className="mt-6 rounded-pieza border border-linea bg-superficie p-3 sm:p-4">
          <label className="flex h-12 items-center gap-3 rounded-pieza bg-hundido px-4 focus-within:ring-2 focus-within:ring-acento">
            <Search className="size-5 shrink-0 text-tinta-tenue" strokeWidth={1.75} />
            <span className="sr-only">Buscar</span>
            <input
              value={textoEscrito}
              onChange={(e) => setTextoEscrito(e.target.value)}
              placeholder="Busca por cancha, sede o barrio: golazo, chapinero, coliseo"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-tinta-tenue"
            />
            {textoEscrito && (
              <button type="button" onClick={() => setTextoEscrito("")} aria-label="Borrar texto">
                <X className="size-4 text-tinta-tenue" />
              </button>
            )}
          </label>

          {/* Deportes con cuantas canchas hay de cada uno */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip activo={!filtros.deporte} onClick={() => setFiltros((f) => ({ ...f, deporte: "", modalidad: "" }))}>
              Todos los deportes
            </Chip>
            {deportes.map((d) => (
              <Chip
                key={d._id}
                activo={filtros.deporte === d.nombre}
                onClick={() =>
                  setFiltros((f) => ({ ...f, deporte: f.deporte === d.nombre ? "" : d.nombre, modalidad: "" }))
                }
              >
                {d.nombre}
                <span className="cifras ml-1.5 opacity-60">{conteos.porDeporte[d.nombre] ?? ""}</span>
              </Chip>
            ))}
          </div>
          {modalidades.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-linea pt-2">
              {modalidades.map((m) => (
                <Chip
                  key={m.nombre}
                  pequeno
                  activo={filtros.modalidad === m.nombre}
                  onClick={() => cambiar("modalidad", filtros.modalidad === m.nombre ? "" : m.nombre)}
                >
                  {m.nombre}, {m.jugadores} jugadores
                </Chip>
              ))}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-linea pt-3 sm:grid-cols-3 lg:grid-cols-6">
            <Selector etiqueta="Ciudad" valor={filtros.ciudad} onChange={(v) => cambiar("ciudad", v)}>
              <option value="">Todas</option>
              {conteos.ciudades.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Selector>
            <Selector etiqueta="Precio por hora" valor={filtros.precio_max} onChange={(v) => cambiar("precio_max", v)}>
              <option value="">Cualquiera</option>
              {[70000, 90000, 120000, 160000].map((p) => (
                <option key={p} value={p}>
                  Hasta {pesos(p)}
                </option>
              ))}
            </Selector>
            <Selector etiqueta="Techo" valor={filtros.techada} onChange={(v) => cambiar("techada", v)}>
              <option value="">Da igual</option>
              <option value="true">Techada</option>
              <option value="false">Al aire libre</option>
            </Selector>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-tinta-suave">Día</span>
              <input
                type="date"
                min={fechaLocal()}
                value={filtros.fecha}
                onChange={(e) => cambiar("fecha", e.target.value)}
                className="h-10 rounded-pieza border border-linea-fuerte bg-superficie px-2 text-sm"
              />
            </label>
            <Selector etiqueta="Libre a las" valor={filtros.hora} onChange={(v) => cambiar("hora", v)}>
              <option value="">Cualquier hora</option>
              {HORAS_FILTRO.map((h) => (
                <option key={h} value={h}>
                  {nombreHora(h)}
                </option>
              ))}
            </Selector>
            <Selector etiqueta="Ordenar" valor={filtros.orden} onChange={(v) => cambiar("orden", v)}>
              <option value="precio">Más baratas primero</option>
              <option value="nombre">Por sede</option>
            </Selector>
          </div>
          {(filtros.fecha && filtros.hora === "") || (!filtros.fecha && filtros.hora !== "") ? (
            <p className="mt-2 text-sm text-alerta">Elige día y hora para ver solo las canchas libres.</p>
          ) : null}
        </div>

        {/* ---------------- Resultados ---------------- */}
        <div className="mt-8 flex items-baseline justify-between gap-4">
          <p className="text-lg">
            {error ? null : cargando && !resultado ? (
              "Buscando canchas"
            ) : (
              <>
                <span className="titular cifras mr-1.5 text-3xl">{resultado?.total ?? 0}</span>
                {resultado?.total === 1 ? "cancha" : "canchas"}
                {horaElegida !== null && ` libres a las ${nombreHora(horaElegida)}`}
                {resultado?.motor_busqueda === "atlas_search" && resultado.total > 0 && (
                  <span className="mt-1 block text-sm text-tinta-suave">
                    Incluye resultados parecidos a “{filtros.texto}”, aunque tengan tildes o una letra distinta.
                  </span>
                )}
              </>
            )}
          </p>
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiar}
              className="inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
            >
              <RotateCcw className="size-3.5" />
              Quitar filtros
            </button>
          )}
        </div>

        <div className={`mt-4 transition-opacity duration-150 ${cargando && resultado ? "opacity-60" : ""}`}>
          {error ? (
            <EstadoError mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />
          ) : !resultado ? (
            <Esqueleto />
          ) : resultado.resultados.length === 0 ? (
            <div className="rounded-pieza border border-dashed border-linea-fuerte px-6 py-14 text-center">
              <p className="titular text-3xl">Ninguna cancha coincide</p>
              <p className="mt-2 text-tinta-suave">Prueba con otra hora, otra ciudad o menos filtros.</p>
              <button
                type="button"
                onClick={limpiar}
                className="mt-5 h-10 rounded-pieza bg-tinta px-4 text-sm font-semibold text-fondo hover:opacity-85"
              >
                Ver todas las canchas
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-6">
                {agruparPorSede(resultado.resultados).map(({ id, sede, canchas }) => (
                  <section key={id} aria-label={`${sede.nombre}, ${sede.zona}`}>
                    <h3 className="flex flex-wrap items-baseline gap-x-2 px-1 pb-2">
                      <span className="titular text-2xl">{sede.nombre}</span>
                      <span className="inline-flex items-center gap-1 text-sm text-tinta-suave">
                        <MapPin className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                        {sede.zona}, {sede.ciudad}
                      </span>
                    </h3>
                    <ul className="divide-y divide-linea overflow-hidden rounded-panel border border-linea bg-superficie">
                      {canchas.map((cancha) => (
                        <FilaCancha
                          key={cancha._id}
                          cancha={cancha}
                          libres={libresHoy[cancha._id]}
                          destino={
                            horaElegida !== null || (filtros.fecha && filtros.hora !== "")
                              ? `/canchas/${cancha._id}?fecha=${filtros.fecha}&hora=${filtros.hora}`
                              : `/canchas/${cancha._id}`
                          }
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              <div className="mt-6 flex flex-col items-center gap-2">
                <p className="cifras text-sm text-tinta-suave" role="status" aria-live="polite">
                  {agregadas !== null && (
                    <span className="text-tinta">
                      {agregadas === 1 ? "Se agregó 1 cancha" : `Se agregaron ${agregadas} canchas`}, ordenadas en su sede.{" "}
                    </span>
                  )}
                  Mostrando {resultado.resultados.length} de {resultado.total}
                </p>
                {resultado.resultados.length < resultado.total && (
                  <Boton onClick={cargarMas} cargando={cargandoMas}>
                    {cargandoMas ? "Cargando" : "Cargar más canchas"}
                  </Boton>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

/* ---------------- Piezas ---------------- */

function Chip({ activo, pequeno, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex items-center rounded-full border transition-colors duration-150 ${
        pequeno ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm font-medium"
      } ${
        activo
          ? "border-tinta bg-tinta text-fondo"
          : "border-linea-fuerte text-tinta-suave hover:border-tinta hover:text-tinta"
      }`}
    >
      {children}
    </button>
  );
}

function Selector({ etiqueta, valor, onChange, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-tinta-suave">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-pieza border border-linea-fuerte bg-superficie px-2 text-sm"
      >
        {children}
      </select>
    </label>
  );
}

// "Libre hoy" en palabras: las primeras 4 horas libres, o por que no hay
function TextoLibreHoy({ libres }) {
  if (!libres) return null; // aun no llega o fallo: no se muestra nada (la fila sigue completa)
  const hay = libres.libres.length > 0;
  const texto = hay
    ? horasCompactas(libres.libres.slice(0, 4)) + (libres.libres.length > 4 ? ` y ${libres.libres.length - 4} más` : "")
    : { cerrada_hoy: "hoy no abre", ya_cerro: "ya cerró por hoy", sin_horas: "no quedan horas" }[libres.motivo];
  return (
    <p className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 text-sm">
      <Clock className={`size-4 ${hay ? "text-tiza" : "text-tinta-tenue"}`} strokeWidth={1.75} aria-hidden="true" />
      <span className="text-tinta-suave">Libre hoy:</span>
      <span className={`cifras ${hay ? "font-semibold text-tinta" : "text-tinta-tenue"}`}>{texto}</span>
    </p>
  );
}

function FilaCancha({ cancha, destino, libres }) {
  return (
    <li className="group relative transition-colors duration-150 hover:bg-hundido/60">
      <Link to={destino} className="grid items-center gap-3 px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:gap-6 sm:px-5">
        <Pictograma deporte={cancha.deportes[0]?.deporte} className="hidden w-20 sm:block" />
        {/* Al pasar el cursor: linea de tiza a la izquierda (el naranja queda para lo seleccionado) */}
        <span className="absolute inset-y-0 left-0 w-1 bg-tiza opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        <div className="min-w-0">
          <p className="titular text-[1.9rem]">{cancha.nombre}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-tinta-suave">
            {cancha.deportes.map((d) => (
              <span key={d.modalidad} className="rounded-[4px] bg-hundido px-2 py-0.5 text-tinta">
                {d.modalidad}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              {cancha.techada ? (
                <Warehouse className="size-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Sun className="size-4" strokeWidth={1.75} aria-hidden="true" />
              )}
              {cancha.techada ? "Techada" : "Al aire libre"}
            </span>
            <span>{SUPERFICIES[cancha.superficie]}</span>
          </div>
          <TextoLibreHoy libres={libres} />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:block sm:text-right">
          <p>
            <span className="titular cifras text-[1.9rem]">{pesos(cancha.precio_hora)}</span>
            <span className="ml-1 text-sm text-tinta-suave">la hora</span>
          </p>
          <p className="inline-flex items-center gap-1.5 text-sm sm:mt-1 sm:justify-end">
            <InsigniaPico />
            <span className="cifras font-medium text-tinta">{pesos(cancha.precio_hora_pico)}</span>
            <span className="text-tinta-tenue">6 a 10 p. m.</span>
          </p>
        </div>
      </Link>
    </li>
  );
}

function Esqueleto() {
  return (
    <ul className="divide-y divide-linea rounded-pieza border border-linea bg-superficie" aria-label="Cargando">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center justify-between px-6 py-6">
          <div className="space-y-2.5">
            <div className="h-3 w-56 animate-pulse rounded bg-hundido" />
            <div className="h-7 w-32 animate-pulse rounded bg-hundido" />
          </div>
          <div className="h-7 w-28 animate-pulse rounded bg-hundido" />
        </li>
      ))}
    </ul>
  );
}

function EstadoError({ mensaje, onReintentar }) {
  return (
    <div className="flex items-start gap-3 rounded-pieza border border-error/40 bg-superficie p-5">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-error" strokeWidth={1.75} />
      <div>
        <p className="font-semibold">No se pudieron cargar las canchas</p>
        <p className="mt-0.5 text-sm text-tinta-suave">{mensaje}</p>
        <button type="button" onClick={onReintentar} className="mt-3 text-sm font-semibold underline underline-offset-4">
          Reintentar
        </button>
      </div>
    </div>
  );
}
