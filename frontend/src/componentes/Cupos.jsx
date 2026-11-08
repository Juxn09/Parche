// Los cupos de un partido abierto dibujados como petos: uno por jugador.
// Lleno = ya tiene jugador (el primero es el organizador); vacio = cupo libre.
export default function Cupos({ total, ocupados, tamano = "size-3" }) {
  return (
    <span className="inline-flex flex-wrap gap-1" aria-label={`${ocupados} de ${total} jugadores`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`${tamano} rounded-full ${
            i === 0 ? "bg-tinta" : i < ocupados ? "bg-acento" : "border border-linea-fuerte"
          }`}
        />
      ))}
    </span>
  );
}
