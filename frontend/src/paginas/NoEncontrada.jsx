// Pagina 404: la ruta no existe. Antes mostraba la portada, y un enlace roto parecia funcionar.
import { Link } from "react-router";
import LineasCancha from "../componentes/LineasCancha.jsx";
import { claseBotonPrincipal } from "../componentes/Piezas.jsx";

export default function NoEncontrada() {
  return (
    <section className="grama relative overflow-hidden text-cal">
      <LineasCancha className="pointer-events-none absolute inset-0 size-full text-cal/15" />
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <p className="titular cifras text-[clamp(6rem,22vw,12rem)] leading-none">404</p>
        <h1 className="titular mt-2 text-4xl sm:text-5xl">Balón por fuera</h1>
        <p className="mt-4 max-w-md text-lg text-cal/85">
          Esta página no existe o cambió de dirección. Vuelve a la cancha y sigue buscando dónde jugar.
        </p>
        <Link to="/" className={`${claseBotonPrincipal} mt-8 inline-flex items-center`}>
          Ir a buscar canchas
        </Link>
      </div>
    </section>
  );
}
