// Pictograma del deporte: la cancha de ese deporte vista desde arriba, en lineas de cal
// sobre grama. Reemplaza las fotos: cada deporte se reconoce por sus lineas.
const LINEAS = {
  Fútbol: (
    <>
      <line x1="30" y1="3" x2="30" y2="37" />
      <circle cx="30" cy="20" r="6" />
      <rect x="3" y="12" width="7" height="16" />
      <rect x="50" y="12" width="7" height="16" />
    </>
  ),
  Baloncesto: (
    <>
      <line x1="30" y1="3" x2="30" y2="37" />
      <circle cx="30" cy="20" r="5" />
      <rect x="3" y="14" width="11" height="12" />
      <rect x="46" y="14" width="11" height="12" />
      <path d="M3 7 Q24 20 3 33" />
      <path d="M57 7 Q36 20 57 33" />
    </>
  ),
  Voleibol: (
    <>
      <line x1="30" y1="1" x2="30" y2="39" strokeWidth="2.2" />
      <line x1="21" y1="3" x2="21" y2="37" />
      <line x1="39" y1="3" x2="39" y2="37" />
    </>
  ),
  Tenis: (
    <>
      <line x1="3" y1="8" x2="57" y2="8" />
      <line x1="3" y1="32" x2="57" y2="32" />
      <line x1="30" y1="1" x2="30" y2="39" strokeWidth="2.2" />
      <line x1="16" y1="8" x2="16" y2="32" />
      <line x1="44" y1="8" x2="44" y2="32" />
      <line x1="16" y1="20" x2="44" y2="20" />
    </>
  ),
  Pádel: (
    <>
      <line x1="30" y1="1" x2="30" y2="39" strokeWidth="2.2" />
      <line x1="14" y1="3" x2="14" y2="37" />
      <line x1="46" y1="3" x2="46" y2="37" />
      <line x1="14" y1="20" x2="46" y2="20" />
    </>
  ),
};

// La misma cancha en grande (cabecera del detalle). "trazo-fino" mantiene las lineas delgadas al escalar.
export function LineasDeporte({ deporte, className = "" }) {
  return (
    <svg viewBox="0 0 60 40" fill="none" stroke="currentColor" strokeWidth="1.3" className={`trazo-fino ${className}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect x="3" y="3" width="54" height="34" />
      {LINEAS[deporte] ?? LINEAS.Fútbol}
    </svg>
  );
}

export default function Pictograma({ deporte, className = "w-16" }) {
  return (
    <span className={`grama block h-fit shrink-0 self-center overflow-hidden rounded-[5px] text-cal ${className}`} title={deporte}>
      <svg viewBox="0 0 60 40" fill="none" stroke="currentColor" strokeWidth="1.2" className="block w-full opacity-85" aria-hidden="true">
        <rect x="3" y="3" width="54" height="34" />
        {LINEAS[deporte] ?? LINEAS.Fútbol}
      </svg>
    </span>
  );
}
