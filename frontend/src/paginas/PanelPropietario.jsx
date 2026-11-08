// Panel del propietario. Todo lo que muestra sale de rutas que la API filtra por el
// propietario_id del token: Laura nunca ve las canchas de Andres (multi-tenant).
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router";
import {
  Aviso,
  Campo,
  Insignia,
  Pestanas,
  claseBotonPrincipal,
  claseBotonSecundario,
  claseEntrada,
} from "../componentes/Piezas.jsx";
import { useSesion } from "../contexto/Sesion.jsx";
import { api, pesos } from "../servicios/Api.js";
import { METODOS_PAGO, SUPERFICIES, fechaLocal, nombreDia, nombreHora } from "../servicios/Catalogo.js";

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const HORAS = Array.from({ length: 17 }, (_, i) => i + 6);

export default function PanelPropietario() {
  const { usuario, token } = useSesion();
  const [pestana, setPestana] = useState("agenda");
  const [canchas, setCanchas] = useState(null);
  const [sedes, setSedes] = useState(null);
  const [catalogo, setCatalogo] = useState([]);
  const [error, setError] = useState(null);

  const recargar = useCallback(() => {
    if (!token) return Promise.resolve();
    return Promise.all([api("/api/propietario/canchas", { token }), api("/api/propietario/sedes", { token })])
      .then(([c, s]) => {
        setCanchas(c);
        setSedes(s);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (usuario?.rol !== "propietario") return;
    recargar();
    api("/api/deportes").then(setCatalogo).catch(() => {});
  }, [usuario, recargar]);

  if (!usuario) return <Navigate to="/ingresar" state={{ desde: "/panel" }} replace />;
  if (usuario.rol !== "propietario")
    return <p className="mx-auto max-w-6xl px-4 py-16 sm:px-6">Este panel es solo para propietarios de canchas.</p>;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="titular text-6xl">Mi panel</h1>
      <p className="mt-2 text-tinta-suave">Hola, {usuario.nombre.split(" ")[0]}. Aquí administras tus sedes, canchas y reservas.</p>

      <div className="mt-6">
        <Pestanas
          valor={pestana}
          onCambio={setPestana}
          opciones={[
            { clave: "agenda", nombre: "Agenda del día" },
            { clave: "canchas", nombre: "Mis canchas", conteo: canchas?.length },
            { clave: "sedes", nombre: "Mis sedes", conteo: sedes?.length },
          ]}
        />
      </div>

      {error && <p className="mt-6 text-error">{error}</p>}
      {!canchas || !sedes ? (
        <div className="mt-8 h-64 animate-pulse rounded-pieza bg-hundido" aria-label="Cargando" />
      ) : pestana === "agenda" ? (
        <Agenda canchas={canchas} sedes={sedes} token={token} />
      ) : pestana === "canchas" ? (
        <GestionCanchas
          canchas={canchas}
          sedes={sedes}
          catalogo={catalogo}
          token={token}
          onCambio={recargar}
          onIrASedes={() => setPestana("sedes")}
        />
      ) : (
        <GestionSedes sedes={sedes} token={token} onCambio={recargar} />
      )}
    </section>
  );
}

/* ================= Agenda: planilla de turnos del dia ================= */

function Agenda({ canchas, sedes, token }) {
  const [fecha, setFecha] = useState(fechaLocal());
  const [items, setItems] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [horasBloqueo, setHorasBloqueo] = useState(1);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(() => {
    setItems(null);
    return api("/api/reservas/propietario", { token, parametros: { desde: fecha, hasta: fecha } })
      .then((lista) => setItems(lista.filter((r) => r.estado !== "cancelada")))
      .catch((e) => setAviso({ tipo: "error", texto: e.message }));
  }, [fecha, token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Mapa "cancha-hora" -> reserva o bloqueo que ocupa esa franja
  const ocupacion = useMemo(() => {
    const mapa = {};
    for (const r of items ?? []) {
      for (let h = r.hora_inicio; h < r.hora_fin; h++) mapa[`${r.cancha_id}-${h}`] = r;
    }
    return mapa;
  }, [items]);

  const horarioDe = (cancha) => {
    const sede = sedes.find((s) => s._id === cancha.sede_id);
    const dia = DIAS_SEMANA[new Date(`${fecha}T12:00:00`).getDay()];
    const h = sede?.horario.find((x) => x.dia === dia);
    return h ? [Number(h.abre.slice(0, 2)), Number(h.cierra.slice(0, 2))] : [0, 0];
  };

  const totalReservas = (items ?? []).filter((r) => r.tipo === "reserva");
  const ingresos = totalReservas.reduce((t, r) => t + r.precio_total, 0);

  async function bloquear() {
    try {
      await api("/api/reservas/bloqueos", {
        metodo: "POST",
        token,
        cuerpo: { cancha_id: seleccion.cancha._id, fecha, hora_inicio: seleccion.hora, horas: horasBloqueo, motivo },
      });
      setAviso({ tipo: "ok", texto: "Franja bloqueada. Nadie podrá reservarla." });
      setSeleccion(null);
      setMotivo("");
      cargar();
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    }
  }

  async function quitarBloqueo(bloqueo) {
    try {
      await api(`/api/reservas/bloqueos/${bloqueo._id}`, { metodo: "DELETE", token });
      setAviso({ tipo: "ok", texto: "Bloqueo retirado. La franja vuelve a estar disponible." });
      setSeleccion(null);
      cargar();
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    }
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {[-1, 0, 1, 2].map((d) => {
            const f = fechaLocal(d);
            return (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFecha(f);
                  setSeleccion(null);
                  setAviso(null);
                }}
                className={`h-9 rounded-full border px-4 text-sm font-medium first-letter:uppercase ${
                  fecha === f ? "border-tinta bg-tinta text-fondo" : "border-linea-fuerte text-tinta-suave hover:border-tinta"
                }`}
              >
                {d === -1 ? "Ayer" : nombreDia(f)}
              </button>
            );
          })}
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseEntrada} />
        </div>
        <p className="text-sm text-tinta-suave">
          <span className="titular cifras mr-1 text-2xl text-tinta">{totalReservas.length}</span> reservas ·{" "}
          <span className="titular cifras mr-1 text-2xl text-tinta">{pesos(ingresos)}</span>
        </p>
      </div>

      <div className="mt-5 overflow-x-auto rounded-pieza border border-linea bg-superficie">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-superficie px-3 py-2 text-left font-semibold">Cancha</th>
              {HORAS.map((h) => (
                <th key={h} className="min-w-11 px-0.5 py-2 text-center text-xs font-medium text-tinta-suave">
                  {nombreHora(h).replace(" m.", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {canchas.map((c) => {
              const [abre, cierra] = horarioDe(c);
              return (
                <tr key={c._id} className="border-t border-linea">
                  <th className="sticky left-0 z-10 bg-superficie px-3 py-2 text-left font-normal">
                    <span className="block whitespace-nowrap font-semibold">{c.nombre}</span>
                    <span className="block whitespace-nowrap text-xs text-tinta-tenue">{c.sede.nombre}</span>
                  </th>
                  {HORAS.map((h) => {
                    const item = ocupacion[`${c._id}-${h}`];
                    const fuera = h < abre || h >= cierra;
                    const elegida =
                      seleccion && seleccion.cancha._id === c._id && (seleccion.item ? seleccion.item === item : seleccion.hora === h);
                    let clase = "bg-superficie hover:bg-hundido";
                    if (fuera || c.estado !== "activa") clase = "bg-hundido/50 cursor-default";
                    else if (item?.tipo === "reserva") clase = item.partido_abierto ? "bg-acento" : "bg-grama";
                    else if (item?.tipo === "bloqueo")
                      clase = "bg-[repeating-linear-gradient(135deg,var(--linea-fuerte)_0_5px,transparent_5px_10px)]";
                    return (
                      <td key={h} className="p-0.5">
                        <button
                          type="button"
                          disabled={fuera || c.estado !== "activa"}
                          title={
                            item?.tipo === "reserva"
                              ? `${item.usuario.nombre}, ${nombreHora(item.hora_inicio)} a ${nombreHora(item.hora_fin)}`
                              : item?.tipo === "bloqueo"
                                ? `Bloqueo: ${item.motivo}`
                                : `${nombreHora(h)} libre`
                          }
                          onClick={() => {
                            setAviso(null);
                            setSeleccion({ cancha: c, hora: h, item });
                          }}
                          className={`block h-9 w-full rounded-[3px] transition-colors duration-150 ${clase} ${
                            elegida ? "ring-2 ring-tinta ring-offset-1 ring-offset-superficie" : ""
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-suave">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[2px] bg-grama" /> Reserva</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[2px] bg-acento" /> Partido abierto</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[2px] bg-[repeating-linear-gradient(135deg,var(--linea-fuerte)_0_3px,transparent_3px_6px)]" /> Bloqueo
        </span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[2px] border border-linea-fuerte" /> Libre: tócala para bloquearla</span>
        {!items && <span>Cargando…</span>}
      </p>

      <div className="mt-5 space-y-3">
        <Aviso aviso={aviso} />
        {seleccion && (
          <div className="rounded-pieza border border-linea bg-superficie p-5">
            {seleccion.item?.tipo === "reserva" ? (
              <DetalleReserva reserva={seleccion.item} />
            ) : seleccion.item?.tipo === "bloqueo" ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  <span className="font-semibold">{seleccion.cancha.nombre}</span> bloqueada de {nombreHora(seleccion.item.hora_inicio)} a{" "}
                  {nombreHora(seleccion.item.hora_fin)}: {seleccion.item.motivo}
                </p>
                <button type="button" onClick={() => quitarBloqueo(seleccion.item)} className={claseBotonSecundario}>
                  Quitar bloqueo
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <p className="w-full">
                  Bloquear <span className="font-semibold">{seleccion.cancha.nombre}</span> desde las {nombreHora(seleccion.hora)}
                </p>
                <Campo etiqueta="Motivo" className="min-w-56 flex-1">
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Mantenimiento de la grama"
                    className={claseEntrada}
                  />
                </Campo>
                <Campo etiqueta="Duración">
                  <select value={horasBloqueo} onChange={(e) => setHorasBloqueo(Number(e.target.value))} className={claseEntrada}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "hora" : "horas"}
                      </option>
                    ))}
                  </select>
                </Campo>
                <button type="button" disabled={motivo.trim().length < 3} onClick={bloquear} className={claseBotonPrincipal}>
                  Bloquear
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetalleReserva({ reserva }) {
  const pa = reserva.partido_abierto;
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <div>
        <p className="font-semibold">
          {reserva.usuario.nombre} reservó {reserva.cancha.nombre} de {nombreHora(reserva.hora_inicio)} a {nombreHora(reserva.hora_fin)}
        </p>
        <p className="text-sm text-tinta-suave">
          {reserva.modalidad}. Pagó con {METODOS_PAGO[reserva.pago.metodo]}.
          {pa && ` Partido abierto: ${pa.participantes.length + 1} de ${pa.cupos_totales} jugadores.`}
        </p>
      </div>
      <p className="titular cifras text-3xl">{pesos(reserva.precio_total)}</p>
    </div>
  );
}

/* ================= Mis canchas ================= */

function GestionCanchas({ canchas, sedes, catalogo, token, onCambio, onIrASedes }) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [avisos, setAvisos] = useState({});

  const avisar = (id, tipo, texto) => setAvisos((a) => ({ ...a, [id]: { tipo, texto } }));

  async function guardar(cancha, cambios) {
    try {
      await api(`/api/propietario/canchas/${cancha._id}`, { metodo: "PUT", token, cuerpo: cambios });
      avisar(cancha._id, "ok", "Cambios guardados. Los precios nuevos aplican solo a reservas futuras.");
      setEditando(null);
      onCambio();
    } catch (e) {
      avisar(cancha._id, "error", e.message);
    }
  }

  async function eliminar(cancha) {
    try {
      const r = await api(`/api/propietario/canchas/${cancha._id}`, { metodo: "DELETE", token });
      avisar(
        "general",
        "ok",
        r.resultado === "desactivada"
          ? `${cancha.nombre} se desactivó: tiene historial de reservas y no se borra.`
          : `${cancha.nombre} se eliminó.`,
      );
      onCambio();
    } catch (e) {
      avisar(cancha._id, "error", e.message);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Aviso aviso={avisos.general} />
        <button type="button" onClick={() => setCreando((v) => !v)} className={`${claseBotonPrincipal} ml-auto inline-flex items-center gap-1.5`}>
          <Plus className="size-4" /> Nueva cancha
        </button>
      </div>

      {creando && (
        <FormularioCancha
          sedes={sedes}
          catalogo={catalogo}
          token={token}
          onIrASedes={onIrASedes}
          onListo={(nombre) => {
            setCreando(false);
            avisar("general", "ok", `${nombre} quedó creada.`);
            onCambio();
          }}
        />
      )}

      <ul className="divide-y divide-linea overflow-hidden rounded-pieza border border-linea bg-superficie">
        {canchas.map((c) => (
          <li key={c._id} className="px-4 py-4 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-sm text-tinta-suave">{c.sede.nombre}</p>
                <p className="titular text-3xl">{c.nombre}</p>
                <p className="mt-1 text-sm text-tinta-suave">
                  {c.deportes.map((d) => d.modalidad).join(", ")}. {SUPERFICIES[c.superficie]}, {c.techada ? "techada" : "al aire libre"}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <Insignia estado={c.estado} />
                <p className="cifras text-right text-sm">
                  <span className="font-semibold">{pesos(c.precio_hora)}</span>
                  <span className="block text-tinta-suave">pico {pesos(c.precio_hora_pico)}</span>
                </p>
                <button type="button" onClick={() => setEditando(editando === c._id ? null : c._id)} className={claseBotonSecundario}>
                  Editar
                </button>
                <button type="button" onClick={() => eliminar(c)} className={`${claseBotonSecundario} hover:border-error hover:text-error`}>
                  Eliminar
                </button>
              </div>
            </div>
            {editando === c._id && <EditarCancha cancha={c} onGuardar={(cambios) => guardar(c, cambios)} />}
            <div className="mt-2">
              <Aviso aviso={avisos[c._id]} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditarCancha({ cancha, onGuardar }) {
  const [precio, setPrecio] = useState(cancha.precio_hora);
  const [pico, setPico] = useState(cancha.precio_hora_pico);
  const [estado, setEstado] = useState(cancha.estado);
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-pieza bg-hundido p-4">
      <Campo etiqueta="Precio por hora">
        <input type="number" step="1000" value={precio} onChange={(e) => setPrecio(e.target.value)} className={claseEntrada} />
      </Campo>
      <Campo etiqueta="Precio hora pico">
        <input type="number" step="1000" value={pico} onChange={(e) => setPico(e.target.value)} className={claseEntrada} />
      </Campo>
      <Campo etiqueta="Estado">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={claseEntrada}>
          <option value="activa">Activa</option>
          <option value="mantenimiento">En mantenimiento</option>
        </select>
      </Campo>
      <button
        type="button"
        onClick={() => onGuardar({ precio_hora: Number(precio), precio_hora_pico: Number(pico), estado })}
        className={claseBotonPrincipal}
      >
        Guardar cambios
      </button>
    </div>
  );
}

function FormularioCancha({ sedes, catalogo, token, onListo, onIrASedes }) {
  const [datos, setDatos] = useState({
    sede_id: sedes[0]?._id ?? "",
    nombre: "",
    superficie: "sintetica",
    techada: false,
    precio_hora: 90000,
    precio_hora_pico: 120000,
  });
  const [modalidades, setModalidades] = useState([]); // [{deporte, modalidad}]
  const [aviso, setAviso] = useState(null);
  const cambiar = (campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }));

  const alternar = (deporte, modalidad) =>
    setModalidades((lista) =>
      lista.some((m) => m.modalidad === modalidad)
        ? lista.filter((m) => m.modalidad !== modalidad)
        : [...lista, { deporte, modalidad }],
    );

  async function crear(e) {
    e.preventDefault();
    if (!datos.nombre.trim()) return setAviso({ tipo: "error", texto: "Ponle un nombre a la cancha" });
    if (modalidades.length === 0) return setAviso({ tipo: "error", texto: "Elige al menos una modalidad" });
    try {
      await api("/api/propietario/canchas", {
        metodo: "POST",
        token,
        cuerpo: {
          ...datos,
          precio_hora: Number(datos.precio_hora),
          precio_hora_pico: Number(datos.precio_hora_pico),
          deportes: modalidades,
          iluminacion: true,
        },
      });
      onListo(datos.nombre);
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    }
  }

  return (
    <form onSubmit={crear} className="rounded-pieza border border-linea bg-superficie p-5">
      <h2 className="titular text-3xl">Nueva cancha</h2>
      <p className="mt-1 text-sm text-tinta-suave">
        La cancha se crea dentro de una de tus sedes. ¿Es en un lugar nuevo?{" "}
        <button type="button" onClick={onIrASedes} className="font-semibold text-tinta underline underline-offset-4">
          Primero crea la sede
        </button>
        .
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Sede">
          <select value={datos.sede_id} onChange={(e) => cambiar("sede_id", e.target.value)} className={claseEntrada}>
            {sedes.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Nombre">
          <input value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder="Cancha 4" className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Superficie">
          <select value={datos.superficie} onChange={(e) => cambiar("superficie", e.target.value)} className={claseEntrada}>
            {Object.entries(SUPERFICIES).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Precio por hora">
          <input type="number" step="1000" value={datos.precio_hora} onChange={(e) => cambiar("precio_hora", e.target.value)} className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Precio hora pico (6 a 10 p. m.)">
          <input
            type="number"
            step="1000"
            value={datos.precio_hora_pico}
            onChange={(e) => cambiar("precio_hora_pico", e.target.value)}
            className={claseEntrada}
          />
        </Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={datos.techada} onChange={(e) => cambiar("techada", e.target.checked)} className="size-4 accent-[var(--acento)]" />
          Cancha techada
        </label>
      </div>

      <p className="mt-5 text-xs font-medium text-tinta-suave">Modalidades que ofrece (puede ser multiuso)</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalogo.map((d) => (
          <fieldset key={d._id} className="rounded-pieza border border-linea p-3">
            <legend className="px-1 text-sm font-semibold">{d.nombre}</legend>
            {d.modalidades.map((m) => (
              <label key={m.nombre} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  checked={modalidades.some((x) => x.modalidad === m.nombre)}
                  onChange={() => alternar(d.nombre, m.nombre)}
                  className="size-4 accent-[var(--acento)]"
                />
                {m.nombre}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="submit" className={claseBotonPrincipal}>
          Crear cancha
        </button>
        <Aviso aviso={aviso} />
      </div>
    </form>
  );
}

/* ================= Mis sedes ================= */

function GestionSedes({ sedes, token, onCambio }) {
  const [creando, setCreando] = useState(false);
  const [renombrando, setRenombrando] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [avisos, setAvisos] = useState({});
  const avisar = (id, tipo, texto) => setAvisos((a) => ({ ...a, [id]: { tipo, texto } }));

  async function renombrar(sede) {
    try {
      await api(`/api/propietario/sedes/${sede._id}`, { metodo: "PUT", token, cuerpo: { nombre: nuevoNombre } });
      avisar(sede._id, "ok", "Nombre actualizado. También se actualizó en todas sus canchas.");
      setRenombrando(null);
      onCambio();
    } catch (e) {
      avisar(sede._id, "error", e.message);
    }
  }

  async function eliminar(sede) {
    try {
      await api(`/api/propietario/sedes/${sede._id}`, { metodo: "DELETE", token });
      avisar("general", "ok", `${sede.nombre} se eliminó.`);
      onCambio();
    } catch (e) {
      avisar(sede._id, "error", e.message);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Aviso aviso={avisos.general} />
        <button type="button" onClick={() => setCreando((v) => !v)} className={`${claseBotonPrincipal} ml-auto inline-flex items-center gap-1.5`}>
          <Plus className="size-4" /> Nueva sede
        </button>
      </div>

      {creando && (
        <FormularioSede
          token={token}
          onListo={(nombre) => {
            setCreando(false);
            avisar("general", "ok", `${nombre} quedó pendiente de aprobación. Aparecerá en la búsqueda cuando el administrador la apruebe.`);
            onCambio();
          }}
        />
      )}

      <ul className="divide-y divide-linea overflow-hidden rounded-pieza border border-linea bg-superficie">
        {sedes.map((s) => (
          <li key={s._id} className="px-4 py-4 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="titular text-3xl">{s.nombre}</p>
                <p className="text-sm text-tinta-suave">
                  {s.direccion}, {s.zona}, {s.ciudad}. {s.total_canchas} {s.total_canchas === 1 ? "cancha" : "canchas"}.
                </p>
                {s.estado === "rechazada" && s.revision?.motivo && (
                  <p className="mt-1 text-sm text-error">Motivo del rechazo: {s.revision.motivo}. Corrígela y vuelve a revisión.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <Insignia estado={s.estado} />
                <button
                  type="button"
                  onClick={() => {
                    setRenombrando(renombrando === s._id ? null : s._id);
                    setNuevoNombre(s.nombre);
                  }}
                  className={claseBotonSecundario}
                >
                  Renombrar
                </button>
                {s.total_canchas === 0 && (
                  <button type="button" onClick={() => eliminar(s)} className={`${claseBotonSecundario} hover:border-error hover:text-error`}>
                    Eliminar
                  </button>
                )}
              </div>
            </div>
            {renombrando === s._id && (
              <div className="mt-4 flex flex-wrap items-end gap-3 rounded-pieza bg-hundido p-4">
                <Campo etiqueta="Nuevo nombre" className="min-w-64 flex-1">
                  <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} className={claseEntrada} />
                </Campo>
                <button type="button" onClick={() => renombrar(s)} className={claseBotonPrincipal}>
                  Guardar
                </button>
              </div>
            )}
            <div className="mt-2">
              <Aviso aviso={avisos[s._id]} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormularioSede({ token, onListo }) {
  const [datos, setDatos] = useState({
    nombre: "",
    direccion: "",
    ciudad: "Bogotá",
    zona: "",
    latitud: 4.65,
    longitud: -74.08,
    servicios: "parqueadero, duchas",
  });
  const [aviso, setAviso] = useState(null);
  const cambiar = (campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }));

  async function crear(e) {
    e.preventDefault();
    try {
      await api("/api/propietario/sedes", {
        metodo: "POST",
        token,
        cuerpo: {
          ...datos,
          latitud: Number(datos.latitud),
          longitud: Number(datos.longitud),
          servicios: datos.servicios.split(",").map((s) => s.trim()).filter(Boolean),
        },
      });
      onListo(datos.nombre);
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    }
  }

  return (
    <form onSubmit={crear} className="rounded-pieza border border-linea bg-superficie p-5">
      <h2 className="titular text-3xl">Nueva sede</h2>
      <p className="mt-1 text-sm text-tinta-suave">Queda pendiente hasta que el administrador la apruebe. Usa el horario estándar.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Nombre">
          <input value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder="El Golazo Bosa" className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Dirección">
          <input value={datos.direccion} onChange={(e) => cambiar("direccion", e.target.value)} placeholder="Calle 65 Sur # 78-10" className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Ciudad">
          <input value={datos.ciudad} onChange={(e) => cambiar("ciudad", e.target.value)} className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Zona o barrio">
          <input value={datos.zona} onChange={(e) => cambiar("zona", e.target.value)} placeholder="Bosa" className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Latitud">
          <input type="number" step="0.0001" value={datos.latitud} onChange={(e) => cambiar("latitud", e.target.value)} className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Longitud">
          <input type="number" step="0.0001" value={datos.longitud} onChange={(e) => cambiar("longitud", e.target.value)} className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Servicios, separados por coma" className="sm:col-span-3">
          <input value={datos.servicios} onChange={(e) => cambiar("servicios", e.target.value)} className={claseEntrada} />
        </Campo>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="submit" className={claseBotonPrincipal}>
          Crear sede
        </button>
        <Aviso aviso={aviso} />
      </div>
    </form>
  );
}
