// Panel del administrador de la plataforma: aprobar sedes y activar o desactivar usuarios.
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { Aviso, Campo, Insignia, Pestanas, claseBotonPrincipal, claseBotonSecundario, claseEntrada } from "../componentes/Piezas.jsx";
import { useSesion } from "../contexto/Sesion.jsx";
import { api } from "../servicios/Api.js";

const NOMBRE_ROL = { cliente: "Jugador", propietario: "Propietario", admin: "Administrador" };
const formatoFecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

export default function PanelAdmin() {
  const { usuario, token } = useSesion();
  const [pestana, setPestana] = useState("sedes");

  if (!usuario) return <Navigate to="/ingresar" state={{ desde: "/admin" }} replace />;
  if (usuario.rol !== "admin")
    return <p className="mx-auto max-w-6xl px-4 py-16 sm:px-6">Este panel es solo para el administrador de la plataforma.</p>;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="titular text-6xl">Administración</h1>
      <p className="mt-2 text-tinta-suave">Revisa las sedes nuevas antes de que aparezcan en la búsqueda.</p>
      <div className="mt-6">
        <Pestanas
          valor={pestana}
          onCambio={setPestana}
          opciones={[
            { clave: "sedes", nombre: "Sedes" },
            { clave: "usuarios", nombre: "Usuarios" },
          ]}
        />
      </div>
      {pestana === "sedes" ? <Sedes token={token} /> : <Usuarios token={token} yo={usuario._id} />}
    </section>
  );
}

function Sedes({ token }) {
  const [estado, setEstado] = useState("pendiente");
  const [sedes, setSedes] = useState(null);
  const [rechazando, setRechazando] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(() => {
    setSedes(null);
    return api("/api/admin/sedes", { token, parametros: { estado } }).then(setSedes).catch((e) => setAviso({ tipo: "error", texto: e.message }));
  }, [estado, token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function decidir(sede, accion) {
    try {
      await api(`/api/admin/sedes/${sede._id}/${accion}`, {
        metodo: "POST",
        token,
        cuerpo: accion === "rechazar" ? { motivo } : undefined,
      });
      setAviso({
        tipo: "ok",
        texto:
          accion === "aprobar"
            ? `${sede.nombre} quedó aprobada: sus canchas ya aparecen en la búsqueda.`
            : `${sede.nombre} quedó rechazada. El propietario verá el motivo.`,
      });
      setRechazando(null);
      setMotivo("");
      cargar();
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <Pestanas
        valor={estado}
        onCambio={setEstado}
        opciones={[
          { clave: "pendiente", nombre: "Pendientes" },
          { clave: "aprobada", nombre: "Aprobadas" },
          { clave: "rechazada", nombre: "Rechazadas" },
        ]}
      />
      <Aviso aviso={aviso} />
      {!sedes ? (
        <div className="h-40 animate-pulse rounded-pieza bg-hundido" />
      ) : sedes.length === 0 ? (
        <p className="rounded-pieza border border-dashed border-linea-fuerte px-6 py-10 text-center text-tinta-suave">
          No hay sedes en este estado.
        </p>
      ) : (
        <ul className="divide-y divide-linea overflow-hidden rounded-pieza border border-linea bg-superficie">
          {sedes.map((s) => (
            <li key={s._id} className="px-4 py-4 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="titular text-3xl">{s.nombre}</p>
                  <p className="text-sm text-tinta-suave">
                    {s.direccion}, {s.zona}, {s.ciudad}. Creada el {formatoFecha.format(new Date(s.fecha_creacion))}.
                  </p>
                  <p className="mt-1 text-sm">
                    {s.propietario.nombre}
                    {s.propietario.empresa && `, ${s.propietario.empresa.razon_social} (NIT ${s.propietario.empresa.nit})`}
                  </p>
                  {s.revision?.motivo && <p className="mt-1 text-sm text-error">Motivo: {s.revision.motivo}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <Insignia estado={s.estado} />
                  {s.estado !== "aprobada" && (
                    <button type="button" onClick={() => decidir(s, "aprobar")} className={claseBotonPrincipal}>
                      Aprobar
                    </button>
                  )}
                  {s.estado !== "rechazada" && (
                    <button type="button" onClick={() => setRechazando(rechazando === s._id ? null : s._id)} className={claseBotonSecundario}>
                      Rechazar
                    </button>
                  )}
                </div>
              </div>
              {rechazando === s._id && (
                <div className="mt-4 flex flex-wrap items-end gap-3 rounded-pieza bg-hundido p-4">
                  <Campo etiqueta="Motivo del rechazo (lo verá el propietario)" className="min-w-64 flex-1">
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="La dirección no corresponde a la zona" className={claseEntrada} />
                  </Campo>
                  <button type="button" disabled={motivo.trim().length < 5} onClick={() => decidir(s, "rechazar")} className={claseBotonPrincipal}>
                    Rechazar sede
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Usuarios({ token, yo }) {
  const [rol, setRol] = useState("");
  const [texto, setTexto] = useState("");
  const [usuarios, setUsuarios] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(() => {
    return api("/api/admin/usuarios", { token, parametros: { rol, texto } })
      .then(setUsuarios)
      .catch((e) => setAviso({ tipo: "error", texto: e.message }));
  }, [rol, texto, token]);

  useEffect(() => {
    const espera = setTimeout(cargar, 250);
    return () => clearTimeout(espera);
  }, [cargar]);

  async function alternar(u) {
    try {
      await api(`/api/admin/usuarios/${u._id}/activo`, { metodo: "PATCH", token, cuerpo: { activo: !u.activo } });
      setAviso({
        tipo: "ok",
        texto: u.activo ? `${u.nombre} quedó desactivado: su sesión deja de funcionar de inmediato.` : `${u.nombre} quedó activo.`,
      });
      cargar();
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Pestanas
          valor={rol}
          onCambio={setRol}
          opciones={[
            { clave: "", nombre: "Todos" },
            { clave: "cliente", nombre: "Jugadores" },
            { clave: "propietario", nombre: "Propietarios" },
          ]}
        />
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o correo" className={`${claseEntrada} ml-auto w-64`} />
      </div>
      <Aviso aviso={aviso} />
      {!usuarios ? (
        <div className="h-40 animate-pulse rounded-pieza bg-hundido" />
      ) : (
        <ul className="divide-y divide-linea overflow-hidden rounded-pieza border border-linea bg-superficie">
          {usuarios.map((u) => (
            <li key={u._id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${u.activo ? "" : "text-tinta-tenue line-through"}`}>{u.nombre}</p>
                <p className="text-sm text-tinta-suave">
                  {u.email}. {NOMBRE_ROL[u.rol]}
                  {u.ciudad && ` en ${u.ciudad}`}
                </p>
              </div>
              {u._id !== yo && (
                <button type="button" onClick={() => alternar(u)} className={claseBotonSecundario}>
                  {u.activo ? "Desactivar" : "Activar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
