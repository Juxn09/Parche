// Crear cuenta de jugador o de propietario (POST /api/auth/registro).
// La API valida con Pydantic, exige empresa al propietario y rechaza correos repetidos (indice unico).
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Aviso, Campo, claseBotonPrincipal, claseEntrada } from "../componentes/Piezas.jsx";
import { useSesion } from "../contexto/Sesion.jsx";

export default function Registro() {
  const { registrar } = useSesion();
  const navegar = useNavigate();
  const [rol, setRol] = useState("cliente");
  const [datos, setDatos] = useState({ nombre: "", email: "", clave: "", telefono: "", ciudad: "Bogotá" });
  const [empresa, setEmpresa] = useState({ razon_social: "", nit: "" });
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo, valor) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setAviso(null);
  };

  async function enviar(e) {
    e.preventDefault();
    if (datos.clave.length < 8) return setAviso({ tipo: "error", texto: "La contraseña debe tener al menos 8 caracteres" });
    setEnviando(true);
    try {
      const usuario = await registrar({
        ...datos,
        telefono: datos.telefono.trim() || null,
        rol,
        empresa: rol === "propietario" ? empresa : null,
      });
      navegar(usuario.rol === "propietario" ? "/panel" : "/");
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <h1 className="titular text-6xl">Crea tu cuenta</h1>
      <p className="mt-3 text-tinta-suave">
        ¿Ya tienes una?{" "}
        <Link to="/ingresar" className="font-semibold text-tinta underline underline-offset-4">
          Ingresa
        </Link>
      </p>

      <div className="mt-8 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de cuenta">
        {[
          ["cliente", "Quiero jugar", "Reservo canchas y me uno a partidos"],
          ["propietario", "Tengo canchas", "Publico mis sedes y recibo reservas"],
        ].map(([valor, titulo, texto]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={rol === valor}
            onClick={() => setRol(valor)}
            className={`rounded-pieza border p-4 text-left transition-colors duration-150 ${
              rol === valor ? "border-acento bg-acento/10 ring-1 ring-acento" : "border-linea-fuerte hover:border-tinta"
            }`}
          >
            <span className="titular block text-2xl">{titulo}</span>
            <span className="mt-1 block text-sm text-tinta-suave">{texto}</span>
          </button>
        ))}
      </div>

      <form onSubmit={enviar} noValidate className="mt-6 grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre completo" className="sm:col-span-2">
          <input value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} autoComplete="name" className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Correo">
          <input type="email" value={datos.email} onChange={(e) => cambiar("email", e.target.value)} autoComplete="email" className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Contraseña (mínimo 8 caracteres)">
          <input type="password" value={datos.clave} onChange={(e) => cambiar("clave", e.target.value)} autoComplete="new-password" className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Celular (opcional)">
          <input value={datos.telefono} onChange={(e) => cambiar("telefono", e.target.value)} placeholder="3001234567" inputMode="numeric" className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Ciudad">
          <input value={datos.ciudad} onChange={(e) => cambiar("ciudad", e.target.value)} className={claseEntrada} />
        </Campo>

        {rol === "propietario" && (
          <>
            <Campo etiqueta="Razón social de tu empresa">
              <input
                value={empresa.razon_social}
                onChange={(e) => setEmpresa((x) => ({ ...x, razon_social: e.target.value }))}
                placeholder="Canchas La 80 S.A.S."
                className={claseEntrada}
              />
            </Campo>
            <Campo etiqueta="NIT">
              <input value={empresa.nit} onChange={(e) => setEmpresa((x) => ({ ...x, nit: e.target.value }))} placeholder="901234567-8" className={claseEntrada} />
            </Campo>
          </>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2 sm:col-span-2">
          <button type="submit" disabled={enviando} className={`${claseBotonPrincipal} h-11 px-6`}>
            {enviando ? "Creando cuenta" : "Crear cuenta"}
          </button>
          <Aviso aviso={aviso} />
        </div>
      </form>
    </section>
  );
}
