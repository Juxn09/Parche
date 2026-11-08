// Guarda quien inicio sesion (token + datos basicos) y lo comparte con toda la app.
import { createContext, useCallback, useContext, useState } from "react";
import { api } from "../servicios/Api.js";

const ContextoSesion = createContext(null);
const CLAVE = "parche.sesion";

function leerGuardada() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE));
  } catch {
    return null;
  }
}

function guardar(valor) {
  try {
    if (valor) localStorage.setItem(CLAVE, JSON.stringify(valor));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento disponible: la sesion dura mientras la pestana este abierta */
  }
}

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(leerGuardada);

  const iniciar = useCallback((datos) => {
    setSesion(datos);
    guardar(datos);
    return datos.usuario;
  }, []);

  const ingresar = useCallback(
    async (email, clave) => iniciar(await api("/api/auth/login", { metodo: "POST", cuerpo: { email, clave } })),
    [iniciar],
  );

  const registrar = useCallback(
    async (datos) => iniciar(await api("/api/auth/registro", { metodo: "POST", cuerpo: datos })),
    [iniciar],
  );

  const salir = useCallback(() => {
    setSesion(null);
    guardar(null);
  }, []);

  const valor = {
    usuario: sesion?.usuario ?? null,
    token: sesion?.token ?? null,
    ingresar,
    registrar,
    salir,
  };
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export const useSesion = () => useContext(ContextoSesion);
