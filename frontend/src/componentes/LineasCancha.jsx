// Las lineas de cal de una cancha. Con "pintar", se dibujan una por una al cargar.
// pathLength=1 hace que cada trazo mida "1", asi la animacion es igual para todos.
const TRAZOS = [
  { tipo: "rect", x: 10, y: 10, width: 580, height: 340 },
  { tipo: "line", x1: 300, y1: 10, x2: 300, y2: 350 },
  { tipo: "circle", cx: 300, cy: 180, r: 56 },
  { tipo: "rect", x: 10, y: 100, width: 72, height: 160 },
  { tipo: "rect", x: 518, y: 100, width: 72, height: 160 },
  { tipo: "rect", x: 10, y: 145, width: 26, height: 70 },
  { tipo: "rect", x: 564, y: 145, width: 26, height: 70 },
  { tipo: "path", d: "M82 144 A40 40 0 0 1 82 216" },
  { tipo: "path", d: "M518 144 A40 40 0 0 0 518 216" },
];

export default function LineasCancha({ className = "", pintar = false, grosor = 1.25 }) {
  return (
    <svg
      viewBox="0 0 600 360"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <g className={pintar ? "pintar" : ""}>
        {TRAZOS.map(({ tipo: Forma, ...atributos }, i) => (
          <Forma
            key={i}
            {...atributos}
            pathLength={1}
            vectorEffect="non-scaling-stroke"
            style={pintar ? { animationDelay: `${i * 90}ms` } : undefined}
          />
        ))}
      </g>
      <circle cx="300" cy="180" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
