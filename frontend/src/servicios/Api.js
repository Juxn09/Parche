// Unico punto donde la interfaz habla con el backend.
// La interfaz NUNCA se conecta a MongoDB: solo llama a la API.

const BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

// Tiempo maximo de espera. Es generoso porque el plan gratis de Render "despierta"
// la API en cerca de un minuto si nadie la uso durante 15 minutos.
const TIEMPO_MAXIMO_MS = 45000;

export class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado; // 0 = sin respuesta del servidor (red o tiempo agotado)
  }
}

// Sesion vencida: Sesion.jsx registra aqui que hacer (cerrar sesion e ir a /ingresar).
// Asi Api.js no depende de React y el aviso se maneja en un solo lugar.
let alVencerSesion = null;
export function cuandoVenzaLaSesion(funcion) {
  alVencerSesion = funcion;
}

export async function api(ruta, { metodo = "GET", cuerpo, token, parametros } = {}) {
  const url = new URL(BASE + ruta);
  if (parametros) {
    for (const [clave, valor] of Object.entries(parametros)) {
      if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(clave, valor);
    }
  }

  // AbortController corta la peticion si pasa el tiempo maximo
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);

  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal,
    });
  } catch (e) {
    throw new ErrorApi(
      e.name === "AbortError"
        ? "El servidor está tardando demasiado en responder. Si es la primera visita en un rato, puede estar despertando: intenta de nuevo en un minuto."
        : "No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.",
      0,
    );
  } finally {
    clearTimeout(reloj);
  }

  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => null);

  // Se envio un token y la API lo rechazo: la sesion vencio o el usuario fue desactivado
  if (respuesta.status === 401 && token) alVencerSesion?.(datos?.detail);

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
