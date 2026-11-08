// Textos y formatos compartidos por varias paginas.

// Fotos opcionales en frontend/public/deportes/ (si falta una, se muestran las lineas de cancha)
export const FOTOS = {
  Fútbol: "Futbol.jpg",
  Pádel: "Padel.jpg",
  Baloncesto: "Baloncesto.jpg",
  Voleibol: "Voleibol.jpg",
  Tenis: "Tenis.jpg",
};

export const SUPERFICIES = {
  sintetica: "Sintética",
  natural: "Grama natural",
  cemento: "Cemento",
  madera: "Madera",
  arcilla: "Arcilla",
  acrilico: "Acrílico",
};

export const METODOS_PAGO = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  tarjeta: "Tarjeta",
  pse: "PSE",
  efectivo: "Efectivo en la sede",
};

// 19 -> "7 p. m."
export const nombreHora = (h) => (h === 12 ? "12 m." : h === 24 ? "12 a. m." : h < 12 ? `${h} a. m.` : `${h - 12} p. m.`);

// Fecha local en formato AAAA-MM-DD, con desplazamiento en dias
export function fechaLocal(desplazamientoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + desplazamientoDias);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const formatoDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short" });
// "2026-11-12" -> "hoy", "mañana" o "jue 12 nov" (corto, para que quepa en una linea)
export function nombreDia(fecha) {
  if (fecha === fechaLocal()) return "hoy";
  if (fecha === fechaLocal(1)) return "mañana";
  const partes = Object.fromEntries(
    formatoDia.formatToParts(new Date(`${fecha}T12:00:00`)).map((p) => [p.type, p.value.replace(".", "")]),
  );
  return `${partes.weekday} ${partes.day} ${partes.month}`;
}

// Horas que faltan para que empiece una reserva (solo para orientar; la API decide con su reloj)
export function horasParaEmpezar(fecha, hora) {
  return (new Date(`${fecha}T${String(hora).padStart(2, "0")}:00:00`) - Date.now()) / 3600000;
}

export function unirConY(lista) {
  return lista.length <= 1 ? lista.join("") : `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`;
}
