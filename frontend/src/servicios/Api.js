// Unico punto donde la interfaz habla con el backend.
// La interfaz NUNCA se conecta a MongoDB: solo llama a la API.

const BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

export async function api(ruta, { metodo = "GET", cuerpo, token, parametros } = {}) {
  const url = new URL(BASE + ruta);
  if (parametros) {
    for (const [clave, valor] of Object.entries(parametros)) {
      if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(clave, valor);
    }
  }

  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi("No se pudo conectar con el servidor. Revisa que la API esté encendida.", 0);
  }

  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    // FastAPI responde { detail: "texto" } o, si falla Pydantic (422), { detail: [ {msg}, ... ] }
    const detalle = datos?.detail;
    const mensaje = Array.isArray(detalle)
      ? detalle.map((e) => e.msg).join(". ")
      : detalle || "Ocurrió un error inesperado";
    throw new ErrorApi(mensaje, respuesta.status);
  }
  return datos;
}

// Formatos para Colombia
const formatoPesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
export const pesos = (valor) => formatoPesos.format(valor);
export const hora = (h) => `${String(h).padStart(2, "0")}:00`;
